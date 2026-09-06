// Does the triangle budget mean anything?
//
// Ruling 019 says the budget is enforced by measurement: `choosePlan` estimates,
// `draw()` renders, reads three's own counter and steps down the sacrifice
// ladder if it is over. What nothing checked is whether the two numbers are
// still anywhere near each other — and they were not.
//
// N28 gave the road, the wire and the pipe a skirt to close an elevation seam:
// twelve triangles a tile where the cost table still said "one upward quad",
// and wire and pipe were not in the table at all. On a saturated 96×96 the
// planner believed 79,068 triangles while the renderer drew 97,500, over an
// 80,000 budget with the whole ladder already spent — so the city rendered with
// no trees and no markings and was over anyway. The suite was green, all eleven
// browser gates were green, and every screenshot looked plausible.
//
// So this builds a saturated city on the real page and, at each zoom, asks the
// two questions no other gate asks:
//
//   1. is the frame actually inside its budget?
//   2. is the estimate still close enough to the truth to plan with?
//
// The second matters as much as the first, and in the opposite direction: the
// correction loop only ever steps DOWN, so an estimate that over-charges
// permanently sacrifices detail the frame had room for.
//
// V2 added the tiers (ruling 040): the gate runs at Low, Medium and High,
// because a budget that is only ever checked at one number is a budget for one
// machine.
//
//   node tools/budget_gate.mjs [--tier=low|medium|high]      (default: all three)

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

/** How far the estimate may sit from the truth and still be worth planning
 * with. Ruling 019 recorded "within about 10%" when the model was last
 * measured, and P35 measured 1–5% across four zooms on a saturated city. This
 * is deliberately looser than that: the job of the number is to catch a term
 * that has gone MISSING or doubled, not to police the last few per cent. */
const TOLERANCE = 0.25;

const asked = process.argv.find((a) => a.startsWith("--tier="))?.split("=")[1];
const TIERS = asked ? [asked] : ["low", "medium", "high"];

