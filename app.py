"""VOID, a scroll-driven concept site for an all-black hypercar (shape inspired by the McLaren 765LT).

Everything (the 3D car, the launch, the configurator, the sound) runs in the browser;
this server only hands over the page. Asset URLs carry a version stamped from file
mtimes so a deploy never mixes old JavaScript with new CSS.
"""

import os

from flask import Flask, render_template

app = Flask(__name__)
import hubguard  # noqa: E402  (the owner's universal switches, kept in Cramly)
hubguard.install(app, "void")

ASSETS = ("main.js", "car.js", "sound.js", "world.js", "watch.js", "game.js", "interior.js", "city.js", "npc.js", "style.css")


def asset_version():
    return str(int(max(os.path.getmtime(os.path.join(app.static_folder, n)) for n in ASSETS)))


@app.route("/")
def index():
    return render_template("index.html", v=asset_version())


@app.route("/healthz")
def healthz():
    return {"ok": True}


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return resp


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5205)), debug=False)
