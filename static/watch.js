// Watch: the 48 s film. Its clock is the song's clock (26 bars at 130 bpm) whenever sound is on,
// so the loop lands on the beat, the ramp gets the build-up and lift-off gets the drop.
import * as THREE from "three";
import { clamp, lerp, smooth, keyed, G, R, LZ, frame, loc, zonesFrom } from "./world.js";
import { BAR, SONG_BARS } from "./sound.js";
import { HEAD } from "./interior.js";

export const TOTAL = SONG_BARS * BAR;
export const CHAPTERS = [
  [0, "Build", "Blueprint to carbon."], [2, "Roll out", "0 to 108 km/h."], [4, "The loop", "A full 360°. Real loop physics."],
  [8, "The ramp", "Foot down. 33° kicker."], [10, "Lift-off", "Four thrusters fire straight down."], [13, "Wings out", "Thrusters swing back. It glides."],
  [19.3, "Front seat", "Inside the Hydra LTE242."], [22, "The screen", "Landing scan within 5 km, fuel, dashcam."], [24, "", ""],
];

export function createWatch(W, car, interior) {
  const T = W.track, fr = frame(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const dStart = T.D[T.idxX(0)], dX = x => T.D[T.idxX(x, T.roadEnd)];
  const RIDE = [[0, dStart], [.065, T.D[T.loopIn]], [.245, T.D[T.loopOut]], [.33, T.D[T.rampIn]], [.385, T.D[T.roadEnd]], [.5, dX(77)], [.64, dX(180)], [.78, dX(420)], [1, dX(880)]];
  const rideP = b => b < 2 ? 0 : keyed([[2, 0], [4, .065], [8, .245], [9, .33], [10, .385], [13, .5], [16, .64], [19.3, .735], [26, 1]], b);
  const speedMS = (p, y) => {
    if (p < .065) return 30 * Math.pow(smooth(0, .065, p), .6);
    if (p < .245) return Math.sqrt(Math.max(30 * 30 - 2 * G * y, 9));
    if (p < .33) return lerp(30, 48, smooth(.245, .33, p));
    if (p < .385) return Math.sqrt(Math.max(48 * 48 - 2 * G * y, 9));
    return keyed([[.385, 47], [.5, 72], [.64, 88], [.78, 84], [1, 81]], p);
  };
  const thrustDeploy = p => smooth(.355, .395, p), thrustPower = p => keyed([[.37, 0], [.392, 1], [.5, 1], [.56, .5], [.66, .35], [1, .3]], p);
  const thrustAngle = p => keyed([[.39, 0], [.47, .12], [.56, .85], [.62, 1]], p), wingsOut = p => smooth(.5, .585, p);
  const fuelAt = p => keyed([[.385, 100], [.5, 81], [.66, 73], [1, 66]], p);
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
      T.sample(keyed(RIDE, p), fr);
      basis.makeBasis(fr.f, fr.u, fr.s); q.setFromRotationMatrix(basis);
      const v = b < 2 ? 0 : speedMS(p, fr.p.y), onLoop = fr.i >= T.loopIn && fr.i <= T.loopOut;
      const g = onLoop ? v * v / (R * G) + fr.u.y : (p > .385 ? 1 + thrustPower(p) * .25 : 1);
      const speed = v * 3.6, dep = thrustDeploy(p), power = thrustPower(p);
      // camera
      let cam;
      if (b < 2) {
        const h = b / 2, a = lerp(.75, 1.45, smooth(0, 1, h));
        cam = { pos: new THREE.Vector3(Math.cos(a) * 7.4, lerp(2.2, 1.3, h), Math.sin(a) * 8.2), look: new THREE.Vector3(0, .55, 0), fov: 40 };
        cam = blend(cam, shotAt(0, fr), smooth(.8, 1, h));
      } else {
        cam = shotAt(p, fr);
        if (b > 19) {
          car.group.position.copy(fr.p); car.group.quaternion.copy(q); car.group.updateMatrixWorld(true);
          const head = { pos: HEAD.clone().applyMatrix4(car.group.matrixWorld), look: loc(fr, 30, .5, HEAD.z), up: fr.u.clone(), fov: 72 };
          const glance = { pos: head.pos, look: interior.screen.getWorldPosition(new THREE.Vector3()), up: fr.u.clone(), fov: 66 };
          const sv = interior.screenView(aspect, fovFor(46)), scr = { pos: sv.pos, look: sv.look, up: sv.up, fov: 46 };
          if (b < 20.2) cam = blend(cam, head, smooth(19.3, 20.2, b));
          else if (b < 22) cam = blend(head, glance, smooth(21.2, 22, b));
          else cam = blend(glance, scr, smooth(22, 23.4, b));
        }
      }
      if (b >= 10 && prevB < 10) this.onDrop && this.onDrop();
      prevB = b;
      let gear = 1; const GEARS = [0, 60, 100, 140, 185, 235, 285, 340];
      for (let i = 1; i < GEARS.length; i++) if (speed >= GEARS[i]) gear = i + 1;
      gear = Math.min(7, gear);
      const rpm = p < .385 && b >= 2 ? 2400 + clamp((speed - GEARS[gear - 1]) / ((GEARS[gear] || 340) - GEARS[gear - 1])) * 5200 : 900;
      return {
        bar: b, p, reveal: smooth(0, 1.8, b), pos: fr.p.clone(), quat: q.clone(), fr, speed, g, alt: Math.max(0, fr.p.y), vs: v * fr.f.y,
        thrust: { power: power * dep, angle: thrustAngle(p), deploy: dep }, wings: wingsOut(p), air: p > .385, onLoop,
        cam, inside: b > 19.9, screenOn: b > 20, fuel: fuelAt(p), mode: thrustAngle(p) > .9 ? "GLIDE" : p > .385 ? "THRUST" : "DRIVE",
        rpm, gear, load: p < .385 ? .7 : .15, engine: p < .385 ? 1 : .15,
        zones: zonesFrom(fr.p, fr.f), dream: smooth(24, 24.6, b), fade: smooth(25.4, 26, b),
        chapter: CHAPTERS.reduce((c, ch) => (b >= ch[0] ? ch : c), CHAPTERS[0]),
      };
    },
  };
}
