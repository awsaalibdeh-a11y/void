// VOID: the scroll-driven ride. One fixed WebGL canvas; the page's sections only say how far
// along you are. Scroll progress is smoothed so the ride plays like an animation on any device.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const V = new URL(import.meta.url).search;
const $ = id => document.getElementById(id);
const setLoad = p => { $("ldbar").style.width = p + "%"; $("ldpct").textContent = Math.round(p); };
setLoad(20);
const [{ buildCar }, { Sound }] = await Promise.all([import("./car.js" + V), import("./sound.js" + V)]);
setLoad(45);

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const keyed = (K, p) => {
  if (p <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (p <= K[i][0]) return lerp(K[i - 1][1], K[i][1], (p - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
  return K[K.length - 1][1];
};
const COARSE = matchMedia("(pointer: coarse)").matches, REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

// ---------- renderer, scene, post ----------
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
const DPR = Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040405);
scene.fog = new THREE.Fog(0x040405, 40, 320);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, .05, 4000);
scene.add(new THREE.HemisphereLight(0x8a90a0, 0x050505, .5));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-6, 10, 8); scene.add(key);
const rimL = new THREE.DirectionalLight(0xbfd4ff, 1.2); rimL.position.set(8, 4, -10); scene.add(rimL);
const camLight = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(camLight, camLight.target); // follows the camera so black paint always catches light

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .3, .95);
composer.addPass(bloom); composer.addPass(new OutputPass());

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const radial = (inner, outer) => canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, h); });

// ---------- world: floor, stars, city ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({
  color: 0x0b0b0e, roughness: .7, metalness: .1, envMapIntensity: .2,
  map: canvasTex(256, 256, (g, w) => { g.fillStyle = "#0b0b0e"; g.fillRect(0, 0, w, w); g.strokeStyle = "rgba(255,255,255,.09)"; g.lineWidth = 2; g.strokeRect(0, 0, w, w); }, [1250, 1250]),
}));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; scene.add(floor);

{
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * .9), r = 2200;
    pos.set([Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r * .8 + 80, Math.sin(th) * Math.sin(ph) * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .7 })));
}
{
  const win = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) if (Math.random() < .3) { g.fillStyle = `rgba(255,${200 + Math.random() * 55 | 0},${150 + Math.random() * 100 | 0},${.4 + Math.random() * .6})`; g.fillRect(x, y, 4, 4); }
  });
  const n = COARSE ? 240 : 420, city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0),
    new THREE.MeshStandardMaterial({ color: 0x0c0c10, metalness: .5, roughness: .55, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: .35 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n;) {
    const x = -300 + Math.random() * 1500, z = -600 + Math.random() * 1200;
    if (x > -60 && x < 140 && z > -70 && z < 80) continue;
    const h = 8 + 90 * Math.random() ** 3, w = 8 + Math.random() * 18;
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, w * (.6 + Math.random() * .8))); city.setMatrixAt(i++, m);
  }
  scene.add(city);
}

// ---------- the track: straight, a 360 loop (shifted sideways so it can exit), a run-up and a ramp ----------
const R = 9, LZ = 4.2, HW = 2.3;
const P = [];
for (let x = -60; x < 16; x += .25) P.push(new THREE.Vector3(x, 0, 0));
const loopIn = P.length, LOOPN = 420;
for (let i = 0; i <= LOOPN; i++) { const t = i / LOOPN, th = -Math.PI / 2 + t * Math.PI * 2; P.push(new THREE.Vector3(16 + R * Math.cos(th), R + R * Math.sin(th), LZ * smooth(0, 1, t))); }
const loopOut = P.length - 1;
for (let x = 16.25; x <= 34; x += .25) P.push(new THREE.Vector3(x, 0, LZ));
const rampIn = P.length - 1;
for (let x = 34.25; x <= 48.001; x += .25) { const u = (x - 34) / 14; P.push(new THREE.Vector3(x, 4.5 * u * u, LZ)); }
const roadEnd = P.length - 1;
const air = new THREE.CatmullRomCurve3([[48, 4.5, LZ], [53, 8.2, LZ], [58, 13, LZ + .1], [63, 20, LZ + .4], [69, 30, LZ + 1], [77, 43, LZ + 2], [90, 60, 11], [110, 80, 13], [140, 100, 16],
  [180, 114, 20], [240, 124, 26], [320, 129, 34], [420, 130, 44], [540, 128, 56], [700, 125, 70], [900, 122, 88]].map(a => new THREE.Vector3(...a)), false, "centripetal").getSpacedPoints(1600);
