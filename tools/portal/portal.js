// VOID on game portals. build.py puts this in front of the game with window.PORTAL set to "crazygames" or "poki".
// It loads the portal's SDK, brings back the cloud save, then starts the game, and turns the game's "void:*"
// events into SDK calls: loading, gameplay start/stop, an ad break after a race or a wreck, mute during ads.
(() => {
  const P = window.PORTAL, SAVE = "void-save";
  let sdk = null, adBusy = false, lastAd = 0;
  const fire = (n, d) => dispatchEvent(new CustomEvent("void:" + n, { detail: d }));
  const script = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  const timeout = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(ok, ms))]);
  const start = () => { const s = document.createElement("script"); s.type = "module"; s.src = window.VOID_MAIN; document.body.append(s); };
  const hide = sel => { const st = document.createElement("style"); st.textContent = sel + "{display:none!important}"; document.head.append(st); };

  // every void.* key in one blob, so the portal's save (signed-in players, across devices) carries all of it
  const pack = () => { const o = {}; try { for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key.startsWith("void.")) o[key] = localStorage.getItem(key); } } catch { } return JSON.stringify(o); };
  const unpack = raw => { try { const o = JSON.parse(raw || "{}"); for (const k in o) if (k.startsWith("void.")) localStorage.setItem(k, o[k]); } catch { } };
  let saveT = 0;
  window.portalSave = () => { if (P !== "crazygames" || !sdk) return; clearTimeout(saveT); saveT = setTimeout(() => { try { sdk.data.setItem(SAVE, pack()); } catch { } }, 1500); };

  async function boot() {
    try {
      if (P === "crazygames") {
        await timeout(script("https://sdk.crazygames.com/crazygames-sdk-v3.js"), 6000);
        if (window.CrazyGames) { await timeout(window.CrazyGames.SDK.init(), 6000); sdk = window.CrazyGames.SDK; }
        if (sdk) {
          try { sdk.game.loadingStart(); } catch { }
          try { unpack(sdk.data.getItem(SAVE)); } catch { }
          const apply = s => { fire("mute", !!(s && s.muteAudio)); document.body.classList.toggle("no-chat", !!(s && s.disableChat)); };
          try { apply(sdk.game.settings); sdk.game.addSettingsChangeListener(apply); } catch { }
        }
      } else if (P === "poki") {
        await timeout(script("https://game-cdn.poki.com/scripts/v2/poki-sdk.js"), 6000);
        if (window.PokiSDK) { await timeout(window.PokiSDK.init(), 6000); sdk = window.PokiSDK; }
      }
    } catch (e) { console.warn("portal SDK unavailable, playing without it", e); sdk = null; }
    start();
  }

  // online play: Poki allows no chat and no outside servers without its approval, so the Poki build is single player.
  // CrazyGames keeps online play; its "disable chat" setting turns voice chat and emotes off.
  if (P === "poki") hide("#gNetBtn,#gNetPanel,#gMic,#gEmotes,#gPlayers");
  hide("body.no-chat #gMic,body.no-chat #gEmotes");
  document.addEventListener("contextmenu", e => e.preventDefault());
  addEventListener("keydown", e => { if (["Space", "ArrowUp", "ArrowDown"].includes(e.code) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) e.preventDefault(); });

  addEventListener("void:loaded", () => {
    if (!sdk) return;
    if (P === "crazygames") { try { sdk.game.loadingStop(); } catch { } cgMulti(); }
    if (P === "poki") try { sdk.gameLoadingFinished(); } catch { }
  });

  // CrazyGames online play: an invite link for the room you're in, joining straight from one, and instant
  // multiplayer (a party leader lands in a fresh private room right away). Rooms hold up to 12 drivers.
  function cgMulti() {
    const net = window.VOID && window.VOID.net, g = sdk.game; if (!net) return;
    const name = () => { try { return JSON.parse(localStorage.getItem("void.name")) || "Driver"; } catch { return "Driver"; } };
    const join = id => { id = String(id || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24); if (id) net.join(/^(room|public)-/.test(id) ? id : "room-" + id, name()); };
    let invited = null; try { invited = g.getInviteParam("roomId"); } catch { }
    if (invited) join(invited); else if (g.isInstantMultiplayer) join(Math.random().toString(36).slice(2, 7));
    try { g.addJoinRoomListener(p => join(p && p.roomId)); } catch { }
    const btn = document.createElement("button"); btn.className = "pill solid"; btn.id = "gInvite"; btn.hidden = true; btn.textContent = "🔗 Invite friends";
    btn.onclick = async () => {
      try { const link = g.inviteLink({ roomId: net.room }); await navigator.clipboard.writeText(link); btn.textContent = "✅ Invite link copied"; }
      catch { btn.textContent = "Couldn't copy the link"; }
      setTimeout(() => btn.textContent = "🔗 Invite friends", 2500);
    };
    const panel = document.getElementById("gNetPanel"); if (panel) panel.insertBefore(btn, panel.querySelector(".row"));
    let last = null;
    const sync = () => {
      const room = net.online() ? net.room : null; btn.hidden = !room;
      if (room === last) return; last = room;
      try { if (room) { g.updateRoom({ roomId: room, isJoinable: true, inviteParams: { roomId: room } }); g.showInviteButton({ roomId: room }); } else { g.leftRoom(); g.hideInviteButton(); } } catch { }
    };
    net.on("change", sync); net.on("status", sync);
  }

  // gameplay: Poki counts it from the player's first input, CrazyGames from the moment the car is drivable
  let playing = false, wantPlay = false, gotInput = P !== "poki";
  const sync = () => {
    const on = wantPlay && gotInput && !adBusy;
    if (on === playing || !sdk) return; playing = on;
    try { if (P === "crazygames") on ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); else on ? sdk.gameplayStart() : sdk.gameplayStop(); } catch { }
  };
  for (const ev of ["keydown", "pointerdown"]) addEventListener(ev, () => { if (!gotInput && wantPlay) { gotInput = true; sync(); } }, true);
  addEventListener("void:gameplay", e => { wantPlay = !!e.detail; sync(); });

  // an ad between rounds: after a race ends or a wrecked car comes back. Never more than one every 3 minutes from
  // our side (the portals have their own limits too). The game is paused and silent until the ad is over.
  addEventListener("void:break", () => {
    if (!sdk || adBusy || Date.now() - lastAd < 180000) return;
    setTimeout(() => {
      if (adBusy) return; adBusy = true; lastAd = Date.now(); sync();
      const done = () => { adBusy = false; fire("ad", false); sync(); };
      if (P === "crazygames") {
        try { sdk.ad.requestAd("midgame", { adStarted: () => fire("ad", true), adFinished: done, adError: done }); } catch { done(); }
      } else {
        try { sdk.commercialBreak(() => fire("ad", true)).then(done, done); } catch { done(); }
      }
    }, 1200);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
