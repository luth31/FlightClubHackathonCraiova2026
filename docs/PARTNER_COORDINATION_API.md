# Partner coordination API

Implemented 1 November 2026. The workspace combines a professional contact directory with personally addressed conversations for explicitly configured airport partners. The UI uses mail conventions; it sends FlyLeaf messages, not email. The local demonstration includes Craiova, Sibiu, Cluj and Iași, with separate accounts, databases and sessions.

Each airport owns its database and local messages. The authenticated, mutual-TLS gateways continue to allow only GET. The visible authenticated application pulls the other airport's locally authored events for the navigation badge, including outside the coordination view, and persists them in its own database. The active coordination view also refreshes its list/detail. Replies take the reverse route on the other airport's next pull. No document is shared automatically.

## Access and delivery

Collaboration starts disabled. Only an active director can change participation, using a revision to reject concurrent stale changes. Directors can always open the activation screen. Other users receive the `sharing` page permission only when their airport has opted in and they are a currently appointed **main department head**. An area coordinator, stale role label or ordinary compliance reviewer is insufficient. Inactive users and other tenants are rejected.

New conversations are visible only to their named participants while those users remain eligible. A different director or head cannot inspect them. Losing the appointment removes access; this release does not silently transfer that person's conversations to a replacement. The peer route checks the authenticated airport and a director/department-head role. Browser-facing nginx blocks `/api/exchange/`; only the authenticated gateway exposes it to the partner.

Published contacts contain only ID, name, professional email, department, job title and director/head role. Presence, photos, leave, manager information and personal status messages are excluded. The table exposes name, role and email without hover; its profile card also supports keyboard focus and touch. Remote IDs are never resolved against local person profiles.

The workspace opens on **Mesagerie → Mesaje**, showing only the signed-in airport's identity above a mail-style inbox. **Aeroporturi** is a separate searchable directory with a map, paginated results and a selected airport profile. Contacts in that profile show name, role and email directly; the person avatar opens the professional contact card on hover, focus or touch. Airport badges use a distinct shape, color and IATA code. The own-airport profile contains the director's activation control.

Mail folders are Primite, Cu stea, Trimise, Ciorne, Arhivate and Toate mesajele. A conversation can appear in both Primite and Trimise: an outgoing request enters Primite when a partner replies. Read state, stars and archive are personal, persisted locally on the airport server and never exported as read receipts. Opening a conversation marks the events known at that moment as read. Archiving only changes this person's mailbox; it neither resolves nor removes a conversation. Search matches subject, latest message, participants and airport name. A single compose draft is stored in this browser's local storage, scoped to airport and user; closing keeps it, discarding removes it. Drafts do not synchronize between devices.

Disabling participation hides published contacts on the next partner sync, stops new messages and pauses local event publication. History is preserved; contact lists disappear during outages instead of presenting stale recipients as available. Re-enabling resumes pending delivery. Existing document grants retain their separately managed expiry and revocation rules; disabling messages does not recall an already shared or downloaded copy.

`pending_delivery` means at least one local event has not yet been acknowledged as persisted by the partner. `received` means persisted by the partner's application, **not read by a person**. A partner receives events while a visible authenticated application with collaboration permission, an active coordination view or an explicit API reader synchronizes. The navigation badge polls every 25 seconds and the active coordination view every 15 seconds; browser visibility and access guards suspend those polls. There is no server background worker or email/push notification.

An outage keeps the cached local inbox readable. Each partner has its own `connected` state and Romanian `sync_error`. New writes to that partner are disabled until a successful sync; other connected partners remain usable. The inbox-level `connected` is true when any configured peer is reachable. Previously accepted writes survive outages, and retrying their original idempotency key returns the same request even while offline.

## Local API

All routes below require an active application session.

