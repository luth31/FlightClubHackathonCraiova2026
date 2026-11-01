# Procurement workflows

The main document view follows **Ciornă → Verificare și aprobare → Semnare → Finalizat**, with the PDF beside extracted values, actions and activity. The document library offers **Registru** and **Dosare achiziții** directly; the earlier **Flux achiziții** view is hidden from navigation. Cases in **Documente → Dosare achiziții** use a guided **Pregătire → Achiziție → Recepție → Plată** view, with detailed controls under **Avansat**.

## Guided case view

Open a case to see its next action and required PDF cards. A new empty case starts with **Încarcă referat de necesitate**, followed by the caiet de sarcini. Contract and purchase order use separate cards; either one can satisfy the commitment step. The delivery card offers **Încarcă document**, **Alege document de livrare** and **Alege raport de servicii**. Each register action opens a searchable list filtered to that fixed type. A delivery upload asks for its type alongside the PDF. Uploading attaches the PDF to the case automatically with background extraction. No extracted fields are requested during upload. The existing document view opens for review; returning retains the selected case.

The guide suggests document relationships, the primary contract/order and remaining invoice coverage for explicit confirmation. If several documents could match, choose the corresponding document. Split allocations, replaced evidence, returns, credits and detailed payment history remain under **Avansat**. The payment step displays concise balances and records actual payments/refunds.

The four visible steps group the existing controlled case stages: Ciornă = Pregătire; În verificare = Achiziție; Angajat = Recepție; Recepționat/Facturat/Plătit = Plată. Paid cases display **Finalizat**. All approval, stage authority, financial, version and access checks remain in force.

## Built-in templates and uploaded PDFs

Upload only the PDF. The app extracts text in the background, recognizes supported procurement types and fills labelled values using the hardcoded catalog. Users compare the extracted values with the PDF, save any corrections, then choose **Confirmă și trimite spre aprobare**. Unrecognized or missing values need human review; the app does not invent them. Validation waits for extraction and reports missing or invalid information. Existing PDFs can be enrolled using the **Achiziții** tab in document details. There is no template editor or PDF generation.

The backend catalog in `backend/app/procurement/catalog.py` defines these 13 templates:

| Template | Specific information |
| --- | --- |
| Necessity report | Requester, justification, estimated gross amount, currency, budget line, urgency |
| Specifications | Scope, technical requirements, acceptance criteria, author |
| Contract | Supplier, currency, gross value, effective/expiration dates, payment terms |
| Purchase order | Supplier, currency, gross value, delivery deadline and destination |
| Addendum | Supplier, currency, amendment kind, effective date, explicit signed value delta, description |
| Inbound delivery | Delivery date, items/work, reference |
| Service report | Service date, performed work, reference |
| Acceptance | Currency, inspection date, verdict, accepted gross amount; findings/resolution where applicable |
| Invoice | Supplier, currency, gross value, due date, included tax |
| Credit note | Supplier, currency, credit amount, reason |
| Return order | Reference, date, reason, affected items, resolution |
| Replacement order | Reference, date, reason, affected items, resolution |
| Outbound return delivery | Reference, date, reason, affected items, resolution |

All templates require a document number and issue date. Relationships are entered explicitly in the case; a title or category does not establish a dependency. Template metadata lives in `metadata.procurement` with its stable template ID, catalog version, and fields. Supplier, number, currency and document value reuse the existing document fields.

## Assemble and advance a case

1. Create a case with a responsible person, currency, anticipated gross value and optional delivery deadline.
2. Upload PDFs directly in the guided case, review the extracted values, save any corrections, then confirm and submit each document. Approvals follow the document department: procurement approvals go to Mihai Dumitrescu (the demo **manager** account), and appear in **Aprobări → De rezolvat de mine**. Elena Popa (the demo **reviewer** account) reviews Conformitate documents. Signed documents no longer have a pending approval.
3. Confirm suggested child-to-parent relationships. Existing accessible PDFs can also be selected from the registry; detailed associations remain in Avansat.
4. Select one primary contract or standalone purchase order. Child orders must match the contract supplier and currency; their values are not added to the contract again.
5. Resolve the displayed blockers and confirm each stage decision.
6. Allocate every invoice's gross amount explicitly to approved acceptance records. Record payments actually made, with date and bank reference, then close the reconciled case as paid.

