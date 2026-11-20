"""Geometry shared by the city-centre and M60 importers (five pixels per metre)."""
import math
import re

WEST, SOUTH, EAST, NORTH = -2.2450, 53.4769, -2.2275, 53.4855
SCALE = 5
METRES_LAT = 111_300
METRES_LON = METRES_LAT * math.cos(math.radians((NORTH + SOUTH) / 2))
WIDTH = round((EAST - WEST) * METRES_LON * SCALE)
HEIGHT = round((NORTH - SOUTH) * METRES_LAT * SCALE)
MAIN_ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary"}
CAR_ROADS = MAIN_ROADS | {h + "_link" for h in MAIN_ROADS} | {
    "unclassified", "residential", "living_street", "service", "road", "busway", "bus_guideway"
}
PATHS = {"footway", "pedestrian", "path", "steps", "cycleway", "bridleway"}


def xy(lon, lat):
    return [round((lon - WEST) * METRES_LON * SCALE), round((NORTH - lat) * METRES_LAT * SCALE)]


def metres(value):
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(?:m)?", value or "")
    if match and 0 < float(match[1]) <= 80:
        return float(match[1])


def road(wid, tags, points):
    h = tags["highway"]
    implicit_oneway = h == "motorway" or tags.get("junction") == "roundabout"
    oneway = {"yes": 1, "true": 1, "1": 1, "-1": -1}.get(
        tags.get("oneway"), int(implicit_oneway and "oneway" not in tags))
    lanes = int(tags["lanes"]) if tags.get("lanes", "").isdigit() else 0
    width = metres(tags.get("width")) or metres(tags.get("width:carriageway"))
    if width is None:
        if lanes:
            width = max(4.2, min(lanes, 12) * (3.5 if h == "motorway" else 3.2))
        elif h in ("service", "living_street") or tags.get("name") == "Little Lever Street":
            width = 4
        elif h == "residential":
            width = 4.8 if oneway else 5.6
        elif h == "motorway":
            width = 10.5
        else:
            width = 4.5 if oneway and h.endswith("_link") else 6.4
    layer = tags.get("layer", "").split(";")[0]
    level = int(layer) if re.fullmatch(r"-?\d+", layer) else (
        1 if tags.get("bridge", "no") != "no" else -1 if tags.get("tunnel", "no") != "no" else 0)
    return dict(id=wid, name=tags.get("name") or tags.get("ref", ""), width=round(width*SCALE),
                oneway=oneway, access=car_access(tags), layer=level, lanes=lanes, points=points)


def car_access(t):
    return next((t[k] for k in ("motorcar", "motor_vehicle", "vehicle", "access") if k in t), "yes")


def mapped_path(t, points):
    default = {"pedestrian": 5, "steps": 1.5, "cycleway": 2.5}.get(t.get("highway"), 1.5)
    path = dict(kind=t.get("railway") or t["highway"], points=points,
                width=round((metres(t.get("width")) or default) * SCALE))
    if t.get("name") and t.get("highway") in PATHS:
        path["name"] = t["name"]
    return path
