// VOID: one WebGL canvas, three modes on top of a showroom home screen.
//   Watch: a 48 s film whose clock is the music.  Play: drive it, fly it, land it.  Build: paint it.
import * as THREE from "three";

const V = new URL(import.meta.url).search;
const $ = id => document.getElementById(id);
const setLoad = p => { $("ldbar").style.width = p + "%"; $("ldpct").textContent = Math.round(p); };
setLoad(15);
const [{ createWorld, clamp, lerp, smooth, frame, PAD_R, ZONES }, { buildCar, MODELS }, { addInterior, HEAD }, { Sound, BAR }, { createWatch, TOTAL, CHAPTERS }, { createGame }, { createLife }] = await Promise.all(
  ["world", "car", "interior", "sound", "watch", "game", "npc"].map(n => import(`./${n}.js${V}`)));
const [{ createPolice }, { createRaces }, { createNet, EMOTES }, { createNav }] = await Promise.all(["police", "race", "net", "nav"].map(n => import(`./${n}.js${V}`)));
setLoad(40);

const COARSE = matchMedia("(pointer: coarse)").matches, REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const W = await createWorld($("gl"), COARSE), { renderer, scene, camera, composer, bloom, camLight, fx } = W;
setLoad(55);

// the car you drive: a fixed root the game and the film move around, with the chosen model swapped inside it
const carRoot = new THREE.Group(); scene.add(carRoot);
const car = { group: carRoot, wheels: [] };
const carMats = new Set();
let inner = null;
function useModel(id, force) {
  if (inner && inner.model === id && !force) return;
  if (inner) carRoot.remove(inner.group);
  inner = buildCar(id); carRoot.add(inner.group);
  for (const k of Object.keys(inner)) if (typeof inner[k] === "function") car[k] = inner[k];
  Object.assign(car, { wheels: inner.wheels, clip: car.clip || inner.clip, materials: inner.materials, model: id, name: inner.name });
  carMats.clear();
  inner.group.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material && o.material.isMeshStandardMaterial) carMats.add(o.material); } });
  for (const m of carMats) { m.envMap = null; m.needsUpdate = true; }   // the paint reflects the city capture (scene.environment)     // phones skip the live cube and use the city reflection
}
// live reflections on the paint: a small cube camera that rides with the car
const carEnv = new THREE.WebGLCubeRenderTarget(COARSE ? 64 : 128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const carCube = new THREE.CubeCamera(.5, 320, carEnv);
for (const c of carCube.children) c.layers.set(0);
camera.layers.enable(1);                      // layer 1: the crowds, seen by the main camera only
let cubeN = 0;
useModel((store.get("void.build3") || {}).model != null ? Object.keys(MODELS)[(store.get("void.build3") || {}).model] || "hydra" : "hydra");
setLoad(80);
const interior = addInterior(car, renderer);
const sound = new Sound();
const watch = createWatch(W, car, interior);
const life = createLife(scene, W.roads, W.walkways, COARSE);
const TIMES = ["night", "sunset", "day"];
function cycleTime() { const k = TIMES[(TIMES.indexOf(W.timeOfDay) + 1) % 3]; W.setTime(k); store.set("void.time", k); toast({ night: "Night in the city", sunset: "Golden hour", day: "Daytime" }[k]); cubeN = 0; }
let police, races, nav;
const net = createNet();
setInterval(() => { if (document.hidden) net.tick(.5, null); }, 500);     // a hosting tab in the background still relays everyone
const game = createGame(W, car, sound, life, {
  garage: () => openGarage(true), cycleTime, hornType: () => build.horn,
  onSmash: kind => police && police.event("smash", kind), policeClear: () => police && police.clear(),
  autopilot: (g, dt, over) => nav ? nav.controls(g, dt, over) : null, openGps: () => document.getElementById("gGpsBtn").click(),
  mapExtra(mx, g, MM) {
    const P = (x, z) => [(x - g.x) / MM, (z - g.z) / MM];
    if (nav && nav.pts.length > 1) { mx.strokeStyle = "#3dfcff"; mx.lineWidth = 3; mx.beginPath(); nav.pts.forEach(([x, z], k) => { const [a, b] = P(x, z); k ? mx.lineTo(a, b) : mx.moveTo(a, b); }); mx.stroke(); }
    if (police) for (const c of police.cops) if (c.on) { const [a, b] = P(c.x, c.z); mx.fillStyle = Math.sin(performance.now() / 90) > 0 ? "#ff3040" : "#3060ff"; mx.beginPath(); mx.arc(a, b, 4, 0, 7); mx.fill(); }
    if (races && races.race && races.race.next) { const [a, b] = P(races.race.next[0], races.race.next[2]); mx.strokeStyle = "#ffd23d"; mx.lineWidth = 3; mx.beginPath(); mx.arc(a, b, 7, 0, 7); mx.stroke(); }
    for (const r of remotes.values()) if (r.at) { const [a, b] = P(r.at.x, r.at.z); mx.fillStyle = "#c07dff"; mx.beginPath(); mx.arc(a, b, 4.5, 0, 7); mx.fill(); }
  },
});
// phones: the row of buttons folds into a menu behind "More", which closes again after a choice
{ const more = document.getElementById("gMore"); more.onclick = () => { const on = !document.body.classList.contains("g-more"); document.body.classList.toggle("g-more", on); more.setAttribute("aria-expanded", on); };
  document.querySelector(".g-btns").addEventListener("click", e => { const b = e.target.closest("button"); if (b && b.id !== "gMore") document.body.classList.remove("g-more"); }); }
police = createPolice(scene, game.api, sound, life);
races = createRaces(scene, game.api, sound, W.canvasTex, net);
nav = createNav(scene, game.api, W, ZONES, races.starts);

// ---------- online: other real players' cars, name tags, emotes, proximity voice ----------
const remotes = new Map();
const tagTex = (text, col = "#ffffff") => W.canvasTex(512, 96, (g, w, h) => { g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, w, h); g.fillStyle = col; g.font = "800 50px Inter, sans-serif"; g.textAlign = "center"; g.fillText(text, w / 2, 66); });
function remoteFor(p) {
  let r = remotes.get(p.id);
  const model = Object.keys(MODELS)[p.model | 0] || "hydra";
  if (r && r.model !== model) { scene.remove(r.root); remotes.delete(p.id); r = null; }
  if (!r) {
    const c = buildCar(model), root = new THREE.Group(); root.add(c.group); c.setReveal(1); c.setThrust(0, 0, 0, 0); c.setWings(0, 0);
    c.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(p.name), depthTest: false, toneMapped: false })); tag.scale.set(5, .95, 1); tag.position.y = 2.6; root.add(tag);
    const emo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex(""), depthTest: false, toneMapped: false })); emo.scale.set(6, 1.15, 1); emo.position.y = 3.8; emo.visible = false; root.add(emo);
    scene.add(root); r = { root, car: c, tag, emo, model, name: p.name, paint: null, emoT: 0 }; remotes.set(p.id, r);
  }
  if (r.name !== p.name) { r.name = p.name; r.tag.material.map = tagTex(p.name); }
  if (p.paint && r.paint !== p.paint) { r.paint = p.paint; r.car.setPaint(p.paint); }
  return r;
}
net.on("change", () => { for (const id of [...remotes.keys()]) if (!net.players().some(p => p.id === id)) { scene.remove(remotes.get(id).root); remotes.delete(id); } renderPlayers(); });
net.on("status", t => { document.getElementById("gNetStatus").textContent = t; document.getElementById("gNetBtn").classList.toggle("on", net.online()); });
net.on("mic", on => { const b = document.getElementById("gMic"); b.classList.toggle("on", on); b.textContent = on ? "🎙 Mic on" : "🎙 Voice chat"; });
net.on("emote", (m, from) => { const r = remotes.get(from), e = EMOTES[m.e | 0]; if (r) { r.emo.material.map = tagTex(e, "#ffd23d"); r.emo.visible = true; r.emoT = 4; } feed(`${net.nameOf(from)}: ${e}`); });
function feed(t) { const f = document.getElementById("gFeed"); const d = document.createElement("div"); d.textContent = t; f.prepend(d); setTimeout(() => d.remove(), 7000); while (f.children.length > 5) f.lastChild.remove(); }
function renderPlayers() { document.getElementById("gPlayers").innerHTML = net.online() ? [`<b>${net.name} (you)</b>`, ...net.players().map(p => `<span>${p.vc ? "🎙 " : ""}${p.name}</span>`)].join("") : ""; }
{
  const $ = id => document.getElementById(id), panel = $("gNetPanel");
  $("gNetName").value = store.get("void.name") || "";
  $("gNetBtn").onclick = () => { panel.hidden = !panel.hidden; };
  $("gNetClose").onclick = () => panel.hidden = true;
  const go = room => { const nm = $("gNetName").value; store.set("void.name", nm); net.join(room, nm); panel.hidden = true; };
  $("gNetPublic").onclick = () => go("public-1");
  $("gNetCreate").onclick = () => { const code = Math.random().toString(36).slice(2, 7); $("gNetCode").value = code; go("room-" + code); toast(`Room code: ${code}. Tell your friends!`); };
  $("gNetJoin").onclick = () => { const code = $("gNetCode").value.trim().toLowerCase(); if (code) go("room-" + code); };
  $("gNetLeave").onclick = () => { net.leave(); panel.hidden = true; };
  $("gMic").onclick = () => net.setMic(!net.mic);
  $("gEmotes").innerHTML = EMOTES.map((e, k) => `<button class="pill" data-e="${k}">${e}</button>`).join("");
  $("gEmotes").onclick = ev => { const b = ev.target.closest("[data-e]"); if (!b || !net.online()) return; net.send({ t: "emote", e: +b.dataset.e }); feed(`You: ${EMOTES[+b.dataset.e]}`); };
}
W.setTime(store.get("void.time") || "night");
// fill the car's reflection cube once before the first frame, so the paint never samples an empty one

