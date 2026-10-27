// VOID: one WebGL canvas, three modes on top of a showroom home screen.
//   Watch: a 48 s film whose clock is the music.  Play: drive it, fly it, land it.  Build: paint it.
import * as THREE from "three";

const V = new URL(import.meta.url).search;
const $ = id => document.getElementById(id);
const setLoad = p => { $("ldbar").style.width = p + "%"; $("ldpct").textContent = Math.round(p); };
setLoad(15);
const [{ createWorld, clamp, lerp, smooth, frame, PAD_R, ZONES }, { buildCar, MODELS }, { addInterior, HEAD }, { Sound, BAR }, { createWatch, TOTAL, CHAPTERS }, { createGame }, { createLife, personGeo }] = await Promise.all(
  ["world", "car", "interior", "sound", "watch", "game", "npc"].map(n => import(`./${n}.js${V}`)));
const [{ createPolice }, { createRaces }, { createNet, EMOTES }, { createNav }, { createVehicles }, { createAtmos, WEATHERS }, { createGoals, GOALS }, { createExtras }, { createContracts }, { createDealer }] = await Promise.all(["police", "race", "net", "nav", "vehicles", "atmos", "goals", "extras", "contracts", "dealer"].map(n => import(`./${n}.js${V}`)));
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
// settings: graphics quality, look speed, auto gas, touch steering (kept on this device)
// a strong graphics card starts on High; everything else starts on Medium (it can be raised in the Menu)
const GPU = (() => { try { const c = renderer.getContext(), e = c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : ""; } catch { return ""; } })();
const STRONG = /RTX|GTX 1[06-9]|GTX 9[78]|Radeon RX|Radeon Pro|Apple M[1-9]/i.test(GPU) && !COARSE;
const TOP = /RTX\s?(40[6-9]0|50[5-9]0)|RTX\s?A?[45]\d{3}/i.test(GPU) && !COARSE;      // recent RTX cards start on Ultra
const SET = Object.assign({ q: TOP ? "ultra" : STRONG ? "high" : COARSE ? "low" : "medium", sens: 1, autogas: "off", steer: "stick", weather: "clear", radio: "score", cycle: "off", handling: "arcade", motion: "on", text: "normal" }, store.get("void.settings") || {});
const gameOpts = {
  handling: () => SET.handling, buyFood: () => { if (cash < 10) return false; cash -= 10; store.set("void.cash", cash); earn(0); return true; }, heroOwned: () => !!store.get("void.hero"), starter: () => { const m = life.models.find(m => m.id === "compact-3") || life.models.find(m => m.kind.id === "compact"); return { model: { ...m, top: 31, acc: .7, grip: .9 }, color: 0x6b5a44, rust: .75, owned: true }; }, onSteal: c => { police && police.event("steal"); goals.stats.steals = (goals.stats.steals || 0) + 1; },
  garage: () => openGarage(true), cycleTime, hornType: () => build.horn, autoGas: () => SET.autogas === "on", onRepair: () => car.repair && car.repair(),
  onScore: (n, why, pts) => { if (why === "Drift") goals.drift(n); if (/^(🥇|🥈|🥉)/.test(why)) goals.stats.meds = (goals.stats.meds || 0) + 1; goals.note(why); earn(pts ?? n); },
  onSmash: kind => police && police.event("smash", kind), policeClear: () => police && police.clear(),
  autopilot: (g, dt, over) => nav ? nav.controls(g, dt, over) : null, openGps: () => document.getElementById("gGpsBtn").click(),
  mapExtra(mx, g, MM) {
    const P = (x, z) => [(x - g.x) / MM, (z - g.z) / MM];
    if (nav && nav.pts.length > 1) { mx.strokeStyle = "#3dfcff"; mx.lineWidth = 3; mx.beginPath(); nav.pts.forEach(([x, z], k) => { const [a, b] = P(x, z); k ? mx.lineTo(a, b) : mx.moveTo(a, b); }); mx.stroke(); }
    if (police) for (const c of police.cops) if (c.on) { const [a, b] = P(c.x, c.z); mx.fillStyle = Math.sin(performance.now() / 90) > 0 ? "#ff3040" : "#3060ff"; mx.beginPath(); mx.arc(a, b, 4, 0, 7); mx.fill(); }
    if (races && races.race && races.race.next) { const [a, b] = P(races.race.next[0], races.race.next[2]); mx.strokeStyle = "#ffd23d"; mx.lineWidth = 3; mx.beginPath(); mx.arc(a, b, 7, 0, 7); mx.stroke(); }
    for (const r of remotes.values()) if (r.at) { const [a, b] = P(r.at.x, r.at.z); mx.fillStyle = "#c07dff"; mx.beginPath(); mx.arc(a, b, 4.5, 0, 7); mx.fill(); }
    mx.font = "bold 12px sans-serif"; mx.textAlign = "center"; for (const st of W.city.stations) { const [a, b] = P(st.x, st.z); if (Math.abs(a) < 90 && Math.abs(b) < 90) { mx.save(); mx.translate(a, b); mx.rotate(g.yaw + Math.PI / 2); mx.fillText("⛽", 0, 4); mx.restore(); } }
  },
};
const game = createGame(W, car, sound, life, gameOpts);
const vehicles = createVehicles(scene, game.api, W); gameOpts.vehicles = vehicles;
const atmos = createAtmos(W, sound, COARSE);
// trophies: a banner slides in at the top when a challenge is done
const goals = createGoals(gl => { const t = document.getElementById("gTrophy"); t.innerHTML = `<b>${gl.icon}</b><div><span>Challenge complete</span>${gl.name}<em>+1000</em></div>`; t.classList.remove("on"); void t.offsetWidth; t.classList.add("on"); if (game.state) { game.state.score += 1000; } sound.win(); renderGoals(); });
function renderGoals() {
  const S = goals.stats;
  document.getElementById("gGoals").innerHTML = GOALS.map(g => { const v = Math.min(1, (S[g.stat] || 0) / g.need), ok = goals.done.has(g.id); return `<div class="goal${ok ? " ok" : ""}"><b>${g.icon}</b><div><span>${g.name}</span><small>${g.text}</small><i style="--v:${v}"></i></div>${ok ? "🏆" : `<em>${Math.floor(v * 100)}%</em>`}</div>`; }).join("");
  document.getElementById("gStatsRow").innerHTML = `<div><b>${(S.best || 0).toLocaleString()}</b><span>Best score</span></div><div><b>${Math.round(S.top)}</b><span>Top km/h</span></div><div><b>${S.km.toFixed(1)}</b><span>km travelled</span></div><div><b>${goals.done.size}/${GOALS.length}</b><span>Trophies</span></div><div><b>$${cash.toLocaleString()}</b><span>Cash · spend in Garage</span></div>`;
}
const WX_ICON = { clear: "☀️ Clear", rain: "🌧 Rain", storm: "⛈ Storm", fog: "🌫 Fog", snow: "❄️ Snow" }, RADIO = { score: "🎵 VOID Score", voidfm: "📻 VOID FM", off: "🔇 Radio off" };
function chips() { document.getElementById("gChips").innerHTML = `<span>${{ night: "🌙", sunset: "🌇", day: "☀️" }[W.timeOfDay]} ${W.timeOfDay}</span><span>${WX_ICON[atmos.weather]}</span>`; document.getElementById("gWeather").innerHTML = `<b>${WX_ICON[SET.weather].split(" ")[0]}</b>${WX_ICON[SET.weather].split(" ").slice(1).join(" ")}`; document.getElementById("gRadio").innerHTML = `<b>${RADIO[SET.radio].split(" ")[0]}</b>${RADIO[SET.radio].split(" ").slice(1).join(" ")}`; }
document.getElementById("gWeather").onclick = () => { SET.weather = WEATHERS[(WEATHERS.indexOf(SET.weather) + 1) % WEATHERS.length]; atmos.setWeather(SET.weather); store.set("void.settings", SET); chips(); toast(WX_ICON[SET.weather]); };
document.getElementById("gRadio").onclick = () => { const k = Object.keys(RADIO); SET.radio = k[(k.indexOf(SET.radio) + 1) % k.length]; if (!sound.on) setSound(true); sound.setRadio(SET.radio); store.set("void.settings", SET); chips(); toast(RADIO[SET.radio]); };
// ---------- the menu (☰ or Esc): everything that isn't driving lives here ----------
const menuEl = document.getElementById("gMenu");
function menu(open) {
  if (open == null) open = menuEl.hidden;
  menuEl.hidden = !open; document.body.classList.toggle("g-menu-open", open); if (open) { renderGoals(); chips(); }
  if (open) { renderContracts(); races.renderList(); renderDaily(); }
  if (open && document.pointerLockElement) document.exitPointerLock();
  if (!net.online()) game.pause(open);
}
document.getElementById("gMenuBtn").onclick = () => menu(true);
document.getElementById("gMenuClose").onclick = () => menu(false);
document.getElementById("gExit").onclick = () => { menu(false); go("home"); };
menuEl.addEventListener("click", e => { const t = e.target.closest(".tile"); if ((t && !t.closest(".set")) || e.target.closest("[data-rgo]")) setTimeout(() => menu(false), 60); if (e.target === menuEl) menu(false); });
menuEl.querySelectorAll("[data-veh]").forEach(b => b.onclick = () => game.api.setVehicle(b.dataset.veh));
document.getElementById("gFuelNav").onclick = () => { const st = game.state; if (!st) return; const best = W.city.stations.slice().sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0]; nav.setDest({ name: "⛽ Fuel station", x: best.x, z: best.z }); };
function applySettings(save = true) {
  document.body.classList.toggle("big-ui", SET.text === "large");
  for (const seg of menuEl.querySelectorAll(".seg[data-set]")) for (const b of seg.children) b.classList.toggle("on", SET[seg.dataset.set] === b.dataset.v);
  const weak = /Intel|UHD|Iris|Radeon\(TM\) Graphics|Vega|SwiftShader|llvmpipe|Basic Render/i.test(GPU);
  const masked = !/ANGLE|NVIDIA|Intel|AMD|Radeon|Apple|Mali|Adreno/i.test(GPU);       // Brave and some others hide the chip name for privacy
  const name = (GPU || "unknown").replace(/^ANGLE \([^,]+, /, "").replace(/ \(0x[0-9A-Fa-f]+\).*$/, "").replace(/ Direct3D.*$/, "").replace(/, D3D.*$/, "");
  document.getElementById("gGpu").innerHTML = `${masked ? "Your browser hides which graphics chip it uses" : `Running on: <b>${name}</b>`} · <b id="gFps">${fpsNow ? fpsNow + " fps" : "measuring…"}</b>${weak ? '<br><span class="warn">This is the built-in laptop graphics. For full speed, make your browser use the RTX: Windows Settings → System → Display → Graphics → your browser → High performance, then restart the browser.</span>' : masked ? '<br><span class="small">Smooth is 60 fps or more. Under 40, check the browser is set to your RTX in Windows graphics settings.</span>' : ""}`;
  document.getElementById("gSens").value = SET.sens; game.api.sens = +SET.sens;
  document.body.classList.toggle("steer-buttons", SET.steer === "buttons");
  const cap = W.setQuality(SET.q); perf.max = cap; perf.pr = Math.min(perf.pr, cap); if (renderer.getPixelRatio() > cap) { renderer.setPixelRatio(cap); composer.setPixelRatio(cap); } lastW = 0; resize();
  if (save) store.set("void.settings", SET);
}
menuEl.querySelectorAll(".seg[data-set]").forEach(seg => seg.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; e.preventDefault(); SET[seg.dataset.set] = b.dataset.v; if (seg.dataset.set === "q") { perf.pr = W.QUALITY[b.dataset.v].pr; perf.down = 0; } applySettings();
atmos.setWeather(SET.weather);
if (/Intel|UHD|Iris/i.test(GPU) && !COARSE && !store.get("void.gpuWarned")) { store.set("void.gpuWarned", 1); setTimeout(() => toast("Running on built-in graphics: see Menu → Settings to switch to your RTX"), 4000); } }));
document.getElementById("gSens").addEventListener("input", e => { SET.sens = +e.target.value; applySettings(); });
// the touch joystick: drag the knob; left/right steers, up/down pitches when flying
{
  const st = document.getElementById("gStick"), knob = st.querySelector("i"); let id = null, cx = 0, cy = 0;
  const set = (x, y) => { const r = st.clientWidth / 2 - 10, l = Math.min(1, Math.hypot(x, y) / r), a = Math.atan2(y, x), kx = Math.cos(a) * l * r, ky = Math.sin(a) * l * r; knob.style.transform = `translate(${kx}px, ${ky}px)`; game.api.setStick(kx / r, ky / r); };
  st.addEventListener("pointerdown", e => { id = e.pointerId; const b = st.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; try { st.setPointerCapture(id); } catch { } set(e.clientX - cx, e.clientY - cy); e.preventDefault(); });
  st.addEventListener("pointermove", e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; game.api.setStick(0, 0); };
  st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
}
// headlights that light the road at night
const heads = new THREE.SpotLight(0xfff1d6, 0, 70, .55, .6, 1.2); heads.position.set(2.2, .7, 0); heads.target.position.set(18, -1.5, 0); carRoot.add(heads, heads.target);
police = createPolice(scene, game.api, sound, life);
races = createRaces(scene, game.api, sound, W.canvasTex, net);
nav = createNav(scene, game.api, W, ZONES, races.starts);
const extras = createExtras(W, game.api, nav, sound);
document.getElementById("gTaxi").onclick = () => extras.toggle();
// people knocked over: a thud, a shake, and the police notice; they bounce off walls instead of flying through them
life.onHit = sp => { sound.thud && sound.thud(Math.min(1, sp / 22)); if (game.state) game.state.shake = Math.min(1, (game.state.shake || 0) + .25); police && police.event("ped"); };
life.collide = (x, z) => !!game.api.hitBox(x, z, .8, .3);
// VOID Motors: 50 cars for sale
const dealer = createDealer(W, game, life, nav, sound, store, toast, { cash: () => cash, spend: n => { if (cash < n) return false; cash -= n; store.set("void.cash", cash); earn(0); return true; }, heroOwned: () => !!store.get("void.hero"), unlockHero: () => unlockHero() });
document.getElementById("gDealer").onclick = () => dealer.menu();
// the secret code box: one word unlocks the best car, nothing else does anything
function unlockHero() { store.set("void.hero", 1); game.api.useHero(); }
document.getElementById("gCodeGo").onclick = () => {
  const el = document.getElementById("gCode"), code = el.value.trim().toLowerCase(); el.value = "";
  if (code === "aws") { if (store.get("void.hero")) toast("You already have the VOID car"); else { unlockHero(); sound.win(); toast("🔓 Secret unlocked: the VOID car is yours. 330 km/h, and it flies"); } menu(false); }
  else toast(code ? "Nothing happens…" : "Type a code first");
};
document.getElementById("gCode").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") document.getElementById("gCodeGo").click(); });
document.getElementById("gFootBtn").onclick = () => game.api.foot();
// you on foot: the same build as the people in the street, legs that swing as you walk or run
const walker = (() => {
  const pg = personGeo(), g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x22252d, roughness: .8 }), pants = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2b3a55, roughness: .85 });
  g.add(new THREE.Mesh(pg.body, shirt), new THREE.Mesh(pg.head, new THREE.MeshStandardMaterial({ color: 0xc68a5e, roughness: .7 })), new THREE.Mesh(pg.hair, new THREE.MeshStandardMaterial({ color: 0x18120e, roughness: .9 })));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.46, .06, .28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(1.4), toneMapped: false })); stripe.position.y = 1.32; g.add(stripe);
  const legs = [1, -1].map(s => { const p = new THREE.Group(); p.position.set(0, .86, s * .1); p.add(new THREE.Mesh(pg.leg, pants)); g.add(p); return p; });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.visible = false; scene.add(g);
  return { g, legs };
})();
// cars that aren't your VOID car: the one you're driving and the one you left parked, drawn from the traffic shapes
const rideMesh = () => { const g = new THREE.Group(); g.visible = false; scene.add(g); return { g, key: "" }; };
const RIDE = rideMesh(), RPARK = rideMesh();
function dressRide(R, ride) {
  const key = ride.model.id + ":" + ride.color + ":" + (ride.rust || 0); if (R.key === key) return; R.key = key;
  for (const c of [...R.g.children]) R.g.remove(c);
  const geo = life.geoOf(ride.model.kind), rust = ride.rust || 0;
  R.g.add(new THREE.Mesh(geo.body, new THREE.MeshStandardMaterial({ vertexColors: true, color: new THREE.Color(ride.color).multiplyScalar(1 - rust * .45), roughness: .3 + rust * .6, metalness: .55 * (1 - rust) })), new THREE.Mesh(geo.lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) })));
  R.g.children[0].castShadow = true; R.g.scale.set(ride.model.sl, ride.model.sh, ride.model.sw);
}
// settings that change how it plays and looks
function motionOK() { return !REDUCED && SET.motion !== "off"; }
// ---------- the first two minutes: a short guided start (skippable, once per device) ----------
const TUT = [
  [COARSE ? "Hold Gas to drive" : "Hold W to drive", s => s.speed > 40],
  [COARSE ? "Steer, then hold Drift in a turn" : "Steer with A and D, hold Space in a turn to drift", (s, g) => g.drift > 25],
  [COARSE ? "Tap Nitro for a boost" : "Hold Shift for nitro", (s, g) => g.nitroOn > .5],
  [COARSE ? "Tap Fly to take off" : "Press F to fly", (s, g) => g.mode === "air"],
  [COARSE ? "Tap Land to come down" : "Press L to land", (s, g, T) => g.mode === "drive" && T.flew],
  [COARSE ? "Stop, then tap 🚶 to get out" : "Stop, then press E to get out and walk", (s, g) => g.veh === "foot"],
  [COARSE ? "Walk to any car and tap 🚶 to drive it" : "Walk up to any car and press E to drive it", (s, g) => g.veh === "car"],
  [COARSE ? "Open the Menu (☰): contracts, races, VOID Motors" : "Press Esc for the Menu: contracts, races, VOID Motors", () => !menuEl.hidden],
];
const tut = { on: !store.get("void.tut"), k: 0, flew: false };
function tutUpdate() {
  const el = document.getElementById("gTut"), g = game.state;
  if (!tut.on || !g || !g.started) { el.hidden = true; return; }
  if (g.mode === "air") tut.flew = true;
  if (TUT[tut.k][1](lastS || {}, g, tut)) { tut.k++; sound.pop(); if (tut.k >= TUT.length) { tut.on = false; store.set("void.tut", 1); cash += 1000; earn(0); toast("Tutorial done: +$1,000. Have fun!"); el.hidden = true; return; } }
  el.hidden = false; el.innerHTML = `<b>${tut.k + 1}/${TUT.length}</b> ${TUT[tut.k][0]} <button class="pill" id="gTutSkip">Skip</button>`;
  document.getElementById("gTutSkip").onclick = () => { tut.on = false; store.set("void.tut", 1); el.hidden = true; };
}
let lastS = null;
// ---------- daily challenges: three a day, the same for everyone on that date, $2,500 each ----------
const DAILY = [["smashed", 15, "💥 Smash 15 cars"], ["km", 10, "🛣️ Travel 10 km"], ["air", 180, "✈️ Fly for 3 minutes"], ["fares", 3, "🚕 Complete 3 taxi fares"], ["coins", 2, "🪙 Find 2 hidden coins"], ["escapes", 1, "🚓 Escape the police"],
  ["wins", 1, "🏁 Win a race"], ["rings", 5, "💍 Fly through 5 rings"], ["pads", 2, "🛬 Land on 2 helipads"], ["steals", 3, "🔑 Take 3 cars from the traffic"], ["meds", 1, "🏅 Earn a contract medal"], ["refuels", 1, "⛽ Fill up at a station"]];
