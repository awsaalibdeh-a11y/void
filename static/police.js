// Police chases: smash traffic or speed past a cop and you get wanted stars. Cruisers spawn out of sight and hunt
// you through the street grid (straight at you when the road is clear, round the blocks when it isn't), ram you,
// and box you in: stop near them for a few seconds and you are busted. Lose them for long enough and the stars
// fall away. From three stars a helicopter joins in with a searchlight, so flying away is not a free escape.
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
  const cops = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group(), body = new THREE.Mesh(geo.body, bodyMat), lights = new THREE.Mesh(geo.lights, lightMat);
    const r = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), red), b = new THREE.Mesh(new THREE.BoxGeometry(.32, .18, .5), blue);
    r.position.set(-.2, 1.82, .32); b.position.set(-.2, 1.82, -.32);
    const glow = new THREE.PointLight(0xff2020, 0, 26, 2); glow.position.set(0, 2.4, 0);
    body.castShadow = true; g.add(body, lights, r, b, glow); g.visible = false; scene.add(g);
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
    heli.spot = new THREE.SpotLight(0xffffff, 0, 160, .35, .5, 1.2); heli.add(heli.spot, heli.spot.target);
    heli.blink = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), red); heli.blink.position.set(-6.3, 1.2, 0); heli.add(heli.blink);
    heli.visible = false; scene.add(heli);
  }
  const H = { on: false, x: 0, y: 80, z: 0, yaw: 0 };
  let heat = 0, stars = 0, evade = 0, bust = 0, speedT = 0, cool = 0;
  const starsOf = h => { let s = 0; for (let k = 1; k < HEAT.length; k++) if (h >= HEAT[k]) s = k; return s; };
  function addHeat(n, why) {
    const before = stars; heat = Math.min(30, heat + n); stars = starsOf(heat); evade = 0;
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
    heat = 0; stars = 0; evade = 0; bust = 0;
    for (const c of cops) { c.on = false; c.g.visible = false; }
    H.on = false; heli.visible = false; if (msg) api.say(msg, 3);
  }
  return {
    get stars() { return stars; }, get bust() { return bust; }, cops, clear,
    event(kind, extra) {                                   // things the game tells us about
      if (kind === "smash") addHeat(extra === "police" ? 3 : 1, extra === "police" ? "You smashed a police car!" : "Wanted for smashing cars");
      if (kind === "cop") addHeat(3, "Police officer down");
    },
    update(dt, time) {
      const p = api.state; if (!p || !p.started) return;
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
        c.r.visible = flash; c.b.visible = !flash; c.glow.color.setHex(flash ? 0xff2020 : 0x2040ff); c.glow.intensity = 30;
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
            else { if (rel > 6) api.hurt(4 + rel * .55, "Rammed by the police"); p.vel.x = p.vel.x * .4 + Math.cos(c.yaw) * cv * .5; p.vel.z = p.vel.z * .4 + Math.sin(c.yaw) * cv * .5; c.v *= .4; sound.crash(); }
            const nx = (p.x - c.x) / (d || 1), nz = (p.z - c.z) / (d || 1); p.x += nx * (3.6 - d); p.z += nz * (3.6 - d);
          }
        }
        c.g.position.set(c.x, 0, c.z); c.g.rotation.set(c.rz, -c.yaw, 0, "YXZ");
      }
      // the helicopter from three stars
      if (stars >= 3) {
        if (!H.on) { H.on = true; H.x = p.x - 300; H.z = p.z - 300; H.y = 120; heli.visible = true; api.say("Police helicopter overhead", 2.5); }
        const ty = Math.max(p.y + 28, 70), dx = p.x - H.x, dz = p.z - H.z, d = Math.hypot(dx, dz), sp = Math.min(62, d * 1.5);
        H.x += dx / (d || 1) * sp * dt; H.z += dz / (d || 1) * sp * dt; H.y += (ty - H.y) * Math.min(1, dt * .8); H.yaw = Math.atan2(dz, dx);
        heli.position.set(H.x, H.y, H.z); heli.rotation.set(0, -H.yaw, Math.min(.25, sp / 250));
        heli.rotor.rotation.y += dt * 40; heli.tailRotor.rotation.x += dt * 50; heli.blink.visible = Math.sin(time * 6) > 0;
        heli.beam.lookAt(p.x, p.y, p.z); heli.beam.rotateX(-Math.PI / 2); heli.spot.intensity = d < 160 ? 900 : 0; heli.spot.target.position.set(p.x - H.x, p.y - H.y, p.z - H.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), H.yaw);
        if (d < 120) nearest = Math.min(nearest, d * .5);
      } else if (H.on) { H.on = false; heli.visible = false; }
      // busted: stopped with a cruiser right beside you
      if (close && ps < 4 && !air) { bust += dt; if (bust > 3) { const lost = Math.round(p.score * .15); p.score -= lost; api.busted(`BUSTED! The police fined you ${lost} points`); clear(); return; } } else bust = Math.max(0, bust - dt * 2);
      // losing them
      if (nearest > 150) { evade += dt; if (evade > 8 + stars * 2) { const s = stars; heat = HEAT[s - 1]; stars = s - 1; evade = 0; if (!stars) { api.addScore(s * 500, "You got away"); clear(); } else api.say(`Losing them… ${"★".repeat(stars)}`, 2); } }
      else evade = Math.max(0, evade - dt);
      sound.siren && sound.siren(stars ? clamp(1 - nearest / 220, 0, 1) : 0);
    },
  };
}
