import type {User} from '@/types';
export type FieldValues = Record<string, unknown>;
export interface TemplateField {
  key: string; label: string; type: 'text' | 'textarea' | 'date' | 'money' | 'select' | 'boolean';
  required: boolean; options?: {value: string; label: string}[]; source?: string;
}
export interface ProcurementTemplate {id: string; label: string; category: string; fields: TemplateField[]}
export type Template = ProcurementTemplate;
export interface Stage {id: string; label: string}
export interface Relationship {id: string; label: string; source_types: string[]; target_types: string[]}
export interface TemplateCatalog {version: number; stages: Stage[]; templates: ProcurementTemplate[]; relationships: Relationship[]}
export interface Owner {id: string; name: string}
export interface CaseSummary {
  id: string; number: string; title: string; owner_name: string; currency: string; stage: string;
  revision: number; legacy_ref: string | null; document_count: number; stale_count: number; deadline: string | null;
}
export interface CaseList {items: CaseSummary[]; stages: Stage[]; can_create: boolean; owners: Owner[]}
export interface CaseDocument {
  document_id: string; version: number; current_version: number; template_id: string; title: string;
  number: string; status: string; stale: boolean; complete: boolean; errors: string[]; can_edit: boolean;extraction_status?:string;
}
export interface DocumentChoice {id: string; title: string; number: string; category: string; version: number; status: string;template_id?:string|null;supplier?:string|null;currency?:string;value?:string|null;extraction_status?:string|null}
export interface Link {id: string; source_id: string; target_id: string; source_version: number; target_version: number; type: string; stale: boolean}
export interface Allocation {id: string; invoice_id: string; acceptance_id: string; invoice_version: number; acceptance_version: number; amount: string}
export interface InvoiceBalance {document_id: string; title?: string; gross: string; credit: string; net: string; paid: string; outstanding: string; overpaid: string}
export interface Balances {committed: string; accepted: string; invoiced: string; credited: string; paid: string; outstanding: string; overpaid: string; invoices: InvoiceBalance[]}
export interface Payment {id: string; kind: string; invoice_id: string; invoice_version: number; amount: string; date: string; reference: string; actor: string; created_at: string; reversed_entry_id: string | null}
export interface CaseEvent {id: string; action: string; comment: string; actor: string; created_at: string; from_stage: string | null; to_stage: string | null; evidence: unknown}
export interface Capabilities {can_manage: boolean; can_accept: boolean; can_finance: boolean; can_advance: boolean; can_return: boolean; can_cancel: boolean; can_reopen: boolean; can_pay: boolean; can_refund: boolean}
export interface CaseDetailData {
  id: string; number: string; title: string; description: string; owner_id: string; owner_name: string; currency: string;
  anticipated_value: string; committed_value: string; deadline: string | null; stage: string; revision: number;
  legacy_ref: string | null; primary_document_id: string | null; documents: CaseDocument[]; links: Link[];
  allocations: Allocation[]; balances: Balances | null; payments: Payment[]; history: CaseEvent[]; blockers: string[];
  next_action: string | null; capabilities: Capabilities; available_documents: DocumentChoice[]; owners: Owner[];
}
export interface DocumentTemplateDetail {document_id: string; version: number; template_id: string | null; fields: FieldValues; errors: string[]; case_id: string | null; case_revision: number | null; can_edit: boolean}
export interface WorkspaceProps {user:User;onOpen: (id: string) => void; onChanged: () => void; notify: (message: string) => void; revision?: number}
export type CaseMutation = (suffix: string, method: string, body?: FieldValues) => Promise<CaseDetailData>;
export const stageLabels: Record<string, string> = {draft:'Ciornă',needs_review:'În verificare',committed:'Angajat',accepted:'Recepționat',invoiced:'Facturat',paid:'Plătit',cancelled:'Anulat'};
// Format the server's decimal string without converting financial values to floating point.
export function amount(value: string | null | undefined, currency = 'RON') {
  if (value == null) return '—';
  const [integer, fraction = '00'] = value.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}\u002c${fraction.padEnd(2,'0')} ${currency}`;
}
export const validMoney = (value: string, positive = false) => /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) && (!positive || /[1-9]/.test(value));
