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

// Four ways to look at the same place, from the street — which is the only
// camera that bakes a street chunk at all (city mode at span 11 baked nothing,
// which is why the first cut of this tool reported four identical pictures).
// A shoulder is beside the street, so the camera looks ACROSS it and down.
const shots = [0, 1, 2, 3].map((yaw) => [
  `reports/smoke-S14-${tag}-yaw${yaw}.png`,
  { street: `${tx},${tz}`, yaw, pitch: -25 },
]);

// What the street bake actually did, because a picture of a city with no baked
// chunk in it is a picture of instanced boxes — and a shoulder is baked
// geometry. `street_shots` has checked this since E3; the first cut of this tool
// checked nothing and reported four identical pictures as a change.
const ASK = `(state, view) => ({
  live: view.stats?.streets?.live ?? 0,
  keys: view.stats?.streets?.keys ?? "",
  total: view.stats?.streets?.total ?? 0,
})`;

let baked = 0;
for (const [out, camera] of shots) {
  const r = await shoot({ out, ...common, ...camera, extra: { __ask: ASK } });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok} tri=${r.report?.triangles} `
    + `streets=${JSON.stringify(r.answer)}`);
  if (!r.ok) console.error(`  ${r.problems.slice(0, 2).join("\n  ")}`);
  baked += r.answer?.live ?? 0;
}
// Printed, not failed: this is a picture tool for an open question (Q145), and
// `test/gates.test.js` holds `_shots` tools that are not in a set to having no
// way to fail. The number is the point — a shoulder is BAKED geometry, so a
// picture with no baked chunk in it cannot show one, and that is what the first
// four of these turned out to be.
if (baked === 0) {
  console.warn("\nnot one street chunk was baked — these are pictures of instanced boxes,"
    + " and a shoulder is baked geometry (the camera is the problem, not the ground)");
}
console.log(`\nembankment shots (${tag}) at tile ${tx},${tz}`);
