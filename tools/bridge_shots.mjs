// The bridge shots (slice S13).
//
// Three questions a test cannot answer: does the deck READ as a bridge from the
// bank, does the walker stand on it rather than in the water, and is there
// anything underneath holding it up.
//
// The spot is FOUND and the deck is MEASURED in the page before any of it is
// called a bridge — a shot of a road at the waterline is exactly what this
// slice replaces, and it looks fine until you know what you are looking at.
//
//   reports/smoke-S13-bridge.png   the crossing from the bank
//   reports/smoke-S13-deck.png     standing on the deck, looking along it
//   reports/smoke-S13-under.png    from the water, under the girder
//
//     node tools/bridge_shots.mjs

import { shoot } from "./screenshot.mjs";
import { DEFAULTS } from "../client/world/config.js";

const SEED = 1003;
const SIZE = 96;
const YEARS = 20;

/** The crossing: the run of road tiles that stand on water, with the dry tile
 * at each end of it. `dense=1`, so this is the city the other gates measure —
 * which carries one bridge on purpose, because the deputy's own crossings are
 * rare enough that no gate city had ever contained one (ruling 047). */
const FIND = `(state) => {
  const W = state.width;
  const wet = (i) => state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4;
  const paved = (i) => (state.tiles.road[i] & 16) !== 0;
  for (let y = 1; y < state.height - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      if (!paved(i) || !wet(i)) continue;
      // Which way the crossing runs: the axis whose neighbours are both road.
      const horizontal = paved(i - 1) && paved(i + 1);
      let lo = horizontal ? x : y;
      let hi = lo;
      const at = (k) => (horizontal ? y * W + k : k * W + x);
      while (wet(at(lo - 1))) lo -= 1;
      while (wet(at(hi + 1))) hi += 1;
      const mid = (lo + hi) / 2 + 0.5;
      return {
        horizontal,
        span: hi - lo + 1,
        x: horizontal ? mid : x + 0.5,
        y: horizontal ? y + 0.5 : mid,
        bankX: horizontal ? lo - 1 + 0.5 : x + 0.5,
        bankY: horizontal ? y + 0.5 : lo - 1 + 0.5,
        bankTile: horizontal ? [lo - 1, y] : [x, lo - 1],
      };
    }
  }
  return undefined;
}`;

/** What the ground is doing where the camera is pointed: the deck, the water
 * under it, and the bed under that. A number per thing the picture is supposed
 * to be showing. */
const MEASURE = (x, y) => `(state, view) => {
  const m = view.model;
  const T = m.tileM;
  const level = m.waterLevelAt(${x} * T, ${y} * T);
  const surface = m.surfaceAt(${x} * T, ${y} * T);
  return {
    level: level === undefined ? undefined : +level.toFixed(2),
    deck: +surface.y.toFixed(2),
    kind: surface.kind,
    // The terrain mesh's own answer, which under a deck must still be the bed.
    ground: +m.cornerHeightAt(Math.round(${x}), Math.round(${y})).toFixed(2),
    clearance: level === undefined ? undefined : +(surface.y - level).toFixed(2),
  };
}`;

const probe = await shoot({ out: "reports/.bridge-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { dense: 1, __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error("no road tile stands on water: there is no bridge to photograph");
console.log(`crossing at ${at.x},${at.y}, ${at.span} tiles of water, ${at.horizontal ? "east-west" : "north-south"}`);

const problems = [];
const WANT = DEFAULTS.road.deckClearance - DEFAULTS.road.deckDepth;
async function frame(out, opts, note) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    streets: 60, frames: 40, extra: { dense: 1, __ask: MEASURE(at.x, at.y) }, ...opts });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} ${a.kind} deck=${a.deck}m water=${a.level}m clear=${a.clearance}m`
    + ` ground=${a.ground}m — ${note}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  if (a.kind !== "road") problems.push(`${out}: what is underfoot mid-channel is ${a.kind}, not the deck`);
  if (!(a.clearance >= WANT)) problems.push(`${out}: the deck is ${a.clearance} m over the water, asked for ${WANT}`);
  if (!(a.ground < a.level)) problems.push(`${out}: the ground under the deck is at ${a.ground}, the water at ${a.level}`);
}

// The whole crossing, obliquely: the deck spanning the water, narrower than
// the road on land because a bridge carries the carriageway and its pavements
// and not the tile's verges. `span` floors at 8 tiles in city mode, so this is
// as close as this harness stands.
const along = at.horizontal ? 1 : 0;
const across = at.horizontal ? 0 : 1;
await frame("reports/smoke-S13-bridge.png",
  { mode: "city", span: 8, pitch: 28, yaw: along, fx: at.x, fy: at.y, width: 1280, height: 720 },
  "the crossing from the bank");
// Standing on the bank tile of the crossing and looking along it: the ramp, the
// girder's face and the far bank, from the height a person is.
await frame("reports/smoke-S13-deck.png",
  { street: `${at.bankTile[0]},${at.bankTile[1]}`, yaw: at.horizontal ? 3 : 0, pitch: -4,
    width: 1280, height: 720 },
  "on the deck, looking along it");
// Side on and low, which is the view in which a deck and a causeway differ —
// and the view in which 4 m of clearance at 160 m is a few pixels, so the
// MEASUREMENT beside each shot is the proof and the picture is the check.
await frame("reports/smoke-S13-under.png",
  { mode: "city", span: 8, pitch: 6, yaw: across, fx: at.x, fy: at.y, width: 1280, height: 720 },
  "side on, from the water");

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nbridge shots ok");
