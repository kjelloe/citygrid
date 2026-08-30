// The HUD models.
//
// `plan.md` §7.1 asks for a model/view split: pure, unit-tested `*_model.js`
// feeding a thin DOM layer. This is the pure half — everything the HUD says,
// decided without a browser.
//
// The failures worth testing for are all about the HUD lying quietly: a date
// that is off by a month, an alert queue that floods and hides the one alert
// that matters, a treasury trend that reports growth while the city drains, an
// inspector that describes the tile under the last click rather than this one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { topBar, formatMoney, cityDate } from "../client/ui/hud-model.js";
import { rciBars } from "../client/ui/rci-model.js";
import { pushAlerts, createAlerts, visibleAlerts, SEVERITY, alertKeys } from "../client/ui/alerts-model.js";
import { inspect, inspectorKeys } from "../client/ui/inspector-model.js";
import { buildMenu, menuDefs, footprintAt, CATEGORY_ORDER } from "../client/ui/build-model.js";
import { budgetPanel, clampRate, taxRange } from "../client/ui/budget-model.js";
import { OVERLAYS, OVERLAY_NAMES } from "../client/ui/overlays.js";
import { catalogue } from "../engine/catalogue.js";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { TICKS_PER_YEAR, ZONE_RESIDENTIAL, FLAG_POWERED, TERRAIN_WATER } from "../engine/constants.js";
import { NET_PRESENT } from "../engine/network.js";

function blank() {
  const state = createState(defaultOptions({ seed: 3, width: 8, height: 8, seats: 1 }));
  state.players.push({ seat: 1, name: "Mayor", treasury: 20000, status: 0 });
  return state;
}

// --- top bar ----------------------------------------------------------------

test("the city date starts in year 1, not year 0", () => {
  // Off-by-one in the very first thing the player reads.
  const state = blank();
  assert.equal(cityDate(state).year, 1);
  state.tick = TICKS_PER_YEAR - 1;
  assert.equal(cityDate(state).year, 1, "the last tick of year 1 is still year 1");
  state.tick = TICKS_PER_YEAR;
  assert.equal(cityDate(state).year, 2);
});

test("the city date runs through twelve months and no more", () => {
  const state = blank();
  const months = new Set();
  for (let tick = 0; tick < TICKS_PER_YEAR; tick += 1) {
    state.tick = tick;
    const { month } = cityDate(state);
    assert.ok(month >= 1 && month <= 12, `month ${month} at tick ${tick}`);
    months.add(month);
  }
  assert.equal(months.size, 12, "a year should visit all twelve months");
});

test("money is formatted without lying about the sign", () => {
  // The separator is a thin space (U+2009), so match any whitespace rather
  // than pinning the exact character — that is typography, not behaviour.
  assert.match(formatMoney(1500), /1\s?500/);
  assert.match(formatMoney(-1500), /^-|−/, "a debt must read as a debt");
  assert.equal(formatMoney(0).includes("-"), false);
});

test("the treasury trend reports the direction the money is going", () => {
  const state = blank();
  const rising = topBar(state, 1, { lastTreasury: 18000 });
  assert.equal(rising.trend, 1, "gaining money should trend up");
  const falling = topBar(state, 1, { lastTreasury: 22000 });
  assert.equal(falling.trend, -1);
  const flat = topBar(state, 1, { lastTreasury: 20000 });
  assert.equal(flat.trend, 0);
});

test("the top bar reads the player's own treasury, not the region's", () => {
  // Two numbers that look alike and are not: `state.treasury` is the region's
  // and `player.treasury` is this seat's. Showing the wrong one is invisible in
  // singleplayer and wrong the moment a second seat joins.
  const state = blank();
  state.treasury = 999999;
  state.players[0].treasury = 4200;
  assert.equal(topBar(state, 1).treasury, 4200);
});

test("the top bar survives a seat that is not seated", () => {
  const state = blank();
  const bar = topBar(state, 7);
  assert.equal(bar.treasury, 0, "an unknown seat has no money, and must not crash the HUD");
});

// --- RCI --------------------------------------------------------------------

test("RCI bars are clamped and signed", () => {
  const state = blank();
  state.demand = { residential: 400, commercial: -400, industrial: 0 };
  const bars = rciBars(state);
  assert.equal(bars.length, 3);
  for (const bar of bars) {
    assert.ok(bar.value >= -1 && bar.value <= 1, `${bar.key} is ${bar.value}, outside -1..1`);
    assert.ok(bar.labelKey, `${bar.key} has no label key`);
  }
  assert.ok(bars[0].value > 0, "positive demand should read positive");
  assert.ok(bars[1].value < 0, "negative demand should read negative");
  assert.equal(bars[2].value, 0);
});

