"""Convert an OSM API map XML extract into the shared, offline game map."""
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

WEST, SOUTH, EAST, NORTH = -2.2450, 53.4769, -2.2275, 53.4855
SCALE = 5  # game pixels per metre
METRES_LAT = 111_300
METRES_LON = METRES_LAT * math.cos(math.radians((NORTH + SOUTH) / 2))
WIDTH = round((EAST - WEST) * METRES_LON * SCALE)
HEIGHT = round((NORTH - SOUTH) * METRES_LAT * SCALE)
CAR_ROADS = set("primary secondary tertiary unclassified residential living_street service".split())
PATHS = set("footway pedestrian path steps cycleway".split())

# Each leg follows the named OSM way from the preceding node to the given exit.
GARDENS_START = 889326225
GARDENS = [
    (165381945, 11080537014), (1193719603, 9229879183),  # Piccadilly
    (1050312118, 4830024), (1095281941, 10030640248), (3650048, 4830023),
    (1340157207, 2088290702), (246129165, 1828465859),  # Lever
    (171879650, 4843442), (81021292, 4830035),  # Faraday, Spear
    (1228406588, 6358514390), (246124650, 11285032001), (1228406587, 2072065889),
    (246124649, 2072065884), (246124717, 10056457738),  # Oldham
    (1098315482, 10048309046), (1097398916, GARDENS_START),
]
DALE_START = GARDENS_START
DALE = [
    *GARDENS[:5], (196371315, 4830027), (196371638, 277774005),
    (1019236052, 1825278031), (1226575033, 1827300884), (1228406595, 9494122588),
    (1228406597, 11391689251), (1019236053, 1827300885),
    (353289877, 3590723624), (171879650, 4843442), *GARDENS[8:],
]


def tags(element):
    return {tag.get("k"): tag.get("v") for tag in element.findall("tag")}


def project(node):
    return [round((float(node.get("lon")) - WEST) * METRES_LON * SCALE),
            round((NORTH - float(node.get("lat"))) * METRES_LAT * SCALE)]


def in_view(points):
    return (min(x for x, y in points) <= WIDTH and max(x for x, y in points) >= 0
            and min(y for x, y in points) <= HEIGHT and max(y for x, y in points) >= 0)


def car_access(t):
    return next((t[k] for k in ("motorcar", "motor_vehicle", "vehicle", "access") if k in t), "yes")


def road_width(t):
    try:
        return float(t["width"].removesuffix(" m"))
    except (KeyError, ValueError):
        pass
    if t.get("lanes", "").isdigit():
        return max(4.2, 3.2 * int(t["lanes"]))
    if t["highway"] in ("service", "living_street"):
        return 4
    # The narrow Little Lever Street carriageway runs between warehouse facades.
    if t.get("name") == "Little Lever Street":
        return 4
    if t["highway"] == "residential":
        return 4.8 if t.get("oneway") == "yes" else 5.6
    return 6.4


def assemble_rings(parts):
    rings = []
    while parts:
        ring = list(parts.pop())
        while ring[0] != ring[-1]:
            for i, part in enumerate(parts):
                if ring[-1] in (part[0], part[-1]):
                    parts.pop(i)
                    ring.extend((part if part[0] == ring[-1] else part[::-1])[1:])
                    break
            else:
                raise ValueError("Incomplete multipolygon in extract")
        rings.append(ring)
    return rings


