// Progression: 25 ranks earned with every dollar (a badge on the HUD and a plate on the car, a reward at each rank), the
// daily login streak (day 2 brings the Legion Phantom), coin milestones (every 5 coins pays, 40 unlock Prototype X), the
// Legion Collection (exclusive cars that are earned, not handed out, with 2-minute test drives), per-car tuning bought
// with cash, and the "next unlock" bar beside the cash so there is always something just ahead.
export const RANKS = ["Rookie Driver", "Street Novice", "Lane Runner", "Night Cruiser", "Corner Carver", "Drift Kid", "Asphalt Ace", "Turbo Tamer", "Boost Junkie", "Sky Hopper",
  "Ramp Rider", "Neon Racer", "Rooftop Rebel", "Wing Walker", "Cloud Breaker", "Sonic Driver", "Street Legend", "Sky Captain", "Storm Chaser", "Apex Predator",
  "Midnight King", "Hyper Pilot", "Legion Elite", "Void Walker", "Void Legend"];
const XP = n => n <= 0 ? 0 : Math.round(1500 * Math.pow(n, 1.75) / 100) * 100;          // lifetime cash needed to reach rank n+1
const STREAK = [1000, 2000, 3000, 4000, 5000, 7500, 15000];                                // day 1..7 of a login streak, then 10,000 a day
// the Legion Collection: [id, name, body, flies, price (0: earned), what unlocks it, top, acceleration, grip, colours]
export const EXCLUSIVE = [
  ["lx-starter", "Kova Starter R", "sports", false, 1500, "buy", 66, 1.25, 1.1, [0xf7c414, 0x111111]],
  ["lx-phantom", "Legion Phantom", "supercar", false, 0, "streak2", 95, 1.75, 1.3, [0x0a0a0c, 0xd4a83a]],
  ["lx-protox", "Prototype X", "hover", true, 0, "coins40", 100, 1.85, 1.25, [0xff3df0, 0x3df5ff]],
  ["lx-viper", "Legion Viper", "muscle", false, 0, "rank5", 82, 1.55, 1.05, [0x8a1a14, 0x111111]],
  ["lx-specter", "Legion Specter", "sports", true, 0, "rank10", 88, 1.6, 1.2, [0xe9e9ea, 0x9b5cff]],
  ["lx-nova", "Legion Nova", "supercar", false, 0, "rank15", 98, 1.8, 1.3, [0x3df5ff, 0x111111]],
  ["lx-halo", "Legion Halo", "coupe", true, 0, "rank20", 96, 1.75, 1.3, [0xf2f2f0, 0xd4a83a]],
  ["lx-legend", "Void Legend", "supercar", true, 0, "rank25", 108, 2.0, 1.4, [0xd4a83a]],
  ["lx-aurum", "Legion Aurum", "supercar", true, 500000, "buy", 104, 1.9, 1.35, [0xd4a83a, 0xffd23d]],
  ["lx-eclipse", "Legion Eclipse", "hover", true, 1000000, "buy", 112, 2.1, 1.4, [0x111111, 0xff2a3a]],
].map(([id, name, body, fly, price, req, top, acc, grip, cols]) => ({ id, name, body, fly, price, req, top, acc, grip, cols }));
export const TUNE = { top: ["Top speed", .04], nitro: ["Nitro capacity", .25], thrust: ["Flight thrust", .08], grip: ["Drift grip", .06] };
const TUNE_COST = [2500, 6000, 12000, 25000, 50000];