for (let i = 1; i < air.length; i++) P.push(air[i]);
const N = P.length, D = new Float32Array(N), F = [], S = [], U = [], Z = new THREE.Vector3(0, 0, 1);
for (let i = 1; i < N; i++) D[i] = D[i - 1] + P[i].distanceTo(P[i - 1]);
for (let i = 0; i < N; i++) {
  const f = P[Math.min(N - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
  const s = Z.clone().addScaledVector(f, -f.dot(Z)).normalize();
  F.push(f); S.push(s); U.push(new THREE.Vector3().crossVectors(s, f));
}
const idxX = (x, from = 0) => { for (let i = from; i < N; i++) if (P[i].x >= x) return i; return N - 1; };
const dAt = i => D[i];
const iStart = idxX(0);

const tmp = { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), u: new THREE.Vector3() };
function sample(d, out = tmp) {
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
  const t = clamp((d - D[lo]) / Math.max(1e-6, D[hi] - D[lo]));
  out.p.lerpVectors(P[lo], P[hi], t); out.f.lerpVectors(F[lo], F[hi], t).normalize();
  out.s.lerpVectors(S[lo], S[hi], t).normalize(); out.u.lerpVectors(U[lo], U[hi], t).normalize();
  out.i = lo; return out;
}

function ribbon(i0, i1, a, b, mat) {
  const pos = [], uv = [], idx = [];
  for (let i = i0; i <= i1; i++) {
    for (const [sOff, uOff, v] of [[a[0], a[1], 0], [b[0], b[1], 1]]) {
      const q = P[i].clone().addScaledVector(S[i], sOff).addScaledVector(U[i], uOff); pos.push(q.x, q.y, q.z); uv.push(D[i] / 8, v);
    }
    if (i < i1) { const k = (i - i0) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); scene.add(m); return m;
}
const roadTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = "#0e0e12"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, 3, w, 2); g.fillRect(0, h - 5, w, 2);
  g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, h / 2 - 1, w / 2, 2);
});
roadTex.wrapS = THREE.RepeatWrapping;
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, color: 0x777777, roughness: .85, metalness: 0, envMapIntensity: .25, side: THREE.DoubleSide });
const sideMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: .5, metalness: .6, side: THREE.DoubleSide });
const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.05), toneMapped: false, side: THREE.DoubleSide });
ribbon(0, roadEnd, [-HW, 0], [HW, 0], roadMat);
ribbon(loopIn - 4, roadEnd, [-HW, -.4], [HW, -.4], sideMat);
for (const s of [-1, 1]) {
  ribbon(loopIn - 4, roadEnd, [s * HW, 0], [s * HW, -.4], sideMat);
  ribbon(0, roadEnd, [s * HW, .06], [s * HW, .02], edgeMat);
  ribbon(loopIn, loopOut, [s * HW, .1], [s * HW, .75], new THREE.MeshPhysicalMaterial({ color: 0x9fb0c8, transparent: true, opacity: .14, roughness: .05, metalness: .2, side: THREE.DoubleSide, depthWrite: false }));
}
{ // ramp and loop supports
  const pm = new THREE.MeshStandardMaterial({ color: 0x141418, metalness: .7, roughness: .4 });
  for (let x = 36; x <= 47; x += 2.75) { const y = 4.5 * ((x - 34) / 14) ** 2 - .4; for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, y, 12).translate(0, y / 2, 0), pm); c.position.set(x, 0, LZ + s * 1.8); scene.add(c); } }
  for (const s of [-1, 1]) for (const dx of [-7, 7]) {
    const top = new THREE.Vector3(16 + dx * .55, R * 1.62, s < 0 ? -HW - 5 : LZ + HW + 5), base = new THREE.Vector3(16 + dx, 0, top.z);
    const len = top.distanceTo(base), c = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, len, 10), pm);
    c.position.copy(top).add(base).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(base).normalize()); scene.add(c);
  }
}

// ---------- the car ----------
const car = buildCar();
scene.add(car.group);
{ // a simple cockpit so the view from inside has a low dashboard and a wheel at the bottom of the frame
  const cm = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: .8, metalness: .2, envMapIntensity: .3, clippingPlanes: car.clip });
  const dashB = new THREE.Mesh(new THREE.BoxGeometry(.45, .1, 1.3), cm); dashB.position.set(.85, .66, 0); car.group.add(dashB);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(.12, .018, 10, 32), cm); sw.position.set(.5, .72, .3); sw.rotation.y = Math.PI / 2; sw.rotation.x = .3; car.group.add(sw);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(.22, .08), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fb8ff).multiplyScalar(.35), clippingPlanes: car.clip }));
  scr.position.set(.63, .73, -.12); scr.rotation.y = -Math.PI / 2; car.group.add(scr);
  const floorIn = new THREE.Mesh(new THREE.BoxGeometry(2.2, .03, 1.6), cm); floorIn.position.set(.1, .45, 0); car.group.add(floorIn);
}
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,.92)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = .01; scene.add(shadow);
const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.4), new THREE.MeshBasicMaterial({ map: radial("rgba(255,255,255,1)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
glow.rotation.x = -Math.PI / 2; glow.position.y = .02; scene.add(glow);

// speed lines and thruster exhaust
const LINES = 110, lines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .012, .012), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), LINES);
const lineSeed = Array.from({ length: LINES }, () => [Math.random() * 80 - 40, Math.random() * 7 - 1.5, (Math.random() < .5 ? -1 : 1) * (2.2 + Math.random() * 9)]);
lines.frustumCulled = false; scene.add(lines);
const smokeTex = radial("rgba(200,210,225,.55)", "rgba(200,210,225,0)"), puffs = [];
for (let i = 0; i < 90; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); puffs.push({ s, life: 0, v: new THREE.Vector3() }); }
let puffI = 0;
const nozzles = [[.9, .3, 1], [.9, .3, -1], [-.95, .38, 1], [-.95, .38, -1]].map(([x, y, s]) => new THREE.Vector3(x, y - .5, s * 1.0));

