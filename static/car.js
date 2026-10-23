// The VOID car (shape inspired by the McLaren 765LT), modelled in code: the body and canopy are lofted from side-profile curves
// (a rounded superellipse cross-section at every station), the wheel wells are carved out of
// the sides, and a blueprint of grid lines can be swept away by a clipping plane to "build" it.
import * as THREE from "three";

const X0 = -2.3, LEN = 4.6;                 // rear tip to nose, along +x
const WHEELS = [1.45, -1.42];               // front and rear axle x
const WR = 0.37, ARCH = 0.45, WELL = 0.6;   // wheel radius, arch radius, how far in the wells are carved

// cosine interpolation through [u, value] keys (u from 0 at the rear to 1 at the nose)
function curve(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [u1, v1] = keys[i], [u0, v0] = keys[i - 1];
    if (u <= u1) { const s = (1 - Math.cos(Math.PI * (u - u0) / (u1 - u0))) / 2; return v0 + (v1 - v0) * s; }
  }
  return keys[keys.length - 1][1];
}
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

const BODY = {
  x0: X0, len: LEN, n: 5, tumble: .25,
  top: [[0, .66], [.05, .84], [.12, .9], [.3, .9], [.45, .86], [.62, .8], [.75, .7], [.88, .56], [.96, .46], [1, .38]],
  bot: [[0, .36], [.06, .26], [.15, .22], [.85, .22], [.95, .24], [1, .3]],
  half: [[0, .78], [.06, .94], [.16, 1], [.42, .97], [.58, .96], [.8, 1], [.92, .94], [1, .72]],
  ends: [.025, .045], fenders: true,
};
const CANOPY = {
  x0: -0.95, len: 2.0, n: 4, tumble: .38,
  top: [[0, .86], [.15, 1.08], [.45, 1.17], [.7, 1.1], [1, .8]],
  bot: [[0, .7], [1, .7]],
  half: [[0, .55], [.4, .74], [.8, .7], [1, .5]],
  ends: [.08, .1], fenders: false,
};

// a (nu+1) x nv grid of points on the lofted surface
function loft(spec, nu, nv) {
  const P = new Float32Array((nu + 1) * nv * 3);
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, x = spec.x0 + spec.len * u;
    const t = curve(spec.top, u), b = curve(spec.bot, u), w = curve(spec.half, u);
    const c = (t + b) / 2, h = (t - b) / 2;
    const e = Math.pow(Math.max(0, Math.min(1, u / spec.ends[0], (1 - u) / spec.ends[1])), .35);
    for (let j = 0; j < nv; j++) {
      const th = (j / nv) * Math.PI * 2, cz = Math.cos(th), sy = Math.sin(th);
      let z = w * spow(cz, 2 / spec.n), y = h * spow(sy, 2 / spec.n);
      if (sy > 0) z *= 1 - spec.tumble * sy * sy;
      if (spec.fenders && sy > 0) for (const xw of WHEELS) y += (xw > 0 ? .22 : .1) * Math.exp(-(((x - xw) / .55) ** 2)) * Math.abs(cz) ** 3;
      z *= e; y = c + y * e;
      if (spec.fenders) for (const xw of WHEELS) {
        if ((x - xw) ** 2 + (y - WR) ** 2 < ARCH * ARCH && Math.abs(z) > WELL) z = Math.sign(z) * WELL;
      }
      const k = (i * nv + j) * 3; P[k] = x; P[k + 1] = y; P[k + 2] = z;
    }
  }
  return { P, nu, nv };
}

