// GPS and autopilot. Pick a place and the shortest way along the streets lights up on the road and the minimap,
// with turn-by-turn directions (street names and all). Switch on Autopilot and the car drives the route itself:
// keeps to the speed, slows for corners and for cars ahead. If the place is in the air (a rooftop helipad) or
// you are flying, it flies there instead: climbs over the towers, cruises, then slows down and lands.
import * as THREE from "three";
import { GRID, phase } from "./city.js";

const ord = n => n + (n % 100 > 10 && n % 100 < 14 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
export const avName = i => i === 6 ? "Park Ave" : `${ord(i + 1)} Ave`;
export const stName = j => j === 10 ? "Broadway" : `${ord(Math.abs(j - 10) * 7 + 14)} St`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function createNav(scene, api, W, ZONES, starts, clockT = () => performance.now() / 1000) {
  const { ax, sz, NX, NZ } = GRID, $ = id => document.getElementById(id);
  // the street graph: every intersection, linked along every open segment, plus the bridge
  const id = (i, j) => i * NZ + j, nodes = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) nodes[id(i, j)] = { x: ax(i), z: sz(j), i, j, n: [] };
  const link = (a, b) => { const A = nodes[a], B = nodes[b], d = Math.hypot(A.x - B.x, A.z - B.z); A.n.push([b, d]); B.n.push([a, d]); };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { if (i < NX - 1 && GRID.hasX(j, i)) link(id(i, j), id(i + 1, j)); if (j < NZ - 1 && GRID.hasZ(i, j)) link(id(i, j), id(i, j + 1)); }
  const extra = (x, z, to) => { nodes.push({ x, z, n: [] }); link(nodes.length - 1, to); return nodes.length - 1; };
  const bridgeMid = extra(1400, 0, id(12, 10)), brooklyn = extra(1690, 0, bridgeMid);
  { let prev = extra(2200, 0, brooklyn); prev = extra(2640, 0, prev); const T = (W.city.mountains || {}).trail || []; for (const [x, , z] of T.slice(1)) prev = extra(x, z, prev); }
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
    { name: "Times Square", x: ax(7), z: sz(6) }, { name: "Central Park lawn", x: W.city.lawn.x, z: W.city.lawn.z, off: true }, { name: "Brooklyn (over the bridge)", x: 1690, z: 0 }, { name: "⛰️ Mountains (trail start)", x: 2640, z: 0, off: true }, { name: "🏔️ The summit", x: 3900, z: -380, off: true }, { name: "🎡 Ferris wheel & boardwalk", x: 994, z: 1250, off: true }, { name: "🛹 Stunt park", x: -760, z: 1400, off: true },
    { name: "Hudson piers", x: -1010, z: sz(5) }, { name: "Downtown", x: ax(11), z: sz(17) }, { name: "The loop and ramp", x: -100, z: 0 },
    ...ZONES.filter(z => z.safe && z.y).map(z => ({ name: `Helipad ${z.id} (${Math.round(z.y)} m up)`, x: z.x, z: z.z, y: z.y, air: true })),
    ...starts.map(s => ({ name: `Race: ${s.r.name}`, x: s.x, z: s.z, air: !!s.r.air && false })),
  ];
  // the route drawn on the road
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dfcff).multiplyScalar(1.6), transparent: true, opacity: .55, depthWrite: false, toneMapped: false });
  let routeMesh = null, dest = null, pts = [], ptNode = [], auto = false, lastRoute = 0, info = "", skyCache = null, stuck = 0, backT = 0;
  // the highest thing between here and there (for picking a safe cruising height)
  const tallestAlong = (x0, z0, x1, z1, pad = 30) => { let h = 0; const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 35)); for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n; for (const b of W.city.nearFast(x, z, pad)) if (Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad && b.h > h) h = b.h; h = Math.max(h, W.city.terrainH ? W.city.terrainH(x, z) + 15 : 0); } return h; };
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
    pts = [[p.x, p.z], ...ids.map(k => [nodes[k].x, nodes[k].z]), [dest.x, dest.z]]; ptNode = [null, ...ids, null];
    // drop a first node that is behind us
    if (pts.length > 3) { const [x0, z0] = pts[0], [x1, z1] = pts[1], [x2, z2] = pts[2]; if ((x1 - x0) * (x2 - x1) + (z1 - z0) * (z2 - z1) < 0 && Math.hypot(x1 - x0, z1 - z0) < 40) { pts.splice(1, 1); ptNode.splice(1, 1); } }
    // keep right: avenues use the inner lane (2.6 m off the middle), streets 3 m, Broadway 3.2 m
    const laneOf = k => { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], nd = nodes[ptNode[k + 1] ?? ptNode[k]] || {}; return Math.abs(z1 - z0) > Math.abs(x1 - x0) ? 2.6 : nd.j === 10 ? 3.2 : 3; };
    const nrm = k => { const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0) || 1, w = laneOf(k); return [-(z1 - z0) / L * w, (x1 - x0) / L * w]; };
    const off = pts.map((q, k) => { if (k === 0) return q; const a = nrm(k - 1), b = k < pts.length - 1 ? nrm(k) : a; const dot = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1); return dot > .95 ? [q[0] + a[0], q[1] + a[1]] : dot < -.5 ? [q[0] + a[0], q[1] + a[1]] : [q[0] + a[0] + b[0], q[1] + a[1] + b[1]]; });
    pts = off;
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
        const node = nodes.find(q => q.i != null && Math.abs(q.x - x1) < 6 && Math.abs(q.z - z1) < 6), onto = node && node.i != null ? (Math.abs(x2 - x1) > Math.abs(z2 - z1) ? stName(node.j) : avName(node.i)) : "";
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
      // long trips in a car that can fly go by air: straight over everything, then down onto the road at the end
      const canFly = g.veh === "car" && (!g.ride || g.ride.model.kind.fly) && g.fuel > .1;
      if (canFly && !dest.air && g.mode === "drive" && flat > 700 && !g.apFlyMsg) { g.apFlyMsg = true; api.say("Autopilot: long trip, flying there", 2.5); }
      if (flat < 600) g.apFlyMsg = false;
      const needFly = dest.air || g.mode === "air" || (canFly && flat > 700);
      if (needFly) {
        if (g.mode === "drive" && dest.air && flat < 18 && Math.abs(g.y - dest.y) < 3) { api.say(`You have arrived: ${dest.name}`, 3); const d = dest; setDest(null); void d; return { turn: 0, gas: 0, brake: 1 }; }
        if (g.mode === "drive") { api.fly(); return { turn: 0, gas: 0, brake: 0, up: 1 }; }
        if (!skyCache || performance.now() - skyCache.t > 2000) skyCache = { t: performance.now(), h: tallestAlong(g.x, g.z, dest.x, dest.z) };
        const clear = skyCache.h + 35, targetY = dest.air ? (flat < 400 ? Math.max(dest.y + 28, Math.min(clear, dest.y + 120)) : Math.max(380, dest.y + 40, clear)) : Math.max(70, clear);   // ground trips: only as high as the tallest thing on the way
        // something tall right in front of us: stop going forward and climb over it first
        { const hx = Math.cos(g.yaw), hz = Math.sin(g.yaw); let wall = false; for (let d = 15; d <= 140 && !wall; d += 15) for (const b of W.city.nearFast(g.x + hx * d, g.z + hz * d, 12)) if (b.h > g.y - 4 && Math.abs(g.x + hx * d - b.x) < b.hw + 12 && Math.abs(g.z + hz * d - b.z) < b.hd + 12) { wall = true; break; }
          if (wall && !(dest.air && flat < 30)) { g.hover = true; return { turn: clamp(wrap(Math.atan2(dest.z - g.z, dest.x - g.x) - g.yaw) * 1.6, -1, 1), gas: 0, brake: V > 8 ? 1 : 0, up: 1, down: 0 }; } }
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
      const look = Math.max(9, V * .75), t = along(g.x, g.z, look), ins = instruction(g.x, g.z, t.k);
      if (g.apPass) { const [ax1, az1] = pts[t.k], [bx1, bz1] = pts[t.k + 1], L1 = Math.hypot(bx1 - ax1, bz1 - az1) || 1; t.x += -(bz1 - az1) / L1 * g.apPass; t.z += (bx1 - ax1) / L1 * g.apPass; }
      const head = Math.atan2(t.z - g.z, t.x - g.x), err = wrap(head - g.yaw), cy = Math.cos(g.yaw), sy = Math.sin(g.yaw);
      const u = g.vel.x * cy + g.vel.z * sy;
      // stuck against something: reverse and swing round for a moment, then try again
      if (backT > 0) { backT -= dt; return { turn: -clamp(err * 2, -1, 1), gas: 0, brake: 1 }; }
      // fast: flat out on the straights, then brake late and hard (the car can shed ~26 m/s every second; we plan on 12)
      const A = 12, highway = Math.abs(g.z) < 30 && g.x > 1000, brakeTo = (v, d) => Math.sqrt(v * v + 2 * A * Math.max(0, d));
      let want = highway ? 50 : 38, why = "cruise"; const lim = (v, tag) => { if (v < want) { want = v; why = tag; } };
      if (ins.corner < 200) lim(brakeTo(Math.abs(ins.turn) > 2 ? 6 : 11, ins.corner - 16), "corner");
      lim(brakeTo(0, flat - 6), "arrive");
      if (Math.abs(err) > .6) lim(9, "heading");
      // traffic lights: stop at the line unless it is green (or amber and too late to stop)
      { let dAlong = Math.hypot(pts[t.k + 1][0] - g.x, pts[t.k + 1][1] - g.z), n = t.k + 1;
        while (n < pts.length - 1 && ptNode[n] == null) { dAlong += Math.hypot(pts[n + 1][0] - pts[n][0], pts[n + 1][1] - pts[n][1]); n++; }
        const nd = nodes[ptNode[n]];
        if (nd && nd.i != null && dAlong < 60) {
          const [px, pz] = pts[Math.max(0, n - 1)], axis = Math.abs(pts[n][0] - px) > Math.abs(pts[n][1] - pz) ? 0 : 1, ph = phase(nd.i, nd.j, clockT());
          const green = axis === 0 ? ph === 0 : ph === 2, amber = axis === 0 ? ph === 1 : ph === 3, line = dAlong - (axis === 0 ? GRID.avW(nd.i) : GRID.stW(nd.j)) / 2 - 3.5;
          if (!green && line > -1) {
            let cross = false; for (const c of api.nearCars(nd.x, nd.z, 60)) { if (c.fly || c.wreck || c.taken || c.v < 2) continue; const toward = (nd.x - c.x) * Math.cos(c.yaw) + (nd.z - c.z) * Math.sin(c.yaw), d = Math.hypot(nd.x - c.x, nd.z - c.z); if (toward > -5 && toward / Math.max(c.v, 1) < 2.6 && d < 45 && Math.abs(Math.cos(c.yaw) * (axis === 0 ? 1 : 0) + Math.sin(c.yaw) * (axis === 1 ? 1 : 0)) < .5) { cross = true; break; } }
            lim(cross ? brakeTo(0, line - .8) : brakeTo(16, line + 6), "light");      // nobody coming across: through it (a bit slower); else stop at the line
          }
        } }
      // the car in front (in whatever lane we are in now): keep a short gap and brake late; a car crossing our path close ahead: give way
      const [sx0, sz0] = pts[t.k], [sx1, sz1] = pts[t.k + 1], avenue = Math.abs(sz1 - sz0) > Math.abs(sx1 - sx0), passOff = g.apPass || 0;
      let slowAhead = false, origBlocked = false, oncoming = false;
      for (const c of api.nearCars(g.x, g.z, 90)) {
        if (c.wreck || c.fly || c.taken) continue;
        const dx = c.x - g.x, dz = c.z - g.z, fwd = dx * cy + dz * sy, side = -dx * sy + dz * cy, cvx = Math.cos(c.yaw) * c.v, cvz = Math.sin(c.yaw) * c.v, along2 = cvx * cy + cvz * sy, across = -cvx * sy + cvz * cy;
        if (fwd > 1 && fwd < 70 && Math.abs(side) < 2.1) { const gap = fwd - c.kind.L / 2 - 3; lim(gap <= .8 ? 0 : brakeTo(Math.max(0, along2) * Math.min(1, gap / 6), gap - Math.max(3, u * .35)), "lead"); if (gap < 45 && along2 < 30) slowAhead = true; if (along2 < -1 && fwd < 90) oncoming = true; }
        else if (fwd > 1 && fwd < 22 && Math.abs(side) < 9 && Math.abs(across) > 2.5 && side * across < 0) lim(2.5, "crossing");     // it is coming across in front
        if (passOff && Math.abs(side + passOff) < 2.2 && fwd > -10 && fwd < 14) origBlocked = true;                                 // still alongside the car we are passing
        // emergency: will any car be within 2.6 m of us in the next 1.3 s if we keep going? then stop now
        { const rvx = cvx - g.vel.x, rvz = cvz - g.vel.z, rv2 = rvx * rvx + rvz * rvz, tc = rv2 > .01 ? Math.max(0, Math.min(1.3, -(dx * rvx + dz * rvz) / rv2)) : 0, mx = dx + rvx * tc, mz = dz + rvz * tc;
          if (Math.hypot(mx, mz) < 2.6 + c.kind.W * .3 && fwd > -1 && Math.hypot(dx, dz) < 32) lim(tc < .5 ? 0 : Math.max(0, u * .4), "emergency"); }
      }
      // overtaking: on an avenue into the other lane our way (3.6 m right); on a one-lane street through the oncoming lane (6 m left)
      // when it is clear for long enough and no junction is close; back in as soon as we are past, or at once if anything comes the other way
      const laneFree = (off, back, ahead, onc) => { const px = g.x - sy * off, pz = g.z + cy * off; for (const c of api.nearCars(px, pz, ahead + 6)) { if (c.fly || c.wreck || c.taken) continue; const dx = c.x - px, dz = c.z - pz, f = dx * cy + dz * sy, sd = -dx * sy + dz * cy; if (Math.abs(sd) < 2.3 && f > -back && f < (onc && (Math.cos(c.yaw) * cy + Math.sin(c.yaw) * sy) < 0 ? ahead : Math.min(ahead, 30))) return false; } return true; };
      const toNode = Math.hypot(pts[t.k + 1][0] - g.x, pts[t.k + 1][1] - g.z);
      if (!passOff) { if (slowAhead && ins.corner > 90 && u > 4) { if (avenue && laneFree(3.6, 9, 30, false)) g.apPass = 3.6; else if (!avenue && toNode > 55 && laneFree(-6, 6, 95, true)) g.apPass = -6; } }
      else if ((passOff < 0 && (oncoming || toNode < 30 || ins.corner < 60)) || (!origBlocked && laneFree(-passOff, 10, 16, false)) || ins.corner < 45) g.apPass = 0;
      // walls, posts, kerbs, parked things: look ahead along the way we are pointing
      let wallAt = 1e9; { const reach = Math.max(8, u * u / (2 * A) + 8); for (let d = 3; d <= reach; d += 2.5) { if (api.hitBox(g.x + cy * d, g.z + sy * d, .5, 1.15)) { wallAt = d; lim(brakeTo(0, d - 4), "wall"); break; } } }
      // pointing the wrong way (a car cannot turn on the spot): a three-point turn; nose to a wall: back off it
      if ((Math.abs(err) > 1.7 && u < 5) || (wallAt < 6 && Math.abs(u) < 1.5 && Math.abs(err) > .35)) { backT = Math.abs(err) > 1.7 ? 1.3 : 1; return { turn: -clamp(err * 2, -1, 1), gas: 0, brake: 1 }; }
      // stuck: we want to move (or something is in the way) and we are going nowhere
      if ((want > 2 || wallAt < 6) && Math.abs(u) < .8) { stuck += dt; if (stuck > 1.6) { stuck = 0; backT = 1.2; plan(); } } else stuck = 0;
      // a car ahead in our lane
      g.apWhy = why;
      return { turn: clamp(err * (u > 25 ? 1.6 : 2.2), -1, 1), gas: u < want - .5 ? clamp((want - u) / 3, .3, 1) : 0, brake: u > want + .8 ? clamp((u - want) / 3, .3, 1) : 0, nitro: highway && u < want - 8 && Math.abs(err) < .1 };
    },
  };
}
