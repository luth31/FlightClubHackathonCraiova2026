export type Page = 'home'|'documents'|'contracts'|'approvals'|'sharing'|'people'|'audit'|'suppliers';
export interface User { id:string; name:string; role:string; roles:string[]; airport_id?:string; department:string; initials?:string; active?:boolean }
export interface AuditEvent {id:string;actor:string;action:string;document_id?:string;document_title?:string;created_at:string;detail?:string|Record<string,unknown>}
export interface GeneratedAmendment {
  draft_id: string;
  contract_id: string | null;
  contract_number: string | null;
  revision: number;
  generated_revision: number | null;
  pdf_outdated: boolean;
  source_changed: boolean;
  current: boolean;
}
export interface DocumentRecord {id:string;title:string;number:string;category:string;department:string;status:string;created_at:string;updated_at?:string;expires_at?:string|null;supplier?:string|null;value?:number|null;currency?:string;owner?:string;confidentiality?:string;tags:string[];summary?:string;filename:string;related_ids:string[];metadata:Record<string,unknown>;generated_amendment?:GeneratedAmendment;permissions?:{can_validate?:boolean;can_submit?:boolean;can_edit:boolean;can_review:boolean;can_sign:boolean;can_share:boolean;can_propose_amendment?:boolean};extraction_status?:string;extraction_notice?:string;source_refs?:unknown[];version:number;validated:boolean;file_url:string;days_remaining?:number|null;contract_status?:string;related_documents?:DocumentRecord[]; versions?:Array<{file_url?:string;version:number;created_at:string;filename?:string;sha256?:string;comment?:string}>;audit?:AuditEvent[];workflow?:{steps:Array<{label:string;status:string;actor?:string;at?:string}>;current_step:string;task?:{id:string;assignee:string;due_date:string;status:string;can_reassign:boolean;assignment_state:string}};extraction_evidence?:Array<{field:string;value:unknown;page:number;excerpt:string;confidence:number;validated:boolean}>}
export interface AmendmentDraft {
  id: string;
  contract_id: string;
  contract_number: string;
  source_version: number;
  title: string;
  reason: string;
  clause_reference: string;
  current_wording: string;
  proposed_wording: string;
  proposed_effective_date: string | null;
  status: 'draft';
  revision: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  source_changed: boolean;
  generated_document_id: string | null;
  generated_revision: number | null;
  generated_document_version: number | null;
  generated_document_status: string | null;
  pdf_outdated: boolean;
  pdf_file_url: string | null;
  document_url: string | null;
  can_generate_pdf: boolean;
}
export interface Task {id:string;document_id:string;title:string;department:string;assignee:string;status:string;priority:string;due_date:string;type:string}
export interface Share {id:string;document_id:string;document_title?:string;title?:string;recipient_airport:string;recipient_department?:string|null;expires_at:string;created_at:string;status?:string;revoked?:boolean;revoked_at?:string;source_version:number;file_url?:string;redactions?:number}
export interface Dashboard {stats:{documents:number;pending:number;expiring:number;approved:number};recent_documents:DocumentRecord[];attention:Array<Partial<Task>&Partial<DocumentRecord>>;activity:AuditEvent[];departments:Array<{name:string;count:number}>|Record<string,number>}
export interface Session {auth?:{mode:'demo'|'oidc';login_url:string|null};current_user:User|null;users:User[];airport:string|{name:string};reference_date:string;demo:boolean}
