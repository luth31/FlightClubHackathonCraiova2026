# SOP library and strategy analysis

FlyLeaf has twelve original Romanian SOP working templates under **Operațiuni → Proceduri SOP**. Each includes scope, triggers, prerequisites, timed steps with responsible roles, required records, exceptions, escalation, measures, local validation, revision control, and references. The templates cover gates, equipment, shift handover, turnaround, inspections/FOD, stands, boarding/PRM, weather coordination, occurrence reporting, document control, partner exchange, and data quality.

These are authored demonstration procedures, not copies of a real airport's manual or statements of regulatory approval. Timings and pilot targets are local design choices. Creating a local document produces a Unicode PDF and an assigned validation task. Validation, submission and approval use the existing version-specific workflow. Existing corpus files are not regenerated or overwritten.

## Research basis

Structure and responsibility boundaries were checked on 1 November 2026 against:

- [EASA aerodrome rules, March 2026 edition](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aerodromes-regulation-eu?erules-id=ERULES-1963177438-18154): aerodrome manual organization, responsibilities, records and operational procedures. The source includes future-applicability provisions; the templates do not assert those provisions are already mandatory.
- [EUROCONTROL A-CDM specification, 30 January 2025](https://www.eurocontrol.int/publication/eurocontrol-specification-airport-collaborative-decision-making-cdm): tracking turnaround and pre-departure milestones with updates to downstream estimates.
- [IATA Ground Operations Standards](https://www.iata.org/en/programs/ops-infra/ground-operations/ground-ops-standards): the published scope of handling standards. No proprietary IGOM/AHM procedure text was copied.

An AACR PAC-AD-139 search result was located, but the document was blocked by its website's access challenge. Its contents were not used as a verified source. Local adoption must be reconciled with the airport's actual manual, operator/handling instructions and applicable Romanian requirements.

## Evidence → proposal → document → partner

1. A director or Conformitate reviewer chooses **Analizează cu Luna**. Browsing never invokes the LLM.
2. The backend freezes the ledger KPIs, observed deviations and relevant event facts, and the SOP references. It alternates recent affected and unaffected cases within a 120-event budget, retaining each selected case's complete qualifying event set. Coverage includes total observed cases, affected/unaffected counts, selected counts and omitted events. These are descriptive comparison examples, not automatically matched causal controls. Future/pending entries are not presented as observed events. Staff names, card identifiers and free-form notes are excluded from the model's operational evidence.
3. The configured `FLYLEAF_OPENAI_MODEL` (default `gpt-6-luna`) returns at most two amendments or new procedures. Every recommendation has event citations, responsible role, complete proposed steps, assumptions, risks, a pilot and success criteria. For an uploaded newer approved PDF, the extracted current-version text supersedes the original structured template; extraction must be complete before analysis.
4. The server validates the schema and event/SOP references. Observed off-block delay is calculated once per cited completed departure; it never adds gate delay to the same flight's departure delay. There is no invented savings percentage or automatically improved KPI.
5. Analysis is stored per airport and input fingerprint, including the configured model identifier. Identical inputs reuse the result without another model request. A changed ledger, approved SOP, model, model contract or prompt marks the prior snapshot stale. Failed analysis preserves the previous completed result; duplicate concurrent requests are rejected. A running analysis can be found again after navigating away. Older saved results remain readable and explicitly disclose that their selection did not systematically include unaffected cases.
6. **Creează ciornă SOP** creates an idempotent document containing the proposed full procedure and evidence/pilot annex. It does not alter approved procedures. An amendment based on a now-changed approved document must be reanalyzed before drafting.
7. In the library, local documents link to their approval workflow. An approved/signed document shows **Partajează** only for directors and reviewers in **Conformitate**. It opens the existing copy/redaction review flow, with configured partner, expiry, optional recipient department, audit and revocation. The recipient sees a reference copy; local applicability and approval do not transfer.

Approved internal SOP documents are readable by staff in the same airport. Drafts retain departmental/task access. HR and restricted documents retain their existing protection. The sharing service enforces page authority as well as the router, so the restriction is not merely a hidden button.

## API and persistence

- `GET /api/operations/sops`: templates, accessible local documents, capabilities and partner.
- `POST /api/operations/sops/{code}/draft`: local working document and validation task.
- `GET /api/operations/strategy-analysis`: last completed snapshot, staleness, running flag and current baseline.
- `POST /api/operations/strategy-analysis`: on-demand, deduplicated Luna analysis.
- `POST /api/operations/strategy-analysis/{analysis_id}/recommendations/{recommendation_id}/draft`: a full procedure draft for human review.

Migration `20261101_strategy_analysis` adds only `operation_strategy_analyses`. It preserves documents, PDFs, simulations and ledger data. API startup applies the migration. Both airport instances use the same code, separate databases and tenant checks.

The standard and presentation nginx configurations give only the exact strategy-analysis endpoint a 150-second read timeout; other API requests keep 60 seconds. The LLM adapter gives strategy calls 120 seconds, leaving other tasks at 45 seconds. No new API key or environment type is required. Both environments use their existing server-side OpenAI key configuration.

## Ledger presentation

Flight summaries use independent grid columns for scheduled time, gate, status and count. Long estimates such as `+58 min` occupy a fixed badge column. Primary labels are 15–16 px; responsibility and contextual notes are visible without expanding a separate control for every event. On narrow screens the identity row sits above schedule/gate/status, followed by readable event cards with planned and actual values.