def convert(source):
    root = ET.parse(source).getroot()
    nodes = {int(n.get("id")): project(n) for n in root.findall("node")}
    node_tags = {int(n.get("id")): tags(n) for n in root.findall("node") if n.find("tag") is not None}
    ways = {int(w.get("id")): ([int(n.get("ref")) for n in w.findall("nd")], tags(w))
            for w in root.findall("way")}
    roads, paths, areas, buildings, restrictions = [], [], [], [], []
    used_members = set()
    for rel in root.findall("relation"):
        t = tags(rel)
        members = rel.findall("member")
        if t.get("type") == "restriction" and "restriction" in t:
            refs = {m.get("role"): int(m.get("ref")) for m in members}
            restrictions.append((refs, t["restriction"]))
        if t.get("type") != "multipolygon" or not ("building" in t or t.get("name") == "Piccadilly Gardens"):
            continue
        parts = [int(m.get("ref")) for m in members if m.get("type") == "way"]
        if not parts or any(i not in ways for i in parts):
            continue
        rings = []
        for role in ("outer", "inner"):
            rings.extend(assemble_rings([ways[int(m.get("ref"))][0] for m in members
                                         if m.get("type") == "way" and m.get("role") == role]))
        points = [[nodes[n] for n in ring[:-1]] for ring in rings]
        if points and any(in_view(p) for p in points):
            if "building" in t:
                buildings.append(dict(name=t.get("name", ""), rings=points))
            else:
                areas.append(dict(kind="gardens", points=points[0]))
            used_members.update(parts)

    for wid, (refs, t) in ways.items():
        points = [nodes[n] for n in refs]
        if len(points) < 2 or not in_view(points) or int(t.get("layer", "0").split(";")[0] or 0) < 0:
            continue
        highway = t.get("highway")
        if wid not in used_members and refs[0] == refs[-1] and "building" in t and t["building"] not in ("no", "roof"):
            buildings.append(dict(name=t.get("name", ""), rings=[points[:-1]]))
        elif refs[0] == refs[-1] and wid not in used_members:
            kind = None
            if t.get("natural") == "water" or t.get("amenity") == "fountain":
                kind = "water"
            elif t.get("landuse") == "grass" or t.get("leisure") in ("park", "garden") or t.get("natural") == "grassland":
                kind = "green"
            elif highway in PATHS and t.get("area") == "yes":
                kind = "plaza"
            if kind:
                areas.append(dict(kind=kind, points=points[:-1]))
        if highway in CAR_ROADS and t.get("area") != "yes":
            roads.append(dict(id=wid, name=t.get("name", ""), width=round(road_width(t)*SCALE),
                              oneway={"yes": 1, "1": 1, "-1": -1}.get(t.get("oneway"), 0),
                              access=car_access(t), points=points))
        elif (highway in PATHS or t.get("railway") == "tram") and t.get("area") != "yes" and not t.get("indoor"):
            paths.append(dict(kind=t.get("railway", highway), points=points))

    road_ids = {r["id"] for r in roads}
    def route(start, legs):
        current, result = start, []
        previous = legs[-1][0]
        for wid, end in legs:
            refs, t = ways[wid]
            a, b = refs.index(current), refs.index(end)
            if (wid not in road_ids or car_access(t) not in ("yes", "permissive", "designated")
                or (a > b and t.get("oneway") in ("yes", "1")) or (a < b and t.get("oneway") == "-1")
                or any("conditional" in key for key in t)):
                raise ValueError(f"Check motorcar access and direction on way {wid}")
            for rel, rule in restrictions:
                if rel.get("from") == previous and rel.get("via") == current:
                    if (rule.startswith("only_") and rel.get("to") != wid or
                        rule.startswith("no_") and rel.get("to") == wid):
                        raise ValueError(f"Restricted turn from {previous} to {wid}")
            for n in refs[min(a,b):max(a,b)+1]:
                nt = node_tags.get(n, {})
                if nt.get("barrier") or car_access(nt) not in ("yes", "permissive", "designated"):
                    raise ValueError(f"Check access at route node {n}")
            result.append([wid, a, b])
            current, previous = end, wid
        if current != start:
            raise ValueError("Route is open")
        return result

    road_nodes = {n for wid in road_ids for n in ways[wid][0]}
    trees, furniture = [], []
    for n, t in node_tags.items():
        if (not in_view([nodes[n]]) or t.get("indoor") == "yes" or t.get("level", "0") != "0"
                or t.get("layer", "0") != "0" or t.get("location") == "underground"):
            continue
        if t.get("natural") == "tree":
            trees.append(nodes[n])
            continue
        if t.get("amenity") == "bench":
            kind = "bench"
        elif t.get("barrier") == "bollard" and t.get("bollard", "fixed") == "fixed":
            kind = "bollard"
        # Use pavement platforms for bus stop flags. A stop position on a road
        # centreline marks where the bus waits, not a physical pole.
        elif (t.get("highway") == "bus_stop" and t.get("public_transport") == "platform"
              and n not in road_nodes):
            kind = "busStop"
        elif t.get("information") == "guidepost":
            kind = "guidepost"
        elif t.get("amenity") == "waste_basket":
            kind = "bin"
        elif t.get("amenity") == "post_box" and t.get("post_box:type") == "pillar":
            kind = "postBox"
        elif t.get("barrier") == "planter":
            kind = "planter"
        else:
            continue
        furniture.append(dict(kind=kind, x=nodes[n][0], y=nodes[n][1]))
    # Kerbs and adjacent pavement nodes for the three animated crossings.
    crossings = []
    for wid, pavement_a, pavement_b in [(1024403309, 9229820695, 9229909861),
                                        (1218089232, 14109073522, 14109073521),
                                        (1218089213, 14109073512, 14109073518)]:
        refs, t = ways[wid]
        a, centre, b = [nodes[n] for n in refs]
        crossings.append(dict(centre=centre, signal=t.get("crossing") == "traffic_signals",
                              walk=[a, b, nodes[pavement_b], b, a, nodes[pavement_a]]))
    return dict(width=WIDTH, height=HEIGHT, roads=roads, paths=paths, areas=areas,
                buildings=buildings, trees=trees, furniture=furniture,
                routes=[route(GARDENS_START, GARDENS), route(DALE_START, DALE)],
                crossings=crossings,
                garden_walks=[[nodes[n] for n in ways[wid][0]]
                              for wid in (75313268, 615021014, 1582334428)])


if __name__ == "__main__":
    data = convert(sys.argv[1])
    output = Path(__file__).resolve().parents[1] / "src" / "game" / "manchester-map.ts"
    with output.open("w") as f:
        f.write("// Map data © OpenStreetMap contributors: https://www.openstreetmap.org/copyright\n")
        f.write("// ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/\n")
        f.write("// Generated by scripts/import-map.py.\n")
        f.write('import type { MapData } from "./map-types";\n')
        for key, value in data.items():
            rows = [json.dumps(v, separators=(",", ":"), ensure_ascii=False) for v in value] if isinstance(value, list) else None
            literal = "[\n" + ",\n".join(rows) + "\n]" if rows is not None else str(value)
            f.write(f"export const {key}: MapData['{key}'] = {literal};\n")
