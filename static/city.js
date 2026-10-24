// VOID City: a New York-style grid, built entirely in code. Straight avenues (north-south) and streets
// (east-west) with lane lines and crosswalks, glass skyscrapers with setbacks, spires and rooftop helipads,
// art-deco stone towers, brick brownstone rows with stoops, brick walk-ups with fire escapes and wooden
// water towers, ground-floor shops (burgers, pizza, delis, bagels...), subway entrances, a big central park
// with a lake, Times Square billboards, two rivers and a bridge. Grass everywhere the city isn't.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [x1, z1] = p[i], [x2, z2] = p[j]; if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) c = !c; } return c; };

// ---- the grid ----
const AV = 160, ST = 70, NX = 13, NZ = 21, X0 = -960, Z0 = -700;
export const GRID = {
  AV, ST, NX, NZ, X0, Z0,
  ax: i => X0 + i * AV,                                   // avenue i runs along z at this x
  sz: j => Z0 + j * ST,                                   // street j runs along x at this z
  avW: i => (i === 6 ? 22 : 18),                          // avenue widths (x = 0 is the wide one)
  stW: j => (j === 10 ? 26 : 12),                         // street widths (z = 0 is the boulevard with the stunt track)
  lanes: { av: [2.6, 6.2], st: [3], bv: [3.2, 7.4, 10.4] },
  park: { i0: 2, i1: 5, j0: 12, j1: 18 },                 // Central Park: between avenues 2..5 and streets 12..18
};
const inPark = (x, z) => x > GRID.ax(GRID.park.i0) && x < GRID.ax(GRID.park.i1) && z > GRID.sz(GRID.park.j0) && z < GRID.sz(GRID.park.j1);
GRID.hasX = (j, i) => !(j > GRID.park.j0 && j < GRID.park.j1 && i >= GRID.park.i0 && i < GRID.park.i1);       // street j between avenues i and i+1
GRID.hasZ = (i, j) => !(i > GRID.park.i0 && i < GRID.park.i1 && j >= GRID.park.j0 && j < GRID.park.j1);       // avenue i between streets j and j+1
// traffic lights: 0 = streets (x) green, 1 = streets yellow, 2 = avenues (z) green, 3 = avenues yellow
export const phase = (i, j, t) => { const T = ((t + i * 4.3 + j * 2.1) % 26 + 26) % 26; return T < 11 ? 0 : T < 13 ? 1 : T < 24 ? 2 : 3; };

const SHOPS = ["BURGERS", "NY PIZZA", "DELI & GROCERY", "BAGELS", "COFFEE", "DINER 24/7", "HOT DOGS", "TACOS", "SUSHI", "DONUTS", "BODEGA", "PHARMACY",
  "LAUNDROMAT", "BANK", "BARBER", "CHINESE FOOD", "FRIED CHICKEN", "ICE CREAM", "HYDRA MOTORS", "SMASH BURGERS", "$1 PIZZA", "CHEESECAKE", "PRETZELS", "STEAKHOUSE",
  "RAMEN", "BOOKS", "SNEAKERS", "ELECTRONICS", "GYM", "FLOWERS", "HALAL GUYS", "WINGS"];
const NEON = ["#ff3b5c", "#3dfcff", "#ffd23d", "#7dff6a", "#ff8a3d", "#c07dff", "#ffffff", "#ff5bd8"];
const ADS = [["HYDRA LTE242", "THE DREAM CAR", "#ff2a3a", "#0b0b10"], ["VOID", "DRIVE · FLY · LAND", "#ffffff", "#101828"], ["NY PIZZA", "A SLICE FOR $1", "#ffd23d", "#8a1010"],
  ["SMASH BURGERS", "OPEN ALL NIGHT", "#ff8a3d", "#1a0d05"], ["MADE BY AWSAA", "BUILT IN CODE", "#3dfcff", "#081a24"], ["SKYLINE", "WEATHER APP", "#7cc4ff", "#0c1424"], ["COLA", "ICE COLD", "#ffffff", "#c8102e"], ["BROADWAY", "TONIGHT", "#ffd23d", "#2a0838"]];

