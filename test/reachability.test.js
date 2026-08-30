// Every string in the catalogue can be reached by the interface.
//
// The reachability sweep from the `review-round` skill, as a test instead of a
// grep somebody has to remember to run. It has found something every time it
// has been run by hand:
//
//   - twelve buildings with no toolbar button (slice N11)
//   - `CMD_SET_TAX` with no control to send it (slice N11)
//   - three balanced difficulties with no screen to pick them (slice N12)
//   - twenty-five `region.*` names nothing ever rendered (slice N12)
//   - seven `result.*` reasons a refused build never showed (this slice)
//
// A key with nothing to show it is a promise the interface does not keep, and
// nothing goes red when it happens — a missing screen throws no error.
//
// Keys built at runtime (`building.${def}`) cannot be found by scanning source,
// so the generators below construct exactly what the code constructs.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { readQuests } from "./helpers/content.js";
import { catalogue } from "../engine/catalogue.js";
import { DISASTER_NAMES } from "../engine/disasters.js";
import { RESULT } from "../shared/protocol.js";
import { OVERLAYS, OVERLAY_NAMES } from "../client/ui/overlays.js";
import { alertKeys } from "../client/ui/alerts-model.js";
import { inspectorKeys } from "../client/ui/inspector-model.js";
import { CATEGORY_ORDER, buildMenu } from "../client/ui/build-model.js";
import { ROWS as LOBBY_ROWS } from "../client/lobby/options-model.js";
import { SETTING_ROWS } from "../client/ui/settings-model.js";

/** Keys that exist for a screen nobody has built yet. Each names the slice
 * that will use it, so this list is a plan rather than a pile. Anything that
 * lands here without a reason is a key that should have been deleted. */
const NOT_YET = {
  "menu.singleplayer": "slice 5.2 — beside 'Play together' in the lobby",
  "menu.multiplayer": "slice 5.2",
  "menu.about": "no about screen; slice 4.5 polish",
  "lobby.privacy.private": "slice 5.2",
  "lobby.privacy.public": "slice 5.2",
  "settings.sound": "slice 4.4 — there is no audio to switch off",
  "settings.sound.on": "slice 4.4",
  "settings.sound.off": "slice 4.4",
  "settings.volume.master": "slice 4.4",
  "settings.volume.effects": "slice 4.4",
  "settings.volume.ambience": "slice 4.4",
  "settings.volume.music": "slice 4.4",
  "settings.style": "ruling 022 settled the style; a picker would offer one choice",
  "settings.advisor": "slice 4.2 personas, Q18",
  "settings.reducedEffects": "slice 4.5 — nothing reads it yet",
  "ping.help": "slice 5.3",
  "ping.building": "slice 5.3",
  "ping.remove": "slice 5.3",
  "ping.working": "slice 5.3",
  "ping.fire": "slice 5.3",
  "ping.look": "slice 5.3",
  "ping.thanks": "slice 5.3",
  "status.afk": "slice 5.4",
  "tool.request": "slice 5.3",
};

const catalogues = Object.fromEntries(
  readdirSync(join(repoRoot, "data", "i18n"))
    .filter((n) => n.endsWith(".json"))
    .map((n) => [n.replace(".json", ""), JSON.parse(readFileSync(join(repoRoot, "data", "i18n", n), "utf8"))]),
);

function clientSource() {
  const parts = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".js")) parts.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(repoRoot, "client"));
  parts.push(readFileSync(join(repoRoot, "index.html"), "utf8"));
  return parts.join("\n");
}

/** Every key the interface can put on screen. */
function reachable() {
  const source = clientSource();
  const keys = new Set();

  // Any double-quoted string in the client that IS a key. Broader than
  // scanning for `t("...")` on purpose: keys arrive as `labelKey:` fields in
  // tables, as arguments to helpers, and inside ternaries
  // (`t(x ? "inspect.yes" : "inspect.no")`), and a scanner that only understood
  // one shape reported a dozen live keys as dead.
  const known = new Set(Object.keys(catalogues.en));
  for (const m of source.matchAll(/"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+)"/g)) {
    if (known.has(m[1])) keys.add(m[1]);
  }

  // Built at runtime. Each generator mirrors the expression in the code, and
  // the comment names where.
  for (const def of Object.keys(catalogue())) keys.add(`building.${def}`);   // hud.js, build-model.js
  for (const category of CATEGORY_ORDER) keys.add(`category.${category}`);   // build-model.js
  for (const group of buildMenu()) for (const item of group.items) keys.add(item.labelKey);
  for (const name of DISASTER_NAMES) keys.add(`disaster.${name}`);           // alerts-model.js
  for (const key of alertKeys()) keys.add(key);                              // hud.js renderAlerts
  for (const key of inspectorKeys()) keys.add(key);                          // hud.js showInspection
  for (const name of OVERLAY_NAMES) {                                        // hud.js overlay bar
    keys.add(OVERLAYS[name].labelKey);
    for (const entry of OVERLAYS[name].legend) keys.add(entry.textKey);
  }
  for (const row of [...LOBBY_ROWS, ...SETTING_ROWS]) {                      // the two screens
    keys.add(row.labelKey);
    for (const choice of row.choices) {
      if (choice.labelKey) keys.add(choice.labelKey);
      if (choice.hintKey) keys.add(choice.hintKey);
    }
  }
  for (const code of Object.values(RESULT)) keys.add(`result.${code}`);      // hud.js setResult
  for (const quest of readQuests().all) {                                    // hud.js renderAdvisor
    keys.add(quest.titleKey);
    keys.add(quest.textKey);
    for (const choice of quest.choices ?? []) keys.add(choice.textKey);
  }
  // engine/region-name.js builds `region.<shape>.<feature>`; the ladder there
  // is the authority for which combinations exist.
  for (const shape of ["plain", "archipelago", "islands", "coast", "valley"]) {
    for (const feature of ["open", "wooded", "rocky", "sandy", "watered"]) {
      keys.add(`region.${shape}.${feature}`);
    }
  }
  return keys;
}

test("every string in the catalogue can be reached by the interface", () => {
  const shown = reachable();
  const orphans = Object.keys(catalogues.en)
    .filter((key) => !shown.has(key))
    .filter((key) => !Object.hasOwn(NOT_YET, key));
  assert.deepEqual(orphans, [],
    `keys nothing can show, and no entry in NOT_YET: ${orphans.join(", ")}`);
});

test("nothing on the not-yet list is already being shown", () => {
  // The other direction, and the one that rots. A key that gains a screen must
  // leave the list in the same commit, or the list stops describing the game.
  const shown = reachable();
  const built = Object.keys(NOT_YET).filter((key) => shown.has(key));
  assert.deepEqual(built, [], `these are reachable now and should leave NOT_YET: ${built.join(", ")}`);
});

test("the not-yet list has no entries for keys that no longer exist", () => {
  const missing = Object.keys(NOT_YET).filter((key) => !Object.hasOwn(catalogues.en, key));
  assert.deepEqual(missing, [], `NOT_YET names keys that are gone: ${missing.join(", ")}`);
});

test("every reason the reducer can give has words in both locales", () => {
  // Eight RESULT codes. Seven had strings and none was ever rendered; the
  // eighth had no string at all.
  for (const [name, catalogue_] of Object.entries(catalogues)) {
    for (const code of Object.values(RESULT)) {
      assert.ok(Object.hasOwn(catalogue_, `result.${code}`),
        `${name} cannot say why a command failed with '${code}'`);
    }
  }
});
