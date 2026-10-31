# AeroDesk verification record

Recorded **31 October 2026** against the local demonstration. This is evidence for the implemented prototype, not a production certification. The application uses 30 October 2026 as its displayed demonstration reference date; audit events use actual timestamps.

**Current updates:** the application includes real Luna suggestions, persisted local OCR, and a simplified redaction editor. The OCR release passed **111 backend tests**; the UI-only follow-up passed all **27 redaction/OCR/cache tests**, frontend lint and build. Live `gpt-6-luna` analysis was verified on fictional documents. The baseline record below describes the original release; dated sections at the end record subsequent checks. See [Luna behavior and limits](LUNA_REDACTION.md).

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

- The general register assistant uses deterministic retrieval and structured queries. Optional Luna redaction advice uses OpenAI. Metadata rules and background native/OCR extraction run locally; OCR accuracy still requires human review.
- Employees are currently seeded application users. Separate non-login employee records, an HR editor and a reporting-line editor remain future work.
- Contracts are document-backed registers. Separate obligation/renewal entities and scheduled reminder delivery/escalation remain future work; current reminders are calculated in-app views.
- Production identity/TLS, qualified-signature integration, malware scanning and isolated file processing, independent security review, tested recovery objectives, monitoring and organizational retention rules remain deployment work.
- The audit table is application-controlled. An “archived” workflow label does not establish legally compliant archiving.

See the [README](../README.md) for launch instructions, fixture accounts and the demonstration route.


## Local document processing — 31 October 2026

- 111 backend tests passed (99 existing plus 12 OCR/cache/queue tests); TypeScript/Vite production build passed.
- Chrome DevTools on port 5173: generated and uploaded a scan-only PDF. Upload returned in 17 ms with queued status; the document panel updated automatically to ready. OCR populated supplier, 2027-05-12 expiry and 12500 RON, and full-text search found BrowserScanReference. Per-page extracted text is visible and marked OCR local.
- The API Docker image processed a scanned corpus page with `--network none`: 160 words in 508.78 ms. No separate system Tesseract installation or runtime model download was required on Linux arm64.
- Tests verify: no synchronous OCR on intake; real OCR + FTS; hash-cache reuse across documents/metadata versions; human and approved fields preserved; stale source version exclusion; expired lease recovery; visible failure/retry; original integrity; HR/technician access; 101-page extraction; mixed-page routing; real removal of image pixels and OCR-recognizable names from a derivative, with original bytes unchanged.
- See [OCR_RESEARCH.md](OCR_RESEARCH.md) for measured engine comparison, accuracy limitations, and reproducible benchmark.
- Both Compose airport APIs rebuilt, migrated existing volumes and became healthy. Chrome DevTools on port 8080 confirmed cached native text and 310 studio words for doc-145, with validated metadata unchanged and Luna available. The partner instance on port 8081 returned 404 for that document’s extraction endpoint. The OCR panel was checked at a 500 px viewport with no horizontal overflow.

## Simplified redaction UI — 31 October 2026

The editor now has one apply/restore control with adjacent occurrence-scope radios. Manual clicks, drag selection, search and Luna suggestions feed this panel. Luna, context settings, its summary and the marked-fragment list use collapsed disclosures. Page navigation and PDF/text view share the search toolbar; review/share is a distinct second step.

Chrome DevTools checks on a synthetic two-page PDF with four occurrences of “Elena Popa”:

