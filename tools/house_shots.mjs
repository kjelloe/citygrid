// The house shots (slice S9; P61).
//
// Kjell judges by eye against the reference he attached in August, so this
// slice's gate is three pictures somebody looks at: a residential street from
// the pavement, one house from across the road, and the same neighbourhood from
// city zoom on the desktop viewport (D8).
//
// The tiles were found by ASKING the page where its houses are — `shoot()` takes
// an `extra.__ask` function that runs against the generated state — rather than
// by remembering a coordinate that the next seed would move. Run:
//
//     node tools/house_shots.mjs
import { shoot } from "./screenshot.mjs";
const shots = [
  ["reports/smoke-S9-street.png", { street: "35,53", yaw: 3, pitch: 14, width: 1280, height: 720 }],
  ["reports/smoke-S9-garden.png", { street: "4,45", yaw: 3, pitch: 2, width: 1280, height: 720 }],
  ["reports/smoke-S9-city20.png", { mode: "city", span: 20, pitch: 30, yaw: 0, fx: 34, fy: 53, width: 1920, height: 1080 }],
];
for (const [out, opts] of shots) {
  const r = await shoot({ out, seed: 1003, years: 20, size: 64, tier: "high", streets: 60, frames: 60, ...opts });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} streets=${r.report?.streets?.live}`);
}