| Route | Body | Result |
|---|---|---|
| `GET /api/collaboration` | — | Syncs, then returns the local inbox and connection state. |
| `GET /api/collaboration/airports?q=&available=true&offset=0&limit=12` | — | Searches configured airport profiles by name, city, country, IATA or ICAO; defaults to opted-in partners. Returns a page of profiles, current eligible contacts, total and map configuration. |
| `PATCH /api/collaboration/participation` | `{enabled, revision}` | Director-only opt-in/out; returns participation state. Stale revision returns 409. |
| `POST /api/collaboration` | `{subject, topic?, category?, body, recipient_airport_id, recipient_user_id, share_id?, idempotency_key}` | Creates a personally addressed conversation (201). Both airports must be enabled and the selected person must be in the freshly verified directory. Sender identity and both departments come from server records. |
| `GET /api/collaboration/{id}` | — | Syncs, then returns request detail, messages and capabilities. |
| `PATCH /api/collaboration/{id}/mailbox` | `{read_sequence?, starred?, archived?}` | Updates only the current participant's mailbox state. Requires a nonempty patch; read sequence must not exceed the thread's current event sequence. |
| `POST /api/collaboration/{id}/messages` | `{body, share_id?, idempotency_key}` | Appends a reply, optionally linking an existing reviewed share grant; returns detail (201). |
| `POST /api/collaboration/{id}/status` | `{status: "resolved" \| "declined", body?, idempotency_key}` | Records a terminal decision; returns detail. |

Limits: subject 3–160 characters; topic 1–80 (default `Proceduri și bune practici`); body 1–3000 for a request/reply, 0–3000 for a status change; idempotency key 8–100 ASCII letters/digits/underscore/hyphen. Use a UUID per user action and retain it on retries. Reusing a key with a different payload returns 409. Unknown fields, empty content and disallowed Unicode control characters are rejected. Content is plain text and must be rendered as text, never HTML.

List response:

```ts
{
  partner: PartnerConnection,
  partners: PartnerConnection[], // configured connections only; empty when unconfigured
  local_airport: AirportProfile,
  participation: {enabled: boolean, revision: number, can_manage: boolean, updated_at: string | null},
  sender: Contact,
  connected: boolean,
  sync_error: string | null,
  can_create: boolean,
  requests: Array<{
    id: string, requester_airport_id: string, recipient_airport_id: string,
    subject: string, topic: string, requester_department: string | null, recipient_department: string | null,
    category: 'request' | 'document' | 'problem',
    requester_contact: Contact | null, recipient_contact: Contact | null,
    direction: 'outgoing' | 'incoming',
    status: 'open' | 'resolved' | 'declined',
    created_at: string, updated_at: string,
    partner_name: string, message_count: number,
    last_message: string, pending_delivery: boolean,
    starred: boolean, archived: boolean, unread: boolean,
    last_sequence: number, has_attachment: boolean,
    in_inbox: boolean, in_sent: boolean
  }>
}
```

`Contact` contains `{id, name, email, department, job_title, role: 'director' | 'department_head'}`. Categories are shown as Solicitare, Document and Problemă. A Document message requires a reviewed `share_id`; the other categories can optionally attach one.

`AirportProfile` contains `{id, name, city, country, iata, icao, latitude, longitude, color}`. Directory results combine that profile with `PartnerConnection`. `available=false` includes configured airports whose collaboration is disabled, with no published contacts. Directory pagination uses a limit of 1–50 and a nonnegative offset; this remains a directory of provisioned FlyLeaf partners, not a worldwide airport onboarding service.

Detail returns one request's fields plus `partner`, `local_airport`, `connected`, `sync_error`, `can_reply`, `can_participate`, `can_resolve`, `can_decline`, and:

