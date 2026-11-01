# FlyLeaf: tech stack and concepts

FlyLeaf is the product; **Flight Club** is the team. It is an airport workspace that connects documents, responsibility, operational events and collaboration. For installation, use the [README](../README.md). For code ownership and module dependencies, use [Module architecture](MODULE_ARCHITECTURE.md).

## Technology choices

| Layer | Technology in the repository | Why it is here |
| --- | --- | --- |
| Web application | React 19, TypeScript 5, Vite 7 | Feature-based UI, typed API data and fast local development |
| UI and visualization | CSS, Lucide, locally bundled DM Sans/Manrope, SVG charts, `react-organizational-chart` | Consistent workspace, source-linked reports and organization views without a separate BI service |
| Airport map | Three.js, `3d-tiles-renderer`, Leaflet | Aircraft/airport scene, optional Google tiles, airport directory maps and separate ADS-B mode |
| API | Python 3.12, FastAPI, Pydantic, Uvicorn | Validated requests, explicit domain services and an OpenAPI reference |
| Persistence | SQLAlchemy 2, Alembic, SQLite with FTS5 | Relational records, migrations and local full-text search; each airport owns its database |
| PDF/text processing | PyMuPDF, `pdf-inspector`, bundled Tesseract Romanian/English models, pypdf | Native text extraction, page-level OCR routing, word geometry, previews and content redaction |
| Document output | ReportLab, python-docx | Leave/SOP PDFs and editable exports of accessible PDF text/tables |
| PDF signatures | pyHanko, cryptography | Embedded signatures and integrity verification with local demonstration certificates |
| Identity | Keycloak OIDC, PKCE, PyJWT, opaque server-side sessions | Docker login and identity provisioning, followed by local account and permission checks |
| LLM assistance | Server-side OpenAI Responses adapter via HTTPX | Structured SOP proposals and contextual redaction suggestions, invoked explicitly |
| Deployment and exchange | Docker Compose, nginx, mutual TLS gateways | Independent airport environments with a narrow authenticated document/message exchange boundary |
| Optional remote access | Tailscale Services and an nginx overlay | Private HTTPS entrance to the existing Docker installation |
| Verification | pytest, Node's test runner, jsdom, TypeScript, ESLint | Domain/permission tests, migration checks, UI interactions and build validation |

Exact installed versions come from `backend/requirements.lock` and `frontend/package-lock.json`. The dependency manifests state the intended direct dependencies; the lockfiles are the installation contract. The configured LLM identifier is a deployment setting, not a guarantee that every API account has access to that model.

## The ideas behind the implementation

### A document is a record with evidence and responsibility

A PDF has a stable document ID, metadata, ownership, department, confidentiality and immutable file versions. Procurement diagrams connect related documents into a dossier. Contracts use the same document model; the retained contracts API supports portfolio and deadline views.

Extracted text and suggested metadata are evidence for a person to review. Validation, approval and signing are distinct actions, attached to the exact current version and assigned task. Uploading a newer version does not inherit approval for different bytes. Delegation is scoped and dated; it is not an unrestricted substitute login.

### Local OCR is different from LLM advice

The extraction queue inspects every PDF page and chooses native text or local OCR. Stored text and coordinates support search, metadata rules and word selection in the redaction studio. Scanned pages are marked for review. OCR does not send PDFs to a model.

Luna receives selected context only when an authorized person requests analysis. It returns structured suggestions, which the server validates. SOP analysis checks cited event/procedure IDs and keeps a snapshot of its inputs. Identical inputs can reuse the saved result; changed evidence makes it stale. Redaction advice uses the intended recipient and purpose. People decide what to apply. The general register assistant is a separate deterministic retrieval/query feature, not a second unconstrained LLM.

### Airport operations are concurrent state changes

The ledger separates planned milestones, observed facts and observations. An atomic operation changes one activity: for example, `fuel_started` moves fueling to active, while `fuel_ready` completes it. Cleaning, fueling and baggage handling can proceed in parallel. Dependencies require completion before aircraft readiness and departure.

