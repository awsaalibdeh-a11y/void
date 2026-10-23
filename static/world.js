// The shared world for Watch and Play: renderer, lights, the night city, the track (straight,
// a 9 m 360 loop shifted sideways so it can exit, a run-up, a 33° ramp), the flight path after
// the ramp, the landing zones with beacons, and the effects (shadow, underglow, speed lines, exhaust).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildCity } from "./city.js";

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const keyed = (K, p) => {
  if (p <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (p <= K[i][0]) return lerp(K[i - 1][1], K[i][1], (p - K[i - 1][0]) / (K[i][0] - K[i - 1][0]));
  return K[K.length - 1][1];
};
export const G = 9.81, R = 9, LZ = 4.2, HW = 2.3, RAMP_X = 120;

// landing zones, metres in world space (x forward from the start line, z to the right)
export const ZONES = [
  { id: "ALPHA", x: -168, z: 339, safe: true, note: "Neighbourhood park" },
  { id: "BRAVO", x: -1321, z: 1267, safe: true, note: "Big park, open lawn" },
  { id: "CHARLIE", x: -206, z: -900, safe: false, note: "Over the Gulf, water" },
  { id: "DELTA", x: -1870, z: 590, safe: true, note: "Stadium car park" },
  { id: "ECHO", x: 1150, z: 640, safe: false, note: "Power lines" },
  { id: "FOXTROT", x: 5200, z: 2600, safe: true, note: "Airport apron" },
];
export const PAD_R = 28;

export async function createWorld(canvas, COARSE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  // a blue-hour sky, and a studio of long light strips for the paint to reflect
  const sky = document.createElement("canvas"); sky.width = 4; sky.height = 512;
  { const g = sky.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#0b1222"); gr.addColorStop(.42, "#1c2a4a"); gr.addColorStop(.56, "#3d4d73"); gr.addColorStop(.64, "#7a6f86"); gr.addColorStop(.7, "#3a3d4c"); gr.addColorStop(1, "#22252e");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 512); }
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x3a4562, 70, 480);
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x232838, side: THREE.BackSide })));
  const strip = (w, h, x, y, z, ry, rx, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); studio.add(m); };
  strip(20, 8, 0, 12, 0, 0, Math.PI / 2, 1.1);                                    // one big soft panel overhead
  for (const s of [-1, 1]) strip(16, 4, 0, 4, s * 14, 0, 0, .7);                  // a soft panel each side
  studio.add(new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a4050 })));
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(studio, .02).texture;
  const camera = new THREE.PerspectiveCamera(40, 1, .03, 9000);
  scene.add(new THREE.HemisphereLight(0xb8c2de, 0x2a2a32, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-6, 10, 8); scene.add(key);
  const rimL = new THREE.DirectionalLight(0xbfd4ff, .6); rimL.position.set(8, 4, -10); scene.add(rimL);
  const camLight = new THREE.DirectionalLight(0xffffff, .35); scene.add(camLight, camLight.target); // follows the camera so black paint always catches light

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .28, .25, .97);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  };
  const radial = (inner, outer) => canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, h); });

  // stars over the Gulf, then the city itself (city.js)
  {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * .9), r = 6000; pos.set([Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r * .8 + 80, Math.sin(th) * Math.sin(ph) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .7 })));
  }
  const city = await buildCity(scene, canvasTex, COARSE), buildings = city.buildings;

  // landing zones: a glowing ring, an H, and a tall beacon you can see from far away
  for (const z of ZONES) {
    const col = z.safe ? 0x3dff8a : 0xff4455, c3 = new THREE.Color(col).multiplyScalar(2);
    const ring = new THREE.Mesh(new THREE.RingGeometry(PAD_R - 1.4, PAD_R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c3, toneMapped: false }));
    ring.position.set(z.x, .05, z.z); scene.add(ring);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(PAD_R, PAD_R).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: canvasTex(128, 128, (g) => { g.fillStyle = "#fff"; g.font = "900 96px sans-serif"; g.textAlign = "center"; g.fillText("H", 64, 100); }), transparent: true, opacity: .55, color: col,
    }));
    h.position.set(z.x, .06, z.z); scene.add(h);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 260, 8, 1, true).translate(0, 130, 0), new THREE.MeshBasicMaterial({ color: c3, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    beacon.position.set(z.x, 0, z.z); scene.add(beacon);
  }

  // the track points, with a moving frame (forward, side, up) at every one
  const P = [];
  for (let x = -60; x < 16; x += .25) P.push(new THREE.Vector3(x, 0, 0));
  const loopIn = P.length, LOOPN = 420;
  for (let i = 0; i <= LOOPN; i++) { const t = i / LOOPN, th = -Math.PI / 2 + t * Math.PI * 2; P.push(new THREE.Vector3(16 + R * Math.cos(th), R + R * Math.sin(th), LZ * smooth(0, 1, t))); }
  const loopOut = P.length - 1;
  for (let x = 16.25; x <= RAMP_X; x += .25) P.push(new THREE.Vector3(x, 0, LZ));
  const rampIn = P.length - 1;
  for (let x = RAMP_X + .25; x <= RAMP_X + 14.001; x += .25) { const u = (x - RAMP_X) / 14; P.push(new THREE.Vector3(x, 4.5 * u * u, LZ)); }
  const roadEnd = P.length - 1;
  const X1 = RAMP_X + 14;   // the ramp lip; then up on the thrusters and out over the city, the corniche and downtown
  const air = new THREE.CatmullRomCurve3([[X1, 4.5, LZ], [X1 + 5, 8.2, LZ], [X1 + 10, 13, LZ + .1], [X1 + 15, 20, LZ + .4], [X1 + 21, 30, LZ + 1], [X1 + 29, 43, LZ + 2], [X1 + 42, 62, 8], [X1 + 66, 90, 14],
    [X1 + 110, 125, 26], [X1 + 180, 160, 48], [X1 + 300, 190, 90], [X1 + 480, 205, 150], [X1 + 720, 210, 210], [X1 + 1000, 208, 250], [X1 + 1300, 205, 255], [X1 + 1650, 200, 230], [X1 + 2050, 196, 190], [X1 + 2500, 192, 150]].map(a => new THREE.Vector3(...a)), false, "centripetal").getSpacedPoints(3200);
  for (let i = 1; i < air.length; i++) P.push(air[i]);
  const N = P.length, D = new Float32Array(N), F = [], S = [], U = [], Z = new THREE.Vector3(0, 0, 1);
  for (let i = 1; i < N; i++) D[i] = D[i - 1] + P[i].distanceTo(P[i - 1]);
  for (let i = 0; i < N; i++) {
    const f = P[Math.min(N - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
    const s = Z.clone().addScaledVector(f, -f.dot(Z)).normalize();
    F.push(f); S.push(s); U.push(new THREE.Vector3().crossVectors(s, f));
  }
  const idxX = (x, from = 0) => { for (let i = from; i < N; i++) if (P[i].x >= x) return i; return N - 1; };
  const sample = (d, out) => {
    let lo = 0, hi = N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
    const t = clamp((d - D[lo]) / Math.max(1e-6, D[hi] - D[lo]));
    out.p.lerpVectors(P[lo], P[hi], t); out.f.lerpVectors(F[lo], F[hi], t).normalize();
    out.s.lerpVectors(S[lo], S[hi], t).normalize(); out.u.lerpVectors(U[lo], U[hi], t).normalize();
    out.i = lo; return out;
  };

  function ribbon(i0, i1, a, b, mat) {
    const pos = [], uv = [], idx = [];
    for (let i = i0; i <= i1; i++) {
      for (const [sOff, uOff, v] of [[a[0], a[1], 0], [b[0], b[1], 1]]) { const q = P[i].clone().addScaledVector(S[i], sOff).addScaledVector(U[i], uOff); pos.push(q.x, q.y, q.z); uv.push(D[i] / 8, v); }
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
    g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, 3, w, 2); g.fillRect(0, h - 5, w, 2); g.fillRect(0, h / 2 - 1, w / 2, 2);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, color: 0xb8bcc6, roughness: .85, metalness: 0, envMapIntensity: .25, side: THREE.DoubleSide });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x111115, roughness: .5, metalness: .6, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.05), toneMapped: false, side: THREE.DoubleSide });
  ribbon(0, roadEnd, [-HW, 0], [HW, 0], roadMat);
  ribbon(loopIn - 4, roadEnd, [-HW, -.4], [HW, -.4], sideMat);
  for (const s of [-1, 1]) {
    ribbon(loopIn - 4, roadEnd, [s * HW, 0], [s * HW, -.4], sideMat);
    ribbon(0, roadEnd, [s * HW, .06], [s * HW, .02], edgeMat);
    ribbon(loopIn, loopOut, [s * HW, .1], [s * HW, .75], new THREE.MeshPhysicalMaterial({ color: 0x9fb0c8, transparent: true, opacity: .14, roughness: .05, metalness: .2, side: THREE.DoubleSide, depthWrite: false }));
  }
  {
    const pm = new THREE.MeshStandardMaterial({ color: 0x141418, metalness: .7, roughness: .4 });
    for (let x = RAMP_X + 2; x <= RAMP_X + 13; x += 2.75) { const y = 4.5 * ((x - RAMP_X) / 14) ** 2 - .4; for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, y, 12).translate(0, y / 2, 0), pm); c.position.set(x, 0, LZ + s * 1.8); scene.add(c); } }
    for (const dx of [-4.5, 4.5]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, LZ + HW * 2 + .6).translate(0, .8, 0), pm); foot.position.set(16 + dx, -.4, LZ / 2); scene.add(foot); }
  }

  // effects
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,.92)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .01; scene.add(shadow);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.4), new THREE.MeshBasicMaterial({ map: radial("rgba(255,255,255,1)", "rgba(255,255,255,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = .02; scene.add(glow);
  const LINES = 110, lines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .012, .012), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), LINES);
  const lineSeed = Array.from({ length: LINES }, () => [Math.random() * 80 - 40, Math.random() * 7 - 1.5, (Math.random() < .5 ? -1 : 1) * (2.2 + Math.random() * 9)]);
  lines.frustumCulled = false; scene.add(lines);
  const smokeTex = radial("rgba(200,210,225,.55)", "rgba(200,210,225,0)"), puffs = [];
  for (let i = 0; i < 90; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); puffs.push({ s, life: 0, v: new THREE.Vector3() }); }

  return {
    renderer, scene, camera, composer, bloom, camLight, canvasTex, radial, buildings,
    roads: city.roads, footprints: city.footprints, parks: city.parks, water: city.water, beaches: city.beaches, walkways: city.walkways, bounds: city.bounds, credit: city.credit,
    track: { P, F, S, U, D, N, loopIn, loopOut, rampIn, roadEnd, idxX, sample },
    fx: { shadow, glow, lines, LINES, lineSeed, puffs, puffI: 0 },
  };
}

// a reusable moving frame, and "car-local to world" along it
export const frame = () => ({ p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), u: new THREE.Vector3(), i: 0 });
export const loc = (fr, x, y, z) => fr.p.clone().addScaledVector(fr.f, x).addScaledVector(fr.u, y).addScaledVector(fr.s, z);
export const local = (car, v) => v.clone().applyMatrix4(car.group.matrixWorld);

// where each zone is relative to a position and heading (km, forward/side), nearest first
export function zonesFrom(pos, fwd) {
  const fh = new THREE.Vector2(fwd.x, fwd.z); if (fh.lengthSq() < 1e-6) fh.set(1, 0); fh.normalize();
  const sh = new THREE.Vector2(-fh.y, fh.x);
  return ZONES.map(z => { const rel = new THREE.Vector2(z.x - pos.x, z.z - pos.z); return { ...z, dist: rel.length() / 1000, fwd: rel.dot(fh) / 1000, side: rel.dot(sh) / 1000 }; }).sort((a, b) => a.dist - b.dist);
}
