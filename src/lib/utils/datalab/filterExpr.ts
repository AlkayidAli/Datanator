/**
 * SQL-like filter expression parser/evaluator for DataLab.
 * Supported
 *  - Logical: AND, OR, NOT, parentheses
 *  - Comparisons: =, !=, <>, >, >=, <, <=
 *  - BETWEEN a AND b (with optional NOT)
 *  - LIKE / ILIKE with % and _ wildcards
 *  - Regex: ~ 'pattern' (case-sensitive), ~* 'pattern' (case-insensitive)
 *  - Literals: numbers, strings in single quotes ('') with escaping ''
 *  - Column refs: {Column Name} or bare identifiers (A_Z0-9_)
 */

export type RowCtx = Record<string, unknown>;

export interface ParsedFilter {
  ast: AST;
  raw: string;
}

// AST nodes
type AST =
  | { k: 'or'; left: AST; right: AST }
  | { k: 'and'; left: AST; right: AST }
  | { k: 'not'; expr: AST }
  | {
      k: 'cmp';
      op: '==' | '!=' | '>' | '>=' | '<' | '<=';
      left: AST;
      right: AST;
    }
  | { k: 'between'; not: boolean; target: AST; low: AST; high: AST }
  | { k: 'like'; ilike: boolean; not: boolean; value: AST; pattern: AST }
  | { k: 'regex'; flags: '' | 'i'; value: AST; pattern: AST }
  | { k: 'id'; name: string }
  | { k: 'lit_num'; v: number }
  | { k: 'lit_str'; v: string };

// Tokenizer
type TokType =
  | 'ident'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'string'
  | 'number'
  | 'op'
  | 'comma'
  | 'eof';
interface Tok {
  t: TokType;
  v?: string;
}

function isIdentStart(ch: string) {
  return /[A-Za-z_]/.test(ch);
}
function isIdent(ch: string) {
  return /[A-Za-z0-9_]/.test(ch);
}

function readString(src: string, i: number): { v: string; j: number } {
  // single quotes only
  let out = '';
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "'") {
      // escape: '' -> '
      if (src[j + 1] === "'") {
        out += "'";
        j += 2;
        continue;
      }
      j++;
      return { v: out, j };
    }
    out += c;
    j++;
  }
  throw new Error('Unclosed string literal');
}

