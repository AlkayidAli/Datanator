/**
 * Minimal safe expression evaluator (no Function / eval).
 * Supported:
 *  - numbers: 12  3.14  .5
 *  - identifiers: colName (must match /^[A-Za-z_][A-Za-z0-9_]*$/)
 *  - operators: + - * / ^ (precedence)  unary + -
 *  - parentheses
 *  - functions: log, ln, sqrt, abs, min, max
 */
export type EvalContext = Record<string, unknown>;

export interface ParsedExpression {
  rpn: Token[];
  raw: string;
}

type TokenType = 'num' | 'id' | 'op' | 'fn';
interface Token {
  t: TokenType;
  v: string;
  n?: number;
  argc?: number;
}

const FUNC_SET = new Set(['log', 'ln', 'sqrt', 'abs', 'min', 'max']);
const OP_PRECEDENCE: Record<string, number> = {
  '^': 5,
  '*': 4,
  '/': 4,
  '+': 3,
  '-': 3,
  '>': 2,
  '<': 2,
  '>=': 2,
  '<=': 2,
  '==': 2,
  '!=': 2,
  '&&': 1,
  '||': 0,
};
const RIGHT_ASSOC = new Set(['^']);

export function parseExpression(src: string): ParsedExpression {
  const tokens: Token[] = [];
  let i = 0;
  const s = src.trim();
  if (!s) throw new Error('Empty expression');

  const pushOp = (op: string) => tokens.push({ t: 'op', v: op });
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    // Column reference with braces: {Column Name}
    if (c === '{') {
      let j = i + 1;
      while (j < s.length && s[j] !== '}') j++;
      if (j >= s.length) throw new Error("Unclosed '{' in column reference");
      const name = s.slice(i + 1, j).trim();
      if (!name) throw new Error('Empty column reference');
      tokens.push({ t: 'id', v: name });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9._eE+-]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const num = Number(raw);
      if (!isFinite(num)) throw new Error(`Invalid number '${raw}'`);
      tokens.push({ t: 'num', v: raw, n: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      const name = s.slice(i, j);
      if (FUNC_SET.has(name)) tokens.push({ t: 'fn', v: name });
      else tokens.push({ t: 'id', v: name });
      i = j;
      continue;
    }
    // Multi-char operators first
    if (c === '>' || c === '<' || c === '=' || c === '!' || c === '&' || c === '|') {
      const two = s.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '==' || two === '!=' || two === '&&' || two === '||') {
        tokens.push({ t: 'op', v: two });
        i += 2;
        continue;
      }
      if (c === '>' || c === '<') {
        tokens.push({ t: 'op', v: c });
        i++;
        continue;
      }
      // lone '=' or '!' is not supported
      throw new Error(`Unexpected operator '${c}'`);
    }
    if ('+-*/^(),'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected char '${c}'`);
  }

  // Shunting-yard
  const output: Token[] = [];
  const stack: Token[] = [];
  let prev: Token | null = null;

  for (const tk of tokens) {
    if (tk.t === 'num' || tk.t === 'id') {
      output.push(tk);
    } else if (tk.t === 'fn') {
      stack.push(tk);
    } else if (tk.t === 'op') {
      if (tk.v === ',') {
        while (stack.length && stack[stack.length - 1].v !== '(') {
          output.push(stack.pop()!);
        }
        if (!stack.length) throw new Error('Mismatched comma / parentheses');
      } else if (tk.v === '(') {
        stack.push(tk);
      } else if (tk.v === ')') {
        while (stack.length && stack[stack.length - 1].v !== '(') {
          output.push(stack.pop()!);
        }
        if (!stack.length) throw new Error('Mismatched )');
        stack.pop(); // remove '('
        if (stack.length && stack[stack.length - 1].t === 'fn') {
          output.push(stack.pop()!);
        }
      } else {
        // operator (handle unary)
        let op = tk.v;
        if ((op === '+' || op === '-') && (!prev || (prev.t === 'op' && prev.v !== ')'))) {
          // unary
          if (op === '+') continue;
          // unary minus => 0 <expr>
          output.push({ t: 'num', v: '0', n: 0 });
        }
        while (stack.length) {
            const top = stack[stack.length - 1];
            if (top.t === 'op' && OP_PRECEDENCE[top.v] != null) {
              if (
                (RIGHT_ASSOC.has(op) && OP_PRECEDENCE[op] < OP_PRECEDENCE[top.v]) ||
                (!RIGHT_ASSOC.has(op) && OP_PRECEDENCE[op] <= OP_PRECEDENCE[top.v])
              ) {
                output.push(stack.pop()!);
                continue;
              }
            }
            if (top.t === 'fn') {
              output.push(stack.pop()!);
              continue;
            }
            break;
        }
        stack.push({ t: 'op', v: op });
      }
    }
    prev = tk;
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.v === '(' || t.v === ')') throw new Error('Mismatched parentheses');
    output.push(t);
  }
  return { rpn: output, raw: src };
}

export function evalParsed(parsed: ParsedExpression, ctx: EvalContext): number {
  const st: number[] = [];
  for (const tk of parsed.rpn) {
    switch (tk.t) {
      case 'num': st.push(tk.n!); break;
      case 'id': {
        // Prefer exact key (supports names with spaces when parsed from {Column Name})
        let v = (ctx as any)[tk.v];
        if (v === undefined) {
          // Fallback: if the token looks like an identifier and exact key missing, try direct
          v = (ctx as any)[tk.v];
        }
        const num = typeof v === 'number' ? v : (v == null || v === '' ? NaN : Number(v));
        st.push(num);
        break;
      }
      case 'op': {
        if (tk.v === ',') continue;
        const b = st.pop(); const a = st.pop();
        if (a == null || b == null) throw new Error('Operator stack underflow');
        let r: number;
        switch (tk.v) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/': r = b === 0 ? NaN : a / b; break;
          case '^': r = Math.pow(a, b); break;
          case '>': r = a > b ? 1 : 0; break;
          case '<': r = a < b ? 1 : 0; break;
          case '>=': r = a >= b ? 1 : 0; break;
          case '<=': r = a <= b ? 1 : 0; break;
          case '==': r = a === b ? 1 : 0; break;
          case '!=': r = a !== b ? 1 : 0; break;
          case '&&': r = (a !== 0 && !isNaN(a) && b !== 0 && !isNaN(b)) ? 1 : 0; break;
          case '||': r = (a !== 0 && !isNaN(a)) || (b !== 0 && !isNaN(b)) ? 1 : 0; break;
          default: throw new Error('Bad operator ' + tk.v);
        }
        st.push(r);
        break;
      }
      case 'fn': {
        if (tk.v === 'min' || tk.v === 'max') {
          // variable args collected until sentinel? -> assume two args (simple)
          const b = st.pop(); const a = st.pop();
          if (a == null || b == null) throw new Error('Function args missing');
          st.push(tk.v === 'min' ? Math.min(a, b) : Math.max(a, b));
        } else {
          const a = st.pop();
          if (a == null) throw new Error('Function arg missing');
          let r: number;
          switch (tk.v) {
            case 'log': r = Math.log10(a); break;
            case 'ln': r = Math.log(a); break;
            case 'sqrt': r = Math.sqrt(a); break;
            case 'abs': r = Math.abs(a); break;
            default: throw new Error('Unknown fn ' + tk.v);
          }
          st.push(r);
        }
        break;
      }
    }
  }
  if (st.length !== 1) throw new Error('Expression error');
  return st[0];
}

export function tryEval(expr: string, ctx: EvalContext): { value: number | null; error?: string } {
  try {
    const parsed = parseExpression(expr);
    const v = evalParsed(parsed, ctx);
    return { value: isFinite(v) ? v : null };
  } catch (e: any) {
    return { value: null, error: e?.message || 'Invalid expression' };
  }
}
