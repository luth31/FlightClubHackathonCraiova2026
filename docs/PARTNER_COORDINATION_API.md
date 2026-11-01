# Partner coordination API

Implemented 1 November 2026. This is a small request-and-response inbox for the configured Craiova/Sibiu demonstration partners, not a public community or an operational clearance channel.

Each airport owns its database and local messages. The authenticated, mutual-TLS gateways continue to allow only GET. The visible authenticated application pulls the other airport's locally authored events for the navigation badge, including outside the coordination view, and persists them in its own database. The active coordination view also refreshes its list/detail. Replies take the reverse route on the other airport's next pull. No document is shared automatically.

## Access and delivery

Local access requires the same `sharing` page permission: director, appointed department head, or reviewer in Conformitate. Creation and replies require a director or the currently appointed head (checked against the department record, not just a role string). Department heads see and handle their own department’s incoming and outgoing requests; directors and compliance readers retain oversight, but a compliance reviewer without a head appointment cannot create or reply. Inactive users and other tenants are rejected. The peer route additionally checks the authenticated airport, requester role and department. Browser-facing nginx already blocks `/api/exchange/`; only the authenticated gateway exposes it to the partner.

`pending_delivery` means at least one local event has not yet been acknowledged as persisted by the partner. `received` means persisted by the partner's application, **not read by a person**. A partner receives events while a visible authenticated application with collaboration permission, an active coordination view or an explicit API reader synchronizes. The navigation badge polls every 25 seconds and the active coordination view every 15 seconds; browser visibility and access guards suspend those polls. There is no server background worker or email/push notification.

An outage keeps the cached local inbox readable, with `connected: false` and a Romanian `sync_error`. New writes are disabled until a successful sync. Previously accepted writes survive outages, and retrying their original idempotency key returns the same request even while offline.

## Local API

All routes below require an active application session.

| Route | Body | Result |
|---|---|---|
| `GET /api/collaboration` | — | Syncs, then returns the local inbox and connection state. |
| `POST /api/collaboration` | `{subject, topic?, body, recipient_airport_id, recipient_department, idempotency_key}` | Creates a local outbound request; returns detail (201). The selected airport must be the configured partner; the department must exist in its verified directory. |
| `GET /api/collaboration/{id}` | — | Syncs, then returns request detail, messages and capabilities. |
| `POST /api/collaboration/{id}/messages` | `{body, share_id?, idempotency_key}` | Appends a reply, optionally linking an existing reviewed share grant; returns detail (201). |
| `POST /api/collaboration/{id}/status` | `{status: "resolved" \| "declined", body?, idempotency_key}` | Records a terminal decision; returns detail. |

Limits: subject 3–160 characters; topic 1–80 (default `Proceduri și bune practici`); body 1–3000 for a request/reply, 0–3000 for a status change; idempotency key 8–100 ASCII letters/digits/underscore/hyphen. Use a UUID per user action and retain it on retries. Reusing a key with a different payload returns 409. Unknown fields, empty content and disallowed Unicode control characters are rejected. Content is plain text and must be rendered as text, never HTML.

List response:

```ts
{
  partner: PartnerConnection,
  partners: PartnerConnection[], // configured connections only; empty when unconfigured
  local_airport: {id: string, name: string},
  connected: boolean,
  sync_error: string | null,
  can_create: boolean,
  requests: Array<{
    id: string, requester_airport_id: string, recipient_airport_id: string,
    subject: string, topic: string, requester_department: string | null, recipient_department: string | null,
    direction: 'outgoing' | 'incoming',
    status: 'open' | 'resolved' | 'declined',
    created_at: string, updated_at: string,
    partner_name: string, message_count: number,
    last_message: string, pending_delivery: boolean
  }>
}
```

Detail returns one request's fields plus `partner`, `local_airport`, `connected`, `sync_error`, `can_reply`, `can_resolve`, `can_decline`, and:

```ts
messages: Array<{
  id: string, kind: 'request' | 'reply' | 'resolved' | 'declined', body: string,
  author_airport_id: string, author_airport_name: string,
  author_role: 'director' | 'Conformitate' | 'department_head', created_at: string, is_local: boolean,
  delivery: 'pending' | 'received',
  attachment: null | {
    share_id: string, title: string, source_airport_id: string,
    source_version: number, status: string, file_url: string
  }
}>
```

The requester airport resolves; the recipient airport declines. Closed requests remain readable and do not accept new replies. Concurrent terminal actions converge deterministically, with requester resolution taking precedence. This is request coordination, not a new approval workflow for documents.