$("osmCredit").textContent = W.credit;
// the garage: the Build panel over the game, the game paused underneath
function openGarage(on) { document.body.classList.toggle("garage", on); game.pause(on); if (on && car.repair) { car.repair(); applyBuild(); } }
$("gGarageClose").onclick = () => openGarage(false);
const nozzles = (car.nozzles || [[.9, .3, 1], [.9, .3, -1], [-.95, .38, 1], [-.95, .38, -1]]).map(([x, y, s]) => new THREE.Vector3(x, y - .5, s));

// ---------- configurator ----------
const OPTS = {
  paint: { label: "Paint", items: [["Void Black", "#0a0a0c"], ["Stealth Grey", "#2b2d32"], ["Liquid Silver", "#9fa3aa"], ["Ghost White", "#e9e9ea"], ["Blood Red", "#6f0a12"], ["Ember Orange", "#c9480c"], ["Ion Blue", "#123a8c"], ["Venom Green", "#2d6a1e"]] },
  finish: { label: "Finish", seg: true, items: [["Gloss", "gloss"], ["Satin", "satin"], ["Matte", "matte"]] },
  rim: { label: "Wheels", items: [["Black", "#121215"], ["Gunmetal", "#3a3d44"], ["Silver", "#b8bcc4"], ["Bronze", "#7a5a32"]] },
  cal: { label: "Calipers", items: [["Red", "#c1121f"], ["Black", "#2a2a30"], ["Yellow", "#e0b000"], ["White", "#e8e8e8"], ["Ion", "#3df5ff"]] },
  trim: { label: "Accents", items: [["Red", "#c1121f"], ["Black", "#16161a"], ["White", "#e8e8e8"], ["Gold", "#b8912e"], ["Ion", "#3df5ff"]] },
  light: { label: "Lights", items: [["Ice", "#e8fbff"], ["Amber", "#ffb347"], ["Ion", "#6ad8ff"], ["Violet", "#b38cff"]] },
  glow: { label: "Underglow", items: [["Off", ""], ["White", "#ffffff"], ["Red", "#ff2233"], ["Ion", "#3df5ff"], ["Violet", "#9b5cff"]] },
  spoiler: { label: "Spoiler", seg: true, items: [["Stock", "none"], ["Ducktail", "ducktail"], ["GT wing", "gt"], ["Swan neck", "swan"], ["Rally", "rally"]] },
  livery: { label: "Livery", seg: true, items: [["Clean", "none"], ["Twin stripes", "stripes"], ["Centre stripe", "center"], ["Side stripe", "side"], ["Race #42", "race"]] },
  livc: { label: "Livery colour", items: [["White", "#f2f2f2"], ["Red", "#c1121f"], ["Black", "#101012"], ["Gold", "#c9a227"], ["Ion", "#3df5ff"], ["Orange", "#ff6a00"]] },
  tint: { label: "Windows", seg: true, items: [["Light", "light"], ["Dark", "dark"], ["Limo", "limo"], ["Mirror", "mirror"]] },
  flame: { label: "Nitro flames", items: [["Blue", "#4fa8ff"], ["Orange", "#ff7a1a"], ["Green", "#3dff6a"], ["Purple", "#b05cff"], ["Pink", "#ff4fd8"]] },
  horn: { label: "Horn", seg: true, items: [["Classic", 0], ["Air horn", 1], ["Tune", 2]] },
};
OPTS.model = { label: "Car", seg: true, items: Object.entries(MODELS).map(([k, m]) => [m.name, k]) };
const DEFAULT = { model: 0, paint: 0, finish: 0, rim: 0, cal: 0, trim: 0, light: 0, glow: 0, spoiler: 0, livery: 0, livc: 0, tint: 1, flame: 0, horn: 0 };
let build = { ...DEFAULT, ...(store.get("void.build2") || {}), ...(store.get("void.build3") || {}) };
try { const h = new URLSearchParams(location.hash.slice(1)).get("b"); if (h) { const v = h.split(".").map(Number); Object.keys(DEFAULT).forEach((k, i) => { if (OPTS[k].items[v[i]]) build[k] = v[i]; }); } } catch { }
function applyBuild() {
  useModel(OPTS.model.items[build.model][1]);
  car.setSpoiler(OPTS.spoiler.items[build.spoiler][1]); car.setLivery(OPTS.livery.items[build.livery][1], OPTS.livc.items[build.livc][1]);
  car.setTint(OPTS.tint.items[build.tint][1]); car.setFlameColor(OPTS.flame.items[build.flame][1]);
  car.setPaint(OPTS.paint.items[build.paint][1]); car.setFinish(OPTS.finish.items[build.finish][1]);
  car.setRim(OPTS.rim.items[build.rim][1]); car.setAccent(OPTS.cal.items[build.cal][1]); car.setTrim(OPTS.trim.items[build.trim][1]); car.setLight(OPTS.light.items[build.light][1]);
  const gl = OPTS.glow.items[build.glow][1]; if (gl) fx.glow.material.color.set(gl).multiplyScalar(1.4);
  store.set("void.build3", build);
  $("sum").innerHTML = `<b>${car.name.toUpperCase()} &middot; ${OPTS.paint.items[build.paint][0]}</b>${OPTS.spoiler.items[build.spoiler][0]} spoiler, ${OPTS.livery.items[build.livery][0].toLowerCase()} livery, ${OPTS.finish.items[build.finish][0]} paint, ${OPTS.rim.items[build.rim][0].toLowerCase()} wheels, ${OPTS.cal.items[build.cal][0].toLowerCase()} calipers, ${OPTS.trim.items[build.trim][0].toLowerCase()} accents, ${OPTS.light.items[build.light][0].toLowerCase()} lights${gl ? ", " + OPTS.glow.items[build.glow][0].toLowerCase() + " underglow" : ""}`;
  for (const b of document.querySelectorAll("#cfgBody button")) b.setAttribute("aria-pressed", String(build[b.dataset.k] === +b.dataset.i));
  for (const k in OPTS) { const n = document.querySelector(`[data-name="${k}"]`); if (n) n.textContent = OPTS[k].items[build[k]][0]; }
}
const ORDER = ["model", "paint", "finish", "livery", "livc", "spoiler", "rim", "cal", "trim", "tint", "light", "glow", "flame", "horn"];
$("cfgBody").innerHTML = ORDER.map(k => [k, OPTS[k]]).map(([k, o]) => `<div class="grp"><div class="grp-h">${o.label}<b data-name="${k}"></b></div><div class="${o.seg ? "seg" : "sw"}">${o.items.map(([n, c], i) => o.seg
  ? `<button data-k="${k}" data-i="${i}">${n}</button>`
  : `<button data-k="${k}" data-i="${i}" title="${n}" aria-label="${o.label}: ${n}" style="background:${c || "repeating-linear-gradient(45deg,#222 0 4px,#111 4px 8px)"}"></button>`).join("")}</div></div>`).join("");
$("cfgBody").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; build[b.dataset.k] = +b.dataset.i; applyBuild(); });
$("reset").onclick = () => { build = { ...DEFAULT, model: build.model }; applyBuild(); toast("Back to black and red"); };
$("share").onclick = async () => {
  const url = location.origin + location.pathname + "#b=" + Object.keys(DEFAULT).map(k => build[k]).join(".");
  try { await navigator.clipboard.writeText(url); toast("Link to your build copied"); } catch { prompt("Copy your build link", url); }
};
applyBuild();
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }

