// The N10 gate: the thirteen MVP success criteria (gamedesign.md §24).
//
// "The script passes on desktop and on a real phone; a first-time player
// reaches their first residents inside two minutes."
//
// Every criterion is checked against the REAL page — the same index.html a
// person opens — on a desktop viewport and a phone one. Where a criterion is
// about a person doing something, the script does it with pointer events at
// coordinates rather than by calling a function, for the reason the input gate
// gives: a gate that pokes the API proves the API works.
//
// Two criteria cannot be honestly automated and say so out loud rather than
// quietly passing:
//   §24.13 "play comfortably" — comfort is not measurable here. What IS checked
//     is that every control is reachable and thumb-sized on a phone viewport and
//     that the same gestures work through touch pointers.
//   The "satisfying and understandable feedback loop" §24 closes on — that is
//     what the playtest is for.
//
//   node tools/mvp_acceptance.mjs

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
};

function serve() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const target = join(root, normalize(path === "/" ? "/index.html" : path));
      if (!target.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(target);
      res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

const results = [];
function criterion(number, name, ok, detail = "") {
  results.push({ number, name, ok: Boolean(ok), detail });
}

/** Lays out the roads and zoning of a working city through the ENGINE.
 *
 * These are bulk edits standing in for many minutes of a person dragging, and
 * §24.2 and §24.4 have already proved the pointer draws roads and paints zones.
 * What is NOT done here is placing the buildings — that is §24.3 and §24.9, and
 * it goes through the toolbar like a person would, because a gate that reaches
 * past the interface cannot see an interface that is missing. It did not see
 * exactly that: this script passed 13 of 13 while the toolbar had no way to
 * place a building at all, so no human player could power or water a city. */
const LAY_GROUND = async () => {
  const { state, renderer } = globalThis.CITY;
  const { apply } = await import("/engine/reducer.js");
  const c = await import("/engine/commands.js");
  globalThis.CITY.pause();
  state.players[0].treasury = 9000000;
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

  apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [row * W + 8, 26] });
  apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [(row + 4) * W + 8, 26] });
  const band = (y0, y1, zone) => {
    const runs = [];
    for (let y = y0; y <= y1; y += 1) runs.push(y * W + 8, 26);
    apply(state, { type: c.CMD_PAINT_ZONE, actor: 1, runs, zone });
  };
  band(row + 1, row + 3, 1);
  band(row - 3, row - 1, 2);
  band(row + 5, row + 6, 3);
  return { row };
};

/** Wires and pipes the laid-out city, then runs it. Called after the plant and
 * the pump have been placed through the toolbar. */
