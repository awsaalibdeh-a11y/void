// Life in the streets of VOID City: thousands of cars, cabs, buses, trucks and police cruisers that drive
// in their lanes, stop at red lights, follow the car in front and turn at the corners, and thousands of
// people walking round the blocks. Ram a car faster than it is going and it breaks apart and flies;
// let something faster hit you and you take the damage. People always leap out of the way.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GRID, phase } from "./city.js";

// vehicle kinds: length, width, share of traffic, paint choices
export const KINDS = [
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
// side profiles extruded across the car with rounded edges: a real hood, windscreen rake, roof and boot
const V2 = (x, y) => new THREE.Vector2(x, y);
const ext = (pts, width, c, bevel = .07) => tint(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => V2(x, y))), { depth: Math.max(.05, width - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 }).translate(0, 0, -(width - 2 * bevel) / 2).toNonIndexed(), c);
const CHR = [.62, .63, .66], RIM = [.5, .52, .56];
function wheels4(L, W, r = .34, inset = .95) {
  const out = [], ax = L / 2 - inset;
  for (const x of [ax, -ax]) for (const s of [1, -1]) {
    out.push(tint(new THREE.CylinderGeometry(r, r, .26, 14).rotateX(Math.PI / 2).translate(x, r, s * (W / 2 - .16)).toNonIndexed(), TYRE));
    out.push(tint(new THREE.CylinderGeometry(r * .62, r * .62, .04, 10).rotateX(Math.PI / 2).translate(x, r, s * (W / 2 - .02)).toNonIndexed(), RIM));
  }
  return out;
}
const PROFILES = {
  // [body outline], [glass outline], [roof outline] (x from the back, metres; y up)
  sedan: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .62], [L / 2 - .32, .78], [L / 2 - 1.25, .88], [-L / 2 + .95, .92], [-L / 2 + .15, .86], [-L / 2, .7]],
    [[L / 2 - 1.3, .87], [L / 2 - 2.05, 1.38], [-L / 2 + 1.55, 1.4], [-L / 2 + .9, .9]], [[L / 2 - 2.0, 1.36], [-L / 2 + 1.6, 1.38], [-L / 2 + 1.62, 1.45], [L / 2 - 2.02, 1.43]]],
  suv: (L) => [[[-L / 2, .38], [L / 2, .38], [L / 2, .82], [L / 2 - .3, 1.0], [L / 2 - 1.15, 1.08], [-L / 2 + .1, 1.12], [-L / 2, .95]],
    [[L / 2 - 1.2, 1.07], [L / 2 - 1.75, 1.78], [-L / 2 + .25, 1.8], [-L / 2 + .12, 1.1]], [[L / 2 - 1.72, 1.76], [-L / 2 + .2, 1.78], [-L / 2 + .2, 1.86], [L / 2 - 1.75, 1.84]]],
  sports: (L) => [[[-L / 2, .26], [L / 2, .26], [L / 2, .45], [L / 2 - .5, .66], [L / 2 - 1.5, .76], [-L / 2 + .7, .84], [-L / 2, .74]],
    [[L / 2 - 1.55, .75], [L / 2 - 2.2, 1.12], [-L / 2 + 1.5, 1.12], [-L / 2 + .75, .83]], [[L / 2 - 2.15, 1.1], [-L / 2 + 1.55, 1.1], [-L / 2 + 1.55, 1.16], [L / 2 - 2.15, 1.16]]],
  van: (L) => [[[-L / 2, .35], [L / 2, .35], [L / 2, .95], [L / 2 - .5, 1.25], [-L / 2, 1.25]],
    [[L / 2 - .5, 1.24], [L / 2 - 1.1, 1.95], [-L / 2 + .1, 2.0], [-L / 2 + .1, 1.24]], [[L / 2 - 1.05, 1.93], [-L / 2 + .05, 1.98], [-L / 2 + .05, 2.18], [L / 2 - 1.1, 2.14]]],
  pickup: (L) => [[[-L / 2, .38], [L / 2, .38], [L / 2, .85], [L / 2 - .4, 1.02], [L / 2 - 1.2, 1.08], [-L / 2, 1.08]],
    [[L / 2 - 1.25, 1.07], [L / 2 - 1.75, 1.75], [L / 2 - 3.0, 1.78], [L / 2 - 3.05, 1.07]], [[L / 2 - 1.72, 1.74], [L / 2 - 3.02, 1.76], [L / 2 - 3.02, 1.84], [L / 2 - 1.75, 1.82]]],
};
export function vehicle(k) {
  const { L, W } = k, p = [], lt = [];
  const H = [1, .95, .85], R = [1, .12, .12], A = [1, .7, .2];
  const lamps = (y, h = .14) => { for (const s of [1, -1]) { lt.push(B(.08, h, W * .24, L / 2 - .02, y, s * W * .32, H)); lt.push(B(.08, h, W * .26, -L / 2 + .02, y + .05, s * W * .32, R)); } };
  const mirrors = (x, y) => { for (const s of [1, -1]) p.push(B(.18, .12, .2, x, y, s * (W / 2 + .08), BODY)); };
  const kind = k.id === "taxi" || k.id === "police" ? "sedan" : k.id;
  if (kind === "bus" || kind === "truck") {
    if (kind === "bus") {
      p.push(ext([[-L / 2, .45], [L / 2, .45], [L / 2, 3.1], [-L / 2, 3.1]], W, BODY, .15), ext([[-L / 2 + .3, 1.55], [L / 2 - .3, 1.55], [L / 2 - .3, 2.6], [-L / 2 + .3, 2.6]], W + .04, GLASS, .02));
      p.push(B(.05, 1.5, W * .8, L / 2 + .02, 2.05, 0, GLASS), B(L * .9, .25, W * .55, 0, 3.25, 0, [.82, .83, .85]), B(L, .3, W + .06, 0, .55, 0, DARK), ...wheels4(L, W, .5, 1.6));
      lamps(.95); lt.push(B(.05, .28, W * .6, L / 2 + .03, 2.9, 0, A));
    } else {
      p.push(ext([[-L / 2, .6], [L * .2, .6], [L * .2, 3.4], [-L / 2, 3.4]], W, BODY, .08));
      p.push(ext([[L * .21, .5], [L / 2, .5], [L / 2, 1.5], [L / 2 - .5, 2.4], [L * .21, 2.5]], W * .98, [.9, .9, .92], .1), ext([[L / 2 - .5, 1.6], [L / 2 - .1, 1.55], [L / 2 - .5, 2.3]], W + .02, GLASS, .02));
      p.push(B(L, .3, W * .9, 0, .55, 0, DARK), ...wheels4(L, W, .48, 1.1)); lamps(.95);
    }
    return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  const [body, glass, roof] = PROFILES[kind](L);
  p.push(ext(body, W, BODY, .1), ext(glass, W * .9, GLASS, .06), ext(roof, W * .86, BODY, .05));
  p.push(B(.2, .22, W * .96, L / 2 - .02, .42, 0, DARK), B(.2, .22, W * .96, -L / 2 + .02, .42, 0, DARK));       // bumpers
  p.push(B(.03, .14, W * .5, L / 2 + .02, .58, 0, [.12, .12, .13]));                                               // grille
  const wr = kind === "suv" || kind === "pickup" ? .4 : kind === "sports" ? .33 : .34;
  p.push(...wheels4(L, W, wr, kind === "sports" ? .85 : .95));
  mirrors(L / 2 - 1.35, kind === "suv" || kind === "pickup" ? 1.15 : kind === "van" ? 1.35 : .95);
  if (k.id === "taxi") { p.push(B(.55, .26, .9, -.1, 1.6, 0, BODY)); lt.push(B(.57, .16, .92, -.1, 1.62, 0, [1, .92, .6])); for (const s of [1, -1]) p.push(B(L * .7, .1, .02, 0, .66, s * (W / 2 + .01), [.03, .03, .03])); }
  if (k.id === "police") { for (const s of [1, -1]) p.push(B(L * .8, .24, .02, 0, .65, s * (W / 2 + .01), [.12, .25, .75])); lt.push(B(.3, .14, .5, -.15, 1.52, .32, [.2, .35, 1]), B(.3, .14, .5, -.15, 1.52, -.32, [1, .15, .15])); }
  lamps(kind === "sports" ? .5 : kind === "suv" || kind === "pickup" ? .85 : kind === "van" ? .85 : .66);
  return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
}
// people: torso and arms (shirt colour), each leg on its own so they can swing, a head and hair
function personGeo() {
  const s = [1, 1, 1];
  return {
    body: mergeGeometries([B(.44, .6, .26, 0, 1.2, 0, s), B(.4, .12, .24, 0, .9, 0, [.25, .25, .28]), B(.11, .56, .12, 0, 1.16, .29, s), B(.11, .56, .12, 0, 1.16, -.29, s),
      B(.1, .1, .1, 0, .86, .29, [.85, .7, .6]), B(.1, .1, .1, 0, .86, -.29, [.85, .7, .6])]),
    leg: mergeGeometries([B(.16, .82, .18, 0, -.41, 0, [1, 1, 1]), B(.24, .08, .18, .04, -.84, 0, [.08, .08, .08])]),
    head: mergeGeometries([new THREE.IcosahedronGeometry(.135, 1).translate(0, 1.66, 0).toNonIndexed(), new THREE.CylinderGeometry(.055, .06, .1, 5).translate(0, 1.5, 0).toNonIndexed()]),
    hair: new THREE.SphereGeometry(.142, 7, 3, 0, Math.PI * 2, 0, Math.PI * .5).translate(-.015, 1.68, 0),
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
  const N = COARSE ? 500 : 1100, NP = COARSE ? 900 : 2000;

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
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), legL = new THREE.InstancedMesh(pg.leg, legMat, NP), legR = new THREE.InstancedMesh(pg.leg, legMat, NP), hair = new THREE.InstancedMesh(pg.hair, new THREE.MeshStandardMaterial({ roughness: .9 }), NP);
  for (const m of [bodies, heads, legL, legR, hair]) { m.frustumCulled = false; m.layers.set(1); scene.add(m); }
  debris.layers.enable(1);
  const SHIRTS = [0xe8e8e8, 0x1f1f22, 0xb22234, 0x2e5aa8, 0x2f6b3a, 0xf7c414, 0x7a2a8a, 0xff7a2e, 0x8a8f96, 0x4a2e1e, 0xf2a0b0, 0x30c0c0], SKIN = [0xf1c8a8, 0xd9a07a, 0xa8714a, 0x6b4430, 0xffdcc0, 0x8a5a3a];
  const people = [];
  const blockOK = (i, j) => !(i >= GRID.park.i0 && i < GRID.park.i1 && j >= GRID.park.j0 && j < GRID.park.j1);
  for (let n = 0; n < NP; n++) {
    let i, j; do { i = Math.floor(rnd() * (NX - 1)); j = Math.floor(rnd() * (NZ - 1)); } while (!blockOK(i, j));
    const x0 = ax(i) + avW(i) / 2 + 1.6, x1 = ax(i + 1) - avW(i + 1) / 2 - 1.6, z0 = sz(j) + stW(j) / 2 + 1.6, z1 = sz(j + 1) - stW(j + 1) / 2 - 1.6;
    const per = 2 * (x1 - x0) + 2 * (z1 - z0), inset = rnd() * 1.6;
    people.push({ x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset, per: per - 8 * inset, d: rnd() * per, v: .9 + rnd() * .8, dir: rnd() < .5 ? 1 : -1, x: 0, z: 0, push: new THREE.Vector2(), scare: 0, ph: rnd() * 6, wait: 0 });
    people[n].shirt = new THREE.Color(SHIRTS[Math.floor(rnd() * SHIRTS.length)]); people[n].skin = new THREE.Color(SKIN[Math.floor(rnd() * SKIN.length)]);
    people[n].pants = new THREE.Color([0x1e2a44, 0x222226, 0x5a4a3a, 0x2f4a6a, 0x6a6a70, 0x111111][Math.floor(rnd() * 6)]); people[n].hairC = new THREE.Color([0x1a120c, 0x3a2414, 0x0c0c0c, 0x8a6a3a, 0x6a3a1a, 0xb0a090][Math.floor(rnd() * 6)]);
  }
  bodies.setColorAt(0, col); heads.setColorAt(0, col); legL.setColorAt(0, col); legR.setColorAt(0, col); hair.setColorAt(0, col);
  const around = (p, d, out) => {           // a point on the rectangle loop round the block
    const w = p.x1 - p.x0, h = p.z1 - p.z0; d = ((d % p.per) + p.per) % p.per;
    if (d < w) { out.x = p.x0 + d; out.z = p.z0; out.yaw = 0; }
    else if ((d -= w) < h) { out.x = p.x1; out.z = p.z0 + d; out.yaw = Math.PI / 2; }
    else if ((d -= h) < w) { out.x = p.x1 - d; out.z = p.z1; out.yaw = Math.PI; }
    else { d -= w; out.x = p.x0; out.z = p.z1 - d; out.yaw = -Math.PI / 2; }
    return out;
  };

  // ---- per frame ----
  const legQ = new THREE.Quaternion(), legM = new THREE.Matrix4(), legT = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1), squash = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  const buckets = new Map(), tmp = {}, cell = new Map(), CELL = 30;
  let frameN = 0, debLive = 1;
  const LEGS = [[null, 1, .1], [null, -1, -.1]];
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
  // how badly a car is hit decides what happens to it: a dent and a stop, a crumpled wreck that slides,
  // or (really hard) it flips, flies and sheds parts
  function smash(c, vx, vz, power) {
    if (power < 14 && !c.wreck) {
      c.dent = Math.min(1, (c.dent || 0) + .45); c.stop = 5 + rnd() * 3; c.v = 0; c.col.multiplyScalar(.82); c.yaw += (rnd() - .5) * .5; c.x += vx * .05; c.z += vz * .05;
      debLive = 1; for (let k = 0; k < 4; k++) { const di = debI++ % DEB, d = deb[di]; d.life = 1.5; d.p.set(c.x, .8, c.z); d.v.set((rnd() - .5) * 6, 2 + rnd() * 3, (rnd() - .5) * 6); d.w.set(rnd() * 8, rnd() * 8, rnd() * 8); debris.setColorAt(di, col.setHex(c.color)); }
      if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
      return;
    }
    const fly = power > 28;
    c.crush = fly ? .72 : .82;
    c.wreck = fly ? { t: 0, vx: vx * .8 + (rnd() - .5) * 4, vz: vz * .8 + (rnd() - .5) * 4, vy: 4 + power * .25, wx: (rnd() - .5) * 8, wy: (rnd() - .5) * 6, wz: (rnd() - .5) * 8 }
      : { t: 0, vx: vx * .45, vz: vz * .45, vy: 0, wx: 0, wy: (rnd() - .5) * 3, wz: 0 };
    c.y = 0; c.rx = 0; c.rz = 0; c.v = 0; c.turn = null;
    c.col.setHex(c.color).multiplyScalar(fly ? .28 : .45);
    debLive = 1; for (let k = 0; k < (fly ? 14 : 6); k++) {
      const di = debI++ % DEB, d = deb[di]; d.life = 3 + rnd() * 2; d.p.set(c.x, 1, c.z); d.v.set(vx * .6 + (rnd() - .5) * 14, 3 + rnd() * 9, vz * .6 + (rnd() - .5) * 14); d.w.set(rnd() * 12, rnd() * 12, rnd() * 12); d.c = k % 3 ? c.color : 0x222222;
      debris.setColorAt(di, col.setHex(d.c));
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  const NONE = [], near = (x, z) => cell.get(Math.floor(x / CELL) * 7919 + Math.floor(z / CELL)) || NONE;

  const api = { detail: 1 };
  return {
    get detail() { return api.detail; }, set detail(v) { api.detail = v; },
    cars, meshes, smash, near,
    honk(x, z) { for (const p of people) if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25) p.scare = 2; },
    // cars near a point (for the player's collision tests)
    nearCars(x, z, r) { const out = []; for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (const c of cell.get(cx * 7919 + cz) || []) out.push(c); return out; },
    update(dt, time, player, camPos) {
      frameN++;
      const px = player ? player.x : camPos ? camPos.x : 0, pz = player ? player.z : camPos ? camPos.z : 0;
      const relead = frameN % 4 === 1; if (relead) for (const b of buckets.values()) b.length = 0; for (const b of cell.values()) b.length = 0;
      const cx0 = camPos ? camPos.x : px, cz0 = camPos ? camPos.z : pz, alt = camPos ? Math.max(0, camPos.y) : 0;
      const D = api.detail || 1, RC = Math.min(900, ((COARSE ? 260 : 380) + alt * 2) * D), RC2 = RC * RC, RP = Math.min(260, ((COARSE ? 90 : 140) + alt * .4) * D), RP2 = RP * RP;
      for (const m of meshes) m.k = 0;
      if (relead) for (const c of cars) {
        if (c.wreck || c.turn) continue;
        const key = c.axis * 100000 + c.road * 1000 + (c.dir > 0 ? 500 : 0) + Math.round(c.lane * 10);
        let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(c);
      }
      if (relead) for (const b of buckets.values()) if (b.length) { b.sort((a, d) => a.s * a.dir - d.s * d.dir); for (let k = 0; k < b.length; k++) b[k].lead = b[k + 1] || null; }
      for (const c of cars) {
        const far = (Math.abs(c.x - px) > 450 || Math.abs(c.z - pz) > 450) && (Math.abs(c.x - cx0) > RC || Math.abs(c.z - cz0) > RC);
        const vfar = far && (Math.abs(c.x - px) > 1200 || Math.abs(c.z - pz) > 1200), every = vfar ? 15 : 6;   // far away nobody sees them: move them in big, rare steps
        if (far && (frameN + c.n) % every) { continue; }
        const h = far ? dt * every : dt;
        if (c.wreck) {                                   // a smashed car tumbles, bounces, then lies there smoking until it is towed
          const w = c.wreck; w.t += h;
          if (c.y > 0 || w.vy > 0) { w.vy -= 9.81 * h; c.y = Math.max(0, c.y + w.vy * h); c.rx += w.wx * h; c.rz += w.wz * h; c.yaw += w.wy * h; if (c.y === 0) { w.vy = -w.vy * .3; w.wx *= .5; w.wz *= .5; w.wy *= .5; if (Math.abs(w.vy) < 1) w.vy = 0; } }
          c.x += w.vx * h; c.z += w.vz * h; const f = Math.pow(c.y > 0 ? .9 : .2, h); w.vx *= f; w.vz *= f;
          if (c.y === 0) { c.rx = Math.round(c.rx / Math.PI) * Math.PI * .02 + c.rx * .98; c.rz = Math.round(c.rz / Math.PI) * Math.PI * .02 + c.rz * .98; }
          if (w.t > 24) { place(c); posOf(c); c.rx = c.rz = c.y = 0; c.col.setHex(c.color); c.crush = 0; c.dent = 0; }
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
          if (c.stop > 0) { c.stop -= h; want = 0; }                 // dented: it stops a while before driving on
          c.v += Math.max(-9 * h, Math.min(3 * h, want - c.v));
          if (!c.turn) { c.s += c.v * c.dir * h; posOf(c); }
        }
        if (!far) { const key = Math.floor(c.x / CELL) * 7919 + Math.floor(c.z / CELL); let b = cell.get(key); if (!b) cell.set(key, b = []); b.push(c); }
        const ddx = c.x - cx0, ddz = c.z - cz0;
        if (ddx * ddx + ddz * ddz < RC2) {
          e.set(c.rx, -c.yaw, c.rz + (c.turn ? .05 : 0), "YXZ"); q.setFromEuler(e); m4.compose(pos.set(c.x, c.y, c.z), q, squash.set(1, c.crush || 1 - (c.dent || 0) * .07, 1));
          const M = meshes[c.ti], k = M.k++; M.body.setMatrixAt(k, m4); M.body.setColorAt(k, c.col); M.lights.setMatrixAt(k, c.wreck ? m4.compose(pos, q, zero) : m4); }
      }
      for (const m of meshes) { m.body.count = m.lights.count = m.k; m.body.instanceMatrix.needsUpdate = m.lights.instanceMatrix.needsUpdate = true; if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true; }
      // debris (skipped once every piece has landed and been hidden)
      if (debLive) { debLive = 0; for (let k = 0; k < DEB; k++) {
        const d = deb[k];
        if (d.life > 0) { debLive++; d.life -= dt; d.v.y -= 9.81 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < .1) { d.p.y = .1; d.v.multiplyScalar(.5); d.v.y = Math.abs(d.v.y) * .4; d.w.multiplyScalar(.6); } d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt; q.setFromEuler(d.r); m4.compose(d.p, q, one); }
        else m4.compose(pos.set(0, -50, 0), q, zero);
        debris.setMatrixAt(k, m4); glassBits.setMatrixAt(k, d.life > 0 ? m4.compose(pos.copy(d.p).add({ x: .3, y: .2, z: -.2 }), q, one) : m4);
      }
      debris.instanceMatrix.needsUpdate = glassBits.instanceMatrix.needsUpdate = true; if (debLive) debLive++; else debLive = 0; }
      // people
      let pk = 0;
      for (let n = 0; n < people.length; n++) {
        const p = people[n];
        const far = (Math.abs(p.x - px) > 300 || Math.abs(p.z - pz) > 300) && (Math.abs(p.x - cx0) > RP || Math.abs(p.z - cz0) > RP);
        if (far && (frameN + n) % 8) continue;
        const h = far ? dt * 8 : dt;
        if (p.down > 0) { } else if (p.wait > 0) p.wait -= h; else { p.d += p.v * (p.scare > 0 ? 3 : 1) * p.dir * h; if (rnd() < .0008) p.wait = 2 + rnd() * 5; }
        around(p, p.d, tmp);
        let x = tmp.x, z = tmp.z;
        if (player && player.y < 4 && !(p.down > 0)) {   // a car coming: leap out of the way, or get knocked over if it is too quick
          const dx = x + p.push.x - player.x, dz = z + p.push.y - player.z, d = Math.hypot(dx, dz) || .01, r = 3 + Math.min(3, (player.speed || 0) * .04);
          if (d < 2.2 && (player.speed || 0) > 6) { p.down = 4.5; p.fall = { vx: dx / d * Math.min(9, player.speed * .35), vz: dz / d * Math.min(9, player.speed * .35), y: 0, vy: Math.min(5, player.speed * .15), spin: (rnd() - .5) * 8, rot: 0 }; p.scare = 4; }
          else if (d < r) { const k = (r - d) * Math.min(1, h * 10); p.push.x += dx / d * k; p.push.y += dz / d * k; p.scare = 2; }
        }
        if (p.down > 0) {
          const f = p.fall; p.down -= h;
          if (f.y > 0 || f.vy > 0) { f.vy -= 9.81 * h; f.y = Math.max(0, f.y + f.vy * h); }
          p.push.x += f.vx * h; p.push.y += f.vz * h; const fr = Math.pow(f.y > 0 ? .7 : .05, h); f.vx *= fr; f.vz *= fr; f.rot += f.spin * h * (f.y > 0 ? 1 : 0);
        }
        if (p.scare > 0) p.scare -= h;
        p.push.multiplyScalar(1 - Math.min(1, h * .25));
        x += p.push.x; z += p.push.y; p.x = x; p.z = z;
        const walk = time * 7 * p.v * (p.scare > 0 ? 2 : 1) + p.ph, bob = p.wait > 0 ? 0 : Math.abs(Math.sin(walk)) * .05;
        const ex = x - cx0, ez = z - cz0;
        if (ex * ex + ez * ez < RP2) {
          const yaw = -(tmp.yaw + (p.dir < 0 ? Math.PI : 0));
          let lie = 0, y = bob + .06;
          if (p.down > 0) { const f = p.fall; lie = p.down > 1.2 ? Math.min(1, (4.5 - p.down) * 3) : p.down / 1.2; y = f.y + .06 + lie * .12; }      // over and down, then back on their feet
          e.set(lie * Math.PI / 2 * .95, yaw + (p.fall ? p.fall.rot : 0), 0, "YXZ"); q.setFromEuler(e); m4.compose(pos.set(x, y, z), q, one);
          bodies.setMatrixAt(pk, m4); heads.setMatrixAt(pk, m4); hair.setMatrixAt(pk, m4);
          const swing = p.wait > 0 || p.down > 0 ? 0 : Math.sin(walk) * .5;
          LEGS[0][0] = legL; LEGS[1][0] = legR; for (const [leg, sgn, off] of LEGS) { legQ.setFromAxisAngle(Z, swing * sgn); legM.compose(pos.set(0, .86, off), legQ, one); leg.setMatrixAt(pk, legT.copy(m4).multiply(legM)); }
          bodies.setColorAt(pk, p.shirt); heads.setColorAt(pk, p.skin); legL.setColorAt(pk, p.pants); legR.setColorAt(pk, p.pants); hair.setColorAt(pk, p.hairC); pk++;
        }
      }
      for (const m of [bodies, heads, legL, legR, hair]) { m.count = pk; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
}
