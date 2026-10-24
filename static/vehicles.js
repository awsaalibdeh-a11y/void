// More things to drive: a propeller sport plane (takes off from the runway across the Hudson), a helicopter
// (lifts off anywhere) and a speedboat (the rivers and the park lake). Each has its own model and physics;
// the game hands them the same inputs as the car (steer, gas, brake, up, down, boost).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t, G = 9.81;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const RUNWAY = { x0: -2620, x1: -1900, z: 0, w: 30 };

function planeModel() {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: .3, roughness: .3, clearcoat: 1 }), red = new THREE.MeshPhysicalMaterial({ color: 0xc1121f, metalness: .3, roughness: .3, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .5, metalness: .5 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1018, metalness: .2, roughness: .05, transparent: true, opacity: .7, clearcoat: 1 });
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const body = new THREE.Mesh(new THREE.LatheGeometry([V2(0, -4.6), V2(.35, -4.3), V2(.55, -3), V2(.62, -1), V2(.64, 1), V2(.56, 2.6), V2(.42, 3.3), V2(.16, 3.7), V2(0, 3.75)], 24).rotateZ(-Math.PI / 2), white);
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(.645, .645, 6.2, 24, 1, true).rotateZ(Math.PI / 2), red); stripe.scale.set(1, 1, 1); stripe.position.x = -.4; stripe.scale.y = 1; g.add(stripe);
  const wingShape = new THREE.Shape([V2(1.2, 0), V2(-.6, 0), V2(-.3, 5.6), V2(.5, 5.6)]);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: .14, bevelEnabled: true, bevelSize: .05, bevelThickness: .04, bevelSegments: 2 }).rotateX(-Math.PI / 2), s > 0 ? white : white);
    w.position.set(0, -.15, 0); w.scale.z = -s; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(.9, .08, .1), red); tip.position.set(.1, -.1, s * 5.6); g.add(tip);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(s > 0 ? 0x22ff66 : 0xff2233).multiplyScalar(3), toneMapped: false })); nav.position.set(.1, -.1, s * 5.68); g.add(nav);
    const ht = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([V2(.6, 0), V2(-.3, 0), V2(-.2, 2), V2(.3, 2)]), { depth: .08, bevelEnabled: false }).rotateX(-Math.PI / 2), white);
    ht.position.set(-4.2, .1, 0); ht.scale.z = -s; g.add(ht);
  }
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([V2(.4, 0), V2(-.9, 0), V2(-.5, 1.7), V2(-.05, 1.7)]), { depth: .08, bevelEnabled: false }).translate(0, 0, -.04), red);
  fin.position.set(-3.7, .3, 0); g.add(fin);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); canopy.scale.set(2.2, .9, .85); canopy.position.set(.6, .45, 0); g.add(canopy);
  const prop = new THREE.Group(); prop.position.x = 3.8; g.add(prop);
  prop.add(new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 16).rotateZ(-Math.PI / 2), red));
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.7, .16), dark); b.position.y = 0; b.rotation.x = k / 3 * Math.PI * 2; b.geometry.translate(0, .85, 0); prop.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 32).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false })); prop.add(disc);
  for (const [x, z] of [[1.6, 0], [-.4, 1.3], [-.4, -1.3]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .9, 6), dark); leg.position.set(x, -.85, z); g.add(leg); const wh = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .16, 14).rotateX(Math.PI / 2), dark); wh.position.set(x, -1.3, z); g.add(wh); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.y = 0; const root = new THREE.Group(); g.position.y = 1.54; root.add(g);
  return { root, update(st, time, dt) { prop.rotation.x += (8 + st.thr * 60) * dt; disc.material.opacity = st.thr * .25; } };
}
function heliModel() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0d0d10, metalness: .4, roughness: .35, clearcoat: .8 }), red = new THREE.MeshPhysicalMaterial({ color: 0xc1121f, metalness: .3, roughness: .3, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: .6, roughness: .4 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1420, roughness: .05, transparent: true, opacity: .65, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), paint); body.scale.set(1.7, 1, 1); body.position.y = 1.6; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); nose.rotation.z = -Math.PI / 2; nose.scale.set(.9, 1.3, 1.05); nose.position.set(1.3, 1.8, 0); g.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.18, .38, 5.4, 12).rotateZ(Math.PI / 2), paint); tail.position.set(-4.4, 2.1, 0); g.add(tail);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, .25, 3.05), red); stripe.position.set(-.3, 1.45, 0); g.add(stripe);
  const finV = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, .1), red); finV.position.set(-7, 2.6, 0); finV.rotation.z = -.3; g.add(finV);
  for (const z of [-1.15, 1.15]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.8, 8).rotateZ(Math.PI / 2), dark); sk.position.set(0, .1, z); g.add(sk); for (const x of [-.8, .9]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .9, 6), dark); st.position.set(x, .55, z * .85); st.rotation.x = z > 0 ? -.3 : .3; g.add(st); } }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .5, 10), dark); mast.position.y = 3; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 3.25; g.add(rotor);
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, .05, .32).translate(2.8, 0, 0), dark); b.rotation.y = k * Math.PI / 2; rotor.add(b); }
  const blur = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); rotor.add(blur);
  const tr = new THREE.Group(); tr.position.set(-7.1, 2.3, .2); g.add(tr);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, .12), dark); b.rotation.z = k * Math.PI / 2; tr.add(b); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(3), toneMapped: false })); beacon.position.set(-1, 2.6, 0); g.add(beacon);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const root = new THREE.Group(); root.add(g);
  return { root, update(st, time, dt) { const spin = 6 + st.thr * 34; rotor.rotation.y += spin * dt; tr.rotation.x += spin * 1.6 * dt; blur.material.opacity = clamp(st.thr) * .22; beacon.visible = Math.sin(time * 5) > 0; } };
}
function boatModel() {
  const g = new THREE.Group(), L = 7.2, W = 2.5;
  const hullM = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, metalness: .1, roughness: .25, clearcoat: 1 }), red = new THREE.MeshPhysicalMaterial({ color: 0xc1121f, roughness: .3, clearcoat: 1 });
  const deckM = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: .7 }), dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .5, metalness: .4 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1018, roughness: .05, transparent: true, opacity: .55 });
  // the hull: a side profile extruded across, then pinched to a point at the bow and given a V underneath
  const prof = new THREE.Shape([new THREE.Vector2(-L / 2, .25), new THREE.Vector2(L / 2 - 1.6, -.2), new THREE.Vector2(L / 2, .55), new THREE.Vector2(L / 2 - .2, 1.05), new THREE.Vector2(-L / 2, 1.05)]);
  const hg = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 3, curveSegments: 6, steps: 1 }).translate(0, 0, -W / 2);
  const ps = hg.attributes.position;
  for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), u = clamp((x + L / 2) / L); const pinch = u > .55 ? 1 - Math.pow((u - .55) / .45, 1.6) * .96 : 1; const v = y < .5 ? .6 + .4 * clamp((y + .2) / .7) : 1; ps.setZ(i, z * pinch * v); }
  hg.computeVertexNormals();
  const hull = new THREE.Mesh(hg, hullM); g.add(hull);
  const band = new THREE.Mesh(hg.clone(), red); band.scale.set(1.002, .12, 1.01); band.position.y = .72; g.add(band);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L * .62, .06, W * .82), deckM); deck.position.set(-.6, 1.08, 0); g.add(deck);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(.06, .55, W * .8), glass); ws.position.set(.6, 1.38, 0); ws.rotation.z = -.5; g.add(ws);
  for (const z of [-.5, .5]) { const seat = new THREE.Mesh(new THREE.BoxGeometry(.7, .45, .6), red); seat.position.set(-.6, 1.3, z); g.add(seat); }
  const motor = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .55), dark); motor.position.set(-L / 2 - .2, .9, 0); g.add(motor);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const root = new THREE.Group(); g.position.y = -.55; root.add(g);
  return { root, update() { } };
}

