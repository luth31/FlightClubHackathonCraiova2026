export interface Person {
  id:string; name:string; email:string; department:string; department_id?:string; role:string;
  roles:string[]; active:boolean; availability:string; job_title:string; manager_id?:string|null;
  manager_name?:string; is_department_head?:boolean; provisioning_status?:string;
  identity_sync_pending?:boolean; login_username?:string;
}
export interface Department {id:string;name:string;head_user_id?:string|null;head_name?:string|null;revision?:number;job_titles?:string[]}
export interface Delegation {id:string;from_user:string;to_user:string;from_name:string;to_name:string;starts_at:string;ends_at:string;reason:string;status:string;scope:string;active:boolean}
export interface Leave {id:string;user_id:string;name:string;department:string;starts_at:string;ends_at:string;reason:string;status:string;can_decide:boolean}
export interface Directory {
  items:Person[]; total:number; departments:string[]; department_records?:Department[];
  delegations:Delegation[]; leaves:Leave[]; current_user_id:string; can_manage_accounts:boolean;
  can_manage_delegations:boolean; can_create_users?:boolean; can_propose_heads?:boolean;
  can_admin_delegations?:boolean;
  can_manage_signing?:boolean; can_view_appointments?:boolean; reference_date:string; auth_mode?:string;
}
export interface ProvisionResult {user:Person;temporary_password?:string;provisioning_error?:string;invitation_status?:string}
export interface Appointment {
  id:string; name:string; department:string; user_id:string; effective_date:string; reason:string;
  status:string; proposer_name:string; decider_name?:string; decision_comment?:string; can_decide:boolean;
}