export function createProgress({ store, toast, sound, pop, pay, own, coins }) {
  let xp = store.get("void.xp") ?? 0, rank = 0; while (rank < 24 && xp >= XP(rank + 1)) rank++;
  const lx = new Set(store.get("void.lx") || []), tune = store.get("void.tune") || {};
  let streak = store.get("void.streak") || { last: "", n: 0, best: 0 }, streakNews = null, test = null;
  // the streak: consecutive days in a row (missing a day starts again at 1)
  {
    const d = new Date(), today = d.toDateString(), y = new Date(d.getTime() - 864e5).toDateString();
    if (streak.last !== today) { streak.n = streak.last === y ? streak.n + 1 : 1; streak.last = today; streak.best = Math.max(streak.best || 0, streak.n); store.set("void.streak", streak); streakNews = { n: streak.n, cash: STREAK[streak.n - 1] ?? 10000, next: STREAK[streak.n] ?? 10000 }; }
  }
  const met = ex => ex.req === "buy" ? false : ex.req === "streak2" ? (streak.best || streak.n) >= 2 : ex.req === "coins40" ? coins() >= 40 : ex.req.startsWith("rank") ? rank + 1 >= +ex.req.slice(4) : false;
  const reqText = ex => ex.req === "buy" ? `$${ex.price.toLocaleString()}` : ex.req === "streak2" ? "Play 2 days in a row" : ex.req === "coins40" ? "Find 40 hidden coins" : `Reach rank ${ex.req.slice(4)} (${RANKS[+ex.req.slice(4) - 1]})`;
  const frac = (ex, cash) => ex.req === "buy" ? cash / ex.price : ex.req === "streak2" ? Math.max(streak.best || 0, streak.n) / 2 : ex.req === "coins40" ? coins() / 40 : xp / XP(+ex.req.slice(4) - 1);
  function unlock(ex, quiet) { if (lx.has(ex.id)) return; lx.add(ex.id); store.set("void.lx", [...lx]); own(ex); if (!quiet) { toast(`👑 Unlocked: ${ex.name}! It's in VOID Motors`); pop && pop(`👑 ${ex.name.toUpperCase()} UNLOCKED`, "gold"); sound.win(); } }
  function check(quiet) { for (const ex of EXCLUSIVE) if (!lx.has(ex.id) && met(ex)) unlock(ex, quiet); }
  check(true);
  // the HUD: rank badge under the score, the next-unlock bar under the cash
  const $ = id => document.getElementById(id);
  const badge = document.createElement("div"); badge.className = "g-rank"; badge.id = "gRank";
  const nextEl = document.createElement("div"); nextEl.className = "g-next"; nextEl.id = "gNext"; nextEl.innerHTML = "<span></span><i></i>";
  const testEl = document.createElement("div"); testEl.className = "g-job g-test"; testEl.hidden = true;
  { const sc = document.querySelector(".hud-tl .g-score"); if (sc) sc.after(badge); const ch = $("gCash"); if (ch && ch.parentElement) ch.parentElement.after(nextEl); const top = document.querySelector(".hud-top"); if (top) top.prepend(testEl); }
  const badgeHTML = () => { const a = XP(rank), b = XP(rank + 1), v = rank >= 24 ? 1 : (xp - a) / (b - a); badge.innerHTML = `<b>R${rank + 1}</b><span>${RANKS[rank]}</span><i style="--v:${v.toFixed(3)}"></i>`; };
  badgeHTML();
  return {
    RANKS, EXCLUSIVE, TUNE, get rank() { return rank; }, get xp() { return xp; }, rankName: () => RANKS[rank], streak: () => streak, reqText, met, owns: id => lx.has(id),
    // every dollar earned is experience
    addXp(n) {
      if (!(n > 0)) return; xp += n; store.set("void.xp", xp);
      while (rank < 24 && xp >= XP(rank + 1)) { rank++; const reward = 1000 * (rank + 1); pay(reward); toast(`⭐ Rank ${rank + 1}: ${RANKS[rank]} · +$${reward.toLocaleString()}`); pop && pop(`⭐ RANK UP · ${RANKS[rank].toUpperCase()}`, "gold"); sound.win(); check(); }
      badgeHTML();
    },
    // the first drive of the day: the streak reward (once)
    greet() { if (!streakNews) return; const s = streakNews; streakNews = null; pay(s.cash); toast(`🔥 Day ${s.n} streak · +$${s.cash.toLocaleString()}${s.n === 1 ? " · come back tomorrow for the Legion Phantom" : ` · tomorrow +$${s.next.toLocaleString()}`}`); pop && pop(`🔥 DAY ${s.n} STREAK  +$${s.cash.toLocaleString()}`, "gold"); check(); },
    // a coin found: every 5 pays a bonus, 40 unlock Prototype X
    coin(n) { if (n % 5 === 0) { const b = 500 * (n / 5); pay(b); toast(`🪙 ${n} coins found · bonus $${b.toLocaleString()}`); pop && pop(`🪙 ${n} COINS  +$${b.toLocaleString()}`, "gold"); } check(); },
    bought(ex) { unlock(ex, true); },
    // per-car tuning: four stats, five levels each
    tuneLevel: (car, k) => (tune[car] || {})[k] || 0,
    tuneCost: lvl => TUNE_COST[lvl] ?? null,
    tuneBonus: (car, k) => ((tune[car] || {})[k] || 0) * TUNE[k][1],
    buyTune(car, k, spend) { const lvl = (tune[car] || {})[k] || 0, c = TUNE_COST[lvl]; if (c == null || !spend(c)) return false; (tune[car] = tune[car] || {})[k] = lvl + 1; store.set("void.tune", tune); sound.win(); return true; },
    // test drives: two minutes in a car you haven't unlocked yet
    startTest(id, name, secs = 120) { test = { id, name, t: secs }; testEl.hidden = false; toast(`🔑 Test drive: ${name} for 2 minutes`); },
    // once a second: the next unlock and the test-drive clock
    tick(dt, cash, rideId, endTest) {
      if (test) { test.t -= dt; testEl.textContent = `🔑 Test drive · ${test.name} · ${Math.floor(Math.max(0, test.t) / 60)}:${String(Math.floor(Math.max(0, test.t) % 60)).padStart(2, "0")}`;
        if (rideId !== test.id || test.t <= 0) { if (rideId === test.id) endTest(test); test = null; testEl.hidden = true; } }
      let best = null; for (const ex of EXCLUSIVE) { if (lx.has(ex.id)) continue; const f = Math.min(.999, frac(ex, cash)); if (!best || f > best.f) best = { ex, f }; }
      if (!best) { nextEl.hidden = true; return; }
      const ex = best.ex, label = ex.req === "buy" ? `$${Math.min(cash, ex.price).toLocaleString()} / $${ex.price.toLocaleString()}` : ex.req === "coins40" ? `${coins()}/40 🪙` : ex.req === "streak2" ? "play tomorrow" : `rank ${rank + 1}/${ex.req.slice(4)}`;
      nextEl.querySelector("span").textContent = `Next: ${ex.name} · ${label}`; nextEl.querySelector("i").style.setProperty("--v", best.f.toFixed(3)); nextEl.hidden = false;
    },
  };
}
