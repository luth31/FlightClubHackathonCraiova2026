# AeroDesk verification record

Recorded **31 October 2026** against the local demonstration. This is evidence for the implemented prototype, not a production certification. The application uses 30 October 2026 as its displayed demonstration reference date; audit events use actual timestamps.

**Luna branch update:** `codex/luna-redaction-studio` adds interactive occurrence selection, source/copy comparison and a real OpenAI Responses integration. The expanded suite passes **99 tests**; lint/build pass. Live `gpt-6-luna` analysis was verified on the fictional corpus. The baseline record below describes the original release; [Luna verification and limits](LUNA_REDACTION.md) describes the additional capability, including the distinction between precise PDF targets and accessible text mode.

## Quality gate

| Check | Result |
|---|---|
| Backend regression suite | **84 passed**; temporary databases and file storage |
| Frontend TypeScript and production build | Passed |
| Frontend ESLint | Passed |
| Python dependency audit | No known vulnerabilities in the installed development environment or deployed Linux container at audit time |
| Frontend dependency audit | No known vulnerabilities at audit time |
| Database migration | Fresh install, legacy document preservation/indexing, populated upgrade and repeat upgrade passed; head `714af828c311` |
| Corpus | **148 PDFs, 316 pages, 49,213 words**; hashes, text, page bounds, Romanian glyphs, fictional labels and case links checked |
| Browser testing | Chrome DevTools MCP; actual forms, role changes, PDF previews and connected airport flows |
| Final deployed desktop home | Lighthouse accessibility **100**, best practices **100**; no console warnings/errors after reload |
| Additional browser checks | Library, document details, suppliers, approval tasks and identity screens; desktop and 390 px mobile checks, including modal interaction and horizontal overflow |
| Persistence | All eight Docker services restarted; sessions, completed tasks, signed file and received copy remained usable |

Lighthouse accessibility and best-practice scores cover the checked screens, not every possible application state. Performance was not measured by this audit. The private application deliberately blocks indexing; SEO and agent-discovery scores are not acceptance criteria. Automated dependency checks cannot establish that application logic is vulnerability-free.

## Document and approval flow

The final Docker demonstration used real Keycloak login throughout:

1. Ana (`admin`) uploaded the SP-02 contract PDF, checked extracted supplier/value/expiry evidence, validated its metadata and submitted version 1.
2. The approval was assigned to procurement manager Mihai. His active, scoped delegation made Elena (`reviewer`) the effective reviewer. Ana did not receive an approval control simply because she was director.
3. Elena approved the assigned version with a recorded comment. The final signature task went to Ana. Elena could not sign it.
4. Ana explicitly signed the PDF. Embedded signature verification returned integrity confirmed and identified the demonstration certificate.
5. After application image recreation and a complete stack restart, the signed bytes, verification result and three completed tasks persisted.

The retained example is **“Contract mentenanță SP-02 — circuit demonstrativ”**, document `doc-64921a2fe49b`, register number `AD-2026-959379`, version 1. Its signed file SHA-256 is:

```text
178c6002ecae51b90d2f7ed0134613a7b81013cccfd915639bf856ae107f02eb
```

Additional checks cover version replacement, stale approval prevention, rejection reasons, explicit task reassignment, assignment history, disabled assignees, expired delegation, signature authorization and file tampering. Cryptographic integrity is real; these self-signed certificates are **not qualified electronic signatures**.

## Permissions and identity

- The seeded corpus has 148 records. The director can read 137, HR can read 21 and the technician can read 28. Every visible PDF was downloaded successfully under the corresponding role; restricted HR records remain outside the director's general access.
- Search, counts, exports, assistant sources, file downloads and historical versions apply server-side access checks. Text search handles Romanian diacritics and exact asset identifiers.
- Docker uses separate Keycloak instances and realms. Authorization-code login uses PKCE S256, state, nonce, a browser-bound single-use transaction, strict signature/issuer/audience/time checks and pinned provider configuration. Provider claims do not grant local application roles.
- Local password login is disabled in OIDC mode and returned 403 in the running Docker application. Local deactivation blocks an existing app session on its next request.
- Logout cleared the app cookie, opened Keycloak's sign-out confirmation and allowed a fresh login as another fixture employee.
- Application and proxy logging were checked for authorization-code/token query leakage. Proxy access logs omit query strings; API access logging is disabled.

Provider-only account disablement does not revoke an already issued application session immediately. Sessions expire after 60 minutes; back-channel identity-provider revocation is not implemented. See [OIDC configuration](OIDC.md).

## Reviewed sharing between airports

