# AeroDesk reports

Open **Rapoarte** in the workspace navigation, or `/#reports`. Individual reports support direct links such as `/#reports/contracts`. The inspiration board remains at `/reports-design`.

The report center uses the current document, task, renewal, supplier, team and sharing records. Demonstration records remain fictional. No separate reporting database or precomputed snapshots are required.

## Daily director briefing

The landing page starts with **Situația aeroportului**: today's document register, pending decisions, validated contracts due in 30 days, contractual value by original currency, and team availability. Restricted accounts see only their permitted indicators and report previews. A shared department filter applies to the entire briefing.

The 7/30-day activity chart shows actual document creations and authorized document audit events. The deadline panel lists real contracts, while the priority queue identifies expired contracts, unassigned or overdue decisions, unvalidated metadata, overdue technical documents and open supplier reviews. Each item opens its source document. Department workload bars open the matching pending queue.

KPI drill-through links preserve status, department and deadline focus in the URL, including after reload. For example, the 30-day contract KPI opens only validated, non-archived contracts due in that interval; its selection CSV exports the same records. The report library sits below the daily briefing and replaces decorative thumbnails with live status rings, maturity bars, category distributions and procurement-stage counts from each report's source data. Missing supplier reviews and shares show explicit empty states and links to their source modules.

The daily PDF includes the selected scope, current date, KPIs, charts and all matching priorities, without the report catalog or app navigation. Presentation mode uses browser fullscreen and restores the regular layout when exited. No flight, passenger or delay metrics are fabricated; this app currently supplies administrative data.

