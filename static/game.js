// Play: drive the loop (too slow at the top and you fall), hit the ramp, then fly it yourself:
// thrusters to lift, boost to push, wings open on their own at speed. Land soft on a green pad.
import * as THREE from "three";
import { clamp, lerp, G, R, PAD_R, ZONES, frame, loc, zonesFrom } from "./world.js";
import { HEAD } from "./interior.js";

const $ = id => document.getElementById(id);
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

export function createGame(W, car, sound) {
  const T = W.track, fr = frame(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const keys = new Set(), touch = new Set();
  const held = k => keys.has(k) || touch.has(k);
  const KEYMAP = { ArrowUp: "gas", KeyW: "gas", ArrowDown: "brake", KeyS: "brake", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "thrust", ShiftLeft: "thrust", ShiftRight: "thrust" };
  let g = null, view = "chase", active = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  addEventListener("keydown", e => {
    if (!active) return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === "KeyC" || e.code === "KeyV") toggleView();
    if (e.code === "KeyR" && g && g.phase === "over") start();
    if (e.code === "Enter" && g && g.phase === "ready") go();
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
  $("gGo").onclick = () => go();
  $("gRetry").onclick = () => start();

  function start() {
    g = { phase: "ready", d: T.D[T.idxX(0)], v: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, fuel: 100, time: 0, wings: 0, thr: 0, ang: 0, gForce: 1, msg: "" };
    T.sample(g.d, fr); camPos.copy(loc(fr, -9, 3, 0)); camLook.copy(fr.p);
    $("gReady").hidden = false; $("gOver").hidden = true; $("gBest").textContent = best() ? `Best score: ${best()}` : "";
    sound.setGame("idle");
  }
  function go() { if (!g || g.phase !== "ready") return; g.phase = "drive"; $("gReady").hidden = true; if (!sound.on) sound.setOn(true); }
  const best = () => store.get("void.best") || 0;

  function over(kind, title, msg) {
    g.phase = "over"; g.kind = kind;
    let score = 0;
    if (kind === "win") score = 1000 + Math.round(g.fuel * 10) + Math.round(Math.max(0, 150 - g.time) * 5) + Math.round(Math.max(0, 6 + g.vel.y) * 40);
    if (score > best()) store.set("void.best", score);
    $("gTitle").textContent = title; $("gTitle").className = kind;
    $("gMsg").textContent = msg;
    $("gStats").innerHTML = kind === "win"
      ? `<div><b>${score}</b><span>Score</span></div><div><b>${Math.round(g.fuel)}%</b><span>Fuel left</span></div><div><b>${g.time.toFixed(1)}s</b><span>Time</span></div><div><b>${Math.abs(g.vel.y).toFixed(1)}</b><span>Touchdown m/s</span></div>`
      : `<div><b>${g.time.toFixed(1)}s</b><span>Time</span></div><div><b>${Math.round(g.fuel)}%</b><span>Fuel left</span></div>`;
    $("gOverBest").textContent = `Best score: ${best()}`;
    $("gOver").hidden = false;
    if (kind === "win") sound.win(); else sound.crash();
    sound.setGame("end");
  }

  function step(dt) {
    if (g.phase === "drive") {
      g.time += dt;
      T.sample(g.d, fr);
      const onLoop = fr.i >= T.loopIn && fr.i <= T.loopOut;
      const acc = (held("gas") ? 11 * (1 - g.v / 95) : 0) - (held("brake") ? 16 : 0) - (.4 + .00035 * g.v * g.v) - G * fr.f.y;
      g.v = clamp(g.v + acc * dt, 0, 95); g.d += g.v * dt;
      const n = g.v * g.v / R + G * fr.u.y;
      g.gForce = onLoop ? n / G : 1;
      if (onLoop && n < 0) return over("crash", "Fell off the loop", "Too slow over the top. You need about 34 km/h up there, so carry more speed into it. Hold GAS.");
      if (onLoop && g.v < .5) return over("crash", "Stalled in the loop", "You stopped on the way up. Hit it faster.");
      g.pos.copy(fr.p); basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis);
      if (g.d >= T.D[T.roadEnd]) {
        g.phase = "air"; g.vel.copy(fr.f).multiplyScalar(g.v);
        g.yaw = Math.atan2(fr.f.z, fr.f.x); g.pitch = Math.asin(fr.f.y);
        if (g.v < 25) g.msg = "Slow off the ramp. Use THRUST to stay up!";
      }
      g.hint = fr.i < T.loopIn ? "Hold GAS. Hit the loop above 70 km/h." : onLoop ? "Keep it pinned through the loop." : "Full speed at the ramp!";
      return;
    }
    if (g.phase !== "air") return;
    g.time += dt;
    const turn = (held("right") ? 1 : 0) - (held("left") ? 1 : 0), lift = held("thrust") && g.fuel > 0, boost = held("gas") && g.fuel > 0, brake = held("brake");
    g.yaw += turn * .85 * dt;
    const vh = Math.hypot(g.vel.x, g.vel.z);
    g.wings = clamp(g.wings + (vh > 38 ? 1 : -1) * dt * 1.4);
    const dir = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw));
    // steer the horizontal velocity toward the nose
    const h = new THREE.Vector3(g.vel.x, 0, g.vel.z), hl = h.length();
    if (hl > .1) { h.lerp(dir.clone().multiplyScalar(hl), clamp(dt * (1.4 + g.wings))); g.vel.x = h.x; g.vel.z = h.z; }
    const a = new THREE.Vector3(0, -G, 0);
    const ceiling = clamp(1 - (g.pos.y - 260) / 140);                                  // thin air: less lift and thrust up high
    a.y += g.wings * G * Math.min(.96, (vh / 80) ** 2) * (.4 + .6 * ceiling);            // wings never quite hold it up: it glides down
    if (lift) { a.y += 18 * ceiling; g.fuel -= 5 * dt; }
    if (boost) { a.addScaledVector(dir, 7); g.fuel -= 2.4 * dt; }
    const k = .0008 + (brake ? .003 : 0) + (1 - g.wings) * .0004;                       // about 330 km/h flat out on boost
    a.addScaledVector(g.vel, -(k * g.vel.length() + (brake ? .25 : .01)));
    for (const z of ZONES) if (z.id === "CHARLIE" && Math.hypot(g.pos.x - z.x, g.pos.z - z.z) < 450) a.z += 7;
    g.vel.addScaledVector(a, dt); g.pos.addScaledVector(g.vel, dt);
    g.fuel = Math.max(0, g.fuel);
    g.thr = lerp(g.thr, lift ? 1 : boost ? .85 : .18, clamp(dt * 6)); g.ang = lerp(g.ang, lift ? .05 : 1, clamp(dt * 3));
    g.roll = lerp(g.roll, -turn * .45, clamp(dt * 4)); g.pitch = lerp(g.pitch, clamp(Math.atan2(g.vel.y, Math.max(1, vh)), -.6, .6), clamp(dt * 3));
    const f = new THREE.Vector3(Math.cos(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.sin(g.yaw) * Math.cos(g.pitch));
    const s0 = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), u0 = new THREE.Vector3().crossVectors(s0, f);
    const s = s0.clone().applyAxisAngle(f, g.roll), u = u0.clone().applyAxisAngle(f, g.roll);
    fr.p.copy(g.pos); fr.f.copy(f); fr.s.copy(s); fr.u.copy(u);
    basis.makeBasis(f, u, s); q.setFromRotationMatrix(basis);
    g.gForce = 1 + (lift ? .9 : 0) + Math.abs(turn) * .3;
    for (const b of W.buildings) if (Math.abs(g.pos.x - b.x) < b.hw + 1.5 && Math.abs(g.pos.z - b.z) < b.hd + 1.2 && g.pos.y < b.h) return over("crash", "Hit a building", "Fly higher over the city, or steer round it.");
    if (g.pos.y <= 0) {
      g.pos.y = 0;
      const zone = ZONES.find(z => Math.hypot(g.pos.x - z.x, g.pos.z - z.z) < PAD_R);
      if (g.vel.y < -6.5 || vh > 24) return over("crash", "Came in too hard", `Touchdown at ${Math.abs(g.vel.y).toFixed(1)} m/s down and ${Math.round(vh * 3.6)} km/h. Brake and thrust to land under 6 m/s and 86 km/h.`);
      if (zone && zone.safe) return over("win", `Landed at LZ ${zone.id}`, `${zone.note}. Safe landing.`);
      if (zone) return over("lose", `LZ ${zone.id} is unsafe`, `${zone.note}. The scan marked it red, so pick a green zone.`);
      return over("lose", "Landed off the pads", "Soft landing, but not on a landing zone. Follow the arrow to a green pad.");
    }
    const target = zonesFrom(g.pos, dir).find(z => z.safe && z.dist <= 5);
    g.hint = g.msg || (target ? `Head for LZ ${target.id}: ${target.dist.toFixed(1)} km${target.dist < .5 ? ". Brake and thrust to land soft." : ""}` : "No safe zone in 5 km. Keep gliding.");
    if (g.time > 4) g.msg = "";
  }

  return {
    get state() { return g; },
    enter() { active = true; start(); },
    exit() { active = false; keys.clear(); touch.clear(); sound.setGame("off"); },
    update(dt, time, aspect) {
      if (!g) start();
      if (g.phase !== "over") step(dt);
      if (g.phase === "ready") { T.sample(g.d, fr); basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis); g.pos.copy(fr.p); }
      const air = g.phase === "air" || (g.phase === "over" && g.vel.lengthSq() > 0 && g.d >= T.D[T.roadEnd]);
      const speed = air ? g.vel.length() * 3.6 : g.v * 3.6;
      // camera
      car.group.position.copy(g.pos); car.group.quaternion.copy(q); car.group.updateMatrixWorld(true);
      let cam;
      if (view === "seat") cam = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30, .5, HEAD.z), up: fr.u.clone(), fov: 72 };
      else {
        let wantPos, wantLook, up = new THREE.Vector3(0, 1, 0);
        if (!air) { wantPos = loc(fr, -8.5, 2.6, 0); wantLook = loc(fr, 6, .8, 0); up = fr.u.clone(); }
        else { const d = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw)); wantPos = g.pos.clone().addScaledVector(d, -11).add(new THREE.Vector3(0, 3.6, 0)); wantLook = g.pos.clone().addScaledVector(d, 8).add(new THREE.Vector3(0, .6, 0)); }
        const k = clamp(dt * (air ? 4 : 9));
        camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
        cam = { pos: camPos.clone(), look: camLook.clone(), up, fov: lerp(52, 62, clamp(speed / 330)) };
      }
      const altitude = Math.max(0, g.pos.y);
      sound.setGame(g.phase === "over" ? "end" : g.phase === "ready" ? "idle" : !air ? "drive" : altitude < 60 && g.vel.y < 0 ? "land" : "air");
      let gear = 1; const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];
      for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
      gear = Math.min(7, gear);
      const rpm = !air ? 1800 + clamp((speed - GEARS[gear - 1]) / ((GEARS[gear] || 340) - GEARS[gear - 1])) * 5800 : 900;
      const zones = zonesFrom(g.pos, fr.f);
      // HUD
      $("gSpd").textContent = Math.round(speed); $("gAlt").textContent = Math.round(altitude); $("gVs").textContent = (air ? g.vel.y : 0).toFixed(1);
      $("gFuel").textContent = Math.round(g.fuel); $("gFuelBar").style.width = g.fuel + "%";
      $("gG").textContent = g.gForce.toFixed(1);
      $("gHint").textContent = g.phase === "ready" ? "" : g.hint || "";
      $("gMode").textContent = !air ? "Drive" : g.wings > .9 ? "Glide" : "Thrust";
      document.body.classList.toggle("g-air", air);
      const tgt = zones.find(z => z.safe && z.dist <= 5);
      const arrow = $("gArrow");
      if (air && tgt) { arrow.style.opacity = 1; arrow.style.transform = `rotate(${Math.atan2(tgt.side, tgt.fwd)}rad)`; $("gTgt").textContent = `LZ ${tgt.id} · ${tgt.dist.toFixed(2)} km`; }
      else { arrow.style.opacity = 0; $("gTgt").textContent = ""; }
      return {
        pos: g.pos, quat: q, fr, speed, g: g.gForce, alt: altitude, vs: air ? g.vel.y : 0,
        thrust: { power: air ? g.thr : 0, angle: g.ang, deploy: air ? 1 : 0 }, wings: g.wings, air, cam,
        inside: view === "seat", screenOn: view === "seat", fuel: g.fuel, mode: !air ? "DRIVE" : g.wings > .9 ? "GLIDE" : "THRUST",
        rpm, gear, load: held("gas") ? 1 : .2, engine: !air ? 1 : .15, zones, reveal: 1,
      };
    },
  };
}
