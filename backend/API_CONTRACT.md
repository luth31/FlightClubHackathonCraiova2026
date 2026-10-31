# AeroDesk local demo API

Base `/api`. Authenticate with POST `/api/auth/login` JSON `{user_id:'admin',password:'AeroDesk2026!'}`. Demonstration accounts: admin, manager, reviewer, finance, hr, technician. Login creates an HttpOnly SameSite=Strict cookie scoped to the configured airport. All fetches use credentials. POST `/api/auth/logout` invalidates the session. Demo accounts and password are intentionally published for this local prototype; production identity integration is a deployment requirement. X-Demo-User and as_user do not authorize requests. All errors use `{detail:string}`.

* GET `/session` -> `{current_user, users, airport, reference_date, demo:true}`.
* GET `/dashboard` -> `{stats:{documents,pending,expiring,approved},recent_documents,attention,activity,departments}`.
* GET `/documents?q=&category=&status=&department=&limit=100&offset=0` -> `{items:Document[],total}`.
* GET `/documents/{id}` -> Document with `versions`, `audit`, `workflow`.
* GET `/documents/{id}/file?download=false` -> authorized PDF bytes.
* POST `/documents` multipart: `file`, `title` optional, `category` default Contract, `department` default Achiziții, `supplier` optional, `expires_at` optional -> Document (201).
* PATCH `/documents/{id}` -> `{title?,category?,department?,supplier?,expires_at?,value?,metadata?,summary?,confidentiality?}`. Material edits create version and clear approvals.
* POST `/documents/{id}/versions` multipart `file`, `comment` optional -> new draft version.
* POST `/documents/{id}/actions` JSON `{action:'submit'|'validate'|'approve'|'reject'|'archive'|'sign',comment?:string}` -> Document. Reviewer/admin approval; validation confirms metadata; reject requires reason.
* GET `/documents/{id}/verify` -> `{integrity, signed, signer?, version, sha256, trust:'demo-certificate'|'unsigned'}`.
* GET `/contracts` -> `{items:Document[],total}`; each item has contract_status and days_remaining.
* GET `/tasks` -> `{items:[{id,document_id,title,department,assignee,status,priority,due_date,type}],total}`.
* GET `/audit` -> `{items:[{id,actor,action,document_id,document_title,created_at,detail}],total}`.
* POST `/assistant` JSON `{question}` -> `{answer,sources:[{id,title,number,page,excerpt}],mode:'validated-records',reference_date}`.
* GET `/people` -> `{items:User[],total,departments}`; POST `/people/delegations` JSON `{from_user,to_user,starts_at,ends_at,reason}`.
* GET `/shares` -> `{items:Share[],total}`.
* POST `/documents/{id}/share-preview` JSON `{redact_terms:string[]}` -> `{preview_id,file_url,redactions,sha256,source_version}`. Actual removed PDF text, generated derivative.
* POST `/documents/{id}/shares` JSON `{recipient_airport:'Aeroportul Carpați',expires_at:'2026-12-01',preview_id,reviewed:true}` -> Share.
* POST `/shares/{id}/revoke` -> Share. GET `/shares/{id}/file` checks authorization, expiry, revocation and source version each time.
* GET `/reports/register.csv` authorized register export.

Document fields: `id,title,number,category,department,status,created_at,updated_at,expires_at,supplier,value,currency,owner,confidentiality,tags:string[],summary,filename,related_ids:string[],metadata:object,source_refs:array,version:number,validated:boolean,file_url,days_remaining,contract_status`. Canonical statuses `draft,in_review,approved,signed,archived`. All dates ISO. `workflow` is `{steps:[{label,status,actor?,at?}],current_step}`.

## Supplier review extension

Reviews persist `service_date`, `invoice_currency`, `registry_revision` and `contract_snapshot` (value, currency, effective/expiry dates, validation and status). Historical missing values remain null. Supplier `registry_revision` increases atomically with trusted bank changes.

Only director and finance roles access `/api/supplier-reviews`. Initial supplier bank/contact records are explicitly fictional, previously verified demo fixtures. Uploaded metadata never automatically becomes a trusted bank record.

