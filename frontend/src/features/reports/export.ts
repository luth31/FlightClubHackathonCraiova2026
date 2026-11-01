import type {ReportRow} from './types';

// Spreadsheet applications also interpret formulas after leading whitespace.
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportCsv(rows: ReportRow[]) {
  const fields = ['number', 'title', 'department', 'status', 'owner', 'category', 'value', 'currency', 'date', 'document_id'] as const;
  const headings = ['Număr', 'Titlu', 'Departament', 'Stare', 'Responsabil / destinatar', 'Tip', 'Valoare', 'Monedă', 'Termen / dată', 'ID document'];
  return '\uFEFF' + [headings.map(csvCell).join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\r\n');
}

export function downloadRows(rows: ReportRow[], reportId: string) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `flyleaf-${reportId}-selectie.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function searchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO').trim();
}
