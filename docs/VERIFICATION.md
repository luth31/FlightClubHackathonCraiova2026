# FlyLeaf verification record

Recorded **31 October 2026** against the local demonstration. This is evidence for the implemented prototype, not a production certification. The application uses 30 October 2026 as its displayed demonstration reference date; audit events use actual timestamps.

**Current updates:** the application includes real Luna suggestions, persisted local OCR, and a simplified redaction editor. The OCR release passed **111 backend tests**; the UI-only follow-up passed all **27 redaction/OCR/cache tests**, frontend lint and build. Live `gpt-6-luna` analysis was verified on fictional documents. The baseline record below describes the original release; dated sections at the end record subsequent checks. See [Luna behavior and limits](LUNA_REDACTION.md).

## Quality gate

### Four-department access model — 31 October 2026

The current demo uses director → department head → employee reporting across four departments. See [the access model](DEMO_ACCESS.md) for account scopes and existing-realm upgrades.

| Check | Result |
|---|---|
| Full backend suite | 223 passed; two dependency deprecation warnings |
| Full frontend suite | 62 passed |
| Production frontend build and ESLint | Passed |
| Headless Playwright, technician on ports 8080 and 8081 | Real Keycloak login; exactly four menu items; personal tasks load; forbidden sections render the permitted library without forbidden requests; section APIs return 403; HR records and current/historical files return 404 |
| Headless Playwright, directory and session | Four departments; technician reports to the technical head; colleague roles/provisioning fields are absent from the basic directory; OIDC session returns only the signed-in account |
| Headless Playwright, director and procurement | Four department cards below the director; no blanket HR file access; supplier catalog/details omit banking fields, history and controls; banking API returns 403 |
| Headless Playwright, 390 px viewport | Mobile menu and loaded task page work on both airports; no horizontal page overflow |
| Browser runtime | No page errors in these scenarios; screenshots inspected |

The two application stacks were rebuilt and refreshed with existing database and identity volumes. The missing technical-head account was created once in each existing realm; subsequent synchronization reported `existing` without resetting credentials. Password-change handoff for these new accounts remains an interactive first-login step. Historical/custom area heads, completed delegation boundaries and provisioning retries are covered by API regressions; these browser scenarios do not cover every workflow.

### Dedicated organigram follow-up — 31 October 2026

The hierarchy now has a dedicated **Echipă → Organigramă** tab, with active support staff outside the four functional departments and their actual coordinators. Viewing uses the existing authenticated directory access; editing and private data remain under existing management permissions.

The 62 frontend tests passed using a 256 MB Node heap and one test worker; TypeScript, ESLint and the production build passed. Independent review found no material issues. Headless Playwright tested the production bundle with a mocked API as technician and admin: four departments, every active fixture user, no duplicate support staff, no chart actions/private fields, preserved colleague search, no horizontal overflow at 390 px, and no page errors. Desktop/mobile screenshots were inspected.

The container refresh and live two-airport follow-up have not run: the current sandbox denies the Docker engine pipe, and the automatic escalation review service returned 404. The earlier live-airport evidence above applies to the prior deployed chart, not this new tab. The new source and production build are ready for deployment once Docker access is restored.

A subsequent authenticated read of the live Dunărea directory confirmed eight active users. Daniel Ilie Voicu is an active Asistent conducere, outside the four functional departments, reporting to Ana Ionescu. Headless Playwright rendered the production build using that live directory snapshot: all eight users appeared once, including Daniel with his correct coordinator, and the 390 px viewport had no horizontal page overflow or page errors. The named-user regression passed. The selected react-organizational-chart installation was not executed because automatic approval review failed with 404; integration of that library is still pending, and these results verify the existing renderer only.

### Connected library renderer — 31 October 2026

The user installed react-organizational-chart 2.2.1; its Tree/TreeNode components now render the dedicated organigram. The model exposes basic organizational fields, preserves every active user exactly once, places support users under actual coordinators and retains known department placement when a coordinator is unavailable. Missing leadership and reporting cycles no longer cause missing users or recursive rendering.

Fresh validation: **65 frontend tests passed**, TypeScript, production build, ESLint and whitespace checks passed. Independent review found an unavailable-coordinator placement issue; it was reproduced by a failing regression and fixed. Headless Playwright rendered the production build using a fresh authenticated live-directory snapshot: **8/8 active users**, four departments, Daniel directly below Ana Ionescu, the whole tree fitting at 1440 px, working keyboard/mobile panel scrolling at 390 px, no horizontal page overflow and no page errors. Screenshots were inspected.