const daily = (() => {
  const day = new Date().toISOString().slice(0, 10); let d = store.get("void.daily");
  if (!d || d.day !== day) { let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const picks = []; while (picks.length < 3) { h = (h * 1103515245 + 12345) >>> 0; const k = h % DAILY.length; if (!picks.includes(k)) picks.push(k); } d = { day, picks, base: {}, done: [] }; for (const k of picks) d.base[DAILY[k][0]] = goals.stats[DAILY[k][0]] || 0; store.set("void.daily", d); }
  return d;
})();
function dailyProg(k) { const [stat, need] = DAILY[k]; return Math.min(1, ((goals.stats[stat] || 0) - (daily.base[stat] || 0)) / need); }
function dailyCheck() { for (const k of daily.picks) if (!daily.done.includes(k) && dailyProg(k) >= 1) { daily.done.push(k); store.set("void.daily", daily); cash += 2500; earn(0); toast(`Daily challenge done: ${DAILY[k][2]} · +$2,500`); sound.win(); } }
function renderDaily() { document.getElementById("gDaily").innerHTML = daily.picks.map(k => { const v = dailyProg(k), ok = daily.done.includes(k); return `<div class="goal${ok ? " ok" : ""}"><b>${DAILY[k][2].split(" ")[0]}</b><div><span>${DAILY[k][2].split(" ").slice(1).join(" ")}</span><small>$2,500</small><i style="--v:${v}"></i></div>${ok ? "✅" : `<em>${Math.floor(v * 100)}%</em>`}</div>`; }).join(""); }
// contracts: hybrid drive + fly jobs and pursuits with medals
const contracts = createContracts(W, game.api, nav, sound, police);
function renderContracts() { document.getElementById("gContracts").innerHTML = contracts.CONTRACTS.map(c => `<button class="tile con" data-con="${c.id}"><b>${c.icon}</b>${c.name}<small>${c.text}</small><i>${["Not done", "🥉 Bronze", "🥈 Silver", "🥇 Gold"][contracts.best[c.id] || 0]}</i></button>`).join("") + (contracts.active ? `<button class="tile con" id="gConStop"><b>✕</b>Cancel contract</button>` : ""); }
document.getElementById("gContracts").addEventListener("click", e => { const b = e.target.closest("[data-con]"); if (b) { if (extras.job.on) extras.toggle(false); contracts.start(b.dataset.con); } else if (e.target.closest("#gConStop")) contracts.cancel(); });
// backups: every void.* key in one code, so progress survives a new browser or device
document.getElementById("gSaveOut").onclick = async () => {
  const o = {}; try { for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key.startsWith("void.") && !key.startsWith("void.ghost.")) o[key] = localStorage.getItem(key); } } catch { }
  const code = "VOID1:" + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  try { await navigator.clipboard.writeText(code); toast("Backup code copied. Keep it somewhere safe"); } catch { prompt("Copy your backup code", code); }
};
document.getElementById("gSaveIn").onclick = () => {
  const code = (prompt("Paste your VOID backup code") || "").trim(); if (!code) return;
  try {
    if (!code.startsWith("VOID1:")) throw 0; const o = JSON.parse(decodeURIComponent(escape(atob(code.slice(6)))));
    const keys = Object.keys(o).filter(k => /^void\.[\w.-]{1,40}$/.test(k) && typeof o[k] === "string" && o[k].length < 200000);
    if (!keys.length) throw 0; for (const k of keys) { JSON.parse(o[k]); localStorage.setItem(k, o[k]); }
    toast(`Restored ${keys.length} saved items. Reloading…`); setTimeout(() => location.reload(), 900);
  } catch { toast("That code didn't work. Copy the whole code, starting with VOID1:"); }
};

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
net.on("emote", (m, from) => { const r = remotes.get(from), e = EMOTES[m.e | 0]; if (!e) return; if (r) { r.emo.material.map = tagTex(e, "#ffd23d"); r.emo.visible = true; r.emoT = 4; } feed(`${net.nameOf(from)}: ${e}`); });
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
function openGarage(on) { if (on) renderUpg(); document.body.classList.toggle("garage", on); game.pause(on); if (on && car.repair) { car.repair(); applyBuild(); if (game.state) game.state.hp = 100; } }
$("gGarageClose").onclick = () => openGarage(false);
const nozzles = (car.nozzles || [[.9, .3, 1], [.9, .3, -1], [-.95, .38, 1], [-.95, .38, -1]]).map(([x, y, s]) => new THREE.Vector3(x, y - .5, s));

