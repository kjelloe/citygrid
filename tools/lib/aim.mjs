// How a picture gate points itself at its subject (S20).
//
// Five cameras in one week were aimed at a proxy and photographed the proxy:
// F2's longest corridor was an industrial strip, its furthest house was in a
// forest, its centre of mass had no works near it; S18's street camera stood
// inside the embankment it was photographing; and `street_shots`' shop camera
// stood against a wall, because it stood ON the road tile in front of a 3×3
// corner lot and faced the building.
//
// What works is `embankment_shots`' shape, which this is the shared version of:
//
//   1. find the subject in NODE, from the same pure model the renderer draws;
//   2. choose the camera from the subject's own geometry;
//   3. back off until nothing is inside the near plane;
//   4. PRINT what it found and how far back it stands, so a frame nobody looks
//      at still says what it was pointed at;
//   5. fail when there is no subject, rather than photographing the default.
//
// Pure node: no three, no page. The model this takes is `client/world/`'s,
// which is the one the renderer derives (ruling 032), so a camera chosen here
// stands where the picture is.

import { generateWorld } from "../../engine/worldgen.js";
import { defaultOptions } from "../../engine/options.js";
import { apply } from "../../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../../engine/commands.js";
import { TICKS_PER_YEAR } from "../../engine/constants.js";
import "../../engine/build-commands.js";
import "../../engine/development.js";
import "../../engine/utilities.js";
import "../../engine/economy.js";
import "../../engine/civic.js";
import "../../engine/fire.js";
import "../../engine/disasters.js";
import "../../engine/traffic.js";
import "../../engine/history.js";
import "../../engine/chronicle.js";
import "../../engine/quests.js";
import "../../engine/requests.js";
import { OUTWARD, frontEdgeOf } from "../../client/world/lots.js";

/**
 * A city the deputy has played, in node — the same one `embankment_shots`,
 * `model_cost` and the walk gates build, written once.
 *
 * The nine side-effect imports above are the reason this is a module rather
 * than four lines in each tool: a script that forgets one of them ticks an
 * empty city and says nothing about it.
 */
export function playedCity({
  seed = 1003, size = 96, years = 20, terrain = "rolling", water = "river", seats = 1,
} = {}) {
  const world = generateWorld(defaultOptions({
    seed, width: size, height: size, seats, waterStyle: water, terrainStyle: terrain,
  }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= years * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return state;
}

/** How far the nearest building footprint is from a point, in metres. Walls, not
 * centres: a camera is inside a building when the FOOTPRINT contains it. */
export function clearanceAt(model, x, z) {
  let nearest = Infinity;
  for (const lot of model.lots) {
    const dx = Math.max(lot.x0 - x, 0, x - lot.x1);
    const dz = Math.max(lot.z0 - z, 0, z - lot.z1);
    const d = Math.hypot(dx, dz);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/**
 * A camera that can actually stand where it is told to.
 *
 * Walks backwards from `at` along `away` until the nearest building is at least
 * `clear` metres off, and returns the pose plus what it had to do to get there.
 * `undefined` when the subject cannot be stood back from at all — which is a
 * finding, not a camera: the caller fails rather than shooting from inside it.
 */
/**
 * How far back a subject of this width has to be seen from to FIT.
 *
 * The first self-aimed shop shot stood six metres from a shop and filled the
 * frame with its windows — a picture of a wall, which is the same defect as a
 * picture of the horizon from the other direction. `share` is how much of the
 * frame the subject should take across: 0.6 leaves the street around it.
 */
export function fitDistance(widthM, { share = 0.6, fovDeg = 50 } = {}) {
  const halfAngle = (share * fovDeg * Math.PI) / 360;
  return (widthM / 2) / Math.tan(Math.max(0.05, halfAngle));
}

export function standBack(model, {
  at, away, clear = 3, start = 6, max = 40, step = 1, eyeM = 1.7, pitch = 0, onLand = true,
  fitWidthM, fitShare = 0.6,
}) {
  // A subject's own size decides where the camera starts, when the caller knows
  // it: six metres is close for a shop and far for a bollard.
  if (fitWidthM !== undefined) {
    start = Math.max(start, Math.round(fitDistance(fitWidthM, { share: fitShare })));
    max = Math.max(max, start + 20);
  }
  const len = Math.hypot(away.x, away.z) || 1;
  const dir = { x: away.x / len, z: away.z / len };
  for (let back = start; back <= max; back += step) {
    const eye = { x: at.x + dir.x * back, z: at.z + dir.z * back };
    if (clearanceAt(model, eye.x, eye.z) < clear) continue;
    // **And the ground has to be ground.** The first camera this helper chose
    // stood six metres clear of every building and in the middle of the river:
    // the frame was a band of city across the horizon with the water filling
    // the bottom half. "Can stand there" is not only "is not inside a wall".
    if (onLand && model.surfaceAt(eye.x, eye.z).kind === "water") continue;
    // The project's free-look forward is `(-sin(yaw), sin(pitch), -cos(yaw))`
    // (`client/world/orbit.js`), so looking BACK along the stand-off direction
    // is `atan2(dir.x, dir.z)`. The first cut negated both and pointed every
    // camera at the horizon behind its subject — a picture of a road where a
    // shop should have been, which is the very defect S20 is about.
    const yaw = Math.atan2(dir.x, dir.z);
    const ground = model.waterLevelAt?.(eye.x, eye.z) ?? model.heightAt(eye.x, eye.z);
    return {
      eye,
      // In TILES, which is what the photo camera takes.
      tile: { x: eye.x / model.tileM, z: eye.z / model.tileM },
      yaw,
      pitch,
      eyeM,
      groundM: ground,
      standoff: back,
      clearance: clearanceAt(model, eye.x, eye.z),
      /** What the camera is standing on, which a gate should print: a shot
       * taken from a lawn and one taken from the pavement are different shots. */
      standingOn: model.surfaceAt(eye.x, eye.z).kind,
      /** The `photo=` parameter `tools/shoot.html` reads (S18). */
      photo: `${(eye.x / model.tileM).toFixed(3)},${(eye.z / model.tileM).toFixed(3)},`
        + `${eyeM},${yaw.toFixed(4)},${pitch}`,
    };
  }
  return undefined;
}

/** The outward normal of a lot's frontage: the direction "away from the front
 * door", which is where a camera looking at the front of a building stands.
 *
 * Through `OUTWARD`, which is the table the doors and the facades already use —
 * a second copy of four unit vectors is a second chance to get the order wrong
 * (`client/world/lots.js`). */
export function frontageNormal(lot) {
  return OUTWARD[lot.frontage ?? 0];
}

/** The middle of a lot's street edge, in metres: what a camera facing the front
 * of a building is actually looking at. */
export function frontageMiddle(lot) {
  const edge = frontEdgeOf(lot);
  return { x: (edge.x0 + edge.x1) / 2, z: (edge.z0 + edge.z1) / 2 };
}

/** One line per subject, printed before the shot is taken. A frame nobody looks
 * at still has to say what it was aimed at (S20). */
export function describe(label, subject, camera) {
  const where = subject?.cx !== undefined
    ? `${(subject.cx / (subject.tileM ?? 16)).toFixed(1)},${(subject.cz / (subject.tileM ?? 16)).toFixed(1)}`
    : JSON.stringify(subject ?? "nothing");
  if (!camera) return `${label}: subject ${where} — NO CAMERA can stand back from it`;
  return `${label}: subject ${where}, camera ${camera.standoff} m back on ${camera.standingOn}, `
    + `${camera.clearance.toFixed(1)} m clear, eye ${camera.eyeM} m`;
}
