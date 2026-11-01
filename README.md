# FlyLeaf

**Built by Flight Club.** FlyLeaf connects airport documents, operational evidence and the people responsible for the next decision. A delay can be traced through the operations ledger, used to draft an improved SOP, reviewed through the document workflow and shared with another airport as a controlled copy.

The workspace includes searchable PDFs and local OCR, procurement dossiers, version-specific approvals and signatures, an auditable operations ledger, SOP recommendations with Luna, staff and supplier management, reports, and collaboration between independently managed airports.

## Start here

| What you need | Guide |
| --- | --- |
| Run the complete two-airport application | [Docker quick start](#docker-quick-start) |
| Work on one airport with Vite and FastAPI | [Native development](#native-development) |
| Understand the technologies and design choices | [Tech stack and concepts](docs/TECH_STACK_AND_CONCEPTS.md) |
| Find the code, data and dependencies for each module | [Module architecture](docs/MODULE_ARCHITECTURE.md) |
| Present the product | [Current product presentation and PDF](docs/presentation/README.md) |
| Review the product, business proposal and engineering evidence | [Reviewer guide](docs/review/README.md) |
| Reach the existing Docker installation over private HTTPS | [Optional Tailscale access](docs/TAILSCALE.md) |
| Explore the four-airport contact/message scenario | [Four-airport local setup](docs/PARTNER_COORDINATION_API.md#four-airport-local-demonstration) |

## Requirements

- **Git** and **Docker Desktop with Docker Compose v2** for the two-airport stack.
- **Python 3.12** or **uv** for the local certificate setup. Native development also needs Python dependencies.
- **Node.js 24** and npm for native development or frontend checks. `.nvmrc` specifies the version used by Docker.
- Bash for the `.sh` launchers: macOS, Linux or WSL2 on Windows. The separate four-airport launcher also has PowerShell scripts.

No OpenAI or Google key is required to start. The repository contains **170 synthetic source PDFs**: 148 in the base manifest and 22 additional procurement documents. They are deliberately fictional. Startup imports missing records and preserves existing edits and versions. The number visible in the UI depends on permissions and later uploads.

## Docker quick start

Run commands from the repository root:

```bash
git clone https://github.com/luth31/FlightClubHackathonCraiova2026.git
cd FlightClubHackathonCraiova2026
# On a fresh checkout only. Keep an existing .env.
cp .env.example .env
./scripts/start-demo.sh
```

Have `uv` on your PATH, or prepare `backend/.venv` using the native setup below first. The launcher creates local exchange certificates and connector secrets, builds the images, applies database migrations, seeds the records, waits for both identity services and synchronizes the organization. First startup is slower because it installs dependencies and indexes PDFs.

| Airport | Application | Identity service |
| --- | --- | --- |
| Craiova | http://127.0.0.1:8080 | http://127.0.0.1:8180 |
| Sibiu | http://127.0.0.1:8081 | http://127.0.0.1:8181 |

Choose **Conectează-te** and use a fixture account below. A fresh Keycloak realm imports usernames such as `admin`; an upgraded realm may retain its existing login names and passwords. The launcher does not reset them. See [identity configuration](docs/OIDC.md) and [branding upgrades](docs/BRANDING_UPGRADE.md) for existing installations.

Craiova starts with the document corpus. Sibiu starts with an empty local archive and receives only explicitly shared documents. Both airports have their own users, database, document storage and Keycloak realm. To demonstrate collaboration, each director enables participation in **Colaborare**, then an eligible director or appointed department head selects a connected airport and a named contact. See [the collaboration guide](docs/PARTNER_COORDINATION_API.md).

### Stop, restart and inspect

```bash
docker compose ps
docker compose logs --tail=60 craiova-api sibiu-api
curl --fail http://127.0.0.1:8080/api/health
curl --fail http://127.0.0.1:8081/api/health
docker compose stop
# Start the same containers and data again:
docker compose start
```

Persistent volumes hold each airport's database, documents, signing keys and identity data. `stop` preserves them. **Do not use `docker compose down -v` to upgrade or switch access methods:** it deletes those volumes. Back up the database and its matching document/keystore storage together before migrations. Older airport-name installations should follow [the upgrade guide](docs/BRANDING_UPGRADE.md), rather than creating replacement volumes.

### Docker with live code updates

After the initial setup:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

The same ports, Keycloak realms and volumes remain in use. Vite updates frontend edits and Uvicorn reloads backend edits. Use **both** `-f` arguments for subsequent commands in this mode. Restart the APIs after adding a migration:

```bash
docker compose -f compose.yaml -f compose.dev.yaml restart craiova-api sibiu-api
```

Repeat the build command after dependency or Dockerfile changes. Return to static images with `./scripts/start-demo.sh`.

## Native development

This is an independent single-airport workspace. It does not reuse the Docker database and does not need Tailscale or Keycloak.

```bash
# If using nvm:
nvm install
nvm use
# Optional: uv can install Python when it is not already available.
uv python install 3.12
./scripts/dev.sh
```

Without `uv`, install Python 3.12 on your PATH; the launcher uses `python3.12 -m venv` and pip instead. It creates `backend/.venv`, installs the hash-locked Python dependencies, runs migrations and starts both processes. It installs frontend dependencies when `frontend/node_modules` is missing. After a lockfile change, run `npm --prefix frontend ci` explicitly.

- Application: http://localhost:5173
- API health: http://127.0.0.1:8000/api/health
- API reference: http://127.0.0.1:8000/docs
- Database: `.runtime/flyleaf.db`
- Document versions, derivatives and keys: `.runtime/storage/`

Use `localhost:5173` when the Docker app is also open at `127.0.0.1`; cookies are scoped by hostname and airport, not port. The local login accepts the account name, unique email or local account ID and password. It does not require an external identity provider. Ctrl+C stops the launcher processes and preserves data.

To run each process yourself, first install dependencies with the launcher, then stop it. In the backend terminal:

```bash
export FLYLEAF_DATABASE_URL="sqlite:///$PWD/.runtime/flyleaf.db"
export FLYLEAF_STORAGE_DIR="$PWD/.runtime/storage"
export FLYLEAF_CORPUS_DIR="$PWD/data"
cd backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

In another terminal at the repository root:

```bash
npm --prefix frontend run dev -- --port 5173 --strictPort
```

Vite proxies `/api` to port 8000. Set `FLYLEAF_API_PROXY_TARGET` when using another backend port. Backend startup also checks migrations, seeds missing records and starts the local extraction worker.

## Accounts and access

Fresh fixture password: **`FlyLeaf2026!`**. These accounts are for local demonstration, not real airport data.

| Local ID / fresh Keycloak username | Craiova account | Useful starting point |
| --- | --- | --- |
| `admin` | Ana Ionescu | Director, final signer and account administration |
| `manager` | Mihai Dumitrescu | Procurement/finance head, with an approved absence |
| `reviewer` | Elena Popa | Compliance head and time-limited procurement delegate |
| `finance` | Radu Marinescu | Financial records and supplier verification |
| `hr` | Ioana Stancu | Personnel records and leave decisions |
| `technical-head` | Sorin Pavel | Technical/operations head and departmental approvals |
| `technician` | Andrei Neagu | Own tasks and permitted technical records |

Page visibility does not replace server authorization. Director status does not grant blanket access to personnel files. Signer authority, task assignment, current head appointments and delegation are checked separately. The [access guide](docs/DEMO_ACCESS.md) and [user management guide](docs/USER_MANAGEMENT.md) explain these rules. The four-airport fixture has [its own full-name account list](docs/demo/ACCOUNTS.md).

## Optional integrations

Keep secrets in the ignored root `.env`, never in frontend source or Git. Both native and Docker configurations read these keys; Tailscale does not need separate provider keys.

| Variable | Purpose | When absent |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server-side Luna requests for SOP analysis and redaction advice | Documents, OCR, manual redaction, ledger and reports still work |
| `FLYLEAF_OPENAI_MODEL` | Configured SOP/default model; repository default is `gpt-6-luna` | Uses the repository default; choose a model available to your API project |
| `FLYLEAF_OPENAI_REDACTION_MODEL` | Optional redaction-only override | Uses the default model |
| `GOOGLE_MAPS_API_KEY` | Optional Google photorealistic 3D map layer | Bundled airport geometry remains available |
| `FLYLEAF_CRAIOVA_PROVISIONING_SECRET`, `FLYLEAF_SIBIU_PROVISIONING_SECRET` | Backend Keycloak provisioning clients | Docker uses its local fixture configuration |

Restart/recreate the affected API after changing configuration. Luna runs on explicit actions, not every page visit. OCR runs locally with bundled Romanian and English models. Google tiles and live ADS-B need network access; the simulation does not. Google browser keys are visible by design: restrict them to the required API and your actual local/HTTPS origins. Details: [Luna redaction](docs/LUNA_REDACTION.md), [SOP analysis](docs/SOP_OPTIMIZATION.md), [map sources and request behavior](docs/AIRPORT_3D_SOURCES.md).

### Optional Tailscale entrance

Follow [TAILSCALE.md](docs/TAILSCALE.md) and use `./scripts/start-tailscale.sh` for the presentation deployment. It adds ports 18080/18081 to the **same `flyleaf` Docker project**, using each airport's existing API, DB, documents and realm. The two airports remain separate from one another. `.env.tailscale` supplies only the HTTPS origins; `.env` retains the shared keys. Native development stays unchanged. The launcher does not change your tailnet ACLs or tag your host.

## A useful product walkthrough

1. **Documente:** search PDF contents, open a source and explore **Flux achiziții**. Contracts are documents in this register, not a separate navigation section. Upload a PDF, review extracted metadata and submit its exact version for approval.
2. **Aprobări:** follow the assigned validation, approval and signature tasks. Use an authorized delegate when the original assignee is absent. Verify an embedded PDF signature.
3. **Operațiuni la sol:** inspect the current shift and **Registru**. Expand a flight, open an atomic event, then its gate, person or flight entity. Compare planned/actual times and parallel activities. **Echipă → Pontaj** exposes the NFC station; see [iPhone setup](docs/OPERATIONS_DEMO.md).
4. **Proceduri SOP / Strategii și optimizare:** inspect a procedure, request Luna analysis, follow cited evidence and create a reviewable SOP draft. Approval remains a separate human action.
5. **Colaborare:** find a participating airport and eligible contact. Prepare a document copy, review manual or Luna-assisted redactions, choose scope/expiry and authorize sharing. Attach the grant to a message and send it explicitly. The recipient can preview/download the permitted copy or export an editable Word copy for local adaptation.
6. **Rapoarte:** explore administrative and operations data, filter a chart and open its source records. Reports derive from the same records used elsewhere in the application.

The presentation and [speaker notes](docs/presentation/SPEAKER_NOTES_RO.md) organize this into a five-minute pitch with a short live demonstration.

## Checks and reproducibility

```bash
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Tests use temporary databases/files. Dependency sources are `backend/requirements.txt` and `frontend/package.json`; installations use the hash-pinned `backend/requirements.lock` and `frontend/package-lock.json`. After an intentional Python dependency change, regenerate the lock with:

```bash
uv pip compile backend/requirements.txt --universal --generate-hashes --output-file backend/requirements.lock
```

Source PDFs are already committed; **regeneration is not a setup step**. Optional corpus tooling and provenance live in [CORPUS_RESEARCH.md](docs/CORPUS_RESEARCH.md). Source regeneration does not replace immutable versions already imported into application storage.

| Problem | Check |
| --- | --- |
| Port already in use | Stop your earlier launcher or inspect `docker compose ps`; do not delete volumes |
| Docker build lacks exchange certificates | Run `start-demo.sh` with `uv` or `backend/.venv` available before raw Compose commands |
| Login fails on an older installation | Use its existing realm credentials; fixture passwords do not reset existing accounts |
| Native and Docker sessions interfere | Open native UI on `localhost`, Docker on `127.0.0.1` |
| Collaboration has no contacts | Both directors must opt in, the peer must be reachable, and the user must be a director or appointed main department head |
| Reports/strategy show no operational history | Open the operational ledger to initialize its existing domain fixtures; reports do not create their own data |
| OCR is still pending | Inspect extraction status and API logs; first startup processes the archive in the background |
| Luna unavailable | Check server-side key/model access; no key is needed for manual workflows |

## Repository map and scope

| Path | Contents |
| --- | --- |
| `frontend/src/app`, `features`, `services`, `components` | Shell, feature pages, navigation/API client and reusable UI |
| `backend/app` | FastAPI modules, domain services and persistence |
| `backend/alembic`, `backend/tests`, `frontend/tests` | Migrations and regression checks |
| `data` | Corpus manifests/PDFs, bundled OCR models and source evidence |
| `deploy`, `compose*.yaml`, `scripts` | Identity, web/gateway configuration and launch/generation tooling |
| `docs` | Architecture, feature contracts and presentation |

FlyLeaf is a working hackathon prototype, not a certified airport operations system. Flights, personnel and source documents are synthetic. Current operational state machines are inspired by A-CDM milestones; they are not an ATC integration. Luna proposes reviewable changes and does not automatically alter approved procedures or improve KPIs. PDF certificates demonstrate cryptographic integrity and are not qualified electronic signatures. Revocation blocks subsequent platform access but cannot recall downloaded files.

Before a real deployment, harden identity and secret management, approve data handling and retention, establish backups/monitoring, and validate workflows with the airport. Current collaboration synchronization is driven by visible authorized sessions/API reads, not an unattended messaging service. See [concepts and boundaries](docs/TECH_STACK_AND_CONCEPTS.md#current-boundaries) for the precise scope.
