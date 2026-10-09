// Boot. Deliberately thin: capability probe, locale, then hand off.
//
// The URL is the config surface (?seed, ?size, ?difficulty, ?terrain, ?water,
// ?disasters, ?join, ?debug, ?perf). Params are read at module evaluation, BEFORE the
// boot canonicalizes the URL — a module that reads them later finds them
// already stripped.
//
// **A URL that names a seed is a request for that exact city**, so it skips the
// new-game screen and starts. That is what makes a city a shareable link, and
// it is what every gate in `tools/` sends. With no seed, the player chooses.

import { loadLocale, localise, t } from "./i18n.js";
import { openSettings, loadSettings, applyDisplaySettings } from "./ui/settings.js";
import { mixerSettings } from "./ui/settings-model.js";
import { hasWebGL2, preferredLocale, prefersReducedMotion } from "./capabilities.js";
import { choicesFromParams, optionsFor, paramsForChoices } from "./lobby/options-model.js";
import { refusalKey } from "./lobby/join-model.js";
import { listSaves, getSave } from "./storage/db.js";
import { fromSave } from "../engine/save.js";
import { setBuildHash } from "../shared/build-hash.js";

const params = new URLSearchParams(globalThis.location?.search ?? "");
export const config = Object.freeze({
  seed: params.get("seed") ?? "",
  size: Number(params.get("size") ?? 0) || 0,
  join: params.get("join") ?? "",
  // Which seat to ask the door for. The LOBBY picks one (X2); until it exists,
  // `?join=<code>&seat=2` is how a second client gets in, and it is what
  // `room_smoke` drives. Zero means "whatever the room gives me", which the
  // door reads as seat 1.
  seat: Number(params.get("seat") ?? 0) || 0,
  // `?watch=1` joins a room WITHOUT taking a seat (X4e): a watcher sees the
  // city and gets no tools, so a full room is still watchable.
  watch: params.get("watch") === "1",
  locale: params.get("lang") ?? "",
  debug: params.get("debug") === "1",
  // `?perf=1` — the performance card (D1). It replaces the boot: the sweep
  // needs the saturated fixture and a camera nobody is touching, which is not
  // a game. `?perfHold=<seconds>` overrides every step's hold, so `ui_smoke`
  // can press the Copy button without paying for a real measurement.
  perf: params.get("perf") === "1",
  perfHold: Number(params.get("perfHold") ?? 0) || 0,
  // `?perfMap=big|steep` picks one of `MAPS` in `client/debug/perf-sweep.js`:
  // the bigger and the steeper city three open questions asked for (D6).
  perfMap: params.get("perfMap") ?? "",
  // `?life=0` freezes the traffic where it settled, so a gate that measures a
  // frame or compares two screenshots is looking at the same city twice.
  life: params.get("life") !== "0",
  // `?lock=0` refuses Pointer Lock, which is the only way to reach the
  // drag-look fallback on a browser that grants the lock — and the fallback is
  // what an embedded page and a player who has just pressed Escape get, so it
  // has to be gateable rather than argued about (K3, A58).
  lock: params.get("lock") !== "0",
  // `?style=painted` — the render style, which is chosen at boot because it
  // decides the materials (spec §7.1). There is no control for it yet: ruling
  // 033 names painted as the target and the decision to ship it is not this
  // slice's to take, but a gate that cannot reach a style cannot measure it,
  // and `budget_gate` has to (P2, Q47).
  style: params.get("style") ?? "",
  // `?funds=` — the treasury a NEW city starts with (W2). The gates used to
  // write `CITY.state.players[0].treasury` before building their fixture city;
  // since the simulation moved behind the seam that writes to a mirror and the
  // simulation never sees it, so the money has to be part of the city rather
  // than a poke at the copy of it. It is `startingTreasury`, which the engine
  // has always had as an option.
  funds: Number(params.get("funds") ?? 0) || 0,
  // `?worker=0` keeps the simulation on this thread (W2). It is the fallback's
  // lever: a path that only runs when something goes wrong is a path nothing
  // measures, and `tools/worker_smoke.mjs` drives both arms with it. It is also
  // what a gate uses when it deliberately drives the engine inside the page —
  // with the worker on, `CITY.state` is a mirror and writing to it changes a
  // copy the next patch overwrites.
  worker: params.get("worker") !== "0",
});

function show(html) {
  const app = document.getElementById("app");
  app.innerHTML = html;
  localise(app);
}

