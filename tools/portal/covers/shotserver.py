"""Serves dist/void-crazygames and saves PNGs POSTed to /save/<name>.png into tools/portal/covers/shots (cover capture only)."""
import base64, os, http.server, functools
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "shots"); os.makedirs(OUT, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        name = os.path.basename(self.path)
        data = self.rfile.read(int(self.headers["Content-Length"]))
        if data.startswith(b"data:"): data = base64.b64decode(data.split(b",", 1)[1])
        open(os.path.join(OUT, name), "wb").write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
root = os.path.join(HERE, "..", "..", "..", "dist", "void-crazygames")
http.server.ThreadingHTTPServer(("127.0.0.1", 5232), functools.partial(H, directory=root)).serve_forever()