The running Docker apps have not been refreshed: the current sandbox denies the Docker engine pipe. Rebuild/recreate the two web services to use this bundle: `docker compose up -d --build --no-deps dunarea-web carpati-web`. These new browser results validate the actual installed library and production build with live directory data, while deployment verification remains pending.

### Department-head proposal eligibility — 31 October 2026

The directory and PeoplePage incorrectly offered a head proposal to Daniel in Conducere with `department_id=null`. AuthorityDialog then posted null to the required string field, producing Pydantic's `string_type` validation response and a generic form error. The directory now requires a current functional department for eligibility, PeoplePage checks membership even with stale capability data, and the dialog independently blocks null/retired department IDs with an assignment prerequisite. Valid proposals send the matched department ID. Existing signing-authority and independent director approval behavior is preserved.

The issue was reproduced by one failing backend and three failing UI checks. Fresh validation passed: **50 affected backend tests**, **69 frontend tests**, TypeScript, production build and ESLint. Independent review found no material issues. Headless Playwright used the production build and a live-directory snapshot with a mocked proposal endpoint: Daniel has an actionable prerequisite and no invalid proposal button; an eligible candidate submits `dept-tehnic` as a string; mobile has no horizontal overflow or page errors. No live appointment or user record was changed during browser verification.

The current sandbox still prevents Docker refresh. To apply both the API eligibility and UI correction, rebuild/recreate `dunarea-api`, `carpati-api`, `dunarea-web`, and `carpati-web`.

### Commit preparation — 1 November 2026

The complete pending tree passed **224 backend tests** and **69 frontend tests**, TypeScript, the production frontend build, ESLint and whitespace checks. The backend run included OCR and database migration checks. Pytest's default temporary-directory setup was denied by the current sandbox; rerunning with a fresh `--basetemp` directory inside the workspace passed with two dependency deprecation warnings. These checks validate the source tree; the Docker deployment limitations above still apply. Deputy/acting-director appointments and authority remain outside the implemented department-head workflow.

### Original release

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

- An approved contract was redacted, visually reviewed across all three pages, shared, read from Sibiu and revoked. The revoked remote file subsequently returned 403 and disappeared from the received list.
- The retained active example is the two-page **“Șablon partajabil - proces-verbal de recepție”**, source `doc-145`, grant `share-dcad0b0312f9`. A suggested name redaction was applied, both derivative pages were visually inspected and human review was explicitly confirmed.
- The active grant permits **Sibiu → Conformitate** until 1 December 2026. Elena's Sibiu account can list and open the reviewed copy. A Sibiu director in Conducere cannot list or open it, even when attempting to supply forged requester headers. Recipient original-file access returned 404.
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
docker compose run --rm --no-deps -e FLYLEAF_AUTH_MODE=demo -e FLYLEAF_EXCHANGE_URL= -v "${PWD}/backend:/app/backend:ro" -v "${PWD}/deploy:/app/deploy:ro" craiova-api python -m pytest tests -q -p no:cacheprovider
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
| Combined frontend test gate (`npm --prefix frontend test`) | **35 passed**: 31 real-App DOM interaction tests and 4 existing supplier render checks |
| TypeScript and Vite production build | Passed |
| Frontend ESLint | Passed |
| `git diff --check` | Passed |
| Browser interaction/layout checks | **Not executed**: browser access host unavailable |

The DOM suite covers document entry points across sections, supplier query/tab/scroll retention, Back/Forward, related chains, breadcrumb and sidebar selection, all eight sidebar destinations and mobile drawer cleanup, modified anchor clicks, workflow links, overlays, safe origin/route fallbacks, account changes, keyboard focus and upload completion. API responses are fixtures at the fetch boundary; jsdom does not establish native layout, actual scroll limits, PDF behavior or browser accessibility. No backend code changed in this fix. Previous browser results in this file apply to their recorded versions.

A fresh code review found an Important late-upload callback that could overwrite navigation after dismissal, and a Minor stale return-focus reference when opening through the assistant. Both were reproduced by failing DOM checks and fixed. The final gate above includes delayed upload completion after cancellation, sidebar navigation, browser Back and account switching, plus successful active upload and assistant-focus regressions.

