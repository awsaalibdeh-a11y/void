// Play: free roam. Drive anywhere (the loop and the ramp are stunts you can hit), press Fly to lift
// off on the thrusters, land anywhere soft to drive on. Green pads are missions worth points.
// Customize opens the garage without leaving the game. A minimap shows the roads, traffic and pads.
import * as THREE from "three";
import { clamp, lerp, G, R, LZ, HW, RAMP_X, PAD_R, ZONES, frame, loc, zonesFrom } from "./world.js";
import { HEAD } from "./interior.js";
import { pip } from "./city.js";

const $ = id => document.getElementById(id);
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const UP = new THREE.Vector3(0, 1, 0);
export const SPAWN = { x: -168, z: 339, yaw: -Math.PI / 2 };           // the middle of Tubaishi public park, facing the sea

export function createGame(W, car, sound, life, opts = {}) {
  const T = W.track, fr = frame(), back = frame(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const keys = new Set(), touch = new Set();
  const held = k => keys.has(k) || touch.has(k);
  const KEYMAP = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "up", KeyE: "up", KeyQ: "down", ShiftLeft: "down", ShiftRight: "down", ControlLeft: "down" };
  let g = null, view = "chase", active = false, paused = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const LOOP_X = T.P[T.loopIn].x, RAMP_END = RAMP_X + 14;

  addEventListener("keydown", e => {
    if (!active || paused) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === "KeyF") toggleFly();
    if (e.code === "KeyC" || e.code === "KeyV") toggleView();
    if (e.code === "KeyG") opts.garage && opts.garage();
  });
  addEventListener("keyup", e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener("blur", () => { keys.clear(); touch.clear(); });
  for (const b of document.querySelectorAll("[data-pad]")) {
    const k = b.dataset.pad;
    const on = e => { e.preventDefault(); touch.add(k); b.classList.add("on"); }, off = e => { e.preventDefault(); touch.delete(k); b.classList.remove("on"); };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
    b.addEventListener("contextmenu", e => e.preventDefault());
  }
  const toggleView = () => { view = view === "chase" ? "seat" : "chase"; $("gView").textContent = view === "chase" ? "Front seat" : "Chase cam"; };
  $("gView").onclick = toggleView;
  $("gFly").onclick = () => toggleFly();
  $("gGarage").onclick = () => opts.garage && opts.garage();
  $("gGo").onclick = () => { $("gReady").hidden = true; if (!sound.on) sound.setOn(true); g.started = true; };

  function spawn(at) {
    const s = at || SPAWN;
    Object.assign(g, { mode: "drive", x: s.x, z: s.z, y: 0, yaw: s.yaw, v: 0, vel: new THREE.Vector3(), pitch: 0, roll: 0, wings: 0, thr: 0, ang: 0, gForce: 1, d: 0, hover: false, landing: false, wreck: 0 });
  }
  function start() {
    g = { score: 0, started: false, last: { ...SPAWN }, msg: "", msgT: 0, done: new Set() };
    spawn(); $("gReady").hidden = false; $("gScore").textContent = "0"; $("gBest").textContent = best() ? `Best score: ${best()}` : "";
    sound.setGame("idle");
  }
  const best = () => store.get("void.best2") || 0;
  const say = (m, t = 3) => { g.msg = m; g.msgT = t; };
  function addScore(n, why) { g.score += n; $("gScore").textContent = g.score; if (g.score > best()) store.set("void.best2", g.score); say(`${why}  +${n}`); sound.win(); }

  function toggleFly() {
    if (!g || g.wreck > 0 || !g.started) return;
    if (g.mode === "drive") { g.mode = "air"; g.hover = true; g.landing = false; g.vel.set(Math.cos(g.yaw) * g.v, 2, Math.sin(g.yaw) * g.v); say("Thrusters on. Space or E: up · Q or Shift: down · W: boost · F: land"); }
    else if (g.mode === "air") { g.landing = !g.landing; if (!g.landing) g.hover = true; say(g.landing ? "Coming down gently" : "Flying"); }
  }
  function wreck(why) { g.wreck = 2.2; g.v = 0; g.vel.set(0, 0, 0); say(why + ". Respawning…", 2.2); sound.crash(); }
  const rampH = (x, z) => (x >= RAMP_X && x <= RAMP_END && Math.abs(z - LZ) < HW + .3) ? 4.5 * ((x - RAMP_X) / 14) ** 2 : 0;
  const hitBuilding = (x, z, y, pad) => W.buildings.find(b => Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad && y < b.h && (!b.poly || pip(x, z, b.poly) || [[pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([a, c]) => pip(x + a, z + c, b.poly))));

  function step(dt) {
    if (g.msgT > 0) g.msgT -= dt;
    if (g.wreck > 0) { g.wreck -= dt; if (g.wreck <= 0) spawn(g.last); return; }
    const turn = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);

    if (g.mode === "drive") {
      const acc = (held("gas") ? (g.v < 0 ? 18 : 10 * (1 - g.v / 92)) : 0) - (held("brake") ? (g.v > .5 ? 16 : 6) : 0) - Math.sign(g.v) * (.35 + .0004 * g.v * g.v);
      g.v = clamp(g.v + acc * dt, -12, 92);
      if (!held("gas") && !held("brake") && Math.abs(g.v) < .3) g.v = 0;
      const steer = turn * .5 / (1 + Math.abs(g.v) / 22);
      g.yaw += g.v * Math.tan(steer) / 2.8 * dt;
      const nx = g.x + Math.cos(g.yaw) * g.v * dt, nz = g.z + Math.sin(g.yaw) * g.v * dt, ny = rampH(nx, nz);
      if (hitBuilding(nx, nz, ny + .5, 1.3)) { g.v *= -.25; sound.pop(); say("Bump!", 1); }
      else {
        // leave the ramp lip fast and you fly
        if (rampH(g.x, g.z) > 2 && nx > RAMP_END - .01 && Math.cos(g.yaw) > .7 && g.v > 8) {
          g.mode = "air"; g.hover = false; const th = Math.atan(2 * 4.5 / 14);
          g.vel.set(Math.cos(g.yaw) * Math.cos(th) * g.v, Math.sin(th) * g.v, Math.sin(g.yaw) * Math.cos(th) * g.v); g.y = 4.5; g.x = nx; g.z = nz;
          if (g.v > 30) addScore(250, "Ramp jump"); return;
        }
        g.x = nx; g.z = nz; g.y = ny;
      }
      // drive into the loop and the track takes you round
      if (g.x > LOOP_X - 1.5 && g.x < LOOP_X + .5 && Math.abs(g.z) < HW && Math.cos(g.yaw) > .8 && g.v > 3) { g.mode = "rail"; g.d = T.D[T.loopIn]; return; }
      for (const c of life ? life.cars : []) { const dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz); if (d < 3 && d > 0) { g.x += dx / d * (3 - d); g.z += dz / d * (3 - d); g.v *= .4; if (c.bump <= 0) { c.bump = 1; sound.pop(); } } }
      g.pitch = lerp(g.pitch, ny > 0 ? Math.atan(2 * 4.5 * ((g.x - RAMP_X) / 14) / 14) : 0, clamp(dt * 10)); g.roll = lerp(g.roll, -steer * g.v * .02, clamp(dt * 5));
      if (g.y === 0 && Math.abs(g.v) < 30) g.last = { x: g.x, z: g.z, yaw: g.yaw };
      g.gForce = 1 + Math.abs(g.v * g.v * Math.tan(steer) / 2.8) / G * .4;
      return;
    }

    if (g.mode === "rail") {
      T.sample(g.d, fr);
      g.v = clamp(g.v + ((held("gas") ? 10 * (1 - g.v / 92) : 0) - (held("brake") ? 16 : 0) - .4 - G * fr.f.y) * dt, 0, 92);
      g.d += g.v * dt;
      const n = g.v * g.v / R + G * fr.u.y; g.gForce = n / G;
      if (n < 0 || g.v < .5) {               // too slow: you come off the loop and fall
        g.mode = "air"; g.hover = false; g.vel.copy(fr.f).multiplyScalar(g.v); g.x = fr.p.x; g.y = fr.p.y; g.z = fr.p.z; g.yaw = 0; say("Too slow for the loop!", 2); return;
      }
      g.x = fr.p.x; g.y = fr.p.y; g.z = fr.p.z;
      if (g.d >= T.D[T.loopOut]) { g.mode = "drive"; g.y = 0; g.yaw = 0; g.pitch = 0; g.x = T.P[T.loopOut].x; g.z = T.P[T.loopOut].z; addScore(500, "Full loop"); }
      return;
    }

    // air
    const lift = held("up"), dive = held("down") && !lift, boost = held("gas"), brake = held("brake");
    g.yaw += turn * .85 * dt;
    const vh = Math.hypot(g.vel.x, g.vel.z);
    g.wings = clamp(g.wings + (vh > 34 ? 1 : -1) * dt * 1.4);
    const dir = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw));
    const h = new THREE.Vector3(g.vel.x, 0, g.vel.z), hl = h.length();
    if (hl > .1) { h.lerp(dir.clone().multiplyScalar(hl), clamp(dt * (1.4 + g.wings))); g.vel.x = h.x; g.vel.z = h.z; }
    const a = new THREE.Vector3(0, -G, 0), ceiling = clamp(1 - (g.y - 260) / 140);
    a.y += g.wings * G * Math.min(.96, (vh / 80) ** 2) * (.4 + .6 * ceiling);
    if (lift) a.y += 18 * ceiling;
    if (dive) { a.y -= 9; g.landing = false; if (g.vel.y < -20) a.y += (-20 - g.vel.y) * 3; }   // thrusters push you down (to 20 m/s): height turns into speed
    if (g.hover && !lift && !dive && !g.landing) a.y += clamp(G - g.vel.y * 2.5, 0, 16);   // hover assist: holds height when you let go
    if (g.landing) a.y += clamp(G + ((g.y < 14 ? -3 : -9) - g.vel.y) * 3, 0, 22);        // drop at 9 m/s, soft 3 m/s for the last few metres
    if (boost) a.addScaledVector(dir, 7);
    const k = .0008 + (brake ? .003 : 0) + (1 - g.wings) * .0004;
    a.addScaledVector(g.vel, -(k * (dive ? .5 : 1) * g.vel.length() + (brake || g.landing ? .35 : .01)));
    g.vel.addScaledVector(a, dt);
    g.x += g.vel.x * dt; g.y += g.vel.y * dt; g.z += g.vel.z * dt;
    g.thr = lerp(g.thr, lift ? 1 : dive ? .7 : boost ? .85 : g.hover || g.landing ? .55 : .15, clamp(dt * 6)); g.ang = lerp(g.ang, lift || g.hover || g.landing ? .05 : 1, clamp(dt * 3));
    g.roll = lerp(g.roll, -turn * .45, clamp(dt * 4)); g.pitch = lerp(g.pitch, clamp(Math.atan2(g.vel.y, Math.max(1, vh)), -.6, .6) * (g.hover ? .3 : 1), clamp(dt * 3));
    g.gForce = 1 + (lift ? .9 : 0) + Math.abs(turn) * .3;
    if (hitBuilding(g.x, g.z, g.y, .8)) return wreck(vh > 15 ? "Hit a building" : "Scraped a building");
    const ground = rampH(g.x, g.z);
    if (g.y <= ground) {
      g.y = ground;
      // only a steep, fast hit is a crash: a shallow touchdown keeps its energy and rolls on
      const down = -g.vel.y, angle = Math.atan2(down, Math.max(.1, vh));
      if (down > 24 || (down > 14 && angle > 1.1)) return wreck(`Hit the ground too hard (${down.toFixed(1)} m/s down)`);
      const zone = ZONES.find(z => Math.hypot(g.x - z.x, g.z - z.z) < PAD_R);
      if (zone && !g.done.has(zone.id)) { g.done.add(zone.id); if (zone.safe) addScore(1000 + Math.round(Math.max(0, 7 + g.vel.y) * 60), `Landed at LZ ${zone.id}`); else say(`LZ ${zone.id} is unsafe: ${zone.note}`); }
      // keep the kinetic energy: the drop's speed carries into the roll along the ground (a little lost to the suspension)
      if (vh > 2) g.yaw = Math.atan2(g.vel.z, g.vel.x);
      g.v = Math.min(92, Math.sqrt(vh * vh + .6 * down * down));
      g.mode = "drive"; g.y = ground; g.wings = 0; g.hover = false; g.landing = false; g.pitch = 0;
      if (g.v > 25) say(`Touchdown at ${Math.round(g.v * 3.6)} km/h. Rolling on`, 2);
    }
  }

  // ---- minimap: the map drawn once, then turned with the car ----
  const MM = 2.4, bounds = W.bounds, mapC = document.createElement("canvas");
  mapC.width = Math.ceil((bounds.x1 - bounds.x0) / MM); mapC.height = Math.ceil((bounds.z1 - bounds.z0) / MM);
  {
    const x = mapC.getContext("2d"); x.fillStyle = "#2a2621"; x.fillRect(0, 0, mapC.width, mapC.height);
    const P = ([px, pz]) => [(px - bounds.x0) / MM, (pz - bounds.z0) / MM];
    const poly = (pts, fill) => { x.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.fillStyle = fill; x.fill(); };
    for (const w of W.water || []) poly(w, "#14374f");
    for (const b of W.beaches || []) poly(b, "#8a7650");
    for (const p of W.parks || []) poly(p, "#2c4a2e");
    for (const b of W.footprints || []) poly(b, "#4a4642");
    x.lineCap = "round"; x.lineJoin = "round";
    for (const r of W.roads || []) { x.beginPath(); r.p.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.strokeStyle = r.w >= 10 ? "#d6d3cc" : "#9a958c"; x.lineWidth = Math.max(1.5, r.w / MM); x.stroke(); }
  }
  const mm = $("gMap"), mx = mm.getContext("2d");
  function drawMap() {
    const S = mm.width, c = S / 2;
    mx.save(); mx.clearRect(0, 0, S, S); mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.clip();
    mx.fillStyle = "#1b1814"; mx.fillRect(0, 0, S, S);
    mx.translate(c, c); mx.rotate(-g.yaw - Math.PI / 2);
    mx.drawImage(mapC, -(g.x - bounds.x0) / MM, -(g.z - bounds.z0) / MM);
    for (const z of ZONES) { const px = (z.x - g.x) / MM, pz = (z.z - g.z) / MM; mx.fillStyle = z.safe ? (g.done.has(z.id) ? "#888" : "#3dff8a") : "#ff4455"; mx.beginPath(); mx.arc(px, pz, 5, 0, 7); mx.fill(); }
    if (life) { mx.fillStyle = "#ffd23d"; for (const n of life.cars) { const px = (n.x - g.x) / MM, pz = (n.z - g.z) / MM; if (Math.abs(px) < c && Math.abs(pz) < c) mx.fillRect(px - 1.5, pz - 1.5, 3, 3); } }
    mx.restore();
    mx.fillStyle = "#fff"; mx.beginPath(); mx.moveTo(c, c - 8); mx.lineTo(c - 6, c + 6); mx.lineTo(c + 6, c + 6); mx.closePath(); mx.fill();
    mx.strokeStyle = "rgba(255,255,255,.35)"; mx.lineWidth = 2; mx.beginPath(); mx.arc(c, c, c - 2, 0, 7); mx.stroke();
  }

  let mapT = 0;
  return {
    get state() { return g; },
    enter() { active = true; start(); },
    exit() { active = false; keys.clear(); touch.clear(); sound.setGame("off"); },
    pause(v) { paused = v; keys.clear(); touch.clear(); },
    update(dt) {
      if (!g) start();
      if (g.started && !paused) step(dt);
      const air = g.mode === "air", speed = air ? g.vel.length() * 3.6 : Math.abs(g.v) * 3.6;
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
      if (view === "seat") cam = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30, .5, HEAD.z), up: fr.u.clone(), fov: 72 };
      else {
        let up = UP.clone();
        if (g.mode === "rail") { T.sample(Math.max(T.D[T.loopIn] - 6, g.d - 7.5), back); camPos.copy(loc(back, 0, 2.4, 0)); camLook.copy(loc(fr, 5, .8, 0)); up = back.u.clone(); }
        else {
          const d = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw)), far = air ? 11 : 7 + speed * .012;
          const wantPos = fr.p.clone().addScaledVector(d, -far).add(new THREE.Vector3(0, air ? 3.6 : 3.4, 0)), wantLook = fr.p.clone().addScaledVector(d, 6).add(new THREE.Vector3(0, .8, 0));
          const k = clamp(dt * (air ? 4 : 6)); camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
          // camera collision: if a building is between the car and the camera, bring the camera in front of it
          const near = W.buildings.filter(b => Math.abs(b.x - g.x) < b.hw + 16 && Math.abs(b.z - g.z) < b.hd + 16);
          if (near.length) {
            const from = fr.p.clone().add(new THREE.Vector3(0, 1.6, 0)), to = camPos.clone(), seg = to.clone().sub(from), n = Math.ceil(seg.length() / .4);
            for (let i = 1; i <= n; i++) {
              const pnt = from.clone().addScaledVector(seg, i / n);
              if (near.some(b => pnt.y < b.h + 1 && Math.abs(pnt.x - b.x) < b.hw + .6 && Math.abs(pnt.z - b.z) < b.hd + .6 && (!b.poly || pip(pnt.x, pnt.z, b.poly)))) { camPos.copy(from.addScaledVector(seg, Math.max(0, (i - 2) / n))); break; }
            }
          }
        }
        cam = { pos: camPos.clone(), look: camLook.clone(), up, fov: lerp(54, 64, clamp(speed / 330)) };
      }
      sound.setGame(!g.started ? "idle" : g.wreck > 0 ? "end" : air ? (g.y < 50 && g.vel.y < 0 ? "land" : "air") : "drive");
      let gear = 1; const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];
      for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
      gear = Math.min(7, gear);
      const rpm = !air ? 1800 + clamp((speed - GEARS[gear - 1]) / ((GEARS[gear] || 340) - GEARS[gear - 1])) * 5800 : 900;
      const zones = zonesFrom(fr.p, fr.f);
      $("gSpd").textContent = Math.round(speed); $("gAlt").textContent = Math.round(Math.max(0, g.y)); $("gVs").textContent = (air ? g.vel.y : 0).toFixed(1);
      $("gHint").textContent = g.msgT > 0 ? g.msg : "";
      $("gFly").textContent = g.mode === "air" ? (g.landing ? "Hover" : "Land") : "Fly";
      document.body.classList.toggle("g-air", air);
      const tgt = zones.find(z => z.safe && z.dist <= 5 && !g.done.has(z.id)), arrow = $("gArrow");
      if (tgt) { arrow.style.opacity = 1; arrow.style.transform = `rotate(${Math.atan2(tgt.side, tgt.fwd)}rad)`; $("gTgt").textContent = `Mission: land at LZ ${tgt.id} · ${tgt.dist.toFixed(2)} km`; }
      else { arrow.style.opacity = 0; $("gTgt").textContent = ""; }
      if ((mapT += dt) > .05) { mapT = 0; drawMap(); }
      return {
        pos: fr.p.clone(), quat: q, fr, speed, g: g.gForce, alt: Math.max(0, g.y), vs: air ? g.vel.y : 0, player: { x: g.x, y: g.y, z: g.z },
        thrust: { power: air ? g.thr : 0, angle: g.ang, deploy: air ? 1 : 0 }, wings: g.wings, air, cam,
        inside: view === "seat", screenOn: view === "seat", mode: !air ? "DRIVE" : g.wings > .9 ? "GLIDE" : g.hover ? "HOVER" : "THRUST",
        rpm, gear, load: held("gas") ? 1 : .2, engine: !air ? 1 : .15, zones, reveal: 1,
      };
    },
  };
}
