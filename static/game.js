// Play: free roam in VOID City. Drive anywhere (grip, drift with the handbrake, nitro), hit the loop, the ramps
// and the sky rings, press Fly to lift off: the thrusters hold you up when slow, the wings and real lift and drag
// take over when fast (bank to turn, pull up to climb, too slow and it stalls). Land on the park lawn or a
// skyscraper's helipad. Smash traffic that is slower than you; anything faster that hits you does the damage.
import * as THREE from "three";
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
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), orbit = { yaw: 0, pitch: 0, drag: false, x: 0, y: 0, t: 0 };
  const LOOP_X = T.P[T.loopIn].x;
  const gp = { steer: 0, gas: 0, brake: 0, pitch: 0, on: false, prev: {} };

  addEventListener("keydown", e => {
    if (!active || paused) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.repeat) return;
    if (e.code === "KeyF") toggleFly();
    if (e.code === "KeyC" || e.code === "KeyV") toggleView();
    if (e.code === "KeyG") opts.garage && opts.garage();
    if (e.code === "KeyH") horn();
    if (e.code === "KeyT") opts.cycleTime && opts.cycleTime();
    if (e.code === "KeyP") togglePhoto();
    if (e.code === "KeyR") reset();
  });
  addEventListener("keyup", e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener("blur", () => { keys.clear(); touch.clear(); });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = b.dataset.pad;
    const on = e => { e.preventDefault(); touch.add(k); b.classList.add("on"); }, off = e => { e.preventDefault(); touch.delete(k); b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
    b.addEventListener("contextmenu", e => e.preventDefault());
  }
  // drag on the screen to look around the car; it eases back behind you when you let go
  const gl = $("gl");
  gl.addEventListener("pointerdown", e => { if (!active || e.pointerType === "touch" && !photo) return; orbit.drag = true; orbit.x = e.clientX; orbit.y = e.clientY; });
  addEventListener("pointermove", e => { if (!orbit.drag) return; orbit.yaw += (e.clientX - orbit.x) * .006; orbit.pitch = clamp(orbit.pitch + (e.clientY - orbit.y) * .004, -.3, 1.2); orbit.x = e.clientX; orbit.y = e.clientY; orbit.t = 1.5; });
  addEventListener("pointerup", () => { orbit.drag = false; });
  gl.addEventListener("wheel", e => { if (photo) { orbit.dist = clamp((orbit.dist || 9) + e.deltaY * .01, 3, 40); e.preventDefault(); } }, { passive: false });

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
    { x: city.lawn.x - 40, z: city.lawn.z, yaw: 0, len: 18, h: 5.5 }, { x: 1000, z: -300, yaw: -Math.PI / 2, len: 18, h: 6 }, { x: -1000, z: -500, yaw: Math.PI / 2, len: 18, h: 6 }]) RAMPS.push({ w: 4, ...r });
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
    const s = at || SPAWN;
    Object.assign(g, { mode: "drive", x: s.x, z: s.z, y: s.y || 0, yaw: s.yaw, vel: new THREE.Vector3(), pitch: 0, roll: 0, steer: 0, wings: 0, thr: 0, ang: 0, gForce: 1, d: 0, hover: false, landing: false, wreck: 0, boom: 0,
      hp: 100, hurtT: 9, airT: 0, drift: 0, driftT: 0, nitro: g.nitro ?? 1, nitroOn: 0, stall: 0, sparks: 0 });
  }
  function start() {
    g = { score: 0, started: false, last: { ...SPAWN }, msg: "", msgT: 0, done: new Set(), combo: 1, comboT: 0, smashed: 0, near: new Map(), rings: 0, nitro: 1 };
    spawn(); $("gReady").hidden = false; $("gScore").textContent = "0"; $("gBest").textContent = best() ? `Best score: ${best()}` : "";
    sound.setGame("idle");
  }
  const best = () => store.get("void.best3") || 0;
  const say = (m, t = 3) => { g.msg = m; g.msgT = t; };
  function addScore(n, why, quiet) {
    if (g.comboT > 0) g.combo = Math.min(8, g.combo + 1); else g.combo = 1; g.comboT = 4;
    const pts = Math.round(n * g.combo); g.score += pts; $("gScore").textContent = g.score; if (g.score > best()) store.set("void.best3", g.score);
    say(`${why}  +${pts}${g.combo > 1 ? `  ×${g.combo}` : ""}`, 2.2); if (!quiet) sound.win();
  }
  function hurt(n, why) {
    if (n <= 0 || g.wreck > 0) return;
    g.hp -= n; g.hurtT = 0; g.shake = Math.min(1, (g.shake || 0) + n / 40); document.body.classList.add("g-hurt"); setTimeout(() => document.body.classList.remove("g-hurt"), 160);
    if (g.hp <= 0) { g.hp = 0; wreck(why + ". The car is wrecked"); }
  }
  function toggleFly() {
    if (!g || g.wreck > 0 || !g.started) return;
    if (g.mode === "drive") { g.mode = "air"; g.hover = true; g.landing = false; g.vel.y = Math.max(g.vel.y, 3); g.y += .3; say("Thrusters on. Space/E climb · Q/Ctrl dive · A/D bank · W thrust · Shift nitro · F land"); }
    else if (g.mode === "air" && g.jump) { g.jump = false; g.hover = true; g.landing = false; say("Thrusters on"); }
    else if (g.mode === "air") { g.landing = !g.landing; if (!g.landing) g.hover = true; say(g.landing ? "Coming down gently" : "Flying"); }
  }
  function wreck(why) { g.wreck = 2.6; g.boom = 1; g.vel.set(0, 0, 0); say(why + ". Respawning…", 2.6); sound.crash(); }
  function reset() { if (!g || !g.started || g.wreck > 0) return; spawn({ ...g.last }); say("Back on the road", 1.5); }
  function horn() { sound.horn && sound.horn(opts.hornType ? opts.hornType() : 0); life && life.honk(g.x, g.z); }

  // the ground under a point: ramps, rooftops (only if you are up there), else the street; water is -1
  function groundAt(x, z, y) {
    const rp = rampAt(x, z); if (rp) return { h: rp.h, ramp: rp };
    const roof = city.roofAt(x, z); if (roof > 0 && y >= roof - 1.2) return { h: roof, roof: true };
    if (y < 1.5 && city.isWater(x, z)) return { h: -1, water: true };
    return { h: 0 };
  }
  // buildings: an axis-aligned box test against the city's spatial hash; returns the push-out normal
  function hitBox(x, z, y, r) {
    for (const b of city.nearR(x, z, r + 2)) {
      if (y >= b.h - .4) continue;
      const dx = x - b.x, dz = z - b.z, ox = b.hw + r - Math.abs(dx), oz = b.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) return ox < oz ? { nx: Math.sign(dx), nz: 0, d: ox, b } : { nx: 0, nz: Math.sign(dz), d: oz, b };
    }
    return null;
  }
  const v2 = new THREE.Vector2();
  function traffic(dt) {
    if (!life || g.y > 3.5) return;
    const pv = g.vel, ps = Math.hypot(pv.x, pv.z);
    for (const c of life.nearCars(g.x, g.z, 10)) {
      if (c.wreck) continue;
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
          life.smash(c, pv.x, pv.z, rel); g.smashed++;
          pv.multiplyScalar(heavy ? .45 : .82); hurt(heavy ? rel * .9 : rel * .12, "Smashed a " + c.kind.id);
          addScore(heavy ? 400 : 150, heavy ? `Smashed a ${c.kind.id}!` : "Smash!", true); sound.crash(); g.sparks = 1;
        } else {                                                          // it is faster, or heavier: you take it
          const dmg = c.v > ps + 2 ? (c.v - ps) * 2.4 + rel * .4 : heavy ? rel * 1.1 : rel > 6 ? rel * .5 : 0;
          pv.x = pv.x * .3 + nvx * .6; pv.z = pv.z * .3 + nvz * .6; c.v *= .3;
          hurt(dmg, `Hit by a ${c.kind.id}`); if (dmg > 2) { sound.crash(); g.sparks = .7; } else sound.pop();
        }
      } else if (ps > 25 && Math.abs(along) < hl + 1 && Math.abs(side) < hw + 1.8 && Math.abs(side) >= hw) {
        const t = g.near.get(c) || 0; if (performance.now() - t > 4000) { g.near.set(c, performance.now()); addScore(60, "Near miss", true); }
      }
    }
  }

  function step(dt) {
    if (g.msgT > 0) g.msgT -= dt;
    if (g.comboT > 0) g.comboT -= dt; else g.combo = 1;
    if (g.wreck > 0) { g.wreck -= dt; g.boom = Math.max(0, g.boom - dt * .8); if (g.wreck <= 0) { spawn(g.last); } return; }
    g.hurtT += dt; if (g.hurtT > 7 && g.hp < 100) g.hp = Math.min(100, g.hp + dt * 2);
    g.shake = Math.max(0, (g.shake || 0) - dt * 2); g.sparks = Math.max(0, g.sparks - dt * 2);
    const turn = clamp((held("right") ? 1 : 0) - (held("left") ? 1 : 0) + gp.steer, -1, 1);
    const gas = Math.max(held("gas") ? 1 : 0, gp.gas), brake = Math.max(held("brake") ? 1 : 0, gp.brake);
    const wantNitro = held("nitro") && g.nitro > .02;
    g.nitroOn = lerp(g.nitroOn, wantNitro ? 1 : 0, clamp(dt * 8));
    if (wantNitro) g.nitro = Math.max(0, g.nitro - dt / 5); else g.nitro = Math.min(1, g.nitro + dt / 14);

    if (g.mode === "drive") {
      // ---- the road: a bicycle model with tyre grip, so it slides when you ask it to ----
      const hand = held("drift") || held("up");
      const f0x = Math.cos(g.yaw), f0z = Math.sin(g.yaw);
      let u = g.vel.x * f0x + g.vel.z * f0z;
      const maxSteer = .6 / (1 + Math.abs(u) / 17);
      g.steer += (turn * maxSteer - g.steer) * clamp(dt * 9);
      let yawRate = u * Math.tan(g.steer) / 2.8;
      if (hand && Math.abs(u) > 8) yawRate *= 1.45;
      g.yaw += yawRate * dt;
      const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), sx = -fz, sz = fx;
      u = g.vel.x * fx + g.vel.z * fz; let w = g.vel.x * sx + g.vel.z * sz;
      const top = 92 + g.nitroOn * 22;
      if (gas) u += (u < -.5 ? 20 : 11.5 * (1 - clamp(u / top) ** 2) + g.nitroOn * 11) * gas * dt;
      else if (g.nitroOn > .1) u += g.nitroOn * 11 * dt;
      if (brake) u -= (u > .5 ? 26 : 8) * brake * dt;
      u = Math.max(-16, u - Math.sign(u) * (.3 + .00034 * u * u) * dt);
      if (!gas && !brake && Math.abs(u) < .25) u = 0;
      const grip = hand ? 1.4 : 9 + Math.min(9, Math.abs(u) * .09);
      w *= Math.exp(-grip * dt);
      g.vel.set(fx * u + sx * w, 0, fz * u + sz * w);
      // drift scoring
      const slip = Math.atan2(Math.abs(w), Math.max(1, Math.abs(u)));
      if (slip > .22 && Math.abs(u) > 12) { g.drift += slip * Math.abs(u) * dt * 6; g.driftT = .7; }
      else if (g.driftT > 0) { g.driftT -= dt; if (g.driftT <= 0 && g.drift > 30) { addScore(Math.round(g.drift), "Drift"); g.drift = 0; } else if (g.driftT <= 0) g.drift = 0; }
      // move, with ramps, rooftops, buildings, water and traffic
      const nx = g.x + g.vel.x * dt, nz = g.z + g.vel.z * dt;
      const hit = hitBox(nx, nz, g.y + .5, 1.15);
      if (hit) {
        const vn = g.vel.x * hit.nx + g.vel.z * hit.nz;
        if (vn < 0) { g.vel.x -= 1.3 * vn * hit.nx; g.vel.z -= 1.3 * vn * hit.nz; g.vel.multiplyScalar(.75); }
        g.x = nx + hit.nx * hit.d; g.z = nz + hit.nz * hit.d;
        const imp = -vn; if (imp > 9) { hurt((imp - 9) * 1.8, "Hit a building"); sound.crash(); g.sparks = 1; } else if (imp > 2) sound.pop();
      } else { g.x = nx; g.z = nz; }
      const gr = groundAt(g.x, g.z, g.y), prevY = g.y;
      if (gr.water) { wreck("Drove into the river"); return; }
      if (gr.ramp) {
        g.y = gr.h; g.pitch = Math.atan(gr.ramp.slope) * Math.cos(g.yaw - gr.ramp.r.yaw);
        // off the lip fast and you fly
        if (gr.ramp.a > gr.ramp.r.len - .8 && u > 8 && Math.cos(g.yaw - gr.ramp.r.yaw) > .6) {
          const th = Math.atan(gr.ramp.slope); g.mode = "air"; g.hover = false; g.vel.y = Math.sin(th) * u; g.vel.x *= Math.cos(th); g.vel.z *= Math.cos(th); g.airT = 0; g.jump = true; return;
        }
      } else if (gr.h < prevY - .35) { g.mode = "air"; g.hover = false; g.landing = false; g.airT = 0; g.jump = true; return; }   // off a roof edge
      else { g.y = gr.h; g.pitch = lerp(g.pitch, clamp(-(gas - brake) * .02 * (Math.abs(u) < 30 ? 1 : .3), -.03, .03), clamp(dt * 6)); }
      // drive into the loop and the track takes you round
      if (g.x > LOOP_X - 1.5 && g.x < LOOP_X + .5 && Math.abs(g.z) < HW && Math.cos(g.yaw) > .8 && u > 3 && g.y < .2) { g.mode = "rail"; g.d = T.D[T.loopIn]; g.v = u; return; }
      traffic(dt);
      g.roll = lerp(g.roll, clamp(-yawRate * u * .006, -.08, .08), clamp(dt * 5));
      if (g.y === 0 && Math.abs(u) < 40 && !gr.roof && !city.isWater(g.x, g.z) && !hitBox(g.x, g.z, .5, 3)) g.last = { x: g.x, z: g.z, yaw: g.yaw };
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
    const up = held("up") ? 1 : 0, down = (held("down") ? 1 : 0), pitchCmd = clamp(up - down + gp.pitch, -1, 1);
    const V = g.vel.length(), vhat = V > .1 ? g.vel.clone().divideScalar(V) : new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw));
    const thrusting = g.hover || g.landing || up || gas || g.nitroOn > .1 || !g.jump;
    g.wings = clamp(g.wings + (V > 28 && (thrusting || !g.jump) ? 1 : -1) * dt * 1.2);
    const ang = clamp((V - 16) / 26);                                   // thrusters swing from straight down to straight back
    g.ang = lerp(g.ang, ang, clamp(dt * 3));
    // attitude: bank to turn, pull to climb; it settles back to the flight path when you let go
    const vh = Math.hypot(g.vel.x, g.vel.z), gamma = Math.atan2(g.vel.y, Math.max(1, vh));
    g.roll = lerp(g.roll, turn * (.25 + .8 * g.wings), clamp(dt * 3));          // bank into the turn
    const yawRate = (1 - g.wings) * turn * 1.1 + g.wings * G * Math.tan(g.roll) / Math.max(20, V);
    g.yaw += yawRate * dt;
    // hands off, the flight assist trims the nose so the wings carry exactly the weight (and damps any climb or sink)
    const kL = .00964, INC = .07, ceiling0 = clamp(1 - (g.y - 380) / 200), assist0 = Math.min(2, 1 / Math.max(.5, Math.cos(g.roll)));
    const wingK = kL * V * V * 2 * Math.PI * .9 * (.18 + .82 * g.wings) * assist0 * ceiling0;
    const needA = wingK > .5 ? clamp(G * Math.cos(gamma) / wingK - INC - g.vel.y * .006, -.25, .24) : 0;
    g.pitch += pitchCmd * .65 * g.wings * dt;
    g.pitch += ((pitchCmd ? g.pitch * .7 + gamma * .3 : gamma + needA / Math.max(.45, Math.cos(g.roll))) - g.pitch) * clamp(dt * 2);
    if (g.wings < .3) g.pitch = lerp(g.pitch, vh > 8 ? clamp(gamma * .4, -.3, .3) : 0, clamp(dt * 3));
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
    const CD = .09 + (1 - g.wings) * .06 + .12 * CL * CL + (brake ? .9 : 0) + (g.landing ? .2 : 0);
    a.addScaledVector(vhat, -kL * qd * CD);
    // sideslip: the car weathervanes into the airflow
    const sideV = g.vel.dot(s0); a.addScaledVector(s0, -sideV * 1.6);
    // thrust: back along the car when fast, down under it when slow
    const cruise = g.wings > .5 && !g.jump ? .25 : 0, back = (gas * 1 + cruise + g.nitroOn * 1.2) * 16 * g.ang * ceiling;
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
      if (imp > 4) { hurt(imp * 1.4, "Hit a building"); sound.crash(); g.sparks = 1; } else sound.pop();
      if (g.wreck > 0) return;
    }
    traffic(dt);
    const gr = groundAt(g.x, g.z, g.y);
    if (g.y <= gr.h) {
      if (gr.water) { wreck("Splashed into the water"); return; }
      g.y = gr.h;
      const down2 = -g.vel.y, vh2 = Math.hypot(g.vel.x, g.vel.z), angle = Math.atan2(down2, Math.max(.1, vh2));
      if (down2 > 26 || (down2 > 15 && angle > 1.1)) { hurt(down2 * 3, `Hit the ground hard (${down2.toFixed(1)} m/s down)`); if (g.wreck > 0) return; }
      else if (down2 > 10) hurt((down2 - 10) * 1.5, "Hard landing");
      const zone = ZONES.find(z => Math.hypot(g.x - z.x, g.z - z.z) < (z.r || PAD_R) && Math.abs(g.y - (z.y || 0)) < 3);
      if (zone && !g.done.has(zone.id)) { g.done.add(zone.id); if (zone.safe) addScore(1000 + Math.round(Math.max(0, 7 - down2) * 60) + (zone.y ? 500 : 0), `Landed at ${zone.id}`); else say(`${zone.id} is unsafe: ${zone.note}`); }
      if (g.jump && g.airT > 1.2) addScore(Math.round(g.airT * 120), `Airtime ${g.airT.toFixed(1)} s`);
      // keep the kinetic energy: the drop's speed carries into the roll along the ground
      const keep = Math.min(112, Math.sqrt(vh2 * vh2 + .6 * down2 * down2));
      if (vh2 > 2) g.yaw = Math.atan2(g.vel.z, g.vel.x);
      g.vel.set(Math.cos(g.yaw) * keep, 0, Math.sin(g.yaw) * keep);
      g.mode = "drive"; g.wings = 0; g.hover = false; g.landing = false; g.pitch = 0; g.roll = 0; g.jump = false;
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
  function drawMap() {
    const S = mm.width, c = S / 2;
    mx.save(); mx.clearRect(0, 0, S, S); mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.clip();
    mx.fillStyle = "#1b1814"; mx.fillRect(0, 0, S, S);
    mx.translate(c, c); mx.rotate(-g.yaw - Math.PI / 2);
    mx.drawImage(mapC, -(g.x - bounds.x0) / MM, -(g.z - bounds.z0) / MM);
    for (const z of ZONES) { const px = (z.x - g.x) / MM, pz = (z.z - g.z) / MM; mx.fillStyle = z.safe ? (g.done.has(z.id) ? "#888" : "#3dff8a") : "#ff4455"; mx.beginPath(); mx.arc(px, pz, 5, 0, 7); mx.fill(); }
    mx.fillStyle = "#ffc23d"; for (const r of RINGS) { const px = (r.x - g.x) / MM, pz = (r.z - g.z) / MM; if (Math.abs(px) < c && Math.abs(pz) < c) { mx.beginPath(); mx.arc(px, pz, 3, 0, 7); mx.fill(); } }
    if (life) { mx.fillStyle = "#ffd23d"; for (const n of life.nearCars(g.x, g.z, c * MM)) { const px = (n.x - g.x) / MM, pz = (n.z - g.z) / MM; if (Math.abs(px) < c && Math.abs(pz) < c) mx.fillRect(px - 1, pz - 1, 2, 2); } }
    mx.restore();
    mx.fillStyle = "#fff"; mx.beginPath(); mx.moveTo(c, c - 8); mx.lineTo(c - 6, c + 6); mx.lineTo(c + 6, c + 6); mx.closePath(); mx.fill();
    mx.strokeStyle = "rgba(255,255,255,.35)"; mx.lineWidth = 2; mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.stroke();
  }

  let mapT = 0, acc = 0;
  return {
    get state() { return g; }, get photo() { return photo; },
    enter() { active = true; start(); },
    exit() { active = false; keys.clear(); touch.clear(); sound.setGame("off"); if (photo) togglePhoto(); },
    pause(v) { paused = v; keys.clear(); touch.clear(); if (!v && g) g.hp = 100; },
    update(dt) {
      if (!g) start();
      pollPad();
      if (g.started && !paused && !photo) { acc += dt; const H = 1 / 120; let n = 0; while (acc >= H && n < 12) { step(H); acc -= H; n++; } }
      const air = g.mode === "air", speed = g.mode === "rail" ? g.v * 3.6 : g.vel.length() * 3.6;
      if (g.mode === "rail") { basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis); }
      else {
        const f = new THREE.Vector3(Math.cos(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.sin(g.yaw) * Math.cos(g.pitch));
        const s0 = new THREE.Vector3().crossVectors(f, UP).normalize(), u0 = new THREE.Vector3().crossVectors(s0, f);
        fr.f.copy(f); fr.s.copy(s0.applyAxisAngle(f, g.roll)); fr.u.copy(u0.applyAxisAngle(f, g.roll));
        basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis);
      }
      fr.p.set(g.x, g.y, g.z);
      car.group.position.copy(fr.p); car.group.quaternion.copy(q); car.group.updateMatrixWorld(true);
      let cam;
      if (orbit.t > 0 && !orbit.drag) { orbit.t -= dt; if (orbit.t <= 0) { orbit.yaw *= .0; } }
      if (!orbit.drag && !photo) { orbit.yaw = lerp(orbit.yaw, 0, clamp(dt * (orbit.t > 0 ? 0 : 2.5))); orbit.pitch = lerp(orbit.pitch, 0, clamp(dt * (orbit.t > 0 ? 0 : 2.5))); }
      const nitroFov = g.nitroOn * 9;
      if (photo) {
        const d = orbit.dist || 9, a = g.yaw + Math.PI + orbit.yaw, e = .25 + orbit.pitch;
        cam = { pos: fr.p.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d + .8, Math.sin(a) * Math.cos(e) * d)), look: fr.p.clone().add(new THREE.Vector3(0, .6, 0)), up: UP.clone(), fov: 42 };
      } else if (view === "seat") cam = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30, .5, HEAD.z), up: fr.u.clone(), fov: 72 + nitroFov };
      else if (view === "hood") cam = { pos: loc(fr, 1.2, 1.25, 0), look: loc(fr, 40, .9, 0), up: fr.u.clone(), fov: 66 + nitroFov };
      else {
        let up = UP.clone();
        if (g.mode === "rail") { T.sample(Math.max(T.D[T.loopIn] - 6, g.d - 7.5), back); camPos.copy(loc(back, 0, 2.4, 0)); camLook.copy(loc(fr, 5, .8, 0)); up = back.u.clone(); }
        else {
          // behind the direction of travel when moving fast (so drifts look like drifts), behind the nose when slow
          const hv = new THREE.Vector3(g.vel.x, 0, g.vel.z), sp = hv.length(), head = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw));
          const d = sp > 6 ? head.clone().lerp(hv.normalize(), air ? .7 : .45).normalize() : head;
          d.applyAxisAngle(UP, orbit.yaw);
          const far = air ? 12 + speed * .01 : 6.8 + speed * .014, hgt = (air ? 3.4 : 2.9) + orbit.pitch * 6 + (air ? -g.vel.y * .03 : 0);
          const wantPos = fr.p.clone().addScaledVector(d, -far).add(new THREE.Vector3(0, hgt, 0)), wantLook = fr.p.clone().addScaledVector(d, air ? 10 : 6).add(new THREE.Vector3(0, .9, 0));
          const k = clamp(dt * (air ? 4 : 7)); camPos.lerp(wantPos, k); camLook.lerp(wantLook, clamp(dt * 9));
          if (air) up.lerp(fr.u, .25).normalize();
          // camera collision: never behind a wall
          const from = fr.p.clone().add(new THREE.Vector3(0, 1.6, 0)), seg = camPos.clone().sub(from), n = Math.ceil(seg.length() / .5);
          for (let i = 1; i <= n; i++) { const pnt = from.clone().addScaledVector(seg, i / n); if (hitBox(pnt.x, pnt.z, pnt.y, .4)) { camPos.copy(from.addScaledVector(seg, Math.max(0, (i - 2) / n))); break; } }
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
      $("gHint").textContent = g.msgT > 0 ? g.msg : g.stall > .5 ? "STALL: push the nose down or add thrust" : g.drift > 20 ? `Drift ${Math.round(g.drift)}` : "";
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
        pos: fr.p.clone(), quat: q, fr, speed, g: g.gForce, alt: Math.max(0, g.y), vs: air ? g.vel.y : 0, player: { x: g.x, y: g.y, z: g.z, speed: speed / 3.6 },
        thrust: { power: air ? g.thr : 0, angle: g.ang, deploy: air && !(g.jump && !g.hover && !g.landing && g.thr < .05) ? 1 : 0 }, wings: g.wings, air, cam,
        inside: view === "seat", screenOn: view === "seat", mode: !air ? "DRIVE" : g.wings > .9 ? "GLIDE" : g.hover ? "HOVER" : "THRUST",
        rpm, gear, load: held("gas") || gp.gas > .3 ? 1 : .2, engine: !air ? 1 : .15, zones, reveal: 1,
        nitro: g.nitroOn, hp: g.hp, boom: g.boom, sparks: g.sparks, shake: g.shake || 0, wrecked: g.wreck > 0,
      };
    },
  };
}
