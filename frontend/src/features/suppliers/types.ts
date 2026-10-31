export interface Supplier {
  id: string;
  name: string;
  document_id: string;
  expected_iban: string;
  verified_contact: string;
  trust_status: string;
  tax_id?: string;
  address: string;
  category: string;
  state: 'active'|'suspended';
  registry_revision: number;
  can_manage: boolean;
  contracts: Array<{id:string;title:string;version:number;eligible_for_review:boolean;unavailable_reason?:string}>;
  bank_history: Array<{
    iban: string;
    version: number;
    created_at: string;
    verified_by?: string;
    approved_by?: string;
    source_case_id?: string;
    verified_actor?: {id:string; name:string};
    approved_actor?: {id:string; name:string};
  }>;
}
export interface Review {
  id: string;
  document_id?: string;
  source_version?: number;
  supplier_name: string;
  supplier_id?: string;
  expected_iban: string;
  observed_iban: string;
  sender_email: string;
  verified_contact: string;
  invoice_amount?: number;
  invoice_currency?: string;
  service_date?: string;
  contract_snapshot?: {value: string | null; currency: string; effective_date?: string; expires_at?: string};
  message: string;
  reasons: Array<{ code: string; message: string }>;
  status: string;
  created_by: string;
  created_at: string;
  verified_by?: string;
  verified_at?: string;
  approved_by?: string;
  approved_at?: string;
  verification_note?: string;
  decision_note?: string;
  risk_level: string;
  iban_valid: boolean;
  can_verify: boolean;
  can_approve: boolean;
  checks?: Array<{code:string; result:string; message:string}>;
  freshness: {state:string; reasons:string[]};
  previous_review_id?: string;
  rechecks?: Array<{id:string;status:string;created_at:string}>;
  actors?: Record<string,{id:string;name:string}|null>;
  duplicate?: boolean;
}
export interface Registry {
  items: Review[];
  total: number;
  suppliers: Supplier[];
  counters: {
    needs_review: number;
    verified: number;
    approved: number;
    clear: number;
  };
  notice: string;
}
export interface Registration {
  id:string; status:string; supplier_id?:string;
  payload:{name:string;tax_id:string;address:string;category:string;source_contract_id:string;source_version:number;proposed_iban:string;proposed_contact:string;evidence_refs:Array<{document_id:string;version:number}>};
  created_at:string;verified_at?:string;approved_at?:string;verification_note:string;decision_note:string;
  verification_evidence?:{contact_used:string;method:string;contacted_person:string};
  can_verify:boolean;can_approve:boolean;freshness:{state:string;reasons:string[]};
  actors:Record<string,{id:string;name:string}|null>;
}