The two airports have separate databases, files, signing keys and identities. Their gateways alone join the exchange network and authenticate each other with mutual TLS. Requests are authenticated and access is checked at the source on every read.

- An approved contract was redacted, visually reviewed across all three pages, shared, read from Carpați and revoked. The revoked remote file subsequently returned 403 and disappeared from the received list.
- The retained active example is the two-page **“Șablon partajabil - proces-verbal de recepție”**, source `doc-145`, grant `share-dcad0b0312f9`. A suggested name redaction was applied, both derivative pages were visually inspected and human review was explicitly confirmed.
- The active grant permits **Carpați → Conformitate** until 1 December 2026. Elena's Carpați account can list and open the reviewed copy. A Carpați director in Conducere cannot list or open it, even when attempting to supply forged requester headers. Recipient original-file access returned 404.
- Grant reads enforce version, expiry, revocation and file hash. Redaction removes text from the derivative rather than drawing an overlay; the original signature is not represented as a signature of the altered copy.
- With both gateways stopped, local document and people requests returned 200 while remote access failed closed with 503. Restarting the gateways restored access.
- After restarting all services, the active received copy still opened successfully.

A recipient can retain a previously downloaded file. Revocation controls subsequent platform access; it cannot recall an external copy.

## Suppliers, people and contracts

- Supplier review accepts unchanged fictional details, flags a changed IBAN even from a known sender and records reasoned discrepancies without declaring fraud.
- Known-contact verification and an independent second person's approval were exercised in the UI. Self-approval was blocked. Concurrent conflicting bank changes produced one success and one conflict, with one history entry. Stale registry/document baselines cannot authorize a change.
- IBANs use valid Romanian structure and checksum with a deliberately fictional bank code. Contact checks are employee attestations; no payment, bank lookup or email is performed.
- Leave decisions, date/department-scoped delegation, reassignment and offboarding boundaries are covered by the regression suite. Pending tasks are flagged for explicit reassignment after deactivation.
- Contract lists, category-filtered CSV export, deadlines and linked case documents were checked. Counts and assistant answers use structured, permission-filtered data.

## Corpus evidence

The corpus includes 20 procurement cases with contracts, needs statements, specifications, invoices, reception records and service reports, plus four amendments and 24 administrative/procedural records. Every page identifies the content as fictional demonstration material. Supplier identities, contact details, employees and bank details are synthetic.

All 148 documents ingested and persisted. Extracting supplier, amount and expiry from the 20 controlled contract templates produced **60/60 expected fields**. This measures the generated fixtures only and is not a claim about arbitrary real-world documents. Twenty representative rendered pages were also visually inspected.

The generator is deterministic and does not reset application data. Regeneration leaves already-stored immutable versions unchanged. See [research, official sources and inventory](CORPUS_RESEARCH.md), [source manifest](../data/sources.json) and [seed manifest](../data/seed-manifest.json).

## Reproduce the checks

Before publishing to `main`, a clean export of the staged repository was checked independently of local runtime files. All 84 backend tests passed; a fresh frontend dependency installation, lint and production build passed (also checked on Node 24). Fresh database migration and corpus seeding produced 148 documents, 137 visible to the director, and successful fixture login and PDF download. Gateway credential generation and Docker Compose configuration validation also passed. The export included every source PDF, migration, lockfile and deployment configuration; existing private keys, sessions and application databases were not required.

```sh
./scripts/start-demo.sh
backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit
docker compose ps
```

Run commands from the repository root. `scripts/dev.sh` prepares the Python/Node development dependencies if they are not installed. The test suite uses isolated temporary data and can run while the demonstration remains active. Audit snapshots and migration/corpus/supplier check outputs from this run are preserved locally under ignored `.runtime/`.

## Remaining scope

The first working quality gate is complete. This is a demonstration foundation, with these explicit limits:

- The assistant uses deterministic retrieval and structured queries, not an external language model. Extraction/redaction suggestions use PDF text and rules; OCR is not configured.
- Employees are currently seeded application users. Separate non-login employee records, an HR editor and a reporting-line editor remain future work.
- Contracts are document-backed registers. Separate obligation/renewal entities and scheduled reminder delivery/escalation remain future work; current reminders are calculated in-app views.
- Production identity/TLS, qualified-signature integration, malware scanning and isolated file processing, independent security review, tested recovery objectives, monitoring and organizational retention rules remain deployment work.
- The audit table is application-controlled. An “archived” workflow label does not establish legally compliant archiving.

See the [README](../README.md) for launch instructions, fixture accounts and the demonstration route.
