// The VOID's front seat: dashboard, steering wheel, a driver's cluster and a center screen.
// The center screen is two layers: a live dashcam feed (a second camera on the nose, rendered to
// a texture) and a HUD canvas on top (landing-zone scan within 5 km, speed, altitude).
import * as THREE from "three";

export const HEAD = new THREE.Vector3(-.2, 1.0, -.3);          // driver's eyes, car-local (left-hand drive)

export function addInterior(car, renderer) {
  const g = car.group, clip = car.clip;
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 1, metalness: 0, envMapIntensity: .15, clippingPlanes: clip });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: .45, metalness: .5, clippingPlanes: clip });
  const stitch = new THREE.MeshBasicMaterial({ color: 0x8a8a92, clippingPlanes: clip });
  const parts = new THREE.Group(); g.add(parts);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parts.add(m); return m; };
  const beam = (a, b, r, mat) => { const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(r, len, r * 1.6), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parts.add(m); return m; };

  // Everything is laid out from the driver's eyes (HEAD) forward, with clear space between parts:
  // dash top at y .79, the cluster in a hooded binnacle above it, the wheel in front of the driver,
  // the screen standing on the dash in the middle, the pillars and roof bar inside the glass.
  const prof = new THREE.Shape([[.5, .64], [.55, .75], [.66, .79], [.82, .78], [.93, .72], [.93, .6], [.5, .6]].map(([x, y]) => new THREE.Vector2(x, y)));
  const dash = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 1.1, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2, curveSegments: 6 }), trim);
  dash.position.z = -.55; parts.add(dash);
  add(new THREE.BoxGeometry(.34, .003, 1.06), stitch, .73, .797, 0);                   // a stitch line along the top
  add(new THREE.BoxGeometry(.46, .12, .22), carbon, .2, .56, 0);                       // center console
  add(new THREE.BoxGeometry(2.0, .02, 1.3), trim, .0, .44, 0);                         // floor
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.4, .26, .02), trim, .05, .64, s * .66);                // door panels
    beam(new THREE.Vector3(.9, .8, s * .4), new THREE.Vector3(.28, 1.08, s * .47), .035, carbon); // A-pillars
  }
  add(new THREE.BoxGeometry(.05, .03, .86), carbon, .26, 1.08, 0);                     // roof bar
  const seatB = add(new THREE.BoxGeometry(.1, .5, .42), trim, -.4, .74, .3); seatB.rotation.z = .22;     // passenger seat
  add(new THREE.BoxGeometry(.46, .09, .42), trim, -.16, .52, .3);

  // steering wheel: in front of the driver, below the line of sight to the cluster
  const wheel = new THREE.Group(); wheel.position.set(.3, .79, HEAD.z); wheel.rotation.z = -.35; parts.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 12, 40), trim); rim.rotation.y = Math.PI / 2; wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .035, 24).rotateZ(Math.PI / 2), carbon); wheel.add(hub);
  for (const a of [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(.012, .085, .022), carbon); sp.position.set(0, Math.sin(a) * .085, Math.cos(a) * .085); sp.rotation.x = -a + Math.PI / 2; wheel.add(sp);
  }
  const mark = new THREE.Mesh(new THREE.BoxGeometry(.012, .028, .018), new THREE.MeshBasicMaterial({ color: 0xc1121f, clippingPlanes: clip })); mark.position.set(0, .13, 0); wheel.add(mark);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(.03, .035, .24, 16).rotateZ(Math.PI / 2 - .35), carbon); column.position.set(.42, .74, HEAD.z); parts.add(column);

  // the driver's cluster, in a little hood on top of the dash
  const clusterC = document.createElement("canvas"); clusterC.width = 512; clusterC.height = 192;
  const clusterT = new THREE.CanvasTexture(clusterC); clusterT.colorSpace = THREE.SRGBColorSpace;
  const cluster = add(new THREE.PlaneGeometry(.2, .075), new THREE.MeshBasicMaterial({ map: clusterT, toneMapped: false, clippingPlanes: clip }), .6, .84, HEAD.z);
  cluster.lookAt(HEAD);
  const hood = add(new THREE.BoxGeometry(.12, .012, .24), carbon, .63, .885, HEAD.z); hood.rotation.z = -.12;

  // the center screen, standing on the dash between the seats
  const SCR_W = .32, SCR_H = .18;
  const screen = new THREE.Group(); screen.position.set(.64, .9, .06); parts.add(screen);
  screen.lookAt(HEAD.clone().setZ(-.1));
  const rt = new THREE.WebGLRenderTarget(640, 360, { colorSpace: THREE.SRGBColorSpace });
  const feed = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false, clippingPlanes: clip }));
  screen.add(feed);
  const hudC = document.createElement("canvas"); hudC.width = 1280; hudC.height = 720;
  const hudT = new THREE.CanvasTexture(hudC); hudT.colorSpace = THREE.SRGBColorSpace; hudT.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const hud = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ map: hudT, transparent: true, toneMapped: false, clippingPlanes: clip }));
  hud.position.z = .002; screen.add(hud);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + .02, SCR_H + .02, .012), carbon); bezel.position.z = -.008; screen.add(bezel);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .02), carbon); stem.position.set(0, -SCR_H / 2 - .015, -.012); screen.add(stem);

  const feedCam = new THREE.PerspectiveCamera(62, 16 / 9, .1, 3000);
  feedCam.position.set(2.15, .58, 0); feedCam.rotation.y = -Math.PI / 2; g.add(feedCam);

  return {
    parts, screen, SCR_W, SCR_H, feedCam, rt, wheel,
    // where the camera must sit for the screen to fill a view of this aspect and vertical fov
    screenView(aspect, fovDeg) {
      const t = Math.tan(fovDeg * Math.PI / 360), d = Math.max(SCR_H / 2 / t, SCR_W / 2 / (t * aspect)) * 1.02;
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
      const c = screen.getWorldPosition(new THREE.Vector3());
      return { pos: c.clone().addScaledVector(n, d), look: c, up: new THREE.Vector3(0, 1, 0).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion())) };
    },
    renderFeed(scene) {
      renderer.setRenderTarget(rt); renderer.render(scene, feedCam); renderer.setRenderTarget(null);
    },
    drawCluster(s) {
      const x = clusterC.getContext("2d"), W = 512, H = 192;
      x.fillStyle = "#050507"; x.fillRect(0, 0, W, H);
      x.fillStyle = "#fff"; x.font = "800 92px Unbounded, Inter, sans-serif"; x.textAlign = "center"; x.fillText(Math.round(s.speed), W / 2, 112);
      x.fillStyle = "#8c8c96"; x.font = "600 20px Inter, sans-serif"; x.fillText("KM/H", W / 2, 142);
      x.textAlign = "left"; x.fillStyle = "#fff"; x.font = "800 44px Unbounded, Inter, sans-serif"; x.fillText(s.gear, 28, 112);
      x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(28, 166, W - 56, 8);
      x.fillStyle = s.rpm > 7200 ? "#ff3344" : "#fff"; x.fillRect(28, 166, (W - 56) * Math.min(1, s.rpm / 8200), 8);
      clusterT.needsUpdate = true;
    },
    drawHud(s) {
      const x = hudC.getContext("2d"), W = 1280, H = 720;
      x.clearRect(0, 0, W, H);
      const grad = x.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, "rgba(0,0,0,.45)"); grad.addColorStop(.35, "rgba(0,0,0,0)"); grad.addColorStop(.7, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,.6)");
      x.fillStyle = grad; x.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 4) { x.fillStyle = "rgba(255,255,255,.025)"; x.fillRect(0, y, W, 1); }
      x.font = "700 26px Inter, sans-serif"; x.textAlign = "left"; x.fillStyle = "#ff3344";
      if (Math.floor(s.time * 2) % 2) { x.beginPath(); x.arc(46, 46, 9, 0, 7); x.fill(); }
      x.fillText("REC", 66, 55); x.fillStyle = "#e6e6ea"; x.fillText("DASHCAM · FRONT", 150, 55);
      x.textAlign = "right"; x.fillText(new Date().toLocaleTimeString([], { hour12: false }), W - 36, 55);

      // radar (heading up)
      const cx = 200, cy = 330, R = 150;
      x.fillStyle = "rgba(0,0,0,.55)"; x.beginPath(); x.arc(cx, cy, R + 10, 0, 7); x.fill();
      x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 2;
      for (let r = 1; r <= 5; r++) { x.beginPath(); x.arc(cx, cy, R * r / 5, 0, 7); x.stroke(); }
      const sw = s.time * 1.8;
      x.fillStyle = "rgba(61,255,138,.18)"; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, sw - .5 - Math.PI / 2, sw - Math.PI / 2); x.closePath(); x.fill();
      x.fillStyle = "rgba(255,255,255,.55)"; x.font = "600 18px Inter, sans-serif"; x.textAlign = "left"; x.fillText("5 km", cx + 6, cy - R + 20);
      for (const z of s.zones) {
        const inR = z.dist <= 5, k = inR ? 1 : 5 / z.dist, px = cx + z.side * k * R / 5, py = cy - z.fwd * k * R / 5;
        x.fillStyle = !inR ? "rgba(255,255,255,.35)" : z.safe ? "#3dff8a" : "#ff4455"; x.beginPath(); x.arc(px, py, inR ? 9 : 5, 0, 7); x.fill();
        if (inR) { x.fillStyle = "#fff"; x.font = "700 18px Inter, sans-serif"; x.fillText(z.id[0], px + 12, py + 6); }
      }
      x.fillStyle = "#fff"; x.beginPath(); x.moveTo(cx, cy - 14); x.lineTo(cx - 10, cy + 10); x.lineTo(cx + 10, cy + 10); x.closePath(); x.fill();
      x.fillStyle = "#8c8c96"; x.font = "700 18px Inter, sans-serif"; x.textAlign = "center"; x.fillText("SAFE LANDING SCAN · 5 KM", cx, cy + R + 44);

      // landing zone list
      const lx = 820, ly = 110; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(lx, ly, 424, 360);
      x.textAlign = "left"; x.fillStyle = "#8c8c96"; x.font = "700 18px Inter, sans-serif"; x.fillText("LANDING ZONES", lx + 22, ly + 38);
      s.zones.slice(0, 5).forEach((z, i) => {
        const y = ly + 84 + i * 56, far = z.dist > 5;
        x.globalAlpha = far ? .45 : 1;
        x.fillStyle = "#fff"; x.font = "800 24px Unbounded, Inter, sans-serif"; x.fillText("LZ " + z.id, lx + 22, y);
        x.font = "500 17px Inter, sans-serif"; x.fillStyle = "#a9a9b2"; x.fillText(z.dist.toFixed(1) + " km · " + z.note, lx + 22, y + 24);
        x.textAlign = "right"; x.font = "800 18px Inter, sans-serif"; x.fillStyle = far ? "#8c8c96" : z.safe ? "#3dff8a" : "#ff4455";
        x.fillText(far ? "OUT OF RANGE" : z.safe ? "SAFE" : "UNSAFE", lx + 402, y); x.textAlign = "left"; x.globalAlpha = 1;
      });
      const best = s.zones.find(z => z.safe && z.dist <= 5);
      x.fillStyle = best ? "#3dff8a" : "#ffb347"; x.font = "700 19px Inter, sans-serif";
      x.fillText(best ? `BEST: LZ ${best.id} · ${best.dist.toFixed(1)} KM · ${Math.round(best.dist * 1000 / Math.max(1, s.speed / 3.6))} S` : "NO SAFE ZONE IN RANGE", lx + 22, ly + 346);

      // bottom strip
      const cells = [["SPEED", Math.round(s.speed), "km/h"], ["ALTITUDE", Math.round(s.alt), "m"], ["VERTICAL", (s.vs >= 0 ? "+" : "") + s.vs.toFixed(1), "m/s"], ["MODE", s.mode, ""]];
      const cw = (W - 72 - 3 * 14) / 4;
      cells.forEach(([k, v, u], i) => {
        const bx = 36 + i * (cw + 14), by = H - 150;
        x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(bx, by, cw, 118);
        x.fillStyle = "#8c8c96"; x.font = "700 16px Inter, sans-serif"; x.fillText(k, bx + 18, by + 32);
        x.fillStyle = "#fff"; x.font = "800 40px Unbounded, Inter, sans-serif"; x.fillText(v, bx + 18, by + 84);
        const tw = x.measureText(String(v)).width; x.fillStyle = "#8c8c96"; x.font = "600 18px Inter, sans-serif"; x.fillText(u, bx + 26 + tw, by + 84);
      });
      hudT.needsUpdate = true;
    },
  };
}
