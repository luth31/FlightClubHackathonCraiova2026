# FlyLeaf

Built by **Flight Club**. The product name is **FlyLeaf**; the existing logo is retained until its replacement is ready.

For an existing installation, follow [the branding upgrade notes](docs/BRANDING_UPGRADE.md) to preserve database volumes and identity links. The published fixture password below applies to fresh installations; existing identity-provider passwords remain unchanged.

For architecture diagrams, feature explanations, implementation details, the data model and setup instructions, see the [complete project documentation](docs/PROJECT_DOCUMENTATION.md).

A Romanian airport workspace for documents, contracts, people, assigned approvals, supplier verification and controlled collaboration. React/Vite/TypeScript frontend; feature-based FastAPI backend; SQLAlchemy, Alembic and SQLite FTS5; Keycloak login; real embedded PDF signatures with demonstration certificates.

**148 researched, explicitly fictional PDFs** are included: 20 connected procurement cases, maintenance and reception evidence, invoices, amendments, HR, training, procedures and audit records. The archive has 316 pages. See [research and inventory](docs/CORPUS_RESEARCH.md).

**Luna redaction studio:** interactive word/phrase selection, individual or repeated occurrences, undo, source/copy comparison and optional OpenAI suggestions with reviewed legal references. Set `OPENAI_API_KEY` in the ignored root `.env` file to enable `gpt-6-luna`; manual editing works without it. See [setup, behavior and verification](docs/LUNA_REDACTION.md).

**Partner coordination:** **Colaborare → Cereri** connects a request, its replies, reviewed document copies and its resolution in one place. The configured partner and authorized audience are selected automatically. Visible, signed-in sessions synchronize incoming requests across the two independent airport databases; the navigation badge counts open incoming requests. Document access still requires explicit review and a sharing grant. See [delivery, permissions and API](docs/PARTNER_COORDINATION_API.md).

**Airport operations:** open **Operațiuni la sol** for an interactive shift, a grouped multi-day ledger, twelve complete SOP working templates and on-demand Luna optimization proposals. Recommendations cite real ledger events, produce reviewable PDFs, and reach partner sharing through director/Conformitate authority. See [SOP library and optimization](docs/SOP_OPTIMIZATION.md). iPhone NFC card links log attendance into the same persistent gate/boarding/departure simulation; completed outcomes update KPIs here and on the home page. Leave requests automatically create versioned PDFs. Live ADSB.lol aircraft are geographically positioned in a separate map mode. Local development and presentation both support Google 3D streaming using `GOOGLE_MAPS_API_KEY` in the ignored root `.env`; bundled OSM geometry remains available without a key. See [the five-minute demo and iPhone setup](docs/OPERATIONS_DEMO.md), [operations details](docs/AIRPORT_OPERATIONS.md), and [API contract](docs/OPERATIONS_API.md).

## Run the two-airport demonstration

Requirements: Docker Desktop, and either the installed backend environment or `uv` for the one-time certificate generator.

```sh
git clone git@github.com:luth31/FlightClubHackathonCraiova2026.git
cd FlightClubHackathonCraiova2026
./scripts/start-demo.sh
```

On an existing Craiova/Sibiu checkout, run `./scripts/start-demo.sh` from the repository root. An installation still using the previous airport names must first run `backend/.venv/bin/python scripts/migrate_airports.py` once; it copies the existing volumes and preserves account IDs, passwords and stored document versions. All application code, migrations, dependency lockfiles, Keycloak realm/theme configuration, Docker configuration, 148 source PDFs, seed manifests and generation scripts are included. The launcher creates fresh local gateway credentials; application databases, PDF signing keys and sessions are created on first use. Existing machine-specific runtime data and private keys are not needed to reproduce the features.

A fresh installation seeds the Craiova corpus and the fixture accounts in both airports. Approval actions, signed uploads, supplier changes and sharing grants shown in the verification record were created during testing; follow the demonstration steps below to recreate them. Sibiu's received list starts empty until a document is explicitly shared.

- Craiova: <http://127.0.0.1:8080>
- Sibiu: <http://127.0.0.1:8081>

For private HTTPS access from other devices, follow [the Tailscale Service setup](docs/TAILSCALE.md). It includes exact service names, ports, policy, environment values and commands for this tailnet.

Each airport has its own database, document volume, signing keystore, Keycloak instance, realm, users and session cookies. Sibiu intentionally starts with an empty local archive; it receives only explicitly shared Craiova copies and can upload its own local documents. The gateway network contains only gateways. Neither gateway mounts a document, database, identity or signing-key volume. Only the application and identity web entry points bind to loopback; identity uses ports 8180 and 8181.

Docker uses real Keycloak authorization-code login with PKCE, state, nonce and strict token validation. Local application roles and active-account checks remain authoritative. Sign in with a fixture account from the table below and password `FlyLeaf2026!`. The local password-switching endpoint is disabled in this mode. Logging out clears the application session and opens Keycloak's sign-out confirmation. See [identity configuration and trust boundaries](docs/OIDC.md).

