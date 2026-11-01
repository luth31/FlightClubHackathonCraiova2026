# Airport operations in FlyLeaf

The operations workspace connects an interactive demonstration, a grouped airport ledger and reviewable SOP improvements. It is available for Craiova and Sibiu, with separate tenant state. Existing native, Docker and Tailscale deployment commands remain separate; see [Tailscale setup](TAILSCALE.md).

## The presentation story

Start a new **interactive** run. The clock starts paused at 08:00 and 1×, so scanning cards does not unexpectedly fast-forward the presentation. FL101 at G1 is the only interactive delay story: its cards, gate openings and closures are recorded by the presenter. FL202 departs automatically at 08:18 and FL404 arrives normally at 08:12, clearing the taxiway before the departure. Their routine actions are explicitly recorded by the simulation engine. The clock can be paused, stepped or advanced to an exact stage; it is shared across signed-in browser/mobile clients.

1. Scan a worker's NFC card, or select its demo card. The attendance event records the person's identity, expected arrival and actual scenario time, plus the real recording time.
2. G1 is assigned to Mara Stoica, with an 08:04 opening and an 08:20 departure from the stand. With no check-in or gate opening, the aircraft remains at the stand and an operational risk appears.
3. Advance to 08:22, scan Alexandru Marin's reserve card, then explicitly open G1 as the substitute. The ledger records who was assigned and who actually opened it.
4. The model requires 16 minutes of boarding with an open gate. FL101 leaves the stand at 08:38: 18 minutes late. Only now does this flight affect measured punctuality and accumulated actual delay. Three modeled taxi minutes lead to a distinct take-off event.
5. Open the flight's ledger tree to connect scheduling, assignment, missing attendance, substitute arrival, late opening and departure. Use attention filtering to find exceptions without scrolling a flat event table.
6. Open the SOP library and saved Luna analysis. It references individual ledger events and proposes full procedure changes with a pilot and measurable success criteria. Generate a real procedure draft, then use document review and controlled sharing to continue the story across airports.
7. Reset and check in/open G1 on time. That intervention prevents the delay. Closing the gate during unfinished boarding pauses progress, so the simulation responds to later decisions too.

The automatic G2 departure produces a completed punctual flight first; a later delayed FL101 then visibly lowers the actual punctuality percentage. A blocked flight affects risk/projection indicators without masquerading as a completed departure.

The prerecorded replay remains an explicit alternative. Reset preserves prior run history, available from the run archive and paginated event endpoint. Card labels `DEMO-NFC-101` through `DEMO-NFC-104` are demonstration identities; they do not grant physical access. An NFC Tools link opens an authenticated card-confirmation screen; the user must confirm before attendance is recorded. iPhone browser Web NFC is not assumed.

## Ledger and metrics

Seven seeded historical days contain 56 departures and 28 operational activity groups; upcoming plans cover the next three days. The fixture has over 800 granular entries: schedules created three days earlier, gate/team allocations, briefing, card arrival, ground handling, boarding, load sheets, off-block and take-off. Airport groups cover runway/FOD inspection, shifts, maintenance and SOP review. The names, routes and timings are synthetic; the sequence follows plausible operational relationships.

Each day's tree opens into flights or activity groups and then the individual events. Expected and actual times sit together. Yellow means at least one complete minute of lateness; red means 15 minutes or an emergency. The worst child color reaches its group and day, while the global KPI cards retain their own calculated meaning.

Actual punctuality and delay minutes use completed departing flights only. Open risks and projected delay are separate. Filters expose both period and filtered metrics. Current manual actions join the same ledger immediately, and real departure outcomes update its aggregate values. Deterministic IDs persist seeded history across reloads. Reset starts a new comparison but keeps old run events queryable.

Document changes and personnel/leave details remain in their existing permission-filtered audit flows; the operational ledger does not leak confidential HR records. ADS-B positions are a separate feed and cannot supply gates, staffing or airline punctuality.

## SOP library and optimization

Twelve structured working templates cover the airport's core coordination processes. An on-demand Luna engine combines measured KPIs, observed ledger events and current SOP references. It generates amendments or new procedures with validated citations, explicit assumptions and a pilot. Drafts require normal validation and approval; only director/Conformitate authority can prepare and share approved copies with a partner. See [SOP_OPTIMIZATION.md](SOP_OPTIMIZATION.md) for sources, endpoints and limits.

## Geography and live traffic

The model uses independently sourced OSM airport geometry; Google mode streams 3D imagery with provider attribution. Imagery and source geometry can have different dates. The live ADS-B mode displays actual reported positions around the airport, with freshness and source information, and does not invent schedules or delays. Missing altitude is explicit. The representation is not an air traffic control instrument.

Google Maps can be enabled through the ignored root `.env` in native development, default Docker and the separate presentation deployment. An optional `.env.tailscale` overrides presentation values only. See [sources and licensing](AIRPORT_3D_SOURCES.md) and the [API contract](OPERATIONS_API.md).

Each map style is created only when first displayed, then retained in the current page session across the ledger, SOPs, mobile NFC station and style switches. Hidden scenes pause rendering and tile updates; opening a station or ledger link directly does not initialize a hidden map. At most two scenes are retained, and leaving the authenticated application disposes them. Reloading the browser still creates a new renderer/session.

Google tile requests use the browser's normal HTTP cache, respecting the provider's `Cache-Control` and `ETag` headers. There is no offline tile store, service-worker cache or forced reuse of expired content. In-memory tiles and camera state survive navigation. Cache hits reduce network transfers; avoiding new root tileset requests reduces billable starts. Check the Photorealistic 3D Tiles SKU in Cloud Billing rather than equating the API's aggregate tile traffic with billed usage.

## Verification

Focused tests cover default interactive behavior, NFC request idempotency, missing prerequisites, the 18-minute causal chain and successful early intervention, interrupted boarding, off-block/takeoff ordering, server-clock concurrency, ledger seeding/filtering/KPI arithmetic, actual SOP PDF generation, evidence snapshots and access controls. Whole-application and browser verification are recorded in the change's completion report; older verification counts are not claims about this implementation.

## Motion and live tracking

The presentation has three aircraft: FL101 (interactive), FL202 (automatic departure), and FL404 (automatic arrival). The other demo flights and scripted emergency were removed. Routine gate controls are unavailable so only the G1 story needs attention. Start a new repetition after upgrading to avoid carrying over events from an older scenario. Previous run history remains stored.

Simulation snapshots include compact timed route vertices. The scene follows that route each animation frame at the selected speed, rather than cutting straight across taxiways between polling snapshots. Paused seeks snap to the inspected instant; playing clocks do not rewind on slightly late responses and stop predicting after a short network gap. Terrain clearance is consistent, ground-height changes settle smoothly, and status colors change without recreating the mesh.

Live traffic refreshes every ten seconds, including while locked. A 15-second display buffer interpolates position, altitude and heading between timestamped observations; cached responses cannot create new keyframes. Playback holds at the last observation when the buffer runs out and does not interpolate across gaps over 45 seconds. The UI labels the delay and details show the latest received observation. All viewers of an airport share the provider cache; hidden views stop polling and failures back off, respecting Retry-After. The live lock uses a close aircraft camera; airport/all-traffic overview still provides geographic context. The adapter displays reported positions rather than inventing forward movement. Provider rate limits remain dynamic: [ADSB.lol API documentation](https://github.com/adsblol/api/blob/main/README.md).
