// Boot. Deliberately thin: capability probe, locale, then hand off.
//
// The URL is the config surface (?seed, ?size, ?join, ?debug). Params are read
// at module evaluation, BEFORE the boot canonicalizes the URL — a module that
// reads them later finds them already stripped.

import { loadLocale, localise, t } from "./i18n.js";
import { hasWebGL2, preferredLocale, prefersReducedMotion } from "./capabilities.js";

const params = new URLSearchParams(globalThis.location?.search ?? "");
export const config = Object.freeze({
  seed: params.get("seed") ?? "",
  size: Number(params.get("size") ?? 0) || 0,
  join: params.get("join") ?? "",
  locale: params.get("lang") ?? "",
  debug: params.get("debug") === "1",
});

function show(html) {
  const app = document.getElementById("app");
  app.innerHTML = html;
  localise(app);
}

function notice(titleKey, bodyKey) {
  return `<div class="notice"><h1 data-i18n="${titleKey}"></h1><p data-i18n="${bodyKey}"></p></div>`;
}

async function boot() {
  await loadLocale(config.locale || preferredLocale());

  if (prefersReducedMotion()) document.documentElement.dataset.motion = "reduced";

  if (!hasWebGL2()) {
    show(notice("boot.unsupported.title", "boot.unsupported.body"));
    return;
  }

  // Canonicalize the URL now that every module that needed a param has one.
  if (globalThis.history?.replaceState && params.size > 0 && !config.debug) {
    globalThis.history.replaceState({}, "", globalThis.location.pathname);
  }

  show(`<div class="notice">
    <h1 data-i18n="app.title"></h1>
    <p data-i18n="app.tagline"></p>
  </div>`);

  if (config.debug) {
    const { runDebugChecks } = await import("./debug.js");
    await runDebugChecks();
  }
}

boot().catch((error) => {
  show(`<div class="notice"><h1>${t("boot.error.title")}</h1><p></p></div>`);
  document.querySelector(".notice p").textContent = String(error?.message ?? error);
});
