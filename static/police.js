// Police chases: smash traffic or speed past a cop and you get wanted stars. Cruisers spawn out of sight and hunt
// you through the street grid (straight at you when the road is clear, round the blocks when it isn't), ram you,
// and box you in: stop near them for a few seconds and you are busted. Lose them for long enough and the stars
// fall away. From three stars a helicopter joins in with a searchlight and roadblocks go up ahead of you (two cruisers
// and an EMP strip that kills your engine for a moment); at five stars pursuit drones chase you even in the air, firing
// EMP pulses (ram one to bring it down).
// Also: the AI driver that the street racers use.
import * as THREE from "three";
import { GRID } from "./city.js";
import { KINDS, vehicle } from "./npc.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const HEAT = [0, 1, 3, 6, 10, 15];                       // heat needed for each star
const COPS = [0, 2, 3, 4, 6, 8];

// ---- an AI driver: steer at a target, slow for corners, slide off walls, and find its way round blocks ----
export function makeDriver(api) {
  const { ax, sz, AV, ST, X0, Z0, NX, NZ } = GRID;
  const clear = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 8); for (let k = 1; k < n; k++) { const t = k / n; if (api.hitBox(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, .5, 1.6)) return false; } return true; };
  // the next point to aim for on the way to (tx, tz): along the street or avenue we are on, turning at the right corner
  function waypoint(a, tx, tz) {
    if (Math.hypot(tx - a.x, tz - a.z) < 70 || clear(a.x, a.z, tx, tz)) return [tx, tz];
    const j = clamp(Math.round((a.z - Z0) / ST), 0, NZ - 1), i = clamp(Math.round((a.x - X0) / AV), 0, NX - 1);
    const onStreet = Math.abs(a.z - sz(j)) < Math.abs(a.x - ax(i)) * (ST / AV) + 4;
    const ti = clamp(Math.round((tx - X0) / AV), 0, NX - 1), tj = clamp(Math.round((tz - Z0) / ST), 0, NZ - 1);
    if (onStreet) { const x = ax(ti); return Math.abs(a.x - x) > 10 ? [x, sz(j)] : [x, sz(tj)]; }
    const z = sz(tj); return Math.abs(a.z - z) > 10 ? [ax(i), z] : [ax(ti), z];
  }
  function step(a, tx, tz, wantV, dt, rnd = Math.random) {
    const want = Math.atan2(tz - a.z, tx - a.x), d = wrap(want - a.yaw);
    const rate = 2.4 / (1 + a.v / 30) + .5;
    a.yaw += clamp(d, -rate * dt, rate * dt);
    const corner = Math.abs(d) > .5 ? Math.max(12, wantV * (1 - Math.min(.7, Math.abs(d) * .5))) : wantV;
    a.v += clamp(corner - a.v, -22 * dt, (a.accel || 12) * dt);
    const nx = a.x + Math.cos(a.yaw) * a.v * dt, nz = a.z + Math.sin(a.yaw) * a.v * dt, hit = api.hitBox(nx, nz, .5, 1.2);
    if (hit) { a.x = nx + hit.nx * hit.d; a.z = nz + hit.nz * hit.d; a.v *= .7; a.stuck = (a.stuck || 0) + dt; a.yaw += (rnd() - .5) * .4; }
    else { a.x = nx; a.z = nz; a.stuck = Math.max(0, (a.stuck || 0) - dt); }
  }
  return { waypoint, step, clear };
}

