import type { ParsedCSV, CellValue } from '$lib/stores/csvData';

export type FilterOp = 'eq' | 'neq' | 'contains' | 'in';

export type Transform =
  | { kind: 'filterRows'; column: string; op: FilterOp; value: string | string[]; caseSensitive?: boolean }
  | { kind: 'rowAverage'; columns: string[]; outColumn: string }
  | { kind: 'appendFile'; other: ParsedCSV };

export function applyTransforms(base: ParsedCSV, transforms: Transform[]): ParsedCSV {
  let cur: ParsedCSV = cloneCSV(base);

  for (const t of transforms) {
    switch (t.kind) {
      case 'filterRows':
        cur = filterRows(cur, t);
        break;
      case 'rowAverage':
        cur = rowAverage(cur, t.columns, t.outColumn);
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
        case 'rowAverage':
          return `RowAvg(${t.columns.join(',')}) -> ${t.outColumn}`;
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

function toNumber(v: CellValue): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function rowAverage(csv: ParsedCSV, columns: string[], outColumn: string): ParsedCSV {
  const headers = csv.headers.includes(outColumn) ? csv.headers : [...csv.headers, outColumn];
  const rows = csv.rows.map((r) => {
    let sum = 0;
    let cnt = 0;
    for (const c of columns) {
      const n = toNumber(r[c] ?? null);
      if (n != null) { sum += n; cnt++; }
    }
    const avg = cnt > 0 ? sum / cnt : null;
    return { ...r, [outColumn]: avg as any };
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