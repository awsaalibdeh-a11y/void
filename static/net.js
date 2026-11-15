// Online play with real people, no server of our own: WebRTC peer-to-peer through the free PeerJS broker.
// A room is a well-known peer id; the first player to claim it is the host and relays everyone's car to everyone.
// If the host leaves, the others race to claim it again. Voice chat is a mesh of audio calls, off until you
// switch your mic on, and you hear each voice from where that player's car is: louder when close, left or right, ahead or behind. Chat is quick emotes only (strangers
// can join the public city), and names are short and filtered. Anyone can be muted (voice and emotes), push-to-talk is
// a setting, a speaker icon shows who is talking, and everyone's ping to the host is shown.
const PREFIX = "voidcity-awsaa-v1-";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] };
// a TURN relay for players behind strict networks (some phone carriers, school and office wifi), where direct links fail.
// The free no-signup relays are gone (openrelay.metered.ca no longer resolves), so this needs a free Metered account:
// its credentials URL (https://<app>.metered.live/api/v1/turn/credentials?apiKey=...) goes here. Empty: STUN only.
const TURN_URL = "";
let turnTried = false;
async function addTurn() {
  if (turnTried || !TURN_URL) return; turnTried = true;
  try { const r = await fetch(TURN_URL), list = await r.json(); if (Array.isArray(list)) ICE.iceServers.push(...list.filter(s => s && s.urls)); } catch { }
}
const BAD = /(fuck|shit|bitch|nigg|cunt|dick|pussy|sex|porn|kill|nazi|hitler|rape|fag)/i;
export const cleanName = s => { s = String(s || "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 14); return !s || BAD.test(s) ? "Driver" : s; };
// what strangers may send: only these events, only sane numbers, and not too often
const EVENTS = new Set(["race", "emote"]);
const num = (v, lim) => Number.isFinite(v) && Math.abs(v) <= lim;
const okState = st => st && Array.isArray(st.p) && st.p.length === 6 && num(st.p[0], 8000) && num(st.p[1], 4000) && num(st.p[2], 8000) && st.p.slice(3).every(v => num(v, 50))
  && (st.u === undefined || (Array.isArray(st.u) && st.u.length === 3 && st.u.every(v => num(v, 500))));
const flood = c => { const now = performance.now(); if (now - (c._t || 0) > 1000) { c._t = now; c._n = 0; } return ++c._n > 60; };
export const EMOTES = ["👋 Hi!", "🏁 Race?", "😂", "🔥 Nice!", "GG", "🚓 Cops!", "Follow me", "Wait up"];

export function createNet() {
  let Peer = null, peer = null, host = false, me = null, room = null, name = "Driver", hostConn = null, sendT = 0, lastState = null, closing = false;
  const conns = new Map();                 // host: everyone's connection
  const players = new Map();               // id -> { id, name, s: [samples], model, paint, race, rp, rf, vc, emote, emoteT }
  const handlers = {};
  const emit = (k, ...a) => (handlers[k] || []).forEach(f => f(...a));
  const status = t => emit("status", t);
  let stream = null, micOn = false, calls = new Map();
  // each voice: a media element (Chrome only feeds a remote WebRTC stream into Web Audio while an element plays it too, and it is
  // the fallback when the game's audio isn't running) plus, once there is an audio context, a 3D panner at that player's car
  const voices = new Map();                // id -> { el, src, pan, gain, an, buf, level, loud, s }
  let actx = null, mic = null;             // mic: an analyser on my own microphone, for the level meter
  let ptt = false, talking = false;        // push-to-talk: the mic only sends while the key is held
  const muted = new Set(), mutedNames = new Set();   // ids, and names so a muted player stays muted after reconnecting
  let rtt = null, pingT = 0;               // my round trip to the host (ms)
  const isMuted = id => muted.has(id) || mutedNames.has((players.get(id) || {}).name);
  const applyTracks = () => { if (stream) for (const t of stream.getAudioTracks()) t.enabled = micOn && (!ptt || talking); };
  const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };

  async function lib() { if (!Peer) ({ Peer } = await import("https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm")); return Peer; }
  async function join(r, nm) {
    await leave(); closing = false; room = String(r).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24) || "public-1"; name = cleanName(nm);
    status("Connecting…"); await lib(); await addTurn(); claim();
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
    for (const id of [...voices.keys()]) dropAudio(id); setMic(false); room = null; emit("change"); status("Offline");
  }
  function broadcast(m, except) { for (const [id, c] of conns) if (id !== except && c.open) try { c.send(m); } catch { } }
  function upsert(id, st) {
    let p = players.get(id), fresh = !p; if (!p) { p = { id, name: "Driver", s: [] }; players.set(id, p); }
    if (st.n && cleanName(st.n) !== p.name) { p.name = cleanName(st.n); fresh = true; }
    Object.assign(p, { model: Number.isInteger(st.m) && st.m >= 0 && st.m < 20 ? st.m : 0, paint: /^#[0-9a-f]{6}$/i.test(st.c) ? st.c : "#888888", race: typeof st.r === "string" ? st.r.slice(0, 20) : 0, rp: num(st.rp, 1e7) ? st.rp : 0, rf: num(st.rf, 1e7) ? st.rf : 0, vc: !!st.vc, wanted: num(st.w, 5) ? st.w | 0 : 0, ping: num(st.q, 10000) ? st.q | 0 : null });
    const u = st.u || [0, 0, 0];
    p.s.push({ t: performance.now(), x: st.p[0], y: st.p[1], z: st.p[2], yaw: st.p[3], pitch: st.p[4], roll: st.p[5], vx: u[0], vy: u[1], vz: u[2], v: num(st.v, 2000) ? st.v : 0, air: !!st.a });
    if (p.s.length > 12) p.s.shift();
    if (fresh) { emit("change"); ring(id); }              // someone new: if my mic is on, call them so they hear me
  }
  function onData(c, d) {
    if (!d || typeof d !== "object" || flood(c)) return;
    if (d.t === "ev" && !EVENTS.has(d.k)) return;
    if (d.t === "pi") { if (host && num(d.ts, 1e12)) try { c.send({ t: "po", ts: d.ts }); } catch { } return; }
    if (d.t === "po") { const r = performance.now() - d.ts; if (num(d.ts, 1e12) && r >= 0 && r < 10000) rtt = rtt == null ? r : rtt * .7 + r * .3; return; }
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
  // one call per pair carries both voices. If both ring at once, the call started by the smaller id wins (both sides agree).
  function answer(call) {
    const old = calls.get(call.peer);
    if (old && old._out && me < call.peer) { try { call.close(); } catch { } return; }
    if (old) try { old.close(); } catch { }
    call.answer(stream || undefined); hook(call, !!stream, false);
  }
  // call someone with my mic, unless a call already carries it (a call I answered without a mic is replaced)
  function ring(id) {
    if (!peer || !stream || !micOn || id === me) return;
    const c = calls.get(id); if (c && c._sent) return;
    if (c) { try { c.close(); } catch { } calls.delete(id); }
    try { hook(peer.call(id, stream), true, true); } catch { }
  }
  function hook(call, sent, out) {
    call._sent = sent; call._out = out; calls.set(call.peer, call);
    call.on("stream", s => voiceIn(call.peer, s));
    call.on("close", () => { if (calls.get(call.peer) === call) calls.delete(call.peer); });
  }
  function voiceIn(id, s) {
    let v = voices.get(id); if (!v) { v = { el: new Audio() }; v.el.autoplay = true; voices.set(id, v); }
    if (v.s !== s) { unwire(v); v.s = s; v.el.srcObject = s; v.el.play().catch(() => { }); }
    wire(v);
  }
  function wire(v) {
    if (v.pan || !actx || !v.s) return;
    try {
      v.src = actx.createMediaStreamSource(v.s); v.pan = actx.createPanner(); v.gain = actx.createGain(); v.an = actx.createAnalyser(); v.an.fftSize = 256; v.buf = new Float32Array(256);
      Object.assign(v.pan, { panningModel: "HRTF", distanceModel: "linear", refDistance: 6, maxDistance: 260, rolloffFactor: 1 });
      v.src.connect(v.an); v.src.connect(v.pan).connect(v.gain).connect(actx.destination);
    } catch { unwire(v); }
  }
  function unwire(v) { try { v.src && v.src.disconnect(); v.pan && v.pan.disconnect(); v.gain && v.gain.disconnect(); } catch { } v.src = v.pan = v.gain = v.an = null; }
  function micMeter() { if (mic || !actx || !stream) return; try { const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser(); an.fftSize = 256; src.connect(an); mic = { src, an, buf: new Float32Array(256), level: 0 }; } catch { } }
  function dropAudio(id) { const v = voices.get(id); if (v) { unwire(v); v.el.srcObject = null; voices.delete(id); } const c = calls.get(id); if (c) { try { c.close(); } catch { } calls.delete(id); } }
  const now = () => performance.now();
  const at = (node, x, y, z, set) => { if (node.positionX) { const t = actx.currentTime; node.positionX.setTargetAtTime(x, t, .03); node.positionY.setTargetAtTime(y, t, .03); node.positionZ.setTargetAtTime(z, t, .03); } else set.call(node, x, y, z); };
  async function setMic(on) {
    if (on && !stream) { try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch { status("Microphone blocked"); emit("mic", false); return false; } }
    micOn = on; applyTracks(); micMeter();
    if (on) for (const p of players.values()) ring(p.id);
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
      lastState = mine;
      if (!host && hostConn && hostConn.open && (pingT += dt) > 2) { pingT = 0; try { hostConn.send({ t: "pi", ts: performance.now() }); } catch { } }
      sendT += dt; if (sendT < 1 / 12) return; sendT = 0;
      const st = mine && { t: "s", n: name, ...mine, vc: micOn, q: rtt == null ? undefined : Math.round(rtt) };
      if (host) { const all = [...(st ? [{ id: me, ...st, q: 0 }] : []), ...[...players.values()].filter(p => p.s.length).map(p => { const q = p.s[p.s.length - 1]; return { id: p.id, n: p.name, p: [q.x, q.y, q.z, q.yaw, q.pitch, q.roll], m: p.model, c: p.paint, r: p.race, rp: p.rp, rf: p.rf, vc: p.vc, v: q.v, a: q.air, w: p.wanted, u: [q.vx, q.vy, q.vz], q: p.ping ?? undefined }; })]; broadcast({ t: "w", all }); }
      else if (st && hostConn && hostConn.open) try { hostConn.send(st); } catch { }
    },
    // where a player's car should be drawn now: 120 ms behind, between two samples; when packets are late it carries on
    // along the last known velocity for up to 0.35 s (then holds) instead of freezing and jumping
    sample(p) {
      const now = performance.now(), t = now - 120, s = p.s; if (!s.length) return null;
      const last = s[s.length - 1];
      if (t >= last.t) { const k = Math.min(t - last.t, 350) / 1000; return { x: last.x + last.vx * k, y: last.y + last.vy * k, z: last.z + last.vz * k, yaw: last.yaw, pitch: last.pitch, roll: last.roll, v: last.v, air: last.air, stale: now - last.t > 4000 }; }
      let a = s[0], b = last;
      for (let k = 0; k < s.length - 1; k++) if (s[k].t <= t && s[k + 1].t >= t) { a = s[k]; b = s[k + 1]; break; }
      const u = b.t > a.t ? Math.max(0, Math.min(1.5, (t - a.t) / (b.t - a.t))) : 1, L = (x, y) => x + (y - x) * u;
      const ay = (x, y) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * u; };
      return { x: L(a.x, b.x), y: L(a.y, b.y), z: L(a.z, b.z), yaw: ay(a.yaw, b.yaw), pitch: L(a.pitch, b.pitch), roll: L(a.roll, b.roll), v: b.v, air: b.air, stale: performance.now() - s[s.length - 1].t > 4000 };
    },
    // once a frame: the camera is the listener (every voice then sits where that player's car is drawn)
    listen(ctx, cam) {
      if (ctx && ctx !== actx) { for (const v of voices.values()) unwire(v); actx = ctx; }
      if (!actx || actx.state !== "running" || !voices.size) return;
      const L = actx.listener, e = cam.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
      at(L, cam.position.x, cam.position.y, cam.position.z, L.setPosition);
      if (L.forwardX) { const t = actx.currentTime; L.forwardX.setTargetAtTime(fx, t, .03); L.forwardY.setTargetAtTime(fy, t, .03); L.forwardZ.setTargetAtTime(fz, t, .03); L.upX.setTargetAtTime(ux, t, .03); L.upY.setTargetAtTime(uy, t, .03); L.upZ.setTargetAtTime(uz, t, .03); }
      else L.setOrientation(fx, fy, fz, ux, uy, uz);
    },
    // a player's voice comes from their car; without running game audio it falls back to plain volume by distance
    placeVoice(id, x, y, z, d) {
      const v = voices.get(id); if (!v) return;
      const live = actx && actx.state === "running";
      if (live) { wire(v); }
      const off = isMuted(id);
      if (live && v.pan) { at(v.pan, x, y + 1, z, v.pan.setPosition); v.el.volume = 0; v.gain.gain.value = off ? 0 : 1; }
      else v.el.volume = off ? 0 : Math.max(0, Math.min(1, 1 - d / 260));
      // the speaking icon: a smoothed level, held a moment so it doesn't flicker between words
      if (v.an) { const r = rms(v.an, v.buf); v.level = Math.max(r, (v.level || 0) * .9); v.loud = r > .02 ? now() : v.loud || 0; }
    },
    speaking: id => { const v = voices.get(id); return !!(v && v.loud && now() - v.loud < 350 && !isMuted(id)); },
    level: id => { const v = voices.get(id); return v ? Math.min(1, (v.level || 0) * 6) : 0; },
    myLevel() { if (!mic) { micMeter(); return 0; } mic.level = Math.max(rms(mic.an, mic.buf), mic.level * .85); return micOn && (!ptt || talking) ? Math.min(1, mic.level * 6) : 0; },
    setPTT(on) { ptt = !!on; applyTracks(); }, talk(down) { talking = !!down; applyTracks(); },
    get ptt() { return ptt; }, get talking() { return talking; }, get ping() { return host ? 0 : rtt == null ? null : Math.round(rtt); },
    mute(id, on) { const n = (players.get(id) || {}).name; if (on) { muted.add(id); if (n) mutedNames.add(n); } else { muted.delete(id); if (n) mutedNames.delete(n); } emit("change"); },
    muted: isMuted,
    voiceIn, voice: id => voices.get(id),
  };
}
