// VOID Motors: a dealership in the park with over 100 cars for sale in 14 categories, from microcars and work vans to
// rally cars, drift cars, electric cars, lowriders, off-roaders, track cars, hover cars and hypercars.
// Walk or drive up to the showroom (or open it from the Menu once you have been there) and buy with your cash.
// Bought cars are yours for good: pick one in the showroom and it is delivered next to you, wherever you are.
import * as THREE from "three";
import { GRID } from "./city.js";

const BASE = { compact: 6000, hatch: 8000, sedan: 10000, van: 9000, wagon: 11000, pickup: 14000, suv: 16000, classic: 22000, coupe: 25000, limo: 40000, muscle: 45000, sports: 60000, hover: 80000, supercar: 110000 };
const CLASS = { void: "VOID car (flies, 330 km/h)", taxi: "Taxi", police: "Police interceptor", bus: "Bus", truck: "Box truck", compact: "City car", hatch: "Hatchback", sedan: "Sedan", van: "Van", wagon: "Estate", pickup: "Pickup", suv: "SUV", classic: "Classic", coupe: "Coupe", limo: "Limousine", muscle: "Muscle", sports: "Sports", hover: "Hover car (flies)", supercar: "Hypercar" };

export function createDealer(W, game, life, nav, sound, store, toast, wallet) {
  const api = game.api, $ = id => document.getElementById(id);
  // 50 for sale: the best-kept models of every class (no rusty ones), more of the fast ones
  const per = { sports: 5, supercar: 5, hover: 5, muscle: 4, coupe: 4 };
  const STOCK = [];
  for (const cls of Object.keys(BASE)) {
    const ms = life.models.filter(m => m.kind.id === cls && !m.rust).sort((a, b) => b.top - a.top);
    for (const m of ms.slice(0, per[cls] || 3)) STOCK.push({ m, price: Math.round(BASE[cls] * (m.top / ms[ms.length - 1].top) * (.9 + m.acc * .1) / 500) * 500 });
  }
  STOCK.length = Math.min(50, STOCK.length);
  // the categories you shop by; the regular models go into one by body type
  const CAT_OF = { compact: "city", hatch: "city", sedan: "city", wagon: "city", van: "work", pickup: "suv", suv: "suv", classic: "classic", limo: "luxury", coupe: "sports", sports: "sports", muscle: "muscle", supercar: "hyper", hover: "flying" };
  for (const st of STOCK) st.cat = CAT_OF[st.m.kind.id];
  // and specials built for the showroom: same bodies, their own stance, power, grip and paint
  const kindOf = id => (life.models.find(m => m.kind.id === id) || life.models[0]).kind;
  const SPECIALS = [
    ["offroad", [["suv", "Trailcat"], ["pickup", "Mudslinger"], ["suv", "Basecamp XR"], ["pickup", "Raptor Dirt"], ["van", "Overland"], ["suv", "Boulder 4x4"]], { sh: 1.18, sw: 1.06, grip: 1.15, acc: 1.05, top: 46 }, [0x6b5a44, 0x2f4a3a, 0xc8962a, 0x8a1a14, 0x3a3d44], 26000],
    ["rally", [["hatch", "Gravel R"], ["compact", "Stage One"], ["hatch", "Group B"], ["wagon", "Rallye Avant"], ["coupe", "Special Stage"], ["hatch", "Snow Tyre"]], { sh: 1.05, grip: 1.35, acc: 1.25, top: 58 }, [0x2e5aa8, 0xf2f2f0, 0xf7c414, 0xd21f2b, 0x111111], 34000],
    ["drift", [["coupe", "Sideways"], ["sports", "Tandem"], ["coupe", "Smoke Show"], ["muscle", "Burnout"], ["sports", "Clutch Kick"], ["coupe", "Handbrake"]], { sh: .93, grip: .72, acc: 1.4, top: 64 }, [0xff4fd8, 0x3df5ff, 0x8acb1a, 0xff6a00, 0xf2f2f0, 0x111111], 38000],
    ["electric", [["sedan", "Volt S"], ["hatch", "Spark EV"], ["suv", "Current X"], ["supercar", "Ampere"], ["compact", "Zappy"], ["coupe", "Ion GT"], ["sedan", "Silent Line"]], { acc: 1.75, grip: 1.1, top: 62 }, [0xf2f2f0, 0x1f8a8a, 0x9fa3aa, 0x123a8c, 0x111111], 42000],
    ["lowrider", [["classic", "Hopper"], ["classic", "Candy Cruiser"], ["limo", "Boulevard"], ["sedan", "Low & Slow"], ["classic", "Hydraulics"], ["coupe", "Sunday Drive"]], { sh: .8, sl: 1.06, grip: .95, acc: .95, top: 44 }, [0x7a2a8a, 0xd2163c, 0x1f8a8a, 0xb8862a, 0x123a8c, 0xe8a6c0], 30000],
    ["track", [["supercar", "Circuit RS"], ["sports", "Apex Cup"], ["supercar", "Pole Position"], ["coupe", "Time Attack"], ["sports", "Slipstream"]], { sh: .92, grip: 1.3, acc: 1.55, top: 86 }, [0xf2f2f0, 0xd21f2b, 0xf7c414, 0x111111, 0x3df5ff], 95000],
    ["tiny", [["compact", "Bubble"], ["compact", "Pocket"], ["hatch", "Smart Dot"], ["compact", "Mini Moke"], ["compact", "Thimble"]], { sl: .78, sw: .9, sh: .95, acc: 1.1, top: 38, grip: 1.1 }, [0xf2a0b4, 0x9fd3e8, 0xc0d84a, 0xf7c414, 0xe8e6e0], 4500],
    ["work", [["taxi", "Yellow Cab"], ["police", "Interceptor"], ["bus", "City Bus"], ["truck", "Box Truck"], ["van", "Ice Cream Van"], ["pickup", "Tow Truck"]], {}, [], 18000],
    ["luxury", [["sedan", "Ambassador LX"], ["limo", "Royale Stretch"], ["suv", "Estate Black"], ["coupe", "Grand Tourer"], ["sedan", "Chauffeur"]], { sl: 1.05, acc: 1.15, grip: 1.05, top: 64 }, [0x0a0a0c, 0xf2f2f0, 0x2b2d32, 0x0d1838, 0x4a1270], 65000],
    ["flying", [["hover", "Skyrunner"], ["hover", "Cloud Nine"], ["hover", "Jetstream"]], { acc: 1.3, top: 76 }, [0x3df5ff, 0x9b5cff, 0xe9e9ea, 0xff4fd8], 120000],
  ];
  const BRAND = ["Aurex", "Kova", "Bellmont", "Zentri", "Harlow", "Vanta", "Ostrel", "Mirage", "Dunmore", "Caldera", "Nexo", "Ryden", "Solace", "Torvik"];
  let sd = 77; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (const [cat, list, mod, cols, base] of SPECIALS) list.forEach(([kid, word], i) => {
    const kind = kindOf(kid), ref = life.models.find(m => m.kind === kind && !m.rust) || life.models.find(m => m.kind === kind);
    const m = { id: `${cat}-${i}`, name: `${BRAND[(i * 3 + cat.length) % BRAND.length]} ${word}`, kind, sl: (mod.sl || 1) * (.97 + rr() * .06), sh: (mod.sh || 1) * (.98 + rr() * .04), sw: (mod.sw || 1),
      cols: cols.length ? cols : ref.cols, rust: 0, top: (mod.top || ref.top) * (.95 + rr() * .1), acc: (mod.acc || ref.acc) * (.95 + rr() * .1), grip: (mod.grip || ref.grip) * (.97 + rr() * .06) };
    STOCK.push({ m, cat, price: Math.round(base * (.8 + rr() * .5) * (m.top / 60) / 500) * 500 });
  });
  const CATS = { flying: "✈️ Flying", hyper: "🚀 Hypercars", track: "🏁 Track", sports: "🏎️ Sports", muscle: "💪 Muscle", drift: "🌀 Drift", rally: "🌲 Rally", electric: "⚡ Electric",
    luxury: "💎 Luxury", classic: "🕰️ Classic", lowrider: "🌴 Lowriders", offroad: "⛰️ Off-road", suv: "🚙 SUVs & pickups", city: "🏙️ Everyday", tiny: "🐞 Microcars", work: "🚕 Work & service" };
  // and the one everybody wants: your VOID car, the fastest thing in the city and the only car with wings
  const HERO = { id: "void", name: "VOID Hydra", kind: { id: "void", fly: true }, cols: [0x0a0a0c], top: 92, acc: 1.7, grip: 1.25, sl: 1, sh: 1, sw: 1 };
  STOCK.unshift({ m: HERO, price: 250000, hero: true, cat: "flying" });
  const owned = store.get("void.owned") || {};          // id -> colour
  if (wallet.heroOwned()) owned.void = 0x0a0a0c;
  // the showroom: a gold column, a sign, and three cars on turntables, on a quiet crossing near the start
  // on the lawn at the edge of the park, off the streets, so traffic never drives through it
  const at = (() => { const L = W.city.lake || { x: 1e9, z: 1e9 }; for (let j = 12; j < 18; j++) for (let i = 2; i < 5; i++) { const x = (GRID.ax(i) + GRID.ax(i + 1)) / 2, z = (GRID.sz(j) + GRID.sz(j + 1)) / 2; if (!api.hitBox(x, z, .5, 14) && !api.isWater(x, z) && Math.hypot(x - L.x, z - L.z) > 150) return { x, z }; } return { x: GRID.ax(4) + 40, z: GRID.sz(13) }; })();
  const scene = W.scene, root = new THREE.Group(); root.position.set(at.x, 0, at.z); scene.add(root);
  root.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 80, 32, 1, true).translate(0, 40, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(1.5), transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))));
  const sign = W.canvasTex(512, 128, (g, w, h) => { g.fillStyle = "#0b0b0e"; g.fillRect(0, 0, w, h); g.strokeStyle = "#ffd23d"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = "#ffd23d"; g.font = "900 58px Unbounded, Impact, sans-serif"; g.textAlign = "center"; g.fillText("VOID MOTORS", w / 2, 84); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sign, toneMapped: false })); sp.scale.set(18, 4.5, 1); sp.position.y = 11; root.add(sp);
  const plats = [];
  [[-9, 0], [0, -9], [9, 0]].forEach(([x, z], k) => {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, .25, 32), new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: .6, roughness: .3 })); pl.position.set(x, .12, z); root.add(pl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, .06, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23d).multiplyScalar(2), toneMapped: false })); ring.position.set(x, .27, z); root.add(ring);
    const s = STOCK[[STOCK.length - 1, STOCK.length - 6, STOCK.length - 11][k]] || STOCK[k + 1], geo = life.geoOf(s.m.kind);
    const car = new THREE.Group(); car.add(new THREE.Mesh(geo.body, new THREE.MeshStandardMaterial({ vertexColors: true, color: s.m.cols[0], roughness: .25, metalness: .6 })), new THREE.Mesh(geo.lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2, 2, 2) })));
    car.scale.set(s.m.sl, s.m.sh, s.m.sw); car.position.set(x, .25, z); root.add(car); plats.push(car);
  });

  let open = false, sel = null, filter = "all";
  const panel = document.createElement("div"); panel.className = "g-deal"; panel.id = "gDeal"; panel.hidden = true; document.getElementById("playUI").appendChild(panel);
  const kmh = m => Math.round(m.top * 3.6 * .82);
  const bar = (v, max) => `<i style="--v:${Math.min(1, v / max)}"></i>`;
  function render() {
    const list = STOCK.filter(s => filter === "all" || (filter === "owned" ? owned[s.m.id] : s.cat === filter));
    const s = sel || list[0]; sel = s;
    const cls = ["all", "owned", ...Object.keys(CATS)];
    panel.innerHTML = `<div class="deal-head"><h2>VOID Motors</h2><span class="deal-cash">$${wallet.cash().toLocaleString()}</span><button class="pill solid" id="gDealX">Close</button></div>
      <div class="deal-filters">${cls.map(c => `<button class="${c === filter ? "on" : ""}" data-f="${c}">${c === "all" ? `All ${STOCK.length}` : c === "owned" ? `Yours (${Object.keys(owned).length})` : `${CATS[c]} ${STOCK.filter(x => x.cat === c).length}`}</button>`).join("")}</div>
      <div class="deal-body"><div class="deal-list">${list.map(x => `<button class="deal-car${x === s ? " on" : ""}${owned[x.m.id] ? " own" : ""}" data-id="${x.m.id}"><span style="background:#${new THREE.Color(owned[x.m.id] || x.m.cols[0]).getHexString()}"></span><b>${x.m.name}</b><small>${(CATS[x.cat] || "").replace(/^\S+ /, "")} · ${CLASS[x.m.kind.id] || ""} · ${kmh(x.m)} km/h</small><em>${owned[x.m.id] ? "OWNED" : "$" + x.price.toLocaleString()}</em></button>`).join("") || `<p class="small">Nothing here yet.</p>`}</div>
      ${s ? `<div class="deal-info"><h3>${s.m.name}</h3><p class="small">${CATS[s.cat] || ""} · ${CLASS[s.m.kind.id] || ""}${s.m.kind.fly ? " · flies with F" : ""}</p>
        <div class="deal-stats"><label>Top speed<span>${kmh(s.m)} km/h</span>${bar(s.m.top, 92)}</label><label>Acceleration${bar(s.m.acc, 1.7)}</label><label>Grip${bar(s.m.grip, 1.25)}</label></div>
        <div class="deal-cols">${s.m.cols.map(c => `<button data-col="${c}" style="background:#${new THREE.Color(c).getHexString()}" class="${(owned[s.m.id] || s.m.cols[0]) === c ? "on" : ""}"></button>`).join("")}</div>
        ${owned[s.m.id] ? `<button class="pill solid deal-go" id="gDealDrive">Drive it</button>` : `<button class="pill solid deal-go" id="gDealBuy" ${wallet.cash() < s.price ? "disabled" : ""}>Buy for $${s.price.toLocaleString()}</button>${wallet.cash() < s.price ? `<p class="small">You need $${(s.price - wallet.cash()).toLocaleString()} more. Points from driving, races and contracts are cash.</p>` : ""}`}
      </div>` : ""}</div>`;
  }
  panel.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.id === "gDealX") return show(false);
    if (t.dataset.f) { filter = t.dataset.f; sel = null; return render(); }
    if (t.dataset.id) { sel = STOCK.find(x => x.m.id === t.dataset.id); return render(); }
    if (t.dataset.col && sel) { if (owned[sel.m.id]) { owned[sel.m.id] = +t.dataset.col; store.set("void.owned", owned); } else sel.pick = +t.dataset.col; for (const b of panel.querySelectorAll("[data-col]")) b.classList.toggle("on", b === t); return; }
    if (t.id === "gDealBuy" && sel && wallet.spend(sel.price)) { if (sel.hero) { wallet.unlockHero(); owned.void = 0x0a0a0c; show(false); return; } owned[sel.m.id] = sel.pick || sel.m.cols[0]; store.set("void.owned", owned); sound.win(); toast(`You bought the ${sel.m.name}!`); render(); }
    if (t.id === "gDealDrive" && sel) { show(false); if (sel.hero) api.useHero(); else api.deliver(sel.m, owned[sel.m.id]); }
  });
  function show(on) { open = on; panel.hidden = !on; game.pause(on); if (on) { render(); if (document.pointerLockElement) document.exitPointerLock(); store.set("void.dealerSeen", 1); } }
  const goBtn = document.createElement("button"); goBtn.className = "pill solid g-racego g-dealgo"; goBtn.hidden = true; goBtn.textContent = "Enter VOID Motors (Enter)"; goBtn.onclick = () => show(true); document.getElementById("playUI").appendChild(goBtn);
  addEventListener("keydown", e => { if (e.code === "Enter" && !open && api.active() && near()) show(true); });
  const near = () => { const p = api.state; return p && p.started && Math.hypot(p.x - at.x, p.z - at.z) < 16 && p.y < 3; };
  return {
    at, STOCK, owned, show, get open() { return open; },
    // from the Menu: open the showroom if you have visited it, otherwise set the GPS there
    menu() { if (store.get("void.dealerSeen")) show(true); else { nav.setDest({ name: "🏪 VOID Motors", x: at.x, z: at.z }); toast("GPS set to VOID Motors. Visit once and you can shop from the Menu"); } },
    update(dt, time) { plats.forEach((c, k) => c.rotation.y = time * .4 + k * 2); goBtn.hidden = open || !near(); },
  };
}
