// The VOID car (shape inspired by the McLaren 765LT), modelled in code: the body and canopy are lofted from side-profile curves
// (a rounded superellipse cross-section at every station), the wheel wells are carved out of
// the sides, and a blueprint of grid lines can be swept away by a clipping plane to "build" it.
import * as THREE from "three";

const X0 = -2.3, LEN = 4.6;                 // rear tip to nose, along +x
const WHEELS = [1.42, -1.38];               // front and rear axle x (a 2.8 m wheelbase)
const WR = 0.36, ARCH = 0.44, WELL = 0.62;  // wheel radius, arch radius, how far in the wells are carved

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

// long-tail proportions: a tall, blunt tail, wide rear haunches, a pinched waist where the door
// scoop is, wide front fenders and a low, narrow nose
const BODY = {
  x0: X0, len: LEN, n: 6, tumble: .3,
  top: [[0, .84], [.03, .93], [.12, .96], [.25, .96], [.4, .9], [.55, .84], [.66, .8], [.78, .68], [.9, .54], [.97, .44], [1, .36]],
  bot: [[0, .3], [.04, .2], [.12, .16], [.88, .16], [.96, .2], [1, .28]],
  half: [[0, .86], [.05, .95], [.18, 1.0], [.35, .96], [.5, .91], [.62, .93], [.8, .99], [.93, .93], [1, .62]],
  ends: [.012, .06], fenders: true, scoop: true,
};
// a cab-forward teardrop: the screen starts far forward, the roof peaks over the doors and the
// glass runs back in a long taper over the engine
const CANOPY = {
  x0: -1.35, len: 2.35, n: 4, tumble: .42,
  top: [[0, .92], [.12, 1.0], [.3, 1.12], [.5, 1.19], [.65, 1.17], [.8, 1.06], [.92, .92], [1, .8]],
  bot: [[0, .72], [1, .72]],
  half: [[0, .42], [.2, .6], [.5, .72], [.75, .72], [.92, .64], [1, .5]],
  ends: [.15, .06], fenders: false,
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
      if (spec.fenders && sy > 0) for (const xw of WHEELS) y += (xw > 0 ? .2 : .14) * Math.exp(-(((x - xw) / .55) ** 2)) * Math.abs(cz) ** 3;
      z *= e; y = c + y * e;
      if (spec.scoop && Math.abs(cz) > .3) {          // the big intake carved into each door, deepest at its front
        const xr = (x + .35) / .62, yr = (y - .6) / .17;
        if (Math.abs(xr) < 1 && Math.abs(yr) < 1) z *= 1 - .17 * (1 - xr * xr) * Math.sqrt(1 - yr * yr) * (1.15 - .3 * xr);
      }
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

  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0d0d10, metalness: .35, roughness: .38, clearcoat: .6, clearcoatRoughness: .2, envMapIntensity: .9, clippingPlanes: clip });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: .1, roughness: .03, clearcoat: 1, envMapIntensity: 1.0, transparent: true, opacity: .6, depthWrite: false, clippingPlanes: clip });  // tinted, so you can see the cabin
  const carbon = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: .4, roughness: .55, clippingPlanes: clip });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: .9, clippingPlanes: clip });
  const rim = new THREE.MeshStandardMaterial({ color: 0x121215, metalness: .9, roughness: .28, clippingPlanes: clip });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xc1121f, metalness: .3, roughness: .4, clippingPlanes: clip });
  const front = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8fbff).multiplyScalar(3), toneMapped: false, clippingPlanes: clip });
  const rear = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a3a).multiplyScalar(2.6), toneMapped: false, clippingPlanes: clip });
  const trim = new THREE.MeshPhysicalMaterial({ color: 0xc1121f, metalness: .4, roughness: .3, clearcoat: 1, clippingPlanes: clip });   // the red accents
  const lineMat = new THREE.LineBasicMaterial({ color: 0xeef0f5, transparent: true, opacity: .75, clippingPlanes: [wireClip] });

  const bodyHi = loft(BODY, 220, 96), canHi = loft(CANOPY, 90, 64);
  solid.add(new THREE.Mesh(surface(bodyHi), paint), new THREE.Mesh(surface(canHi), glass));
  wire.add(new THREE.LineSegments(gridLines(loft(BODY, 110, 48), 5, 4), lineMat), new THREE.LineSegments(gridLines(loft(CANOPY, 40, 32), 5, 4), lineMat));

  const add = (geo, mat, x, y, z, parent = solid) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // details: eye-socket headlights, hood vents, splitter, side blades and sills, flying
  // buttresses, engine louvers, a full-width wing, a mesh tail with four high exhausts, a diffuser
  const beam = (a, b, w, h, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, a.distanceTo(b), h), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); solid.add(m); return m; };
  for (const s of [-1, 1]) {
    const sock = add(new THREE.SphereGeometry(.2, 28, 14), carbon, 1.97, .52, s * .62);
    sock.scale.set(.7, .42, 1.15); sock.rotation.y = s * .55; sock.rotation.x = s * .25;
    const led = add(new THREE.BoxGeometry(.03, .022, .3), front, 2.04, .56, s * .64); led.rotation.y = s * .6; led.rotation.x = s * -.35;
    add(new THREE.BoxGeometry(.03, .02, .12), front, 2.07, .49, s * .5).rotation.y = s * .25;
    const vent = add(new THREE.BoxGeometry(.36, .012, .24), carbon, 1.5, .64, s * .3); vent.rotation.z = -.43;
    const blade = add(new THREE.BoxGeometry(.62, .07, .02), carbon, .88, .4, s * .975); blade.rotation.z = .22;
    add(new THREE.BoxGeometry(2.05, .07, .03), carbon, -.05, .21, s * .955);
    add(new THREE.BoxGeometry(2.05, .012, .034), trim, -.05, .248, s * .956);                // red pinstripe on the sill
    beam(new THREE.Vector3(-.45, 1.1, s * .6), new THREE.Vector3(-2.05, .95, s * .86), .07, .11, paint);
    const tl = add(new THREE.BoxGeometry(.03, .03, .56), rear, -2.29, .82, s * .52); tl.rotation.x = s * .05;
    add(new THREE.BoxGeometry(.03, .2, .03), rear, -2.28, .72, s * .8);
  }
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(.06, .015, .92), carbon, -1.42 - k * .11, .975, 0);
  add(new THREE.BoxGeometry(.3, .03, 1.62), carbon, 2.06, .175, 0);
  add(new THREE.BoxGeometry(.02, .032, 1.62), trim, 2.2, .175, 0);                           // red splitter lip
  const wing = add(new THREE.BoxGeometry(.38, .03, 1.94), carbon, -2.12, 1.02, 0); wing.rotation.z = .12;
  for (const z of [-.97, .97]) add(new THREE.BoxGeometry(.42, .16, .02), trim, -2.1, .98, z);
  add(new THREE.BoxGeometry(.04, .32, 1.5), carbon, -2.3, .58, 0);
  for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(.6, .2, .025), carbon, -2.06, .25, k * .2).rotation.z = -.42;
  const ti = new THREE.MeshStandardMaterial({ color: 0x6d7079, metalness: 1, roughness: .3, side: THREE.DoubleSide, clippingPlanes: clip });
  const pipe = new THREE.CylinderGeometry(.05, .05, .22, 24, 1, true).rotateZ(Math.PI / 2), soot = new THREE.CircleGeometry(.045, 20).rotateY(-Math.PI / 2);
  for (const y of [.6, .72]) for (const z of [-.065, .065]) { add(pipe, ti, -2.28, y, z); add(soot, rubber, -2.37, y, z); }
  add(new THREE.BoxGeometry(3.6, .03, 1.7), carbon, -.1, .16, 0); // flat floor

  // wheels: a rounded tyre, a deep-dish rim with twin spokes and a centre lock, a brake disc
  // (all spinning) and a fixed caliper
  const wheels = [];
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const tyreG = new THREE.LatheGeometry([V2(.265, -.15), V2(.32, -.156), V2(.35, -.145), V2(.362, -.115), V2(WR + .004, 0), V2(.362, .115), V2(.35, .145), V2(.32, .156), V2(.265, .15)], 72).rotateX(Math.PI / 2);
  const barrelG = new THREE.LatheGeometry([V2(.262, .15), V2(.27, .13), V2(.268, -.13), V2(.24, -.14)], 64).rotateX(Math.PI / 2);
  const lipG = new THREE.TorusGeometry(.266, .009, 8, 64);
  const discG = new THREE.CylinderGeometry(.2, .2, .03, 48).rotateX(Math.PI / 2), hatG = new THREE.CylinderGeometry(.09, .09, .06, 32).rotateX(Math.PI / 2);
  const nutG = new THREE.CylinderGeometry(.045, .045, .05, 6).rotateX(Math.PI / 2);
  const spokeG = new THREE.BoxGeometry(.026, .2, .028).translate(0, .155, 0);
  const disc = new THREE.MeshStandardMaterial({ color: 0x5a5c62, metalness: .8, roughness: .45, clippingPlanes: clip });
  const wireWheel = new THREE.EdgesGeometry(new THREE.CylinderGeometry(WR, WR, .3, 28).rotateX(Math.PI / 2), 20);
  for (const xw of WHEELS) for (const s of [-1, 1]) {
    const spin = new THREE.Group(); spin.position.set(xw, WR, s * .83); solid.add(spin);
    spin.add(new THREE.Mesh(tyreG, rubber), new THREE.Mesh(barrelG, carbon));
    const lip = new THREE.Mesh(lipG, rim); lip.position.z = s * .14; spin.add(lip);
    const d = new THREE.Mesh(discG, disc); d.position.z = -s * .04; spin.add(d);
    const hat = new THREE.Mesh(hatG, rim); hat.position.z = s * .04; spin.add(hat);
    const nut = new THREE.Mesh(nutG, caliper); nut.position.z = s * .12; spin.add(nut);
    for (let k = 0; k < 5; k++) for (const off of [-.11, .11]) {            // five twin spokes, dished in toward the hub
      const sp = new THREE.Mesh(spokeG, rim); sp.position.z = s * .1;
      sp.rotation.z = k / 5 * Math.PI * 2 + off; sp.rotation.x = s * .12; spin.add(sp);
    }
    const cal = add(new THREE.BoxGeometry(.24, .13, .08), caliper, xw - .16, WR + .13, s * .7); cal.rotation.z = .65;
    const wl = new THREE.LineSegments(wireWheel, lineMat); wl.position.set(xw, WR, s * .83); wire.add(wl);
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
      const F = { gloss: [.35, .38, .6], satin: [.3, .55, .3], matte: [.15, .78, 0] }[f] || [.35, .38, .6];
      paint.metalness = F[0]; paint.roughness = F[1]; paint.clearcoat = F[2];
    },
    setAccent(hex) { caliper.color.set(hex); },
    setTrim(hex) { trim.color.set(hex); },
    setRim(hex) { rim.color.set(hex); },
    setLight(hex) { front.color.set(hex).multiplyScalar(3); },
  };
}
