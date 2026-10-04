// What the lane graph came out as (slice E1).
//
// The model is pure, so this needs no browser: it builds a saturated city with
// the real reducer and prints what `deriveLanes` made of it. E1's gate is a
// number in the log rather than a picture, because a lane graph has no picture
// until V1 puts cars on it — and the counts are what a wrong derivation shows
// up in first (a T with two connectors instead of six, a link shorter than the
// car that has to sit on it).
//
//   node tools/lanes_dump.mjs [size]

import { saturatedCity } from "./lib/saturated.mjs";
import { createModel } from "../client/world/model.js";
import { DEFAULTS } from "../client/world/config.js";

const size = Number(process.argv[2] ?? 96);
// `node tools/<gate>.mjs <size> <terrain>` — Q64 is a question about a `hilly`
// map and there was no way to run this on one (D6).
const terrain = process.argv[3] ?? "rolling";
// The gates' shared city (`tools/lib/saturated.mjs`), without the seeded
// buildings: a lane graph is derived from roads, and E1's numbers were
// recorded on a city that had none.
const { state } = saturatedCity({ size, terrain, buildings: false });

// Two timings, because the model is rebuilt on every build action and E1 adds
// to it: the lane graph is the difference between them.
const t0 = Date.now();
for (let i = 0; i < 3; i += 1) createModel(state);
const ms = (Date.now() - t0) / 3;
const model = createModel(state);
const { deriveCorridors } = await import("../client/world/corridors.js");
const { createGround } = await import("../client/world/ground.js");
const { deriveLanes } = await import("../client/world/lanes.js");
let lanesMs = 0;
{
  const net = deriveCorridors(state, "road");
  const ground = createGround(state, net);
  const t = Date.now();
  for (let i = 0; i < 3; i += 1) deriveLanes(state, net, ground);
  lanesMs = (Date.now() - t) / 3;
}
const lanes = model.lanes;

const blocks = lanes.links.filter((l) => l.kind === "block");
const turns = lanes.links.filter((l) => l.kind === "turn");
const byTurn = {};
for (const t of turns) byTurn[t.turn] = (byTurn[t.turn] ?? 0) + 1;
const kinds = {};
for (const n of model.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;

const lengths = blocks.map((l) => l.len).sort((a, b) => a - b);
const shortest = lanes.links.reduce((a, b) => (a.len < b.len ? a : b));
const p = (q) => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * q))];

