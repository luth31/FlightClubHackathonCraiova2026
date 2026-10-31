# Airport operations in FlyLeaf

Open **Operațiuni la sol** from the sidebar. Craiova and Sibiu each have their own airport geometry, simulation state and event history. Documents, accounts and existing development commands keep working as before.

## Start and demonstrate

- Native development: `./scripts/dev.sh`, API 8000 and Vite 5173, demo account selector, Google mode when configured or the bundled airport model.
- Local Docker: `./scripts/start-demo.sh`, Craiova 8080 and Sibiu 8081, Keycloak 8180/8181, the same map modes as presentation.
- Presentation: `./scripts/start-tailscale.sh`, a separate `flyleaf-presentation` Compose project, 18080/18081 upstreams, separate state and identities. Only this launcher reads `.env.tailscale`. See [Tailscale setup](TAILSCALE.md).

Set `GOOGLE_MAPS_API_KEY` in the ignored root `.env` to enable Google in native development, both local Docker airports and the presentation deployment. A key in `.env.tailscale` overrides the shared value only for presentation; omit that line to inherit the root key. With a key the app selects **Fotorealist**; **Model 3D** remains available without it. Restrict browser keys to Map Tiles API and the intended localhost/Tailscale web origins. Deployment-specific hostnames, cookies and login routing remain separate.

For a compact demonstration:

1. Start **Simulare** at 30×, or use **Următorul eveniment** to pause at each change. The scenario begins at 08:00.
2. Open **Pontaj NFC** to simulate a worker checking in or out. The card controls are demonstrative, without a physical reader integration.
3. Watch FL303 turn yellow with a seven-minute delay. FL404 declares and clears a simulated emergency. FL101 becomes red with an 18-minute delay caused by late gate opening.
4. Select FL101, focus the aircraft, then choose **Vezi firul evenimentelor**. The filtered history includes the missing assigned worker, substitute's card scan, substitution and gate opening. It is backed by persisted events; recording times and scenario times remain distinct.
5. Reset the scenario, check in an operator and open G1 before its planned time. The model recalculates departure from the first opening plus preparation time; this can prevent the delay. Subsequent closing/reopening is logged but does not model interrupted boarding.
6. Choose **Trafic ADS-B** to see live positions around the airport. This is a separate source: it does not populate synthetic attendance, gate events or invented flight delays. Empty and unavailable responses have explicit states.

The punctuality percentage uses completed simulated departures only; before the first departure it displays no result. Projected and actual delay values are distinguished in each flight's details. Default colors are neutral under one minute, yellow from one to below 15 minutes, and red from 15 minutes or a declared emergency.

## Interaction and rendering

Drag to orbit, use the mouse wheel or zoom buttons, and choose the overview/focus controls. Aircraft and their labels are selectable. Full screen expands the scene. Neutral aircraft keep their normal livery; yellow/red aircraft use a clear alert livery and matching labels.

The local model uses real OSM runway, taxiway, apron and building footprints, with illustrative heights, materials, trees and aircraft. Google mode streams Google's 3D tiles and includes its logo and visible-tile provider attribution. These datasets have different dates: imagery may show an older apron, parked vehicles or buildings. A distant view initially uses coarse detail; focused views load finer geometry where the provider has coverage. The independently sourced simulation routes are not traced from Google imagery.

Google tiles remain in the current browser session while navigating to other sections. Hidden views stop rendering and polling. There is no persistent/offline Google tile archive or background prefetch; newly requested data follows provider restrictions. OSM assets are bundled and usable without the map service. Switching map modes releases the old renderer and its GPU resources.

Live ADS-B requests are shared and cached for 30 seconds per airport, with bounded payloads, timeouts and failure backoff. Stale snapshots and individual position ages are identified. Aircraft without a reported altitude stay in the list but are not placed on the ground by assumption. For visualization, reported altitude is offset by airport elevation; pressure and ellipsoid altitude are not surveyed height above terrain. This is a demonstration, not an air traffic control instrument.

## Verification

Validated with Chrome DevTools: Craiova and Sibiu local geometry and Google coverage; camera focus and ground contact; live aircraft from ADSB.lol; red/yellow/neutral states; manual NFC and emergency events; flight-to-staff history filtering; and preserved map instance with paused background rendering on sidebar navigation.

Verification run: **273 backend tests and 76 frontend tests passed**; frontend lint and production builds passed. The final browser run also confirmed speed changes during playback without stale-clock conflicts, and verified deployment isolation. The map-key configuration was subsequently corrected to support the shared root key in both environments.

Automated coverage includes persisted replay, restart and reset history, optimistic concurrency, tenant isolation, authorization, gate intervention, delay boundaries, provider parsing/cache/failure handling, map-config authentication, local scenario time, altitude conversion, NFC request IDs and linked-staff event filtering.

See [API contract](OPERATIONS_API.md), [research and source licenses](AIRPORT_3D_SOURCES.md) and [geometry reconstruction](../data/airports/README.md).
