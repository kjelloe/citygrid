// The three interface skins, side by side (M10, P108).
//
// `clean`, `retro` and `dark` have existed since N24 and are offered in the
// settings panel under "Interface style". `a11y_smoke` proves each one
// **repaints** — it samples computed colours and refuses two skins that come
// out identical — and that is the whole of what has ever been checked. Nobody
// has looked at them. `specs/art-direction.md` shows `clean` and does not
// mention the other two.
//
// A green suite says nothing about what the game LOOKS like (ruling 030), and
// the only instrument for that is a picture somebody opens. So: one played
// city, one camera, one hour, three skins, three files — and the only thing
// that differs between the three frames is the attribute on `<html>`.
//
// The same city and the same camera on purpose. Three shots of three different
// cities would compare the cities.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { settle } from "./lib/settle.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
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

const SKINS = ["clean", "retro", "dark"];
const problems = [];
function check(name, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const server = serve();
await new Promise((resolve) => server.listen(0, resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });

  // A city with something in it: an empty map is a picture of the chrome over a
  // field, and half of what a skin has to sit on is the HUD full of numbers.
  await page.goto(`${origin}/?seed=1003&size=64&life=0`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60_000 });
  await page.click("#controls-dismiss").catch(() => {});
  await settle(page);
  // **A town, not a field.** The first cut of this ticked six hundred times and
  // shot an empty map with every number in the HUD reading zero — chrome over a
  // field, which is the one thing the header of this file warns about. Nothing
  // builds itself in singleplayer. So a few streets and some zoning go in
  // through the seam (`CITY.state` is a mirror — CLAUDE.md), and then the years.
  const built = await page.evaluate(async () => {
    const city = globalThis.CITY;
    const { width, height, tiles } = city.state;
    const clear = (cells) => cells.every((i) => tiles.terrain[i] !== 3 && tiles.terrain[i] !== 4
      && tiles.road[i] === 0 && tiles.buildingId[i] === 0);
    const results = [];
    // Find a dry band and lay streets down it, then zone the rows beside them.
    for (let z = 8; z < height - 10 && results.length < 6; z += 3) {
      const row = Array.from({ length: 20 }, (unused, i) => z * width + 6 + i);
      if (!clear(row)) continue;
      results.push((await city.apply({ type: "placeRoad", actor: city.seat ?? 1, runs: [row[0], row.length] })).result);
      // `paintZone` with a `zone` number — there is no `zoneResidential`
      // command, and the first cut of this invented one and got `invalid` back
      // six times. 1 is residential, 2 commercial (`engine/constants.js`).
      for (const [zone, offset] of [[1, 1], [2, 2]]) {
        const band = row.slice(2, 14).map((i) => i + offset * width);
        if (clear(band)) {
          results.push((await city.apply({
            type: "paintZone", actor: city.seat ?? 1, zone, runs: [band[0], band.length],
          })).result);
        }
      }
    }
    return results;
  });
  // Read what came back: a scripted city that laid nothing looks exactly like
  // one that was never asked to.
  check("the shot city was actually built", built.length > 0 && built.every((r) => r === "ok"),
    JSON.stringify(built));
  await settle(page);
  // Years, so the bars carry real numbers and the alert list has something in
  // it.
  await page.evaluate(async () => { await globalThis.CITY.tick(600); });
  await settle(page);
  // **Reported, not gated.** Zoned land does not develop without power and
  // water, so growing a real town here would mean a plant, a wire run, a pump
  // and a pipe — a different tool's job (`tools/play_smoke.mjs` builds; the
  // sweeps grow). What this one photographs is the CHROME, and the city behind
  // it only has to be something rather than a bare field. The number is printed
  // so a reader can see which it was.
  const grown = await page.evaluate(() => ({
    buildings: globalThis.CITY.state.buildings.length,
    roadTiles: [...globalThis.CITY.state.tiles.road].filter((m) => m !== 0).length,
    zoned: [...globalThis.CITY.state.tiles.zone].filter((z) => z !== 0).length,
  }));
  console.log(`the city behind the chrome: ${JSON.stringify(grown)}`);
  check("there is a city behind the chrome, not a bare field",
    grown.roadTiles > 0 && grown.zoned > 0, JSON.stringify(grown));
  // The build menu open, because it is the largest panel a skin has to dress
  // and the one P29 was about.
  await page.click("#build").catch(() => {});
  await settle(page);

  const seen = [];
  for (const skin of SKINS) {
    const applied = await page.evaluate((name) => {
      const html = document.documentElement;
      if (name === "clean") delete html.dataset.skin;
      else html.dataset.skin = name;
      const bar = getComputedStyle(document.querySelector(".hud-bottom"));
      const button = getComputedStyle(document.querySelector("#tools button"));
      return { attribute: html.dataset.skin ?? "", bar: bar.backgroundColor, button: button.backgroundColor };
    }, skin);
    await settle(page);
    const out = `reports/skin-${skin}.png`;
    await page.screenshot({ path: out });
    console.log(`${out}  attribute="${applied.attribute}"  bar ${applied.bar}  button ${applied.button}`);
    seen.push(applied);
  }

  // The instrument before the pictures: three files that look the same is a
  // tool photographing one skin three times, and it would be invisible in a
  // directory listing.
  check("the three skins are three different paints",
    new Set(seen.map((s) => `${s.bar}|${s.button}`)).size === 3,
    JSON.stringify(seen.map((s) => s.bar)));
  check("the default skin sets no attribute at all", seen[0].attribute === "",
    `clean set data-skin="${seen[0].attribute}"`);
  check("no page or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nskin shots ok — now OPEN them, which is the only instrument for a look");