### Running frontend refresh

A follow-up screenshot still showed the old workspace return label. HTTP checks confirmed both running web containers served `/assets/index-Ja566dyO.js`, which contained `Înapoi la spațiul de lucru` and lacked the new origin/history handling. The source fix had not yet been deployed to those containers.

Both local web images were rebuilt and their containers recreated with `--no-deps`. Ports 8080 and 8081 now serve `/assets/index-bkVecpS9.js`, byte-for-byte matching the local production build; the old label is absent and the origin/history code is present. The targeted supplier interaction test also passes with an explicit **Înapoi la Furnizori** text assertion. [NAVIGATION.md](NAVIGATION.md) now includes the deployment check and instructions to reload and reopen from Furnizori when an existing document URL lacks origin metadata. These are served-asset and DOM checks; browser layout verification remains unavailable.

### Supplier registry empty despite counts

The next screenshot showed review-choice counts but an empty registry. Both running API schemas exposed only the older supplier-review routes; their images lacked `/api/suppliers` and `/api/supplier-registrations`. The frontend's independent catalog failure also shared an error variable with reviews, so a later successful review response erased it. The registry displayed an empty state while its catalog was still pending or had failed.

The catalog now owns its loading and error state, retains a retryable error across review responses, and supplies both registry counts. Review choices remain separate because they exclude ineligible suppliers. Two real-App DOM regressions reproduced the hidden error and premature empty state before the fix; they now pass, including retry and a catalog containing more suppliers than the review choices.

Fresh checks: **37 frontend tests passed** (33 DOM and 4 supplier render checks), production build and ESLint passed, and **150 backend tests passed** with the same two dependency deprecation warnings. A separate read-only code review reported no findings and independently passed the two new tests. `git diff --check` passed.

Both local API images were rebuilt. Each database was backed up inside its existing state volume before recreation; startup upgraded revision `714af828c311` to `20261031_supplier_ocr_merge`, and both APIs became healthy. Live OpenAPI checks confirm both catalog and registration routes. Read-only catalog serialization against the deployed databases under the local director account returned **20 suppliers and 15 review choices for Craiova**, with all registry-card fields present; Sibiu returned zero of each, consistent with its separate dataset.

Both web containers were also rebuilt and recreated. HTTP checks on ports 8080 and 8081 confirm `/assets/index-CprXs4Sz.js` matches the local production asset by SHA-256 and `/api/health` succeeds through each web proxy. Reload the browser before checking the registry. [NAVIGATION.md](NAVIGATION.md) now requires coordinated API deployment when frontend changes depend on new routes or migrations. Native browser interaction/layout verification remains unavailable; the live catalog checks above are read-only service/schema checks, not an authenticated browser session.

### Supplier registration UI — 31 October 2026

The registration action now sits beside the request-verification action in the supplier page header. The registration dialog uses an 800 px maximum width, padded sections for contract, supplier details and proposed account/contact, one scrolling form body and a persistent action footer. Approved evidence is an expandable list with a selection counter; selecting a contract still includes it automatically. The form retains its existing required fields, evidence limit and registration payload. Styles are scoped to this dialog, including selectors that take precedence over the later generic application stylesheet.

Fresh checks: **37 frontend tests passed**, TypeScript/Vite build and ESLint passed, and `git diff --check` passed. A read-only code review reported no findings after correcting stylesheet specificity. Browser visual, responsive and dark-mode checks were **not executed**: the browser host was unavailable and native Chrome access stopped because it could not establish the current URL confidently.

Both local web images were rebuilt and containers recreated with `--no-deps`. HTTP checks on ports 8080 and 8081 confirm `/assets/index-DYSi0FBw.js` and `/assets/index-D5IhUjBg.css` match the local build by SHA-256, and both `/api/health` responses return 200. Reload the browser to load the updated dialog. No backend changes were required.

### Supplier filter alignment — 31 October 2026

The supplier filter rules previously gave the checkbox the same stacked layout and input padding as date/select fields, while the generic checkbox stylesheet added vertical margins. The checkbox now has its own inline layout, centered contents and zero margins. Dropdowns, dates and export use a matching 44 px height; the filter row aligns controls at their bottom edges and wraps on narrow screens.

