// The N5 gate.
//
// "A city survives close-and-reopen, and the migration corpus still passes."
//
// The first half cannot be tested in node: it needs a real IndexedDB, a real
// page unload, and a real second page load against the same origin. So this
// builds a city, saves it, closes the PAGE (not the browser context, which
// would take the database with it), opens a fresh one, loads, and compares
// state hashes.
//
// The hash is the whole assertion. A city that loads and merely looks similar
// is not a save.

import { chromium } from "playwright";
import { makeStatic } from "../server/static.js";
import { createServer } from "node:http";
import { join } from "node:path";

function serve() {
  return createServer(makeStatic());
}

const problems = [];
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Build something with enough in it that a dropped field would show up in the
 * hash: roads, all three zones, utilities, buildings, money spent, time passed. */
const BUILD = async () => {
  const { state, renderer } = globalThis.CITY;
  const c = await import("/engine/commands.js");
  // Through the SEAM (W2). The reducer is on the other side of it — a worker
  // thread unless the browser says otherwise — and `CITY.state` is the mirror,
  // so a command applied here would change a copy and leave the simulation
  // playing a different city. The money comes from `?funds=`, for the same
  // reason: it has to be part of the city, not a poke at the copy.
  const apply = (unused, command) => globalThis.CITY.apply(command);
  globalThis.CITY.pause();
  const W = state.width;
  let row = -1;
  for (let y = 12; y < state.height - 10 && row < 0; y += 1) {
    let clear = true;
    for (let x = 8; x < 34; x += 1) {
      for (let dy = -6; dy <= 7; dy += 1) {
        const i = (y + dy) * W + x;
        if (state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4) clear = false;
      }
    }
    if (clear) row = y;
  }
  if (row < 0) return { reason: "no dry ground" };
  await apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [row * W + 8, 26] });
  await apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [(row + 4) * W + 8, 26] });
  const band = (y0, y1, zone) => {
    const runs = [];
    for (let y = y0; y <= y1; y += 1) runs.push(y * W + 8, 26);
    return apply(state, { type: c.CMD_PAINT_ZONE, actor: 1, runs, zone });
  };
  await band(row + 1, row + 3, 1);
  await band(row - 3, row - 1, 2);
  await band(row + 5, row + 6, 3);
  await apply(state, { type: c.CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 11, y: row - 6 });
  await apply(state, { type: c.CMD_PLACE_BUILDING, actor: 1, def: "groundwaterPump", x: 23, y: row - 6 });
  const wire = [];
  const pipe = [];
  // Beside the plant, never through it (G1, ruling 046): the coal plant is 3x3
  // at (11, row-6), so col 13 is inside it for rows row-6..row-4 — and since a
  // network refuses a building, a run that crosses one is refused WHOLE. That
  // left this city with no power at all: 2 buildings and nobody in it, which
  // only `gates.mjs all` could see.
  for (const spine of [13, 23]) {
    const from = spine === 13 ? row - 3 : row - 5;
    for (let y = from; y <= row + 7; y += 1) { wire.push(y * W + spine, 1); pipe.push(y * W + spine, 1); }
  }
  for (let x = 13; x <= 23; x += 1) { wire.push((row - 3) * W + x, 1); pipe.push((row - 3) * W + x, 1); }
  await apply(state, { type: c.CMD_PLACE_WIRE, actor: 1, runs: wire });
  await apply(state, { type: c.CMD_PLACE_PIPE, actor: 1, runs: pipe });
  // One message for four hundred ticks: the seam takes a count, so a fixture
  // city costs one round trip rather than four hundred.
  await globalThis.CITY.tick(400);
  renderer.worldChanged();
  const { hashState } = await import("/engine/state.js");
  return { row, hash: hashState(state), buildings: state.buildings.length, population: state.population, tick: state.tick };
};

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
// `?funds=` buys the fixture city: the treasury is part of the city now rather
// than a write to the state object this page holds (W2).
const url = `http://127.0.0.1:${port}/index.html?seed=1003&size=64&lock=0&funds=9000000`;

