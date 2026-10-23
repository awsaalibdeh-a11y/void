"""Turn OpenStreetMap extracts of al-Tubaishi, Dammam (static API "map" tiles, t*.osm) into
static/tubaishi.json for VOID: building footprints with estimated heights, roads with widths,
parks, the sea (from the coastline), mosques, and a clear east-west strip for the stunt track.

    python tools/osm_build.py <folder with t1.osm..t4.osm>

Map data (c) OpenStreetMap contributors, ODbL. Credited on the site."""
import glob, json, math, os, sys, zlib
import xml.etree.ElementTree as ET

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "static", "tubaishi.json")
LAT0, LON0 = 26.432, 50.125                     # al-Tubaishi
KX, KZ = 111320 * math.cos(math.radians(LAT0)), 110540
WIDTH = {"motorway": 22, "trunk": 18, "primary": 16, "secondary": 12, "tertiary": 10, "unclassified": 8, "residential": 7,
         "motorway_link": 9, "trunk_link": 8, "primary_link": 8, "secondary_link": 7, "tertiary_link": 7, "service": 4.5, "living_street": 5}
AREA = (-1400, 3300, -1900, 1700)               # x0, x1, z0, z1 around Tubaishi and the corniche

nodes, ways, pnodes = {}, {}, []
for f in sorted(glob.glob(os.path.join(SRC, "t*.osm"))):
    for ev, el in ET.iterparse(f):
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lat")), float(el.get("lon")))
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            if tags.get("amenity") == "place_of_worship": pnodes.append((el.get("id"), tags))
        elif el.tag == "way":
            ways[el.get("id")] = ([n.get("ref") for n in el.findall("nd")], {t.get("k"): t.get("v") for t in el.findall("tag")})
        if el.tag in ("node", "way", "relation"): el.clear()

xy = lambda r: ((nodes[r][1] - LON0) * KX, -(nodes[r][0] - LAT0) * KZ)
inside = lambda x, z: AREA[0] <= x <= AREA[1] and AREA[2] <= z <= AREA[3]
def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2
def centroid(p):
    return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)