* GET `/supplier-reviews` -> `{items,total,suppliers,counters,notice}`. Supplier choices require an approved/signed source with validated fields.
* POST `/supplier-reviews` -> `{document_id?,supplier_name?,observed_iban,sender_email,invoice_amount?,service_date?,message}`. Deduplicates identical imported samples. Rules distinguish changed IBAN, invalid checksum, lookalike or unknown sender, unknown supplier, unapproved source, exceeded contract ceiling and out-of-period service. No mailbox connection, payment execution or external payment blocking.
* POST `/supplier-reviews/{id}/verify` -> `{contact_used,note}` (note ≥10 chars). Contact must match the existing known contact; the user attests to an independent check.
* POST `/supplier-reviews/{id}/approve` -> `{comment}`. Requires an authorized person different from the verifier, unchanged source version, unchanged prior bank registry and no unresolved price/service/source issues. Preserves bank history.
* POST `/supplier-reviews/{id}/reject` -> `{comment}` (nonempty).

Case status: `clear`, `needs_review`, `verified`, `approved`, `rejected`. `clear` means the implemented comparison rules found no discrepancy; it is not a fraud verdict or payment authorization. A checksum is format verification, never ownership verification. RO format and MOD97 basis: [SWIFT registry](https://www.swift.com/sites/default/files/files/iban-registry-v101.pdf), [BNR Regulation 2/2004, Annex 2](https://legislatie.just.ro/Public/DetaliiDocumentAfis/50006).

Document detail now includes `permissions:{can_edit,can_review,can_sign,can_share}`. Access classification fields (`category`,`department`,`confidentiality`) cannot change through ordinary PATCH; this preserves all historical-version access. GET `/reports/register.csv?category=Contract` exports the contracts view only. Search uses private extracted-text FTS5 with Romanian diacritics normalized; hyphenated identifiers are exact phrases.

## Persistent assigned work

`GET /tasks?status=pending|completed|cancelled|all&mine=true` lists persistent, version-specific tasks within the caller's document permissions. Types are `validation`, `approval`, `signature`. Default procurement review belongs to the named department manager; a currently valid scoped delegate can review in their own identity. Signing authority never follows delegation.

Each task includes `document_version`, `assigned_to`, display `assignee`, `principal_name`, `effective_assignee` user ID, `delegated_from`, `due_date`, `overdue`, `assignment_state` (`assigned`, `delegated`, `needs_reassignment`), `can_act`, `can_reassign`, `history`, and `eligible_assignees` for authorized coordinators. GET `/tasks/{id}` returns the same record.

* POST `/tasks/{id}/assign` -> `{assigned_to,due_date?,comment,version}`. Reason ≥3 non-whitespace characters, exact current document version and eligible active recipient required. No automatic approval or transfer to a new version.
* POST `/tasks/{id}/comments` -> `{comment,version}`. Assigned actors or authorized coordinators only; notes remain attributable and version-bound.

Document detail exposes `workflow.task` and permissions `can_validate`, `can_submit`, `can_review`, `can_sign`. New document/file/metadata versions cancel pending older-version tasks. Deactivation leaves assigned work visibly awaiting reassignment, records the event and never silently completes it. Administrative role alone does not convey business approval/signing authority.
Supplier reviews now expose persisted checks (passed/failed/not_checked/not_applicable) and live freshness (current/stale/unrecorded). Verify/approve recheck freshness atomically; missing legacy context requires a new review. Sender email syntax is validated locally; demo domains remain accepted. Currency mismatch is blocking and does not trigger implicit conversion.
GET /supplier-reviews/{id} includes actors and accessible rechecks. GET /supplier-reviews/registry/{supplier_id} exposes bank history with actors. POST review accepts previous_review_id, enforces predecessor access/supplier identity, and includes lineage in deduplication.
GET /supplier-reviews accepts q,status,risk_level,created_from,created_to,limit (1..100, default25),offset. total is filtered/access-controlled; counters cover all accessible cases. GET /supplier-reviews/export.csv uses identical filters without pagination and neutralizes CSV formulas.
Supplier catalog: GET /suppliers, GET/PATCH /suppliers/{id}, GET/POST /suppliers/{id}/contracts. Director-only profile edits use registry_revision and required comment, preserve identity/bank/contact, and reject extra fields. Supplier choices include contracts and optional tax_id; reviews accept supplier_id and require an associated matching contract. Legacy registry detail remains an alias. Seed preserves existing IDs, histories and suspension.
Supplier onboarding: GET/POST /supplier-registrations, GET /{id}, POST /{id}/verify|approve|reject. Creation stores an immutable registration payload (legal name/CUI/address/category, proposed IBAN/contact, approved contract version and 1..10 evidence references). Verification records contact_used/method/contacted_person/note. Approval by another person revalidates every source and atomically creates a unique-CUI supplier and contract link. Rejected/stale evidence never promotes trust.

Supplier responsibility: POST /supplier-reviews/{id}/assign accepts `{assigned_to,due_date,comment,assignment_revision}`. Only a director can assign an open case to an active finance/director colleague at the same airport with access to its source. The expected assignment revision prevents concurrent overwrite; a verifier is ineligible for the next approval assignment. Detail includes eligible_assignees only for directors, plus assignment history, due date, revision, assignment_state and overdue. `mine=true` on the review list/export filters by assigned user. Assignment grants no decision authority. Deadlines use the demo reference_date; only open cases can be overdue. Deactivation requires explicit reassignment and does not resolve the case.

Every supplier response filters bank-history source_case_id/source_registration_id by current source permissions, including all registration evidence. Inaccessible predecessor IDs serialize as null. Name-only review creation resolves only suppliers with an accessible linked contract; otherwise it records an unknown supplier with no trusted bank/contact disclosure. Catalog migration preserves existing explicit source links before inferring any unambiguous seed-only associations; other uploaded contracts require director association.


## Employee management

HR/admin: POST `/people` JSON `{first_name,middle_name?,last_name,email,department_id,job_title,manager_id?,access_profile:employee|technician}` -> `{user,temporary_password?,invitation_status?,provisioning_error?}` (201). First and last names are required; middle name defaults to an empty string. Name parts are persisted separately and combined as `name` for display (maximum 150 characters). The onboarding form's **Generează emailul** button suggests `<first-name initial>.<surname>@arm.ro`, lowercase, without diacritics; surname spaces become hyphens. Middle names do not affect the suggestion. HR may edit the suggestion or enter an address directly. The API requires a valid email, normalizes it to lowercase and rejects duplicate addresses within the airport with 409. A provider failure returns the saved inactive employee with `provisioning_status:failed`; retry POST `/people/{id}/provision`. Temporary credentials are returned once and never stored as plaintext.

HR/admin: PATCH `/people/{id}/profile` accepts `{first_name?,middle_name?,last_name?,department_id?,job_title?,manager_id?}` only. Name edits retain omitted parts and recompute the display name; use `middle_name:""` to clear the optional middle name. Supplied names cannot be null; first and last names cannot be blank. Coordinators must be active, distinct employees in the selected department; cycles are rejected. Transfers clear the old coordinator and reporting links outside the new department; an explicitly supplied new coordinator is validated against the new department. PATCH `/people/{id}` accepts `{active}`; POST `/people/{id}/sync-identity` retries provider enabled-state synchronization. POST `/people/{id}/activation-instructions` resends activation email or generates replacement initial credentials. Account/profile endpoints reject permission-role fields. Email is a normalized unique airport identifier and is not editable through this profile endpoint, including after a name change.

Credential resets for accounts with administrative, director, HR, finance, reviewer, head, or signer authority require the `admin` role. Restricted document ownership is checked through stable employee IDs, not display names.

GET `/people` additionally returns `department_records:[{id,name,head_user_id,head_name,revision,job_titles}]`, `can_create_users`, `can_propose_heads`, `can_manage_signing`, `can_view_appointments`, `auth_mode`. The function dropdown uses each department's position catalog together with existing employee positions. Positions remain display data and do not grant department-head or signing permissions. People include `first_name,middle_name,last_name,department_id,is_department_head,provisioning_status,identity_sync_pending,login_username`.

HR/admin: POST `/people/appointments` `{department_id,user_id,effective_date,reason}`. HR/admin/director: GET `/people/appointments` -> `{items}`. Independent director: POST `/people/appointments/{id}/decision` `{action:approve|reject,comment?}`; rejection requires a reason. States: pending, approved (scheduled), active, superseded, rejected, cancelled. Dates follow the application's reference date.

Director: POST `/people/{id}/signing-authority` `{enabled,reason}`. Self-modification is forbidden. Head appointments and signing grants remain independent. Replacement/revocation flags existing tasks for explicit reassignment.