// ---------- the ride: scroll progress -> distance, speed, flight kit, camera ----------
const dStart = dAt(iStart), dLoopIn = dAt(loopIn), dLoopOut = dAt(loopOut), dRampIn = dAt(rampIn), dRampEnd = dAt(roadEnd);
const dX = x => dAt(idxX(x, roadEnd));
const RIDE = [[0, dStart], [.065, dLoopIn], [.245, dLoopOut], [.33, dRampIn], [.385, dRampEnd], [.5, dX(77)], [.64, dX(180)], [.78, dX(420)], [1, dX(880)]];
const G = 9.81;
function speedMS(p, y) { // metres per second, from energy in the loop and keyed elsewhere
  if (p < .065) return 30 * Math.pow(smooth(0, .065, p), .6);
  if (p < .245) return Math.sqrt(Math.max(30 * 30 - 2 * G * y, 9));
  if (p < .33) return lerp(30, 48, smooth(.245, .33, p));
  if (p < .385) return Math.sqrt(Math.max(48 * 48 - 2 * G * y, 9));
  return keyed([[.385, 47], [.5, 72], [.64, 88], [.78, 84], [1, 81]], p);
}
const thrustDeploy = p => smooth(.355, .395, p);
const thrustPower = p => keyed([[.37, 0], [.392, 1], [.5, 1], [.56, .5], [.66, .35], [1, .3]], p);
const thrustAngle = p => keyed([[.39, 0], [.47, .12], [.56, .85], [.62, 1]], p);
const wingsOut = p => smooth(.5, .585, p);
const fuelAt = p => keyed([[.385, 100], [.5, 81], [.66, 73], [1, 66]], p);

const loc = (fr, x, y, z) => fr.p.clone().addScaledVector(fr.f, x).addScaledVector(fr.u, y).addScaledVector(fr.s, z);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SHOTS = [
  [0, .05, fr => ({ pos: loc(fr, -1, 1.3, 8), look: loc(fr, 0, .6, 0), fov: 40 })],
  [.06, .065, fr => ({ pos: loc(fr, -7.5, 2.3, 4.5), look: loc(fr, 4, .6, 0), fov: 42 })],
  [.085, .23, fr => ({ pos: new THREE.Vector3(16, 9, LZ + 25), look: new THREE.Vector3(16, 9, 2).lerp(fr.p, .3), fov: 44 })],
  [.255, .37, fr => ({ pos: fr.p.clone().add(new THREE.Vector3(-7, 2, 9)), look: fr.p.clone().add(new THREE.Vector3(5, 1.4, 0)), fov: 46 })],
  [.395, .48, fr => ({ pos: loc(fr, -9, -1.8, 7), look: loc(fr, 2, 1, 0), fov: 50 })],
  [.52, .62, fr => ({ pos: loc(fr, -4, 2.2, 12), look: loc(fr, 1.5, .5, 0), fov: 42 })],
  [.665, .72, fr => ({ pos: loc(fr, -11, 3.2, 2), look: loc(fr, 8, 1, 0), fov: 48 })],
  [.785, 1, fr => ({ pos: loc(fr, .1, 1.04, .3), look: loc(fr, 40, .6, .3), fov: 66, up: fr.u.clone() })],
];
function shotAt(p, fr) {
  for (let i = 0; i < SHOTS.length; i++) {
    const [a, b, fn] = SHOTS[i];
    if (p <= b || i === SHOTS.length - 1) {
      if (p >= a || i === 0) return fn(fr);
      const prev = SHOTS[i - 1], w = smooth(prev[1], a, p), A = prev[2](fr), B = fn(fr);
      return { pos: A.pos.lerp(B.pos, w), look: A.look.lerp(B.look, w), fov: lerp(A.fov, B.fov, w), up: (A.up || WORLD_UP.clone()).lerp(B.up || WORLD_UP, w).normalize() };
    }
  }
}