| Case stage | Requirements for advancing |
| --- | --- |
| Ciornă | Complete approved necessity report and specifications, linked together |
| În verificare | Approved primary commitment and valid addenda, matching supplier/currency, reconciled allocations/payments |
| Angajat | Approved linked delivery/service and acceptance evidence covering the committed scope, resolved reservations/returns |
| Recepționat | Approved invoices with exact versioned links, full acceptance allocations, and net values matching commitment |
| Facturat | Zero outstanding balance and overpayment, with current evidence and resolved exceptions |
| Plătit | Closed; a director must reopen with a reason before further changes |

Document approval, the case stage, acceptance verdicts, and recorded payments are separate states. A signed invoice does not mark a case paid. Cancelled cases appear separately from the six forward stages. Returning, cancelling and reopening record a reason and preserve prior evidence/payment history.

## Amounts, credits and payment history

Amounts use decimal arithmetic and two-place decimal strings. Case scope and invoice coverage use totals including tax. The first release handles monetary acceptance rather than inventory quantities or item-level matching.

A case has one primary award. Commitment is its gross value plus approved effective addenda's explicit signed deltas. Invoice allocations cannot consume the same acceptance amount twice: allocating 700 of a 1,000 acceptance leaves 300 for other invoices. A credit does not automatically free that acceptance capacity.

An approved credit can create an overpayment. That blocks new payments anywhere in the case and blocks closing. Finance can record a real refund, bounded by the credited invoice's overpayment, on an active case, including after a director reopens a paid case. Reconcile the commitment with approved amendment evidence before progressing again. An explicit reversal corrects an erroneous ledger entry; it does not stand in for an actual refund. Payments, refunds and reversals are append-only and keep their original invoice version references. The app records these transactions; it does not send money to a bank.

## Replacing evidence and retries

Editing fixed fields or replacing a PDF creates a new draft version and requires fresh approval. The case retains its attached version and reports stale evidence. Return the case to draft/review, reapprove supporting documents, then refresh their associations and rebuild affected links/allocations.

For a replacement invoice, refresh its pending version in draft/review first, rebuild its exact-version links and allocations, reconfirm commitment, and then approve the invoice. Pending evidence cannot satisfy final invoice progression or payment checks. This order avoids approval depending on an association that itself requires approval.

Every mutation checks the case revision and relevant document versions. Conflicts retain entered form values for review/retry. Case creation reuses a request ID for identical retries; payment references cannot be recorded twice for the same invoice and entry kind. Lost stage/payment responses are reconciled against history while retaining the original submission revision, including across an external refresh.

## Access and rollout

Existing airport, document and version permissions apply. Case membership does not grant access to PDFs. Technical readers receive the visible evidence, stage and blockers; financial balances and ledger details require authorized financial/procurement access. Existing named document reviewers and signature rules remain in force.

The person who actually approved a document retains read access to that exact published version after the approval task closes, including an approver acting under delegation. Both the version's approval record and the completed task must identify that person. This does not grant editing authority, access to replacement drafts, or general access to the department's other documents. HR-specific access rules remain separate.

The additive Alembic revision `20261101_procurement` joins the two existing workspace migration heads and creates the case, association, relationship, allocation, event and payment tables. Application startup runs `upgrade head`. Restart the backend after installing the new code so the migration runs, and rebuild/restart the frontend as usual.

Startup imports legacy `case_id`/`procurement_ref` groups as empty draft cases, once per airport/reference. It preserves existing documents and does not invent associations, approvals, payments or completed stages. Enrol and confirm the evidence explicitly.

Relevant verification is in `backend/tests/test_procurement_workflows.py`, `backend/tests/test_procurement_integration.py`, `frontend/tests/procurement-ui.test.mjs` and `frontend/tests/procurement-integration.test.mjs`. The disposable Playwright check and screenshots are under `.runtime/procurement-check/` and use a temporary demo database/storage.
