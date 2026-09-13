// The foliage shots (slice S5).
//
// Three pictures the item asks for, each AIMED at its subject and each checked
// for the thing it is of before anyone calls it a picture of it
// (aim-a-shot-at-the-subject):
//
//   reports/smoke-S5-park.png          a park: benches, a pond, a ring of trees
//   reports/smoke-S5-garden.png        deep house lots: beds, sheds, an orchard
//   reports/smoke-S5-street-trees.png  a shopping street's trees in their pits
//
// The park is placed through the reducer on a YOUNG city (after twenty years
// the harness's row is built on and a placement comes back `needsBulldoze`),
// backdated so it is standing; the gardens and the shops are a played city's.
//
//     node tools/foliage_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;

const COUNT = `(state, view) => {
  const pools = view.pools ?? {};
  const n = (k) => pools[k]?.count ?? 0;
  const tree = (v) => Object.keys(pools).filter((k) => k.startsWith("tree" + v + "_")).reduce((a, k) => a + n(k), 0);
  return { bench: n("bench"), pond: n("pond"), shed: n("shed"), bed: n("bed"),
    willow: tree(3), street: tree(4), orchard: tree(5), wild: tree(0) + tree(1) + tree(2),
    px: view.stats.tilePixels, lod: view.stats.lod };
}`;
// The subject nearest the middle of the map, with the side its street is on
// (0 north, 1 east, 2 south, 3 west — the frontage, and the yaw in quarter
// turns that faces it), the road tile in front of it and its back tile.
const find = (pick, deep = false) => `(state) => {
  const W = state.width;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height && (state.tiles.road[y * W + x] & 16) !== 0;
  // Nearest the middle — or, for the gardens, the one with the most small
  // standing houses round it: a street of them, not a lone house among sites.
  const picked = state.buildings.filter((b) => (${pick})(b));
  const near = (b) => picked.filter((o) => Math.abs(o.x - b.x) <= 3 && Math.abs(o.y - b.y) <= 3).length;
  const list = picked.sort((a, c) => (${deep} ? near(c) - near(a) : 0)
    || Math.hypot(a.x - 32, a.y - 32) - Math.hypot(c.x - 32, c.y - 32));
  for (const b of list) {
    const sides = [[b.x, b.y - 1], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x - 1, b.y]];
    const f = sides.findIndex(([x, y]) => road(x, y));
    if (f < 0) continue;
    // Deep AWAY from its street, when the shot needs a back garden: a lot two
    // tiles long along the street is still one deep, and its back tile is the
    // house.
    if (${deep} && (f % 2 === 0 ? b.h : b.w) < 2) continue;
    const back = [[b.x, b.y + b.h - 1], [b.x, b.y], [b.x, b.y], [b.x + b.w - 1, b.y]][f];
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, frontage: f, road: sides[f], back };
  }
  return undefined;
}`;

const problems = [];
// City mode comes no nearer than span 8 (the controller's MIN_SPAN) — the
// closest a player sees a park from above, so that is where it is shot, at a
// bigger screen. Street mode is closer, but the walker is kept on the pavement — asked to stand in a
// back garden it stands on the nearest pavement — and from a pavement a one-
// tile park is a lawn edge and a back garden is the back of a house. Those two
// are looked at from ABOVE, steep, at the nearest city zoom. Close up a chunk is also BAKED and its trees are in the
// street group, not the pools — a pool count there reads zero with the trees
// in the picture. So the subject is COUNTED at city zoom, where every chunk is
// instanced, and LOOKED AT from the street.
const look = async (name, years, extra, pick, stand, want, deep = false) => {
  const probe = await shoot({ out: "reports/.foliage-probe.png", seed: SEED, years, size: SIZE,
    width: 320, height: 240, extra: { ...extra, __ask: find(pick, deep) } });
  const at = probe.answer;
  if (!at) { problems.push(`nothing to aim the ${name} shot at: ${probe.report?.placed ?? ""}`); return; }
  const counted = await shoot({ out: "reports/.foliage-count.png", seed: SEED, years, size: SIZE, tier: "high",
    mode: "city", span: 14, pitch: 34, yaw: 0.6, fx: at.x, fy: at.y, width: 1280, height: 720,
    life: false, frames: 30, extra: { ...extra, __ask: COUNT } });
  const out = `reports/smoke-S5-${name}.png`;
  const camera = stand(at);
  const r = await shoot({ out, seed: SEED, years, size: SIZE, tier: "high", streets: 40, frames: 40,
    width: 1280, height: 720, extra, ...camera });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok}\n  counted at span 14: ${JSON.stringify(counted.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  for (const k of want) if (!(counted.answer?.[k] > 0)) problems.push(`no ${k} drawn round the ${name} shot`);
};

// A standing building: after half a year a site is a building (B2).
const standing = "state.tick - b.builtTick > 72";
const above = (at) => ({ mode: "city", span: 8, pitch: 50, yaw: 0.6, fx: at.x, fy: at.y, width: 1920, height: 1080 });
const onRoad = (at, yaw, pitch) => ({ street: `${at.road[0]},${at.road[1]}`, yaw, pitch });
await look("park", 2, { place: "park", age: 400 }, `(b) => b.def === "park"`, above, ["bench", "pond", "wild"]);
// Steeper: at 50° the back gardens are behind the roofs.
await look("garden", 20, {}, `(b) => b.zone === 1 && (b.level ?? 0) <= 2 && ${standing}`,
  (at) => ({ ...above(at), pitch: 72 }), ["bed", "shed"], true);
// In front of a shop, looking along its street: the trees in their pits.
await look("street-trees", 20, {}, `(b) => b.zone === 2 && ${standing}`,
  (at) => onRoad(at, (at.frontage + 1) % 4, 8), ["street"]);

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nfoliage shots ok");
