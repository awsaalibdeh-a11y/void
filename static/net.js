// Online play with real people, no server of our own: WebRTC peer-to-peer through the free PeerJS broker.
// A room is a well-known peer id; the first player to claim it is the host and relays everyone's car to everyone.
// If the host leaves, the others race to claim it again. Voice chat is a mesh of audio calls, off until you
// switch your mic on, and you hear people louder the closer their car is. Chat is quick emotes only (strangers
// can join the public city), and names are short and filtered.
const PREFIX = "voidcity-awsaa-v1-";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] };
const BAD = /(fuck|shit|bitch|nigg|cunt|dick|pussy|sex|porn|kill|nazi|hitler|rape|fag)/i;
export const cleanName = s => { s = String(s || "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 14); return !s || BAD.test(s) ? "Driver" : s; };
// what strangers may send: only these events, only sane numbers, and not too often
const EVENTS = new Set(["race", "emote"]);
const num = (v, lim) => Number.isFinite(v) && Math.abs(v) <= lim;
const okState = st => st && Array.isArray(st.p) && st.p.length === 6 && num(st.p[0], 8000) && num(st.p[1], 4000) && num(st.p[2], 8000) && st.p.slice(3).every(v => num(v, 50));
const flood = c => { const now = performance.now(); if (now - (c._t || 0) > 1000) { c._t = now; c._n = 0; } return ++c._n > 60; };
export const EMOTES = ["👋 Hi!", "🏁 Race?", "😂", "🔥 Nice!", "GG", "🚓 Cops!", "Follow me", "Wait up"];

export function createNet() {
  let Peer = null, peer = null, host = false, me = null, room = null, name = "Driver", hostConn = null, sendT = 0, lastState = null, closing = false;
  const conns = new Map();                 // host: everyone's connection
  const players = new Map();               // id -> { id, name, s: [samples], model, paint, race, rp, rf, vc, emote, emoteT }
  const handlers = {};
  const emit = (k, ...a) => (handlers[k] || []).forEach(f => f(...a));
  const status = t => emit("status", t);
  let stream = null, micOn = false, calls = new Map(), audios = new Map();

  async function lib() { if (!Peer) ({ Peer } = await import("https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm")); return Peer; }
  async function join(r, nm) {
    await leave(); closing = false; room = String(r).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "public-1"; name = cleanName(nm);
    status("Connecting…"); await lib(); claim();
  }
  function claim() {
    if (closing) return;
    const p = new Peer(PREFIX + room, { config: ICE, debug: 0 }); peer = p;
    p.on("open", id => { host = true; me = id; status(`Online · room ${room} · you are hosting`); emit("change"); });
    p.on("connection", c => {
      c.on("data", d => onData(c, d));
      c.on("open", () => { if (conns.size >= 11) { c.send({ t: "full" }); setTimeout(() => c.close(), 300); return; } conns.set(c.peer, c); emit("change"); });
      c.on("close", () => { conns.delete(c.peer); players.delete(c.peer); dropAudio(c.peer); emit("change"); broadcast({ t: "gone", id: c.peer }); });
    });
    p.on("call", answer);
    p.on("error", e => {
      if (e.type === "unavailable-id") { p.destroy(); client(); }
      else if (e.type === "peer-unavailable") { status("Room not found, retrying…"); setTimeout(() => rejoin(), 800 + Math.random() * 1500); }
      else status("Network: " + e.type);
    });
  }
  function client() {
    if (closing) return;
    const p = new Peer({ config: ICE, debug: 0 }); peer = p; host = false;
    p.on("open", id => {
      me = id; const c = p.connect(PREFIX + room, { serialization: "json", reliable: false }); hostConn = c;
      c.on("open", () => { status(`Online · room ${room}`); c.send({ t: "hello", name }); emit("change"); });
      c.on("data", d => onData(c, d));
      c.on("close", () => { if (!closing) { status("Host left, reconnecting…"); players.clear(); emit("change"); setTimeout(rejoin, Math.random() * 1500); } });
    });
    p.on("call", answer);
    p.on("error", e => { if (e.type === "peer-unavailable") setTimeout(rejoin, 400 + Math.random() * 1200); else status("Network: " + e.type); });
  }
  function rejoin() { if (closing) return; try { peer && peer.destroy(); } catch { } hostConn = null; conns.clear(); claim(); }
  async function leave() {
    closing = true; try { peer && peer.destroy(); } catch { } peer = null; hostConn = null; host = false; conns.clear(); players.clear();
    for (const id of [...audios.keys()]) dropAudio(id); setMic(false); room = null; emit("change"); status("Offline");
  }
  function broadcast(m, except) { for (const [id, c] of conns) if (id !== except && c.open) try { c.send(m); } catch { } }
  function upsert(id, st) {
    let p = players.get(id), fresh = !p; if (!p) { p = { id, name: "Driver", s: [] }; players.set(id, p); }
    if (st.n && cleanName(st.n) !== p.name) { p.name = cleanName(st.n); fresh = true; }
    Object.assign(p, { model: Number.isInteger(st.m) && st.m >= 0 && st.m < 20 ? st.m : 0, paint: /^#[0-9a-f]{6}$/i.test(st.c) ? st.c : "#888888", race: typeof st.r === "string" ? st.r.slice(0, 20) : 0, rp: num(st.rp, 1e7) ? st.rp : 0, rf: num(st.rf, 1e7) ? st.rf : 0, vc: !!st.vc, wanted: num(st.w, 5) ? st.w | 0 : 0 });
    p.s.push({ t: performance.now(), x: st.p[0], y: st.p[1], z: st.p[2], yaw: st.p[3], pitch: st.p[4], roll: st.p[5], v: num(st.v, 2000) ? st.v : 0, air: !!st.a });
    if (p.s.length > 12) p.s.shift();
    if (fresh) emit("change");
  }
  function onData(c, d) {
    if (!d || typeof d !== "object" || flood(c)) return;
    if (d.t === "ev" && !EVENTS.has(d.k)) return;
    if (host) {
      if (d.t === "hello") { const p = players.get(c.peer) || { id: c.peer, s: [] }; p.name = cleanName(d.name); players.set(c.peer, p); emit("change"); return; }
      if (d.t === "s") { if (okState(d)) upsert(c.peer, d); return; }
      if (d.t === "ev") { broadcast({ ...d, from: c.peer }, c.peer); emit(d.k, d, c.peer); return; }
    } else {
      if (d.t === "w") { if (Array.isArray(d.all)) for (const st of d.all.slice(0, 16)) if (st && typeof st.id === "string" && st.id !== me && okState(st)) upsert(st.id, st); return; }
      if (d.t === "gone") { players.delete(d.id); dropAudio(d.id); emit("change"); return; }
      if (d.t === "full") { status("Room full, trying the next one"); room = room.replace(/(\d+)$/, n => +n + 1); rejoin(); return; }
      if (d.t === "ev") { emit(d.k, d, d.from); return; }
    }
  }
  // voice: everyone with their mic on calls everyone; people without a mic still hear
  function answer(call) { call.answer(stream || undefined); hook(call); }
  function hook(call) {
    calls.set(call.peer, call);
    call.on("stream", s => { let a = audios.get(call.peer); if (!a) { a = new Audio(); a.autoplay = true; audios.set(call.peer, a); } a.srcObject = s; a.play().catch(() => { }); });
    call.on("close", () => { calls.delete(call.peer); });
  }
  function dropAudio(id) { const a = audios.get(id); if (a) { a.srcObject = null; audios.delete(id); } const c = calls.get(id); if (c) { try { c.close(); } catch { } calls.delete(id); } }
  async function setMic(on) {
    if (on && !stream) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch { status("Microphone blocked"); emit("mic", false); return false; } }
    micOn = on;
    if (stream) for (const t of stream.getAudioTracks()) t.enabled = on;
    if (on && peer) for (const p of players.values()) if (!calls.has(p.id)) { try { hook(peer.call(p.id, stream)); } catch { } }
    if (!on && !stream) { }
    emit("mic", on); return on;
  }

  // players who went quiet (closed the tab, lost signal) are dropped after 15 s instead of standing still forever
  setInterval(() => { const now = performance.now(); let gone = false; for (const p of [...players.values()]) { const last = p.s.length ? p.s[p.s.length - 1].t : p.seen || (p.seen = now); if (now - last > 15000) { players.delete(p.id); dropAudio(p.id); gone = true; } } if (gone) emit("change"); }, 3000);
  return {
    join, leave, setMic, EMOTES,
    on(k, f) { (handlers[k] = handlers[k] || []).push(f); },
    online: () => !!(peer && me && (host || (hostConn && hostConn.open))),
    get host() { return host; }, get room() { return room; }, get me() { return me; }, get mic() { return micOn; }, get name() { return name; },
    players: () => [...players.values()],
    nameOf: id => (players.get(id) || {}).name || "Someone",
    send(m) {                                                    // a one-off event for everyone (race start, emote)
      const ev = { ...m, t: "ev", k: m.t };
      if (host) broadcast({ ...ev, from: me }); else if (hostConn && hostConn.open) hostConn.send(ev);
    },
    // ~12 times a second: my car to the host; the host sends everyone to everyone
    tick(dt, mine) {
      if (!peer || !me) return;
      lastState = mine; sendT += dt; if (sendT < 1 / 12) return; sendT = 0;
      const st = mine && { t: "s", n: name, ...mine, vc: micOn };
      if (host) { const all = [...(st ? [{ id: me, ...st }] : []), ...[...players.values()].filter(p => p.s.length).map(p => { const q = p.s[p.s.length - 1]; return { id: p.id, n: p.name, p: [q.x, q.y, q.z, q.yaw, q.pitch, q.roll], m: p.model, c: p.paint, r: p.race, rp: p.rp, rf: p.rf, vc: p.vc, v: q.v, a: q.air, w: p.wanted }; })]; broadcast({ t: "w", all }); }
      else if (st && hostConn && hostConn.open) try { hostConn.send(st); } catch { }
    },
    // where a player's car should be drawn now: 120 ms behind, between two samples
    sample(p) {
      const t = performance.now() - 120, s = p.s; if (!s.length) return null;
      let a = s[0], b = s[s.length - 1];
      for (let k = 0; k < s.length - 1; k++) if (s[k].t <= t && s[k + 1].t >= t) { a = s[k]; b = s[k + 1]; break; }
      const u = b.t > a.t ? Math.max(0, Math.min(1.5, (t - a.t) / (b.t - a.t))) : 1, L = (x, y) => x + (y - x) * u;
      const ay = (x, y) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * u; };
      return { x: L(a.x, b.x), y: L(a.y, b.y), z: L(a.z, b.z), yaw: ay(a.yaw, b.yaw), pitch: L(a.pitch, b.pitch), roll: L(a.roll, b.roll), v: b.v, air: b.air, stale: performance.now() - s[s.length - 1].t > 4000 };
    },
    setVolume(id, v) { const a = audios.get(id); if (a) a.volume = Math.max(0, Math.min(1, v)); },
  };
}
