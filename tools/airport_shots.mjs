// The airport's pictures (slice T5b).
//
// Three frames, and each one COUNTS what it photographed — the rule every
// picture gate in this project earned the hard way: a tool that says "ok" after
// photographing an empty field is worse than no tool.
//
//   reports/smoke-T5-cityhall.png  the hall, from the street
//   reports/smoke-T5-airport.png   the airfield from the air: runway, markings,
//                                  apron, tower
//   reports/smoke-T5-plane.png     an aircraft on the ground, wound to a phase
//                                  rather than waited for
//
// The rank is a LEVER on the harness (`rank=`, T5a): `unlock` is a rule in the
// reducer now, so at rank 0 the harness is refused and the picture is of an
// empty road. And the ground is FLAT, because `airport.maxDrop` refuses a
// sloped footprint and on rolling terrain about one 6x4 site in ten qualifies.
//
//     node tools/airport_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 48;
const YEARS = 20;
const problems = [];

/** A flat site for a 6x4, clear of what the deputy built, with its road. */
const FIND = `(state) => {
  const W = state.width;
  const H = state.height;
  const clear = (x, y, w, h) => {
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) {
      const i = (y + dy) * W + x + dx;
      const t = state.tiles.terrain[i];
      if (!(t === 0 || t === 1 || t === 2 || t === 6)) return false;
      if (state.tiles.buildingId[i] !== 0) return false;
      if ((state.tiles.road[i] & 16) !== 0) return false;
      if (state.tiles.zone[i] !== 0) return false;
    }
    return true;
  };
  // Beside a road, so the gate is LIVE and the terminal has a way in — and
  // near the middle, so the camera has city around it rather than a corner.
  let best;
  for (let y = 3; y < H - 7; y += 1) {
    for (let x = 3; x < W - 9; x += 1) {
      if (!clear(x, y, 6, 4)) continue;
      let road = false;
      for (let dx = -1; dx <= 6; dx += 1) {
        for (const dy of [-1, 4]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if ((state.tiles.road[ny * W + nx] & 16) !== 0) road = true;
        }
      }
      // FLAT ENOUGH, which is a rule the reducer keeps: airport.maxDrop is
      // six elevation units across the whole footprint, and even a flat map
      // has windows of eight. A probe that skips this picks a site the command
      // is refused on, and the picture is of an empty field with an invalid
      // in the log beside it.
      let lo = 255;
      let hi = 0;
      for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 6; dx += 1) {
        const e = state.tiles.elevation[(y + dy) * W + x + dx];
        if (e < lo) lo = e;
        if (e > hi) hi = e;
      }
      if (hi - lo > 6) continue;
      // Beside a road for preference, not as a requirement: after twenty years
      // the town has covered every roadside 6x4 it has, and a dead gate still
      // draws its asphalt. The log says which was found.
      const d = Math.abs(x + 3 - W / 2) + Math.abs(y + 2 - H / 2) - (road ? 1000 : 0);
      if (!best || d < best.d) best = { x, y, d, road };
    }
  }
  const hall = (() => {
    let pick;
    for (let y = 3; y < H - 4; y += 1) for (let x = 3; x < W - 4; x += 1) {
      if (!clear(x, y, 3, 3)) continue;
      let road = false;
      for (let dx = -1; dx <= 3; dx += 1) {
        if (y > 0 && (state.tiles.road[(y - 1) * W + x + dx] & 16) !== 0) road = true;
      }
      const d = Math.abs(x + 1 - W / 2) + Math.abs(y + 1 - H / 2) - (road ? 1000 : 0);
      if (!pick || d < pick.d) pick = { x, y, d, road };
    }
    return pick;
  })();
  return { airport: best ? [best.x, best.y] : undefined, road: best ? best.road : false,
    hall: hall ? [hall.x, hall.y] : undefined, hallRoad: hall ? hall.road : false };
}`;

/** What the frame actually drew. */
const COUNT = `(state, view) => ({
  planes: view.stats?.planes ?? {},
  posed: view.pools?.plane?.count ?? -1,
  radars: view.pools?.radar?.count ?? -1,
  lamps: view.stats?.lampsHeld ?? -1,
  streets: view.stats?.streets?.live ?? 0,
  triangles: view.stats?.triangles ?? 0,
  placed: (globalThis.SHOT_PLACED ?? []).map((p) => p.def + ":" + p.result).join(" "),
})`;