// ---------- landing zones for the dashcam scan (metres, world space) ----------
const ZONES = [
  { id: "ALPHA", x: 1450, z: 240, safe: true, note: "Rooftop pad, clear" },
  { id: "BRAVO", x: 2700, z: -650, safe: true, note: "Open field, flat" },
  { id: "CHARLIE", x: 3600, z: 1300, safe: false, note: "Crosswind 41 km/h" },
  { id: "DELTA", x: 4700, z: -260, safe: true, note: "Highway rest stop" },
  { id: "ECHO", x: 1100, z: -1700, safe: false, note: "Power lines" },
  { id: "FOXTROT", x: 6900, z: 800, safe: true, note: "Airfield" },
];

// ---------- sections and scroll ----------
const sections = ["hero", "ride", "build", "specs"].map(id => ({ id, el: $(id) }));
function progress(el) { const r = el.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight); return { p: clamp(-r.top / span), top: r.top, bottom: r.bottom }; }
const state = { scene: "hero", hero: 0, ride: 0, build: 0, rideS: 0, heroS: 0, orbit: .6, orbitV: 0, drag: false, gear: 1, lastSpeed: 0 };

// ---------- configurator ----------
const OPTS = {
  paint: { label: "Paint", items: [["Void Black", "#0a0a0c"], ["Stealth Grey", "#2b2d32"], ["Liquid Silver", "#9fa3aa"], ["Ghost White", "#e9e9ea"], ["Blood Red", "#6f0a12"], ["Ember Orange", "#c9480c"], ["Ion Blue", "#123a8c"], ["Venom Green", "#2d6a1e"]] },
  finish: { label: "Finish", seg: true, items: [["Gloss", "gloss"], ["Satin", "satin"], ["Matte", "matte"]] },
  rim: { label: "Wheels", items: [["Black", "#121215"], ["Gunmetal", "#3a3d44"], ["Silver", "#b8bcc4"], ["Bronze", "#7a5a32"]] },
  cal: { label: "Calipers", items: [["Black", "#2a2a30"], ["Red", "#c1121f"], ["Yellow", "#e0b000"], ["White", "#e8e8e8"], ["Ion", "#3df5ff"]] },
  light: { label: "Lights", items: [["Ice", "#e8fbff"], ["Amber", "#ffb347"], ["Ion", "#6ad8ff"], ["Violet", "#b38cff"]] },
  glow: { label: "Underglow", items: [["Off", ""], ["White", "#ffffff"], ["Red", "#ff2233"], ["Ion", "#3df5ff"], ["Violet", "#9b5cff"]] },
};
const DEFAULT = { paint: 0, finish: 0, rim: 0, cal: 0, light: 0, glow: 0 };
let build = { ...DEFAULT, ...(store.get("void.build") || {}) };
try { const h = new URLSearchParams(location.hash.slice(1)).get("b"); if (h) { const v = h.split(".").map(Number); Object.keys(DEFAULT).forEach((k, i) => { if (OPTS[k].items[v[i]]) build[k] = v[i]; }); } } catch { }
function applyBuild() {
  car.setPaint(OPTS.paint.items[build.paint][1]); car.setFinish(OPTS.finish.items[build.finish][1]);
  car.setRim(OPTS.rim.items[build.rim][1]); car.setAccent(OPTS.cal.items[build.cal][1]); car.setLight(OPTS.light.items[build.light][1]);
  const gl = OPTS.glow.items[build.glow][1]; if (gl) glow.material.color.set(gl).multiplyScalar(1.4);
  store.set("void.build", build);
  $("sum").innerHTML = `<b>VOID &middot; ${OPTS.paint.items[build.paint][0]}</b>${OPTS.finish.items[build.finish][0]} paint, ${OPTS.rim.items[build.rim][0].toLowerCase()} wheels, ${OPTS.cal.items[build.cal][0].toLowerCase()} calipers, ${OPTS.light.items[build.light][0].toLowerCase()} lights${gl ? ", " + OPTS.glow.items[build.glow][0].toLowerCase() + " underglow" : ""}`;
  for (const b of document.querySelectorAll("#cfgBody button")) b.setAttribute("aria-pressed", String(build[b.dataset.k] === +b.dataset.i));
  for (const k in OPTS) { const n = document.querySelector(`[data-name="${k}"]`); if (n) n.textContent = OPTS[k].items[build[k]][0]; }
}
$("cfgBody").innerHTML = Object.entries(OPTS).map(([k, o]) => `<div class="grp"><div class="grp-h">${o.label}<b data-name="${k}"></b></div><div class="${o.seg ? "seg" : "sw"}">${o.items.map(([n, c], i) => o.seg
  ? `<button data-k="${k}" data-i="${i}">${n}</button>`
  : `<button data-k="${k}" data-i="${i}" title="${n}" aria-label="${o.label}: ${n}" style="background:${c || "repeating-linear-gradient(45deg,#222 0 4px,#111 4px 8px)"}"></button>`).join("")}</div></div>`).join("");
$("cfgBody").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; build[b.dataset.k] = +b.dataset.i; applyBuild(); });
$("reset").onclick = () => { build = { ...DEFAULT }; applyBuild(); toast("Back to all black"); };
$("share").onclick = async () => {
  const url = location.origin + location.pathname + "#b=" + Object.keys(DEFAULT).map(k => build[k]).join(".");
  try { await navigator.clipboard.writeText(url); toast("Link to your build copied"); } catch { prompt("Copy your build link", url); }
};
applyBuild();
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }

