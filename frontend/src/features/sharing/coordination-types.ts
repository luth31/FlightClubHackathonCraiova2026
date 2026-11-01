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
  created_at: string;
  is_local: boolean;
  delivery: 'pending' | 'received';
  attachment: SharedAttachment | null;
}

export interface CoordinationRequest {
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
  message_count: number;
  last_message: string;
  pending_delivery: boolean;
}

export interface CoordinationDetail extends CoordinationRequest {
  messages: CoordinationMessage[];
  can_reply: boolean;
  can_resolve: boolean;
  can_decline: boolean;
  connected: boolean;
}

export interface PartnerConnection {
  id: string; name: string; connected: boolean; configured: boolean; sharing_enabled: boolean;
  last_synced_at: string | null;
  departments: {name:string;label:string}[];
}
export interface CoordinationInbox {
  partner: PartnerConnection;
  partners: PartnerConnection[];
  local_airport: {id:string;name:string};
  can_create: boolean;
  connected: boolean;
  sync_error?: string | null;
  requests: CoordinationRequest[];
}
