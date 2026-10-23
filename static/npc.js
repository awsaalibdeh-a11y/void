// Life in the streets: NPC cars that follow the real road lines, and people walking the sidewalks
// and the corniche. Cars are mostly white and silver SUVs, sedans and pickups; men in white thobes
// with red-and-white shemaghs, women in black abayas. Nobody gets hurt: people step aside when the
// player comes close, and cars brake when something is in front of them.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CAR_COLS = [0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xc8ccd2, 0xc8ccd2, 0x1b1c20, 0x8a8f96, 0x6b1a1a, 0x24364f, 0xd8cfb8];

function carGeometry() {
  const parts = [
    new THREE.BoxGeometry(4.4, .7, 1.85).translate(0, .62, 0),          // body
    new THREE.BoxGeometry(2.6, .6, 1.7).translate(-.25, 1.25, 0),       // cabin
  ];
  for (const x of [1.35, -1.35]) for (const z of [.85, -.85]) parts.push(new THREE.CylinderGeometry(.36, .36, .26, 12).rotateX(Math.PI / 2).translate(x, .36, z));
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}
function personGeometry(abaya) {
  const parts = [
    new THREE.CylinderGeometry(abaya ? .24 : .2, abaya ? .3 : .26, 1.45, 10).translate(0, .73, 0),   // thobe / abaya
    new THREE.SphereGeometry(.13, 10, 8).translate(0, 1.6, 0),                                       // head
  ];
  if (!abaya) parts.push(new THREE.ConeGeometry(.19, .32, 10).translate(0, 1.66, 0));               // shemagh
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}

