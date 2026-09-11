// Twelve definitions, twelve pictures (slice S1), and the three ages (B2).
//
// A coal plant looked like a hospital looked like a park: the only thing that
// said which was the label on the build menu, and no test can see it. The gate
// is somebody looking, so this places one of each definition beside a road
// THROUGH THE REDUCER — a picture of a building the rules refused is a picture
// of nothing — and stands in the street in front of it.
//
//     node tools/civic_shots.mjs            # twelve civic, then B2's three ages
//     node tools/civic_shots.mjs coalPlant  # one, while iterating

import { shoot } from "./screenshot.mjs";
import { definitionIds, definition } from "../engine/catalogue.js";

const only = process.argv[2];
const defs = only ? [only] : definitionIds();
const SEED = 1003;
const SIZE = 48;
const ROW = Math.round(SIZE / 2);

/** Where the harness puts the first building: `place=` starts at x = 5 and
 * leaves two tiles between definitions, so a single one is always at 5. */
const FIRST_X = 5;

for (const def of defs) {
  const d = definition(def);
  const r = await shoot({
    out: `reports/smoke-S1-${def}.png`, seed: SEED, years: 0, size: SIZE,
    width: 1000, height: 640, tier: "high", streets: 40, frames: 40,
    // In the street, two tiles north of the building, looking south at it.
    street: `${FIRST_X + Math.floor(d.w / 2)},${ROW}`, yaw: 2, pitch: 8,
    // Backdated past `BUILDING_TICKS` (B2): a building placed this tick is a
    // construction site, and the first run of this tool photographed twelve
    // scaffolded slabs — which is B2 working and S1 unphotographed.
    extra: { place: def, age: 200 },
  });
  console.log(`reports/smoke-S1-${def}.png ok=${r.ok} tri=${r.report?.triangles} placed=${r.report?.placed ?? "?"}`);
  if (!r.ok) for (const p of r.problems.slice(0, 2)) console.log("   ", p);
}

if (!only) {
  // B2: the same building at three ages. One record, three numbers.
  for (const [name, extra] of [
    // A police station rather than a hospital: 2x2 is what fits the frame from
    // the pavement, and B2 is about the STATE, not the size.
    ["new", { place: "policeStation", age: 0 }],
    ["worn", { place: "policeStation", age: 4000, wear: 35 }],
    ["abandoned", { place: "policeStation", age: 4000, wear: 5 }],
  ]) {
    const r = await shoot({
      out: `reports/smoke-B2-${name}.png`, seed: SEED, years: 0, size: SIZE,
      width: 1000, height: 640, tier: "high", streets: 40, frames: 40,
      // The same spot the S1 shots use — in front of the building. Standing
      // seven tiles along the road was tried, to get an oblique view, and
      // photographed an empty verge: the road runs east-west and the building
      // is south of it, so anywhere but in front of it is not a view of it.
      street: `${FIRST_X + 1},${ROW}`, yaw: 2, pitch: 8, extra,
    });
    console.log(`reports/smoke-B2-${name}.png ok=${r.ok} tri=${r.report?.triangles}`);
    if (!r.ok) for (const p of r.problems.slice(0, 2)) console.log("   ", p);
  }
}
