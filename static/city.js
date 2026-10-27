// VOID City: a New York-style grid, built entirely in code. Straight avenues (north-south) and streets
// (east-west) with lane lines and crosswalks, glass skyscrapers with setbacks, spires and rooftop helipads,
// art-deco stone towers, brick brownstone rows with stoops, brick walk-ups with fire escapes and wooden
// water towers, ground-floor shops (burgers, pizza, delis, bagels...), subway entrances, a big central park
// with a lake, Times Square billboards, two rivers and a bridge. Grass everywhere the city isn't.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [x1, z1] = p[i], [x2, z2] = p[j]; if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) c = !c; } return c; };

// ---- the grid ----
const AV = 160, ST = 70, NX = 13, NZ = 41, X0 = -960, Z0 = -700;       // NZ was 21: the city now runs twice as far south
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
  const MT = { x0: 2650, x1: 4450, z0: -900, z1: 900, S: 8, peak: [3900, -380] };
  const TRAIL = [[2640, 0], [2780, 30], [2920, -50], [3060, 40], [3200, -90], [3330, -30], [3450, -180], [3560, -110], [3660, -280], [3780, -220], [3880, -360], [3900, -380]];
  const emissive = [];                                     // materials whose glow follows the time of day
  const glassMats = [];                                    // materials that reflect the city

  // ---- textures ----
  const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${rnd() * a})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } };
  const grassTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#3f6b2e"; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${40 + rnd() * 60 | 0},${90 + rnd() * 70 | 0},${30 + rnd() * 30 | 0},${.25 + rnd() * .5})`; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 3); } }, [1, 1]);
  const asphaltTex = canvasTex(512, 512, (g, w, h) => {                        // 5 m of road: dark binder, light and dark stones, a few old patches
    g.fillStyle = "#28292d"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${rnd() < .5 ? "0,0,0" : "70,70,74"},${.06 + rnd() * .08})`; g.fillRect(rnd() * w, rnd() * h, 60 + rnd() * 160, 40 + rnd() * 120); }
    for (let i = 0; i < 26000; i++) { const c = 20 + rnd() * 70 | 0; g.fillStyle = `rgba(${c},${c},${c + 4},${.3 + rnd() * .6})`; const sz = rnd() < .15 ? 2 : 1; g.fillRect(rnd() * w | 0, rnd() * h | 0, sz, sz); }
  }, [1, 1]);
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

  // height maps -> normal maps (white is proud, black is deep)
  const normalTex = (w, h, draw, k = 3) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); draw(g, w, h);
    const src = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), H = (x, y) => src[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      out.data[i] = (-dx / l * .5 + .5) * 255; out.data[i + 1] = (dy / l * .5 + .5) * 255; out.data[i + 2] = (1 / l * .5 + .5) * 255; out.data[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const shade = (g, v) => { g.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`; };
  const brickN = normalTex(256, 256, (g, w, h) => {
    shade(g, .8); g.fillRect(0, 0, w, h);
    shade(g, .5); for (let y = 0; y < h; y += 5) { g.fillRect(0, y, w, 1); for (let x = (y / 5) % 2 ? 0 : 6; x < w; x += 12) g.fillRect(x, y, 1, 5); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = c * 85 + 26, y = r * 85 + 18;
      shade(g, 1); g.fillRect(x - 3, y - 6, 40, 6); g.fillRect(x - 2, y + 50, 38, 4);             // lintel and sill stand proud
      shade(g, .3); g.fillRect(x, y, 34, 50); shade(g, .05); g.fillRect(x + 3, y + 3, 28, 44);      // the frame, then the glass set deep
      shade(g, .3); g.fillRect(x + 3, y + 24, 28, 2);
    }
  });
  const stoneN = normalTex(256, 256, (g, w, h) => {
    shade(g, .8); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = c * 85 + 22, y = r * 85 + 14; shade(g, .1); g.fillRect(x, y, 40, 56); shade(g, 1); g.fillRect(x - 4, y + 56, 48, 4); }
    shade(g, 1); for (let c = 0; c < 3; c++) g.fillRect(c * 85, 0, 6, h);
  });
  const glassN = normalTex(256, 256, (g, w, h) => {
    shade(g, .5); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) { shade(g, .7); g.fillRect(0, r * 64 + 52, w, 12); }                     // spandrels
    shade(g, 1); for (let c = 0; c <= 8; c++) g.fillRect(c * 32 - 2, 0, 4, h); for (let r = 0; r <= 4; r++) g.fillRect(0, r * 64 - 2, w, 4);   // mullions
  }, 2.5);

  // ---- materials ----
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const lit = (m, k = 1) => { m.userData.glow = k; emissive.push(m); return m; };
  const NS = new THREE.Vector2(1, 1);
  // a texture atlas: several facades side by side; each wall says which one it uses (aTile) and the shader wraps inside it.
  // One material per family means one draw per city tile instead of one per facade (that was ~80 draw calls a frame).
  const atlasOf = (texs, srgb = true) => {
    const w = texs[0].image.width, h = texs[0].image.height, c = document.createElement("canvas"); c.width = w * texs.length; c.height = h;
    const g = c.getContext("2d"); texs.forEach((t, i) => { g.drawImage(t.image, i * w, 0); t.dispose(); });
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  };
  const atlasify = (m, n, normalToo) => {
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aTile; varying float vTile;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTile = aTile;");
      const fn = `varying float vTile;\nvec4 atlas(sampler2D t, vec2 uv) { vec2 k = vec2(1.0 / ${n}.0, 1.0); return textureGrad(t, vec2((clamp(fract(uv.x), .004, .996) + vTile) / ${n}.0, uv.y), dFdx(uv) * k, dFdy(uv) * k); }\n`;
      let f = sh.fragmentShader.replace("void main() {", fn + "void main() {")
        .replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", "atlas( map, vMapUv )"))
        .replace("#include <emissivemap_fragment>", THREE.ShaderChunk.emissivemap_fragment.replace("texture2D( emissiveMap, vEmissiveMapUv )", "atlas( emissiveMap, vEmissiveMapUv )"));
      if (normalToo) f = f.replace("#include <normal_fragment_maps>", THREE.ShaderChunk.normal_fragment_maps.split("texture2D( normalMap, vNormalMapUv )").join("atlas( normalMap, vNormalMapUv )"));
      sh.fragmentShader = f;
    };
    m.customProgramCacheKey = () => "atlas" + n + (normalToo ? "n" : ""); return m;
  };
  const glassA = atlasify(lit(mat({ map: atlasOf([0, 1, 2, 3].map(k => glassTex(k, false))), emissive: 0xffffff, emissiveMap: atlasOf([0, 1, 2, 3].map(k => glassTex(k, true))), emissiveIntensity: .9, metalness: .9, roughness: .1, envMapIntensity: 1.6, normalMap: glassN, normalScale: NS })), 4, false);
  glassMats.push(glassA);
  // brick in five colours plus the limestone, in one atlas (tile 5 is stone)
  const wallA = atlasify(lit(mat({ map: atlasOf([...BRICK.map(c => brickTex(c, false, false)), stoneTex(false)]), emissive: 0xffffff, emissiveMap: atlasOf([...BRICK.map(c => brickTex(c, true, false)), stoneTex(true)]),
    emissiveIntensity: .75, roughness: .88, normalMap: (() => { const ts = [...BRICK.map(() => brickN.clone()), stoneN]; return atlasOf(ts.map(t => ({ image: t.image, dispose() { } })), false); })(), normalScale: NS })), 6, true);
  const STONE = 5;
  const crownA = (() => { const cols = ["#3df5ff", "#b38cff", "#fff1d6", "#ffc23d"]; const t = canvasTex(4, 1, g => cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i, 0, 1, 1); })); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    const m = atlasify(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false }), 4, false); emissive.push(m); return m; })();
  const shopA = atlasify(lit(mat({ map: atlasOf(AWN.map((_, k) => shopTex(k, false))), emissive: 0xffffff, emissiveMap: atlasOf(AWN.map((_, k) => shopTex(k, true))), emissiveIntensity: 1, roughness: .5, metalness: .1 }), 1.1), AWN.length, false);
  const roofM = mat({ color: 0x3b3c40, roughness: .9 }), trimM = mat({ color: 0xd9d2c4, roughness: .7 }), darkM = mat({ color: 0x1c1d21, roughness: .6, metalness: .4 });

  // ---- geometry buckets: every wall of a kind goes into one merged mesh ----
  const B = new Map();
  const bucket = (m, tw, th, tile = 0) => { const k = m.uuid + ":" + tile + ":" + tw + ":" + th; if (!B.has(k)) B.set(k, { m, tw, th, tile, pos: [], uv: [] }); return B.get(k); };
  const quad = (o, x1, z1, x2, z2, y0, y1) => {
    const L = Math.hypot(x2 - x1, z2 - z1), u1 = L / o.tw, v0 = y0 / o.th, v1 = y1 / o.th;
    o.pos.push(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y0, z1, x2, y1, z2, x1, y1, z1);
    o.uv.push(0, v0, u1, v0, u1, v1, 0, v0, u1, v1, 0, v1);
  };
  const top = (o, x0, x1, z0, z1, y) => { o.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0); o.uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0); };
  // walls go round counter-clockwise seen from above so they face out
  const walls = (o, x0, x1, z0, z1, y0, y1) => { quad(o, x0, z1, x1, z1, y0, y1); quad(o, x1, z1, x1, z0, y0, y1); quad(o, x1, z0, x0, z0, y0, y1); quad(o, x0, z0, x0, z1, y0, y1); };
  const roofB = bucket(roofM, 8, 8), trimB = bucket(trimM, 4, 4), darkB = bucket(darkM, 4, 4), crownB = [0, 1, 2, 3].map(k => bucket(crownA, 4, 4, k));
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
  const P = { acs: [], trees: [], lamps: [], hydrants: [], towers: [], subway: [], aviation: [], helipads: [], benches: [], burgers: [], pizzas: [], signs: [], awn: [], stoops: [], bins: [], escapes: [], carts: [], steam: [] };

  // ---- ground: grass everywhere, asphalt under the grid, sidewalks on every block ----
  // land: Manhattan between the rivers, New Jersey west of the Hudson, Brooklyn east of the East River (the rivers are gaps)
  const W1 = XA - 60, W2 = XB + 60, HW0 = W1 - 600, EW1 = W2 + 700, WATER_Y = -.45;
  const grassMat = mat({ map: grassTex, roughness: .95, color: 0xb8d0a0 });
  grassTex.repeat.set(1, 1);
  for (const [a, b] of [[-20000, HW0], [W1, W2], [EW1, 20000]]) {
    const g = new THREE.PlaneGeometry(b - a, 40000).rotateX(-Math.PI / 2), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (b - a) / 10, uv.getY(k) * 4000);
    const m = new THREE.Mesh(g, grassMat); m.position.set((a + b) / 2, -.12, 0); scene.add(m);
  }
  const asphaltN = normalTex(256, 256, (g, w, h) => { g.fillStyle = "#808080"; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 90 + rnd() * 120 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + (rnd() < .2), 1 + (rnd() < .2)); } }, 1.6);
  asphaltN.repeat.copy(asphaltTex.repeat);
  const asphaltMat = mat({ map: asphaltTex, roughness: .82, envMapIntensity: .35, normalMap: asphaltN, normalScale: new THREE.Vector2(.6, .6) });
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(XB - XA + 40, ZB - ZA + 40).rotateX(-Math.PI / 2), asphaltMat);
  asphaltTex.repeat.set((XB - XA) / 5, (ZB - ZA) / 5); asphaltN.repeat.copy(asphaltTex.repeat); asphalt.position.set((XA + XB) / 2, 0, (ZA + ZB) / 2); scene.add(asphalt);
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
  for (const [k, list] of Object.entries(markG)) if (list.length) { const t = markTex(k); t.wrapT = THREE.RepeatWrapping; scene.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: 0xdddddd, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); }
  zebra.wrapT = THREE.RepeatWrapping;
  scene.add(new THREE.Mesh(mergeGeometries(zebraG), new THREE.MeshBasicMaterial({ map: zebra, transparent: true, depthWrite: false, color: 0xcccccc, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));

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
    const o = bucket(shopA, 8, 4.5, Math.floor(rnd() * AWN.length));
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
    const glass = style < 4, o = glass ? bucket(glassA, 16, 16, style) : bucket(wallA, 12, 12, STONE);
    let ax0 = x0, ax1 = x1, az0 = z0, az1 = z1, y = 0;
    const tiers = H > 120 ? 1 + Math.floor(rnd() * 3) : 1;
    shops(x0, x1, z0, z1, ["s", "n", "e", "w"]); const base = 4.5;
    if (H > 90 && rnd() < .42) {                                               // a big screen on one face
      const f = Math.floor(rnd() * 4), [cx, cz, nx, nz, L] = [[(x0 + x1) / 2, z1, 0, 1, x1 - x0], [(x0 + x1) / 2, z0, 0, -1, x1 - x0], [x1, (z0 + z1) / 2, 1, 0, z1 - z0], [x0, (z0 + z1) / 2, -1, 0, z1 - z0]][f];
      const w = Math.min(34, L * range(.55, .8)), h = w * .56; screenQuad(Math.floor(rnd() * 6), cx, cz, nx, nz, range(14, Math.max(16, Math.min(H * .5, 60))), w, h);
    }
    walls(trimB, x0 - .3, x1 + .3, z0 - .3, z1 + .3, 4.5, 4.85);                  // a ledge over the shopfronts
    for (let t = 0; t < tiers; t++) {
      const h = t === tiers - 1 ? H : y + (H - y) * range(.45, .7), y0 = t === 0 ? base : y;
      walls(o, ax0, ax1, az0, az1, y0, h); top(roofB, ax0, ax1, az0, az1, h);
      if (!glass) { walls(trimB, ax0 - .3, ax1 + .3, az0 - .3, az1 + .3, h - .8, h); }
      solid(ax0, ax1, az0, az1, h);
      y = h; const ix = (ax1 - ax0) * range(.1, .18), iz = (az1 - az0) * range(.1, .18);
      if (t < tiers - 1) { ax0 += ix; ax1 -= ix; az0 += iz; az1 -= iz; }
    }
    const cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2, wTop = Math.min(ax1 - ax0, az1 - az0);
    if (glass && H > 110 && rnd() < .55) walls(pick(crownB), ax0 - .06, ax1 + .06, az0 - .06, az1 + .06, H - 1.6, H - 1);     // a band of light round the top
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
  const screenG = [[], [], [], [], [], []];
  const screenQuad = (k, cx, cz, nx, nz, y, w, h) => {
    const tx = -nz, tz = nx, a = [cx + nx * .3 - tx * w / 2, cz + nz * .3 - tz * w / 2], b = [cx + nx * .3 + tx * w / 2, cz + nz * .3 + tz * w / 2], g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([a[0], y, a[1], b[0], y, b[1], b[0], y + h, b[1], a[0], y, a[1], b[0], y + h, b[1], a[0], y + h, a[1]], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2)); screenG[k].push(g);
  };
  const walkup = (x0, x1, z0, z1, floors, faces) => {                        // brick, shops below, a water tower on top
    const o = bucket(wallA, 12, 9.6, Math.floor(rnd() * BRICK.length)), h = 4.5 + floors * 3.2;
    shops(x0, x1, z0, z1, faces);
    const other = ["s", "n", "e", "w"].filter(f => !faces.includes(f));
    for (const f of other) { const [ax, az, bx, bz] = f === "s" ? [x0, z1, x1, z1] : f === "n" ? [x1, z0, x0, z0] : f === "e" ? [x1, z1, x1, z0] : [x0, z0, x0, z1]; quad(o, ax, az, bx, bz, 0, 4.5); }
    walls(o, x0, x1, z0, z1, 4.5, h); top(roofB, x0, x1, z0, z1, h); walls(trimB, x0 - .35, x1 + .35, z0 - .35, z1 + .35, h - .7, h + .5);
    walls(trimB, x0 - .3, x1 + .3, z0 - .3, z1 + .3, 4.5, 4.85);                          // a ledge over the shopfronts
    if (floors > 4) walls(trimB, x0 - .15, x1 + .15, z0 - .15, z1 + .15, 4.5 + 3.2 * 3 - .15, 4.5 + 3.2 * 3 + .1);   // a belt course
    { const bx = range(x0 + 2, x1 - 6), bz = range(z0 + 2, z1 - 6); walls(darkB, bx, bx + 3.2, bz, bz + 3.4, h, h + 2.6); top(roofB, bx, bx + 3.2, bz, bz + 3.4, h + 2.6); }   // the stair bulkhead
    // a black iron fire escape down one street face
    if (floors >= 4 && rnd() < .8) { const f = rnd() < .5 ? "s" : "n", ex = range(x0 + 4, x1 - 4); for (let k = 0; k < floors; k++) P.escapes.push([ex, 4.5 + k * 3.2, f === "s" ? z1 : z0, f === "s" ? 0 : Math.PI, k > 0]); }
    solid(x0, x1, z0, z1, h + .5);
    if (rnd() < .65) P.towers.push([x0 + (x1 - x0) * range(.25, .75), h + .5, z0 + (z1 - z0) * range(.25, .75), range(.85, 1.15)]);
    for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) P.acs.push([range(x0 + 2, x1 - 2), h, range(z0 + 2, z1 - 2), rnd() * 3]);
    footprints.push([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  };
  const brownstones = (x0, x1, zEdge, side) => {                            // a row along a street: side +1 = the row faces +z
    let x = x0;
    while (x < x1 - 5) {
      const w = Math.min(x1 - x, range(6, 8.5)), d = range(13, 16), h = 3.2 * (3 + Math.floor(rnd() * 2)) + 1.2;
      const za = side > 0 ? zEdge - d : zEdge, zb = side > 0 ? zEdge : zEdge + d;
      const o = bucket(wallA, 12, 9.6, Math.floor(rnd() * BRICK.length));
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
    if (rnd() < .16) P.carts.push([bx1 - 2.4, bz0 + 3.5, rnd() * 6]);
    if (cx > -400 && cx < 900 && cz > -700 && cz < 500 && rnd() < .3) P.steam.push([GRID.ax(i), (bz0 + bz1) / 2 + (rnd() - .5) * 20]);
    if (rnd() < .45) P.subway.push([bx0 + 2.6, bz0 + 6, 0]);
    const midtown = cx > -170 && cx < 650 && cz > -570 && cz < -60, downtown = cx > 470 && cz > 270 && cz < 760, film = cz > 0 && cz < 300 && cx > 100;
    const south = cz > 820 && !(cz > 1300 && cz < 1450 && cx < -500);          // the new southern skyline (with a little square left open)
    if (cz > 1300 && cz < 1450 && cx < -500) { slab(parkG, bx0, bx1, bz0, bz1, .08); for (let k = 0; k < 10; k++) P.trees.push([range(bx0 + 4, bx1 - 4), range(bz0 + 4, bz1 - 4), range(.8, 1.2)]); continue; }
    const towerZone = (midtown || downtown || south) && !film;
    if (towerZone) {
      const n = bx1 - bx0 > 120 ? 3 : 2, lw = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const lx0 = x0 + k * lw + 1.5, lx1 = x0 + (k + 1) * lw - 1.5;
        let H = range(90, downtown ? 330 : 300) * (k === 1 ? 1.15 : 1);
        if (downtown && cz < 360) H = Math.min(H, 170);
        if (south) { H = range(140, 400) * (k === 1 ? 1.2 : 1); if (rnd() < .08) H = range(470, 560); }        // supertalls
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
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x1f6fa8, roughness: .05, metalness: .05, normalMap: waveTex, normalScale: new THREE.Vector2(.35, .35), clearcoat: 1, clearcoatRoughness: .04, clearcoatNormalMap: waveTex, clearcoatNormalScale: new THREE.Vector2(.6, .6), sheen: .3, sheenColor: new THREE.Color(0x7fd4ff), envMapIntensity: 1.6, ior: 1.33, specularIntensity: 1 });
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
  for (let k = 0; k < 500; k++) { const z = range(-1500, 1500); if (Math.abs(z) < 40 || Math.abs(z - 60) < 20) continue; P.trees.push([range(HW0 - 900, HW0 - 20), z, range(.8, 1.4)]); }   // (none on the runway)
  for (const [a, b] of [[W1, XA - 9], [XB + 9, W2]]) slab(walkG, a, b, ZA - 200, ZB + 200, .04);
  for (let z = ZA; z <= ZB; z += 140) { const pier = new THREE.Mesh(new THREE.BoxGeometry(80, 1.2, 16).translate(W1 - 40, -.55, z), mat({ color: 0x6b6258, roughness: .9 })); scene.add(pier); P.lamps.push([W1 - 78, z + 7, 0]); }
  {   // the bridge: a deck at road level, two stone towers, cables
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W2 + 700 - W2 + 120, 1.6, 30).translate((W2 + W2 + 700) / 2, -.75, 0), mat({ color: 0x55565c, roughness: .8 }));
    scene.add(deck);
    for (const tx of [W2 + 170, W2 + 530]) for (const s of [-1, 1]) { box(bucket(wallA, 12, 12, STONE), tx - 6, tx + 6, s * 15 - 3, s * 15 + 3, 0, 110); solid(tx - 6, tx + 6, s * 15 - 3, s * 15 + 3, 110); }
    const cab = [];
    for (const s of [-1, 1]) { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(W2 + 170, 108, s * 15), new THREE.Vector3(W2 + 350, 12, s * 15), new THREE.Vector3(W2 + 530, 108, s * 15)); cab.push(new THREE.TubeGeometry(curve, 60, .6, 6)); for (let x = W2 + 190; x < W2 + 520; x += 14) { const y = curve.getPoint((x - W2 - 170) / 360).y; cab.push(new THREE.CylinderGeometry(.12, .12, y, 4).translate(x, y / 2, s * 15)); } }
    scene.add(new THREE.Mesh(mergeGeometries(cab), darkM));
    for (let x = W2; x < W2 + 700; x += 30) P.lamps.push([x, 13, 0], [x, -13, Math.PI]);
  }
  lakeM.material = waterMat;
  { const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 64).rotateX(-Math.PI / 2), mat({ color: 0xa89a80, roughness: .95 })); shore.scale.set(lake.rx, 1, lake.rz); shore.position.set(lake.x, .12, lake.z); scene.add(shore); }
  const brooklyn = W2 + 700;
  const stations = [];
  {
    const xW = (W1 + XA - 9) / 2, xE = (XB + 9 + W2) / 2;
    const spots = [[xW, -560], [xW, -140], [xW, 280], [xW, 560], [xE, -420], [xE, 140], [xE, 490], [-2560, 60], [brooklyn + 60, -60], [xW, 1180], [xE, 1460], [xW, 1880], [xE, 980], [2590, 60]];
    const pad = mat({ color: 0x6b6d72, roughness: .8 }), canopyM = mat({ color: 0xf2f2f2, roughness: .5 }), redM = mat({ color: 0xc1121f, roughness: .4 }), pumpM = mat({ color: 0x1b1c20, roughness: .5, metalness: .3 });
    const under = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.6), toneMapped: false }); emissive.push(under);
    const greenM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff8a).multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: .5 });
    const signT = canvasTex(256, 512, (g, w, h) => { g.fillStyle = "#c1121f"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "900 120px sans-serif"; g.fillText("⛽", w / 2, 150); g.font = "900 52px Unbounded, Impact, sans-serif"; g.fillText("FUEL", w / 2, 250); g.fillText("REPAIR", w / 2, 320); g.font = "700 40px Inter, sans-serif"; g.fillText("VOID GAS", w / 2, 420); });
    const parts = { pad: [], canopy: [], red: [], pump: [], under: [], green: [] };
    const put = (k, geo, x, y, z) => parts[k].push(geo.toNonIndexed ? geo.translate(x, y, z) : geo);
    for (const [x, z] of spots) {
      stations.push({ x, z, r: 15 });
      put("pad", new THREE.BoxGeometry(34, .1, 26), x, .06, z);
      put("canopy", new THREE.BoxGeometry(22, .8, 14), x, 6, z); put("red", new THREE.BoxGeometry(22.2, .35, 14.2), x, 5.55, z); put("under", new THREE.PlaneGeometry(20, 12).rotateX(Math.PI / 2), x, 5.58, z);
      for (const dx of [-9, 9]) for (const dz of [-5.5, 5.5]) put("canopy", new THREE.BoxGeometry(.5, 5.6, .5), x + dx, 2.8, z + dz);
      for (const dx of [-4, 4]) { put("pump", new THREE.BoxGeometry(1, 1.8, .7), x + dx, .95, z); put("red", new THREE.BoxGeometry(1.05, .3, .75), x + dx, 1.7, z); }
      put("green", new THREE.PlaneGeometry(8, 10).rotateX(-Math.PI / 2), x + 13, .12, z);       // the repair bay
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshBasicMaterial({ map: signT, toneMapped: false, side: THREE.DoubleSide })); sign.position.set(x - 15, 6, z + 11); scene.add(sign);
      put("pump", new THREE.BoxGeometry(.4, 4, .4), x - 15, 2, z + 11);
      solid(x - 15.3, x - 14.7, z + 10.7, z + 11.3, 10);
    }
    const mk = (k, m) => { const list = parts[k].map(g => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (a !== "position" && a !== "normal") n.deleteAttribute(a); return n; }); scene.add(new THREE.Mesh(mergeGeometries(list), m)); };
    mk("pad", pad); mk("canopy", canopyM); mk("red", redM); mk("pump", pumpM); mk("under", under); mk("green", greenM);
  }
  for (let k = 0; k < 90; k++) { const x = range(brooklyn + 20, brooklyn + 800), z = range(-600, 600); if (Math.abs(z) < 20) continue; const w = range(8, 18), d = range(8, 18), h = range(6, 20); walkup(x, x + w, z, z + d, Math.max(1, Math.round((h - 4.5) / 3.2)), []); }
  for (let k = 0; k < 300; k++) { const z = range(-700, 700); if (Math.abs(z) < 14) continue; P.trees.push([range(brooklyn, brooklyn + 900), z, range(.7, 1.2)]); }
  // the highway: from the bridge, straight through Brooklyn, to the foot of the mountains
  {
    const L = MT.x0 + 20 - 1700, hw = new THREE.PlaneGeometry(L, 18).rotateX(-Math.PI / 2).translate(1700 + L / 2, .035, 0);
    const uv = hw.attributes.uv, ps = hw.attributes.position; for (let k = 0; k < ps.count; k++) uv.setXY(k, ps.getX(k) / 5, ps.getZ(k) / 5);
    scene.add(new THREE.Mesh(hw, asphaltMat));
    const lines = new THREE.MeshBasicMaterial({ color: 0xf2c230 }), dash = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
    scene.add(new THREE.Mesh(mergeGeometries([new THREE.PlaneGeometry(L, .18).rotateX(-Math.PI / 2).translate(1700 + L / 2, .05, -.2), new THREE.PlaneGeometry(L, .18).rotateX(-Math.PI / 2).translate(1700 + L / 2, .05, .2)]), lines));
    const ds = []; for (let x = 1710; x < MT.x0; x += 12) for (const z of [-4.5, 4.5]) ds.push(new THREE.PlaneGeometry(4, .18).rotateX(-Math.PI / 2).translate(x, .05, z));
    scene.add(new THREE.Mesh(mergeGeometries(ds), dash));
    roads.push({ p: [[1700, 0], [MT.x0 + 20, 0]], w: 18 });
  }
  const terrain = buildMountains();
  for (let k = 0; k < (COARSE ? 400 : 900); k++) { const x = range(XA - 40, XB + 40), z = pick([range(ZB + 20, ZB + 600), range(ZA - 600, ZA - 20)]); P.trees.push([x, z, range(.8, 1.4)]); }

  // ---- the mountains past Brooklyn: rough ground, rock and snow, pine forest, boulders, a dirt trail to the summit ----
  function buildMountains() {
    const h2 = (i, j) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz), a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; };
    const fbm = (x, z, o) => { let s = 0, a = .5, f = 1; for (let k = 0; k < o; k++) { s += a * vn(x * f, z * f); a *= .5; f *= 2.03; } return s; };
    const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const segD = (x, z) => { let best = 1e9; for (let k = 0; k < TRAIL.length - 1; k++) { const [ax, az] = TRAIL[k], [bx, bz] = TRAIL[k + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
    const rawH = (x, z) => {
      const rise = sm((x - MT.x0) / 380) * sm((MT.x1 - x) / 260) * sm((z - MT.z0) / 260) * sm((MT.z1 - z) / 260);
      if (rise <= 0) return 0;
      const big = fbm(x / 430 + 3.1, z / 430 - 1.7, 4), ridge = 1 - Math.abs(fbm(x / 250 + 7, z / 250 - 3, 3) * 2 - 1), peak = Math.max(0, 1 - Math.hypot(x - MT.peak[0], z - MT.peak[1]) / 950);
      const trail = sm(1 - segD(x, z) / 16);
      let h = Math.max(0, big * 140 + ridge * 95 + peak * peak * 230 - 70) * rise;
      const rough = ((vn(x / 15, z / 15) - .5) * 2.2 + (vn(x / 9 + 31, z / 9 - 17) - .5) * 1.1) * Math.min(1, rise * 3);   // the bumps that make it rough
      return Math.max(.06, h * (1 - trail * .12) + rough * (1 - trail * .75));
    };
    const S = MT.S, NXm = Math.round((MT.x1 - MT.x0) / S), NZm = Math.round((MT.z1 - MT.z0) / S), H = new Float32Array((NXm + 1) * (NZm + 1));
    for (let j = 0; j <= NZm; j++) for (let i = 0; i <= NXm; i++) H[j * (NXm + 1) + i] = rawH(MT.x0 + i * S, MT.z0 + j * S);
    const at = (i, j) => H[j * (NXm + 1) + i];
    // height anywhere: the same triangles the mesh is made of, so wheels sit exactly on the ground you see
    const height = (x, z) => {
      const gx = (x - MT.x0) / S, gz = (z - MT.z0) / S;
      if (gx < 0 || gz < 0 || gx >= NXm || gz >= NZm) return 0;
      const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
      return fx + fz <= 1 ? at(i, j) + fx * (at(i + 1, j) - at(i, j)) + fz * (at(i, j + 1) - at(i, j)) : at(i + 1, j + 1) + (1 - fx) * (at(i, j + 1) - at(i + 1, j + 1)) + (1 - fz) * (at(i + 1, j) - at(i + 1, j + 1));
    };
    const pos = new Float32Array((NXm + 1) * (NZm + 1) * 3), col = new Float32Array(pos.length), idx = [];
    for (let j = 0; j <= NZm; j++) for (let i = 0; i <= NXm; i++) {
      const k = j * (NXm + 1) + i, x = MT.x0 + i * S, z = MT.z0 + j * S, h = H[k];
      pos.set([x, h, z], k * 3);
      const sl = i > 0 && j > 0 && i < NXm && j < NZm ? Math.hypot(at(i + 1, j) - at(i - 1, j), at(i, j + 1) - at(i, j - 1)) / (2 * S) : 0, n = vn(x / 7, z / 7), tr = sm(1 - segD(x, z) / 7);
      let c = [.24 + n * .08, .4 + n * .1, .17 + n * .05];                                   // grass
      if (h > 60) c = [c[0] * .9 + .03, c[1] * .85, c[2] * .9];                             // darker, higher up
      if (sl > .55 || h > 175) { const m = sm((sl - .55) / .25 + (h - 175) / 40); c = c.map((v, q) => v + ([.44, .42, .4][q] + n * .06 - v) * Math.max(m, sm((h - 175) / 40))); }   // rock
      if (h > 215 + n * 20) c = [.92, .93, .96];                                             // snow
      if (tr > 0) c = c.map((v, q) => v + ([.45, .35, .23][q] - v) * tr);                   // the dirt trail
      col.set(c, k * 3);
      if (i < NXm && j < NZm) { const a = k, b = k + NXm + 1, d = k + 1, e = k + NXm + 2; idx.push(a, b, d, d, b, e); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat({ vertexColors: true, roughness: .96 })); mesh.receiveShadow = true; scene.add(mesh);
    // pines and boulders (they stop you, but you can't land on top of them)
    const pines = [], rocks = [];
    for (let k = 0; k < (COARSE ? 700 : 1600); k++) {
      const x = range(MT.x0 + 80, MT.x1 - 40), z = range(MT.z0 + 40, MT.z1 - 40), h = height(x, z), sl = Math.abs(height(x + 3, z) - height(x - 3, z)) / 6 + Math.abs(height(x, z + 3) - height(x, z - 3)) / 6;
      if (h < 3 || h > 190 || sl > .6 || segD(x, z) < 10) continue;
      const s = range(.8, 1.5); pines.push([x, h, z, s]); solid(x - .45, x + .45, z - .45, z + .45, h + 7 * s, { noRoof: true });
    }
    for (let k = 0; k < (COARSE ? 160 : 340); k++) {
      const x = range(MT.x0 + 60, MT.x1 - 40), z = range(MT.z0 + 40, MT.z1 - 40), h = height(x, z); if (segD(x, z) < 9) continue;
      const s = range(.8, 3.6); rocks.push([x, h - s * .3, z, s, rnd() * 6]); if (s > 1.6) solid(x - s * .7, x + s * .7, z - s * .7, z + s * .7, h + s * .6, { noRoof: true });
    }
    const T = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
    const pineGeo = mergeGeometries([T(new THREE.CylinderGeometry(.18, .28, 2.2, 6).translate(0, 1.1, 0).toNonIndexed(), [.35, .25, .17]), T(new THREE.ConeGeometry(2.2, 3.6, 7).translate(0, 3.4, 0).toNonIndexed(), [.12, .3, .16]), T(new THREE.ConeGeometry(1.7, 3, 7).translate(0, 5, 0).toNonIndexed(), [.14, .34, .18]), T(new THREE.ConeGeometry(1.1, 2.4, 7).translate(0, 6.5, 0).toNonIndexed(), [.16, .38, .2])]);
    const pm = new THREE.InstancedMesh(pineGeo, mat({ vertexColors: true, roughness: .9, flatShading: true }), Math.max(1, pines.length)); pines.forEach(([x, h, z, s], i) => { m4.compose(v.set(x, h - .2, z), q0.setFromAxisAngle(Y, i), sc.set(s, s, s)); pm.setMatrixAt(i, m4); }); pm.castShadow = true; scene.add(pm);
    const rm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat({ color: 0x777470, roughness: .95, flatShading: true }), Math.max(1, rocks.length)); rocks.forEach(([x, h, z, s, r], i) => { m4.compose(v.set(x, h, z), q0.setFromAxisAngle(Y, r), sc.set(s * 1.2, s * .8, s)); rm.setMatrixAt(i, m4); }); scene.add(rm);
    // a cairn and a flag at the summit
    const sx = MT.peak[0], sz2 = MT.peak[1], sh = height(sx, sz2);
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 7, 6).translate(sx, sh + 3.5, sz2), mat({ color: 0xdddddd })), {}));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4).translate(sx + 1.2, sh + 6.2, sz2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(1.3), side: THREE.DoubleSide, toneMapped: false })); scene.add(flag);
    return { height, trail: TRAIL.map(([x, z]) => [x, height(x, z), z]), peak: [sx, sh, sz2] };
  }

  // ---- the El: an elevated subway over avenue 9, four stations, a train running up and down ----
  const EL = { x: GRID.ax(9), top: 10.5, z0: ZA - 20, z1: ZB + 20, stations: [GRID.sz(5) + 35, GRID.sz(15) + 35, GRID.sz(25) + 35, GRID.sz(35) + 35] };
  {
    const steel = mat({ color: 0x4a5058, roughness: .55, metalness: .6 }), X = EL.x, L = EL.z1 - EL.z0, zc = (EL.z0 + EL.z1) / 2, parts = [];
    const bx = (w, h, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
    bx(8, .8, L, X, EL.top - .4, zc); bx(.3, .7, L, X - 3.95, EL.top + .35, zc); bx(.3, .7, L, X + 3.95, EL.top + .35, zc);
    bx(.2, .15, L, X - .75, EL.top + .07, zc); bx(.2, .15, L, X + .75, EL.top + .07, zc);
    const onStreet = z => { for (let j = 0; j < NZ; j++) if (Math.abs(z - GRID.sz(j)) < GRID.stW(j) / 2 + 3) return true; return false; };
    for (let z = EL.z0 + 10; z < EL.z1; z += 32) { if (onStreet(z)) continue; bx(1, EL.top - .8, 1, X, (EL.top - .8) / 2, z); bx(7, .6, .8, X, EL.top - 1.1, z); solid(X - .6, X + .6, z - .6, z + .6, EL.top - .8, { noRoof: true }); }
    for (const z of EL.stations) for (const sgn of [-1, 1]) { bx(4, .5, 64, X + sgn * 6, EL.top - .25, z); bx(4, .15, 64, X + sgn * 6, EL.top + 3.6, z); for (let k = -30; k <= 30; k += 10) bx(.2, 3.6, .2, X + sgn * 7.8, EL.top + 1.8, z + k); solid(X + sgn * 6 - 2, X + sgn * 6 + 2, z - 32, z + 32, EL.top, { y0: EL.top - 1 }); }
    solid(X - 4, X + 4, EL.z0, EL.z1, EL.top, { y0: EL.top - 1 });          // drive along the top if you land on it
    scene.add(new THREE.Mesh(mergeGeometries(parts), steel));
    // the train: four silver cars with a window band and a red stripe
    const carTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = "#b8bcc4"; g.fillRect(0, 0, w, h); g.fillStyle = "#c1121f"; g.fillRect(0, 44, w, 5); for (let x = 6; x < w; x += 30) { g.fillStyle = "#1b2633"; g.fillRect(x, 12, 22, 24); g.fillStyle = "rgba(255,240,200,.25)"; g.fillRect(x, 12, 22, 5); } g.fillStyle = "#2a2d33"; g.fillRect(0, h - 6, w, 6); });
    const train = new THREE.Group(), carM = new THREE.MeshStandardMaterial({ map: carTex, roughness: .35, metalness: .7 }), headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .95, .8).multiplyScalar(2), toneMapped: false });
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 15.6), carM); c.position.set(0, 1.9, (k - 1.5) * 16.4); c.castShadow = true; train.add(c); }
    for (const z of [-32.6, 32.6]) for (const x of [-.9, .9]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, .1), headM); l.position.set(x, 1.2, z); train.add(l); }
    train.position.set(X, EL.top, EL.stations[0]); scene.add(train);
    EL.train = { g: train, z: EL.stations[0], v: 0, dir: 1, wait: 6, len: 66 };
  }
  // ---- the Ferris wheel and a boardwalk on the East River esplanade ----
  const FW = { x: (XB + 9 + W2) / 2, z: 1320, y: 31, R: 26, a: 0 };
  {
    const white = mat({ color: 0xe8e8ea, roughness: .4, metalness: .5 }), wood = mat({ color: 0x8a6a48, roughness: .85 });
    const wheel = new THREE.Group(); wheel.position.set(FW.x, FW.y, FW.z); scene.add(wheel); FW.g = wheel;
    for (const x of [-1.4, 1.4]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(FW.R, .3, 8, 72), white); rim.rotation.y = Math.PI / 2; rim.position.x = x; wheel.add(rim); const inner = new THREE.Mesh(new THREE.TorusGeometry(FW.R * .55, .2, 6, 48), white); inner.rotation.y = Math.PI / 2; inner.position.x = x; wheel.add(inner); }
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; for (const x of [-1.4, 1.4]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, FW.R, 5), white); sp.position.set(x, Math.cos(a) * FW.R / 2, Math.sin(a) * FW.R / 2); sp.rotation.x = a; wheel.add(sp); } }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.6, 16).rotateZ(Math.PI / 2), white); wheel.add(hub);
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .75, .4).multiplyScalar(2.4), toneMapped: false }); emissive.push(bulb);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(.28, 6, 4), bulb, 144), bm = new THREE.Matrix4();
    for (let k = 0; k < 72; k++) for (const [j, x] of [[0, -1.4], [1, 1.4]]) { const a = k / 72 * Math.PI * 2; bulbs.setMatrixAt(k * 2 + j, bm.makeTranslation(x, Math.cos(a) * FW.R, Math.sin(a) * FW.R)); }
    wheel.add(bulbs);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const len = Math.hypot(FW.y, 14), leg = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, len, 8), white); leg.position.set(FW.x + sx * 3.2, FW.y / 2, FW.z + sz * 7); leg.rotation.x = -sz * Math.atan2(14, FW.y) * .5; scene.add(leg); solid(FW.x + sx * 3.2 - .8, FW.x + sx * 3.2 + .8, FW.z + sz * 10 - .8, FW.z + sz * 10 + .8, 6, { noRoof: true }); }
    const gondM = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: .4 }); FW.gond = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 2.2, 2.6).translate(0, -1.6, 0), gondM, 18);
    for (let k = 0; k < 18; k++) FW.gond.setColorAt(k, new THREE.Color().setHSL(k / 18, .75, .55)); scene.add(FW.gond);
    // the boardwalk: planks, a few stalls with striped awnings
    const deck = new THREE.Mesh(new THREE.BoxGeometry(46, .2, 230), wood); deck.position.set(FW.x, .12, FW.z); deck.receiveShadow = true; scene.add(deck);
    const stallT = canvasTex(64, 16, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = (x / 8) % 2 ? "#ffffff" : "#d21f2b"; g.fillRect(x, 0, 8, h); } });
    for (const [dz, c] of [[-70, 0xf7c414], [-50, 0x2e5aa8], [55, 0x2f6b3a], [75, 0xd21f2b]]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), mat({ color: c, roughness: .6 })); st.position.set(FW.x - 12, 1.3, FW.z + dz); scene.add(st);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(4.6, .15, 3.8), new THREE.MeshStandardMaterial({ map: stallT })); aw.position.set(FW.x - 12, 2.8, FW.z + dz); scene.add(aw); solid(FW.x - 14, FW.x - 10, FW.z + dz - 1.5, FW.z + dz + 1.5, 2.6);
    }
  }

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
  const byMat = new Map();
  for (const o of B.values()) { if (!o.pos.length) continue; if (!byMat.has(o.m)) byMat.set(o.m, []); byMat.get(o.m).push(o); }
  for (const [mtl, list] of byMat) {
    const tiles = new Map();
    for (const o of list) for (let t = 0, u = 0; t < o.pos.length; t += 9, u += 6) {
      const k = tileOf((o.pos[t] + o.pos[t + 3] + o.pos[t + 6]) / 3, (o.pos[t + 2] + o.pos[t + 5] + o.pos[t + 8]) / 3);
      let a = tiles.get(k); if (!a) tiles.set(k, a = { pos: [], uv: [], tile: [] });
      for (let i = 0; i < 9; i++) a.pos.push(o.pos[t + i]); for (let i = 0; i < 6; i++) a.uv.push(o.uv[u + i]); a.tile.push(o.tile, o.tile, o.tile);
    }
    for (const a of tiles.values()) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv, 2)); g.setAttribute("aTile", new THREE.Float32BufferAttribute(a.tile, 1)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mtl); m.userData.solid = true; scene.add(m);
    }
  }
  const screenTex = Array.from({ length: 6 }, () => { const c = document.createElement("canvas"); c.width = 256; c.height = 144; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
  screenG.forEach((list, k) => { if (list.length) scene.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: screenTex[k], toneMapped: false, color: new THREE.Color(1.35, 1.35, 1.35) }))); });
  const NEWS = ["BREAKING: VOID CITY GROWS TO TWICE ITS SIZE", "TRAFFIC: HEAVY ON THE BRIDGE TO BROOKLYN", "WEATHER: CLEAR SKIES, LIGHT WIND", "VOID MOTORS: 106 CARS IN STOCK", "MOUNTAINS OPEN: HILL CLIMB RACE NOW LIVE", "HOT DOGS $10 ON EVERY CORNER"];
  const drawScreen = (k, t) => {
    const c = screenTex[k].image, g = c.getContext("2d"), w = c.width, h = c.height;
    if (k === 0) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${(t * 40) % 360},90%,45%)`); gr.addColorStop(1, `hsl(${(t * 40 + 120) % 360},90%,30%)`); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "900 64px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText("VOID", w / 2 + Math.sin(t * 2) * 10, 92); g.font = "700 16px Inter, sans-serif"; g.fillText("DRIVE · FLY · LAND", w / 2, 122); }
    if (k === 1) { g.fillStyle = "#06060a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 24; i++) { const v = (Math.sin(t * 6 + i * .7) * .5 + .5) * (Math.sin(t * 2.3 + i * 1.9) * .3 + .7); g.fillStyle = `hsl(${180 + i * 6},100%,${50 + v * 15}%)`; g.fillRect(6 + i * 10.3, h - 10 - v * (h - 30), 8, v * (h - 30)); } }
    if (k === 2) { g.fillStyle = "#0b1730"; g.fillRect(0, 0, w, h); g.fillStyle = "#c1121f"; g.fillRect(0, h - 40, w, 40); g.fillStyle = "#fff"; g.font = "900 22px Inter, sans-serif"; g.textAlign = "left"; const msg = NEWS.join("   •   ") + "   •   "; const tw = g.measureText(msg).width, x = -(t * 60 % tw); g.fillText(msg, x, h - 13); g.fillText(msg, x + tw, h - 13); g.font = "900 40px Unbounded, Impact, sans-serif"; g.fillText("VOID NEWS", 14, 56); const d = new Date(); g.font = "700 22px Inter, sans-serif"; g.fillText(d.toTimeString().slice(0, 5), 14, 88); }
    if (k === 3) { g.fillStyle = "#111"; g.fillRect(0, 0, w, h); for (let i = -2; i < 10; i++) { g.fillStyle = i % 2 ? "#ffd23d" : "#1a1a1a"; g.beginPath(); const x = i * 40 + (t * 50 % 80); g.moveTo(x, 0); g.lineTo(x + 30, 0); g.lineTo(x - 10, h); g.lineTo(x - 40, h); g.fill(); } g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(0, 36, w, 74); g.fillStyle = "#ffd23d"; g.font = "900 34px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText("VOID MOTORS", w / 2, 78); g.fillStyle = "#fff"; g.font = "700 15px Inter, sans-serif"; g.fillText("106 CARS · IN THE PARK", w / 2, 100); }
    if (k === 4) { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { const x = w / 2 + Math.sin(t * (.7 + i * .3) + i) * 90, y = h / 2 + Math.cos(t * (.9 + i * .2) + i * 2) * 45, r = g.createRadialGradient(x, y, 0, x, y, 70); r.addColorStop(0, `hsla(${(i * 70 + t * 30) % 360},100%,60%,.9)`); r.addColorStop(1, "hsla(0,0%,0%,0)"); g.fillStyle = r; g.fillRect(0, 0, w, h); } }
    if (k === 5) { g.fillStyle = "#e8f1ff"; g.fillRect(0, 0, w, h); g.fillStyle = "#0b1730"; g.font = "900 46px Unbounded, Impact, sans-serif"; g.textAlign = "left"; g.fillText("HOVER", 14, 60); g.fillText("BOARDS", 14, 108); g.fillStyle = "#3dc8ff"; g.font = "700 16px Inter, sans-serif"; g.fillText("PRESS Y · RIDE ANYWHERE", 14, 132); g.save(); g.translate(205, 70 + Math.sin(t * 3) * 6); g.rotate(-.3); g.fillStyle = "#111"; g.fillRect(-36, -7, 72, 14); g.fillStyle = "#3df5ff"; g.fillRect(-30, 7, 60, 4); g.restore(); }
    screenTex[k].needsUpdate = true;
  };
  for (let k = 0; k < 6; k++) drawScreen(k, 0);
  let screenK = 0, screenT = 0;
  if (spires.length) scene.add(new THREE.Mesh(mergeGeometries(spires.map(g => g.toNonIndexed())), mat({ color: 0xb8bcc4, metalness: .9, roughness: .25 })));
  const walkMat = mat({ map: walkTex, roughness: .9 }); walkTex.repeat.set(1, 1);
  const wg = mergeGeometries(walkG); { const p = wg.attributes.position, uv = wg.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 4, p.getZ(k) / 4); }
  scene.add(new THREE.Mesh(wg, walkMat));
  const pg = mergeGeometries(parkG); { const p = pg.attributes.position, uv = pg.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / 10, p.getZ(k) / 10); }
  const parkTex = grassTex.clone(); parkTex.repeat.set(1, 1); parkTex.needsUpdate = true;
  scene.add(new THREE.Mesh(pg, mat({ map: parkTex, roughness: .95, color: 0xc8e0a8 })));
  const signMat = new THREE.MeshBasicMaterial({ map: signAtlas, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) }); emissive.push(signMat);
  { const tiles = new Map(); for (const g of signGeo) { const p0 = g.attributes.position, k = tileOf(p0.getX(0), p0.getZ(0)); if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(g); } for (const list of tiles.values()) scene.add(new THREE.Mesh(mergeGeometries(list), signMat)); }

  // small props go in 200 m tiles and are only drawn near the camera (trees a little further)
  const propTiles = [];
  const instT = (geo, material, list, place, colorOf, far = 330) => {
    const groups = new Map(), PT = 400;
    list.forEach((it, i) => { place(it, i); const e = m4.elements, k = Math.floor(e[12] / PT) * 1000 + Math.floor(e[14] / PT); let gr = groups.get(k); if (!gr) groups.set(k, gr = []); gr.push([m4.clone(), colorOf ? colorOf(it, i) : null]); });
    for (const [k, arr] of groups) { const mesh = new THREE.InstancedMesh(geo, material, arr.length); arr.forEach(([m, c], j) => { mesh.setMatrixAt(j, m); if (c) mesh.setColorAt(j, c); }); mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); scene.add(mesh);
      propTiles.push({ mesh, x: (Math.floor(k / 1000) + .5) * PT, z: (((k % 1000) + 1000) % 1000 + .5) * PT, far }); }
  };
  const inst = (geo, material, list, place) => { const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length)); list.forEach((it, i) => { place(it, i); mesh.setMatrixAt(i, m4); }); mesh.instanceMatrix.needsUpdate = true; if (list.length) scene.add(mesh); return mesh; };
  const at = (x, y, z, ry = 0, s = 1) => m4.compose(v.set(x, y, z), q0.setFromAxisAngle(Y, ry), sc.set(s, s, s));
  // trees: a trunk and two leafy blobs, each a little different green
  instT(new THREE.CylinderGeometry(.18, .28, 3, 5).translate(0, 1.5, 0), mat({ color: 0x5a4330, roughness: .9 }), P.trees, ([x, z, s]) => at(x, 0, z, 0, s), null, 520);
  const leafGeo = COARSE ? mergeGeometries([new THREE.IcosahedronGeometry(2.2, 0).translate(0, 4.4, 0), new THREE.IcosahedronGeometry(1.7, 0).translate(.8, 5.8, .3), new THREE.IcosahedronGeometry(1.5, 0).translate(-.9, 5.3, -.4)].map(g => g.toNonIndexed()))
    : mergeGeometries([[2.2, 0, 4.4, 0], [1.8, .9, 5.9, .3], [1.6, -1, 5.4, -.5], [1.45, .2, 6.7, -.6], [1.35, -.3, 4.8, 1.2]].map(([rad, x, y, z]) => {
      const g = new THREE.IcosahedronGeometry(rad, 1).toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const j = 1 + Math.sin(p.getX(i) * 7.1 + p.getY(i) * 3.3 + p.getZ(i) * 5.7) * .14; p.setXYZ(i, p.getX(i) * j, p.getY(i) * j, p.getZ(i) * j); }
      g.translate(x, y, z); for (let i = 0; i < p.count; i++) { const v = .6 + .48 * Math.max(0, Math.min(1, (p.getY(i) - (y - rad)) / (2 * rad))); col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v; }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
    }));
  instT(leafGeo, mat({ roughness: .85, flatShading: true, vertexColors: !COARSE }), P.trees, ([x, z, s], i) => at(x, 0, z, i, s), () => new THREE.Color().setHSL(.26 + rnd() * .08, .45 + rnd() * .2, .26 + rnd() * .12), 520);
  // street lamps: a pole, an arm and a warm head
  // pools of warm light under every lamp (only at night)
  const poolTex = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,200,130,.55)"); r.addColorStop(.5, "rgba(255,180,110,.18)"); r.addColorStop(1, "rgba(255,170,100,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 });
  instT(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), poolMat, P.lamps, ([x, z, ry]) => { at(0, 0, 0, ry); v.set(0, .08, 1.8).applyQuaternion(q0); m4.compose(v.add(new THREE.Vector3(x, 0, z)), q0, sc.set(1, 1, 1)); }, null, 260);
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcf8a).multiplyScalar(2.4), toneMapped: false }); emissive.push(lampHead); lampHead.userData.glow = 2.4; lampHead.userData.base = new THREE.Color(0xffcf8a);
  instT(mergeGeometries([new THREE.CylinderGeometry(.1, .14, 8, 6).translate(0, 4, 0), new THREE.BoxGeometry(.1, .1, 2).translate(0, 7.9, 1)].map(g => g.toNonIndexed())), darkM, P.lamps, ([x, z, ry]) => at(x, 0, z, ry));
  instT(new THREE.BoxGeometry(.5, .14, .8), lampHead, P.lamps, ([x, z, ry]) => { at(0, 0, 0, ry); v.set(0, 7.85, 1.8).applyQuaternion(q0); m4.compose(v.add(new THREE.Vector3(x, 0, z)), q0, sc.set(1, 1, 1)); });
  instT(new THREE.CylinderGeometry(.22, .26, .8, 8).translate(0, .4, 0), mat({ color: 0xc8202a, roughness: .5 }), P.hydrants, ([x, z]) => at(x, 0, z));
  instT(new THREE.CylinderGeometry(.35, .3, 1, 8).translate(0, .5, 0), mat({ color: 0x2d4a2d, roughness: .7 }), P.bins, ([x, z]) => at(x, 0, z));
  // NYC water towers: wooden barrel, cone roof, steel legs
  const towerGeo = mergeGeometries([new THREE.CylinderGeometry(2.4, 2.4, 4.5, 14).translate(0, 4.7, 0), new THREE.ConeGeometry(2.6, 1.6, 14).translate(0, 7.75, 0),
    ...[[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]].map(([a, b]) => new THREE.CylinderGeometry(.12, .12, 2.5, 4).translate(a, 1.25, b))].map(g => g.toNonIndexed()));
  instT(new THREE.BoxGeometry(1.4, .9, 1).translate(0, .45, 0), mat({ color: 0xb8bcc2, roughness: .6, metalness: .4 }), P.acs, ([x, y, z, r]) => at(x, y, z, r));
  instT(towerGeo, mat({ color: 0x6e5238, roughness: .9 }), P.towers, ([x, y, z, s]) => at(x, y, z, 0, s));
  P.towers.forEach(([x, y, z, s]) => solid(x - 2.4 * s, x + 2.4 * s, z - 2.4 * s, z + 2.4 * s, y + 8.5 * s));
  // fire escapes: a grated platform, railings, and a stair down to the one below
  {
    const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), parts = [bx(3.4, .05, 1.2, 0, 0, .6), bx(3.4, .04, .04, 0, 1, 1.18), bx(3.4, .03, .03, 0, .5, 1.18), bx(.04, .04, 1.2, 1.7, 1, .6), bx(.04, .04, 1.2, -1.7, 1, .6)];
    for (const x of [-1.7, -.85, 0, .85, 1.7]) parts.push(bx(.035, 1, .035, x, .5, 1.18));
    for (const x of [-1.7, 1.7]) parts.push(bx(.035, 1, .035, x, .5, .05));
    const stair = bx(4.06, .05, .55, 0, 0, 0).rotateZ(Math.atan2(3.2, 2.5)).translate(-.05, -1.6, .75);
    const escMat = mat({ color: 0x18191c, roughness: .55, metalness: .6 });
    instT(mergeGeometries(parts), escMat, P.escapes, ([x, y, z, ry]) => at(x, y, z, ry), null, 300);
    instT(stair, escMat, P.escapes.filter(e => e[4]), ([x, y, z, ry]) => at(x, y, z, ry), null, 300);
  }
  // hot dog carts: a steel cart with a striped umbrella and someone selling
  {
    const T = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
    const bx = (w, h, d, x, y, z, c) => T(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), c), cy = (rt, rb, h, x, y, z, c, seg = 8) => T(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z).toNonIndexed(), c);
    const umb = new THREE.ConeGeometry(1.4, .5, 8).translate(0, 2.55, 0).toNonIndexed(); { const p = umb.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const st = Math.floor((Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI / 4)) % 2; a.set(st ? [1, .82, .1] : [.15, .35, .8], i * 3); } umb.setAttribute("color", new THREE.BufferAttribute(a, 3)); }
    const cart = mergeGeometries([bx(1.8, .9, .9, 0, .75, 0, [.8, .82, .85]), bx(1.9, .06, 1, 0, 1.22, 0, [.55, .56, .6]), bx(.5, .3, .5, -.5, 1.4, 0, [.7, .7, .72]), cy(.25, .25, .1, .5, .3, .48, [.1, .1, .1], 12).rotateX(Math.PI / 2).translate(0, 0, 0),
      cy(.03, .03, 2.1, .7, 1.6, 0, [.6, .6, .6]), umb.translate(.7, 0, 0), bx(.3, .7, .44, .1, 1.2, -1, [.85, .15, .15]), bx(.26, .8, .2, .1, .45, -1, [.15, .17, .25]), T(new THREE.IcosahedronGeometry(.13, 1).translate(.1, 1.72, -1).toNonIndexed(), [.8, .6, .45]),
      bx(.32, .05, .3, .12, 1.84, -1, [.95, .95, .95])]);
    instT(cart, mat({ vertexColors: true, roughness: .5, metalness: .3 }), P.carts, ([x, z, r]) => at(x, 0, z, r), null, 260);
    P.carts.forEach(([x, z]) => solid(x - 1.1, x + 1.1, z - 1.1, z + 1.1, 2.6));
    // steam stacks: orange and white striped chimneys in the street that never stop puffing
    const stack = new THREE.CylinderGeometry(.42, .5, 2.4, 12, 6, true).translate(0, 1.2, 0).toNonIndexed(); { const p = stack.attributes.position, a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) a.set(Math.floor(p.getY(i) / .4 + .001) % 2 ? [1, 1, 1] : [1, .42, .08], i * 3); stack.setAttribute("color", new THREE.BufferAttribute(a, 3)); }
    instT(stack, mat({ vertexColors: true, roughness: .6, side: THREE.DoubleSide }), P.steam, ([x, z]) => at(x, 0, z), null, 300);
    P.steam.forEach(([x, z]) => solid(x - .5, x + .5, z - .5, z + .5, 2.4));
  }
  const bladeTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); for (let k = 0; k < 26; k++) { const x = 4 + rnd() * 56, lean = (rnd() - .5) * 18, ht = 30 + rnd() * 30; g.strokeStyle = `rgb(${60 + rnd() * 40 | 0},${110 + rnd() * 60 | 0},${40 + rnd() * 30 | 0})`; g.lineWidth = 2 + rnd() * 2; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * .3, h - ht * .6, x + lean, h - ht); g.stroke(); } });
  const tuftGeo = mergeGeometries([new THREE.PlaneGeometry(1.1, .6).translate(0, .3, 0), new THREE.PlaneGeometry(1.1, .6).translate(0, .3, 0).rotateY(Math.PI / 2)]);
  const NTUFT = COARSE ? 0 : 3200, tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: .45, side: THREE.DoubleSide, roughness: .9 }), Math.max(1, NTUFT));
  tufts.frustumCulled = false; tufts.count = 0; tufts.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(tufts);
  let tuftAt = null;
  const grassy = (x, z) => {
    if (inPark(x, z)) return Math.hypot((x - lake.x) / (lake.rx + 6), (z - lake.z) / (lake.rz + 6)) > 1 ? .08 : -1;
    if (x > MT.x0 && x < MT.x1 && z > MT.z0 && z < MT.z1 && terrain) { const h = terrain.height(x, z); return h > .3 && h < 165 ? h : -1; }
    if (x < HW0 - 30 && !(x > -2660 && x < -1860 && Math.abs(z) < 34)) return 0;                                     // New Jersey, off the runway
    if (x > XA - 5 && x < XB + 5 && (z > ZB + 30 || z < ZA - 30)) return 0;                                         // north and south of the city
    return -1;
  };
  function placeTufts(cam) {
    let k = 0; const S = 1.5, R = 42, gx0 = Math.floor((cam.x - R) / S), gz0 = Math.floor((cam.z - R) / S);
    for (let gx = gx0; gx < gx0 + R * 2 / S && k < NTUFT; gx++) for (let gz = gz0; gz < gz0 + R * 2 / S && k < NTUFT; gz++) {
      const hsh = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453, f = hsh - Math.floor(hsh), x = (gx + f) * S, z = (gz + (f * 7.3 % 1)) * S;
      if ((x - cam.x) ** 2 + (z - cam.z) ** 2 > R * R || f < .25) continue;
      const y = grassy(x, z); if (y < 0) continue;
      m4.compose(v.set(x, y, z), q0.setFromAxisAngle(Y, f * 6.28), sc.set(.7 + f * .7, .7 + f * .8, .7 + f * .7)); tufts.setMatrixAt(k, m4); tufts.setColorAt(k++, new THREE.Color().setHSL(.24 + f * .06, .55, .32 + f * .14));
    }
    tufts.count = k; tufts.instanceMatrix.needsUpdate = true; if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  }
  const steamTex = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const NPUFF = COARSE ? 40 : 90, steamMat = new THREE.MeshBasicMaterial({ map: steamTex, transparent: true, depthWrite: false });
  steamMat.onBeforeCompile = sh => {                       // each puff fades on its own: its instance colour's red is its opacity
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vFade;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = instanceColor.r;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFade;").replace("#include <color_fragment>", "diffuseColor.a *= vFade;");
  };
  const steamMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), steamMat, NPUFF); steamMesh.frustumCulled = false; steamMesh.count = 0; steamMesh.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(steamMesh);
  const puffs = Array.from({ length: NPUFF }, () => ({ p: new THREE.Vector3(), life: 0, vx: 0, vz: 0 })), fadeC = new THREE.Color(), puffS = new THREE.Vector3();
  let puffI = 0, puffT = 0;
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
  if (P.helipads.length) scene.add(new THREE.Mesh(mergeGeometries(P.helipads.map(h => new THREE.CircleGeometry(h.r, 32).rotateX(-Math.PI / 2).translate(h.x, h.y + .05, h.z))), new THREE.MeshStandardMaterial({ map: padTex, roughness: .8 })));
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

  const helipads = P.helipads; let cullN = 0;
  return {
    buildings, footprints, roads, parks: [[[PX0, PZ0], [PX1, PZ0], [PX1, PZ1], [PX0, PZ1]]], water: [[[HW0, -9000], [W1, -9000], [W1, 9000], [HW0, 9000]], [[W2, -9000], [EW1, -9000], [EW1, 9000], [W2, 9000]], Array.from({ length: 24 }, (_, k) => [lake.x + Math.cos(k / 24 * 6.283) * lake.rx, lake.z + Math.sin(k / 24 * 6.283) * lake.rz])],
    WATER_Y, rivers: { hudson: [HW0, W1], east: [W2, EW1] },
    beaches: [], walkways: [], bounds: { x0: XA - 220, x1: brooklyn + 300, z0: ZA - 160, z1: ZB + 160 }, credit: "a made-up city in code",
    near, nearR, nearFast, helipads, carts: P.carts, lawn, lake, stations, asphaltMat, poolMat, emissive, glassMats, billboards,
    // ground under a point: rooftops count (so you can land and drive on them), water is -1
    roofAt(x, z) { let h = 0; for (const b of near(x, z)) if (!b.noRoof && Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd && b.h > h) h = b.h; return h; },
    terrainH: terrain.height, mountains: { ...MT, trail: terrain.trail, peak: terrain.peak }, el: EL, wheel: FW,
    isWater(x, z) {
      if (x > HW0 && x < W1) return !(x > W1 - 80 && Math.abs(((z - ZA + 8) % 140 + 140) % 140 - 8) < 8);   // the Hudson, except on the piers
      if (x > W2 && x < EW1) return Math.abs(z) > 15;                                               // the East River, except on the bridge
      return ((x - lake.x) / lake.rx) ** 2 + ((z - lake.z) / lake.rz) ** 2 < 1;
    },
    update(t, cam) {
      setLights(t);
      if (cam && (++cullN % 10) === 0) { const far = (1 + Math.max(0, cam.y - 20) / 60) * (this.detail || 1); for (const pt of propTiles) pt.mesh.visible = Math.hypot(pt.x - cam.x, pt.z - cam.z) < pt.far * far + 283 * Math.min(1, far); /* Lite pulls the margin in too */ }
      waveTex.offset.set((t * .004) % 1, (t * .011) % 1);
      avMat.opacity = Math.sin(t * 3) > 0 ? 1 : .15;
      // grass round the camera (High and Ultra), re-scattered every few metres
      const grassOn = NTUFT > 0 && (this.detail || 1) >= 1 && cam && cam.y < 60; tufts.visible = grassOn;
      if (grassOn && (!tuftAt || Math.hypot(cam.x - tuftAt.x, cam.z - tuftAt.z) > 7)) { tuftAt = { x: cam.x, z: cam.z }; placeTufts(cam); }
      // the El train: up and down the line, stopping at every station
      { const dtt = Math.min(.1, Math.max(0, t - (this._tt || t))); this._tt = t; const T = EL.train;
        if (T.wait > 0) { T.wait -= dtt; T.v = 0; } else {
          const next = EL.stations.filter(z => (z - T.z) * T.dir > 1).sort((a, b) => (a - b) * T.dir)[0], end = T.dir > 0 ? EL.z1 - 40 : EL.z0 + 40, stopAt = next ?? end, dist = Math.abs(stopAt - T.z);
          T.v = Math.min(T.v + 2.2 * dtt, 20, Math.sqrt(2 * 1.8 * dist) + .3); T.z += T.v * T.dir * dtt;
          if (dist < .6) { T.z = stopAt; T.wait = next != null ? 7 : 4; if (next == null) T.dir *= -1; }
        }
        T.g.position.z = T.z; }
      // the Ferris wheel turns; its gondolas hang level
      FW.a += .045 * Math.min(.1, Math.max(0, t - (this._tf || t))); this._tf = t; FW.g.rotation.x = FW.a;
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2 + FW.a; m4.makeTranslation(FW.x, FW.y + Math.cos(a) * FW.R, FW.z + Math.sin(a) * FW.R); FW.gond.setMatrixAt(k, m4); } FW.gond.instanceMatrix.needsUpdate = true;
      if (t - screenT > .05) { screenT = t; drawScreen(screenK, t); screenK = (screenK + 1) % 6; }      // one screen redrawn per tick, each at about 3 fps
      // steam from the stacks near the camera
      const dt = Math.min(.1, Math.max(0, t - (this._t || t))); this._t = t;
      if (cam && (puffT += dt) > .14) { puffT = 0; for (const [x, z] of P.steam) if (Math.abs(x - cam.x) < 150 && Math.abs(z - cam.z) < 150) { const pf = puffs[puffI++ % puffs.length]; pf.life = 1; pf.p.set(x + (Math.random() - .5) * .3, 2.5, z + (Math.random() - .5) * .3); pf.vx = (Math.random() - .5) * .6; pf.vz = (Math.random() - .5) * .6; } }
      let pn = 0;
      if (cam && this.camQ) for (const pf of puffs) if (pf.life > 0) {
        pf.life -= dt * .3; pf.p.x += pf.vx * dt; pf.p.z += pf.vz * dt; pf.p.y += dt * 1.6; if (pf.life <= 0) continue;
        const k = 1 - pf.life; m4.compose(pf.p, this.camQ, puffS.setScalar(1.2 + k * 5)); steamMesh.setMatrixAt(pn, m4); steamMesh.setColorAt(pn++, fadeC.setRGB(pf.life * .6, 1, 1));
      }
      steamMesh.count = pn; steamMesh.visible = pn > 0; steamMesh.instanceMatrix.needsUpdate = true; if (steamMesh.instanceColor) steamMesh.instanceColor.needsUpdate = true;
      billboards.forEach((b, k) => { b.material.color.setScalar(1.15 + .25 * Math.sin(t * 2 + k)); });
    },
  };
}
