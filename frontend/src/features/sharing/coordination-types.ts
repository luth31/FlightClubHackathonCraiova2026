export interface CollaborationContact {
  id: string; name: string; email: string; department: string; job_title: string;
  role: 'director' | 'department_head';
}
export interface Participation {
  enabled: boolean; revision: number; can_manage: boolean; updated_at: string | null;
}
export type CollaborationCategory = 'request' | 'document' | 'problem';

export interface SharedAttachment {
  share_id: string;
  title: string;
  source_airport_id: string;
  source_version: number;
  status: string;
  file_url: string;
}

export interface CoordinationMessage {
  id: string;
  body: string;
  kind: 'request' | 'reply' | 'resolved' | 'declined';
  author_airport_id: string;
  author_airport_name: string;
  author_role: string;
  author_contact: CollaborationContact | null;
  created_at: string;
  is_local: boolean;
  delivery: 'pending' | 'received';
  attachment: SharedAttachment | null;
}

export interface CoordinationRequest {
  starred?: boolean;
  archived?: boolean;
  unread?: boolean;
  in_inbox?: boolean;
  in_sent?: boolean;
  last_sequence?: number;
  has_attachment?: boolean;
  requester_airport_id?: string;
  recipient_airport_id?: string;
  id: string;
  direction: 'outgoing' | 'incoming';
  subject: string;
  topic: string;
  status: 'open' | 'resolved' | 'declined';
  created_at: string;
  updated_at: string;
  partner_name: string;
  requester_department?: string | null;
  recipient_department?: string | null;
  requester_contact: CollaborationContact | null;
  recipient_contact: CollaborationContact | null;
  category: CollaborationCategory;
  message_count: number;
  last_message: string;
  pending_delivery: boolean;
}

export interface CoordinationDetail extends CoordinationRequest {
  partner: PartnerConnection;
  messages: CoordinationMessage[];
  can_reply: boolean;
  can_participate: boolean;
  can_resolve: boolean;
  can_decline: boolean;
  connected: boolean;
}

export interface AirportProfile {
  id:string;name:string;iata?:string;icao?:string;city?:string;country?:string;
  latitude?:number;longitude?:number;color?:string;
}
export interface PartnerConnection extends AirportProfile {
  connected: boolean; configured: boolean; sharing_enabled: boolean;
  last_synced_at: string | null;
  departments: {name:string;label:string}[];
  participation_enabled: boolean;
  contacts: CollaborationContact[];
}
export interface CoordinationInbox {
  partner: PartnerConnection;
  partners: PartnerConnection[];
  local_airport: AirportProfile;
  can_create: boolean;
  connected: boolean;
  sync_error?: string | null;
  requests: CoordinationRequest[];
  participation: Participation;
  sender: CollaborationContact;
}
