// Atmosphere: weather (clear, rain with wet shiny roads, thunderstorms, fog, snow), clouds, a sun lens flare,
// skid marks when you slide or brake hard, and fireworks over Central Park at night.
import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const WEATHERS = ["clear", "rain", "storm", "fog", "snow"];

export function createAtmos(W, sound, COARSE) {
  const { scene, camera } = W;
  const tex = (draw, w = 128, h = 128) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const radial = (stops) => tex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, w, w); });

  // ---- rain and snow: a box of particles that rides with the camera ----
  const RN = COARSE ? 1400 : 4000, BOX = 70, H = 40;
  const rainPos = new Float32Array(RN * 6), rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const drops = Array.from({ length: RN }, () => [Math.random() * BOX - BOX / 2, Math.random() * H, Math.random() * BOX - BOX / 2, 18 + Math.random() * 8]);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaecbe8, transparent: true, opacity: .38, depthWrite: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  const SN = COARSE ? 1200 : 3000, snowPos = new Float32Array(SN * 3), snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const flakes = Array.from({ length: SN }, () => [Math.random() * BOX - BOX / 2, Math.random() * H, Math.random() * BOX - BOX / 2, Math.random() * 6.28]);
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: .18, map: radial([[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]), transparent: true, depthWrite: false })); snow.frustumCulled = false; snow.visible = false; scene.add(snow);

  // ---- clouds: a big soft layer high up, drifting ----
  const cloudTex = tex((g, w, h) => {
    const img = g.createImageData(w, h), N = (x, y, s) => { const xi = Math.floor(x / s), yi = Math.floor(y / s), f = (a, b) => { const v = Math.sin((a % 64) * 127.1 + (b % 64) * 311.7) * 43758.5; return v - Math.floor(v); }; const fx = x / s - xi, fy = y / s - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (f(xi, yi) * (1 - u) + f(xi + 1, yi) * u) * (1 - v) + (f(xi, yi + 1) * (1 - u) + f(xi + 1, yi + 1) * u) * v; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let n = 0, a = .5; for (const s of [64, 32, 16, 8]) { n += N(x, y, s) * a; a *= .5; } const k = (y * w + x) * 4, c = clamp((n - .45) * 2.2); img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = c * 220; }
    g.putImageData(img, 0, 0);
  }, 256, 256);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(5, 5);
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: .85, side: THREE.DoubleSide }));
  clouds.frustumCulled = false; clouds.renderOrder = -1; scene.add(clouds);

  // ---- sun lens flare ----
  const flareLight = new THREE.Object3D(); scene.add(flareLight);         // not a light: hiding a real light changes the light count and rebuilds every material
  const lf = new Lensflare();
  lf.addElement(new LensflareElement(radial([[0, "rgba(255,250,235,1)"], [.2, "rgba(255,230,180,.6)"], [1, "rgba(255,200,120,0)"]]), 380, 0));
  const ring = radial([[0, "rgba(255,255,255,0)"], [.6, "rgba(255,255,255,0)"], [.7, "rgba(180,220,255,.35)"], [1, "rgba(255,255,255,0)"]]), dot = radial([[0, "rgba(255,220,180,.5)"], [1, "rgba(255,220,180,0)"]]);
  for (const [s, d, t] of [[60, .4, dot], [90, .6, ring], [40, .75, dot], [140, .95, ring]]) lf.addElement(new LensflareElement(t, s, d));
  flareLight.add(lf);

  // ---- skid marks: a ring buffer of dark quads laid where the rear tyres slide ----
  const SK = 1600, skPos = new Float32Array(SK * 18), skGeo = new THREE.BufferGeometry(); skGeo.setAttribute("position", new THREE.BufferAttribute(skPos, 3));
  const skids = new THREE.Mesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: .55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); skids.frustumCulled = false; scene.add(skids);
  let skI = 0; const lastT = [null, null];
  function lay(k, x, z, px, pz) {
    const dx = x - px, dz = z - pz, L = Math.hypot(dx, dz); if (L < .05 || L > 3) return;
    const nx = -dz / L * .14, nz = dx / L * .14, y = .045, o = (skI++ % SK) * 18;
    skPos.set([px + nx, y, pz + nz, px - nx, y, pz - nz, x - nx, y, z - nz, px + nx, y, pz + nz, x - nx, y, z - nz, x + nx, y, z + nz], o);
    skGeo.attributes.position.needsUpdate = true; skGeo.setDrawRange(0, Math.min(skI, SK) * 6);
  }

  // ---- fireworks over the park at night ----
  const FW = 600, fwPos = new Float32Array(FW * 3), fwCol = new Float32Array(FW * 3), fwGeo = new THREE.BufferGeometry();
  fwGeo.setAttribute("position", new THREE.BufferAttribute(fwPos, 3)); fwGeo.setAttribute("color", new THREE.BufferAttribute(fwCol, 3));
  const fw = new THREE.Points(fwGeo, new THREE.PointsMaterial({ size: 2.4, vertexColors: true, map: radial([[0, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  fw.frustumCulled = false; scene.add(fw);
  const sparks = Array.from({ length: FW }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() })); let fwNext = 4, fwI = 0;
  function burst() {
    const L = W.city.lawn, at = new THREE.Vector3(L.x + (Math.random() - .5) * 200, 120 + Math.random() * 80, L.z + (Math.random() - .5) * 200), col = new THREE.Color().setHSL(Math.random(), .9, .6);
    for (let k = 0; k < 120; k++) { const s = sparks[fwI++ % FW], th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1), sp = 18 + Math.random() * 10; s.life = 1.6 + Math.random() * .6; s.p.copy(at); s.v.set(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp); s.c.copy(col).multiplyScalar(2.5); }
    if (sound.on && sound.ctx) { const d = camera.position.distanceTo(at); if (d < 900) sound.pop(); }
  }

  let weather = "clear", flash = 0, nextBolt = 6;
  const asphalt = W.city.asphaltMat, asphalt0 = asphalt ? { r: asphalt.roughness, c: asphalt.color.clone(), e: asphalt.envMapIntensity } : null;
  function setWeather(w) {
    weather = w;
    const wet = w === "rain" || w === "storm";
    rain.visible = wet; snow.visible = w === "snow";
    if (asphalt) { asphalt.roughness = wet ? .18 : w === "snow" ? .95 : asphalt0.r; asphalt.color.copy(asphalt0.c).multiplyScalar(wet ? .55 : w === "snow" ? 1.9 : 1); asphalt.envMapIntensity = wet ? 1.6 : asphalt0.e; }
    W.weatherFog = w === "fog" ? .3 : w === "storm" ? .55 : wet ? .7 : w === "snow" ? .6 : 1;
    W.weatherFog = w === "fog" ? .3 : w === "storm" ? .55 : wet ? .7 : w === "snow" ? .6 : 1;
    W.setWeatherLook(w === "storm" ? .55 : wet ? .72 : w === "fog" ? .85 : w === "snow" ? .9 : 1, w !== "clear");
  }

  return {
    get weather() { return weather; }, setWeather,
    update(dt, time, S, g) {
      const cam = camera.position, tod = W.timeOfDay;
      // rain / snow follow the camera
      if (rain.visible) {
        const wx = 3, wz = 1.5;
        for (let i = 0; i < RN; i++) { const d = drops[i]; d[1] -= d[3] * dt; if (d[1] < 0) { d[1] += H; d[0] = Math.random() * BOX - BOX / 2; d[2] = Math.random() * BOX - BOX / 2; } const x = cam.x + d[0], y = cam.y - 10 + d[1], z = cam.z + d[2], o = i * 6; rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z; rainPos[o + 3] = x + wx * .05; rainPos[o + 4] = y + .9; rainPos[o + 5] = z + wz * .05; }
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (snow.visible) {
        for (let i = 0; i < SN; i++) { const f = flakes[i]; f[1] -= 1.6 * dt; f[3] += dt; if (f[1] < 0) f[1] += H; snowPos[i * 3] = cam.x + f[0] + Math.sin(f[3]) * .6; snowPos[i * 3 + 1] = cam.y - 10 + f[1]; snowPos[i * 3 + 2] = cam.z + f[2] + Math.cos(f[3] * .7) * .6; }
        snowGeo.attributes.position.needsUpdate = true;
      }
      // lightning in a storm
      if (weather === "storm" && (nextBolt -= dt) <= 0) { nextBolt = 5 + Math.random() * 10; flash = 1; if (sound.on) setTimeout(() => sound.crash(), 300 + Math.random() * 1200); }
      flash = Math.max(0, flash - dt * 3); W.setFlash(flash * (Math.random() < .5 ? 1 : .4));
      // clouds: day and sunset (grey and lower in rain)
      clouds.visible = tod !== "night" || weather !== "clear";
      clouds.position.set(cam.x, weather === "clear" ? 520 : 260, cam.z);
      cloudTex.offset.set((time * .002 + cam.x / 9000 * 5) % 1, (time * .001 + cam.z / 9000 * 5) % 1);
      clouds.material.color.set(weather !== "clear" ? 0x6a7280 : tod === "sunset" ? 0xffc8a0 : 0xffffff); clouds.material.opacity = weather === "storm" ? 1 : weather !== "clear" ? .95 : tod === "night" ? .25 : .8;
      // the lens flare sits on the sun, only on a clear day or sunset
      flareLight.visible = tod !== "night" && weather === "clear";
      if (flareLight.visible && W.sunDir) flareLight.position.copy(cam).addScaledVector(W.sunDir, 800);
      // skid marks: sliding sideways or braking hard on the road
      if (g && g.mode === "drive" && (g.veh || "car") === "car" && g.y < .2) {
        const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), u = g.vel.x * fx + g.vel.z * fz, w = -g.vel.x * fz + g.vel.z * fx;
        const sliding = Math.abs(w) > 3.5 || (g.lastU != null && g.lastU - u > 14 * dt && u > 6);
        g.lastU = u;
        for (const k of [0, 1]) {
          const side = k ? .8 : -.8, x = g.x - fx * 1.4 - fz * side, z = g.z - fz * 1.4 + fx * side;
          if (sliding && lastT[k]) lay(k, x, z, lastT[k][0], lastT[k][1]);
          lastT[k] = sliding ? [x, z] : null;
        }
      } else lastT[0] = lastT[1] = null;
      // fireworks at night
      if (tod === "night" && weather !== "storm" && (fwNext -= dt) <= 0) { fwNext = 5 + Math.random() * 9; burst(); }
      for (let i = 0; i < FW; i++) {
        const s = sparks[i];
        if (s.life > 0) { s.life -= dt; s.v.y -= 6 * dt; s.v.multiplyScalar(Math.pow(.6, dt)); s.p.addScaledVector(s.v, dt); const f = clamp(s.life); fwPos.set([s.p.x, s.p.y, s.p.z], i * 3); fwCol.set([s.c.r * f, s.c.g * f, s.c.b * f], i * 3); }
        else fwPos[i * 3 + 1] = -999;
      }
      fwGeo.attributes.position.needsUpdate = fwGeo.attributes.color.needsUpdate = true;
    },
  };
}
