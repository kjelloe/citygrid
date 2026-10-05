// The harbour shots (slice T4b).
//
// A marina with boats at it, a ferry on its way out of the region, and a
// freight port with a ship — in a city the deputy built itself, except the
// port, which the deputy has no doctrine for and which is placed on a shore
// this seed chose.
//
// Each one COUNTS what it photographed. The boats are the reason: a moving
// thing photographed once is a still thing, and a frame with no hull in the
// pool looks exactly like a frame taken before they arrived.
//
//   reports/smoke-T4-marina.png   the moorings, from the water side
//   reports/smoke-T4-ferry.png    the ferry on its route, with its wake
//   reports/smoke-T4-port.png     the freight port and its ship
//
//     node tools/harbour_shots.mjs

import { shoot } from "./screenshot.mjs";
import { setConfig, DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createBoats } from "../client/life/boats.js";
import { playedCity, standBack, describe, clearanceAt } from "./lib/aim.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 30;

// The deputy's own marina and terminal, and a shore for a port: a land tile
// with water beside it, well away from both, on the biggest body there is.
const FIND = `(state) => {
  const W = state.width;
  const H = state.height;
  const wet = (x, y) => x >= 0 && y >= 0 && x < W && y < H
    && (state.tiles.terrain[y * W + x] === 3 || state.tiles.terrain[y * W + x] === 4);
  const marina = state.buildings.find((b) => b.def === "marina");
  const ferry = state.buildings.find((b) => b.def === "ferryTerminal");
  if (!marina || !ferry) return undefined;

  // The MARINA'S OWN BODY, flooded. A shore is not enough: a freight port
  // needs the same forty tiles of one body a marina does, and the first cut of
  // this probe found a puddle six tiles from the harbour and got \`invalid\`.
  let seed = -1;
  for (let dy = -1; dy <= marina.h && seed < 0; dy += 1) {
    for (let dx = -1; dx <= marina.w && seed < 0; dx += 1) {
      if (wet(marina.x + dx, marina.y + dy)) seed = (marina.y + dy) * W + marina.x + dx;
    }
  }
  if (seed < 0) return undefined;
  const body = new Set([seed]);
  const queue = [seed];
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!wet(nx, ny)) continue;
      const j = ny * W + nx;
      if (body.has(j)) continue;
      body.add(j);
      queue.push(j);
    }
  }

  // A clear 3×2 on that body's shore, well away from the other two buildings.
  let best;
  for (let y = 2; y < H - 3; y += 1) {
    for (let x = 2; x < W - 4; x += 1) {
      if (Math.abs(x - marina.x) + Math.abs(y - marina.y) < 6) continue;
      if (Math.abs(x - ferry.x) + Math.abs(y - ferry.y) < 6) continue;
      let clear = true;
      for (let dy = 0; dy < 2 && clear; dy += 1) {
        for (let dx = 0; dx < 3 && clear; dx += 1) {
          const i = (y + dy) * W + x + dx;
          // BUILDABLE, tested positively: grass, dirt, forest or sand. The
          // first cut listed what to reject and forgot MARSH — which T2 put
          // exactly where a wide shallow shelf meets the land, which is to say
          // exactly where a port wants to stand. Every candidate came back
          // \`invalid\` and the probe had no idea why.
          const t = state.tiles.terrain[i];
          if (!(t === 0 || t === 1 || t === 2 || t === 6)) clear = false;
          else if (state.tiles.buildingId[i] !== 0) clear = false;
          else if ((state.tiles.road[i] & 16) !== 0) clear = false;
          else if (state.tiles.zone[i] !== 0) clear = false;
        }
      }
      if (!clear) continue;
      // The berth with the MOST water round it, not the first one that has
      // any. The first cut took the first valid 3×2 and got a plot whose only
      // water is one diagonal corner — a port standing in a field with its
      // ship a hundred metres offshore. A frontage is what makes the picture.
      let beside = 0;
      for (let dy = -1; dy <= 2; dy += 1) for (let dx = -1; dx <= 3; dx += 1) {
        if (body.has((y + dy) * W + x + dx)) beside += 1;
      }
      if (beside >= 4 && (!best || beside > best.water)) best = { x, y, water: beside };
    }
  }
  return { marina: [marina.x, marina.y], ferry: [ferry.x, ferry.y],
           port: best ? [best.x, best.y] : undefined, berth: best ? best.water : 0, body: body.size };
}`;

const COUNT = `(state, view) => ({
  boats: view.stats?.boats ?? {},
  hulls: view.pools?.boat?.count ?? -1,
  vessels: view.pools?.ferry?.count ?? -1,
  wake: view.pools?.wake?.count ?? -1,
  live: view.stats?.streets?.live ?? 0,
  placed: view === undefined ? "" : (globalThis.SHOT_PLACED ?? []).map((p) => p.def + ":" + p.result).join(" "),
})`;

setConfig(DEFAULTS);
// The same city the page builds, in node, so a camera can be chosen from the
// berths' own geometry (S20c).
const state = playedCity({ seed: SEED, size: SIZE, years: YEARS });
const model = createModel(state);

