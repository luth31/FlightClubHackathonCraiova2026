# Airport operations simulation API

FlyLeaf provides a persistent, tenant-scoped demonstration on the Craiova and Sibiu airport layouts. Flight numbers, workers, NFC cards, gate labels and timings are fictional. Airport geometry is anchored to public geographic data; this is not an air traffic control system or a source of operational clearances.

## Endpoints

All routes require the existing authenticated workspace session. Read access follows the current airport. Only `director`, `reviewer` and `technician` roles may control the scenario or submit events.

| Route | Request | Result |
| --- | --- | --- |
| `GET /api/operations` | — | Current scenario snapshot; advances the server clock if running |
| `POST /api/operations/control` | `{ "action": "start\|pause\|step\|advance\|reset", "speed": 30, "seconds": 300, "expected_revision": 4 }` | Updated snapshot |
| `POST /api/operations/events` | `{ "kind": "nfc_check_in", "staff_id": "staff-agent-a", "request_id": "UUID" }` | Updated snapshot |
| `GET /api/operations/events` | Optional `run_id`, `offset`, `limit` (1–1000) | Paginated immutable history, including previous runs |
| `GET /api/operations/traffic` | — | Separate live ADS-B snapshot with freshness and attribution |

`speed`, `seconds` and `expected_revision` are optional. Speed is 1–120; advance is 1–3600 seconds. `step` pauses and moves to the next semantic event. `reset` begins a new run without deleting old events. A stale supplied revision returns HTTP 409. Without a supplied revision, semantic commands retry a rolled-back database conflict up to three total attempts, reloading and revalidating current state each time; domain validation failures are never retried. Event submission accepts optional `request_id` for deduplication within a run.

Event kinds are `nfc_check_in`, `nfc_check_out`, `gate_open`, `gate_close`, `emergency_declared` and `emergency_cleared`. Gate actions require a valid gate and a worker who is currently checked in. Emergency actions require a flight. An optional note is limited to 500 characters. The NFC controls simulate a timecard reader; no physical NFC hardware integration is claimed.

## Scenario and snapshot

The snapshot contains `airport`, `simulation`, `flights`, `gates`, `staff`, `events`, `kpis`, `thresholds`, `permissions` and an explicit simulation notice. The server owns elapsed time and speed; polling does not multiply elapsed time. Optimistic database revision checks and unique event keys prevent duplicate events during concurrent requests. Only semantic events are persisted, not animation frames.

The baseline scenario starts at 08:00 on the configured demonstration reference date. G1 should open at 08:04, but its assigned worker is absent. A reserve worker checks in at 08:20 and opens G1 at 08:22. After the configured turnaround, FL101 departs at 08:38 instead of 08:20: 18 minutes late. FL202 departs on time, FL303 has a seven-minute delay, and FL404 demonstrates a declared and cleared emergency. An operator can check in a worker and open G1 earlier; that intervention changes the projected and actual departure outcome. This bounded model uses the first gate opening plus its turnaround duration. A subsequent close or reopen remains visible and audited, but does not recalculate the turnaround. The snapshot exposes this limitation in `model.gate_reclosures_affect_departure: false` and `model.notice`.

Each event has a stable ID, run ID, chronological sequence, simulated timestamp, actual recording timestamp, actor, source, event kind and related staff/gate/flight IDs. Derived flight events retain the gate-opening event as `payload.cause_event_id`. Every semantic event also creates an entry in the existing audit log, without a document attachment.

The default classification policy is exposed in `thresholds`: neutral below one complete minute of delay, yellow from 1 to less than 15 minutes, red from 15 minutes or any declared emergency. The constants live in `app/operations/scenario.py`; these are demonstration policy defaults, not a legal punctuality standard. Flight `delay_basis` distinguishes scenario projections from recorded simulated departures. The on-time KPI uses only departed flights and is `null` before the first departure.

Aircraft positions use WGS84 latitude/longitude, altitude in metres and heading in degrees. Simulated altitudes are referenced to the airport elevation. Stand and taxiway paths use the researched public geometry with explicitly simulated short connectors. Gate labels G1–G5 are demonstration labels, not asserted real airport gate numbers.

## Live ADS-B separation

The live endpoint uses the [official ADSB.lol API](https://www.adsb.lol/docs/open-data/api) and its fixed HTTPS circle endpoint. Only public airport coordinates and a 25 NM radius are sent. User identities, documents and simulation events are never sent to the provider.

Requests are cached for 30 seconds per airport and serialized to avoid simultaneous upstream requests. A request uses a three-second connection timeout, six-second network operation timeout, ten-second streaming budget, a 2 MB response ceiling and a 200-aircraft display limit. Failed requests back off from 30 seconds to a maximum of five minutes. A previous successful snapshot can remain visible for up to five minutes with `status: stale`, per-aircraft stale markers and position age. After that the endpoint reports `unavailable`. An unavailable feed does not mean empty airspace.

The source provides positions, not a gate plan, flight schedule, employee attendance or punctuality record. Therefore live aircraft always have `delay_minutes: null` and `delay_basis: unavailable`. Emergency squawks 7500/7600/7700 and recognized provider emergency flags set red status. An alert bit alone does not imply a declared emergency. The API preserves altitude reference metadata because pressure altitude and geometric ellipsoid altitude are not exact height above the airport.

Live data remains separate from the simulation event log. The response contains [ADSB.lol](https://www.adsb.lol/) and [ODbL attribution](https://opendatacommons.org/licenses/odbl/1-0/). Production use should follow the provider's current terms and contact guidance.

## Validation

`backend/.venv/bin/pytest backend/tests/test_operations.py backend/tests/test_operations_traffic.py -q`

Coverage includes the causal replay, colour thresholds, persistent server clock, concurrent polling, event deduplication, reset history, tenant isolation, mutation permissions, earlier gate intervention, real authenticated API routes, malformed or stale provider data, emergency normalization, cache/backoff, stale expiration and recovery.