// ---------- sound ----------
function setSound(on) { sound.setOn(on); $("snd").setAttribute("aria-pressed", String(on)); $("snd").textContent = on ? "Sound on" : "Sound off"; if (on && mode === "watch" && w.playing) sound.startSong(w.t); }
$("snd").onclick = () => setSound(!sound.on);
$("rev").onclick = () => { if (!sound.on) setSound(true); sound.rev(); };

// ---------- modes ----------
let mode = "home";
const w = { t: 0, playing: false, dragging: false };
function go(next) {
  if (next === mode) return;
  $("fade").classList.add("on");
  setTimeout(() => {
    if (mode === "play") { game.exit(); openGarage(false); }
    if (mode === "watch") { sound.stopSong(); w.playing = false; }
    mode = next; document.body.dataset.mode = next;
    if (next === "home") scrollTo(0, 0);
    if (next === "watch") { if (!sound.on) setSound(true); playFrom(0); }
    if (next === "play") game.enter();
    $("fade").classList.remove("on");
  }, 320);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { e.preventDefault(); go(b.dataset.go); } });
$("exit").onclick = () => go("home");
addEventListener("keydown", e => {
  if (e.code === "Escape" && mode !== "home") go("home");
  if (mode === "watch") {
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.code === "ArrowRight") seek(w.t + 4); if (e.code === "ArrowLeft") seek(w.t - 4);
  }
});

