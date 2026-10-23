// al-Tubaishi, Dammam, built from real OpenStreetMap data (static/tubaishi.json, made by tools/osm_build.py):
// every building footprint extruded to its height with arched windows floor by floor, the real roads,
// parks, mosques, the Gulf from the real coastline with a beach and the corniche promenade, palms,
// street lamps, rooftop water tanks and glowing Arabic / English shop signs.
// Map data (c) OpenStreetMap contributors, ODbL.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const SIGNS = [["الدمام", "DAMMAM"], ["الطبيشي", "TUBAISHI"], ["كورنيش", "CORNICHE"], ["سوق", "SOUQ"], ["قهوة", "COFFEE"], ["فندق", "HOTEL"], ["مطعم", "RESTAURANT"],
  ["صيدلية", "PHARMACY"], ["مخبز", "BAKERY"], ["مرحبا", "WELCOME"], ["هايدرا", "HYDRA LTE242"], ["عطور", "PERFUME"], ["ذهب", "GOLD"],
  ["شاورما", "SHAWARMA"], ["حلويات", "SWEETS"], ["ملابس", "FASHION"], ["بقالة", "GROCERY"], ["حلاق", "BARBER"]];
const NEON = ["#ff3b5c", "#3dfcff", "#ffd23d", "#7dff6a", "#ff8a3d", "#c07dff", "#ffffff"];
const SAND = [0xd8c3a0, 0xe6dccb, 0xc2a57f, 0xefe9df, 0xb89c78, 0xd1c7b4];

const centroid = p => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
export const pip = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [x1, z1] = p[i], [x2, z2] = p[j]; if ((z1 > z) !== (z2 > z) && x < (x2 - x1) * (z - z1) / (z2 - z1) + x1) c = !c; } return c; };

