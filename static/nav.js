// GPS and autopilot. Pick a place and the shortest way along the streets lights up on the road and the minimap,
// with turn-by-turn directions (street names and all). Switch on Autopilot and the car drives the route itself:
// keeps to the speed, slows for corners and for cars ahead. If the place is in the air (a rooftop helipad) or
// you are flying, it flies there instead: climbs over the towers, cruises, then slows down and lands.
import * as THREE from "three";
import { GRID } from "./city.js";

const ord = n => n + (n % 100 > 10 && n % 100 < 14 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
export const avName = i => i === 6 ? "Park Ave" : `${ord(i + 1)} Ave`;
export const stName = j => j === 10 ? "Broadway" : `${ord(Math.abs(j - 10) * 7 + 14)} St`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createNav(scene, api, W, ZONES, starts) {
  const { ax, sz, NX, NZ } = GRID, $ = id => document.getElementById(id);
  // the street graph: every intersection, linked along every open segment, plus the bridge
  const id = (i, j) => i * NZ + j, nodes = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) nodes[id(i, j)] = { x: ax(i), z: sz(j), i, j, n: [] };
  const link = (a, b) => { const A = nodes[a], B = nodes[b], d = Math.hypot(A.x - B.x, A.z - B.z); A.n.push([b, d]); B.n.push([a, d]); };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { if (i < NX - 1 && GRID.hasX(j, i)) link(id(i, j), id(i + 1, j)); if (j < NZ - 1 && GRID.hasZ(i, j)) link(id(i, j), id(i, j + 1)); }
  const extra = (x, z, to) => { nodes.push({ x, z, n: [] }); link(nodes.length - 1, to); return nodes.length - 1; };
  const bridgeMid = extra(1400, 0, id(12, 10)), brooklyn = extra(1690, 0, bridgeMid);
  const nearestNode = (x, z) => { let b = 0, bd = 1e18; nodes.forEach((n, k) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; b = k; } }); return b; };
  function path(a, b) {                       // Dijkstra over ~280 nodes: instant
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
    dist[a] = 0;
    for (let it = 0; it < nodes.length; it++) {
      let u = -1, best = Infinity; for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === b) break; done[u] = 1;
      for (const [v, d] of nodes[u].n) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
    const out = []; for (let k = b; k >= 0; k = prev[k]) out.unshift(k); return out[0] === a ? out : [a];
  }
  // places
  const PLACES = [
    { name: "Times Square", x: ax(7), z: sz(6) }, { name: "Central Park lawn", x: W.city.lawn.x, z: W.city.lawn.z, off: true }, { name: "Brooklyn (over the bridge)", x: 1690, z: 0 },
    { name: "Hudson piers", x: -1010, z: sz(5) }, { name: "Downtown", x: ax(11), z: sz(17) }, { name: "The loop and ramp", x: -100, z: 0 },
    ...ZONES.filter(z => z.safe && z.y).map(z => ({ name: `Helipad ${z.id} (${Math.round(z.y)} m up)`, x: z.x, z: z.z, y: z.y, air: true })),
    ...starts.map(s => ({ name: `Race: ${s.r.name}`, x: s.x, z: s.z, air: !!s.r.air && false })),
  ];
  // the route drawn on the road
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dfcff).multiplyScalar(1.6), transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
  let routeMesh = null, dest = null, pts = [], auto = false, lastRoute = 0, info = "";
  function draw() {
    if (routeMesh) { scene.remove(routeMesh); routeMesh.geometry.dispose(); routeMesh = null; }
    if (pts.length < 2 || dest.air) return;
    const geos = [];
    for (let k = 0; k < pts.length - 1; k++) { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < .5) continue; const g = new THREE.PlaneGeometry(L + 2, 2.2).rotateX(-Math.PI / 2).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, .22, (z0 + z1) / 2); geos.push(g); }
    if (!geos.length) return;
    const pos = []; for (const g of geos) { const p = g.toNonIndexed().attributes.position.array; for (const v of p) pos.push(v); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    routeMesh = new THREE.Mesh(geo, lineMat); routeMesh.renderOrder = 2; scene.add(routeMesh);
  }
  function plan() {
    const p = api.state; if (!p || !dest) return;
    lastRoute = performance.now();
    if (dest.air) { pts = [[p.x, p.z], [dest.x, dest.z]]; draw(); return; }
    const a = nearestNode(p.x, p.z), b = nearestNode(dest.x, dest.z), ids = path(a, b);
    pts = [[p.x, p.z], ...ids.map(k => [nodes[k].x, nodes[k].z]), [dest.x, dest.z]];
    // drop a first node that is behind us
    if (pts.length > 3) { const [x0, z0] = pts[0], [x1, z1] = pts[1], [x2, z2] = pts[2]; if ((x1 - x0) * (x2 - x1) + (z1 - z0) * (z2 - z1) < 0 && Math.hypot(x1 - x0, z1 - z0) < 40) pts.splice(1, 1); }
    draw();
  }
  function setDest(d) { dest = d; if (!d) { pts = []; draw(); auto = false; syncAuto(); $("gGps").textContent = ""; return; } plan(); api.say(`GPS: ${d.name}`, 2); }
  // where along the route we are: the closest segment, and the point some way further on
  function along(x, z, ahead) {
    let best = 1e18, k0 = 0, t0 = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax0, az0] = pts[k], [bx, bz] = pts[k + 1], dx = bx - ax0, dz = bz - az0, L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax0) * dx + (z - az0) * dz) / L2, 0, 1);
      const d = (ax0 + dx * t - x) ** 2 + (az0 + dz * t - z) ** 2; if (d < best) { best = d; k0 = k; t0 = t; }
    }
    let k = k0, t = t0, left = ahead;
    while (k < pts.length - 1) { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0), rest = L * (1 - t); if (rest >= left) { const u = t + left / (L || 1); return { off: Math.sqrt(best), k: k0, x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u }; } left -= rest; k++; t = 0; }
    const e = pts[pts.length - 1]; return { off: Math.sqrt(best), k: k0, x: e[0], z: e[1] };
  }
  function instruction(x, z, k) {
    // the next corner where the route turns
    let d = Math.hypot(pts[k + 1][0] - x, pts[k + 1][1] - z);
    for (let n = k + 1; n < pts.length - 1; n++) {
      const [x0, z0] = pts[n - 1], [x1, z1] = pts[n], [x2, z2] = pts[n + 1], a1 = Math.atan2(z1 - z0, x1 - x0), a2 = Math.atan2(z2 - z1, x2 - x1), turn = wrap(a2 - a1);
      if (Math.abs(turn) > .5) {
        const node = nodes.find(q => Math.abs(q.x - x1) < 1 && Math.abs(q.z - z1) < 1), onto = node && node.i != null ? (Math.abs(x2 - x1) > Math.abs(z2 - z1) ? stName(node.j) : avName(node.i)) : "";
        return { turn, d, text: `${turn > 0 ? "↱ Turn right" : "↰ Turn left"} in ${Math.round(d / 10) * 10} m${onto ? " onto " + onto : ""}`, corner: d };
      }
      d += Math.hypot(x2 - x1, z2 - z1);
    }
    return { turn: 0, d, text: `↑ ${Math.round(d / 10) * 10} m to ${dest.name}`, corner: 1e9 };
  }
  const syncAuto = () => { $("gAuto").classList.toggle("on", auto); $("gAuto").textContent = auto ? "Autopilot ON" : "Autopilot"; };
  function toggleAuto() {
    if (!dest) { openPanel(); api.say("Pick a place first, then Autopilot drives you there", 3); return; }
    auto = !auto; syncAuto(); api.say(auto ? "Autopilot on: steer, brake or gas to take over" : "Autopilot off", 2);
  }
  // the destination picker
  function openPanel() {
    const el = $("gGpsPanel"); el.hidden = !el.hidden; if (el.hidden) return;
    el.innerHTML = `<h3>GPS: where to?</h3><div class="places">${PLACES.map((p, k) => `<button class="pill" data-k="${k}">${p.name}</button>`).join("")}</div><div class="row"><button class="pill" id="gGpsClear">Clear route</button><button class="pill solid" id="gGpsClose">Close</button></div>`;
    el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { setDest(PLACES[+b.dataset.k]); el.hidden = true; });
    $("gGpsClear").onclick = () => { setDest(null); el.hidden = true; }; $("gGpsClose").onclick = () => el.hidden = true;
  }
  $("gGpsBtn").onclick = openPanel; $("gAuto").onclick = toggleAuto;
  addEventListener("keydown", e => { if (!api.active() || e.repeat) return; if (e.code === "KeyM") openPanel(); if (e.code === "KeyO") toggleAuto(); });

  return {
    get dest() { return dest; }, get pts() { return pts; }, get auto() { return auto; }, setDest, toggleAuto,
    stop() { if (auto) { auto = false; syncAuto(); } },
    update() {
      const p = api.state; if (!dest || !p) return;
      const air = p.mode === "air";
      const flat = Math.hypot(p.x - dest.x, p.z - dest.z);
      if (flat < (dest.air ? 12 : 22) && (!dest.air || Math.abs(p.y - dest.y) < 3) && !air && (!auto || p.vel.length() < 1.5)) { api.say(`You have arrived: ${dest.name}`, 3); setDest(null); return; }
      const a = along(p.x, p.z, 0);
      if (!dest.air && !air && a.off > 30 && performance.now() - lastRoute > 1500) plan();
      const ins = dest.air || air ? { text: `✈ ${Math.round(flat)} m to ${dest.name}` } : instruction(p.x, p.z, a.k);
      info = ins.text; $("gGps").textContent = info;
    },
    // the autopilot: returns the controls to use this step, or null to leave them to you
    controls(g, dt, overridden) {
      if (!auto || !dest) return null;
      if (overridden) { auto = false; syncAuto(); api.say("Autopilot off: you have control", 1.5); return null; }
      const V = g.vel.length(), flat = Math.hypot(g.x - dest.x, g.z - dest.z);
      const needFly = dest.air || g.mode === "air";
      if (needFly) {
        if (g.mode === "drive" && dest.air && flat < 18 && Math.abs(g.y - dest.y) < 3) { api.say(`You have arrived: ${dest.name}`, 3); const d = dest; setDest(null); void d; return { turn: 0, gas: 0, brake: 1 }; }
        if (g.mode === "drive") { api.fly(); return { turn: 0, gas: 0, brake: 0, up: 1 }; }
        const targetY = dest.air ? (flat < 400 ? dest.y + 28 : Math.max(380, dest.y + 40)) : flat < 400 ? 60 : 380;
        const head = Math.atan2(dest.z - g.z, dest.x - g.x), err = wrap(head - g.yaw), turn = clamp(err * 1.6, -1, 1);
        // climb or sink at a steady rate (never hauling the nose up into a stall)
        const wantVy = clamp((targetY - g.y) * .15, -12, 16), up = g.vel.y < wantVy - 1.5 ? 1 : 0, down = g.vel.y > wantVy + 3 ? 1 : 0;
        const below = dest.air && flat > 25 && g.y < dest.y + 12;
        if (flat < 220 || (below && flat < 420)) {          // slow down, get above the pad first, then hover in over the spot
          g.hover = true; const slow = V > (below ? 6 : 22);
          if (flat < 10 && V < 6 && !below) { g.landing = true; return { turn: 0, gas: 0, brake: 0, up: 0, down: 0 }; }
          return { turn, gas: !slow && !below && Math.abs(err) < .5 && flat > 12 ? .6 : 0, brake: slow ? 1 : 0, up: below ? 1 : up, down: below ? 0 : down };
        }
        return { turn, gas: g.stall > .3 ? 0 : 1, brake: 0, up, down };
      }
      // on the road
      const look = Math.max(10, V * 1.1), t = along(g.x, g.z, look), ins = instruction(g.x, g.z, t.k);
      const head = Math.atan2(t.z - g.z, t.x - g.x), err = wrap(head - g.yaw);
      let want = 26; if (ins.corner < 75) want = Math.min(want, 9 + Math.max(0, ins.corner - 20) * .3); if (flat < 70) want = Math.min(want, Math.max(0, (flat - 5) * .35)); if (Math.abs(err) > .6) want = Math.min(want, 8);
      // a car ahead in our lane
      for (const c of api.nearCars(g.x, g.z, 30)) { if (c.wreck) continue; const dx = c.x - g.x, dz = c.z - g.z, fwd = dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw), side = -dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw); if (fwd > 2 && fwd < 26 && Math.abs(side) < 2.4) want = Math.min(want, Math.max(0, c.v - 1 + (fwd - 9) * .5)); }
      const u = g.vel.x * Math.cos(g.yaw) + g.vel.z * Math.sin(g.yaw);
      return { turn: clamp(err * 2.2, -1, 1), gas: u < want - 1 ? clamp((want - u) / 6, .2, 1) : 0, brake: u > want + 2 ? clamp((u - want) / 8, .2, 1) : 0 };
    },
  };
}