const problems = [];
const probe = await shoot({ out: "reports/.harbour-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error(`no marina and terminal in seed ${SEED} after ${YEARS} years`);
console.log(`marina ${at.marina}, terminal ${at.ferry} on ${at.body} tiles of water, `
  + `a berth for a port at ${at.port ?? "nowhere"} with ${at.berth} tiles of water round it`);

// The moorings. `life` on and enough frames for the sailing boats to have
// moved off their starting tiles, so the frame is of a harbour and not of a
// seeding pass.
{
  const out = "reports/smoke-T4-marina.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60,
    frames: 150, life: true, mode: "city", span: 8, pitch: 35, yaw: 0.2,
    fx: at.marina[0], fy: at.marina[1], width: 1280, height: 720, extra: { __ask: COUNT } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.boats?.moored > 0)) problems.push(`${out}: the marina has no boat moored at it`);
  if (!(r.answer?.hulls > 0)) problems.push(`${out}: ${r.answer?.boats?.moored ?? 0} boats exist and NONE was posed`);
}

// A moored boat CLOSE (S20c). The marina frame above proves boats are posed; at
// span 8 — the city camera's floor — a seven-metre hull is a few pixels, so S17
// gave the boats a mast, a sail and a tapered bow that no gate could see.
//
// The berths come from `client/life/boats.js` in NODE: it is a life module, so
// it takes its time from the caller and nothing in it needs a page. Posing it
// into a recording stand-in for the pools is how a tool asks "where are they?"
// without a probe pass.
{
  const boats = createBoats(state, model, { life: false });
  const spots = [];
  boats.pose(
    { moored: "moored", boat: "boat", ferry: "ferry", cargo: "cargo", wake: "wake" },
    (pool, x, unusedY, z) => { if (pool === "moored") spots.push({ x: x * model.tileM, z: z * model.tileM }); },
    undefined,
  );
  if (spots.length === 0) problems.push("the close marina shot: no boat is moored to aim at");
  else {
    // Every berth, eight directions, then — if the marina is out in a wide
    // river, which seed 1003's is — a camera ON THE WATER. There is no dry land
    // within forty metres of its first berth in any direction, and a gate that
    // refuses to photograph a marina because nobody can stand on its bank is a
    // gate that photographs nothing.
    let camera;
    let boat = spots[0];
    for (const candidate of spots) {
      for (let a = 0; a < 8 && !camera; a += 1) {
        const ang = (a / 8) * Math.PI * 2;
        const got = standBack(model, {
          at: candidate, away: { x: Math.cos(ang), z: Math.sin(ang) },
          clear: 3, start: 10, max: 34, pitch: -3, eyeM: 2,
        });
        if (got) { camera = got; boat = candidate; }
      }
      if (camera) break;
    }
    if (!camera) {
      const eye = { x: boat.x + 16, z: boat.z + 10 };
      camera = {
        standoff: Math.round(Math.hypot(eye.x - boat.x, eye.z - boat.z)),
        clearance: clearanceAt(model, eye.x, eye.z),
        standingOn: model.surfaceAt(eye.x, eye.z).kind,
        eyeM: 2,
        photo: `${(eye.x / model.tileM).toFixed(3)},${(eye.z / model.tileM).toFixed(3)},2,`
          + `${Math.atan2(eye.x - boat.x, eye.z - boat.z).toFixed(4)},-3`,
      };
    }
    if (!camera) problems.push("the close marina shot: no camera can stand beside it");
    else {
      const out = "reports/smoke-T4-berth.png";
      console.log(describe("moored boat", { cx: boat.x, cz: boat.z, tileM: model.tileM }, camera));
      const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40,
        frames: 150, life: true, photo: camera.photo, width: 1280, height: 720,
        extra: { __ask: COUNT } });
      console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
      if (!r.ok) problems.push(...r.problems.slice(0, 2));
      if (!(r.answer?.hulls > 0)) problems.push(`${out}: no hull was posed in the frame`);
    }
  }
}

// The ferry, aimed at its terminal with the water in frame.
{
  const out = "reports/smoke-T4-ferry.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60,
    frames: 200, life: true, mode: "city", span: 8, pitch: 28, yaw: 0.2,
    fx: at.ferry[0], fy: at.ferry[1], width: 1280, height: 720, extra: { __ask: COUNT } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.boats?.plying > 0)) problems.push(`${out}: the terminal has no ferry on a route`);
  if (!(r.answer?.vessels > 0)) problems.push(`${out}: a ferry exists and was not posed`);
  if (!(r.answer?.wake > 0)) problems.push(`${out}: the ferry leaves no wake`);
}

// The port, placed on the shore the probe found — the deputy has no doctrine
// for one, so without `placeAt` this frame would photograph an empty bank.
if (at.port) {
  const out = "reports/smoke-T4-port.png";
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60,
    frames: 200, life: true, mode: "city", span: 8, pitch: 30, yaw: 0.2,
    fx: at.port[0], fy: at.port[1], width: 1280, height: 720,
    // `age`, because a building placed this tick is a CONSTRUCTION SITE (B2) —
    // the first run of this shot photographed scaffolding and called it a
    // port. It backdates every building, which is harmless here and is what
    // B2's own three-age gate does.
    extra: { __ask: COUNT, placeAt: `freightPort@${at.port[0]},${at.port[1]}`, age: 400 } });
  console.log(`${out} ok=${r.ok} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.placed ?? "").includes("freightPort:ok")) {
    problems.push(`${out}: the port was not built — ${r.answer?.placed || "nothing placed"}`);
  }
  if (!(r.answer?.boats?.routes ?? []).includes("cargo")) {
    problems.push(`${out}: the port has no ship on a route`);
  }
} else {
  problems.push("no shore in this city could take a freight port, so its picture was never taken");
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nharbour shots ok");
