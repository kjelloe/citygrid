// The window shots (slice S7; self-aiming since S20b).
//
// A facade at eye height, day and night, from the pavement outside a shop —
// which is the only place the dressing behind the glass can be judged.
//
//   reports/smoke-S7-day.png     the shopfront and the windows above it
//   reports/smoke-S7-night.png   the same, lit
//
//     node tools/window_shots.mjs
//
// **It aimed itself at a tile and photographed a lawn.** Until S20b this tool
// asked the page for a shop's coordinates, stood the WALKER on the road tile in
// front of it and turned by a quarter-turn yaw — so on seed 1003 its day frame
// was a blank gable and a strip of grass with the shop out of shot, and it
// passed, because its criteria were the baked-chunk count and the page's error
// list. It was the natural instrument for S21's defect (what is behind a
// window: half of every city's glass was culled) and could not have seen it.
//
// So: the subject comes from the model in NODE, the camera is chosen from the
// subject's own geometry (`tools/lib/aim.mjs`), and the gate asserts that the
// chunk the subject stands in is one of the ones the renderer actually baked —
// "a baked chunk is in the frame" and "the building I aimed at is baked" are
// different claims, and only the second one is about the picture.

import { shoot } from "./screenshot.mjs";
import { setConfig, DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { chunkOfLot } from "../client/world/chunks.js";
import { playedCity, standBack, frontageNormal, frontageMiddle, describe } from "./lib/aim.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

setConfig(DEFAULTS);
const state = playedCity({ seed: SEED, size: SIZE, years: YEARS });
const model = createModel(state);
const T = model.tileM;
const middle = { x: (SIZE / 2) * T, z: (SIZE / 2) * T };

/** The standing shop nearest the middle that a camera can stand back from, with
 * its own frontage fitted to the frame. A shop, because a storefront is the
 * only place the interior card shows. */
function shopToShoot() {
  const shops = model.lots
    .filter((lot) => lot.building?.zone === 2 && (lot.building.flags & 8) === 0
      && (lot.building.level ?? 0) >= 1 && state.tick - lot.building.builtTick > 12)
    .sort((a, b) => Math.hypot(a.cx - middle.x, a.cz - middle.z)
      - Math.hypot(b.cx - middle.x, b.cz - middle.z));
  for (const lot of shops) {
    // Close enough that a 1.2 m window is more than four pixels: the frontage
    // filled to about three quarters of the frame, from the pavement opposite.
    const camera = standBack(model, {
      at: frontageMiddle(lot), away: frontageNormal(lot), clear: 3, max: 26, pitch: 0, eyeM: 1.7,
      fitWidthM: lot.frontageLen ?? Math.max(lot.x1 - lot.x0, lot.z1 - lot.z0), fitShare: 1.15,
    });
    if (camera) return { lot, camera };
  }
  return undefined;
}

const COUNT = `(state, view) => ({
  triangles: view.stats?.streets?.triangles ?? 0,
  live: view.stats?.streets?.live ?? 0,
  keys: view.stats?.streets?.keys ?? "",
  frame: view.stats?.triangles ?? 0,
})`;

const subject = shopToShoot();
if (!subject) throw new Error("no standing shop a camera can stand back from — the city, not the tool");
const chunk = chunkOfLot(subject.lot);
// `cx,cy`, which is how the street cache names a live chunk in its stats —
// `chunkKey` is the cache's own packed integer and comparing the two silently
// fails every time (it did, first run).
const wanted = `${chunk.cx},${chunk.cy}`;
console.log(describe("shop", { cx: subject.lot.cx, cz: subject.lot.cz, tileM: T }, subject.camera));
console.log(`its chunk is ${wanted}`);

const problems = [];
for (const time of ["day", "night"]) {
  const out = `reports/smoke-S7-${time}.png`;
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    photo: subject.camera.photo, time,
    // 1920 across: a window is 1.2 m wide and the facade is twenty metres away,
    // so at 1280 the dressing behind the glass is four pixels and the shot
    // cannot answer the question it was taken for.
    width: 1920, height: 1080, streets: 60, frames: 60,
    extra: { __ask: COUNT } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} street triangles=${a.triangles} chunks=${a.live} [${a.keys}] frame=${a.frame}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  if (!(a.live > 0)) problems.push(`${out}: no baked street chunk in the frame`);
  // The claim that matters: the SUBJECT is baked, not merely something.
  if (!String(a.keys).split(" ").includes(wanted)) {
    problems.push(`${out}: the shop's own chunk (${wanted}) is not baked — baked: ${a.keys || "none"}`);
  }
  if (!(a.triangles > 10000)) problems.push(`${out}: ${a.triangles} street triangles is not a facade`);
}

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nwindow shots ok");
