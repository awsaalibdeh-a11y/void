"""Build VOID for game portals: dist/void-crazygames.zip and dist/void-poki.zip.

Portals want one self-contained folder: relative paths, no CDNs, no outside links. So this copies the game,
downloads three.js (and the addons it uses), PeerJS and the fonts into vendor/, drops hub.js (the Cramly
switches and the contact badge, which talk to other sites), and puts portal.js in front of main.js.
Downloads are cached in tools/portal/cache, so a rebuild works offline.

    python tools/portal/build.py
"""

import io
import os
import re
import shutil
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, "cache")
DIST = os.path.join(ROOT, "dist")
THREE = "https://cdn.jsdelivr.net/npm/three@0.160.0/"
PEER = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"
FONTS = ("https://fonts.googleapis.com/css2?family=Unbounded:wght@500;800;900"
         "&family=Inter:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@700&display=swap")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
PORTALS = ("crazygames", "poki")


def fetch(url):
    name = re.sub(r"[^A-Za-z0-9._-]", "_", url.split("//", 1)[1])[-150:]
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, "rb") as f:
        return f.read()


def three_files():
    """three.module.js plus every addon the game imports, following the addons' own relative imports."""
    out = {"three/build/three.module.js": fetch(THREE + "build/three.module.js")}
    todo = set()
    for n in os.listdir(os.path.join(ROOT, "static")):
        if n.endswith(".js"):
            src = open(os.path.join(ROOT, "static", n), encoding="utf-8").read()
            todo |= {"examples/jsm/" + m for m in re.findall(r'from\s+"three/addons/([^"]+)"', src)}
    while todo:
        rel = todo.pop()
        key = "three/" + rel
        if key in out:
            continue
        data = fetch(THREE + rel)
        out[key] = data
        for m in re.findall(r"""from\s+['"](\.{1,2}/[^'"]+)['"]""", data.decode("utf-8")):
            todo.add(os.path.normpath(os.path.join(os.path.dirname(rel), m)).replace("\\", "/"))
    return out


def font_files():
    """The Google Fonts stylesheet, cut to the Latin and Arabic sets, pointing at local woff2 copies."""
    css = fetch(FONTS).decode("utf-8")
    keep, files = [], {}
    for comment, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css):
        if comment not in ("latin", "latin-ext", "arabic"):
            continue
        url = re.search(r"url\((https://[^)]+)\)", block).group(1)
        name = "f" + str(len(files)) + ".woff2"
        files["fonts/" + name] = fetch(url)
        keep.append(block.replace(url, name))
    files["fonts/fonts.css"] = "\n".join(keep).encode("utf-8")
    return files


def page(portal, stamp):
    html = open(os.path.join(ROOT, "templates", "index.html"), encoding="utf-8").read()
    html = html.replace("{{ v }}", stamp).replace('"/static/', '"static/')
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>(<link rel="preconnect"[^>]*>)?', "", html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>', '<link rel="stylesheet" href="vendor/fonts/fonts.css">', html)
    html = html.replace('"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"', '"three": "./vendor/three/build/three.module.js"')
    html = html.replace('"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"', '"three/addons/": "./vendor/three/examples/jsm/"')
    html = re.sub(r'\s*<script src="static/hub\.js"[^>]*></script>', "", html)
    main = f"static/main.js?v={stamp}"
    html = html.replace(f'<script type="module" src="{main}"></script>',
                        f'<script>window.PORTAL = "{portal}"; window.VOID_MAIN = "{main}";</script>\n<script src="static/portal.js?v={stamp}"></script>')
    # the studio name on the loading screen (both portals allow that), with no link anywhere
    html = html.replace('<div class="ld-pct">', '<div class="ld-by" style="margin-top:14px;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.3em;opacity:.55">MADE BY LEGION</div>\n  <div class="ld-pct">', 1)
    for bad in ("https://", "http://", "mailto:", "hub.js", "{{", "{%"):
        rest = re.sub(r"data:[^\"')]+", "", html)
        rest = rest.replace("http://www.w3.org/2000/svg", "")
        assert bad not in rest, f"{portal}: {bad} left in the page"
    return html


def net_js():
    src = open(os.path.join(ROOT, "static", "net.js"), encoding="utf-8").read()
    old = 'async function lib() { if (!Peer) ({ Peer } = await import("https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm")); return Peer; }'
    new = ('async function lib() { if (!Peer) { await new Promise((ok, no) => { const s = document.createElement("script"); '
           's.src = "vendor/peerjs.min.js"; s.onload = ok; s.onerror = no; document.head.append(s); }); '
           'Peer = (window.peerjs && window.peerjs.Peer) || window.Peer; } return Peer; }')
    assert src.count(old) == 1, "net.js: the PeerJS loader changed, update build.py"
    return src.replace(old, new)


def build():
    stamp = str(int(time.time()))
    shared = {}
    for n in sorted(os.listdir(os.path.join(ROOT, "static"))):
        if n == "hub.js" or not n.endswith((".js", ".css")):
            continue
        shared["static/" + n] = open(os.path.join(ROOT, "static", n), "rb").read()
    shared["static/net.js"] = net_js().encode("utf-8")
    shared["static/portal.js"] = open(os.path.join(HERE, "portal.js"), "rb").read()
    for k, v in three_files().items():
        shared["vendor/" + k] = v
    shared["vendor/peerjs.min.js"] = fetch(PEER)
    for k, v in font_files().items():
        shared["vendor/" + k] = v
    for n, data in shared.items():
        if n.startswith("static/") and n.endswith(".js") and n != "static/net.js":
            assert b"cdn.jsdelivr" not in data, n

    os.makedirs(DIST, exist_ok=True)
    for portal in PORTALS:
        files = dict(shared, **{"index.html": page(portal, stamp).encode("utf-8")})
        folder = os.path.join(DIST, "void-" + portal)
        shutil.rmtree(folder, ignore_errors=True)
        for n, data in files.items():
            p = os.path.join(folder, n)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "wb").write(data)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for n, data in sorted(files.items()):
                z.writestr(n, data)
        open(os.path.join(DIST, f"void-{portal}.zip"), "wb").write(buf.getvalue())
        raw = sum(len(v) for v in files.values())
        print(f"{portal}: {len(files)} files, {raw / 1e6:.1f} MB raw, {len(buf.getvalue()) / 1e6:.1f} MB zipped -> dist/void-{portal}.zip")


if __name__ == "__main__":
    build()