try {
  // One CONTEXT throughout: it owns the origin's storage. Closing the context
  // would take IndexedDB with it and the test would prove nothing.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  // --- session one: build and save -----------------------------------------
  const first = await context.newPage();
  first.on("pageerror", (e) => problems.push(`session 1 — ${e.message}`));
  await first.goto(url);
  await first.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await first.evaluate(() => document.querySelector("#controls-dismiss")?.click());

  const built = await first.evaluate(BUILD);
  check("the fixture city is worth saving", !built.reason && built.buildings > 2,
    built.reason ?? `${built.buildings} buildings, pop ${built.population}, tick ${built.tick}`);

  const storageOk = await first.evaluate(async () => {
    const { available } = await import("/client/storage/db.js");
    return available();
  });
  check("IndexedDB is available to the page", storageOk);

  const saved = await first.evaluate(() => globalThis.CITY.save("slot1"));
  check("saving reports success", saved === true, String(saved));

  const exported = await first.evaluate(() => globalThis.CITY.exportSave());
  check("export produces a file with something in it", exported.length > 500, `${exported.length} bytes`);

  // Close the PAGE. This is the "closed tab" the gate is about.
  await first.close();

  // --- session two: a fresh page, same origin -------------------------------
  const second = await context.newPage();
  second.on("pageerror", (e) => problems.push(`session 2 — ${e.message}`));
  await second.goto(url);
  await second.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await second.evaluate(() => document.querySelector("#controls-dismiss")?.click());

  // Stop the clock FIRST. Every hash below is compared against one taken in
  // another session, and a tick landing between a load and its hash makes this
  // gate fail for a reason that has nothing to do with saving.
  await second.evaluate(() => globalThis.CITY.pause());
  const freshHash = await second.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    return hashState(globalThis.CITY.state);
  });
  check("a fresh session starts a different city", freshHash !== built.hash,
    "the new session already had the saved city, so the load below proves nothing");

  const listed = await second.evaluate(async () => {
    const { listSaves } = await import("/client/storage/db.js");
    return (await listSaves()).map((r) => r.slot);
  });
  check("the save survived the closed tab", listed.includes("slot1"), `slots: ${listed.join(", ") || "none"}`);

  const loaded = await second.evaluate(() => globalThis.CITY.load("slot1"));
  const loadedHash = await second.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    return hashState(globalThis.CITY.state);
  });
  check("loading reports success", loaded === true, String(loaded));
  check("the loaded city is the SAME city, hash for hash", loadedHash === built.hash,
    `${built.hash} → ${loadedHash}`);

  const after = await second.evaluate(() => ({
    buildings: globalThis.CITY.state.buildings.length,
    population: globalThis.CITY.state.population,
    tick: globalThis.CITY.state.tick,
  }));
  check("the loaded city has the buildings back", after.buildings === built.buildings,
    `${built.buildings} → ${after.buildings}`);
  check("the loaded city is at the right date", after.tick === built.tick, `${built.tick} → ${after.tick}`);

  // --- the renderer must be looking at the NEW city -------------------------
  // A load that updates state but leaves the renderer drawing the old one is
  // the bug this catches: the numbers are right and the picture is wrong.
  const drawn = await second.evaluate(() => {
    globalThis.CITY.renderer.draw({});
    return globalThis.CITY.renderer.stats.instances;
  });
  check("the renderer redraws the loaded city", drawn > 20, `${drawn} instances`);

  // --- import ---------------------------------------------------------------
  const importedOk = await second.evaluate((text) => globalThis.CITY.importSave(text), exported);
  const importedHash = await second.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    return hashState(globalThis.CITY.state);
  });
  check("an exported file imports back to the same city", importedOk === true && importedHash === built.hash,
    `${built.hash} → ${importedHash}`);

  const refused = await second.evaluate(() => globalThis.CITY.importSave('{"game":"something-else"}'));
  check("import refuses a foreign file", refused === false);

  // --- autosave -------------------------------------------------------------
  const auto = await second.evaluate(async () => {
    globalThis.CITY.resume();
    // Run a game year's worth of ticks by hand so the autosave interval passes
    // without waiting a real minute for the clock — through the seam, which is
    // where the simulation is (W2).
    await globalThis.CITY.tick(200);
    await new Promise((r) => setTimeout(r, 1200));
    const { listSaves } = await import("/client/storage/db.js");
    return (await listSaves()).map((r) => r.slot);
  });
  check("the autosave takes its own slot and not a manual one", auto.includes("autosave"),
    `slots: ${auto.join(", ")}`);
  check("the autosave did not overwrite slot1", auto.includes("slot1"), `slots: ${auto.join(", ")}`);

  await context.close();
} finally {
  await browser.close();
  server.close();
}

for (const c of checks) console.log(`${c.ok ? "ok   " : "FAIL "} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n${checks.length} checks — save smoke ok`);