Fresh checks: **37 frontend tests passed**, build, ESLint and `git diff --check` passed. A one-off CSSOM check verified the scoped checkbox reset and control heights in the production stylesheet. jsdom's computed-style result did not honor the selectors' specificity against later generic checkbox rules, so it was not used as visual confirmation. Real browser layout verification remains unavailable.

Both frontend containers were refreshed. HTTP checks on ports 8080 and 8081 confirm `/assets/index-mcz764yY.js` and `/assets/index-Bx8Tc_JT.css` match the local build by SHA-256, and both API health endpoints return 200.

The follow-up replaces “Ale mele” with a button using `role="switch"` and `aria-checked`, a sliding thumb, green active state and visible keyboard focus. It preserves the `mine` filter and pagination reset, retains the 44 px target and disables animation for reduced motion. **37 frontend tests**, build, ESLint and `git diff --check` passed. Both refreshed local sites serve `/assets/index-C15wWWVB.js` and `/assets/index-AbmXpHjT.css`, matching the local build by SHA-256; health responses return 200. Browser visual verification remains unavailable.

## Interactive operations showcase — 1 November 2026

The operations-story change passed **307 backend tests and 105 frontend tests**, frontend lint and production build. Docker builds succeeded for both airports; the local Craiova/Sibiu APIs migrated and passed health checks with existing identity volumes retained. Existing seed PDFs were not regenerated. The only build notice remains the separately loaded 3D bundle size.

Chrome DevTools checks covered: actual ADS-B coordinates visible alongside the airport in regional framing; aircraft updates from the live provider; map wheel containment across canvas, aircraft labels, controls and overlay UI; 390px mobile station with no horizontal overflow; authenticated NFC URL selection and explicit confirmation; a shared browser/phone-view check-in at 08:22 followed by G1 opening, actual off-block 08:38, 18 min delay and matching ledger evidence; SOP draft creation and return navigation; and leave request→PDF→independent approval→immutable prior version. Review caught and fixed contradictory seeded staffing, missing downstream planned-time delays, misleading zero-minute exception badges, filtered KPI totals, evidence focus, and a retained mobile station hiding unrelated navigation.

The current synthetic history contains 93 groups and 998 events per airport before adding interactive events. Invariants enforce distinct assigned/reserve workers and attendance before gate opening. Current/rehearsal events remain separate from generated fixtures and from permission-filtered HR/document history. Actual iPhone NFC hardware and the final presentation network still require an on-device rehearsal; desktop mobile emulation does not establish tag compatibility.

## Workspace visual hierarchy — 1 November 2026

The previous map-cache work was checkpointed as `7371336` before this UI pass. The shared palette now uses dark navy text, teal actions and clearer status colors. Repeated introductions and marketing panels were removed; primary actions stay visible, while secondary administration, rehearsal controls, document summaries and audit details expand on demand. Operations follows the sequence current shift → operational ledger → SOPs. The document registry displays 20 records per page and the activity journal 25; search resets pagination, and document return navigation retains the library page.

Fresh validation passed **113 frontend tests**, ESLint, TypeScript, the production build and whitespace checks under Node 24. New interaction regressions cover document and audit pagination, filter resets, return navigation and empty/pending/error appointment panels. Independent review found a misleading delay-card subtitle, which was corrected. The existing large 3D bundle notice remains; no backend, environment configuration or corpus changes were needed for this UI pass.

Chrome DevTools checks covered the main workspace routes, document details, upload, sharing/redaction, assistant, people/organigram, operations controls and the mobile station at desktop and 390 px phone widths. Screenshots were inspected; checked pages had no horizontal body overflow. Sampled rendered-text contrast checks passed after correcting one map label; these checks are not a full accessibility certification. At 1440×799, the operations scene begins at 440 px, 118 px earlier than before the compact-header follow-up. Registry page 2 remained selected after opening and returning from a document. Browser checks did not submit personnel records, send shares or request AI analysis.

Both local web containers were rebuilt and recreated without restarting their API or identity services. Chrome verified the refreshed login on ports 8080 and 8081, both API health endpoints returned 200, and the served entry JavaScript and stylesheet matched the local production build by SHA-256. Authenticated workflow checks used the native development instance; production deployment verification covered served assets and login rendering.

## Draggable simulation timeline — 1 November 2026