// drag to turn the car in the showroom
let dragX = 0;
addEventListener("pointerdown", e => { if (state.scene !== "build" || e.target.closest(".cfg, nav, button")) return; state.drag = true; dragX = e.clientX; });
addEventListener("pointermove", e => { if (!state.drag) return; state.orbitV = (e.clientX - dragX) * -.006; state.orbit += state.orbitV; dragX = e.clientX; });
addEventListener("pointerup", () => { state.drag = false; });

// ---------- sound ----------
const sound = new Sound();
function setSound(on) { sound.setOn(on); $("snd").setAttribute("aria-pressed", String(on)); $("snd").textContent = on ? "Sound on" : "Sound off"; }
$("snd").onclick = () => setSound(!sound.on);
$("rev").onclick = () => { if (!sound.on) setSound(true); sound.rev(); };

// ---------- play the ride: auto-scroll until the visitor touches anything ----------
let playing = false, playY = 0;
function play() {
  if (!sound.on) setSound(true);
  const ride = $("ride"), top = ride.offsetTop, end = top + ride.offsetHeight - innerHeight;
  playY = Math.max(scrollY, scrollY < top ? 0 : scrollY); if (playY >= end - 4) playY = 0;
  scrollTo(0, playY); playing = { end, rate: (end - Math.min(playY, top)) / 55, heroEnd: top };
}
const stop = () => { playing = false; };
for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) addEventListener(ev, e => { if (playing && !(e.target.closest && e.target.closest(".play"))) stop(); }, { passive: true });
$("play").onclick = play; $("play2").onclick = play;

// ---------- resize (ignore the phone address bar sliding, but follow rotation and fold changes) ----------
let lastW = 0, lastH = 0;
function resize() {
  const w = innerWidth, h = Math.max(innerHeight, document.documentElement.clientHeight);
  if (!w || !h) return;                                     // a hidden or collapsed window: keep the last size
  if (w === lastW && Math.abs(h - lastH) < 140 && lastW) return;
  lastW = w; lastH = h; renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.resolution.set(Math.max(1, w * (COARSE ? .35 : .5)), Math.max(1, h * (COARSE ? .35 : .5))); camera.aspect = w / h;
}
addEventListener("resize", resize); addEventListener("orientationchange", () => setTimeout(resize, 200));
if (window.visualViewport) visualViewport.addEventListener("resize", resize);
resize();
const fovFor = f => { const a = camera.aspect; if (a >= 1.5) return f; const h = 2 * Math.atan(Math.tan(f * Math.PI / 360) * 1.5); return Math.min(88, 2 * Math.atan(Math.tan(h / 2) / a) * 180 / Math.PI); };

// ---------- per-frame ----------
const clock = new THREE.Clock(), fr = { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), u: new THREE.Vector3() };
const basis = new THREE.Matrix4(), qCar = new THREE.Quaternion(), dummy = new THREE.Object3D(), up = new THREE.Vector3();
const rc = $("radar"), rx = rc.getContext("2d");
let lastHud = 0, prevP = 0, dropped = false, loopWhoosh = false;
const caps = [...document.querySelectorAll(".cap")];
const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];