export function createVehicles(scene, api, W) {
  const models = { plane: planeModel(), heli: heliModel(), boat: boatModel() };
  for (const m of Object.values(models)) { m.root.visible = false; scene.add(m.root); }
  const WY = W.city.WATER_Y;
  // the runway: asphalt, edge lights and centre-line dashes
  {
    const r = RUNWAY, L = r.x1 - r.x0;
    const tex = W.canvasTex(512, 64, (g, w, h) => { g.fillStyle = "#2b2c30"; g.fillRect(0, 0, w, h); g.fillStyle = "#e8e8e8"; for (let x = 0; x < w; x += 64) g.fillRect(x, h / 2 - 2, 36, 4); g.fillRect(0, 3, w, 3); g.fillRect(0, h - 6, w, 3); }, [L / 120, 1]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L, r.w).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: .85 }));
    m.position.set((r.x0 + r.x1) / 2, .05, r.z); m.receiveShadow = true; scene.add(m);
    const lights = [], lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(2.2), toneMapped: false });
    for (let x = r.x0; x <= r.x1; x += 30) for (const s of [-1, 1]) lights.push([x, s * (r.w / 2 + 1)]);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.25, 8, 6), lm, lights.length), mm = new THREE.Matrix4();
    lights.forEach(([x, z], k) => im.setMatrixAt(k, mm.makeTranslation(x, .3, z))); scene.add(im);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.canvasTex(512, 128, (g, w, h) => { g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, w, h); g.fillStyle = "#3dfcff"; g.font = "900 56px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText("✈ VOID AIRFIELD", w / 2, 84); }), toneMapped: false }));
    sign.scale.set(24, 6, 1); sign.position.set(r.x0 + 40, 12, r.z + 40); scene.add(sign);
  }

  // ---- physics ----
  function plane(g, I, dt) {
    const V = g.vel.length(), ground = api.groundAt(g.x, g.z, g.y).h, onGround = g.y <= ground + .05;
    g.thr = clamp(g.thr + ((I.gas ? 1 : 0) - (I.brake && !onGround ? 1 : 0)) * dt * .6);
    if (onGround && I.brake) g.thr = Math.max(0, g.thr - dt);
    // smooth inputs: the plane answers like it has mass
    g.sRoll = lerp(g.sRoll || 0, I.turn, clamp(dt * 3)); g.sPitch = lerp(g.sPitch || 0, clamp(I.up - I.down + (I.stickY || 0), -1, 1), clamp(dt * 3));
    const vh = Math.hypot(g.vel.x, g.vel.z), gamma = Math.atan2(g.vel.y, Math.max(1, vh));
    const kL = .0115, INC = .05;
    if (onGround) { g.roll = lerp(g.roll, 0, clamp(dt * 5)); g.yaw += I.turn * clamp(vh / 12) * .55 * dt; g.pitch = lerp(g.pitch, g.sPitch > .2 && vh > 34 ? .14 : 0, clamp(dt * 3)); }
    else {
      g.roll = lerp(g.roll, g.sRoll * 1.05, clamp(dt * 2.4));
      g.yaw += G * Math.tan(g.roll) / Math.max(25, V) * dt;
      const wingK = kL * V * V * 2 * Math.PI * .9 * Math.min(2, 1 / Math.max(.5, Math.cos(g.roll)));
      const needA = wingK > .5 ? clamp(G * Math.cos(gamma) / wingK - INC - g.vel.y * .006, -.25, .24) : 0;
      if (Math.abs(g.sPitch) > .05) g.pitch += g.sPitch * .55 * dt; else g.pitch += (gamma + needA / Math.max(.45, Math.cos(g.roll)) - g.pitch) * clamp(dt * 1.8);
      const cr = Math.max(.45, Math.cos(g.roll)); g.pitch = clamp(g.pitch, gamma - .3 / cr, gamma + .26 / cr);
    }
    const f = new THREE.Vector3(Math.cos(g.yaw) * Math.cos(g.pitch), Math.sin(g.pitch), Math.sin(g.yaw) * Math.cos(g.pitch));
    const s0 = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize(), u0 = new THREE.Vector3().crossVectors(s0, f), bu = u0.clone().applyAxisAngle(f, g.roll);
    const vhat = V > .1 ? g.vel.clone().divideScalar(V) : f.clone();
    const a = new THREE.Vector3(0, -G, 0);
    const alpha = Math.atan2(-g.vel.dot(bu), Math.max(.1, g.vel.dot(f))); let CL = 2 * Math.PI * .9 * (alpha + INC); const stalled = Math.abs(alpha) > .28 && V > 15; if (stalled) CL = Math.sign(alpha) * .5;
    g.stall = lerp(g.stall || 0, stalled ? 1 : 0, clamp(dt * 5));
    const liftDir = bu.clone().addScaledVector(vhat, -bu.dot(vhat)); if (liftDir.lengthSq() > 1e-6) liftDir.normalize();
    a.addScaledVector(liftDir, kL * V * V * CL * Math.min(2, 1 / Math.max(.5, Math.cos(g.roll))));
    a.addScaledVector(vhat, -kL * V * V * (.05 + .06 * CL * CL + (I.brake && !onGround ? .3 : 0)));
    a.addScaledVector(s0, -g.vel.dot(s0) * 2);
    a.addScaledVector(f, g.thr * 7.5 + (I.nitro ? 5 : 0));
    if (onGround) { a.y = Math.max(a.y, 0); if (g.vel.y < 0) g.vel.y = 0; const roll = .02 * G + (I.brake ? 6 : 0); a.addScaledVector(vhat, -Math.min(roll, V / dt)); a.addScaledVector(s0, -g.vel.dot(s0) * 8); }
    g.vel.addScaledVector(a, dt);
    g.x += g.vel.x * dt; g.y += g.vel.y * dt; g.z += g.vel.z * dt;
    if (g.y < ground) {
      const down = -g.vel.y; g.y = ground; g.vel.y = 0;
      if (down > 9 || Math.abs(g.roll) > .5) { api.hurt(down * 5 + Math.abs(g.roll) * 40, "Crashed the plane"); api.impact(g.x, g.z, down * 2); }
      else if (down > 1 && g.airT > 3) api.say(down < 2.5 ? "Smooth landing" : "Firm landing", 2);
      g.airT = 0;
    } else if (g.y > ground + .3) g.airT = (g.airT || 0) + dt;
    g.mode = g.y > ground + .4 ? "air" : "drive";
    const hit = api.hitBox(g.x, g.z, g.y + .5, 2.5); if (hit) { api.hurt(V * 2, "Hit a building"); api.impact(g.x, g.z, V); g.x += hit.nx * hit.d; g.z += hit.nz * hit.d; g.vel.multiplyScalar(.2); }
    if (g.y < WY + .5 && api.isWater(g.x, g.z) && onGround) api.wreck("Ditched in the water");
  }
  function heli(g, I, dt) {
    const ground = api.groundAt(g.x, g.z, g.y).h;
    g.thr = lerp(g.thr || 0, I.up || I.gas || g.y > ground + .5 ? 1 : .35, clamp(dt * 1.5));
    const coll = I.up - I.down;
    g.vel.y += ((coll * 8 + (g.thr > .6 ? 0 : -3)) - g.vel.y) * clamp(dt * 1.6) ;
    if (g.y <= ground + .05 && coll <= 0) g.vel.y = Math.max(0, g.vel.y);
    // tilt to move: forward/back on gas/brake, turn on steer; slides a little like the real thing
    const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw), push = (I.gas ? 1 : 0) - (I.brake ? 1 : 0) + (I.stickY || 0) * 0;
    g.yaw += I.turn * 1.3 * dt * (g.y > ground + .5 ? 1 : .3);
    const top = I.nitro ? 1.6 : 1;
    if (g.y > ground + .5) { g.vel.x += fx * push * 15 * top * dt; g.vel.z += fz * push * 15 * top * dt; }
    const damp = Math.exp(-.55 * dt); g.vel.x *= damp; g.vel.z *= damp;
    const sp = g.vel.x * fx + g.vel.z * fz, side = -g.vel.x * fz + g.vel.z * fx;
    g.pitch = lerp(g.pitch, -clamp(push * .22 + sp * .002, -.3, .3), clamp(dt * 3)); g.roll = lerp(g.roll, clamp(I.turn * .25 + side * .01, -.4, .4), clamp(dt * 3));
    g.x += g.vel.x * dt; g.y += g.vel.y * dt; g.z += g.vel.z * dt;
    if (g.y < ground) { const down = -g.vel.y; g.y = ground; if (down > 8) { api.hurt(down * 4, "Hard landing"); api.impact(g.x, g.z, down * 2); } g.vel.y = 0; g.vel.x *= .8; g.vel.z *= .8; }
    g.mode = g.y > ground + .4 ? "air" : "drive";
    const hit = api.hitBox(g.x, g.z, g.y + 1, 3.5); if (hit) { const imp = Math.hypot(g.vel.x, g.vel.z); if (imp > 6) { api.hurt(imp * 2, "Rotor strike"); api.impact(g.x, g.z, imp); } g.x += hit.nx * hit.d; g.z += hit.nz * hit.d; g.vel.x *= -.3; g.vel.z *= -.3; }
    if (g.y <= WY + .2 && api.isWater(g.x, g.z)) api.wreck("Ditched in the water");
  }
  function boat(g, I, dt) {
    const fx = Math.cos(g.yaw), fz = Math.sin(g.yaw);
    let u = g.vel.x * fx + g.vel.z * fz, w = -g.vel.x * fz + g.vel.z * fx;
    u += ((I.gas ? 13 : 0) + (I.nitro ? 9 : 0) - (I.brake ? (u > 1 ? 10 : 5) : 0)) * dt;
    u -= (u * .18 + Math.sign(u) * u * u * .0055) * dt; u = Math.max(-7, u);
    w *= Math.exp(-2.6 * dt);
    g.yaw += I.turn * (.35 + clamp(Math.abs(u) / 14)) * .8 * Math.sign(u || 1) * dt;
    const nfx = Math.cos(g.yaw), nfz = Math.sin(g.yaw);
    g.vel.set(nfx * u - nfz * w, 0, nfz * u + nfx * w);
    const nx = g.x + g.vel.x * dt, nz = g.z + g.vel.z * dt;
    if (api.isWater(nx, nz)) { g.x = nx; g.z = nz; } else { g.vel.multiplyScalar(-.25); if (Math.abs(u) > 9) { api.hurt(Math.abs(u) * 1.5, "Ran aground"); api.impact(g.x, g.z, Math.abs(u)); } }
    const t = performance.now() / 1000;
    g.y = WY + .02 + Math.sin(t * 1.7 + g.x * .1) * .08;
    g.pitch = lerp(g.pitch, clamp(u * .006, -.05, .12) + Math.sin(t * 1.3 + g.z * .1) * .015, clamp(dt * 3));
    g.roll = lerp(g.roll, -I.turn * clamp(Math.abs(u) / 20) * .18 + Math.sin(t * 1.1) * .02, clamp(dt * 3));
    g.mode = "drive"; g.thr = clamp(Math.abs(u) / 25);
  }
  // where each one starts when you pick it
  function spawn(g, type) {
    g.thr = 0; g.sRoll = g.sPitch = 0; g.pitch = g.roll = 0; g.airT = 0;
    if (type === "plane") { const fly = g.mode === "air" && g.y > 30; if (fly) { g.vel.set(Math.cos(g.yaw) * 55, 0, Math.sin(g.yaw) * 55); g.thr = .7; } else { Object.assign(g, { x: RUNWAY.x0 + 30, z: RUNWAY.z, y: 0, yaw: 0 }); g.vel.set(0, 0, 0); } }
    else if (type === "heli") { g.y += .5; g.vel.multiplyScalar(.3); }
    else if (type === "boat") {
      if (!api.isWater(g.x, g.z)) {
        const R = W.city.rivers, lake = W.city.lake, opts = [[(R.hudson[0] + R.hudson[1]) / 2, g.z], [(R.east[0] + R.east[1]) / 2, Math.abs(g.z) < 40 ? 80 : g.z], [lake.x, lake.z]];
        const [x, z] = opts.sort((a, b) => Math.hypot(a[0] - g.x, a[1] - g.z) - Math.hypot(b[0] - g.x, b[1] - g.z))[0];
        g.x = x; g.z = z; g.yaw = Math.abs(g.z) > 3000 ? 0 : Math.PI / 2;
      }
      g.vel.set(0, 0, 0); g.y = WY;
    }
  }
  return {
    models, spawn,
    step(g, I, dt) { if (g.veh === "plane") plane(g, I, dt); else if (g.veh === "heli") heli(g, I, dt); else if (g.veh === "boat") boat(g, I, dt); },
    show(type, pos, quat, st, time, dt) {
      for (const [k, m] of Object.entries(models)) { m.root.visible = k === type; if (k === type) { m.root.position.copy(pos); m.root.quaternion.copy(quat); m.update(st, time, dt); } }
    },
  };
}
