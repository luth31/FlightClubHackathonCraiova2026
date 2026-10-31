import {readableText} from '../../utils/text.ts';
import type {ReportData, ReportRow} from './types';

function rowText(row: ReportRow): ReportRow {
  return {...row, title: readableText(row.title), owner: readableText(row.owner), number: row.number ? readableText(row.number) : row.number, supplier: row.supplier ? readableText(row.supplier) : row.supplier};
}

// Match the document library's display repair without modifying stored records or IDs.
export function normalizeReport(data: ReportData): ReportData {
  return {...data, rows: data.rows.map(rowText), secondary: data.secondary.map(section => ({...section, items: section.items.map(rowText)})), recent_activity: data.recent_activity.map(event => ({...event, title: readableText(event.title), actor: readableText(event.actor), action: readableText(event.action)}))};
}
