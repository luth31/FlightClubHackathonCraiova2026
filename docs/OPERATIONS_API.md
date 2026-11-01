# Airport operations API

All routes are under `/api/operations` and require a signed-in user in the configured airport. Each airport has its own clock, cards, ledger and history. Director, technician, and Technical/Operations/Compliance reviewers can control the demonstration. HR and finance can read it. SOP proposals require director or Compliance authority. Requests never grant real airside access or ATC clearance.

## Interactive scenario

`GET /operations` returns `airport`, `simulation`, `flights`, `gates`, `staff`, `events`, `kpis`, `thresholds`, `model` and `permissions`.

`simulation` includes `scenario_mode: interactive|replay`, `run_id`, `revision`, `running`, `speed`, `elapsed_seconds`, `duration_seconds`, `clock_time`, and recorded UTC creation/update times. Interactive runs start paused at 1×; replay resets to 30×. The demonstration starts at 08:00 on the application's reference date. FL101 is interactive: its NFC and gate actions are never invented. FL202 and FL404 have `automatic=true`; their routine events are materialized with scenario provenance in both modes. FL202 departs at 08:18 and FL404 arrives at 08:12. Departures still require enough recorded boarding time with an open gate.

`POST /control` accepts:

```json
{"action":"reset","scenario_mode":"interactive"}
{"action":"start","speed":30}
{"action":"pause"}
{"action":"step"}
{"action":"advance","seconds":300}
{"action":"advance_to","target_seconds":1320}
```

`advance_to` must not move backwards; reset creates a fresh run while preserving earlier events. `step` stops at the next scheduled check or causal milestone. `scenario_mode` is accepted only with reset; replay is an explicit prerecorded alternative. Existing sessions use interactive controls after upgrading; reset before a new pitch to start from a clean run.

`GET /timeline?run_id=<current-run>&at_seconds=1320` returns the same snapshot reconstructed at any second from 0 to 3600, plus `timeline: {current_seconds, at_seconds, projected, events}`. Earlier moments include only events that had occurred; future moments apply the existing scenario rules to recorded interventions in memory. Timeline event markers include a `projected` flag. Interactive projections do not invent the presenter’s FL101 NFC scans or gate actions; the two routine flights remain automatic. This endpoint never updates the stored clock, events or audit log, and its snapshot has `permissions.can_control=false`. A stale run ID returns 409. The UI pauses a running shift before an authorized operator scrubs, labels historical/projected views, and requires an explicit `advance_to` with a revision precondition to apply a future time.

`POST /events` accepts `kind: nfc_check_in|nfc_check_out|gate_open|gate_close|emergency_declared|emergency_cleared`, optional `staff_id`, `gate_id`, `flight_id`, `note`, `request_id` UUID and `expected_revision`. Gate actions require a checked-in worker and the correct interactive departing flight. Attempts to control an automatic flight are rejected. Duplicate state changes and reopening after departure are rejected; an operator can close the gate after the flight leaves. A substitute is permitted and explicitly recorded alongside the originally assigned agent. Optional request UUIDs deduplicate within a run.

`POST /nfc` accepts `{card_id, action: check_in|check_out, request_id?}` and returns the same snapshot. Cards are matched exactly against configured demo card labels. This authenticated endpoint can receive an NFC Tools URL confirmation or a keyboard reader. Opening an NFC URL alone must never mutate attendance. `recorded_at` is the real UTC scan recording time; `simulated_at` is the presentation clock. These times remain distinct.

## Causal departure model

The planned and actual `*_departure_seconds` fields mean **off-block: leaving the parking stand**, not take-off. `scheduled_offblock_seconds` and `actual_offblock_seconds` are explicit aliases. Boarding requires 16 minutes of accumulated open-gate time; gate closure pauses incomplete boarding. Off-block is the later of readiness and scheduled off-block. Aircraft remain at the stand until that event, then taxi for a modeled three minutes before a separate `takeoff` event. Arrival routes are independently simulated.

Craiova's three active illustrative demo stand positions use the established southern apron, visible as pavement in both map styles. They face south toward the terminal and leave the aircraft baked into Google's eastern apron unoccupied by the simulation. The API exposes `model.aircraft_display_scale=0.62`; only simulated meshes and their selection rings use this display scale, while geographic coordinates and ADS-B aircraft remain unchanged. The bundled OSM apron includes a northern extension that Google's photorealistic mesh still shows as vegetation (checked 1 November 2026). Stand connectors exit the southern apron onto the paved northbound taxiway before joining the runway. Craiova departures keep their south-facing heading for the first 20 seconds of pushback, within the existing three-minute taxi duration. Timeline seeks place aircraft directly at the inspected position instead of animating a straight shortcut through occupied space; continuous playback still animates. These are demonstration placements, not a surveyed stand allocation or aircraft-clearance model; the remaining flights keep G1, G2 and G4 and their existing card identities.

A flight exposes `status`, `phase`, `boarding_remaining_seconds`, projected/actual delay basis, estimated off-block/takeoff time, and the opening event that initiated the chain. Missing prerequisites never produce an actual departure. A projected risk can be red before departure while the actual punctuality KPI remains unchanged until completion. Severity is yellow from one complete minute and red from 15 minutes, or for an active emergency. These are demonstration thresholds, not regulatory limits.

Snapshot KPIs separate `actual_delay_minutes` and `projected_delay_minutes`; `on_time_percent` includes completed departures only and is null before the first departure. `blocked_flights`, gate and attendance counts are computed from recorded state.

`GET /events?run_id=&offset=0&limit=200` exposes persisted run history (limit 1–1000). Every semantic event is also mirrored to the audit log. Concurrent polls cannot multiply the clock or duplicate events; semantic writes retry transaction conflicts up to three attempts unless an explicit revision precondition was supplied.

