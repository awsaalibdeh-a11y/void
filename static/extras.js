// Taxi jobs and hidden coins.
//  Taxi: press J (or Menu → Taxi job). Passengers wave from the kerb near you; stop next to one and they hop in,
//  the GPS shows where they're going, and the fare drops the longer you take. Back-to-back fares build a streak.
//  Coins: 40 spinning VOID coins hidden on rooftops, piers, the bridge towers and round the park; found ones stay found.
import * as THREE from "three";
import { GRID } from "./city.js";

const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const ord = n => n + (n % 100 > 10 && n % 100 < 14 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

export function createExtras(W, api, nav, sound) {
  const { scene } = W, $ = id => document.getElementById(id);
  let sd = 77; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;

  // ---- passengers: a little figure with a yellow beacon ----
  const personMat = new THREE.MeshStandardMaterial({ color: 0x3060c0, roughness: .7 }), skin = new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: .7 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(1.8), transparent: true, opacity: .35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fig = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 1.2, 10).translate(0, .9, 0), personMat); const h = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 8).translate(0, 1.7, 0), skin); const arm = new THREE.Mesh(new THREE.BoxGeometry(.1, .6, .1).translate(0, .3, 0), personMat); arm.position.set(0, 1.35, .3); arm.rotation.x = -2.6; g.add(b, h, arm); const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 30, 16, 1, true).translate(0, 15, 0), beaconMat); g.add(beam); g.userData.arm = arm; scene.add(g); return g; };
  const waiting = [fig(), fig(), fig()], dropMark = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 40, 24, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff8a).multiplyScalar(1.6), transparent: true, opacity: .22, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  scene.add(dropMark); dropMark.visible = false; waiting.forEach(w => w.visible = false);
  const kerb = (x0, z0, rMin, rMax) => {          // a sidewalk spot rMin..rMax metres away
    for (let t = 0; t < 40; t++) {
      const a = rnd() * 6.28, r = rMin + rnd() * (rMax - rMin); let x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      const i = Math.round((x - GRID.X0) / GRID.AV), j = Math.round((z - GRID.Z0) / GRID.ST);
      if (i < 0 || i >= GRID.NX || j < 0 || j >= GRID.NZ) continue;
      if (rnd() < .5) x = GRID.ax(i) + (GRID.avW(i) / 2 + 2) * (rnd() < .5 ? 1 : -1); else z = GRID.sz(j) + (GRID.stW(j) / 2 + 2) * (rnd() < .5 ? 1 : -1);
      if (api.hitBox(x, z, .5, 1.2) || api.isWater(x, z)) continue;
      return [x, z];
    }
    return null;
  };
  const J = { on: false, fare: null, streak: 0, t: 0, earned: 0 };
  function placeWaiting(p) { for (const w of waiting) { const s = kerb(p.x, p.z, 60, 260); if (s) { w.position.set(s[0], 0, s[1]); w.visible = true; } } }
  function toggle(on = !J.on) {
    const p = api.state; if (!p) return;
    J.on = on; J.fare = null; dropMark.visible = false;
    if (on) { placeWaiting(p); api.say("🚕 Taxi: pick up a passenger (yellow beams). J to stop", 4); }
    else { waiting.forEach(w => w.visible = false); if (nav.dest && nav.dest.taxi) nav.setDest(null); api.say(J.earned ? `🚕 Shift over: $${J.earned} earned` : "🚕 Taxi off", 3); J.earned = 0; J.streak = 0; }
    $("gJob").hidden = !on;
  }
  addEventListener("keydown", e => { if (e.code === "KeyJ" && api.active() && !e.repeat) toggle(); });

  // ---- coins ----
  const COINS = [], got = new Set(store.get("void.coins") || []);
  {
    const spots = [];
    for (const h of W.city.helipads.slice(0, 8)) spots.push([h.x + 4, h.y + 1.5, h.z]);
    const roofs = W.buildings.filter(b => b.h > 12 && b.h < 60 && b.hw > 4).sort(() => rnd() - .5).slice(0, 14);
    for (const b of roofs) spots.push([b.x, b.h + 1.5, b.z]);
    for (const [x, y, z] of [[1210, 112, 15], [1570, 112, -15], [-1080, 1.5, -700 + 140 * 2], [-1080, 1.5, -700 + 140 * 7], [W.city.lake.x, 1.5, W.city.lake.z + W.city.lake.rz + 8], [W.city.lawn.x, 1.5, W.city.lawn.z], [-2600, 1.5, 0], [1900, 1.5, 0], [134, 6, 4.2], [16, 18.5, 2]]) spots.push([x, y, z]);
    while (spots.length < 40) { const s = kerb(rnd() * 1800 - 900, rnd() * 1300 - 650, 0, 40); if (s) spots.push([s[0], 1.5, s[1]]); }
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 1, roughness: .2, emissive: 0x6a4a00, emissiveIntensity: .6 });
    const geo = new THREE.CylinderGeometry(.8, .8, .14, 28).rotateX(Math.PI / 2);
    const vTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#ffc23d"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#7a5200"; g.font = "900 44px sans-serif"; g.textAlign = "center"; g.fillText("V", 32, 48); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const face = new THREE.MeshStandardMaterial({ map: vTex, metalness: .8, roughness: .3, emissive: 0x6a4a00, emissiveIntensity: .5 });
    spots.slice(0, 40).forEach(([x, y, z], k) => {
      const m = new THREE.Mesh(geo, [gold, face, face]); m.position.set(x, y, z); scene.add(m);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc23d).multiplyScalar(1.4), transparent: true, opacity: .12, depthWrite: false, toneMapped: false })); m.add(glow);
      COINS.push({ id: k, m, x, y, z }); if (got.has(k)) m.visible = false;
    });
  }

  // ---- boost pads: glowing chevrons on the avenues that kick you forward ----
  const PADS = [];
  {
    const tex = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 128; const g = c.getContext("2d"); g.clearRect(0, 0, 64, 128); g.strokeStyle = "#3df5ff"; g.lineWidth = 9; g.lineCap = "round"; for (const y of [30, 70, 110]) { g.beginPath(); g.moveTo(10, y); g.lineTo(32, y - 22); g.lineTo(54, y); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.8, 1.8, 1.8), polygonOffset: true, polygonOffsetFactor: -4 });
    for (let k = 0; k < 14; k++) {
      const axis = rnd() < .5, i = 1 + Math.floor(rnd() * (GRID.NX - 2)), j = 1 + Math.floor(rnd() * (GRID.NZ - 2));
      const x = axis ? GRID.ax(i) + 4.5 : GRID.ax(i) + 60 + rnd() * 40, z = axis ? GRID.sz(j) + 25 + rnd() * 20 : GRID.sz(j) + 3, yaw = axis ? (rnd() < .5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < .5 ? 0 : Math.PI);
      if (api.isWater(x, z) || api.hitBox(x, z, .5, 2)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 8).rotateX(-Math.PI / 2), mat); m.position.set(x, .07, z); m.rotation.y = -yaw + Math.PI / 2; scene.add(m);
      PADS.push({ x, z, yaw, t: 0 });
    }
  }
  // ---- speed cameras: drive past and your speed is recorded; beat your best for points ----
  const TRAPS = [], best = store.get("void.traps") || {};
  {
    const flashM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(4), toneMapped: false, transparent: true, opacity: 0 }), pole = new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: .5, roughness: .4 }), boxM = new THREE.MeshStandardMaterial({ color: 0xf7c414, roughness: .5 });
    const spots = [[GRID.ax(9), GRID.sz(3), "Midtown"], [GRID.ax(3), GRID.sz(15), "Park Ave"], [GRID.ax(11), GRID.sz(17), "Downtown"], [600, 0, "Broadway"], [GRID.ax(1), GRID.sz(6), "West Side"], [1400, 18, "Bridge"]];
    spots.forEach(([x, z, name]) => {
      const g = new THREE.Group(); g.position.set(x + 11, 0, z + 9); scene.add(g);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 5, 8).translate(0, 2.5, 0), pole)); const b = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .5), boxM); b.position.y = 5; g.add(b);
      const f = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), flashM.clone()); f.position.set(-.45, 5, 0); g.add(f);
      TRAPS.push({ x, z, name, f, cool: 0 });
    });
  }
  // ---- sky traffic: an airliner crossing high up, a slow blimp with a glowing VOID sign ----
  const plane = new THREE.Group(), blimp = new THREE.Group();
  {
    const w = new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: .4, metalness: .3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 34, 14).rotateZ(Math.PI / 2), w); plane.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(6, .3, 36), w); wing.position.x = 1; plane.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 6, .3), w); tail.position.set(-15, 3, 0); plane.add(tail);
    for (const [z, c] of [[18, 0x22ff66], [-18, 0xff2233]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: false })); l.position.set(1, 0, z); plane.add(l); }
    scene.add(plane);
    const env = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: .5, metalness: .2 })); env.scale.set(3.4, 1, 1); blimp.add(env);
    const signT = (() => { const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 512, 128); g.fillStyle = "#ff2a3a"; g.shadowColor = "#ff2a3a"; g.shadowBlur = 20; g.font = "900 86px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText("VOID", 256, 100); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshBasicMaterial({ map: signT, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) })); p.position.z = s * 8.1; p.rotation.y = s > 0 ? 0 : Math.PI; blimp.add(p); }
    const gond = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 3), new THREE.MeshStandardMaterial({ color: 0x3a3b40 })); gond.position.y = -8.5; blimp.add(gond);
    scene.add(blimp);
  }
  let skyT = 0;

  return {
    toggle, pads: PADS, get job() { return J; }, coins: () => ({ got: got.size, total: COINS.length }),
    sky(dt, time) {
      skyT += dt;
      const a = (skyT * .012) % (Math.PI * 2); plane.position.set(Math.cos(a) * 2600, 620, Math.sin(a) * 1600); plane.rotation.y = -Math.atan2(Math.cos(a) * 1600, -Math.sin(a) * 2600);
      const b = (skyT * .004) % (Math.PI * 2); blimp.position.set(-200 + Math.cos(b) * 700, 230, -300 + Math.sin(b) * 500); blimp.rotation.y = -Math.atan2(Math.cos(b) * 500, -Math.sin(b) * 700);
    },
    boosts(dt) {
      const p = api.state; if (!p || p.mode !== "drive" || p.y > 1) return;
      for (const b of PADS) {
        if (b.t > 0) { b.t -= dt; continue; }
        if (Math.abs(p.x - b.x) < 2.6 && Math.abs(p.z - b.z) < 4.6) {
          b.t = 1.5; const sp = Math.hypot(p.vel.x, p.vel.z) + 18; p.vel.set(Math.cos(p.yaw) * sp, 0, Math.sin(p.yaw) * sp); api.say("⚡ BOOST", 1.2); sound.whoosh && sound.whoosh();
        }
      }
      for (const t of TRAPS) {
        t.f.material.opacity = Math.max(0, t.f.material.opacity - dt * 3);
        if (t.cool > 0) { t.cool -= dt; continue; }
        if (Math.hypot(p.x - t.x, p.z - t.z) < 14) {
          const kmh = Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6); if (kmh < 60) continue;
          t.cool = 4; t.f.material.opacity = 1;
          if (kmh > (best[t.name] || 0)) { best[t.name] = kmh; store.set("void.traps", best); api.addScore(Math.round(kmh * 2), `📸 ${t.name} speed camera: ${kmh} km/h (new best)`); }
          else api.say(`📸 ${t.name}: ${kmh} km/h (best ${best[t.name]})`, 2.5);
        }
      }
    },
    update(dt, time) {
      const p = api.state; if (!p || !p.started) return;
      this.boosts(dt);
      // coins
      for (const c of COINS) {
        if (!c.m.visible) continue;
        c.m.rotation.y += dt * 2.4; c.m.position.y = c.y + Math.sin(time * 2 + c.id) * .2;
        if (Math.abs(p.x - c.x) < 3 && Math.abs(p.z - c.z) < 3 && Math.abs(p.y + .6 - c.y) < 3.5) {
          c.m.visible = false; got.add(c.id); store.set("void.coins", [...got]); api.addScore(250, `🪙 Coin ${got.size}/${COINS.length}`); sound.win();
        }
      }
      $("gCoins").textContent = `🪙 ${got.size}/${COINS.length}`;
      if (!J.on) return;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      // waving passengers; the nearest one gets in when you stop beside it
      for (const w of waiting) {
        if (!w.visible) continue;
        w.userData.arm.rotation.z = Math.sin(time * 6) * .4;
        if (!J.fare && Math.hypot(p.x - w.position.x, p.z - w.position.z) < 9 && sp < 4 && p.mode === "drive") {
          const d = kerb(w.position.x, w.position.z, 350, 1100); if (!d) continue;
          const dist = Math.hypot(d[0] - w.position.x, d[1] - w.position.z);
          const j = Math.round((d[1] - GRID.Z0) / GRID.ST), street = j === 10 ? "Broadway" : `${ord(Math.abs(j - 10) * 7 + 14)} St`;
          J.fare = { x: d[0], z: d[1], t: dist / 11 + 25, max: 300 + Math.round(dist * .6), street };
          waiting.forEach(o => o.visible = false); dropMark.position.set(d[0], 0, d[1]); dropMark.visible = true;
          nav.setDest({ name: `🚕 ${street}`, x: d[0], z: d[1], taxi: true });
          api.say(`🚕 "Take me to ${street}, quick!"`, 3); sound.pop();
        }
      }
      if (J.fare) {
        const f = J.fare; f.t -= dt;
        const pay = Math.max(50, Math.round(f.max * Math.min(1, .35 + f.t / 40)));
        $("gJob").textContent = `🚕 To ${f.street} · ${fmt(Math.max(0, f.t))} · $${pay}${J.streak > 1 ? ` · streak ×${J.streak}` : ""}`;
        if (Math.hypot(p.x - f.x, p.z - f.z) < 12 && sp < 4) {
          J.streak = f.t > 0 ? J.streak + 1 : 0; const total = pay + (J.streak > 1 ? J.streak * 100 : 0); J.earned += total;
          api.addScore(total, `🚕 Fare $${total}${J.streak > 1 ? ` (streak ×${J.streak})` : ""}`); J.fare = null; dropMark.visible = false; if (nav.dest && nav.dest.taxi) nav.setDest(null); placeWaiting(p);
        } else if (f.t < -20) { api.say("🚕 The passenger gave up and got out", 3); J.fare = null; J.streak = 0; dropMark.visible = false; if (nav.dest && nav.dest.taxi) nav.setDest(null); placeWaiting(p); }
      } else {
        $("gJob").textContent = `🚕 Find a passenger (yellow beams)${J.earned ? ` · $${J.earned} so far` : ""}`;
        if (waiting.every(w => !w.visible || Math.hypot(p.x - w.position.x, p.z - w.position.z) > 600)) placeWaiting(p);
      }
    },
  };
}
