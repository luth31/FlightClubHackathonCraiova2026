# AeroDesk

For architecture diagrams, feature explanations, implementation details, the data model and setup instructions, see the [complete project documentation](docs/PROJECT_DOCUMENTATION.md).

A Romanian airport workspace for documents, contracts, people, assigned approvals, supplier verification and controlled collaboration. React/Vite/TypeScript frontend; feature-based FastAPI backend; SQLAlchemy, Alembic and SQLite FTS5; Keycloak login; real embedded PDF signatures with demonstration certificates.

**148 researched, explicitly fictional PDFs** are included: 20 connected procurement cases, maintenance and reception evidence, invoices, amendments, HR, training, procedures and audit records. The archive has 316 pages. See [research and inventory](docs/CORPUS_RESEARCH.md).

## Run the two-airport demonstration

Requirements: Docker Desktop, and either the installed backend environment or `uv` for the one-time certificate generator.

```sh
git clone git@github.com:luth31/FlightClubHackathonCraiova2026.git
cd FlightClubHackathonCraiova2026
./scripts/start-demo.sh
```

On an existing checkout, run just `./scripts/start-demo.sh` from the repository root. All application code, migrations, dependency lockfiles, Keycloak realm/theme configuration, Docker configuration, 148 source PDFs, seed manifests and generation scripts are included. The launcher creates fresh local gateway credentials; application databases, PDF signing keys and sessions are created on first use. Existing machine-specific runtime data and private keys are not needed to reproduce the features.

A fresh installation seeds the Dunărea corpus and the fixture accounts in both airports. Approval actions, signed uploads, supplier changes and sharing grants shown in the verification record were created during testing; follow the demonstration steps below to recreate them. Carpați's received list starts empty until a document is explicitly shared.

- Dunărea: <http://127.0.0.1:8080>
- Carpați: <http://127.0.0.1:8081>

Each airport has its own database, document volume, signing keystore, Keycloak instance, realm, users and session cookies. Carpați intentionally starts with an empty local archive; it receives only explicitly shared Dunărea copies and can upload its own local documents. The gateway network contains only gateways. Neither gateway mounts a document, database, identity or signing-key volume. Only the application and identity web entry points bind to loopback; identity uses ports 8180 and 8181.

Docker uses real Keycloak authorization-code login with PKCE, state, nonce and strict token validation. Local application roles and active-account checks remain authoritative. Sign in with a fixture account from the table below and password `AeroDesk2026!`. The local password-switching endpoint is disabled in this mode. Logging out clears the application session and opens Keycloak's sign-out confirmation. See [identity configuration and trust boundaries](docs/OIDC.md).

Gateway certificates are generated locally under ignored `.runtime/exchange/`. They use mutual TLS and a demo CA. Independent connector secrets authenticate the local application-to-gateway boundary. Exchange requests are read-only, recipient-scoped, version-specific and checked for revocation, expiry and file integrity at the source. A downloaded copy cannot be recalled.

## Develop locally

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

All fixture passwords are `AeroDesk2026!`. Never deploy these accounts with real airport data. Demo reference date: **30 October 2026**, displayed in the application and used for deadlines/delegations; actual audit timestamps remain actual timestamps.

## Demonstrate the complete flow

In **Documente → Flux achiziții**, follow the document cards and arrows across purchasing, delivery/service, inventory reception and invoice verification. Each case has its own diagram, with amendments shown as dashed branches from their contracts. Select a procurement case or reuse the search, category and approval filters; open any card to inspect the original document. Classification follows document type rather than approval progress, and all counts respect the active user's access. Other document families remain available in **Registru**.

1. Search `scari` to find **Scări pasageri mobile SP-02**, including matches inside PDF text. Open its invoice, reception and service report from the linked case file.
2. Upload `data/pdfs/doc-001.pdf`. Compare suggested supplier, value and expiry with the source; correct them, validate and submit.
3. Sign in as Elena, the manager's authorized delegate. Approve the exact assigned version. Sign in as Ana to explicitly sign it and verify the embedded signature. A changed version requires fresh validation and approval. Coordinators can explicitly reassign eligible tasks with a due date and reason; deactivation leaves outstanding work flagged for reassignment.
4. Open contracts and their deadlines; ask AeroDesk about the register. Counts come from structured records and answers identify their sources.
5. Share an approved procedure or contract. Use automatic redaction suggestions, adjust the terms, inspect the actual derivative PDF, choose Carpați and an optional recipient department, and confirm review. Open Carpați's **Partajate → Primite**. Revoke access at Dunărea and verify that Carpați can no longer open it.
6. Inspect the audit trail, team directory, leave workflow and scoped delegation. Switch to the technician to demonstrate restricted access.
7. In **Furnizori**, compare a sample request with the verified fictional registry. A changed IBAN remains under review even from a known sender. Record verification through the known contact, then sign in as another authorized employee to approve the change. Bank history is preserved; no money moves.

An outage demonstration is reversible:

```sh
docker compose stop dunarea-gateway carpati-gateway
# Local documents/people still work; remote access reports unavailable.
docker compose start dunarea-gateway carpati-gateway
```

## Verify and regenerate

```sh
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend run lint
node --experimental-strip-types --test frontend/tests/flow-graph.test.mjs frontend/tests/flow-label.test.mjs
backend/.venv/bin/python scripts/generate_corpus.py
```

Tests use separate temporary databases and files. The PDF generator is deterministic and does not reset application data. It uses ReportLab and pypdf, with Arial on macOS or DejaVu Sans on Linux. Corpus PDFs already copied into document-version storage are immutable: regenerating the source corpus does not change approved application versions.

Python direct dependencies live in `backend/requirements.txt`; the cross-platform, fully pinned `backend/requirements.lock` includes package hashes and is used for development and Docker installation. The frontend uses `npm ci` and its lockfile. See [verification evidence](docs/VERIFICATION.md) for the recorded quality gate.

The frontend is browser-tested through Chrome DevTools MCP. Fonts are bundled locally. All displayed document totals respect the active user's permissions; the director sees fewer than 148 records because sensitive HR records remain restricted.

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

Self-signed PDF certificates provide testable cryptographic integrity; they are not qualified electronic signatures. The assistant uses deterministic retrieval and structured queries, not an external language model. Metadata and redaction suggestions use text extraction/rules; scanned PDFs require manual metadata because OCR is not configured. There is no real banking, email, e-Factura, operational airport or airline integration. Supplier contact verification records a human attestation; it does not itself prove account ownership.

Production work includes identity/MFA policies and provider revocation integration, independent security review, malware scanning and isolated PDF processing, backups and recovery objectives, organizational records retention, qualified signing integration where required, production monitoring and approved data protection arrangements. “Archived” is a workflow label, not a claim of legally compliant archiving. The audit table is application-controlled, not an independently immutable archive.
