// The N4 gate.
//
// "UI acceptance passes: every toolbar button does what it claims, hit-tested;
// every overlay renders in one pass and is readable in a screenshot diff."
//
// So, three questions, each answered by driving the real page:
//
//   1. Does every button do what its label says? Clicked by coordinate, not by
//      calling the handler — a button under another element, or one too small
//      to hit on a phone, passes an API test and fails a person.
//   2. Does each of the eleven overlays render, in a bounded number of draw
//      calls that does not depend on which overlay it is?
//   3. Is each overlay actually DIFFERENT on screen? An overlay that renders a
//      plausible picture of the wrong field is the failure mode that matters,
//      and the cheap half of catching it is noticing two overlays that produce
//      an identical image.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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

const problems = [];
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Build a city worth looking at: roads, all three zones, utilities, and
 * enough ticks that pollution, crime and land value are not all zero. An
 * overlay sweep over an empty map proves only that grey renders. */
async function buildCity(page) {
  return page.evaluate(async () => {
    const { state, renderer } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const c = await import("/engine/commands.js");
    globalThis.CITY.pause();
    state.players[0].treasury = 9000000;

    let row = -1;
    for (let y = 12; y < state.height - 10 && row < 0; y += 1) {
      let clear = true;
      for (let x = 8; x < 34; x += 1) {
        for (let dy = -6; dy <= 6; dy += 1) {
          const i = (y + dy) * state.width + x;
          if (state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4) clear = false;
        }
      }
      if (clear) row = y;
    }
    if (row < 0) return { reason: "no dry ground on this map" };

    const W = state.width;
    apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [row * W + 8, 26] });
    apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [(row + 4) * W + 8, 26] });
    const band = (y0, y1, zone) => {
      const runs = [];
      for (let y = y0; y <= y1; y += 1) runs.push(y * W + 8, 26);
      apply(state, { type: c.CMD_PAINT_ZONE, actor: 1, runs, zone });
    };
    band(row + 1, row + 3, 1);            // residential between the two roads
    band(row - 3, row - 1, 2);            // commercial above
    band(row + 5, row + 6, 3);            // industry below, so pollution has a source

    apply(state, { type: c.CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 11, y: row - 6 });
    // ON the spine, not near it. The pump is 1x1; at x=21 with the pipe at
    // x=23 it was two tiles short of its own network, so the water side had no
    // source at all and nothing could develop. The coal plant is 3x3 and
    // reached its spine by accident of size, which is what made the failure
    // look like a power problem when it was a water one.
    apply(state, { type: c.CMD_PLACE_BUILDING, actor: 1, def: "groundwaterPump", x: 23, y: row - 6 });
    // Both networks down BOTH spines. supplyReach is 4 and a lot needs power
    // AND water within that, so running the wire at x=10 and the pipe at x=20
    // left no tile in reach of both and nothing could ever develop — the city
    // stayed at two buildings and the overlay sweep photographed an empty map.
    const wire = [];
    const pipe = [];
    for (const spine of [13, 23]) {
      for (let y = row - 5; y <= row + 7; y += 1) {
        wire.push(y * W + spine, 1);
        pipe.push(y * W + spine, 1);
      }
    }
    // Join the two spines, or each network is TWO components: one holding the
    // plant and no water, one holding the pump and no power, and not a single
    // lot in the city sees both. The engine says so plainly — `state.supply`
    // reported components: 2, served: 1, starved: 1 — which is worth reading
    // before blaming the reach.
    for (let x = 13; x <= 23; x += 1) {
      wire.push((row - 5) * W + x, 1);
      pipe.push((row - 5) * W + x, 1);
    }
    apply(state, { type: c.CMD_PLACE_WIRE, actor: 1, runs: wire });
    apply(state, { type: c.CMD_PLACE_PIPE, actor: 1, runs: pipe });

    for (let i = 0; i < 400; i += 1) apply(state, { type: c.CMD_TICK });
    renderer.worldChanged();

    const { focusOn } = await import("/client/render/camera.js");
    focusOn(renderer.view, 20, row + 1);
    renderer.view.span = 34;

    // What the overlays have to work with. If these are all zero the sweep
    // below is measuring nothing and should say so.
    let pollution = 0;
    let crime = 0;
    let powered = 0;
    let watered = 0;
    for (let i = 0; i < state.tiles.terrain.length; i += 1) {
      if (state.tiles.pollution[i] > 0) pollution += 1;
      if (state.tiles.crime[i] > 0) crime += 1;
      if (state.tiles.flags[i] & 1) powered += 1;
      if (state.tiles.flags[i] & 2) watered += 1;
    }
    return { row, buildings: state.buildings.length, population: state.population, pollution, crime, powered, watered };
  });
}

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
await mkdir(join(root, "reports", "overlays"), { recursive: true });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`page error — ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

  const city = await buildCity(page);
  check("the fixture city is worth photographing", !city.reason && city.buildings > 2,
    city.reason ?? `${city.buildings} buildings, pop ${city.population}, ${city.pollution} polluted, ${city.powered} powered, ${city.watered} watered`);

  // --- 0. the minimap and the statistics screen ----------------------------
  //
  // Both are read-only views of state, so the thing worth checking is that they
  // read the RIGHT state: a minimap of the wrong region and a graph of the
  // wrong series look exactly like a working one.
  const minimap = await page.evaluate(() => {
    const canvas = document.getElementById("minimap");
    if (!canvas) return { missing: true };
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    let opaque = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255) opaque += 1;
      seen.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }
    return { size: canvas.width, opaque, colours: seen.size, total: pixels.length / 4 };
  });
  check("the minimap paints every pixel of the region",
    !minimap.missing && minimap.opaque === minimap.total,
    minimap.missing ? "no minimap" : `${minimap.opaque} of ${minimap.total}`);
  check("the minimap shows more than one thing",
    !minimap.missing && minimap.colours >= 4,
    minimap.missing ? "no minimap" : `${minimap.colours} distinct colours`);

  // Clicking the minimap moves the camera THERE, not just somewhere.
  const jumped = await page.evaluate(() => {
    const canvas = document.getElementById("minimap");
    const box = canvas.getBoundingClientRect();
    const before = { x: globalThis.CITY.renderer.view.targetX, y: globalThis.CITY.renderer.view.targetZ };
    return { before, box: { x: box.left, y: box.top, w: box.width, h: box.height } };
  });
  // Aim at three quarters across and down: a spot far from where the camera
  // starts, so "did not move" and "moved to the middle" both fail.
  await page.mouse.click(jumped.box.x + jumped.box.w * 0.75, jumped.box.y + jumped.box.h * 0.75);
  const after = await page.evaluate(() => ({
    x: globalThis.CITY.renderer.view.targetX,
    y: globalThis.CITY.renderer.view.targetZ,
    width: globalThis.CITY.state.width,
  }));
  const wanted = Math.floor(after.width * 0.75);
  check("clicking the minimap moves the camera to that tile",
    Math.abs(after.x - wanted) <= 2 && Math.abs(after.y - wanted) <= 2,
    `(${jumped.before.x}, ${jumped.before.y}) → (${after.x}, ${after.y}), wanted about ${wanted}`);

  // The minimap caches its picture, so it has to be TOLD the world moved. It
  // was told only when the player built through the controller, so a city that
  // grew, burned or flooded showed the old world until the player laid a road.
  const followed = await page.evaluate(async () => {
    const { state } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const c = await import("/engine/commands.js");
    const canvas = document.getElementById("minimap");
    const shot = () => {
      const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
      return h;
    };
    const before = shot();
    // A change the simulation could have made, followed by the tick that in the
    // real game always accompanies one.
    // Along the bottom edge, clear of the rows the undo check uses further
    // down this file — a gate that quietly paints over another gate's fixture
    // makes the second one fail for a reason that has nothing to do with it.
    const runs = [];
    for (let y = state.height - 7; y < state.height - 1; y += 1) {
      runs.push(y * state.width + 2, Math.min(30, state.width - 4));
    }
    apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs });
    apply(state, { type: c.CMD_TICK });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { before, after: shot() };
  });
  check("the minimap follows changes the player did not make",
    followed.before !== followed.after, `${followed.before} → ${followed.after}`);

  const toggled = await page.evaluate(() => {
    document.getElementById("minimap-toggle").click();
    const hidden = document.getElementById("minimap").hidden;
    document.getElementById("minimap-toggle").click();
    return { hidden, shownAgain: !document.getElementById("minimap").hidden };
  });
  check("the minimap is optional, and comes back", toggled.hidden && toggled.shownAgain);

  // Ruling 028: a role that misdescribes is a defect. `role="img"` announces a
  // static picture, so the minimap must not be a tab stop or take keys — the
  // keyboard path to the same job is the map's own arrow-key panning, which
  // aims properly instead of jumping to the middle.
  const mapRole = await page.evaluate(() => {
    const c = document.getElementById("minimap");
    return { role: c.getAttribute("role"), tabIndex: c.tabIndex, label: c.getAttribute("aria-label") };
  });
  check("the minimap describes itself honestly",
    mapRole.role === "img" && mapRole.tabIndex < 0 && (mapRole.label ?? "").length > 10,
    JSON.stringify(mapRole));

  await page.click("#statistics");
  await page.waitForSelector("dialog.stats[open]", { timeout: 10000 });
  const stats = await page.evaluate(async () => {
    const { SERIES } = await import("/client/ui/statistics-model.js");
    const rows = [...document.querySelectorAll(".stat")];
    return {
      rows: rows.length,
      series: SERIES.length,
      fields: rows.map((r) => r.dataset.field),
      // §30: every statistic carries a plain-language interpretation, and
      // every chart carries the same sentence as its text alternative.
      explained: rows.filter((r) => (r.querySelector(".stat-about")?.textContent ?? "").length > 40).length,
      labelled: rows.filter((r) => (r.querySelector("svg")?.getAttribute("aria-label") ?? "").length > 10).length,
      keys: rows.filter((r) => /stat\.|\bverdict\b/.test(r.textContent ?? "")).length,
      atTop: document.querySelector(".stats-body")?.scrollTop ?? 0,
    };
  });
  check("every series has a row on the statistics screen",
    stats.rows === stats.series, `${stats.rows} of ${stats.series}`);
  check("every statistic carries a plain-language explanation",
    stats.explained === stats.rows, `${stats.explained} of ${stats.rows}`);
  check("every chart carries a text alternative",
    stats.labelled === stats.rows, `${stats.labelled} of ${stats.rows}`);
  check("no statistic is showing a raw i18n key", stats.keys === 0);
  check("the statistics screen opens at the top", stats.atTop === 0, `scrollTop ${stats.atTop}`);
  await page.keyboard.press("Escape");

  // --- 1. every toolbar button does what it claims --------------------------
  // Keyed on `data-id`, which is unique: every building shares the `building`
  // tool and is told apart by its `data-def`, so `data-tool` alone matches
  // twelve buttons.
  const tools = await page.$$eval(".hud-toolbar button[data-tool]", (nodes) =>
    nodes.filter((n) => n.dataset.tool).map((n) => ({ id: n.dataset.id, tool: n.dataset.tool, def: n.dataset.def })));
  for (const { id, tool, def } of tools) {
    const button = page.locator(`.hud-toolbar button[data-id="${id}"]`);
    const box = await button.boundingBox();
    check(`the ${id} button is big enough to hit on a phone`,
      box && box.height >= 44, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "no box");
    // Clicked by coordinate: this is a hit test, not a handler call.
    await button.click();
    const held = await page.evaluate(() => [globalThis.CITY.controller.tool, globalThis.CITY.controller.def]);
    check(`the ${id} button selects the ${id} tool`,
      held[0] === tool && (def === undefined || held[1] === def), `selected ${held.join("/")}`);
    const pressed = await button.getAttribute("aria-pressed");
    check(`the ${id} button reports its own state`, pressed === "true", `aria-pressed=${pressed}`);
    await button.click();  // toggle back off
  }

  // Undo and speed are buttons that do something other than pick a tool.
  await page.click('.hud-toolbar button[data-tool="road"]');
  await page.evaluate(async () => {
    const { state } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const c = await import("/engine/commands.js");
    globalThis.UNDO_ROW = 4;
    apply(state, { type: c.CMD_PLACE_ROAD, actor: 1, runs: [4 * state.width + 4, 6] });
  });
  const beforeUndo = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let n = 0;
    for (let x = 0; x < state.width; x += 1) if (state.tiles.road[4 * state.width + x] & 16) n += 1;
    return n;
  });
  await page.click("#undo");
  const afterUndo = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let n = 0;
    for (let x = 0; x < state.width; x += 1) if (state.tiles.road[4 * state.width + x] & 16) n += 1;
    return n;
  });
  check("the undo button undoes", beforeUndo > 0 && afterUndo === 0, `${beforeUndo} → ${afterUndo} tiles`);

  const speedBefore = await page.textContent("#speed");
  await page.click("#speed");
  const speedAfter = await page.textContent("#speed");
  check("the speed button changes speed", speedBefore !== speedAfter, `${speedBefore} → ${speedAfter}`);

  // --- 2 and 3. every overlay renders, and renders differently --------------
  await page.evaluate(() => globalThis.CITY.pause());
  const overlayNames = await page.$$eval(".hud-overlays button", (nodes) => nodes.map((n) => n.dataset.overlay));
  check("all eleven overlays have a button", overlayNames.length === 11, `${overlayNames.length} buttons`);

  const shots = new Map();
  let baselineCalls = 0;
  for (const name of ["", ...overlayNames]) {
    if (name) await page.click(`.hud-overlays button[data-overlay="${name}"]`);
    await page.waitForTimeout(140);
    const stats = await page.evaluate(() => ({
      calls: globalThis.CITY.renderer.renderer.info.render.calls,
      triangles: globalThis.CITY.renderer.renderer.info.render.triangles,
      active: globalThis.CITY.overlay,
    }));
    const shot = await page.locator("#city").screenshot();
    const digest = createHash("sha1").update(shot).digest("hex");

    if (!name) {
      baselineCalls = stats.calls;
    } else {
      check(`the ${name} overlay is the one showing`, stats.active === name, `active=${stats.active}`);
      // One pass: the overlay adds a bounded, constant number of draw calls —
      // the tint plus three mark pools — whichever overlay it is. A per-tile
      // or per-band mesh would show up here as a number that grows.
      const added = stats.calls - baselineCalls;
      check(`the ${name} overlay renders in one pass`, added >= 0 && added <= 4,
        `${added} extra draw calls`);
      await writeFile(join(root, "reports", "overlays", `${name}.png`), shot);
      shots.set(name, digest);
      await page.click(`.hud-overlays button[data-overlay="${name}"]`);  // off
    }
  }

  // Readable in a diff: no two overlays may produce the same image.
  const byDigest = new Map();
  for (const [name, digest] of shots) {
    if (byDigest.has(digest)) problems.push(`${name} renders identically to ${byDigest.get(digest)}`);
    byDigest.set(digest, name);
  }
  check("no two overlays render the same picture", byDigest.size === shots.size,
    `${shots.size} overlays, ${byDigest.size} distinct images`);

  // --- the inspector --------------------------------------------------------
  await page.evaluate(() => globalThis.CITY.controller.setTool(undefined));
  const centre = await page.evaluate(() => {
    const canvas = document.getElementById("city");
    return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
  });
  await page.mouse.click(centre.x, centre.y);
  const inspectorShown = await page.evaluate(() => {
    const node = document.querySelector(".hud-inspector");
    return { hidden: node.hidden, text: node.textContent.slice(0, 80) };
  });
  check("tapping with no tool opens the inspector", !inspectorShown.hidden, inspectorShown.text);

  // --- the phone layout -----------------------------------------------------
  await context.close();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phonePage = await phone.newPage();
  phonePage.on("pageerror", (error) => problems.push(`phone page error — ${error.message}`));
  await phonePage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
  await phonePage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await buildCity(phonePage);
  await phonePage.waitForTimeout(200);
  const fits = await phonePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    panel: document.querySelector(".hud-panel").getBoundingClientRect().height,
    viewport: window.innerHeight,
  }));
  check("the phone layout does not scroll sideways",
    fits.scrollWidth <= fits.clientWidth + 1, `${fits.scrollWidth} > ${fits.clientWidth}`);
  check("the HUD leaves most of the phone screen for the city",
    fits.panel < fits.viewport * 0.45, `panel ${Math.round(fits.panel)}px of ${fits.viewport}px`);
  await phonePage.screenshot({ path: join(root, "reports", "hud-phone.png") });
  await phone.close();
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
console.log(`\n${checks.length} checks — ui smoke ok`);
