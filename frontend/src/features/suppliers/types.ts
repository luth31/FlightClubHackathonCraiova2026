export interface Supplier {
  id: string;
  name: string;
  document_id: string;
  expected_iban: string;
  verified_contact: string;
  trust_status: string;
  bank_history: Array<{
    iban: string;
    version: number;
    created_at: string;
    verified_by?: string;
    approved_by?: string;
  }>;
}
export interface Review {
  id: string;
  document_id?: string;
  source_version?: number;
  supplier_name: string;
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