// a flat polygon on the ground, triangulated
function flat(p, y) {
  const v2 = p.map(([x, z]) => new THREE.Vector2(x, z)), tris = THREE.ShapeUtils.triangulateShape(v2, []);
  const pos = [], uv = [];
  for (const t of tris) for (const i of t) { pos.push(p[i][0], y, p[i][1]); uv.push(p[i][0] / 8, p[i][1] / 8); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
// a strip along a polyline, from offset a to offset b (metres to the right of the line)
function strip(pts, a, b, y, uScale = 8) {
  const pos = [], uv = [], idx = []; let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i) d += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const nx = -dz, nz = dx;
    pos.push(p[0] + nx * a, y, p[1] + nz * a, p[0] + nx * b, y, p[1] + nz * b); uv.push(d / uScale, 0, d / uScale, 1);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export async function buildCity(scene, canvasTex, COARSE) {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const data = await (await fetch("/static/tubaishi.json")).json();
  try { await Promise.race([document.fonts.load('700 64px "Noto Kufi Arabic"'), new Promise(r => setTimeout(r, 1500))]); } catch { }
  const [bx0, bx1, bz0, bz1] = data.bounds;
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---- ground: desert sand, the Gulf, the beach and the corniche ----
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    color: 0x9a8566, roughness: .95, map: canvasTex(256, 256, (g, w) => { g.fillStyle = "#b9a07c"; g.fillRect(0, 0, w, w); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${90 + rnd() * 60},${70 + rnd() * 40},40,${rnd() * .25})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); } }, [900, 900]),
  }));
  sand.position.y = -.3; scene.add(sand);
  const town = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: .9 }));
  town.position.set((bx0 + bx1) / 2, -.2, (bz0 + bz1) / 2); scene.add(town);
  scene.add(new THREE.Mesh(flat(data.sea, -.14), new THREE.MeshStandardMaterial({ color: 0x0c2a3c, roughness: .1, metalness: .75, envMapIntensity: 1.2 })));
  const coast = data.coast;
  // land is on the left of the coastline as OSM draws it, so the beach goes from the water line inland
  scene.add(new THREE.Mesh(strip(coast, -38, 0, -.1), new THREE.MeshStandardMaterial({ color: 0xd9c49c, roughness: 1, side: THREE.DoubleSide })));
  scene.add(new THREE.Mesh(strip(coast, -52, -38, -.08, 4), new THREE.MeshStandardMaterial({ color: 0xcbb995, roughness: .75, map: canvasTex(64, 64, (g, w) => { g.fillStyle = "#d6c7a8"; g.fillRect(0, 0, w, w); g.fillStyle = "#b9a988"; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, w); }, [1, 4]) })));
  const offsetLine = (pts, off) => pts.map((p, i) => { const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)]; let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * off, p[1] + dx / l * off]; });
  const promenade = offsetLine(coast, -45).filter(([x, z]) => x > bx0 && x < bx1 && z > bz0 && z < bz1);

  // ---- parks ----
  const grass = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: .95 });
  for (const p of data.parks) scene.add(new THREE.Mesh(flat(p.p, -.05), p.k === "stadium" ? new THREE.MeshStandardMaterial({ color: 0x8a8e96, roughness: .8 }) : grass));

  // ---- roads: asphalt strips with a dashed centre line on the wide ones ----
  const roadGeos = [], lineGeos = [];
  for (const r of data.roads) { roadGeos.push(strip(r.p, -r.w / 2, r.w / 2, r.w >= 10 ? .03 : .015)); if (r.w >= 10) lineGeos.push(strip(r.p, -.12, .12, .05, 6)); }
  scene.add(new THREE.Mesh(mergeGeometries(roadGeos), new THREE.MeshStandardMaterial({ color: 0x2d2e33, roughness: .85, envMapIntensity: .3, side: THREE.DoubleSide })));
  if (lineGeos.length) scene.add(new THREE.Mesh(mergeGeometries(lineGeos), new THREE.MeshBasicMaterial({ map: canvasTex(64, 8, (g, w, h) => { g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.fillStyle = "#e9e4d2"; g.fillRect(0, 0, w / 2, h); }, [1, 1]), transparent: true, opacity: .85, alphaTest: .2, side: THREE.DoubleSide })));

  // ---- buildings, closer to the real neighbourhood: three facade styles (framed rectangular windows,
  // arches, wooden mashrabiya screens) with floor bands, lit shopfronts on the ground floor along the
  // main streets, parapets on the flat roofs, boundary walls round the villas, AC units and water tanks ----
  const facade = (style, lit) => canvasTex(256, 256, (g, w, h) => {      // 8 windows across x 8 floors (32 m x 27 m) before it repeats
    g.fillStyle = lit ? "#000" : "#fff"; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) {
      if (!lit) { g.fillStyle = "rgba(0,0,0,.10)"; g.fillRect(0, r * 32 + 28, w, 4); g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, r * 32 + 27, w, 1); }
      for (let c = 0; c < 8; c++) {
        const x = c * 32 + 9, y = r * 32 + 7, on = rnd() < .38, warm = `rgba(255,${185 + rnd() * 55 | 0},${110 + rnd() * 70 | 0},${.55 + rnd() * .45})`;
        if (style === 0) {                     // framed rectangular windows with a sill, some with a little balcony rail
          if (lit) { g.fillStyle = on ? warm : "#000"; g.fillRect(x + 1, y + 1, 12, 15); continue; }
          g.fillStyle = "#5a5148"; g.fillRect(x - 1, y - 1, 16, 19); g.fillStyle = "#2c3238"; g.fillRect(x + 1, y + 1, 12, 15);
          g.fillStyle = "rgba(255,255,255,.8)"; g.fillRect(x - 2, y + 17, 18, 2);
          if (rnd() < .25) { g.fillStyle = "#3b3a38"; g.fillRect(x - 3, y + 11, 20, 1); for (let k = 0; k < 6; k++) g.fillRect(x - 3 + k * 4, y + 11, 1, 7); }
        } else if (style === 1) {              // arched windows
          g.fillStyle = lit ? (on ? warm : "#000") : "#40392f";
          g.beginPath(); g.moveTo(x, y + 18); g.lineTo(x, y + 6); g.arc(x + 6, y + 6, 6, Math.PI, 0); g.lineTo(x + 12, y + 18); g.closePath(); g.fill();
        } else {                               // wooden mashrabiya screens on some windows
          const screen = rnd() < .5;
          if (lit) { g.fillStyle = on ? warm : "#000"; g.globalAlpha = screen ? .45 : 1; g.fillRect(x, y, 14, 17); g.globalAlpha = 1; continue; }
          g.fillStyle = screen ? "#6b4a2c" : "#2c3238"; g.fillRect(x, y, 14, 17);
          if (screen) { g.strokeStyle = "rgba(30,18,8,.8)"; g.lineWidth = 1; for (let k = 2; k < 14; k += 3) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + 17); g.stroke(); } for (let k = 2; k < 17; k += 3) { g.beginPath(); g.moveTo(x, y + k); g.lineTo(x + 14, y + k); g.stroke(); } }
        }
      }
    }
  }, [1, 1]);
  const shopTex = lit => canvasTex(256, 64, (g, w, h) => {              // ground floor shops: 4 m tall, 32 m of glass fronts and pillars
    g.fillStyle = lit ? "#000" : "#fff"; g.fillRect(0, 0, w, h);
    for (let c = 0; c < 4; c++) {
      const x = c * 64 + 4, on = rnd() < .8, tint = pick(["255,230,180", "200,230,255", "255,255,255"]);
      g.fillStyle = lit ? (on ? `rgba(${tint},${.7 + rnd() * .3})` : "#000") : "#25313a"; g.fillRect(x, 14, 56, 46);
      if (!lit) { g.fillStyle = "#4a4038"; g.fillRect(x - 4, 0, 4, h); g.fillStyle = pick(["#b22234", "#1f6f4a", "#204a8a", "#c8962a", "#333"]); g.fillRect(x, 2, 56, 10); }
      else { g.fillStyle = on ? `rgba(${tint},1)` : "#000"; g.fillRect(x + 4, 4, 48, 5); }
    }
  }, [1, 1]);
  const styles = [0, 1, 2].map(st => new THREE.MeshStandardMaterial({ map: facade(st, false), emissive: 0xffffff, emissiveMap: facade(st, true), emissiveIntensity: .7, roughness: .88, vertexColors: true, side: THREE.DoubleSide }));
  const shopMat = new THREE.MeshStandardMaterial({ map: shopTex(false), emissive: 0xffffff, emissiveMap: shopTex(true), emissiveIntensity: .9, roughness: .5, vertexColors: true, side: THREE.DoubleSide });
  for (const mtl of [...styles, shopMat]) for (const t of [mtl.map, mtl.emissiveMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const plainMat = new THREE.MeshStandardMaterial({ roughness: .95, vertexColors: true, side: THREE.DoubleSide });
  const PALETTE = [0xf1ece2, 0xe8dfcf, 0xd9c7a7, 0xcbb89a, 0xe2e0db, 0xbfb7aa, 0xd8c3a0, 0xefe9df];
  const G = () => ({ pos: [], uv: [], col: [] });
  const wallG = [G(), G(), G()], shopG = G(), plainG = G(), roofs = { pos: [], col: [] }, buildings = [], footprints = [], tanks = [], acs = [], signSpots = [];
  const quad = (o, x1, z1, x2, z2, y0, y1, u0, u1, v0, v1, c) => {
    o.pos.push(x1, y0, z1, x2, y0, z2, x2, y1, z2, x1, y0, z1, x2, y1, z2, x1, y1, z1);
    o.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    for (let k = 0; k < 6; k++) o.col.push(c.r, c.g, c.b);
  };
  const mainPts = []; for (const r of data.roads) if (r.w >= 10) for (const p of r.p) mainPts.push(p);
  const distMain2 = (x, z) => { let best = 1e12; for (const [a, c] of mainPts) { const d = (a - x) ** 2 + (c - z) ** 2; if (d < best) best = d; } return best; };
  const col = new THREE.Color(), pc = new THREE.Color(), wc = new THREE.Color(0xe7dcc8);
  for (const b of data.buildings) {
    let p = b.p; if (p.length < 3) continue;
    let s2 = 0; for (let i = 0; i < p.length; i++) { const a2 = p[i], c2 = p[(i + 1) % p.length]; s2 += a2[0] * c2[1] - c2[0] * a2[1]; }
    if (s2 < 0) p = p.slice().reverse();
    const h = b.h, [cx, cz] = centroid(p), style = b.k === "mosque" ? 1 : (((b.c + Math.floor(cx * 7 + cz * 3)) % 3) + 3) % 3;
    col.setHex(b.k === "mosque" ? 0xefe6d6 : PALETTE[(b.c * 3 + Math.abs(Math.floor(cx + cz))) % PALETTE.length]);
    pc.copy(col).multiplyScalar(.9);
    const shop = b.k !== "mosque" && h > 6 && distMain2(cx, cz) < 34 * 34, g0 = shop ? 4.2 : 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length], L = Math.hypot(x2 - x1, z2 - z1);
      if (shop) quad(shopG, x1, z1, x2, z2, 0, g0, 0, L / 32, 0, 1, col);
      quad(wallG[style], x1, z1, x2, z2, g0, h, 0, L / 32, g0 / 27, h / 27, col);
      quad(plainG, x1, z1, x2, z2, h, h + .9, 0, 1, 0, 1, pc);                              // parapet round the flat roof
      if (L > 5 && h > 5 && rnd() < .35) { const t = .3 + rnd() * .4, fl = Math.floor(1 + rnd() * Math.max(1, (h - 3) / 3.4)); acs.push([x1 + (x2 - x1) * t + (z2 - z1) / L * .35, Math.min(h - 1, fl * 3.4 - 1.2), z1 + (z2 - z1) * t - (x2 - x1) / L * .35, Math.atan2(x2 - x1, z2 - z1)]); }
    }
    if (b.k === "house") {                                                                 // a boundary wall round the villa's plot
      const grow = 2.6, ring = p.map(([x, z]) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1; return [x + dx / d * grow, z + dz / d * grow]; });
      for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; quad(plainG, x1, z1, x2, z2, 0, 2.4, 0, 1, 0, 1, wc); }
    }
    const tris = THREE.ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const rc = col.clone().multiplyScalar(.78);
    for (const t of tris) for (const i of [t[0], t[2], t[1]]) { roofs.pos.push(p[i][0], h, p[i][1]); roofs.col.push(rc.r, rc.g, rc.b); }
    const xs = p.map(q => q[0]), zs = p.map(q => q[1]);
    buildings.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2, hw: (Math.max(...xs) - Math.min(...xs)) / 2, hd: (Math.max(...zs) - Math.min(...zs)) / 2, h, poly: p });
    footprints.push(p);
    if (b.k !== "mosque" && rnd() < .85) for (let t = 1 + Math.floor(rnd() * 2); t > 0; t--) tanks.push([cx + (rnd() - .5) * 4, h, cz + (rnd() - .5) * 4]);
    if (h > 6) signSpots.push({ p, h, cx, cz, shop });
  }
  const geo = o => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3)); if (o.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(o.uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(o.col, 3)); g.computeVertexNormals(); return g; };
  wallG.forEach((o, i) => o.pos.length && scene.add(new THREE.Mesh(geo(o), styles[i])));
  if (shopG.pos.length) scene.add(new THREE.Mesh(geo(shopG), shopMat));
  scene.add(new THREE.Mesh(geo(plainG), plainMat), new THREE.Mesh(geo(roofs), plainMat));
  const inst = (geo2, mat, list, place) => { const mesh = new THREE.InstancedMesh(geo2, mat, Math.max(1, list.length)); list.forEach((it, i) => { place(it, i); mesh.setMatrixAt(i, m4); }); mesh.instanceMatrix.needsUpdate = true; if (list.length) scene.add(mesh); return mesh; };
  inst(new THREE.CylinderGeometry(1, 1, 2, 10).translate(0, 1, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .6 }), tanks, ([x, y, z]) => m4.compose(v.set(x, y, z), q0, sc.set(1, 1, 1)));
  inst(new THREE.BoxGeometry(.9, .55, .45), new THREE.MeshStandardMaterial({ color: 0xd9d9d6, roughness: .6, metalness: .3 }), acs, ([x, y, z, ry]) => m4.compose(v.set(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), sc.set(1, 1, 1)));

  // ---- mosques: a dome with a golden finial and a minaret with a lit balcony, on the real mosques ----
  const white = new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: .7 }), domeMat = new THREE.MeshStandardMaterial({ color: 0xdfe8e4, roughness: .35, metalness: .2 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 1, roughness: .3 }), glowG = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dffb8).multiplyScalar(1.6), toneMapped: false });
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m; };
  for (const [x, z, size, h] of data.mosques) {
    const r = Math.max(5, Math.min(16, size * .3)), top = h + r;
    put(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, x, h, z);
    put(new THREE.SphereGeometry(.7, 12, 8), gold, x, top + .5, z); put(new THREE.CylinderGeometry(.12, .12, 3, 6), gold, x, top + 2, z);
    const mx = x + size * .45, mz = z - size * .45, mh = Math.max(28, h + 22);
    put(new THREE.CylinderGeometry(1.4, 1.8, mh, 12).translate(0, mh / 2, 0), white, mx, 0, mz);
    put(new THREE.CylinderGeometry(2.4, 2.4, .8, 16), white, mx, mh * .74, mz); put(new THREE.CylinderGeometry(1.5, 1.5, .5, 16), glowG, mx, mh * .74 + .7, mz);
    put(new THREE.ConeGeometry(1.5, 5, 12).translate(0, 2.5, 0), domeMat, mx, mh, mz); put(new THREE.SphereGeometry(.4, 8, 6), gold, mx, mh + 5.3, mz);
    buildings.push({ x: mx, z: mz, hw: 2.4, hd: 2.4, h: mh + 5 });
  }

  // ---- palms (parks, the corniche, along the main roads) and amber lamps ----
  const palms = [], lamps = [];
  for (const p of data.parks) { const xs = p.p.map(q => q[0]), zs = p.p.map(q => q[1]); for (let i = 0; i < 40; i++) { const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rnd() * (Math.max(...zs) - Math.min(...zs)); if (pip(x, z, p.p)) palms.push([x, z]); } }
  const along = (pts, every, off, list) => { let carry = 0; for (let i = 1; i < pts.length; i++) { const [x1, z1] = pts[i - 1], [x2, z2] = pts[i], L = Math.hypot(x2 - x1, z2 - z1); if (!L) continue; let d = carry; for (; d < L; d += every) { const t = d / L; list.push([x1 + (x2 - x1) * t - (z2 - z1) / L * off, z1 + (z2 - z1) * t + (x2 - x1) / L * off]); } carry = d - L; } };
  along(promenade, 14, 0, palms); along(promenade, 26, 6, lamps);
  for (const r of data.roads) if (r.w >= 10) { along(r.p, 30, r.w / 2 + 1.5, lamps); along(r.p, 30, -(r.w / 2 + 1.5), lamps); if (r.w >= 16) along(r.p, 22, 0, palms); }
  for (let x = -60; x < 140; x += 12) for (const s of [-1, 1]) if (s < 0 || x < -2 || x > 34) { lamps.push([x, s * 12 + (x > 15 ? 4.2 : 0)]); if (x % 24 === 0) palms.push([x + 6, s * 15]); }
  const trunkG = new THREE.CylinderGeometry(.22, .38, 1, 7).translate(0, .5, 0);
  const frond = i => new THREE.PlaneGeometry(4.2, .9).translate(2.1, 0, 0).rotateX(Math.PI / 2).rotateZ(-.55).rotateY(i / 8 * Math.PI * 2);
  const crownG = mergeGeometries(Array.from({ length: 8 }, (_, i) => frond(i)));
  const ph = palms.map(() => 7 + rnd() * 6);
  inst(trunkG, new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: .9 }), palms, ([x, z], i) => m4.compose(v.set(x, 0, z), q0, sc.set(1, ph[i], 1)));
  inst(crownG, new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: .8, side: THREE.DoubleSide }), palms, ([x, z], i) => m4.compose(v.set(x, ph[i], z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), sc.set(1, 1, 1)));
  inst(new THREE.CylinderGeometry(.09, .12, 1, 6).translate(0, .5, 0), new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: .7, roughness: .4 }), lamps, ([x, z]) => m4.compose(v.set(x, 0, z), q0, sc.set(1, 8, 1)));
  inst(new THREE.BoxGeometry(.9, .18, .4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35c).multiplyScalar(2.2), toneMapped: false }), lamps, ([x, z]) => m4.compose(v.set(x, 8, z), q0, sc.set(1, 1, 1)));

  // ---- signs: on the wall that faces the nearest main road ----
  const signTex = new Map();
  const signOf = (ar, en, color) => {
    const key = ar + color; if (signTex.has(key)) return signTex.get(key);
    const t = canvasTex(512, 192, (g, w, h) => {
      g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(0, 0, w, h); g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.textAlign = "center";
      g.font = '700 92px "Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif'; g.direction = "rtl"; g.fillText(ar, w / 2, 112);
      g.direction = "ltr"; g.font = "800 30px Unbounded, Inter, sans-serif"; g.fillText(en, w / 2, 168);
      g.shadowBlur = 0; g.strokeStyle = color; g.lineWidth = 4; g.globalAlpha = .7; g.strokeRect(6, 6, w - 12, h - 12);
    });
    signTex.set(key, t); return t;
  };
  const sign = (ar, en, color, w, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 192 / 512), new THREE.MeshBasicMaterial({ map: signOf(ar, en, color), transparent: true, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); };
  const nearMain = s => { let best = 1e9; for (const [x, z] of mainPts) { const d = (x - s.cx) ** 2 + (z - s.cz) ** 2; if (d < best) best = d; } return best; };
  const chosen = signSpots.map(s => [nearMain(s) - (s.shop ? 1e4 : 0), s]).filter(([d]) => d < 45 * 45).sort((a, b) => a[0] - b[0]).slice(0, COARSE ? 40 : 80);
  chosen.forEach(([, s], i) => {
    let bestE = null, bd = 1e9;
    for (let k = 0; k < s.p.length; k++) {
      const [x1, z1] = s.p[k], [x2, z2] = s.p[(k + 1) % s.p.length], mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 6) continue;
      let d = 1e9; for (const [x, z] of mainPts) d = Math.min(d, (x - mx) ** 2 + (z - mz) ** 2);
      if (d < bd) { bd = d; bestE = { mx, mz, L, nx: (z2 - z1) / L, nz: -(x2 - x1) / L }; }
    }
    if (!bestE) return;
    const [ar, en] = SIGNS[i % SIGNS.length];
    sign(ar, en, NEON[i % NEON.length], Math.min(bestE.L * .7, 12), bestE.mx + bestE.nx * .08, s.shop ? 5.2 : Math.min(s.h - 1.6, 4.2), bestE.mz + bestE.nz * .08, Math.atan2(bestE.nx, bestE.nz));
  });
  const board = (ar, en, color, x, z, ry, y = 7) => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, y, 8).translate(0, y / 2, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: .6, roughness: .4 })); pole.position.set(x, 0, z); scene.add(pole); sign(ar, en, color, 12, x, y + 2, z, ry); };
  board("الطبيشي", "TUBAISHI", "#ffd23d", -30, -16, 0); board("حديقة الطبيشي", "TUBAISHI PARK", "#7dff6a", -168, 318, 0, 6); board("هايدرا", "HYDRA LTE242", "#ff3b5c", 4, -16, 0); board("فويد", "VOID", "#ffffff", 30, 20, Math.PI); board("مرحبا", "WELCOME", "#3dfcff", -50, 18, Math.PI);

  // ---- where people walk: sidewalks beside the streets and the corniche ----
  const walkways = [promenade];
  for (const r of data.roads) if (r.w >= 7 && r.w <= 12 && r.p.length > 1) walkways.push(offsetLine(r.p, r.w / 2 + 1.3), offsetLine(r.p, -(r.w / 2 + 1.3)));

  return { buildings, footprints, roads: data.roads, parks: data.parks.map(p => p.p), water: [data.sea], beaches: [], walkways, bounds: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }, credit: data.credit };
}
