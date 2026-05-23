// Pure CSV/JSON serializers shared by the renderer.

export interface CsvRow { columns: { name: string }[]; rows: any[][]; }

export function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(r: CsvRow): string {
  const lines = [r.columns.map((c) => csvEscape(c.name)).join(',')];
  for (const row of r.rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

export function rowsToObjects(r: CsvRow): any[] {
  return r.rows.map((row) => {
    const o: any = {};
    r.columns.forEach((c, i) => { o[c.name] = row[i]; });
    return o;
  });
}

export function toJson(r: CsvRow): string {
  return JSON.stringify(rowsToObjects(r), null, 2);
}