// ---------- configurator ----------
const OPTS = {
  paint: { label: "Paint", items: [["Void Black", "#0a0a0c"], ["Stealth Grey", "#2b2d32"], ["Liquid Silver", "#9fa3aa"], ["Ghost White", "#e9e9ea"], ["Blood Red", "#6f0a12"], ["Ember Orange", "#c9480c"], ["Ion Blue", "#123a8c"], ["Venom Green", "#2d6a1e"], ["Candy Purple", "#4a1270"], ["Sunset Gold", "#b8862a"], ["Pearl Pink", "#e8a6c0"], ["Arctic Teal", "#1f8a8a"], ["Lime Rush", "#8acb1a"], ["Cherry Pop", "#d2163c"], ["Midnight Navy", "#0d1838"], ["Chrome", "#d8dadd"]] },
  finish: { label: "Finish", seg: true, items: [["Gloss", "gloss"], ["Satin", "satin"], ["Matte", "matte"]] },
  rim: { label: "Wheels", items: [["Black", "#121215"], ["Gunmetal", "#3a3d44"], ["Silver", "#b8bcc4"], ["Bronze", "#7a5a32"], ["Gold", "#c9a227"], ["Red", "#b0141f"], ["White", "#e8e8ea"], ["Ion", "#2ad8e8"]] },
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
$("cfgBody").innerHTML = `<div id="upgBody"></div>` + ORDER.map(k => [k, OPTS[k]]).map(([k, o]) => `<div class="grp"><div class="grp-h">${o.label}<b data-name="${k}"></b></div><div class="${o.seg ? "seg" : "sw"}">${o.items.map(([n, c], i) => o.seg
  ? `<button data-k="${k}" data-i="${i}">${n}</button>`
  : `<button data-k="${k}" data-i="${i}" title="${n}" aria-label="${o.label}: ${n}" style="background:${c || "repeating-linear-gradient(45deg,#222 0 4px,#111 4px 8px)"}"></button>`).join("")}</div></div>`).join("");
$("cfgBody").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (!b) return; build[b.dataset.k] = +b.dataset.i; applyBuild(); });
$("reset").onclick = () => { build = { ...DEFAULT, model: build.model }; applyBuild(); toast("Back to black and red"); };
$("share").onclick = async () => {
  const url = location.origin + location.pathname + "#b=" + Object.keys(DEFAULT).map(k => build[k]).join(".");
  try { await navigator.clipboard.writeText(url); toast("Link to your build copied"); } catch { prompt("Copy your build link", url); }
};
applyBuild();
// ---------- performance upgrades: every point you score is also cash, spent here (kept on this device) ----------
const UPG = { engine: ["⚙️", "Engine", "More power and top speed"], grip: ["🛞", "Tyres", "Grip in corners, longer drifts"], nitro: ["🔥", "Nitro", "A bigger nitro tank"], armor: ["🛡️", "Armour", "Takes less damage"] };
const PRICE = [2500, 6000, 15000];
const upg = Object.assign({ engine: 0, grip: 0, nitro: 0, armor: 0 }, store.get("void.upg") || {});
let cash = store.get("void.cash") ?? 3000, cashSaveT = 0;
gameOpts.upg = upg;
addEventListener("pagehide", () => store.set("void.cash", cash));          // phones kill tabs without warning: save on the way out
function earn(n) { cash += Math.max(0, Math.round(n)); clearTimeout(cashSaveT); cashSaveT = setTimeout(() => store.set("void.cash", cash), 800); const el = document.getElementById("gCash"); if (el) el.textContent = "$" + cash.toLocaleString(); }
function renderUpg() {
  $("upgBody").innerHTML = `<div class="grp"><div class="grp-h">Performance<b>$${cash.toLocaleString()}</b></div><div class="upg">${Object.entries(UPG).map(([k, [ic, name, txt]]) => { const lv = upg[k], p = PRICE[lv]; return `<div class="up-row"><b>${ic}</b><div><span>${name}</span><small>${txt}</small><i>${[0, 1, 2].map(i => `<u class="${i < lv ? "on" : ""}"></u>`).join("")}</i></div>${p ? `<button data-u="${k}" ${cash < p ? "disabled" : ""}>$${p.toLocaleString()}</button>` : "<em>MAX</em>"}</div>`; }).join("")}</div><p class="up-note">Every point you score is also cash. Fully upgraded is about 20% faster and takes 40% less damage.</p></div>`;
}
$("upgBody").addEventListener("click", e => {
  const b = e.target.closest("button[data-u]"); if (!b) return; const k = b.dataset.u, p = PRICE[upg[k]];
  if (!p || cash < p) return; cash -= p; upg[k]++; store.set("void.cash", cash); store.set("void.upg", upg);
  goals.stats.upg = Object.values(upg).reduce((a, v) => a + v, 0); goals.note(""); earn(0); renderUpg(); if (!sound.on) setSound(true); sound.rev(); toast(`${UPG[k][1]} upgraded to level ${upg[k]}`);
});
goals.stats.upg = Object.values(upg).reduce((a, v) => a + v, 0); renderUpg(); earn(0);
// one bonus a day for coming back
try { const day = new Date().toDateString(); if (store.get("void.day") !== day) { const first = store.get("void.day") == null; store.set("void.day", day); if (!first) { cash += 2000; store.set("void.cash", cash); setTimeout(() => toast("Daily bonus: $2,000 for upgrades in the Garage"), 2500); } } } catch { }
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
    if (next === "play") { game.enter(); if (SET.radio !== "score") sound.setRadio(SET.radio); }
    if (mode !== "play" && sound.radio && sound.radio !== "score") sound.setRadio("score");
    $("fade").classList.remove("on");
  }, 320);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-rgo]"); if (b) { e.preventDefault(); go(b.dataset.go); } });
