# AeroDesk local demo API

Base `/api`. Authenticate with POST `/api/auth/login` JSON `{user_id:'admin',password:'AeroDesk2026!'}`. Demonstration accounts: admin, manager, reviewer, finance, hr, technician. Login creates an HttpOnly SameSite=Strict cookie scoped to the configured airport. All fetches use credentials. POST `/api/auth/logout` invalidates the session. Demo accounts and password are intentionally published for this local prototype; production identity integration is a deployment requirement. X-Demo-User and as_user do not authorize requests. All errors use `{detail:string}`.

* GET `/session` -> `{current_user, users, airport, reference_date, demo:true}`.
* GET `/dashboard` -> `{stats:{documents,pending,expiring,approved},recent_documents,attention,activity,departments}`.
* GET `/documents?q=&category=&status=&department=&limit=100&offset=0` -> `{items:Document[],total}`.
* GET `/documents/{id}` -> Document with `versions`, `audit`, `workflow`.
* GET `/documents/{id}/file?download=false` -> authorized PDF bytes.
* POST `/documents` multipart: `file`, `title` optional, `category` default Contract, `department` default Achiziții, `supplier` optional, `expires_at` optional -> Document (201).
* PATCH `/documents/{id}` -> `{title?,category?,department?,supplier?,expires_at?,value?,metadata?,summary?,confidentiality?}`. Material edits create version and clear approvals. Signed/archived documents reject edits with 409.
* POST `/documents/{id}/versions` multipart `file`, `comment` optional -> new draft version. Signed/archived documents reject replacement uploads with 409; preserve the document and register modifications separately.
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

Only director and finance roles access `/api/supplier-reviews`. Initial supplier bank/contact records are explicitly fictional, previously verified demo fixtures. Uploaded metadata never automatically becomes a trusted bank record.

* GET `/supplier-reviews` -> `{items,total,suppliers,counters,notice}`. Supplier choices require an approved/signed source with validated fields.
* POST `/supplier-reviews` -> `{document_id?,supplier_name?,observed_iban,sender_email,invoice_amount?,service_date?,message}`. Deduplicates identical imported samples. Rules distinguish changed IBAN, invalid checksum, lookalike or unknown sender, unknown supplier, unapproved source, exceeded contract ceiling and out-of-period service. No mailbox connection, payment execution or external payment blocking.
* POST `/supplier-reviews/{id}/verify` -> `{contact_used,note}` (note ≥10 chars). Contact must match the existing known contact; the user attests to an independent check.
* POST `/supplier-reviews/{id}/approve` -> `{comment}`. Requires an authorized person different from the verifier, unchanged source version, unchanged prior bank registry and no unresolved price/service/source issues. Preserves bank history.
* POST `/supplier-reviews/{id}/reject` -> `{comment}` (nonempty).