Gates, flights, people, teams and work orders are independently inspectable entities with stable identities. A fact links participants, location, recorder, times and prerequisites. Immutable fact snapshots preserve what was known when indexed. Historic fixtures retain their provenance; a later import time is not presented as the original recording time.

This design takes inspiration from A-CDM turnaround milestones and AIDX flight information, without claiming to implement either complete standard. [Atomic ledger details and primary references](ATOMIC_OPERATIONS_LEDGER.md).

### KPIs explain the records behind them

Reports aggregate existing authorized documents, tasks, supplier cases, sharing grants and operations. They do not seed a parallel reporting dataset. Operational delay comes from observed completed movements; pending departures do not become successful on-time departures. Gate delay and departure delay are distinct measures and are not added as if they were separate flight delays.

Date filters, denominators and source rows matter as much as the chart. In the current implementation, operation periods follow the stored scenario dates, while administrative report deadlines can use the current Bucharest calendar date. Money remains grouped by currency. A cause recorded in a scenario is not proof of causality at a real airport.

### SOP improvement is a controlled document workflow

A Standard Operating Procedure states when work starts, who owns each step, the required evidence, exceptions and escalation. Twelve working templates provide a starting library. Luna analyzes selected affected and unaffected operational cases alongside relevant procedures and proposes amendments, assumptions and a pilot.

Creating a proposal produces a new reviewable document and assigned validation task. It does not silently replace an approved SOP. Adoption by another airport still requires local judgment and approval. Any claimed KPI improvement must be measured after adoption; a proposed target is not an achieved result.

### Collaboration preserves airport ownership

Each airport keeps its own database and documents. Collaboration is opt-in. Directors and currently appointed main department heads can contact eligible named people at configured partners. Conversations retain messages, attachments and decisions; personal mailbox states are local to each participant.

A message and a document grant are different things. Sending a message does not grant access to its source archive. Sharing creates an explicitly reviewed derivative with a recipient, version, expiry and revocation state. The source checks continuing access and integrity. A named conversation does not narrow the audience of an existing airport-wide document grant.

### Redaction creates a separate copy

The studio uses actual page/word geometry to select content. Manual choices or Luna suggestions lead to a derivative PDF for page-by-page review. The original stays intact. The reviewer explicitly authorizes sharing after inspecting the copy; a visual black overlay alone is not the intended protection. A downloaded copy can be exported to Word for local work, but the export uses that permitted PDF's content rather than hidden source data.

### Authentication and authority stay separate

Keycloak proves identity in Docker. The application maps that identity to an active local account and enforces role, department, task, appointment, delegation and record scope. Authentication alone does not authorize signing, HR access or partner contact. Native development uses local password authentication but still issues opaque sessions and applies server checks. Expired sessions return the UI to login.

## Current boundaries

- **Data:** the shipped PDF corpus, airport staff and operational histories are synthetic. ADS-B is a separately sourced external feed, not an airport operational integration.
- **Workflow:** SOP proposals need human approval. Automatic SOP rollout, proven causal optimization and measured airport savings are future work.
- **Messaging:** visible authorized clients/API reads drive peer synchronization. There is no unattended delivery worker, SMTP mail delivery or mobile push service.
- **NFC:** iPhone NDEF URLs open the attendance station. The current flow remains session/permission controlled; it is not a public unauthenticated clock-in callback or a native iOS app.
- **Signing/audit:** PDF certificates are demonstrative, not qualified signatures. Operational facts have update/delete protection and snapshot hashes; this is not an external notarized or administrator-proof archive. General business audit records are application-controlled.
- **Hosting:** Tailscale adds another entrance to the same per-airport Docker data. Native developer data remains independent. SQLite and development-mode identity settings are the supported showcase setup; changing the database URL alone is not a tested production migration.
- **Adoption:** production requires airport validation, hardened identity, data-handling agreements, monitoring, backups and recovery procedures. The product does not replace ATC or safety-authority systems.

These boundaries define what the showcase demonstrates today. The next useful pilot measures document retrieval time, approval turnaround, actions with attributable evidence and the factual quality of proposed SOP changes on a single airport workflow.