function surface({ P, nu, nv }) {
  const idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + (j + 1) % nv, c = (i + 1) * nv + j, d = (i + 1) * nv + (j + 1) % nv;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// blueprint: every few rings across the car, and every few lines along it
function gridLines({ P, nu, nv }, ringStep, lineStep) {
  const pts = [], at = (i, j) => { const k = (i * nv + j) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  for (let i = 0; i <= nu; i += ringStep) for (let j = 0; j < nv; j++) pts.push(...at(i, j), ...at(i, (j + 1) % nv));
  for (let j = 0; j < nv; j += lineStep) for (let i = 0; i < nu; i++) pts.push(...at(i, j), ...at(i + 1, j));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function buildCar() {
  const car = new THREE.Group();
  const solid = new THREE.Group(), wire = new THREE.Group();
  car.add(solid, wire);

  // the reveal: solid shows behind the scan plane, blueprint in front of it
  const solidClip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -3);
  const wireClip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 3);
  const clip = [solidClip];

  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, metalness: .55, roughness: .22, clearcoat: 1, clearcoatRoughness: .08, clippingPlanes: clip });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x040507, metalness: .3, roughness: .04, clearcoat: 1, envMapIntensity: 1.6, clippingPlanes: clip });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: .4, roughness: .55, clippingPlanes: clip });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .9, clippingPlanes: clip });
  const rim = new THREE.MeshStandardMaterial({ color: 0x121215, metalness: .9, roughness: .28, clippingPlanes: clip });
  const caliper = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: .3, roughness: .4, clippingPlanes: clip });
  const front = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8fbff).multiplyScalar(3), toneMapped: false, clippingPlanes: clip });
  const rear = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a3a).multiplyScalar(2.6), toneMapped: false, clippingPlanes: clip });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xeef0f5, transparent: true, opacity: .75, clippingPlanes: [wireClip] });

  const bodyHi = loft(BODY, 220, 96), canHi = loft(CANOPY, 90, 64);
  solid.add(new THREE.Mesh(surface(bodyHi), paint), new THREE.Mesh(surface(canHi), glass));
  wire.add(new THREE.LineSegments(gridLines(loft(BODY, 110, 48), 5, 4), lineMat), new THREE.LineSegments(gridLines(loft(CANOPY, 40, 32), 5, 4), lineMat));

  const add = (geo, mat, x, y, z, parent = solid) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // long-tail details: eye-socket headlights, splitter, side scoops, full-width wing,
  // split tail lights, a deep diffuser and four exhausts clustered high in the middle
  for (const s of [-1, 1]) {
    const sock = add(new THREE.SphereGeometry(.2, 24, 12), carbon, 2.0, .5, s * .6);
    sock.scale.set(.75, .38, 1.2); sock.rotation.y = s * .5;
    const led = add(new THREE.BoxGeometry(.03, .025, .34), front, 2.08, .53, s * .6); led.rotation.y = s * .55; led.rotation.x = s * -.25;
    add(new THREE.BoxGeometry(.03, .022, .14), front, 2.1, .47, s * .48).rotation.y = s * .2;
    const scoop = add(new THREE.SphereGeometry(.5, 28, 14), carbon, -.32, .6, s * .93);
    scoop.scale.set(1.1, .36, .16); scoop.rotation.z = .12;
    const blade = add(new THREE.BoxGeometry(.7, .07, .02), carbon, .72, .44, s * .985);
    blade.rotation.z = .18; blade.rotation.y = s * -.05;
    add(new THREE.BoxGeometry(.035, .035, .6), rear, -2.27, .78, s * .5);
  }
  add(new THREE.BoxGeometry(.38, .03, 1.98), carbon, 2.15, .235, 0);
  add(new THREE.BoxGeometry(.34, .03, 1.9), carbon, -2.12, 1.0, 0).rotation.z = .1;
  for (const z of [-.6, .6]) add(new THREE.BoxGeometry(.1, .14, .03), carbon, -2.06, .92, z);
  for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(.55, .18, .025), carbon, -2.08, .3, k * .2).rotation.z = -.4;
  const ti = new THREE.MeshStandardMaterial({ color: 0x6d7079, metalness: 1, roughness: .3, side: THREE.DoubleSide, clippingPlanes: clip });
  const pipe = new THREE.CylinderGeometry(.05, .05, .22, 24, 1, true).rotateZ(Math.PI / 2), soot = new THREE.CircleGeometry(.045, 20).rotateY(-Math.PI / 2);
  for (const y of [.58, .7]) for (const z of [-.065, .065]) { add(pipe, ti, -2.25, y, z); add(soot, rubber, -2.33, y, z); }
  add(new THREE.BoxGeometry(3.4, .03, 1.7), carbon, -.1, .22, 0); // flat floor

  // wheels: a spinning group (tyre, rim, spokes) and a fixed caliper
  const wheels = [];
  const tyreG = new THREE.CylinderGeometry(WR, WR, .3, 56).rotateX(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(.285, .285, .305, 48).rotateX(Math.PI / 2);
  const spokeG = new THREE.BoxGeometry(.035, .25, .03), hubG = new THREE.CylinderGeometry(.06, .06, .32, 20).rotateX(Math.PI / 2);
  const wireWheel = new THREE.EdgesGeometry(new THREE.CylinderGeometry(WR, WR, .3, 28).rotateX(Math.PI / 2), 20);
  for (const xw of WHEELS) for (const s of [-1, 1]) {
    const spin = new THREE.Group(); spin.position.set(xw, WR, s * .82); solid.add(spin);
    spin.add(new THREE.Mesh(tyreG, rubber), new THREE.Mesh(rimG, rim), new THREE.Mesh(hubG, caliper));
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Mesh(spokeG, rim), a = k / 10 * Math.PI * 2;
      sp.position.set(Math.sin(a) * .14, Math.cos(a) * .14, s * .16); sp.rotation.z = -a + (k % 2 ? .25 : -.25); spin.add(sp);
    }
    add(new THREE.BoxGeometry(.2, .12, .07), caliper, xw - .17, WR + .12, s * .74).rotation.z = .6;
    const wl = new THREE.LineSegments(wireWheel, lineMat); wl.position.set(xw, WR, s * .82); wire.add(wl);
    wheels.push(spin);
  }

  // the glowing scan plane that sweeps along the car during the build
  const scanTex = (() => {
    const c = document.createElement("canvas"); c.width = 4; c.height = 128;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c);
  })();
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  scan.rotation.y = Math.PI / 2; scan.rotation.z = Math.PI / 2; scan.position.y = .7; car.add(scan);

  // flight kit: four thrusters that swing from straight down (lift-off) to straight back (cruise),
  // and two swept wings that slide out of the sides, with nav lights on the tips
  const housing = new THREE.MeshStandardMaterial({ color: 0x18181c, metalness: .85, roughness: .3 });
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdff6ff).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const outer = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4f8dff).multiplyScalar(2.2), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const nozG = new THREE.CylinderGeometry(.12, .16, .26, 24, 1, true), ringG = new THREE.TorusGeometry(.15, .025, 8, 28).rotateX(Math.PI / 2);
  const flameG = new THREE.ConeGeometry(.14, 1, 20, 1, true).rotateX(Math.PI).translate(0, -.5, 0);
  const thrusters = [];
  for (const [x, y] of [[.9, .3], [-.95, .38]]) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, s * 1.0); car.add(pivot);
    const noz = new THREE.Mesh(nozG, housing); noz.position.y = -.05;
    const ring = new THREE.Mesh(ringG, front); ring.position.y = -.18;
    const fo = new THREE.Mesh(flameG, outer), fc = new THREE.Mesh(flameG, core);
    fo.position.y = fc.position.y = -.18; fc.scale.set(.45, 1, .45);
    pivot.add(noz, ring, fo, fc); pivot.scale.setScalar(0);
    thrusters.push({ pivot, fo, fc, seed: Math.random() * 10 });
  }
  const glowLight = new THREE.PointLight(0x6aa8ff, 0, 9, 2); glowLight.position.set(0, -.4, 0); car.add(glowLight);

  const wingShape = new THREE.Shape([[.7, 0], [-1.05, 0], [-1.35, 2.25], [-.75, 2.25]].map(([a, b]) => new THREE.Vector2(a, b)));
  const wingG = new THREE.ExtrudeGeometry(wingShape, { depth: .05, bevelEnabled: true, bevelThickness: .015, bevelSize: .02, bevelSegments: 2 }).rotateX(-Math.PI / 2);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingG, paint); w.position.set(-.15, .6, s * .85); w.scale.set(1, 1, 0); car.add(w);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(s > 0 ? 0x22ff66 : 0xff2233).multiplyScalar(3), toneMapped: false }));
    nav.position.set(-1.1, .04, -2.25); w.add(nav);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.8, .02, .02), front); edge.position.set(-.18, .06, -.02); w.add(edge);
    wings.push({ w, s, nav });
  }

  return {
    group: car, wheels, clip, materials: { carbon, front },
    // power 0..1 is flame size, angle 0 = pointing down, 1 = pointing back, deploy 0..1 brings them out
    setThrust(power, angle, deploy, time) {
      for (const t of thrusters) {
        t.pivot.scale.setScalar(Math.max(.0001, deploy));
        t.pivot.rotation.z = -angle * Math.PI / 2;
        const f = power * (.82 + .18 * Math.sin(time * 41 + t.seed) * Math.sin(time * 23 + t.seed * 3));
        t.fo.scale.set(1 + power * .3, Math.max(.001, f * 2.6), 1 + power * .3);
        t.fc.scale.set(.45, Math.max(.001, f * 1.5), .45);
        t.fo.visible = t.fc.visible = power > .01;
      }
      glowLight.intensity = power * 30;
    },
    setWings(t, time) {
      for (const { w, s, nav } of wings) {
        w.scale.z = Math.max(.0001, t) * -s; w.rotation.x = s * (1 - t) * .4; w.visible = t > .01;
        nav.visible = t > .6 && (Math.sin(time * 6 + s) > -.2);
      }
    },
    setReveal(t) {
      const x = t >= .999 ? 1e5 : -2.7 + 5.4 * t;   // once built, never clip (the car drives far from the origin)
      solidClip.constant = x; wireClip.constant = -x;
      scan.position.x = x; scan.material.opacity = t > .01 && t < .99 ? .55 : 0;
      wire.visible = t < .999;
    },
    setPaint(hex) { paint.color.set(hex); },
    setFinish(f) {
      const F = { gloss: [.55, .22, 1], satin: [.45, .45, .5], matte: [.2, .72, 0] }[f] || [.55, .3, 1];
      paint.metalness = F[0]; paint.roughness = F[1]; paint.clearcoat = F[2];
    },
    setAccent(hex) { caliper.color.set(hex); },
    setRim(hex) { rim.color.set(hex); },
    setLight(hex) { front.color.set(hex).multiplyScalar(3); },
  };
}
