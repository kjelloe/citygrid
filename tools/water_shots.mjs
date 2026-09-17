// The water shots (slice S4).
//
// A river with banks, from the bank; a shoreline close up; and the surface from
// the air, which is where S2 found it showing its tiles as seams and a
// cross-hatch. The spot is FOUND — the widest channel near the middle with dry
// land on both sides — and the trough is MEASURED in the page before any of it
// is called a river: a shot of flat blue water proves nothing, and that is
// exactly what this slice is about.
//
//   reports/smoke-S4-river.png    across the channel from its bank
//   reports/smoke-S4-shore.png    the waterline close up
//   reports/smoke-S4-sheet.png    the surface from the air, seams or none
//
//     node tools/water_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

/** The widest water run near the middle with dry land at both ends of it. */
const FIND = `(state) => {
  const W = state.width;
  const wet = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height
    && (state.tiles.terrain[y * W + x] === 3 || state.tiles.terrain[y * W + x] === 4);
  let best;
  for (let y = 2; y < state.height - 2; y += 1) {
    let x = 1;
    while (x < W - 1) {
      if (!wet(x, y)) { x += 1; continue; }
      let end = x;
      while (end < W - 1 && wet(end, y)) end += 1;
      const width = end - x;
      // Dry at both ends, so the shot has two banks in it.
      if (!wet(x - 1, y) && !wet(end, y) && width >= 2) {
        const mid = (x + end) / 2;
        const score = width - Math.hypot(mid - W / 2, y - state.height / 2) / 8;
        if (!best || score > best.score) best = { x: mid, y: y + 0.5, width, bank: x - 0.5, score };
      }
      x = end;
    }
  }
  return best;
}`;

/** What the ground is actually doing where the camera is pointed. */
const MEASURE = (x, y, bankX) => `(state, view) => {
  const m = view.model;
  const T = m.tileM;
  const level = m.waterLevelAt(${x} * T, ${y} * T);
  const bed = m.heightAt(${x} * T, ${y} * T);
  // The dry tile outside the channel, not a point still in it: the first cut of
  // this probe sampled 0.6 of a tile from the channel's MIDDLE, which on a ten
  // tile river is open water, and reported the bank as under the surface.
  const bank = m.heightAt(${bankX} * T, ${y} * T);
  return {
    trough: level === undefined ? undefined : +(level - bed).toFixed(2),
    bankAbove: level === undefined ? undefined : +(bank - level).toFixed(2),
    waterTiles: view.stats?.waterTiles ?? 0,
  };
}`;

const probe = await shoot({ out: "reports/.water-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error("no channel with a bank on either side");
console.log(`channel at ${at.x},${at.y}, ${at.width} tiles wide`);

const problems = [];
async function frame(out, opts, note) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    streets: 60, frames: 40, extra: { __ask: MEASURE(at.x, at.y, at.bank - 0.5) }, ...opts });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} trough=${a.trough}m bankAbove=${a.bankAbove}m water=${a.waterTiles} — ${note}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  // The instrument check: a shot of water with no bed under it is a blue field,
  // which is the thing this slice exists to end.
  if (!(a.trough > 0.3)) problems.push(`${out}: the bed is ${a.trough} m under the surface`);
  if (!(a.bankAbove > 0)) problems.push(`${out}: the bank is ${a.bankAbove} m above the water`);
  if (!(a.waterTiles > 0)) problems.push(`${out}: no water in the city at all`);
}

await frame("reports/smoke-S4-river.png",
  { mode: "city", span: 14, pitch: 18, yaw: 1, fx: at.x, fy: at.y, width: 1280, height: 720 },
  "across the channel from its bank");
await frame("reports/smoke-S4-shore.png",
  { mode: "city", span: 8, pitch: 12, yaw: 1, fx: at.bank, fy: at.y, width: 1280, height: 720 },
  "the waterline close up");
await frame("reports/smoke-S4-sheet.png",
  { mode: "city", span: 30, pitch: 42, fx: at.x, fy: at.y, width: 1280, height: 720 },
  "the surface from the air");

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nwater shots ok");
