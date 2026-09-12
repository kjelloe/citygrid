// The crowd shots (slice B7).
//
// The item: from the city camera "a street with people on it is a street with
// nobody on it". The gate is the city camera at 20 and 40 tiles across on a
// PLAYED city (forty years), once with the crowd painted magenta — E7's trick,
// because a crowd that is drawn and cannot be seen is a question a picture
// answers in one shot — and once as it is.
//
// Aimed at the busiest residential block, found by asking the page, and the
// crowd's own count is printed beside each shot: a picture of nobody proves
// nothing unless the probe says somebody was there to draw.
//
//     node tools/crowd_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = Number(process.env.SEED ?? 1003);
const SIZE = Number(process.env.SIZE ?? 64);
const YEARS = Number(process.env.YEARS ?? 40);

/** The mean position of the residential buildings, weighted by occupancy —
 * where the demand is, and so where the crowd is. */
const ASK = `(state, view) => {
  let sx = 0; let sy = 0; let w = 0;
  for (const b of state.buildings) {
    if (b.zone !== 1 && b.zone !== 2) continue;
    const o = Math.max(1, b.occupancy ?? 1);
    sx += (b.x + b.w / 2) * o; sy += (b.y + b.h / 2) * o; w += o;
  }
  const s = view.stats;
  return { fx: w ? sx / w : state.width / 2, fy: w ? sy / w : state.height / 2,
    posed: s.pedsCityPosed, pedsCity: s.pedsCity, pedsCityNear: s.pedsCityNear, held: s.pedsCityHeld, cap: s.pedCapCity,
    px: s.tilePixels, lod: s.lod };
}`;

const found = await shoot({
  out: "reports/.crowd-shots-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: ASK },
});
const { fx, fy } = found.answer;
console.log(`aiming at (${fx.toFixed(1)}, ${fy.toFixed(1)}) — the occupancy-weighted middle of the town`);

for (const span of [20, 40]) {
  for (const crowd of ["magenta", ""]) {
    const out = `reports/smoke-B7-city${span}${crowd ? "-magenta" : ""}.png`;
    const r = await shoot({
      out, seed: SEED, years: YEARS, size: SIZE, tier: "high", mode: "city", span, pitch: 30, yaw: 0,
      fx, fy, width: 1920, height: 1080, frames: 30, extra: { __ask: ASK, ...(crowd ? { crowd } : {}) },
    });
    const a = r.answer ?? {};
    console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} — ${a.posed} POSED (${a.pedsCity} from the air + ${a.pedsCityNear} close counted), `
      + `${a.held} of ${a.cap} held, ${a.px} px a tile, ladder "${a.lod}"`);
    if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
    if (!(a.posed > 0)) console.log("    NOBODY POSED — the picture proves nothing");
  }
}
