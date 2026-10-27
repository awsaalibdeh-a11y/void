// Life in the streets of VOID City: thousands of cars, cabs, buses, trucks and police cruisers that drive
// in their lanes, stop at red lights, follow the car in front and turn at the corners, and thousands of
// people walking round the blocks. Ram a car faster than it is going and it breaks apart and flies;
// let something faster hit you and you take the damage. People always leap out of the way.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GRID, phase } from "./city.js";

// vehicle kinds: length, width, share of traffic, paint choices
export const KINDS = [
  { id: "sedan", L: 4.7, W: 1.85, share: 26, cols: [0xf2f2f0, 0xc8ccd2, 0x1b1c20, 0x8a8f96, 0x6b1a1a, 0x24364f, 0x2f4a3a, 0xd8cfb8] },
  { id: "taxi", L: 4.9, W: 1.9, share: 22, cols: [0xf7c414] },
  { id: "suv", L: 4.9, W: 2.0, share: 16, cols: [0x111214, 0xf2f2f0, 0x3b3f46, 0x5a1e1e, 0x1e2a44] },
  { id: "van", L: 5.3, W: 2.0, share: 7, cols: [0xf2f2f0, 0xd9d9d9, 0x2e5aa8] },
  { id: "pickup", L: 5.5, W: 2.0, share: 6, cols: [0x8a1a14, 0x1b1c20, 0xc8ccd2, 0x2f4a3a] },
  { id: "sports", L: 4.4, W: 1.95, share: 6, cols: [0xd21f2b, 0xf7c414, 0x1f6fe0, 0x111111, 0xff6a00, 0x22c55e] },
  { id: "police", L: 5.0, W: 1.95, share: 5, cols: [0xf4f6fa] },
  { id: "bus", L: 12, W: 2.6, share: 5, cols: [0x2f6fd8] },
  { id: "truck", L: 8.5, W: 2.5, share: 7, cols: [0xf2f2f0, 0xc8202a, 0x2e5aa8, 0xf7c414] },
  { id: "compact", L: 3.8, W: 1.72, share: 8, cols: [0xe8e6e0, 0x9fd3e8, 0xf2a0b4, 0x2b2d32, 0xc0d84a, 0xd84a3a] },
  { id: "hatch", L: 4.2, W: 1.8, share: 8, cols: [0xf2f2f0, 0x3a6ea5, 0x8a8f96, 0xb5261e, 0x1b1c20] },
  { id: "wagon", L: 4.9, W: 1.85, share: 4, cols: [0x6b5a44, 0x2f4a3a, 0xc8ccd2, 0x24364f] },
  { id: "coupe", L: 4.5, W: 1.85, share: 5, cols: [0xd8cfb8, 0x1b1c20, 0x6b1a1a, 0x123a8c, 0xf2f2f0] },
  { id: "muscle", L: 4.9, W: 1.95, share: 4, cols: [0xff6a00, 0x111111, 0x2d6a1e, 0xd21f2b, 0xf7c414] },
  { id: "supercar", L: 4.6, W: 2.0, share: 3, cols: [0xd21f2b, 0x8acb1a, 0xf7c414, 0x9b5cff, 0xf2f2f0, 0x111111] },
  { id: "classic", L: 5.0, W: 1.9, share: 4, cols: [0x7fb5a8, 0xe8d3a8, 0x8a2a2a, 0x3a4a6a, 0xd9c27a] },
  { id: "limo", L: 6.8, W: 1.95, share: 2, cols: [0x0a0a0c, 0xf2f2f0] },
  { id: "hover", L: 4.6, W: 2.0, share: 5, fly: true, cols: [0xe9e9ea, 0x3df5ff, 0x9b5cff, 0x111114, 0xff4fd8] },
  // off-road machines: sold at VOID Motors, built for the mountains (never in traffic)
  { id: "monster", L: 5.4, W: 2.9, share: 0, cols: [0x1f6fe0, 0xd21f2b, 0x8acb1a, 0x111111, 0xff6a00] },
  { id: "buggy", L: 3.9, W: 2.1, share: 0, cols: [0xff6a00, 0xf7c414, 0x3df5ff, 0xd21f2b, 0x2f6b3a] },
  { id: "crawler", L: 4.3, W: 2.05, share: 0, cols: [0x6b5a44, 0x2f4a3a, 0xc8962a, 0xf2f2f0, 0x8a1a14] },
  { id: "sixer", L: 7.2, W: 2.55, share: 0, cols: [0x4a5a3a, 0x6b5a44, 0x2b2d32, 0xc8ccd2] },
  { id: "voidcar", L: 4.7, W: 2.0, share: 0, fly: true, cols: [0x0a0a0c, 0x6f0a12, 0x123a8c, 0xe9e9ea, 0x2d6a1e, 0xb8862a, 0x4a1270, 0xd8dadd] },
];
// the catalogue: 200 named models. Each is a body type with its own proportions, paint range, condition and handling.
const BRANDS = ["Aurex", "Kova", "Bellmont", "Zentri", "Harlow", "Vanta", "Ostrel", "Mirage", "Dunmore", "Caldera", "Nexo", "Ryden", "Solace", "Torvik"];
const WORDS = {
  sedan: ["Meridian", "Civic Line", "Corsa", "Accordo", "Regent", "Avenue", "Sable", "Statesman", "Primus", "Lumen", "Arbor", "Concord", "Vista", "Monarch"],
  suv: ["Ridge", "Summit", "Outback", "Tundra X", "Yukon", "Atlas", "Granite", "Sierra", "Trailhawk", "Bison", "Glacier", "Canyon", "Forge", "Basecamp"],
  van: ["Courier", "Transit", "Hauler", "Shuttle", "Cargo", "Nomad", "Porter", "Caravan", "Express", "Metro Van", "Workhorse", "Voyager", "Camper", "Sprinter"],
  pickup: ["Ranch", "Stallion", "Rambler", "Boulder", "Trapper", "Longhorn", "Dune", "Hauler HD", "Maverick", "Gravel", "Wrangle", "Prairie", "Ironside", "Coyote"],
  sports: ["GT", "Spyder", "Velo", "Apex", "Strada", "Corsa R", "Viper", "Zephyr", "Kestrel", "Arrow", "Nitro", "Rally S", "Blitz", "Comet"],
  compact: ["Pip", "Mini", "Spark", "Dot", "Pebble", "City", "Zip", "Bean", "Cricket", "Hop", "Button", "Clover", "Juno", "Mote"],
  hatch: ["Swift", "Polo", "Golfo", "Fiesta", "Rio", "Note", "Jazz", "Spritz", "Fox", "Ion", "Quill", "Pulse", "Echo", "Brisk"],
  wagon: ["Estate", "Touring", "Allroad", "Avant", "Family", "Country", "Homestead", "Liner", "Grand Tour", "Ranger", "Woodie", "Voyage", "Harbor", "Lodge"],
  coupe: ["Duo", "Coupe S", "Sterling", "Velvet", "Riviera", "Monaco", "Elan", "Crest", "Cadence", "Noble", "Saber", "Portofino", "Ember", "Vale"],
  muscle: ["Charger", "Hellhound", "Thunder", "Mustang", "Bandit", "Torque", "Outlaw", "Brute", "Hammer", "Fury", "Rumble", "Big Block", "Thrasher", "Diablo"],
  supercar: ["Hyperion", "Vortex", "Specter", "Zenith", "Aero 9", "Venom", "Phantom", "Inferno", "Halo", "Eclipse", "Raptor", "Nova X", "Mirage RS", "Oblivion"],
  classic: ["Bel Air", "Starliner", "Fleetwood", "Coronet", "Ambassador", "Imperial", "Fairlane", "Biscayne", "Galaxie", "Roadmaster", "Skylark", "Deville", "Nomad 57", "Tudor"],
  limo: ["Presidential", "Stretch", "Royale", "Phantom L", "Gala", "Majesty", "Diplomat", "Embassy", "Premier", "Grandeur", "Sovereign", "Ballroom", "Chairman", "Crown"],
  hover: ["Skylane", "Aerodyne", "Hoverline", "Levitas", "Zephyrus", "Glide", "Nimbus", "Halcyon", "Strato", "Drift-X", "Airwave", "Cirrus", "Orbit", "Lumina"],
};
const OFFROAD = { monster: 1.4, buggy: 1.3, crawler: 1.45, sixer: 1.3, suv: .85, pickup: .9, van: .65 };
const PERF = { voidcar: [80, 1.6, 1.2], monster: [50, 1.35, 1.0], buggy: [56, 1.4, 1.05], crawler: [38, 1.0, 1.2], sixer: [42, .9, 1.0], sedan: [52, 1, 1], suv: [48, .9, .9], van: [42, .8, .85], pickup: [47, .9, .9], sports: [80, 1.35, 1.15], compact: [44, .85, 1.05], hatch: [50, .95, 1.05], wagon: [50, .95, 1], coupe: [62, 1.1, 1.05], muscle: [74, 1.4, .85], supercar: [92, 1.6, 1.2], classic: [46, .85, .8], limo: [48, .8, .8], hover: [70, 1.2, 1.1], taxi: [52, 1, 1], police: [70, 1.25, 1.05], bus: [30, .55, .7], truck: [34, .6, .7] };
export const CAR_MODELS = (() => {
  let sd = 4242; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (const k of KINDS) {
    const words = WORDS[k.id], perf = PERF[k.id];
    if (!words) { out.push({ id: k.id, name: { voidcar: "VOID Hydra", taxi: "VOID Cab", police: "Interceptor", bus: "City Bus", truck: "Box Truck", monster: "Monster Truck", buggy: "Dune Buggy", crawler: "Rock Crawler", sixer: "6x6 Hauler" }[k.id], kind: k, sl: 1, sh: 1, sw: 1, cols: k.cols, rust: 0, top: perf[0], acc: perf[1], grip: perf[2], offroad: OFFROAD[k.id] }); continue; }
    words.forEach((w, i) => {
      const beater = k.id !== "hover" && k.id !== "supercar" && (i % 5 === 3 || k.id === "classic" && i % 3 === 0);
      const brand = BRANDS[(i * 5 + k.id.length) % BRANDS.length];
      out.push({ id: `${k.id}-${i}`, name: `${brand} ${w}${beater ? " (rusty)" : ""}`, kind: k, sl: .9 + rr() * .2, sh: .93 + rr() * .14, sw: .95 + rr() * .1,
        cols: beater ? [0x6b5a44, 0x7a3a2a, 0x5a6a5a, 0x8a7a5a] : k.cols.slice(0, 2 + Math.floor(rr() * (k.cols.length - 1))), rust: beater ? .55 + rr() * .45 : rr() < .15 ? rr() * .3 : 0,
        top: perf[0] * (beater ? .85 : .92 + rr() * .16), acc: perf[1] * (beater ? .85 : .95 + rr() * .1), grip: perf[2] * (beater ? .85 : 1), offroad: OFFROAD[k.id] });
    });
  }
  return out;
})();
const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g; };
const B = (w, h, d, x, y, z, c) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), c);
const BODY = [1, 1, 1], GLASS = [.03, .035, .045], TYRE = [.03, .03, .03], DARK = [.18, .18, .19], CHROME = [.55, .55, .58];
function wheelsOf(L, W, r = .36) { const out = [], ax = L / 2 - .95; for (const x of [ax, -ax]) for (const z of [W / 2 - .2, -W / 2 + .2]) out.push(tint(new THREE.CylinderGeometry(r, r, .28, 12).rotateX(Math.PI / 2).translate(x, r, z).toNonIndexed(), TYRE)); return out; }
// side profiles extruded across the car with rounded edges: a real hood, windscreen rake, roof and boot
const V2 = (x, y) => new THREE.Vector2(x, y);
const ext = (pts, width, c, bevel = .07) => tint(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => V2(x, y))), { depth: Math.max(.05, width - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 }).translate(0, 0, -(width - 2 * bevel) / 2), c);
const CHR = [.62, .63, .66], RIM = [.5, .52, .56];
function wheels4(L, W, r = .34, inset = .95) {
  const out = [], ax = L / 2 - inset;
  for (const x of [ax, -ax]) for (const s of [1, -1]) {
    out.push(tint(new THREE.CylinderGeometry(r, r, .26, 14).rotateX(Math.PI / 2).translate(x, r, s * (W / 2 - .16)).toNonIndexed(), TYRE));
    out.push(tint(new THREE.CylinderGeometry(r * .62, r * .62, .04, 10).rotateX(Math.PI / 2).translate(x, r, s * (W / 2 - .02)).toNonIndexed(), RIM));
  }
  return out;
}
const PROFILES = {
  compact: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .66], [L / 2 - .3, .82], [L / 2 - .8, .9], [-L / 2 + .05, .95], [-L / 2, .8]],
    [[L / 2 - .85, .89], [L / 2 - 1.45, 1.42], [-L / 2 + .25, 1.45], [-L / 2 + .1, .94]], [[L / 2 - 1.4, 1.4], [-L / 2 + .25, 1.43], [-L / 2 + .25, 1.5], [L / 2 - 1.42, 1.48]]],
  hatch: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .62], [L / 2 - .3, .78], [L / 2 - 1.0, .88], [-L / 2 + .1, .94], [-L / 2, .78]],
    [[L / 2 - 1.05, .87], [L / 2 - 1.75, 1.38], [-L / 2 + .45, 1.4], [-L / 2 + .12, .95]], [[L / 2 - 1.7, 1.36], [-L / 2 + .45, 1.38], [-L / 2 + .42, 1.45], [L / 2 - 1.72, 1.43]]],
  wagon: (L) => [[[-L / 2, .32], [L / 2, .32], [L / 2, .64], [L / 2 - .32, .8], [L / 2 - 1.2, .9], [-L / 2 + .1, .94], [-L / 2, .8]],
    [[L / 2 - 1.25, .89], [L / 2 - 1.95, 1.4], [-L / 2 + .2, 1.42], [-L / 2 + .12, .95]], [[L / 2 - 1.9, 1.38], [-L / 2 + .18, 1.4], [-L / 2 + .18, 1.47], [L / 2 - 1.92, 1.45]]],
  coupe: (L) => [[[-L / 2, .28], [L / 2, .28], [L / 2, .55], [L / 2 - .4, .72], [L / 2 - 1.4, .82], [-L / 2 + .8, .88], [-L / 2, .74]],
    [[L / 2 - 1.45, .81], [L / 2 - 2.15, 1.25], [-L / 2 + 1.3, 1.26], [-L / 2 + .6, .87]], [[L / 2 - 2.1, 1.23], [-L / 2 + 1.35, 1.24], [-L / 2 + 1.35, 1.3], [L / 2 - 2.1, 1.3]]],
  muscle: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .7], [L / 2 - .2, .84], [L / 2 - 1.8, .92], [-L / 2 + .9, .95], [-L / 2 + .1, .92], [-L / 2, .78]],
    [[L / 2 - 1.85, .91], [L / 2 - 2.35, 1.3], [-L / 2 + 1.5, 1.32], [-L / 2 + .85, .94]], [[L / 2 - 2.3, 1.28], [-L / 2 + 1.55, 1.3], [-L / 2 + 1.55, 1.36], [L / 2 - 2.3, 1.36]]],
  supercar: (L) => [[[-L / 2, .22], [L / 2, .22], [L / 2, .38], [L / 2 - .9, .6], [L / 2 - 1.6, .7], [-L / 2 + .5, .82], [-L / 2, .7]],
    [[L / 2 - 1.5, .68], [L / 2 - 2.3, 1.05], [-L / 2 + 1.7, 1.04], [-L / 2 + .9, .8]], [[L / 2 - 2.25, 1.03], [-L / 2 + 1.75, 1.03], [-L / 2 + 1.75, 1.08], [L / 2 - 2.25, 1.08]]],
  classic: (L) => [[[-L / 2, .34], [L / 2, .34], [L / 2, .74], [L / 2 - .25, .86], [L / 2 - 1.5, .92], [-L / 2 + 1.1, .94], [-L / 2 + .1, .9], [-L / 2, .8]],
    [[L / 2 - 1.55, .91], [L / 2 - 1.95, 1.4], [-L / 2 + 1.7, 1.42], [-L / 2 + 1.25, .93]], [[L / 2 - 1.9, 1.38], [-L / 2 + 1.75, 1.4], [-L / 2 + 1.75, 1.48], [L / 2 - 1.9, 1.46]]],
  limo: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .62], [L / 2 - .32, .78], [L / 2 - 1.25, .88], [-L / 2 + .95, .92], [-L / 2 + .15, .86], [-L / 2, .7]],
    [[L / 2 - 1.3, .87], [L / 2 - 2.05, 1.38], [-L / 2 + 1.55, 1.4], [-L / 2 + .9, .9]], [[L / 2 - 2.0, 1.36], [-L / 2 + 1.6, 1.38], [-L / 2 + 1.62, 1.45], [L / 2 - 2.02, 1.43]]],
  // [body outline], [glass outline], [roof outline] (x from the back, metres; y up)
  sedan: (L) => [[[-L / 2, .3], [L / 2, .3], [L / 2, .62], [L / 2 - .32, .78], [L / 2 - 1.25, .88], [-L / 2 + .95, .92], [-L / 2 + .15, .86], [-L / 2, .7]],
    [[L / 2 - 1.3, .87], [L / 2 - 2.05, 1.38], [-L / 2 + 1.55, 1.4], [-L / 2 + .9, .9]], [[L / 2 - 2.0, 1.36], [-L / 2 + 1.6, 1.38], [-L / 2 + 1.62, 1.45], [L / 2 - 2.02, 1.43]]],
  suv: (L) => [[[-L / 2, .38], [L / 2, .38], [L / 2, .82], [L / 2 - .3, 1.0], [L / 2 - 1.15, 1.08], [-L / 2 + .1, 1.12], [-L / 2, .95]],
    [[L / 2 - 1.2, 1.07], [L / 2 - 1.75, 1.78], [-L / 2 + .25, 1.8], [-L / 2 + .12, 1.1]], [[L / 2 - 1.72, 1.76], [-L / 2 + .2, 1.78], [-L / 2 + .2, 1.86], [L / 2 - 1.75, 1.84]]],
  hover: (L) => [[[-L / 2, .35], [L / 2, .35], [L / 2, .5], [L / 2 - .7, .72], [L / 2 - 1.5, .8], [-L / 2 + .6, .85], [-L / 2, .7]],
    [[L / 2 - 1.5, .78], [L / 2 - 2.3, 1.18], [-L / 2 + 1.3, 1.2], [-L / 2 + .65, .84]], [[L / 2 - 2.25, 1.16], [-L / 2 + 1.35, 1.17], [-L / 2 + 1.35, 1.24], [L / 2 - 2.25, 1.24]]],
  sports: (L) => [[[-L / 2, .26], [L / 2, .26], [L / 2, .45], [L / 2 - .5, .66], [L / 2 - 1.5, .76], [-L / 2 + .7, .84], [-L / 2, .74]],
    [[L / 2 - 1.55, .75], [L / 2 - 2.2, 1.12], [-L / 2 + 1.5, 1.12], [-L / 2 + .75, .83]], [[L / 2 - 2.15, 1.1], [-L / 2 + 1.55, 1.1], [-L / 2 + 1.55, 1.16], [L / 2 - 2.15, 1.16]]],
  van: (L) => [[[-L / 2, .35], [L / 2, .35], [L / 2, .95], [L / 2 - .5, 1.25], [-L / 2, 1.25]],
    [[L / 2 - .5, 1.24], [L / 2 - 1.1, 1.95], [-L / 2 + .1, 2.0], [-L / 2 + .1, 1.24]], [[L / 2 - 1.05, 1.93], [-L / 2 + .05, 1.98], [-L / 2 + .05, 2.18], [L / 2 - 1.1, 2.14]]],
  pickup: (L) => [[[-L / 2, .38], [L / 2, .38], [L / 2, .85], [L / 2 - .4, 1.02], [L / 2 - 1.2, 1.08], [-L / 2, 1.08]],
    [[L / 2 - 1.25, 1.07], [L / 2 - 1.75, 1.75], [L / 2 - 3.0, 1.78], [L / 2 - 3.05, 1.07]], [[L / 2 - 1.72, 1.74], [L / 2 - 3.02, 1.76], [L / 2 - 3.02, 1.84], [L / 2 - 1.75, 1.82]]],
};
export function vehicle(k) {
  const { L, W } = k, p = [], lt = [];
  const H = [1, .95, .85], R = [1, .12, .12], A = [1, .7, .2];
  const lamps = (y, h = .14) => { for (const s of [1, -1]) { lt.push(B(.08, h, W * .24, L / 2 - .02, y, s * W * .32, H)); lt.push(B(.08, h, W * .26, -L / 2 + .02, y + .05, s * W * .32, R)); } };
  const mirrors = (x, y) => { for (const s of [1, -1]) p.push(B(.18, .12, .2, x, y, s * (W / 2 + .08), BODY)); };
  const kind = k.id === "taxi" || k.id === "police" ? "sedan" : k.id === "voidcar" ? "sports" : k.id;
  const tyre = (x, z, r, w) => { p.push(tint(new THREE.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2).translate(x, r, z).toNonIndexed(), TYRE)); p.push(tint(new THREE.CylinderGeometry(r * .55, r * .55, .04, 10).rotateX(Math.PI / 2).translate(x, r, z + Math.sign(z) * w / 2).toNonIndexed(), RIM));
    for (let t = 0; t < 8; t++) { const a = t / 8 * Math.PI * 2; p.push(B(.12, .1, w * 1.02, x + Math.cos(a) * r * .97, r + Math.sin(a) * r * .97, z, [.06, .06, .06])); } };      // chunky tread blocks
  if (kind === "monster") {                                                   // a pickup on huge tyres and long-travel suspension
    const [body, glass, roof] = PROFILES.pickup(L * .88), up = 1.25;
    p.push(ext(body, W * .78, BODY, .1).translate(0, up, 0), ext(glass, W * .7, GLASS, .06).translate(0, up, 0), ext(roof, W * .68, BODY, .05).translate(0, up, 0));
    p.push(B(L * .8, .25, W * .55, 0, up + .25, 0, DARK));
    for (const x of [L / 2 - 1.15, -L / 2 + 1.15]) { for (const z of [W / 2 - .38, -W / 2 + .38]) tyre(x, z, .98, .72); p.push(B(.18, .9, W * .7, x, up - .1, 0, CHROME)); }
    p.push(B(.14, .9, .14, -.8, up + 1.55, W * .3, DARK), B(.14, .9, .14, -.8, up + 1.55, -W * .3, DARK), B(.14, .14, W * .64, -.8, up + 2, 0, DARK));       // roll bar
    lt.push(B(.1, .14, W * .5, -1, up + 2.08, 0, [1, .95, .7]));                                                                                                // light bar
    lamps(up + .7); return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  if (kind === "buggy") {                                                     // an open tube-frame dune buggy
    p.push(B(L * .8, .14, W * .7, 0, .55, 0, DARK), ext([[L / 2 - 1.2, .6], [L / 2, .6], [L / 2, .85], [L / 2 - 1.2, 1.05]], W * .62, BODY, .06), B(.9, .5, W * .55, -L / 2 + .65, .9, 0, BODY));
    const rail = (x0, y0, z0, x1, y1, z1) => { const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(.045, .045, len, 6); g.translate(0, len / 2, 0);
      const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize(); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)).translate(x0, y0, z0); p.push(tint(g.toNonIndexed(), [.12, .12, .13])); };
    for (const z of [W * .3, -W * .3]) { rail(.8, .6, z, .3, 1.75, z * .9); rail(-.9, .6, z, -.7, 1.75, z * .9); rail(.3, 1.75, z * .9, -.7, 1.75, z * .9); }
    rail(.3, 1.75, W * .27, .3, 1.75, -W * .27); rail(-.7, 1.75, W * .27, -.7, 1.75, -W * .27);
    p.push(B(.5, .6, .5, -.3, .9, .3, [.1, .1, .1]), B(.5, .6, .5, -.3, .9, -.3, [.1, .1, .1]));           // seats
    for (const z of [W / 2 - .25, -W / 2 + .25]) { tyre(L / 2 - .7, z, .46, .38); tyre(-L / 2 + .75, z, .58, .48); }
    lamps(.82); return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  if (kind === "crawler") {                                                   // a boxy, lifted rock crawler with a spare on the back
    const up = .55;
    p.push(ext([[-L / 2, .35], [L / 2, .35], [L / 2, .8], [L / 2 - 1.1, .9], [-L / 2, .95]], W * .9, BODY, .08).translate(0, up, 0));
    p.push(B(.06, .55, W * .8, L / 2 - 1.15, up + 1.2, 0, GLASS), B(1.9, .06, W * .82, -.25, up + 1.5, 0, BODY));
    for (const z of [W * .4, -W * .4]) for (const x of [L / 2 - 1.15, -L / 2 + .15]) p.push(B(.08, .6, .08, x, up + 1.2, z, DARK));
    p.push(tint(new THREE.CylinderGeometry(.42, .42, .3, 14).rotateZ(Math.PI / 2).translate(-L / 2 - .15, up + .9, 0).toNonIndexed(), TYRE));
    p.push(B(.25, .3, W * 1.02, L / 2 + .1, up + .45, 0, DARK), B(.25, .3, W * 1.02, -L / 2 - .05, up + .45, 0, DARK));
    for (const x of [L / 2 - .95, -L / 2 + .95]) for (const z of [W / 2 - .2, -W / 2 + .2]) tyre(x, z, .64, .48);
    lamps(up + .7); lt.push(B(.08, .1, W * .6, L / 2 - 1.1, up + 1.58, 0, [1, .95, .7]));
    return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  if (kind === "sixer") {                                                     // a six-wheel-drive cab and flatbed
    const up = .45;
    p.push(ext([[L / 2 - 2.3, .4], [L / 2, .4], [L / 2, 1.3], [L / 2 - .5, 2.1], [L / 2 - 2.3, 2.15]], W * .95, BODY, .1).translate(0, up, 0));
    p.push(ext([[L / 2 - .55, 1.4], [L / 2 - .15, 1.35], [L / 2 - .55, 2.0]], W * .9, GLASS, .02).translate(0, up, 0));
    p.push(B(L - 2.4, .25, W * .98, -1.15, up + .75, 0, BODY), B(L - 2.4, .5, .08, -1.15, up + 1.1, W * .48, BODY), B(L - 2.4, .5, .08, -1.15, up + 1.1, -W * .48, BODY), B(.08, .5, W * .98, -L / 2 + .05, up + 1.1, 0, BODY));
    p.push(B(L * .95, .35, W * .5, 0, up + .25, 0, DARK));
    for (const x of [L / 2 - 1.2, -L / 2 + 1.0, -L / 2 + 2.45]) for (const z of [W / 2 - .25, -W / 2 + .25]) tyre(x, z, .62, .45);
    lamps(up + .8); return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  if (kind === "bus" || kind === "truck") {
    if (kind === "bus") {
      p.push(ext([[-L / 2, .45], [L / 2, .45], [L / 2, 3.1], [-L / 2, 3.1]], W, BODY, .15), ext([[-L / 2 + .3, 1.55], [L / 2 - .3, 1.55], [L / 2 - .3, 2.6], [-L / 2 + .3, 2.6]], W + .04, GLASS, .02));
      p.push(B(.05, 1.5, W * .8, L / 2 + .02, 2.05, 0, GLASS), B(L * .9, .25, W * .55, 0, 3.25, 0, [.82, .83, .85]), B(L, .3, W + .06, 0, .55, 0, DARK), ...wheels4(L, W, .5, 1.6));
      lamps(.95); lt.push(B(.05, .28, W * .6, L / 2 + .03, 2.9, 0, A));
    } else {
      p.push(ext([[-L / 2, .6], [L * .2, .6], [L * .2, 3.4], [-L / 2, 3.4]], W, BODY, .08));
      p.push(ext([[L * .21, .5], [L / 2, .5], [L / 2, 1.5], [L / 2 - .5, 2.4], [L * .21, 2.5]], W * .98, [.9, .9, .92], .1), ext([[L / 2 - .5, 1.6], [L / 2 - .1, 1.55], [L / 2 - .5, 2.3]], W + .02, GLASS, .02));
      p.push(B(L, .3, W * .9, 0, .55, 0, DARK), ...wheels4(L, W, .48, 1.1)); lamps(.95);
    }
    return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
  }
  const [body, glass, roof] = PROFILES[kind](L);
  p.push(ext(body, W, BODY, .1), ext(glass, W * .9, GLASS, .06), ext(roof, W * .86, BODY, .05));
  p.push(B(.2, .22, W * .96, L / 2 - .02, .42, 0, DARK), B(.2, .22, W * .96, -L / 2 + .02, .42, 0, DARK));       // bumpers
  p.push(B(.03, .14, W * .5, L / 2 + .02, .58, 0, [.12, .12, .13]));                                               // grille
  const wr = kind === "suv" || kind === "pickup" ? .4 : kind === "sports" || kind === "supercar" || kind === "coupe" ? .33 : kind === "classic" ? .36 : .34;
  if (kind === "hover") { for (const x of [L / 2 - .9, -L / 2 + .9]) for (const s of [1, -1]) { p.push(B(.8, .3, .4, x, .3, s * (W / 2 - .1), DARK)); lt.push(B(.7, .06, .32, x, .14, s * (W / 2 - .1), [.3, 1.6, 2])); } lt.push(B(L * .7, .04, W * .5, 0, .22, 0, [.4, 1.2, 1.8])); }
  else p.push(...wheels4(L, W, wr, kind === "sports" || kind === "supercar" ? .85 : kind === "limo" ? 1.1 : .95));
  if (kind === "muscle") { p.push(B(.7, .12, .5, L / 2 - 1, .98, 0, DARK)); for (const s of [1, -1]) p.push(B(L * .8, .05, .25, 0, .96, s * .3, [.95, .95, .95])); }
  if (kind === "supercar") { p.push(B(.25, .06, W * .9, -L / 2 + .2, 1.0, 0, DARK)); for (const s of [1, -1]) p.push(B(.08, .25, .08, -L / 2 + .25, .85, s * W * .35, DARK)); }
  if (kind === "classic") { p.push(B(.12, .1, W * 1.02, L / 2 + .02, .45, 0, CHR), B(.12, .1, W * 1.02, -L / 2 - .02, .45, 0, CHR)); for (const s of [1, -1]) p.push(B(.6, .2, .05, -L / 2 + .4, .95, s * W * .4, BODY)); }
  if (kind === "wagon") { for (const s of [1, -1]) p.push(B(L * .55, .04, .06, -.3, 1.5, s * W * .38, CHR)); }
  mirrors(L / 2 - (kind === "compact" ? .95 : kind === "hatch" ? 1.1 : 1.35), kind === "suv" || kind === "pickup" ? 1.15 : kind === "van" ? 1.35 : .95);
  if (k.id === "taxi") { p.push(B(.55, .26, .9, -.1, 1.6, 0, BODY)); lt.push(B(.57, .16, .92, -.1, 1.62, 0, [1, .92, .6])); for (const s of [1, -1]) p.push(B(L * .7, .1, .02, 0, .66, s * (W / 2 + .01), [.03, .03, .03])); }
  if (k.id === "police") { for (const s of [1, -1]) p.push(B(L * .8, .24, .02, 0, .65, s * (W / 2 + .01), [.12, .25, .75])); lt.push(B(.3, .14, .5, -.15, 1.52, .32, [.2, .35, 1]), B(.3, .14, .5, -.15, 1.52, -.32, [1, .15, .15])); }
  lamps(kind === "sports" || kind === "supercar" ? .5 : kind === "hover" ? .55 : kind === "suv" || kind === "pickup" ? .85 : kind === "van" ? .85 : .66);
  return { body: mergeGeometries(p), lights: mergeGeometries(lt) };
}
// people: torso and arms (shirt colour), each leg on its own so they can swing, a head and hair
const C = (rt, rb, h, seg, x, y, z, c, sx = 1, sz = 1) => tint(new THREE.CylinderGeometry(rt, rb, h, seg).scale(sx, 1, sz).translate(x, y, z).toNonIndexed(), c);
export function personGeo() {
  const s = [1, 1, 1], hip = [.24, .24, .27], hand = [.86, .66, .52], sole = [.07, .07, .07];
  return {
    // a tapered torso (wider at the chest), rounded shoulders, a belt line
    body: mergeGeometries([C(.205, .165, .56, 10, 0, 1.19, 0, s, .58), C(.19, .21, .1, 10, 0, 1.47, 0, s, .6), C(.17, .175, .2, 10, 0, .95, 0, hip, .62),
      B(.2, .03, .33, 0, 1.04, 0, [.12, .1, .08])]),
    // each arm hangs from the shoulder: sleeve, forearm, hand
    arm: mergeGeometries([C(.062, .055, .32, 6, 0, -.16, 0, s), C(.052, .046, .28, 6, .02, -.44, 0, s), B(.08, .1, .06, .03, -.63, 0, hand)]),
    // each leg hangs from the hip: thigh, shin, shoe
    leg: mergeGeometries([C(.085, .072, .46, 7, 0, -.23, 0, [1, 1, 1]), C(.066, .056, .38, 7, 0, -.65, 0, [1, 1, 1]), B(.26, .08, .12, .05, -.86, 0, sole)]),
    head: mergeGeometries([new THREE.IcosahedronGeometry(.13, 2).scale(1, 1.12, .95).translate(0, 1.67, 0).toNonIndexed(), new THREE.CylinderGeometry(.055, .062, .12, 6).translate(0, 1.52, 0).toNonIndexed(),
      new THREE.BoxGeometry(.04, .05, .03).translate(.13, 1.66, 0).toNonIndexed()]),
    hair: new THREE.SphereGeometry(.142, 9, 4, 0, Math.PI * 2, 0, Math.PI * .5).scale(1, 1.05, 1).translate(-.018, 1.69, 0),
    // things some people have
    hat: mergeGeometries([C(.135, .142, .1, 10, -.01, 1.8, 0, s), B(.16, .018, .24, .12, 1.765, 0, s)]),
    bag: mergeGeometries([B(.15, .34, .28, -.17, 1.18, 0, s), B(.05, .16, .22, -.25, 1.1, 0, [.6, .6, .6])]),
    skirt: C(.165, .29, .42, 10, 0, .8, 0, s, .8),
    umbrella: mergeGeometries([tint(new THREE.ConeGeometry(.62, .22, 8).translate(.12, 2.12, .18).toNonIndexed(), s), C(.012, .012, 1.05, 4, .12, 1.55, .18, [.15, .15, .15])]),
    dog: mergeGeometries([C(.12, .12, .5, 7, 0, .34, 0, s).rotateZ(Math.PI / 2).translate(0, .34, 0), B(.2, .17, .15, .32, .48, 0, s), B(.1, .08, .09, .45, .45, 0, [.1, .1, .1]),
      ...[[.18, .07], [.18, -.07], [-.18, .07], [-.18, -.07]].map(([x, z]) => C(.035, .03, .3, 5, x, .15, z, s)), C(.02, .012, .22, 4, -.3, .48, 0, s).rotateZ(-.8).translate(-.12, .12, 0)]),
  };
}

export function createLife(scene, roads, walkways, COARSE) {
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const { ax, sz, avW, stW, NX, NZ, X0, Z0, AV, ST, lanes } = GRID;
  const laneOffs = (axis, road) => axis === 0 ? (road === 10 ? lanes.bv : lanes.st) : lanes.av;
  const closed = (j, i) => j === 10 && (i === 5 || i === 6);            // the stunt track on the boulevard is closed to traffic
  const closedZ = (i, j) => i === 6 && (j === 9 || j === 10);        // and so is the avenue that crosses it, round the showroom spot and the loop
  const segOK = (axis, road, k) => axis === 0 ? (k >= 0 && k < NX - 1 && GRID.hasX(road, k) && !closed(road, k)) : (k >= 0 && k < NZ - 1 && GRID.hasZ(road, k) && !closedZ(road, k));
  const cross = (axis, k) => axis === 0 ? ax(k) : sz(k);               // the coordinate of the k-th crossing road along this axis
  const crossW = (axis, k) => axis === 0 ? avW(k) : stW(k);
  const roadC = (axis, road) => axis === 0 ? sz(road) : ax(road);
  const LOWMEM = (navigator.deviceMemory || 8) <= 4, N = COARSE ? (LOWMEM ? 360 : 600) : 1500, NP = COARSE ? (LOWMEM ? 600 : 1100) : 2800;

  // ---- vehicles ----
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .55, envMapIntensity: 1.1 });
  carMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRust; varying float vRust; varying vec3 vOP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRust = aRust; vOP = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vRust; varying vec3 vOP;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nfloat rn = fract(sin(dot(floor(vOP * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453) * .6 + fract(sin(dot(floor(vOP * 23.0), vec3(39.3, 11.7, 83.1))) * 9631.7) * .4; float rr = vRust * smoothstep(.55 - vRust * .35, .9, rn) * step(.12, diffuseColor.r + diffuseColor.g + diffuseColor.b); diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - vRust * .35), vec3(.36, .17, .07) * (.6 + .7 * rn), rr);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .95, vRust * .85);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - vRust * .85;");
  };
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  const total = KINDS.reduce((s, k) => s + k.share, 0), counts = KINDS.map(k => k.id === "voidcar" ? (COARSE ? 4 : 8) : Math.round(N * k.share / total));
  const meshes = KINDS.map((k, ti) => {
    const g = vehicle(k), body = new THREE.InstancedMesh(g.body, carMat, Math.max(1, counts[ti])), lights = new THREE.InstancedMesh(g.lights, lightMat, Math.max(1, counts[ti]));
    const rust = new Float32Array(Math.max(1, counts[ti])); body.geometry.setAttribute("aRust", new THREE.InstancedBufferAttribute(rust, 1)); body.rust = rust;
    body.castShadow = true; body.frustumCulled = lights.frustumCulled = false; scene.add(body, lights); return { body, lights };
  });
  const cars = [], col = new THREE.Color();
  const FLYK = new Set(["sedan", "suv", "sports", "supercar", "coupe", "muscle", "taxi", "police", "compact", "hatch", "limo", "classic", "van", "pickup"]);
  // thruster glow under flying cars (hover cars have their own)
  const jetGeo = mergeGeometries([new THREE.CircleGeometry(.42, 14).rotateX(Math.PI / 2).translate(1.3, .12, 0), new THREE.CircleGeometry(.42, 14).rotateX(Math.PI / 2).translate(-1.3, .12, 0)]);
  const jets = new THREE.InstancedMesh(jetGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.8, 2.4), toneMapped: false, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 900);
  jets.frustumCulled = false; scene.add(jets); let jk = 0;
  // soft contact shadows under every car and person near the camera, and the pool of light ahead of each car at night
  const softTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.55, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ map: softTex, color: 0x000000, transparent: true, opacity: .62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 2200);
  const beams = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ map: softTex, color: new THREE.Color(1, .82, .55).multiplyScalar(.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), 600);
  for (const m of [blobs, beams]) { m.frustumCulled = false; m.renderOrder = 1; scene.add(m); }
  let bk2 = 0, hk2 = 0; const bQ = new THREE.Quaternion(), bE = new THREE.Euler(), bS = new THREE.Vector3(), bP = new THREE.Vector3();
  function place(c) {           // drop a car somewhere on a random open segment
    for (let tries = 0; tries < 40; tries++) {
      const axis = rnd() < .5 ? 0 : 1, road = Math.floor(rnd() * (axis === 0 ? NZ : NX)), k = Math.floor(rnd() * ((axis === 0 ? NX : NZ) - 1));
      if (!segOK(axis, road, k)) continue;
      const a = cross(axis, k) + crossW(axis, k) / 2 + 6, b = cross(axis, k + 1) - crossW(axis, k + 1) / 2 - 6;
      const lo = laneOffs(axis, road);
      Object.assign(c, { axis, road, dir: rnd() < .5 ? 1 : -1, lane: lo[Math.floor(rnd() * lo.length)], s: a + rnd() * (b - a), turn: null, lastK: -99, wreck: null, gone: 0, parked: false });
      c.v = c.want * .6; return;
    }
  }
  KINDS.forEach((k, ti) => {
    for (let n = 0; n < counts[ti]; n++) {
      const ms = CAR_MODELS.filter(m => m.kind === k), model = ms[Math.floor(rnd() * ms.length)];
      const c = { kind: k, ti, n, model, v: 0, want: (k.id === "bus" || k.id === "truck" ? 8 : k.id === "sports" || k.id === "supercar" ? 13 : k.fly ? 18 : 10) + rnd() * 4, x: 0, z: 0, yaw: 0, y: 0, rx: 0, rz: 0, bump: 0, near: false, rust: model.rust ? Math.min(1, model.rust * (.8 + rnd() * .4)) : 0, fly: k.fly ? 20 + rnd() * 34 : FLYK.has(k.id) && rnd() < .09 ? 26 + rnd() * 44 : 0, idx: cars.length };
      if (c.fly) c.want = 15 + rnd() * 9;
      place(c); cars.push(c);
      c.color = model.cols[Math.floor(rnd() * model.cols.length)]; c.col = new THREE.Color(c.color);
    }
    meshes[ti].body.setColorAt(0, col.setHex(0xffffff));
  });
  const posOf = c => { const o = (c.lane + (c.dodge || 0)) * c.dir; if (c.axis === 0) { c.x = c.s; c.z = roadC(0, c.road) + o; c.yaw = c.dir > 0 ? 0 : Math.PI; } else { c.z = c.s; c.x = roadC(1, c.road) - o; c.yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } };
  cars.forEach(posOf);

  // debris from smashed cars
  const DEB = COARSE ? 160 : 400, debris = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .25, .4), new THREE.MeshStandardMaterial({ roughness: .5, metalness: .5 }), DEB);
  debris.frustumCulled = false; scene.add(debris); const deb = Array.from({ length: DEB }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() })); let debI = 0;
  const glassBits = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.12), new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: .8 }), DEB); glassBits.frustumCulled = false; scene.add(glassBits);

  // ---- people ----
  const pg = personGeo();
  const peopleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), headMat = new THREE.MeshStandardMaterial({ roughness: .7 });
  const bodies = new THREE.InstancedMesh(pg.body, peopleMat, NP), heads = new THREE.InstancedMesh(pg.head, headMat, NP);
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), legL = new THREE.InstancedMesh(pg.leg, legMat, NP), legR = new THREE.InstancedMesh(pg.leg, legMat, NP), hair = new THREE.InstancedMesh(pg.hair, new THREE.MeshStandardMaterial({ roughness: .9 }), NP);
  const armL = new THREE.InstancedMesh(pg.arm, peopleMat, NP), armR = new THREE.InstancedMesh(pg.arm, peopleMat, NP);
  const kit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 }), NK = Math.ceil(NP * .4);
  const hats = new THREE.InstancedMesh(pg.hat, kit, NK), bags = new THREE.InstancedMesh(pg.bag, kit, NK), skirts = new THREE.InstancedMesh(pg.skirt, kit, NK);
  const umbs = new THREE.InstancedMesh(pg.umbrella, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: THREE.DoubleSide }), NP), dogs = new THREE.InstancedMesh(pg.dog, kit, Math.ceil(NP * .1));
  const ALLP = [bodies, heads, legL, legR, hair, armL, armR, hats, bags, skirts, umbs, dogs];
  for (const m of ALLP) { m.frustumCulled = false; m.layers.set(1); scene.add(m); }
  debris.layers.enable(1);
  const SHIRTS = [0xe8e8e8, 0x1f1f22, 0xb22234, 0x2e5aa8, 0x2f6b3a, 0xf7c414, 0x7a2a8a, 0xff7a2e, 0x8a8f96, 0x4a2e1e, 0xf2a0b0, 0x30c0c0], SKIN = [0xf1c8a8, 0xd9a07a, 0xa8714a, 0x6b4430, 0xffdcc0, 0x8a5a3a];
  const people = [];
  const blockOK = (i, j) => !(i >= GRID.park.i0 && i < GRID.park.i1 && j >= GRID.park.j0 && j < GRID.park.j1);
  for (let n = 0; n < NP; n++) {
    let i, j; do { i = Math.floor(rnd() * (NX - 1)); j = Math.floor(rnd() * (NZ - 1)); } while (!blockOK(i, j));
    const x0 = ax(i) + avW(i) / 2 + 1.6, x1 = ax(i + 1) - avW(i + 1) / 2 - 1.6, z0 = sz(j) + stW(j) / 2 + 1.6, z1 = sz(j + 1) - stW(j + 1) / 2 - 1.6;
    const per = 2 * (x1 - x0) + 2 * (z1 - z0), inset = rnd() * 1.6;
    people.push({ x0: x0 + inset, x1: x1 - inset, z0: z0 + inset, z1: z1 - inset, per: per - 8 * inset, d: rnd() * per, v: .9 + rnd() * .8, dir: rnd() < .5 ? 1 : -1, x: 0, z: 0, push: new THREE.Vector2(), scare: 0, ph: rnd() * 6, wait: 0 });
    people[n].shirt = new THREE.Color(SHIRTS[Math.floor(rnd() * SHIRTS.length)]); people[n].skin = new THREE.Color(SKIN[Math.floor(rnd() * SKIN.length)]);
    people[n].pants = new THREE.Color([0x1e2a44, 0x222226, 0x5a4a3a, 0x2f4a6a, 0x6a6a70, 0x111111][Math.floor(rnd() * 6)]); people[n].hairC = new THREE.Color([0x1a120c, 0x3a2414, 0x0c0c0c, 0x8a6a3a, 0x6a3a1a, 0xb0a090][Math.floor(rnd() * 6)]);
    const q = people[n], role = rnd();
    q.h = .9 + rnd() * .17; q.wd = .88 + rnd() * .26;                        // height and build
    q.jog = role < .07; q.phone = !q.jog && role < .2; q.dog = !q.jog && !q.phone && role < .26;
    if (q.jog) { q.v = 2.6 + rnd() * .8; q.shirt.setHex([0xff4fd8, 0x3df5ff, 0xc0d84a, 0xff7a2e, 0xffffff][Math.floor(rnd() * 5)]); q.pants.setHex(0x1b1c20); }
    if (q.dog) { q.v *= .8; q.dogC = new THREE.Color([0xd9b27a, 0x3a2a1e, 0xf2f2f0, 0x6b6b6b, 0x111111, 0xb5651d][Math.floor(rnd() * 6)]); q.dogS = .75 + rnd() * .55; }
    q.hat = !q.jog && rnd() < .22 ? new THREE.Color([0x1b1c20, 0xb22234, 0x2e5aa8, 0xd8cfb8, 0x2f6b3a][Math.floor(rnd() * 5)]) : null;
    q.bag = !q.jog && rnd() < .2 ? new THREE.Color([0x222226, 0x5a3a2a, 0x2e5aa8, 0x8a1a14, 0x3a4a3a][Math.floor(rnd() * 5)]) : null;
    q.skirt = !q.jog && rnd() < .2 ? new THREE.Color([0x111111, 0x6b1a1a, 0x24364f, 0xd8cfb8, 0x7a2a8a, 0x2f4a3a][Math.floor(rnd() * 6)]) : null;
    q.umb = new THREE.Color([0x111111, 0xb22234, 0x2e5aa8, 0xf7c414, 0x2f6b3a, 0xe8e8e8][Math.floor(rnd() * 6)]); q.umbOK = !q.jog && rnd() < .75;
  }
  for (const m of ALLP) m.setColorAt(0, col);
  const around = (p, d, out) => {           // a point on the rectangle loop round the block
    const w = p.x1 - p.x0, h = p.z1 - p.z0; d = ((d % p.per) + p.per) % p.per;
    if (d < w) { out.x = p.x0 + d; out.z = p.z0; out.yaw = 0; }
    else if ((d -= w) < h) { out.x = p.x1; out.z = p.z0 + d; out.yaw = Math.PI / 2; }
    else if ((d -= h) < w) { out.x = p.x1 - d; out.z = p.z1; out.yaw = Math.PI; }
    else { d -= w; out.x = p.x0; out.z = p.z1 - d; out.yaw = -Math.PI / 2; }
    return out;
  };

  // ---- per frame ----
  const legQ = new THREE.Quaternion(), legM = new THREE.Matrix4(), legT = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1), squash = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  const buckets = new Map(), tmp = {}, cell = new Map(), CELL = 30;
  let frameN = 0, debLive = 1, crashT = 0, reckT = 6;
  const MASS = { bus: 4, truck: 3.5, sixer: 3, monster: 2.6, van: 1.6, suv: 1.4, pickup: 1.5, limo: 1.5, compact: .75, hatch: .85, buggy: .7 };
  const LEGS = [[null, 1, .1], [null, -1, -.1]], pscale = new THREE.Vector3();
  function decide(c, k) {       // at the crossing k: straight on, or turn onto the cross road
    const axis = c.axis, ok = segOK(axis, c.road, c.dir > 0 ? k : k - 1), oAxis = 1 - axis, oRoad = k;
    const opts = [];
    for (const nd of [1, -1]) if (segOK(oAxis, oRoad, nd > 0 ? c.road : c.road - 1)) opts.push(nd);
    if (ok && (rnd() < .7 || !opts.length)) return;
    if (!opts.length) { c.dir *= -1; return; }                                   // dead end: turn round
    const nd = opts[Math.floor(rnd() * opts.length)], lo = laneOffs(oAxis, oRoad), lane = lo[Math.min(lo.length - 1, laneOffs(axis, c.road).indexOf(c.lane))] ?? lo[0];
    const cx = cross(axis, k), p0 = { x: c.x, z: c.z };
    const corner = axis === 0 ? { x: roadC(1, oRoad) - lane * nd, z: c.z } : { x: c.x, z: roadC(0, oRoad) + lane * nd };
    const R = Math.max(4, Math.hypot(corner.x - p0.x, corner.z - p0.z));
    const p2 = axis === 0 ? { x: corner.x, z: corner.z + nd * R } : { x: corner.x + nd * R, z: corner.z };
    void cx;
    c.turn = { t: 0, len: R * 1.6, p0, p1: corner, p2, axis: oAxis, road: oRoad, dir: nd, lane };
  }
  // how badly a car is hit decides what happens to it: a dent and a stop, a crumpled wreck that slides,
  // or (really hard) it flips, flies and sheds parts
  function smash(c, vx, vz, power) {
    if (power < 14 && !c.wreck) {
      c.dent = Math.min(1, (c.dent || 0) + .45); c.stop = 5 + rnd() * 3; c.v = 0; c.col.multiplyScalar(.82); c.yaw += (rnd() - .5) * .5; c.x += vx * .05; c.z += vz * .05;
      debLive = 1; for (let k = 0; k < 4; k++) { const di = debI++ % DEB, d = deb[di]; d.life = 1.5; d.p.set(c.x, .8, c.z); d.v.set((rnd() - .5) * 6, 2 + rnd() * 3, (rnd() - .5) * 6); d.w.set(rnd() * 8, rnd() * 8, rnd() * 8); debris.setColorAt(di, col.setHex(c.color)); }
      if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
      return;
    }
    const fly = power > 28;
    c.crush = fly ? .72 : .82;
    c.wreck = fly ? { t: 0, vx: vx * .8 + (rnd() - .5) * 4, vz: vz * .8 + (rnd() - .5) * 4, vy: 4 + power * .25, wx: (rnd() - .5) * 8, wy: (rnd() - .5) * 6, wz: (rnd() - .5) * 8 }
      : { t: 0, vx: vx * .45, vz: vz * .45, vy: 0, wx: 0, wy: (rnd() - .5) * 3, wz: 0 };
    c.y = 0; c.rx = 0; c.rz = 0; c.v = 0; c.turn = null;
    c.col.setHex(c.color).multiplyScalar(fly ? .28 : .45);
    debLive = 1; for (let k = 0; k < (fly ? 14 : 6); k++) {
      const di = debI++ % DEB, d = deb[di]; d.life = 3 + rnd() * 2; d.p.set(c.x, 1, c.z); d.v.set(vx * .6 + (rnd() - .5) * 14, 3 + rnd() * 9, vz * .6 + (rnd() - .5) * 14); d.w.set(rnd() * 12, rnd() * 12, rnd() * 12); d.c = k % 3 ? c.color : 0x222222;
      debris.setColorAt(di, col.setHex(d.c));
    }
    if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  }
  const birdGeo = { body: mergeGeometries([C(.06, .045, .26, 6, 0, 0, 0, [1, 1, 1]).rotateZ(Math.PI / 2), B(.09, .09, .08, .14, .05, 0, [1, 1, 1]), B(.04, .02, .02, .2, .04, 0, [.9, .6, .2])]),
    wing: (() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([.06, 0, 0, -.08, 0, 0, -.02, .1, .26, .06, 0, 0, -.02, .1, -.26, -.08, 0, 0], 3)); g.computeVertexNormals(); return tint(g, [.75, .75, .8]); })() };
  const birdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide });
  const flocks = [], NB = COARSE ? 90 : 220;
  for (let f = 0; f < NB / 11; f++) {
    let hx, hz;
    if (f % 3 === 0) { const pkk = GRID.park; hx = ax(pkk.i0) + rnd() * (ax(pkk.i1) - ax(pkk.i0)); hz = sz(pkk.j0) + rnd() * (sz(pkk.j1) - sz(pkk.j0)); }
    else { const i = Math.floor(rnd() * (NX - 1)), j = Math.floor(rnd() * (NZ - 1)); hx = ax(i) + avW(i) / 2 + 2.2; hz = sz(j) + stW(j) / 2 + 2.2 + rnd() * 20; }
    flocks.push({ hx, hz, birds: Array.from({ length: 11 }, () => ({ x: hx + (rnd() - .5) * 5, z: hz + (rnd() - .5) * 5, y: 0, vx: 0, vy: 0, vz: 0, yaw: rnd() * 6, fly: 0, ph: rnd() * 6, peck: rnd() * 3 })) });
  }
  const birdBody = new THREE.InstancedMesh(birdGeo.body, birdMat, NB), birdWing = new THREE.InstancedMesh(birdGeo.wing, birdMat, NB);
  for (const m of [birdBody, birdWing]) { m.frustumCulled = false; m.layers.set(1); scene.add(m); }
  const bq = new THREE.Quaternion(), be = new THREE.Euler(), bs = new THREE.Vector3();
  function updateBirds(dt, time, player, camPos) {
    let k = 0; const cx = camPos ? camPos.x : 0, cz = camPos ? camPos.z : 0;
    for (const fl of flocks) {
      if (Math.abs(fl.hx - cx) > 260 || Math.abs(fl.hz - cz) > 260) continue;          // far flocks just sit there
      const scare = player && Math.hypot(player.x - fl.hx, player.z - fl.hz) < (player.foot ? 7 : 14) + (player.speed || 0) * .3 && player.y < 6;
      for (const b of fl.birds) {
        if (scare && b.fly <= 0) { const a = Math.atan2(b.z - player.z, b.x - player.x) + (rnd() - .5); b.fly = 6 + rnd() * 5; b.vx = Math.cos(a) * (4 + rnd() * 3); b.vz = Math.sin(a) * (4 + rnd() * 3); b.vy = 3 + rnd() * 2; }
        if (b.fly > 0) {                                                                 // up and away, a lazy circle, then back down home
          b.fly -= dt; const home = b.fly < 3; const tx = home ? fl.hx - b.x : 0, tz = home ? fl.hz - b.z : 0;
          b.vx += (tx * .6 - b.vx * (home ? .8 : .05)) * dt; b.vz += (tz * .6 - b.vz * (home ? .8 : .05)) * dt; b.vy += ((home ? -1.5 : (b.y < 9 ? 1.2 : -.2)) - b.vy) * dt * 1.5;
          b.x += b.vx * dt; b.z += b.vz * dt; b.y = Math.max(0, b.y + b.vy * dt); b.yaw = Math.atan2(b.vz, b.vx);
          if (b.fly <= 0 || (home && b.y <= 0 && Math.hypot(tx, tz) < 4)) { b.fly = 0; b.y = 0; }
        } else if ((b.peck -= dt) < 0) { b.peck = 1 + rnd() * 3; b.yaw += (rnd() - .5) * 2; const st = rnd() * .6; b.x += Math.cos(b.yaw) * st; b.z += Math.sin(b.yaw) * st; }
        const flap = b.fly > 0 ? Math.sin(time * 26 + b.ph) * 1.6 : .15, bob = b.fly > 0 ? 0 : Math.max(0, Math.sin(time * 6 + b.ph)) * .03;
        be.set(0, -b.yaw, b.fly > 0 ? 0 : -.25 * Math.max(0, Math.sin(time * 3 + b.ph)), "YXZ"); bq.setFromEuler(be);
        m4.compose(pos.set(b.x, b.y + .1 + bob, b.z), bq, one); birdBody.setMatrixAt(k, m4); birdBody.setColorAt(k, col.setRGB(.42, .44, .5));
        m4.compose(pos.set(b.x, b.y + .14, b.z), bq, bs.set(1, flap, 1)); birdWing.setMatrixAt(k, m4); k++;
        if (k >= NB) break;
      }
      if (k >= NB) break;
    }
    for (const m of [birdBody, birdWing]) { m.count = k; m.visible = k > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  const NONE = [], near = (x, z) => cell.get(Math.floor(x / CELL) * 7919 + Math.floor(z / CELL)) || NONE;

  const api = { detail: 1 };
  return {
    get detail() { return api.detail; }, set detail(v) { api.detail = v; },
    cars, people, meshes, smash, near, models: CAR_MODELS,
    set onHit(f) { api.onHit = f; }, set onCrash(f) { api.onCrash = f; },
    // the flying VOID cars: the real car's shape, or (Lite) the simple low-poly body traffic uses
    setVoidGeo(geo) { const M = meshes[KINDS.findIndex(k => k.id === "voidcar")]; if (!M) return; M.simple = M.simple || { body: M.body.geometry, lights: M.lights.geometry }; geo.setAttribute("aRust", M.simple.body.attributes.aRust); M.full = geo; },
    setVoidDetail(full) { const M = meshes[KINDS.findIndex(k => k.id === "voidcar")]; if (!M || !M.full) return; M.body.geometry = full ? M.full : M.simple.body; M.lights.geometry = full ? jetGeo : M.simple.lights; }, set collide(f) { api.collide = f; }, set raining(v) { api.raining = v; }, set night(v) { api.night = v; },
    take(c) { c.taken = true; c.parked = false; c.turn = null; },
    park(c, x, z, yaw) { Object.assign(c, { taken: false, parked: true, x, z, yaw, v: 0, y: 0, wreck: null, turn: null, crush: 0 }); },
    geoOf(k) { const m = meshes[KINDS.indexOf(k)]; return m ? { body: m.body.geometry, lights: m.lights.geometry } : null; },
    honk(x, z) { for (const p of people) if (Math.abs(p.x - x) < 25 && Math.abs(p.z - z) < 25) p.scare = 2; },
    // cars near a point (for the player's collision tests)
    nearCars(x, z, r) { const out = []; for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (const c of cell.get(cx * 7919 + cz) || []) out.push(c); return out; },
    update(dt, time, player, camPos) {
      frameN++;
      const px = player ? player.x : camPos ? camPos.x : 0, pz = player ? player.z : camPos ? camPos.z : 0;
      const relead = frameN % 4 === 1; if (relead) for (const b of buckets.values()) b.length = 0; for (const b of cell.values()) b.length = 0;
      const cx0 = camPos ? camPos.x : px, cz0 = camPos ? camPos.z : pz, alt = camPos ? Math.max(0, camPos.y) : 0;
      const D = api.detail || 1, RC = Math.min(900, ((COARSE ? 260 : 380) + alt * 2) * D), RC2 = RC * RC, RP = Math.min(260, ((COARSE ? 90 : 140) + alt * .4) * D), RP2 = RP * RP;
      for (const m of meshes) m.k = 0;
      if (relead) for (const c of cars) {
        if (c.wreck || c.turn || c.taken || c.parked) continue;
        const key = c.axis * 100000 + c.road * 1000 + (c.dir > 0 ? 500 : 0) + Math.round(c.lane * 10) + (c.fly ? 200 + Math.round(c.fly / 25) * 20 : 0);
        let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(c);
      }
      if (relead) for (const b of buckets.values()) if (b.length) { b.sort((a, d) => a.s * a.dir - d.s * d.dir); for (let k = 0; k < b.length; k++) b[k].lead = b[k + 1] || null; }
      for (const c of cars) {
        const far = (Math.abs(c.x - px) > 450 || Math.abs(c.z - pz) > 450) && (Math.abs(c.x - cx0) > RC || Math.abs(c.z - cz0) > RC);
        if (c.taken) continue;
        const vfar = far && (Math.abs(c.x - px) > 1200 || Math.abs(c.z - pz) > 1200), every = vfar ? 15 : 6;   // far away nobody sees them: move them in big, rare steps
        if (far && (frameN + c.n) % every) { continue; }
        const h = far ? dt * every : dt;
        if (c.wreck) {                                   // a smashed car tumbles, bounces, then lies there smoking until it is towed
          const w = c.wreck; w.t += h;
          if (c.y > 0 || w.vy > 0) { w.vy -= 9.81 * h; c.y = Math.max(0, c.y + w.vy * h); c.rx += w.wx * h; c.rz += w.wz * h; c.yaw += w.wy * h; if (c.y === 0) { w.vy = -w.vy * .3; w.wx *= .5; w.wz *= .5; w.wy *= .5; if (Math.abs(w.vy) < 1) w.vy = 0; } }
          c.x += w.vx * h; c.z += w.vz * h; const f = Math.pow(c.y > 0 ? .9 : .2, h); w.vx *= f; w.vz *= f;
          if (c.y === 0) { c.rx = Math.round(c.rx / Math.PI) * Math.PI * .02 + c.rx * .98; c.rz = Math.round(c.rz / Math.PI) * Math.PI * .02 + c.rz * .98; }
          if (w.t > 24) { place(c); posOf(c); c.rx = c.rz = c.y = 0; c.col.setHex(c.color); c.crush = 0; c.dent = 0; }
        } else if (c.parked) {
          c.v = 0;
        } else if (c.turn) {
          const T = c.turn; T.t += c.v * h / T.len; const t = Math.min(1, T.t), a = 1 - t;
          const nx = a * a * T.p0.x + 2 * a * t * T.p1.x + t * t * T.p2.x, nz = a * a * T.p0.z + 2 * a * t * T.p1.z + t * t * T.p2.z;
          const dx = 2 * a * (T.p1.x - T.p0.x) + 2 * t * (T.p2.x - T.p1.x), dz = 2 * a * (T.p1.z - T.p0.z) + 2 * t * (T.p2.z - T.p1.z);
          c.x = nx; c.z = nz; c.yaw = Math.atan2(dz, dx); c.v += (Math.min(c.want, 7) - c.v) * Math.min(1, h * 2);
          if (t >= 1) { Object.assign(c, { axis: T.axis, road: T.road, dir: T.dir, lane: T.lane, s: T.axis === 0 ? c.x : c.z, turn: null }); c.lastK = -99; }
        } else {
          let want = c.reck > 0 ? Math.max(c.want, 26) : c.want;
          if (c.reck > 0) c.reck -= h;
          if (c.crashT > 0) c.crashT -= h;
          // the next crossing ahead and its light
          const along = c.axis === 0 ? (c.s - X0) / AV : (c.s - Z0) / ST, k = c.dir > 0 ? Math.floor(along) + 1 : Math.ceil(along) - 1;
          const lim = c.axis === 0 ? NX : NZ;
          if (k >= 0 && k < lim) {
            const cc = cross(c.axis, k), stop = cc - c.dir * (crossW(c.axis, k) / 2 + 2.5), dist = (stop - c.s) * c.dir;
            const ph = c.axis === 0 ? phase(k, c.road, time) : phase(c.road, k, time), green = c.axis === 0 ? ph === 0 : ph === 2, amber = c.axis === 0 ? ph === 1 : ph === 3;
            if (!green && !c.fly && !(c.reck > 0) && dist > (amber ? 10 : -.5) && dist < 40) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 4.5 * (dist - .5))));
            // green, but someone is still in the junction: wait for them (reckless drivers don't)
            if (!c.fly && !(c.reck > 0) && dist > -.5 && dist < 9 && !far) {
              const ix = c.axis === 0 ? cc : roadC(1, c.road), iz = c.axis === 0 ? roadC(0, c.road) : cc, hx = (c.axis === 0 ? crossW(0, k) : avW(c.road)) / 2 + 1.5, hz = (c.axis === 0 ? stW(c.road) : crossW(1, k)) / 2 + 1.5;
              for (const o of near(ix, iz)) if (o !== c && !o.fly && !o.wreck && o.axis !== c.axis && o.v > 1.5 && Math.abs(o.x - ix) < hx && Math.abs(o.z - iz) < hz) { want = Math.min(want, Math.sqrt(Math.max(0, 2 * 6 * (dist - .5)))); break; }
            }
            if (dist < 0 && c.lastK !== k) { c.lastK = k; decide(c, k); }
          } else if ((c.dir > 0 && c.s > cross(c.axis, lim - 1) - 12) || (c.dir < 0 && c.s < cross(c.axis, 0) + 12)) c.dir *= -1;
          // keep a gap to the car in front
          if (c.lead) { const gap = (c.lead.s - c.s) * c.dir - (c.kind.L + c.lead.kind.L) / 2;
            if (c.reck > 0) { if (gap < 9) want = Math.min(want, c.lead.v * .6); }          // a reckless driver tailgates and brakes far too late
            else want = Math.min(want, gap < 2.5 ? 0 : Math.max(0, (gap - 2.5) * 1.1), c.lead.v + gap * .4); }
          // and to the player
          if (c.fly) c.y = c.fly + Math.sin(time * 1.3 + c.n) * .6;
          if (player && player.y < 3 && !c.fly && !far) {
            const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), dx = player.x - c.x, dz = player.z - c.z, ah = dx * cy + dz * sy, sd = -dx * sy + dz * cy;
            if (ah > 0 && ah < 22 && Math.abs(sd) < 2.6) want = Math.min(want, Math.max(0, (ah - 6) * .8));
            // something fast coming at us: brake hard and swerve out of its path
            const rvx = (player.vx || 0) - cy * c.v, rvz = (player.vz || 0) - sy * c.v, d = Math.hypot(dx, dz) || 1, closing = -(dx * rvx + dz * rvz) / d;
            if (closing > 7 && d < 34 && d / closing < 1.7 && !(c.reck > 0)) { want = 0; c.dodgeT = 1.4; c.dodgeS = sd > 0 ? -1 : 1; }
          }
          if (c.dodgeT > 0) c.dodgeT -= h;
          c.dodge = (c.dodge || 0) + ((c.dodgeT > 0 ? c.dodgeS * 2.4 : 0) - (c.dodge || 0)) * Math.min(1, h * 3.5);
          if (c.stop > 0) { c.stop -= h; want = 0; }                 // dented: it stops a while before driving on
          c.v += Math.max(-9 * h, Math.min(3 * h, want - c.v));
          if (!c.turn) { c.s += c.v * c.dir * h; posOf(c); }
        }
        if (!far) { const key = Math.floor(c.x / CELL) * 7919 + Math.floor(c.z / CELL); let b = cell.get(key); if (!b) cell.set(key, b = []); b.push(c); }
        const ddx = c.x - cx0, ddz = c.z - cz0;
        if (ddx * ddx + ddz * ddz < RC2) {
          e.set(c.rx, -c.yaw, c.rz + (c.turn ? (c.fly ? .25 : .05) : 0), "YXZ"); q.setFromEuler(e); const md = c.model; m4.compose(pos.set(c.x, c.y, c.z), q, squash.set(md.sl, (c.crush || 1 - (c.dent || 0) * .07) * md.sh, md.sw));
          const M = meshes[c.ti], k = M.k++; M.body.setMatrixAt(k, m4); M.body.setColorAt(k, c.col); M.body.rust[k] = c.rust;
          if (c.fly && !c.wreck && c.kind.id !== "hover" && jk < 900) jets.setMatrixAt(jk++, m4);
          if (!c.fly && c.y < 1.5 && bk2 < 2200 && ddx * ddx + ddz * ddz < 40000) {
            bE.set(0, -c.yaw, 0); bQ.setFromEuler(bE); m4.compose(bP.set(c.x, .045, c.z), bQ, bS.set(c.kind.L * md.sl * 1.25, 1, c.kind.W * md.sw * 1.5)); blobs.setMatrixAt(bk2++, m4);
            if (api.night && !c.wreck && hk2 < 600 && ddx * ddx + ddz * ddz < 25600) { const L = c.kind.L * md.sl; m4.compose(bP.set(c.x + Math.cos(c.yaw) * (L / 2 + 4.5), .05, c.z + Math.sin(c.yaw) * (L / 2 + 4.5)), bQ, bS.set(9, 1, 5.5)); beams.setMatrixAt(hk2++, m4); }
          } M.lights.setMatrixAt(k, c.wreck ? m4.compose(pos, q, zero) : m4); }
      }
      // collisions among the cars near the camera: a hard hit wrecks both, mass and momentum decide where they go
      crashT += dt;
      if (crashT > .05) { crashT = 0;
        for (const list of cell.values()) for (const a of list) {
          const sa = a.wreck ? Math.hypot(a.wreck.vx, a.wreck.vz) : a.v; if (sa < 4 || a.taken) continue;
          const ra = (a.kind.L + a.kind.W) / 4 * (a.model.sl || 1);
          for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
            const l2 = cell.get((Math.floor(a.x / CELL) + gx) * 7919 + Math.floor(a.z / CELL) + gz); if (!l2) continue;
            for (const b of l2) {
              if (b === a || b.taken || (a.crashT > 0 && b.crashT > 0) || Math.abs((a.y || 0) - (b.y || 0)) > 1.6) continue;
              const rb = (b.kind.L + b.kind.W) / 4 * (b.model.sl || 1), dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
              if (d > (ra + rb) * .85 || d < .01) continue;
              const va = a.wreck ? [a.wreck.vx, a.wreck.vz] : [Math.cos(a.yaw) * a.v, Math.sin(a.yaw) * a.v], vb = b.wreck ? [b.wreck.vx, b.wreck.vz] : [Math.cos(b.yaw) * b.v, Math.sin(b.yaw) * b.v];
              const rel = Math.hypot(va[0] - vb[0], va[1] - vb[1]), nx = dx / d, nz = dz / d;
              if (rel < 6.5 || (!a.wreck && !b.wreck && a.turn && b.turn)) continue;
              const ma = MASS[a.kind.id] || 1, mb = MASS[b.kind.id] || 1, vmx = (va[0] * ma + vb[0] * mb) / (ma + mb), vmz = (va[1] * ma + vb[1] * mb) / (ma + mb);
              const hit = (c, m, s) => { const bounce = rel * .45 * (mb + ma - m) / (ma + mb); smash(c, vmx + s * nx * bounce, vmz + s * nz * bounce, rel * 1.25 * (ma + mb - m) / (ma + mb) * 2); if (c.wreck) { c.wreck.vx = vmx + s * nx * bounce; c.wreck.vz = vmz + s * nz * bounce; c.wreck.wy = (rnd() - .5) * rel * .4; } c.crashT = 1.2; };
              hit(a, ma, 1); hit(b, mb, -1);
              if (api.onCrash) api.onCrash((a.x + b.x) / 2, (a.z + b.z) / 2, rel);
            }
          }
        }
        // every so often somebody near you drives like a maniac
        if ((reckT -= .05) < 0 && player) { reckT = 9 + rnd() * 10; for (let t = 0; t < 40; t++) { const c = cars[Math.floor(rnd() * cars.length)], d = Math.hypot(c.x - player.x, c.z - player.z); if (!c.fly && !c.wreck && !c.taken && !c.parked && d > 70 && d < 260 && !(MASS[c.kind.id] > 1.5)) { c.reck = 20 + rnd() * 15; break; } } }
      }
      jets.count = jk; jets.visible = jk > 0; jets.instanceMatrix.needsUpdate = true; jk = 0;
      beams.count = hk2; beams.visible = hk2 > 0; beams.instanceMatrix.needsUpdate = true; hk2 = 0;
      for (const m of meshes) { m.body.count = m.lights.count = m.k; m.body.visible = m.lights.visible = m.k > 0; m.body.instanceMatrix.needsUpdate = m.lights.instanceMatrix.needsUpdate = true; if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true; m.body.geometry.attributes.aRust.needsUpdate = true; }
      // debris (skipped once every piece has landed and been hidden)
      if (debLive) { debLive = 0; for (let k = 0; k < DEB; k++) {
        const d = deb[k];
        if (d.life > 0) { debLive++; d.life -= dt; d.v.y -= 9.81 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y < .1) { d.p.y = .1; d.v.multiplyScalar(.5); d.v.y = Math.abs(d.v.y) * .4; d.w.multiplyScalar(.6); } d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt; q.setFromEuler(d.r); m4.compose(d.p, q, one); }
        else m4.compose(pos.set(0, -50, 0), q, zero);
        debris.setMatrixAt(k, m4); glassBits.setMatrixAt(k, d.life > 0 ? m4.compose(pos.copy(d.p).add({ x: .3, y: .2, z: -.2 }), q, one) : m4);
      }
      debris.instanceMatrix.needsUpdate = glassBits.instanceMatrix.needsUpdate = true; if (debLive) debLive++; else debLive = 0; }
      // people
      let pk = 0, hk = 0, bk = 0, sk = 0, uk = 0, dk = 0;
      for (let n = 0; n < people.length; n++) {
        const p = people[n];
        const far = (Math.abs(p.x - px) > 300 || Math.abs(p.z - pz) > 300) && (Math.abs(p.x - cx0) > RP || Math.abs(p.z - cz0) > RP);
        if (far && (frameN + n) % 8) continue;
        const h = far ? dt * 8 : dt;
        if (p.down > 0) { } else if (p.wait > 0) p.wait -= h; else { p.d += p.v * (p.scare > 0 ? 3 : 1) * p.dir * h; if (rnd() < .0008) p.wait = 2 + rnd() * 5; }
        around(p, p.d, tmp);
        let x = tmp.x, z = tmp.z;
        if (player && player.y < 4 && !(p.down > 0)) {   // a car coming: leap out of the way, or get knocked over if it is too quick
          const dx = x + p.push.x - player.x, dz = z + p.push.y - player.z, d = Math.hypot(dx, dz) || .01, r = player.foot ? 1.1 : 3 + Math.min(3, (player.speed || 0) * .04);
          if (d < 2.2 && (player.speed || 0) > 6 && !player.foot) {
            const sp = player.speed, k = Math.min(1, sp / 30), vx = player.vx || 0, vz = player.vz || 0, ux = dx / d, uz = dz / d, side = rnd() < .5 ? -1 : 1;
            p.down = 3 + Math.min(6, sp * .12); p.downT = p.down;
            p.fall = { vx: vx * (.55 + .3 * k) + ux * (1.5 + rnd() * 2.5), vz: vz * (.55 + .3 * k) + uz * (1.5 + rnd() * 2.5), y: .2, vy: Math.min(11, 1.8 + sp * (.16 + .1 * k)), rx: 0, rz: 0, wx: side * (2 + sp * .35), wz: (rnd() - .5) * (2 + sp * .2), spin: (rnd() - .5) * (3 + sp * .15), rot: 0, air: true };
            p.scare = 4; if (api.onHit) api.onHit(sp, x, z);
          }
          else if (d < r) { const k = (r - d) * Math.min(1, h * 10); p.push.x += dx / d * k; p.push.y += dz / d * k; p.scare = 2; }
        }
        if (p.down > 0) {
          const f = p.fall; p.down -= h;
          if (f.air) {                                         // flying: gravity, tumbling, a little air drag
            f.vy -= 9.81 * h; f.y += f.vy * h; f.rx += f.wx * h; f.rz += f.wz * h; f.rot += f.spin * h; const dr = Math.pow(.92, h); f.vx *= dr; f.vz *= dr;
            if (f.y <= 0) {                                    // hits the ground: bounce if it was hard, else stay down and slide
              f.y = 0; if (f.vy < -3.5) { f.vy = -f.vy * .28; f.wx *= .45; f.wz *= .45; f.spin *= .5; } else { f.vy = 0; f.air = false; }
            }
          } else { const fr = Math.pow(.04, h); f.vx *= fr; f.vz *= fr; const lay = Math.round(f.rx / Math.PI - .5) * Math.PI + Math.PI / 2; f.rx += (lay - f.rx) * Math.min(1, h * 8); f.rz += (0 - f.rz) * Math.min(1, h * 8); }
          let nx = p.push.x + f.vx * h, nz = p.push.y + f.vz * h;
          if (api.collide && api.collide(x + nx, z + nz)) { f.vx *= -.3; f.vz *= -.3; nx = p.push.x; nz = p.push.y; }      // walls stop them
          p.push.x = nx; p.push.y = nz;
        }
        if (p.scare > 0) p.scare -= h;
        if (!(p.down > 0)) p.push.multiplyScalar(1 - Math.min(1, h * (p.fall ? .5 : .25)));          // once back up they walk back to the pavement
        x += p.push.x; z += p.push.y; p.x = x; p.z = z;
        const walk = time * 7 * p.v * (p.scare > 0 ? 2 : 1) + p.ph, bob = p.wait > 0 ? 0 : Math.abs(Math.sin(walk)) * .05;
        const ex = x - cx0, ez = z - cz0;
        if (ex * ex + ez * ez < RP2) {
          const yaw = -(tmp.yaw + (p.dir < 0 ? Math.PI : 0));
          let lie = 0, y = bob + .06;
          let rx = 0, rz = 0;
          if (p.down > 0) { const f = p.fall; lie = p.down > 1.2 ? 1 : p.down / 1.2; rx = f.rx * lie; rz = f.rz * lie; y = f.y + .06 + Math.abs(Math.sin(rx)) * .14; }      // thrown, down, then back on their feet
          if (p.jog && !(p.down > 0)) y += Math.abs(Math.sin(walk)) * .06;
          e.set(rx + (p.jog && !(p.down > 0) ? 0 : 0), yaw + (p.fall ? p.fall.rot : 0), rz - (p.jog && !(p.down > 0) ? .12 : 0), "YXZ"); q.setFromEuler(e); m4.compose(pos.set(x, y, z), q, pscale.set(p.wd, p.h, p.wd));
          bodies.setMatrixAt(pk, m4); heads.setMatrixAt(pk, m4); hair.setMatrixAt(pk, m4);
          if (bk2 < 2200) { bE.set(0, yaw, 0); bQ.setFromEuler(bE); const sc = p.down > 0 ? 1.8 : .95; legM.compose(bP.set(x, .05, z), bQ, bS.set(sc * p.wd, 1, sc * .8 * p.wd)); blobs.setMatrixAt(bk2++, legM); }
          const amp = p.jog ? .85 : .5, swing = p.down > 0 ? (p.fall.air ? Math.sin(time * 19 + n) * .9 : .15) : p.wait > 0 ? 0 : Math.sin(walk) * amp;
          LEGS[0][0] = legL; LEGS[1][0] = legR; for (const [leg, sgn, off] of LEGS) { legQ.setFromAxisAngle(Z, swing * sgn); legM.compose(pos.set(0, .88, off), legQ, one); leg.setMatrixAt(pk, legT.copy(m4).multiply(legM)); }
          // arms swing against the legs; a phone or an umbrella keeps the right one up
          const rain = api.raining && p.umbOK && !(p.down > 0), flail = p.down > 0 && p.fall.air;
          const aL = flail ? Math.sin(time * 23 + n) * 1.6 : -swing * (p.jog ? 1.1 : .75), aR = flail ? -Math.sin(time * 21 + n) * 1.6 : p.phone && !(p.down > 0) ? 1.25 : rain ? .7 : swing * (p.jog ? 1.1 : .75);
          legQ.setFromAxisAngle(Z, aL); legM.compose(pos.set(0, 1.45, .245), legQ, one); armL.setMatrixAt(pk, legT.copy(m4).multiply(legM));
          legQ.setFromAxisAngle(Z, aR); legM.compose(pos.set(0, 1.45, -.245), legQ, one); armR.setMatrixAt(pk, legT.copy(m4).multiply(legM));
          bodies.setColorAt(pk, p.shirt); heads.setColorAt(pk, p.skin); legL.setColorAt(pk, p.pants); legR.setColorAt(pk, p.pants); hair.setColorAt(pk, p.hairC); armL.setColorAt(pk, p.shirt); armR.setColorAt(pk, p.shirt);
          if (p.hat && hk < NK) { hats.setMatrixAt(hk, m4); hats.setColorAt(hk++, p.hat); }
          if (p.bag && bk < NK) { bags.setMatrixAt(bk, m4); bags.setColorAt(bk++, p.bag); }
          if (p.skirt && sk < NK) { skirts.setMatrixAt(sk, m4); skirts.setColorAt(sk++, p.skirt); }
          if (rain) { umbs.setMatrixAt(uk, m4); umbs.setColorAt(uk++, p.umb); }
          if (p.dog && dk < dogs.instanceMatrix.count && !(p.down > 0)) {             // the dog trots beside and a little ahead
            const fx = Math.cos(yaw), fz = -Math.sin(yaw), sx = Math.sin(yaw), sz = Math.cos(yaw), d = p.wait > 0 ? .3 : .9;
            e.set(0, yaw, 0, "YXZ"); q.setFromEuler(e); m4.compose(pos.set(x + fx * d + sx * .65, Math.abs(Math.sin(walk * 1.6)) * .04, z + fz * d + sz * .65), q, pscale.setScalar(p.dogS));
            dogs.setMatrixAt(dk, m4); dogs.setColorAt(dk++, p.dogC);
          }
          pk++;
        }
      }
      blobs.count = bk2; blobs.visible = bk2 > 0; blobs.instanceMatrix.needsUpdate = true; bk2 = 0;
      for (const m of [bodies, heads, legL, legR, hair, armL, armR]) { m.count = pk; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      for (const [m, c] of [[hats, hk], [bags, bk], [skirts, sk], [umbs, uk], [dogs, dk]]) { m.count = c; m.visible = c > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      updateBirds(dt, time, player, camPos);
    },
  };
}
