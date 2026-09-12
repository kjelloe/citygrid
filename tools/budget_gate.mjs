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
  // `style=plain` PINNED: R2 made the style a setting whose default is
  // `painted` on a desktop, and every number in this gate's history was
  // measured on plain. The painted rows below load their own page.
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=96&life=0&style=plain&lock=0`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  await page.evaluate(() => document.querySelector("#controls-dismiss")?.click());

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
    for (let i = 0; i < 240; i += 1) apply(state, { type: C.CMD_TICK });
    globalThis.CITY.renderer.worldChanged();
    const { focusOn } = await import("/client/render/camera.js");
    focusOn(globalThis.CITY.renderer.view, W / 2, W / 2);
  });

  const rows = [];
  for (const mode of ["ortho", "city"]) {
  await page.evaluate((m) => globalThis.CITY.setProjection(m), mode);
  for (const tier of TIERS) {
  // A DRAW between setting the tier and reading the budget (R4). `stats` is
  // filled by `draw`, so reading it straight after `setQuality` reported the
  // PREVIOUS tier's number — the log said `low … 320000`, `medium … 40000`,
  // `high … 140000`, each one the tier before it, for as long as this row has
  // existed. And the assertion was on the tier NAME only, so the wrong number
  // went past a green check every run.
  const applied = await page.evaluate(async (name) => {
    globalThis.CITY.setQuality(name);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    globalThis.CITY.renderer.draw({});
    await frame();
    const { tiers } = await import("/client/world/config.js").then((m) => ({ tiers: m.getConfig().tiers }));
    return {
      tier: globalThis.CITY.renderer.tier,
      budget: globalThis.CITY.renderer.stats.budget,
      wanted: tiers[name].budget,
    };
  }, tier);
  check(`${tier}: the tier is applied`, applied.tier === tier, JSON.stringify(applied));
  // And the budget the tier's row in `data/cityviewer.json` asks for, which is
  // what this check was for.
  check(`${tier}: the budget is the tier's own`, applied.budget === applied.wanted,
    `${applied.budget} against ${applied.wanted}`);
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

  // --- an overlay costs no geometry (slice V7, ruling 041) -------------------
  //
  // It used to cost 24,000 instanced quads — one a tile, at the mean of the
  // tile's four corners — which on the Low tier was more than half the whole
  // triangle budget and was the reason overlays were the first thing the
  // ladder sacrificed. As a byte plane in the terrain material it costs the
  // upload and nothing else, and the marks that say where wire and pipe reach
  // are all that is left in the pools.
  const overlayCost = await page.evaluate(async () => {
    const { renderer } = globalThis.CITY;
    const { focusOn, zoomBy } = await import("/client/render/camera.js");
    globalThis.CITY.setQuality("high");
    focusOn(renderer.view, 48, 48);
    zoomBy(renderer.view, 40 / renderer.view.span);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const settle = async (overlay) => {
      for (let i = 0; i < 6; i += 1) { renderer.draw({ overlay }); await frame(); }
      const s = renderer.stats;
      return { triangles: s.triangles, estimate: s.estimate, budget: s.budget, draws: s.drawCalls };
    };
    const off = await settle(undefined);
    const on = await settle("pollution");
    return { off, on };
  });
  const extra = overlayCost.on.triangles - overlayCost.off.triangles;
  console.log(`      overlay on: ${overlayCost.on.triangles} triangles against ${overlayCost.off.triangles} off`
    + ` (+${extra}), ${overlayCost.on.draws} draws, estimate ${overlayCost.on.estimate}`);
  check("an overlay adds no ground geometry", extra <= 2000,
    `${extra} triangles more with the wash on`);
  check("an overlay stays inside the budget", overlayCost.on.triangles <= overlayCost.on.budget,
    `${overlayCost.on.triangles} of ${overlayCost.on.budget}`);
  check("the estimate still knows what the frame costs with an overlay on",
    Math.abs(overlayCost.on.estimate - overlayCost.on.triangles) / Math.max(overlayCost.on.triangles, 1) <= TOLERANCE,
    `estimate ${overlayCost.on.estimate} against ${overlayCost.on.triangles} actual`);

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
    // The territory overlay reaches the BAKED half of the city too (V7, A44).
    // The instanced boxes take the owner's colour the moment it is on; a baked
    // chunk keeps the colour it was built with, so the far half of the city was
    // in player colours and the near half was not. The hash is salted with the
    // flag, so the toggle marks every live chunk stale — this counts the
    // rebakes rather than trusting that it does.
    //
    // Through the renderer's own `draw`, not as an argument to a draw of our
    // own: the page runs its own frame loop, and a gate that passed the flag on
    // alternate frames measured the cache thrashing between the two answers —
    // 15 rebakes on, 9 more with nothing changing, 0 coming back off.
    const realDraw = renderer.draw.bind(renderer);
    // Every frame that baked, with the live chunk keys and the ladder's reason,
    // so a count that comes out wrong says WHICH chunk came back and why.
    const trail = [];
    const rebakes = async (territory, label) => {
      renderer.draw = (options = {}) => realDraw({ ...options, territory });
      let count = 0;
      for (let i = 0; i < 24; i += 1) {
        now += 16;
        renderer.draw({ now });
        await frame();
        const built = renderer.stats.streets?.built ?? 0;
        count += built;
        if (built > 0) {
          trail.push(`${label} frame ${i}: +${built}, live [${renderer.stats.streets?.keys ?? ""}], `
            + `"${renderer.stats.lod}", ${renderer.stats.triangles} of ${renderer.stats.budget}`);
        }
      }
      return count;
    };
    const onToggle = await rebakes(true, "on");
    const settled = await rebakes(true, "stayed on");
    const offToggle = await rebakes(false, "off");
    renderer.draw = realDraw;

    return {
      builds, live: after?.live ?? 0, triangles: after?.triangles ?? 0, rebuilt, groups, meshes,
      onToggle, settled, offToggle, trail,
    };
  });

  console.log(`      territory toggle: ${streets.onToggle} chunks rebaked on, ${streets.settled} while it stayed on, `
    + `${streets.offToggle} coming back off`);
  check("turning the territory overlay on rebakes the streets", streets.onToggle >= streets.live,
    `${streets.onToggle} rebakes for ${streets.live} live chunks`);
  check("and it settles again rather than rebaking every frame", streets.settled === 0,
    `${streets.settled} rebakes with nothing changing`);
  if (streets.settled !== 0 || streets.offToggle > streets.live + 1) {
    for (const line of streets.trail) console.log(`        ${line}`);
  }
  check("and turning it off rebakes them back", streets.offToggle >= streets.live,
    `${streets.offToggle} rebakes for ${streets.live} live chunks`);

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
  await carsPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64&lock=0`);
  await carsPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  await carsPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
  const cars = await carsPage.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    await import("/engine/build-commands.js");
    const state = globalThis.CITY.state;
    const W = state.width;
    // A road with traffic on it. The engine's commuter layer is what the
    // renderer's cars read (ruling 037).
    const mid = Math.round(W / 2);
    apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [mid * W + 4, W - 8] });
    // A CROSSING, not just a straight (B4). A free-flowing straight has nothing
    // to turn into and nothing to close on, so the lamp counts on one are zero
    // whether the feature works or not — a gate that cannot fail.
    for (const x of [mid - 6, mid + 6]) {
      const runs = [];
      for (let y = mid - 6; y <= mid + 6; y += 1) runs.push(y * W + x, 1);
      apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs });
    }
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

    // Simulated time first. Forty frames under SwiftShader is a second or two
    // of traffic, and a car that spawned at an entry has not reached a
    // junction yet — the first run of this block reported 0 braking and 0
    // indicating on 48 cars, a gate failing on how long it waited rather than
    // on the lamps. Sixty simulated seconds, as the settled counts use (D7).
    for (let i = 0; i < 60 * 30; i += 1) renderer.traffic.update(1 / 30);
    // Then over a second of frames, not one: a lamp is a thing that happens,
    // and an indicator blinks. The MAX is what the pools have to carry.
    const pools = renderer.pools;
    let brake = 0;
    let turn = 0;
    for (let i = 0; i < 40; i += 1) {
      await frame();
      brake = Math.max(brake, pools.carBrake?.count ?? 0);
      turn = Math.max(turn, pools.carTurn?.count ?? 0);
    }
    const keys = ["car0", "car1"];
    return {
      inPools: keys.reduce((n, k) => n + (pools[k]?.count ?? 0), 0),
      hidden: keys.filter((k) => (pools[k]?.count ?? 0) > 0 && !pools[k].visible).length,
      // What the cars are DOING (B4). Two pools that ride the bodies; the
      // number that matters is the SHARE, because a lamp on every car is a
      // threshold that has stopped discriminating.
      brake,
      turn,
      inCity: renderer.traffic.count(),
      counted: renderer.stats.counted,
      lod: renderer.stats.lod,
    };
  });
  await carsPage.close();
  console.log(`      cars: ${cars.inPools} in the pools, ${cars.inCity} moving in the city, `
    + `ladder at "${cars.lod}"`);
  console.log(`      lamps: ${cars.brake} braking, ${cars.turn} indicating `
    + `(${cars.inPools > 0 ? Math.round(100 * cars.brake / cars.inPools) : 0}% of the cars on screen)`);
  check("cars are moving at a street zoom", cars.inCity > 0, JSON.stringify(cars));
  check("and they are drawn", cars.inPools > 0, JSON.stringify(cars));
  check("no pool is hidden after the cars went into it (R1.2)", cars.hidden === 0,
    `${cars.hidden} pool(s) hidden with cars in them`);
  // Not "some car is braking" — on a free-flowing straight none is, and that is
  // correct. The check is that the lamps cannot be on for EVERYBODY, which is
  // the failure a threshold picked by eye actually has (B4).
  // Both directions. A lamp that never lights is the feature not working; a
  // lamp that is on for everybody is a threshold that has stopped
  // discriminating, and both look like a green gate from one side only.
  check("somebody's brakes come on at a junction", cars.brake > 0, JSON.stringify(cars));
  check("the brake lights are a signal, not a paint job", cars.brake <= cars.inPools * 0.8,
    `${cars.brake} of ${cars.inPools} cars have their brakes on`);
  check("somebody indicates at a junction", cars.turn > 0, JSON.stringify(cars));
  check("the indicators are a signal too", cars.turn <= cars.inPools * 0.6,
    `${cars.turn} of ${cars.inPools} cars are indicating`);

  // --- the people, priced against the night frame (slice E7, spec §9.3) ------
  //
  // The item said price them BEFORE building them, and this is where the number
  // comes from: a night frame at High was 266,538 of 320,000 before there was a
  // single pedestrian, so what fits is whatever is left. The tier caps them at
  // 120; the question this row answers is whether 120 of them at a three-box
  // body is inside the gap, and whether they are cheap enough that the ladder
  // never has to reach for them first.
  const crowd = await page.evaluate(async () => {
    const { renderer, state } = globalThis.CITY;
    const { focusOn, zoomBy } = await import("/client/render/camera.js");
    const { getCosts } = await import("/client/render/lod.js");
    globalThis.CITY.setQuality("high");
    // The buildings were planted straight into `state.buildings` by the street
    // section above; the nav graph is derived from the model and has to be told
    // (E7). Without it the doors are the ones the empty city had — none.
    renderer.worldChanged();
    focusOn(renderer.view, state.width / 2, state.height / 2);
    zoomBy(renderer.view, 4 / renderer.view.span);
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Long enough for the crowd to fill and for the street cache to bake.
    for (let i = 0; i < 90; i += 1) { renderer.draw({ now: i * 16, dt: 1 / 30 }); await frame(); }
    const s = renderer.stats;
    return {
      onScreen: s.peds, held: s.pedsHeld, cap: s.pedCap, nav: s.nav,
      cost: getCosts().ped, triangles: s.triangles, budget: s.budget,
      lod: s.lod, estimate: s.estimate,
    };
  });
  console.log(`      people: ${crowd.held} on the city, ${crowd.onScreen} on screen of a cap of ${crowd.cap}, `
    + `${crowd.cost} triangles each = ${crowd.onScreen * crowd.cost} of ${crowd.budget}`);
  console.log(`      nav graph: ${JSON.stringify(crowd.nav)}`);
  check("there are people on the pavement at street zoom", crowd.held > 0,
    `${crowd.held} people, ladder at "${crowd.lod}"`);
  check("the cap is a cap", crowd.held <= crowd.cap, `${crowd.held} of ${crowd.cap}`);
  check("a person is cheap enough to be the last thing sacrificed", crowd.cost <= 60,
    `${crowd.cost} triangles a person`);
  check("the crowd fits in what the night frame leaves", crowd.cap * crowd.cost <= 320000 - 266538,
    `${crowd.cap} people at ${crowd.cost} triangles is ${crowd.cap * crowd.cost} against 53,462 spare`);
  check("the frame with a crowd in it is still inside its budget", crowd.triangles <= crowd.budget,
    `${crowd.triangles} of ${crowd.budget}`);

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
      // From the STATS: with a post pass `info.render` has been reset by the
      // full-screen quad (P2).
      calls: s.drawCalls,
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
  await paintedPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64&life=0&style=painted&lock=0`);
  await paintedPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  await paintedPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
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

  // --- photo mode (slice F1) -------------------------------------------------
  //
  // The fourth mode has to be inside the same budget as the other three, and it
  // is the only one that can put the eye anywhere — so the case worth measuring
  // is the one an orbit camera cannot reach: low over the rooftops, looking
  // along the city. Ruling 034 says every mode goes through the same arithmetic;
  // this is the row that would notice if the photo camera were being priced as
  // an orthographic one, which is what it fell through to before F1.
  const photo = await page.evaluate(async () => {
    const city = globalThis.CITY;
    const renderer = city.renderer;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    city.setQuality("high");
    renderer.enterPhoto();
    const view = renderer.view;
    // Twenty metres up, looking along the street at a shallow angle down — the
    // shot the mode exists for and the worst frustum there is.
    view.eye = { x: view.eye.x, y: 1, z: view.eye.z };
    view.pitch = -0.2;
    for (let i = 0; i < 30; i += 1) await frame();
    const s = renderer.stats;
    const row = {
      mode: view.mode,
      eyeY: view.eye.y,
      triangles: s.triangles,
      estimate: s.estimate,
      budget: s.budget,
      calls: s.drawCalls,
      lod: s.lod,
      near: renderer.view.persp.near,
      far: renderer.view.persp.far,
    };
    renderer.leavePhoto();
    return { ...row, leftTo: view.mode };
  });
  console.log(`      photo: ${photo.triangles} triangles of ${photo.budget}, `
    + `${photo.calls} draw calls, ladder at "${photo.lod}", near ${photo.near} far ${photo.far}`);
  check("photo mode draws the city", photo.mode === "photo" && photo.triangles > 1000,
    JSON.stringify(photo));
  check("and is inside the same budget as every other mode",
    photo.triangles > 0 && photo.triangles <= photo.budget, `${photo.triangles} of ${photo.budget}`);
  // The near plane is the tell: an orthographic fall-through would leave the
  // city camera's half-tile near plane at eye height and clip the pavement.
  check("and takes the street's planes at eye height",
    photo.near < 0.5 && photo.far <= 100, `near ${photo.near}, far ${photo.far}`);
  check("and gives the view back", photo.leftTo !== "photo", photo.leftTo);

  // --- the desktop viewport (slice D8, Q77) ----------------------------------
  //
  // Street chunks bake only where a tile covers `RESOLVE.l3` pixels, and
  // `tilePixels` is a function of the canvas HEIGHT. Every row above draws at
  // 1280×800 at a device pixel ratio of 1, where the nearest chunk at span 20
  // gets 62 pixels a tile — so **no row in this gate's history has ever baked a
  // street chunk at a city zoom**. Kjell's card draws 2560×1305 at 1.5, which is
  // 168 px a tile: eight live chunks and 258,536 of 289,086 triangles, the most
  // expensive thing this renderer builds, measured for the first time by a
  // person rather than by a gate.
  //
  // Two spans at High, not thirty-two rows: this is where the chunks live, and
  // SwiftShader at four times the pixels is slow.
  //
  // **The height is the card's; the width is the least that keeps the aspect at
  // one.** `tilePixels` depends on the canvas HEIGHT and, above an aspect of 1,
  // on nothing else — `test/lod.test.js` asserts that the small and large
  // viewports resolve in exactly the ratio of their canvases. So matching the
  // 4090's 1,305 CSS pixels at a ratio of 1.5 (1,957 device pixels) reproduces
  // the threshold exactly, and narrowing 2,560 to 1,440 halves the fill rate
  // this has to pay for on a software rasteriser. A first attempt at 1706×960
  // gave a 1,440 px canvas and found no chunk at span 20 at all — the finding
  // lives in the last 25% of that height.
  const bigContext = await browser.newContext({
    viewport: { width: 1440, height: 1305 }, deviceScaleFactor: 1.5,
  });
  const bigPage = await bigContext.newPage();
  bigPage.on("pageerror", (error) => errors.push(`desktop viewport: ${error.message}`));
  bigPage.on("console", (m) => { if (m.type() === "error") errors.push(`desktop viewport: ${m.text()}`); });
  // 64 rather than 96: the finding is a threshold on the canvas height and does
  // not care how big the map is, and four times the pixels on a software
  // rasteriser is expensive enough without four times the city as well. At 96
  // this section cost 100 s, over the minute D8 allows itself.
  await bigPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64&life=0&style=plain&lock=0`);
  await bigPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });
  await bigPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
  const big = await bigPage.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    await import("/engine/build-commands.js");
    await import("/engine/development.js");
    const city = globalThis.CITY;
    const { state } = city;
    city.pause();
    state.players[0].treasury = 90000000;
    const W = state.width;
    for (let y = 8; y < W - 8; y += 4) apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [y * W + 8, W - 16] });
    for (let x = 8; x < W - 8; x += 4) {
      for (let y = 8; y < W - 8; y += 1) apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [y * W + x, 1] });
    }
    for (let y = 9; y < W - 9; y += 1) {
      apply(state, { type: C.CMD_PAINT_ZONE, actor: 1, zone: 1, runs: [y * W + 9, W - 18] });
    }
    for (let i = 0; i < 400; i += 1) apply(state, { type: C.CMD_TICK });
    city.renderer.worldChanged();

    const { focusOn, zoomBy } = await import("/client/render/camera.js");
    const renderer = city.renderer;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    city.setQuality("high");
    const rows = [];
    for (const span of [10, 20]) {
      focusOn(renderer.view, W / 2, W / 2);
      zoomBy(renderer.view, span / renderer.view.span);
      // Long enough for the baker to reach the chunks it can resolve: one per
      // frame, nearest first, and the tier allows nine.
      for (let i = 0; i < 30; i += 1) await frame();
      const s = renderer.stats;
      rows.push({
        span,
        canvasH: renderer.renderer.domElement.height,
        live: s.streets?.live ?? 0,
        chunkTris: s.streets?.triangles ?? 0,
        triangles: s.triangles,
        budget: s.budget,
        calls: s.drawCalls,
        lod: s.lod,
      });
    }
    return rows;
  });
  await bigPage.close();
  await bigContext.close();

  for (const row of big) {
    const share = row.triangles > 0 ? (100 * row.chunkTris / row.triangles).toFixed(0) : "0";
    console.log(`      desktop viewport, span ${row.span}: ${row.live} live chunks, `
      + `${row.chunkTris} of ${row.triangles} triangles (${share}%), ${row.calls} draw calls, `
      + `ladder at "${row.lod}", canvas ${row.canvasH}px tall`);
    // Span 20 is a knife edge on purpose: 168 px a tile against a threshold of
    // 160. That 5% is the whole of Q77 — it is the margin by which every
    // headless gate in this project's history missed the most expensive thing
    // the renderer builds — so a change that flips it is exactly what this row
    // is here to notice.
    check(`a street chunk is resolvable at span ${row.span} on a desktop screen`,
      row.live > 0, JSON.stringify(row));
    check(`and the frame is inside its budget at span ${row.span}`,
      row.triangles > 0 && row.triangles <= row.budget, `${row.triangles} of ${row.budget}`);
  }
  // The same cap `client_smoke` holds the small viewport to, checked once where
  // the chunks are actually being drawn.
  check("the desktop viewport keeps the draw calls under eighty",
    big.every((r) => r.calls <= 80), big.map((r) => `span ${r.span}: ${r.calls}`).join(", "));

  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\nbudget gate ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
