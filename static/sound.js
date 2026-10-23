// VOID's sound, all synthesized live with Web Audio (no samples, no licensed music):
// an original 140 bpm dark trap / phonk track whose layers follow the ride, plus the car itself
// (V8 with gear changes, thrusters, wind). Nothing plays until the visitor turns sound on.

const BPM = 140, STEP = 60 / BPM / 4;
const ROOTS = [55, 43.65, 65.41, 41.2];                                    // A1 F1 C2 E1, one per bar
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [164.8, 207.7, 246.9]];
const KICK = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], KICK_DROP = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
const BELL = [[0, 880], [3, 1046.5], [6, 880], [8, 659.3], [10, 784], [11, 880], [14, 1046.5]];
const BELL2 = [[0, 1174.7], [3, 1046.5], [6, 880], [8, 784], [10, 659.3], [12, 784], [14, 659.3]];

export class Sound {
  constructor() { this.on = false; this.ctx = null; this.mix = { pad: 0, hat: 0, kick: 0, clap: 0, bass: 0, bell: 0 }; this.step = 0; this.half = false; }

  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    this.music = C.createGain(); this.music.gain.value = .55; this.music.connect(this.master);
    this.sfxLP = C.createBiquadFilter(); this.sfxLP.type = "lowpass"; this.sfxLP.frequency.value = 16000;
    this.sfx = C.createGain(); this.sfx.gain.value = .5; this.sfx.connect(this.sfxLP).connect(this.master);
    this.bus = {};
    for (const k of Object.keys(this.mix)) { const g = C.createGain(); g.gain.value = 0; g.connect(this.music); this.bus[k] = g; }

    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loopNoise = () => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // pad: detuned saws through a slow lowpass
    this.padF = C.createBiquadFilter(); this.padF.type = "lowpass"; this.padF.frequency.value = 900; this.padF.Q.value = .7;
    this.padF.connect(this.bus.pad);
    this.padOsc = [];
    for (let i = 0; i < 6; i++) { const o = C.createOscillator(); o.type = "sawtooth"; o.detune.value = (i % 2 ? 9 : -9); const g = C.createGain(); g.gain.value = .045; o.connect(g).connect(this.padF); o.start(); this.padOsc.push(o); }

    // riser: noise through a sweeping bandpass
    this.riseF = C.createBiquadFilter(); this.riseF.type = "bandpass"; this.riseF.Q.value = 3; this.riseG = C.createGain(); this.riseG.gain.value = 0;
    loopNoise().connect(this.riseF).connect(this.riseG).connect(this.music);

