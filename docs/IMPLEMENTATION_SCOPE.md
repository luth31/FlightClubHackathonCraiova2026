# FlyLeaf implementation scope

The current implementation follows revision 2 of the deliverables, the two project structure guides, `IDEAS.md`, and the document-management parts of `Aero Research.md`. Revision 2's document workflow takes precedence over the research handoff's older passenger-operations priority. The target is a working starting point for an airport administrative workspace, not an operational aviation system.

The delivery deadline is 31 October 2026, 10:33 Europe/Bucharest. Demo records use the explicit reference date 30 October 2026 so expiration scenarios remain reproducible.

## First quality gate

- Persist PDF uploads, validated metadata and immutable versions.
- Search only documents the signed-in user may read; enforce the same checks on file downloads and assistant sources.
- Review, reject with a reason, approve the exact version, and cryptographically sign with a visibly identified demo certificate.
- Persist named, version-specific validation, approval and signature tasks, with explicit reassignment and delegation history.
- Show deadlines from reviewed data and connect each count to its underlying records.
- Give staff a directory, leave requests and time-limited approval delegation.
- Preview a redacted derivative before sharing; grant access to a specific airport, optional recipient department and version; enforce revocation and expiry at access time.
- Compare supplier requests with verified fictional records, require known-contact review and an independent approval for bank-detail changes, and preserve change history.
- Authenticate the two Docker airports through separate Keycloak realms; retain local account status and permissions as the authority for access.
- Keep an audit history of meaningful actions.
- Populate the application with a researched, linked, explicitly fictional Romanian airport document corpus.
- Pass API acceptance tests, a production frontend build, desktop/mobile browser checks and PDF quality checks.

This gate passed on 31 October 2026: 84 backend tests, build/lint, dependency audits, browser interactions, corpus inspection and a full two-airport restart. See [verification evidence and its limits](VERIFICATION.md).

## Design

Warm off-white surfaces, forest green accents, compact status labels, readable typography and restrained visual hierarchy. The home screen answers “what needs my attention?” before presenting the document archive. Detail pages keep the source PDF beside its metadata and next action. Romanian labels use diacritics. Complexity appears where a task needs it.

## Public product research

Reviewed on 30 October 2026. Vendor pages describe advertised features, not independently verified product behavior.

- [Aerosimple Document Management](https://www.aerosimple.com/solutions/document-management) advertises version control, approvals, search, role-based access and expiry alerts. These are baseline expectations, not unique differentiators.
- [Aerosimple Workflow Automation](https://www.aerosimple.com/solutions/workflow-automation) advertises assignment, escalation and audit history. FlyLeaf keeps the first workflow fixed and understandable instead of building a general workflow editor.
- [Aerosimple Lease & Contract Management](https://www.aerosimple.com/solutions/lease-contract-management) concentrates on tenant agreements and airport property. FlyLeaf's initial case files connect procurement, suppliers, invoices, acceptance evidence and maintenance.
- [Yonder airport documentation](https://yonder.info/documentation-management-for-airports/) describes role-specific document views and revision management. This reinforces a focused personal inbox and clear version context.

No claim is made that a competitor lacks a feature merely because it was not found in these public pages. The practical demonstration is the differentiator: a complete Romanian administrative case, reviewed source fields, preserved approval evidence and reviewed inter-airport sharing.

## Deliberate limits

Local demo accounts and certificates are labelled accurately. A cryptographic demo signature is not a qualified electronic signature. A document marked archived is not evidence of compliant legal archiving. No real money, operational airport system, employee mailbox or passenger tracking is involved. Keycloak login is implemented, but its development deployment still needs production hardening and provider revocation integration.

The general register assistant and metadata extraction use deterministic queries and text rules. The `codex/luna-redaction-studio` branch adds an OpenAI-backed redaction assistant and an interactive selection/review workspace; see [Luna redaction](LUNA_REDACTION.md). OCR is not configured. Separate employee records without logins, HR/reporting-line editing, contract obligation/renewal entities and scheduled reminder delivery/escalation remain future work. The current contract register and reminders derive from document metadata. Production records retention, independent security assurance, monitoring and recovery remain deployment work.
