// E4's second gate: how wide is the street, really? (spec §8.1)
//
// `walkthrough.mjs` asks whether the walker gets from one end of a corridor to
// the other. This asks the question that comes before it: is there a lane wide
// enough to get through at all, measured between the colliders on either side
// rather than between the kerbs the renderer drew.
//
// Nothing narrows a street today — ruling 035 puts the nearest lot line seven
// metres beyond the kerb — so the number this prints is a baseline rather than
// a finding. It is here for what comes next: V6's fences and hedges and E5's
// porches all stand between the pavement and the lot, and the slice that adds
// them should watch this number rather than discover the problem by walking
// into it.
//
//   node tools/passability.mjs [size]

import { saturatedCity } from "./lib/saturated.mjs";
import { createModel } from "../client/world/model.js";
import { createCollision } from "../client/world/collision.js";
import { DEFAULTS } from "../client/world/config.js";

const size = Number(process.argv[2] ?? 96);
const { state } = saturatedCity({ size });
const model = createModel(state);
const collision = createCollision(model);

/** A walker is 0.68 m across. The margin is a shoulder, not a fudge: a lane
 * exactly as wide as the walker is one the walker grinds along. */
const WALKER = 0.68;
const MARGIN = 0.2;
const NEEDED = WALKER + MARGIN;
/** How far out to look before calling a side open, and how often to sample. */
const REACH = 20;
const SAMPLE = 2;

/**
 * How near a solid comes on each side of a point, looking across the street.
 *
 * A DISC, not two rays. A ray is infinitely thin: on the gate's own city the
 * buildings alternate sides every third tile, so a perpendicular ray found a
 * wall on one side and nothing at all on the other in all 32,659 samples, and
 * the "narrowest street" it reported was the search ceiling with a number
 * painted on it.
 */
function clearances(x, z, ux, uz) {
  let left = REACH;
  let right = REACH;
  for (const b of collision.near(x, z, REACH)) {
    const cx = Math.max(b.x0, Math.min(b.x1, x));
    const cz = Math.max(b.z0, Math.min(b.z1, z));
    const dist = Math.hypot(x - cx, z - cz);
    if (dist >= REACH) continue;
    // Which side of the street it is on: the cross product of the corridor's
    // direction with the offset to it.
    const side = ux * (cz - z) - uz * (cx - x);
    if (side >= 0) left = Math.min(left, dist);
    else right = Math.min(right, dist);
  }
  return { left, right };
}

let samples = 0;
let narrow = 0;
/** Samples with a solid within REACH on BOTH sides — the only ones whose width
 * is a measurement rather than the ceiling. A narrowest reading taken over
 * samples that never found anything is the ceiling wearing a number's clothes,
 * which is the shape of instrument failure this project keeps finding. */
let openSided = 0;
let narrowest = Infinity;
let narrowestAt;
const failures = [];

for (const corridor of model.corridors) {
  for (let i = 1; i < corridor.points.length; i += 1) {
    const a = corridor.points[i - 1];
    const b = corridor.points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < SAMPLE) continue;
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    for (let d = 0; d <= len; d += SAMPLE) {
      const x = a.x + ux * d;
      const z = a.z + uz * d;
      const { left, right } = clearances(x, z, ux, uz);
      const width = left + right;
      samples += 1;
      const enclosed = left < REACH && right < REACH;
      if (enclosed) openSided += 1;
      if (enclosed && width < narrowest) { narrowest = width; narrowestAt = { x, z }; }
      if (width < NEEDED) {
        narrow += 1;
        if (failures.length < 8) {
          failures.push(`  ${width.toFixed(2)} m at ${x.toFixed(0)}, ${z.toFixed(0)}`);
        }
      }
    }
  }
}

const rightOfWay = DEFAULTS.tileM;
console.log(`city            ${size}×${size}, seed 1003, ${state.buildings.length} buildings`);
console.log(`corridors       ${model.corridors.length}, ${samples} samples every ${SAMPLE} m`);
console.log(`needed          ${NEEDED.toFixed(2)} m (a ${WALKER} m walker and a ${MARGIN} m shoulder)`);
console.log(`narrowest       ${narrowest === Infinity ? "n/a" : `${narrowest.toFixed(2)} m`}`
  + `${narrowestAt ? ` at ${narrowestAt.x.toFixed(0)}, ${narrowestAt.z.toFixed(0)}` : ""}`
  + `  (the right of way is ${rightOfWay} m)`);
if (openSided === 0) {
  console.log(`                nothing is within ${REACH} m of a street on either side — `
    + "ruling 035 puts the nearest lot line seven metres beyond the kerb, so this is the city, not a miss");
}
console.log(`enclosed        ${openSided} of ${samples} samples had a solid within ${REACH} m on BOTH sides`);
console.log(`too narrow      ${narrow}`);
for (const line of failures) console.log(line);

if (narrow > 0) {
  console.log("\npassability FAILED");
  process.exit(1);
}
console.log("\npassability ok");
