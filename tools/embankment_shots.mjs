// What a street's shoulder looks like on a hillside (S14, Q145).
//
//   node tools/embankment_shots.mjs [tileX] [tileZ]
//
// `walkthrough 128 hilly` prints where the worst fill is — up to 14.7 m of it,
// falling away over `road.blend` — and this stands at that place and takes the
// three pictures a batter has to be judged by: from the kerb looking out over
// the drop, from below looking back at the face, and side on at city zoom where
// the shape of the shoulder is a silhouette rather than a surface.
//
// Before and after the same change, same seed, same place. A number that moved
// is not a picture that improved.

import { shoot } from "./screenshot.mjs";

const tx = Number(process.argv[2] ?? 61);
const tz = Number(process.argv[3] ?? 35);
const tag = process.argv[4] ?? "before";
const common = { seed: 1003, years: 20, size: 128, terrain: "hilly", tier: "high", streets: 40,
  frames: 60, width: 1280, height: 720 };

const shots = [
  // From the kerb, looking along the street: the fill is under the camera.
  [`reports/smoke-S14-kerb-${tag}.png`, { street: `${tx},${tz}`, yaw: 1, pitch: -14 }],
  // Facing out over the shoulder, which is where the drop is.
  [`reports/smoke-S14-drop-${tag}.png`, { street: `${tx},${tz}`, yaw: 2, pitch: -22 }],
  // Side on and CLOSE: a fourteen-metre face is invisible at span 24 — the
  // first cut of this tool framed the whole town and the subject was four
  // pixels of it. The span floors at 8; 11 is about a street's width of
  // context, and the two yaws are a quarter turn apart so one of them is
  // across the street rather than along it.
  [`reports/smoke-S14-side-${tag}.png`, { mode: "city", span: 11, pitch: 7, yaw: 0.8, fx: tx, fy: tz }],
  [`reports/smoke-S14-side2-${tag}.png`, { mode: "city", span: 11, pitch: 7, yaw: 2.4, fx: tx, fy: tz }],
];

for (const [out, camera] of shots) {
  const r = await shoot({ out, ...common, ...camera });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok} tri=${r.report?.triangles}`);
  if (!r.ok) console.error(`  ${r.problems.slice(0, 2).join("\n  ")}`);
}
console.log(`\nembankment shots (${tag}) at tile ${tx},${tz}`);
