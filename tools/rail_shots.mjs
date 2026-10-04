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
import { DEFAULTS } from "../client/world/config.js";

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
const COUNT = `(state, view) => {
  const m = view.model;
  // The LINE against the land it crosses (Q120, A118): its own gradient, and
  // how deep it cuts and how high it fills. Before this the track followed the
  // terrain and climbed 18% on a hillside, and nothing could see it — the
  // ribbon drapes onto whatever it is given.
  let steepest = 0;
  let cut = 0;
  let fill = 0;
  const trackAt = (x, z) => (m.railHeightAt ? m.railHeightAt(x, z) : m.heightAt(x, z));
  for (const c of m?.rail?.corridors ?? []) {
    // Measured from the track AS DRAWN, not from the profile: with the grading
    // off there is no profile, and reading one would report 0% for a line
    // following an 18% hillside — a number that says "fine" about the defect.
    let prev;
    for (const p of c.points) {
      const y = trackAt(p.x, p.z);
      if (prev) {
        const run = Math.hypot(p.x - prev.x, p.z - prev.z);
        if (run > 1e-6) steepest = Math.max(steepest, Math.abs(y - prev.y) / run);
      }
      prev = { x: p.x, z: p.z, y };
      const d = y - m.landAt(p.x, p.z);
      if (d > fill) fill = d;
      if (-d > cut) cut = -d;
    }
  }
  return {
    trains: view.stats?.trains?.trains ?? 0,
    onLine: view.stats?.trains?.onLine ?? 0,
    platforms: view.stats?.trains?.platforms ?? 0,
    posed: view.pools?.train?.count ?? -1,
    rails: (m?.rail?.corridors ?? []).length,
    live: view.stats?.streets?.live ?? 0,
    steepest: +(steepest * 100).toFixed(1),
    cut: +cut.toFixed(2),
    fill: +fill.toFixed(2),
  };
}`;

const problems = [];
const probe = await shoot({ out: "reports/.rail-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error(`no station in seed ${SEED} after ${YEARS} years — the deputy never opened a line`);
console.log(`station at ${at.station}, ${at.tiles} tiles of track, crossing ${at.crossing ?? "none"}`);

function check(out, answer, want) {
  if (!(answer?.rails > 0)) problems.push(`${out}: the model has no rail corridor`);
  // The gradient the line is actually drawn at (A118). `maxGrade: 0` turns the
  // grading off, which is the before-and-after lever; with it on, no stretch of
  // track may be steeper than a train can climb.
  // `rail.maxGrade: 0` is the lever that turns the grading off for a
  // before-and-after, so there is no limit to check against then — the numbers
  // are the measurement.
  const limit = DEFAULTS.rail.maxGrade * 100;
  if (limit > 0 && answer?.steepest > limit + 0.1) {
    problems.push(`${out}: the line climbs ${answer.steepest}% against a limit of ${limit}%`);
  }
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

// The line on HILLY ground, which is where Q120 lives. A measurement rather
// than a picture: a cutting two metres deep is a few pixels at any zoom this
// camera can reach, and the number is the proof. On the 64 the gate photographs
// the earthwork is 2 cm, which is the right answer for gentle land and says
// nothing at all about the question.
{
  const hill = await shoot({ out: "reports/.rail-hill.png", seed: SEED, years: YEARS, size: 96,
    terrain: "hilly", tier: "high", streets: 40, frames: 20, mode: "city", span: 30, pitch: 30,
    width: 640, height: 360, extra: { dense: 1, __ask: COUNT } });
  const a = hill.answer ?? {};
  console.log(`hilly 96: the line climbs ${a.steepest}%, cuts ${a.cut} m and fills ${a.fill} m`);
  const limit = DEFAULTS.rail.maxGrade * 100;
  if (!(a.rails > 0)) problems.push("hilly: no line was laid, so this measures nothing");
  else {
    if (limit > 0 && a.steepest > limit + 0.1) problems.push(`hilly: the line climbs ${a.steepest}% against ${limit}%`);
    // And it got there by CUTTING. A line that follows the ground reads 0 here,
    // which is what it did before A118 — and which no picture could show.
    if (limit > 0 && !(a.cut + a.fill > 0.5)) {
      problems.push(`hilly: the line hugs the ground (${a.cut} m of cutting, ${a.fill} m of fill)`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nrail shots ok");
