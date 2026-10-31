# Airport geometry provenance

Downloaded 2026-10-31 UTC / 2026-11-01 Europe/Bucharest from the public Overpass service at `https://overpass-api.de/api/interpreter`. Each JSON snapshot includes its own OSM database timestamp. Geometry is a public OpenStreetMap snapshot, not an aeronautical survey or a live airport layout.

© OpenStreetMap contributors. These OSM snapshots and the derived GeoJSON/database are available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution and license information must accompany redistribution. See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

Files:

- `craiova-osm.json`, `sibiu-osm.json`: aeroways, buildings and roads within the bounding boxes below, preserving original coordinates and tags.
- `*-context.json`: mapped land use, vegetation, water and major roads intersecting a 5 km radius. Whole ways are preserved, so some features extend beyond that radius. Queries are in `*-context.overpassql`.
- `airport-osm-identifiers.json`: source airport identifiers and OSM aerodrome tags.
- `demo-geometry-anchors.json`: selected OSM lead-in and taxiway geometry for demonstration animation, with source IDs. These are not routing clearances; unmapped stand names must remain demonstration labels.
- `adsb-openapi.json`: API schema downloaded from `https://api.adsb.lol/api/openapi.json`, not a snapshot of live aircraft.
- `build_geojson.py`: deterministic transformation to `frontend/public/airports/{craiova,sibiu}.geojson`; preserves tags and adds OSM source links. Only node and way geometries are included; no relation geometry is reconstructed.

Rebuild locally without network access:

```sh
python3 data/airports/build_geojson.py
```

Core query, replacing `BBOX` with south,west,north,east:

```overpassql
[out:json][timeout:35];
(
  nwr["aeroway"](BBOX);
  way["building"](BBOX);
  way["highway"](BBOX);
);
out geom;
```

| Airport | BBOX | Aerodrome way | Main runway way |
|---|---|---|---|
| Craiova / LRCV / CRA | 44.300,23.850,44.340,23.930 | 84575246 | 13696278 |
| Sibiu / LRSB / SBZ | 45.770,24.060,45.805,24.120 | 231704730 | 185216219 |

The Craiova source runway label is stale (`09/27`); official ROMATSA charts identify `08/26`. Raw OSM tags are retained for provenance. Correct the displayed runway name in airport metadata, not by silently rewriting the source snapshot. Sibiu's additional grass runway and displaced-threshold segments are separate source features.

Building footprints and surface outlines are mapped geometry. Heights without explicit source tags, facade appearance, lights and material choices are authored visualization assumptions. No Google imagery, meshes, textures, traced geometry or API keys are stored here. Further source and integration notes are in `docs/AIRPORT_3D_SOURCES.md`.
