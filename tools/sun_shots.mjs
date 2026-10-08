// The sun crosses the sky (S22, P109 → A138).
//
// **The defect this gate exists to have caught:** the key light's x and z were
// constants, so every shadow in every city at every hour fell the same way and
// the only thing the clock changed was their length. No single-frame tool could
// see that — each frame was plausible on its own — and nothing in `test/` could
// reach the renderer. What catches it is three frames from ONE camera at three
// hours, and the question asked of the page rather than of the pixels: where is
// the light standing?
//
// Four claims, and they are different:
//
//   1. the light MOVES — its azimuth at three hours, read out of the page, and
//      the arc it swept against what `data/cityviewer.json` declares;
//   2. the PICTURE moves — the three frames are three different images, which
//      is the half a player sees;
//   3. a frozen hour is still frozen — the same hour twice is the same bytes,
//      which is `?life=0`'s contract and the thing a moving light most easily
//      breaks;
//   4. the arc holds STILL between its steps — two hours inside one step of
//      `sun.arcSteps` must put the light in exactly the same place, because
//      `followShadow` snaps the shadow frustum to a texel and a light that
//      rotates turns the texel grid under it.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shoot } from "./screenshot.mjs";
import { setConfig, DEFAULTS, getConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { playedCity, standBack, describe } from "./lib/aim.mjs";
import { SUN_BAND, MOON_BAND } from "../client/world/sun.js";
import { phaseOf } from "../client/render/time-of-day.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = 1003;
const SIZE = Number(process.argv[2] ?? 96);
const YEARS = 18;

setConfig(DEFAULTS);
const cfg = getConfig();
const state = playedCity({ seed: SEED, size: SIZE, years: YEARS });
const model = createModel(state);

/** The biggest building in the city, because the biggest shadow is the one a
 * moving sun is most visible on. Chosen by FOOTPRINT rather than by height: a
 * lot carries its own geometry (`cx`, `cz`, `frontage`) and the height is the
 * catalogue's and the level's, which this gate does not need — what it needs is
 * a mass with open ground beside it. Found in node from the same model the
 * renderer draws, which is S20's pattern. */
function biggest() {
  let best;
  for (const lot of model.lots ?? []) {
    const building = lot.building;
    if (!building) continue;
    const area = (building.w ?? 1) * (building.h ?? 1) * (1 + (building.level ?? 1));
    if (!best || area > best.area) best = { area, lot, def: building.def, level: building.level };
  }
  return best;
}

const subject = biggest();
if (!subject) {
  console.error(`FAIL  no building in a played ${SIZE} after ${YEARS} years — nothing casts a shadow`);
  process.exit(1);
}
const at = { x: subject.lot.cx, z: subject.lot.cz };
// South-east of it and looking back, so the shadow swings ACROSS the frame as
// the sun walks rather than towards or away from the camera.
// Eight directions, because one is a camera standing wherever that building
// happens to have a neighbour — the refusal the first run of this gate gave,
// which is the right refusal and a useless gate (the `embankment_shots` and
// `rail_shots` lesson). South-east first, so the shadow swings ACROSS the frame
// as the sun walks rather than towards or away from the camera.
let camera;
const AWAY = [
  { x: 0.7, z: 0.7 }, { x: -0.7, z: 0.7 }, { x: 0.7, z: -0.7 }, { x: -0.7, z: -0.7 },
  { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 },
];
for (const away of AWAY) {
  // Far enough back that the GROUND is the subject. The first run stood 44 m
  // from the middle of a 3x3 lot — fourteen metres from the wall — and the
  // frame was a wall of grey with a wedge of shadow in one corner: a picture of
  // a building, in a gate about the ground beside it. A shadow needs open
  // ground in frame and a camera high enough to look along it.
  camera = standBack(model, { at, away, clear: 4, start: 75, max: 150, eyeM: 5, pitch: -7 });
  if (camera) break;
}
if (!camera) {
  console.error(`FAIL  no camera can stand clear of the ${subject.def} to watch its shadow, `
    + "in any of eight directions");
  process.exit(1);
}
console.log(describe("biggest building", { cx: at.x, cz: at.z, tileM: model.tileM }, camera));
console.log(`                a ${subject.def} at level ${subject.level}, camera ${camera.standoff} m `
  + `back on ${camera.standingOn}`);

/** Where the light actually is, asked of the page. The pixels say the picture
 * changed; this says the SUN moved, which is the claim. */
const ASK = `(state, view) => {
  const key = view.keyLight;
  return key === undefined ? undefined : {
    x: +key.position.x.toFixed(4),
    z: +key.position.z.toFixed(4),
    y: +key.position.y.toFixed(2),
    azimuth: +Math.atan2(key.position.x - state.width / 2, key.position.z - state.height / 2).toFixed(5),
  };
}`;

const problems = [];
const frames = [];

/** One shot at one hour, from the one camera. */
async function frame(label, hour) {
  const out = `reports/smoke-S22-${label}.png`;
  // `hour` goes in `extra`, not beside `photo`: `shoot()` has a named parameter
  // per flag and forwards anything ELSE through `extra`, so a top-level `hour`
  // is silently dropped — which is the defect its own comment warns about
  // (`?territory=1`, slice V7) and which the first run of this gate duly
  // reproduced: five frames, five identical digests, and the light standing at
  // `phaseForPreset("day")` in all of them. The gate caught it because it asks
  // the page where the LIGHT is rather than trusting the parameter.
  // **The preset follows the clock too**, exactly as `game.js` does
  // (`time: phaseOf(daySeconds, DAY_SECONDS)`). Without it the shot pins the
  // `day` preset and only the azimuth moves, so the light stands at 83° of
  // elevation at every hour and a "dusk" frame is noon pointing the other way —
  // which is what the first run of this gate measured and printed, three times
  // over, before anybody looked at the number.
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40,
    frames: 2, life: false, photo: camera.photo, width: 1280, height: 720,
    time: phaseOf(hour, 1), extra: { __ask: ASK, hour } });
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  // `shoot` writes the file and does not hand the bytes back, so the digest is
  // read off disk — which is also what a person comparing two shots does.
  const digest = createHash("sha1").update(await readFile(join(root, out))).digest("hex").slice(0, 16);
  const where = r.answer;
  // The ELEVATION beside the azimuth, because it is what decides whether any of
  // this is visible: the key light stands `sunHeight` tile-units up at a radius
  // of `max(w, h) × 0.18`, which on this map is 82° above the horizon at noon.
  // A quarter arc of a nearly-overhead sun moves a short shadow a little. The
  // arc is A138's decision; the elevation is a number nobody has questioned,
  // and a gate that printed only the azimuth would leave the reader wondering
  // why the pictures look so alike.
  const elevation = where
    ? Math.atan2(where.y, Math.hypot(where.x - SIZE / 2, where.z - SIZE / 2)) * 180 / Math.PI
    : undefined;
  console.log(`${out} hour=${hour} ok=${r.ok} light=${where ? `${where.x},${where.z}` : "none"} `
    + `azimuth=${where ? (where.azimuth * 180 / Math.PI).toFixed(1) : "?"}° `
    + `elevation=${elevation === undefined ? "?" : elevation.toFixed(1)}° digest=${digest ?? "?"}`);
  if (!where) problems.push(`${out}: the page has no key light to ask about`);
  frames.push({ label, hour, digest, where, file: out });
  return frames[frames.length - 1];
}