const probe = await shoot({ out: "reports/.airport-probe.png", seed: SEED, years: YEARS, size: SIZE,
  terrain: "flat", width: 320, height: 240, extra: { __ask: FIND, rank: 3 } });
const at = probe.answer;
if (!at?.airport) throw new Error(`no flat 6x4 beside a road in seed ${SEED} after ${YEARS} years`);
console.log(`airport at ${at.airport} (${at.road ? "beside a road" : "no road — a dead gate, still drawn"}), `
  + `city hall at ${at.hall ?? "nowhere"}`);

// --- the hall, from the street ----------------------------------------------
if (at.hall) {
  const out = "reports/smoke-T5-cityhall.png";
  // From the street when the site has one to stand on, and from just above it
  // when it has not: after twenty years the town has covered every roadside
  // 3x3 it has, and `street:` throws rather than drawing a field.
  const framing = at.hallRoad
    ? { street: `${at.hall[0] + 1},${at.hall[1] - 2}`, yaw: 2, pitch: 6 }
    : { mode: "city", span: 5, pitch: 24, yaw: 0.4, fx: at.hall[0] + 1, fy: at.hall[1] + 1 };
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, terrain: "flat", tier: "high",
    streets: 60, frames: 60, width: 1280, height: 720, ...framing,
    extra: { __ask: COUNT, rank: 3, placeAt: `cityHall@${at.hall[0]},${at.hall[1]}`, age: 400 } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.placed ?? "").includes("cityHall:ok")) {
    problems.push(`${out}: the hall was not built — ${r.answer?.placed || "nothing placed"}`);
  }
} else {
  problems.push("no site for a city hall, so its picture was never taken");
}

// --- the airfield, from the air ---------------------------------------------
{
  const out = "reports/smoke-T5-airport.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, terrain: "flat", tier: "high",
    streets: 60, frames: 120, life: true, mode: "city", span: 9, pitch: 42, yaw: 0.35,
    fx: at.airport[0] + 3, fy: at.airport[1] + 2, width: 1280, height: 720,
    extra: { __ask: COUNT, rank: 3, placeAt: `airport@${at.airport[0]},${at.airport[1]}`, age: 400,
      plane: 30 } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.placed ?? "").includes("airport:ok")) {
    problems.push(`${out}: the airport was not built — ${r.answer?.placed || "nothing placed"}`);
  }
  if (!(r.answer?.planes?.planes > 0)) problems.push(`${out}: the airport has no aircraft`);
  if (!(r.answer?.radars > 0)) problems.push(`${out}: the tower has no radar posed`);
  // The airfield is BAKED into its chunk, so the only way to see it from here
  // is that the chunk was baked at all. A frame with no live street chunk is a
  // frame with no asphalt, whatever the pools say.
  if (!(r.answer?.streets > 0)) problems.push(`${out}: no street chunk was live, so nothing was baked`);
}

// --- the aircraft, wound to the ground --------------------------------------
{
  const out = "reports/smoke-T5-plane.png";
  // Thirty-two seconds into a fifty-six second cycle is the stand, which is the
  // frame a person wants: an aircraft ON the apron, beside its terminal, rather
  // than a dot on final approach.
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, terrain: "flat", tier: "high",
    streets: 60, frames: 90, life: true, mode: "city", span: 8, pitch: 26, yaw: 0.6, time: "night",
    fx: at.airport[0] + 3, fy: at.airport[1] + 2, width: 1280, height: 720,
    extra: { __ask: COUNT, rank: 3, placeAt: `airport@${at.airport[0]},${at.airport[1]}`, age: 400,
      plane: 32 } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.posed > 0)) {
    problems.push(`${out}: an aircraft exists and NONE was posed — ${JSON.stringify(r.answer?.planes)}`);
  }
  const phase = r.answer?.planes?.phases?.[0];
  if (!["roll", "taxi", "stand", "takeoff"].includes(phase)) {
    problems.push(`${out}: the aircraft is ${phase}, which is not a picture of an airport`);
  }
  // At night, which is what the apron lights are for. They go into the chunk's
  // own lamp list beside the street lamps, so what this can see is that the
  // chunk holding the airfield was baked and carries lamps at all — the lights
  // themselves are in the picture a person opens.
  if (!(r.answer?.lamps > 0)) problems.push(`${out}: the baked chunks carry no lamps at night`);
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nairport shots ok");