Case status: `clear`, `needs_review`, `verified`, `approved`, `rejected`. `clear` means the implemented comparison rules found no discrepancy; it is not a fraud verdict or payment authorization. A checksum is format verification, never ownership verification. RO format and MOD97 basis: [SWIFT registry](https://www.swift.com/sites/default/files/files/iban-registry-v101.pdf), [BNR Regulation 2/2004, Annex 2](https://legislatie.just.ro/Public/DetaliiDocumentAfis/50006).

Document detail now includes `permissions:{can_edit,can_review,can_sign,can_share}`. Access classification fields (`category`,`department`,`confidentiality`) cannot change through ordinary PATCH; this preserves all historical-version access. GET `/reports/register.csv?category=Contract` exports the contracts view only. Search uses private extracted-text FTS5 with Romanian diacritics normalized; hyphenated identifiers are exact phrases.

Signed/archived document detail reports `can_edit`, `can_validate`, and `can_submit` as false. Historical files remain readable under the existing access rules. Register metadata corrections do not change PDF content or legally amend a contract. Post-signing metadata corrections remain a separate unimplemented workflow; amendment drafting is described below.

## Amendment drafts

Amendment proposals are separate saved forms linked to an existing Contract and its exact document version. PDF generation produces a separate proposed-addendum document for review. Saving or generating does not change the original contract's fields, files, versions, approval evidence or tasks. Neither action executes an amendment or applies proposed terms to the base contract. Proposal creation, editing and PDF generation record attributable audit events.

* GET `/contracts/{contract_id}/amendment-drafts` -> `{items,total}`. Readers of the parent contract can consult its proposals.
* POST `/contracts/{contract_id}/amendment-drafts` -> draft (201). Required JSON fields: `source_version`, `title`, `reason`, `clause_reference`, `proposed_wording`. Optional: `current_wording` (defaults to empty text), `proposed_effective_date` (ISO date or null).
* PATCH `/contracts/{contract_id}/amendment-drafts/{draft_id}` -> draft. Send the complete form and its current `revision`; a successful change increments that revision. An unchanged save does not create another revision or audit event.
* POST `/contracts/{contract_id}/amendment-drafts/{draft_id}/generate-pdf` JSON `{revision}` -> updated draft (200). Generate from the current saved revision. Repeating the same generation while the PDF remains an unvalidated draft reuses the document and version.

Draft fields include `id`, `contract_id`, `contract_number`, `source_version`, the form fields, `status:'draft'`, `revision`, `created_by`, `created_by_name`, `created_at`, `updated_at`, `can_edit` and `source_changed`. Generated-PDF fields are `generated_document_id`, `generated_revision`, `generated_document_version`, `generated_document_status`, `pdf_outdated`, `can_generate_pdf`, `document_url` and `pdf_file_url` (links require document read access).

The parent must be validated and approved/signed for drafting. Authors must be directors or reviewers whose own department matches the contract's department. Approval-only delegation does not confer drafting authority. The parent document exposes `permissions.can_propose_amendment`, independently of its edit permission. Only the draft's author or a director can edit it while that drafting authority remains valid.

Required text is trimmed and validated: title 3–300 characters, reason 10–5,000, clause reference 3–200, proposed wording 10–10,000; current wording permits up to 10,000 characters. Unknown fields are rejected. Stale source versions or draft revisions return 409. A changed or archived source preserves readable proposals and disables editing; existing proposal wording is never silently rebound to a different contract version.

The generated PDF is an `Act adițional` document with its own version history and validation task. It inherits the source airport, department and confidentiality. It contains the proposed wording and date; the addendum's `value` and `expires_at` are unset, and no supplier bank fields are copied. Generation preserves the original contract. Romanian text uses an embedded Arial or DejaVu Sans font; the Docker API image installs DejaVu Sans.

Form corrections are allowed while its PDF remains an unvalidated draft. Saving new wording marks the old PDF as outdated; regeneration adds a new version to the same generated document and preserves earlier PDF bytes. Manual metadata edits and replacement uploads to generated documents return 409: edit the saved form and regenerate instead. Validating, submitting, approving and signing require the current form revision, generated document version and source contract version; outdated PDFs cannot advance. Once the PDF is validated or enters review, the form is read-only. A rejection returns the document for form correction and fresh generation. The existing assigned review/signing workflow applies to the generated document; it never automatically applies the addendum to its parent.

## Persistent assigned work

`GET /tasks?status=pending|completed|cancelled|all&mine=true` lists persistent, version-specific tasks within the caller's document permissions. Types are `validation`, `approval`, `signature`. Default procurement review belongs to the named department manager; a currently valid scoped delegate can review in their own identity. Signing authority never follows delegation.

Each task includes `document_version`, `assigned_to`, display `assignee`, `principal_name`, `effective_assignee` user ID, `delegated_from`, `due_date`, `overdue`, `assignment_state` (`assigned`, `delegated`, `needs_reassignment`), `can_act`, `can_reassign`, `history`, and `eligible_assignees` for authorized coordinators. GET `/tasks/{id}` returns the same record.

* POST `/tasks/{id}/assign` -> `{assigned_to,due_date?,comment,version}`. Reason ≥3 non-whitespace characters, exact current document version and eligible active recipient required. No automatic approval or transfer to a new version.
* POST `/tasks/{id}/comments` -> `{comment,version}`. Assigned actors or authorized coordinators only; notes remain attributable and version-bound.

Document detail exposes `workflow.task` and permissions `can_validate`, `can_submit`, `can_review`, `can_sign`. New document/file/metadata versions cancel pending older-version tasks. Deactivation leaves assigned work visibly awaiting reassignment, records the event and never silently completes it. Administrative role alone does not convey business approval/signing authority.
