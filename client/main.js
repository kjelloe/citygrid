// Boot. Deliberately thin: capability probe, locale, then hand off.
//
// The URL is the config surface (?seed, ?size, ?difficulty, ?terrain, ?water,
// ?disasters, ?join, ?debug). Params are read at module evaluation, BEFORE the
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
import { listSaves, getSave } from "./storage/db.js";
import { fromSave } from "../engine/save.js";

const params = new URLSearchParams(globalThis.location?.search ?? "");
export const config = Object.freeze({
  seed: params.get("seed") ?? "",
  size: Number(params.get("size") ?? 0) || 0,
  join: params.get("join") ?? "",
  locale: params.get("lang") ?? "",
  debug: params.get("debug") === "1",
  // `?life=0` freezes the traffic where it settled, so a gate that measures a
  // frame or compares two screenshots is looking at the same city twice.
  life: params.get("life") !== "0",
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

  const app = document.getElementById("app");
  const { startGame } = await import("./game.js");

  let session;

  async function showSettings() {
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
      },
      onLocaleChange() {
        // Re-render whatever is on screen. The panel knows the language
        // changed; it does not know what is behind it.
        if (session) session.relocalise();
        else newGame();
      },
    });
  }

  async function play(given) {
    app.innerHTML = "";
    app.classList.remove("choosing");
    app.classList.add("playing");
    const preferences = loadSettings();
    session = await startGame(app, {
      ...given,
      onNewCity: newGame,
      onSettings: showSettings,
      audioSettings: mixerSettings(preferences),
      tier: preferences.quality,
      mode: preferences.camera,
      life: config.life,
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
    await play({ world: { ok: true, state: restored.state } });
  }

  async function newGame() {
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
      choices: choicesFromParams(params),
      onSettings: showSettings,
      onContinue: latest ? () => resume(latest.slot) : undefined,
      onStart({ world, options, choices, mayorName }) {
        rememberInUrl(choices);
        play({ world, options, mayorName });
      },
    });
  }

  if (config.seed) {
    // An exact city was asked for. Canonicalize the URL now that every module
    // that needed a param has one.
    const choices = choicesFromParams(params);
    if (!config.debug) rememberInUrl(choices);
    await play({ options: optionsFor(choices) });
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