- Dragging across the two words selected the phrase and automatically found all four occurrences. Single-occurrence apply hid two words; all-occurrence apply hid eight words across both pages. Undo restored the preceding two-word selection; restoring one occurrence and undoing restoration both worked.
- Desktop and true 390×844 mobile emulation: no horizontal overflow; both scope choices and the apply button were visible together. Original PDF positions and the accessible text view remain available.
- A delayed first search response could not replace a newer selection. Browsing a different page clears the old selection; occurrence navigation keeps the selected match and its page together.
- A real `gpt-6-luna` response returned two suggestions, labelled by page. Manual selection remained available while analysis ran. Suggestions made no automatic changes; selecting one exposed exactly one shared apply control and no separate apply button in the advice list.
- The actual preview request contained only `p1-w10` and `p1-w11`; the rendered derivative hid the first name while retaining its other occurrence. The original comparison showed the unchanged source. Sharing remained disabled until review was confirmed; returning to edit retained the two selected words.
- Tab and Shift+Tab wrapped within the dialog, skipping disabled/closed disclosure controls. PDF overlays do not create hundreds of Tab stops; search and Text selectabil provide keyboard access.
- Production build and ESLint passed. All 27 existing redaction/OCR/cache integration tests passed. No API contract, original-PDF mutation or publication behavior changed.
- Both Compose web images were rebuilt and recreated. After a fresh Keycloak login on port 8080, the deployed bundle displayed the new editor, loaded the PDF and found three occurrences for a clicked word in the single shared panel. No browser warnings/errors or horizontal overflow were observed. A new preview after returning to edit reset human-review confirmation and kept sharing disabled.

## Luna treats demo data as real — 31 October 2026

- Redaction instructions now treat every document and its entities as real, regardless of fictional/demo/test labels. Labels remain on source PDFs. Purpose, necessity and legal-reference checks still apply; fields are not automatically classified as personal or confidential.
- All 15 redaction integration tests passed. Both API images were rebuilt, recreated and became healthy.
- Chrome DevTools exercised a real `gpt-6-luna` call against the signed maintenance contract `doc-64921a2fe49b`, with the exact context “Destinatarul este curios de un model de contract de mentenanta.” The source retained fictional labels. The 200 response suggested the initiator's name, payment account and contact email based on the recipient's need for a model, without fictional-data exemptions or conditions about whether the person/data is real. It retained the distinction between unnecessary detail and an automatic legal redaction obligation. No redactions or shares were applied by this check.

## Luna suggestion scroll position — 31 October 2026

Removed the selection handler's unconditional scroll-to-top of the actions panel. Chrome DevTools replayed the previously captured real maintenance-contract analysis to isolate the UI behavior: before the fix, clicking a suggestion moved the right panel from 528 px to 0. Afterward, repeated clicks between the name, account and email kept each suggestion's viewport position within 0.5 px; native scroll anchoring accommodates changing selection-card height. The PDF independently changed pages/scrolled to the highlighted words. Production build and ESLint passed, and both Compose web instances were rebuilt and updated. The temporary response replay was removed after verification.

## Supplier improvements — 31 October 2026

The `suppliers-improvements` branch implements all seven tasks: persisted review context and checks, live reference freshness, history and linked rechecks, filtered pagination/CSV, supplier profiles and explicit contract links, independently approved initial registration, and assignments/deadlines. The API contract is documented in [backend/API_CONTRACT.md](../backend/API_CONTRACT.md).

Fresh verification after the seven feature commits and final review fixes:

| Check | Observed result |
|---|---|
| Full backend regression suite | **121 passed**, 2 dependency deprecation warnings |
| Supplier UI render regression checks | **4 passed** using Node's built-in test runner and React server rendering |
| Frontend TypeScript and production build | Passed |
| Frontend ESLint | Passed |
| Populated legacy migration and repeated upgrade | Passed; old IDs/history/decision retained, absent context remains null; explicit sources take precedence and other uploads are not auto-associated |
| Repeated supplier seed | Passed; existing identity/history retained |
| Concurrent registration approval | Passed; one CUI registration succeeds and the conflicting approval returns 409 |
| Desktop and 390 px UI interaction checks | **Not executed**: browser host unavailable and native Chrome access denied |

The regression suite uses temporary databases/files and covers stale source/registry references, distinct verifier/approver identities, accessible history/list/export/evidence boundaries, multiple contracts, ambiguous legal names with distinct CUIs, and assignment/offboarding behavior. Build/lint do not establish visual or interaction correctness. Earlier browser and Lighthouse results elsewhere in this document apply to the previous application version.

