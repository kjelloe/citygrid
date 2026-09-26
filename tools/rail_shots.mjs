// The railway shots (slice T3).
//
// Track, a level crossing and a train, in a city the deputy built itself — and
// each one counted before it is called what it is. The train is the reason
// this tool exists rather than a screenshot: a moving thing photographed once
// is a still thing, so the shot asks the page where the carriages ARE and
// refuses a frame with none of them on the line.
//
//   reports/smoke-T3-station.png    the line and its station, from the air
//   reports/smoke-T3-crossing.png   where the track crosses a street
//   reports/smoke-T3-train.png      the train on the line, running
//
//     node tools/rail_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 25;

// The station, the longest run of track, and the first level crossing on it.
const FIND = `(state) => {
  const W = state.width;
  const station = state.buildings.find((b) => b.def === "railStation");
  if (!station) return undefined;
  const rail = (i) => (state.tiles.rail[i] & 16) !== 0;
  let crossing;
  let tiles = 0;
  let first;
  for (let i = 0; i < state.tiles.rail.length; i += 1) {
    if (!rail(i)) continue;
    tiles += 1;
    if (first === undefined) first = [i % W, (i - i % W) / W];
    if (!crossing && (state.tiles.road[i] & 16) !== 0) crossing = [i % W, (i - i % W) / W];
  }
  return { station: [station.x, station.y], tiles, crossing, first };
}`;

// What is actually on screen. `trains` is the life module's own count — never
// a function of the camera — and `posed` is how many carriages this frame put
// in the pool, which is the one that can be zero while everything else looks
// right.
const COUNT = `(state, view) => ({
  trains: view.stats?.trains?.trains ?? 0,
  onLine: view.stats?.trains?.onLine ?? 0,
  platforms: view.stats?.trains?.platforms ?? 0,
  posed: view.pools?.train?.count ?? -1,
  rails: (view.model?.rail?.corridors ?? []).length,
  live: view.stats?.streets?.live ?? 0,
})`;

const problems = [];
const probe = await shoot({ out: "reports/.rail-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error(`no station in seed ${SEED} after ${YEARS} years — the deputy never opened a line`);
console.log(`station at ${at.station}, ${at.tiles} tiles of track, crossing ${at.crossing ?? "none"}`);

function check(out, answer, want) {
  if (!(answer?.rails > 0)) problems.push(`${out}: the model has no rail corridor`);
  if (want.live && !(answer?.live > 0)) problems.push(`${out}: no street chunk baked — the track is the L2 line, not the track`);
  if (want.train && !(answer?.posed > 0)) {
    problems.push(`${out}: ${answer?.trains ?? 0} train(s) exist and NONE of their carriages was posed`);
  }
}

// The line and its station, from above and along.
{
  const out = "reports/smoke-T3-station.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60, frames: 60,
    mode: "city", span: 8, pitch: 45, yaw: 0.2, fx: at.station[0], fy: at.station[1],
    width: 1280, height: 720, extra: { __ask: COUNT } });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  check(out, r.answer, { live: true });
  if (!(r.answer?.platforms > 0)) problems.push(`${out}: the station beside the line is not a platform on it`);
}

// The crossing, at eye height, from the track itself.
if (at.crossing) {
  const out = "reports/smoke-T3-crossing.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40, frames: 50,
    street: `${at.crossing[0]},${at.crossing[1]}`, yaw: 1, pitch: -6,
    width: 1280, height: 720, extra: { __ask: COUNT } });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  check(out, r.answer, { live: true });
}

// The train. `life: true` and enough frames for it to be ON the line — it
// starts one carriage back from the end, so a short run photographs an empty
// track and calls it a train (the `?life=1` defect D4 found, one level up).
{
  const out = "reports/smoke-T3-train.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40, frames: 340,
    life: true, mode: "city", span: 8, pitch: 22, yaw: 0.05,
    fx: at.first ? at.first[0] + 5 : at.station[0], fy: at.first ? at.first[1] : at.station[1],
    width: 1280, height: 720, extra: { __ask: COUNT } });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  check(out, r.answer, { train: true });
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nrail shots ok");