// watch player
function playFrom(t) { w.t = clamp(t, 0, TOTAL); w.playing = true; $("wEnd").classList.remove("on"); if (sound.on) sound.startSong(w.t); setPlayIcon(); }
function pause() { w.playing = false; sound.stopSong(); setPlayIcon(); }
function togglePlay() { if (w.playing) pause(); else playFrom(w.t >= TOTAL - .05 ? 0 : w.t); }
function seek(t) { w.t = clamp(t, 0, TOTAL); if (w.playing) playFrom(w.t); }
function setPlayIcon() { $("wPlay").innerHTML = w.playing ? "&#10074;&#10074;" : "&#9654;"; $("wPlay").setAttribute("aria-label", w.playing ? "Pause" : "Play"); }
$("wPlay").onclick = togglePlay;
$("wAgain").onclick = () => playFrom(0);
const scrub = $("wScrub"); scrub.max = TOTAL;
scrub.addEventListener("input", () => { w.dragging = true; w.t = +scrub.value; if (w.playing) { sound.stopSong(); } });
scrub.addEventListener("change", () => { w.dragging = false; if (w.playing) playFrom(+scrub.value); });
$("wTicks").innerHTML = CHAPTERS.filter(c => c[1]).map(c => `<button style="left:${c[0] * BAR / TOTAL * 100}%" data-t="${c[0] * BAR}">${c[1]}</button>`).join("");
$("wTicks").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { seek(+b.dataset.t); if (!w.playing) playFrom(+b.dataset.t); } });
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// drag to turn the car on the home and build screens
const orbit = { a: .7, v: 0, drag: false, x: 0 };
addEventListener("pointerdown", e => { if ((mode !== "build" && mode !== "home") || e.target !== $("gl") && !e.target.closest(".drag-hint, #buildUI") || e.target.closest(".cfg, button")) return; orbit.drag = true; orbit.x = e.clientX; });
addEventListener("pointermove", e => { if (!orbit.drag) return; orbit.v = (e.clientX - orbit.x) * -.006; orbit.a += orbit.v; orbit.x = e.clientX; });
addEventListener("pointerup", () => { orbit.drag = false; });