A fresh whole-branch code review identified five Important groups: history/predecessor source disclosure, hidden supplier resolution by name, inferred migration links, forms disappearing after errors, and missing lineage/onboarding navigation. Each was reproduced by a failing regression check and fixed; the full backend suite, four UI render checks, build and lint passed afterward. No Critical or Minor findings were reported. The UI checks assert rendered controls and navigation, and do not replace browser interaction testing.

Reproduce the current backend gate from the repository root in PowerShell (the deployment mount supplies the existing OIDC test fixtures):

```powershell
docker compose run --rm --no-deps -e AERODESK_AUTH_MODE=demo -e AERODESK_EXCHANGE_URL= -v "${PWD}/backend:/app/backend:ro" -v "${PWD}/deploy:/app/deploy:ro" dunarea-api python -m pytest tests -q -p no:cacheprovider
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend run test:suppliers
```

The features are local application controls: no mailbox integration, external payment execution, account-holder verification or cumulative invoice register was added. Review assignments do not extend decision authority. Deadlines use the configured demonstration reference date.

## Rebase integration — 31 October 2026

The supplier branch was rebased onto `77e5812`. Both the upstream OCR/Luna verification records and the supplier verification record were retained. The two independent migration histories shared parent `714af828c311`; merge revision `20261031_supplier_ocr_merge` joins `9b23d0c51a10` and `20261031_supplier_assign` without changing the existing revisions or performing additional schema/data operations.

After integrating branches with migrations, check `python -m alembic heads`: application startup uses `upgrade head` and requires a single head. Preserve applied migration histories and add a merge revision when independent branches meet. Test upgrade and repeated upgrade from each parent; the migration regression checks also preserve an existing completed OCR cache entry.

Fresh checks after integration:

| Check | Result |
|---|---|
| Full backend regression suite | **150 passed**, 2 dependency deprecation warnings; includes 4 migration checks |
| Supplier UI render checks | **4 passed** |
| Frontend production build and ESLint | Passed |
| Alembic heads | One: `20261031_supplier_ocr_merge` |

The API image was rebuilt from the committed dependency lock before testing to include the upstream `pdf-inspector` dependency. Backend checks used temporary databases and files; previous verification counts above remain historical records.

## Navigation regression fix — 31 October 2026

The `fix-navigation` branch fixes the document router's discarded origin and unconditional return to Documente. Supplier contracts now return to Furnizori with their existing list state. Documents opened from other sections and related-document chains retain their own origin, including direct links with `?from=...`. The shell retains its active workspace, reveals it before restoring scroll, selects the parent in the sidebar and provides a parent breadcrumb. Inactive workspace dialogs close and release their focus/scroll effects.

The original supplier return failure was reproduced by a failing DOM interaction test before implementation. Additional failing checks exposed retained-dialog scroll locks and missing focus transfer; each passed after its fix. The regression contract and browser checklist are in [NAVIGATION.md](NAVIGATION.md).

| Check | Observed result |
|---|---|
| Combined frontend test gate (`npm --prefix frontend test`) | **29 passed**: 25 real-App DOM interaction tests and 4 existing supplier render checks |
| TypeScript and Vite production build | Passed |
| Frontend ESLint | Passed |
| `git diff --check` | Passed |
| Browser interaction/layout checks | **Not executed**: browser access host unavailable |

The DOM suite covers document entry points across sections, supplier query/tab/scroll retention, Back/Forward, related chains, breadcrumb and sidebar selection, all eight sidebar destinations and mobile drawer cleanup, modified anchor clicks, workflow links, overlays, safe origin/route fallbacks, account changes and keyboard focus. API responses are fixtures at the fetch boundary; jsdom does not establish native layout, actual scroll limits, PDF behavior or browser accessibility. No backend code changed in this fix. Previous browser results in this file apply to their recorded versions.