The shift now has a one-second time slider, clickable event markers, previous/next-event buttons, historical/future-preview labels and an explicit action to apply a future time. Selected-flight markers include NFC scans for both assigned and substitute gate staff. Preview snapshots use the same event rules as the committed simulation, without writes or history deletion; stale run IDs and out-of-range times are rejected. The aircraft animation and map renderer are unchanged.

Validation passed **118 frontend tests**, **34 operations backend tests**, ESLint, TypeScript, production build and whitespace checks. Regressions cover immutable preview state, past NFC/gate/departure reconstruction, replay projection equivalence, interactive prerequisites, tenant isolation, stale runs, permissions, rapid cursor movement, single pause, explicit advancement and scene retention. Existing dependency deprecations and the large 3D bundle notice remain.

Chrome DevTools tested actual slider dragging, one-second arrow-key changes, event selection, future advancement and historical review on an isolated copy of the native development database. The 08:38 replay preview showed FL101 departing 18 minutes late; reviewing 08:22 restored the earlier staffing and KPI state while the committed clock remained at 08:38. The same canvas stayed mounted. Desktop and 390 px mobile layouts were inspected with no horizontal body overflow; the development browser had no console errors. QA used the bundled map model without Google imagery requests. Actual touch hardware was not tested.

Both local API and web services were rebuilt with existing volumes and identity services retained. Both APIs are healthy; Chrome confirmed the new entry bundle and timeline chunk on ports 8080/8081, health responses of 200, and authentication enforcement on the deployed timeline route. Development and presentation configuration files were unchanged.

### Playback after dragging — 1 November 2026

Two failing interaction regressions reproduced the reported defects: dragging disabled Play because the read-only preview's write permissions also governed playback controls, and reopening a persisted completed run placed the cursor at 09:00 with no usable restart. Playback now has its own local clock. Play/pause, next-event stepping and speed changes work from the inspected time without rewriting recorded events; NFC explicitly uses the actual shift state. A completed run opens its viewer at 08:00. A run that finishes while already open retains its final metrics and offers replay.

The complete **122-test frontend suite**, ESLint, TypeScript, production build and whitespace checks passed. Chrome DevTools verified a completed-run reload, actual dragging to 08:38, Play advancing the clock and aircraft position, Pause holding time, and replay from the end. The underlying recorded clock remained at 09:00. The 390 px layout retained working playback without horizontal overflow; no app console errors were observed. Both local web containers were refreshed and serve `index-hYbOKfvi.js`; both API health endpoints return 200. No animation renderer, backend or deployment configuration changes were required.
## Craiova aircraft placement — 1 November 2026

Reproduced the reported aircraft-in-vegetation view in Chrome DevTools while the timeline was paused. The configured northern stands lie inside the bundled OSM apron polygon, but on vegetation in Google's photorealistic mesh. The coordinate-transform difference measured less than 2 m at the stands, ruling out that transform as the source of the much larger displacement.

Moved all five illustrative Craiova stand positions onto the established southern apron and routed their connectors through its paved exit. Regression tests cover the parked aircraft footprint and every simulated second of each ground route, including arrivals and runway roll. **36 operations, ledger, traffic and geometry tests passed**. Chrome checks verified the three departure stands, both arrival stands, taxiway placement and the same apron in Model 3D. Both local API images were rebuilt and deployed; Craiova and Sibiu returned HTTP 200 health responses. No data migration, PDF regeneration or development-configuration change was required.

## Craiova occupied stand and parked heading — 1 November 2026

Measured the fixed aircraft in Google's mesh with Chrome DevTools screen raycasts. The previous pavement-only constraint missed that occupied space and the narrower visible western apron edge. All five demo stands now sit west of the fixed aircraft and face south toward the terminal. Simulated aircraft render at 62% scale (including the selection ring); ADS-B retains its previous size. Craiova departures push back north without reversing their nose heading, then continue the existing three-minute ground sequence. Paused timeline seeks snap to the inspected position rather than sweep across the apron.

**39 backend operations/geometry/ledger/traffic tests passed**. The full **125 frontend tests passed**, followed by a focused repeat of all 30 map/operations tests after final scale adjustment. Regression coverage includes the actual rendered mesh's clearance radius, parked footprint inside the visible apron, the fixed aircraft exclusion area throughout all ground routes, south-facing pushback, API-to-scene scale propagation, unchanged ADS-B scale, and seek versus playback behavior. Chrome verified all five parked aircraft together in top-down and oblique photorealistic views; four timeline seeks left zero horizontal interpolation travel to their target. The same positions and scale were checked in Model 3D. Temporary scene instrumentation was removed before building.