// ---------- resize: ignore the phone address bar sliding, follow rotation and folding ----------
let lastW = 0, lastH = 0;
function resize() {
  const ww = innerWidth, hh = Math.max(innerHeight, document.documentElement.clientHeight);
  if (!ww || !hh) return;
  if (ww === lastW && Math.abs(hh - lastH) < 140 && lastW) return;
  lastW = ww; lastH = hh; renderer.setSize(ww, hh, false); composer.setSize(ww, hh);
  bloom.resolution.set(Math.max(1, ww * (COARSE ? .35 : .5)), Math.max(1, hh * (COARSE ? .35 : .5))); camera.aspect = ww / hh;
}
addEventListener("resize", resize); addEventListener("orientationchange", () => setTimeout(resize, 200));
if (window.visualViewport) visualViewport.addEventListener("resize", resize);
resize();
const fovFor = f => { const a = camera.aspect; if (a >= 1.5) return f; const h = 2 * Math.atan(Math.tan(f * Math.PI / 360) * 1.5); return Math.min(88, 2 * Math.atan(Math.tan(h / 2) / a) * 180 / Math.PI); };

// ---------- the showroom pose (home and build) ----------
const showFr = frame(); W.track.sample(W.track.D[W.track.idxX(0)], showFr);
const intro = { t: -1 };                     // the car drives in once the loader lifts
function showroom(dt, time) {
  let introX = 0, introV = 0;
  if (intro.t >= 0 && intro.t < 3.2) { intro.t += dt; const u = Math.min(1, intro.t / 3.2); introX = -46 * Math.pow(1 - u, 3); introV = 46 * 3 * Math.pow(1 - u, 2) / 3.2; }
  else if (intro.t < 0) introX = -46;
  if (!orbit.drag) { orbit.v *= .94; orbit.a += orbit.v + (REDUCED ? 0 : dt * (mode === "home" ? .16 : .1)); }
  const hf = 2 * Math.atan(Math.tan(fovFor(38) * Math.PI / 360) * camera.aspect), fit = 3.1 / Math.tan(hf / 2);   // fit the whole car across the screen
  const scrolled = mode === "home" ? clamp(scrollY / innerHeight) : 0, dist = Math.max(mode === "build" ? 8.8 : 8.2, fit) + scrolled * 2;
  const cam = { pos: new THREE.Vector3(Math.cos(orbit.a) * dist, 1.5 + scrolled * 4, Math.sin(orbit.a) * dist), look: new THREE.Vector3(0, .5 - scrolled * .4, 0), fov: 38 };
  if (camera.aspect < 1) cam.look.y = mode === "build" ? -1.1 : -.2;
  else if (mode === "build") { const right = new THREE.Vector3().subVectors(cam.look, cam.pos).cross(new THREE.Vector3(0, 1, 0)).normalize(); cam.look.addScaledVector(right, 1.7); }
  const pos = showFr.p.clone(); pos.x += introX; const fr = { ...showFr, p: pos };
  if (introX < -.01) cam.look.x = Math.max(introX * .35, -8);
  return { pos, quat: new THREE.Quaternion(), fr, speed: introV * 3.6, g: 1, alt: 0, vs: 0, thrust: { power: 0, angle: 0, deploy: 0 }, wings: 0, air: false, cam, inside: false, screenOn: false, reveal: 1, rpm: 900, gear: 1, load: .1, engine: .6, mode: "PARK", zones: [] };
}

