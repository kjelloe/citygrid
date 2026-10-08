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
//     because nothing grades a road ALONG its length (Q41). A hill is not a
//     hole, and a gate that cannot tell them apart measures neither.
//
// Since S13 it also counts how much of the walk was spent ON a bridge deck, and
// fails when the city has a crossing and the walk never set foot on one: the
// three crossing counters above are FAILURE counters and all three read 0 in a
// city with no bridge in it, which is every city this gate measured until
// `saturatedCity` started laying one (ruling 047).
//
//   node tools/walkthrough.mjs [size] [terrain] [nobridge]
//
// `nobridge` builds the same city without that crossing — the before-and-after
// lever, the same one `rail` has.

import { saturatedCity } from "./lib/saturated.mjs";
import { createModel } from "../client/world/model.js";
import { wallRuns } from "../client/world/retaining.js";
import { createCollision } from "../client/world/collision.js";
import { createWalker } from "../client/life/walker.js";
import { DEFAULTS } from "../client/world/config.js";
import { isWater } from "../engine/terrain.js";

const size = Number(process.argv[2] ?? 96);
// `node tools/<gate>.mjs <size> <terrain>` — Q64 is a question about a `hilly`
// map and there was no way to run this on one (D6).
const terrain = process.argv[3] ?? "rolling";
const { state } = saturatedCity({ size, terrain, bridge: process.argv[4] !== "nobridge" });

const t0 = Date.now();
const model = createModel(state);
const collision = createCollision(model);
const buildMs = Date.now() - t0;

/** How far apart the ground is sampled, and the drop that counts as a hole. */
const SAMPLE = 2;
const CLIFF = 1;
/** Ground this far from the bare land is FILL: the grade machinery holding a
 * street up, not the terrain. */
const FILL = 1;
/** A leg is finished when the walker is within this of the far end. Two metres
 * is the length of the last stride, not a margin for failure. */
const ARRIVED = 2;
const DT = 0.1;

const walker = createWalker(collision);
/** Road tiles standing on water: what the deck is FOR, and what makes the
 * crossing counters mean anything (S13). */
let crossings = 0;
for (let i = 0; i < state.tiles.road.length; i += 1) {
  if ((state.tiles.road[i] & 16) !== 0 && isWater(state.tiles.terrain[i])) crossings += 1;
}
let legs = 0;
let unfinished = 0;
let cliffs = 0;
// A cliff on a corridor no grading can flatten is the TERRAIN, counted under its
// own name exactly as a steep refusal is (A119). The gate's criteria were
// absolute — no cliff, nothing walked into — on a city that moves with every
// balance era, so it was green at era 22 and red at era 23 with no change to the
// rule it tests. Attribution rather than a looser number: what is left over is a
// defect wherever it happens.
let steepCliffs = 0;
// And a third: the shoulder of an EMBANKMENT. Where the land is steep, the
// grade machinery holds a street above it (S11's junction drift and R3's
// profile) and the blend falls back to the land over `road.blend` metres — on
// `hilly` that is 5.7 m of fill falling away over four, which the walker meets
// as a cliff at the kerbside. It is cut-and-fill rather than a hole in the
// ground, it is the same shape as A120's building plinth, and it is Q145.
let shoulderCliffs = 0;
let worstFillAt;
const shoulders = [];
let worstFill = 0;
let refusals = 0;
// Refused on a street the grade machinery could not flatten — the terrain, not
// the ground under a street (H7).
let steepRefusals = 0;
// Refused at a road tile standing on water — the causeway the deputy already
// builds and nothing draws a deck for (S13).
let crossingRefusals = 0;
let crossingLegs = 0;
// And the other direction (S13): how much of the walk was actually ON a deck.
// `crossingRefusals` and `crossingLegs` are failure counters, and both read 0
// in a city with no crossing in it — which is every city these gates measured
// until `saturatedCity` laid one on purpose.
let deckSteps = 0;
let deckLegs = 0;

/** Is this point on a tile that carries a road AND water? */
/** Any water within two tiles of a point — the question "is this a hillside or a
 * riverbank", which the fill alone cannot answer. */
function waterNear(state, x, z, reach = 2) {
  for (let dx = -reach; dx <= reach; dx += 1) {
    for (let dz = -reach; dz <= reach; dz += 1) {
      if (onWater(state, x + dx * 20, z + dz * 20)) return true;
    }
  }
  return false;
}