TypeScript, ESLint and the production Docker builds passed. Both local airports were updated and returned HTTP 200 health responses, serving the new `/assets/index-yMOzUsVO.js` entry. Existing operation history and deployment configuration were retained.

## Persistent aircraft camera lock — 1 November 2026

Replaced the map's one-shot “Urmărește aeronava” action with a persistent, shared follow toggle and visible callsign/lock indicator. The camera translates by the rendered aircraft displacement each frame, preserving the user's orbit, zoom and relative framing through taxiing, climb and timeline seeks. Explicit flight selection transfers the lock; the lock/badge, overview/Home, or Escape releases it. Traffic-source changes and disappearance of a tracked flight clear the lock. Both retained map styles receive the same follow state; stationary aircraft do not keep the render loop awake.

**128 frontend tests passed**, including camera translation/framing, stationary/unlocked behavior, explicit selection, style retention and disappearance. TypeScript and ESLint passed. Chrome DevTools verified constant selected-label screen coordinates throughout taxiing (08:39:40–08:40:48) and take-off/climb (08:41:17–08:41:53), plus zoom-preserving seeks in photorealistic mode. Overview, Escape, callsign-badge release and selection transfer were exercised. The 390 px mobile check found and corrected a caption overlap: the follow badge now sits below the toolbar, has a 40 px target and causes no horizontal overflow.

Both frontend production images built successfully and were deployed locally; both airport health endpoints returned HTTP 200 and served `/assets/index-BXbkv_Kd.js`.

## SOP library, Luna strategy engine and ledger readability — 1 November 2026

Implemented twelve original Romanian procedure templates with owners, prerequisites, ordered steps, records, escalation, measures, revision control and source references. Template and AI-proposed documents use the existing versioned PDF/task approval flow. New procedures join the local library on drafting. The catalog never asserts that a working template is an airport's approved manual.

Luna now analyzes persisted evidence/KPI snapshots on explicit request, validates event/SOP citations, calculates observed off-block delays without double counting, and persists results by tenant/fingerprint. Real `gpt-6-luna` calls returned staffing and equipment improvements with complete revised steps, evidence and concise pilots. One initial 45-second request timed out; the final strategy-specific limit is 120 seconds, with a dedicated 150-second nginx route in both deployments. A successful real request took approximately 63 seconds; unchanged inputs reuse the stored result. Existing redaction timeout and environment configuration remain unchanged.

**325 backend tests passed** across the full suite; **129 frontend tests passed**. After final display/order changes, the eight procedure-engine tests and operations UI suite passed again. TypeScript, ESLint, Vite production build and all four Docker image builds passed. Backend coverage includes complete template content, idempotent PDF drafting, actual-event-only evidence, metric denominators, duplicate delay prevention, response caching, same-snapshot concurrency, fabricated citations, new-SOP drafting, current approved PDF text, tenant isolation, approval-before-share, elevated sharing authority, ordinary staff reading approved internal SOPs, restricted SOP denial, partner file access and revocation. Existing role-scope tests were updated to assert the narrowly scoped approved-SOP reading exception.

Chrome DevTools verification used an isolated QA database and browser context. It covered the twelve-card library, searchable/domain-filtered layout, full procedure reader, real analysis, proposal-to-document creation, document approval and the direct **Partajează** redaction/review dialog. At desktop width, all current-flight time columns shared x=982 and gate columns x=1082. At 390 px, time x=67 and gate x=169 remained constant for completed flights and `+58`, `+56`, `+52 min` estimates; there was no horizontal overflow. Event titles render at 15 px and notes remain readable inline. The mobile procedure reader was also visually checked.

All twelve base PDFs rendered to 2–3 pages with no empty pages or out-of-margin text. Representative base documents and all five pages of a real Luna proposal were visually inspected; evidence labels and identifiers stay together across page breaks. PDF approval state is read from the controlled document register rather than a stale baked-in draft status.

Both local airport APIs and frontends were rebuilt and restarted. Health endpoints returned 200; both databases report migration `20261101_strategy_analysis`, and both web sites serve `/assets/index-ByPiSEOx.js`. The existing corpus PDF files were not regenerated.

### Integrated reporting and visible aircraft lock — 1 November 2026