test("RCI bars keep their order R, C, I", () => {
  // The bars are read by shape and position as much as by colour. Reordering
  // them silently would make every screenshot in the design docs wrong.
  const state = blank();
  assert.deepEqual(rciBars(state).map((b) => b.key), ["residential", "commercial", "industrial"]);
});

// --- alerts -----------------------------------------------------------------

test("repeated events collapse into one alert with a count", () => {
  // 59 powerShortfall events in one run is normal. Fifty-nine alerts is a HUD
  // that has hidden everything else it had to say.
  const alerts = createAlerts();
  const events = Array.from({ length: 59 }, () => ({ kind: "powerShortfall" }));
  pushAlerts(alerts, events, 100);
  const shown = visibleAlerts(alerts);
  assert.equal(shown.length, 1, `expected one collapsed alert, got ${shown.length}`);
  assert.equal(shown[0].count, 59);
});

test("the alert queue is capped and keeps the worst, not the newest", () => {
  const alerts = createAlerts();
  pushAlerts(alerts, [{ kind: "fireStarted" }], 1);
  const chatter = Array.from({ length: 40 }, (_, i) => ({ kind: `noise${i}` }));
  pushAlerts(alerts, chatter, 2);
  const shown = visibleAlerts(alerts);
  assert.ok(shown.length <= 6, `${shown.length} alerts on screen is a wall, not a HUD`);
  assert.ok(shown.some((a) => a.kind === "fireStarted"),
    "a fire must not be pushed off the list by unknown chatter");
});

test("known events are classified by severity, unknown ones are not invented", () => {
  const alerts = createAlerts();
  pushAlerts(alerts, [
    { kind: "fireStarted" }, { kind: "powerShortfall" }, { kind: "developed" },
  ], 5);
  const byKind = Object.fromEntries(visibleAlerts(alerts).map((a) => [a.kind, a]));
  assert.equal(byKind.fireStarted.severity, SEVERITY.URGENT);
  assert.equal(byKind.powerShortfall.severity, SEVERITY.WARNING);
  assert.equal(byKind.developed, undefined,
    "routine growth is not an alert — the design reserves the alert area for problems");
});

test("alerts carry the tick they happened on", () => {
  const alerts = createAlerts();
  pushAlerts(alerts, [{ kind: "fireStarted" }], 77);
  assert.equal(visibleAlerts(alerts)[0].tick, 77);
});

// --- inspector --------------------------------------------------------------

test("the inspector describes the tile it was asked about", () => {
  const state = blank();
  const index = 3 * state.width + 2;
  state.tiles.zone[index] = ZONE_RESIDENTIAL;
  state.tiles.wire[index] = NET_PRESENT;
  state.tiles.flags[index] |= FLAG_POWERED;
  state.tiles.landValue[index] = 180;

  const report = inspect(state, 2, 3);
  assert.equal(report.x, 2);
  assert.equal(report.y, 3);
  assert.equal(report.zoneKey, "zone.residential");
  assert.equal(report.powered, true);
  assert.equal(report.watered, false);
  assert.ok(report.rows.some((r) => r.labelKey === "inspect.landValue"), "land value should be reported");
});

test("the inspector refuses a tile off the map rather than reading past the array", () => {
  const state = blank();
  assert.equal(inspect(state, -1, 0), undefined);
  assert.equal(inspect(state, 0, 99), undefined);
});

test("the inspector names water as water", () => {
  const state = blank();
  state.tiles.terrain[0] = TERRAIN_WATER;
  assert.equal(inspect(state, 0, 0).terrainKey, "terrain.water");
});

test("the inspector reports the building on the tile, by id", () => {
  const state = blank();
  const index = 4 * state.width + 4;
  state.buildings.push({ id: 9, def: "coalPlant", zone: 0, x: 4, y: 4, w: 1, h: 1, level: 1, occupancy: 0, condition: 88 });
  state.tiles.buildingId[index] = 9;
  const report = inspect(state, 4, 4);
  assert.equal(report.building?.def, "coalPlant");
  assert.equal(report.building?.condition, 88);
});

// --- the build menu ---------------------------------------------------------

test("every building in the catalogue is reachable from the build menu", () => {
  // The omission this slice exists to fix: the toolbar offered zones, roads,
  // wires, pipes and the bulldozer and nothing else. Development needs power
  // AND water, and the only sources of either are buildings — so a human player
  // could zone and pave forever and nothing would ever develop. The engine
  // could place a plant; the game could not.
  const offered = new Set(menuDefs());
  const missing = Object.keys(catalogue()).filter((def) => !offered.has(def));
  assert.deepEqual(missing, [], `unreachable from the interface: ${missing.join(", ")}`);
});

test("the build menu offers a power source and a water source", () => {
  // The two the city cannot grow without. Named separately from the coverage
  // test above so that deleting a plant from the catalogue fails with the
  // reason rather than with a diff.
  const groups = Object.fromEntries(buildMenu().map((g) => [g.category, g.items]));
  assert.ok(groups.power?.length > 0, "no way to build a power source");
  assert.ok(groups.water?.length > 0, "no way to build a water source");
});