// --- 1 and 2. three hours of daylight, one camera ---------------------------
const HOURS = [
  ["dawn", SUN_BAND.from + 0.02],
  ["noon", (SUN_BAND.from + SUN_BAND.to) / 2],
  ["dusk", SUN_BAND.to - 0.02],
];
for (const [label, hour] of HOURS) await frame(label, hour);

const lit = frames.filter((f) => f.where);
if (lit.length === HOURS.length) {
  const swept = Math.abs(lit[2].where.azimuth - lit[0].where.azimuth) * 180 / Math.PI;
  // Against what the DATA declares, not against a literal here: the rate is a
  // picture decision Kjell can move without a slice, and a gate with its own
  // copy of the number would one day measure a different game.
  const expected = cfg.sun.arcDegrees * (HOURS[2][1] - HOURS[0][1]) / (SUN_BAND.to - SUN_BAND.from);
  console.log(`\nthe sun swept ${swept.toFixed(1)}° between dawn and dusk, `
    + `of a declared ${cfg.sun.arcDegrees}° arc (${expected.toFixed(1)}° expected over this span)`);
  if (Math.abs(swept - expected) > 3) {
    problems.push(`the light swept ${swept.toFixed(1)}° and the data says ${expected.toFixed(1)}°`);
  }
  if (swept < 5) problems.push("the sun did not move across the sky at all, which is the S22 defect");
  const digests = new Set(lit.map((f) => f.digest));
  if (digests.size !== lit.length) {
    problems.push(`three hours produced ${digests.size} distinct pictures — a shadow that does not move`);
  }
}

// --- 3. a frozen hour is the same bytes twice -------------------------------
{
  const again = await frame("noon-again", HOURS[1][1]);
  const noon = frames.find((f) => f.label === "noon");
  if (noon?.digest !== again.digest) {
    problems.push(`the same frozen hour gave two different frames (${noon?.digest} and ${again.digest})`);
  } else {
    console.log(`the same frozen hour twice: ${again.digest} — identical`);
  }
}

// --- 4. the arc holds still between its steps -------------------------------
//
// Two hours a fifth of a step apart must put the light in exactly the same
// place. With `arcSteps: 0` this check is meaningless and says so rather than
// passing: a continuous arc is a legitimate setting and the shimmer is then the
// thing to measure in `film`.
if (cfg.sun.arcSteps > 0) {
  const stepSpan = (SUN_BAND.to - SUN_BAND.from) / cfg.sun.arcSteps;
  const inside = HOURS[1][1] + stepSpan * 0.2;
  const nudged = await frame("noon-nudged", inside);
  const noon = frames.find((f) => f.label === "noon");
  const held = nudged.where && noon?.where && nudged.where.azimuth === noon.where.azimuth;
  console.log(`a fifth of a step later (${stepSpan.toFixed(4)} of the day): `
    + `azimuth ${held ? "unchanged" : "MOVED"}`);
  if (!held) {
    problems.push(`the light moved inside one of its ${cfg.sun.arcSteps} steps, `
      + "so the shadow texel grid turns under a camera that is not panning");
  }
} else {
  console.log(`sun.arcSteps is 0, so the arc is continuous and there are no steps to hold still`);
}

// And the moon, which is the other half of A138: it should not be where the sun
// was.
{
  const night = await frame("night", (MOON_BAND.from + MOON_BAND.to) / 2);
  const noon = frames.find((f) => f.label === "noon");
  if (night.where && noon?.where) {
    const apart = Math.abs(night.where.azimuth - noon.where.azimuth) * 180 / Math.PI;
    console.log(`the moon stands ${apart.toFixed(0)}° from the sun's noon`);
    if (apart < 120) problems.push(`the moon is ${apart.toFixed(0)}° from the sun — it took the sun's arc`);
  }
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log(`\nsun shots ok — ${frames.length} frames, the light moved ${
  cfg.sun.arcDegrees}° across the sky`);
