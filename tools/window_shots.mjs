// The window shots (slice S7).
//
// A facade at eye height, day and night, from the pavement outside a shop —
// which is the only place the dressing behind the glass can be judged. The
// spot is FOUND (a standing shop with a road in front of it), and the baked
// chunk's triangles are reported, because the whole question S7 raises is what
// two triangles a window costs when a chunk holds six hundred of them.
//
//   reports/smoke-S7-day.png     the shopfront and the windows above it
//   reports/smoke-S7-night.png   the same, lit
//
//     node tools/window_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

// Two subjects: a shop (its storefront is the only place the interior card
// shows) and a HOUSE, because a house's frontage is ten metres from the kerb
// and a shop on a corner is forty across a junction — the first cut of this
// tool photographed a street and called it a facade.
// "Standing" is `level >= 1` and a few months old, not six years (T2). The
// filter was `> 72` — half a development cycle short of nothing on a city
// whose commercial buildings turn over every two or three years — and seed
// 1003 regrown at era 6 had FORTY-THREE shops, every one of them 60 or 72
// ticks old, so the probe found none and the gate failed about a renderer
// that was fine. Twelve ticks is a year: long enough that the lot has
// developed and been drawn, short enough to exist in a city that churns.
const find = (zone, minLevel = 1) => `(state) => {
  const W = state.width;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height && (state.tiles.road[y * W + x] & 16) !== 0;
  const want = state.buildings.filter((b) => b.zone === ${zone} && state.tick - b.builtTick > 12)
    .sort((a, c) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(c.x - 32, c.y - 32));
  for (const b of want) {
    const sides = [[b.x, b.y - 1], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x - 1, b.y]];
    const f = sides.findIndex(([x, y]) => road(x, y));
    // A frontage with nothing across the road but more road is a junction, and
    // a junction is where a facade is furthest away.
    if (f >= 0 && b.level >= ${minLevel}) return { x: b.x + b.w / 2, y: b.y + b.h / 2, road: sides[f], frontage: f, level: b.level };
  }
  return undefined;
}`;

const COUNT = `(state, view) => ({
  triangles: view.stats?.streets?.triangles ?? 0,
  live: view.stats?.streets?.live ?? 0,
  frame: view.stats?.triangles ?? 0,
})`;

async function subject(zone, what, minLevel) {
  const r = await shoot({ out: `reports/.window-probe-${what}.png`, seed: SEED, years: YEARS,
    size: SIZE, width: 320, height: 240, extra: { __ask: find(zone, minLevel) } });
  if (!r.answer) throw new Error(`no standing ${what} with a road in front of it`);
  console.log(`${what} at ${r.answer.x},${r.answer.y} (level ${r.answer.level}), road ${r.answer.road}`);
  return r.answer;
}
const shop = await subject(2, "shop", 1);

const problems = [];
for (const [tag, time, at] of [["day", "day", shop], ["night", "night", shop]]) {
  const out = `reports/smoke-S7-${tag}.png`;
  // STREET mode, not a small span: the city camera floors at span 8, so the
  // first cut of this tool photographed the town from the air and called it a
  // pavement. The walker stands on the road tile in front of the shop.
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    street: `${at.road[0]},${at.road[1]}`, yaw: (at.frontage + 2) % 4, pitch: -8, time,
    // 1920 across: a window is 1.2 m wide and the facade across the street is
    // twenty metres away, so at 1280 the dressing behind the glass is four
    // pixels and the shot cannot answer the question it was taken for.
    width: 1920, height: 1080, streets: 60, frames: 60,
    extra: { __ask: COUNT } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} street triangles=${a.triangles} chunks=${a.live} frame=${a.frame}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  // A shot of a city with no baked street in it says nothing about a facade.
  if (!(a.live > 0)) problems.push(`${out}: no baked street chunk in the frame`);
  if (!(a.triangles > 10000)) problems.push(`${out}: ${a.triangles} street triangles is not a facade`);
}

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nwindow shots ok");