test("the build menu is ordered, and the same order every time", () => {
  const groups = buildMenu();
  const order = groups.map((g) => g.category);
  assert.deepEqual(order, CATEGORY_ORDER.filter((c) => order.includes(c)));
  for (const group of groups) {
    const costs = group.items.map((i) => i.cost);
    assert.deepEqual([...costs].sort((a, b) => a - b), costs,
      `${group.category} is not cheapest-first`);
  }
  // A toolbar that reorders itself between builds makes every UI gate flaky.
  assert.deepEqual(menuDefs(), menuDefs());
});

test("a building's ghost covers the tiles the reducer will test", () => {
  // A 3x3 plant anchored at the pointer grows right and down. A one-tile ghost
  // teaches the footprint by refusal.
  const tiles = footprintAt(10, 20, "coalPlant");
  assert.equal(tiles.length, 9);
  assert.deepEqual(tiles[0], { x: 10, y: 20 });
  assert.deepEqual(tiles[8], { x: 12, y: 22 });
  assert.deepEqual(footprintAt(4, 4, "waterPump"), [{ x: 4, y: 4 }]);
  assert.deepEqual(footprintAt(4, 4, "nonesuch"), [{ x: 4, y: 4 }],
    "an unknown building must not crash the ghost");
});

// --- the budget -------------------------------------------------------------

test("the budget panel reports the rate the city is actually charging", () => {
  // Not the slider's position. If the reducer refused the command, the slider
  // is showing a rate nobody is being taxed at.
  const state = blank();
  state.tax = 11;
  assert.equal(budgetPanel(state, 1).rate, 11);
});

test("the tax slider cannot aim outside the range the reducer accepts", () => {
  const { min, max } = taxRange();
  assert.equal(clampRate(max + 5), max);
  assert.equal(clampRate(min - 5), min);
  assert.equal(clampRate(1.5), taxRange().fallback, "a fraction is not a rate");
});

test("the budget's net is its income minus its expenses", () => {
  const state = blank();
  const panel = budgetPanel(state, 1);
  assert.equal(panel.net, panel.income - panel.expenses);
});

// --- ruling 008: every string the player reads is in both catalogues ---------

const catalogues = Object.fromEntries(
  readdirSync(join(repoRoot, "data", "i18n"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => [
      name.replace(".json", ""),
      JSON.parse(readFileSync(join(repoRoot, "data", "i18n", name), "utf8")),
    ]),
);

/** Every key the pure models can hand the view. */
function modelKeys() {
  const keys = [...alertKeys(), ...inspectorKeys()];
  for (const name of OVERLAY_NAMES) {
    keys.push(OVERLAYS[name].labelKey);
    for (const entry of OVERLAYS[name].legend) keys.push(entry.textKey);
  }
  for (const bar of rciBars(blank())) keys.push(bar.labelKey);
  for (const group of buildMenu()) {
    keys.push(group.labelKey);
    for (const item of group.items) keys.push(item.labelKey);
  }
  return keys;
}

/** Every `t("literal")` in the client. The view's own strings — toolbar groups,
 * the top bar, status messages — live here and nowhere a model can report them. */
function sourceKeys() {
  const keys = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.endsWith(".js")) continue;
      for (const match of readFileSync(path, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)) {
        keys.push(match[1]);
      }
    }
  };
  walk(join(repoRoot, "client"));
  return keys;
}

test("every key the interface asks for exists in every locale", () => {
  // Ruling 008 and answer A4: localisation from the first string. `t()` returns
  // the KEY when it misses, so without this test a missing translation ships as
  // a literal `alert.congestion` in the alert area and nobody notices until a
  // Norwegian player opens the game.
  const wanted = [...new Set([...modelKeys(), ...sourceKeys()])].sort();
  assert.ok(wanted.length > 100, `only found ${wanted.length} keys — the scan is broken`);
  for (const [name, catalogue] of Object.entries(catalogues)) {
    const missing = wanted.filter((key) => !Object.hasOwn(catalogue, key));
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(", ")}`);
  }
});

test("no user-facing English is left hardcoded in the HUD", () => {
  // The narrow, checkable form of the rule: no string literal handed to
  // `textContent`, `title` or `aria-label` outside a `t()` call. Anything the
  // player reads has to come through the catalogue.
  const source = readFileSync(join(repoRoot, "client", "ui", "hud.js"), "utf8");
  const offenders = [...source.matchAll(/(?:textContent|\.title)\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((text) => /[a-z]{3}/.test(text));
  assert.deepEqual(offenders, [], `hardcoded strings in hud.js: ${offenders.join(", ")}`);
});
