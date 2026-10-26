// Contracts: short jobs that mix driving, flying and chasing, each with a timer and bronze / silver / gold medals.
//  Rooftop Express  drive to a pickup on the street, then fly the parcel to a rooftop helipad and land on it
//  Takedown         a getaway car flees through the grid: ram it until it gives up
//  Sky Chase        a camera drone weaves round the towers: stay close behind it in the air
//  Hot Cargo        grab cargo at the docks (three stars at once), then deliver it to a rooftop while the police hunt you
// Best medals are kept on this device; every medal pays cash for the garage.
import * as THREE from "three";
import { GRID } from "./city.js";
import { makeDriver } from "./police.js";

const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const CONTRACTS = [
  { id: "express", icon: "📦", name: "Rooftop Express", text: "Drive to the pickup, then fly the parcel to a rooftop helipad", limit: 180, medals: [70, 100, 140] },
  { id: "takedown", icon: "💥", name: "Takedown", text: "Ram the getaway car 4 times before it escapes", limit: 120, medals: [35, 60, 90] },
  { id: "skychase", icon: "🛸", name: "Sky Chase", text: "Stay within 45 m of the drone for 20 seconds", limit: 100, medals: [35, 55, 80] },
  { id: "hot", icon: "🔥", name: "Hot Cargo", text: "Grab the cargo at the docks and land it on a rooftop while wanted", limit: 200, medals: [80, 120, 170] },
];
const PAY = [0, 1200, 2000, 3200];        // none, bronze, silver, gold
const MEDAL = ["", "🥉", "🥈", "🥇"];

