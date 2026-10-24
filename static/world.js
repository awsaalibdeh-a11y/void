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

// landing zones, metres in world space (x east along the boulevard from the start line, z to the right);
// filled in once the city is built: the Central Park lawn, rooftop helipads, and a couple you should not land on
export const ZONES = [];
export const PAD_R = 28;

export async function createWorld(canvas, COARSE) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  renderer.shadowMap.enabled = !COARSE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  // the sky: night (blue hour), sunset and day, each a gradient with a glow where the sun or the city is
  const SKIES = {
    night: { stops: [[0, "#060b18"], [.4, "#13203d"], [.55, "#2c3a63"], [.63, "#6a5a7a"], [.7, "#2a2d3c"], [1, "#1a1c24"]], fog: 0x2c3550, hemi: [0x9fb0d8, 0x22242c, 1.0], sun: [0x9fb4ff, .55], exp: 1.15, glow: 1, stars: true, sunPos: [-300, 420, -500] },
    sunset: { stops: [[0, "#1d2a55"], [.35, "#4a4a8a"], [.5, "#c46a6a"], [.58, "#ff9a4a"], [.64, "#ffd27a"], [.7, "#6a5048"], [1, "#2a2420"]], fog: 0x8a6a6a, hemi: [0xffc8a8, 0x3a3030, 1.2], sun: [0xffa860, 2.4], exp: 1.1, glow: .55, stars: false, sunPos: [-800, 160, -300] },
    day: { stops: [[0, "#2a6ad0"], [.4, "#5a9ae8"], [.58, "#a8d0f4"], [.66, "#e4eef6"], [.7, "#9aa4ac"], [1, "#6a7078"]], fog: 0xb8cce0, hemi: [0xdfeeff, 0x6a7a5a, 1.5], sun: [0xfff4e0, 3.2], exp: 1.0, glow: .12, stars: false, sunPos: [-400, 700, -350] },
  };
  // (a new texture each time: three caches the cube it makes from an equirect background)
  let skyTex = null;
  const paintSky = k => {
    const c = document.createElement("canvas"); c.width = 4; c.height = 512;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 512); for (const [o, col] of SKIES[k].stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    if (skyTex) skyTex.dispose();
    skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.mapping = THREE.EquirectangularReflectionMapping; scene.background = skyTex;
  };
  paintSky("night");
  scene.fog = new THREE.Fog(0x2c3550, 90, 900);
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x232838, side: THREE.BackSide })));
  const strip = (w, h, x, y, z, ry, rx, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); studio.add(m); };
  strip(20, 8, 0, 12, 0, 0, Math.PI / 2, 1.1);                                    // one big soft panel overhead
  for (const s of [-1, 1]) strip(16, 4, 0, 4, s * 14, 0, 0, .7);                  // a soft panel each side
  studio.add(new THREE.Mesh(new THREE.PlaneGeometry(100, 100).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a4050 })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studioEnv = pmrem.fromScene(studio, .02).texture;
  scene.environment = studioEnv;
  const camera = new THREE.PerspectiveCamera(40, 1, .03, 9000);
  const hemi = new THREE.HemisphereLight(0xb8c2de, 0x2a2a32, 1.3); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-6, 10, 8); scene.add(key);
  // the sun (or the moon): casts real shadows in a box that follows the car
  const sun = new THREE.DirectionalLight(0x9fb4ff, .55); sun.castShadow = !COARSE; scene.add(sun, sun.target);
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 1400 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  const rimL = new THREE.DirectionalLight(0xbfd4ff, .6); rimL.position.set(8, 4, -10); scene.add(rimL);
  const camLight = new THREE.DirectionalLight(0xffffff, .35); scene.add(camLight, camLight.target); // follows the camera so black paint always catches light

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .35, .9);
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
    var stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .7 })); scene.add(stars);
  }
  const city = await buildCity(scene, canvasTex, COARSE), buildings = city.buildings;
  ZONES.length = 0;
  ZONES.push({ id: "PARK", x: city.lawn.x, z: city.lawn.z, y: 0, safe: true, note: "Central Park, the big lawn" });
  city.helipads.slice().sort((a, b) => b.y - a.y).slice(0, 6).forEach((h, k) => ZONES.push({ id: ["SUMMIT", "APEX", "SPIRE", "CROWN", "ZENITH", "ORBIT"][k], x: h.x, z: h.z, y: h.y, safe: true, note: `Rooftop helipad, ${Math.round(h.y)} m up`, r: h.r }));
  ZONES.push({ id: "HUDSON", x: -1180, z: -200, y: 0, safe: false, note: "The Hudson River: water" });
  ZONES.push({ id: "TIMES", x: 160, z: -280, y: 0, safe: false, note: "Times Square: billboards and crowds" });
  // shadows: everything solid casts and catches them
  scene.traverse(o => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) { o.receiveShadow = true; o.castShadow = true; } });
  // the city reflected in its own glass: one cube photo from the middle of midtown, filtered for rough and smooth surfaces
  const cubeRT = new THREE.WebGLCubeRenderTarget(COARSE ? 128 : 256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 3000, cubeRT);
  let cityEnv = null;
  function captureCity() {
    cubeCam.position.set(160, 60, -300); cubeCam.update(renderer, scene);
    if (cityEnv) cityEnv.dispose(); cityEnv = pmrem.fromCubemap(cubeRT.texture).texture;
    for (const m of city.glassMats) { m.envMap = cityEnv; m.needsUpdate = true; }
    scene.environment = cityEnv;
  }
  let timeOfDay = "night";
  const sunDir = new THREE.Vector3(-300, 420, -500).normalize();
  function setTime(k) {
    const S = SKIES[k]; timeOfDay = k; paintSky(k);
    scene.fog.color.setHex(S.fog); hemi.color.setHex(S.hemi[0]); hemi.groundColor.setHex(S.hemi[1]); hemi.intensity = S.hemi[2];
    sun.color.setHex(S.sun[0]); sun.intensity = S.sun[1]; sunDir.set(...S.sunPos).normalize();
    renderer.toneMappingExposure = S.exp; stars.visible = S.stars; key.intensity = k === "day" ? .4 : 1.1;
    for (const m of city.emissive) {
      if (m.isMeshStandardMaterial) { if (m.userData.base0 == null) m.userData.base0 = m.emissiveIntensity; m.emissiveIntensity = m.userData.base0 * S.glow; }
      else { if (!m.userData.base0) m.userData.base0 = m.color.clone(); m.color.copy(m.userData.base0).multiplyScalar(Math.max(.55, S.glow)); }
    }
    bloom.strength = k === "day" ? .18 : k === "sunset" ? .32 : .42;
    captureCity();
  }
  function follow(p) { sun.position.copy(p).addScaledVector(sunDir, 600); sun.target.position.copy(p); sun.target.updateMatrixWorld(); }

  // landing zones: a glowing ring, an H, and a tall beacon you can see from far away
  for (const z of ZONES) {
    const col = z.safe ? 0x3dff8a : 0xff4455, c3 = new THREE.Color(col).multiplyScalar(2), R0 = z.r || PAD_R, y = (z.y || 0) + .12;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R0 - 1, R0, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c3, toneMapped: false }));
    ring.position.set(z.x, y, z.z); scene.add(ring);
    if (!z.y) { const h = new THREE.Mesh(new THREE.PlaneGeometry(R0, R0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: canvasTex(128, 128, (g) => { g.fillStyle = "#fff"; g.font = "900 96px sans-serif"; g.textAlign = "center"; g.fillText("H", 64, 100); }), transparent: true, opacity: .55, color: col,
    })); h.position.set(z.x, y + .01, z.z); scene.add(h); }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 260, 8, 1, true).translate(0, 130, 0), new THREE.MeshBasicMaterial({ color: c3, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    beacon.position.set(z.x, y, z.z); scene.add(beacon);
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
    renderer, scene, camera, composer, bloom, camLight, canvasTex, radial, buildings, city, setTime, follow, captureCity, get timeOfDay() { return timeOfDay; }, studioEnv,
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