    // engine: saw + square through a soft clipper and a lowpass that opens with load
    this.eng1 = C.createOscillator(); this.eng1.type = "sawtooth"; this.eng2 = C.createOscillator(); this.eng2.type = "square";
    const shaper = C.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.2); }
    shaper.curve = curve;
    this.engF = C.createBiquadFilter(); this.engF.type = "lowpass"; this.engF.frequency.value = 600; this.engF.Q.value = 2;
    this.engG = C.createGain(); this.engG.gain.value = 0;
    const g2 = C.createGain(); g2.gain.value = .5;
    this.eng1.connect(shaper); this.eng2.connect(g2).connect(shaper); shaper.connect(this.engF).connect(this.engG).connect(this.sfx);
    this.eng1.start(); this.eng2.start();

    // thrusters: a low roar plus a hiss; wind rises with speed
    this.thrF = C.createBiquadFilter(); this.thrF.type = "lowpass"; this.thrF.frequency.value = 700;
    this.thrG = C.createGain(); this.thrG.gain.value = 0; loopNoise().connect(this.thrF).connect(this.thrG).connect(this.sfx);
    this.rumble = C.createOscillator(); this.rumble.frequency.value = 42; this.rumbleG = C.createGain(); this.rumbleG.gain.value = 0;
    this.rumble.connect(this.rumbleG).connect(this.sfx); this.rumble.start();
    this.windF = C.createBiquadFilter(); this.windF.type = "bandpass"; this.windF.frequency.value = 900; this.windF.Q.value = .6;
    this.windG = C.createGain(); this.windG.gain.value = 0; loopNoise().connect(this.windF).connect(this.windG).connect(this.sfx);

    this.next = C.currentTime + .05;
    setInterval(() => this.schedule(), 25);
  }

  setOn(v) {
    this.init(); this.on = v;
    if (v && this.ctx.state !== "running") this.ctx.resume();
    this.master.gain.setTargetAtTime(v ? .8 : 0, this.ctx.currentTime, .15);
  }

  // which layers play, from where the visitor is in the site
  plan(scene, p) {
    const m = { pad: .5, hat: 0, kick: 0, clap: 0, bass: 0, bell: 0 }; let rise = 0, half = false, open = 900;
    if (scene === "hero") { m.pad = .45; open = 500 + p * 1400; m.hat = p > .6 ? .3 : 0; }
    else if (scene === "ride") {
      if (p < .06) { m.hat = .6; m.bass = .4; open = 1600; }
      else if (p < .33) { Object.assign(m, { hat: .8, kick: .9, clap: .6, bass: .8 }); open = 2200; }
      else if (p < .385) { m.pad = .7; rise = (p - .33) / .055; open = 1000 + rise * 4000; m.hat = .2; }   // build-up, drums out
      else if (p < .52) { Object.assign(m, { pad: .6, hat: 1, kick: 1, clap: .9, bass: 1, bell: 1 }); open = 4200; }
      else if (p < .66) { Object.assign(m, { pad: .6, hat: .6, kick: .8, clap: .7, bass: .8, bell: .9 }); half = true; open = 3000; }
      else if (p < .78) { Object.assign(m, { pad: .8, bass: .5, bell: .35, hat: .25 }); open = 1800; }
      else if (p < .9) { Object.assign(m, { pad: .7, kick: .55, bass: .45, hat: .2 }); half = true; open = 700; }
      else { m.pad = .8 * (1 - (p - .9) / .1); open = 1200; }
    } else if (scene === "build") { Object.assign(m, { pad: .5, hat: .35, bell: .35, bass: .3 }); open = 1500; half = true; }
    else { m.pad = .4; open = 800; }
    return { m, rise, half, open };
  }

  update(s) {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime, { m, rise, half, open } = this.plan(s.scene, s.p);
    this.half = half; this.drop = s.scene === "ride" && s.p >= .385 && s.p < .52;
    for (const k in m) this.bus[k].gain.setTargetAtTime(m[k], t, .25);
    this.padF.frequency.setTargetAtTime(open, t, .4);
    this.riseF.frequency.setTargetAtTime(200 + rise * rise * 7000, t, .05);
    this.riseG.gain.setTargetAtTime(rise * .35, t, .05);

    if (!(performance.now() < this.revUntil)) {
      const f = Math.max(28, s.rpm / 30);
      this.eng1.frequency.setTargetAtTime(f, t, .03); this.eng2.frequency.setTargetAtTime(f * .5, t, .03);
      this.engF.frequency.setTargetAtTime(300 + s.load * 2600, t, .05);
      this.engG.gain.setTargetAtTime(s.engine * (.05 + s.load * .12), t, .06);
    }
    this.thrG.gain.setTargetAtTime(s.thrust * .5, t, .08); this.thrF.frequency.setTargetAtTime(500 + s.thrust * 1500, t, .1);
    this.rumbleG.gain.setTargetAtTime(s.thrust * .35, t, .1);
    this.windG.gain.setTargetAtTime(Math.min(1, s.speed / 320) * .18, t, .2);
    this.sfxLP.frequency.setTargetAtTime(s.inside ? 900 : 16000, t, .3);
  }

  schedule() {
    if (!this.on || this.ctx.state !== "running") return;
    const C = this.ctx;
    while (this.next < C.currentTime + .12) { this.playStep(this.step, this.next); this.step++; this.next += STEP; }
  }

  playStep(n, t) {
    const s = n % 16, bar = Math.floor(n / 16) % 4, C = this.ctx;
    if (s === 0) CHORDS[bar].forEach((fr, i) => { this.padOsc[i * 2].frequency.setTargetAtTime(fr, t, .08); this.padOsc[i * 2 + 1].frequency.setTargetAtTime(fr * 1.002, t, .08); });
    const kicks = this.drop ? KICK_DROP : KICK;
    if (kicks[s] && (!this.half || s % 8 === 0)) { this.kick(t); this.bass808(t, ROOTS[bar]); }
    if ((this.half ? s === 8 : (s === 4 || s === 12))) this.clap(t);
    if (s % 2 === 0 || (s >= 12 && bar === 3)) this.hat(t, s % 4 === 2 ? .9 : .55);
    const mel = Math.floor(n / 16) % 2 ? BELL2 : BELL;
    for (const [st, fr] of mel) if (st === s) this.bell(t, fr);
  }

  env(g, t, a, peak, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); }
  kick(t) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    this.env(g, t, .002, 1, .35); o.connect(g).connect(this.bus.kick); o.start(t); o.stop(t + .4);
  }
  bass808(t, fr) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), sh = C.createWaveShaper(), c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2); } sh.curve = c;
    o.type = "sine"; o.frequency.setValueAtTime(fr * 1.5, t); o.frequency.exponentialRampToValueAtTime(fr, t + .06);
    this.env(g, t, .005, .9, .9); o.connect(sh).connect(g).connect(this.bus.bass); o.start(t); o.stop(t + 1);
  }
  noiseHit(t, type, freq, q, peak, dec, bus) {
    const C = this.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, .001, peak, dec); s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dec + .05);
  }
  clap(t) { for (const d of [0, .012, .024]) this.noiseHit(t + d, "bandpass", 1500, 1.2, .55, .16, this.bus.clap); }
  hat(t, v) { this.noiseHit(t, "highpass", 8000, .7, .18 * v, .04, this.bus.hat); }
  bell(t, fr) {
    const C = this.ctx, f = C.createBiquadFilter(), g = C.createGain();
    f.type = "bandpass"; f.frequency.value = fr * 1.25; f.Q.value = 3;
    this.env(g, t, .002, .22, .28); f.connect(g).connect(this.bus.bell);
    for (const m of [1, 1.48]) { const o = C.createOscillator(); o.type = "square"; o.frequency.value = fr * m; o.connect(f); o.start(t); o.stop(t + .32); }
  }

  // one-off hits tied to moments in the ride
  impact() {
    if (!this.on) return; const C = this.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    this.env(g, t, .005, 1.1, 1.6); o.connect(g).connect(this.music); o.start(t); o.stop(t + 1.7);
    this.noiseHit(t, "lowpass", 5000, .5, .5, 1.4, this.music);
  }
  whoosh() { if (this.on) this.noiseHit(this.ctx.currentTime, "bandpass", 700, .8, .5, .9, this.sfx); }
  pop() { if (this.on) { const t = this.ctx.currentTime; this.noiseHit(t, "bandpass", 300, 1, .9, .07, this.sfx); this.noiseHit(t + .06, "bandpass", 260, 1, .6, .06, this.sfx); } }
  rev() {
    if (!this.on) return; const t = this.ctx.currentTime;
    for (const [o, k] of [[this.eng1, 1], [this.eng2, .5]]) { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(30 * k, t); o.frequency.linearRampToValueAtTime(240 * k, t + .35); o.frequency.linearRampToValueAtTime(32 * k, t + 1.3); }
    this.engG.gain.cancelScheduledValues(t); this.engG.gain.setValueAtTime(.06, t); this.engG.gain.linearRampToValueAtTime(.2, t + .35); this.engG.gain.linearRampToValueAtTime(.05, t + 1.3);
    this.engF.frequency.setValueAtTime(2600, t); this.engF.frequency.linearRampToValueAtTime(500, t + 1.3);
    this.revUntil = performance.now() + 1400;
  }
}