export async function buildCity(scene, canvasTex, COARSE) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)], range = (a, b) => a + rnd() * (b - a);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const XA = GRID.ax(0), XB = GRID.ax(NX - 1), ZA = GRID.sz(0), ZB = GRID.sz(NZ - 1);
  const emissive = [];                                     // materials whose glow follows the time of day
  const glassMats = [];                                    // materials that reflect the city

  // ---- textures ----
  const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } };
  const grassTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#3f6b2e"; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${40 + rnd() * 60 | 0},${90 + rnd() * 70 | 0},${30 + rnd() * 30 | 0},${.25 + rnd() * .5})`; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 3); } }, [1, 1]);
  const asphaltTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#26272b"; g.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const c = 30 + rnd() * 40 | 0; g.fillStyle = `rgba(${c},${c},${c + 4},${rnd() * .6})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); } }, [1, 1]);
  const walkTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#9c9a95"; g.fillRect(0, 0, w, h); noise(g, w, h, 900, .06); g.fillStyle = "rgba(60,60,60,.35)"; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(0, h / 2, w, 1); g.fillRect(w / 2, 0, 1, h); }, [1, 1]);
  const GLASS = [["#1b3248", "#4b7898"], ["#0d1218", "#2a3440"], ["#3a2c1c", "#8a6a44"], ["#16302c", "#4f8a80"]];
  const glassTex = (st, lit) => canvasTex(256, 256, (g, w, h) => {           // 16 m x 16 m: 4 bays x 4 floors
    if (lit) { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); }
    else { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, GLASS[st][0]); gr.addColorStop(1, GLASS[st][1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      const x = c * 32, y = r * 64;
      if (lit) { if (rnd() < .32) { g.fillStyle = `rgba(${200 + rnd() * 55 | 0},${215 + rnd() * 40 | 0},255,${.5 + rnd() * .5})`; g.fillRect(x + 2, y + 2, 28, 50); } continue; }
      g.fillStyle = `rgba(255,255,255,${rnd() * .08})`; g.fillRect(x + 1, y + 1, 30, 52);
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, y + 52, 32, 12);                       // spandrel between floors
    }
    if (!lit) { g.fillStyle = "rgba(220,230,240,.35)"; for (let c = 0; c <= 8; c++) g.fillRect(c * 32 - 1, 0, 2, h); for (let r = 0; r <= 4; r++) g.fillRect(0, r * 64 - 1, w, 2); }
  }, [1, 1]);
  const stoneTex = lit => canvasTex(256, 256, (g, w, h) => {                   // 12 m x 12 m art-deco limestone, 3 bays x 3 floors
    g.fillStyle = lit ? "#000" : "#cdbfa4"; g.fillRect(0, 0, w, h); if (!lit) noise(g, w, h, 1500, .05);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = c * 85 + 22, y = r * 85 + 14;
      g.fillStyle = lit ? (rnd() < .4 ? `rgba(255,${200 + rnd() * 40 | 0},${130 + rnd() * 60 | 0},.9)` : "#000") : "#2b3036"; g.fillRect(x, y, 40, 56);
      if (!lit) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x - 4, y + 56, 48, 4); g.fillRect(c * 85, 0, 6, h); }
    }
  }, [1, 1]);
  const BRICK = ["#8a3b2a", "#6e3a2c", "#a0522d", "#5a4034", "#9b6b4e"];
  const brickTex = (bc, lit, escape) => canvasTex(256, 256, (g, w, h) => {     // 12 m x 9.6 m: 3 windows x 3 floors
    if (lit) { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); }
    else {
      g.fillStyle = bc; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 5) { g.fillStyle = "rgba(210,200,185,.22)"; g.fillRect(0, y, w, 1); for (let x = (y / 5) % 2 ? 0 : 6; x < w; x += 12) g.fillRect(x, y, 1, 5); }
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * .14})`; g.fillRect(rnd() * w | 0, rnd() * h | 0, 11, 4); }
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = c * 85 + 26, y = r * 85 + 18;
      if (lit) { if (rnd() < .45) { g.fillStyle = `rgba(255,${180 + rnd() * 50 | 0},${100 + rnd() * 60 | 0},${.6 + rnd() * .4})`; g.fillRect(x + 3, y + 3, 28, 44); } continue; }
      g.fillStyle = "#e9e3d6"; g.fillRect(x - 3, y - 6, 40, 6); g.fillRect(x - 2, y + 50, 38, 4);       // lintel and sill
      g.fillStyle = "#f2efe8"; g.fillRect(x, y, 34, 50); g.fillStyle = "#1e252c"; g.fillRect(x + 3, y + 3, 28, 44); g.fillStyle = "#f2efe8"; g.fillRect(x + 3, y + 24, 28, 2);
    }
    if (escape && !lit) {                                                     // a black iron fire escape over the middle column
      g.strokeStyle = "#141414"; g.lineWidth = 2;
      for (let r = 0; r < 3; r++) { const y = r * 85 + 72; g.strokeRect(96, y - 14, 64, 14); g.beginPath(); for (let k = 96; k <= 160; k += 6) { g.moveTo(k, y - 14); g.lineTo(k, y); } g.moveTo(104, y); g.lineTo(150, y + 70); g.stroke(); }
    }
  }, [1, 1]);
  const AWN = ["#b22234", "#1f6f4a", "#204a8a", "#c8962a", "#222", "#7a2a8a"];
  const shopTex = (k, lit) => canvasTex(256, 144, (g, w, h) => {               // 8 m x 4.5 m storefront
    g.fillStyle = lit ? "#000" : "#2a2a2e"; g.fillRect(0, 0, w, h);
    if (!lit) { g.fillStyle = AWN[k]; for (let x = 0; x < w; x += 32) { g.fillRect(x, 0, 16, 26); } g.fillStyle = "rgba(255,255,255,.85)"; for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 16, 26); }
    const tint = ["255,226,170", "255,240,210", "210,235,255", "255,210,160"][k % 4];
    g.fillStyle = lit ? `rgba(${tint},.95)` : "#3b4a55"; g.fillRect(12, 34, 150, 100); g.fillRect(180, 34, 64, 106);
    if (!lit) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(12, 34, 150, 4); g.fillStyle = "#151515"; g.fillRect(86, 34, 3, 100); g.fillRect(210, 34, 3, 106); }
    else { g.fillStyle = "rgba(0,0,0,.5)"; for (let i = 0; i < 6; i++) g.fillRect(20 + rnd() * 130, 90 + rnd() * 30, 8, 30); }      // people inside
  }, [1, 1]);

  // ---- materials ----
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const lit = (m, k = 1) => { m.userData.glow = k; emissive.push(m); return m; };
  const glassM = [0, 1, 2, 3].map(s => { const m = lit(mat({ map: glassTex(s, false), emissive: 0xffffff, emissiveMap: glassTex(s, true), emissiveIntensity: .9, metalness: .9, roughness: .1, envMapIntensity: 1.6 })); glassMats.push(m); return m; });
  const stoneM = lit(mat({ map: stoneTex(false), emissive: 0xffffff, emissiveMap: stoneTex(true), emissiveIntensity: .75, roughness: .85 }));
  const brickM = BRICK.map((c, i) => lit(mat({ map: brickTex(c, false, i % 2 === 0), emissive: 0xffffff, emissiveMap: brickTex(c, true, false), emissiveIntensity: .75, roughness: .9 })));
  const shopM = AWN.map((_, k) => lit(mat({ map: shopTex(k, false), emissive: 0xffffff, emissiveMap: shopTex(k, true), emissiveIntensity: 1, roughness: .5, metalness: .1 }), 1.1));
  const roofM = mat({ color: 0x3b3c40, roughness: .9 }), trimM = mat({ color: 0xd9d2c4, roughness: .7 }), darkM = mat({ color: 0x1c1d21, roughness: .6, metalness: .4 });
  for (const m of [...glassM, stoneM, ...brickM, ...shopM]) for (const t of [m.map, m.emissiveMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;

  // ---- geometry buckets: every wall of a kind goes into one merged mesh ----
  const B = new Map();
  const bucket = (m, tw, th) => { if (!B.has(m)) B.set(m, { m, tw, th, pos: [], uv: [] }); return B.get(m); };
  const quad = (o, x1, z1, x2, z2, y0, y1) => {
    const L = Math.hypot(x2 - x1, z2 - z1), u1 = L / o.tw, v0 = y0 / o.th, v1 = y1 / o.th;
    o.pos.push(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y0, z1, x2, y1, z2, x1, y1, z1);
    o.uv.push(0, v0, u1, v0, u1, v1, 0, v0, u1, v1, 0, v1);
  };
  const top = (o, x0, x1, z0, z1, y) => { o.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); o.uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0); };
  // walls go round counter-clockwise seen from above so they face out
  const walls = (o, x0, x1, z0, z1, y0, y1) => { quad(o, x0, z1, x1, z1, y0, y1); quad(o, x1, z1, x1, z0, y0, y1); quad(o, x1, z0, x0, z0, y0, y1); quad(o, x0, z0, x0, z1, y0, y1); };
  const roofB = bucket(roofM, 8, 8), trimB = bucket(trimM, 4, 4), darkB = bucket(darkM, 4, 4);
  const box = (o, x0, x1, z0, z1, y0, y1, roof = roofB) => { walls(o, x0, x1, z0, z1, y0, y1); top(roof, x0, x1, z0, z1, y1); };

  // collision boxes, in a spatial hash so lookups stay quick with thousands of buildings
  const buildings = [], footprints = [], CELL = 48, hash = new Map();
  const solid = (x0, x1, z0, z1, h, extra) => {
    const b = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, h, ...extra };
    buildings.push(b);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) { const k = cx * 10007 + cz; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(b); }
    return b;
  };
  const near = (x, z) => hash.get(Math.floor(x / CELL) * 10007 + Math.floor(z / CELL)) || [];
  const scratch = []; let stamp = 1;
  const nearFast = (x, z, r) => {           // like nearR but reuses one array and marks boxes instead of building a Set
    scratch.length = 0; stamp++;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) { const l = hash.get(cx * 10007 + cz); if (l) for (const b of l) if (b._s !== stamp) { b._s = stamp; scratch.push(b); } }
    return scratch;
  };
  const nearR = (x, z, r) => { const out = new Set(); for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (const b of hash.get(cx * 10007 + cz) || []) out.add(b); return [...out]; };

  // instanced props, gathered as lists then placed at the end
  const P = { trees: [], lamps: [], hydrants: [], towers: [], subway: [], aviation: [], helipads: [], benches: [], burgers: [], pizzas: [], signs: [], awn: [], stoops: [], bins: [] };

  // ---- ground: grass everywhere, asphalt under the grid, sidewalks on every block ----
  // land: Manhattan between the rivers, New Jersey west of the Hudson, Brooklyn east of the East River (the rivers are gaps)
  const W1 = XA - 60, W2 = XB + 60, HW0 = W1 - 600, EW1 = W2 + 700, WATER_Y = -.45;
  const grassMat = mat({ map: grassTex, roughness: .95, color: 0xb8d0a0 });
  grassTex.repeat.set(1, 1);
  for (const [a, b] of [[-20000, HW0], [W1, W2], [EW1, 20000]]) {
    const g = new THREE.PlaneGeometry(b - a, 40000).rotateX(-Math.PI / 2), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (b - a) / 10, uv.getY(k) * 4000);
    const m = new THREE.Mesh(g, grassMat); m.position.set((a + b) / 2, -.12, 0); scene.add(m);
  }
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(XB - XA + 40, ZB - ZA + 40).rotateX(-Math.PI / 2), mat({ map: asphaltTex, roughness: .82, envMapIntensity: .35 }));
  asphaltTex.repeat.set((XB - XA) / 8, (ZB - ZA) / 8); asphalt.position.set((XA + XB) / 2, 0, (ZA + ZB) / 2); scene.add(asphalt);
  const walkG = [], parkG = [];
  const slab = (list, x0, x1, z0, z1, y) => list.push(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2));

  // ---- road markings: lane lines along every segment, zebra crossings at every corner ----
  const markTex = (kind) => canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const lane = (x, dashed, col) => { g.fillStyle = col; for (let y = 0; y < h; y += dashed ? 64 : 256) g.fillRect(x, y, 2, dashed ? 32 : 256); };
    if (kind === "av") { lane(30, false, "#f2c230"); lane(34, false, "#f2c230"); lane(14, true, "#eee"); lane(50, true, "#eee"); }
    else if (kind === "bv") { lane(30, false, "#f2c230"); lane(34, false, "#f2c230"); lane(18, true, "#eee"); lane(46, true, "#eee"); lane(8, true, "#eee"); lane(56, true, "#eee"); }
    else lane(31, true, "#f2c230");
  }, [1, 1]);
  const zebra = canvasTex(32, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "#eee"; g.fillRect(2, 4, w - 4, 34); }, [1, 1]);
  const markG = { av: [], bv: [], st: [] }, zebraG = [];
  const strip = (list, x0, z0, x1, z1, w, y, repeatLen) => {   // a quad from (x0,z0) to (x1,z1), w wide, uv v along the length
    const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, nx = -dz * w / 2, nz = dx * w / 2, g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz], 3));
    const r = L / repeatLen; g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, r, 0, 0, 1, r, 0, r], 2)); g.setAttribute("normal", new THREE.Float32BufferAttribute(Array(18).fill(0).map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    list.push(g);
  };
  const roads = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX - 1; i++) {                 // streets
    if (!GRID.hasX(j, i)) continue;
    const z = GRID.sz(j), xa = GRID.ax(i) + GRID.avW(i) / 2, xb = GRID.ax(i + 1) - GRID.avW(i + 1) / 2, w = GRID.stW(j);
    roads.push({ p: [[GRID.ax(i), z], [GRID.ax(i + 1), z]], w });
    strip(j === 10 ? markG.bv : markG.st, xa + 3, z, xb - 3, z, w, .03, 16);
    if (w < 20 || i < 4 || i > 8) for (const x of [xa + 1.5, xb - 1.5]) strip(zebraG, x, z - w / 2 + .4, x, z + w / 2 - .4, 3, .035, 1.2);
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ - 1; j++) {                 // avenues
    if (!GRID.hasZ(i, j)) continue;
    const x = GRID.ax(i), za = GRID.sz(j) + GRID.stW(j) / 2, zb = GRID.sz(j + 1) - GRID.stW(j + 1) / 2, w = GRID.avW(i);
    roads.push({ p: [[x, GRID.sz(j)], [x, GRID.sz(j + 1)]], w });
    strip(markG.av, x, za + 3, x, zb - 3, w, .03, 16);
    for (const z of [za + 1.5, zb - 1.5]) strip(zebraG, x - w / 2 + .4, z, x + w / 2 - .4, z, 3, .035, 1.2);
  }
  // the bridge over the East River carries the boulevard on; roads past the edges lead to it and to the piers
  roads.push({ p: [[XB, 0], [1700, 0]], w: 26 });
  for (const [k, list] of Object.entries(markG)) if (list.length) { const t = markTex(k); t.wrapT = THREE.RepeatWrapping; scene.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: 0xdddddd, side: THREE.DoubleSide }))); }
  zebra.wrapT = THREE.RepeatWrapping;
  scene.add(new THREE.Mesh(mergeGeometries(zebraG), new THREE.MeshBasicMaterial({ map: zebra, transparent: true, depthWrite: false, color: 0xcccccc, side: THREE.DoubleSide })));

  // ---- the blocks ----
  const SIGN_N = SHOPS.length;
  const signAtlas = canvasTex(1024, 1024, (g, w) => {
    for (let k = 0; k < 32; k++) {
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 64, col = NEON[k % NEON.length], name = SHOPS[k % SIGN_N];
      g.fillStyle = "#0b0b0e"; g.fillRect(x + 2, y + 2, 508, 60);
      g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `900 ${name.length > 12 ? 34 : 42}px Unbounded, "Arial Black", Impact, sans-serif`; g.fillText(name, x + 256, y + 34);
      g.shadowBlur = 0; g.strokeStyle = col; g.globalAlpha = .6; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, 500, 52); g.globalAlpha = 1;
    }
  });
  const signGeo = [];
  const signQuad = (k, cx, cz, nx, nz, y, w, h) => {      // a sign facing (nx, nz) at the wall point (cx, cz)
    const tx = -nz, tz = nx, a = [cx + nx * .08 - tx * w / 2, cz + nz * .08 - tz * w / 2], b = [cx + nx * .08 + tx * w / 2, cz + nz * .08 + tz * w / 2];
    const u0 = (k % 2) * .5, v1 = 1 - Math.floor(k / 2) / 16, v0 = v1 - 1 / 16, g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([a[0], y, a[1], b[0], y, b[1], b[0], y + h, b[1], a[0], y, a[1], b[0], y + h, b[1], a[0], y + h, a[1]], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, v0, u0 + .5, v0, u0 + .5, v1, u0, v0, u0 + .5, v1, u0, v1], 2));
    signGeo.push(g);
  };
  // a storefront band round the ground floor (on the sides that face a road), with a sign over each shop
  const shops = (x0, x1, z0, z1, faces) => {
    const o = bucket(pick(shopM), 8, 4.5);
    for (const f of faces) {
      const [ax, az, bx, bz, nx, nz] = f === "s" ? [x0, z1, x1, z1, 0, 1] : f === "n" ? [x1, z0, x0, z0, 0, -1] : f === "e" ? [x1, z1, x1, z0, 1, 0] : [x0, z0, x0, z1, -1, 0];
      quad(o, ax, az, bx, bz, 0, 4.5);
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / 14));
      for (let s = 0; s < n; s++) {
        const t = (s + .5) / n, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, k = Math.floor(rnd() * 32);
        signQuad(k, cx, cz, nx, nz, 4.6, Math.min(L / n * .85, 9), 1.15);
        if (rnd() < .07) (SHOPS[k % SIGN_N].includes("BURGER") ? P.burgers : SHOPS[k % SIGN_N].includes("PIZZA") ? P.pizzas : P.burgers).push([cx + nx * 2.2, cz + nz * 2.2]);
      }
    }
  };
  const tower = (x0, x1, z0, z1, H, style, film) => {
    const glass = style < 4, o = glass ? bucket(glassM[style], 16, 16) : bucket(stoneM, 12, 12);
    let ax0 = x0, ax1 = x1, az0 = z0, az1 = z1, y = 0;
    const tiers = H > 120 ? 1 + Math.floor(rnd() * 3) : 1;
    shops(x0, x1, z0, z1, ["s", "n", "e", "w"]); const base = 4.5;
    for (let t = 0; t < tiers; t++) {
      const h = t === tiers - 1 ? H : y + (H - y) * range(.45, .7), y0 = t === 0 ? base : y;
      walls(o, ax0, ax1, az0, az1, y0, h); top(roofB, ax0, ax1, az0, az1, h);
      if (!glass) { walls(trimB, ax0 - .3, ax1 + .3, az0 - .3, az1 + .3, h - .8, h); }
      solid(ax0, ax1, az0, az1, h);
      y = h; const ix = (ax1 - ax0) * range(.1, .18), iz = (az1 - az0) * range(.1, .18);
      if (t < tiers - 1) { ax0 += ix; ax1 -= ix; az0 += iz; az1 -= iz; }
    }
    const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2, wTop = Math.min(ax1 - ax0, az1 - az0);
    const crown = film ? 0 : rnd();
    if (crown < .22 && H > 150) {                                             // a spire with an antenna
      const sh = H * range(.12, .22); const g = new THREE.ConeGeometry(wTop * .32, sh, 4).rotateY(Math.PI / 4).translate(cx, H + sh / 2, cz);
      spires.push(g); const ant = new THREE.CylinderGeometry(.25, .35, sh * .6, 6).translate(cx, H + sh + sh * .3, cz); spires.push(ant);
      P.aviation.push([cx, H + sh * 1.6, cz]); solid(cx - wTop * .2, cx + wTop * .2, cz - wTop * .2, cz + wTop * .2, H + sh);
    } else if (crown < .5 && wTop > 22) {                                    // a helipad you can land on
      P.helipads.push({ x: cx, z: cz, y: H, r: Math.min(10, wTop / 2 - 1) }); P.aviation.push([ax0 + 1, H + 1, az0 + 1], [ax1 - 1, H + 1, az1 - 1]);
    } else { P.aviation.push([cx, H + 4, cz]); spires.push(new THREE.CylinderGeometry(.2, .3, 8, 6).translate(cx, H + 4, cz)); }
    footprints.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  };
  const spires = [];
  const walkup = (x0, x1, z0, z1, floors, faces) => {                        // brick, shops below, a water tower on top
    const o = bucket(pick(brickM), 12, 9.6), h = 4.5 + floors * 3.2;
    shops(x0, x1, z0, z1, faces);
    const other = ["s", "n", "e", "w"].filter(f => !faces.includes(f));
    for (const f of other) { const [ax, az, bx, bz] = f === "s" ? [x0, z1, x1, z1] : f === "n" ? [x1, z0, x0, z0] : f === "e" ? [x1, z1, x1, z0] : [x0, z0, x0, z1]; quad(o, ax, az, bx, bz, 0, 4.5); }
    walls(o, x0, x1, z0, z1, 4.5, h); top(roofB, x0, x1, z0, z1, h); walls(trimB, x0 - .35, x1 + .35, z0 - .35, z1 + .35, h - .7, h + .5);
    solid(x0, x1, z0, z1, h + .5);
    if (rnd() < .65) P.towers.push([x0 + (x1 - x0) * range(.25, .75), h + .5, z0 + (z1 - z0) * range(.25, .75), range(.85, 1.15)]);
    footprints.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  };
  const brownstones = (x0, x1, zEdge, side) => {                            // a row along a street: side +1 = the row faces +z
    let x = x0;
    while (x < x1 - 5) {
      const w = Math.min(x1 - x, range(6, 8.5)), d = range(13, 16), h = 3.2 * (3 + Math.floor(rnd() * 2)) + 1.2;
      const za = side > 0 ? zEdge - d : zEdge, zb = side > 0 ? zEdge : zEdge + d;
      const o = bucket(pick(brickM), 12, 9.6);
      walls(o, x, x + w, za, zb, 0, h); top(roofB, x, x + w, za, zb, h); walls(trimB, x - .2, x + w + .2, za - .2, zb + .2, h - .6, h + .3);
      solid(x, x + w, za, zb, h + .3);
      P.stoops.push([x + w / 2, side > 0 ? zEdge + 1.1 : zEdge - 1.1, side]);
      footprints.push([[x, za], [x + w, za], [x + w, zb], [x, zb]]);
      x += w;
    }
  };
  const blockRect = (i, j) => [GRID.ax(i) + GRID.avW(i) / 2, GRID.ax(i + 1) - GRID.avW(i + 1) / 2, GRID.sz(j) + GRID.stW(j) / 2, GRID.sz(j + 1) - GRID.stW(j + 1) / 2];
  const pk = GRID.park;
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
    const [bx0, bx1, bz0, bz1] = blockRect(i, j), cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    if (i >= pk.i0 && i < pk.i1 && j >= pk.j0 && j < pk.j1) continue;      // Central Park is built below
    slab(walkG, bx0, bx1, bz0, bz1, .06);
    const W4 = 4, x0 = bx0 + W4, x1 = bx1 - W4, z0 = bz0 + W4, z1 = bz1 - W4;
    // lamps and trees along the sidewalks, hydrants and bins at the corners
    for (let x = bx0 + 8; x < bx1 - 4; x += 26) { P.lamps.push([x, bz0 + 1, 0], [x, bz1 - 1, Math.PI]); }
    for (let z = bz0 + 10; z < bz1 - 4; z += 26) { P.lamps.push([bx0 + 1, z, Math.PI / 2], [bx1 - 1, z, -Math.PI / 2]); }
    P.hydrants.push([bx0 + 2, bz0 + 2]); P.bins.push([bx1 - 2, bz1 - 2]);
    if (rnd() < .45) P.subway.push([bx0 + 2.6, bz0 + 6, 0]);
    const midtown = cx > -170 && cx < 650 && cz > -570 && cz < -60, downtown = cx > 470 && cz > 270, film = cz > 0 && cz < 300 && cx > 100;
    const towerZone = (midtown || downtown) && !film;
    if (towerZone) {
      const n = bx1 - bx0 > 120 ? 3 : 2, lw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const lx0 = x0 + k * lw + 1.5, lx1 = x0 + (k + 1) * lw - 1.5;
        let H = range(90, downtown ? 330 : 300) * (k === 1 ? 1.15 : 1);
        if (downtown && cz < 360) H = Math.min(H, 170);
        if (rnd() < .3) { tower(lx0, lx1, z0, (z0 + z1) / 2 - 1, H * .7, Math.floor(rnd() * 5)); tower(lx0, lx1, (z0 + z1) / 2 + 1, z1, H, Math.floor(rnd() * 5)); }
        else tower(lx0, lx1, z0, z1, H, Math.floor(rnd() * 5));
      }
      continue;
    }
    // residential: walk-ups on the avenue ends (shops facing the avenue), brownstone rows between, backyards inside
    const end = range(22, 30);
    walkup(x0, x0 + end, z0, z1, 4 + Math.floor(rnd() * (film ? 3 : 6)), ["w", "n", "s"]);
    walkup(x1 - end, x1, z0, z1, 4 + Math.floor(rnd() * (film ? 3 : 6)), ["e", "n", "s"]);
    if (j === 9 || j === 10) {                                                 // the boulevard blocks: shops all along
      const n = Math.floor((x1 - x0 - 2 * end) / 24);
      for (let k = 0; k < n; k++) { const a = x0 + end + 2 + k * 24, b = a + 22; walkup(a, b, j === 9 ? z1 - 20 : z0, j === 9 ? z1 : z0 + 20, 3 + Math.floor(rnd() * 3), [j === 9 ? "s" : "n"]); }
    } else { brownstones(x0 + end + 1, x1 - end - 1, z0, -1); brownstones(x0 + end + 1, x1 - end - 1, z1, 1); }
    slab(parkG, x0 + end + 2, x1 - end - 2, z0 + 17, z1 - 17, .08);           // backyards
    for (let k = 0; k < 6; k++) P.trees.push([range(x0 + end + 4, x1 - end - 4), range(z0 + 19, z1 - 19), range(.7, 1.1)]);
    for (let x = x0 + end + 6; x < x1 - end - 4; x += 11) { P.trees.push([x, bz0 + 2.2, range(.6, .9)], [x, bz1 - 2.2, range(.6, .9)]); }
  }

  // ---- Central Park: lawns, paths, a lake, lots of trees ----
  const PX0 = GRID.ax(pk.i0) + GRID.avW(pk.i0) / 2, PX1 = GRID.ax(pk.i1) - GRID.avW(pk.i1) / 2, PZ0 = GRID.sz(pk.j0) + GRID.stW(pk.j0) / 2, PZ1 = GRID.sz(pk.j1) - GRID.stW(pk.j1) / 2;
  slab(walkG, PX0, PX1, PZ0, PZ1, .05);
  slab(parkG, PX0 + 4, PX1 - 4, PZ0 + 4, PZ1 - 4, .09);
  const lake = { x: (PX0 + PX1) / 2 + 60, z: (PZ0 + PZ1) / 2 + 40, rx: 70, rz: 46 };
  const lakeM = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), null);
  lakeM.scale.set(lake.rx, 1, lake.rz); lakeM.position.set(lake.x, .11, lake.z); scene.add(lakeM);
  const lawn = { x: (PX0 + PX1) / 2 - 80, z: (PZ0 + PZ1) / 2 - 60 };
  const pathG = [];
  for (const [ax, az, bx, bz] of [[PX0 + 4, PZ0 + 40, PX1 - 4, PZ1 - 60], [PX0 + 30, PZ1 - 4, PX1 - 30, PZ0 + 4], [PX0 + 4, (PZ0 + PZ1) / 2, PX1 - 4, (PZ0 + PZ1) / 2 - 30], [(PX0 + PX1) / 2, PZ0 + 4, (PX0 + PX1) / 2 - 20, PZ1 - 4]]) strip(pathG, ax, az, bx, bz, 5, .1, 5);
  scene.add(new THREE.Mesh(mergeGeometries(pathG), mat({ color: 0xbfb49c, roughness: .95, side: THREE.DoubleSide })));
  for (let k = 0; k < (COARSE ? 380 : 700); k++) {
    const x = range(PX0 + 6, PX1 - 6), z = range(PZ0 + 6, PZ1 - 6);
    if (((x - lake.x) / (lake.rx + 6)) ** 2 + ((z - lake.z) / (lake.rz + 6)) ** 2 < 1 || Math.hypot(x - lawn.x, z - lawn.z) < 45) continue;
    P.trees.push([x, z, range(.8, 1.5)]);
  }
  for (let k = 0; k < 40; k++) { const a = rnd() * 6.28; P.benches.push([lawn.x + Math.cos(a) * 50, lawn.z + Math.sin(a) * 50, a]); }

  // ---- rivers on both sides, esplanades, piers, a bridge east ----
  const waveTex = (() => {                                  // a tiling normal map made from a few crossing sine waves
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), img = g.createImageData(N, N), h = new Float32Array(N * N);
    const waves = Array.from({ length: 7 }, () => [1 + Math.floor(rnd() * 6), Math.floor(rnd() * 6) - 3, rnd() * 6.28, .4 + rnd()]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [a, b, ph, amp] of waves) v += amp * Math.sin(2 * Math.PI * (a * x + b * y) / N + ph); h[y * N + x] = v; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nx = -dx * 2, ny = -dy * 2, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
      img.data[k] = (nx / l * .5 + .5) * 255; img.data[k + 1] = (ny / l * .5 + .5) * 255; img.data[k + 2] = (1 / l * .5 + .5) * 255; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x1d5268, roughness: .08, metalness: .1, normalMap: waveTex, normalScale: new THREE.Vector2(.45, .45), clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.3 });
  waveTex.repeat.set(60, 400);
  glassMats.push(waterMat);
  const water = waterMat;
  for (const [a, b] of [[HW0, W1], [W2, EW1]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 40000).rotateX(-Math.PI / 2), water); m.position.set((a + b) / 2, WATER_Y, 0); m.receiveShadow = true; scene.add(m); }
  // embankments: a stone wall down to the water on every bank, and a band of foam where the water meets it
  const bank = mat({ color: 0x8a8378, roughness: .9 }), foam = new THREE.MeshBasicMaterial({ color: 0xe8f2f6, transparent: true, opacity: .32, depthWrite: false });
  for (const [x, side] of [[W1, -1], [HW0, 1], [W2, 1], [EW1, -1]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3.2, 40000).translate(x - side * 1, -1.45, 0), bank); scene.add(wall);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 40000).rotateX(-Math.PI / 2), foam); f.position.set(x + side * 1.25, WATER_Y + .02, 0); scene.add(f);
  }
  for (let k = 0; k < 500; k++) P.trees.push([range(HW0 - 900, HW0 - 20), range(-1500, 1500), range(.8, 1.4)]);
  for (const [a, b] of [[W1, XA - 9], [XB + 9, W2]]) slab(walkG, a, b, ZA - 200, ZB + 200, .04);
  for (let z = ZA; z <= ZB; z += 140) { const pier = new THREE.Mesh(new THREE.BoxGeometry(80, 1.2, 16).translate(W1 - 40, -.55, z), mat({ color: 0x6b6258, roughness: .9 })); scene.add(pier); P.lamps.push([W1 - 78, z + 7, 0]); }
  {   // the bridge: a deck at road level, two stone towers, cables
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W2 + 700 - W2 + 120, 1.6, 30).translate((W2 + W2 + 700) / 2, -.75, 0), mat({ color: 0x55565c, roughness: .8 }));
    scene.add(deck);
    for (const tx of [W2 + 170, W2 + 530]) for (const s of [-1, 1]) { box(bucket(stoneM, 12, 12), tx - 6, tx + 6, s * 15 - 3, s * 15 + 3, 0, 110); solid(tx - 6, tx + 6, s * 15 - 3, s * 15 + 3, 110); }
    const cab = [];
    for (const s of [-1, 1]) { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(W2 + 170, 108, s * 15), new THREE.Vector3(W2 + 350, 12, s * 15), new THREE.Vector3(W2 + 530, 108, s * 15)); cab.push(new THREE.TubeGeometry(curve, 60, .6, 6)); for (let x = W2 + 190; x < W2 + 520; x += 14) { const y = curve.getPoint((x - W2 - 170) / 360).y; cab.push(new THREE.CylinderGeometry(.12, .12, y, 4).translate(x, y / 2, s * 15)); } }
    scene.add(new THREE.Mesh(mergeGeometries(cab), darkM));
    for (let x = W2; x < W2 + 700; x += 30) P.lamps.push([x, 13, 0], [x, -13, Math.PI]);
  }
  lakeM.material = waterMat;
  { const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 64).rotateX(-Math.PI / 2), mat({ color: 0xa89a80, roughness: .95 })); shore.scale.set(lake.rx, 1, lake.rz); shore.position.set(lake.x, .12, lake.z); scene.add(shore); }
  const brooklyn = W2 + 700;
  for (let k = 0; k < 90; k++) { const x = range(brooklyn + 20, brooklyn + 800), z = range(-600, 600); if (Math.abs(z) < 20) continue; const w = range(8, 18), d = range(8, 18), h = range(6, 20); walkup(x, x + w, z, z + d, Math.max(1, Math.round((h - 4.5) / 3.2)), []); }
  for (let k = 0; k < 300; k++) P.trees.push([range(brooklyn, brooklyn + 900), range(-700, 700), range(.7, 1.2)]);
  for (let k = 0; k < (COARSE ? 400 : 900); k++) { const x = range(XA - 40, XB + 40), z = pick([range(ZB + 20, ZB + 600), range(ZA - 600, ZA - 20)]); P.trees.push([x, z, range(.8, 1.4)]); }

  // ---- Times Square: big glowing billboards round one intersection ----
  const TSX = GRID.ax(7), TSZ = GRID.sz(6), billboards = [];
  ADS.forEach(([t1, t2, fg, bg], k) => {
    const tex = canvasTex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg); gr.addColorStop(1, "#000"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.shadowColor = fg; g.shadowBlur = 24; g.textAlign = "center"; g.font = `900 ${t1.length > 10 ? 54 : 74}px Unbounded, "Arial Black", Impact, sans-serif`; g.fillText(t1, w / 2, 130);
      g.shadowBlur = 0; g.font = "700 30px Inter, sans-serif"; g.fillStyle = "#fff"; g.fillText(t2, w / 2, 190); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    const a = k / ADS.length * Math.PI * 2 + .4, r = 22 + (k % 2) * 4;
    m.position.set(TSX + Math.cos(a) * r * 1.4, 20 + (k % 3) * 15, TSZ + Math.sin(a) * r);
    m.lookAt(TSX, m.position.y, TSZ); m.translateZ(-2); scene.add(m); billboards.push(m); emissive.push(m.material);
  });

  // ---- finish: one mesh per material per 320 m tile, so whatever is off screen (or out of the shadow box) is skipped ----
  const TILE = 640, tileOf = (x, z) => Math.floor(x / TILE) * 1000 + Math.floor(z / TILE);
  for (const o of B.values()) {
    if (!o.pos.length) continue;
    const tiles = new Map();
    for (let t = 0, u = 0; t < o.pos.length; t += 9, u += 6) {
      const k = tileOf((o.pos[t] + o.pos[t + 3] + o.pos[t + 6]) / 3, (o.pos[t + 2] + o.pos[t + 5] + o.pos[t + 8]) / 3);
      let a = tiles.get(k); if (!a) tiles.set(k, a = { pos: [], uv: [] });
      for (let i = 0; i < 9; i++) a.pos.push(o.pos[t + i]); for (let i = 0; i < 6; i++) a.uv.push(o.uv[u + i]);
    }
    for (const a of tiles.values()) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv, 2)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, o.m); m.userData.solid = true; scene.add(m);
    }
  }
  if (spires.length) scene.add(new THREE.Mesh(mergeGeometries(spires.map(g => g.toNonIndexed())), mat({ color: 0xb8bcc4, metalness: .9, roughness: .25 })));
  const walkMat = mat({ map: walkTex, roughness: .9 }); walkTex.repeat.set(1, 1);
  const wg = mergeGeometries(walkG); { const p = wg.attributes.position, uv = wg.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4); }
  scene.add(new THREE.Mesh(wg, walkMat));
  const pg = mergeGeometries(parkG); { const p = pg.attributes.position, uv = pg.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 10, p.getZ(k) / 10); }
  const parkTex = grassTex.clone(); parkTex.repeat.set(1, 1); parkTex.needsUpdate = true;
  scene.add(new THREE.Mesh(pg, mat({ map: parkTex, roughness: .95, color: 0xc8e0a8 })));
  const signMat = new THREE.MeshBasicMaterial({ map: signAtlas, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }); emissive.push(signMat);
  { const tiles = new Map(); for (const g of signGeo) { const p0 = g.attributes.position, k = tileOf(p0.getX(0), p0.getZ(0)); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(g); } for (const list of tiles.values()) scene.add(new THREE.Mesh(mergeGeometries(list), signMat)); }

  const instT = (geo, material, list, place, colorOf) => {
    const groups = new Map();
    list.forEach((it, i) => { place(it, i); const e = m4.elements, k = tileOf(e[12], e[14]); let gr = groups.get(k); if (!gr) groups.set(k, gr = []); gr.push([m4.clone(), colorOf ? colorOf(it, i) : null]); });
    for (const arr of groups.values()) { const mesh = new THREE.InstancedMesh(geo, material, arr.length); arr.forEach(([m, c], j) => { mesh.setMatrixAt(j, m); if (c) mesh.setColorAt(j, c); }); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); scene.add(mesh); }
  };
  const inst = (geo, material, list, place) => { const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); list.forEach((it, i) => { place(it, i); mesh.setMatrixAt(i, m4); }); mesh.instanceMatrix.needsUpdate = true; if (list.length) scene.add(mesh); return mesh; };
  const at = (x, y, z, ry = 0, s = 1) => m4.compose(v.set(x, y, z), q0.setFromAxisAngle(Y, ry), sc.set(s, s, s));
  // trees: a trunk and two leafy blobs, each a little different green
  instT(new THREE.CylinderGeometry(.18, .28, 3, 5).translate(0, 1.5, 0), mat({ color: 0x5a4330, roughness: .9 }), P.trees, ([x, z, s]) => at(x, 0, z, 0, s));
  const leafGeo = mergeGeometries([new THREE.IcosahedronGeometry(2.2, 0).translate(0, 4.4, 0), new THREE.IcosahedronGeometry(1.7, 0).translate(.8, 5.8, .3), new THREE.IcosahedronGeometry(1.5, 0).translate(-.9, 5.3, -.4)].map(g => g.toNonIndexed()));
  instT(leafGeo, mat({ roughness: .85, flatShading: true }), P.trees, ([x, z, s], i) => at(x, 0, z, i, s), () => new THREE.Color().setHSL(.26 + rnd() * .08, .45 + rnd() * .2, .26 + rnd() * .12));
  // street lamps: a pole, an arm and a warm head
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcf8a).multiplyScalar(2.4), toneMapped: false }); emissive.push(lampHead); lampHead.userData.glow = 2.4; lampHead.userData.base = new THREE.Color(0xffcf8a);
  instT(mergeGeometries([new THREE.CylinderGeometry(.1, .14, 8, 6).translate(0, 4, 0), new THREE.BoxGeometry(.1, .1, 2).translate(0, 7.9, 1)].map(g => g.toNonIndexed())), darkM, P.lamps, ([x, z, ry]) => at(x, 0, z, ry));
  instT(new THREE.BoxGeometry(.5, .14, .8), lampHead, P.lamps, ([x, z, ry]) => { at(0, 0, 0, ry); v.set(0, 7.85, 1.8).applyQuaternion(q0); m4.compose(v.add(new THREE.Vector3(x, 0, z)), q0, sc.set(1, 1, 1)); });
  instT(new THREE.CylinderGeometry(.22, .26, .8, 8).translate(0, .4, 0), mat({ color: 0xc8202a, roughness: .5 }), P.hydrants, ([x, z]) => at(x, 0, z));
  instT(new THREE.CylinderGeometry(.35, .3, 1, 8).translate(0, .5, 0), mat({ color: 0x2d4a2d, roughness: .7 }), P.bins, ([x, z]) => at(x, 0, z));
  // NYC water towers: wooden barrel, cone roof, steel legs
  const towerGeo = mergeGeometries([new THREE.CylinderGeometry(2.4, 2.4, 4.5, 14).translate(0, 4.7, 0), new THREE.ConeGeometry(2.6, 1.6, 14).translate(0, 7.75, 0),
    ...[[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]].map(([a, b]) => new THREE.CylinderGeometry(.12, .12, 2.5, 4).translate(a, 1.25, b))].map(g => g.toNonIndexed()));
  instT(towerGeo, mat({ color: 0x6e5238, roughness: .9 }), P.towers, ([x, y, z, s]) => at(x, y, z, 0, s));
  P.towers.forEach(([x, y, z, s]) => solid(x - 2.4 * s, x + 2.4 * s, z - 2.4 * s, z + 2.4 * s, y + 8.5 * s));
  // subway entrances: green railings, two green globes, a dark stair
  const globe = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff6a).multiplyScalar(2), toneMapped: false }); globe.userData.glow = 2; globe.userData.base = new THREE.Color(0x3dff6a); emissive.push(globe);
  instT(mergeGeometries([new THREE.BoxGeometry(2.4, 1.1, .08).translate(0, .55, -1.6), new THREE.BoxGeometry(2.4, 1.1, .08).translate(0, .55, 1.6), new THREE.BoxGeometry(.08, 1.1, 3.2).translate(1.2, .55, 0),
    new THREE.CylinderGeometry(.05, .05, 2.6, 4).translate(-1.2, 1.3, -1.6), new THREE.CylinderGeometry(.05, .05, 2.6, 4).translate(-1.2, 1.3, 1.6)].map(g => g.toNonIndexed())), mat({ color: 0x1f4d2a, metalness: .6, roughness: .4 }), P.subway, ([x, z]) => at(x, 0, z));
  instT(new THREE.SphereGeometry(.28, 12, 8), globe, P.subway.flatMap(([x, z]) => [[x - 1.2, z - 1.6], [x - 1.2, z + 1.6]]), ([x, z]) => at(x, 2.75, z));
  instT(new THREE.PlaneGeometry(2.3, 3.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505 }), P.subway, ([x, z]) => at(x + .05, .08, z));
  const stoopGeo = mergeGeometries([0, 1, 2, 3].map(k => new THREE.BoxGeometry(2, .3, .5).translate(0, .15 + k * .3, -k * .45)).map(g => g.toNonIndexed()));
  instT(stoopGeo, mat({ color: 0x7a5a44, roughness: .9 }), P.stoops, ([x, z, s]) => at(x, 0, z + (s > 0 ? 0 : 0), s > 0 ? Math.PI : 0));
  instT(new THREE.BoxGeometry(1.8, .5, .6).translate(0, .45, 0), mat({ color: 0x4a3a2a, roughness: .9 }), P.benches, ([x, z, a]) => at(x, 0, z, -a));
  // giant burgers and pizza slices on some food places, because why not
  const bun = mat({ color: 0xc88a3a, roughness: .6 }), patty = mat({ color: 0x4a2a18, roughness: .8 }), cheese = mat({ color: 0xffc21a, roughness: .5 }), lettuce = mat({ color: 0x4caf2a, roughness: .7 });
  // (built as one merged mesh per material: 80 sculptures in 5 draw calls)
  const food = new Map(), pepM = mat({ color: 0xb01818 });
  const putFood = (geo, m, mtx) => { if (!food.has(m)) food.set(m, []); food.get(m).push(geo.toNonIndexed().applyMatrix4(mtx)); };
  const T = (x, y, z, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1));
  for (const [x, z] of P.burgers.slice(0, 40)) {
    putFood(new THREE.CylinderGeometry(1.5, 1.5, .5, 20), bun, T(x, 5.6, z)); putFood(new THREE.CylinderGeometry(1.6, 1.6, .25, 20), lettuce, T(x, 5.95, z)); putFood(new THREE.CylinderGeometry(1.55, 1.55, .45, 20), patty, T(x, 6.25, z));
    putFood(new THREE.BoxGeometry(2.6, .1, 2.6), cheese, T(x, 6.52, z)); putFood(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), bun, T(x, 6.6, z));
  }
  for (const [x, z] of P.pizzas.slice(0, 40)) {
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-1.3, 3), new THREE.Vector2(1.3, 3)]), base = T(x, 5, z, rnd() * 6, Math.PI);
    putFood(new THREE.ExtrudeGeometry(sh, { depth: .25, bevelEnabled: false }), cheese, base);
    putFood(new THREE.CylinderGeometry(.25, .25, 2.8, 8).rotateZ(Math.PI / 2), bun, base.clone().multiply(T(0, 3, .12)));
    for (let k = 0; k < 4; k++) putFood(new THREE.CylinderGeometry(.22, .22, .06, 12).rotateX(Math.PI / 2), pepM, base.clone().multiply(T((rnd() - .5) * 1.2, .8 + rnd() * 1.8, .28)));
  }
  for (const [m, list] of food) scene.add(new THREE.Mesh(mergeGeometries(list.map(g => { g.deleteAttribute("uv"); return g; })), m));
  // helipads and red aviation lights
  const padTex = canvasTex(256, 256, (g, w) => { g.fillStyle = "#2a2c30"; g.fillRect(0, 0, w, w); g.strokeStyle = "#ffd23d"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke(); g.fillStyle = "#fff"; g.font = "900 150px sans-serif"; g.textAlign = "center"; g.fillText("H", 128, 180); });
  for (const h of P.helipads) { const m = new THREE.Mesh(new THREE.CircleGeometry(h.r, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: padTex, roughness: .8 })); m.position.set(h.x, h.y + .05, h.z); scene.add(m); }
  const avMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(3), toneMapped: false, transparent: true });
  inst(new THREE.SphereGeometry(.6, 8, 6), avMat, P.aviation, ([x, y, z]) => at(x, y, z));

  // ---- traffic lights at every intersection: a pole on two corners, four heads that change colour ----
  const tlHeads = [], tlIdx = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const x = GRID.ax(i), z = GRID.sz(j), aw = GRID.avW(i) / 2 + 1.5, sw = GRID.stW(j) / 2 + 1.5;
    if (inPark(x, z)) continue;
    // heads for traffic coming along x (facing -x and +x) and along z
    tlHeads.push([x - aw, z + sw, 0, 0], [x + aw, z - sw, Math.PI, 0], [x - aw, z - sw, Math.PI / 2, 1], [x + aw, z + sw, -Math.PI / 2, 1]);
    tlIdx.push([i, j]);
  }
  inst(new THREE.CylinderGeometry(.12, .14, 5.5, 6).translate(0, 2.75, 0), darkM, tlHeads, ([x, z]) => at(x, 0, z));
  inst(new THREE.BoxGeometry(.5, 1.3, .5).translate(0, 5.2, 0), darkM, tlHeads, ([x, z, ry]) => at(x, 0, z, ry));
  const tlMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const tlMesh = inst(new THREE.SphereGeometry(.2, 8, 6), tlMat, tlHeads, ([x, z, ry]) => { at(0, 0, 0, ry); v.set(-.28, 5.2, 0).applyQuaternion(q0); m4.compose(v.add(new THREE.Vector3(x, 0, z)), q0, sc.set(1, 1, 1)); });
  const RED = new THREE.Color(0xff2020).multiplyScalar(2.5), AMBER = new THREE.Color(0xffb020).multiplyScalar(2.5), GREEN = new THREE.Color(0x30ff70).multiplyScalar(2.5);
  let lastPh = [];
  const setLights = t => {
    let changed = false;
    tlIdx.forEach(([i, j], n) => {
      const ph = phase(i, j, t); if (lastPh[n] === ph) return; lastPh[n] = ph; changed = true;
      const xs = ph === 0 ? GREEN : ph === 1 ? AMBER : RED, zs = ph === 2 ? GREEN : ph === 3 ? AMBER : RED;
      for (let k = 0; k < 4; k++) tlMesh.setColorAt(n * 4 + k, k < 2 ? xs : zs);
    });
    if (changed && tlMesh.instanceColor) tlMesh.instanceColor.needsUpdate = true;
  };
  setLights(0);

  const helipads = P.helipads;
  return {
    buildings, footprints, roads, parks: [[[PX0, PZ0], [PX1, PZ0], [PX1, PZ1], [PX0, PZ1]]], water: [[[HW0, -9000], [W1, -9000], [W1, 9000], [HW0, 9000]], [[W2, -9000], [EW1, -9000], [EW1, 9000], [W2, 9000]], Array.from({ length: 24 }, (_, k) => [lake.x + Math.cos(k / 24 * 6.283) * lake.rx, lake.z + Math.sin(k / 24 * 6.283) * lake.rz])],
    WATER_Y, rivers: { hudson: [HW0, W1], east: [W2, EW1] },
    beaches: [], walkways: [], bounds: { x0: XA - 220, x1: brooklyn + 300, z0: ZA - 160, z1: ZB + 160 }, credit: "a made-up city in code",
    near, nearR, nearFast, helipads, lawn, lake, emissive, glassMats, billboards,
    // ground under a point: rooftops count (so you can land and drive on them), water is -1
    roofAt(x, z) { let h = 0; for (const b of near(x, z)) if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd && b.h > h) h = b.h; return h; },
    isWater(x, z) {
      if (x > HW0 && x < W1) return !(x > W1 - 80 && Math.abs(((z - ZA + 8) % 140 + 140) % 140 - 8) < 8);   // the Hudson, except on the piers
      if (x > W2 && x < EW1) return Math.abs(z) > 15;                                               // the East River, except on the bridge
      return ((x - lake.x) / lake.rx) ** 2 + ((z - lake.z) / lake.rz) ** 2 < 1;
    },
    update(t) {
      setLights(t);
      waveTex.offset.set((t * .004) % 1, (t * .011) % 1);
      avMat.opacity = Math.sin(t * 3) > 0 ? 1 : .15;
      billboards.forEach((b, k) => { b.material.color.setScalar(1.15 + .25 * Math.sin(t * 2 + k)); });
    },
  };
}