def pip(x, z, p):
    c = False
    for i in range(len(p)):
        (x1, z1), (x2, z2) = p[i], p[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c

buildings, roads, parks, coast = [], [], [], {}
for wid, (refs, t) in ways.items():
    pts = [xy(r) for r in refs if r in nodes]
    if len(pts) < 2: continue
    if "building" in t and len(pts) >= 4 and pts[0] == pts[-1]:
        p = pts[:-1]; cx, cz = centroid(p)
        if not inside(cx, cz): continue
        a = area(p); h0 = zlib.crc32(wid.encode()) % 1000 / 1000      # a stable "random" per building
        lv = t.get("building:levels")
        if t.get("height", "").replace(".", "").isdigit(): h = float(t["height"])
        elif lv and lv.isdigit(): h = int(lv) * 3.4 + 1
        elif a < 150: h = 4 + h0 * 3
        elif a < 600: h = 7 + h0 * 4                                         # villas: two or three floors
        elif a < 2000: h = 10 + h0 * 9                                       # apartment blocks
        else: h = 12 + h0 * 14
        kind = "mosque" if t.get("building") == "mosque" or t.get("amenity") == "place_of_worship" else ("big" if a >= 2000 or t.get("building") in ("commercial", "industrial", "warehouse", "school") else "house")
        buildings.append({"p": [[round(x, 1), round(z, 1)] for x, z in p], "h": round(h, 1), "k": kind, "c": int(h0 * 6)})
    elif t.get("highway") in WIDTH:
        if not any(inside(x, z) for x, z in pts): continue
        roads.append({"p": [[round(x, 1), round(z, 1)] for x, z in pts], "w": WIDTH[t["highway"]], "t": t["highway"], "n": t.get("name:en") or t.get("name") or ""})
    elif (t.get("leisure") in ("park", "garden", "pitch", "playground", "stadium") or t.get("landuse") in ("grass", "recreation_ground")) and pts[0] == pts[-1]:
        parks.append({"p": [[round(x, 1), round(z, 1)] for x, z in pts[:-1]], "k": t.get("leisure") or t.get("landuse"), "n": t.get("name:en") or ""})
    elif t.get("natural") == "coastline":
        coast[wid] = pts

# stitch the coastline ways end to end, then close it far out to sea (the Gulf is north of the shore here)
segs = list(coast.values()); line = segs.pop(0)
while segs:
    for i, s in enumerate(segs):
        if math.dist(s[0], line[-1]) < 1: line += s[1:]; segs.pop(i); break
        if math.dist(s[-1], line[0]) < 1: line = s + line[1:]; segs.pop(i); break
    else: break
xs = [p[0] for p in line]
sea = [[round(x, 1), round(z, 1)] for x, z in line] + [[round(xs[-1]), -12000], [round(xs[0]), -12000]]
in_sea = lambda x, z: pip(x, z, sea)

mosques = []
for b in buildings:
    if b["k"] == "mosque": mosques.append([*map(lambda v: round(v, 1), centroid(b["p"])), round(math.sqrt(area(b["p"])), 1), b["h"]])
for nid, t in pnodes:
    x, z = xy(nid)
    if inside(x, z) and not any(math.dist((x, z), m[:2]) < 40 for m in mosques):
        host = next((b for b in buildings if pip(x, z, b["p"])), None)
        if host: host["k"] = "mosque"
        mosques.append([round(x, 1), round(z, 1), round(math.sqrt(area(host["p"])), 1) if host else 22, host["h"] if host else 8])

# the stunt strip: 220 m east-west and 34 m wide with no buildings, roads or sea in it, as close to the corniche as possible
bbox = [(min(q[0] for q in b["p"]), max(q[0] for q in b["p"]), min(q[1] for q in b["p"]), max(q[1] for q in b["p"])) for b in buildings]
road_pts = [(x, z, r["w"]) for r in roads for (x, z) in r["p"]]
for r in roads:                                        # densify roads so short crossings are caught
    for (x1, z1), (x2, z2) in zip(r["p"], r["p"][1:]):
        n = int(math.dist((x1, z1), (x2, z2)) // 8)
        for k in range(1, n): road_pts.append((x1 + (x2 - x1) * k / n, z1 + (z2 - z1) * k / n, r["w"]))
APEX = min(line, key=lambda p: -p[1])                 # the shore's southernmost point, the corniche
best = None
cands = sorted(((math.dist((gx, gz), APEX), gx, gz) for gx in range(AREA[0] + 100, AREA[1] - 250, 15) for gz in range(AREA[2] + 60, AREA[3] - 60, 15)))
for d, gx, gz in cands:                                # nearest to the corniche first; the first clear one wins
    x0, x1, z0, z1 = gx - 75, gx + 150, gz - 15, gz + 19
    if any(in_sea(x, z) for x in (x0, gx, x1) for z in (z0, z1)): continue
    if any(not (b[1] < x0 or b[0] > x1 or b[3] < z0 or b[2] > z1) for b in bbox): continue
    if any(x0 - w / 2 < x < x1 + w / 2 and z0 - w / 2 < z < z1 + w / 2 for x, z, w in road_pts): continue
    best = (d, gx, gz); break
_, OX, OZ = best
print("stunt strip at", OX, OZ, "distance to corniche", round(best[0]), "m")

shift = lambda p: [[round(x - OX, 1), round(z - OZ, 1)] for x, z in p]
data = {
    "credit": "Map data (c) OpenStreetMap contributors, ODbL",
    "origin": [LAT0 - OZ / KZ, LON0 + OX / KX],
    "bounds": [AREA[0] - OX, AREA[1] - OX, AREA[2] - OZ, AREA[3] - OZ],
    "buildings": [{**b, "p": shift(b["p"])} for b in buildings],
    "roads": [{**r, "p": shift(r["p"])} for r in roads],
    "parks": [{**p, "p": shift(p["p"])} for p in parks],
    "sea": shift(sea), "coast": shift(line),
    "mosques": [[round(m[0] - OX, 1), round(m[1] - OZ, 1), m[2], m[3]] for m in mosques],
}
with open(OUT, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(len(buildings), "buildings", len(roads), "roads", len(parks), "parks", len(mosques), "mosques", os.path.getsize(OUT) // 1024, "KB")
print("parks:", [(p["k"], p["n"], [round(v) for v in centroid(p["p"])]) for p in data["parks"]])