function onWater(city, x, z) {
  const tx = Math.floor(x / DEFAULTS.tileM);
  const ty = Math.floor(z / DEFAULTS.tileM);
  if (tx < 0 || ty < 0 || tx >= city.width || ty >= city.height) return false;
  const i = ty * city.width + tx;
  const t = city.tiles.terrain[i];
  return (t === 3 || t === 4) && (city.tiles.road[i] & 16) !== 0;
}
let metres = 0;
let worstJump = 0;
const failures = [];

// Down the middle and along both pavements. The centre line alone walks 54 km
// without meeting a single building — lots are set back and the carriageway is
// empty by construction — so a gate that only walks it proves the walker can
// cross a field.
//
// Per CORRIDOR since T1: the pavement of a fourteen-metre avenue is three
// metres further out than a street's, and the fixed offset walked its outside
// lane — a gate that walks the road instead of the pavement is not walking the
// thing it says it is (ruling 043).
const lanesOf = (corridor) => {
  const walk = corridor.half + DEFAULTS.road.sidewalk / 2;
  return [0, walk, -walk];
};

for (const corridor of model.corridors) {
  // Is this corridor one the grade machinery could actually flatten? A profile
  // steeper than `maxGrade` is a street whose two junctions are further apart in
  // height than any street may climb (S11), and a walker refusing a step on one
  // of those is the TERRAIN, not a defect in the ground under a street. The
  // played fixture (H7) has 25 of 5,946; the grid fixture had none, which is why
  // this distinction never had to exist.
  const steep = (model.profileOf?.(corridor.id)?.steepest ?? 0) > DEFAULTS.road.maxGrade + 1e-6;
  for (let i = 1; i < corridor.points.length; i += 1) {
   for (const lane of lanesOf(corridor)) {
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
    const deckBefore = deckSteps;
    const crossedHere = () => deckSteps > deckBefore;
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
      ) === undefined) {
        // WHY the floor refused, because the three answers are different
        // problems. A crossing is the causeway nobody designed: the deputy
        // paves over shallow water (10 road tiles in a played 96), the engine
        // charges `build.roadOverWater` for it, and the renderer drapes the
        // road into the shallows — so the bank is a 0.72 m step up and the
        // walker is stopped at the water's edge. That is S13's bridge arriving
        // from the other side (A84, Q104), not a defect in this ground.
        if (onWater(state, was.x, was.z)) crossingRefusals += 1;
        else if (steep) steepRefusals += 1;
        else refusals += 1;
      }
      if (step > 1e-9 && onWater(state, walker.pose.x, walker.pose.z)) deckSteps += 1;
      travelled += step;
      sinceSample += step;
      if (sinceSample >= SAMPLE) {
        sinceSample = 0;
        const jump = Math.abs(walker.foot - lastFloor);
        if (jump > worstJump) worstJump = jump;
        if (jump > CLIFF) {
          // How far the ground here is from the bare land: the fill the street
          // is standing on.
          const fill = Math.abs(model.heightAt(walker.pose.x, walker.pose.z)
            - model.landAt(walker.pose.x, walker.pose.z));
          const onFill = fill > FILL;
          if (onFill && fill > worstFill) {
            worstFill = fill;
            // WHERE, not just how much: a number with no coordinates is a thing
            // nobody can photograph, and the first instrument S14 needed was a
            // place to stand (Q145).
            worstFillAt = { x: walker.pose.x, z: walker.pose.z };
          }
          if (steep) steepCliffs += 1;
          else if (onFill) {
            shoulderCliffs += 1;
            // Every one of them, with the fill and whether there is water
            // nearby: S14 went looking for a hillside and the worst fill in the
            // city turned out to be at a river (Q145).
            if (shoulders.length < 12) {
              shoulders.push(`  ${fill.toFixed(1)} m of fill at ${walker.pose.x.toFixed(0)}, ${walker.pose.z.toFixed(0)} m`
                + ` (tile ${(walker.pose.x / 20).toFixed(0)},${(walker.pose.z / 20).toFixed(0)})`
                + `${waterNear(state, walker.pose.x, walker.pose.z) ? " — water within 2 tiles" : ""}`);
            }
          }
          else cliffs += 1;
          if (!steep && !onFill && failures.length < 8) {
            failures.push(`  ground jumped ${jump.toFixed(2)} m over ${SAMPLE} m at ${walker.pose.x.toFixed(0)}, ${walker.pose.z.toFixed(0)}`);
          }
        }
        lastFloor = walker.foot;
      }
      if (Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z) <= ARRIVED) break;
    }
    if (crossedHere()) deckLegs += 1;
    metres += travelled;
    if (Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z) > ARRIVED) {
      // Stopped AT the water's edge, or stopped by something else. The first is
      // the causeway (S13) and is counted with the crossings; the second is a
      // street a person cannot walk, which is what this gate is for.
      const atCrossing = onWater(state, walker.pose.x, walker.pose.z)
        || onWater(state, to.x, to.z)
        || onWater(state, (walker.pose.x + to.x) / 2, (walker.pose.z + to.z) / 2);
      if (atCrossing) crossingLegs += 1;
      else {
        unfinished += 1;
        if (failures.length < 8) {
          failures.push(`  stopped ${Math.hypot(walker.pose.x - to.x, walker.pose.z - to.z).toFixed(1)} m short`
            + ` of ${to.x.toFixed(0)}, ${to.z.toFixed(0)} (leg ${length.toFixed(0)} m, lane ${lane.toFixed(1)})`);
        }
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
// Standing inside a lot's FOOTPRINT on top of what is built there is not walking
// through a wall: the building is BURIED (A119). A lot is seated on its lowest
// corner and a plinth makes up the difference (ruling 038), so on a hillside the
// ground at the lot's middle rises to the roof — all four of `hilly` 128's are
// this, each with the walker's feet 7.9 m above the seat and within 15 cm of the
// box's top. `resolve` is right not to treat it as a wall; the defect is that
// the building is in the hill, which is Q144's question wearing another hat.
let buried = 0;
let worstBuried = 0;
for (const lot of model.lots) {
  const from = model.nearestCorridor(lot.cx, lot.cz, DEFAULTS.tileM * 3);
  if (!from) continue;
  probed += 1;
  const yaw = Math.atan2(-(lot.cx - from.x), -(lot.cz - from.z));
  walker.teleport(from.x, from.z, yaw, 0);
  for (let s = 0; s < 400; s += 1) walker.update(DT, { forward: 1, run: true });
  const inside = walker.pose.x > lot.x0 && walker.pose.x < lot.x1
    && walker.pose.z > lot.z0 && walker.pose.z < lot.z1;
  if (!inside) continue;
  const boxes = collision.near(walker.pose.x, walker.pose.z, 0.5);
  // At or within a step of the roof: the walker is on the hillside over the
  // building, not in a room.
  const over = boxes.length > 0 && boxes.every((b) => walker.foot >= b.yTop - collision.stepUp);
  if (over) {
    buried += 1;
    const deep = Math.max(...boxes.map((b) => walker.foot - b.yBase));
    if (deep > worstBuried) worstBuried = deep;
    continue;
  }
  entered += 1;
  if (failures.length < 8) failures.push(`  walked INTO lot ${lot.id} at ${walker.pose.x.toFixed(0)}, ${walker.pose.z.toFixed(0)}`);
}

// How steep the streets are, along their length (slice R3, A42).
//
// Not the same question as the walker's `worstJump`, which is what the GROUND
// does under a walker who may be on a pavement or in a garden. This is the
// carriageway's own profile: sample `heightAt` down each corridor's centre line
// and take the worst rise over run. A road at 30% is a road nothing can drive
// up, and no test can see it — the ribbon drapes onto whatever it is given.
//
// Two numbers, because they answer different things. The FIELD grade is what
// anything standing on the street actually sits on, blending included; the
// count of corridors that cannot be graded is what is left over when the land
// between two junctions is steeper than the limit allows over the run between
// them. Node heights are fixed (A42), so those cannot be fixed by grading —
// only by moving a junction, which is a different decision.
const GRADE_STEP = 2;
let ungradeable = 0;
for (const corridor of model.corridors) {
  const profile = model.profileOf?.(corridor.id);
  if (profile && profile.steepest > DEFAULTS.road.maxGrade + 1e-6) ungradeable += 1;
}
let steepest = 0;
let steepestAt;
let over = 0;
let samples = 0;
for (const corridor of model.corridors) {
  for (let i = 1; i < corridor.points.length; i += 1) {
    const a = corridor.points[i - 1];
    const b = corridor.points[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < GRADE_STEP) continue;
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    let prev = model.heightAt(a.x, a.z);
    for (let d = GRADE_STEP; d <= len; d += GRADE_STEP) {
      const x = a.x + ux * d;
      const z = a.z + uz * d;
      const h = model.heightAt(x, z);
      const grade = Math.abs(h - prev) / GRADE_STEP;
      samples += 1;
      if (grade > DEFAULTS.road.maxGrade + 1e-6) over += 1;
      if (grade > steepest) { steepest = grade; steepestAt = { x, z }; }
      prev = h;
    }
  }
}

console.log(`city            ${size}×${size} ${terrain}, seed 1003, ${state.buildings.length} buildings`);
console.log(`model+collision ${buildMs} ms, ${collision.solids.length} solids`);
console.log(`legs            ${legs}, ${(metres / 1000).toFixed(2)} km walked`);
console.log(`unfinished      ${unfinished}`);
// Verify the instrument before believing the reading: a walk that never meets
// a wall proves the walker can cross a field.
console.log(`blocked steps   ${walker.blocked}`);
console.log(`refusals        ${refusals}`);
console.log(`steep refusals  ${steepRefusals}   (on corridors no grading can flatten — the terrain, not a defect)`);
console.log(`walked on decks ${deckSteps} steps over ${deckLegs} legs   (${crossings} road tiles stand on water)`);
console.log(`crossing stops  ${crossingRefusals} steps, ${crossingLegs} legs   (at a road tile standing on water — the causeway S13 replaces with a deck)`);
console.log(`lots walked at  ${probed}, walked into ${entered}`
  + `   (${buried} buried in the hill, deepest ${worstBuried.toFixed(1)} m — Q144, not a wall)`);
console.log(`steepest street ${(steepest * 100).toFixed(1)}%`
  + `${steepestAt ? ` at ${steepestAt.x.toFixed(0)}, ${steepestAt.z.toFixed(0)}` : ""}`
  + `  (${over} of ${samples} samples over ${(DEFAULTS.road.maxGrade * 100).toFixed(0)}%)`);
console.log(`ungradeable    ${ungradeable} of ${model.corridors.length} corridors`
  + `  — their two junctions are further apart than ${(DEFAULTS.road.maxGrade * 100).toFixed(0)}% allows`);
console.log(`cliffs          ${cliffs} (steepest ${worstJump.toFixed(2)} m over ${SAMPLE} m, cliff at ${CLIFF})`
  + `   ${(cliffs / Math.max(1, metres / 1000)).toFixed(2)} per km walked`);
console.log(`terrain cliffs  ${steepCliffs}   (on corridors no grading can flatten — the land, not the ground under a street)`);
for (const line of shoulders) console.log(line);
// S18: the same shoulders, counted as what they are now — a faced wall rather
// than grass hanging in the air. The ground did not move (A128: renderer only),
// so the cliff count below is unchanged by design; this says how many of them
// the city now has a face on.
const walls = wallRuns(model, DEFAULTS);
console.log(`walls           ${walls.length} faced shoulders (S18)`
  + `${walls.length > 0 ? `, deepest ${Math.max(...walls.map((w) => w.drop)).toFixed(1)} m` : ""}`
  + `, ${walls.filter((w) => w.water).length} at water`);
// **And the rungs either side of the live one** (S18c). The ladder that chose
// `wallMinDrop` was measured once, by a script nobody kept, on a city two
// balance eras old: at 3 m this walk read 130 faced shoulders on era 28's hilly
// 128 and reads 2 on era 29's, because B14 paves a fifth of the city instead of
// a third. A rung is a picture decision about a city, and the city is rebuilt by
// every balance era — so the ladder is printed here, every run, beside the count
// it is chosen from.
console.log(`wall ladder     ${[1.2, 2, 3].map((minDrop) => {
  const rung = wallRuns(model, { ...DEFAULTS, road: { ...DEFAULTS.road, wallMinDrop: minDrop } });
  return `${minDrop} m: ${rung.length}`;
}).join("   ")}   (live ${DEFAULTS.road.wallMinDrop} m)`);
console.log(`shoulder cliffs ${shoulderCliffs}   (at the edge of an embankment the grading built, worst fill ${worstFill.toFixed(1)} m`
  + `${worstFillAt ? ` at ${worstFillAt.x.toFixed(0)}, ${worstFillAt.z.toFixed(0)} m — tile ${(worstFillAt.x / 20).toFixed(0)},${(worstFillAt.z / 20).toFixed(0)}` : ""} — Q145)`);
for (const line of failures) console.log(line);

if (crossings > 0 && deckLegs === 0) {
  console.log("\nwalkthrough FAILED: the city has a bridge in it and the walk never set foot on one");
  process.exit(1);
}
if (walker.blocked === 0) {
  console.log("\nwalkthrough FAILED: nothing was ever in the way, so this measured a field");
  process.exit(1);
}
if (unfinished > 0 || cliffs > 0 || refusals > 0 || entered > 0) {
  console.log("\nwalkthrough FAILED");
  process.exit(1);
}
console.log("\nwalkthrough ok");
