// The role shots (slice B5).
//
// The same shopping street at two hours: in the morning its people are mostly
// commuters leaving homes for work, at noon shoppers and sitters. Counted by
// role on the page before either is called a picture of that hour.
//
//   reports/smoke-B5-morning.png
//   reports/smoke-B5-noon.png
//
//     node tools/role_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

// A standing shop with a road in front, like the street shots (S3).
const FIND = `(state) => {
  const W = state.width;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height && (state.tiles.road[y * W + x] & 16) !== 0;
  const shops = state.buildings.filter((b) => b.zone === 2 && (b.flags & 8) === 0)
    .sort((a, c) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(c.x - 32, c.y - 32));
  for (const b of shops) {
    const sides = [[b.x, b.y - 1], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x - 1, b.y]];
    const f = sides.findIndex(([x, y]) => road(x, y));
    if (f >= 0) return { frontage: f, road: sides[f] };
  }
  return undefined;
}`;

const ROLES = `(state, view) => ({ near: view.stats?.pedRoles ?? {}, city: view.stats?.pedCityRoles ?? {},
  posed: (view.stats?.peds ?? 0) + (view.stats?.pedsCityPosed ?? 0) })`;

const problems = [];
const probe = await shoot({ out: "reports/.role-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error("no standing shop with a street in front of it");

const tally = {};
// The HOUR as a number (`hour=`, which the harness hands the crowd at
// construction and every frame). `time=` is the light's preset — day, sunset,
// night — and "morning" and "noon" are not presets: both shots came out the
// same hour and the check compared a city with itself.
for (const [time, hour] of [["morning", 0.10], ["noon", 0.28]]) {
  const out = `reports/smoke-B5-${time}.png`;
  // From the air at the closest city zoom, FROZEN: a frozen crowd settles for
  // thirty seconds before the shot, and a live one filmed three seconds after
  // the page loads has barely left its doors — the first shots had nobody in
  // them on a street shoppers were still walking towards.
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", frames: 30,
    life: false, time: "day", mode: "city", span: 12, pitch: 40, yaw: 0.6, fx: at.road[0], fy: at.road[1],
    width: 1280, height: 720, extra: { __ask: ROLES, hour } });
  if (!((r.answer?.posed ?? 0) > 0)) problems.push(`${out}: nobody drawn`);
  tally[time] = r.answer;
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
}
const share = (roles, role) => (roles?.[role] ?? 0) / Math.max(1, Object.values(roles ?? {}).reduce((a, b) => a + b, 0));
if (!(share(tally.morning?.city, "commuter") > share(tally.noon?.city, "commuter"))) {
  problems.push("the morning has no more commuters than noon");
}
if (!((tally.noon?.city?.shopper ?? 0) > 0)) problems.push("nobody is shopping at noon");

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nrole shots ok");
