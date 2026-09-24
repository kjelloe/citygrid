// The avenue shots (slice T1b).
//
// Two lanes each way round a median, in a city the deputy widened by itself —
// not a hand-drawn strip of road, because what has to be true is that the kind
// bit the engine sets (T1a) comes out of `corridors.js` as a wider corridor
// with a median down it. Aimed at the longest avenue run in a PLAYED city,
// found by asking the page, and COUNTED before it is called an avenue.
//
//   reports/smoke-T1-avenue.png     the avenue from above and along
//   reports/smoke-T1-junction.png   looking up it from the junction, at eye height
//   reports/smoke-T1-street.png     its markings and its kerb, from the pavement
//
//     node tools/avenue_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

// The longest contiguous run of avenue tiles, the tile at the middle of it, the
// axis it runs on, and a junction on it if there is one.
const FIND = `(state) => {
  const W = state.width;
  const H = state.height;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (state.tiles.road[y * W + x] & 16) !== 0;
  const avenue = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (state.tiles.road[y * W + x] & 32) !== 0;
  let best;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!avenue(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (avenue(x - dx, y - dy)) continue;   // not the start of a run
        let n = 0;
        while (avenue(x + dx * n, y + dy * n)) n += 1;
        if (!best || n > best.n) best = { x, y, dx, dy, n };
      }
    }
  }
  if (!best) return undefined;
  const mid = [best.x + best.dx * Math.floor(best.n / 2), best.y + best.dy * Math.floor(best.n / 2)];
  let junction;
  for (let k = 0; k < best.n; k += 1) {
    const x = best.x + best.dx * k;
    const y = best.y + best.dy * k;
    const arms = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([ax, ay]) => road(x + ax, y + ay)).length;
    if (arms >= 3) junction = [x, y];
  }
  // DIR4 order is N, E, S, W, and the camera's yaw is in quarter turns of it:
  // looking down a run that goes east is yaw 1, one that goes south is yaw 2.
  // Looking from the junction back ALONG the run, not off the end of it: the
  // junction is often the last tile of the avenue, and a camera pointed the
  // other way photographs the field beyond it.
  const back = junction
    ? (best.dx === 1 ? (mid[0] >= junction[0] ? 1 : 3) : (mid[1] >= junction[1] ? 2 : 0))
    : 0;
  return { run: best.n, tiles: [best.x, best.y], mid, junction, yaw: best.dx === 1 ? 1 : 2, back };
}`;

// What is actually on screen: how many corridors came out as avenues, how many
// lanes they carry, and whether a street chunk was baked at all — an avenue
// drawn by the L2 instanced pass is a picture of the road we already had.
const COUNT = `(state, view) => {
  const corridors = view.model?.corridors ?? [];
  const avenues = corridors.filter((c) => c.avenue);
  const links = (view.model?.lanes?.links ?? []).filter((l) => l.kind === "block");
  return {
    avenues: avenues.length,
    widest: Math.max(0, ...corridors.map((c) => c.half * 2)),
    twoLane: links.filter((l) => l.of === 2).length,
    seams: (view.model?.nodes ?? []).filter((n) => n.kind === "seam").length,
    // An avenue long enough to have a median in it at all: the median stops at
    // the junction mouth either end, so between junctions two tiles apart there
    // is 21 m of it and between junctions one tile apart there is none.
    withMedian: avenues.filter((c) => c.length > 2 * c.frontage + 4).length,
    live: view.stats?.streets?.live ?? 0,
  };
}`;

const problems = [];
const probe = await shoot({ out: "reports/.avenue-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error(`no avenue in seed ${SEED} after ${YEARS} years — the deputy never widened anything`);
console.log(`avenue of ${at.run} tiles from ${at.tiles}, middle ${at.mid}, junction ${at.junction ?? "none on it"}, looking back on yaw ${at.back}`);

// The oblique first, and it is the one that has to read: on a deputy grid the
// junctions are two tiles apart, so an avenue is forty metres of carriageway
// with twenty-one of median in the middle of it, and from the pavement most of
// that is behind you. From above and along, the width, the median and the wider
// junction boxes are all in one frame. `span` floors at 8 (`shot-camera-limits`).
const shots = [
  ["reports/smoke-T1-avenue.png",
    { mode: "city", span: 8, pitch: 55, yaw: 0.15, fx: at.mid[0], fy: at.mid[1], streets: 60 }],
  ["reports/smoke-T1-street.png",
    { street: `${at.mid[0]},${at.mid[1]}`, yaw: at.yaw, pitch: -4, streets: 40 }],
];
if (at.junction) {
  // ALONG the avenue, not across it: at `yaw + 1` the camera looks down the
  // cross street and photographs an ordinary road.
  shots.push(["reports/smoke-T1-junction.png",
    { street: `${at.junction[0]},${at.junction[1]}`, yaw: at.back, pitch: -4, streets: 40 }]);
}
for (const [out, camera] of shots) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", frames: 60,
    width: 1280, height: 720, extra: { __ask: COUNT }, ...camera });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.live > 0)) problems.push(`${out}: no street chunk baked — a picture of instanced boxes`);
  if (!(r.answer?.avenues > 0)) problems.push(`${out}: the model has no avenue corridor, so the kind bit never reached the picture`);
  if (!(r.answer?.twoLane > 0)) problems.push(`${out}: no lane knows it is one of two`);
  if (!(r.answer?.widest > 8)) problems.push(`${out}: the widest corridor is ${r.answer?.widest} m, which is a street`);
  if (!(r.answer?.withMedian > 0)) problems.push(`${out}: every avenue corridor is shorter than its two junction boxes, so there is no median anywhere in the city`);
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\navenue shots ok");