function frame() {
  const dt = Math.min(.05, clock.getDelta()), time = clock.elapsedTime;
  if (playing) { playY += playing.rate * dt * (scrollY < playing.heroEnd ? 2.2 : 1); scrollTo(0, playY); if (playY >= playing.end) stop(); }

  // where are we
  const pr = {}; for (const s of sections) pr[s.id] = progress(s.el);
  let active = "hero";
  for (const s of sections) if (pr[s.id].top <= innerHeight * .5) active = s.id;
  state.scene = active;
  const k = 1 - Math.exp(-dt * (COARSE ? 3.2 : 3.8));
  state.heroS += (pr.hero.p - state.heroS) * k;
  const rideTarget = active === "hero" ? 0 : pr.ride.p;
  state.rideS += (rideTarget - state.rideS) * k;
  if (Math.abs(rideTarget - state.rideS) < 1e-4) state.rideS = rideTarget;
  const rp = state.rideS, inShow = active === "build" || active === "specs";

  // reveal (the blueprint scan) during the hero
  const reveal = smooth(.06, .82, state.heroS);
  car.setReveal(reveal);
  $("buildPct").textContent = Math.round(reveal * 100); $("buildBar").style.width = reveal * 100 + "%";
  $("buildHud").style.opacity = active === "hero" && state.heroS > .02 && reveal < 1 ? 1 : 0;
  const hc = $("heroCopy"); hc.style.opacity = 1 - smooth(.02, .22, state.heroS); hc.style.transform = `translateY(${-state.heroS * 60}px)`;
  $("cue").style.opacity = $("play").style.opacity = 1 - smooth(0, .1, state.heroS);

  // car pose
  let speed = 0, gForce = 1, alt = 0, vs = 0, power = 0, inside = false;
  if (inShow) {
    sample(dStart, fr); speed = 0;
    car.group.position.set(0, 0, 0); car.group.quaternion.identity();
  } else {
    const d = keyed(RIDE, rp); sample(d, fr);
    car.group.position.copy(fr.p);
    basis.makeBasis(fr.f, fr.u, fr.s); qCar.setFromRotationMatrix(basis); car.group.quaternion.copy(qCar);
    const v = speedMS(rp, fr.p.y); speed = v * 3.6;
    const onLoop = fr.i >= loopIn && fr.i <= loopOut;
    gForce = onLoop ? v * v / (R * G) + fr.u.y : (rp > .385 ? 1 + thrustPower(rp) * .25 + (fr.f.y > .3 ? .2 : 0) : 1);
    alt = Math.max(0, fr.p.y); vs = v * fr.f.y;
    power = thrustPower(rp);
  }
  const dep = inShow ? 0 : thrustDeploy(rp);
  car.setThrust(inShow ? 0 : power * dep, inShow ? 0 : thrustAngle(rp), dep, time);
  car.setWings(inShow ? 0 : wingsOut(rp), time);
  const roll = speed / 3.6 * dt / .37;
  for (const w of car.wheels) w.rotation.z -= rp > .4 && !inShow ? roll * .2 : roll;

  // shadow, underglow, exhaust, speed lines
  const ground = clamp(1 - fr.p.y / 3) * (fr.u.y > .8 ? 1 : 0);
  shadow.position.set(car.group.position.x, .01, car.group.position.z); shadow.material.opacity = inShow ? 1 : ground;
  shadow.rotation.z = Math.atan2(-fr.f.z, fr.f.x);
  const glowOn = !!OPTS.glow.items[build.glow][1];
  glow.position.copy(shadow.position); glow.rotation.z = shadow.rotation.z; glow.material.opacity = glowOn ? (inShow ? .85 : ground * .85) : 0;
  if (!inShow && power * dep > .3) for (const n of nozzles) if (Math.random() < .55) {
    const pf = puffs[puffI++ % puffs.length], wp = n.clone().applyMatrix4(car.group.matrixWorld);
    pf.s.position.copy(wp); pf.life = 1; pf.s.visible = true; pf.s.scale.setScalar(.4);
    const ang = thrustAngle(rp); pf.v.copy(fr.u).multiplyScalar(-(1 - ang) * 7).addScaledVector(fr.f, -ang * 9 - speed / 3.6 * .2).add(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(1.5));
  }
  for (const pf of puffs) if (pf.life > 0) {
    pf.life -= dt * .9; pf.s.position.addScaledVector(pf.v, dt); pf.v.multiplyScalar(.97);
    pf.s.scale.setScalar(.4 + (1 - pf.life) * 4.5); pf.s.material.opacity = Math.max(0, pf.life) * .5; if (pf.life <= 0) pf.s.visible = false;
  }
  const lineA = inShow ? 0 : smooth(110, 230, speed) * (rp > .78 ? .4 : 1);
  lines.material.opacity = lineA * .2;
  if (lineA > .01) {
    for (let i = 0; i < LINES; i++) {
      const sd = lineSeed[i]; sd[0] -= speed / 3.6 * dt * 1.6; if (sd[0] < -40) sd[0] += 80;
      dummy.position.copy(loc(fr, sd[0], sd[1], sd[2])); dummy.quaternion.copy(qCar); dummy.scale.set(1.5 + speed * .018, 1, 1);
      dummy.updateMatrix(); lines.setMatrixAt(i, dummy.matrix);
    }
    lines.instanceMatrix.needsUpdate = true;
  }

  // camera
  let cam;
  if (active === "hero") {
    const h = state.heroS, a = lerp(.75, 1.45, smooth(0, 1, h)) + (REDUCED ? 0 : Math.sin(time * .2) * .03);
    const dist = lerp(8.2, 8.2, h), elev = lerp(2.2, 1.3, h);
    cam = { pos: new THREE.Vector3(Math.cos(a) * dist * .9 - 1 * smooth(.6, 1, h), elev, Math.sin(a) * dist), look: new THREE.Vector3(0, .55, 0), fov: 40 };
    const end = shotAt(0, sample(dStart, { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), u: new THREE.Vector3() }));
    const w = smooth(.82, 1, h); cam.pos.lerp(end.pos, w); cam.look.lerp(end.look, w);
  } else if (inShow) {
    if (!state.drag) { state.orbitV *= .94; state.orbit += state.orbitV + (REDUCED ? 0 : dt * .12); }
    const spec = active === "specs" ? smooth(0, .6, pr.specs.p) : 0, dist = 8.8 + spec * 2 + (camera.aspect < 1 ? 1.5 : 0);
    cam = { pos: new THREE.Vector3(Math.cos(state.orbit) * dist, 1.6 + spec * 5, Math.sin(state.orbit) * dist), look: new THREE.Vector3(0, .5, 0), fov: COARSE && camera.aspect < 1 ? 40 : 38 };
    if (camera.aspect < 1) cam.look.y = -.9;
    else if (active === "build") { const right = new THREE.Vector3().subVectors(cam.look, cam.pos).cross(WORLD_UP).normalize(); cam.look.addScaledVector(right, 1.7); }
  } else cam = shotAt(rp, fr);
  inside = !inShow && active === "ride" && rp > .772;
  const shake = REDUCED ? 0 : (Math.max(0, gForce - 1.6) * .012 + power * dep * .035 + (speed > 200 ? .008 : 0)) * (inside ? .4 : 1);
  camera.position.copy(cam.pos).add(new THREE.Vector3(Math.sin(time * 53) * shake, Math.sin(time * 61 + 1) * shake, Math.sin(time * 47 + 2) * shake));
  camera.up.copy(cam.up || WORLD_UP);
  camera.lookAt(cam.look);
  camLight.position.copy(camera.position).add(new THREE.Vector3(0, 3, 0)); camLight.target.position.copy(car.group.position);
  camera.fov = fovFor(cam.fov); camera.updateProjectionMatrix();
  scene.fog.far = lerp(320, 900, smooth(20, 110, alt)); scene.fog.near = lerp(40, 120, smooth(20, 110, alt));

  // music and engine
  let gear = 1;
  for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
  gear = Math.min(7, gear);
  const g0 = GEARS[gear - 1], g1 = GEARS[gear] || 340, rpm = rp < .385 && !inShow ? 2400 + clamp((speed - g0) / (g1 - g0)) * 5200 : 900;
  if (gear > state.gear && rp < .385 && active === "ride") sound.pop();
  state.gear = gear;
  if (active === "ride" && !inShow) {
    if (!loopWhoosh && rp > .07 && rp < .1) { sound.whoosh(); loopWhoosh = true; } if (rp < .05) loopWhoosh = false;
    if (!dropped && prevP < .385 && rp >= .385) { sound.impact(); dropped = true; } if (rp < .37) dropped = false;
  }
  prevP = rp;
  sound.update({ scene: active, p: active === "ride" ? rp : active === "hero" ? state.heroS : 0, rpm, load: rp < .385 && active === "ride" ? clamp((speed - state.lastSpeed) * 4 + .4) : .15, engine: active === "ride" ? (rp < .385 ? 1 : .15) : .6, thrust: power * dep, speed, inside });
  state.lastSpeed = speed;

  // ride overlays
  if (active === "ride" || active === "hero") {
    $("railFill").style.height = rp * 100 + "%";
    for (const c of caps) c.classList.toggle("on", rp >= +c.dataset.from && rp < +c.dataset.to && active === "ride");
    $("telem").style.opacity = active === "ride" && rp < .77 ? 1 : 0;
    $("tSpd").textContent = Math.round(speed); $("tG").textContent = gForce.toFixed(1); $("tAlt").textContent = Math.round(alt);
    const dashIn = smooth(.778, .8, rp) * (1 - smooth(.9, .93, rp)), grow = smooth(.8, .85, rp);
    const dash = $("dash"); dash.style.opacity = dashIn;
    dash.style.transform = `translateY(${lerp(30, 0, grow)}vh) scale(${lerp(.3, 1, grow)})`; dash.style.borderRadius = lerp(28, 0, grow) + "px";
    $("dream").style.opacity = smooth(.9, .93, rp);
    $("play2").style.opacity = playing || rp > .77 ? 0 : 1; $("play2").style.pointerEvents = playing || rp > .77 ? "none" : "auto";
    if (dashIn > .01 && time - lastHud > .08) { lastHud = time; drawDash(speed, alt, vs, fr, time, rp); }
  }
  $("fade").style.opacity = active === "ride" ? smooth(.975, .998, pr.ride.p) : active === "build" ? 1 - smooth(0, .12, pr.build.p) : 0;

  composer.render();
}

