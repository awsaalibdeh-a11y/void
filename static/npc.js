// Life in the streets of VOID City: thousands of cars, cabs, buses, trucks and police cruisers that drive
// in their lanes, stop at red lights, follow the car in front and turn at the corners, and thousands of
// people walking round the blocks. Ram a car faster than it is going and it breaks apart and flies;
// let something faster hit you and you take the damage. People always leap out of the way.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GRID, phase } from "./city.js";

// vehicle kinds: length, width, share of traffic, paint choices
const KINDS = [
  { id: "sedan", L: 4.7, W: 1.85, share: 26, cols: [0xf2f2f0, 0xc8ccd2, 0x1b1c20, 0x8a8f96, 0x6b1a1a, 0x24364f, 0x2f4a3a, 0xd8cfb8] },
  { id: "taxi", L: 4.9, W: 1.9, share: 22, cols: [0xf7c414] },
  { id: "suv", L: 4.9, W: 2.0, share: 16, cols: [0x111214, 0xf2f2f0, 0x3b3f46, 0x5a1e1e, 0x1e2a44] },
  { id: "van", L: 5.3, W: 2.0, share: 7, cols: [0xf2f2f0, 0xd9d9d9, 0x2e5aa8] },
  { id: "pickup", L: 5.5, W: 2.0, share: 6, cols: [0x8a1a14, 0x1b1c20, 0xc8ccd2, 0x2f4a3a] },
  { id: "sports", L: 4.4, W: 1.95, share: 6, cols: [0xd21f2b, 0xf7c414, 0x1f6fe0, 0x111111, 0xff6a00, 0x22c55e] },
  { id: "police", L: 5.0, W: 1.95, share: 5, cols: [0xf4f6fa] },
  { id: "bus", L: 12, W: 2.6, share: 5, cols: [0x2f6fd8] },
  { id: "truck", L: 8.5, W: 2.5, share: 7, cols: [0xf2f2f0, 0xc8202a, 0x2e5aa8, 0xf7c414] },
];
const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
const B = (w, h, d, x, y, z, c) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), c);
const BODY = [1, 1, 1], GLASS = [.03, .035, .045], TYRE = [.03, .03, .03], DARK = [.18, .18, .19], CHROME = [.55, .55, .58];
function wheelsOf(L, W, r = .36) { const out = [], ax = L / 2 - .95; for (const x of [ax, -ax]) for (const z of [W / 2 - .2, -W / 2 + .2]) out.push(tint(new THREE.CylinderGeometry(r, r, .28, 12).rotateX(Math.PI / 2).translate(x, r, z).toNonIndexed(), TYRE)); return out; }
function vehicle(k) {
  const { L, W } = k, p = [], lt = [];
  const H = [1, .95, .95], R = [1, .15, .15], A = [1, .7, .2], Wt = [1, 1, 1];
  const lights = (h, y, extra = 0) => { lt.push(B(.06, h, W * .28, L / 2 + .01, y, W * .3, H), B(.06, h, W * .28, L / 2 + .01, y, -W * .3, H), B(.06, h, W * .3, -L / 2 - .01, y + extra, W * .3, R), B(.06, h, W * .3, -L / 2 - .01, y + extra, -W * .3, R)); };
  switch (k.id) {
    case "bus":
      p.push(B(L, 2.6, W, 0, 1.75, 0, BODY), B(L - .6, .9, W + .02, 0, 2.1, 0, GLASS), B(.05, 1.3, W * .8, L / 2 + .01, 2, 0, GLASS), B(L, .35, W + .04, 0, .55, 0, DARK), B(L * .9, .3, W * .6, 0, 3.15, 0, [.8, .8, .82]));
      lights(.2, .9); lt.push(B(.05, .3, W * .6, L / 2 + .02, 2.85, 0, A)); p.push(...wheelsOf(L, W, .5)); break;
    case "truck":
      p.push(B(L * .7, 3.0, W, -L * .15, 2.0, 0, BODY), B(L * .28, 2.2, W, L * .36, 1.5, 0, [.9, .9, .92]), B(.05, .9, W * .85, L / 2 + .01, 2.0, 0, GLASS), B(L, .3, W * .9, 0, .55, 0, DARK));
      lights(.18, .9); p.push(...wheelsOf(L, W, .48)); break;
    case "van":
      p.push(B(L, 1.9, W, 0, 1.3, 0, BODY), B(L * .25, .7, W + .02, L * .3, 1.75, 0, GLASS), B(L, .25, W + .04, 0, .45, 0, DARK));
      lights(.16, .9); p.push(...wheelsOf(L, W)); break;
    case "pickup":
      p.push(B(L, .8, W, 0, .85, 0, BODY), B(L * .4, .75, W * .96, L * .05, 1.6, 0, BODY), B(L * .41, .5, W * .97, L * .05, 1.62, 0, GLASS), B(L * .38, .1, W * .9, -L * .3, 1.28, 0, DARK));
      lights(.16, .95); p.push(...wheelsOf(L, W, .4)); break;
    case "sports":
      p.push(B(L, .55, W, 0, .55, 0, BODY), B(L * .45, .42, W * .86, -L * .05, 1.0, 0, BODY), B(L * .46, .3, W * .88, -L * .02, 1.02, 0, GLASS), B(.3, .05, W, -L / 2 + .2, 1.1, 0, DARK));
      lights(.1, .65); p.push(...wheelsOf(L, W, .34)); break;
    case "suv":
      p.push(B(L, 1.0, W, 0, .9, 0, BODY), B(L * .7, .75, W * .95, -L * .07, 1.75, 0, BODY), B(L * .71, .52, W * .96, -L * .07, 1.78, 0, GLASS), B(L * .5, .06, W * .7, -L * .1, 2.16, 0, DARK));
      lights(.15, 1.05); p.push(...wheelsOf(L, W, .4)); break;
    default:   // sedan, taxi, police
      p.push(B(L, .7, W, 0, .72, 0, BODY), B(L * .5, .62, W * .92, -L * .04, 1.36, 0, BODY), B(L * .51, .44, W * .93, -L * .04, 1.38, 0, GLASS), B(L, .14, W + .04, 0, .45, 0, CHROME.map(c => c * .5)));
      if (k.id === "taxi") { p.push(B(.5, .26, .9, -L * .04, 1.8, 0, BODY)); lt.push(B(.52, .16, .92, -L * .04, 1.82, 0, [1, .92, .6])); p.push(B(L * .98, .08, .02, 0, .85, W / 2 + .005, [.02, .02, .02]), B(L * .98, .08, .02, 0, .85, -W / 2 - .005, [.02, .02, .02])); }
      if (k.id === "police") { p.push(B(L * .98, .22, .02, 0, .82, W / 2 + .005, [.15, .3, .8]), B(L * .98, .22, .02, 0, .82, -W / 2 - .005, [.15, .3, .8])); lt.push(B(.3, .14, .5, -L * .04, 1.75, .32, [.2, .35, 1]), B(.3, .14, .5, -L * .04, 1.75, -.32, [1, .15, .15])); }
      lights(.14, .82); p.push(...wheelsOf(L, W));
  }
  return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
}
function personGeo() {
  const s = [1, 1, 1], pants = [.22, .22, .25], shoes = [.08, .08, .08];
  return {
    body: mergeGeometries([B(.46, .64, .28, 0, 1.18, 0, s), B(.36, .86, .22, 0, .43, 0, pants)]),
    head: new THREE.IcosahedronGeometry(.14, 0).translate(0, 1.65, 0),
  };
}

