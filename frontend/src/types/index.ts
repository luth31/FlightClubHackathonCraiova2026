export type Page = 'home'|'documents'|'contracts'|'approvals'|'sharing'|'people'|'audit'|'suppliers'|'operations'|'reports'|'equipment'|'assistant';
export interface User { id:string; name:string; role:string; roles:string[]; airport_id?:string; department:string; business_area?:string; initials?:string; active?:boolean; permissions?:{pages:Partial<Record<Page,boolean>>} }
export interface AuditEvent {id:string;actor:string;actor_id?:string|null;action:string;document_id?:string;document_title?:string;created_at:string;detail?:string|Record<string,unknown>}
export interface DocumentRecord {follow_up?:DocumentFollowUpState;id:string;title:string;number:string;category:string;department:string;status:string;created_at:string;updated_at?:string;expires_at?:string|null;supplier?:string|null;value?:number|null;currency?:string;owner?:string;owner_id?:string|null;confidentiality?:string;tags:string[];summary?:string;filename:string;related_ids:string[];metadata:Record<string,unknown>;permissions?:{can_validate?:boolean;can_submit?:boolean;can_edit:boolean;can_review:boolean;can_sign:boolean;can_share:boolean};extraction?:{status:string;error?:string|null;page_count:number;ocr_pages:number};extraction_status?:string;extraction_notice?:string;source_refs?:unknown[];version:number;validated:boolean;file_url:string;days_remaining?:number|null;contract_status?:string;related_documents?:DocumentRecord[]; versions?:Array<{file_url?:string;version:number;created_at:string;filename?:string;sha256?:string;comment?:string}>;audit?:AuditEvent[];workflow?:{diagram?:import('@/features/documents/DocumentStateFlow').DocumentLifecycle;steps:Array<{label:string;status:string;actor?:string;actor_id?:string;at?:string}>;current_step:string;task?:{id:string;assignee:string;assigned_to?:string|null;effective_assignee?:string|null;due_date:string;status:string;can_reassign:boolean;assignment_state:string}};extraction_evidence?:Array<{field:string;value:unknown;page:number;excerpt:string;confidence:number|null;validated:boolean}>}
export interface Task {id:string;document_id:string;title:string;department:string;assignee:string;status:string;priority:string;due_date:string;type:string}
export interface Share {can_revoke?:boolean;id:string;document_id:string;document_title?:string;title?:string;recipient_airport:string;recipient_department?:string|null;expires_at:string;created_at:string;status?:string;revoked?:boolean;revoked_at?:string;source_version:number;file_url?:string;redactions?:number}
export interface Dashboard {stats:{documents:number;pending:number;expiring:number;approved:number};recent_documents:DocumentRecord[];attention:Array<Partial<Task>&Partial<DocumentRecord>>;activity:AuditEvent[];departments:Array<{name:string;count:number}>|Record<string,number>}
export interface Session {auth?:{mode:'demo'|'oidc';login_url:string|null};current_user:User|null;users:User[];airport:string|{id?:string;name:string};reference_date:string;demo:boolean}
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

export interface ContractRenewal {
  follow_up?: DocumentFollowUpState;
  id: string;
  contract_id: string;
  source_version: number;
  expires_at: string;
  title: string;
  number: string;
  supplier: string | null;
  department: string;
  status: 'pending' | 'acknowledged' | 'in_progress' | 'completed' | 'cancelled' | 'not_renewing';
  revision: number;
  assigned_to: string | null;
  assignee: string;
  principal_name: string | null;
  assignment_state: 'assigned' | 'needs_reassignment';
  due_date: string;
  days_remaining: number;
  overdue: boolean;
  source_current: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  can_acknowledge: boolean;
  can_progress: boolean;
  can_close: boolean;
  can_reassign: boolean;
  eligible_assignees: Array<{ id: string; name: string; department: string }>;
  reminders: Array<{ threshold_days: 90 | 60 | 30; due_date: string; triggered_at: string | null }>;
  history: Array<{ id: number; actor: string; actor_id: string | null; action: string; comment: string; created_at: string }>;
}
export interface ContractRenewalQueue {
  items: ContractRenewal[];
  total: number;
  reference_date: string;
  counters: { open: number; overdue: number; needs_reassignment: number };
  can_sync: boolean;
}

export interface DocumentFollowUpState {
  reference_date: string;
  reminder_revision: number; decision_revision: number;
  remind_on: string | null; snoozed: boolean; reminder_due: boolean;
  not_renewing: boolean; alerts_suppressed: boolean;
  can_remind: boolean; can_decide: boolean;
  decision: {reason: string; responsible_id: string; responsible: string; responsible_active: boolean; decided_by: string; decided_at: string} | null;
  candidates?: Array<{id: string; name: string; department: string}>;
}