// ---------- per frame ----------
const clock = new THREE.Clock();
let wasWrecked = false, wreckPose = null; const wrecks = [];
const perf = { t: 0, n: 0, pr: renderer.getPixelRatio(), max: renderer.getPixelRatio() };
let lastHud = 0, prevGear = 1, feedFlip = 0;
function frameLoop(fixed) {
  const raw = fixed ? 0 : clock.getDelta(), dt = fixed || Math.min(.05, raw), time = clock.elapsedTime;
  // adaptive resolution: drop the pixel count when frames run slow, bring it back when there is headroom
  if (!fixed && raw < .5) {
    perf.t += raw; perf.n++;
    if (perf.t > 1.5) {
      const avg = perf.t / perf.n, was = perf.pr;
      if (avg > 1 / 45 && perf.pr > .6) perf.pr = Math.max(.6, perf.pr - (avg > 1 / 25 ? .25 : .12));
      else if (avg < 1 / 58 && perf.pr < perf.max) perf.pr = Math.min(perf.max, perf.pr + .08);
      if (perf.pr !== was) { renderer.setPixelRatio(perf.pr); composer.setPixelRatio(perf.pr); lastW = 0; resize(); }
      perf.t = perf.n = 0;
    }
  }
  let S;
  if (mode === "watch") {
    if (w.playing && !w.dragging) {
      const st = sound.on ? sound.songTime() : null;
      w.t = st != null ? st : w.t + dt;
      if (w.t >= TOTAL) { w.t = TOTAL; pause(); $("wEnd").classList.add("on"); }
    }
    S = watch.at(w.t, time, camera.aspect, fovFor);
    if (!w.dragging) scrub.value = w.t;
    scrub.style.setProperty("--p", (w.t / TOTAL * 100) + "%");
    $("wTime").textContent = `${fmt(w.t)} / ${fmt(TOTAL)}`;
    const ch = S.chapter, cap = $("wCap");
    if (cap.dataset.ch !== ch[1]) { cap.dataset.ch = ch[1]; cap.classList.add("hide"); setTimeout(() => { $("wNum").textContent = ch[1] ? String(CHAPTERS.indexOf(ch) + 1).padStart(2, "0") : ""; $("wTitle").textContent = ch[1]; $("wSub").textContent = ch[2]; cap.classList.toggle("hide", !ch[1]); }, 250); }
    $("telem").style.opacity = S.bar > 2 && !S.inside && S.bar < 17.5 ? 1 : 0;
    $("tSpd").textContent = Math.round(S.speed); $("tG").textContent = S.g.toFixed(1); $("tAlt").textContent = Math.round(S.alt);
    $("dream").style.opacity = S.dream; $("fade").style.opacity = S.fade;
  } else if (mode === "play") S = game.update(dt, time, camera.aspect);
  else S = showroom(dt, time);
  life.update(dt, time, mode === "play" ? S.player : null, camera.position);
  if (mode === "play") {
    police.update(dt, time); races.update(dt, time); nav.update();
    const st = game.state, stars = police.stars;
    document.getElementById("gStars").textContent = stars ? "★".repeat(stars) + "☆".repeat(5 - stars) : "";
    document.getElementById("gStars").classList.toggle("bust", police.bust > .5);
    const pr = races.progress();
    net.tick(dt, { p: [st.x, st.y, st.z, st.yaw, st.pitch, st.roll].map(v => Math.round(v * 100) / 100), m: Object.keys(MODELS).indexOf(car.model), c: OPTS.paint.items[build.paint][1], v: Math.round(S.speed), a: S.air ? 1 : 0, r: pr ? pr.race : 0, rp: pr ? pr.rp : 0, rf: pr ? pr.rf : 0, w: stars });
    for (const p of net.players()) {
      const at = net.sample(p); const r = remoteFor(p); r.at = at;
      if (!at || at.stale) { r.root.visible = false; continue; }
      r.root.visible = true; r.root.position.set(at.x, at.y, at.z); r.root.rotation.set(0, -at.yaw, 0); r.car.group.rotation.set(at.roll, 0, at.pitch, "XYZ");
      r.car.setThrust(at.air ? .6 : 0, at.air && at.v > 90 ? 1 : 0, at.air ? 1 : 0, time); r.car.setWings(at.air && at.v > 100 ? 1 : 0, time);
      for (const wh of r.car.wheels) wh.rotation.z -= at.v / 3.6 * dt / .37;
      if (r.emoT > 0 && (r.emoT -= dt) <= 0) r.emo.visible = false;
      const dx = st.x - at.x, dz = st.z - at.z, d = Math.hypot(dx, dz);
      net.setVolume(p.id, 1 - d / 260);
      if (d < 3.4 && d > .01 && Math.abs(st.y - at.y) < 2) { st.x += dx / d * (3.4 - d) * .5; st.z += dz / d * (3.4 - d) * .5; st.vel.multiplyScalar(.9); }
    }
  } else { for (const r of remotes.values()) r.root.visible = false; net.tick(dt, null); }     // the host keeps relaying from the menus
  W.city.update(time);
  W.follow(S.pos);
  if (mode !== "watch") $("fade").style.opacity = "";

  // the car
  car.group.position.copy(S.pos); car.group.quaternion.copy(S.quat);
  car.setReveal(S.reveal);
  car.setThrust(S.thrust.power, S.thrust.angle, S.thrust.deploy, time);
  car.setFlame(S.nitro || 0, time);
  // damage: dent the model where it was hit; a destroyed car is left where it crashed and a fresh one is built for you
  const gs = mode === "play" ? game.state : null;
  if (gs && gs.impacts && gs.impacts.length && car.damage) { carRoot.updateMatrixWorld(true); for (const im of gs.impacts.splice(0)) car.damage(carRoot.worldToLocal(new THREE.Vector3(im.x, im.y, im.z)), im.p); }
  if (S.wrecked && !wasWrecked) { car.wreck && car.wreck(); wreckPose = { p: carRoot.position.clone(), q: carRoot.quaternion.clone() }; }
  if (!S.wrecked && wasWrecked && wreckPose && inner) {
    const wg = inner.group; carRoot.remove(wg); wg.position.copy(wreckPose.p); wg.quaternion.copy(wreckPose.q); scene.add(wg);
    wrecks.push({ g: wg, t: 30 }); if (wrecks.length > 4) { const o = wrecks.shift(); scene.remove(o.g); }
    useModel(car.model, true); applyBuild(); wreckPose = null;
  }
  wasWrecked = !!S.wrecked;
  for (const w of wrecks) { w.t -= dt; if (Math.random() < .25 && w.t > 10) { const pf = fx.puffs[fx.puffI++ % fx.puffs.length]; pf.s.position.copy(w.g.position).add(new THREE.Vector3((Math.random() - .5) * 2, 1, (Math.random() - .5) * 2)); pf.life = 1; pf.s.visible = true; pf.grow = .6; pf.s.scale.setScalar(.6); pf.s.material.color.set(0x2a2a2a); pf.v.set(0, 2, 0); } }
  for (let k = wrecks.length - 1; k >= 0; k--) if (wrecks[k].t <= 0) { scene.remove(wrecks[k].g); wrecks.splice(k, 1); }
  car.setWings(S.wings, time);
  const roll = S.speed / 3.6 * dt / .37;
  for (const wh of car.wheels) wh.rotation.z -= S.air ? roll * .15 : roll;
  car.group.updateMatrixWorld(true);

  // shadow, underglow, exhaust, speed lines
  const fr = S.fr, ground = clamp(1 - S.pos.y / 3) * (fr.u.y > .8 ? 1 : 0);
  fx.shadow.position.set(S.pos.x, S.pos.y > .5 ? .07 : S.pos.y + .07, S.pos.z); fx.shadow.material.opacity = ground; fx.shadow.rotation.z = Math.atan2(-fr.f.z, fr.f.x);
  const glowOn = !!OPTS.glow.items[build.glow][1];
  fx.glow.position.copy(fx.shadow.position).y += .01; fx.glow.rotation.z = fx.shadow.rotation.z; fx.glow.material.opacity = glowOn ? ground * .85 : 0;
  if (S.thrust.power > .3) for (const n of nozzles) if (Math.random() < .18) {
    const pf = fx.puffs[fx.puffI++ % fx.puffs.length], wp = n.clone().applyMatrix4(car.group.matrixWorld);
    pf.s.position.copy(wp); pf.life = 1; pf.s.visible = true; pf.s.scale.setScalar(.4); pf.grow = .4; pf.s.material.color.set(0xc8d2e1);
    pf.v.copy(fr.u).multiplyScalar(-(1 - S.thrust.angle) * 7).addScaledVector(fr.f, -S.thrust.angle * 9 - S.speed / 3.6 * .2).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(1.5));
  }
  const emit = (p, v, col, size, life = 1) => { const pf = fx.puffs[fx.puffI++ % fx.puffs.length]; pf.s.position.copy(p); pf.life = life; pf.s.visible = true; pf.s.scale.setScalar(size); pf.s.material.color.set(col); pf.v.copy(v); pf.grow = size; };
  if (mode === "play" && S.hp != null) {
    const eng = new THREE.Vector3(-1.2, .9, 0).applyMatrix4(car.group.matrixWorld);
    if (S.hp < 55 && !S.wrecked && Math.random() < (S.hp < 25 ? .5 : .2)) emit(eng, new THREE.Vector3((Math.random() - .5), 1.5 + Math.random(), (Math.random() - .5)), S.hp < 25 ? 0x222222 : 0x9a9a9a, .5);
    if (S.hp < 20 && !S.wrecked && Math.random() < .35) emit(eng, new THREE.Vector3(0, 2.5, 0), 0xff7a1a, .35, .5);
    if (S.sparks > .5) for (let k = 0; k < 4; k++) emit(S.pos.clone().add(new THREE.Vector3(0, .5, 0)), new THREE.Vector3((Math.random() - .5) * 12, Math.random() * 6, (Math.random() - .5) * 12), 0xffd27a, .12, .35);
    if (S.boom > .95) for (let k = 0; k < 40; k++) emit(S.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3((Math.random() - .5) * 18, Math.random() * 14, (Math.random() - .5) * 18), k % 3 ? 0xff7a1a : 0x333333, 1.2, 1.4);
  }
  for (const pf of fx.puffs) if (pf.life > 0) {
    pf.life -= dt * .9; pf.s.position.addScaledVector(pf.v, dt); pf.v.multiplyScalar(.97);
    pf.s.scale.setScalar((pf.grow || .4) + (1 - pf.life) * 4.5); pf.s.material.opacity = Math.max(0, pf.life) * .5; if (pf.life <= 0) pf.s.visible = false;
  }
  const lineA = smooth(240, 320, S.speed) * (S.inside ? 0 : 1);
  fx.lines.material.opacity = lineA * .08;
  if (lineA > .01) {
    const d = new THREE.Object3D();
    for (let i = 0; i < fx.LINES; i++) {
      const sd = fx.lineSeed[i]; sd[0] -= S.speed / 3.6 * dt * 1.6; if (sd[0] < -40) sd[0] += 80;
      d.position.copy(fr.p).addScaledVector(fr.f, sd[0]).addScaledVector(fr.u, sd[1]).addScaledVector(fr.s, sd[2]); d.quaternion.copy(S.quat); d.scale.set(1.5 + S.speed * .018, 1, 1);
      d.updateMatrix(); fx.lines.setMatrixAt(i, d.matrix);
    }
    fx.lines.instanceMatrix.needsUpdate = true;
  }

  // the front seat and its screens
  if (S.screenOn) {
    if (!COARSE || (feedFlip++ & 1)) interior.renderFeed(scene);
    if (time - lastHud > .1) {
      lastHud = time;
      const hud = { time, speed: S.speed, alt: S.alt, vs: S.vs, mode: S.mode, zones: S.zones, gear: S.gear, rpm: S.rpm };
      interior.drawHud(hud); interior.drawCluster(hud);
    }
  }
  interior.wheel.rotation.x = 0;

  // camera
  const c = S.cam, shake = REDUCED ? 0 : (Math.max(0, S.g - 2) * .004 + S.thrust.power * .01 + (S.shake || 0) * .25 + (S.nitro || 0) * .02) * (S.inside ? .25 : 1);
  camera.position.copy(c.pos).add(new THREE.Vector3(Math.sin(time * 53) * shake, Math.sin(time * 61 + 1) * shake, Math.sin(time * 47 + 2) * shake));
  camera.up.copy(c.up || new THREE.Vector3(0, 1, 0)); camera.lookAt(c.look);
  camera.fov = fovFor(c.fov); camera.near = S.inside || S.screenOn ? .02 : .05; camera.updateProjectionMatrix();
  camLight.position.copy(camera.position).add(new THREE.Vector3(0, 3, 0)); camLight.target.position.copy(S.pos);
  scene.fog.far = lerp(950, 2600, smooth(20, 160, S.alt)); scene.fog.near = lerp(120, 400, smooth(20, 160, S.alt));
  camera.far = scene.fog.far * 1.1 + 150; camera.updateProjectionMatrix();          // nothing past the fog gets drawn
  // refresh the car's reflections every few frames (the car hides from its own camera)
  // (no shadows, no crowds, a short view: it only has to look right in the paint)


  // the car's own sound
  if (S.gear > prevGear && !S.air && S.speed > 20) sound.pop();
  prevGear = S.gear;
  sound.car({ rpm: S.rpm, load: S.load, engine: mode === "build" || mode === "home" ? .4 : S.engine, thrust: S.thrust.power, speed: S.speed, inside: S.inside });

  composer.render();
}

setLoad(95);
renderer.compile(scene, camera);
let raf;
let frameErr = 0;
const loop = () => { raf = requestAnimationFrame(loop); try { frameLoop(); } catch (e) { if (frameErr++ < 3) console.error(e); } };   // one bad frame never stops the game
loop();
setLoad(100);
setTimeout(() => { $("loader").classList.add("done"); setTimeout(() => { intro.t = 0; if (sound.on) sound.rev(); }, 450); }, 900);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); if (mode === "watch" && w.playing) pause(); if (sound.ctx) sound.ctx.suspend(); }
  else { clock.getDelta(); loop(); if (sound.on && sound.ctx) sound.ctx.resume(); }
});
window.VOID = { step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frameLoop(dt); }, W, car, life, carCube, carEnv, get police() { return police; }, get races() { return races; }, get nav() { return nav; }, net, orbit, go, seek: t => { w.t = t; if (w.playing) playFrom(t); }, pause, get w() { return w; }, game };   // handy for testing in the console