function notice(titleKey, bodyKey) {
  return `<div class="notice"><h1 data-i18n="${titleKey}"></h1><p data-i18n="${bodyKey}"></p></div>`;
}

/** Puts the chosen city in the address bar without reloading, so the browser's
 * back button and a copied link both land on the same region. */
function rememberInUrl(choices) {
  if (!globalThis.history?.replaceState) return;
  const query = paramsForChoices(choices);
  globalThis.history.replaceState({}, "", `${globalThis.location.pathname}?${query}`);
}

async function boot() {
  // Which build's RULES this client is running (X0, plan.md §3.9). The manifest
  // carries it beside the cache version, so there is still no build step, and
  // the join handshake has something real to compare — it was the literal "dev"
  // on both sides until now, which is a handshake that cannot refuse anything.
  // A failure here leaves it "dev", which is what a developer's client is.
  try {
    const manifest = await (await fetch("./client/precache.json", { cache: "no-store" })).json();
    setBuildHash(manifest.build);
  } catch { /* offline, or a client served without its manifest */ }

  // A stored preference beats the browser's guess, and `?lang=` beats both —
  // a link that names a language is someone showing the game to someone else.
  const settings = loadSettings(preferredLocale());
  await loadLocale(config.locale || settings.locale);
  applyDisplaySettings(settings);

  // Only when the player has not decided for themselves. `applyDisplaySettings`
  // has already set `data-motion` if they have.
  if (prefersReducedMotion() && !document.documentElement.dataset.motion) {
    document.documentElement.dataset.motion = "reduced";
  }

  if (!hasWebGL2()) {
    show(notice("boot.unsupported.title", "boot.unsupported.body"));
    return;
  }

  // The ruleset BEFORE the lobby, because the lobby generates a region and
  // worldgen reads `rules()` (P90). Quests are loaded later, in `startGame`,
  // where they are first needed.
  const { loadRuleset } = await import("./content.js");
  await loadRuleset();

  const app = document.getElementById("app");
  const { startGame } = await import("./game.js");

  let session;

  async function showSettings() {
    // Deferred to the close, not applied on the click: the card is a dialog of
    // its own and would otherwise open on top of the panel the player is
    // standing in — including on top of the row they just used (K3, A58).
    let wantsCard = false;
    await openSettings({
      onChange(next) {
        // Volume moves while the panel is open, so it is heard as it is set.
        session?.setAudioSettings(mixerSettings(next));
        // So does the quality tier (ruling 040) — everything but antialias,
        // which is a constructor argument of the WebGL context. A tier that
        // only took effect on the next city would be a control that appears to
        // do nothing, which is the failure ruling 026 is about.
        session?.setQuality(next.quality);
        session?.setProjection(next.camera);
        session?.setTime(next.time);
        // The style decides the materials, so it needs a rebuilt renderer —
        // the same answer antialias gets. Rebuilding is restarting the city
        // with the same state, which `play` already does (R2).
        if (session && next.style !== session.style) restartWithStyle(next.style);
        // Bringing the controls card back has to actually bring it back: the
        // HUD reads the preference when it is built, so a row that only took
        // effect on the next boot would be a control that appears to do
        // nothing — ruling 026, and the exact failure the tier above avoids.
        wantsCard = next.controlsCard === true;
      },
      onLocaleChange() {
        // Re-render whatever is on screen. The panel knows the language
        // changed; it does not know what is behind it.
        if (session) session.relocalise();
        else newGame();
      },
    });
    if (wantsCard) session?.hud?.showControlsCard?.();
  }

  /** The style decides the materials, so changing it is a new renderer over the
   * same city — the state is untouched, which is the whole point (R2). */
  async function restartWithStyle() {
    if (!session) return;
    const { state } = session;
    session.stop();
    await play({ world: { ok: true, state } }).catch(failed);
  }

  /** A failed start must SAY so. `play` is awaited without a catch in three
   * places, so a throw inside `startGame` became an unhandled rejection and a
   * blank page — which is how a temporal dead zone in `game.js` cost half an
   * hour in R2. */
  /** A room that said no sends the player back to the lobby with the door's own
   * sentence (X2d), not to the generic notice.
   *
   * It reopens the lobby rather than showing the message in place, because
   * `play()` empties the app before the socket has even connected — so by the
   * time a refusal arrives there is no join screen left to write on. Reopening
   * puts the code back in the field, which is the state the player was in.
   *
   * Anything that is NOT a refusal is still a failure to start, and reads as
   * one: a socket that never opened is not a room saying no. */
  function refusedJoin(error, code) {
    const key = refusalKey(error?.refusal);
    if (!key) return failed(error);
    console.warn(`the room refused this client: ${error.refusal}`);
    return newGame({ key, code });
  }

  function failed(error) {
    console.error("the city failed to start", error);
    show(notice("boot.failed.title", "boot.failed.body"));
    return undefined;
  }

  /** Host a city that already exists (X2d). The save crosses as bytes on the
   * `CREATE`, because the room restores through `fromSave` — the same function
   * and the same checksum the page restores through, which is what makes this
   * the one transfer in the project that proves itself. */
  async function hostSaved(slot) {
    const row = await getSave(slot);
    if (!row?.save) return failed(new Error(`there is nothing in slot ${slot}`));
    return hostRoom({ host: { save: row.save } });
  }

  /** The room ended the session (X2d): a kick, a reaped room, a restarted
   * server. Back to the lobby with the door's own sentence where there is one —
   * the same path a refused JOIN takes, because "you are not in that room" is
   * the same news whether it arrives before the city or after it. */
  function roomEnded(reason) {
    const key = refusalKey(reason) ?? "room.ended";
    session?.stop();
    session = undefined;
    return newGame({ key });
  }

  async function play(given) {
    // `?funds=` applies to any NEW city, whichever screen started it (W2).
    if (config.funds > 0 && given.options) given.options.startingTreasury = config.funds;
    app.innerHTML = "";
    app.classList.remove("choosing");
    app.classList.add("playing");
    const preferences = loadSettings();
    session = await startGame(app, {
      ...given,
      onRoomEnded: roomEnded,
      onNewCity: newGame,
      onSettings: showSettings,
      audioSettings: mixerSettings(preferences),
      // `given.style` is the perf card asking for a specific one: a style is a
      // renderer rebuild, so the sweep restarts the session per style (R2).
      style: given.style || config.style || preferences.style,
      // Reduced motion reaches the CITY, not only the interface (R2). Slice 4.5
      // set `data-motion` and nothing in the renderer read it, so a player who
      // asked for stillness got streaming traffic and a cycling sun.
      reducedMotion: document.documentElement.dataset.motion === "reduced",
      worker: config.worker,
      // **The room, if one was named** (X1c). `?join=<code>` is the only thing
      // that opens a socket; without it nothing here changes and
      // `offline_smoke` keeps asserting that singleplayer makes no network
      // call (ruling 003). The city then comes from the room's WELCOME, so
      // whatever `given` carried about a region is the room's instead.
      join: given.join ?? config.join,
      host: given.host,
      seat: given.seat ?? config.seat,
      spectate: given.spectate ?? config.watch,
      mayorName: given.mayorName,
      tier: preferences.quality,
      mode: preferences.camera,
      time: preferences.time,
      life: config.life,
      lock: config.lock,
    });
    if (config.debug) {
      const { runDebugChecks } = await import("./debug.js");
      await runDebugChecks();
    }
    return session;
  }

  /** Picks up the most recent save. The state comes out of the file whole, so
   * nothing is generated — the city that opens is the city that was saved,
   * hash included. */
  async function resume(slot) {
    const record = await getSave(slot);
    const restored = record ? fromSave(record.save) : { ok: false };
    if (!restored.ok) { await newGame(); return; }
    // The BYTES, not the state: the simulation restores them on its own side of
    // the seam (W2), and `fromSave` here is the validity check that decides
    // between resuming and offering a new city.
    await play({ save: record.save }).catch(failed);
  }

  /** **Hosting** (X2c). The options are the ones chosen on the lobby, and the
   * ROOM generates the city from them — so the preview's world is let go and
   * the seed in the record is what makes the two the same region. */
  async function hostRoom({ options, host, mayorName }) {
    // `host` is a save to open; `options` is a region to generate. One or the
    // other reaches the transport as `given.host`, and the door tells them
    // apart by which field the CREATE carries.
    const session = await play({ host: host ?? options, mayorName })
      .catch((error) => refusedJoin(error));
    // The code in the address bar, so a host has something to send somebody:
    // `?join=` is the parameter a guest arrives on, which makes the URL a host
    // copies the invitation itself.
    if (session?.room && globalThis.history?.replaceState) {
      const at = new URL(globalThis.location.href);
      at.search = `?join=${session.room}`;
      globalThis.history.replaceState({}, "", at.toString());
    }
    return session;
  }

  /** @param refused `{ key, code }` when the lobby is being reopened because a
   * room said no (X2d). */
  async function newGame(refused) {
    session = undefined;
    app.classList.remove("playing");
    app.classList.add("choosing");
    const { createNewGame } = await import("./lobby/new-game.js");
    // The lobby has offered a Continue button since it was written and nobody
    // ever passed it one, so a returning player had to start a new city and
    // shift-click a slot. Offered only when there is something to continue.
    const saved = await listSaves();
    const latest = saved.slice().sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
    createNewGame(app, {
      refused,
      choices: choicesFromParams(params),
      onSettings: showSettings,
      onContinue: latest ? () => resume(latest.slot) : undefined,
      onStart({ world, options, choices, mayorName }) {
        rememberInUrl(choices);
        play({ world, options, mayorName });
      },
      // **Joining somebody else's room** (X2b). Nothing about the region
      // crosses: the city is the room's, so `play` is given the code and the
      // name and nothing else. The seat is the door's answer — a player who
      // typed a code cannot know which are free.
      onHost: hostRoom,
      // **Hosting the city you were already playing** (X2d). Offered on the
      // same condition Continue is — there is a save — and it opens THAT city
      // in a room rather than the region the lobby is showing.
      onHostSave: latest ? () => hostSaved(latest.slot) : undefined,
      onJoin({ join, mayorName, spectate }) {
        play({ join, mayorName, spectate }).catch((error) => refusedJoin(error, join));
      },
    });
  }

  // **A room skips the lobby** (X1c): the city, the seed and the region are
  // whoever's room this is, so there is nothing here to choose. The seat is the
  // room's answer at the door and the name is the lobby's job (X2); until then
  // a joiner is `Mayor <seat>`, which is what `server/room.js` already calls
  // one that sends no name.
  if (config.join) {
    // A refusal here opens the lobby with the message rather than the boot
    // notice: `?join=` is a link somebody was SENT, and "that room has closed"
    // is the one sentence that makes the next move obvious.
    await play({ join: config.join, seat: config.seat, spectate: config.watch })
      .catch((error) => refusedJoin(error, config.join));
    return;
  }

  if (config.perf) {
    const { runPerfCard } = await import("./debug/perf-card.js");
    await runPerfCard({ play, hold: config.perfHold, map: config.perfMap }).catch(failed);
    return;
  }

  if (config.seed) {
    // An exact city was asked for. Canonicalize the URL now that every module
    // that needed a param has one.
    const choices = choicesFromParams(params);
    if (!config.debug) rememberInUrl(choices);
    await play({ options: optionsFor(choices) }).catch(failed);
    return;
  }

  await newGame();
}