```ts
messages: Array<{
  id: string, kind: 'request' | 'reply' | 'resolved' | 'declined', body: string,
  author_airport_id: string, author_airport_name: string,
  author_contact: Contact | null,
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

The existing redaction/review/share flow creates the grant first. The user then explicitly sends the initial message or a reply with its `share_id`. The backend accepts only an active, reviewed, current-version grant to the configured partner, associated with a readable approved/signed local document. HR documents are excluded. This first increment retains the existing airport-wide grant picker and rejects department-scoped grants. Named conversations do not narrow an existing grant's audience. The composer explains this distinction. Finer document-recipient controls are a separate follow-up; message privacy must not be presented as per-person PDF authorization.

Attachments carry the redacted title, share ID and version, never the original document or a bypass URL. The recipient opens `/api/received/{share_id}/file?airport_id={source_airport_id}`, which rechecks the source's existing expiry, revocation, version and integrity controls. The source selects an explicitly configured gateway, never a URL provided in a message. Incoming attachment status is `verify_on_open`; it is not a promise of continuing access. Source attachments show their current grant status. Revoked/expired attachment metadata is omitted when an event is first fetched after revocation; previously received messages remain historical records, while file access is denied at the source. `GET /api/received` combines the configured libraries and reports unavailable peers separately when some remain accessible.

Creating the share and posting the reply are deliberately separate operations. If posting fails, retain the selected share ID and idempotency key so the user can retry without creating another grant. No new grant is created by a collaboration endpoint.

Attachment cards display a PNG of the actual first PDF page. Local `GET /api/shares/{id}/thumbnail` and received `GET /api/received/{id}/thumbnail?airport_id=...` use the same authorization, grant and file-integrity checks as the PDF, then render that page. Responses use `Cache-Control: no-store`. Opening the card shows the full PDF with a download action; a preview is not a separate public file.

### Upload, preview and local editing

The compose footer provides both a library attachment picker and **Încarcă PDF de pe dispozitiv**. Reply attachments offer the same upload action in the picker. Upload accepts PDF files up to 25 MB, reuses the document registry's validation and permissions, and creates a private draft. The preparation screen retains the message text while the user reviews the PDF and explicitly validates, submits and approves it through the existing assigned workflow. If approval belongs to another person, their name is shown. Only someone already authorized to reassign that task can choose **Preia avizarea**. Upload does not approve a document or send a message automatically. Drafts and documents awaiting approval remain discoverable under **Pregătește o copie**.

Once approved, the user prepares and reviews a redacted copy, selects its grant as the attachment, and explicitly sends the message. This retains the existing document approval and sharing controls. Metadata changes and new file versions still require their normal validation and approval.

PDFs in document detail, received libraries and message previews use a read-only image viewer with pagination, zoom and download. There are no embedded browser annotation, drawing or add-text controls suggesting changes will be saved. The redaction studio is the only interface that changes PDF content, and creates a separate reviewed copy.

The existing authenticated file routes accept `representation=info`, `representation=png&page=1` and `representation=docx` in addition to the default PDF. These options retain the route's version, tenant, grant, integrity and revocation checks. Received representations are generated from the PDF fetched through the authorized peer gateway, without a new gateway endpoint. Page images are capped at 1800 pixels; responses are not cached.

**Descarcă Word** creates an editable `.docx` containing extracted text and detected tables from the accessible PDF, not from an original or OCR cache. Removed text stays removed. This is a copy for local adaptation, not the original Word source or a transfer of its approval/signature. Images and exact PDF layout are not reproduced; pages without editable text are identified. An entirely scanned PDF produces an explicit error instead of a misleading empty Word file. Export is limited to 100 pages. Users edit locally in Word or a compatible editor, check the result, export it to PDF and upload the new file for review. Direct DOCX upload is not supported in this increment. Generation uses [python-docx](https://python-docx.readthedocs.io/en/latest/user/quickstart.html) and [PyMuPDF table extraction](https://pymupdf.readthedocs.io/en/latest/page.html#Page.find_tables).

The composer includes an airport selector. Selecting one immediately lists its currently available contacts in **Către**, with name, role and email, without requiring typed search. Typing filters those contacts. Changing the airport clears the previous person and attachment. Person cards also provide **Copiază emailul**, with success feedback only after the browser confirms copying; a denied clipboard request leaves the address available for manual copying.

## Peer protocol and persistence

`GET /api/exchange/collaboration?after=<cursor>` is available through the existing gateway path `/outgoing/collaboration`. The response has `source_airport_id`, `recipient_airport_id`, at most 100 ordered `events`, `next_cursor`, `acknowledged_cursor`, and `has_more`.

Only events authored locally in conversations involving the authenticated peer are exported; imported events are never echoed back. Craiova–Cluj messages and acknowledgements cannot be fetched through Sibiu's feed. Each partner has independent cursors and acknowledgement state. Every event includes its immutable request header so both databases can verify identity and participants. A new inbound thread must begin with a request authored by its requester. Unknown replies, changed headers, spoofed source airports, invalid terminal authors, malformed timestamps, attachment origins and cursor inconsistencies fail the entire batch. The cursor only advances after a successful transaction. Replayed batches and concurrent polls are deduplicated. A poll fetches at most five batches per peer; further catch-up continues on the next poll, with writes to that peer disabled until caught up.

Tables added by migration `20261101_partner_collaboration`:

- `collaboration_threads`: local request identity and immutable subject/context.
- `collaboration_events`: append-only authored and received messages, local sequence, peer sequence, idempotency key and payload fingerprint.
- `collaboration_sync`: per-partner received and acknowledged cursors.

Migration `20261101_collaboration_contacts` adds participation and named-contact routing. Migration `20261101_collaboration_mailbox` adds `collaboration_mailbox_state`, keyed by airport, user and conversation, for read sequence, star and archive state.

There is no endpoint for deleting or rewriting event history. A future retention/stream-reset feature must preserve cursor semantics or introduce a new stream epoch; deleting rows ad hoc is unsupported.

## Deployment and verification

Rebuild the participating airport APIs and frontends together. Startup applies `20261101_collaboration_mailbox`, after the contact migration that joins the existing collaboration and profile migration heads. Existing documents, profiles and conversations are preserved. Peers need the new wire contract, including participation, contacts, contact snapshots and author ID. Existing authenticated GET-only gateway paths cover the route. A standalone instance without `exchange_url` retains its explicit unconfigured state.

For a demonstration: sign in as director in each airport; open Colaborare → Mesagerie and activate collaboration from the own-airport profile. Open Aeroporturi, search for a partner, select its marker or result, then choose the mail icon beside a contact. The compose window already has that person as recipient. Send a Solicitare, Document or Problemă. Sign in as that person at the other airport, open Primite, reply and return to the initiating account. Delivery is acknowledged when the opposite application synchronizes, not at the first click on Trimite. Directors are not asked to approve each individual message.

### Map setup

Set `FLYLEAF_GOOGLE_MAPS_API_KEY` in **this checkout's** ignored `backend/.env`, enable Maps JavaScript API for its Google Cloud project and restart the demo APIs. The browser map uses Google Maps Advanced Markers with distinct airport badges, synchronized selection, world view and a fit-results control. The current map ID is `DEMO_MAP_ID`, which Google supports for testing; a production deployment should configure its own map ID and a browser key restricted to its web origins and required API. See [Google's Advanced Markers setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start).

The directory searches registered FlyLeaf partners. Its external Google Maps link searches the typed airport name using [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started); no Places search or import is implemented. If no Google key is configured, or the Google loader fails, the view falls back to Leaflet/OpenStreetMap with attribution. Directory search and contact profiles remain usable if the map cannot load. The key is a browser API key returned only to authenticated directory readers; do not substitute a server credential.

Verification:

```sh
cd backend
python -m pytest tests/test_collaboration.py tests/test_collaboration_contacts.py tests/test_collaboration_network.py tests/test_exchange.py tests/test_login_password.py tests/test_profile_migrations.py -q
```

The coordination tests use two independent SQLite databases and a read-only gateway transport to exercise request, reply, acknowledgement, resolution and decline. Additional tests cover permissions, tenant isolation, invalid peer payloads, replay, idempotency conflicts, offline preservation, input limits, reviewed-grant attachments, restricted recipient scope and revocation. Browser-level and actual container deployment validation are separate checks.

## Connection directory and legacy conversations

`PartnerConnection` includes `id`, verified `name`, `configured`, `connected`, `sharing_enabled`, `participation_enabled`, `contacts`, `last_synced_at`, and the legacy `departments` field. `sharing_enabled` indicates that both endpoints have enabled messaging and the link is connected. The authenticated feed publishes eligible professional contacts only after local activation. An outage preserves historical peer identity while hiding cached contacts from the selectable directory. Conversation contact snapshots preserve the identities used at creation; eligibility for a new reply is checked against current records.

Configure multiple peers with `FLYLEAF_EXCHANGE_PEERS`, a JSON object from airport ID to authenticated gateway URL, for example `{"sibiu":"https://sibiu-gateway","cluj":"https://cluj-gateway","iasi":"https://iasi-gateway"}` on Craiova. Supported IDs are currently `craiova`, `sibiu`, `cluj`, `iasi`; the local airport must not appear in its peer list. The original `FLYLEAF_EXCHANGE_URL` remains supported for the legacy Craiova–Sibiu pair. The UI renders only configured connections. Adding other federation members still requires backend/gateway provisioning; this change does not introduce an airport onboarding UI. The existing Docker/VPN deployment still provisions its original pair and needs separate gateway configuration for additional partners.

Older department-routed conversations retain their historical department/director visibility among users who still have workspace access. Migration does not invent a recipient for them. Newly created conversations always require an explicit person and use participant-only visibility. There is no matching algorithm, public signup, group channel, reassignment or automatic email delivery in this increment.

Tests cover opt-in and stale revisions, current head appointments, named-recipient isolation including director denial, peer-disable and outage behavior, forged identities, attachment review, two independent airport stores, retry/idempotency, contact cards and mail composition. Migration tests upgrade fresh databases and both pre-existing branches without deleting profiles or document evidence. Browser layout verification uses an isolated local fixture; existing Docker/VPN deployments are not updated automatically by this branch.

## Four-airport local demonstration

From this checkout, with backend dependencies and `frontend/node_modules` installed:

```powershell
.\scripts\start-collaboration-demo.ps1
# Supply -PythonPath C:\path\to\venv\Scripts\python.exe if needed.
# When finished:
.\scripts\stop-collaboration-demo.ps1
```

| Airport | Web address | Director (`admin`) | Initial participation |
|---|---|---|---|
| Craiova | http://127.0.0.1:5184 | Ana Ionescu | Enabled |
| Sibiu | http://127.0.0.1:5185 | Alexandru Mureșan | Enabled |
| Cluj | http://127.0.0.1:5186 | Mara Georgescu | Enabled |
| Iași | http://127.0.0.1:5187 | Andrei Constantinescu | Disabled |

All seeded demo accounts use **`FlyLeaf2026!`**. The [account document](demo/ACCOUNTS.md) lists all 28 names, roles and associated airports. Start at http://127.0.0.1:5184 and enter a full name and password; the local demo login router finds the account's airport, authenticates against that airport's API, forwards its HttpOnly session cookie and redirects to its workspace. Neither the sign-in screen nor sidebar contains an account/airport selector. A failed login sets no cookie and does not redirect. Names are case/diacritic insensitive; passwords are used unchanged. Duplicate full names are rejected; a unique professional email can disambiguate them. Repeated local IDs such as `admin` are for direct API tooling, not the global name-entry screen.

Each airport has seven separately stored users: director, procurement/finance head, technical/operations head, conformity reviewer, finance officer, HR officer and technician. Only the director and currently appointed main department heads can use collaboration once activated. Anonymous session responses contain no user directory; authenticated sessions contain only the current account. These are fictional demonstration profiles, not real airport contacts.

The conversation examples include a Craiova–Sibiu request with an attached two-page maintenance reception form in Sibiu's response, an administrative fraud-control question from Sibiu, a reviewed PDF template from Cluj to Craiova, and a resolved Craiova–Cluj request. Revision 02 templates contain editable-on-paper fields, service checks, replaced-parts quantities and costs, remediation and blank signatures; the PDFs clearly identify themselves as demonstration examples. Each airport receives its own reception and invoice-checklist templates. The upgrade appends the improved PDFs without overwriting old approved versions or grants, and bootstrap is idempotent. Craiova retains the already prepared local document library when `.runtime/qa.db` is present. Other airports do not receive Craiova's private library.

To test: open Craiova as director → Colaborare → Mesagerie → Aeroporturi. Search Sibiu, select its result or marker, inspect its contacts and compose a personally addressed message. Sibiu and Cluj publish eligible contacts. Uncheck **În colaborare** and search Iași: it has a disabled marker and no contact list. At Iași, the director can open the own-airport profile and choose **Activează colaborarea**; refresh Craiova's directory to see the newly published contacts. An ordinary technician has no collaboration entry. Participation and conversations persist across restarts; initialization does not reset your changes.

For the document scenario, stay in Craiova's **Mesaje → Primite**, open **Model pentru recepția serviciilor de mentenanță**, then open the PDF card in Alexandru Mureșan's response. Both pages can be viewed and downloaded. This is the actual reviewed Sibiu grant fetched through the local relay, not an illustration of an attachment.

Blank names/passwords, whitespace-only passwords and wrong passwords do not authenticate. To use another account, choose **Ieși din cont**, then enter its name and password. An existing valid session can reopen without another login. Initializing these demo databases clears old sessions once, including those created through the former frontend fallback. No fixed password is substituted by the frontend.

Runtime files, tokens, process records, databases and logs stay under ignored `.runtime/` paths. APIs bind to `127.0.0.1:8014–8017`, web servers to `127.0.0.1:5184–5187`, and the local relay to `127.0.0.1:8030`. For collaboration, the relay validates per-instance bearer tokens, fixes source/destination routing and only forwards the allowed read routes. Its separate `POST /auth/login` endpoint is reached only through the demo-configured Vite login proxy; it accepts JSON with a name and password, restricts browser origins to the local demo URLs, and forwards credentials only to the resolved loopback airport API. Credentials are never put in URLs or browser storage. Cookie forwarding relies on all demo instances sharing the same loopback hostname. **This loopback HTTP relay is a local demo transport, not a VPN or production identity provider.** The existing OIDC production login is unchanged. Do not expose these demo servers publicly. The launcher records only its own processes; stopping it preserves data. Real-browser verification uses these instances for typed name/password entry, automatic account-airport routing, contact filtering, mobile layout and received PDF routing.
