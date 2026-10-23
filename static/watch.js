// Watch: the 48 s film. Its clock is the song's clock (26 bars at 130 bpm) whenever sound is on,
// so the loop lands on the beat, the ramp gets the build-up and lift-off gets the drop.
import * as THREE from "three";
import { clamp, lerp, smooth, keyed, G, R, LZ, frame, loc, zonesFrom } from "./world.js";
import { BAR, SONG_BARS } from "./sound.js";
import { HEAD } from "./interior.js";

export const TOTAL = SONG_BARS * BAR;
export const CHAPTERS = [
  [0, "Build", "Blueprint to carbon."], [2, "Roll out", "Flat out from a standstill."], [4.5, "The loop", "A full 360°. Real loop physics."],
  [6, "The ramp", "Foot down. 33° kicker."], [8, "Lift-off", "Four thrusters fire straight down."], [11, "Wings out", "Thrusters swing back. It glides over Dammam."],
  [17.5, "Front seat", "Inside the Hydra LTE242."], [20.2, "The screen", "Dashcam and a landing scan within 5 km."], [22, "", ""],
];

export function createWatch(W, car, interior) {
  const T = W.track, fr = frame(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const dStart = T.D[T.idxX(0)], dX = x => T.D[T.idxX(x, T.roadEnd)];
  const RIDE = [[0, dStart], [.065, T.D[T.loopIn]], [.245, T.D[T.loopOut]], [.33, T.D[T.rampIn]], [.385, T.D[T.roadEnd]], [.5, dX(77)], [.64, dX(180)], [.78, dX(420)], [1, dX(880)]];
  const rideP = b => b < 2 ? 0 : keyed([[2, 0], [4.5, .065], [6, .245], [7.2, .33], [8, .385], [11, .5], [14, .64], [17.5, .735], [24, 1]], b);
  const speedMS = (p, y) => {
    if (p < .065) return 30 * Math.pow(smooth(0, .065, p), .6);
    if (p < .245) return Math.sqrt(Math.max(30 * 30 - 2 * G * y, 9));
    if (p < .33) return lerp(30, 48, smooth(.245, .33, p));
    if (p < .385) return Math.sqrt(Math.max(48 * 48 - 2 * G * y, 9));
    return keyed([[.385, 47], [.5, 72], [.64, 88], [.78, 84], [1, 81]], p);
  };
  const thrustDeploy = p => smooth(.355, .395, p), thrustPower = p => keyed([[.37, 0], [.392, 1], [.5, 1], [.56, .5], [.66, .35], [1, .3]], p);
  const thrustAngle = p => keyed([[.39, 0], [.47, .12], [.56, .85], [.62, 1]], p), wingsOut = p => smooth(.5, .585, p);

  // where the car is at each bar, with real speed changes inside each section: it pulls away from
  // rest, slows over the top of the loop and whips through the bottom, builds up the run-up and
  // ramp, surges on the thrusters, then glides. w(s) is the speed shape over the section.
  const tmp = frame(), V0 = 30, dFilm = T.D[T.idxX(-55)];
  const SECTIONS = [
    [2, 4.5, dFilm, T.D[T.loopIn], s => Math.sqrt(s + .02)],
    [4.5, 6, T.D[T.loopIn], T.D[T.loopOut], s => Math.sqrt(Math.max(.05, 1 - 2 * G * T.sample(lerp(T.D[T.loopIn], T.D[T.loopOut], s), tmp).p.y / (V0 * V0)))],
    [6, 8, T.D[T.loopOut], T.D[T.roadEnd], s => .75 + .35 * s],
    [8, 11, T.D[T.roadEnd], dX(T.P[T.roadEnd].x + 110), s => Math.sqrt(.25 + 1.4 * s)],
    [11, 17.5, dX(T.P[T.roadEnd].x + 110), dX(T.P[T.roadEnd].x + 1150), () => 1],
    [17.5, 24, dX(T.P[T.roadEnd].x + 1150), dX(T.P[T.roadEnd].x + 2100), () => 1],
  ].map(([b0, b1, d0, d1, w]) => {
    const N = 240, tau = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) tau[i] = tau[i - 1] + 2 / (w((i - 1) / N) + w(i / N)) / N;
    for (let i = 1; i <= N; i++) tau[i] /= tau[N];
    return { b0, b1, d0, d1, tau, N };
  });
  const distAt = b => {
    if (b <= 2) return dFilm;
    const S = SECTIONS.find(x => b <= x.b1) || SECTIONS[SECTIONS.length - 1];
    const u = clamp((b - S.b0) / (S.b1 - S.b0));
    let lo = 0, hi = S.N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S.tau[m] <= u) lo = m; else hi = m; }
    const s = (lo + clamp((u - S.tau[lo]) / Math.max(1e-6, S.tau[hi] - S.tau[lo]))) / S.N;
    return lerp(S.d0, S.d1, s);
  };
  const FILM = 1;      // real time
  const UP = new THREE.Vector3(0, 1, 0);
  const SHOTS = [
    [0, .05, f => ({ pos: loc(f, -1, 1.3, 8), look: loc(f, 0, .6, 0), fov: 40 })],
    [.06, .065, f => ({ pos: loc(f, -7.5, 2.3, 4.5), look: loc(f, 4, .6, 0), fov: 42 })],
    [.085, .23, f => ({ pos: new THREE.Vector3(16, 9, LZ + 25), look: new THREE.Vector3(16, 9, 2).lerp(f.p, .3), fov: 44 })],
    [.255, .37, f => ({ pos: f.p.clone().add(new THREE.Vector3(-7, 2, 9)), look: f.p.clone().add(new THREE.Vector3(5, 1.4, 0)), fov: 46 })],
    [.395, .48, f => ({ pos: loc(f, -9, -1.8, 7), look: loc(f, 2, 1, 0), fov: 50 })],
    [.52, .62, f => ({ pos: loc(f, -4, 2.2, 12), look: loc(f, 1.5, .5, 0), fov: 42 })],
    [.665, 1, f => ({ pos: loc(f, -11, 3.2, 2), look: loc(f, 8, 1, 0), fov: 48 })],
  ];
  const shotAt = (p, f) => {
    for (let i = 0; i < SHOTS.length; i++) {
      const [a, b, fn] = SHOTS[i];
      if (p <= b || i === SHOTS.length - 1) {
        if (p >= a || i === 0) return fn(f);
        const prev = SHOTS[i - 1], w = smooth(prev[1], a, p), A = prev[2](f), B = fn(f);
        return { pos: A.pos.lerp(B.pos, w), look: A.look.lerp(B.look, w), fov: lerp(A.fov, B.fov, w) };
      }
    }
  };
  const blend = (A, B, w) => ({ pos: A.pos.clone().lerp(B.pos, w), look: A.look.clone().lerp(B.look, w), fov: lerp(A.fov, B.fov, w), up: (A.up || UP).clone().lerp(B.up || UP, w).normalize() });

  let prevB = 0;
  return {
    // everything about the film at time t (seconds)
    at(t, time, aspect, fovFor = f => f) {
      const b = clamp(t / BAR, 0, SONG_BARS), p = rideP(b);
      T.sample(distAt(b), fr);
      basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis);
      const v = b < 2 ? 0 : Math.min(93, (distAt(b + .02) - distAt(b)) / (.02 * BAR) * FILM), onLoop = fr.i >= T.loopIn && fr.i <= T.loopOut;
      const g = onLoop ? v * v / (R * G) + fr.u.y : (p > .385 ? 1 + thrustPower(p) * .25 : 1);
      const speed = v * 3.6, dep = thrustDeploy(p), power = thrustPower(p);
      // camera
      let cam;
      if (b < 2) {
        const h = b / 2, a = lerp(.75, 1.45, smooth(0, 1, h));
        cam = { pos: fr.p.clone().add(new THREE.Vector3(Math.cos(a) * 7.4, lerp(2.2, 1.3, h), Math.sin(a) * 8.2)), look: fr.p.clone().add(new THREE.Vector3(0, .55, 0)), fov: 40 };
        cam = blend(cam, shotAt(0, fr), smooth(.8, 1, h));
      } else {
        cam = shotAt(p, fr);
        if (b > 17.2) {
          car.group.position.copy(fr.p); car.group.quaternion.copy(q); car.group.updateMatrixWorld(true);
          const head = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30, .5, HEAD.z), up: fr.u.clone(), fov: 72 };
          const glance = { pos: head.pos, look: interior.screen.getWorldPosition(new THREE.Vector3()), up: fr.u.clone(), fov: 66 };
          const sv = interior.screenView(aspect, fovFor(46)), scr = { pos: sv.pos, look: sv.look, up: sv.up, fov: 46 };
          if (b < 18.4) cam = blend(cam, head, smooth(17.5, 18.4, b));
          else if (b < 20.2) cam = blend(head, glance, smooth(19.4, 20.2, b));
          else cam = blend(glance, scr, smooth(20.2, 21.4, b));
        }
      }
      if (b >= 8 && prevB < 8) this.onDrop && this.onDrop();
      prevB = b;
      let gear = 1; const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];
      for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
      gear = Math.min(7, gear);
      const rpm = b < 8 && b >= 2 ? 2400 + clamp((speed - GEARS[gear - 1]) / ((GEARS[gear] || 340) - GEARS[gear - 1])) * 5200 : 900;
      return {
        bar: b, p, reveal: smooth(0, 1.8, b), pos: fr.p.clone(), quat: q.clone(), fr, speed, g, alt: Math.max(0, fr.p.y), vs: v * fr.f.y,
        thrust: { power: power * dep, angle: thrustAngle(p), deploy: dep }, wings: wingsOut(p), air: p > .385, onLoop,
        cam, inside: b > 18.1, screenOn: b > 18.2, mode: thrustAngle(p) > .9 ? "GLIDE" : p > .385 ? "THRUST" : "DRIVE",
        rpm, gear, load: b < 8 ? .8 : .15, engine: b < 8 ? 1 : .15,
        zones: zonesFrom(fr.p, fr.f), dream: smooth(22, 22.6, b), fade: smooth(23.4, 24, b),
        chapter: CHAPTERS.reduce((c, ch) => (b >= ch[0] ? ch : c), CHAPTERS[0]),
      };
    },
  };
}