Gateway certificates are generated locally under ignored `.runtime/exchange/`. They use mutual TLS and a demo CA. Independent connector secrets authenticate the local application-to-gateway boundary. Exchange requests are read-only, recipient-scoped, version-specific and checked for revocation, expiry and file integrity at the source. A downloaded copy cannot be recalled.

## Develop locally

For live UI and backend updates inside the two-airport Docker environment, use the development override from the repository root:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

The first run builds a Vite development image. Afterwards, edits to `frontend/src`, `frontend/public`, the frontend configuration and `backend/app` are mounted directly into both airports: Vite updates the browser and Uvicorn reloads Python changes. The URLs stay at ports 8080 and 8081, with the same Keycloak instances and persistent data volumes. Vite uses polling for reliable Docker Desktop file detection on Windows; backend reload uses Uvicorn's built-in polling.

Repeat that command after dependency or Dockerfile changes. After adding or editing database migrations, restart both APIs with `docker compose -f compose.yaml -f compose.dev.yaml restart craiova-api sibiu-api`. Use the same two `-f` arguments for subsequent development Compose commands. Return to the static demonstration images with `docker compose -f compose.yaml up -d --build`; `scripts/start-demo.sh` also starts that static mode.

Requirements: Node 24 (matching Docker; `.nvmrc` is included), Python 3.12 and optionally `uv`.

```sh
./scripts/dev.sh
```

This creates/updates `backend/.venv`, installs frontend dependencies if needed, migrates the database, seeds the corpus and starts the API on port 8000 and Vite on port 5173. Local data persists in `.runtime/`. Use <http://localhost:5173> if running the Docker demo simultaneously; cookies are scoped by hostname and airport, not by port. The local development instance has no exchange gateway configured by default.

Local development uses a convenient **demo account selector**; Docker uses the separate Keycloak realms. Both modes enforce server-side opaque sessions, active-account checks and role checks. These public fixture credentials and Keycloak's development configuration are not a production identity deployment:

| Account | Authority |
|---|---|
| `admin` / Ana Ionescu | Explicit director, reviewer, final signer and account-administrator roles; no general HR-file access |
| `manager` / Mihai Dumitrescu | Procurement reviewer, with an approved absence |
| `reviewer` / Elena Popa | Compliance reviewer and time-limited procurement delegate |
| `finance` / Radu Marinescu | Finance reviewer |
| `hr` / Ioana Stancu | Personnel records and leave decisions |
| `technician` / Andrei Neagu | Permitted technical records and own uploads |
| `technical-head` / Sorin Pavel | Technical and operations head; department approvals, without automatic signing authority |

All fixture passwords are `FlyLeaf2026!`. Never deploy these accounts with real airport data. Demo reference date: **30 October 2026**, displayed in the application and used for deadlines/delegations; actual audit timestamps remain actual timestamps.

Four departments report to the director, with role-specific menus and record permissions. See [organization, access matrix and existing-realm upgrade](docs/DEMO_ACCESS.md). Existing realms receive the missing technical-head account through the launcher, with an initial temporary password displayed once.

## Demonstrate the complete flow

In **Documente → Flux achiziții**, follow the document cards and arrows across purchasing, delivery/service, inventory reception and invoice verification. Each case has its own diagram, with amendments shown as dashed branches from their contracts. Select a procurement case or reuse the search, category and approval filters; open any card to inspect the original document. Classification follows document type rather than approval progress, and all counts respect the active user's access. Other document families remain available in **Registru**.

1. Search `scari` to find **Scări pasageri mobile SP-02**, including matches inside PDF text. Open its invoice, reception and service report from the linked case file.
2. Upload `data/pdfs/doc-001.pdf`. Compare suggested supplier, value and expiry with the source; correct them, validate and submit.
3. Sign in as Elena, the manager's authorized delegate. Approve the exact assigned version. Sign in as Ana to explicitly sign it and verify the embedded signature. A changed version requires fresh validation and approval. Coordinators can explicitly reassign eligible tasks with a due date and reason; deactivation leaves outstanding work flagged for reassignment.
4. Open contracts and their deadlines; ask FlyLeaf about the register. Counts come from structured records and answers identify their sources.
5. From Sibiu, open **Colaborare → Cereri** and request a procedure with a short context. Keep both signed-in sessions visible. Craiova receives an incoming-request badge automatically. Open the request and reply with **Adaugă un document → Pregătește o copie**. In the redaction studio, select text manually or review Luna suggestions, inspect each derivative page, confirm the configured recipient and expiry, and authorize the copy. Send the reply explicitly. At Sibiu, open the attached PDF and mark the request resolved; Craiova receives the status automatically. Standalone grants remain in **Documente trimise / Documente primite**. Revoking the grant prevents subsequent source access, including from the conversation.
6. Inspect the audit trail, team directory, leave workflow and scoped delegation. Switch to the technician to demonstrate restricted access.
7. In **Furnizori**, compare a sample request with the verified fictional registry. A changed IBAN remains under review even from a known sender. Record verification through the known contact, then sign in as another authorized employee to approve the change. Bank history is preserved; no money moves.

