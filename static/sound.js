// VOID's sound, all synthesized live with Web Audio (no samples, no licensed music).
// The music is an original 130 bpm Brazilian-phonk style track: a tamborzão-style kick pattern,
// a crunchy distorted cowbell riff, a gliding 808, vocal-style "ey"/"ah" chops, sidechain pump.
// In Watch mode the song's clock IS the animation's clock, so picture and beat never drift.

export const BPM = 130, STEP = 60 / BPM / 4, BAR = STEP * 16;
const F0 = 739.99;                                                     // F#5, the riff's home note
const ROOTS = [92.5, 92.5, 73.42, 69.3];                               // F#2 F#2 D2 C#2, one per bar
const PAD = [[185, 220, 277.2], [185, 220, 277.2], [146.8, 185, 220], [138.6, 174.6, 207.7]];
const KICK = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
const KICK_HALF = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const RIFF_A = [[0, 0], [2, 0], [3, 3], [6, 0], [8, 7], [10, 5], [11, 3], [14, 0]];
const RIFF_B = [[0, 0], [2, 0], [3, 3], [6, 0], [8, 10], [10, 8], [11, 7], [13, 5], [14, 3]];
const RIFF_C = [[0, 12], [1, 12], [3, 10], [4, 7], [6, 8], [8, 7], [9, 5], [11, 3], [12, 5], [14, 0]];

// the Watch arrangement, bar by bar (24 bars, 44 s)
export const SONG_BARS = 24;
function songMix(bar) {
  const m = { pad: .45, hat: 0, kick: 0, clap: 0, bass: 0, bell: 0, chop: 0, rise: 0, half: false, riff: 0, open: 900 };
  if (bar < 2) Object.assign(m, { pad: .55, chop: .6, open: 500 + bar * 400 });
  else if (bar < 4.5) Object.assign(m, { hat: .8, bass: .6, kick: .8, half: true, chop: .5, open: 1500 });
  else if (bar < 6) Object.assign(m, { hat: 1, kick: 1, clap: .9, bass: 1, chop: .5, open: 2400 });
  else if (bar < 8) Object.assign(m, { pad: .7, hat: .35, rise: (bar - 6) / 2, open: 1200 + (bar - 6) * 2000 });
  else if (bar < 14) Object.assign(m, { pad: .5, hat: 1, kick: 1, clap: 1, bass: 1, bell: 1, chop: .7, riff: Math.floor(bar) % 2, open: 4200 });
  else if (bar < 17.5) Object.assign(m, { pad: .55, hat: .7, kick: .9, clap: .8, bass: .9, bell: .9, chop: .4, riff: 2, half: true, open: 3000 });
  else if (bar < 22) Object.assign(m, { pad: .7, hat: .3, kick: .6, bass: .6, bell: .35, riff: Math.floor(bar) % 2, half: true, open: 800 });
  else Object.assign(m, { pad: .8 * Math.max(0, 1 - (bar - 22) / 2), open: 1000 });
  return m;
}
// the Play (game) arrangement, by what the player is doing
function gameMix(state) {
  const base = { pad: .45, hat: 0, kick: 0, clap: 0, bass: 0, bell: 0, chop: 0, rise: 0, half: false, riff: 0, open: 1200 };
  if (state === "drive") return { ...base, hat: .9, kick: 1, clap: .8, bass: .9, chop: .3, open: 2400 };
  if (state === "air") return { ...base, hat: 1, kick: 1, clap: 1, bass: 1, bell: 1, chop: .5, open: 4200 };
  if (state === "land") return { ...base, pad: .6, hat: .5, kick: .7, bass: .7, bell: .5, half: true, riff: 2, open: 1800 };
  if (state === "end") return { ...base, pad: .6, open: 700 };
  return { ...base, pad: .5, hat: .4, chop: .3, open: 900 };
}

export class Sound {
  constructor() { this.on = false; this.ctx = null; this.songStart = null; this.liveStep = 0; this.gameState = "idle"; this.mode = "idle"; }

  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = .003;
    this.master.connect(comp).connect(C.destination);