/** Registers the service worker, after the game is up.
 *
 * After boot, never before: installing precaches ninety-odd files, and a
 * player waiting for a city should not be waiting for that. A failure here is
 * a game that works and does not work offline, which is not worth a message.
 *
 * **The version is in the URL, and it has to be.** A browser re-installs a
 * worker when the WORKER'S OWN BYTES change. sw.js is static — the version it
 * keys its cache on lives in the manifest it fetches — so registering it at a
 * fixed URL meant `install` ran once, in the player's first session, and never
 * again. The cache-first fetch handler then served that build for ever: two
 * playtest reports (P33) were written against a build three slices old. A
 * changed version is a changed script URL, which is a new worker (P33). */
async function registerWorker() {
  if (!navigator.serviceWorker) return;
  if (globalThis.location.protocol === "file:") return;
  // A worker was already in charge when this page loaded, so a worker taking
  // over now is a NEW build — and this page is running the old modules out of
  // memory. Reload once, guarded, or the first ever visit reloads itself for
  // nothing and a claim during boot could loop.
  const had = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!had || reloading) return;
    reloading = true;
    globalThis.location.reload();
  });
  try {
    const manifest = await (await fetch("./client/precache.json", { cache: "no-store" })).json();
    await navigator.serviceWorker.register(`./sw.js?v=${manifest.version}`, { scope: "./" });
  } catch { /* the game works; it just will not work offline */ }
}

boot().then(registerWorker).catch((error) => {
  show(`<div class="notice"><h1>${t("boot.error.title")}</h1><p></p></div>`);
  document.querySelector(".notice p").textContent = String(error?.message ?? error);
});
