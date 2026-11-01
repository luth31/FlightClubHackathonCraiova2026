# Document Types, Templates, and Workflow Architecture

This document defines the recommended templates, required metadata fields, document connections (relationships), and workflow pipelines for each document type configured in the application.

## Procurement implementation — 1 November 2026

Procurement now has an implementation described in [PROCUREMENT_WORKFLOWS.md](PROCUREMENT_WORKFLOWS.md). The application ships 13 hardcoded templates defining fields and workflow rules. Upload asks only for the PDF; its text and supported labelled values are extracted in the background and checked by the user beside the PDF. The main document view follows Ciornă → Verificare și aprobare → Semnare → Finalizat. Users do not create templates or generate PDFs.

**Documente → Dosare achiziții** guides users through four visible steps: Pregătire, Achiziție, Recepție and Plată. PDFs can be uploaded directly in a case; the next action and suggested document relationships are shown for confirmation. Detailed controls live under Avansat. The six persisted case stages remain Ciornă, În verificare, Angajat, Recepționat, Facturat and Plătit. The library exposes Registru, Flux achiziții and Dosare achiziții as direct view options. Cases contain versioned evidence, typed child-to-parent links, explicit invoice-to-acceptance allocations, blockers, decision history and recorded payments/refunds/corrections. Credits and replaced document versions require reconciliation rather than automatic completion.

The sections below remain the broader architecture reference. Quality, operations and HR workflow expansion is outside this procurement release. Suggested PDF structures describe uploaded documents; they are not a PDF-generation feature.

---

## 1. Document Types Overview & Relationships

The system groups individual document types into logical business processes (workflows):

```
[Procurement & Financial]
Referat de necesitate ──► Caiet de sarcini ──► Contract / Comandă ──► Act adițional
                                                    │
                                                    ▼
                                          Proces-verbal / Raport ──► Factură

[Quality, Compliance & Operations]
Procedură ──► Instruire ──► Audit ──► Raport de mentenanță

[Human Resources]
Resurse umane ──► Instruire / Procedură
```

---

## 2. Detailed Templates Specifications

### A. Procurement & Operational Contracts

#### 1. Referat de necesitate (Necessity Report / Purchase Requisition)
* **Purpose:** Initial request to justify a purchase, repair, or procurement need.
* **Suggested Template Structure:**
  * Header & Requesting Department
  * Justification / Business Case
  * Itemized List of Requested Goods/Services
  * Estimated Budget & Funding Source
  * Signatures / Approval Section
* **Key Metadata Fields:** `Requisition ID`, `Requester Name`, `Department`, `Estimated Cost`, `Urgency Level`, `Budget Line`.
* **Connected Documents:** Links to *Caiet de sarcini*, *Comandă*, or *Contract*.

#### 2. Caiet de sarcini (Terms of Reference / Technical Specifications)
* **Purpose:** Detailed technical requirements and conditions for vendor bidding or procurement contracts.
* **Suggested Template Structure:**
  * Scope of Work & Objectives
  * Technical Requirements & Compliance Criteria
  * Delivery Timelines & SLA Standards
  * Quality Assurance & Inspection Criteria
* **Key Metadata Fields:** `Spec ID`, `Project Code`, `Technical Category`, `Version`, `Author/Engineer`.
* **Connected Documents:** Linked to parent *Referat de necesitate* and child *Contract*.

#### 3. Comandă (Purchase Order - PO)
* **Purpose:** Official commercial authorization sent to a supplier to deliver goods/services.
* **Suggested Template Structure:**
  * PO Number & Vendor Details
  * Itemized Table (SKU, Description, Quantity, Unit Price, Total)
  * Delivery Address & Target Date
  * Payment Terms & Legal Terms Notice
* **Key Metadata Fields:** `PO Number`, `Vendor ID`, `Total Value`, `Currency`, `Delivery Due Date`.
* **Connected Documents:** Linked to *Referat de necesitate*, *Contract*, *Proces-verbal*, and *Factură*.

#### 4. Contract (Commercial / Service Agreement)
* **Purpose:** Legally binding agreement between parties.
* **Suggested Template Structure:**
  * Contracting Parties Details
  * Purpose & Scope
  * Value, Payment Terms & Penalties
  * Period of Validity & Termination Conditions
  * Signatures (Digital/eIDAS stamp area)
* **Key Metadata Fields:** `Contract Number`, `Partner/Vendor Name`, `Effective Date`, `Expiration Date`, `Contract Value`, `Auto-renewal Flag`.
* **Connected Documents:** Parent to *Act adițional*, *Comandă*, *Proces-verbal*, and *Factură*.

#### 5. Act adițional (Contract Addendum / Amendment)
* **Purpose:** Modifies existing contract clauses, budget, or timeframe.
* **Suggested Template Structure:**
  * Reference to Original Contract
  * Modified Clauses (Before vs. After table)
  * Adjusted Financial or Timeline Terms
  * Execution Signatures
* **Key Metadata Fields:** `Addendum Number`, `Parent Contract ID`, `Amendment Type` (Price, Term Extension, Scope), `Effective Date`.
* **Connected Documents:** Must link directly to parent *Contract*.

