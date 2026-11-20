// New Legion: the layer on top of the game that makes the first minute click and keeps every minute after it
// worth playing. Three keys to start and the neon launch ramp, key hints that turn up when you need them, the GPS
// beam and arrow, drift trails, the sonic boom and the cloud deck, smashable street props, smoke and fireballs when
// traffic falls out of the sky, score pops, and the city's light columns only where they help.
import * as THREE from "three";
import { RAMP_X, LZ } from "./world.js";

export function createLegion(o) {
  const { W, game, sound, store, life, COARSE } = o, scene = W.scene, city = W.city, fx = W.fx, $ = id => document.getElementById(id);
  const add = m => { scene.add(m); return m; };
  const puff = (x, y, z, vx, vy, vz, col, size, life = 1) => { const pf = fx.puffs[fx.puffI++ % fx.puffs.length]; pf.s.position.set(x, y, z); pf.life = life; pf.s.visible = true; pf.s.scale.setScalar(size); pf.grow = size; pf.s.material.color.set(col); pf.v.set(vx, vy, vz); };
  const rnd = () => Math.random() - .5;

  // ---- score pops: the big moments get a word in the middle of the screen ----
  const popEl = $("gPop"); let popAt = 0;
  function pop(text, cls = "") { if (!popEl || performance.now() - popAt < 220) return; popAt = performance.now(); popEl.className = "g-pop"; popEl.textContent = text; void popEl.offsetWidth; popEl.className = "g-pop on " + cls; }
  function onScore(why, pts) {
    if (/^NEAR MISS/.test(why)) pop(`${why}  +$${pts}`);
    else if (/SONIC BOOM/.test(why)) pop(`💥 SONIC BOOM  +$${pts}`, "hot");
    else if (/SKY CHAIN/.test(why)) pop(`⚡ SKY CHAIN  +$${pts.toLocaleString()}`, "gold");
    else if (/^⚡ Sky boost/.test(why)) pop(why);
    else if (/^Drift ×/.test(why)) pop(`${why.toUpperCase()}  +$${pts.toLocaleString()}`, "hot");
    else if (/^Full loop|^Landed at|^Butter landing|Above the clouds/.test(why)) pop(why.toUpperCase(), "gold");
  }

  // ---- light columns (race starts, VOID Motors, helipad beacons): only near enough to matter, never right on top of you,
  // and the tall helipad beacons only while you fly. A render layer is switched, so the modules' own show/hide still works ----
  const columns = [];
  scene.traverse(m => { const P = m.isMesh && m.geometry.type === "CylinderGeometry" && m.geometry.parameters; if (!P || !P.openEnded || ![260, 80, 60, 34].includes(P.height)) return; m.updateMatrixWorld(); columns.push({ m, sky: P.height === 260, far: P.height === 80 ? 700 : 350, p: new THREE.Vector3().setFromMatrixPosition(m.matrixWorld) }); });
  let colT = 0;
  function columnsUpdate(dt, cam, air) {
    if ((colT -= dt) > 0) return; colT = .25;
    for (const c of columns) { if (c.m.parent !== scene) c.p.setFromMatrixPosition(c.m.matrixWorld); const d = c.p.distanceTo(cam); c.m.layers.set((c.sky ? air && d < 2500 : d > 28 && d < c.far) ? 0 : 30); }
  }

  // ---- traffic in the sky: a smoke trail on the way down, a fireball where it lands (or where two collide) ----
  life.onSmoke = (x, y, z) => puff(x, y, z, rnd(), 1 + Math.random(), rnd(), 0x2b2b2b, 1.3, 1.3);
  life.onBoom = (x, z, power, y = 0) => {
    for (let k = 0; k < 36; k++) puff(x + rnd() * 3, y + 1 + Math.random() * 2, z + rnd() * 3, rnd() * 16, 3 + Math.random() * 12, rnd() * 16, k % 3 ? 0xff7a1a : k % 2 ? 0xffd23d : 0x222222, 1.6 + Math.random(), 1.4);
    const s = game.state; if (!s) return; const d = Math.hypot(x - s.x, z - s.z);
    if (d < 420) { sound.crash(); if (d < 140) s.shake = Math.min(1, (s.shake || 0) + .5 * (1 - d / 140)); }
  };

  // ---- the GPS: a light column on the destination and a floating arrow just ahead of the car pointing the way ----
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dfcff).multiplyScalar(1.5), transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 420, 18, 1, true).translate(0, 210, 0), beamMat)), pad = add(new THREE.Mesh(new THREE.RingGeometry(5, 6.4, 40).rotateX(-Math.PI / 2), beamMat));
  const chevGeo = new THREE.ShapeGeometry(new THREE.Shape([[0, 1.1], [1, -.45], [.5, -.45], [0, .25], [-.5, -.45], [-1, -.45]].map(([x, y]) => new THREE.Vector2(x, y)))).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
  const chev = add(new THREE.Mesh(chevGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dfcff).multiplyScalar(1.8), transparent: true, opacity: .9, toneMapped: false, side: THREE.DoubleSide, depthWrite: false })));
  beam.visible = pad.visible = chev.visible = false;
  function gpsUpdate(time, s) {
    const R = o.races && o.races(), race = R && R.race && R.race.next, nav = o.nav && o.nav(), dest = nav && nav.dest, pts = nav ? nav.pts : [];
    let tx = null, tz = null;
    if (race) { tx = race[0]; tz = race[2]; }
    else if (dest) {
      tx = dest.x; tz = dest.z;
      if (pts.length > 1) { let best = 0, bd = 1e9; pts.forEach(([x, z], i) => { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = i; } }); for (let i = best; i < pts.length; i++) { const [x, z] = pts[i]; if (Math.hypot(x - s.x, z - s.z) > 25) { tx = x; tz = z; break; } } }
    }
    beam.visible = pad.visible = !!dest && Math.hypot(dest.x - s.x, dest.z - s.z) > 12;
    if (beam.visible) { const gy = Math.max(0, dest.y || 0); beam.position.set(dest.x, gy, dest.z); pad.position.set(dest.x, gy + .15, dest.z); pad.scale.setScalar(1 + .12 * Math.sin(time * 4)); beamMat.opacity = .13 + .07 * Math.sin(time * 3); }
    chev.visible = tx != null && s.veh !== "foot" && Math.hypot(tx - s.x, tz - s.z) > 14;
    if (chev.visible) { const f = s.veh === "board" ? 4 : 7; chev.position.set(s.x + Math.cos(s.yaw) * f, s.y + 2.3 + Math.sin(time * 5) * .12, s.z + Math.sin(s.yaw) * f); chev.rotation.y = -Math.atan2(tz - s.z, tx - s.x); }
  }

  // ---- drift trails: two neon ribbons from the rear tyres while the car slides, fading over four seconds ----
  const TQ = 320, tPos = new Float32Array(TQ * 18), tCol = new Float32Array(TQ * 18), tAge = new Float32Array(TQ).fill(99), tBase = new Float32Array(TQ * 3);
  const tGeo = new THREE.BufferGeometry(); tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage)); tGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage));
  const trail = add(new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));
  trail.frustumCulled = false; let tq = 0, tLive = 0; const lastW = [null, null];
  function trailsUpdate(dt, s, S) {
    const on = S.slip > .35 && s.mode === "drive" && s.veh === "car" && s.y < .5, fx0 = Math.cos(s.yaw), fz0 = Math.sin(s.yaw), col = o.trailColor ? o.trailColor() : [1, .2, .85];
    for (let w = 0; w < 2; w++) {
      const sd = w ? .8 : -.8, x = s.x - fx0 * 1.35 - fz0 * sd, z = s.z - fz0 * 1.35 + fx0 * sd;
      if (!on) { lastW[w] = null; continue; }
      if (Math.random() < .35) puff(x, .3, z, rnd(), .8, rnd(), 0xd8d8dc, .5, .9);
      const L = lastW[w]; if (L && Math.hypot(x - L[0], z - L[1]) < .45) continue;
      if (L && Math.hypot(x - L[0], z - L[1]) < 6) {
        const dx = x - L[0], dz = z - L[1], len = Math.hypot(dx, dz), nx = -dz / len * .16, nz = dx / len * .16, q = tq++ % TQ;
        tPos.set([L[0] + nx, .05, L[1] + nz, L[0] - nx, .05, L[1] - nz, x - nx, .05, z - nz, L[0] + nx, .05, L[1] + nz, x - nx, .05, z - nz, x + nx, .05, z + nz], q * 18);
        tAge[q] = 0; tBase.set(col, q * 3); tLive = 4.2;
      }
      lastW[w] = [x, z];
    }
    if (tLive <= 0) return; tLive -= dt;
    for (let q = 0; q < TQ; q++) {
      if (tAge[q] > 4) { if (tAge[q] < 90) { tAge[q] = 99; tCol.fill(0, q * 18, q * 18 + 18); } continue; }
      tAge[q] += dt; const k = Math.max(0, 1 - tAge[q] / 4) * .9;
      for (let i = 0; i < 6; i++) { const b = q * 18 + i * 3; tCol[b] = tBase[q * 3] * k; tCol[b + 1] = tBase[q * 3 + 1] * k; tCol[b + 2] = tBase[q * 3 + 2] * k; }
    }
    tGeo.attributes.position.needsUpdate = tGeo.attributes.color.needsUpdate = true;
  }

  // ---- the sonic boom (a shockwave ring round the car) and the cloud deck high over the city ----
  const shockMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const shock = add(new THREE.Mesh(new THREE.RingGeometry(.86, 1, 56), shockMat)); shock.visible = false; let shockT = 0;
  const cloudTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(.5, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const NCL = COARSE ? 260 : 620, cp = new Float32Array(NCL * 3);
  for (let i = 0; i < NCL; i++) cp.set([-1600 + Math.random() * 4400, 405 + Math.random() * 55, -1300 + Math.random() * 3800], i * 3);
  const cGeo = new THREE.BufferGeometry(); cGeo.setAttribute("position", new THREE.BufferAttribute(cp, 3));
  const cloudMat = new THREE.PointsMaterial({ map: cloudTex, size: 150, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, color: 0xe4eaf4, fog: false });
  const clouds = add(new THREE.Points(cGeo, cloudMat)); clouds.frustumCulled = false; let aboveDone = false;

  // ---- smashable street props: lamps, hydrants, bins, benches, cones and barriers fly off the car (no speed lost) ----
  const DEB = { lamp: [new THREE.CylinderGeometry(.1, .14, 8, 6), 0x22252b, 4], hydrant: [new THREE.CylinderGeometry(.22, .26, .8, 8), 0xc8202a, .4], bin: [new THREE.CylinderGeometry(.35, .3, 1, 8), 0x2d4a2d, .5],
    bench: [new THREE.BoxGeometry(1.8, .5, .6), 0x4a3a2a, .3], cone: [new THREE.ConeGeometry(.24, .72, 10), 0xff5a12, .36], barrier: [new THREE.BoxGeometry(.12, .5, 2.4), 0xe8e8e8, .5] };
  const debMat = {}; for (const k in DEB) debMat[k] = new THREE.MeshStandardMaterial({ color: DEB[k][1], roughness: .6 });
  const debris = [], downs = []; let smashN = 0, smashCash = 0, smashT = 0;
  function props(x, z, y, vel) {
    const sp = Math.hypot(vel.x, vel.z); if (y > 4 || sp < 4 || !city.props) return;
    for (const q of city.props.near(x, z, 1.7)) {
      city.props.hide(q); downs.push({ q, t: 50 });
      const [geo, , hh] = DEB[q.kind] || DEB.bin;
      let d = debris.find(e => !e.m.visible && e.kind === q.kind);
      if (!d && debris.length >= 36) d = debris.find(e => e.kind === q.kind);
      if (!d) { d = { m: add(new THREE.Mesh(geo, debMat[q.kind] || debMat.bin)), kind: q.kind, v: new THREE.Vector3(), w: new THREE.Vector3() }; d.m.castShadow = true; debris.push(d); }
      d.m.visible = true; d.m.scale.setScalar(1); d.t = 7; d.hh = hh; d.m.position.set(q.x, hh, q.z); d.m.rotation.set(0, Math.random() * 6, 0);
      d.v.set(vel.x * .9 + rnd() * 4, 3 + sp * .18 + Math.random() * 3, vel.z * .9 + rnd() * 4); d.w.set(rnd() * 10, rnd() * 6, rnd() * 10);
      for (let k = 0; k < 5; k++) puff(q.x, .6, q.z, rnd() * 6, 1 + Math.random() * 3, rnd() * 6, q.kind === "lamp" ? 0xffd27a : 0xb0b0b0, .25, .5);
      smashN++; smashCash += q.kind === "lamp" ? 40 : q.kind === "barrier" ? 25 : 15; smashT = .7; sound.thud && sound.thud(.45);
    }
  }
  function debrisUpdate(dt, cam) {
    for (const d of debris) if (d.m.visible) {
      d.t -= dt; d.v.y -= 9.81 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      if (d.m.position.y < d.hh * .35) { d.m.position.y = d.hh * .35; d.v.y = Math.abs(d.v.y) * .3; d.v.x *= .6; d.v.z *= .6; d.w.multiplyScalar(.6); }
      if (d.t < 1) d.m.scale.setScalar(Math.max(.01, d.t)); if (d.t <= 0) d.m.visible = false;
    }
    for (let i = downs.length - 1; i >= 0; i--) { const D = downs[i]; if ((D.t -= dt) <= 0 && Math.hypot(D.q.x - cam.x, D.q.z - cam.z) > 80) { city.props.restore(D.q); downs.splice(i, 1); } }
    if (smashT > 0 && (smashT -= dt) <= 0 && smashN) { game.api.addScore(smashCash, smashN > 1 ? `Smashed ${smashN} props` : "Smashed a prop"); smashN = smashCash = 0; }
  }

  // ---- the first minute: the neon launch ramp ahead of the spawn (a ring over the jump and chevrons leading in) ----
  {
    const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(2.2), toneMapped: false });
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(9, .7, 10, 44), neon)); ring.position.set(RAMP_X + 46, 20, LZ); ring.rotation.y = Math.PI / 2;
    game.RINGS.push({ m: ring, x: RAMP_X + 46, y: 20, z: LZ, nx: 1, nz: 0, done: 0, side: 0 });
    const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const x of [RAMP_X - 70, RAMP_X - 45, RAMP_X - 20]) { const c = add(new THREE.Mesh(chevGeo, chevMat)); c.scale.setScalar(1.6); c.position.set(x, .07, LZ); }
  }

  // ---- key hints: each turns up once, the first time it's useful (the start screen only shows WASD, Shift and F) ----
  const seen = new Set(store.get("void.hints") || []), hintEl = $("gKeyHint"); let hintOn = null, hintT = 0, chk = 0, played = 0, stillT = 0, stuckT = 0, flyT = 0;
  const K = k => COARSE ? "" : `<kbd>${k}</kbd>`;
  function hint(id, html, t = 7) { if (seen.has(id) || hintOn || !hintEl) return; seen.add(id); store.set("void.hints", [...seen]); hintOn = id; hintT = t; hintEl.innerHTML = html; hintEl.hidden = false; sound.pop && sound.pop(); }
  const railDist = (x, z) => { let best = 1e9; for (const r of game.RAILS) { const a = Math.max(0, Math.min(r.len, (x - r.x) * r.c + (z - r.z) * r.s)); best = Math.min(best, Math.hypot(x - (r.x + r.c * a), z - (r.z + r.s * a))); } return best; };
  function hints(dt, s, S) {
    if (hintOn && (hintT -= dt) <= 0) { hintOn = null; hintEl.hidden = true; }
    played += dt; const sp = Math.hypot(s.vel.x, s.vel.z);
    stillT = s.veh === "car" && sp < 1 ? stillT + dt : 0;
    stuckT = s.veh === "car" && sp < 1.5 && s.brakeIn === 0 && S.load > .5 ? stuckT + dt : 0;
    flyT = s.mode === "air" && s.veh === "car" ? flyT + dt : 0;
    if (s.mode === "air" && s.veh === "car" && s.hover && !store.get("void.flew")) store.set("void.flew", 1);
    // the launch ramp: until you've flown once
    if (!store.get("void.flew") && s.mode === "drive" && s.veh === "car" && Math.cos(s.yaw) > .7 && s.x > RAMP_X - 160 && s.x < RAMP_X && Math.abs(s.z - LZ) < 10) game.api.say(COARSE ? "🚀 Hit the ramp, then tap Fly in mid-air!" : "🚀 Hit the ramp & press F in mid-air to fly!", .6);
    if ((chk -= dt) > 0) return; chk = .5;
    if (flyT > 5) hint("land", `${K("L")} Land: the car glides down and touches down softly${COARSE ? " (tap Land)" : ""}`);
    if (S.nitroFull && played > 40) hint("od", `Tap ${K("Shift")} for a kick · hold it from full for ⚡ OVERDRIVE`);
    if (stuckT > 2.5) hint("reset", `${K("R")} Stuck? Back on your wheels right here${COARSE ? " (↺)" : ""}`);
    if ((s.veh === "foot" || sp < 9) && railDist(s.x, s.z) < 35) hint("board", COARSE ? "🛹 Hoverboard (Menu ☰ → Vehicle): grind these rails" : `${K("Y")} Hoverboard: grind these rails, ollie with Space`);
    if (played > 50 && stillT > 4) hint("foot", COARSE ? "🚶 Get out and walk · take any car" : `${K("E")} Get out and walk · take any car`);
    if (o.dealer && o.dealer() && o.dealer().sites.some(st => Math.hypot(st.x - s.x, st.z - s.z) < 45)) hint("garage", `${K("G")} VOID Motors: your garage, every car is yours`);
    if (played > 120 && stillT > 3 && Math.abs(s.x) < 1000 && s.z > -700 && s.z < 2100) hint("taxi", COARSE ? "🚕 Taxi jobs (Menu ☰): passengers pay cash" : `${K("J")} Taxi jobs: passengers pay cash`);
    if (played > 90) hint("radio", COARSE ? "📻 Change the station: Menu ☰ → Radio" : `${K("U")} Change the radio station`);
    if (played > 360) hint("route", COARSE ? "🏁 Build your own race (Menu ☰ → Routes)" : `${K("B")} Build your own race route and race your ghost`);
  }
  addEventListener("keydown", e => { if (e.code === "KeyU" && !e.repeat && game.api.active() && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) o.radioNext && o.radioNext(); });

  let odWas = false;
  return {
    props, pop, onScore,
    update(dt, time, S, cam) {
      const s = game.state; if (!s || !s.started) { columnsUpdate(dt, cam, false); return; }
      columnsUpdate(dt, cam, s.mode === "air");
      gpsUpdate(time, s); trailsUpdate(dt, s, S); debrisUpdate(dt, cam); hints(dt, s, S);
      const nos = $("gNos"); if (nos) { nos.classList.toggle("od", !!S.od); nos.classList.toggle("full", !!S.nitroFull && !S.od); }
      if (S.od && !odWas) pop("⚡ OVERDRIVE", "hot"); odWas = !!S.od;
      // the shockwave: a ring that bursts out across the flight path
      if (S.sonic > .95 && shockT <= 0) { shockT = .9; shock.position.copy(S.pos); shock.lookAt(S.pos.x + s.vel.x, S.pos.y + s.vel.y, S.pos.z + s.vel.z); shock.visible = true; for (let k = 0; k < 16; k++) puff(S.pos.x, S.pos.y, S.pos.z, rnd() * 30, rnd() * 30, rnd() * 30, 0xffffff, .8, .6); }
      if (shockT > 0) { shockT -= dt; const k = 1 - shockT / .9; shock.scale.setScalar(3 + k * 80); shockMat.opacity = (1 - k) * .55; if (shockT <= 0) shock.visible = false; }
      // the cloud deck fades in as you climb; above it pays once a flight
      cloudMat.opacity = Math.max(0, Math.min(1, (cam.y - 140) / 160)) * (W.timeOfDay === "night" ? .32 : .6);
      clouds.visible = cloudMat.opacity > .01;
      if (s.mode === "air" && s.y > 470 && !aboveDone) { aboveDone = true; game.api.addScore(300, "☁️ Above the clouds"); }
      if (s.mode !== "air") aboveDone = false;
    },
  };
}
