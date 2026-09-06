// E4's gate: can the walker actually walk the city? (spec §8.1)
//
// No browser. The model, the collision world and the walker are all pure, so
// this drives the REAL movement code — the same `update` the frame loop calls —
// along every corridor of a saturated city and reports what it could not do.
// A street camera that is fine in the one place you tried it and stuck three
// streets over is exactly the defect a screenshot cannot see.
//
// Two failures are counted, and they are different failures:
//
//   a leg not finished — the walker was stopped short of the far end of a
//     corridor by something it could not walk round. A lot built over the
//     carriageway, a kerb it cannot climb, a wedge between two buildings.
//   a refusal      — the walker asked to move and `floorAt` said the step was
//     taller than it can climb. That is a wall made of ground: a hole in the
//     surface, or a kerb standing in the middle of the road.
//   a cliff        — the ground rose more than a metre between two samples 2 m
//     apart. Half a metre was the first threshold and it caught 47 places on
//     the saturated 96×96; every one of them was a genuinely steep street —
//     the corridor's own centreline reaches 0.74 m per 2 m on this terrain,
//     because nothing grades a road ALONG its length (Q34). A hill is not a
//     hole, and a gate that cannot tell them apart measures neither.
//
//   node tools/walkthrough.mjs [size]

import { saturatedCity } from "./lib/saturated.mjs";
import { createModel } from "../client/world/model.js";
import { createCollision } from "../client/world/collision.js";
import { createWalker } from "../client/life/walker.js";
import { DEFAULTS } from "../client/world/config.js";

const size = Number(process.argv[2] ?? 96);
const { state } = saturatedCity({ size });

const t0 = Date.now();
const model = createModel(state);
const collision = createCollision(model);
const buildMs = Date.now() - t0;

/** How far apart the ground is sampled, and the drop that counts as a hole. */
const SAMPLE = 2;
const CLIFF = 1;
/** A leg is finished when the walker is within this of the far end. Two metres
 * is the length of the last stride, not a margin for failure. */
const ARRIVED = 2;
const DT = 0.1;

const walker = createWalker(collision);
let legs = 0;
let unfinished = 0;
let cliffs = 0;
let refusals = 0;
let metres = 0;
let worstJump = 0;
const failures = [];

// Down the middle and along both pavements. The centre line alone walks 54 km
// without meeting a single building — lots are set back and the carriageway is
// empty by construction — so a gate that only walks it proves the walker can
// cross a field.
const LANES = [0, DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk / 2, -(DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk / 2)];

for (const corridor of model.corridors) {
  for (let i = 1; i < corridor.points.length; i += 1) {
   for (const lane of LANES) {
    const dx = corridor.points[i].x - corridor.points[i - 1].x;
    const dz = corridor.points[i].z - corridor.points[i - 1].z;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (-dz / len) * lane;
    const oz = (dx / len) * lane;
    const from = { x: corridor.points[i - 1].x + ox, z: corridor.points[i - 1].z + oz };
    const to = { x: corridor.points[i].x + ox, z: corridor.points[i].z + oz };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < ARRIVED) continue;
    legs += 1;

    // Facing along the leg. The walker's forward is `-sin(yaw), -cos(yaw)`.
    const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
    walker.teleport(from.x, from.z, yaw, 0);
    let lastFloor = walker.foot;
    let sinceSample = 0;
    // Generous: the walk is 1.6 m/s, so this is three times the time the leg
    // needs even if the walker slides along a wall for part of it.
    const steps = Math.ceil((length / 1.6 / DT) * 3);
    let travelled = 0;
    for (let s = 0; s < steps; s += 1) {
      const was = { x: walker.pose.x, z: walker.pose.z };
      const wasFoot = walker.foot;
      walker.update(DT, { forward: 1 });
      const step = Math.hypot(walker.pose.x - was.x, walker.pose.z - was.z);
      // Stationary with the ground unchanged, having asked to move: the floor
      // refused the step. Distinguished from being pushed back by a wall,
      // which moves the walker and is what an unfinished leg is for.
      if (step < 1e-9 && walker.foot === wasFoot && collision.floorAt(
        was.x - Math.sin(walker.pose.yaw) * 0.2, was.z - Math.cos(walker.pose.yaw) * 0.2, wasFoot,
      ) === undefined) refusals += 1;
      travelled += step;
      sinceSample += step;
      if (sinceSample >= SAMPLE) {
        sinceSample = 0;
        const jump = Math.abs(walker.foot - lastFloor);
        if (jump > worstJump) worstJump = jump;
        if (jump > CLIFF) {
          cliffs += 1;
          if (failures.length < 8) {
            failures.push(`  ground jumped ${jump.toFixed(2)} m over ${SAMPLE} m at ${walker.pose.x.toFixed(0)}, ${walker.pose.z.toFixed(0)}`);
          }
        }
        lastFloor = walker.foot;
      }
      if (Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z) <= ARRIVED) break;
    }
    metres += travelled;
    if (Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z) > ARRIVED) {
      unfinished += 1;
      if (failures.length < 8) {
        failures.push(`  stopped ${Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z).toFixed(1)} m short`
          + ` of ${to.x.toFixed(0)}, ${to.z.toFixed(0)} (leg ${length.toFixed(0)} m, lane ${lane.toFixed(1)})`);
      }
    }
   }
  }
}

// And into every building. On a 20 m tile an 8 m carriageway with 2.5 m
// pavements leaves the nearest lot line SEVEN metres beyond the kerb
// (ruling 035), so walking the streets never touches a wall — which is true of
// the city and useless as a test of the thing that stops you walking through
// one. A player walks towards a building; so does this.
let probed = 0;
let entered = 0;
for (const lot of model.lots) {
  const from = model.nearestCorridor(lot.cx, lot.cz, DEFAULTS.tileM * 3);
  if (!from) continue;
  probed += 1;
  const yaw = Math.atan2(-(lot.cx - from.x), -(lot.cz - from.z));
  walker.teleport(from.x, from.z, yaw, 0);
  for (let s = 0; s < 400; s += 1) walker.update(DT, { forward: 1, run: true });
  const inside = walker.pose.x > lot.x0 && walker.pose.x < lot.x1
    && walker.pose.z > lot.z0 && walker.pose.z < lot.z1;
  if (inside) {
    entered += 1;
    if (failures.length < 8) failures.push(`  walked INTO lot ${lot.id} at ${walker.pose.x.toFixed(0)}, ${walker.pose.z.toFixed(0)}`);
  }
}

console.log(`city            ${size}×${size}, seed 1003, ${state.buildings.length} buildings`);
console.log(`model+collision ${buildMs} ms, ${collision.solids.length} solids`);
console.log(`legs            ${legs}, ${(metres / 1000).toFixed(2)} km walked`);
console.log(`unfinished      ${unfinished}`);
// Verify the instrument before believing the reading: a walk that never meets
// a wall proves the walker can cross a field.
console.log(`blocked steps   ${walker.blocked}`);
console.log(`refusals        ${refusals}`);
console.log(`lots walked at  ${probed}, walked into ${entered}`);
console.log(`cliffs          ${cliffs} (steepest ${worstJump.toFixed(2)} m over ${SAMPLE} m, cliff at ${CLIFF})`);
for (const line of failures) console.log(line);

if (walker.blocked === 0) {
  console.log("\nwalkthrough FAILED: nothing was ever in the way, so this measured a field");
  process.exit(1);
}
if (unfinished > 0 || cliffs > 0 || refusals > 0 || entered > 0) {
  console.log("\nwalkthrough FAILED");
  process.exit(1);
}
console.log("\nwalkthrough ok");