An outage demonstration is reversible:

```sh
docker compose stop craiova-gateway sibiu-gateway
# Local documents/people still work; remote access reports unavailable.
docker compose start craiova-gateway sibiu-gateway
```

## Verify and regenerate

```sh
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run lint
node --experimental-strip-types --test frontend/tests/flow-graph.test.mjs frontend/tests/flow-label.test.mjs
npm --prefix frontend test
backend/.venv/bin/python scripts/generate_corpus.py
```

Tests use separate temporary databases and files. The PDF generator is deterministic and does not reset application data. It uses ReportLab and pypdf, with Arial on macOS or DejaVu Sans on Linux. Corpus PDFs already copied into document-version storage are immutable: regenerating the source corpus does not change approved application versions.

Python direct dependencies live in `backend/requirements.txt`; the cross-platform, fully pinned `backend/requirements.lock` includes package hashes and is used for development and Docker installation. The frontend uses `npm ci` and its lockfile. See [verification evidence](docs/VERIFICATION.md) for the recorded quality gate.

Feature changes must follow the [navigation contract](docs/NAVIGATION.md): document visits retain their originating section and list state, and new entry points require interaction regression coverage.

The procurement flow includes three additional fictional dossiers (22 PDFs): split deliveries with a rejected receipt and return, two service reports consolidated into one receipt, and advance/final invoicing. Regenerate their files with `python scripts/generate_procurement_scenarios.py` using the backend environment. `data/procurement-scenarios.json` is seeded alongside the base corpus on startup; existing document IDs, edits and versions are preserved. The flow navigator opens one dossier at a time. Explicit `metadata.flow_links` record each input's `source_id`, `kind` (`flow`, `reference`, `related`, `correction`) and optional label; an empty list identifies a root. Documents without that field retain the legacy relationship inference. Only visible documents in the same dossier can be connected.

The current coordination flow is browser-tested through Chrome DevTools on both airport instances, including a 390 px mobile viewport. Fonts are bundled locally. All displayed document totals respect the active user's permissions; sensitive HR records remain restricted.

## Repository map

| Location | Purpose |
|---|---|
| `frontend/src/app` | Application shell, routing state and styling |
| `frontend/src/features` | Documents, contracts, assigned approvals, suppliers, people, sharing, assistant and audit |
| `backend/app` | Feature routers, schemas, models and services |
| `backend/alembic` | Versioned database migrations |
| `backend/tests` | Permission, workflow, signing, concurrency and exchange regressions |
| `data/pdfs` | Synthetic PDF corpus |
| `data/seed-manifest.json` | Document metadata, relations and source evidence |
| `deploy` and `compose.yaml` | Two independent airport environments and mutual-TLS gateways |

## Prototype boundaries

This is a working demonstration foundation. Keycloak runs in development mode with fixture users, a file database and loopback HTTP; production requires hardened identity infrastructure, TLS and provisioning. Separate employee records without logins and HR editing are not implemented. Contracts are document-backed registers with related case files; separate obligation/renewal entities and scheduled reminder delivery/escalation remain future work. Current reminders are derived in-app views.

Self-signed PDF certificates provide testable cryptographic integrity; they are not qualified electronic signatures. The general register assistant uses deterministic retrieval and structured queries. Optional Luna redaction advice uses OpenAI; metadata extraction remains rule-based. PDF text is now extracted locally in the background with per-page native/OCR routing and bundled Romanian/English models. Search, metadata rules, and the redaction studio reuse the stored text and word geometry; scans remain subject to human review. See [OCR research and measured results](docs/OCR_RESEARCH.md). There is no real banking, email, e-Factura, operational airport or airline integration. Supplier contact verification records a human attestation; it does not itself prove account ownership.

Coordination currently uses one configured partner and director/Conformitate access. Synchronization runs while an authorized app session is visible; there is no unattended worker or email/push notification. Delivery acknowledgement means persisted by the partner application, not read by a person. Automatic partner discovery, local SOP adaptation, measured effectiveness and pilot comparisons remain future work. SOP analysis now includes affected and unaffected observed event groups with visible coverage; this is contextual evidence, not proof of causality.

Production work includes identity/MFA policies and provider revocation integration, independent security review, malware scanning and isolated PDF processing, backups and recovery objectives, organizational records retention, qualified signing integration where required, production monitoring and approved data protection arrangements. “Archived” is a workflow label, not a claim of legally compliant archiving. The audit table is application-controlled, not an independently immutable archive.

### Local text extraction

Uploads queue background processing automatically. Open **Vezi textul extras** in document details to inspect each page; OCR pages are marked for review. Existing documents are indexed on first startup after the migration. No OpenAI key or network connection is needed for parsing/OCR. Both language models, their license, the queue migration, and all pinned dependencies are included in this repository.
