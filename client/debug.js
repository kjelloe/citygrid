// `?debug=1`, in the browser.
//
// This module was imported by `main.js` from the beginning and **never
// existed**: `?debug=1` fetched it, failed, and the boot's catch replaced the
// running game with "Something went wrong". A documented URL parameter that
// breaks the app is worse than one that does nothing (P21 audit).
//
// What it does is what a browser console cannot: the checks that need the live
// session. Everything here READS. A debug hook that mutates state is a debug
// hook that changes the bug.

import { hashState } from "../engine/state.js";
import { t, locale } from "./i18n.js";

function group(name, rows) {
  console.groupCollapsed(`City Grid · ${name}`);
  for (const [key, value] of Object.entries(rows)) console.log(`${key}:`, value);
  console.groupEnd();
}

/** Keys that render as themselves. `t()` returns its argument on a miss, so a
 * missing string is invisible in play — it looks like a label somebody wrote in
 * lower case with a dot in it. `test/reachability.test.js` catches the ones the
 * catalogue is missing; this catches the ones the CODE asks for and the
 * catalogue never had. */
function missingStrings(root = document.body) {
  const misses = [];
  const looksLikeKey = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9-]+)+$/;
  for (const node of root.querySelectorAll("*")) {
    for (const child of node.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const text = child.textContent.trim();
      if (looksLikeKey.test(text) && t(text) === text) misses.push(text);
    }
  }
  return [...new Set(misses)];
}

export async function runDebugChecks() {
  const city = globalThis.CITY;
  if (!city) {
    console.warn("City Grid · debug: no session on globalThis.CITY");
    return { ok: false };
  }
  const { state, renderer } = city;

  // A hash that moves without a command is the highest-value alarm in the
  // project, so it is the first thing this reports.
  const before = hashState(state);
  const after = hashState(state);

  const report = {
    locale: locale(),
    seed: state.options.seed,
    size: `${state.width}×${state.height}`,
    difficulty: state.options.difficulty,
    tick: state.tick,
    population: state.population,
    buildings: state.buildings.length,
    hash: before,
    hashStable: before === after,
    instances: renderer.stats?.instances,
    triangles: renderer.stats?.triangles,
    missingStrings: missingStrings(),
  };

  group("session", report);
  if (!report.hashStable) console.error("City Grid · hashState is not stable over the same state");
  if (report.missingStrings.length > 0) {
    console.error(`City Grid · ${report.missingStrings.length} untranslated key(s) on screen`,
      report.missingStrings);
  }
  globalThis.CITY_DEBUG = report;
  return report;
}