const server = createServer(async (req, res) => {
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

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=96&life=0`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });

  // A city with something of everything in it, on every tile the camera can
  // see. Measuring on an empty map is measuring nothing.
  await page.evaluate(async () => {
    const { state } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    globalThis.CITY.pause();
    state.players[0].treasury = 90000000;
    const W = state.width;
    for (let y = 8; y < W - 8; y += 4) apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [y * W + 8, W - 16] });
    for (let x = 8; x < W - 8; x += 4) {
      const runs = [];
      for (let y = 8; y < W - 8; y += 1) runs.push(y * W + x, 1);
      apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs });
    }
    for (let y = 9; y < W - 9; y += 4) {
      const runs = [];
      for (let x = 9; x < W - 9; x += 1) runs.push(y * W + x, 1);
      apply(state, { type: C.CMD_PAINT_ZONE, actor: 1, runs, zone: ((y / 4) | 0) % 3 + 1 });
    }
    for (let y = 8; y < W - 8; y += 8) {
      const runs = [];
      for (let x = 8; x < W - 8; x += 1) runs.push(y * W + x, 1);
      apply(state, { type: C.CMD_PLACE_WIRE, actor: 1, runs });
      apply(state, { type: C.CMD_PLACE_PIPE, actor: 1, runs });
    }
    for (let i = 0; i < 400; i += 1) apply(state, { type: C.CMD_TICK });
    globalThis.CITY.renderer.worldChanged();
    const { focusOn } = await import("/client/render/camera.js");
    focusOn(globalThis.CITY.renderer.view, W / 2, W / 2);
  });

  const rows = [];
  for (const mode of ["ortho", "city"]) {
  await page.evaluate((m) => globalThis.CITY.setProjection(m), mode);
  for (const tier of TIERS) {
  const applied = await page.evaluate((name) => {
    globalThis.CITY.setQuality(name);
    return { tier: globalThis.CITY.renderer.tier, budget: globalThis.CITY.renderer.stats.budget };
  }, tier);
  check(`${tier}: the tier is applied`, applied.tier === tier, JSON.stringify(applied));
  for (const span of [10, 20, 40, 80]) {
    const row = await page.evaluate(async (target) => {
      const { renderer } = globalThis.CITY;
      const { zoomBy } = await import("/client/render/camera.js");
      zoomBy(renderer.view, target / renderer.view.span);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frame();
      await new Promise((r) => setTimeout(r, 250));
      await frame();
      const s = renderer.stats;
      return {
        span: Math.round(renderer.view.span),
        budget: s.budget,
        estimate: s.estimate,
        actual: s.triangles,
        lod: s.lod,
        rebuilds: s.rebuilds,
      };
    }, span);
    rows.push({ ...row, tier, mode });
    console.log(`      ${mode.padEnd(5)} ${tier.padEnd(6)} span ${String(row.span).padStart(3)}  estimate ${String(row.estimate).padStart(7)}`
      + `  actual ${String(row.actual).padStart(7)}  budget ${String(row.budget).padStart(6)}  ${row.lod || "full detail"}`);
  }
  }
  }

  for (const row of rows) {
    check(`${row.mode} ${row.tier} span ${row.span}: the frame is inside its budget`, row.actual <= row.budget,
      `${row.actual} of ${row.budget}, ladder at "${row.lod || "full detail"}"`);
  }

  // The model, not the frame. A term that goes missing shows up here first —
  // and it is the only place it CAN show up, because the correction loop hides
  // an under-charging model by stepping down until the truth fits.
  for (const row of rows) {
    const drift = Math.abs(row.estimate - row.actual) / Math.max(row.actual, 1);
    check(`${row.mode} ${row.tier} span ${row.span}: the estimate is worth planning with`, drift <= TOLERANCE,
      `estimate ${row.estimate} against ${row.actual} actual — ${Math.round(drift * 100)}% out`);
  }

  // The DEFAULT span on a smaller, fully wired city — the case that found the
  // Low tier 42,202 triangles over a 40,000 budget with the ladder spent
  // (slice V2). Four spans on one 96×96 is not a survey; the view a player
  // actually opens on is a different frame from any of them.
  for (const tier of TIERS) {
    const row = await page.evaluate(async (name) => {
      const { renderer, state } = globalThis.CITY;
      const { focusOn, zoomBy } = await import("/client/render/camera.js");
      globalThis.CITY.setQuality(name);
      focusOn(renderer.view, state.width / 2, state.height / 2);
      zoomBy(renderer.view, (Math.max(state.width, state.height) * 0.7) / renderer.view.span);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frame();
      await new Promise((r) => setTimeout(r, 200));
      await frame();
      const s = renderer.stats;
      return { span: Math.round(renderer.view.span), budget: s.budget, actual: s.triangles, lod: s.lod };
    }, tier);
    check(`${tier} at the opening span: inside its budget`, row.actual <= row.budget,
      `${row.actual} of ${row.budget} at span ${row.span}, ladder at "${row.lod}"`);
  }

  // --- the street-chunk cache (slice E2, spec §6.4) ---------------------------
  //
  // The numbers E3 and E5 will be measured against: how long a chunk takes to
  // bake, how many draw calls a baked chunk costs, and whether the cache
  // actually caches — a second pass over an unchanged city must build nothing.
  const streets = await page.evaluate(async () => {
    const { renderer, state } = globalThis.CITY;
    const { focusOn, zoomBy } = await import("/client/render/camera.js");
    // The budget city is roads and zoning; nothing DEVELOPS without power and
    // water, so it has no buildings and therefore no lots to bake. Placed
    // directly, the way `test/traffic.test.js` seeds the engine's own commuter
    // pass — this check runs last, after every budget row is collected.
    if (state.buildings.length === 0) {
      let id = 1;
      const W = state.width;
      for (let y = 10; y < W - 10; y += 1) {
        for (let x = 10; x < W - 10; x += 1) {
          if ((state.tiles.road[y * W + x] & 16) !== 0) continue;
          if ((x + y) % 3 !== 0) continue;
          state.buildings.push({
            id, def: "res", zone: 1, x, y, w: 1, h: 1, owner: 1,
            level: 2, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
          });
          state.tiles.buildingId[y * W + x] = id;
          id += 1;
        }
      }
      state.nextId = id;
      renderer.worldChanged();
    }
    globalThis.CITY.setQuality("high");
    focusOn(renderer.view, state.width / 2, state.height / 2);
    zoomBy(renderer.view, 4 / renderer.view.span);   // close enough for L3
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const builds = [];
    let now = 0;
    // One chunk a frame, so nine frames for nine chunks — plus a few spare.
    for (let i = 0; i < 24; i += 1) {
      now += 16;
      renderer.draw({ now });
      await frame();
      const s = renderer.stats.streets;
      if (s?.built) builds.push(s.buildMs);
    }
    const after = renderer.stats.streets;

    // A second pass over an unchanged city: the cache must build nothing.
    let rebuilt = 0;
    for (let i = 0; i < 6; i += 1) {
      now += 16;
      renderer.draw({ now });
      await frame();
      rebuilt += renderer.stats.streets?.built ?? 0;
    }

    // What a baked group actually costs in draw calls.
    let meshes = 0;
    let groups = 0;
    for (const child of renderer.scene.children) {
      if (child.type === "Group" && child.children.length > 0 && String(child.children[0].name).includes(":")) {
        groups += 1;
        meshes += child.children.length;
      }
    }
    return { builds, live: after?.live ?? 0, triangles: after?.triangles ?? 0, rebuilt, groups, meshes };
  });

  const sorted = [...streets.builds].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
  console.log(`      street chunks: ${streets.live} live, ${streets.groups} groups / ${streets.meshes} meshes, `
    + `${streets.triangles} triangles, build p95 ${p95} ms over ${streets.builds.length} builds`);
  check("street chunks are baked at all", streets.live > 0, JSON.stringify(streets));
  check("a chunk bakes inside its frame budget", p95 <= 8, `p95 ${p95} ms over ${streets.builds.length} builds`);
  check("a baked chunk is one draw call per material",
    streets.groups > 0 && streets.meshes / streets.groups <= 4,
    `${streets.meshes} meshes over ${streets.groups} groups`);
  check("the cache caches: an unchanged city rebuilds nothing",
    streets.rebuilt === 0, `${streets.rebuilt} rebuild(s) over six frames`);

  // --- cars (R1.1, R1.2) -----------------------------------------------------
  //
  // Its own page, with `life=1`: the budget page is loaded frozen so two frames
  // of it are the same picture, and a frozen city has no traffic to look at.
  const carsPage = await context.newPage();
  carsPage.on("pageerror", (error) => errors.push(`cars: ${error.message}`));
  await carsPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
  await carsPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  const cars = await carsPage.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    await import("/engine/build-commands.js");
    const state = globalThis.CITY.state;
    const W = state.width;
    // A road with traffic on it. The engine's commuter layer is what the
    // renderer's cars read (ruling 037).
    apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [Math.round(W / 2) * W + 4, W - 8] });
    for (let i = 0; i < state.tiles.road.length; i += 1) {
      if (state.tiles.road[i] & 16) state.tiles.traffic[i] = 200;
    }
    globalThis.CITY.renderer.worldChanged();

    const { focusOn, zoomBy } = await import("/client/render/camera.js");
    const renderer = globalThis.CITY.renderer;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    globalThis.CITY.setQuality("high");
    focusOn(renderer.view, W / 2, Math.round(W / 2) + 0.5);
    zoomBy(renderer.view, 14 / renderer.view.span);
    for (let i = 0; i < 40; i += 1) await frame();

    const pools = renderer.pools;
    const keys = ["car0", "car1"];
    return {
      inPools: keys.reduce((n, k) => n + (pools[k]?.count ?? 0), 0),
      hidden: keys.filter((k) => (pools[k]?.count ?? 0) > 0 && !pools[k].visible).length,
      inCity: renderer.traffic.count(),
      counted: renderer.stats.counted,
      lod: renderer.stats.lod,
    };
  });
  await carsPage.close();
  console.log(`      cars: ${cars.inPools} in the pools, ${cars.inCity} moving in the city, `
    + `ladder at "${cars.lod}"`);
  check("cars are moving at a street zoom", cars.inCity > 0, JSON.stringify(cars));
  check("and they are drawn", cars.inPools > 0, JSON.stringify(cars));
  check("no pool is hidden after the cars went into it (R1.2)", cars.hidden === 0,
    `${cars.hidden} pool(s) hidden with cars in them`);

  // --- night (slice E6, spec §7.3) -------------------------------------------
  //
  // Night is what pays for L3 — lit windows, lit shopfronts, lamp pools — and
  // it is also the frame that carries the most: every emissive bucket is on and
  // the tier's point lights are all live. The budget has never been measured
  // there, and a tier that fits by day and not by night is a tier that is
  // wrong.
  const night = await page.evaluate(async () => {
    const renderer = globalThis.CITY.renderer;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    globalThis.CITY.setQuality("high");
    // Through the SESSION, not by passing `time` to `draw`: the page's own
    // frame loop is still running and hands the renderer whatever the setting
    // says, so a gate that only overrides one draw is a gate measuring the
    // frame after it.
    globalThis.CITY.setTime("night");
    for (let i = 0; i < 8; i += 1) await frame();
    const s = renderer.stats;
    return {
      night: renderer.night,
      lamps: s.lamps, held: s.lampsHeld,
      actual: s.triangles, budget: s.budget, lod: s.lod,
      calls: renderer.renderer.info.render.calls,
    };
  });
  console.log(`      night: ${night.lamps} of ${night.held} lamps lit, ${night.actual} triangles `
    + `of ${night.budget}, ${night.calls} draw calls, ladder at "${night.lod}"`);
  check("night arrives", night.night === 1, `night is ${night.night}`);
  check("the street has lamps to light", night.held > 0, `${night.held} lamps in the cache`);
  check("the lamp pool fills to the tier's cap", night.lamps > 0 && night.lamps <= 8,
    `${night.lamps} lit against a cap of 8`);
  check("a night frame is inside the same budget as a day one",
    night.actual <= night.budget, `${night.actual} of ${night.budget}`);

  // --- the painted finish (slice P2, spec §7.4) -------------------------------
  //
  // The ink is two full-screen passes over a depth texture and the style that
  // wears it is the most expensive one there is. It is also the case where the
  // budget's own measurement was wrong until P2: with a post pass the counter
  // reads the full-screen quad, so the ladder spent every frame believing the
  // city was free.
  // A style is chosen at boot (it decides the materials), so this is a second
  // page rather than a switch.
  const paintedPage = await context.newPage();
  paintedPage.on("pageerror", (error) => errors.push(`painted: ${error.message}`));
  paintedPage.on("console", (m) => { if (m.type() === "error") errors.push(`painted: ${m.text()}`); });
  await paintedPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64&life=0&style=painted`);
  await paintedPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  const painted = await paintedPage.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    globalThis.CITY.setQuality("high");
    for (let i = 0; i < 6; i += 1) await frame();
    const renderer = globalThis.CITY.renderer;
    const s = renderer.stats;
    return {
      style: renderer.style?.name, actual: s.triangles, budget: s.budget,
      calls: s.drawCalls, lod: s.lod, quadOnly: renderer.renderer.info.render.triangles,
    };
  });
  await paintedPage.close();
  console.log(`      painted: ${painted.actual} triangles of ${painted.budget}, `
    + `${painted.calls} draw calls, ladder at "${painted.lod}"`);
  // Checked, not skipped: a block guarded by "if the style loaded" is a block
  // that reports nothing when the style did not, which is the one case worth
  // hearing about.
  check("the painted style loads", painted.style === "painted", `the page is in "${painted.style}"`);
  check("the painted finish is inside its budget",
    painted.actual > 0 && painted.actual <= painted.budget, `${painted.actual} of ${painted.budget}`);
  check("and the budget is measuring the CITY, not the full-screen quad",
    painted.actual > 1000 && painted.quadOnly <= 6,
    `${painted.actual} counted, ${painted.quadOnly} in three's counter after the pass`);

  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\nbudget gate ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