Rebased the SOP work onto the reporting dashboard merged in `817a0ba`, without conflicts. The combined backend suite passed **349 tests**. With the documented Node 24 runtime, **149 frontend tests**, TypeScript, ESLint and the production build passed. An initial frontend run used the machine's older Node 23 binary, whose Windows-1252 decoder caused four label-repair failures; the supported runtime passes those tests without changing the application text utility.

The aircraft details now expose the persistent lock as **Urmărește / Urmărire activă**, replacing the ambiguous one-shot centering icon. Both controls share the same follow state; missing map positions disable the details control. Interaction tests exercise activation, release, transfer, style changes and disappearance through the actual details button.

Chrome DevTools verified the details control, transfer from FL404 to FL202, retention across both map styles, Escape release and the 390 px layout without horizontal overflow or console errors. During FL404 taxi playback from 08:17:00 to 08:18:21, four samples retained identical label coordinates (434 px, 191.567 px) while the simulation advanced. Browser checks used the isolated QA database; no presentation run was reset.

All four application Docker images were rebuilt and both airports updated with the combined features. Both health endpoints return 200, both databases retain `20261101_strategy_analysis`, both nginx configurations validate, and both web sites serve `/assets/index-DXprBc8e.js`. Development and Tailscale settings remain unchanged.

## Flight motion, live close-up and three-aircraft presentation — 1 November 2026

Reproduced 120× movement in Chrome DevTools and captured the actual rendered mesh positions. The old snapshot interpolation cut as far as 131.43 m off the configured route. The new renderer samples server-provided timed route vertices every animation frame, with a monotonic visual clock and bounded prediction during network gaps. A 210-sample replay including 75 ground samples stayed within floating-point rounding of the route through taxi, runway roll and climb. Heading turns use scenario time rather than a wall-time lag. Ground clearance is consistent across polling and terrain updates; pavement probes use the rendered position, avoid resampling the same cell on tile-detail changes, and settle smoothly during movement. Paused seeks update ground height directly. Severity changes recolor the existing mesh without resetting its position.

The scenario now contains FL101 (interactive G1/NFC delay), FL202 (automatic on-time 08:18 departure) and FL404 (normal 08:12 arrival, clear of the taxiway before FL202). The additional departure/arrival and scripted emergency were removed. Routine actions retain explicit scenario provenance in the ledger. Only G1 exposes manual gate actions; its missing attendance, substitute arrival and 18-minute delay chain remain intact. Routine G2 staff are not offered as available substitute operators. Existing history is preserved; start a new repetition when upgrading an old run.

Live refresh is five seconds normally and two seconds while locked, with one shared cache/request lock per airport, failure backoff and Retry-After handling. The real ADSB.lol request returned a fresh empty list during QA. An isolated browser-only fixture at 10,000 m verified the aircraft close-up: camera distance about 207 m, a clearly visible mesh, and locked fetch gaps of 2,007 and 2,002 ms. That fixture was removed afterwards and was never stored or deployed. Overview framing retains the full geographic view. Desktop and 390 px checks had no horizontal overflow or app console errors.

The full **353 backend tests** and **157 frontend tests** passed, as did TypeScript, ESLint and production builds. After the final ground/crew refinements, **43 focused backend** and **43 focused frontend** checks passed again. Tests cover route/API agreement for both airports, turn preservation at 1/30/60/120×, nonrewinding motion, climb continuity, close-up visibility at altitude, state-preserving recoloring, the three-aircraft causal story, automatic-flight controls, caching and throttling. All four application images were rebuilt and deployed locally; both health endpoints return 200 and both airports serve `/assets/index-Cu4gJs3w.js`. Deployment environment settings and the PDF corpus were unchanged.

## Partner coordination, evidence and presentation — 1 November 2026

Implemented a request/reply inbox across the two independent airport databases using the existing authenticated GET-only mutual-TLS gateway. A visible authorized session checks incoming requests every 25 seconds; an active conversation checks every 15 seconds. Requests choose the configured partner automatically and preserve the context, messages, reviewed document links, delivery acknowledgement and terminal status. Delivery means persistence at the partner, not human reading. No original document is shared automatically and there is no unattended notification worker.

Chrome DevTools verified the real Docker flow using separate signed-in browser contexts:

1. Sibiu created `request-sibiu-6ea970c79aee4b25a4337df710d01ee1`, requesting the document-control procedure with explicitly fictional context.
2. Craiova's home-page navigation badge appeared automatically. Opening the incoming request showed the original context.
3. Craiova prepared and reviewed a copy of approved `doc-125`, then explicitly sent the reply with grant `share-59ee49db4d76` attached. Typed reply text survived the document-review flow.
4. Sibiu received the response automatically and opened `/api/received/share-59ee49db4d76/file`: HTTP 200, `application/pdf`, 67,951 bytes and `%PDF-1.7` signature.
5. Sibiu marked the request resolved. Craiova subsequently showed the resolved status and removed the incoming-open-request badge. Both sides cleared pending-delivery indicators after acknowledgement.
6. At 390 px, document, body and main scroll widths were all 390 px; conversation paragraphs rendered at 16 px. The mobile conversation was visually inspected, and no application console errors were recorded in either browser context.

Two findings were corrected during integration: reviewed-share creation now refreshes the parent sent list immediately, and overlapping synchronization sessions refresh their cached cursor under the database write lock. The latter had caused a brief false-offline state; a deterministic two-session test reproduced it before the fix. After redeployment, eight concurrent real list/detail reads all returned connected/resolved with no sync error. The share-list regression verifies the new count and sent row before the reply is sent.

The home page now starts with actionable tasks and places indicators behind a disclosure. SOP explanations and pilot details use progressive disclosure. Register-assistant references explicitly identify validated metadata rather than inventing a PDF page; Chrome confirmed the new source labels. SOP evidence selection includes complete eligible sets from affected and unaffected observed groups, records coverage/omissions, excludes future observations, and incorporates the configured model into the analysis fingerprint. These are contextual comparisons, not matched controls or proof of causality; no live AI-quality improvement percentage was measured.

Final backend suite: **374 passed**, with seven existing dependency deprecation warnings. Full frontend suite before the final sent-list regression: **170 passed** under Node 24; the final focused coordination suite passed **12 tests**, with TypeScript, ESLint and production build passing. Four application Docker images were rebuilt and deployed; both APIs are healthy and the current frontend asset is `/assets/index-DxKlZgLN.js`. The additive migration is `20261101_partner_collaboration`; existing document versions, identity accounts and scenario history were preserved.

Presentation v2 contains seven main slides and one technical backup, an editable PPTX, a PDF, a Romanian four-minute speaker script and submission copy under `deliverables/submission/`. All slides were rendered and visually checked; the final collaboration/implementation slides were rechecked after the browser confirmation. Local SOP adaptation, pilot results and effectiveness evaluation are explicitly future work. The original deck and video remain preserved; the old video is not evidence of this newly added coordination flow.

## Shared Tailscale entrance and session expiry — 1 November 2026

The optional overlay now adds two web entrances to project `flyleaf`; Compose validation confirms unchanged local ports and identical state/identity volumes. Both origins use the existing API and realm per airport. The launcher accepts only HTTPS origin settings from `.env.tailscale`, so legacy provider-key overrides cannot change the shared API configuration. Existing passwords and account IDs are retained; four stopped-volume backups were made before registering the additional callbacks.

Validation: 75 backend identity, provisioning, security, people, deployment and migration checks; 40 document-flow checks (including the home expiry metric's replacement Documente destination); 196 frontend checks plus the new expiry-navigation regression. Production builds and ESLint pass. Chrome DevTools on an isolated native QA database confirmed `#contracts` opens Documente, contract documents remain accessible, a revoked session returns to login on the first protected 401 without repeated requests, and signing in restores the workspace. The running remote proxy returns the configured HTTPS Keycloak issuer and blocks other realms/admin endpoints. Real Keycloak discovery was checked for both local and remote issuers.

The local stack is healthy, and both remote upstreams are running on ports 18080/18081. Public Tailscale Service URLs were unreachable during this check, so remote browser login across the actual tailnet remains unverified; no tailnet tags, policy or Serve state were changed. Local browser login reached Keycloak, but existing account passwords differed from the public fixture passwords; they were not reset. Signed-token integration tests cover successful login and the shared account mapping for both origins.

Craiova started with 150 documents / 164 stored PDFs and now has 172 / 186 after importing the latest main branch's 22 procurement examples. Seven existing users remain. Sibiu remains at zero documents and seven users. No tracked PDF files were edited or regenerated by this change.