---

### B. Execution, Acceptance & Financials

#### 6. Proces-verbal (Acceptance Minute / Delivery-Receipt Record)
* **Purpose:** Formally verifies the receipt and quality of goods/services delivered.
* **Suggested Template Structure:**
  * Commission / Inspectors List
  * Vendor Information & Delivery Note Reference
  * Acceptance Checklist (Quantity OK, Quality OK, Defects Found)
  * Verdict (Accepted / Accepted with Reservation / Rejected)
* **Key Metadata Fields:** `PV Number`, `Acceptance Type` (Goods, Services, Works), `Status` (Accepted/Rejected), `Inspection Date`.
* **Connected Documents:** Linked to *Contract* / *Comandă* and required before *Factură* approval.

#### 7. Factură (Invoice)
* **Purpose:** Accounting document issued by supplier for payment processing.
* **Suggested Template Structure:**
  * Invoice Header (Series, Number, Tax ID)
  * Line Items matching PO / Delivery Note
  * Tax Breakdown (VAT, Total Payable)
  * Bank Payment Account (IBAN)
* **Key Metadata Fields:** `Invoice Number`, `Issue Date`, `Due Date`, `Total Amount`, `VAT Amount`, `Payment Status`.
* **Connected Documents:** Linked to *Contract*, *Comandă*, and *Proces-verbal*.

#### 8. Raport de mentenanță (Maintenance Report)
* **Purpose:** Records preventive or corrective technical interventions on equipment.
* **Suggested Template Structure:**
  * Equipment Identifier & Location
  * Reported Fault / Scheduled Task Description
  * Actions Taken & Replacement Parts Used
  * Downtime Duration & Technician Sign-off
* **Key Metadata Fields:** `Report ID`, `Asset ID / Serial Number`, `Maintenance Type` (Preventive / Corrective), `Technician Name`, `Downtime Hours`.
* **Connected Documents:** Linked to asset master records, *Referat de necesitate* (if parts needed), or *Audit*.

---

### C. Compliance, Governance & HR

#### 9. Procedură (Standard Operating Procedure - SOP)
* **Purpose:** Internal operational guideline for standardized workflows.
* **Suggested Template Structure:**
  * Objective & Scope
  * Roles & Responsibilities Matrix (RACI)
  * Step-by-Step Operating Instructions
  * Revision History & Related Documents
* **Key Metadata Fields:** `SOP Code`, `Title`, `Version`, `Department`, `Effective Date`, `Review Frequency`.
* **Connected Documents:** Linked to *Instruire* and *Audit*.

#### 10. Audit (Audit Report / Inspection Sheet)
* **Purpose:** Evaluates internal compliance, quality, safety, or financial processes.
* **Suggested Template Structure:**
  * Audit Scope & Standards Evaluated
  * Findings & Non-conformities Checklist
  * Risk Assessment Rating
  * Corrective Action Plan (CAPA) & Deadlines
* **Key Metadata Fields:** `Audit ID`, `Auditor Name`, `Audit Type` (Internal, External, ISO), `Compliance Score`, `Follow-up Date`.
* **Connected Documents:** Linked to evaluated *Procedură*, *Raport de mentenanță*, or *Resurse umane*.

#### 11. Resurse umane (Human Resources Document)
* **Purpose:** General umbrella for HR requests, job descriptions, employee reviews, or onboarding files.
* **Suggested Template Structure:**
  * Employee Info Header (Name, Role, Department)
  * Request / Action Details
  * Manager & HR Approval Block
* **Key Metadata Fields:** `HR Doc ID`, `Employee ID`, `Category` (Onboarding, Leave, Evaluation, Termination), `Confidentiality Level`.
* **Connected Documents:** Linked to *Instruire* records.

#### 12. Instruire (Training & Acknowledgment Form)
* **Purpose:** Confirms employee completion and acknowledgment of training (SOPs, HSE, Security).
* **Suggested Template Structure:**
  * Training Module Name & Instructor
  * Topics Covered / Material Referenced
  * Participant Roster & Electronic Signatures
  * Evaluation / Quiz Score Result
* **Key Metadata Fields:** `Training ID`, `Topic / SOP Reference`, `Trainer Name`, `Date Completed`, `Passing Status`.
* **Connected Documents:** Linked to parent *Procedură* and participant's *Resurse umane* file.

---

## 3. Recommended Workflow Board Columns (by Template Group)

Instead of a single rigid board layout, set up dynamic board columns based on the active workflow template:

1. **Procurement Pipeline (Achiziții):**
   `Draft` ──► `Needs Review` ──► `Contract Approved` ──► `Delivered & Accepted` ──► `Invoiced` ──► `Paid`

2. **Operations & Maintenance Pipeline (Mentenanță):**
   `Reported` ──► `In Inspection` ──► `Work In Progress` ──► `Tested & Accepted` ──► `Closed`

3. **QMS & Compliance Pipeline (Proceduri & Audit):**
   `Drafting` ──► `Stakeholder Review` ──► `Approved & Published` ──► `Training Assigned` ──► `Audited`
