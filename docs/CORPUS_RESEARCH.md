# AeroDesk: researched Romanian airport demonstration archive

Research date: 31 October 2026. Scenario reference date: **30 October 2026**.

The archive contains **148 original Romanian PDFs, 316 pages and 49,213 words**. It is designed to exercise a complete administrative document flow across procurement, maintenance, finance, compliance, people and controlled collaboration. It is not an official airport archive or a claim of regulatory completeness.

Every page says **Date fictive pentru demonstrație**. Aeroportul Dunărea, Aeroportul Carpați, suppliers, people, prices, dates and findings are fictional. No original airport contracts, personal data, operational access details, real bank accounts or real signatures are included. The documents are authored examples, not copies of published contracts.

## Research and source map

The supplied deliverables, their updated action plan, `docs/Aero Research.md` and `IDEAS.md` establish the product needs: version-bound approvals, absent-manager delegation, metadata with evidence, contract deadlines, linked maintenance records and a reviewed derivative before airport sharing. The current implementation brief takes precedence over the older flight-operations roadmap.

Public research informed the document **families and relationships**; the case content, values, workflows, dates and findings are our own scenario design. We do not encode procurement thresholds, determine a permitted procurement procedure, prescribe operational maintenance intervals or invent legally binding retention periods.

| Source | What it supports in this corpus | Boundary |
|---|---|---|
| [EASA, Easy Access Rules for Aerodromes, March 2026](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-1846) | Controlled manuals, record keeping, training and maintenance are distinct document families. | This is an administrative demo; no operating instructions or certification claim. |
| [AACR, PAC-AD-CADC, edition 1/2023](https://caa.ro/uploads/pages/2023.06.16%20D488-2013%20aprobare%20PAC-AD-CADC%20ed%201-2023.pdf) | Certification uses identifiable documentation and evidence. | No synthetic AACR certificate or authority seal is issued. Applicable certification basis must be confirmed with the actual airport. |
| [Romanian sector procurement law, Law 99/2016](https://legislatie.just.ro/Public/DetaliiDocument/200898) | Sector procurement provides the Romanian context for an airport purchasing dossier. | The corpus does not select a procedure, legal threshold or amendment route. |
| [ANAP, completing the need statement](https://achizitiipublice.gov.ro/workflows/view/212) | The need statement belongs to procurement preparation. | The six-document bundle is a demo flow, not an exhaustive statutory tender file. |
| [National Archives Law 16/1996](https://legislatie.just.ro/Public/DetaliiDocument/263510) | Inventory, transfer and retention classification are separately documented activities. | Actual retention rules require an approved organizational schedule; no automatic destruction. |
| [Labour Code, Law 53/2003](https://legislatie.just.ro/Public/DetaliiDocumentAfis/128646) | Leave administration is a separate personnel workflow. | No payroll, medical records or legal entitlement calculations are included. |
| [CN Aeroporturi București organizational rules](https://bucharestairports.ro/storage/2026/03/ROF-CNAB-Rev.20_1-Noiembrie-2024.pdf) | Maintenance responsibilities link infrastructure, equipment and documentation. | The fictional organization is not a copy of CNAB. |
| [Aerosimple Document Management](https://www.aerosimple.com/solutions/document-management) | Public product reference for search, metadata, versions, approvals, access and expiry alerts. | Vendor descriptions are not independently tested. We make no claim that competitors lack these functions. |

The EUR-Lex original regulation and GDPR pages returned an anti-bot interstitial during this research. Their contents were not relied on as retrieved evidence. EASA and official Romanian sources supplied the reviewed context. Source labels S01–S08 and URLs are also stored in `data/sources.json` and linked from each relevant PDF.

## Corpus inventory

| Document family | PDFs | Role in the flow |
|---|---:|---|
| Contract | 20 | Parties, scope, value, period, contact, fictional bank fixture and obligations |
| Need statement | 20 | Business reason, expected outcome, preparation and responsibility |
| Specification | 20 | Case-specific evidence and acceptance criteria |
| Invoice | 20 | Service period, contract link, base amount and reconciliation |
| Reception record | 20 | Accepted or reserved findings, owner and follow-up |
| Maintenance / service report | 20 | Activity, evidence and asset history |
| Proposed amendment | 4 | Version-controlled clarification with no automatic contract change |
| Controlled procedure / sharing template | 10 | Internal controls, archive, collaboration and an archived version |
| Audit / review case | 6 | Missing evidence, access test, renewal, changed account and possible duplicate |
| Personnel | 4 | Leave, temporary delegation, responsibilities and planning |
| Training | 4 | Participation, evidence, renewal and version acknowledgment |

Initial document states: 125 approved in the fictional scenario, 20 in review, 2 drafts and 1 archived. **Seed approval is a fictional workflow state, not a cryptographic signature.** A signature must be applied separately by the running application.

## Twenty connected case bundles

Each case contains a contract, need statement, specification, invoice, reception and service report. Links resolve in both directions through `related_ids`, and structured metadata holds the case and contract identifiers. The content differs by asset, service, business reason, acceptance evidence and findings.

| Case | Subject | Contract | Contract value, RON excluding tax | Expiry |
|---|---|---|---:|---|
| ACH-2026-001 | Scări pasageri mobile SP-02 | doc-001 | 86,400.00 | 2026-11-19 |
| ACH-2026-002 | Autospecială intervenție AS-04 | doc-007 | 142,800.00 | 2026-12-20 |
| ACH-2026-003 | Bandă de bagaje BB-01 | doc-013 | 126,000.00 | 2026-11-07 |
| ACH-2026-004 | Balizaj - stoc piese de schimb | doc-019 | 198,000.00 | 2027-01-29 |
| ACH-2026-005 | Echipament deszăpezire DZ-03 | doc-025 | 112,500.00 | 2026-12-03 |
| ACH-2026-006 | Climatizare terminal - zona publică | doc-031 | 96,000.00 | 2026-10-18 |
| ACH-2026-007 | Grup electrogen GE-02 | doc-037 | 74,000.00 | 2027-03-02 |
| ACH-2026-008 | UPS și arhivă digitală | doc-043 | 58,500.00 | 2026-12-11 |
| ACH-2026-009 | Servicii curățenie terminal | doc-049 | 324,000.00 | 2026-12-31 |
| ACH-2026-010 | Colectare deșeuri nepericuloase | doc-055 | 48,000.00 | 2027-04-28 |
| ACH-2026-011 | Monitorizare zgomot ambiental | doc-061 | 67,500.00 | 2027-01-13 |
| ACH-2026-012 | Control vegetație perimetrală | doc-067 | 92,000.00 | 2027-03-29 |
| ACH-2026-013 | Calibrare instrumente atelier | doc-073 | 36,400.00 | 2026-11-15 |
| ACH-2026-014 | Uși automate terminal | doc-079 | 45,500.00 | 2027-05-28 |
| ACH-2026-015 | Iluminat interior LED | doc-085 | 138,600.00 | 2027-07-31 |
| ACH-2026-016 | Consumabile atelier tehnic | doc-091 | 42,750.00 | 2027-02-12 |
| ACH-2026-017 | Instruire personal tehnic | doc-097 | 28,800.00 | 2026-12-01 |
| ACH-2026-018 | Digitizare arhivă contractuală | doc-103 | 81,000.00 | 2027-02-03 |
| ACH-2026-019 | Asigurare echipamente administrative | doc-109 | 52,000.00 | 2026-11-25 |
| ACH-2026-020 | Închiriere spațiu comercial C-04 | doc-115 | 156,000.00 | 2027-10-30 |

The SP-02 case is the primary demonstration path: `doc-001` contract, `doc-002` need statement, `doc-003` specification, `doc-004` invoice, `doc-005` reception and `doc-006` service report; `doc-121` is its proposed amendment. This supports upload, metadata comparison, review, signing, expiry and supplier checks around one coherent case.

Deliberate edge cases include an expired HVAC contract with a service date inside its valid period; incomplete delivery in the workshop-consumables case; a reception with reservations; a draft archive-digitization contract; an absent manager and limited delegation; an archived procedure; and a clean template proposed for sharing. These are synthetic fixtures, not evidence that any real airport had these problems.

## Metadata contract and privacy

`data/seed-manifest.json` contains `{schema_version, reference_date, airport, demo_label, sources, documents}`. Each document has its ID, number, title, category, department, workflow status, creation/expiry dates, supplier, value, currency, owner, confidentiality, tags, summary, filename, related IDs, workflow, metadata, source references, validation state, page count and SHA-256.

Contract field evidence identifies page 1 and the supplier, value and expiry passage. Owners use the application’s fictional seeded identities. Supplier contact addresses use `.example`. Bank fixtures use the fictional bank code `DEMO` with mathematically valid IBAN checksums, to test format checks without pretending they are real accounts. Checksum validity is explicitly separated from account ownership and authenticity. The fixtures must never be used for payments.

Finance, HR and training records with person-specific content are restricted. Technician-visible maintenance reports, receptions and technical procedures omit bank accounts and supplier email contacts from the PDF text. Their metadata includes shared case fields for consistency, so the API must still remove bank/contact metadata for restricted roles. The corpus does not substitute for server authorization tests.

All documents use A4, embedded Arial with Romanian diacritics, consistent green/stone styling, stable reference numbers, numbered pages and the demo footer on every page. The 20 contracts have three pages; other documents have two.

## Reproduction and quality evidence

Run `python scripts/generate_corpus.py` with Python packages `reportlab` and `pypdf`, and Arial on macOS or DejaVu Sans on Linux. The generator is deterministic, uses no network, and recreates only `data/pdfs/`, the seed manifest, sources and validation result. It does not reset application databases or uploads. Keep `data/corpus-validation.json` for actual generation checks.

Completed checks on all 148 PDFs: readable PDF structure, two-to-four page bounds, demo footer on every page, expected title/reference/airport text after whitespace normalization, no replacement glyphs, all related IDs resolve, SHA-256 recorded. Additional full-corpus checks inspect glyph bounds, IBAN checksum consistency and absence of bank/contact content from technician-visible PDFs.

Rendered and visually inspected all 20 pages of `doc-001`, `doc-004`, `doc-005`, `doc-031`, `doc-095`, `doc-121`, `doc-125`, `doc-137`, `doc-145`: no clipping, overlapping text, broken tables or missing Romanian diacritics observed. This covers the primary contract, invoice, reception, expired contract, reserved reception, amendment, procedure, HR request and sharing template. Representative PNG evidence is under `tmp/pdfs/corpus-qa/` and is not part of the operational corpus.

The archive exercises the core document platform. It intentionally does not attempt to invent an entire airport’s certified aerodrome manual, security programme, detailed emergency plan, live operational forms, statutory tender dossier or real e-Factura output. These require airport-owned source documents and specialist validation in a pilot.
