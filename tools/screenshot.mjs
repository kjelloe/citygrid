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
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { extname, join, resolve, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
};

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const target = join(root, normalize(path));
      if (!target.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(target);
      res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((done) => server.listen(0, done));
  return { server, port: server.address().port };
}

export async function shoot({
  out = "reports/city.png", seed = 1003, years = 20, width = 1280, height = 720,
  style = "plain", span = 0, yaw = 0, fx = -1, fy = -1, reduced = false, budget = 0, size = 64, seats = 1,
  tier = "high", life = false, terrain = "rolling", overlay = "", pitch = 0,
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
    const problems = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    const url = `http://127.0.0.1:${port}/tools/shoot.html`
      + `?seed=${seed}&years=${years}&style=${style}&span=${span}&yaw=${yaw}&fx=${fx}&fy=${fy}&reduced=${reduced ? 1 : 0}&budget=${budget}&size=${size}&seats=${seats}&tier=${tier}&life=${life ? 1 : 0}&terrain=${terrain}&overlay=${overlay}&pitch=${pitch}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.SHOT_READY === true, undefined, { timeout: 120000 });

    const report = await page.evaluate(() => globalThis.SHOT_REPORT);
    await mkdir(dirname(join(root, out)), { recursive: true });
    const png = await page.locator("#city").screenshot();
    await writeFile(join(root, out), png);
    return { ok: problems.length === 0, out, report, problems };
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
