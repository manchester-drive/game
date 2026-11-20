"""Keep the exposed water surface after the game's road strokes are drawn over it."""
from shapely import make_valid
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from parts(child, kind)


def ring_points(ring):
    return [[round(x, 2), round(y, 2)] for x, y in ring.coords[:-1]]


def exposed_water(areas, roads):
    if not any(a["kind"] == "water" for a in areas) or not roads:
        return areas
    # Round caps and joins match the canvas carriageways, including where ways meet.
    surfaces = [LineString(r["points"]).buffer(r["width"] / 2, quad_segs=8) for r in roads]
    index = STRtree(surfaces)
    result = []
    for area in areas:
        if area["kind"] != "water":
            result.append(area)
            continue
        water = Polygon(area["points"], area.get("holes", []))
        if not water.is_valid:
            water = make_valid(water)
        crossings = index.query(water, predicate="intersects")
        if not len(crossings):
            result.append(area)
            continue
        water = water.difference(unary_union([surfaces[i] for i in crossings]))
        for part in parts(water, "Polygon"):
            clipped = {"kind": "water", "points": ring_points(part.exterior)}
            if part.interiors:
                clipped["holes"] = [ring_points(hole) for hole in part.interiors]
            result.append(clipped)
    return result