    // music: everything goes through a pump (sidechain duck on kicks) and a soft clipper
    this.musicIn = C.createGain(); this.musicIn.gain.value = .5;
    this.pump = C.createGain();
    const clip = C.createWaveShaper(); clip.curve = this.curve(1.6); clip.oversample = "2x";
    this.musicIn.connect(clip).connect(this.master);
    this.pump.connect(this.musicIn);
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const rev = C.createConvolver(), ir = C.createBuffer(2, C.sampleRate * 1.8, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3); }
    rev.buffer = ir; this.revBus = C.createGain(); this.revBus.gain.value = .28; this.revBus.connect(rev).connect(this.musicIn);

    this.bus = {};
    for (const k of ["pad", "hat", "kick", "clap", "bass", "bell", "chop"]) {
      const g = C.createGain(); g.gain.value = 0; this.bus[k] = g;
      g.connect(k === "kick" || k === "clap" || k === "hat" ? this.musicIn : this.pump);
    }
    // the cowbell gets crushed through heavy drive, then a touch of room
    this.bellIn = C.createGain(); const bd = C.createWaveShaper(); bd.curve = this.curve(9); bd.oversample = "4x";
    const bellTone = C.createBiquadFilter(); bellTone.type = "peaking"; bellTone.frequency.value = 2200; bellTone.gain.value = 5;
    this.bellIn.connect(bd).connect(bellTone).connect(this.bus.bell); bellTone.connect(this.revBus);
    this.bus.chop.connect(this.revBus);

    // pad: detuned saws through a lowpass that opens with the section
    this.padF = C.createBiquadFilter(); this.padF.type = "lowpass"; this.padF.frequency.value = 900; this.padF.Q.value = .8;
    this.padF.connect(this.bus.pad);
    this.padOsc = [];
    for (let i = 0; i < 6; i++) { const o = C.createOscillator(); o.type = "sawtooth"; o.detune.value = i % 2 ? 11 : -11; const g = C.createGain(); g.gain.value = .04; o.connect(g).connect(this.padF); o.start(); this.padOsc.push(o); }
    // riser
    this.riseF = C.createBiquadFilter(); this.riseF.type = "bandpass"; this.riseF.Q.value = 4; this.riseG = C.createGain(); this.riseG.gain.value = 0;
    this.loopNoise().connect(this.riseF).connect(this.riseG).connect(this.musicIn);

    // the car: engine (saw + square through a clipper), thrusters, wind
    this.sfx = C.createGain(); this.sfx.gain.value = .45; this.sfxLP = C.createBiquadFilter(); this.sfxLP.type = "lowpass"; this.sfxLP.frequency.value = 16000;
    this.sfx.connect(this.sfxLP).connect(this.master);
    this.eng1 = C.createOscillator(); this.eng1.type = "sawtooth"; this.eng2 = C.createOscillator(); this.eng2.type = "square";
    const es = C.createWaveShaper(); es.curve = this.curve(3.2);
    this.engF = C.createBiquadFilter(); this.engF.type = "lowpass"; this.engF.frequency.value = 600; this.engF.Q.value = 2;
    this.engG = C.createGain(); this.engG.gain.value = 0; const e2 = C.createGain(); e2.gain.value = .5;
    this.eng1.connect(es); this.eng2.connect(e2).connect(es); es.connect(this.engF).connect(this.engG).connect(this.sfx);
    this.eng1.start(); this.eng2.start();
    this.thrF = C.createBiquadFilter(); this.thrF.type = "lowpass"; this.thrF.frequency.value = 700; this.thrG = C.createGain(); this.thrG.gain.value = 0;
    this.loopNoise().connect(this.thrF).connect(this.thrG).connect(this.sfx);
    this.rumble = C.createOscillator(); this.rumble.frequency.value = 42; this.rumbleG = C.createGain(); this.rumbleG.gain.value = 0; this.rumble.connect(this.rumbleG).connect(this.sfx); this.rumble.start();
    this.windF = C.createBiquadFilter(); this.windF.type = "bandpass"; this.windF.frequency.value = 900; this.windF.Q.value = .6; this.windG = C.createGain(); this.windG.gain.value = 0;
    this.loopNoise().connect(this.windF).connect(this.windG).connect(this.sfx);

    this.next = C.currentTime + .05;
    setInterval(() => this.schedule(), 25);
  }
  curve(k) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; }
  loopNoise() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; }

  setOn(v) {
    this.init(); this.on = v;
    if (v && this.ctx.state !== "running") this.ctx.resume();
    this.master.gain.setTargetAtTime(v ? .85 : 0, this.ctx.currentTime, .12);
  }

  // ---- song clock (Watch) ----
  startSong(atSeconds) {
    this.init(); const C = this.ctx;
    this.mode = "song"; this.songStart = C.currentTime + .06 - atSeconds;
    const n = Math.max(0, Math.ceil((C.currentTime + .06 - this.songStart) / STEP));
    this.songStep = n; this.next = this.songStart + n * STEP; this.dropped = atSeconds > 8 * BAR;
  }
  stopSong() { this.mode = "idle"; this.songStart = null; }
  songTime() { return this.songStart == null ? null : this.ctx.currentTime - this.songStart; }
  setGame(state) { if (this.mode !== "song") { this.mode = state === "off" ? "idle" : "game"; this.gameState = state; } }

  schedule() {
    if (!this.on || this.ctx.state !== "running") return;
    const C = this.ctx;
    if (this.mode === "song") {
      while (this.next < C.currentTime + .12) {
        const bar = Math.floor(this.songStep / 16);
        if (bar >= SONG_BARS) { this.mode = "idle"; break; }
        this.applyMix(songMix(bar + (this.songStep % 16) / 16), this.next);
        if (bar === 8 && this.songStep % 16 === 0) this.impact(this.next);
        if (bar === 7 && this.songStep % 16 === 12) this.chop(this.next, "ey", 1.2);
        if (bar !== 7 || this.songStep % 16 < 12) this.playStep(this.songStep, this.next, songMix(bar + (this.songStep % 16) / 16));
        this.songStep++; this.next += STEP;
      }
    } else {
      const mix = this.mode === "game" ? gameMix(this.gameState) : { pad: .4, hat: 0, kick: 0, clap: 0, bass: 0, bell: 0, chop: 0, rise: 0, half: true, riff: 0, open: 700 };
      while (this.next < C.currentTime + .12) { this.applyMix(mix, this.next); this.playStep(this.liveStep, this.next, mix); this.liveStep++; this.next += STEP; }
    }
  }

  applyMix(m, t) {
    for (const k in this.bus) this.bus[k].gain.setTargetAtTime(m[k] || 0, t, .2);
    this.padF.frequency.setTargetAtTime(m.open, t, .3);
    this.riseF.frequency.setTargetAtTime(200 + (m.rise || 0) ** 2 * 7000, t, .05);
    this.riseG.gain.setTargetAtTime((m.rise || 0) * .3, t, .05);
  }

  playStep(n, t, m) {
    const s = n % 16, bar = Math.floor(n / 16) % 4;
    if (s === 0) PAD[bar].forEach((fr, i) => { this.padOsc[i * 2].frequency.setTargetAtTime(fr, t, .06); this.padOsc[i * 2 + 1].frequency.setTargetAtTime(fr * 1.003, t, .06); });
    const kicks = m.half ? KICK_HALF : KICK;
    if (kicks[s] && m.kick > .01) { this.kick(t); this.duck(t); }
    if (kicks[s] && m.bass > .01) this.bass808(t, ROOTS[bar] * (s === 12 ? 1.5 : 1));
    if ((s === 4 || s === 12) && m.clap > .01 && !(m.half && s === 4)) this.clap(t);
    if (m.hat > .01) { if (s % 2 === 1 || (bar === 3 && s >= 12)) this.hat(t, s % 4 === 3 ? 1 : .6); if (s === 6 || s === 14) this.hat(t, .8, true); }
    if (m.bell > .01) {
      const riff = m.riff === 2 ? RIFF_C : (Math.floor(n / 16) % 2 ? RIFF_B : RIFF_A);
      for (const [st, semi] of riff) if (st === s) this.bell(t, F0 * Math.pow(2, semi / 12));
    }
    if (m.chop > .01 && ((s === 0 && bar % 2 === 0) || (s === 10 && bar === 3))) this.chop(t, s === 0 ? "ah" : "ey", 1);
  }

  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); }
  duck(t) { const g = this.pump.gain; g.cancelScheduledValues(t); g.setValueAtTime(1, t); g.linearRampToValueAtTime(.3, t + .01); g.linearRampToValueAtTime(1, t + .22); }
  kick(t) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), sh = C.createWaveShaper(); sh.curve = this.curve(4);
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(45, t + .1);
    this.env(g, t, .002, 1, .32); o.connect(sh).connect(g).connect(this.bus.kick); o.start(t); o.stop(t + .4);
  }
  bass808(t, fr) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), sh = C.createWaveShaper(); sh.curve = this.curve(3);
    o.frequency.setValueAtTime(fr * 2, t); o.frequency.exponentialRampToValueAtTime(fr, t + .05);
    this.env(g, t, .004, .8, .55); o.connect(sh).connect(g).connect(this.bus.bass); o.start(t); o.stop(t + .65);
  }
  noiseHit(t, type, freq, q, peak, dec, bus) {
    const C = this.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, .001, peak, dec); s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dec + .05);
  }
  clap(t) { for (const d of [0, .01, .022]) this.noiseHit(t + d, "bandpass", 1700, 1.4, .6, .14, this.bus.clap); this.noiseHit(t, "highpass", 3000, .5, .2, .2, this.revBus); }
  hat(t, v, open) { this.noiseHit(t, "highpass", 8500, .8, .16 * v, open ? .16 : .035, this.bus.hat); }
  bell(t, fr) {
    const C = this.ctx, f = C.createBiquadFilter(), g = C.createGain();
    f.type = "bandpass"; f.frequency.value = fr * 1.3; f.Q.value = 2.2;
    this.env(g, t, .002, .3, .22); f.connect(g).connect(this.bellIn);
    for (const m of [1, 1.504]) { const o = C.createOscillator(); o.type = "square"; o.frequency.value = fr * m; o.connect(f); o.start(t); o.stop(t + .28); }
  }
  chop(t, vowel, amt) { // a vocal-ish "ah" / "ey": a buzzy source through two formant filters with a pitch fall
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), [f1, f2] = vowel === "ah" ? [800, 1200] : [530, 1850];
    o.type = "sawtooth"; o.frequency.setValueAtTime(vowel === "ah" ? 196 : 247, t); o.frequency.exponentialRampToValueAtTime(vowel === "ah" ? 150 : 185, t + .3);
    const a = C.createBiquadFilter(), b = C.createBiquadFilter(); a.type = b.type = "bandpass"; a.frequency.value = f1; b.frequency.value = f2; a.Q.value = 8; b.Q.value = 10;
    this.env(g, t, .01, .9 * amt, .32); o.connect(a).connect(g); o.connect(b).connect(g); g.connect(this.bus.chop); o.start(t); o.stop(t + .4);
  }
  impact(t = this.ctx.currentTime) {
    if (!this.on) return; const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    this.env(g, t, .004, 1.1, 1.6); o.connect(g).connect(this.musicIn); o.start(t); o.stop(t + 1.7);
    this.noiseHit(t, "lowpass", 6000, .5, .55, 1.5, this.musicIn);
  }
  whoosh() { if (this.on) this.noiseHit(this.ctx.currentTime, "bandpass", 700, .8, .5, .9, this.sfx); }
  pop() { if (this.on) { const t = this.ctx.currentTime; this.noiseHit(t, "bandpass", 300, 1, .9, .07, this.sfx); this.noiseHit(t + .06, "bandpass", 260, 1, .6, .06, this.sfx); } }
  crash() { if (this.on) { const t = this.ctx.currentTime; this.noiseHit(t, "lowpass", 2500, .4, 1, 1.2, this.sfx); this.noiseHit(t, "bandpass", 180, 1, 1, .6, this.sfx); } }
  win() { if (this.on) { const t = this.ctx.currentTime; [0, 4, 7, 12].forEach((s, i) => this.bell(t + i * STEP * 2, F0 * Math.pow(2, s / 12))); } }
  rev() {
    if (!this.on) return; const t = this.ctx.currentTime;
    for (const [o, k] of [[this.eng1, 1], [this.eng2, .5]]) { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(30 * k, t); o.frequency.linearRampToValueAtTime(240 * k, t + .35); o.frequency.linearRampToValueAtTime(32 * k, t + 1.3); }
    this.engG.gain.cancelScheduledValues(t); this.engG.gain.setValueAtTime(.06, t); this.engG.gain.linearRampToValueAtTime(.2, t + .35); this.engG.gain.linearRampToValueAtTime(.05, t + 1.3);
    this.engF.frequency.setValueAtTime(2600, t); this.engF.frequency.linearRampToValueAtTime(500, t + 1.3);
    this.revUntil = performance.now() + 1400;
  }
  // the car, every frame
  car(s) {
    if (!this.ctx || !this.on) return; const t = this.ctx.currentTime;
    if (!(performance.now() < this.revUntil)) {
      const f = Math.max(28, s.rpm / 30);
      this.eng1.frequency.setTargetAtTime(f, t, .03); this.eng2.frequency.setTargetAtTime(f * .5, t, .03);
      this.engF.frequency.setTargetAtTime(300 + s.load * 2600, t, .05);
      this.engG.gain.setTargetAtTime(s.engine * (.04 + s.load * .1), t, .06);
    }
    this.thrG.gain.setTargetAtTime(s.thrust * .45, t, .08); this.thrF.frequency.setTargetAtTime(500 + s.thrust * 1500, t, .1);
    this.rumbleG.gain.setTargetAtTime(s.thrust * .3, t, .1);
    this.windG.gain.setTargetAtTime(Math.min(1, s.speed / 320) * .16, t, .2);
    this.sfxLP.frequency.setTargetAtTime(s.inside ? 1100 : 16000, t, .3);
  }
}