export function createPolice(scene, api, sound, life) {
  const D = makeDriver(api), P = KINDS.find(k => k.id === "police"), geo = vehicle(P);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .3, metalness: .5 }), lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .1, .1).multiplyScalar(4), toneMapped: false }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(.15, .3, 1).multiplyScalar(4), toneMapped: false });
  const cops = [], copGlow = new THREE.PointLight(0xff2020, 0, 30, 2); scene.add(copGlow);       // one flashing light, on the nearest cruiser
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group(), body = new THREE.Mesh(geo.body, bodyMat), lights = new THREE.Mesh(geo.lights, lightMat);
    const r = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), red), b = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), blue);
    r.position.set(-.2, 1.82, .32); b.position.set(-.2, 1.82, -.32);
    const glow = { color: new THREE.Color(), intensity: 0 };                 // (the real light is shared: see copGlow)
    body.castShadow = true; g.add(body, lights, r, b); g.visible = false; scene.add(g);
    cops.push({ g, r, b, glow, on: false, x: 0, z: 0, yaw: 0, v: 0, wreck: 0, bump: 0, y: 0, rz: 0 });
  }
  // the helicopter: body, tail, two rotors and a searchlight
  const heli = new THREE.Group();
  {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: .5, roughness: .4 }), w = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), m); body.scale.set(1.6, 1, 1); heli.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(5, .4, .4), m); tail.position.set(-4, .3, 0); heli.add(tail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, .3, 3.25), w); stripe.position.y = -.2; heli.add(stripe);
    for (const z of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(3.4, .12, .12), m); sk.position.set(0, -1.6, z * 1.1); heli.add(sk); }
    heli.rotor = new THREE.Mesh(new THREE.BoxGeometry(11, .06, .4), m); heli.rotor.position.y = 1.4; heli.add(heli.rotor);
    heli.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(.06, 2, .2), m); heli.tailRotor.position.set(-6.4, .5, .3); heli.add(heli.tailRotor);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 60, 24, 1, true).translate(0, -30, 0), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: .08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    heli.beam = beam; heli.add(beam);
    heli.spot = new THREE.SpotLight(0xffffff, 0, 160, .35, .5, 1.2); scene.add(heli.spot, heli.spot.target);       // in the scene, not the helicopter: it never vanishes
    heli.blink = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), red); heli.blink.position.set(-6.3, 1.2, 0); heli.add(heli.blink);
    heli.visible = false; scene.add(heli);
  }
  const H = { on: false, x: 0, y: 80, z: 0, yaw: 0 };
  // ---- roadblocks: two cruisers parked across the road and an EMP strip in front of them ----
  const empMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, .9, 2.6), toneMapped: false, transparent: true, opacity: .85, depthWrite: false });
  const blocks = [0, 1].map(() => {
    const g = new THREE.Group(), strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, .06, 15), empMat); strip.position.set(-9, .06, 0); g.add(strip);
    const bars = [];
    for (const sd of [-1, 1]) {
      const c = new THREE.Group(), body = new THREE.Mesh(geo.body, bodyMat), lights = new THREE.Mesh(geo.lights, lightMat), rr = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), red), bb = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), blue);
      rr.position.set(-.2, 1.82, .32); bb.position.set(-.2, 1.82, -.32); body.castShadow = true; c.add(body, lights, rr, bb); c.position.set(0, 0, sd * 3.2); c.rotation.y = Math.PI / 2 + sd * .3; g.add(c); bars.push([rr, bb]);
    }
    g.visible = false; scene.add(g); return { g, bars, on: false, x: 0, z: 0, yaw: 0, t: 0, hit: false };
  });
  let blockT = 6;
  function placeBlock(B, p) {
    const fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), alongX = Math.abs(fx) > Math.abs(fz);
    let x = p.x + fx * 190, z = p.z + fz * 190;
    if (alongX) { z = GRID.sz(clamp(Math.round((p.z - GRID.Z0) / GRID.ST), 0, GRID.NZ - 1)); } else { x = GRID.ax(clamp(Math.round((p.x - GRID.X0) / GRID.AV), 0, GRID.NX - 1)); }
    if (api.hitBox(x, z, .5, 4) || api.isWater(x, z)) return;
    Object.assign(B, { on: true, x, z, yaw: alongX ? (fx > 0 ? 0 : Math.PI) : (fz > 0 ? Math.PI / 2 : -Math.PI / 2), t: 40, hit: false });
    B.g.position.set(x, 0, z); B.g.rotation.y = -B.yaw; B.g.visible = true; api.say("🚧 Roadblock ahead!", 2);
  }
  // ---- pursuit drones (five stars): four rotors, a red eye, and an EMP pulse when they get close ----
  const droneMat = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: .6, roughness: .35 }), boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, 1.2, 3), toneMapped: false, transparent: true, opacity: .9, depthWrite: false });
  const drones = [0, 1, 2].map(k => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, .35, 1.3), droneMat));
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .04, 14), droneMat); rotor.position.set(x, .22, z); g.add(rotor); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), red); eye.position.set(.7, 0, 0); g.add(eye);
    const tag = new THREE.Mesh(new THREE.BoxGeometry(.2, .12, .6), blue); tag.position.set(-.5, .25, 0); g.add(tag);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1, 6).translate(0, .5, 0), boltMat); bolt.visible = false; scene.add(bolt);
    g.visible = false; scene.add(g); return { g, bolt, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, shotT: 3 + k, boltT: 0, down: 0, ph: k * 2.1 };
  });
  let heat = 0, stars = 0, evade = 0, bust = 0, speedT = 0, cool = 0, peak = 0;            // (peak: the most stars this chase reached)
  const starsOf = h => { let s = 0; for (let k = 1; k < HEAT.length; k++) if (h >= HEAT[k]) s = k; return s; };
  function addHeat(n, why) {
    const before = stars; heat = Math.min(30, heat + n); stars = starsOf(heat); evade = 0; peak = Math.max(peak, stars);
    if (stars > before) api.say(`${"★".repeat(stars)}  ${why}`, 2.5);
  }
  function spawnCop(c, p) {
    // somewhere on the grid 170-260 m away, preferably behind the player
    for (let tries = 0; tries < 30; tries++) {
      const a = p.yaw + Math.PI + (Math.random() - .5) * 2.4, r = 170 + Math.random() * 90;
      let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const i = clamp(Math.round((x - GRID.X0) / GRID.AV), 0, GRID.NX - 1), j = clamp(Math.round((z - GRID.Z0) / GRID.ST), 0, GRID.NZ - 1);
      if (Math.random() < .5) x = GRID.ax(i); else z = GRID.sz(j);
      if (api.hitBox(x, z, .5, 2) || api.isWater(x, z)) continue;
      Object.assign(c, { on: true, x, z, yaw: Math.atan2(p.z - z, p.x - x), v: 20, wreck: 0, bump: 0, y: 0, rz: 0, stuck: 0 }); c.g.visible = true; return;
    }
  }
  function clear(msg) {
    heat = 0; stars = 0; evade = 0; bust = 0; peak = 0;
    for (const c of cops) { c.on = false; c.g.visible = false; }
    H.on = false; heli.visible = false; if (msg) api.say(msg, 3);
    for (const B of blocks) { B.on = false; B.g.visible = false; } for (const d of drones) { d.on = false; d.g.visible = false; d.bolt.visible = false; }
  }
  return {
    get stars() { return stars; }, get bust() { return bust; }, cops, clear,
    wanted(n, why) { if (stars < n) { heat = Math.max(heat, HEAT[n]); addHeat(0, why); } },
    event(kind, extra) {                                   // things the game tells us about
      if (kind === "smash") addHeat(extra === "police" ? 3 : 1, extra === "police" ? "You smashed a police car!" : "Wanted for smashing cars");
      if (kind === "cop") addHeat(3, "Police officer down");
      if (kind === "steal") addHeat(1.2, "Car theft reported");
      if (kind === "ped") addHeat(.6, "Hit and run");
    },
    update(dt, time) {
      const p = api.state; if (!p || !p.started) { copGlow.intensity = 0; return; }
      let glowD = 1e9;
      if (p.wreck > 0) { if (stars) clear(); return; }
      const ps = Math.hypot(p.vel.x, p.vel.z), air = p.mode === "air" && p.y > 6;
      // speeding past a traffic cop
      if ((speedT -= dt) < 0 && ps > 33 && life) for (const c of life.nearCars(p.x, p.z, 30)) if (c.kind.id === "police" && !c.wreck && Math.hypot(c.x - p.x, c.z - p.z) < 28) { addHeat(1, "Speeding past the police"); speedT = 10; break; }
      if (!stars) { for (const c of cops) if (c.on) { c.on = false; c.g.visible = false; } return; }
      // keep the right number of cruisers in the chase
      const want = COPS[stars];
      cops.forEach((c, k) => { if (k < want && !c.on) spawnCop(c, p); if (k >= want && c.on && Math.hypot(c.x - p.x, c.z - p.z) > 220) { c.on = false; c.g.visible = false; } });
      let nearest = 1e9, close = 0;
      const top = 42 + stars * 7;
      for (const c of cops) {
        if (!c.on) continue;
        const flash = Math.sin(time * 18 + c.x) > 0;
        c.r.visible = flash; c.b.visible = !flash; c.glow.color.setHex(flash ? 0xff2020 : 0x2040ff); c.glow.intensity = 30; { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < glowD) { glowD = d; copGlow.position.set(c.x, (c.y || 0) + 2.4, c.z); copGlow.color.setHex(flash ? 0xff2020 : 0x2040ff); } }
        if (c.wreck > 0) {
          c.wreck -= dt; c.v *= Math.pow(.2, dt); c.x += Math.cos(c.yaw) * c.v * dt; c.z += Math.sin(c.yaw) * c.v * dt; c.rz = Math.min(Math.PI * .9, c.rz + dt * 6);
          c.glow.intensity = 0; c.r.visible = c.b.visible = false;
          if (c.wreck <= 0) spawnCop(c, p);
        } else {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          nearest = Math.min(nearest, d); if (d < 10) close++;
          // aim a little ahead of the player, ram from close up
          const lead = Math.min(1.2, d / 60), tx = p.x + p.vel.x * lead, tz = p.z + p.vel.z * lead;
          const [wx, wz] = air ? [tx, tz] : D.waypoint(c, tx, tz);
          D.step(c, wx, wz, d < 25 ? (ps < 6 ? Math.max(0, (d - 6) * .8) : Math.max(ps + 6, 18)) : top, dt);     // pull up beside a stopped car, ram a moving one
          if (c.stuck > 3 && d > 90) spawnCop(c, p);
          // contact with the player
          if (c.bump > 0) c.bump -= dt;
          if (!air && d < 3.6 && p.y < 2.5 && c.bump <= 0) {
            c.bump = .8;
            const cv = c.v, rel = Math.hypot(p.vel.x - Math.cos(c.yaw) * cv, p.vel.z - Math.sin(c.yaw) * cv);
            if (ps > cv + 6 && rel > 10) { c.wreck = 6; c.v = rel * .6; c.yaw = Math.atan2(p.vel.z, p.vel.x); api.addScore(250, "Took out a cruiser"); addHeat(2, "Police officer down"); sound.crash(); }
            else { if (rel > 6) { api.hurt(4 + rel * .55, "Rammed by the police"); api.impact && api.impact((p.x + c.x) / 2, (p.z + c.z) / 2, rel); } p.vel.x = p.vel.x * .4 + Math.cos(c.yaw) * cv * .5; p.vel.z = p.vel.z * .4 + Math.sin(c.yaw) * cv * .5; c.v *= .4; sound.crash(); }
            const nx = (p.x - c.x) / (d || 1), nz = (p.z - c.z) / (d || 1); p.x += nx * (3.6 - d); p.z += nz * (3.6 - d);
          }
        }
        c.g.position.set(c.x, api.terrainH ? api.terrainH(c.x, c.z) : 0, c.z); c.g.rotation.set(c.rz, -c.yaw, 0, "YXZ");
      }
      copGlow.intensity = glowD < 200 ? 30 : 0;
      // the helicopter from three stars
      if (stars >= 3) {
        if (!H.on) { H.on = true; H.x = p.x - 300; H.z = p.z - 300; H.y = 120; heli.visible = true; api.say("Police helicopter overhead", 2.5); }
        const ty = Math.max(p.y + 28, 70), dx = p.x - H.x, dz = p.z - H.z, d = Math.hypot(dx, dz), sp = Math.min(62, d * 1.5);
        H.x += dx / (d || 1) * sp * dt; H.z += dz / (d || 1) * sp * dt; H.y += (ty - H.y) * Math.min(1, dt * .8); H.yaw = Math.atan2(dz, dx);
        heli.position.set(H.x, H.y, H.z); heli.rotation.set(0, -H.yaw, Math.min(.25, sp / 250));
        heli.rotor.rotation.y += dt * 40; heli.tailRotor.rotation.x += dt * 50; heli.blink.visible = Math.sin(time * 6) > 0;
        heli.beam.lookAt(p.x, p.y, p.z); heli.beam.rotateX(-Math.PI / 2); heli.spot.intensity = d < 160 ? 900 : 0; heli.spot.position.set(H.x, H.y - 1.5, H.z); heli.spot.target.position.set(p.x, p.y, p.z); heli.spot.target.updateMatrixWorld();
        if (d < 120) nearest = Math.min(nearest, d * .5);
      } else if (H.on) { H.on = false; heli.visible = false; heli.spot.intensity = 0; }
      // roadblocks from three stars: one goes up ahead of you every so often
      if (stars >= 3 && !air && (blockT -= dt) < 0) { blockT = 18 + Math.random() * 10; const B = blocks.find(b => !b.on); if (B) placeBlock(B, p); }
      for (const B of blocks) {
        if (!B.on) continue;
        const flash = Math.sin(time * 16 + B.x) > 0; for (const [rr, bb] of B.bars) { rr.visible = flash; bb.visible = !flash; }
        const dx = p.x - B.x, dz = p.z - B.z, along = dx * Math.cos(B.yaw) + dz * Math.sin(B.yaw), side = -dx * Math.sin(B.yaw) + dz * Math.cos(B.yaw);
        if (!B.hit && p.mode === "drive" && p.y < 2 && Math.abs(along + 9) < 1.3 && Math.abs(side) < 7.5) { B.hit = true; api.emp && api.emp(1.8); }
        if (p.y < 2.5 && Math.abs(along) < 2.8 && Math.abs(Math.abs(side) - 3.2) < 2.8 && ps > 3) { const rel = ps; api.hurt(4 + rel * .5, "Hit the roadblock"); p.vel.multiplyScalar(-.25); p.x -= Math.cos(B.yaw) * 1.5; p.z -= Math.sin(B.yaw) * 1.5; sound.crash(); api.impact && api.impact(p.x, p.z, rel); }
        if ((B.t -= dt) < 0 || along > 140) { B.on = false; B.g.visible = false; }
        nearest = Math.min(nearest, Math.hypot(dx, dz) + 60);
      }
      // drones at five stars: they find you anywhere, even flying, and fire EMP pulses from close up
      for (const d of drones) {
        d.boltT = Math.max(0, d.boltT - dt); d.bolt.visible = d.boltT > 0;
        if (stars < 5) { if (d.on) { d.on = false; d.g.visible = false; } continue; }
        if (d.down > 0) { d.down -= dt; d.vy -= 9.81 * dt; d.y = Math.max(0, d.y + d.vy * dt); d.g.position.set(d.x, d.y, d.z); d.g.rotation.x += dt * 6; if (d.down <= 0) { d.on = false; d.g.visible = false; } continue; }
        if (!d.on) { const a = p.yaw + Math.PI + (Math.random() - .5); Object.assign(d, { on: true, x: p.x + Math.cos(a) * 140, y: p.y + 30, z: p.z + Math.sin(a) * 140, vx: 0, vy: 0, vz: 0 }); d.g.visible = true; d.g.rotation.set(0, 0, 0); if (d === drones[0]) api.say("🛸 Police drones!", 2.5); }
        const ang = time * .9 + d.ph, tx = p.x + Math.cos(ang) * 14 + p.vel.x * .6, ty = Math.max(p.y + 6, 4), tz = p.z + Math.sin(ang) * 14 + p.vel.z * .6;
        const ax = (tx - d.x) * 2.2 - d.vx * 1.6, ay = (ty - d.y) * 2.2 - d.vy * 1.6, az = (tz - d.z) * 2.2 - d.vz * 1.6;
        d.vx += ax * dt; d.vy += ay * dt; d.vz += az * dt; const sp = Math.hypot(d.vx, d.vy, d.vz); if (sp > 80) { d.vx *= 80 / sp; d.vy *= 80 / sp; d.vz *= 80 / sp; }
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.g.position.set(d.x, d.y, d.z); d.g.rotation.set(Math.min(.4, Math.hypot(d.vx, d.vz) / 160), -Math.atan2(d.vz, d.vx), 0, "YXZ");
        const dd = Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z); nearest = Math.min(nearest, dd);
        if ((d.shotT -= dt) < 0 && dd < 28) { d.shotT = 6 + Math.random() * 3; api.emp && api.emp(1.2); d.boltT = .18; d.bolt.position.set(d.x, d.y, d.z); d.bolt.scale.set(1, dd, 1); d.bolt.lookAt(p.x, p.y, p.z); d.bolt.rotateX(Math.PI / 2); }
        if (dd < 4.2 && ps > 22) { d.down = 2.5; d.vy = 4; api.addScore(500, "Drone down!"); sound.crash(); }
      }
      // busted: stopped with a cruiser right beside you
      if (close && ps < 4 && !air) { bust += dt; if (bust > 3) { const lost = Math.round(p.score * .15); p.score -= lost; api.busted(`BUSTED! The police fined you ${lost} points`); clear(); return; } } else bust = Math.max(0, bust - dt * 2);
      // losing them
      if (nearest > 150) { evade += dt; if (evade > 8 + stars * 2) { const s = stars; heat = HEAT[s - 1]; stars = s - 1; evade = 0; if (!stars) { api.addScore(Math.max(s, peak) * 500, `You got away (${peak}★)`); clear(); } else api.say(`Losing them… ${"★".repeat(stars)}`, 2); } }
      else evade = Math.max(0, evade - dt);
      sound.siren && sound.siren(stars ? clamp(1 - nearest / 220, 0, 1) : 0);
    },
  };
}