export function createContracts(W, api, nav, sound, police) {
  const { scene } = W, $ = id => document.getElementById(id), D = makeDriver(api);
  const best = store.get("void.contracts") || {};
  // a column of light over the objective
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 400, 24, 1, true).translate(0, 200, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dfcff).multiplyScalar(1.5), transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beacon.visible = false; scene.add(beacon);
  // the getaway car: a low wedge in red with a flashing roof light
  const thief = new THREE.Group();
  { const m = new THREE.MeshStandardMaterial({ color: 0xb0101c, roughness: .3, metalness: .6 }), dark = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: .4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, .8, 2).translate(0, .75, 0), m), cab = new THREE.Mesh(new THREE.BoxGeometry(2, .6, 1.7).translate(-.3, 1.4, 0), dark);
    thief.add(body, cab); for (const [x, z] of [[1.4, 1], [1.4, -1], [-1.4, 1], [-1.4, -1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .3, 12).rotateX(Math.PI / 2), dark); w.position.set(x, .38, z); thief.add(w); }
    thief.flash = new THREE.Mesh(new THREE.BoxGeometry(.5, .2, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .4, .2), toneMapped: false })); thief.flash.position.set(-.3, 1.8, 0); thief.add(thief.flash); }
  thief.visible = false; scene.add(thief);
  // the drone: a disc with four rotors and a light
  const drone = new THREE.Group();
  { const m = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: .35, metalness: .7 }), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 2.6, 3), toneMapped: false });
    drone.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, .6, 20), m)); const eye = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8), glow); eye.position.y = -.4; drone.add(eye);
    for (const [x, z] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .08, 16), glow.clone()); arm.material.color.setRGB(.6, 1.2, 1.4); arm.position.set(x, .4, z); drone.add(arm); }
    drone.scale.setScalar(1.4); }
  drone.visible = false; scene.add(drone);

  const streetPoint = (p, rmin, rmax) => {           // a crossing on the grid at a distance, not in the water or a building
    for (let k = 0; k < 60; k++) {
      const i = Math.floor(Math.random() * GRID.NX), j = Math.floor(Math.random() * GRID.NZ), x = GRID.ax(i), z = GRID.sz(j), d = Math.hypot(x - p.x, z - p.z);
      if (d > rmin && d < rmax && !api.isWater(x, z) && !api.hitBox(x, z, .5, 3)) return { x, z };
    }
    return { x: GRID.ax(Math.floor(GRID.NX / 2)), z: GRID.sz(Math.floor(GRID.NZ / 2)) };
  };
  const padNear = (x, z, rmin, rmax) => { const pads = W.city.helipads.filter(h => { const d = Math.hypot(h.x - x, h.z - z); return d > rmin && d < rmax; }); return pads.length ? pads[Math.floor(Math.random() * pads.length)] : W.city.helipads[0]; };
  const docks = () => { const p = api.state; const opts = [5, 10, 15].map((j, k) => ({ x: -1010, z: GRID.sz(Math.min(GRID.NZ - 1, j)), name: ["Hudson piers north", "Hudson piers", "Hudson piers south"][k] })); return opts.filter(o => !api.isWater(o.x, o.z) && !api.hitBox(o.x, o.z, .5, 3)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] || streetPoint(p, 400, 900); };

  let C = null;           // the contract in progress
  function show(x, z, name, air, y) { beacon.position.set(x, air ? y : 0, z); beacon.visible = true; nav.setDest({ name, x, z, air: !!air, y: y || 0 }); }
  function start(id) {
    const p = api.state; if (!p || !p.started) return;
    const def = CONTRACTS.find(c => c.id === id); if (C) end(false, "Contract cancelled");
    C = { def, t: 0, stage: 0, msg: "" };
    if (id === "express") { const a = streetPoint(p, 250, 650); C.a = a; C.pad = padNear(a.x, a.z, 400, 1100); show(a.x, a.z, "📦 Parcel pickup"); C.msg = "Drive to the 📦 pickup and stop there"; }
    if (id === "takedown") {
      const s = streetPoint(p, 90, 160); Object.assign(C, { car: { x: s.x, z: s.z, yaw: Math.atan2(s.z - p.z, s.x - p.x), v: 18, accel: 15 }, hits: 0, hitT: 0, goal: streetPoint(s, 400, 900) });
      thief.visible = true; beacon.visible = false; nav.setDest(null); C.msg = "Ram the red getaway car";
    }
    if (id === "skychase") {
      const c = { x: p.x + 60, z: p.z, y: Math.max(60, p.y + 40) }; Object.assign(C, { dr: c, a0: Math.random() * 6, close: 0, cx: p.x, cz: p.z });
      drone.visible = true; C.msg = "Take off (F) and stay close to the drone";
    }
    if (id === "hot") { const d = docks(); C.a = d; C.pad = padNear(d.x, d.z, 300, 1000); show(d.x, d.z, "🔥 Cargo at " + (d.name || "the docks")); C.msg = "Drive to the docks for the cargo"; }
    $("gCon").hidden = false; sound.win(); api.say(`${def.icon} ${def.name}: ${def.text}`, 4);
  }
  function end(ok, why) {
    if (!C) return;
    const def = C.def; let medal = 0;
    if (ok) { medal = C.t <= def.medals[0] ? 3 : C.t <= def.medals[1] ? 2 : 1; api.addScore(PAY[medal], `${MEDAL[medal]} ${def.name} in ${fmt(C.t)}`); if (medal > (best[def.id] || 0)) { best[def.id] = medal; store.set("void.contracts", best); } }
    else api.say(`${def.icon} ${why || "Contract failed"}`, 3);
    beacon.visible = thief.visible = drone.visible = false; nav.setDest(null); $("gCon").hidden = true; C = null;
    return medal;
  }
  const onPad = (p, pad) => pad && p.mode === "drive" && Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r + 2 && Math.abs(p.y - pad.y) < 2.5;

  return {
    CONTRACTS, best, get active() { return C; }, start, cancel: () => end(false, "Contract cancelled"),
    update(dt, time) {
      if (!C) return;
      const p = api.state; if (!p || !p.started) return;
      if (p.wreck > 0) { end(false, "The car was wrecked. Contract failed"); return; }
      C.t += dt; const def = C.def, left = def.limit - C.t;
      if (left <= 0) { end(false, "Out of time. Contract failed"); return; }
      beacon.material.opacity = .1 + .06 * Math.sin(time * 4);
      const sp = Math.hypot(p.vel.x, p.vel.z);
      if (def.id === "express" || def.id === "hot") {
        if (C.stage === 0 && Math.hypot(p.x - C.a.x, p.z - C.a.z) < 14 && sp < 4 && p.mode === "drive") {
          C.stage = 1; sound.pop(); show(C.pad.x, C.pad.z, "🛬 Rooftop drop", true, C.pad.y);
          C.msg = "Fly to the rooftop helipad (beam) and land on it";
          if (def.id === "hot") { police.wanted && police.wanted(3, "Hot cargo! The police are on to you"); C.msg = "Wanted! Fly the cargo to the rooftop helipad"; }
          api.say(def.id === "hot" ? "🔥 Cargo loaded. ★★★ Get to the roof!" : "📦 Parcel loaded. Press F to fly to the roof", 3);
        }
        if (C.stage === 1 && onPad(p, C.pad) && sp < 3) { end(true); return; }
      }
      if (def.id === "takedown") {
        const a = C.car;
        // run from the player: pick a far crossing, steer there along the streets, pick a new one when close
        if (Math.hypot(a.x - C.goal.x, a.z - C.goal.z) < 40) C.goal = streetPoint({ x: a.x * 2 - p.x, z: a.z * 2 - p.z }, 0, 700);
        const wp = D.waypoint(a, C.goal.x, C.goal.z), dist = Math.hypot(p.x - a.x, p.z - a.z);
        const flee = 30 + Math.min(14, Math.max(0, 80 - dist) * .25) - C.hits * 2.5;
        D.step(a, wp[0], wp[1], flee, dt);
        if (a.stuck > 1.5) { const s = streetPoint(a, 0, 120); a.x = s.x; a.z = s.z; a.stuck = 0; }
        thief.position.set(a.x, 0, a.z); thief.rotation.y = -a.yaw; thief.flash.visible = Math.sin(time * 18) > 0;
        C.hitT -= dt;
        if (dist < 4.2 && p.y < 2 && C.hitT <= 0) {
          const rel = Math.hypot(p.vel.x - Math.cos(a.yaw) * a.v, p.vel.z - Math.sin(a.yaw) * a.v);
          if (rel > 5) { C.hits++; C.hitT = 1; a.v *= .4; a.yaw += (Math.random() - .5) * .8; sound.crash(); api.impact && api.impact(a.x, a.z, rel); p.shake = 1; api.say(C.hits >= 4 ? "Busted! The getaway car gives up" : `Hit ${C.hits}/4`, 1.6); if (C.hits >= 4) { end(true); return; } }
          else { const dx = p.x - a.x, dz = p.z - a.z; p.x += dx / dist * (4.2 - dist); p.z += dz / dist * (4.2 - dist); }
        }
        if (dist > 650) { end(false, "The getaway car escaped"); return; }
        C.msg = `Ram it: ${C.hits}/4 hits · ${Math.round(dist)} m away`;
      }
      if (def.id === "skychase") {
        // a figure-eight round the towers that drifts slowly across the city
        C.a0 += dt * .22; const r = 180, d = C.dr;
        const tx = C.cx + Math.sin(C.a0) * r, tz = C.cz + Math.sin(C.a0 * 2) * r * .6, ty = 70 + Math.sin(C.a0 * 1.7) * 30;
        d.x += (tx - d.x) * clamp(dt * 1.5); d.z += (tz - d.z) * clamp(dt * 1.5); d.y += (ty - d.y) * clamp(dt * 1.2);
        drone.position.set(d.x, d.y, d.z); drone.rotation.y = -C.a0 * 3; drone.rotation.z = Math.sin(time * 2) * .1;
        const dist = Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z);
        if (dist < 45 && p.mode === "air") { C.close += dt; if (Math.floor(C.close) !== Math.floor(C.close - dt)) sound.pop(); }
        if (C.close >= 20) { end(true); return; }
        C.msg = p.mode !== "air" ? "Take off (F) and chase the drone" : `${dist < 45 ? "Locked on" : "Get closer"} · ${C.close.toFixed(1)}/20 s · ${Math.round(dist)} m`;
      }
      $("gCon").textContent = `${def.icon} ${C.msg} · ${fmt(Math.max(0, left))}`;
    },
  };
}
