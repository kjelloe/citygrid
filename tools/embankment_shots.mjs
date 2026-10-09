// What a street's shoulder looks like where it stands on fill (S18, Q145/A128).
//
//   node tools/embankment_shots.mjs [size] [terrain]
//
// **The camera comes first, and this is it.** S14 built a stone facing for the
// shoulder and reverted it because nothing could photograph one: a street camera
// at a steep shoulder stands inside the embankment, and a city camera cannot
// bake L3 street geometry at all (21–44 tile pixels, "street detail not
// resolvable"). The free PHOTO camera (F1) has no walker, no pavement and no
// corridor to stand on — so it can stand three metres off the face at eye
// height and look back at it, which is the one view that shows a wall.
//
// It aims ITSELF. The deepest shoulders are found here, in node, from the same
// model the renderer draws: a hand-typed tile is a guess, and the two guesses
// this tool started with were a marina and a place the walker could not stand.
//
// Fails at zero baked chunks, because a shoulder is baked geometry and a picture
// with no chunk in it cannot show one — which is exactly how four identical
// pictures were once reported as a change.

import { shoot } from "./screenshot.mjs";
import { apply } from "../engine/reducer.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { createModel } from "../client/world/model.js";
import { wallRuns } from "../client/world/retaining.js";
import { DEFAULTS, setConfig, getConfig } from "../client/world/config.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/chronicle.js";
import "../engine/quests.js";
import "../engine/requests.js";

setConfig(DEFAULTS);
const cfg = getConfig();
const T = cfg.tileM;

const SIZE = Number(process.argv[2] ?? 128);
const TERRAIN = process.argv[3] ?? "hilly";
const SEED = 1003;
const YEARS = 20;
/** How far out from the face the camera stands, and how high. Three metres is
 * far enough to see a storey of wall and close enough that the chunk it stands
 * in is the one being baked. */
const OUT = 3;
const EYE = 1.7;