console.log(`city            ${size}×${size} ${terrain}, seed 1003, 400 ticks`);
console.log(`model built in  ${ms.toFixed(1)} ms  (lane graph ${lanesMs.toFixed(1)} ms of it)`);
console.log(`corridors       ${model.stats.corridors}`);
console.log(`nodes           ${model.stats.nodes}  (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})`);
console.log(`lanes           ${lanes.stats.lanes}`);
console.log(`links           ${lanes.stats.links}  (${blocks.length} block, ${turns.length} turn)`);
console.log(`turns           ${Object.entries(byTurn).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`signals         ${lanes.stats.signals}`);
console.log(`entries/exits   ${lanes.links.filter((l) => l.entry).length} / ${lanes.links.filter((l) => l.exit).length}`);

// How far every packed lane point is from the ground under it (R4).
//
// The number this gate exists to keep. R2 gave the lane graph the corridor's
// own profile instead of a `heightAt` per point — 80 ms of model rebuild became
// 53.7 — and mapped a lane's fraction of length onto a profile built in FORWARD
// order, so every lane with `dir === 1` read it mirrored: 1.79 m mean error,
// 2,540 points of 3,742 worse than half a metre, worst 12.44 m. Half the
// traffic in the city was posed against the wrong end of its street, and
// nothing saw it — `budget_gate` counts triangles and `walkthrough` never looks
// at a car.
// Kept as the number the per-row "over" counts use, which is what the gate now
// fails on — half a metre is a kerb and a half, and a lane point that far out is
// a car with its wheels in the pavement.
const LANE_TOLERANCE = 0.5;
const rows = new Map();
for (const link of lanes.links) {
  const key = link.kind === "block" ? `block dir ${link.dir}` : "turns";
  let row = rows.get(key);
  if (!row) { row = { n: 0, sum: 0, over: 0, worst: 0, at: undefined }; rows.set(key, row); }
  for (let i = 0; i < link.cum.length; i += 1) {
    const x = link.pts[i * 3];
    const z = link.pts[i * 3 + 2];
    const error = Math.abs(link.pts[i * 3 + 1] - model.heightAt(x, z));
    row.n += 1;
    row.sum += error;
    if (error > LANE_TOLERANCE) row.over += 1;
    if (error > row.worst) { row.worst = error; row.at = { x, z }; }
  }
}
let worstLane = 0;
for (const [key, row] of rows) {
  worstLane = Math.max(worstLane, row.worst);
  console.log(`${key.padEnd(15)} ${String(row.n).padStart(5)} points, mean ${(row.sum / row.n).toFixed(2)} m `
    + `off the ground, ${row.over} over ${LANE_TOLERANCE} m, worst ${row.worst.toFixed(2)} m`
    + `${row.at ? ` at ${row.at.x.toFixed(0)}, ${row.at.z.toFixed(0)}` : ""}`);
}
console.log(`block length    median ${p(0.5).toFixed(1)} m, p05 ${p(0.05).toFixed(1)} m, p95 ${p(0.95).toFixed(1)} m`);
console.log(`shortest link   ${shortest.len.toFixed(2)} m (${shortest.kind}${shortest.turn ? ` ${shortest.turn}` : ""})`);

// The one invariant worth failing on: a car is 4.5 m and has to fit.
//
// Re-aimed at H7 on the same evidence as A89's two: a MINIMUM over forty
// thousand links fails on one outlier, and the played fixture has them where
// the grid fixture could not. **64 of 40,310 links (0.16%) are shorter than a
// car, every one a `block`** — a street segment between two junctions the deputy
// laid two metres apart, which the perfect 20 m grid never produced. The defect
// is real and it is the lane graph's (a block shorter than a car should be part
// of its junction, not a link); it is J2 (A109), and the gate fails when it
// stops being a handful.
const CAR = 4.5;
const tooShort = blocks.filter((link) => link.len < CAR).length + turns.filter((link) => link.len < CAR).length;
const share = tooShort / Math.max(1, blocks.length + turns.length);
console.log(`links under ${CAR} m  ${tooShort} of ${blocks.length + turns.length} (${(100 * share).toFixed(2)}%) — J2`);
if (share > 0.005 || shortest.len < 1) {
  console.error(`\nFAIL  ${tooShort} links (${(100 * share).toFixed(2)}%) cannot hold a ${CAR} m car, `
    + `the shortest ${shortest.len.toFixed(2)} m`);
  process.exit(1);
}
// What a step costs with a full crowd standing in the road (R4). `placeYield`
// used to walk every block link for every point, every step.
{
  const { createTraffic } = await import("../client/life/traffic.js");
  const { NET_PRESENT } = await import("../client/constants-mirror.js");
  // A LOADED road, or the cars never spawn and the timing is of an empty
  // simulation — the shape of instrument failure this project keeps finding.
  // The engine's own commuter pass needs buildings, and this fixture
  // deliberately has none, so the load is set directly.
  for (let i = 0; i < state.tiles.road.length; i += 1) {
    if (state.tiles.road[i] & NET_PRESENT) state.tiles.traffic[i] = 200;
  }
  const traffic = createTraffic(state, model, { cap: 400 });
  for (let i = 0; i < 300; i += 1) traffic.update(1 / 30);
  const points = [];
  for (const link of blocks.slice(0, 120)) {
    const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    lanes.sample(link, link.len / 2, out);
    points.push({ x: out.x, z: out.z });
  }
  const time = (list) => {
    const t = Date.now();
    for (let i = 0; i < 120; i += 1) { traffic.yieldTo(list); traffic.update(1 / 30); }
    return (Date.now() - t) / 120;
  };
  const bare = time([]);
  const loaded = time(points);
  const cars = traffic.cars().length;
  console.log(`traffic step    ${bare.toFixed(2)} ms with no yields, `
    + `${loaded.toFixed(2)} ms with ${points.length} of them (${cars} cars)`);
  // How the LOCAL traffic flows (T1). `traffic_gate` measures the engine's
  // commuter pass, which T1 does not touch — the cars on screen are a separate
  // simulation over the lane graph, and the give-way rule changes them and
  // nothing else. This is the only number that can see it.
  traffic.yieldTo([]);
  for (let i = 0; i < 900; i += 1) traffic.update(1 / 30);
  const all = traffic.cars();
  const moving = all.filter((c) => c.v > 1).length;
  const mean = all.reduce((a, c) => a + c.v, 0) / Math.max(1, all.length);
  console.log(`traffic flow    ${all.length} cars, ${moving} moving (${(100 * moving / Math.max(1, all.length)).toFixed(0)}%), `
    + `mean ${mean.toFixed(2)} m/s of a ${DEFAULTS.road.speed} m/s limit`);

  // **The same city at two step sizes** (D7, Q76). The density control fills a
  // road at a rate per SECOND now, so the settled population is a property of
  // the load and the cap rather than of how many frames have gone by — which is
  // what makes a card from a phone comparable to a card from a 4090. Simulated
  // seconds, not calls: `update` clamps its delta, so a slower caller lives
  // through less time per call and would otherwise look like a defect.
  {
    const { createTraffic, MAX_STEP } = await import("../client/life/traffic.js");
    const settled = (dt) => {
      // Uncapped in effect, so what settles is what the ROADS want — a cap
      // that binds would hide the thing being measured behind itself.
      const t = createTraffic(state, model, { cap: 100000 });
      const per = Math.min(dt, MAX_STEP);
      for (let elapsed = 0; elapsed < 140; elapsed += per) t.update(dt);
      return t.cars().length;
    };
    const fast = settled(1 / 60);
    const slow = settled(MAX_STEP);
    const spread = Math.abs(fast - slow) / Math.max(1, Math.max(fast, slow));
    console.log(`settled cars    ${fast} at 60 fps, ${slow} at 15 fps `
      + `(${(spread * 100).toFixed(0)}% apart, 140 s simulated)`);
    if (spread > 0.1) {
      console.error(`\nFAIL  the settled traffic depends on the frame rate (${(spread * 100).toFixed(0)}%)`);
      process.exit(1);
    }

    // **The hour on the road** (B4). The same city at the three presets the
    // player can pick. The ratios are the item's gate — night is the day's
    // 0.4 — and the absolute numbers are what the budget has to carry.
    const { phaseForPreset } = await import("../client/world/rush.js");
    const atHour = (name) => {
      const t = createTraffic(state, model, { cap: 100000 });
      t.setPhase(phaseForPreset(name));
      // At the longest step the traffic takes: the row above shows the settled
      // count does not depend on it (0% apart), and three runs at 1/30 were
      // 28 s of a render set left with 21 s of headroom after B8 and S2.
      for (let elapsed = 0; elapsed < 140; elapsed += MAX_STEP) t.update(MAX_STEP);
      return t.cars().length;
    };
    const hours = { morning: atHour("morning"), sunset: atHour("sunset"), night: atHour("night") };
    console.log(`cars by hour    ${Object.entries(hours)
      .map(([k, v]) => `${k} ${v}`).join(", ")} `
      + `(night/morning ${(hours.night / Math.max(1, hours.morning)).toFixed(2)})`);
    if (!(hours.night < hours.sunset && hours.sunset < hours.morning)) {
      console.error("\nFAIL  the hour does not order the traffic");
      process.exit(1);
    }

    // **Cars through each other inside a junction.** Printed from B4, a GATE
    // from B8 (A74: "cars have to stop and not drive through"): it predated B4
    // (seven pairs on the 64-tile played city), and `test/cars.test.js`'s
    // original overlap invariant is per LINK, so two turn links crossing one
    // box were invisible to it.
    {
      const t = createTraffic(state, model, { cap: 100000 });
      t.setPhase(phaseForPreset("morning"));
      for (let elapsed = 0; elapsed < 120; elapsed += 1 / 30) t.update(1 / 30);
      const cars = t.cars();
      const { footprintsOverlap } = await import("../client/life/traffic.js");
      const at = cars.map((c) => ({ ...t.footprintOf(c), c }));
      const grid = new Map();
      for (const p of at) {
        const k = `${Math.floor(p.x / 4)},${Math.floor(p.z / 4)}`;
        if (grid.has(k)) grid.get(k).push(p);
        else grid.set(k, [p]);
      }
      let pairs = 0;
      let inJunction = 0;
      for (const p of at) {
        const gx = Math.floor(p.x / 4);
        const gz = Math.floor(p.z / 4);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            for (const q of grid.get(`${gx + dx},${gz + dz}`) ?? []) {
              if (q.c.id <= p.c.id || !footprintsOverlap(p, q)) continue;
              pairs += 1;
              if (lanes.links[p.c.link].kind === "turn" && lanes.links[q.c.link].kind === "turn") inJunction += 1;
            }
          }
        }
      }
      const stopped = cars.filter((c) => c.v < 0.5).length;
      console.log(`overlaps        ${pairs} pairs of cars whose bodies overlap (${inJunction} both in a junction) `
        + `of ${cars.length}, ${Math.round(100 * stopped / Math.max(1, cars.length))}% stopped, morning, 120 s`);
      if (inJunction > 0) {
        console.error(`\nFAIL  ${inJunction} pair(s) of cars inside a junction box together (B8)`);
        process.exit(1);
      }
    }
  }
  if (cars === 0) {
    console.error("\nFAIL  the step was timed on an empty road");
    process.exit(1);
  }
}

// Re-aimed at H7, on the same evidence as A89's two and Q106's: the defect this
// caught was 2,540 points of 3,742 worse than half a metre — a HALF of the
// graph, which no threshold shape could miss. The played fixture has junctions
// between streets at different heights, where a turn's interpolation leaves a
// point up to 0.38 m out: **one point of 36,414**, and none over half a metre.
// A maximum over a sample that grew by ten times is not a measurement (A89), so
// the gate fails on how MANY are out, and still prints the worst.
//
// **Settled at P99 (A110): left alone.** The honest fix is for a turn to read the
// GROUND at its own points rather than interpolating two profiles, and that is
// precisely what R2 removed to take the model rebuild from 80 ms to 53.7. One
// point in thirty-six thousand, none over half a metre, is not worth
// twenty-six milliseconds a rebuild — and if it ever stops being a handful, the
// count below is what will say so.
const offGround = [...rows.values()].reduce((n, row) => n + row.over, 0);
const lanePoints = [...rows.values()].reduce((n, row) => n + row.n, 0);
console.log(`lane points out  ${offGround} of ${lanePoints} over ${LANE_TOLERANCE} m, worst ${worstLane.toFixed(2)} m (A110: accepted)`);
if (offGround > lanePoints / 1000 || worstLane > 1) {
  console.error(`\nFAIL  ${offGround} lane points of ${lanePoints} are off the ground they are drawn on, `
    + `the worst by ${worstLane.toFixed(2)} m`);
  process.exit(1);
}

// Who is walking where, by hour (B5). On a PLAYED city — the saturated one is
// 1,129 copies of one house (Q72), so it has nobody to shop at — the deputy's
// 64×64 after twenty years, the crowd settled for a minute at four hours of the
// day, counted by role.
{
  const { generateWorld } = await import("../engine/worldgen.js");
  const { defaultOptions } = await import("../engine/options.js");
  const { apply } = await import("../engine/reducer.js");
  const { makeDeputy, deputyTurn } = await import("../engine/deputy.js");
  const { CMD_JOIN, CMD_TICK } = await import("../engine/commands.js");
  const { TICKS_PER_YEAR } = await import("../engine/constants.js");
  for (const m of ["build-commands", "development", "utilities", "economy", "civic", "fire", "disasters", "traffic", "history"]) {
    await import(`../engine/${m}.js`);
  }
  const world = generateWorld(defaultOptions({ seed: 1003, width: 64, height: 64, seats: 1, waterStyle: "river" }));
  const town = world.state;
  apply(town, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= 20 * TICKS_PER_YEAR; tick += 1) {
    apply(town, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(town, deputy);
  }
  const { deriveNav } = await import("../client/world/nav.js");
  const { createPedestrians, ROLES } = await import("../client/life/pedestrians.js");
  const townModel = createModel(town);
  // The same played city, kept for the services block below.
  globalThis.__townForServices = town;
  const townNav = deriveNav(town, townModel);
  const shops = town.buildings.filter((b) => b.zone === 2).length;
  console.log(`\nroles by hour   deputy 64x64, 20 years: ${town.buildings.length} buildings, ${shops} shops, cap 600, 60 s settled`);
  let noonShoppers = 0;
  for (const [name, at] of [["morning", 0.10], ["noon", 0.28], ["evening", 0.46], ["night", 0.76]]) {
    const crowd = createPedestrians(town, townModel, townNav, { cap: 600, spread: true, phase: at });
    for (let t = 0; t < 60; t += 1 / 15) crowd.update(1 / 15);
    const roles = crowd.roles();
    const total = Math.max(1, Object.values(roles).reduce((a, b) => a + b, 0));
    if (name === "noon") noonShoppers = roles.shopper;
    console.log(`  ${name.padEnd(8)} ${ROLES.map((r) => `${r} ${String(roles[r]).padStart(3)} (${String(Math.round(100 * roles[r] / total)).padStart(2)}%)`).join("  ")}  arrived ${crowd.arrived}`);
  }
  if (shops > 0 && noonShoppers === 0) {
    console.error("\nFAIL  a town with shops has no shoppers at noon (B5)");
    process.exit(1);
  }
}

const orphans = lanes.links.filter((l) => !l.exit && l.next.length === 0);
if (orphans.length > 0) {
  console.error(`\nFAIL  ${orphans.length} link(s) lead nowhere and are not exits`);
  process.exit(1);
}
// --- the vehicles with an errand (B3b) ---------------------------------------
//
// On the deputy's own city, with a fire lit: how many engines turn out, how
// many patrols are on a beat, and what share of the traffic is a van. A count
// of zero here means a fleet nobody can see, which is the shape every defect in
// this lane has had.
{
  const { createServices } = await import("../client/life/services.js");
  const { createTraffic } = await import("../client/life/traffic.js");
  const { BODY_NAMES } = await import("../client/world/vehicle-spec.js");
  const { igniteAt } = await import("../engine/fire.js");
  const townForServices = globalThis.__townForServices;
  const stations = townForServices.buildings.filter((b) => b.def === "fireStation").length;
  const police = townForServices.buildings.filter((b) => b.def === "policeStation").length;
  // A fire, in the middle of the town rather than wherever the roll lands: the
  // question is whether an engine answers one, not whether one starts.
  const middle = [...townForServices.buildings]
    .filter((b) => b.zone !== 0)
    .sort((a, b) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(b.x - 32, b.y - 32))[0];
  if (middle) igniteAt(townForServices, middle.y * townForServices.width + middle.x);
  const servicesModel = createModel(townForServices);
  const fleet = createServices(townForServices, servicesModel, { life: true });
  for (let t = 0; t < 120; t += 1) fleet.update(0.25);
  const st = fleet.stats();
  const traffic = createTraffic(townForServices, servicesModel, { life: true, cap: 600 });
  for (let t = 0; t < 400; t += 1) traffic.update(0.25);
  const cars = traffic.cars();
  const van = BODY_NAMES.indexOf("van");
  const vans = cars.filter((c) => c.variant === van).length;
  console.log(`\nservices        deputy 64x64: ${stations} fire station(s), ${police} police station(s), `
    + `1 fire lit at ${middle ? `${middle.x},${middle.y}` : "nowhere"}`);
  console.log(`                ${st.engines} engine(s) out, ${st.atTheFire} at the fire, ${st.patrols} patrol(s) on a beat`);
  console.log(`                ${vans} of ${cars.length} cars are vans (${Math.round(100 * vans / Math.max(1, cars.length))}%)`);
  if (stations > 0 && st.engines === 0) console.error("FAIL — a fire is burning and no engine turned out");
  if (police > 0 && st.patrols === 0) console.error("FAIL — a police station with no patrol");
}

// --- life survives a build (B11, on W6a's stable keys) -----------------------
//
// Settle the traffic and the crowd on the deputy's town, lay ONE road tile,
// re-derive the model the way `worldChanged` does, and count how many came
// across. Before this slice the answer was zero, every time, for every car and
// every person in the city — and the gate could not say so, because nothing had
// ever counted it.
//
// **Two builds, because they are not the same build.** A tile on the END of a
// street extends one corridor; a tile beside the MIDDLE of one puts a junction
// there and splits it into two, and a corridor IS its extent, so no key can
// survive that — the people and cars on it are re-seated. One configuration
// would have proved one configuration, and it would have been the easy one.
{
  const { createTraffic } = await import("../client/life/traffic.js");
  const { createPedestrians } = await import("../client/life/pedestrians.js");
  const { deriveNav } = await import("../client/world/nav.js");
  const { NET_PRESENT } = await import("../client/constants-mirror.js");
  const { adjacencyMask } = await import("../shared/grid.js");

  // The deputy's town, not this gate's own city: `state` is paved roads with
  // `buildings: false` — a lane graph is derived from roads — so it has no
  // doors, and the first cut of this check reported "0 of 0 people kept their
  // pavement" and passed by dividing zero by zero.
  const town = globalThis.__townForServices;
  const remask = (tiles) => {
    for (let i = 0; i < tiles.length; i += 1) {
      if ((tiles[i] & NET_PRESENT) === 0) continue;
      const x = i % town.width;
      const y = (i - x) / town.width;
      tiles[i] = (tiles[i] & ~15) | adjacencyMask(town.width, town.height, x, y,
        (j) => (tiles[j] & NET_PRESENT) !== 0);
    }
  };
  const degreeOf = (road, i) => {
    let n = 0;
    const mask = road[i] & 15;
    for (let d = 0; d < 4; d += 1) if (mask & (1 << d)) n += 1;
    return n;
  };
  /**
   * An empty tile touching exactly one road tile of this degree — an extension
   * when that neighbour is an end, a new junction when it is not.
   *
   * `occupied` is the set of tiles something is standing on, and for the split
   * it is REQUIRED: the first cut of this check split a street nobody was on
   * and reported "0.0% re-seated", which is a failure counter with no subject
   * behind it. A split that touches nobody proves nothing about carrying life
   * across a split.
   */
  const siteNextTo = (road, wantedDegree, occupied) => {
    for (let i = town.width + 1; i < road.length - town.width - 1; i += 1) {
      if ((road[i] & NET_PRESENT) !== 0) continue;
      const x = i % town.width;
      const y = (i - x) / town.width;
      if (x < 1 || y < 1 || x >= town.width - 1 || y >= town.height - 1) continue;
      const neighbours = [i - 1, i + 1, i - town.width, i + town.width]
        .filter((j) => (road[j] & NET_PRESENT) !== 0);
      if (neighbours.length !== 1) continue;
      if (degreeOf(road, neighbours[0]) !== wantedDegree) continue;
      if (occupied && !occupied.has(neighbours[0])) continue;
      return i;
    }
    return -1;
  };

  const base = town.tiles.road.slice();
  let worst = 0;
  for (const [what, wantedDegree] of [["extends a street", 1], ["splits a street", 2]]) {
    town.tiles.road.set(base);
    const before = createModel(town);
    const navBefore = deriveNav(town, before);
    const traffic = createTraffic(town, before, { life: true, cap: 600 });
    for (let t = 0; t < 400; t += 1) traffic.update(0.25);
    const crowd = createPedestrians(town, before, navBefore, { life: true, cap: 400, spread: true });
    for (let t = 0; t < 600; t += 1) crowd.update(1 / 30);
    const cars = traffic.snapshot();
    const people = crowd.snapshot();

    const tileOf = (p) => Math.floor(p.z / before.tileM) * town.width + Math.floor(p.x / before.tileM);
    const occupied = new Set([...cars.map(tileOf), ...people.map(tileOf)]);
    const site = siteNextTo(town.tiles.road, wantedDegree, wantedDegree === 2 ? occupied : undefined);
    if (site < 0) {
      console.error(`FAIL — nowhere to lay a tile that ${what}, so this check proves nothing`);
      process.exit(1);
    }
    town.tiles.road[site] = NET_PRESENT;
    remask(town.tiles.road);

    const after = createModel(town);
    const navAfter = deriveNav(town, after);
    const carriedCars = new Map(createTraffic(town, after, { life: true, cap: 600, carry: cars })
      .snapshot().map((car) => [car.id, car]));
    const carriedPeople = new Map(createPedestrians(town, after, navAfter, {
      life: true, cap: 400, spread: true, carry: people,
    }).snapshot().map((person) => [person.id, person]));
    // **The subject, beside the failures.** `renamed` is how many were standing
    // on something whose key the build destroyed — the only ones the geometric
    // re-seat has to answer for — and `moved` is how far the furthest of them
    // went. A junction box is a few metres wide, so a car standing where one
    // appears has to come out of it; anything beyond that is a teleport.
    const renamedCars = cars.filter((car) => after.lanes.linkByKey(car.key) === undefined);
    const renamedPeople = people.filter((p) => navAfter.edgeByKey(p.key) === undefined);
    const movedBy = (was, now) => (now ? Math.hypot(now.x - was.x, now.z - was.z) : -1);
    const carMoves = cars.map((car) => movedBy(car, carriedCars.get(car.id)));
    const pedMoves = people.map((p) => movedBy(p, carriedPeople.get(p.id)));
    const worstMove = Math.max(0, ...carMoves, ...pedMoves);
    const lostCars = carMoves.filter((d) => d < 0).length;
    const lostPeople = pedMoves.filter((d) => d < 0).length;
    const carShare = cars.length > 0 ? lostCars / cars.length : 1;
    const pedShare = people.length > 0 ? lostPeople / people.length : 1;
    worst = Math.max(worst, carShare, pedShare);

    console.log(`\nlife over a build  one tile at ${site % town.width},${(site - (site % town.width)) / town.width} — ${what}`);
    console.log(`                ${cars.length - lostCars} of ${cars.length} cars and `
      + `${people.length - lostPeople} of ${people.length} people came across, `
      + `corridors ${before.corridors.length} → ${after.corridors.length}`);
    console.log(`                ${renamedCars.length} car(s) and ${renamedPeople.length} person(s) `
      + `lost the key they were standing on and were re-seated by geometry; furthest move ${worstMove.toFixed(1)} m`);

    if (cars.length < 20 || people.length < 20) {
      console.error(`FAIL — only ${cars.length} cars and ${people.length} people settled, so this proves nothing`);
      process.exit(1);
    }
    if (wantedDegree === 2 && renamedCars.length + renamedPeople.length === 0) {
      console.error("FAIL — the split touched nobody, so it says nothing about carrying life across one");
      process.exit(1);
    }
    if (worstMove > 6) {
      console.error(`FAIL — something was re-seated ${worstMove.toFixed(1)} m from where it stood`);
      process.exit(1);
    }
  }
  // D7's invariant, held across both builds: the settled count before and after
  // a one-tile build is the same within 2% (B11).
  if (worst > 0.02) {
    console.error(`FAIL — a one-tile build re-seated ${(worst * 100).toFixed(1)}% of the city's life (B11 allows 2%)`);
    process.exit(1);
  }
  town.tiles.road.set(base);
}

console.log("\nlanes dump ok");