export function createLife(scene, roads, walkways, COARSE) {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // road polylines into segments with lengths, for following
  const lanes = roads.filter(r => r.p.length > 1 && r.w >= 6).map(r => {
    const pts = r.p.map(([x, z]) => new THREE.Vector2(x, z)), len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, len, total: len[len.length - 1], w: r.w };
  }).filter(l => l.total > 40);
  const at = (lane, d, out) => {
    d = Math.max(0, Math.min(lane.total, d));
    let i = 1; while (i < lane.len.length - 1 && lane.len[i] < d) i++;
    const t = (d - lane.len[i - 1]) / Math.max(1e-6, lane.len[i] - lane.len[i - 1]);
    out.x = lane.pts[i - 1].x + (lane.pts[i].x - lane.pts[i - 1].x) * t; out.z = lane.pts[i - 1].y + (lane.pts[i].y - lane.pts[i - 1].y) * t;
    out.dx = lane.pts[i].x - lane.pts[i - 1].x; out.dz = lane.pts[i].y - lane.pts[i - 1].y;
    return out;
  };

  // cars
  const NC = lanes.length ? (COARSE ? 40 : 80) : 0;
  const carMat = new THREE.MeshStandardMaterial({ roughness: .35, metalness: .5 });
  const cars = new THREE.InstancedMesh(carGeometry(), carMat, Math.max(1, NC));
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(2.62, .4, 1.72).translate(-.25, 1.3, 0), new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: .1, metalness: .6 }), Math.max(1, NC));
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .14, 1.5).translate(2.21, .72, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(2), toneMapped: false }), Math.max(1, NC));
  const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .12, 1.5).translate(-2.21, .78, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(1.8), toneMapped: false }), Math.max(1, NC));
  const npcCars = [];
  const col = new THREE.Color();
  for (let i = 0; i < NC; i++) {
    const lane = lanes[Math.floor(rnd() * lanes.length)];
    npcCars.push({ lane, d: rnd() * lane.total, dir: rnd() < .5 ? 1 : -1, v: 9 + rnd() * 7, want: 9 + rnd() * 7, x: 0, z: 0, yaw: 0, bump: 0 });
    cars.setColorAt(i, col.setHex(CAR_COLS[Math.floor(rnd() * CAR_COLS.length)]));
  }
  if (NC) { cars.instanceColor.needsUpdate = true; scene.add(cars, glass, heads, tails); }

  // people
  const paths = walkways.filter(w => w.length > 1).map(p => {
    const pts = p.map(([x, z]) => new THREE.Vector2(x, z)), len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, len, total: len[len.length - 1] };
  }).filter(l => l.total > 20);
  const NP = paths.length ? (COARSE ? 70 : 140) : 0;
  const men = new THREE.InstancedMesh(personGeometry(false), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: .8 }), Math.max(1, NP));
  const women = new THREE.InstancedMesh(personGeometry(true), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: .9 }), Math.max(1, NP));
  const shemagh = new THREE.InstancedMesh(new THREE.ConeGeometry(.2, .34, 10).translate(0, 1.66, 0), new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: .8 }), Math.max(1, NP));
  const people = [];
  for (let i = 0; i < NP; i++) {
    const path = paths[Math.floor(rnd() * paths.length)];
    people.push({ path, d: rnd() * path.total, dir: rnd() < .5 ? 1 : -1, v: .9 + rnd() * .7, side: (rnd() - .5) * 2, woman: rnd() < .4, x: 0, z: 0, push: new THREE.Vector2(), phase: rnd() * 6 });
  }
  if (NP) scene.add(men, women, shemagh);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), tmp = {};
  return {
    cars: npcCars,
    update(dt, time, player) {
      // cars: follow the lane, brake for the player or a car just ahead, turn round at the end
      for (let i = 0; i < npcCars.length; i++) {
        const c = npcCars[i];
        let want = c.want;
        if (player) { const dx = player.x - c.x, dz = player.z - c.z, ahead = (dx * Math.cos(c.yaw) + dz * Math.sin(c.yaw)); if (ahead > 0 && ahead < 18 && Math.abs(-dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw)) < 3 && player.y < 3) want = 0; }
        c.v += Math.max(-8 * dt, Math.min(3 * dt, want - c.v));
        c.d += c.v * c.dir * dt;
        if (c.d < 0 || c.d > c.lane.total) { c.dir *= -1; c.d = Math.max(0, Math.min(c.lane.total, c.d)); }
        at(c.lane, c.d, tmp);
        const yaw = Math.atan2(tmp.dz * c.dir, tmp.dx * c.dir), nx = -Math.sin(yaw), nz = Math.cos(yaw), off = Math.min(c.lane.w / 4, 3);
        c.x = tmp.x + nx * off; c.z = tmp.z + nz * off;     // keep to the right of the line
        let dy = yaw - c.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; c.yaw += dy * Math.min(1, dt * 6);
        if (c.bump > 0) c.bump -= dt;
        q.setFromAxisAngle(Y, -c.yaw); m4.compose(pos.set(c.x, 0, c.z), q, one);
        cars.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); tails.setMatrixAt(i, m4);
      }
      if (NC) for (const im of [cars, glass, heads, tails]) im.instanceMatrix.needsUpdate = true;
      // people: walk along, step aside from the player, a little bob as they walk
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        p.d += p.v * p.dir * dt;
        if (p.d < 0 || p.d > p.path.total) { p.dir *= -1; p.d = Math.max(0, Math.min(p.path.total, p.d)); }
        at(p.path, p.d, tmp);
        const yaw = Math.atan2(tmp.dz * p.dir, tmp.dx * p.dir), l = Math.hypot(tmp.dx, tmp.dz) || 1;
        let x = tmp.x - tmp.dz / l * p.side, z = tmp.z + tmp.dx / l * p.side;
        if (player && player.y < 3) { const dx = x + p.push.x - player.x, dz = z + p.push.y - player.z, d = Math.hypot(dx, dz); if (d < 6) { p.push.x += dx / d * (6 - d) * dt * 4; p.push.y += dz / d * (6 - d) * dt * 4; } }
        p.push.multiplyScalar(1 - Math.min(1, dt * .4));
        x += p.push.x; z += p.push.y; p.x = x; p.z = z;
        q.setFromAxisAngle(Y, -yaw);
        m4.compose(pos.set(x, Math.abs(Math.sin(time * 6 * p.v + p.phase)) * .05, z), q, one);
        const hide = new THREE.Matrix4().compose(pos, q, zero);
        men.setMatrixAt(i, p.woman ? hide : m4); shemagh.setMatrixAt(i, p.woman ? hide : m4); women.setMatrixAt(i, p.woman ? m4 : hide);
      }
      if (NP) for (const im of [men, women, shemagh]) im.instanceMatrix.needsUpdate = true;
    },
  };
}
