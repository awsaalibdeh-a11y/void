// Challenges: fifteen goals tracked from what you do (kept on this device), each worth a trophy and 1000 points.
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
export const GOALS = [
  { id: "speed", icon: "🏎️", name: "Speed demon", text: "Hit 300 km/h", stat: "top", need: 300 },
  { id: "smash", icon: "💥", name: "Wrecking ball", text: "Smash 25 cars", stat: "smashed", need: 25 },
  { id: "drift", icon: "🌀", name: "Drift king", text: "One drift worth 1500", stat: "drift", need: 1500 },
  { id: "air", icon: "✈️", name: "Frequent flyer", text: "Spend 5 minutes in the air", stat: "air", need: 300 },
  { id: "pads", icon: "🛬", name: "Rooftop lander", text: "Land on 3 helipads", stat: "pads", need: 3 },
  { id: "butter", icon: "🧈", name: "Butter", text: "Make a butter-smooth landing", stat: "butter", need: 1 },
  { id: "race", icon: "🏁", name: "Champion", text: "Win a race", stat: "wins", need: 1 },
  { id: "cops", icon: "🚓", name: "Getaway", text: "Escape the police", stat: "escapes", need: 1 },
  { id: "rings", icon: "💍", name: "Ring master", text: "Fly through 10 rings", stat: "rings", need: 10 },
  { id: "road", icon: "🛣️", name: "Road trip", text: "Travel 25 km", stat: "km", need: 25 },
  { id: "fuel", icon: "⛽", name: "Pit stop", text: "Fill up at a station", stat: "refuels", need: 1 },
  { id: "coins", icon: "🪙", name: "Collector", text: "Find 20 hidden coins", stat: "coins", need: 20 },
  { id: "taxi", icon: "🚕", name: "Cabbie", text: "Complete 5 taxi fares", stat: "fares", need: 5 },
  { id: "tuner", icon: "🔧", name: "Tuner", text: "Buy 4 garage upgrades", stat: "upg", need: 4 },
  { id: "brooklyn", icon: "🌉", name: "Bridge and tunnel", text: "Cross the bridge to Brooklyn", stat: "brooklyn", need: 1 },
];
export function createGoals(onDone) {
  const S = Object.assign({ top: 0, smashed: 0, drift: 0, air: 0, pads: 0, butter: 0, wins: 0, escapes: 0, rings: 0, km: 0, refuels: 0, brooklyn: 0, best: 0, coins: 0, fares: 0, upg: 0, steals: 0, meds: 0 }, store.get("void.stats") || {});
  const done = new Set(store.get("void.goals") || []);
  let saveT = 0, lastSmash = null, lastRings = null, lastFuel = null, pads = new Set();
  function check() { for (const g of GOALS) if (!done.has(g.id) && S[g.stat] >= g.need) { done.add(g.id); store.set("void.goals", [...done]); onDone(g); } }
  return {
    stats: S, done, GOALS,
    // words from the score feed tell us about races, escapes and landings
    note(why) {
      if (/1st/.test(why)) S.wins++; if (/Fare \$/.test(why)) S.fares++; if (/got away/i.test(why)) S.escapes++; if (/Butter/.test(why)) S.butter++;
      if (/^Landed at (?!PARK)/.test(why)) S.pads++; if (/^Drift/.test(why)) { const n = +(why.match(/\d+/) || [0])[0]; }
      check();
    },
    drift(points) { S.drift = Math.max(S.drift, points); check(); },
    update(dt, st, speedKmh) {
      if (!st || !st.started) return;
      S.top = Math.max(S.top, speedKmh); S.km += speedKmh / 3600 * dt;
      if (st.mode === "air") S.air += dt;
      if (lastSmash != null && st.smashed > lastSmash) S.smashed += st.smashed - lastSmash; lastSmash = st.smashed;
      if (lastRings != null && st.rings > lastRings) S.rings += st.rings - lastRings; lastRings = st.rings;
      if (lastFuel != null && st.fuel - lastFuel > .02 && Math.hypot(st.vel.x, st.vel.z) < 4) { if (!st._fueling) { S.refuels++; st._fueling = true; } } else if (st.fuel < lastFuel) st._fueling = false;
      lastFuel = st.fuel;
      if (st.x > 1760 && Math.abs(st.z) < 900) S.brooklyn = 1;
      S.best = Math.max(S.best, st.score || 0);
      if ((saveT += dt) > 3) { saveT = 0; store.set("void.stats", S); check(); }
    },
  };
}