Design references: Microsoft's [dashboard design guidance](https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips), the [Airport Authority Performance Summary](https://community.fabric.microsoft.com/t5/Data-Stories-Gallery/Airport-Authority-Performance-Summary/td-p/628963), and ZoomCharts' [airport Power BI example](https://zoomcharts.com/en/microsoft-power-bi-custom-visuals/dashboard-and-report-examples/view/airline-delays-dashboard-power-bi). The implementation uses AeroDesk records and code-native visuals.

| Report | Permitted account roles | Source and purpose |
| --- | --- | --- |
| Executive overview | director | Accessible document counts, current approval states, deadlines and activity |
| Document health | any authenticated user | Visible register, validation, document types and departments |
| Contract portfolio and renewals | director, reviewer, finance | Contract values by currency, expiry, renewal states and reassignment needs |
| Tasks and approvals | any authenticated user | Accessible tasks, assignments, delegations, overdue work and completed history |
| Procurement | director, reviewer, finance | Classified purchasing, delivery, reception and invoice records; distinct case counts |
| Supplier risk | director, finance | Review statuses and risk reasons, excluding bank details from report output |
| Team availability | director, hr, admin | Directory, availability and permitted leave-request counts; no leave reasons |
| Airport collaboration | director, reviewer | Accessible shares, current access status, recipients and approaching expiry |
| Technical monitoring | director, technician, reviewer | Accessible technical records, validation and deadlines |

Report admission uses the existing `User.roles` authority. Record visibility continues to use `can_read`, airport scope and the corresponding feature services. A director's report does not grant access to restricted HR documents. Change account roles through the existing authorized team management flow; the next report request enforces the changed authority. Direct URLs and CSV endpoints apply the same checks as the report catalog.

## Refresh and time semantics

While a report is open, its data refreshes every 60 seconds when the tab is visible, on window focus, on relevant application revisions, and through the refresh button. Switching reports, departments or activity periods fetches a new report. Failed requests clear displayed report data; expired or changed permissions do not leave the previous report visible.

KPIs, distributions and registers describe the current snapshot. The **30 / 90 / 365 days** selector changes the activity chart, counting records by their actual creation dates in twelve interval buckets. Existing record creation dates are not approval-history snapshots. The team report uses accessible audit events because the directory does not store account creation timestamps. An empty chart shows an explicit empty state.

The briefing uses the current Europe/Bucharest calendar date. Report detail and complete CSV requests pass this date as `as_of`, so deadlines, availability and the corresponding drill-through agree. For compatibility, API requests that omit `as_of` retain the workspace's configured reference date. All report footers show the date used. Timestamp-based activity is bucketed in Europe/Bucharest, including events crossing midnight; date-only deadlines keep their recorded calendar date. The source workspace and renewal synchronization retain their existing demonstration-date behavior.

Contract totals include accessible contracts across statuses and group each currency separately. No exchange-rate conversion or payment total is implied. Procurement stage values count documents in each stage; they are not case completion percentages.

## API and export

- `GET /api/reports`: permitted catalog, visible-document count and refresh interval.
- `GET /api/reports/briefing?department=`: permitted catalog and previews, current-day summary, 30 daily activity buckets, departmental workload, priorities, deadlines and completeness indicators.
- `GET /api/reports/{report_id}?days=90&department=&as_of=2026-10-31`: current report, charts, source rows and activity; optional calendar reference for deadlines and availability.
- `GET /api/reports/{report_id}/export.csv?days=90&department=&as_of=2026-10-31`: all source rows in the report's authorized department scope. Client-side table search, status and chart filters are local exploration controls.

Valid activity periods are 30, 90 and 365 days. Invalid report identifiers return 404; denied report access returns 403; unauthenticated requests return 401. Responses are uncached. CSV output uses UTF-8 with a BOM and the existing formula-safe cell encoding.

Report favorites are stored per account in the browser. The library supports category filters, favorites and Romanian search with or without diacritics. Refresh preserves the current library search, report view and visual selections. Tables support search, status and chart filters, sorting and pagination. Monetary cells retain their original currency; sorting groups currencies separately. Each document-backed row links to its source document. Catalog charts and displayed report values come from the API.

The report workspace opens with the analytical canvas and a concise observation computed from its current selection. **Privire de ansamblu**, **Date sursă** and **Despre raport** switch views. The collapsible filter pane moves above the canvas on narrow screens. The reference date, demonstration-data label and refresh timestamp remain visible.

**CSV complet** exports the server-authorized department scope. **Export selecție** in Date sursă exports all matching records across pagination, including chart selections, text search and the table status filter, in the selected sort order. Its UTF-8 CSV retains source document IDs and neutralizes spreadsheet formulas, including leading whitespace. Empty selection exports are disabled.

**PDF / Tipărire** opens the browser print dialog, where the user can save the current view as PDF. The print layout removes app navigation, includes the reference date and filter context, and prints all matching table rows rather than only the current page. Fullscreen remains available for presenting the report. No extra PDF service is required.

## Analytical report canvases

Each report has a distinct Power BI-inspired layout: executive scorecard and stacked distributions; document-quality inventory matrix; contract maturity timeline and single-currency value scatter; approval workload board; procurement stage flow and case coverage; supplier risk matrix and Pareto causes; team coverage and roster; airport collaboration network; and a technical document monitoring canvas. All nine reports share the application's light forest-green theme, typography, panel styling and controls; their layouts and analytical visuals remain distinct.

The filter pane combines the authorized server department filter with local state, category, owner, supplier and currency slicers. Chart selections intersect, matrix cells select both dimensions, and repeat selection clears that selection. Local indicators, visuals and the source-register tab use the same filtered rows. Renewal distributions and supplier cause aggregates retain their server scope, explicitly stated above those visuals. Report export includes the authorized department scope; the source tab also offers a formula-safe CSV of the visual selection. These tabs switch between the analytical canvas, source records and context. Fullscreen uses the browser fullscreen API.

Procurement coverage counts actual records for each identified case and stage; it does not infer completion. Network connections appear only for actual shares. Technical monitoring describes document deadlines, without inventing asset telemetry. Contract monetary plots retain a single currency at a time.

## Verification

Analytical transformations, CSV safety, Romanian search and legacy title formatting: `node --test frontend/tests/report-analysis.test.mjs frontend/tests/report-export.test.mjs`.

`backend/.venv/Scripts/python.exe -m pytest backend/tests/test_reports.py backend/tests/test_report_briefing.py -q`

The reporting tests cover catalog admission and direct endpoint denial for five account types, record filtering, cross-airport isolation, department scope, current-state recalculation, separate currencies, CSV formula encoding, invalid periods, authentication and omission of private personnel fields. Briefing tests additionally verify preview/detail agreement, actual-day deadlines, archived/unvalidated exclusions, local midnight boundaries and isolation of hidden or cross-airport audit events.

Frontend checks: `npm --prefix frontend run lint` and `npm --prefix frontend run build`. In restricted Windows environments, use `npm --prefix frontend run build -- --configLoader native` to avoid the config bundler's directory access restriction.

The report-page presentation was checked in Chrome at desktop (1512px) and mobile (390px) widths, including report filter panes and source tables. Browser checks cover KPI-to-source agreement, reloadable drill-through, exact-selection CSV, department and activity-period changes, search preservation, priority document links, all nine report routes, fullscreen, PDF output, network-failure recovery and technician access restrictions. There are 11 frontend reporting tests and 23 backend reporting tests. Browser verification reads the current app data; backend tests use isolated fixtures.