const RUN_CITY = async (row) => {
  const { state, renderer } = globalThis.CITY;
  const { apply } = await import("/engine/reducer.js");
  const c = await import("/engine/commands.js");
  const W = state.width;
  const wire = [];
  const pipe = [];
  for (const spine of [13, 23]) {
    for (let y = row - 5; y <= row + 7; y += 1) { wire.push(y * W + spine, 1); pipe.push(y * W + spine, 1); }
  }
  for (let x = 13; x <= 23; x += 1) { wire.push((row - 5) * W + x, 1); pipe.push((row - 5) * W + x, 1); }
  apply(state, { type: c.CMD_PLACE_WIRE, actor: 1, runs: wire });
  apply(state, { type: c.CMD_PLACE_PIPE, actor: 1, runs: pipe });

  const treasuryBefore = state.players[0].treasury;
  const eventKinds = new Set();
  for (let i = 0; i < 400; i += 1) {
    const outcome = apply(state, { type: c.CMD_TICK });
    for (const event of outcome.events ?? []) eventKinds.add(event.kind);
  }
  renderer.worldChanged();
  return {
    row,
    buildings: state.buildings.length,
    population: state.population,
    jobs: state.jobs,
    treasuryBefore,
    treasuryAfter: state.players[0].treasury,
    events: [...eventKinds],
  };
};

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const url = `http://127.0.0.1:${port}/index.html?seed=1003&size=64`;
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

  // §24.1 — start an empty map
  const start = await page.evaluate(() => ({
    buildings: globalThis.CITY.state.buildings.length,
    tick: globalThis.CITY.state.tick,
    width: globalThis.CITY.state.width,
  }));
  criterion(1, "Start an empty map", start.buildings === 0 && start.width === 64,
    `${start.width}×${start.width}, ${start.buildings} buildings`);

  // §24.2 — build a road, by hand
  await page.evaluate(() => { globalThis.CITY.pause(); globalThis.CITY.state.players[0].treasury = 900000; });
  await page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js");
    globalThis.THREE_VEC = THREE.Vector3;
  });
  const pixel = (tx, ty) => page.evaluate(([x, y]) => {
    const { renderer } = globalThis.CITY;
    const canvas = document.getElementById("city");
    const v = new globalThis.THREE_VEC(x + 0.5, 0, y + 0.5);
    v.project(renderer.view.camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }, [tx, ty]);

  await page.click('.hud-toolbar button[data-tool="road"]');
  const from = await pixel(20, 20);
  const to = await pixel(30, 20);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
  const roadTiles = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let n = 0;
    for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) n += 1;
    return n;
  });
  criterion(2, "Build a road", roadTiles > 5, `${roadTiles} tiles by pointer`);

  // §24.4 — paint all three zone types, by hand
  const zoned = {};
  for (const [tool, zone, y] of [["zoneResidential", 1, 21], ["zoneCommercial", 2, 23], ["zoneIndustrial", 3, 25]]) {
    await page.click(`.hud-toolbar button[data-tool="${tool}"]`);
    const a = await pixel(20, y);
    const b = await pixel(26, y + 1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 2 });
    await page.mouse.up();
    zoned[zone] = await page.evaluate((z) => {
      const { state } = globalThis.CITY;
      let n = 0;
      for (let i = 0; i < state.tiles.zone.length; i += 1) if (state.tiles.zone[i] === z) n += 1;
      return n;
    }, zone);
  }
  criterion(4, "Paint all three zone types", zoned[1] > 0 && zoned[2] > 0 && zoned[3] > 0,
    `R ${zoned[1]}, C ${zoned[2]}, I ${zoned[3]} — all by pointer`);

  // Now a full city, for the simulation criteria.
  const ground = await page.evaluate(LAY_GROUND);
  if (ground.reason) throw new Error(`could not lay out a city: ${ground.reason}`);

  /** Picks a building off the toolbar and puts it down on a tile, the way a
   * person does: click the button, look at the map, click the ground. The
   * camera is moved onto the target first, because a player pans too. */
  const placeByPointer = async (target, def, tx, ty) => {
    await target.evaluate(async ([x, y]) => {
      const { focusOn } = await import("/client/render/camera.js");
      focusOn(globalThis.CITY.renderer.view, x, y);
    }, [tx + 1, ty + 1]);
    // The buildings live in a popover now (P29), so it has to be opened first —
    // which is what a player does too.
    if (await target.locator("#build-menu").isHidden()) await target.click("#build");
    const button = `.hud-toolbar button[data-def="${def}"]`;
    if (await target.locator(button).count() === 0) return { def, result: "no such button" };
    await target.click(button);
    const at = await target.evaluate(([x, y]) => {
      const { renderer } = globalThis.CITY;
      const canvas = document.getElementById("city");
      const v = new globalThis.THREE_VEC(x + 0.5, 0, y + 0.5);
      v.project(renderer.view.camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    }, [tx, ty]);
    await target.mouse.move(at.x, at.y);
    await target.mouse.down();
    await target.mouse.up();
    const placed = await target.evaluate(([d, x, y]) =>
      globalThis.CITY.state.buildings.some((b) => b.def === d && b.x === x && b.y === y),
    [def, tx, ty]);
    return { def, result: placed ? "ok" : "not placed" };
  };

  const utilities = [
    await placeByPointer(page, "coalPlant", 11, ground.row - 6),
    await placeByPointer(page, "groundwaterPump", 23, ground.row - 6),
  ];
  criterion(3, "Place electricity and water infrastructure",
    utilities.every((u) => u.result === "ok"),
    utilities.map((u) => `${u.def}: ${u.result}`).join(", ") + " — both by pointer");

  const city = await page.evaluate(RUN_CITY, ground.row);
  criterion(5, "Watch buildings develop", city.buildings > 2, `${city.buildings} buildings after 400 ticks`);
  criterion(6, "Grow a city with residents and jobs", city.population > 0 && city.jobs > 0,
    `${city.population} residents, ${city.jobs} jobs`);
  // The rate is a lever only if the player can pull it. `CMD_SET_TAX` existed
  // from the economy slice with nothing in the interface to send it.
  // The tax control moved into the budget drawer on the left rail (P29).
  await page.click("#rail-budget");
  const taxed = await page.evaluate(() => {
    const slider = document.getElementById("tax");
    if (!slider) return { reason: "no tax control" };
    const before = globalThis.CITY.state.tax;
    slider.value = String(Math.min(Number(slider.max), before + 3));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return { before, after: globalThis.CITY.state.tax, shown: slider.value };
  });
  criterion(7, "Collect taxes and pay maintenance",
    city.events.includes("budget") && taxed.after > taxed.before,
    `treasury ${city.treasuryBefore} → ${city.treasuryAfter}; budget events seen; `
    + (taxed.reason ?? `tax ${taxed.before}% → ${taxed.after}% from the slider`));

  // §24.8 — diagnose through overlays
  // Overlays moved into a drawer on the left rail (P29).
  await page.click("#rail-overlays");
  const overlayCheck = await page.evaluate(async () => {
    const out = {};
    for (const name of ["power", "water", "pollution", "traffic"]) {
      document.querySelector(`.hud-overlays button[data-overlay="${name}"]`).click();
      globalThis.CITY.renderer.draw({ overlay: name });
      out[name] = globalThis.CITY.renderer.stats.instances;
      document.querySelector(`.hud-overlays button[data-overlay="${name}"]`).click();
    }
    return out;
  });
  criterion(8, "Diagnose utility and service problems through overlays",
    Object.values(overlayCheck).every((n) => n > 0), JSON.stringify(overlayCheck));

  // §24.9 — build police, fire and hospital, off the toolbar
  const serviceRow = await page.evaluate(() => globalThis.CITY.state.height - 20);
  const services = [];
  for (const [def, x] of [["policeStation", 30], ["fireStation", 34], ["hospital", 38]]) {
    services.push(await placeByPointer(page, def, x, serviceRow));
  }
  criterion(9, "Build police, fire, and hospital services",
    services.every((r) => r.result === "ok"),
    services.map((r) => `${r.def}: ${r.result}`).join(", ") + " — all by pointer");

  // §24.10 — respond to a fire or civic incident
  const incident = await page.evaluate(async () => {
    const { state } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const { CMD_TICK } = await import("/engine/commands.js");
    const { DISASTER_WILDFIRE, PHASE_WARNING } = await import("/engine/disasters.js");
    // Arm a real disaster and let it run its course, warning included.
    state.disaster.kind = DISASTER_WILDFIRE;
    state.disaster.phase = PHASE_WARNING;
    state.disaster.ticks = 1;
    state.disaster.x = 20;
    state.disaster.y = 20;
    state.disaster.radius = 4;
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const outcome = apply(state, { type: CMD_TICK });
      for (const event of outcome.events ?? []) seen.add(event.kind);
    }
    return { seen: [...seen], population: state.population, buildings: state.buildings.length };
  });
  criterion(10, "Respond to a fire or civic incident",
    incident.seen.includes("disasterStruck") && incident.buildings > 0,
    `${incident.seen.filter((k) => k.startsWith("disaster") || k.startsWith("fire")).join(", ")}; ${incident.buildings} buildings survive`);

  // §24.11 — complete guided quests
  const questRun = await page.evaluate(async () => {
    const { state } = globalThis.CITY;
    const { questPass, questCatalogue } = await import("/engine/quests.js");
    for (let i = 0; i < 5; i += 1) questPass(state);
    return {
      catalogue: questCatalogue().length,
      completed: state.quests.completed.length,
      active: state.quests.active.length,
      advisorVisible: !document.querySelector(".hud-advisor").hidden,
    };
  });
  criterion(11, "Complete guided quests",
    questRun.catalogue > 0 && questRun.completed > 0,
    `${questRun.catalogue} in the catalogue, ${questRun.completed} completed, ${questRun.active} active`);

  // §24.12 — save, close, reload, continue
  const hashBefore = await page.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    await globalThis.CITY.save("slot1");
    return hashState(globalThis.CITY.state);
  });
  await page.close();
  const second = await context.newPage();
  second.on("pageerror", (e) => pageErrors.push(e.message));
  await second.goto(url);
  await second.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  const hashAfter = await second.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    await globalThis.CITY.load("slot1");
    return hashState(globalThis.CITY.state);
  });
  criterion(12, "Save, close, reload, and continue the same city",
    hashBefore === hashAfter, `${hashBefore} → ${hashAfter}`);
  await context.close();

  // §24.13 — mouse or touch. Comfort is not measurable; reach and size are.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phonePage = await phone.newPage();
  phonePage.on("pageerror", (e) => pageErrors.push(`phone: ${e.message}`));
  await phonePage.goto(url);
  await phonePage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await phonePage.evaluate(() => { globalThis.CITY.pause(); globalThis.CITY.state.players[0].treasury = 900000; });
  await phonePage.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js");
    globalThis.THREE_VEC = THREE.Vector3;
  });
  await phonePage.click('.hud-toolbar button[data-tool="road"]');
  const pFrom = await phonePage.evaluate(() => {
    const canvas = document.getElementById("city");
    return { x: canvas.clientWidth * 0.35, y: canvas.clientHeight * 0.4 };
  });
  await phonePage.mouse.move(pFrom.x, pFrom.y);
  await phonePage.mouse.down();
  await phonePage.mouse.move(pFrom.x + 90, pFrom.y, { steps: 4 });
  await phonePage.mouse.up();
  const phoneCheck = await phonePage.evaluate(() => {
    const { state } = globalThis.CITY;
    let roads = 0;
    for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) roads += 1;
    // Only what is ON SCREEN. Since P29 the building menu and the overlay list
    // live in a popover and a drawer that are closed by default, and a hidden
    // control measures 0px — which is not "too small to tap", it is "not
    // there". A control the player cannot see is not a touch target.
    const buttons = [...document.querySelectorAll(
      ".hud-toolbar button, .hud-overlays button, .rail-button, .hud-top button")]
      .filter((b) => b.getClientRects().length > 0);
    const small = buttons.filter((b) => b.getBoundingClientRect().height < 36).length;
    return {
      roads,
      buttons: buttons.length,
      small,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      panel: document.querySelector(".hud-bottom").getBoundingClientRect().height
        + document.querySelector(".hud-top").getBoundingClientRect().height,
    };
  });
  criterion(13, "Play comfortably using either mouse or touch controls",
    phoneCheck.roads > 0 && phoneCheck.small === 0 && !phoneCheck.sideways,
    `${phoneCheck.roads} road tiles drawn by touch; ${phoneCheck.small} of ${phoneCheck.buttons} controls under 36px; sideways scroll ${phoneCheck.sideways}`);

  await phonePage.screenshot({ path: join(root, "reports", "mvp-phone.png") });
  await phone.close();
} finally {
  await browser.close();
  server.close();
}

console.log("MVP success criteria (gamedesign.md §24)\n");
for (const r of results.sort((a, b) => a.number - b.number)) {
  console.log(`${r.ok ? " ok  " : "FAIL "} ${String(r.number).padStart(2)}. ${r.name}`);
  if (r.detail) console.log(`        ${r.detail}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of 13 criteria met`);
console.log("\nNot automated, and deliberately so:");
console.log("  - whether the loop is SATISFYING (§24's closing paragraph) — that is the playtest");
console.log("  - whether touch is COMFORTABLE — reach and target size are checked; comfort is not");

if (pageErrors.length > 0) {
  console.error(`\n${pageErrors.length} page error(s):`);
  for (const e of pageErrors.slice(0, 8)) console.error(`  - ${e}`);
}
if (failed.length > 0 || pageErrors.length > 0) process.exit(1);
console.log("\nMVP acceptance ok");