const played = () => {
  const world = generateWorld(defaultOptions({
    seed: SEED, width: SIZE, height: SIZE, seats: 1, waterStyle: "river", terrainStyle: TERRAIN,
  }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return state;
};

/** The normal to a polyline at point `i`, which is the direction "off the
 * street" — the same offset the baker's `shift` uses. */
function normalAt(points, i) {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, z: dx / len };
}

/**
 * The deepest shoulders in the city: where the ground at the edge of a street's
 * verge stands furthest above the ground just beyond it.
 *
 * The same question the wall asks, asked here so the camera can be pointed at
 * the answer rather than at a tile somebody remembered.
 */
function shoulders(model) {
  const junction = cfg.road.width / 2 + cfg.road.sidewalk;
  const vergeHalf = (T / 2 - junction) / 2;
  const edge = junction + vergeHalf * 2;
  const found = [];
  for (const c of model.corridors) {
    for (const sign of [-1, 1]) {
      for (let i = 0; i < c.points.length; i += 1) {
        const n = normalAt(c.points, i);
        const p = c.points[i];
        const at = { x: p.x + n.x * sign * junction, z: p.z + n.z * sign * junction };
        const beyond = { x: p.x + n.x * sign * edge, z: p.z + n.z * sign * edge };
        const level = model.waterLevelAt(beyond.x, beyond.z);
        const top = model.heightAt(at.x, at.z);
        const foot = level === undefined ? model.heightAt(beyond.x, beyond.z) : level;
        const drop = top - foot;
        // **Above the rule's own threshold**, not above a literal (S18c). This
        // was `1.2` — the lowest rung the ladder ever considered — so two of the
        // three pictures were of shoulders the rule does NOT face: at 3 m the
        // set photographed a 1.8 m and a 1.6 m bank and called the pair
        // before-and-after, and the only difference between the two frames was
        // fifty-two triangles somewhere else in the city. A gate that
        // photographs a wall has to stand at ground the wall is built on.
        if (drop <= cfg.road.wallMinDrop) continue;
        found.push({
          drop,
          // Where the camera stands: out past the face, on the low side.
          eye: { x: p.x + n.x * sign * (edge + OUT), z: p.z + n.z * sign * (edge + OUT) },
          // And what it looks at: back along the normal, at the face.
          at,
          foot,
          tile: { x: Math.floor(at.x / T), z: Math.floor(at.z / T) },
          water: level !== undefined,
        });
      }
    }
  }
  found.sort((a, b) => b.drop - a.drop);
  // One per place: a long embankment would otherwise be the first twenty
  // entries of this list.
  const out = [];
  for (const s of found) {
    if (out.some((o) => Math.hypot(o.at.x - s.at.x, o.at.z - s.at.z) < 40)) continue;
    out.push(s);
    if (out.length === 3) break;
  }
  return out;
}

const ASK = `(state, view) => ({
  live: view.stats?.streets?.live ?? 0,
  mode: view.view.mode,
  eyeY: Math.round((view.view.eye?.y ?? 0) * view.model.tileM * 10) / 10,
})`;

const state = played();
const model = createModel(state);
const places = shoulders(model);
console.log(`${SIZE}×${SIZE} ${TERRAIN}, ${YEARS} years: ${places.length} shoulders to photograph`);
if (places.length === 0) {
  console.error("FAIL  no shoulder deep enough to photograph — the city or the rule changed");
  process.exit(1);
}

// **The ladder, on the city this gate photographs** (S18c). The rungs that
// chose `wallMinDrop` were measured on a played hilly 128 — this city — by a
// script that was thrown away, while `walkthrough` printed a count from the
// SATURATED hilly city, which has two faced shoulders in it. Two numbers for
// one question, on two different cities, and the one in the lane file came from
// the instrument nobody kept. So it is printed here, where the pictures are
// taken, every run: the live threshold's count and the rungs either side of it.
{
  const rungs = [...new Set([1.2, 2, 3, cfg.road.wallMinDrop])].sort((a, b) => a - b);
  const rows = rungs.map((minDrop) => {
    const walls = wallRuns(model, { ...cfg, road: { ...cfg.road, wallMinDrop: minDrop } });
    const deepest = walls.length > 0 ? Math.max(...walls.map((w) => w.drop)) : 0;
    return `${minDrop} m: ${walls.length}${walls.length > 0
      ? ` (deepest ${deepest.toFixed(1)} m, ${walls.filter((w) => w.water).length} at water)` : ""}`;
  });
  console.log(`faced shoulders at each rung — ${rows.join("; ")}`);
  console.log(`the city is running wallMinDrop ${cfg.road.wallMinDrop} m (data/cityviewer.json)`);
  if (wallRuns(model, cfg).length === 0) {
    console.error(`FAIL  no faced shoulder at all at ${cfg.road.wallMinDrop} m — `
      + "this gate photographs walls and the city has none");
    process.exit(1);
  }
}

let baked = 0;
for (let i = 0; i < places.length; i += 1) {
  const place = places[i];
  // Looking back at the face. `atan2(dx, dz)` is the renderer's own yaw
  // convention (`poseAt` in `client/world/film.js` uses the same one).
  const yaw = Math.atan2(place.at.x - place.eye.x, place.at.z - place.eye.z);
  // Both arms from ONE harness (`wall=0` is the before), or the pair is two
  // cities rather than one change — R3's lesson about `grade=0`.
  for (const tag of ["before", "after"]) {
    const out = `reports/smoke-S18-wall${i + 1}-${tag}.png`;
    const r = await shoot({
      out, seed: SEED, years: YEARS, size: SIZE, terrain: TERRAIN, tier: "high",
      streets: 40, frames: 70, width: 1280, height: 720, extra: { __ask: ASK },
      photo: [place.eye.x / T, place.eye.z / T, EYE, yaw, -6].join(","),
      wall: tag === "after",
    });
    if (tag === "after") baked += r.answer?.live ?? 0;
    console.log(`${out}  ${place.drop.toFixed(1)} m${place.water ? " (at water)" : ""}`
      + ` at tile ${place.tile.x},${place.tile.z}  ok=${r.ok} tri=${r.report?.triangles}`
      + ` ${JSON.stringify(r.answer)}`);
    if (!r.ok) console.error(`  ${r.problems.slice(0, 2).join("\n  ")}`);
  }
}

if (baked === 0) {
  console.error("\nFAIL  not one street chunk was baked — these are pictures of instanced boxes,"
    + " and a shoulder is baked geometry (A128: the camera is the thing being tested here)");
  process.exit(1);
}
console.log(`\nembankment shots ok — ${baked} baked chunks across ${places.length} after frames`);
