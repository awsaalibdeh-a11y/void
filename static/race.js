// Street races round VOID City: drive into a start marker and press Enter (or tap Race). Gates on the real streets,
// three AI rivals in sports cars (solo), or everybody in your online room. A countdown, a timer, live positions,
// best times kept on this device. The Sky Rings race is a flying time trial through gates in the air.
// Ghosts: your best run on every route is recorded and races beside you next time, with a split at every gate.
// Your own routes: drop gates while you drive or fly, save them, race them against your ghost, share them as a link.
import * as THREE from "three";
import { GRID } from "./city.js";
import { KINDS, vehicle } from "./npc.js";
import { makeDriver } from "./police.js";

const G = (i, j) => [GRID.ax(i), 0, GRID.sz(j)];
export const ROUTES = [
  { id: "midtown", name: "Midtown Sprint", pts: [G(7, 8), G(7, 4), G(9, 4), G(9, 1), G(5, 1), G(5, 6), G(8, 6)] },
  { id: "park", name: "Park Loop ×2", pts: [G(2, 12), G(5, 12), G(5, 18), G(2, 18), G(2, 12), G(5, 12), G(5, 18), G(2, 18), G(2, 13)] },
  { id: "bridge", name: "Bridge Run", pts: [G(7, 10), G(12, 10), [1400, 0, 0], [1690, 0, 0]] },
  { id: "downtown", name: "Downtown Dash", pts: [G(8, 13), G(12, 13), G(12, 19), G(9, 19), G(9, 15), G(11, 15)] },
  { id: "drag", name: "Runway Drag", pts: [[-2600, 0, 0], [-2350, 0, 0], [-2100, 0, 0], [-1960, 0, 0]] },
  { id: "sky", name: "Sky Rings", air: true, pts: [[420, 0, -40], [420, 90, -160], [520, 120, -300], [430, 150, -450], [250, 170, -520], [60, 150, -460], [-60, 120, -330], [-120, 90, -180], [-260, 70, 60], [-400, 60, 250]] },
];
const RIVALS = [["VIPER", 0xd21f2b], ["BLAZE", 0xff6a00], ["NOVA", 0x1f6fe0]];
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

