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
import { DEFAULTS } from "../client/world/config.js";
import { fitDistance } from "./lib/aim.mjs";
import { definitionIds, definition } from "../engine/catalogue.js";

const problems = [];
const only = process.argv[2];
const defs = only ? [only] : definitionIds();
const SEED = 1003;
const SIZE = 48;
const ROW = Math.round(SIZE / 2);

/** Where the harness STARTS looking for a spot. It walks right from here until
 * the reducer accepts one (T7), so the camera cannot assume this is where the
 * building ended up — it reads the x back out of the report. */
const FIRST_X = 5;

for (const def of defs) {
  const d = definition(def);
  // A probe first, cheap and small, to find out where the harness put it. The
  // alternative is a camera pointed at x = 5 and a building three tiles along,
  // which is what the first run of T7's clinic photographed.
  const found = await shoot({
    out: "reports/.civic-probe.png", seed: SEED, years: 0, size: SIZE, width: 320, height: 240,
    terrain: d.needsFlat === true ? "flat" : "rolling",
    extra: { place: def, age: 200, rank: d.unlock },
  });
  const spot = String(found.report?.placed ?? "").match(new RegExp(`${def}:ok@(\\d+),(\\d+)`));
  const atX = spot ? Number(spot[1]) : FIRST_X;
  const atY = spot ? Number(spot[2]) : ROW + 1;
  // Which WAY to look. `place=` searches several rows outward from the road
  // now, so a rail station stands north of it beside the line — and a camera
  // that always looked south photographed the field behind it (P94).
  const facing = atY < ROW ? 0 : 2;
  // Where the camera stands, from the DEFINITION's own size (S20d). The walker
  // in the street with a quarter-turn yaw photographed a band: a 3×3 station is
  // 60 m across and the road is 10 m from its front, so the frame was a brown
  // stripe with a roof over it and no way to tell a station from a shed. The
  // subject's own frontage decides the distance, as it does in `street_shots`.
  const tileM = DEFAULTS.tileM;
  const frontM = Math.max(d.w, 1) * tileM;
  // Far enough back for the WHOLE building: its frontage and its height, which
  // for a city hall is a cupola at 1.4 lot units. Two wrong framings on the way
  // — 0.8 of the frame put the station 75 m off across a field, and a sideways
  // offset measured in FRONTAGE put the camera inside the city hall's portico
  // looking along it. The offset is a share of the standoff now.
  // The FRONTAGE decides the distance, and nothing else. A height term was
  // tried and taken out: the kit's `y` is in lot units, so `civicHeight` × the
  // lot came to 42 m for a city hall and stood the camera 62 m away behind a
  // wood. The tall parts — a cupola, a tower — are caught by the tilt below.
  const back = Math.max(16, fitDistance(frontM, { share: 1.8 }));
  const centre = {
    x: (atX + d.w / 2) * tileM,
    z: (atY + d.h / 2) * tileM,
  };
  // Three quarters on, not square: a flat elevation hides the depth that tells
  // a station from a shed, and the corner is where the kit's masses read.
  // `back` metres from the FRONT FACE, not from the centre and not from the
  // road. Standing on the road was tried and is wrong here: `place=` puts a
  // building several rows out from `ROW`, so the road is 78 m from a city hall
  // and the camera photographed a park with a hall behind it.
  const half = (d.h / 2) * tileM;
  const eye = {
    x: centre.x + back * 0.25,
    z: facing === 0 ? centre.z + half + back : centre.z - half - back,
  };
  const yaw = Math.atan2(eye.x - centre.x, eye.z - centre.z);
  // Look at the building's MIDDLE: a cupola at 25 m is out of frame from an eye
  // at 2.6 m unless the camera tilts up to meet it.
  // A few degrees up, so a tower or a cupola is in frame and the pavement is
  // not half the picture.
  const pitch = d.tall === true ? 8 : 4;
  const r = await shoot({
    out: `reports/smoke-S1-${def}.png`, seed: SEED, years: 0, size: SIZE,
    width: 1000, height: 640, tier: "high", streets: 40, frames: 40, trees: false,
    photo: `${(eye.x / tileM).toFixed(3)},${(eye.z / tileM).toFixed(3)},2.6,${yaw.toFixed(4)},${pitch}`,
    // Backdated past `BUILDING_TICKS` (B2): a building placed this tick is a
    // construction site, and the first run of this tool photographed twelve
    // scaffolded slabs — which is B2 working and S1 unphotographed.
    // And the RANK the definition asks for (T5a): `unlock` is a rule in the
    // reducer now, so a city hall at rank 0 is refused and the picture is of an
    // empty road with `placed=locked` in the log beside it.
    extra: { place: def, age: 200, rank: d.unlock },
    // A FLAT map for a definition with a flatness rule (T5a). The airport's
    // footprint must be level within `airport.maxDrop`, which a rolling 48×48
    // offers about one site in ten of — and `place=` puts its buildings on a
    // row of its own choosing, so on rolling terrain the reducer answered
    // `invalid` and the picture was of an empty road.
    terrain: d.needsFlat === true ? "flat" : "rolling",
  });
  // The harness reports what it placed as `<def>:<result>`, space separated.
  const placed = String(r.report?.placed ?? "");
  const built = placed.includes(`${def}:ok`);
  console.log(`reports/smoke-S1-${def}.png ok=${r.ok} tri=${r.report?.triangles} placed=${placed}`);
  if (!r.ok) for (const p of r.problems.slice(0, 2)) console.log("   ", p);
  // A picture of a building the rules refused is a picture of nothing, and this
  // tool PRINTED that for two definitions and failed on neither (T7): every
  // 1×1 has been an empty road since T2 put rock on the map.
  if (!built) problems.push(`${def}: not placed — ${placed || "nothing"}`);
  if (!r.ok) problems.push(`${def}: ${r.problems[0]}`);
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

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\ncivic shots ok");
