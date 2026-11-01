export type Page = 'home'|'documents'|'contracts'|'approvals'|'sharing'|'people'|'audit'|'suppliers'|'operations'|'reports';
export interface User { id:string; name:string; role:string; roles:string[]; airport_id?:string; department:string; business_area?:string; initials?:string; active?:boolean; permissions?:{pages:Partial<Record<Page,boolean>>} }
export interface AuditEvent {id:string;actor:string;action:string;document_id?:string;document_title?:string;created_at:string;detail?:string|Record<string,unknown>}
export interface DocumentRecord {id:string;title:string;number:string;category:string;department:string;status:string;created_at:string;updated_at?:string;expires_at?:string|null;supplier?:string|null;value?:number|null;currency?:string;owner?:string;confidentiality?:string;tags:string[];summary?:string;filename:string;related_ids:string[];metadata:Record<string,unknown>;permissions?:{can_validate?:boolean;can_submit?:boolean;can_edit:boolean;can_review:boolean;can_sign:boolean;can_share:boolean};extraction?:{status:string;error?:string|null;page_count:number;ocr_pages:number};extraction_status?:string;extraction_notice?:string;source_refs?:unknown[];version:number;validated:boolean;file_url:string;days_remaining?:number|null;contract_status?:string;related_documents?:DocumentRecord[]; versions?:Array<{file_url?:string;version:number;created_at:string;filename?:string;sha256?:string;comment?:string}>;audit?:AuditEvent[];workflow?:{steps:Array<{label:string;status:string;actor?:string;at?:string}>;current_step:string;task?:{id:string;assignee:string;due_date:string;status:string;can_reassign:boolean;assignment_state:string}};extraction_evidence?:Array<{field:string;value:unknown;page:number;excerpt:string;confidence:number|null;validated:boolean}>}
export interface Task {id:string;document_id:string;title:string;department:string;assignee:string;status:string;priority:string;due_date:string;type:string}
export interface Share {id:string;document_id:string;document_title?:string;title?:string;recipient_airport:string;recipient_department?:string|null;expires_at:string;created_at:string;status?:string;revoked?:boolean;revoked_at?:string;source_version:number;file_url?:string;redactions?:number}
export interface Dashboard {stats:{documents:number;pending:number;expiring:number;approved:number};recent_documents:DocumentRecord[];attention:Array<Partial<Task>&Partial<DocumentRecord>>;activity:AuditEvent[];departments:Array<{name:string;count:number}>|Record<string,number>}
export interface Session {auth?:{mode:'demo'|'oidc';login_url:string|null};current_user:User|null;users:User[];airport:string|{name:string};reference_date:string;demo:boolean}
export type DocumentFlowStageId = 'purchasing' | 'shipping' | 'inventory_management' | 'invoice_verification';
export interface DocumentFlowClassification {
  stage: DocumentFlowStageId;
  document_type: string;
  reason: string;
  source: 'category' | 'title' | 'metadata';
}
export interface FlowDocument extends DocumentRecord {
  flow: DocumentFlowClassification;
  flow_case_id: string | null;
}
export interface DocumentFlowData {
  stages: Array<{
    id: DocumentFlowStageId;
    label: string;
    description: string;
    count: number;
    items: FlowDocument[];
  }>;
  total: number;
  classified_total: number;
  unclassified_total: number;
  categories: string[];
  cases: Array<{ id: string; label: string; count: number }>;
}
