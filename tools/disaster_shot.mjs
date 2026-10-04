// The damage shots (slice B1b).
//
// A building on fire and the ground it leaves, at the two zooms a player uses.
// Both states are set the way `engine/fire.js` sets them — the TILE flags,
// through the harness's `damage=` — because a building record's `flags` field
// has never carried them, which is the defect this slice was written around.
//
// COUNTED before it is called damage: a shot of a city that happens to look
// normal is what "restrained" looks like when nothing drew at all (E5's lesson,
// and S6's smoke, which has never once appeared).
//
//   reports/smoke-B1-burning.png   three buildings alight, from the air
//   reports/smoke-B1-ruin.png      what the fire left, from the air
//   reports/smoke-B1-street.png    both, from the pavement
//
//     node tools/disaster_shot.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

const COUNT = `(state, view) => {
  const pools = view.pools ?? {};
  const n = (k) => pools[k]?.count ?? 0;
  const damage = globalThis.SHOT_DAMAGE ?? {};
  // Smoke NEAR THE FIRE, not smoke in the scene: the power plants smoke too
  // (S6), and the ruin shot — with nothing alight — came back with twelve puffs
  // from two chimneys. Read out of the instance matrices, which is where the
  // puffs actually are.
  //
  // BOTH pools since A114: a building on fire pushes into the fireSmoke pool,
  // whose shader carries the denser column, and a chimney still pushes into the
  // smoke pool. Reading only the old one reports a fire with no smoke in it.
  let fireSmoke = 0;
  for (const mesh of [pools.fireSmoke, pools.smoke]) {
    if (!mesh || !damage.fire) continue;
    const m = new Float32Array(16);
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.instanceMatrix.array && m.set(mesh.instanceMatrix.array.subarray(i * 16, i * 16 + 16));
      const px = m[12];
      const pz = m[14];
      if (Math.hypot(px - (damage.fire.x + 0.5), pz - (damage.fire.y + 0.5)) < 4) fireSmoke += 1;
    }
  }
  return {
    ...damage,
    fireSmoke,
    smoke: n("smoke") + n("fireSmoke"), ruinWall: n("ruinWall"), rubble: n("rubble"), burntGround: n("ruin"),
    streets: view.stats?.streets?.live ?? 0,
    // A baked chunk builds its own ruin and the instanced pools go quiet on it,
    // so the two counts are one measurement: walls drawn EITHER way.
    baked: view.stats?.streets?.ruins ?? 0,
  };
}`;

// Each mode damages its own buildings, so each mode gets its own probe. Aimed
// at the spot a DIFFERENT run chose, the first cut of this tool photographed
// three perfectly good cities with the damage behind the camera — and the pool
// counts, which are the whole scene and not the frame, said everything was fine.
async function where(damage, prefer = "at") {
  const r = await shoot({ out: `reports/.damage-probe-${damage}.png`, seed: SEED, years: YEARS,
    size: SIZE, width: 320, height: 240, extra: { __ask: COUNT, damage } });
  const at = r.answer?.[prefer] ?? r.answer?.at;
  if (!at) throw new Error(`no building in the middle of the town to ${damage}`);
  console.log(`${damage}: ${r.answer.burning} alight, ${r.answer.ruined} burnt out, at ${at.x},${at.y}`);
  return at;
}

const problems = [];
async function frame(out, opts, want) {
  // `...opts` BEFORE `extra`, or the shot's own options replace the whole extra
  // object and take `__ask` with them — which is how the first run of this tool
  // reported every count as `undefined` and blamed the renderer for it.
  const at = await where(opts.extra?.damage ?? "both", opts.aim ?? "at");
  // WITH the life on, unlike almost every other shot in the project: a smoke
  // column at rest is six puffs stacked at the chimney, and this slice is about
  // whether a fire reads. The counts do not depend on it; the picture does.
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    fx: at.x + 0.5, fy: at.y + 0.5, width: 1280, height: 720, streets: 60, frames: 60, life: true,
    ...opts, extra: { __ask: COUNT, ...(opts.extra ?? {}) } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} smoke=${a.smoke} (over the fire ${a.fireSmoke}) `
    + `walls=${a.ruinWall} rubble=${a.rubble} `
    + `burnt ground=${a.burntGround} baked ruins=${a.baked} streets=${a.streets}`);
  a.standing = (a.ruinWall ?? 0) + (a.baked ?? 0);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  for (const [key, min] of Object.entries(want)) {
    if ((a[key] ?? 0) < min) problems.push(`${out}: ${key} is ${a[key] ?? 0}, wanted ${min} or more`);
  }
}

// A burning building smokes. It never has: `instances.js` tested a field the
// engine does not write, so this count was zero in every shot ever taken.
await frame("reports/smoke-B1-burning.png",
  { mode: "city", span: 6, pitch: 26, aim: "fire", extra: { damage: "burn" } },
  { fireSmoke: 6 });
// A ruin is walls and rubble on burnt ground, not one grey slab a tile.
await frame("reports/smoke-B1-ruin.png",
  { mode: "city", span: 5, pitch: 24, aim: "ruin", extra: { damage: "ruin" } },
  { standing: 1, burntGround: 1 });
// And at the zoom where a ruin used to be nothing at all.
await frame("reports/smoke-B1-street.png",
  { mode: "city", span: 5, pitch: 18, aim: "fire", extra: { damage: "both" } },
  { fireSmoke: 6, standing: 1 });

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\ndamage shots ok");