$("exit").onclick = () => go("home");
addEventListener("keydown", e => {
  if (e.code === "Escape" && mode === "play" && !document.body.classList.contains("garage")) { menu(); return; }
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
  bloom.resolution.set(Math.max(1, ww * W.bloomRes), Math.max(1, hh * W.bloomRes)); camera.aspect = ww / hh;
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
let lastGauge = 0, lastChips = 0, cycleT = 0;
// the speedometer: a dial with a glowing arc, the speed, the gear (or altitude when flying) and what you're in
const gauge = document.getElementById("gGauge"), gx = gauge.getContext("2d");
function drawGauge(S) {
  const W2 = gauge.width, c = W2 / 2, r = c - 22, a0 = Math.PI * .75, a1 = Math.PI * 2.25, max = S.veh === "plane" ? 600 : S.veh === "boat" ? 140 : 360, f = Math.min(1, S.speed / max);
  gx.clearRect(0, 0, W2, W2);
  gx.beginPath(); gx.arc(c, c, r + 14, 0, 7); gx.fillStyle = "rgba(6,8,14,.62)"; gx.fill();
  gx.lineCap = "round"; gx.lineWidth = 14; gx.beginPath(); gx.arc(c, c, r, a0, a1); gx.strokeStyle = "rgba(255,255,255,.12)"; gx.stroke();
  const grd = gx.createLinearGradient(0, W2, W2, 0); grd.addColorStop(0, "#3df5ff"); grd.addColorStop(.6, "#ffffff"); grd.addColorStop(1, "#ff2a3a");
  gx.beginPath(); gx.arc(c, c, r, a0, a0 + (a1 - a0) * f); gx.strokeStyle = grd; gx.shadowColor = "#3df5ff"; gx.shadowBlur = 16; gx.stroke(); gx.shadowBlur = 0;
  gx.lineWidth = 2; gx.strokeStyle = "rgba(255,255,255,.5)"; for (let k = 0; k <= 12; k++) { const a = a0 + (a1 - a0) * k / 12, i = r - 18, o = r - (k % 3 ? 24 : 30); gx.beginPath(); gx.moveTo(c + Math.cos(a) * i, c + Math.sin(a) * i); gx.lineTo(c + Math.cos(a) * o, c + Math.sin(a) * o); gx.stroke(); }
  gx.fillStyle = "#fff"; gx.textAlign = "center"; gx.font = `900 ${W2 * .22}px Unbounded, Inter, sans-serif`; gx.fillText(Math.round(S.speed), c, c + W2 * .06);
  gx.font = `700 ${W2 * .055}px Inter, sans-serif`; gx.fillStyle = "rgba(255,255,255,.6)"; gx.fillText("KM/H", c, c + W2 * .14);
  gx.font = `800 ${W2 * .07}px Unbounded, Inter, sans-serif`; gx.fillStyle = S.air ? "#3df5ff" : "#ffd23d";
  gx.fillText(S.air || S.veh === "plane" || S.veh === "heli" ? `${Math.round(S.alt)} m` : S.veh === "boat" ? "BOAT" : `GEAR ${S.gear}`, c, c + W2 * .3);
  if (S.nitro > .1) { gx.font = `800 ${W2 * .05}px Inter, sans-serif`; gx.fillStyle = "#3df5ff"; gx.fillText("NITRO", c, c - W2 * .16); }
}
let wasWrecked = false, wreckPose = null; const wrecks = [];
let fpsNow = 0, shadowN = 0, dailyT = 0; const paused0 = () => !menuEl.hidden || document.body.classList.contains("garage");
// small things far away (signs, pickups, rings, lamps, kiosks) are left out of the picture: they were a fifth of all draw calls.
// They move to layer 5, which no camera renders, so their own .visible (used by the game) is untouched.
const smallFar = { list: [], t: -9, n: 0 }, sfV = new THREE.Vector3();
function cullSmall(time, det) {
  if (time - smallFar.t > 5 || time < smallFar.t) { smallFar.t = time; smallFar.list.length = 0; scene.traverse(o => { if (((o.isMesh && !o.isInstancedMesh) || o.isSprite) && (o.layers.mask === 1 || o.layers.mask === 32)) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < 15) smallFar.list.push(o); } }); }
  if (++smallFar.n % 10) return;
  const R = (300 + Math.max(0, camera.position.y) * 2.5) * Math.max(.8, det), R2 = R * R;
  for (const o of smallFar.list) {
    sfV.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const far = sfV.y < 80 && sfV.distanceToSquared(camera.position) > R2;
    if (far) { if (o.layers.mask === 1) o.layers.set(5); } else if (o.layers.mask === 32) o.layers.set(0);
  }
}
const perf = { t: 0, n: 0, pr: renderer.getPixelRatio(), max: renderer.getPixelRatio(), down: 0 };
applySettings();
let lastHud = 0, prevGear = 1, feedFlip = 0;
function frameLoop(fixed) {
  const raw = fixed ? 0 : clock.getDelta(), dt = fixed || Math.min(.05, raw), time = clock.elapsedTime;
  // adaptive resolution: drop the pixel count when frames run slow, bring it back when there is headroom
  if (!fixed && raw < .5) {
    perf.t += raw; perf.n++;
    if (perf.t > 1.5) {
      const avg = perf.t / perf.n, was = perf.pr; fpsNow = Math.round(1 / avg); const fe = document.getElementById("gFps"); if (fe) fe.textContent = fpsNow + " fps";
      if (avg > 1 / 25 && mode === "play" && SET.q !== "low") perf.down = 3;          // very slow: skip straight to a lower level
      if (avg > 1 / 45 && perf.pr > .75 && perf.down < 3) perf.pr = Math.max(.75, perf.pr - .12);          // below 75% everything turns to mush: drop a quality level instead
      else if (avg > 1 / 40 && mode === "play" && ++perf.down >= 3 && SET.q !== "low") {      // still slow at the lowest resolution: drop a quality level
        perf.down = 0; SET.q = { ultra: "high", high: "medium", medium: "low" }[SET.q]; perf.pr = W.QUALITY[SET.q].pr; applySettings(false); toast(`Graphics set to ${SET.q} to keep it smooth`);
      }
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
  W.city.camQ = camera.quaternion; W.city.update(time, camera.position);
  W.follow(S.pos);
  if (mode !== "watch") $("fade").style.opacity = "";

  // the car, or the plane / helicopter / boat
  const veh = mode === "play" ? S.veh || "car" : "car";
  const gsx = mode === "play" ? game.state : null, heroDriven = mode !== "play" || (veh === "car" && !(gsx && gsx.ride));
  carRoot.visible = heroDriven || !!(gsx && gsx.heroPark); lastS = S;
  if (gsx && gsx.ride && veh === "car") { dressRide(RIDE, gsx.ride); RIDE.g.visible = true; RIDE.g.position.copy(S.pos); RIDE.g.quaternion.copy(S.quat); } else RIDE.g.visible = false;
  if (gsx && gsx.ridePark) { const P = gsx.ridePark; dressRide(RPARK, P.ride); RPARK.g.visible = true; RPARK.g.position.set(P.x, 0, P.z); RPARK.g.rotation.set(0, -P.yaw, 0); } else RPARK.g.visible = false;
  walker.g.visible = veh === "foot";
  if (veh === "foot") { walker.g.position.copy(S.pos); walker.g.rotation.set(0, -gsx.yaw, 0); const sw = Math.sin(S.walk || 0) * Math.min(.7, S.speed / 14) * (S.alt > .3 ? .3 : 1); walker.legs[0].rotation.z = sw; walker.legs[1].rotation.z = -sw; }
  vehicles.show(veh === "car" || veh === "foot" ? null : veh, S.pos, S.quat, S, time, dt);
  if (S.splash) for (let k = 0; k < 6; k++) { const pf = fx.puffs[fx.puffI++ % fx.puffs.length]; pf.s.position.copy(S.pos).add(new THREE.Vector3((Math.random() - .5) * 3, .3, (Math.random() - .5) * 3)); pf.life = 1; pf.s.visible = true; pf.grow = .8; pf.s.scale.setScalar(.8); pf.s.material.color.set(0xeaf6ff); pf.v.set((Math.random() - .5) * 6, 4 + Math.random() * 4, (Math.random() - .5) * 6); }
  if (veh === "boat" && S.speed > 12 && Math.random() < .6) { const back = new THREE.Vector3(-3.6, .1, (Math.random() - .5) * 2).applyQuaternion(S.quat).add(S.pos); const pf = fx.puffs[fx.puffI++ % fx.puffs.length]; pf.s.position.copy(back); pf.life = 1; pf.s.visible = true; pf.grow = .5; pf.s.scale.setScalar(.5); pf.s.material.color.set(0xf4fbff); pf.v.set((Math.random() - .5) * 2, .6, (Math.random() - .5) * 2); }
  const night = W.timeOfDay !== "day";
  heads.intensity = night && veh === "car" ? (W.timeOfDay === "night" ? 260 : 120) : 0;
  W.sky.position.copy(camera.position); W.grade.uniforms.time.value = time % 100; W.grade.uniforms.sharp.value = renderer.getPixelRatio() < (devicePixelRatio || 1) * .95 ? .45 : .22;
  W.grade.uniforms.blur.value = mode === "play" && motionOK() ? Math.max(0, Math.min(1, (S.speed - 160) / 220)) * .9 + (S.nitro || 0) * .5 : 0;
  atmos.update(dt, time, S, mode === "play" ? game.state : null);
  W.city.poolMat.opacity = W.timeOfDay === "night" ? 1 : W.timeOfDay === "sunset" ? .45 : 0; W.city.poolMat.visible = W.timeOfDay !== "day";
  extras.sky(dt, time);
  // the living city: when switched on, the day turns and the weather changes on its own
  if (SET.cycle === "on" && mode === "play" && (cycleT += dt) > 150) { cycleT = 0; cycleTime(); if (Math.random() < .5) { const w = ["clear", "clear", "rain", "fog", "storm", "snow"][Math.floor(Math.random() * 6)]; atmos.setWeather(w); SET.weather = w; } }
  if (mode === "play") { contracts.update(dt, time); dealer.update(dt, time); tutUpdate(); if ((dailyT += dt) > 1) { dailyT = 0; dailyCheck(); } extras.update(dt, time); goals.stats.coins = extras.coins().got; goals.update(dt, game.state, S.speed); if (time - lastChips > 2) { lastChips = time; chips(); } }
  if (mode === "play" && time - lastGauge > .05) { lastGauge = time; drawGauge(S); const fu = document.getElementById("gFuel"); if (fu && S.fuel != null) { fu.style.setProperty("--v", S.fuel); fu.classList.toggle("low", S.fuel < .2); } }
  if (heroDriven) { car.group.position.copy(S.pos); car.group.quaternion.copy(S.quat); } else if (gsx && gsx.heroPark) { car.group.position.set(gsx.heroPark.x, 0, gsx.heroPark.z); car.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -gsx.heroPark.yaw); }
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
  if (heroDriven) for (const wh of car.wheels) wh.rotation.z -= S.air ? roll * .15 : roll;
  car.group.updateMatrixWorld(true);

  // shadow, underglow, exhaust, speed lines
  const fr = S.fr, ground = clamp(1 - S.pos.y / 3) * (fr.u.y > .8 ? 1 : 0);
  fx.shadow.position.set(S.pos.x, S.pos.y > .5 ? .07 : S.pos.y + .07, S.pos.z); fx.shadow.material.opacity = veh === "car" && heroDriven ? ground : 0; fx.shadow.rotation.z = Math.atan2(-fr.f.z, fr.f.x);
  const glowOn = !!OPTS.glow.items[build.glow][1];
  fx.glow.position.copy(fx.shadow.position).y += .01; fx.glow.rotation.z = fx.shadow.rotation.z; fx.glow.material.opacity = glowOn && heroDriven ? ground * .85 : 0;
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
  const c = S.cam, shake = !motionOK() ? 0 : (Math.max(0, S.g - 2) * .004 + S.thrust.power * .01 + (S.shake || 0) * .25 + (S.nitro || 0) * .02) * (S.inside ? .25 : 1);
  camera.position.copy(c.pos).add(new THREE.Vector3(Math.sin(time * 53) * shake, Math.sin(time * 61 + 1) * shake, Math.sin(time * 47 + 2) * shake));
  camera.up.copy(c.up || new THREE.Vector3(0, 1, 0)); camera.lookAt(c.look);
  camera.fov = fovFor(c.fov); camera.near = S.inside || S.screenOn ? .06 : .35; camera.updateProjectionMatrix();
  camLight.position.copy(camera.position).add(new THREE.Vector3(0, 3, 0)); camLight.target.position.copy(S.pos);
  scene.fog.far = lerp(950, 2600, smooth(20, 160, S.alt)) * W.weatherFog; scene.fog.near = lerp(120, 400, smooth(20, 160, S.alt)) * W.weatherFog;
  const DET = { low: .55, medium: .8, high: 1, ultra: 1.2 }[W.quality] || 1; life.detail = DET; W.city.detail = DET;
  cullSmall(time, DET);
  scene.fog.far *= Math.min(1, DET + .2); camera.far = scene.fog.far * 1.1 + 150; camera.updateProjectionMatrix();          // nothing past the fog gets drawn
  // refresh the car's reflections every few frames (the car hides from its own camera)
  // (no shadows, no crowds, a short view: it only has to look right in the paint)


  // the car's own sound
  if (S.gear > prevGear && !S.air && S.speed > 20) sound.pop();
  prevGear = S.gear;
  sound.car({ rpm: S.rpm, load: S.load, engine: mode === "build" || mode === "home" ? .4 : S.engine, thrust: S.thrust.power, speed: S.speed, inside: S.inside, slip: mode === "play" && game.state && game.state.mode === "drive" && game.state.veh === "car" && !paused0() ? game.state.slip || 0 : 0 });

  if (++shadowN % ((W.QUALITY[W.quality] || {}).shEvery || 3) === 0) renderer.shadowMap.needsUpdate = true;
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
window.VOID = { contracts, step: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frameLoop(dt); }, W, car, life, carCube, carEnv, get police() { return police; }, get races() { return races; }, get nav() { return nav; }, net, orbit, go, seek: t => { w.t = t; if (w.playing) playFrom(t); }, pause, get w() { return w; }, game };   // handy for testing in the console