export function createLife(scene, roads, walkways, COARSE) {
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { ax, sz, avW, stW, NX, NZ, X0, Z0, AV, ST, lanes } = GRID;
  const laneOffs = (axis, road) => axis === 0 ? (road === 10 ? lanes.bv : lanes.st) : lanes.av;
  const closed = (j, i) => j === 10 && (i === 5 || i === 6);            // the stunt track on the boulevard is closed to traffic
  const closedZ = (i, j) => i === 6 && (j === 9 || j === 10);        // and so is the avenue that crosses it, round the showroom spot and the loop
  const segOK = (axis, road, k) => axis === 0 ? (k >= 0 && k < NX - 1 && GRID.hasX(road, k) && !closed(road, k)) : (k >= 0 && k < NZ - 1 && GRID.hasZ(road, k) && !closedZ(road, k));
  const cross = (axis, k) => axis === 0 ? ax(k) : sz(k);               // the coordinate of the k-th crossing road along this axis
  const crossW = (axis, k) => axis === 0 ? avW(k) : stW(k);
  const roadC = (axis, road) => axis === 0 ? sz(road) : ax(road);
  const N = COARSE ? 1400 : 4000, NP = COARSE ? 2200 : 6000;

  // ---- vehicles ----
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .55, envMapIntensity: 1.1 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  const total = KINDS.reduce((s, k) => s + k.share, 0), counts = KINDS.map(k => Math.round(N * k.share / total));
  const meshes = KINDS.map((k, ti) => {
    const g = vehicle(k), body = new THREE.InstancedMesh(g.body, carMat, counts[ti]), lights = new THREE.InstancedMesh(g.lights, lightMat, counts[ti]);
    body.castShadow = true; body.frustumCulled = lights.frustumCulled = false; scene.add(body, lights); return { body, lights };
  });
  const cars = [], col = new THREE.Color();
  function place(c) {           // drop a car somewhere on a random open segment
    for (let tries = 0; tries < 40; tries++) {
      const axis = rnd() < .5 ? 0 : 1, road = Math.floor(rnd() * (axis === 0 ? NZ : NX)), k = Math.floor(rnd() * ((axis === 0 ? NX : NZ) - 1));
      if (!segOK(axis, road, k)) continue;
      const a = cross(axis, k) + crossW(axis, k) / 2 + 6, b = cross(axis, k + 1) - crossW(axis, k + 1) / 2 - 6;
      const lo = laneOffs(axis, road);
      Object.assign(c, { axis, road, dir: rnd() < .5 ? 1 : -1, lane: lo[Math.floor(rnd() * lo.length)], s: a + rnd() * (b - a), turn: null, lastK: -99, wreck: null, gone: 0 });
      c.v = c.want * .6; return;
    }
  }
  KINDS.forEach((k, ti) => {
    for (let n = 0; n < counts[ti]; n++) {
      const c = { kind: k, ti, n, v: 0, want: (k.id === "bus" || k.id === "truck" ? 8 : k.id === "sports" ? 13 : 10) + rnd() * 4, x: 0, z: 0, yaw: 0, y: 0, rx: 0, rz: 0, bump: 0, near: false };
      place(c); cars.push(c);
      c.color = k.cols[Math.floor(rnd() * k.cols.length)]; c.col = new THREE.Color(c.color);
    }
    meshes[ti].body.setColorAt(0, col.setHex(0xffffff));
  });
  const posOf = c => { const o = c.lane * c.dir; if (c.axis === 0) { c.x = c.s; c.z = roadC(0, c.road) + o; c.yaw = c.dir > 0 ? 0 : Math.PI; } else { c.z = c.s; c.x = roadC(1, c.road) - o; c.yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } };
  cars.forEach(posOf);

  // debris from smashed cars
  const DEB = COARSE ? 160 : 400, debris = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .25, .4), new THREE.MeshStandardMaterial({ roughness: .5, metalness: .5 }), DEB);
  debris.frustumCulled = false; scene.add(debris); const deb = Array.from({ length: DEB }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() })); let debI = 0;
  const glassBits = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.12), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: .8 }), DEB); glassBits.frustumCulled = false; scene.add(glassBits);

  // ---- people ----
  const pg = personGeo();
  const peopleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), headMat = new THREE.MeshStandardMaterial({ roughness: .7 });
  const bodies = new THREE.InstancedMesh(pg.body, peopleMat, NP), heads = new THREE.InstancedMesh(pg.head, headMat, NP);
  bodies.frustumCulled = heads.frustumCulled = false; bodies.castShadow = true; bodies.layers.set(1); heads.layers.set(1); debris.layers.enable(1); scene.add(bodies, heads);
  const SHIRTS = [0xe8e8e8, 0x1f1f22, 0xb22234, 0x2e5aa8, 0x2f6b3a, 0xf7c414, 0x7a2a8a, 0xff7a2e, 0x8a8f96, 0x4a2e1e, 0xf2a0b0, 0x30c0c0], SKIN = [0xf1c8a8, 0xd9a07a, 0xa8714a, 0x6b4430, 0xffdcc0, 0x8a5a3a];
  const people = [];
  const blockOK = (i, j) => !(i >= GRID.park.i0 && i < GRID.park.i1 && j >= GRID.park.j0 && j < GRID.park.j1);
  for (let n = 0; n < NP; n++) {
    let i, j; do { i = Math.floor(rnd() * (NX - 1)); j = Math.floor(rnd() * (NZ - 1)); } while (!blockOK(i, j));
    const x0 = ax(i) + avW(i) / 2 + 1.6, x1 = ax(i + 1) - avW(i + 1) / 2 - 1.6, z0 = sz(j) + stW(j) / 2 + 1.6, z1 = sz(j + 1) - stW(j + 1) / 2 - 1.6;
    const per = 2 * (x1 - x0) + 2 * (z1 - z0), inset = rnd() * 1.6;
    people.push({ x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset, per: per - 8 * inset, d: rnd() * per, v: .9 + rnd() * .8, dir: rnd() < .5 ? 1 : -1, x: 0, z: 0, push: new THREE.Vector2(), scare: 0, ph: rnd() * 6, wait: 0 });
    people[n].shirt = new THREE.Color(SHIRTS[Math.floor(rnd() * SHIRTS.length)]); people[n].skin = new THREE.Color(SKIN[Math.floor(rnd() * SKIN.length)]);
  }
  bodies.setColorAt(0, col); heads.setColorAt(0, col);
  const around = (p, d, out) => {           // a point on the rectangle loop round the block
    const w = p.x1 - p.x0, h = p.z1 - p.z0; d = ((d % p.per) + p.per) % p.per;
    if (d < w) { out.x = p.x0 + d; out.z = p.z0; out.yaw = 0; }
    else if ((d -= w) < h) { out.x = p.x1; out.z = p.z0 + d; out.yaw = Math.PI / 2; }
    else if ((d -= h) < w) { out.x = p.x1 - d; out.z = p.z1; out.yaw = Math.PI; }
    else { d -= w; out.x = p.x0; out.z = p.z1 - d; out.yaw = -Math.PI / 2; }
    return out;
  };

  // ---- per frame ----
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  const buckets = new Map(), tmp = {}, cell = new Map(), CELL = 30;
  let frameN = 0;
  function decide(c, k) {       // at the crossing k: straight on, or turn onto the cross road
    const axis = c.axis, ok = segOK(axis, c.road, c.dir > 0 ? k : k - 1), oAxis = 1 - axis, oRoad = k;
    const opts = [];
    for (const nd of [1, -1]) if (segOK(oAxis, oRoad, nd > 0 ? c.road : c.road - 1)) opts.push(nd);
    if (ok && (rnd() < .7 || !opts.length)) return;
    if (!opts.length) { c.dir *= -1; return; }                                   // dead end: turn round
    const nd = opts[Math.floor(rnd() * opts.length)], lo = laneOffs(oAxis, oRoad), lane = lo[Math.min(lo.length - 1, laneOffs(axis, c.road).indexOf(c.lane))] ?? lo[0];
    const cx = cross(axis, k), p0 = { x: c.x, z: c.z };
    const corner = axis === 0 ? { x: roadC(1, oRoad) - lane * nd, z: c.z } : { x: c.x, z: roadC(0, oRoad) + lane * nd };
    const R = Math.max(4, Math.hypot(corner.x - p0.x, corner.z - p0.z));
    const p2 = axis === 0 ? { x: corner.x, z: corner.z + nd * R } : { x: corner.x + nd * R, z: corner.z };
    void cx;
    c.turn = { t: 0, len: R * 1.6, p0, p1: corner, p2, axis: oAxis, road: oRoad, dir: nd, lane };
  }
  function smash(c, vx, vz, power) {
    c.wreck = { t: 0, vx: vx * .8 + (rnd() - .5) * 4, vz: vz * .8 + (rnd() - .5) * 4, vy: 4 + power * .25, wx: (rnd() - .5) * 8, wy: (rnd() - .5) * 6, wz: (rnd() - .5) * 8 };
    c.y = 0; c.rx = 0; c.rz = 0; c.v = 0; c.turn = null;
    c.col.setHex(c.color).multiplyScalar(.3);
    for (let k = 0; k < 14; k++) {
      const di = debI++ % DEB, d = deb[di]; d.life = 3 + rnd() * 2; d.p.set(c.x, 1, c.z); d.v.set(vx * .6 + (rnd() - .5) * 14, 3 + rnd() * 9, vz * .6 + (rnd() - .5) * 14); d.w.set(rnd() * 12, rnd() * 12, rnd() * 12); d.c = k % 3 ? c.color : 0x222222;
      debris.setColorAt(di, col.setHex(d.c));
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  const near = (x, z) => cell.get(Math.floor(x / CELL) * 7919 + Math.floor(z / CELL)) || [];

  return {
    cars, meshes, smash, near,
    honk(x, z) { for (const p of people) if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25) p.scare = 2; },
    // cars near a point (for the player's collision tests)
    nearCars(x, z, r) { const out = []; for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (const c of cell.get(cx * 7919 + cz) || []) out.push(c); return out; },
    update(dt, time, player, camPos) {
      frameN++;
      const px = player ? player.x : camPos ? camPos.x : 0, pz = player ? player.z : camPos ? camPos.z : 0;
      buckets.clear(); cell.clear();
      const cx0 = camPos ? camPos.x : px, cz0 = camPos ? camPos.z : pz, alt = camPos ? Math.max(0, camPos.y) : 0;
      const RC = Math.min(900, (COARSE ? 260 : 380) + alt * 2), RC2 = RC * RC, RP = Math.min(320, (COARSE ? 120 : 190) + alt * .5), RP2 = RP * RP;
      for (const m of meshes) m.k = 0;
      for (const c of cars) {
        if (c.wreck || c.turn) continue;
        const key = c.axis * 100000 + c.road * 1000 + (c.dir > 0 ? 500 : 0) + Math.round(c.lane * 10);
        let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(c);
      }
      for (const b of buckets.values()) { b.sort((a, d) => a.s * a.dir - d.s * d.dir); for (let k = 0; k < b.length; k++) b[k].lead = b[k + 1] || null; }
      for (const c of cars) {
        const far = (Math.abs(c.x - px) > 450 || Math.abs(c.z - pz) > 450) && (Math.abs(c.x - cx0) > RC || Math.abs(c.z - cz0) > RC);
        if (far && (frameN + c.n) % 6) { continue; }
        const h = far ? dt * 6 : dt;
        if (c.wreck) {                                   // a smashed car tumbles, bounces, then lies there smoking until it is towed
          const w = c.wreck; w.t += h;
          if (c.y > 0 || w.vy > 0) { w.vy -= 9.81 * h; c.y = Math.max(0, c.y + w.vy * h); c.rx += w.wx * h; c.rz += w.wz * h; c.yaw += w.wy * h; if (c.y === 0) { w.vy = -w.vy * .3; w.wx *= .5; w.wz *= .5; w.wy *= .5; if (Math.abs(w.vy) < 1) w.vy = 0; } }
          c.x += w.vx * h; c.z += w.vz * h; const f = Math.pow(c.y > 0 ? .9 : .2, h); w.vx *= f; w.vz *= f;
          if (c.y === 0) { c.rx = Math.round(c.rx / Math.PI) * Math.PI * .02 + c.rx * .98; c.rz = Math.round(c.rz / Math.PI) * Math.PI * .02 + c.rz * .98; }
          if (w.t > 14) { place(c); posOf(c); c.rx = c.rz = c.y = 0; c.col.setHex(c.color); }
        } else if (c.turn) {
          const T = c.turn; T.t += c.v * h / T.len; const t = Math.min(1, T.t), a = 1 - t;
          const nx = a * a * T.p0.x + 2 * a * t * T.p1.x + t * t * T.p2.x, nz = a * a * T.p0.z + 2 * a * t * T.p1.z + t * t * T.p2.z;
          const dx = 2 * a * (T.p1.x - T.p0.x) + 2 * t * (T.p2.x - T.p1.x), dz = 2 * a * (T.p1.z - T.p0.z) + 2 * t * (T.p2.z - T.p1.z);
          c.x = nx; c.z = nz; c.yaw = Math.atan2(dz, dx); c.v += (Math.min(c.want, 7) - c.v) * Math.min(1, h * 2);
          if (t >= 1) { Object.assign(c, { axis: T.axis, road: T.road, dir: T.dir, lane: T.lane, s: T.axis === 0 ? c.x : c.z, turn: null }); c.lastK = -99; }
        } else {
          let want = c.want;
          // the next crossing ahead and its light
          const along = c.axis === 0 ? (c.s - X0) / AV : (c.s - Z0) / ST, k = c.dir > 0 ? Math.floor(along) + 1 : Math.ceil(along) - 1;
          const lim = c.axis === 0 ? NX : NZ;
          if (k >= 0 && k < lim) {
            const cc = cross(c.axis, k), stop = cc - c.dir * (crossW(c.axis, k) / 2 + 2.5), dist = (stop - c.s) * c.dir;
            const ph = c.axis === 0 ? phase(k, c.road, time) : phase(c.road, k, time), green = c.axis === 0 ? ph === 0 : ph === 2, amber = c.axis === 0 ? ph === 1 : ph === 3;
            if (!green && dist > (amber ? 10 : -.5) && dist < 40) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 4.5 * (dist - .5))));
            if (dist < 0 && c.lastK !== k) { c.lastK = k; decide(c, k); }
          } else if ((c.dir > 0 && c.s > cross(c.axis, lim - 1) - 12) || (c.dir < 0 && c.s < cross(c.axis, 0) + 12)) c.dir *= -1;
          // keep a gap to the car in front
          if (c.lead) { const gap = (c.lead.s - c.s) * c.dir - (c.kind.L + c.lead.kind.L) / 2; want = Math.min(want, gap < 2.5 ? 0 : Math.max(0, (gap - 2.5) * 1.1), c.lead.v + gap * .4); }
          // and to the player
          if (player && player.y < 3) { const dx = player.x - c.x, dz = player.z - c.z, ah = dx * Math.cos(c.yaw) + dz * Math.sin(c.yaw), sd = -dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw); if (ah > 0 && ah < 22 && Math.abs(sd) < 2.6) want = Math.min(want, Math.max(0, (ah - 6) * .8)); }
          c.v += Math.max(-9 * h, Math.min(3 * h, want - c.v));
          if (!c.turn) { c.s += c.v * c.dir * h; posOf(c); }
        }
        const key = Math.floor(c.x / CELL) * 7919 + Math.floor(c.z / CELL); let b = cell.get(key); if (!b) cell.set(key, b = []); b.push(c);
        const lean = c.turn ? .05 : 0;
        e.set(c.rx, -c.yaw, c.rz + lean, "YXZ"); q.setFromEuler(e); m4.compose(pos.set(c.x, c.y, c.z), q, one);
        const ddx = c.x - cx0, ddz = c.z - cz0;
        if (ddx * ddx + ddz * ddz < RC2) { const M = meshes[c.ti], k = M.k++; M.body.setMatrixAt(k, m4); M.body.setColorAt(k, c.col); M.lights.setMatrixAt(k, c.wreck ? m4.compose(pos, q, zero) : m4); }
      }
      for (const m of meshes) { m.body.count = m.lights.count = m.k; m.body.instanceMatrix.needsUpdate = m.lights.instanceMatrix.needsUpdate = true; if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true; }
      // debris
      for (let k = 0; k < DEB; k++) {
        const d = deb[k];
        if (d.life > 0) { d.life -= dt; d.v.y -= 9.81 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < .1) { d.p.y = .1; d.v.multiplyScalar(.5); d.v.y = Math.abs(d.v.y) * .4; d.w.multiplyScalar(.6); } d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt; q.setFromEuler(d.r); m4.compose(d.p, q, one); }
        else m4.compose(pos.set(0, -50, 0), q, zero);
        debris.setMatrixAt(k, m4); glassBits.setMatrixAt(k, d.life > 0 ? m4.compose(pos.copy(d.p).add({ x: .3, y: .2, z: -.2 }), q, one) : m4);
      }
      debris.instanceMatrix.needsUpdate = glassBits.instanceMatrix.needsUpdate = true;
      // people
      let pk = 0;
      for (let n = 0; n < people.length; n++) {
        const p = people[n];
        const far = (Math.abs(p.x - px) > 300 || Math.abs(p.z - pz) > 300) && (Math.abs(p.x - cx0) > RP || Math.abs(p.z - cz0) > RP);
        if (far && (frameN + n) % 8) continue;
        const h = far ? dt * 8 : dt;
        if (p.wait > 0) p.wait -= h; else { p.d += p.v * (p.scare > 0 ? 3 : 1) * p.dir * h; if (rnd() < .0008) p.wait = 2 + rnd() * 5; }
        around(p, p.d, tmp);
        let x = tmp.x, z = tmp.z;
        if (player && player.y < 4) {                    // a car coming: leap out of the way
          const dx = x + p.push.x - player.x, dz = z + p.push.y - player.z, d = Math.hypot(dx, dz) || .01, r = 4 + Math.min(6, (player.speed || 0) * .08);
          if (d < r) { const k = (r - d) * Math.min(1, h * 10); p.push.x += dx / d * k; p.push.y += dz / d * k; p.scare = 2; }
        }
        if (p.scare > 0) p.scare -= h;
        p.push.multiplyScalar(1 - Math.min(1, h * .25));
        x += p.push.x; z += p.push.y; p.x = x; p.z = z;
        const walk = time * 7 * p.v * (p.scare > 0 ? 2 : 1) + p.ph, bob = p.wait > 0 ? 0 : Math.abs(Math.sin(walk)) * .05;
        const ex = x - cx0, ez = z - cz0;
        if (ex * ex + ez * ez < RP2) { q.setFromAxisAngle(Y, -(tmp.yaw + (p.dir < 0 ? Math.PI : 0))); m4.compose(pos.set(x, bob + .06, z), q, one); bodies.setMatrixAt(pk, m4); heads.setMatrixAt(pk, m4); bodies.setColorAt(pk, p.shirt); heads.setColorAt(pk, p.skin); pk++; }
      }
      bodies.count = heads.count = pk;
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
    },
  };
}
