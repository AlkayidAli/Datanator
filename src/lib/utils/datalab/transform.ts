import type { ParsedCSV, CellValue } from '$lib/stores/csvData';
import { parseFilterExpr, evalFilter } from './filterExpr';

export type FilterOp = 'eq' | 'neq' | 'contains' | 'in';

// New ops
export type RowAggOp = 'avg' | 'sum' | 'min' | 'max' | 'median' | 'countNonNull';

export type Transform =
  | { kind: 'filterRows'; column: string; op: FilterOp; value: string | string[]; caseSensitive?: boolean }
  | { kind: 'filterExpr'; expr: string; vars?: Record<string, unknown> }
  // keep backward-compatible rowAverage
  | { kind: 'rowAverage'; columns: string[]; outColumn: string }
  // new generic row aggregate
  | { kind: 'rowAggregate'; columns: string[]; outColumn: string; op: RowAggOp }
  | { kind: 'appendFile'; other: ParsedCSV };

export function applyTransforms(base: ParsedCSV, transforms: Transform[]): ParsedCSV {
  let cur: ParsedCSV = cloneCSV(base);

  for (const t of transforms) {
    switch (t.kind) {
      case 'filterRows':
        cur = filterRows(cur, t);
        break;
      case 'filterExpr':
        cur = filterRowsExpr(cur, t);
        break;
      case 'rowAverage':
        // deprecated: route to rowAggregate(avg)
        cur = rowAggregate(cur, t.columns, t.outColumn, 'avg');
        break;
      case 'rowAggregate':
        cur = rowAggregate(cur, t.columns, t.outColumn, t.op);
        break;
      case 'appendFile':
        cur = appendFile(cur, t.other);
        break;
    }
  }

  const label = summarizeTransforms(transforms);
  return {
    ...cur,
    filename: label ? `${base.filename} | ${label}` : base.filename
  };
}

export function summarizeTransforms(transforms: Transform[]): string {
  return transforms
    .map((t) => {
      switch (t.kind) {
        case 'filterRows': {
          const v = Array.isArray(t.value) ? `[${t.value.join(', ')}]` : JSON.stringify(t.value);
          return `Filter: ${t.column} ${t.op} ${v}`;
        }
        case 'filterExpr':
          return `FilterExpr: ${t.expr}`;
        case 'rowAverage':
          return `RowAvg(${t.columns.join(',')}) -> ${t.outColumn}`;
        case 'rowAggregate':
          return `RowAgg ${t.op}(${t.columns.join(',')}) -> ${t.outColumn}`;
        case 'appendFile':
          return `Append(${t.other.filename})`;
      }
    })
    .join(' + ');
}

function cloneCSV(csv: ParsedCSV): ParsedCSV {
  return {
    ...csv,
    headers: [...csv.headers],
    rows: csv.rows.map((r) => ({ ...r })),
    columnTypes: csv.columnTypes ? { ...csv.columnTypes } : undefined
  };
}

function normalizeString(input: unknown, caseSensitive?: boolean): string {
  const s = input == null ? '' : String(input);
  return caseSensitive ? s : s.toLowerCase();
}

function filterRows(csv: ParsedCSV, t: Extract<Transform, { kind: 'filterRows' }>): ParsedCSV {
  const { column, op, value, caseSensitive } = t;
  const outRows = csv.rows.filter((row) => {
    const raw = row[column];
    const a = normalizeString(raw, caseSensitive);
    if (op === 'eq') return a === normalizeString(value as string, caseSensitive);
    if (op === 'neq') return a !== normalizeString(value as string, caseSensitive);
    if (op === 'contains') return a.includes(normalizeString(value as string, caseSensitive));
    if (op === 'in') {
      const arr = Array.isArray(value) ? value : String(value).split(',').map((x) => x.trim());
      const set = new Set(arr.map((x) => normalizeString(x, caseSensitive)));
      return set.has(a);
    }
    return true;
  });

  return { ...csv, rows: outRows };
}

function filterRowsExpr(csv: ParsedCSV, t: Extract<Transform, { kind: 'filterExpr' }>): ParsedCSV {
  let parsed;
  try {
    parsed = parseFilterExpr(t.expr);
  } catch {
    // invalid expression: return unchanged
    return csv;
  }
  const outRows = csv.rows.filter((row) => {
    try {
      const ctx = t.vars ? { ...(row as Record<string, unknown>), ...t.vars } : (row as Record<string, unknown>);
      return !!evalFilter(parsed!, ctx);
    } catch {
      return false;
    }
  });
  return { ...csv, rows: outRows };
}

function toNumber(v: CellValue): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function rowAggregate(csv: ParsedCSV, columns: string[], outColumn: string, op: RowAggOp): ParsedCSV {
  const headers = csv.headers.includes(outColumn) ? csv.headers : [...csv.headers, outColumn];
  const rows = csv.rows.map((r) => {
    const nums: number[] = [];
    let countNonNull = 0;
    for (const c of columns) {
      const raw = r[c] ?? null;
      const n = toNumber(raw);
      if (raw != null && raw !== '') countNonNull++;
      if (n != null) nums.push(n);
    }

    let out: CellValue = null;
    switch (op) {
      case 'avg': {
        if (nums.length) out = nums.reduce((a, b) => a + b, 0) / nums.length;
        break;
      }
      case 'sum': {
        if (nums.length) out = nums.reduce((a, b) => a + b, 0);
        break;
      }
      case 'min': {
        if (nums.length) out = Math.min(...nums);
        break;
      }
      case 'max': {
        if (nums.length) out = Math.max(...nums);
        break;
      }
      case 'median': {
        if (nums.length) {
          const s = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(s.length / 2);
          out = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        }
        break;
      }
      case 'countNonNull': {
        out = countNonNull;
        break;
      }
    }
    return { ...r, [outColumn]: out as any };
  });
  return { ...csv, headers, rows };
}

function appendFile(a: ParsedCSV, b: ParsedCSV): ParsedCSV {
  const headersSet = new Set<string>(a.headers);
  const headers: string[] = [...a.headers];
  for (const h of b.headers) if (!headersSet.has(h)) { headersSet.add(h); headers.push(h); }

  const rowsA = a.rows.map((r) => normalizeRow(r, headers));
  const rowsB = b.rows.map((r) => normalizeRow(r, headers));
  return { ...a, headers, rows: [...rowsA, ...rowsB] };
}

function normalizeRow(row: Record<string, CellValue>, headers: string[]) {
  const out: Record<string, CellValue> = {};
  for (const h of headers) out[h] = row[h] ?? null;
  return out;
}