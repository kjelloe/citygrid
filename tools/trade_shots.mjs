// The high street and the estate, both arms from one harness (slice S16a).
//
// S10 gave the residential lane a form per level and left trade behind. The
// premise, measured in node before any of it was built: in a 25-year played
// city (seed 1003, 96²) **45 of 61 trade buildings are 20 m or more across**
// and the median commercial lot is **40 m wide at level 1** — one corner shop
// drawn as a department store.
//
//   reports/smoke-S16-shops.png      a wide commercial lot, ladder on
//   reports/smoke-S16-shops-before.png   the same lot, ?ladder=0
//   reports/smoke-S16-works.png      a wide industrial lot, ladder on
//   reports/smoke-S16-works-before.png   the same lot, ?ladder=0
//   reports/smoke-S16-air.png        the same street from city zoom, both arms
//
//     node tools/trade_shots.mjs
//
// A gate rather than a screenshot: it counts the buildings the lot draws in
// each arm, refuses a frame with no baked street chunk in it (that is a picture
// of instanced boxes, S20), and prices the ladder in triangles at both zooms.

import { shoot } from "./screenshot.mjs";
import { setConfig, DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { unitsOf } from "../client/world/units.js";
import { playedCity, standBack, frontageNormal, frontageMiddle, describe } from "./lib/aim.mjs";

const SEED = 1003;
const SIZE = 96;
const YEARS = 25;
/** How much dearer the ladder may be at street level before it is a cost
 * rather than a picture. Three shops where there was one slab is more wall,
 * more windows and three shop signs; it is not allowed to be a third more. */
const CEILING = 1.25;

setConfig(DEFAULTS);
const state = playedCity({ seed: SEED, size: SIZE, years: YEARS });
const model = createModel(state);
const T = model.tileM;

const KIND = { 2: "commercial", 3: "industrial" };

/** The widest standing lot of this zone that a camera can stand back from —
 * widest, because the item is about what a WIDE lot is drawn as. */
function subject(zone) {
  const lots = model.lots
    .filter((lot) => lot.building?.zone === zone && (lot.building.flags & 8) === 0)
    .sort((a, b) => Math.max(b.x1 - b.x0, b.z1 - b.z0) - Math.max(a.x1 - a.x0, a.z1 - a.z0));
  for (const lot of lots) {
    const front = frontageMiddle(lot);
    // Six metres clear, not three: the first run of this gate stood 3.6 m from
    // a NEIGHBOUR's wall and gave the works shot a brown slab across the left
    // third of the frame. "Can stand there" has to mean "can see from there"
    // (S20, and the memory about aiming at the subject rather than a proxy).
    const camera = standBack(model, {
      at: front, away: frontageNormal(lot), clear: 6, max: 34, pitch: -2, eyeM: 2,
      fitWidthM: lot.frontageLen ?? Math.max(lot.x1 - lot.x0, lot.z1 - lot.z0), fitShare: 1.5,
    });
    if (camera) return { lot, camera, units: unitsOf(lot, KIND[zone]).length };
  }
  return undefined;
}

/** What the PAGE drew, asked of the page: the baked street chunks in the frame
 * and the facades on the subject lot. A count taken in node is a count of what
 * this tool believes; the gate wants the one the renderer acted on. */
const COUNT = (id) => `async (state, view) => {
  const { unitsOf } = await import("/client/world/units.js");
  const lot = view.model.lots.find((l) => l.building?.id === ${id});
  const kind = lot ? ({ 2: "commercial", 3: "industrial" })[lot.building.zone] : undefined;
  return {
    units: lot ? unitsOf(lot, kind).length : 0,
    live: view.stats?.streets?.live ?? 0,
    ladder: view.stats?.ladder ?? "",
  };
}`;

const problems = [];
const rows = [];

for (const zone of [2, 3]) {
  const found = subject(zone);
  if (!found) {
    problems.push(`no standing ${KIND[zone]} lot a camera can stand back from — the city, not the tool`);
    continue;
  }
  const wide = Math.max(found.lot.x1 - found.lot.x0, found.lot.z1 - found.lot.z0);
  console.log(describe(`${KIND[zone]} ${Math.round(wide)} m`,
    { cx: found.lot.cx, cz: found.lot.cz, tileM: T }, found.camera));

  for (const [arm, extra] of [["before", { ladder: 0 }], ["after", {}]]) {
    const out = `reports/smoke-S16-${zone === 2 ? "shops" : "works"}${arm === "before" ? "-before" : ""}.png`;
    const r = await shoot({
      // 60 frames, which is `street_shots`' number. 140 was tried, to settle
      // the bake: at 140 the works view came back with **no baked street chunk
      // at all**, in both arms, where 60 gives five or six. The street cache's
      // chunk budget is a plan the quality ladder revises against the frame's
      // load, so how much street is baked responds to the thing being measured.
      // That is why the ratio below is read only when both arms baked the same
      // number, and why the counts are printed beside it.
      out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40, frames: 60,
      width: 1280, height: 720, photo: found.camera.photo,
      extra: { ...extra, __ask: COUNT(found.lot.building.id) },
    });
    const drew = r.answer?.units ?? 0;
    rows.push({ zone, arm, out, tri: r.report?.triangles, units: drew, live: r.answer?.live ?? 0 });
    console.log(`${out}  ${arm.padEnd(6)} ${String(r.report?.triangles).padStart(7)} triangles, `
      + `${drew} building(s) on the lot, ${r.answer?.live ?? 0} baked chunk(s)`);
    if (!r.ok) problems.push(...r.problems.slice(0, 2));
    if ((r.answer?.live ?? 0) === 0) {
      problems.push(`${out}: no street chunk baked — a picture of instanced boxes, not of the ladder`);
    }
  }
}

// And from the air, both arms: E5's rule is that the box a player sees from
// above is the building they walk up to, so a ladder that only reaches the
// baked street is half a ladder — and the instanced pass is the half no
// street-level shot can see (`budget_gate`'s saturated city cannot see this
// slice at all, so this is the only picture of it).
for (const zone of [2, 3]) {
  const found = subject(zone);
  if (!found) continue;
  for (const [arm, extra] of [["before", { ladder: 0 }], ["after", {}]]) {
    const out = `reports/smoke-S16-${zone === 2 ? "shops" : "works"}-air${arm === "before" ? "-before" : ""}.png`;
    const r = await shoot({
      out, seed: SEED, years: YEARS, size: SIZE, tier: "high", mode: "city", span: 12, pitch: 30, yaw: 0.6,
      fx: found.lot.cx / T, fy: found.lot.cz / T, width: 1280, height: 720, frames: 40,
      extra: { ...extra, __ask: COUNT(found.lot.building.id) },
    });
    console.log(`${out}  ${arm.padEnd(6)} ${String(r.report?.triangles).padStart(7)} triangles, `
      + `${r.answer?.units ?? 0} building(s) on the lot`);
    if (!r.ok) problems.push(...r.problems.slice(0, 2));
  }
}

// The measurement, stated as the difference between two arms of one harness.
for (const zone of [2, 3]) {
  const before = rows.find((r) => r.zone === zone && r.arm === "before");
  const after = rows.find((r) => r.zone === zone && r.arm === "after");
  if (!before || !after) continue;
  // The triangle counts are only comparable when both arms baked the SAME
  // number of street chunks: a frame captured with six baked and one with seven
  // differ by a whole chunk of facades, which is far more than the ladder.
  // Measured: one arm moved 179,682 → 184,814 between two runs of this gate for
  // that reason alone. Print the chunk counts beside the ratio, and hold the
  // ceiling only when the two frames are the same frame.
  const comparable = before.live === after.live;
  console.log(`\n${KIND[zone]}: ${before.units} → ${after.units} buildings on the lot, `
    + `${before.tri} → ${after.tri} triangles (${(after.tri / before.tri).toFixed(2)}×) `
    + `with ${before.live} → ${after.live} baked chunks`
    + `${comparable ? "" : " — NOT comparable, the frames baked different amounts"}`);
  if (before.units !== 1) {
    problems.push(`${KIND[zone]}: the before arm drew ${before.units} buildings — ?ladder=0 is not turning the ladder off`);
  }
  if (after.units < 2) {
    problems.push(`${KIND[zone]}: the widest lot in the city is still one building`);
  }
  if (comparable && after.tri > before.tri * CEILING) {
    problems.push(`${KIND[zone]}: the ladder costs ${(after.tri / before.tri).toFixed(2)}× at street level, over ${CEILING}×`);
  }
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\ntrade shots ok");
