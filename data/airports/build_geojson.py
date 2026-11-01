"""Rebuild display GeoJSON from the attributed Overpass snapshots in this folder.

No coordinates are inferred from imagery. All OSM tags remain on each feature.
Run: python3 data/airports/build_geojson.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "airports"
OUT = ROOT / "frontend" / "public" / "airports"
AIRPORTS = {
    "craiova": {"icao": "LRCV", "iata": "CRA", "reference": [23.888611111, 44.318055556], "elevation_m": 191.4144},
    "sibiu": {"icao": "LRSB", "iata": "SBZ", "reference": [24.085555556, 45.785833333], "elevation_m": 463.296},
}


def convert(element):
    tags = element.get("tags", {})
    if element["type"] == "node":
        geometry = {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
    elif element["type"] == "way" and element.get("geometry"):
        coordinates = [[p["lon"], p["lat"]] for p in element["geometry"]]
        # Closed linear taxi/runway/road ways stay linear unless explicitly areas.
        closed = len(coordinates) >= 4 and coordinates[0] == coordinates[-1]
        area = tags.get("area") == "yes" or (
            tags.get("area") != "no" and (
                tags.get("building", "no") != "no"
                or tags.get("aeroway") in {"aerodrome", "apron", "terminal", "hangar", "helipad"}
                or "landuse" in tags or "natural" in tags
            )
        )
        geometry = {"type": "Polygon" if closed and area else "LineString", "coordinates": [coordinates] if closed and area else coordinates}
    else:
        # Snapshot queries contain no relevant multipolygon relations. Do not
        # fabricate topology for unsupported relation member fragments.
        return None
    return {
        "type": "Feature",
        "id": f"{element['type']}/{element['id']}",
        "properties": {
            **tags,
            "osm_type": element["type"],
            "osm_id": element["id"],
            "source_url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}",
        },
        "geometry": geometry,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for airport, metadata in AIRPORTS.items():
        raw = json.loads((DATA / f"{airport}-osm.json").read_text())
        elements = {(e["type"], e["id"]): e for e in raw["elements"]}
        context = DATA / f"{airport}-context.json"
        if context.exists():
            elements.update({(e["type"], e["id"]): e for e in json.loads(context.read_text())["elements"]})
        features = [feature for e in elements.values() if (feature := convert(e))]
        output = {
            "type": "FeatureCollection",
            "name": f"{airport.title()} airport and surroundings",
            "airport": metadata,
            "attribution": "© OpenStreetMap contributors",
            "license": "https://opendatacommons.org/licenses/odbl/1-0/",
            "source": "https://www.openstreetmap.org/copyright",
            "osm_timestamp": raw["osm3s"]["timestamp_osm_base"],
            "features": features,
        }
        path = OUT / f"{airport}.geojson"
        path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{path.relative_to(ROOT)}: {len(features)} features, {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
