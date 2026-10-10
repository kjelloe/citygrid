// Renders a city headlessly and writes a PNG.
//
// SwiftShader, so the pixels are correct but the frame times mean nothing —
// real FPS comes from a native run (plan.md §11 layer 11). What this is for is
// making visual work reviewable: a screenshot in a commit, a diff when a style
// changes, and the probe images for slice 1.2b.
//
// Usage: node tools/screenshot.mjs [out.png] [seed] [years]
//   STYLE=plain|pixel|painted SPAN=40 YAW=0 W=1280 H=720 node tools/screenshot.mjs

import { chromium } from "playwright";
import { makeStatic } from "../server/static.js";
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * The tree, served by the SERVER's own handler (Q167, 2026-10-10).
 *
 * This file had fourteen lines of static server and a six-entry type table, so
 * every picture this project has ever taken — the compare sheets the art
 * direction is argued from included — came off a harness rather than off the
 * server a player uses. M12 deleted `tools/serve.mjs` for exactly that and
 * left this one standing.
 *
 * It is the HANDLER that is shared and not the process: a picture harness
 * needs no pump, no socket and no city, and spawning a room to take a
 * screenshot would be absurd. What had to stop differing is the bytes and the
 * headers — the type table here was missing `.svg`, `.woff2`, `.webmanifest`
 * and `.glb`, and it sent no Content-Security-Policy at all, so a shot could
 * not have caught a policy that breaks the real page.
 */
async function serve() {
  const server = createServer(makeStatic());
  await new Promise((done) => server.listen(0, done));
  return { server, port: server.address().port };
}

export async function shoot({
  out = "reports/city.png", seed = 1003, years = 20, width = 1280, height = 720, trees = true,
  style = "plain", span = 0, yaw = 0, fx = -1, fy = -1, reduced = false, budget = 0, size = 64, seats = 1,
  tier = "high", life = false, terrain = "rolling", overlay = "", pitch = 0, mode = "ortho",
  shadows = true, streets = -1, frames = 1, street = "", photo = "", wall = true, time = "day", post = true,
  // Anything the harness grew after this signature was written. A named
  // parameter per flag meant `?territory=1` was silently dropped and the shot
  // that was supposed to prove the overlay reached the facades was a shot of
  // the city without it (slice V7).
  extra = {},
} = {}) {
  const { server, port } = await serve();
  const browser = await chromium.launch({
    args: [
      "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage", "--no-sandbox",
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    if (extra.__init) await page.addInitScript(extra.__init);
    const problems = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    const url = `http://127.0.0.1:${port}/tools/shoot.html`
      + `?seed=${seed}&years=${years}&style=${style}&span=${span}&yaw=${yaw}&fx=${fx}&fy=${fy}&reduced=${reduced ? 1 : 0}&budget=${budget}&size=${size}&seats=${seats}&tier=${tier}&life=${life ? 1 : 0}&terrain=${terrain}&overlay=${overlay}&pitch=${pitch}&mode=${mode}&shadows=${shadows ? 1 : 0}&streets=${streets}&frames=${frames}&street=${street}&photo=${photo}&wall=${wall ? 1 : 0}&time=${time}&post=${post ? 1 : 0}&trees=${trees ? 1 : 0}`
      + Object.entries(extra).filter(([k]) => !k.startsWith("__"))
        .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
    // `commit`, not `load`. A module script's `load` waits for the whole of
    // `shoot.html` — generating a city, growing it twenty years and drawing
    // forty-four frames — so a page that merely got slower failed on `goto`'s
    // 30-second default with no page error attached, which looks exactly like a
    // page that threw (V8). The readiness signal below is the real gate and it
    // has two minutes.
    await page.goto(url, { waitUntil: "commit", timeout: 120000 });
    try {
      await page.waitForFunction(() => globalThis.SHOT_READY === true, undefined, { timeout: 120000 });
    } catch (error) {
      // A page that never becomes ready has almost always thrown, and the
      // timeout hides the reason. Report what the page said (slice V6).
      throw new Error(`the shot never became ready:\n  ${problems.join("\n  ") || String(error)}`);
    }

    const report = await page.evaluate(() => globalThis.SHOT_REPORT);
    // An optional second question, asked of the page that is already standing:
    // `extra.__ask` is a function body evaluated against `globalThis.SHOT_STATE`
    // and `SHOT_VIEW`, so a caller can AIM a shot at something rather than
    // remembering a coordinate (S9).
    const answer = extra.__ask
      ? await page.evaluate(new Function("return (" + extra.__ask + ")(globalThis.SHOT_STATE, globalThis.SHOT_VIEW)"))
      : undefined;
    await mkdir(dirname(join(root, out)), { recursive: true });
    const png = await page.locator("#city").screenshot();
    await writeFile(join(root, out), png);
    return { ok: problems.length === 0, out, report, answer, problems };
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await shoot({
    out: process.argv[2] ?? "reports/city.png",
    seed: Number(process.argv[3] ?? process.env.SEED ?? 1003),
    years: Number(process.argv[4] ?? process.env.YEARS ?? 20),
    width: Number(process.env.W ?? 1280),
    height: Number(process.env.H ?? 720),
    style: process.env.STYLE ?? "plain",
    span: Number(process.env.SPAN ?? 0),
    yaw: Number(process.env.YAW ?? 0),
    fx: Number(process.env.FX ?? -1),
    fy: Number(process.env.FY ?? -1),
    reduced: process.env.REDUCED === "1",
    budget: Number(process.env.BUDGET ?? 0),
    size: Number(process.env.SIZE ?? 64),
    seats: Number(process.env.SEATS ?? 1),
  });
  console.log(`wrote ${result.out}`);
  console.log("report:", JSON.stringify(result.report));
  if (!result.ok) {
    console.error("PAGE ERRORS:");
    for (const problem of result.problems) console.error("  " + problem);
    process.exit(1);
  }
}