## Linking a reviewed document

The existing redaction/review/share flow creates the grant first. The user then explicitly submits a reply with its `share_id`. The backend accepts only an active, reviewed, current-version grant to the configured partner, associated with a readable approved/signed local document. HR documents are excluded. Department-scoped grants cannot be attached because the request audience includes both directors and Conformitate; this would otherwise broaden the metadata audience.

Attachments carry the redacted title, share ID and version, never the original document or a bypass URL. The recipient opens `/api/received/{share_id}/file`, which rechecks the source's existing expiry, revocation, version and integrity controls. Incoming attachment status is `verify_on_open`; it is not a promise of continuing access. Source attachments show their current grant status. Revoked/expired attachment metadata is omitted when an event is first fetched after revocation; previously received messages remain historical records, while file access is denied at the source.

Creating the share and posting the reply are deliberately separate operations. If posting fails, retain the selected share ID and idempotency key so the user can retry without creating another grant. No new grant is created by a collaboration endpoint.

## Peer protocol and persistence

`GET /api/exchange/collaboration?after=<cursor>` is available through the existing gateway path `/outgoing/collaboration`. The response has `source_airport_id`, `recipient_airport_id`, at most 100 ordered `events`, `next_cursor`, `acknowledged_cursor`, and `has_more`.

Only events authored locally are exported; imported events are never echoed back. Every event includes its immutable request header so both databases can verify identity and participants. A new inbound thread must begin with a request authored by its requester. Unknown replies, changed headers, spoofed source airports, invalid terminal authors, malformed timestamps, attachment origins and cursor inconsistencies fail the entire batch. The cursor only advances after a successful transaction. Replayed batches and concurrent polls are deduplicated. A poll fetches at most five batches; further catch-up continues on the next poll, with writes disabled until caught up.

Tables added by migration `20261101_partner_collaboration`:

- `collaboration_threads`: local request identity and immutable subject/context.
- `collaboration_events`: append-only authored and received messages, local sequence, peer sequence, idempotency key and payload fingerprint.
- `collaboration_sync`: per-partner received and acknowledged cursors.

There is no endpoint for deleting or rewriting event history. A future retention/stream-reset feature must preserve cursor semantics or introduce a new stream epoch; deleting rows ad hoc is unsupported.

## Deployment and verification

Restart/rebuild both airport APIs so startup applies the additive migration. No existing document or event table is reset. No gateway or browser-nginx configuration change is required: their existing authenticated GET-only proxy paths cover the new peer route. Both gateways must remain connected with their existing local credentials and certificates. A standalone local development instance without `exchange_url` shows the explicit configuration state.

Verification:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_collaboration.py backend/tests/test_exchange.py -q
```

The coordination tests use two independent SQLite databases and a read-only gateway transport to exercise request, reply, acknowledgement, resolution and decline. Additional tests cover permissions, tenant isolation, invalid peer payloads, replay, idempotency conflicts, offline preservation, input limits, reviewed-grant attachments, restricted recipient scope and revocation. Browser-level and actual container deployment validation are separate checks.

## Connection directory and department routing

`PartnerConnection` includes `id`, verified `name`, `configured`, `connected`, `sharing_enabled`, `last_synced_at`, and `departments: [{name, label}]`. The partner publishes its department directory and airport name in the authenticated feed; successful synchronization persists them. An outage keeps the last verified identity and directory but marks connectivity false. The display shows the local airport, each configured connection, its status, scope and last synchronization across all collaboration tabs. Connection does not automatically share documents.

The current deployment supports the single configured Craiova–Sibiu gateway link per airport. The UI renders the returned connection list and never invents other airports. Adding arbitrary new federation members still requires backend/gateway provisioning; this change does not introduce an airport onboarding UI.

Migration `20261101_collaboration_routing` adds nullable requester/recipient departments for existing threads and connection metadata on synchronization records. Existing unaddressed threads remain visible to directors/compliance; they are not assigned to a department automatically. New requests require explicit department selection. Both peers must be upgraded together because the verified wire header now carries department routing. Normal development and presentation configuration remain unchanged.

Validation for department routing: 377 backend tests and 173 frontend tests passed, including department-head authorization, cross-department detail/reply denial, required destination validation, independent-store synchronization, navigation and mobile form rendering. Build and lint passed. Both local Docker airport databases migrated to `20261101_collaboration_routing`; the real gateways returned `connected: true` and the four published departments in both directions. Browser layout QA used an isolated fixture; the existing OIDC credentials did not permit a fresh browser login, so deployment connectivity was verified through the application service instead.