`GET /runs?offset=0&limit=100` lists run summaries newest first: `run_id,event_count,started_at,ended_at,last_event_at,scenario_mode,is_current`, plus pagination. Use its run ID with `/events` to browse earlier rehearsals.

## Grouped airport ledger

`GET /ledger?date=2026-10-30&status=all|attention&search=G1` returns:

- `days[]`: `date`, worst `severity`, `event_count`, daily `metrics`, and `flights[]` (the common group collection).
- Each group: `id`, `category: flight|airport`, `callsign` or operational group title, `route`, `gate_id`, `scheduled_at`, `actual_at`, `status`, `severity`, `delay_minutes`, `cause`, `event_count`, `source`, `synthetic` and `events[]`.
- Each event: `id`, `kind`, `title`, `planned_at`, nullable `actual_at`, `actor`, `detail`, `severity`, `delay_minutes`, `source`.
- `metrics`: whole displayed period; `filtered_metrics`: only filtered groups; `period`, `reference_date`, `seeded_events`, `total_groups`, `filtered_groups`, `event_count`, `current_run_id` and an explicit scope notice.

The persistent fixture contains seven completed days with eight departures and four airport activity groups per day, plus three days of upcoming schedules. Flight chains include scheduling three days ahead, assignment, briefing, attendance, aircraft arrival at stand, cleaning, fuel readiness, equipment checks, gate opening, boarding, load-sheet confirmation, off-block, takeoff and closure. Airport groups include runway/FOD inspection, shift handover, preventive maintenance and SOP/safety review. Stable tenant/date IDs make seeding idempotent. Versioned fixture corrections update only records explicitly marked synthetic and source=seed; manual operation events are never rewritten. Every substitute differs from the assigned agent and is checked in before opening the gate.

The current run is projected into the same tree, with pending expected milestones. Severity propagates to its flight/activity and day. Aggregate metrics are arithmetic, not the worst event color. Completed off-block outcomes affect punctuality and actual delay totals; outstanding issues affect `open_risks` and `projected_delay_minutes` separately. Reset removes the prior run from the active KPI comparison but retains its events in history.

This is the modeled operational ledger, not a claim to integrate every airport system. Document and personnel audit entries remain in their permission-filtered modules; HR details are not copied into a public operations ledger. Public ADS-B is never used to invent attendance, gate timing or schedule delay.

`GET /summary` returns only `{metrics,reference_date,period}` for dashboard KPIs, using the same calculations and authentication as the ledger.

## Legacy rule-based SOP proposals (compatibility API)

`GET /strategies` returns `items`, `can_draft`, `current_run_id`, `notice`. Each item has `id`, `title`, `sop_code`, `problem`, `current_rule`, `proposed_rule`, `changes`, `evidence_count`, `evidence[]` (`group_id`, `callsign`, `date`, `delay_minutes`), `baseline`, `estimate`, `assumptions`, nullable `document_id`.

The initial rules address reserve-staff confirmation and earlier equipment readiness checks. Estimates are deterministic counterfactual arithmetic on completed synthetic flights. They explicitly assume the relevant resource is available and the labeled cause can be removed; no measured improvement or AI optimization claim is made.

`POST /strategies/{id}/draft` creates a real PDF procedure draft with evidence, proposed changes, assumptions and normal document validation tasks. Returns `{document_id,file_url,title,status}`. Identical evidence produces the same document; changed evidence produces a new proposal rather than silently rewriting the previous PDF. It does not approve, activate or share the procedure. Those steps use the existing independent document workflows and reviewed airport-sharing controls.

## Live traffic and maps

`GET /traffic` remains a read-only ADSB.lol position feed: source, fresh/stale/unavailable status, timestamps, bounded polling/cache, aircraft and attribution. It has no airline schedule information; real aircraft delay remains null. Map placement uses reported coordinates and reported altitude references; unknown altitude remains a list item rather than being invented at ground level.

`GET /map-config` returns the optional browser Maps key and map availability. Restrict the key to the deployment's browser referrers and Map Tiles API. The bundled model works without a key. All Google tile attributions must remain visible.

Milestone terminology is informed by [EUROCONTROL's A-CDM specification](https://www.eurocontrol.int/publication/eurocontrol-specification-airport-collaborative-decision-making-cdm), which distinguishes off-block from take-off. FlyLeaf's timing/resource model is deliberately simplified and is not an A-CDM or ATC integration.

## SOP library and Luna strategy analysis

See [SOP_OPTIMIZATION.md](SOP_OPTIMIZATION.md) for the catalog, analysis endpoints, evidence snapshot semantics, approval workflow and partner-sharing permissions. Analyses are explicit requests, persisted per airport, and reused for identical inputs. They never apply a procedure or alter measured KPIs automatically.

### Rendering and live refresh additions

Each simulation flight exposes `trajectory`, an array of `{at_seconds, lat, lon, altitude_m, heading}` route vertices. Altitudes are metres MSL, just like `position`. The renderer samples this compact route at its visual clock. A departure path may use the current boarding estimate before the recorded off-block event; this is a visual projection and never changes actual metrics. Closing G1 removes that projection until boarding resumes.

`GET /traffic` uses a ten-second shared cache, including legacy `?tracking=true` requests. Aircraft include stable `observed_at` timestamps (fetch time minus provider position age); cached responses keep this timestamp while increasing `position_age_seconds`. The renderer plays observations with a 15-second buffer. `poll_after_seconds` remains authoritative and can be longer during provider failures or rate limiting. All modes share one request lock/cache per airport; tracking does not bypass failure backoff or `Retry-After`. Stale aircraft are explicitly marked.