export function createRaces(scene, api, sound, canvasTex, net) {
  const $ = id => document.getElementById(id);
  const D = makeDriver(api);
  const label = (text, col) => { const t = canvasTex(512, 128, (g, w, h) => { g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = col; g.font = "900 54px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText(text, w / 2, 84); }); return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, toneMapped: false, depthTest: true })); };
  // start markers: a column of light and a floating name
  const custom = (store.get("void.routes") || []).filter(r => r && Array.isArray(r.pts) && r.pts.length >= 3);
  const routes = [...ROUTES, ...custom];
  const makeStart = r => {
    const [x, , z] = r.pts[0], [nx, , nz] = r.pts[1], back = Math.atan2(nz - z, nx - x);
    const sx = x - Math.cos(back) * 35, sz = z - Math.sin(back) * 35;
    const col = r.custom ? "#c07dff" : r.air ? "#3dfcff" : "#ffd23d";
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 60, 32, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.6), transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    pillar.position.set(sx, 0, sz); scene.add(pillar);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.4, 6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), toneMapped: false })); ring.position.set(sx, .15, sz); scene.add(ring);
    const s = label("🏁 " + r.name.toUpperCase(), col); s.scale.set(16, 4, 1); s.position.set(sx, 9, sz); scene.add(s);
    return { r, x: sx, z: sz, yaw: back, pillar, ring, s };
  };
  const starts = routes.map(makeStart);
  // gates: two posts and a banner across the road
  const gateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(2), toneMapped: false }), dimMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const checker = canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? "#111" : "#fff"; g.fillRect(x, y, 16, 16); } });
  const gates = [];
  function buildGates(r) {
    clearGates();
    r.pts.forEach((p, k) => {
      const q = r.pts[Math.max(0, k - 1)], o = r.pts[Math.min(r.pts.length - 1, k + 1)], dir = k ? Math.atan2(p[2] - q[2], p[0] - q[0]) : Math.atan2(o[2] - p[2], o[0] - p[0]);
      const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); g.rotation.y = -dir;
      const fin = k === r.pts.length - 1;
      if (r.air) { const ring = new THREE.Mesh(new THREE.TorusGeometry(10, .7, 10, 40), gateMat.clone()); ring.rotation.y = Math.PI / 2; g.add(ring); g.userData.parts = [ring]; }
      else {
        const W = 11, parts = [];
        for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.6, 7, .6).translate(0, 3.5, 0), gateMat.clone()); post.position.z = s * W; g.add(post); parts.push(post); }
        const banner = new THREE.Mesh(new THREE.BoxGeometry(.3, 1.4, W * 2 + .6), fin ? new THREE.MeshBasicMaterial({ map: checker, toneMapped: false }) : gateMat.clone()); banner.position.y = 7; g.add(banner); if (!fin) parts.push(banner);
        g.userData.parts = parts;
      }
      scene.add(g); gates.push(g);
    });
  }
  function clearGates() { for (const g of gates) scene.remove(g); gates.length = 0; }
  // rivals: sports cars with their own colours
  const sport = KINDS.find(k => k.id === "sports"), sg = vehicle(sport);
  const rivals = RIVALS.map(([name, col]) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(sg.body, new THREE.MeshStandardMaterial({ vertexColors: true, color: col, roughness: .25, metalness: .6 })), new THREE.Mesh(sg.lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2, 2, 2) })));
    const tag = label(name, "#" + col.toString(16).padStart(6, "0")); tag.scale.set(5, 1.25, 1); tag.position.y = 3.4; g.add(tag);
    g.visible = false; scene.add(g); return { name, g, x: 0, z: 0, yaw: 0, v: 0, cp: 1, done: 0, skill: 1 };
  });

  // the ghost: a see-through copy of your best run on this route
  const ghost = new THREE.Group(); ghost.add(new THREE.Mesh(sg.body, new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 1.6, 2), transparent: true, opacity: .28, depthWrite: false, toneMapped: false })));
  { const gt = label("GHOST", "#3dfcff"); gt.scale.set(5, 1.25, 1); gt.position.y = 3.4; ghost.add(gt); } ghost.visible = false; scene.add(ghost);
  const ghostOf = id => { const gh = store.get("void.ghost." + id); return gh && Array.isArray(gh.p) && gh.p.length >= 8 ? gh : null; };
  let R = null;                 // the race in progress
  function begin(route, opts = {}) {
    const p = api.state; if (!p) return;
    api.policeClear && api.policeClear();
    const st = starts.find(s => s.r === route);
    buildGates(route);
    const slot = opts.slot ?? 0, side = [0, 1, -1, 2, -2, 3, -3][slot % 7] * 4.2, row = Math.floor(slot / 7) * 8;
    const fx = Math.cos(st.yaw), fz = Math.sin(st.yaw);
    api.teleport(st.x + fx * (20 - row) - fz * side, st.z + fz * (20 - row) + fx * side, st.yaw);
    api.freeze(opts.wait ?? 3.2);
    // bots: in an online race every player runs the same bots from the same seed on a fixed clock, so they match
    let sd = (opts.seed || Math.floor(Math.random() * 1e9)) % 2147483647 || 7; const rng = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    R = { route, t: -(opts.wait ?? 3.2), cp: 1, done: 0, online: !!opts.online, results: [], lastBeep: 4, rng, acc: 0, bt: 0, rec: [], recT: 0, splits: [], ghost: ghostOf(route.id) };
    ghost.visible = !!R.ghost;
    rivals.forEach((r, k) => {
      r.g.visible = !route.air && !route.custom && (!R.online || opts.bots !== false);
      const sd = [-1, 1, 2][k] * 4.2, rw = k === 2 ? 8 : 0;
      Object.assign(r, { x: st.x + fx * (20 - rw) - fz * sd, z: st.z + fz * (20 - rw) + fx * sd, yaw: st.yaw, v: 0, cp: 1, done: 0, skill: .9 + rng() * .16, accel: 13, stuck: 0 });
    });
    $("gRace").hidden = false; $("gRaceRes").hidden = true;
  }
  function finish(msg) {
    const p = api.state, best = store.get("void.race." + R.route.id);
    const me = R.done, rank = standings().findIndex(s => s.me) + 1;
    if (me && (!best || me < best)) { store.set("void.race." + R.route.id, me); if (R.rec.length >= 8) store.set("void.ghost." + R.route.id, { t: me, s: R.splits, p: R.rec.slice(0, 12000) }); }
    const gdiff = me && R.ghost ? me - R.ghost.t : null;
    const reward = me ? [0, 1500, 800, 400, 200][Math.min(4, rank)] || 100 : 0;
    if (reward) api.addScore(reward, `${R.route.name}: ${["", "1st", "2nd", "3rd"][rank] || rank + "th"}`);
    $("gRaceRes").innerHTML = `<h3>${R.route.name}</h3><p>${msg || (me ? `You finished ${["", "1st", "2nd", "3rd"][rank] || rank + "th"} in ${fmt(me)}` : "Race over")}</p><p class="small">${best ? `Best: ${fmt(Math.min(best, me || 1e9))}` : me ? "New best time!" : ""}${gdiff != null ? ` · vs ghost ${gdiff <= 0 ? "−" : "+"}${Math.abs(gdiff).toFixed(2)} s${gdiff < 0 ? " (new ghost saved)" : ""}` : me && !R.ghost ? " · ghost saved" : ""}</p><ol>${standings().map(s => `<li${s.me ? ' class="me"' : ""}>${s.name}<span>${s.done ? fmt(s.done) : "DNF"}</span></li>`).join("")}</ol><button class="pill solid" id="gRaceOk">OK</button>`;
    $("gRaceRes").hidden = false; $("gRaceOk").onclick = () => { $("gRaceRes").hidden = true; };
    $("gRace").hidden = true; clearGates(); rivals.forEach(r => r.g.visible = false); ghost.visible = false; R = null; void p;
  }
  // everyone's progress: checkpoints passed plus how far along to the next
  const progOf = (x, y, z, cp, route) => { const a = route.pts[cp - 1], b = route.pts[Math.min(route.pts.length - 1, cp)]; const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, d = Math.hypot(b[0] - x, b[2] - z); return cp + Math.max(0, 1 - d / L); };
  function standings() {
    if (!R) return [];
    const p = api.state, out = [{ name: "YOU", me: true, prog: R.done ? 1e6 - R.done : progOf(p.x, p.y, p.z, R.cp, R.route), done: R.done }];
    for (const r of rivals) if (r.g.visible) out.push({ name: r.name, prog: r.done ? 1e6 - r.done : progOf(r.x, 0, r.z, r.cp, R.route), done: r.done });
    if (R.online && net) for (const q of net.players()) if (q.race === R.route.id) out.push({ name: q.name, prog: q.rf ? 1e6 - q.rf : q.rp || 0, done: q.rf || 0 });
    return out.sort((a, b) => b.prog - a.prog);
  }
  function nearStart() { const p = api.state; if (!p || R || B) return null; return starts.find(s => Math.hypot(p.x - s.x, p.z - s.z) < 14) || null; }
  addEventListener("keydown", e => { if (e.code === "Enter" && api.active()) { const s = nearStart(); if (s) start(s.r); } });
  $("gRaceGo").onclick = () => { const s = nearStart(); if (s) start(s.r); };
  function start(route) {
    if (net && net.online() && !route.custom) { const seed = Math.floor(Math.random() * 1e9); net.send({ t: "race", id: route.id, wait: 6, seed }); begin(route, { online: true, wait: 6, slot: 0, seed }); }
    else begin(route);
  }
  // ---- the route builder ----
  let B = null;
  const saveCustom = () => store.set("void.routes", custom.map(({ id, name, air, pts }) => ({ id, name, air, pts, custom: true })));
  function addRoute(r) { r.custom = true; custom.push(r); routes.push(r); starts.push(makeStart(r)); while (custom.length > 12) removeRoute(custom[0].id); saveCustom(); return r; }
  function removeRoute(id) {
    const k = custom.findIndex(r => r.id === id); if (k < 0) return; const r = custom[k]; custom.splice(k, 1); routes.splice(routes.indexOf(r), 1);
    const s = starts.findIndex(st => st.r === r); if (s >= 0) { const st = starts[s]; scene.remove(st.pillar, st.ring, st.s); starts.splice(s, 1); }
    try { localStorage.removeItem("void.ghost." + id); localStorage.removeItem("void.race." + id); } catch { } saveCustom();
  }
  const buildMarks = [];
  function builder(on) {
    if (on && R) return api.say("Finish the race first", 2);
    for (const m of buildMarks) scene.remove(m); buildMarks.length = 0;
    B = on ? { pts: [] } : null; $("gBuild").hidden = !on; if (on) { dropGate(); api.say("Route builder: drive or fly your route, press G (or the button) to drop each gate", 4); }
    renderBuild();
  }
  function dropGate() {
    const p = api.state; if (!B || !p) return;
    const pt = [Math.round(p.x), p.mode === "air" && p.y > 6 ? Math.round(p.y) : 0, Math.round(p.z)], last = B.pts[B.pts.length - 1];
    if (last && Math.hypot(pt[0] - last[0], pt[1] - last[1], pt[2] - last[2]) < 30) return api.say("Too close to the last gate (30 m)", 1.5);
    B.pts.push(pt); sound.pop();
    const m = new THREE.Mesh(new THREE.TorusGeometry(pt[1] ? 10 : 6, .5, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc07dff).multiplyScalar(2), toneMapped: false })); m.position.set(pt[0], pt[1] || 6, pt[2]); m.rotation.y = -p.yaw + Math.PI / 2; scene.add(m); buildMarks.push(m);
    renderBuild();
  }
  function saveBuild() {
    if (!B || B.pts.length < 3) return api.say("A route needs a start and at least 2 more gates", 2);
    const r = addRoute({ id: "c" + Date.now().toString(36), name: "My route " + (custom.length + 1), air: B.pts.some(q => q[1] > 0), pts: B.pts });
    builder(false); api.say(`Saved "${r.name}" and copied its link. The purple marker is its start`, 3.5); renderList(); share(r, true);
  }
  function renderBuild() { if (!B) return; $("gBuild").innerHTML = `<b>🛠 Route builder</b><span>${B.pts.length === 1 ? "Start set" : `${B.pts.length - 1} gate${B.pts.length > 2 ? "s" : ""}`}</span><button class="pill" id="gBDrop">Drop gate (G)</button><button class="pill solid" id="gBSave">Save</button><button class="pill" id="gBCancel">Cancel</button>`; $("gBDrop").onclick = dropGate; $("gBSave").onclick = saveBuild; $("gBCancel").onclick = () => builder(false); }
  addEventListener("keydown", e => { if (e.code === "KeyG" && B && api.active() && !e.repeat) dropGate(); });
  // share a route as a link: everything is in the address, nothing is uploaded
  const b64 = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function share(r, quiet) {
    const url = location.origin + location.pathname + "#r=" + b64({ n: r.name, p: r.pts });
    try { await navigator.clipboard.writeText(url); if (!quiet) api.say("Route link copied: send it to a friend", 2.5); } catch { if (!quiet) prompt("Copy this route link", url); }
  }
  try {
    const h = new URLSearchParams(location.hash.slice(1)).get("r");
    if (h) {
      const o = JSON.parse(decodeURIComponent(escape(atob(h.replace(/-/g, "+").replace(/_/g, "/")))));
      const pts = (o.p || []).slice(0, 40).map(q => [+q[0] || 0, Math.max(0, Math.min(400, +q[1] || 0)), +q[2] || 0]).filter(q => q.every(Number.isFinite) && Math.abs(q[0]) < 4000 && Math.abs(q[2]) < 4000);
      if (pts.length >= 3 && !custom.some(r => JSON.stringify(r.pts) === JSON.stringify(pts))) addRoute({ id: "c" + Date.now().toString(36), name: String(o.n || "Shared route").replace(/[<>&"]/g, "").slice(0, 28), air: pts.some(q => q[1] > 0), pts });
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch { }
  // the Routes list in the Menu: best time, ghost, go there, share, delete
  function renderList() {
    const el = $("gRoutes"); if (!el) return;
    el.innerHTML = routes.map(r => { const b = store.get("void.race." + r.id), gh = !!ghostOf(r.id); return `<div class="route${r.custom ? " mine" : ""}"><div><span>${r.air ? "✈️" : "🏁"} ${r.name}</span><small>${b ? `Best ${fmt(b)}` : "No time yet"}${gh ? " · 👻 ghost" : ""}${r.custom ? " · yours" : ""}</small></div><button class="pill" data-rgo="${r.id}">Go</button>${r.custom ? `<button class="pill" data-share="${r.id}">Share</button><button class="pill" data-del="${r.id}">✕</button>` : ""}</div>`; }).join("") + `<button class="tile wide-tile" id="gBuildBtn"><b>🛠</b>Make your own route</button>`;
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-rgo],[data-share],[data-del],#gBuildBtn"); if (!t || !t.closest("#gRoutes")) return;
    if (t.id === "gBuildBtn") return builder(true);
    const r = routes.find(x => x.id === (t.dataset.rgo || t.dataset.share || t.dataset.del)); if (!r) return;
    if (t.dataset.rgo) { const st = starts.find(s => s.r === r); if (st && !R) { api.teleport(st.x, st.z, st.yaw); api.say(`${r.name}: press Enter (or Start) at the marker`, 3); } }
    if (t.dataset.share) share(r);
    if (t.dataset.del && confirm(`Delete "${r.name}" and its ghost?`)) { removeRoute(r.id); renderList(); }
  });
  if (net) net.on("race", (m, from) => { const r = ROUTES.find(x => x.id === m.id); if (r && !R && !B) { begin(r, { online: true, wait: Math.max(2, Math.min(10, +m.wait || 6)) - .3, seed: Math.abs(m.seed | 0) || 7, slot: 1 + (net.players().findIndex(q => q.id === from) + 1) % 6 }); api.say(`${net.nameOf(from)} started ${r.name}. Get ready!`, 3); } });

  return {
    get race() { return R; }, rivals, renderList, get building() { return !!B; },
    progress() { return R ? { race: R.route.id, rp: R.done ? 0 : progOf(api.state.x, api.state.y, api.state.z, R.cp, R.route), rf: R.done } : null; },
    starts,
    update(dt, time) {
      const p = api.state;
      for (const s of starts) { s.pillar.material.opacity = .1 + .05 * Math.sin(time * 3); s.s.visible = s.ring.visible = s.pillar.visible = !R; }
      const ns = nearStart(); $("gRaceGo").hidden = !ns; if (ns) $("gRaceGo").textContent = `Start ${ns.r.name} (Enter)`;
      if (!R || !p) return;
      R.t += dt;
      // countdown
      if (R.t < 0) { const n = Math.min(3, Math.ceil(-R.t)); $("gCount").textContent = n; $("gCount").hidden = false; if (n < R.lastBeep) { R.lastBeep = n; sound.pop(); } }
      else if (R.t < .8) { $("gCount").textContent = "GO!"; $("gCount").hidden = false; if (R.lastBeep > 0) { R.lastBeep = 0; sound.win(); } }
      else $("gCount").hidden = true;
      const route = R.route, N = route.pts.length;
      // gates: the next one bright, the one after dim, the rest hidden
      gates.forEach((g, k) => { g.visible = k >= R.cp && k <= R.cp + 1; for (const m of g.userData.parts || []) m.material.color.set(k === R.cp ? 0xffd23d : 0x666666).multiplyScalar(k === R.cp ? 2 : 1); });
      if (R.t > 0 && !R.done) {
        const c = route.pts[R.cp], d = route.air ? Math.hypot(p.x - c[0], p.y - c[1], p.z - c[2]) : Math.hypot(p.x - c[0], p.z - c[2]);
        if (d < (route.air ? (route.custom ? 14 : 11) : 13)) { R.splits[R.cp] = +R.t.toFixed(2); const gs = R.ghost && R.ghost.s && R.ghost.s[R.cp]; if (gs && R.cp < N - 1) { const df = R.t - gs; api.say(`Gate ${R.cp}  ${df <= 0 ? "−" : "+"}${Math.abs(df).toFixed(2)} s vs ghost`, 1.6); } R.cp++; sound.pop(); if (R.cp >= N) { R.done = R.t; sound.win(); api.say(`Finished in ${fmt(R.t)}!`, 3); R.endAt = R.t + (R.online ? 15 : 25); } }
      }
      if (R.t > 0 && !R.done && (R.recT += dt) >= .1) { R.recT -= .1; R.rec.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.yaw * 100) / 100); }
      if (R.ghost) {
        const gp = R.ghost.p, n = gp.length / 4, f = Math.max(0, R.t) * 10, i = Math.min(n - 2, Math.floor(f)), k = Math.min(1, f - i), a = i * 4, b = a + 4;
        if (f >= n - 1) ghost.visible = false;
        else { let dy = gp[b + 3] - gp[a + 3]; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI; ghost.position.set(gp[a] + (gp[b] - gp[a]) * k, gp[a + 1] + (gp[b + 1] - gp[a + 1]) * k, gp[a + 2] + (gp[b + 2] - gp[a + 2]) * k); ghost.rotation.y = -(gp[a + 3] + dy * k); }
      }
      // rivals: stepped on a fixed 1/60 s clock from the green light (the same on every player's screen when online)
      if (!route.air && !route.custom && R.t > 0) {
        R.acc += dt;
        while (R.acc >= 1 / 60 && R.bt < R.t) {
          R.acc -= 1 / 60; R.bt += 1 / 60;
          for (const r of rivals) {
            if (!r.g.visible || r.done) continue;
            const c = route.pts[Math.min(N - 1, r.cp)];
            let band = 1;
            if (!R.online) { const mine = progOf(p.x, 0, p.z, R.cp, route), theirs = progOf(r.x, 0, r.z, r.cp, route); band = mine - theirs > .8 ? 1.12 : theirs - mine > .8 ? .9 : 1; }
            // brake for the corner at the next gate, and get back on the road if it ever ends up stuck
            const prev = route.pts[Math.max(0, r.cp - 1)], nxt = route.pts[Math.min(N - 1, r.cp + 1)];
            const a1 = Math.atan2(c[2] - prev[2], c[0] - prev[0]), a2 = Math.atan2(nxt[2] - c[2], nxt[0] - c[0]);
            let turnA = Math.abs(a2 - a1); if (turnA > Math.PI) turnA = 2 * Math.PI - turnA;
            const dc = Math.hypot(c[0] - r.x, c[2] - r.z), top = 62 * r.skill * band;
            const want = turnA > .5 && r.cp < N - 1 ? Math.min(top, 13 + Math.max(0, dc - 8) * .9) : top;
            D.step(r, c[0], c[2], want, 1 / 60, R.rng);
            if (r.stuck > 1.2) {
              const dx = c[0] - prev[0], dz = c[2] - prev[2], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((r.x - prev[0]) * dx + (r.z - prev[2]) * dz) / L2));
              r.x = prev[0] + dx * t; r.z = prev[2] + dz * t; r.yaw = Math.atan2(c[2] - r.z, c[0] - r.x); r.v = 6; r.stuck = 0;
            }
            if (Math.hypot(r.x - c[0], r.z - c[2]) < 12) { r.cp++; if (r.cp >= N) r.done = R.bt; }
          }
        }
      }
      for (const r of rivals) {
        if (!r.g.visible) continue;
        r.g.position.set(r.x, 0, r.z); r.g.rotation.y = -r.yaw;
        // they can't drive through you (you get pushed; they keep their line so every screen agrees)
        const dx = p.x - r.x, dz = p.z - r.z, dd = Math.hypot(dx, dz);
        if (dd < 3.4 && dd > .01 && p.y < 2) { p.x += dx / dd * (3.4 - dd); p.z += dz / dd * (3.4 - dd); if (!R.online) r.v *= .9; }
      }
      const st = standings(), pos = st.findIndex(s => s.me) + 1;
      // (the banner is built once per race and only its text changes, so the Quit button stays clickable)
      if (!$("gRaceT")) { $("gRace").innerHTML = `<b id="gRaceN"></b><span id="gRaceT"></span><span id="gRaceG"></span><span id="gRaceP"></span><button class="pill" id="gRaceQuit2">Quit</button>`; $("gRaceQuit2").onclick = () => R && finish("You left the race"); }
      $("gRaceN").textContent = route.name; $("gRaceT").textContent = R.t < 0 ? "Get ready" : fmt(Math.max(0, R.done || R.t)); $("gRaceG").textContent = `Gate ${Math.min(R.cp, N - 1)}/${N - 1}`; $("gRaceP").textContent = `${pos}/${st.length}`;
      const next = route.pts[Math.min(N - 1, R.cp)]; R.next = next;
      if (R.done && (R.t > R.endAt || (!R.online && rivals.every(r => r.done || !r.g.visible)))) { finish(); return; }
      if (R && R.t > 600) finish("Out of time");
    },
    cancel() { if (R) finish("Race cancelled"); },
  };
}
