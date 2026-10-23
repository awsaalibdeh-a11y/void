// VOID: one WebGL canvas, three modes on top of a showroom home screen.
//   Watch: a 48 s film whose clock is the music.  Play: drive it, fly it, land it.  Build: paint it.
import * as THREE from "three";

const V = new URL(import.meta.url).search;
const $ = id => document.getElementById(id);
const setLoad = p => { $("ldbar").style.width = p + "%"; $("ldpct").textContent = Math.round(p); };
setLoad(15);
const [{ createWorld, clamp, lerp, smooth, frame, PAD_R }, { buildCar }, { addInterior, HEAD }, { Sound, BAR }, { createWatch, TOTAL, CHAPTERS }, { createGame }, { createLife }] = await Promise.all(
  ["world", "car", "interior", "sound", "watch", "game", "npc"].map(n => import(`./${n}.js${V}`)));
setLoad(40);

const COARSE = matchMedia("(pointer: coarse)").matches, REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const W = await createWorld($("gl"), COARSE), { renderer, scene, camera, composer, bloom, camLight, fx } = W;
setLoad(55);

const car = buildCar();
scene.add(car.group);
setLoad(80);
const interior = addInterior(car, renderer);
const sound = new Sound();
const watch = createWatch(W, car, interior);
const life = createLife(scene, W.roads, W.walkways, COARSE);
const game = createGame(W, car, sound, life, { garage: () => openGarage(true) });
$("osmCredit").textContent = W.credit;
// the garage: the Build panel over the game, the game paused underneath
function openGarage(on) { document.body.classList.toggle("garage", on); game.pause(on); }
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
};
const DEFAULT = { paint: 0, finish: 0, rim: 0, cal: 0, trim: 0, light: 0, glow: 0 };
let build = { ...DEFAULT, ...(store.get("void.build2") || {}) };
try { const h = new URLSearchParams(location.hash.slice(1)).get("b"); if (h) { const v = h.split(".").map(Number); Object.keys(DEFAULT).forEach((k, i) => { if (OPTS[k].items[v[i]]) build[k] = v[i]; }); } } catch { }
function applyBuild() {
  car.setPaint(OPTS.paint.items[build.paint][1]); car.setFinish(OPTS.finish.items[build.finish][1]);
  car.setRim(OPTS.rim.items[build.rim][1]); car.setAccent(OPTS.cal.items[build.cal][1]); car.setTrim(OPTS.trim.items[build.trim][1]); car.setLight(OPTS.light.items[build.light][1]);
  const gl = OPTS.glow.items[build.glow][1]; if (gl) fx.glow.material.color.set(gl).multiplyScalar(1.4);
  store.set("void.build2", build);
  $("sum").innerHTML = `<b>HYDRA LTE242 &middot; ${OPTS.paint.items[build.paint][0]}</b>${OPTS.finish.items[build.finish][0]} paint, ${OPTS.rim.items[build.rim][0].toLowerCase()} wheels, ${OPTS.cal.items[build.cal][0].toLowerCase()} calipers, ${OPTS.trim.items[build.trim][0].toLowerCase()} accents, ${OPTS.light.items[build.light][0].toLowerCase()} lights${gl ? ", " + OPTS.glow.items[build.glow][0].toLowerCase() + " underglow" : ""}`;
  for (const b of document.querySelectorAll("#cfgBody button")) b.setAttribute("aria-pressed", String(build[b.dataset.k] === +b.dataset.i));
  for (const k in OPTS) { const n = document.querySelector(`[data-name="${k}"]`); if (n) n.textContent = OPTS[k].items[build[k]][0]; }
}
$("cfgBody").innerHTML = Object.entries(OPTS).map(([k, o]) => `<div class="grp"><div class="grp-h">${o.label}<b data-name="${k}"></b></div><div class="${o.seg ? "seg" : "sw"}">${o.items.map(([n, c], i) => o.seg
  ? `<button data-k="${k}" data-i="${i}">${n}</button>`
  : `<button data-k="${k}" data-i="${i}" title="${n}" aria-label="${o.label}: ${n}" style="background:${c || "repeating-linear-gradient(45deg,#222 0 4px,#111 4px 8px)"}"></button>`).join("")}</div></div>`).join("");
$("cfgBody").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; build[b.dataset.k] = +b.dataset.i; applyBuild(); });
$("reset").onclick = () => { build = { ...DEFAULT }; applyBuild(); toast("Back to black and red"); };
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
let lastHud = 0, prevGear = 1, feedFlip = 0;
function frameLoop() {
  const dt = Math.min(.05, clock.getDelta()), time = clock.elapsedTime;
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
  life.update(dt, time, mode === "play" ? S.player : null);
  if (mode !== "watch") $("fade").style.opacity = "";

  // the car
  car.group.position.copy(S.pos); car.group.quaternion.copy(S.quat);
  car.setReveal(S.reveal);
  car.setThrust(S.thrust.power, S.thrust.angle, S.thrust.deploy, time);
  car.setWings(S.wings, time);
  const roll = S.speed / 3.6 * dt / .37;
  for (const wh of car.wheels) wh.rotation.z -= S.air ? roll * .15 : roll;
  car.group.updateMatrixWorld(true);

  // shadow, underglow, exhaust, speed lines
  const fr = S.fr, ground = clamp(1 - S.pos.y / 3) * (fr.u.y > .8 ? 1 : 0);
  fx.shadow.position.set(S.pos.x, .01, S.pos.z); fx.shadow.material.opacity = ground; fx.shadow.rotation.z = Math.atan2(-fr.f.z, fr.f.x);
  const glowOn = !!OPTS.glow.items[build.glow][1];
  fx.glow.position.copy(fx.shadow.position); fx.glow.rotation.z = fx.shadow.rotation.z; fx.glow.material.opacity = glowOn ? ground * .85 : 0;
  if (S.thrust.power > .3) for (const n of nozzles) if (Math.random() < .18) {
    const pf = fx.puffs[fx.puffI++ % fx.puffs.length], wp = n.clone().applyMatrix4(car.group.matrixWorld);
    pf.s.position.copy(wp); pf.life = 1; pf.s.visible = true; pf.s.scale.setScalar(.4);
    pf.v.copy(fr.u).multiplyScalar(-(1 - S.thrust.angle) * 7).addScaledVector(fr.f, -S.thrust.angle * 9 - S.speed / 3.6 * .2).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(1.5));
  }
  for (const pf of fx.puffs) if (pf.life > 0) {
    pf.life -= dt * .9; pf.s.position.addScaledVector(pf.v, dt); pf.v.multiplyScalar(.97);
    pf.s.scale.setScalar(.4 + (1 - pf.life) * 4.5); pf.s.material.opacity = Math.max(0, pf.life) * .5; if (pf.life <= 0) pf.s.visible = false;
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
  const c = S.cam, shake = REDUCED ? 0 : (Math.max(0, S.g - 2) * .004 + S.thrust.power * .01) * (S.inside ? .25 : 1);
  camera.position.copy(c.pos).add(new THREE.Vector3(Math.sin(time * 53) * shake, Math.sin(time * 61 + 1) * shake, Math.sin(time * 47 + 2) * shake));
  camera.up.copy(c.up || new THREE.Vector3(0, 1, 0)); camera.lookAt(c.look);
  camera.fov = fovFor(c.fov); camera.near = S.inside || S.screenOn ? .02 : .05; camera.updateProjectionMatrix();
  camLight.position.copy(camera.position).add(new THREE.Vector3(0, 3, 0)); camLight.target.position.copy(S.pos);
  scene.fog.far = lerp(480, 1600, smooth(20, 110, S.alt)); scene.fog.near = lerp(70, 200, smooth(20, 110, S.alt));

  // the car's own sound
  if (S.gear > prevGear && !S.air && S.speed > 20) sound.pop();
  prevGear = S.gear;
  sound.car({ rpm: S.rpm, load: S.load, engine: mode === "build" || mode === "home" ? .4 : S.engine, thrust: S.thrust.power, speed: S.speed, inside: S.inside });

  composer.render();
}

setLoad(95);
renderer.compile(scene, camera);
let raf;
const loop = () => { raf = requestAnimationFrame(loop); frameLoop(); };
loop();
setLoad(100);
setTimeout(() => { $("loader").classList.add("done"); setTimeout(() => { intro.t = 0; if (sound.on) sound.rev(); }, 450); }, 900);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { cancelAnimationFrame(raf); if (mode === "watch" && w.playing) pause(); if (sound.ctx) sound.ctx.suspend(); }
  else { clock.getDelta(); loop(); if (sound.on && sound.ctx) sound.ctx.resume(); }
});
window.VOID = { W, car, orbit, go, seek: t => { w.t = t; if (w.playing) playFrom(t); }, pause, get w() { return w; }, game };   // handy for testing in the console
