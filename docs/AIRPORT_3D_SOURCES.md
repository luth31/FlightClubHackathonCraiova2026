# Airport 3D views: sources and integration boundaries

Research checked 1 November 2026. The scene combines independently sourced airport geometry, a labelled simulation, and an optional live aircraft feed. It is a product demonstration, not a navigation or air traffic control system.

## Geometry available in this repository

`frontend/public/airports/craiova.geojson` contains 1,328 public OSM features; `sibiu.geojson` contains 2,772. Both contain runways, taxiways, aprons, terminal/building footprints and surrounding roads. Additional mapped land-use, forest, grass and water features intersect a 5 km radius. Source ways remain whole, so the extent can exceed 5 km. Camera framing should use airport/runway bounds.

Raw snapshots, original queries, selected animation anchors and a deterministic rebuild script are under `data/airports/`. Source IDs and original tags are preserved in the GeoJSON. There are no generated airport layouts or Google-derived coordinates. Relation geometries are not reconstructed; these particular queries returned node/way geometry. Building heights absent from OSM, facade materials and lighting remain visual assumptions, not surveyed measurements.

Show **© OpenStreetMap contributors** with a link to the [copyright page](https://www.openstreetmap.org/copyright). The geometry database is distributed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/); preserve attribution and applicable share-alike obligations when distributing derived databases. These local OSM assets can support a reproducible offline fallback, independently of Google's content restrictions. See the [OSMF licensing FAQ](https://osmfoundation.org/wiki/Licence_and_Legal_FAQ).

| Airport | Reference latitude, longitude | Reference elevation | Main runway |
|---|---|---|---|
| Craiova, LRCV / CRA | 44.318055556, 23.888611111 | 628 ft / 191.4144 m | 08/26, 2,500 × 45 m |
| Sibiu, LRSB / SBZ | 45.785833333, 24.085555556 | 1,520 ft / 463.296 m | 09/27, 2,630 × 45 m |

Craiova reference data is from [ROMATSA AIRAC amendment 04/24](https://aisro.ro/files/amdt/LR_Amdt_A_2024_04_en.pdf); the [13 June 2024 aerodrome chart](https://aisro.ro/aip/2025-12-25/DOCS/AIP/AD/AD2/AD_2_9_LRCV/LR_AD_2_LRCV_9-20_en.pdf) identifies runway 08/26. OSM way 13696278 still says 09/27: retain that raw source tag but display the official designation. Sibiu's reference is corroborated by [ROMATSA amendment 03/26](https://www.aisro.ro/files/amdt/LR_Amdt_A_2026_03_en.pdf); elevation and physical characteristics are in the [AIP published by Sibiu Airport](https://www.sibiuairport.ro/Content/MyWebSite/ImageMenu/9f6ac9a6-d557-4f0a-a81c-e604cd176c82LR_AD_2_LRSB_en.pdf). Some published PDFs are historical and ROMATSA archive links can expire; these references establish visualization anchors, not current operating conditions.

For animation, use actual OSM taxiway vertices from `data/airports/demo-geometry-anchors.json`. Craiova's terminal/apron is **south** of its runway; Sibiu's main terminal/apron is **north**. Craiova's mapped stand lead-ins lack official stand numbers, so their UI labels must be clearly demonstration labels. Sibiu includes named parking-position paths. Do not represent arbitrary straight lines across buildings as taxi routes.

## Optional Google Photorealistic 3D Tiles

A Google Cloud project needs billing, the Map Tiles API enabled and appropriate credentials. Restrict the key to the required API and intended local/presentation web origins; browser-delivered keys are visible to users and are not an authorization boundary for the application. The shared root `.env` enables maps in both environments; keep presentation-specific origins and authentication in the separate deployment settings. [Google setup and key restrictions](https://developers.google.com/maps/documentation/tile/get-api-key).

Romania appears in Google's supported-country list, but country support does not establish photogrammetric building coverage at either airport. Google's interactive coverage map distinguishes global terrain from locations with surface/building detail. Validate both airports visually at the intended camera height, and keep the OSM scene available when imagery is unavailable or unsuitable. [Country coverage](https://developers.google.com/maps/coverage), [3D coverage map](https://developers.google.com/maps/documentation/javascript/3d/coverage).

For EEA-billed projects created after 8 July 2025, or projects outside Google's defined “Unmodified State”, Photorealistic 3D Tiles and satellite 2D tiles are unavailable and can return HTTP 403. This is account/project dependent, not a blanket ban on viewing Romania. The existing presentation key returned HTTP 200 for the root tileset during implementation; that confirms technical access at that moment, not airport-level detail or universal availability to other developers. Google lists Maps JavaScript 3D as an alternative integration. [EEA Map Tiles changes](https://developers.google.com/maps/comms/eea/map-tiles).

Browser QA confirmed rendered Google coverage at both airports, including detailed buildings and vegetation at closer zoom. Distant views start with coarse detail. The Google capture dates are not established; some current OSM stand coordinates overlap vegetation or parked vehicles in the imagery. Keep source geometry independent rather than shifting it to match older imagery. Terrain raycasts can intersect baked objects as well as ground, so aircraft contact is illustrative rather than surveyed.

### Content handling and attribution

Do not bake Google tiles into repository assets, prefetch an airport for offline use, or build a persistent tile archive. Honor response cache headers and revalidation rules. The checked root response used `private, max-age=0, must-revalidate, no-transform`; it is unsuitable for a shared persistent cache.

Display the official **Google Maps** logo plus the sorted, combined `asset.copyright` credits from currently displayed glTF tiles. A static Google label alone omits provider credits. Keep the logo unobscured, 16–19 dp high, with required clear space. Label Google basemap and independent overlays distinctly. Independent aircraft/OSM overlays are permitted; extracting or tracing geometry from Google tiles is not.

Google's promotional-video permission is limited to a video of at most 30 seconds, with attribution and a promotional-purpose marking, without Street View. Use the OSM view for longer recorded demonstrations unless the applicable agreement permits otherwise. [Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies), [official logo assets](https://developers.google.com/static/maps/documentation/images/Google_Maps_Attribution_Assets.zip).

## ADSB.lol live aircraft

The public API is available under ODbL. Attribute the live feed separately as **Live aircraft: ADSB.lol (ODbL)**. The provider documents dynamic rate limits rather than a stable public requests-per-second quota; a future feeding/API-key requirement is possible. Use a shared backend fetch/cache per airport, bounded polling and backoff on rate limiting. Contact the provider for sustained production use. [Public API](https://www.adsb.lol/docs/open-data/api), [provider API repository](https://github.com/adsblol/api), [interactive API documentation](https://api.adsb.lol/docs).

The checked endpoint is `GET /v2/lat/{lat}/lon/{lon}/dist/{radius}`; radius is nautical miles, maximum 250. The downloaded OpenAPI schema is `data/airports/adsb-openapi.json`. A live request around Craiova returned HTTP 200 with `ac`, `now`, `total`, `ctime`, `ptime`, `msg`; its `now` was epoch **milliseconds**. Do not assume the wrapper has readsb's internal timestamp units. Optional fields can be absent or null; actual responses can include additional fields such as `dst` and `dir`.

| Field | Meaning / handling |
|---|---|
| `hex`, `flight`, `r`, `t` | Aircraft address, callsign, registration, type; callsign may contain padding |
| `lat`, `lon`, `seen_pos` | Position and position age; omit stale/missing positions or clearly mark stale state |
| `gs`, `track` | Knots and true track degrees; convert units explicitly |
| `alt_baro` | Pressure altitude in feet, or string `ground`; not height above terrain |
| `alt_geom` | GNSS/INS altitude in feet relative to the WGS84 ellipsoid; not exact AGL |
| `emergency`, `squawk` | Reported emergency/priority state and four-octal-digit transponder code |

The upstream emergency values include `none`, `general`, `lifeguard`, `minfuel`, `nordo`, `unlawful`, `downed`, `reserved`. Do not convert every non-empty string into an emergency: `none` and `reserved` require different handling. The `alert` bit is not itself proof of an emergency. Preserve the reported state and source time. [readsb field definitions](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

**No feed fields provide scheduled departure, actual gate opening, employee attendance, assigned agent or flight delay.** A stopped aircraft is not evidence of delay. Yellow/red delay colors require the local simulation or a separately integrated schedule/airport system. Live aircraft should remain neutral unless an explicitly sourced emergency/priority state is available; show delay as unknown. Simulated emergencies and reported emergencies must be distinguishable. NFC attendance and scenario events must never be described as ADS-B observations.

Feed coverage, latency and completeness vary; lack of an aircraft observation does not establish absence. The provider supplies data without accuracy or timeliness guarantees. [ADSB.lol privacy and license](https://www.adsb.lol/docs/privacy-license).

The live aircraft layer excludes explicit surface categories C1–C5 (vehicles and obstacles) and known ground types TWR/GND/GRND/SERV/EMER. A stationary or parked aircraft remains eligible. Unknown categories remain unknown. Sources: [ADS-B category definitions](https://support.adsbexchange.com/hc/en-us/articles/44705224053517-Emitter-Category-ADS-B-DO-260B-2-2-3-2-5-2), [tar1090 ground-type mappings](https://github.com/wiedehopf/tar1090/blob/master/html/markers.js#L1173-L1178).


## Regional live-view correction (1 November 2026)

The 25 NM feed covers a radius of approximately 46 km, so the live view frames the airport and all reported, positioned aircraft in three dimensions. It uses a 400 km far plane and a regional camera range; airport-only framing and selected-aircraft framing remain separate controls. The initial airport view previously clipped or excluded most en-route observations. A live verification returned an aircraft about 41 km away at 10.4 km altitude, illustrating why a runway-only camera was insufficient.

Live photorealistic overlays now convert WGS84 coordinates to ECEF and then to the exact east/up/south local frame used by the tile renderer. An automated check compares that transform with the installed renderer's `getObjectFrame` at both airports. Reported geometric altitude is used as ellipsoid altitude. Pressure altitude remains an approximate vertical position: the 40 m geoid approximation used for the airport origin does not turn pressure altitude into surveyed terrain clearance. Airborne observations never receive a terrain-raycast offset. Terrain contact is limited to reported ground aircraft and simulated ground movements. Unknown altitudes stay in the list without an invented map altitude.

A vertical connector makes an airborne observation's horizontal map position legible; its base uses the airport reference elevation (including Earth curvature in photorealistic mode), rather than a surveyed local ground height. The airport's ICAO/name anchor remains visible in regional framing. The offline model shows distance rings for context; it contains detailed OSM geometry only around the airport, while the optional photorealistic mode supplies the wider basemap. Neither view extrapolates ADS-B positions between provider samples.

Wheel gestures over the canvas, labels, map buttons, toolbar and attribution stay in the map. A native non-passive listener forwards overlay gestures to the same OrbitControls zoom path, rather than cancelling zoom or leaving page-scroll holes. Tests exercise actual OrbitControls, overlay bubbling and listener cleanup. Touch gestures are also contained by the map's touch-action boundary.
