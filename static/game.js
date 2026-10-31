// Play: free roam in VOID City. Drive anywhere (grip, drift with the handbrake, nitro), hit the loop, the ramps
// and the sky rings, press Fly to lift off: the thrusters hold you up when slow, the wings and real lift and drag
// take over when fast (bank to turn, pull up to climb, too slow and it stalls). Land on the park lawn or a
// skyscraper's helipad. Smash traffic that is slower than you; anything faster that hits you does the damage.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, lerp, G, R, LZ, HW, RAMP_X, PAD_R, ZONES, frame, loc, zonesFrom } from "./world.js";
import { HEAD } from "./interior.js";

const $ = id => document.getElementById(id);
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const UP = new THREE.Vector3(0, 1, 0);
export const SPAWN = { x: -110, z: 0, yaw: 0 };                                // on the boulevard, lined up with the loop

export function createGame(W, car, sound, life, opts = {}) {
  const T = W.track, city = W.city, fr = frame(), back = frame(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const keys = new Set(), touch = new Set();
  const held = k => keys.has(k) || touch.has(k);
  const KEYMAP = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    Space: "up", KeyE: "up", KeyQ: "down", ControlLeft: "down", ShiftLeft: "nitro", ShiftRight: "nitro", KeyN: "nitro", KeyX: "drift" };
  let g = null, view = "chase", active = false, paused = false, photo = false;
  const rig = { yaw: null, dist: 7 };
  const api0 = { sens: 1 };
  const stick = { x: 0, y: 0 };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), orbit = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0, t: 0 };
  const LOOP_X = T.P[T.loopIn].x;
  const gp = { steer: 0, gas: 0, brake: 0, pitch: 0, on: false, prev: {} };

  addEventListener("keydown", e => {
    if (!active || paused) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === "KeyE" && g && g.started) footToggle();
    if (e.code === "KeyY" && g && g.started) boardToggle();
    if (e.code === "KeyF") toggleFly();
    if (e.code === "KeyC" || e.code === "KeyV") toggleView();
    if (e.code === "KeyG") opts.garage && opts.garage();
    if (e.code === "KeyH") horn();
    if (e.code === "KeyT") opts.cycleTime && opts.cycleTime();
    if (e.code === "KeyP") togglePhoto();
    if (e.code === "KeyR") reset();
    if (e.code === "KeyL" && g && g.mode === "air") { g.landing = true; g.hover = g.vel.length() < 25; say("Landing: following the glide slope", 2); }
  });
  addEventListener("keyup", e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener("blur", () => { keys.clear(); touch.clear(); });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = b.dataset.pad;
    const on = e => { e.preventDefault(); touch.add(k); b.classList.add("on"); }, off = e => { e.preventDefault(); touch.delete(k); b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
    b.addEventListener("contextmenu", e => e.preventDefault());
  }
  // free look, like PUBG: on a computer click the game once and the mouse turns the camera (Esc gives the mouse back);
  // on a phone drag anywhere on the screen that isn't a button. The camera stays where you put it, and only drifts
  // back behind the car after a few seconds of fast driving without looking around.
  const gl = $("gl"), touches = new Map();
  const look = (dx, dy, k = 1) => { k *= api0.sens || 1; orbit.yaw += dx * .0042 * k; orbit.pitch = clamp(orbit.pitch + dy * .0032 * k, -.35, 1.15); orbit.t = 3; };
  gl.addEventListener("pointerdown", e => {
    if (!active) return;
    if (e.pointerType === "mouse") { if (!document.pointerLockElement && !photo) { try { gl.requestPointerLock(); } catch { } } else { orbit.drag = true; orbit.x = e.clientX; orbit.y = e.clientY; } return; }
    touches.set(e.pointerId, [e.clientX, e.clientY]);
  });
  addEventListener("pointermove", e => {
    if (!active) return;
    if (document.pointerLockElement === gl) { look(e.movementX, e.movementY); return; }
    if (touches.has(e.pointerId)) { const [x, y] = touches.get(e.pointerId); look(e.clientX - x, e.clientY - y, 1.5); touches.set(e.pointerId, [e.clientX, e.clientY]); return; }
    if (orbit.drag) { look(e.clientX - orbit.x, e.clientY - orbit.y); orbit.x = e.clientX; orbit.y = e.clientY; }
  });
  const lift = e => { touches.delete(e.pointerId); orbit.drag = false; };
  addEventListener("pointerup", lift); addEventListener("pointercancel", lift);
  document.addEventListener("pointerlockchange", () => document.body.classList.toggle("g-locked", document.pointerLockElement === gl));
  gl.addEventListener("wheel", e => { if (!active) return; orbit.dist = clamp((orbit.dist || 0) + e.deltaY * .01, -3, 30); e.preventDefault(); }, { passive: false });

  const toggleView = () => { view = view === "chase" ? "seat" : view === "seat" ? "hood" : "chase"; $("gView").textContent = { chase: "Front seat", seat: "Hood cam", hood: "Chase cam" }[view]; };
  const togglePhoto = () => { photo = !photo; document.body.classList.toggle("g-photo", photo); orbit.dist = 9; say(photo ? "Photo mode: drag to orbit, scroll to zoom, P to leave" : "", 3); };
  $("gView").onclick = toggleView;
  $("gFly").onclick = () => toggleFly();
  $("gGarage").onclick = () => opts.garage && opts.garage();
  if ($("gHorn")) $("gHorn").onclick = () => horn();
  if ($("gTime")) $("gTime").onclick = () => opts.cycleTime && opts.cycleTime();
  if ($("gPhoto")) $("gPhoto").onclick = togglePhoto;
  $("gGo").onclick = () => { $("gReady").hidden = true; if (!sound.on) sound.setOn(true); g.started = true; };

  // ---- extra stunts: ramps round the city and rings in the sky ----
  const RAMPS = [{ x: RAMP_X, z: LZ, yaw: 0, len: 14, h: 4.5, w: HW, main: true }];
  const W2 = 1040;
  for (const r of [{ x: W2 + 60, z: -6, yaw: 0, len: 22, h: 7 }, { x: W2 + 60, z: 6, yaw: 0, len: 22, h: 7 }, { x: -1040, z: 0, yaw: Math.PI, len: 16, h: 5 }, { x: -1040, z: 280, yaw: Math.PI, len: 16, h: 5 },
    { x: city.lawn.x - 40, z: city.lawn.z, yaw: 0, len: 18, h: 5.5 }, { x: 1000, z: -300, yaw: -Math.PI / 2, len: 18, h: 6 }, { x: -1000, z: -500, yaw: Math.PI / 2, len: 18, h: 6 },
    // the stunt park (south-west square)
    { x: -900, z: 1345, yaw: 0, len: 10, h: 2.2 }, { x: -860, z: 1365, yaw: 0, len: 8, h: 1.6 }, { x: -760, z: 1350, yaw: Math.PI, len: 10, h: 2.4 }, { x: -880, z: 1420, yaw: 0, len: 22, h: 7.5, w: 5 },
    { x: -680, z: 1440, yaw: Math.PI, len: 22, h: 7.5, w: 5 }, { x: -620, z: 1350, yaw: Math.PI / 2, len: 12, h: 3 }, { x: -560, z: 1460, yaw: -Math.PI / 2, len: 12, h: 3 }, { x: -800, z: 1395, yaw: Math.PI / 4, len: 9, h: 1.8 }]) RAMPS.push({ w: 4, ...r });
  {
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x1b1c22, metalness: .6, roughness: .35 }), stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(1.6), toneMapped: false });
    for (const r of RAMPS) {
      if (r.main) continue;
      const shape = new THREE.Shape(); const n = 16; shape.moveTo(0, 0); for (let i = 0; i <= n; i++) { const u = i / n; shape.lineTo(u * r.len, r.h * u * u); } shape.lineTo(r.len, 0); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: r.w * 2, bevelEnabled: false }).translate(0, 0, -r.w);
      const m = new THREE.Mesh(geo, rampMat); m.position.set(r.x, 0, r.z); m.rotation.y = -r.yaw; m.castShadow = m.receiveShadow = true; W.scene.add(m);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.3, .08, r.w * 2), stripe); e.position.set(r.len - .2, r.h + .02, 0); m.add(e); const side = new THREE.Mesh(new THREE.BoxGeometry(r.len, .1, .1), stripe); side.position.set(r.len / 2, r.h / 2 + .1, s * r.w); side.rotation.z = Math.atan(r.h / r.len); m.add(side); }
    }
  }
  const RAILS = [
    { x: -935, z: 1384, yaw: 0, len: 26, h: .9 }, { x: -935, z: 1396, yaw: 0, len: 26, h: .55 }, { x: -700, z: 1338, yaw: Math.PI / 2, len: 22, h: 1.1 }, { x: -820, z: 1455, yaw: 0, len: 40, h: .8 },
    { x: -600, z: 1400, yaw: Math.PI / 2, len: 30, h: .7 }, { x: -760, z: 1370, yaw: Math.PI / 4, len: 18, h: 1.3 },
    { x: 974, z: 1215, yaw: Math.PI / 2, len: 210, h: .9 },                                  // the boardwalk railing
    { x: 2580, z: 12, yaw: 0, len: 50, h: .8 }, { x: 2580, z: -12, yaw: 0, len: 50, h: .8 },  // by the highway at the foot of the mountains
  ].map(r => ({ ...r, c: Math.cos(r.yaw), s: Math.sin(r.yaw) }));
  {
    const parts = [];
    for (const r of RAILS) {
      const bar = new THREE.CylinderGeometry(.06, .06, r.len, 8).rotateZ(Math.PI / 2).translate(r.len / 2, r.h, 0);
      const g = [bar]; for (let a = 1; a < r.len; a += 3) g.push(new THREE.BoxGeometry(.08, r.h, .08).translate(a, r.h / 2, 0));
      for (const q of g) { q.rotateY(-r.yaw); q.translate(r.x, 0, r.z); parts.push(q.toNonIndexed()); }
    }
    W.scene.add(new THREE.Mesh(mergeGeometries(parts.map(q => { for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal") q.deleteAttribute(k); return q; })), new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: .9, roughness: .25 })));
  }
  const railNear = (x, z, y) => { for (const r of RAILS) { const dx = x - r.x, dz = z - r.z, a = dx * r.c + dz * r.s, b = -dx * r.s + dz * r.c; if (a > .3 && a < r.len - .3 && Math.abs(b) < .8 && y > r.h + .05 && y < r.h + 1.4) return { r, a }; } return null; };
  const rampAt = (x, z) => {
    for (const r of RAMPS) {
      const dx = x - r.x, dz = z - r.z, c = Math.cos(r.yaw), s = Math.sin(r.yaw), a = dx * c + dz * s, b = -dx * s + dz * c;
      if (a >= 0 && a <= r.len && Math.abs(b) < r.w + .3) return { r, h: r.h * (a / r.len) ** 2, a, slope: 2 * r.h * a / (r.len * r.len) };
    }
    return null;
  };
  const RINGS = [];
  {
    let sd = 9; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(2.2), toneMapped: false });
    // a winding course over midtown, then a few round the park and over the river
    const path = [[300, 60, -60], [420, 90, -160], [520, 120, -300], [430, 150, -450], [250, 170, -520], [60, 150, -460], [-60, 120, -330], [-120, 90, -180], [-260, 70, 60], [-400, 60, 250], [-480, 55, 420], [-300, 50, 520], [-700, 40, 300], [-1100, 30, 0], [1250, 60, 0], [1450, 40, 0]];
    path.forEach(([x, y, z], k) => {
      const nx = path[(k + 1) % path.length], yaw = Math.atan2(nx[2] - z, nx[0] - x);
      const m = new THREE.Mesh(new THREE.TorusGeometry(9, .6, 10, 40), mat.clone()); m.position.set(x, y, z); m.rotation.y = -yaw + Math.PI / 2; W.scene.add(m);
      RINGS.push({ m, x, y, z, nx: Math.cos(yaw), nz: Math.sin(yaw), done: 0, side: 0 }); void rr;
    });
  }

  function spawn(at) {
    const s = at || SPAWN; rig.yaw = null; if (g && g.ride) releaseRide(); if (g) { g.heroPark = null; }
    Object.assign(g, { mode: "drive", x: s.x, z: s.z, y: s.y || 0, yaw: s.yaw, vel: new THREE.Vector3(), pitch: 0, roll: 0, steer: 0, wings: 0, thr: 0, ang: 0, gForce: 1, d: 0, hover: false, landing: false, wreck: 0, boom: 0,
      hp: 100, hurtT: 9, impacts: [], fresh: true, fuel: 1, veh: "car", airT: 0, drift: 0, driftT: 0, nitro: g.nitro ?? 1, nitroOn: 0, stall: 0, sparks: 0, trS: 0, trF: 0 });
    if (opts.heroOwned && !opts.heroOwned()) g.ride = opts.starter();
  }
  function start() {
    g = { score: 0, started: false, last: { ...SPAWN }, msg: "", msgT: 0, done: new Set(), combo: 1, comboT: 0, smashed: 0, near: new Map(), rings: 0, nitro: 1 };
    spawn(); $("gReady").hidden = false; $("gScore").textContent = "$0"; $("gBest").textContent = best() ? `Best score: ${best()}` : "";
    sound.setGame("idle");
  }
  const best = () => store.get("void.best3") || 0;
  const say = (m, t = 3) => { g.msg = m; g.msgT = t; };
  function addScore(n, why, quiet) {
    if (g.comboT > 0) g.combo = Math.min(8, g.combo + 1); else g.combo = 1; g.comboT = 4;
    const pts = Math.round(n * g.combo); g.score += pts; $("gScore").textContent = "$" + g.score.toLocaleString(); if (g.score > best()) store.set("void.best3", g.score);
    say(`${why}  +$${pts.toLocaleString()}${g.combo > 1 ? `  ×${g.combo}` : ""}`, 2.2); if (!quiet) sound.win();
    opts.onScore && opts.onScore(n, why, pts);
  }
  // where the car was hit and how hard, for the dents (main.js turns these into real damage on the model)
  const impact = (x, y, z, p) => { if (p > 3 && g.impacts.length < 8) g.impacts.push({ x, y, z, p }); };
  function hurt(n, why) {
    if (n <= 0 || g.wreck > 0) return;
    n *= 1 - .14 * ((opts.upg || {}).armor || 0);          // armour upgrades soak some of every hit
    g.hp -= n; g.hurtT = 0; g.shake = Math.min(1, (g.shake || 0) + n / 40); document.body.classList.add("g-hurt"); setTimeout(() => document.body.classList.remove("g-hurt"), 160);
    if (g.hp <= 0) { g.hp = 0; wreck(why + ". The car is wrecked"); }
  }
  // ---- on foot: get out of any car, walk or run, jump, and get into any car: yours, one you parked, or one from the traffic ----
  function footToggle() {
    if (!g || g.wreck > 0 || g.frozen > 0) return;
    if (g.veh === "foot") return enterNearest();
    if (g.veh === "board") return boardToggle();
    if (g.veh !== "car" || g.mode !== "drive" || Math.hypot(g.vel.x, g.vel.z) > 3 || g.y > 1) return;
    if (g.ride) { if (g.ride.c) { life.park(g.ride.c, g.x, g.z, g.yaw); g.parkedNpc = g.ride.c; } else g.ridePark = { ride: g.ride, x: g.x, z: g.z, yaw: g.yaw }; }
    else g.heroPark = { x: g.x, z: g.z, yaw: g.yaw };
    const sx = Math.sin(g.yaw), cx = Math.cos(g.yaw); let px = g.x + sx * 2.4, pz = g.z - cx * 2.4;
    if (hitBox(px, pz, .9, .35)) { px = g.x - sx * 2.4; pz = g.z + cx * 2.4; }
    Object.assign(g, { veh: "foot", ride: null, x: px, z: pz, mode: "drive", pitch: 0, roll: 0, wings: 0, hover: false, vy: 0 }); g.vel.set(0, 0, 0);
    sound.pop(); say("On foot: WASD walk · Shift run · Space jump · E get into a car", 3);
  }
  function nearestCar() {
    let best = null, bd = 4.8;
    const tryP = (o, kind) => { if (!o) return; const d = Math.hypot(o.x - g.x, o.z - g.z); if (d < bd) { bd = d; best = { kind, o }; } };
    tryP(g.heroPark, "hero"); tryP(g.ridePark, "owned");
    if (life) for (const c of life.nearCars(g.x, g.z, 8)) if (!c.wreck && !c.taken && Math.abs((c.y || 0) - g.y) < 2.5) tryP(c, "npc");
    return best;
  }
  function enterNearest() {
    const n = nearestCar();
    if (!n) { const cart = cartNear(); if (cart) { if (opts.buyFood && opts.buyFood()) { g.hp = Math.min(100, g.hp + 30); sound.pop(); say("🌭 Hot dog: +30 health", 2); } else say("A hot dog is $10", 1.6); return; } return say("No car close enough: walk right up to one", 1.6); }
    const o = n.o; Object.assign(g, { veh: "car", mode: "drive", x: o.x, z: o.z, yaw: o.yaw, y: 0, pitch: 0, roll: 0 }); g.vel.set(0, 0, 0); rig.yaw = null;
    if (n.kind === "hero") { g.ride = null; g.heroPark = null; say("Back in your VOID car", 2); }
    else if (n.kind === "owned") { g.ride = o.ride; g.ridePark = null; say(`${o.ride.model.name}`, 2); }
    else {
      const stolen = !o.parked || o !== g.parkedNpc; life.take(o); if (g.parkedNpc === o) g.parkedNpc = null;
      g.ride = { model: o.model, color: o.color, rust: o.rust, c: o };
      if (o.fly && o.y > 2) { g.y = o.y; g.mode = "air"; g.hover = true; }
      say(stolen ? `You took a ${o.model.name}${o.v > 2 ? " (the driver runs off)" : ""}` : o.model.name, 2.5);
      if (stolen && opts.onSteal) opts.onSteal(o);
    }
    sound.rev && sound.rev();
  }
  const cartNear = () => (city.carts || []).find(([x, z]) => Math.hypot(x - g.x, z - g.z) < 3.4);
  function releaseRide() { if (g.ride && g.ride.c) { g.ride.c.taken = false; } g.ride = null; }
  function walk(dt, turn, fwd) {
    const cy = (rig.yaw ?? g.yaw) + orbit.yaw, fx = Math.cos(cy), fz = Math.sin(cy);
    let mx = fx * fwd - fz * turn, mz = fz * fwd + fx * turn; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const run = held("nitro") ? 7 : 4, ground = g.y <= (g.gy || 0) + .01;
    g.vel.x = lerp(g.vel.x, mx * run, clamp(dt * (ground ? 10 : 2))); g.vel.z = lerp(g.vel.z, mz * run, clamp(dt * (ground ? 10 : 2)));
    if (ml > .1) { let dy = Math.atan2(mz, mx) - g.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; g.yaw += dy * clamp(dt * 10); }
    if (held("up") && ground) { g.vel.y = 5.2; sound.pop(); }
    g.vel.y -= 14 * dt;
    // walls: slide along them; water: you can't walk on it
    let nx = g.x + g.vel.x * dt, nz = g.z + g.vel.z * dt;
    if (hitBox(nx, nz, g.y + .9, .35)) { if (!hitBox(nx, g.z, g.y + .9, .35)) nz = g.z; else if (!hitBox(g.x, nz, g.y + .9, .35)) nx = g.x; else { nx = g.x; nz = g.z; } }
    const gr = groundAt(nx, nz, g.y + .3);
    if (gr.water) { nx = g.x; nz = g.z; g.vel.x = g.vel.z = 0; say("Too deep to walk in", 1); }
    g.x = nx; g.z = nz; g.y += g.vel.y * dt; g.gy = gr.water ? 0 : Math.max(0, gr.h);
    if (g.y <= g.gy) { g.y = g.gy; g.vel.y = 0; }
    g.walk = (g.walk || 0) + Math.hypot(g.vel.x, g.vel.z) * dt * 2.1;
    if (g.y === 0 && !city.isWater(g.x, g.z)) g.last = { x: g.x, z: g.z, yaw: g.yaw };
  }
  function landTricks() {                                   // shared by ramp jumps and the hoverboard
    if (!g.trS && !g.trF) return;
    const off = a => { const m = Math.abs(a) % (2 * Math.PI); return Math.min(m, 2 * Math.PI - m); }, spins = Math.round(Math.abs(g.trS) / (2 * Math.PI)), flips = Math.round(Math.abs(g.trF) / (2 * Math.PI));
    if (off(g.trS) > .6 || off(g.trF) > .6) { if (Math.abs(g.trS) > 1 || Math.abs(g.trF) > 1) { hurt(g.veh === "board" ? 8 : 18, "Bailed the landing"); say("Bailed! Land the trick straight to get paid", 2); g.shake = 1; sound.crash(); } }
    else if (spins || flips) addScore(spins * 400 + flips * 700 + (spins && flips ? 600 : 0), [flips ? `${flips > 1 ? flips + "× " : ""}${g.veh === "board" ? "Kickflip" : "Backflip"}` : "", spins ? `${360 * spins} spin` : ""].filter(Boolean).join(" + "));
    g.trS = g.trF = 0;
  }
  // scoring a board landing: spins count in halves (180, 360, 540...), flips must come round fully, grabs pay by the second
  function landBoard() {
    const half = Math.round(Math.abs(g.trS) / Math.PI), offS = Math.abs(Math.abs(g.trS) - half * Math.PI);
    const kf = Math.round(Math.abs(g.trF) / (2 * Math.PI)), hf = Math.round(Math.abs(g.trH || 0) / (2 * Math.PI)), offF = Math.abs(Math.abs(g.trF) - kf * 2 * Math.PI), offH = Math.abs(Math.abs(g.trH || 0) - hf * 2 * Math.PI);
    const tried = Math.abs(g.trS) > 1 || Math.abs(g.trF) > 1 || Math.abs(g.trH || 0) > 1;
    if (tried && (offS > .55 || offF > .75 || offH > .75)) { hurt(8, "Bailed"); say("Bailed! Land it straight (or fully backwards)", 2); g.shake = 1; sound.crash(); g.combo = 1; g.comboT = 0; }
    else {
      const grab = g.grabT > .3 ? g.grabT : 0, names = [];
      if (half) names.push(`${half * 180}`); if (kf) names.push(`${kf > 1 ? kf + "× " : ""}Kickflip`); if (hf) names.push(`${hf > 1 ? hf + "× " : ""}Heelflip`); if (grab) names.push(`Grab ${grab.toFixed(1)} s`);
      const pts = half * 250 + kf * 600 + hf * 650 + Math.round(grab * 300) + (names.length > 1 ? 400 * (names.length - 1) : 0);
      if (pts > 0) addScore(pts, names.join(" + "));
    }
    g.trS = g.trF = g.trH = 0; g.grabT = 0;
  }
  // the hoverboard: carve, pump downhill, charge an ollie (hold Space, let go), double-jump in the air, flip, spin, grab, grind rails
  function board(dt, turn, gas, brake) {
    const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), sx = -fz, sz = fx;
    let u = g.vel.x * fx + g.vel.z * fz, w = g.vel.x * sx + g.vel.z * sz;
    if (g.grind) {                                                            // locked to a rail: slide, sparks, cash by the metre
      const G = g.grind, R0 = G.r; G.v = Math.max(6, G.v - .35 * dt); G.a += G.dir * G.v * dt; G.m += G.v * dt;
      g.x = R0.x + R0.c * G.a; g.z = R0.z + R0.s * G.a; g.y = R0.h + .45; g.vy = 0; g.yaw = R0.yaw + (G.dir < 0 ? Math.PI : 0);
      g.vel.set(R0.c * G.dir * G.v, 0, R0.s * G.dir * G.v); g.sparks = 1; g.pitch = 0; g.roll = Math.sin(performance.now() / 70) * .05;
      const jump = held("up") && !g.jumpHeld;
      if (G.a < .2 || G.a > R0.len - .2 || jump) { g.vy = jump ? 6.5 : 2.5; g.grind = null; g.airT = 0; g.dbl = true; addScore(Math.round(G.m * 45) + 100, `Grind ${Math.round(G.m)} m`); sound.whoosh(); }
      g.jumpHeld = held("up"); return;
    }
    const gr = groundAt(g.x, g.z, g.y + .6), gh = gr.water ? city.WATER_Y + .05 : Math.max(0, gr.h), target = gh + .42, ground = g.y <= target + .08 && (g.vy || 0) <= .5;
    const boost = g.nitroOn > .3 && ground, top = boost ? 31 : 19;
    if (ground) {
      g.yaw += turn * (3 / (1 + Math.abs(u) / 14)) * dt * Math.sign(u || 1);
      u += (gas ? 11 * (1 - clamp(u / top) ** 2) : 0) * dt - (brake ? (u > .5 ? 15 : 5) : 0) * dt + g.nitroOn * 7 * dt;
      u = Math.max(-6, u - Math.sign(u) * (.3 + .0016 * u * u) * dt); w *= Math.exp(-7.5 * dt);
      if (gr.terrain && Math.abs(u) > .5) u -= 9.81 * Math.sin(Math.atan(slopes(g.x, g.z, g.yaw)[0])) * dt * .95;     // downhill pulls, uphill costs
      if (held("up")) g.charge = Math.min(.6, (g.charge || 0) + dt);                                                        // crouch to charge...
      else if (g.charge > 0) { g.vy = 6 + g.charge * 7.5; g.charge = 0; g.airT = 0; g.dbl = true; sound.whoosh(); }      // ...and pop
      g.grabT = 0;
    } else {
      g.trS += turn * 8.5 * dt; if (held("drift")) g.trF += 9.5 * dt; if (held("down")) g.trH = (g.trH || 0) + 9.5 * dt; if (held("nitro")) g.grabT = (g.grabT || 0) + dt;
      g.airT += dt; g.charge = 0;
      if (held("up") && !g.jumpHeld && g.dbl) { g.dbl = false; g.vy = Math.max(g.vy, 0) + 5.5; u += 3; sound.whoosh(); g.shake = .3; }   // double jump: one thruster burst
      if (g.vy <= 1.5) { const rn = railNear(g.x, g.z, g.y); if (rn) { const along = fx * rn.r.c + fz * rn.r.s; if (Math.abs(along) > .5) {
        landBoard(); g.grind = { r: rn.r, a: rn.a, dir: Math.sign(along), v: Math.max(7, Math.abs(u) * Math.abs(along)), m: 0 }; sound.thud && sound.thud(.45); g.jumpHeld = held("up"); return; } } }
    }
    g.jumpHeld = held("up");
    g.vel.x = fx * u + sx * w; g.vel.z = fz * u + sz * w;
    let nx = g.x + g.vel.x * dt, nz = g.z + g.vel.z * dt;
    const hit = hitBox(nx, nz, g.y + .9, .45);
    if (hit) { const vn = g.vel.x * hit.nx + g.vel.z * hit.nz; if (vn < 0) { g.vel.x -= 1.4 * vn * hit.nx; g.vel.z -= 1.4 * vn * hit.nz; if (-vn > 9) { hurt((-vn - 9) * 2, "Wiped out"); sound.crash(); } else if (-vn > 2) sound.thud && sound.thud(-vn / 10); } nx = g.x + hit.nx * hit.d * .5; nz = g.z + hit.nz * hit.d * .5; }
    g.x = nx; g.z = nz;
    g.vy = (g.vy || 0) - 15 * dt; g.y += g.vy * dt;
    const gr2 = groundAt(g.x, g.z, g.y + .6), t2 = (gr2.water ? city.WATER_Y + .05 : Math.max(0, gr2.h)) + .42;
    const tv = clamp((t2 - (g.prevT ?? t2)) / dt, -20, 14); g.prevT = t2;                 // how fast the ground under us is rising (ramps launch you)
    if (g.y <= t2) {                                                                       // the hover cushion: springy, never touches
      if (g.vy < -3) { landBoard(); if (g.airT > .7) addScore(Math.round(g.airT * 70), `Air ${g.airT.toFixed(1)} s`, true); g.spV = (g.spV || 0) - .3; }
      g.y += (t2 - g.y) * clamp(dt * 14); if (g.y < t2 - .3) g.y = t2 - .3; g.vy = Math.max(0, g.vy, tv * .95); g.airT = 0;
    }
    const sl = gr2.terrain ? slopes(g.x, g.z, g.yaw) : [0, 0];
    g.pitch = lerp(g.pitch, Math.atan(sl[0]), clamp(dt * 8)); g.roll = lerp(g.roll, -turn * clamp(Math.abs(u) / 14) * .4 - Math.atan(sl[1]), clamp(dt * 6));
    if (!gr2.water && g.y < 2 + gh) g.last = { x: g.x, z: g.z, yaw: g.yaw, y: gr2.terrain ? gh : 0 };
  }
  function boardToggle() {
    if (!g || g.wreck > 0) return;
    if (g.veh === "board") { Object.assign(g, { veh: "foot", trS: 0, trF: 0, trH: 0, grind: null, pitch: 0, roll: 0 }); g.vel.set(0, 0, 0); say("Board away", 1.2); return; }
    if (g.veh === "car" && (g.mode !== "drive" || Math.hypot(g.vel.x, g.vel.z) > 3)) return say("Stop first, then hop on the hoverboard (Y)", 2);
    if (g.veh === "car") { if (g.ride) { if (g.ride.c) life.park(g.ride.c, g.x, g.z, g.yaw); else g.ridePark = { ride: g.ride, x: g.x, z: g.z, yaw: g.yaw }; g.ride = null; } else g.heroPark = { x: g.x, z: g.z, yaw: g.yaw }; const sx = Math.sin(g.yaw), cx = Math.cos(g.yaw); g.x += sx * 2.6; g.z -= cx * 2.6; }
    else if (g.veh !== "foot") { const gh = Math.max(0, groundAt(g.x, g.z, g.y).h); g.y = gh; }
    Object.assign(g, { veh: "board", mode: "drive", vy: 0, trS: 0, trF: 0, trH: 0, grabT: 0, charge: 0, grind: null, wings: 0, hover: false }); g.vel.y = 0; rig.yaw = null;
    say("🛹 Hold Space and let go to ollie (again in the air: double jump) · air: A/D spin, X kickflip, Q heelflip, Shift grab · land on rails to grind · Shift boost · E or Y off", 6); sound.whoosh();
  }
  function toggleFly() {
    if (!g || g.wreck > 0 || !g.started) return;
    if (g.veh === "foot" || g.veh === "board") return;
    if (g.ride && !g.ride.model.kind.fly && g.mode === "drive") return say("This car can't fly. Hover cars and your VOID car can", 2);
    if (g.mode === "drive") { g.mode = "air"; g.hover = true; g.landing = false; g.vel.y = Math.max(g.vel.y, 4.5); g.y += .3; sound.whoosh(); say("Thrusters on. Space/E climb · Q/Ctrl dive · A/D bank · W thrust · Shift nitro · F land"); }
    else if (g.mode === "air" && g.jump) { g.jump = false; g.hover = true; g.landing = false; say("Thrusters on"); }
    else if (g.mode === "air") { g.landing = !g.landing; if (!g.landing) g.hover = true; say(g.landing ? "Coming down gently" : "Flying"); }
  }
  function wreck(why) { g.wreck = 2.6; g.boom = 1; g.vel.set(0, 0, 0); say(why + ". Respawning…", 2.6); sound.crash(); }
  // into the water: a splash, the car sinks, and you're put back on the last bit of road (no explosion, no wreck)
  function splash() { const lake = Math.hypot(g.x - city.lake.x, g.z - city.lake.z) < 120; g.sink = 1.6; g.splashT = 1; g.mode = "drive"; say(lake ? "Splash! That's the park lake" : "Splash! You drove into the river", 2.2); sound.crash(); }
  function reset() { if (!g || !g.started || g.wreck > 0) return; spawn({ ...g.last }); say("Back on the road", 1.5); }
  function horn() { sound.horn && sound.horn(opts.hornType ? opts.hornType() : 0); life && life.honk(g.x, g.z); }

  // the ground under a point: ramps, rooftops (only if you are up there), else the street; water is -1
  function groundAt(x, z, y) {
    const rp = rampAt(x, z); if (rp) return { h: rp.h, ramp: rp };
    const roof = city.roofAt(x, z); if (roof > 0 && y >= roof - 1.2) return { h: roof, roof: true };
    if (y < 1.5 && city.isWater(x, z)) return { h: -1, water: true };
    const th = city.terrainH ? city.terrainH(x, z) : 0;
    if (th > 0) return { h: Math.max(th, roof > 0 && y >= roof - 1.2 ? roof : 0), terrain: true };
    return { h: 0 };
  }
  // slope of the ground along a heading (rise per metre) and across it
  const slopes = (x, z, yaw) => { const fx = Math.cos(yaw), fz = Math.sin(yaw), H = city.terrainH; return [(H(x + fx * 1.6, z + fz * 1.6) - H(x - fx * 1.6, z - fz * 1.6)) / 3.2, (H(x - fz * 1.1, z + fx * 1.1) - H(x + fz * 1.1, z - fx * 1.1)) / 2.2]; };
  // buildings: an axis-aligned box test against the city's spatial hash; returns the push-out normal
  function hitBox(x, z, y, r) {
    for (const b of city.nearFast(x, z, r + 2)) {
      if (y >= b.h - .4 || (b.y0 != null && y + 1.6 < b.y0)) continue;
      const dx = x - b.x, dz = z - b.z, ox = b.hw + r - Math.abs(dx), oz = b.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) return ox < oz ? { nx: Math.sign(dx), nz: 0, d: ox, b } : { nx: 0, nz: Math.sign(dz), d: oz, b };
    }
    return null;
  }
  const v2 = new THREE.Vector2();
  function traffic(dt) {
    if (!life || g.veh === "foot" || g.veh === "board") return;
    const pv = g.vel, ps = Math.hypot(pv.x, pv.z);
    for (const c of life.nearCars(g.x, g.z, 10)) {
      if (c.wreck || c.taken) continue;
      if (g.y - (c.y || 0) > 3.4 || (c.y || 0) - g.y > 2) continue;           // above or below it
      const dx = g.x - c.x, dz = g.z - c.z, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), along = dx * cy + dz * sy, side = -dx * sy + dz * cy;
      const hl = c.kind.L / 2 + 2.1, hw = c.kind.W / 2 + .95, tall = c.kind.id === "bus" || c.kind.id === "truck" ? 3.4 : 2.2;
      if (Math.abs(along) < hl && Math.abs(side) < hw && g.y < tall) {
        const nvx = cy * c.v, nvz = sy * c.v, rel = Math.hypot(pv.x - nvx, pv.z - nvz), heavy = tall > 3;
        // push out along the shallower side
        const oa = hl - Math.abs(along), os = hw - Math.abs(side);
        if (oa < os) { g.x += cy * Math.sign(along) * oa; g.z += sy * Math.sign(along) * oa; } else { g.x += -sy * Math.sign(side) * os; g.z += cy * Math.sign(side) * os; }
        if (c.bump > 0) continue;
        c.bump = .6;
        if (ps > c.v + 4 && rel > 7 && !(heavy && rel < 25)) {          // you are faster: it breaks apart
          life.smash(c, pv.x, pv.z, rel); g.smashed++; impact((g.x + c.x) / 2, .6, (g.z + c.z) / 2, rel * (heavy ? 1.2 : .5)); opts.onSmash && opts.onSmash(c.kind.id);
          pv.multiplyScalar(heavy ? .45 : .82); hurt(heavy ? rel * .9 : rel * .12, "Smashed a " + c.kind.id);
          addScore(heavy ? 400 : 150, heavy ? `Smashed a ${c.kind.id}!` : "Smash!", true); sound.crash(); g.sparks = 1;
        } else {                                                          // it is faster, or heavier: you take it
          const dmg = c.v > ps + 2 ? (c.v - ps) * 1.4 + rel * .3 : heavy ? rel * 1.1 : rel > 6 ? rel * .5 : 0;
          pv.x = pv.x * .3 + nvx * .6; pv.z = pv.z * .3 + nvz * .6; c.v *= .3;
          hurt(dmg, `Hit by a ${c.kind.id}`); impact((g.x + c.x) / 2, .6, (g.z + c.z) / 2, Math.max(dmg, rel * .6)); if (dmg > 2) { sound.crash(); g.sparks = .7; } else sound.pop();
        }
      } else if (ps > 25 && Math.abs(along) < hl + 1 && Math.abs(side) < hw + 1.8 && Math.abs(side) >= hw) {
        const t = g.near.get(c) || 0; if (performance.now() - t > 4000) { g.near.set(c, performance.now()); addScore(60, "Near miss", true); }
      }
    }
  }

  // ---- fuel stations and repair: stop on a station (or a helipad, the runway apron, a pier end for boats) to fill up and fix
  // the car; green wrench pickups round the city heal 40 at a drive-through ----
  const pickups = [];
  {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff8a).multiplyScalar(1.8), toneMapped: false });
    const geo = new THREE.TorusGeometry(1.1, .12, 8, 28), cross = new THREE.BoxGeometry(.3, 1.2, .3), cross2 = new THREE.BoxGeometry(1.2, .3, .3);
    let sd = 21; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) {
      const x = -960 + Math.floor(rr() * 13) * 160 + (rr() < .5 ? 40 : -40), z = -700 + Math.floor(rr() * 21) * 70;
      if (city.isWater(x, z) || hitBox(x, z, .5, 2)) continue;
      const g0 = new THREE.Group(); g0.add(new THREE.Mesh(geo, mat), new THREE.Mesh(cross, mat), new THREE.Mesh(cross2, mat)); g0.position.set(x, 1.6, z); W.scene.add(g0);
      pickups.push({ g: g0, x, z, t: 0 });
    }
  }
  const refuelSpots = () => [...city.stations.map(s => ({ x: s.x, z: s.z, r: s.r })), ...ZONES.filter(z => z.y).map(z => ({ x: z.x, z: z.z, r: z.r || 10, y: z.y })), { x: -2590, z: 0, r: 30 }];
  let spots = null;
  function service(dt) {
    spots = spots || refuelSpots();
    const sp = Math.hypot(g.vel.x, g.vel.z), out = [];
    let at = spots.find(s => Math.hypot(g.x - s.x, g.z - s.z) < s.r && Math.abs(g.y - (s.y || 0)) < 3);
    if (!at && g.veh === "boat") { const zs = ((g.z + 700) % 140 + 140) % 140; if (g.x < -1040 && g.x > -1110 && (zs < 14 || zs > 126)) at = { pier: true }; }
    if (at && sp < 4) {
      if (g.fuel < .995) { g.fuel = Math.min(1, g.fuel + dt * .25); out.push(`⛽ Refueling ${Math.round(g.fuel * 100)}%`); }
      if (g.hp < 100) { g.hp = Math.min(100, g.hp + dt * 30); out.push(`🔧 Repairing ${Math.round(g.hp)}%`); if (g.hp >= 100) opts.onRepair && opts.onRepair(); }
      if (out.length) { g.msg = out.join("  ·  "); g.msgT = .3; }
    }
    for (const p of pickups) {
      if (p.t > 0) { p.t -= dt; p.g.visible = p.t <= 0; continue; }
      p.g.rotation.y += dt * 2; p.g.position.y = 1.6 + Math.sin(performance.now() / 300 + p.x) * .2;
      if (Math.hypot(g.x - p.x, g.z - p.z) < 4 && g.y < 4) { p.t = 60; p.g.visible = false; g.hp = Math.min(100, g.hp + 40); addScore(50, "🔧 Repair +40", true); sound.win(); }
    }
  }
  function setVehicle(type) {
    if (!opts.vehicles || g.wreck > 0) return;
    if (type.startsWith("boat")) { g.boat = type.split(":")[1] || "speedboat"; type = "boat"; }
    if (type === "board") { if (g.veh === "car" && g.mode !== "drive") { g.mode = "drive"; } if (g.veh === "car") { g.vel.set(0, 0, 0); } return boardToggle(); }
    if (g.veh === "foot") { Object.assign(g, { veh: "car", mode: "drive" }); g.heroPark = null; }
    if (g.ride) releaseRide();
    if (type === "car" && opts.heroOwned && !opts.heroOwned()) g.ride = opts.starter();
    if (type === "car") { if (g.veh !== "car") { const l = g.last; Object.assign(g, { x: l.x, z: l.z, y: 0, yaw: l.yaw, mode: "drive", pitch: 0, roll: 0 }); g.vel.set(0, 0, 0); } }
    else opts.vehicles.spawn(g, type);
    g.veh = type; g.mode = type === "car" ? g.mode : g.y > 1 && type !== "boat" ? "air" : "drive"; rig.yaw = null;
    say({ car: "Back in the car", plane: "Plane: W/S throttle, Space/Q pitch, A/D bank. Take off down the runway", heli: "Helicopter: Space up, Q down, W/S forward/back, A/D turn", boat: { speedboat: "Speedboat: W/S throttle, A/D steer, Shift boost", jetski: "Jet ski: fast and twitchy, jump the swells", yacht: "Yacht: slow and steady, enjoy the view", tug: "Tugboat: heavy, pushes other boats around", hover: "Hovercraft: drives on water AND land" }[g.boat] }[type], 5);
  }
  function step(dt) {
    if (g.msgT > 0) g.msgT -= dt;
    if (g.comboT > 0) g.comboT -= dt; else g.combo = 1;
    if (g.wreck > 0) { g.wreck -= dt; g.boom = Math.max(0, g.boom - dt * .8); if (g.wreck <= 0) { spawn(g.last); } return; }
    if (g.sink > 0) { g.sink -= dt; g.y -= dt * 1.4; g.vel.multiplyScalar(Math.pow(.15, dt)); g.x += g.vel.x * dt; g.z += g.vel.z * dt; if (g.sink <= 0) { const keep = g.score; spawn(g.last); g.score = keep; say("Back on the road", 2); } return; }
    if (g.frozen > 0) { g.frozen -= dt; g.vel.set(0, 0, 0); return; }
    g.hurtT += dt; if (g.hurtT > 7 && g.hp < 100) g.hp = Math.min(100, g.hp + dt * 2);
    g.shake = Math.max(0, (g.shake || 0) - dt * 2); g.sparks = Math.max(0, g.sparks - dt * 2);
    let turn = clamp((held("right") ? 1 : 0) - (held("left") ? 1 : 0) + gp.steer + stick.x, -1, 1);
    let gas = Math.max(held("gas") ? 1 : 0, gp.gas), brake = Math.max(held("brake") ? 1 : 0, gp.brake);
    if (g.veh === "foot") { walk(dt, turn, clamp(gas - brake, -1, 1)); return; }
    if (g.veh === "board") { board(dt, turn, gas, brake); return; }
    if (opts.autoGas && opts.autoGas() && !brake && g.mode === "drive") gas = 1;
    g.brakeIn = brake;
    const touched = turn !== 0 || gas > 0 || brake > 0 || held("up") || held("down");
    const ap = opts.autopilot ? opts.autopilot(g, dt, touched && g.apT > .5) : null;
    g.apT = ap ? (g.apT || 0) + dt : 0;
    if (ap) { turn = ap.turn || 0; gas = ap.gas || 0; brake = ap.brake || 0; }
    g.ap = ap;
    // fuel: about 10 minutes of driving, 5 of flying; empty and the engine (and thrusters) stop
    const flying = g.mode === "air";
    if (gas || flying || Math.hypot(g.vel.x, g.vel.z) > 1 || (g.thr > .05 && g.veh !== "car")) g.fuel = Math.max(0, g.fuel - dt / (flying ? 300 : 600));
    if (g.fuel <= 0) { gas = 0; if (!g.fuelMsg) { g.fuelMsg = 1; say("Out of fuel! Coast to a ⛽ station (GPS has the nearest)", 5); } }
    else if (g.fuel < .15 && g.fuelMsg !== 2 && g.fuel > 0) { g.fuelMsg = 2; say("Low fuel: find a ⛽ station", 4); }
    if (g.fuel > .2) g.fuelMsg = 0;
    service(dt);
    const wantNitro = (held("nitro") || (g.ap && g.ap.nitro)) && g.nitro > .02 && g.fuel > 0;
    g.nitroOn = lerp(g.nitroOn, wantNitro ? 1 : 0, clamp(dt * 8));
    if (wantNitro) g.nitro = Math.max(0, g.nitro - dt / (5 * (1 + .35 * ((opts.upg || {}).nitro || 0)))); else g.nitro = Math.min(1, g.nitro + dt / 14);

    if (g.veh && g.veh !== "car" && opts.vehicles) {
      const I = { turn, gas, brake, up: g.fuel > 0 && (g.ap ? g.ap.up : held("up")) ? 1 : 0, down: (g.ap ? g.ap.down : held("down")) ? 1 : 0, nitro: g.nitroOn > .3, stickY: -stick.y };
      opts.vehicles.step(g, I, dt);
      if (g.veh === "boat" || g.mode === "drive") traffic(dt);
      return;
    }
    if (g.mode === "drive") {
      // ---- the road: a bicycle model with tyre grip, so it slides when you ask it to ----
      const hand = !g.ap && (held("drift") || held("up"));
      const f0x = Math.cos(g.yaw), f0z = Math.sin(g.yaw);
      let u = g.vel.x * f0x + g.vel.z * f0z;
      const HA = opts.handling && opts.handling() === "realistic", RM = g.ride ? g.ride.model : null;
      const maxSteer = (HA ? .55 : .64) / (1 + Math.abs(u) / (HA ? 15 : 19));
      g.steer += (turn * maxSteer - g.steer) * clamp(dt * (HA ? 6 : 10));
      let yawRate = u * Math.tan(g.steer) / 2.8;
      if (hand && Math.abs(u) > 8) yawRate *= 1.45;
      g.yaw += yawRate * dt;
      const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), sx = -fz, sz = fx;
      u = g.vel.x * fx + g.vel.z * fz; let w = g.vel.x * sx + g.vel.z * sz;
      const OR = g.onTerrain ? (RM ? (RM.offroad ?? (RM.kind.fly ? .9 : .55)) : .7) : 1, gripT = g.onTerrain ? Math.min(1.05, .45 + .55 * OR) : 1, topT = g.onTerrain ? Math.min(1, .5 + .5 * OR) : 1;
      const U = opts.upg || {}, top = ((RM ? RM.top : 92) * topT + g.nitroOn * 22) * (1 + .07 * (U.engine || 0)), acc = (RM ? RM.acc : 1) * (g.onTerrain ? Math.min(1, .6 + .4 * OR) : 1);
      if (g.onTerrain) u -= 9.81 * Math.sin(Math.atan(g.slope || 0)) * dt;           // uphill slows you, downhill pulls
      if (gas) u += (u < -.5 ? 20 : 11.5 * acc * (1 + .1 * (U.engine || 0)) * (1 - clamp(u / top) ** 2) + g.nitroOn * 11) * gas * dt;
      else if (g.nitroOn > .1) u += g.nitroOn * 11 * dt;
      if (brake) u -= (u > .5 ? 26 : 8) * brake * dt;
      u = Math.max(-16, u - Math.sign(u) * (.3 + .00034 * u * u) * dt);
      if (!gas && !brake && Math.abs(u) < .25) u = 0;
      const grip = (hand ? 1.4 + .15 * (U.grip || 0) : 9 * (1 + .12 * (U.grip || 0)) + Math.min(9, Math.abs(u) * .09)) * (RM ? RM.grip : 1) * (HA ? .8 : 1.2) * gripT;
      w *= Math.exp(-grip * dt);
      g.vel.set(fx * u + sx * w, 0, fz * u + sz * w);
      // suspension: a damped spring for pitch (squat on the throttle, dive on the brakes) and one for body roll in corners
      const aL = (u - (g.uPrev ?? u)) / dt; g.uPrev = u;
      const tP = clamp(aL * .0042, -.065, .065), tR = clamp(-yawRate * u * .0065, -.1, .1);
      g.spV = (g.spV || 0) + ((tP - (g.sp || 0)) * 130 - (g.spV || 0) * 15) * dt; g.sp = (g.sp || 0) + g.spV * dt;
      g.srV = (g.srV || 0) + ((tR - (g.sr || 0)) * 110 - (g.srV || 0) * 13) * dt; g.sr = (g.sr || 0) + g.srV * dt;
      // drift scoring
      const slip = Math.atan2(Math.abs(w), Math.max(1, Math.abs(u)));
      g.slip = Math.abs(u) > 6 ? clamp((slip - .12) * 3) + (brake && Math.abs(u) > 20 ? .35 : 0) : 0; if (g.thudT > 0) g.thudT -= dt;
      if (slip > .22 && Math.abs(u) > 12) { g.drift += slip * Math.abs(u) * dt * 6; g.driftT = .7; }
      else if (g.driftT > 0) { g.driftT -= dt; if (g.driftT <= 0 && g.drift > 30) { addScore(Math.round(g.drift), "Drift"); g.drift = 0; } else if (g.driftT <= 0) g.drift = 0; }
      // move, with ramps, rooftops, buildings, water and traffic
      const nx = g.x + g.vel.x * dt, nz = g.z + g.vel.z * dt;
      const hit = hitBox(nx, nz, g.y + .5, 1.15);
      if (hit) {
        const vn = g.vel.x * hit.nx + g.vel.z * hit.nz;
        // a glancing hit scrapes along the wall and keeps most of its speed; a head-on one stops you with a small bounce
        const sp = Math.hypot(g.vel.x, g.vel.z) || 1, head = vn < 0 ? -vn / sp : 0;
        if (vn < 0) { g.vel.x -= 1.25 * vn * hit.nx; g.vel.z -= 1.25 * vn * hit.nz; g.vel.multiplyScalar(1 - .5 * head); if (head < .5 && sp > 8) g.sparks = Math.max(g.sparks || 0, .8);
          // and the car swings round to run along the wall instead of nosing into it again next frame
          if (head < .75 && sp > 3) { let dv = Math.atan2(g.vel.z, g.vel.x) - g.yaw; while (dv > Math.PI) dv -= 2 * Math.PI; while (dv < -Math.PI) dv += 2 * Math.PI; if (Math.abs(dv) < 1.6) g.yaw += dv * .6; } }
        g.x = nx + hit.nx * hit.d; g.z = nz + hit.nz * hit.d;
        const imp = -vn; impact(g.x - hit.nx * 1.3, .6, g.z - hit.nz * 1.3, imp * 1.5); if (imp > 3) g.shake = Math.min(1, (g.shake || 0) + imp / 30);
        if (imp > 9) { hurt((imp - 9) * 1.8, "Hit a building"); sound.crash(); g.sparks = 1; } else if (imp > 2 && !(g.thudT > 0)) { sound.thud && sound.thud(imp / 9); g.thudT = .25; }
      } else { g.x = nx; g.z = nz; }
      const gr = groundAt(g.x, g.z, g.y), prevY = g.y;
      if (gr.water) { splash(); return; }
      if (gr.ramp) {
        g.y = gr.h; g.pitch = Math.atan(gr.ramp.slope) * Math.cos(g.yaw - gr.ramp.r.yaw);
        // off the lip fast and you fly
        if (gr.ramp.a > gr.ramp.r.len - .8 && u > 8 && Math.cos(g.yaw - gr.ramp.r.yaw) > .6) {
          const th = Math.atan(gr.ramp.slope); g.mode = "air"; g.hover = false; g.vel.y = Math.sin(th) * u; g.vel.x *= Math.cos(th); g.vel.z *= Math.cos(th); g.airT = 0; g.jump = true; return;
        }
      } else if (gr.h < prevY - .35) { g.mode = "air"; g.hover = false; g.landing = false; g.airT = 0; g.jump = true; return; }   // off a roof edge
      else if (gr.terrain) {
        g.y = gr.h; const [sa, sl] = slopes(g.x, g.z, g.yaw); g.slope = sa; g.tRoll = -Math.atan(sl);
        g.pitch = lerp(g.pitch, Math.atan(sa) + g.sp, clamp(dt * 12)); if (Math.abs(u) > 6 && Math.random() < .08) g.spV += (Math.random() - .5) * Math.abs(u) * .02 / Math.max(.6, OR);   // bumps
        if (Math.abs(u) > 4) g.shake = Math.max(g.shake || 0, Math.min(.22, Math.abs(u) * .004 / Math.max(.6, OR)));    // rough ground rattles you, less in a truck
      }
      else { g.y = gr.h; g.pitch = g.sp; }
      g.onTerrain = !!gr.terrain; if (!gr.terrain) { g.slope = 0; g.tRoll = 0; }
      // drive into the loop and the track takes you round
      if (g.x > LOOP_X - 1.5 && g.x < LOOP_X + .5 && Math.abs(g.z) < HW && Math.cos(g.yaw) > .8 && u > 3 && g.y < .2) { g.mode = "rail"; g.d = T.D[T.loopIn]; g.v = u; return; }
      traffic(dt);
      g.roll = lerp(g.roll, (g.sr || 0) + (g.tRoll || 0), clamp(dt * 20));
      if ((g.y === 0 || gr.terrain) && Math.abs(u) < 40 && !gr.roof && !city.isWater(g.x, g.z) && !hitBox(g.x, g.z, .5, 3)) g.last = { x: g.x, z: g.z, yaw: g.yaw, y: gr.terrain ? g.y : 0 };
      g.gForce = 1 + Math.abs(u * yawRate) / G * .5;
      g.v = u;
      return;
    }

    if (g.mode === "rail") {
      T.sample(g.d, fr);
      g.v = clamp(g.v + ((gas ? 10 * (1 - g.v / 92) : 0) + g.nitroOn * 10 - (brake ? 16 : 0) - .4 - G * fr.f.y) * dt, 0, 112);
      g.d += g.v * dt;
      const n = g.v * g.v / R + G * fr.u.y; g.gForce = n / G;
      if (n < 0 || g.v < .5) { g.mode = "air"; g.hover = false; g.vel.copy(fr.f).multiplyScalar(g.v); g.x = fr.p.x; g.y = fr.p.y; g.z = fr.p.z; g.yaw = 0; say("Too slow for the loop!", 2); return; }
      g.x = fr.p.x; g.y = fr.p.y; g.z = fr.p.z;
      if (g.d >= T.D[T.loopOut]) { g.mode = "drive"; g.y = 0; g.yaw = 0; g.pitch = 0; g.x = T.P[T.loopOut].x; g.z = T.P[T.loopOut].z; g.vel.set(g.v, 0, 0); addScore(500, "Full loop"); }
      return;
    }

    // ---- the air: thrusters for hovering, wings with lift and drag for flying ----
    g.airT += dt;
    if (g.jump && !g.hover && !g.landing && g.veh === "car") { g.trS += turn * 7 * dt; if (held("drift")) g.trF += 6.5 * dt; }
    const up = g.fuel > 0 && (g.ap ? (g.ap.up || 0) : held("up") ? 1 : 0), down = g.ap ? (g.ap.down || 0) : (held("down") ? 1 : 0);
    g.sPit = lerp(g.sPit || 0, clamp((up ? 1 : 0) - down + (g.ap ? 0 : gp.pitch - stick.y), -1, 1), clamp(dt * 4));
    g.sTurn = lerp(g.sTurn || 0, turn, clamp(dt * 3.5)); turn = g.sTurn;
    const pitchCmd = Math.abs(g.sPit) < .03 ? 0 : g.sPit;
    const V = g.vel.length(), vhat = V > .1 ? g.vel.clone().divideScalar(V) : new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw));
    if (g.fuel <= 0) { g.hover = false; g.landing = false; g.jump = true; }       // no fuel, no thrusters: it glides
    const thrusting = g.hover || g.landing || up || gas || g.nitroOn > .1 || !g.jump;
    g.wings = clamp(g.wings + (V > 28 && (thrusting || !g.jump) ? 1 : -1) * dt * 1.2);
    const ang = clamp((V - 16) / 26);                                   // thrusters swing from straight down to straight back
    g.ang = lerp(g.ang, ang, clamp(dt * 3));
    // attitude: bank to turn, pull to climb; it settles back to the flight path when you let go
    const vh = Math.hypot(g.vel.x, g.vel.z), gamma = Math.atan2(g.vel.y, Math.max(1, vh));
    g.roll = lerp(g.roll, turn * (.25 + .8 * g.wings), clamp(dt * 2.2));        // bank into the turn (eased, so it rolls in smoothly)
    const yawRate = (1 - g.wings) * turn * 1.1 + g.wings * G * Math.tan(g.roll) / Math.max(20, V);
    g.yaw += yawRate * dt;
    // hands off, the flight assist trims the nose so the wings carry exactly the weight (and damps any climb or sink)
    const kL = .00964, INC = .07, ceiling0 = clamp(1 - (g.y - 380) / 200), assist0 = Math.min(2, 1 / Math.max(.5, Math.cos(g.roll)));
    const wingK = kL * V * V * 2 * Math.PI * .9 * (.18 + .82 * g.wings) * assist0 * ceiling0;
    const needA = wingK > .5 ? clamp(G * Math.cos(gamma) / wingK - INC - g.vel.y * .006, -.25, .24) : 0;
    g.pitch += pitchCmd * .65 * g.wings * dt;
    g.pitch += ((pitchCmd ? g.pitch * .7 + gamma * .3 : gamma + needA / Math.max(.45, Math.cos(g.roll))) - g.pitch) * clamp(dt * 2);
    if (g.wings < .3) g.pitch = lerp(g.pitch, vh > 8 ? clamp(gamma * .4, -.3, .3) : 0, clamp(dt * 3));
    // landing approach: hold a gentle glide slope, flare in the last few metres, wings level
    const above = g.y - groundAt(g.x, g.z, g.y).h;
    g.above = above;
    if (g.landing && g.wings > .3) {
      const want = above > 14 ? -.07 : Math.atan2(-Math.max(1.5, above * .25), Math.max(10, vh));
      g.pitch = lerp(g.pitch, want + .09, clamp(dt * 2.5));
      g.roll = lerp(g.roll, turn * .3, clamp(dt * 3));
    }
    if (above < 6 && g.vel.y < 0 && g.wings > .3 && !down) { g.roll = lerp(g.roll, 0, clamp(dt * 4)); g.pitch = lerp(g.pitch, Math.max(g.pitch, gamma + .12), clamp(dt * 3)); }
    // fly-by-wire stall protection: the nose never gets more than ~15° above the flight path (unless the airbrake is on)
    if (g.wings > .5 && !brake) { const cr = Math.max(.45, Math.cos(g.roll)); g.pitch = clamp(g.pitch, gamma - .3 / cr, gamma + .26 / cr); }
    g.pitch = clamp(g.pitch, -1.2, 1.2);
    const f = new THREE.Vector3(Math.cos(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.sin(g.yaw) * Math.cos(g.pitch));
    const s0 = new THREE.Vector3().crossVectors(f, UP).normalize(), u0 = new THREE.Vector3().crossVectors(s0, f), bu = u0.clone().applyAxisAngle(f, g.roll);
    const a = new THREE.Vector3(0, -G, 0), ceiling = clamp(1 - (g.y - 380) / 200);
    // aerodynamics: lift from the angle of attack (stalls past ~16°), drag from the body, the wings and the airbrake
    const alpha = Math.atan2(-g.vel.dot(bu), Math.max(.1, g.vel.dot(f)));
    let CL = 2 * Math.PI * .9 * (alpha + INC); const stalled = Math.abs(alpha) > .28 && V > 15;
    if (stalled) CL = Math.sign(alpha) * .55;
    g.stall = lerp(g.stall, stalled && g.wings > .5 ? 1 : 0, clamp(dt * 5));
    const qd = V * V, assist = Math.min(2, 1 / Math.max(.5, Math.cos(g.roll)));
    const liftDir = bu.clone().addScaledVector(vhat, -bu.dot(vhat)); if (liftDir.lengthSq() > 1e-6) liftDir.normalize();
    a.addScaledVector(liftDir, kL * qd * CL * (.18 + .82 * g.wings) * assist * ceiling);
    const CD = .09 + (1 - g.wings) * .06 + .12 * CL * CL + (brake ? .9 : 0) + (g.landing ? (V > 45 ? .55 : .25) : 0);
    a.addScaledVector(vhat, -kL * qd * CD);
    // sideslip: the car weathervanes into the airflow
    const sideV = g.vel.dot(s0); a.addScaledVector(s0, -sideV * 1.6);
    // thrust: back along the car when fast, down under it when slow
    const cruise = g.wings > .5 && !g.jump && !g.landing ? .25 : 0, back = (gas * 1 + cruise + g.nitroOn * 1.2) * 16 * g.ang * ceiling;
    a.addScaledVector(f, back);
    const lift = 1 - g.ang;
    if (!g.jump || g.hover || g.landing || up || down) {
      let vert = 0;
      if (up) vert += 18 * ceiling;
      if (down) { vert -= 9; g.landing = false; if (g.vel.y < -22) vert += (-22 - g.vel.y) * 3; }
      if (g.hover && !up && !down && !g.landing) vert += clamp(G - g.vel.y * 2.5, 0, 16);
      if (g.landing) vert += clamp(G + ((g.y - groundAt(g.x, g.z, g.y).h < 14 ? -3 : -9) - g.vel.y) * 3, 0, 22);
      if (gas && g.ang < .5) a.addScaledVector(new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw)), 8 * (1 - g.ang));
      a.y += vert * lift;
    }
    g.vel.addScaledVector(a, dt);
    g.x += g.vel.x * dt; g.y += g.vel.y * dt; g.z += g.vel.z * dt;
    g.thr = lerp(g.thr, (up ? 1 : down ? .7 : gas ? .9 : g.hover || g.landing ? .55 : g.jump ? 0 : .3) + g.nitroOn * .4, clamp(dt * 6));
    g.gForce = 1 + Math.abs(a.clone().addScaledVector(UP, G).dot(bu)) / G * .6;
    // stunt rings
    for (const r of RINGS) {
      const dx = g.x - r.x, dy = g.y - r.y, dz = g.z - r.z, plane = dx * r.nx + dz * r.nz, side = Math.sign(plane);
      if (r.side && side !== r.side && Math.abs(plane) < 6 && Math.hypot(dx - plane * r.nx, dy, dz - plane * r.nz) < 8.5 && performance.now() - r.done > 3000) { r.done = performance.now(); g.rings++; addScore(300, `Ring ${g.rings}`); r.m.material.color.set(0x3dff8a).multiplyScalar(2.5); setTimeout(() => r.m.material.color.set(0xffc23d).multiplyScalar(2.2), 3000); }
      r.side = side;
    }
    // buildings
    const hit = hitBox(g.x, g.z, g.y, .9);
    if (hit) {
      const vn = g.vel.x * hit.nx + g.vel.z * hit.nz, imp = Math.max(0, -vn);
      g.x += hit.nx * hit.d; g.z += hit.nz * hit.d; g.vel.x -= 1.4 * Math.min(0, vn) * hit.nx; g.vel.z -= 1.4 * Math.min(0, vn) * hit.nz; g.vel.multiplyScalar(.6);
      impact(g.x - hit.nx * 1.3, g.y + .6, g.z - hit.nz * 1.3, imp * 1.5);
      if (imp > 4) { hurt(imp * 1.4, "Hit a building"); sound.crash(); g.sparks = 1; } else sound.pop();
      if (g.wreck > 0) return;
    }
    traffic(dt);
    const gr = groundAt(g.x, g.z, g.y);
    // flying low and fast pays too
    if (!g.jump && g.y - gr.h > 1 && g.y - gr.h < 12 && g.vel.length() > 42) { g.lowT = Math.max(0, g.lowT || 0) + dt; if (g.lowT > 2.5) { g.lowT = -5; addScore(250, "Low pass"); } } else if ((g.lowT || 0) > 0) g.lowT = 0; else if (g.lowT < 0) g.lowT += dt;
    if (g.y <= gr.h) {
      if (gr.water) { splash(); return; }
      g.y = gr.h;
      landTricks();
      const down2 = -g.vel.y, vh2 = Math.hypot(g.vel.x, g.vel.z), angle = Math.atan2(down2, Math.max(.1, vh2));
      if (down2 > 12) impact(g.x, g.y, g.z, down2 * 1.2);
      if (down2 > 26 || (down2 > 15 && angle > 1.1)) { hurt(down2 * 3, `Hit the ground hard (${down2.toFixed(1)} m/s down)`); if (g.wreck > 0) return; }
      else if (down2 > 10) hurt((down2 - 10) * 1.5, "Hard landing");
      else if (g.airT > 2 && !g.jump) { if (down2 < 2) addScore(300, "Butter landing!"); else if (down2 < 4.5) addScore(150, "Smooth landing"); else say(`Firm landing (${down2.toFixed(1)} m/s)`, 2); }
      const zone = ZONES.find(z => Math.hypot(g.x - z.x, g.z - z.z) < (z.r || PAD_R) && Math.abs(g.y - (z.y || 0)) < 3);
      if (zone && !g.done.has(zone.id)) { g.done.add(zone.id); if (zone.safe) addScore(1000 + Math.round(Math.max(0, 7 - down2) * 60) + (zone.y ? 500 : 0), `Landed at ${zone.id}`); else say(`${zone.id} is unsafe: ${zone.note}`); }
      if (g.jump && g.airT > 1.2) addScore(Math.round(g.airT * 120), `Airtime ${g.airT.toFixed(1)} s`);
      // keep the kinetic energy: the drop's speed carries into the roll along the ground
      const keep = Math.min(112, Math.sqrt(vh2 * vh2 + .6 * down2 * down2));
      if (vh2 > 2) g.yaw = Math.atan2(g.vel.z, g.vel.x);
      g.vel.set(Math.cos(g.yaw) * keep, 0, Math.sin(g.yaw) * keep);
      g.mode = "drive"; g.wings = 0; g.hover = false; g.landing = false; g.pitch = -clamp(down2 * .006, 0, .07); g.roll = 0; g.jump = false;
      if (down2 > 2) { sound.thud && sound.thud(down2 / 14); g.shake = Math.min(1, (g.shake || 0) + down2 / 40); g.spV = (g.spV || 0) - down2 * .05; }
      if (keep > 25) say(`Touchdown at ${Math.round(keep * 3.6)} km/h. Rolling on`, 2);
    }
  }

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected);
    if (!p) { gp.on = false; gp.steer = gp.gas = gp.brake = gp.pitch = 0; return; }
    gp.on = true; const dz = v => Math.abs(v) < .12 ? 0 : v;
    gp.steer = dz(p.axes[0]); gp.pitch = -dz(p.axes[1]) * (g && g.mode === "air" ? 1 : 0);
    gp.gas = p.buttons[7] ? p.buttons[7].value : 0; gp.brake = p.buttons[6] ? p.buttons[6].value : 0;
    const btn = i => p.buttons[i] && p.buttons[i].pressed, edge = i => { const was = gp.prev[i]; gp.prev[i] = btn(i); return btn(i) && !was; };
    const set = (k, on) => on ? touch.add(k) : touch.delete(k);
    set("up", btn(0) && g && g.mode === "air"); set("drift", btn(0) && g && g.mode !== "air"); set("down", btn(1)); set("nitro", btn(2) || btn(5));
    if (edge(3)) toggleFly(); if (edge(8)) toggleView(); if (edge(4)) horn(); if (edge(9)) opts.garage && opts.garage();
  }

  // ---- minimap ----
  const MM = 2.8, bounds = W.bounds, mapC = document.createElement("canvas");
  mapC.width = Math.ceil((bounds.x1 - bounds.x0) / MM); mapC.height = Math.ceil((bounds.z1 - bounds.z0) / MM);
  {
    const x = mapC.getContext("2d"); x.fillStyle = "#2b3a26"; x.fillRect(0, 0, mapC.width, mapC.height);
    const P = ([px, pz]) => [(px - bounds.x0) / MM, (pz - bounds.z0) / MM];
    const poly = (pts, fill) => { x.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = fill; x.fill(); };
    for (const w of W.water || []) poly(w, "#14374f");
    for (const p of W.parks || []) poly(p, "#3a6a32");
    x.lineCap = "butt";
    for (const r of W.roads || []) { x.beginPath(); r.p.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.strokeStyle = r.w >= 18 ? "#d6d3cc" : "#8f8b84"; x.lineWidth = Math.max(1.5, r.w / MM); x.stroke(); }
    for (const b of W.footprints || []) poly(b, "#56524c");
  }
  const mm = $("gMap"), mx = mm.getContext("2d");
  mm.addEventListener("click", () => opts.openGps && opts.openGps());
  function drawMap() {
    const S = mm.width, c = S / 2;
    mx.save(); mx.clearRect(0, 0, S, S); mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.clip();
    mx.fillStyle = "#1b1814"; mx.fillRect(0, 0, S, S);
    mx.translate(c, c); mx.rotate(-g.yaw - Math.PI / 2);
    mx.drawImage(mapC, -(g.x - bounds.x0) / MM, -(g.z - bounds.z0) / MM);
    for (const z of ZONES) { const px = (z.x - g.x) / MM, pz = (z.z - g.z) / MM; mx.fillStyle = z.safe ? (g.done.has(z.id) ? "#888" : "#3dff8a") : "#ff4455"; mx.beginPath(); mx.arc(px, pz, 5, 0, 7); mx.fill(); }
    if (opts.mapExtra) opts.mapExtra(mx, g, MM, c);
    mx.fillStyle = "#ffc23d"; for (const r of RINGS) { const px = (r.x - g.x) / MM, pz = (r.z - g.z) / MM; if (Math.abs(px) < c && Math.abs(pz) < c) { mx.beginPath(); mx.arc(px, pz, 3, 0, 7); mx.fill(); } }
    if (life) { mx.fillStyle = "#ffd23d"; for (const n of life.nearCars(g.x, g.z, c * MM)) { const px = (n.x - g.x) / MM, pz = (n.z - g.z) / MM; if (Math.abs(px) < c && Math.abs(pz) < c) mx.fillRect(px - 1, pz - 1, 2, 2); } }
    mx.restore();
    mx.fillStyle = "#fff"; mx.beginPath(); mx.moveTo(c, c - 8); mx.lineTo(c - 6, c + 6); mx.lineTo(c + 6, c + 6); mx.closePath(); mx.fill();
    mx.strokeStyle = "rgba(255,255,255,.35)"; mx.lineWidth = 2; mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.stroke();
  }

  let mapT = 0, acc = 0; const trickQ = new THREE.Quaternion(), trickE = new THREE.Euler();
  const api = {
    get sens() { return api0.sens; }, set sens(v) { api0.sens = v; },
    get state() { return g; }, say: (m, t) => say(m, t), addScore: (n, w) => addScore(n, w), hurt: (n, w) => hurt(n, w), active: () => active && !paused,
    busted(msg) { say(msg, 4); g.hp = 100; g.vel.set(0, 0, 0); $("gScore").textContent = "$" + g.score.toLocaleString(); sound.crash(); },
    // the VOID car: locked until bought (or the secret code); then you're put straight into it
    useHero() { if (!g || !g.started) return; if (g.veh === "foot") Object.assign(g, { veh: "car", mode: "drive" }); if (g.ride) { if (g.ride.c) life.park(g.ride.c, g.x, g.z, g.yaw); g.ride = null; } g.heroPark = null; g.vel.set(0, 0, 0); rig.yaw = null; say("Your VOID car: 330 km/h and it flies (F)", 3); },
    freeze(t) { g.frozen = t; }, teleport(x, z, yaw) { Object.assign(g, { x, z, y: 0, yaw, mode: "drive", pitch: 0, roll: 0, wings: 0 }); g.vel.set(0, 0, 0); camPos.set(x - Math.cos(yaw) * 8, 3, z - Math.sin(yaw) * 8); rig.yaw = yaw; orbit.yaw = orbit.pitch = 0; },
    hitBox, isWater: (x, z) => city.isWater(x, z), impact: (x, z, p) => impact(x, .6, z, p),
    groundAt: (x, z, y) => groundAt(x, z, y), wreck: why => wreck(why), setVehicle: t => setVehicle(t), setStick: (x, y) => { stick.x = x; stick.y = y; }, nearCars: (x, z, r) => life ? life.nearCars(x, z, r) : [], fly: () => { if (g.mode === "drive") toggleFly(); },
    policeClear: () => opts.policeClear && opts.policeClear(), terrainH: (x, z) => city.terrainH ? city.terrainH(x, z) : 0, board: () => boardToggle(),
    foot: () => footToggle(),
    // a car from the dealership, delivered next to you (your current car is left parked where it is)
    deliver(model, color) {
      if (!g || !g.started || g.wreck > 0) return;
      if (g.veh === "car" && !g.ride) g.heroPark = { x: g.x, z: g.z, yaw: g.yaw }; else if (g.ride) { if (g.ride.c) life.park(g.ride.c, g.x, g.z, g.yaw); else g.ridePark = { ride: g.ride, x: g.x, z: g.z, yaw: g.yaw }; }
      const sx = Math.sin(g.yaw), cx = Math.cos(g.yaw); let x = g.x + sx * 5, z = g.z - cx * 5; if (hitBox(x, z, .5, 1.6)) { x = g.x - sx * 5; z = g.z + cx * 5; }
      Object.assign(g, { veh: "car", mode: "drive", x, z, y: 0, pitch: 0, roll: 0, ride: { model, color, rust: 0, owned: true } }); g.vel.set(0, 0, 0); rig.yaw = null; say(`Enjoy your ${model.name}`, 2.5);
    },
  };
  return {
    api, RINGS,
    get state() { return g; }, get photo() { return photo; },
    enter() { active = true; start(); },
    exit() { active = false; keys.clear(); touch.clear(); sound.setGame("off"); if (photo) togglePhoto(); },
    pause(v) { paused = v; keys.clear(); touch.clear(); },
    update(dt) {
      if (!g) start();
      pollPad();
      if (g.started && !paused && !photo) { acc += dt; const H = 1 / 60; let n = 0; while (acc >= H && n < 6) { step(H); acc -= H; n++; } }
      const air = g.mode === "air", speed = g.mode === "rail" ? g.v * 3.6 : g.vel.length() * 3.6;
      if (g.mode === "rail") { basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis); }
      else {
        const f = new THREE.Vector3(Math.cos(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.sin(g.yaw) * Math.cos(g.pitch));
        const s0 = new THREE.Vector3().crossVectors(f, UP).normalize(), u0 = new THREE.Vector3().crossVectors(s0, f);
        fr.f.copy(f); fr.s.copy(s0.applyAxisAngle(f, g.roll)); fr.u.copy(u0.applyAxisAngle(f, g.roll));
        basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis);
        if (g.trS || g.trF || g.trH) q.multiply(trickQ.setFromEuler(g.veh === "board" ? trickE.set(g.trF - (g.trH || 0), -g.trS, 0) : trickE.set(0, -g.trS, g.trF)));
      }
      fr.p.set(g.x, g.y, g.z);
      car.group.position.copy(fr.p); car.group.quaternion.copy(q); car.group.updateMatrixWorld(true);
      let cam;
      if (orbit.t > 0) orbit.t -= dt;
      const sp0 = g.mode === "rail" ? g.v : g.vel.length();
      // like GTA: once you stop moving the mouse (or finger) for a moment and the car is moving, the view eases back behind it
      if (orbit.t <= 1.5 && !photo && sp0 > 3 && !orbit.drag && g.veh !== "foot") { const k = clamp(dt * 1.6); orbit.yaw = lerp(orbit.yaw, 0, k); orbit.pitch = lerp(orbit.pitch, 0, k); }
      const nitroFov = g.nitroOn * 9;
      if (photo) {
        const d = orbit.dist || 9, a = g.yaw + Math.PI + orbit.yaw, e = .25 + orbit.pitch;
        cam = { pos: fr.p.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d + .8, Math.sin(a) * Math.cos(e) * d)), look: fr.p.clone().add(new THREE.Vector3(0, .6, 0)), up: UP.clone(), fov: 42 };
      } else if (view === "seat") { const ly = clamp(orbit.yaw, -1.9, 1.9), lp = clamp(-orbit.pitch * .6, -.5, .6); cam = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30 * Math.cos(ly), .5 + 30 * Math.sin(lp), HEAD.z + 30 * Math.sin(ly)), up: fr.u.clone(), fov: 72 + nitroFov }; }
      else if (view === "hood") cam = { pos: loc(fr, 1.2, 1.25, 0), look: loc(fr, 40, .9, 0), up: fr.u.clone(), fov: 66 + nitroFov };
      else {
        let up = UP.clone();
        if (g.mode === "rail") { T.sample(Math.max(T.D[T.loopIn] - 6, g.d - 7.5), back); camPos.copy(loc(back, 0, 2.4, 0)); camLook.copy(loc(fr, 5, .8, 0)); up = back.u.clone(); }
        else {
          // an orbit rig round the car: only the angles are smoothed, so the camera never lags behind at speed, never
          // cuts through the car when you look round, and never swings in front when you reverse
          const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), fwd = g.vel.x * fx + g.vel.z * fz, hsp = Math.hypot(g.vel.x, g.vel.z);
          let base = g.veh === "foot" ? (rig.yaw ?? g.yaw) : g.yaw;
          if (air && hsp > 10) base = Math.atan2(g.vel.z, g.vel.x);
          else if (!air && fwd > 8) { let dv = Math.atan2(g.vel.z, g.vel.x) - g.yaw; while (dv > Math.PI) dv -= 2 * Math.PI; while (dv < -Math.PI) dv += 2 * Math.PI; base = g.yaw + clamp(dv, -.6, .6) * .5; }
          if (rig.yaw == null) rig.yaw = base;
          let dy = base - rig.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          rig.air = lerp(rig.air ?? (air ? 1 : 0), air ? 1 : 0, clamp(dt * 1.8)); const A = rig.air;
          rig.yaw += dy * clamp(dt * lerp(5, 3, A));
          const yawC = rig.yaw + orbit.yaw, pitC = clamp(lerp(.24, .2, A) + orbit.pitch - (air ? g.vel.y * .004 * A : 0), -.12, 1.25);
          const want = g.veh === "foot" ? 3.4 + (orbit.dist || 0) * .6 : g.veh === "board" ? 4.4 + speed * .015 + (orbit.dist || 0) * .6 : lerp(6.6 + speed * .012, 12 + speed * .01, A) + (orbit.dist || 0) + (g.veh === "plane" || g.veh === "heli" ? 6 : g.veh === "boat" ? 2 : 0);
          const pivot = fr.p.clone().add(new THREE.Vector3(0, g.veh === "foot" ? 1.55 : g.veh === "board" ? 1.9 : 1.3 + .1 * A, 0)), dir = new THREE.Vector3(-Math.cos(yawC) * Math.cos(pitC), Math.sin(pitC), -Math.sin(yawC) * Math.cos(pitC));
          // walls: pull in at once, ease back out
          let room = want; for (let t = .8; t <= want; t += .5) { const q2 = pivot.clone().addScaledVector(dir, t); if (q2.y < .3 || hitBox(q2.x, q2.z, q2.y, .35)) { room = Math.max(1.6, t - .6); break; } }
          rig.dist = room < rig.dist ? room : lerp(rig.dist, room, clamp(dt * 2.5));
          camPos.copy(pivot).addScaledVector(dir, rig.dist);
          camLook.copy(pivot).add(new THREE.Vector3(fx, 0, fz).multiplyScalar(1.5 + 1.5 * A));
          if (A > .01) up.lerp(fr.u, .15 * A).normalize();
          if (camPos.y < .4) camPos.y = .4;
        }
        cam = { pos: camPos.clone(), look: camLook.clone(), up, fov: lerp(56, 68, clamp(speed / 330)) + nitroFov };
      }
      sound.setGame(!g.started ? "idle" : g.wreck > 0 ? "end" : air ? (g.y < 50 && g.vel.y < 0 ? "land" : "air") : "drive");
      let gear = 1; const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];
      for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
      gear = Math.min(7, gear);
      const rpm = !air ? 1800 + clamp((speed - GEARS[gear - 1]) / ((GEARS[gear] || 340) - GEARS[gear - 1])) * 5800 : 900;
      const zones = zonesFrom(fr.p, fr.f);
      $("gSpd").textContent = Math.round(speed); $("gAlt").textContent = Math.round(Math.max(0, g.y)); $("gVs").textContent = (air ? g.vel.y : 0).toFixed(1);
      const landAid = air && g.above < 40 && g.vel.y < -1 ? `${g.above < 12 && g.vel.y < -5 ? "PULL UP · " : ""}${Math.round(g.above)} m · sink ${(-g.vel.y).toFixed(1)} m/s${-g.vel.y < 3 ? " ✓" : ""}` : "";
      if (g.veh === "foot" && (g.nearT = (g.nearT || 0) - dt) <= 0) { g.nearT = .25; const n = nearestCar(); g.nearName = n ? (n.kind === "hero" ? "your VOID car" : n.kind === "owned" ? n.o.ride.model.name : n.o.model.name) : cartNear() ? "🌭" : ""; }
      $("gHint").textContent = g.msgT > 0 ? g.msg : g.veh === "foot" && g.nearName ? (g.nearName === "🌭" ? "E: buy a hot dog ($10, +30 health)" : `E: get into ${g.nearName}`) : g.stall > .5 ? "STALL: push the nose down or add thrust" : landAid || (g.drift > 20 ? `Drift ${Math.round(g.drift)}` : "");
      $("gFly").textContent = g.mode === "air" ? (g.landing ? "Hover" : "Land") : "Fly";
      if ($("gHp")) { $("gHp").style.setProperty("--v", g.hp / 100); $("gHp").classList.toggle("low", g.hp < 35); }
      if ($("gNos")) $("gNos").style.setProperty("--v", g.nitro);
      if ($("gCombo")) $("gCombo").textContent = g.combo > 1 && g.comboT > 0 ? `×${g.combo}` : "";
      document.body.classList.toggle("g-air", air);
      const tgt = zones.find(z => z.safe && z.dist <= 5 && !g.done.has(z.id)), arrow = $("gArrow");
      if (tgt) { arrow.style.opacity = 1; arrow.style.transform = `rotate(${Math.atan2(tgt.side, tgt.fwd)}rad)`; $("gTgt").textContent = `Mission: land at ${tgt.id}${tgt.y ? ` (${Math.round(tgt.y)} m up)` : ""} · ${tgt.dist.toFixed(2)} km`; }
      else { arrow.style.opacity = 0; $("gTgt").textContent = ""; }
      if ((mapT += dt) > .05) { mapT = 0; drawMap(); }
      return {
        pos: fr.p.clone(), quat: q, fr, speed, g: g.gForce, alt: Math.max(0, g.y), vs: air ? g.vel.y : 0, player: { x: g.x, y: g.y, z: g.z, speed: speed / 3.6, vx: g.vel.x, vz: g.vel.z, foot: g.veh === "foot" || g.veh === "board" },
        thrust: { power: air && g.veh === "car" ? g.thr : 0, angle: g.ang, deploy: air && g.veh === "car" && !(g.jump && !g.hover && !g.landing && g.thr < .05) ? 1 : 0 }, wings: g.veh === "car" ? g.wings : 0, air, cam,
        inside: view === "seat", screenOn: view === "seat", mode: !air ? "DRIVE" : g.wings > .9 ? "GLIDE" : g.hover ? "HOVER" : "THRUST",
        rpm, gear, load: held("gas") || gp.gas > .3 ? 1 : .2, engine: g.veh === "foot" || g.veh === "board" ? 0 : !air ? 1 : .15, walk: g.walk || 0, crouch: g.veh === "board" ? Math.max((g.charge || 0) / .6, g.grabT > 0 ? 1 : 0) : 0, grinding: !!g.grind, braking: g.ap ? (g.ap.brake || 0) : (g.brakeIn || 0), ride: g.ride, heroPark: g.heroPark, ridePark: g.ridePark, boat: g.boat, zones, reveal: 1,
        splash: g.splashT > 0 ? (g.splashT -= dt, 1) : 0, nitro: g.nitroOn, hp: g.hp, veh: g.veh || "car", fuel: g.fuel, thr: g.thr, boom: g.boom, sparks: g.sparks, shake: g.shake || 0, wrecked: g.wreck > 0,
      };
    },
  };
}
