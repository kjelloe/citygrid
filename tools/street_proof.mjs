// A house in the carriageway: the picture G1 (A85) made impossible (ruling 046).
//
// Not a gate — it cannot fail, because the state it photographs can no longer
// exist. It is the evidence behind `reports/smoke-G1-on-the-street.png`, kept
// so the claim can be re-made against the worktree of any earlier commit:
//
//   git worktree add /tmp/era14 <commit>
//   node tools/street_proof.mjs /tmp/era14 before reports
//
// It must be run from THIS repo (playwright resolves from here) and pointed at
// the tree to photograph.
//
// The same scripted city in both trees — a road row with zoning painted ACROSS
// it as well as beside it, which is what a player dragging a block does. Under
// the old rule `lotFree` ignored the road layer and lots grew on the street.
//
//   node street_proof.mjs <repo root> <label>
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const root = process.argv[2];
const label = process.argv[3];
const out = process.argv[4];
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (q, s) => {
  try {
    const url = decodeURIComponent((q.url ?? "/").split("?")[0]);
    const t = join(root, normalize(url === "/" ? "/index.html" : url));
    s.writeHead(200, { "content-type": T[extname(t)] ?? "application/octet-stream" });
    s.end(await readFile(t));
  } catch { s.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  console error:", m.text().slice(0, 120)); });
await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 90000 });

const report = await page.evaluate(async () => {
  const { state, renderer } = globalThis.CITY;
  const { apply } = await import("/engine/reducer.js");
  const { CMD_TICK, CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_PLACE_BUILDING, CMD_PLACE_WIRE, CMD_PLACE_PIPE } = await import("/engine/commands.js");
  globalThis.CITY.pause();
  state.players[0].treasury = 5000000;
  let row = -1;
  for (let y = 10; y < state.height - 8 && row < 0; y += 1) {
    let ok = true;
    for (let x = 8; x < 28; x += 1) for (let dy = -5; dy <= 4; dy += 1) {
      const i = (y + dy) * state.width + x;
      if (state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4) ok = false;
    }
    if (ok) row = y;
  }
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [row * state.width + 8, 20] });
  // The zoning covers the street itself as well as the rows beside it.
  const z = [];
  for (let y = row - 2; y <= row + 4; y += 1) z.push(y * state.width + 8, 20);
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: z, zone: 1 });
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 10, y: row - 6 });
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "groundwaterPump", x: 18, y: row - 6 });
  // The plant is 3x3 at (10, row-6), so its own rows are row-6..row-4: a wire
  // run through them is refused WHOLE since G1, which left the first version of
  // this probe comparing a powered city against an unpowered one.
  const w = [], pi = [];
  for (let y = row - 3; y <= row + 4; y += 1) w.push(y * state.width + 10, 1);
  for (let y = row - 5; y <= row + 4; y += 1) pi.push(y * state.width + 18, 1);
  apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: w });
  apply(state, { type: CMD_PLACE_PIPE, actor: 1, runs: pi });
  for (let i = 0; i < 260; i += 1) apply(state, { type: CMD_TICK });
  globalThis.CITY.resume();
  renderer.worldChanged();
  // Count what the engine thinks: lots whose own footprint carries a road.
  let onStreet = 0;
  const where = [];
  for (const b of state.buildings) {
    if (b.zone === 0) continue;
    for (let dy = 0; dy < b.h; dy += 1) for (let dx = 0; dx < b.w; dx += 1) {
      if ((state.tiles.road[(b.y + dy) * state.width + b.x + dx] & 16) !== 0) {
        onStreet += 1; where.push(`${b.x},${b.y}`); dy = b.h; break;
      }
    }
  }
  const { focusOn } = await import("/client/render/camera.js");
  focusOn(renderer.view, 14, row);
  renderer.view.span = 9;
  return { row, lots: state.buildings.filter((b) => b.zone !== 0).length, onStreet, where: where.slice(0, 6) };
});
// The help card and the first toast sit over the middle of the view.
for (const name of ["Got it — don't show this again", "Got it"]) {
  const button = page.getByRole("button", { name });
  if (await button.count() > 0) { await button.first().click().catch(() => {}); break; }
}
await page.locator("#alerts .close, [aria-label='Dismiss']").first().click({ timeout: 1000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/street-${label}-air.png` });
await page.evaluate(() => globalThis.CITY.controller.enterStreet());
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/street-${label}-street.png` });
console.log(`${label}: row ${report.row}, ${report.lots} lots, ${report.onStreet} of them ON the street ${JSON.stringify(report.where)}`);
await context.close();
await browser.close();
server.close();