function tokenize(input: string): Tok[] {
  const s = input;
  const tks: Tok[] = [];
  let i = 0;
  const push = (t: Tok) => tks.push(t);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '{') {
      push({ t: 'lbrace' });
      i++;
      continue;
    }
    if (c === '}') {
      push({ t: 'rbrace' });
      i++;
      continue;
    }
    if (c === '(') {
      push({ t: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      push({ t: 'rparen' });
      i++;
      continue;
    }
    if (c === ',') {
      push({ t: 'comma' });
      i++;
      continue;
    }
    if (c === "'") {
      const { v, j } = readString(s, i);
      push({ t: 'string', v });
      i = j;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9._eE+-]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const n = Number(raw);
      if (!isFinite(n)) throw new Error(`Invalid number '${raw}'`);
      push({ t: 'number', v: String(n) });
      i = j;
      continue;
    }
    // multi-char ops
    const two = s.slice(i, i + 2);
    if (two === '>=' || two === '<=' || two === '!=' || two === '<>' || two === '~*') {
      push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('=<>~'.includes(c)) {
      push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < s.length && isIdent(s[j])) j++;
      const ident = s.slice(i, j);
      push({ t: 'ident', v: ident });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character '${c}'`);
  }
  push({ t: 'eof' });
  return tks;
}

// Parser
class Parser {
  private tks: Tok[];
  private i = 0;
  constructor(tks: Tok[]) { this.tks = tks; }
  private peek(): Tok { return this.tks[this.i]; }
  private next(): Tok { return this.tks[this.i++]; }
  private expect(t: TokType, v?: string) {
    const tk = this.next();
    if (tk.t !== t || (v != null && tk.v !== v)) {
      throw new Error(`Expected ${v ?? t} but got ${tk.v ?? tk.t}`);
    }
    return tk;
  }
  parse(): AST {
    const ast = this.parseOr();
    if (this.peek().t !== 'eof') throw new Error('Unexpected input');
    return ast;
  }

  private parseOr(): AST {
    let left = this.parseAnd();
    while (this.isKeyword('OR')) {
      this.next();
      const right = this.parseAnd();
      left = { k: 'or', left, right };
    }
    return left;
  }
  private parseAnd(): AST {
    let left = this.parseNot();
    while (this.isKeyword('AND')) {
      this.next();
      const right = this.parseNot();
      left = { k: 'and', left, right };
    }
    return left;
  }
  private parseNot(): AST {
    if (this.isKeyword('NOT')) {
      this.next();
      const expr = this.parseNot();
      return { k: 'not', expr };
    }
    return this.parseComp();
  }
  private parseComp(): AST {
    const left = this.parsePrimary();
    // BETWEEN / LIKE / ILIKE / regex / comparison
    if (this.isKeyword('BETWEEN') || (this.isKeyword('NOT') && this.lookaheadKeyword('BETWEEN'))) {
      let not = false;
      if (this.isKeyword('NOT')) { this.next(); not = true; }
      this.expect('ident', 'BETWEEN');
      const low = this.parsePrimary();
      this.expect('ident', 'AND');
      const high = this.parsePrimary();
      return { k: 'between', not, target: left, low, high };
    }
    if (this.isKeyword('LIKE') || this.isKeyword('ILIKE') || this.isKeyword('NOT')) {
      let not = false;
      if (this.isKeyword('NOT')) { this.next(); not = true; }
      let ilike = false;
      if (this.isKeyword('ILIKE')) { this.next(); ilike = true; }
      else this.expect('ident', 'LIKE');
      const pattern = this.parsePrimary();
      return { k: 'like', ilike, not, value: left, pattern };
    }
    if (this.peek().t === 'op' && (this.peek().v === '~' || this.peek().v === '~*')) {
      const op = this.next().v!;
      const flags: '' | 'i' = op === '~*' ? 'i' : '';
      const pattern = this.parsePrimary();
      return { k: 'regex', flags, value: left, pattern };
    }
    // standard comparisons
    if (this.peek().t === 'op' && ['=', '!=', '<>', '>', '>=', '<', '<='].includes(this.peek().v!)) {
      const opMap: Record<string, '==' | '!=' | '>' | '>=' | '<' | '<='> = {
        '=': '==',
        '!=': '!=',
        '<>': '!=',
        '>': '>',
        '>=': '>=',
        '<': '<',
        '<=': '<=',
      };
      const raw = this.next().v!;
      const right = this.parsePrimary();
      return { k: 'cmp', op: opMap[raw], left, right };
    }
    return left;
  }
  private parsePrimary(): AST {
    const tk = this.peek();
    if (tk.t === 'lparen') { this.next(); const e = this.parseOr(); this.expect('rparen'); return e; }
    if (tk.t === 'number') { this.next(); return { k: 'lit_num', v: Number(tk.v) };
    }
    if (tk.t === 'string') { this.next(); return { k: 'lit_str', v: tk.v! }; }
    if (tk.t === 'lbrace') {
      this.next();
      // read until rbrace as raw identifier text (including spaces etc.). The tokenizer emits inner as tokens, but for simplicity, accept a sequence of id/number/op/string until rbrace? We just capture contiguous text.
      let name = '';
      while (this.peek().t !== 'rbrace' && this.peek().t !== 'eof') {
        const p = this.next();
        // reconstruct spacing as single spaces
        if (p.t === 'ident' || p.t === 'number' || p.t === 'op' || p.t === 'string' || p.t === 'comma') {
          name += (name ? ' ' : '') + (p.v ?? '');
        }
      }
      this.expect('rbrace');
      return { k: 'id', name: name.trim() };
    }
    if (tk.t === 'ident') {
      // could be TRUE/FALSE/NULL or bare identifier column
      const id = tk.v!.toUpperCase();
      if (id === 'TRUE') { this.next(); return { k: 'lit_num', v: 1 }; }
      if (id === 'FALSE') { this.next(); return { k: 'lit_num', v: 0 }; }
      if (id === 'NULL') { this.next(); return { k: 'lit_str', v: '' }; }
      this.next();
      return { k: 'id', name: tk.v! };
    }
    throw new Error('Unexpected token');
  }
  private isKeyword(word: string): boolean {
    const tk = this.peek();
    return tk.t === 'ident' && tk.v!.toUpperCase() === word;
  }
  private lookaheadKeyword(word: string): boolean {
    const tk = this.tks[this.i + 1];
    return tk && tk.t === 'ident' && tk.v!.toUpperCase() === word;
  }
}

export function parseFilterExpr(src: string): ParsedFilter {
  const tks = tokenize(src);
  const p = new Parser(tks);
  const ast = p.parse();
  return { ast, raw: src };
}

export function evalFilter(parsed: ParsedFilter, row: RowCtx): boolean {
  function val(node: AST): { num?: number; str?: string; kind: 'num' | 'str' } {
    switch (node.k) {
      case 'lit_num':
        return { kind: 'num', num: node.v };
      case 'lit_str':
        return { kind: 'str', str: node.v };
      case 'id': {
        const v = (row as any)[node.name];
        if (typeof v === 'number') return { kind: 'num', num: v };
        if (v == null) return { kind: 'str', str: '' };
        const asNum = Number(v as any);
        if (Number.isFinite(asNum)) return { kind: 'num', num: asNum };
        return { kind: 'str', str: String(v) };
      }
      case 'cmp': {
        const a = val(node.left);
        const b = val(node.right);
        const r = compare(a, b, node.op);
        return { kind: 'num', num: r ? 1 : 0 };
      }
      case 'between': {
        const t = val(node.target);
        const lo = val(node.low);
        const hi = val(node.high);
        const r = between(t, lo, hi);
        return { kind: 'num', num: (node.not ? !r : r) ? 1 : 0 };
      }
      case 'like': {
        const v = toStringVal(val(node.value));
        const p = toStringVal(val(node.pattern));
        const ok = like(v, p, node.ilike);
        return { kind: 'num', num: (node.not ? !ok : ok) ? 1 : 0 };
      }
      case 'regex': {
        const v = toStringVal(val(node.value));
        const p = toStringVal(val(node.pattern));
        try {
          const re = new RegExp(p, node.flags);
          return { kind: 'num', num: re.test(v) ? 1 : 0 };
        } catch {
          return { kind: 'num', num: 0 };
        }
      }
      case 'and': {
        const a = truthy(val(node.left));
        if (!a) return { kind: 'num', num: 0 };
        const b = truthy(val(node.right));
        return { kind: 'num', num: b ? 1 : 0 };
      }
      case 'or': {
        const a = truthy(val(node.left));
        if (a) return { kind: 'num', num: 1 };
        const b = truthy(val(node.right));
        return { kind: 'num', num: b ? 1 : 0 };
      }
      case 'not': {
        return { kind: 'num', num: truthy(val(node.expr)) ? 0 : 1 };
      }
    }
  }

  return truthy(val(parsed.ast));
}

function truthy(v: { num?: number; str?: string; kind: 'num' | 'str' }): boolean {
  if (v.kind === 'num') return !!v.num && !Number.isNaN(v.num);
  return !!v.str;
}

function toStringVal(v: { num?: number; str?: string; kind: 'num' | 'str' }): string {
  if (v.kind === 'num') return String(v.num ?? '');
  return v.str ?? '';
}

function bothNumeric(a: { num?: number; kind: 'num' | 'str' }, b: { num?: number; kind: 'num' | 'str' }) {
  return a.kind === 'num' && b.kind === 'num' && Number.isFinite(a.num) && Number.isFinite(b.num);
}

function compare(
  a: { num?: number; str?: string; kind: 'num' | 'str' },
  b: { num?: number; str?: string; kind: 'num' | 'str' },
  op: '==' | '!=' | '>' | '>=' | '<' | '<='
): boolean {
  if (bothNumeric(a, b)) {
    const av = a.num!;
    const bv = b.num!;
    switch (op) {
      case '==': return av === bv;
      case '!=': return av !== bv;
      case '>': return av > bv;
      case '>=': return av >= bv;
      case '<': return av < bv;
      case '<=': return av <= bv;
    }
  }
  const as = a.kind === 'num' ? String(a.num) : (a.str ?? '');
  const bs = b.kind === 'num' ? String(b.num) : (b.str ?? '');
  switch (op) {
    case '==': return as === bs;
    case '!=': return as !== bs;
    case '>': return as > bs;
    case '>=': return as >= bs;
    case '<': return as < bs;
    case '<=': return as <= bs;
  }
}

function between(
  t: { num?: number; str?: string; kind: 'num' | 'str' },
  lo: { num?: number; str?: string; kind: 'num' | 'str' },
  hi: { num?: number; str?: string; kind: 'num' | 'str' }
): boolean {
  if (bothNumeric(t, lo) && bothNumeric(t, hi)) {
    return t.num! >= lo.num! && t.num! <= hi.num!;
  }
  const ts = t.kind === 'num' ? String(t.num) : (t.str ?? '');
  const ls = lo.kind === 'num' ? String(lo.num) : (lo.str ?? '');
  const hs = hi.kind === 'num' ? String(hi.num) : (hi.str ?? '');
  return ts >= ls && ts <= hs;
}

function escapeRegex(src: string): string {
  return src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function like(val: string, pattern: string, ilike: boolean): boolean {
  // Convert SQL LIKE to regex: % -> .*, _ -> .
  const esc = pattern.split('%').map((part) => part.split('_').map(escapeRegex).join('.')).join('.*');
  const re = new RegExp('^' + esc + '$', ilike ? 'i' : undefined);
  return re.test(val);
}

export function tryFilter(src: string, row: RowCtx): { ok: boolean; error?: string } {
  try {
    const p = parseFilterExpr(src);
    // just eval once
    evalFilter(p, row);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invalid filter' };
  }
}

export function countMatches(rows: RowCtx[], src: string, cap = 5000): { ok: boolean; count: number; error?: string } {
  try {
    const p = parseFilterExpr(src);
    let n = 0;
    const limit = Math.min(rows.length, cap);
    for (let i = 0; i < limit; i++) {
      if (evalFilter(p, rows[i])) n++;
    }
    return { ok: true, count: n };
  } catch (e: any) {
    return { ok: false, count: 0, error: e?.message || 'Invalid filter' };
  }
}
