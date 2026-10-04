// The storyboard, and the film (F2; `workitems-film.md`).
//
// A film is a list of shots the tool can render one frame a second in a minute,
// so the framing is decided by LOOKING at a storyboard rather than by rendering
// the film and watching it. The arithmetic is `client/world/film.js`, the page
// half is `client/debug/tour.js`, and this drives them:
//
//   node tools/film.mjs                      the storyboard, 1 fps, 960×540
//   node tools/film.mjs --fps=30 --w=1920    every frame, numbered
//   node tools/film.mjs --list=<name>
//
// The page owns no clock: every frame is `frame(i, fps)`, so the storyboard and
// the film are the same camera and a review on one machine holds on another.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { problemsIn } from "../client/world/film.js";
import { PALETTES } from "../client/render/palettes.js";
import { PRESET_NAMES } from "../client/render/time-of-day.js";

const root = new URL("..", import.meta.url).pathname;
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const LIST = arg("list", "sixty-seconds");
const FPS = Number(arg("fps", 1));
const W = Number(arg("w", 960));
const H = Number(arg("h", 540));
const OUT = arg("out", `reports/storyboard/${LIST}`);

// `.mjs` is in here because the page imports `tools/lib/saturated.mjs`: served
// as octet-stream, a module script is refused outright and the page simply
// never becomes ready (the same table `screenshot.mjs` carries).
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
};
const server = createServer(async (q, s) => {
  try {
    const path = decodeURIComponent((q.url ?? "/").split("?")[0]);
    const file = join(root, normalize(path));
    s.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    s.end(await readFile(file));
  } catch { s.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const list = JSON.parse(await readFile(join(root, "data", "film", `${LIST}.json`), "utf8"));
// Validated HERE as well as in `test/film.test.js`, because the test only ever
// sees the lists that are committed: a list written by hand this afternoon
// should be refused in a second rather than after five minutes of rendering.
// The corridor check needs a city and belongs to the test; everything else is
// arithmetic and names.
const problemsFound = problemsIn(list, { styles: Object.keys(PALETTES), hours: [...PRESET_NAMES] });
if (problemsFound.length > 0) {
  console.error(`FAIL  ${LIST} is not a shot list:\n      ${problemsFound.join("\n      ")}`);
  process.exit(1);
}
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage", "--no-sandbox"],
});
const problems = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  const url = `http://127.0.0.1:${port}/tools/shoot.html`
    + `?film=${LIST}&seed=${list.seed}&size=${list.size}&years=${list.years}`
    + "&tier=high&life=1&mode=city&streets=60&frames=1";
  await page.goto(url, { waitUntil: "commit", timeout: 180000 });
  try {
    await page.waitForFunction(() => globalThis.SHOT_READY === true, undefined, { timeout: 300000 });
  } catch (error) {
    // A page that never becomes ready has almost always thrown, and the timeout
    // hides the reason (the same lesson `screenshot.mjs` carries).
    throw new Error(`the film page never became ready:\n  ${problems.join("\n  ") || String(error)}`);
  }
  const info = await page.evaluate(() => ({ title: globalThis.FILM?.title, seconds: globalThis.FILM?.seconds }));
  if (!info.seconds) throw new Error("the page has no film in it");
  const frames = await page.evaluate((fps) => globalThis.FILM.frames(fps), FPS);
  console.log(`${info.title}: ${info.seconds}s, ${frames} frames at ${FPS} fps, ${W}×${H}`);

  await mkdir(join(root, OUT), { recursive: true });
  const shots = [];
  const started = Date.now();
  for (let i = 0; i < frames; i += 1) {
    const pose = await page.evaluate(([n, fps]) => globalThis.FILM.frame(n, fps), [i, FPS]);
    const png = await page.locator("#city").screenshot();
    const name = `${String(i).padStart(3, "0")}.png`;
    await writeFile(join(root, OUT, name), png);
    shots.push({ ...pose, file: name });
    // A frame of an empty scene is the defect this gate exists to catch: a
    // storyboard of seven black squares passes every other check there is.
    if (!(pose.triangles > 1000)) problems.push(`frame ${i} (${pose.title}) drew ${pose.triangles} triangles`);
  }
  // A film of an empty city is the other half of that: every frame drew
  // something and nothing was alive in any of them. `life/` takes its time from
  // the caller, so this is a defect of the HARNESS, not of the city.
  if (!shots.some((s) => s.cars > 0) || !shots.some((s) => s.people > 0)) {
    problems.push(`nothing is alive in the film: ${Math.max(...shots.map((s) => s.cars))} cars and `
      + `${Math.max(...shots.map((s) => s.people))} people at the busiest frame`);
  }
  // And nothing may EMPTY, which is a different defect: a style change builds a
  // new renderer, and a new renderer's traffic starts at nobody. In a film that
  // is a cut on which every car in the city disappears.
  for (let i = 1; i < shots.length; i += 1) {
    if (shots[i].cars === 0 && shots[i - 1].cars > 0) {
      problems.push(`frame ${i} (${shots[i].title}) has no cars in a city that had `
        + `${shots[i - 1].cars} a frame ago`);
    }
  }
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.log(`${shots.length} frames in ${seconds}s -> ${OUT}/`);
  for (const s of shots) {
    console.log(`  ${s.file}  ${s.title}${s.holding ? " (hold)" : ""} — ${s.camera}, ${s.time ?? "day"},`
      + ` ${s.style ?? "plain"}, ${Math.round(s.triangles / 1000)}k tris, ${s.cars} cars, ${s.people} people,`
      + ` settled ${s.settle}`);
  }
  // The contact sheet is an HTML page rather than a composed image: it is read
  // in a browser, it carries each frame's title and numbers beside it, and it
  // needs no image library to write.
  const rows = shots.map((s) => `<figure><img src="${s.file}" width="320"><figcaption>${s.file} · `
    + `<b>${s.title}</b>${s.subtitle ? ` — ${s.subtitle}` : ""}<br>${s.camera}, ${s.time ?? "day"}, `
    + `${s.style ?? "plain"}${s.holding ? ", hold" : ""} · ${Math.round(s.triangles / 1000)}k</figcaption></figure>`).join("\n");
  await writeFile(join(root, OUT, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>${info.title}</title>`
    + "<style>body{background:#13161a;color:#d8dce2;font:14px system-ui;margin:24px}"
    + "figure{display:inline-block;margin:0 12px 18px 0;width:320px}figcaption{font-size:12px;opacity:.85;margin-top:4px}</style>"
    + `<h1>${info.title}</h1><p>${info.seconds} seconds, ${frames} frames at ${FPS} fps.</p>\n${rows}\n`);
  console.log(`contact sheet: ${OUT}/index.html`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.slice(0, 6).join("\n      ")}`);
  process.exit(1);
}
console.log("\nfilm ok");
