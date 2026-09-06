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

  check("no page errors", errors.length === 0, errors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\nbudget gate ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