function drawDash(speed, alt, vs, fr, time, rp) {
  $("dSpd").textContent = Math.round(speed); $("dAlt").textContent = Math.round(alt); $("dVs").textContent = (vs >= 0 ? "+" : "") + vs.toFixed(1);
  const fuel = fuelAt(rp) - (rp > .66 ? (time % 60) * .002 : 0);
  $("dFuel").textContent = Math.round(fuel); $("dFuelBar").style.width = fuel + "%"; $("dFuelBar").style.background = fuel < 25 ? "#ff4455" : "#3dff8a";
  $("dRange").textContent = `About ${Math.round(fuel * 1.9)} km of glide left`;
  $("dMode").textContent = thrustAngle(rp) > .9 ? "Glide" : "Thrust";
  $("dClock").textContent = new Date().toLocaleTimeString([], { hour12: false });
  const pitch = Math.asin(clamp(fr.f.y, -1, 1)) * 180 / Math.PI;
  $("ladder").style.transform = `translate(-50%, calc(-50% + ${pitch * 3}px))`;

  // radar, heading up
  const W = rc.width, c = W / 2, rad = c - 8;
  const fh = new THREE.Vector2(fr.f.x, fr.f.z).normalize(), sh = new THREE.Vector2(-fh.y, fh.x);
  rx.clearRect(0, 0, W, W);
  rx.strokeStyle = "rgba(255,255,255,.16)"; rx.lineWidth = 1;
  for (let r = 1; r <= 5; r++) { rx.beginPath(); rx.arc(c, c, rad * r / 5, 0, Math.PI * 2); rx.stroke(); }
  rx.beginPath(); rx.moveTo(c, c - rad); rx.lineTo(c, c + rad); rx.moveTo(c - rad, c); rx.lineTo(c + rad, c); rx.stroke();
  rx.fillStyle = "rgba(255,255,255,.4)"; rx.font = "600 10px Inter, sans-serif"; rx.fillText("5 km", c + 4, c - rad + 12); rx.fillText("2.5", c + 4, c - rad / 2 + 12);
  const sw = (time * 1.6) % (Math.PI * 2), g = rx.createConicGradient ? rx.createConicGradient(sw - Math.PI / 2 - .9, c, c) : null;
  if (g) { g.addColorStop(0, "rgba(61,255,138,0)"); g.addColorStop(.14, "rgba(61,255,138,.28)"); g.addColorStop(.15, "rgba(61,255,138,0)"); rx.fillStyle = g; rx.beginPath(); rx.arc(c, c, rad, 0, Math.PI * 2); rx.fill(); }
  const list = ZONES.map(z => {
    const rel = new THREE.Vector2(z.x - fr.p.x, z.z - fr.p.z), dist = rel.length() / 1000;
    return { ...z, dist, fwd: rel.dot(fh) / 1000, side: rel.dot(sh) / 1000 };
  }).sort((a, b) => a.dist - b.dist);
  for (const z of list) {
    const inR = z.dist <= 5, k = inR ? 1 : 5 / z.dist, x = c + z.side * k * rad / 5, y = c - z.fwd * k * rad / 5;
    rx.fillStyle = !inR ? "rgba(255,255,255,.35)" : z.safe ? "#3dff8a" : "#ff4455";
    rx.beginPath(); rx.arc(x, y, inR ? 5 : 3, 0, Math.PI * 2); rx.fill();
    if (inR) { rx.fillStyle = "rgba(255,255,255,.8)"; rx.fillText(z.id[0], x + 7, y + 4); }
  }
  rx.fillStyle = "#fff"; rx.beginPath(); rx.moveTo(c, c - 8); rx.lineTo(c - 6, c + 6); rx.lineTo(c + 6, c + 6); rx.closePath(); rx.fill();
  $("lzList").innerHTML = list.slice(0, 5).map(z => {
    const cls = z.dist > 5 ? "far" : z.safe ? "ok" : "no", tag = z.dist > 5 ? "Out of range" : z.safe ? "Safe" : "Unsafe";
    return `<li class="${cls}"><b>LZ ${z.id}</b><em>${tag}</em><small>${z.dist.toFixed(1)} km &middot; ${z.note}</small></li>`;
  }).join("");
  const best = list.find(z => z.safe && z.dist <= 5);
  $("best").textContent = best ? `Best: LZ ${best.id}, ${best.dist.toFixed(1)} km, about ${Math.round(best.dist * 1000 / Math.max(1, speed / 3.6))} s away` : "No safe zone in range. Keep gliding.";
}

// first frames, then lift the loader
setLoad(80);
renderer.compile(scene, camera);
let raf;
const loop = () => { raf = requestAnimationFrame(loop); frame(); };
loop();
setLoad(100);
setTimeout(() => $("loader").classList.add("done"), 350);
document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); if (sound.ctx) sound.ctx.suspend(); } else { clock.getDelta(); loop(); if (sound.on && sound.ctx) sound.ctx.resume(); } });
