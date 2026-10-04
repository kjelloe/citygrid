// The train (slice T3; ruling 037, D7).
//
// A train is an arc length and a sign, so all of it can be asserted in node —
// which matters, because the only other instrument is a screenshot of
// something moving, and a screenshot of something moving is a screenshot of
// something standing still.
//
// The D7 invariants: a rate per SECOND, nothing asks the machine for the time,
// and `life: false` freezes it exactly where it stands.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { adjacencyMask, tileAt, encodeRuns } from "../shared/grid.js";
import { CMD_JOIN, CMD_PLACE_RAIL, CMD_PLACE_BUILDING } from "../engine/commands.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createTrains, sampleLine, platformOn } from "../client/life/train.js";
import "../engine/build-commands.js";
import "../engine/utilities.js";

const W = 40;
const T = DEFAULTS.tileM;
const SPEC = DEFAULTS.rail;
const at = (x, y) => tileAt(W, x, y);

/** A line across the middle of the map, and a station beside it. */
function city({ station = true, from = 0, to = W - 1 } = {}) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 4 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  const cells = [];
  for (let x = from; x <= to; x += 1) cells.push(at(x, 20));
  apply(state, { type: CMD_PLACE_RAIL, actor: 1, runs: encodeRuns(cells) });
  if (station) {
    apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 18, y: 21, def: "railStation" });
  }
  return { state, model: createModel(state) };
}

const run = (trains, seconds, step = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / step); i += 1) trains.update(step);
};

// --- the line ----------------------------------------------------------------

test("a line long enough carries one train, and a stub carries none", () => {
  const long = city();
  assert.equal(createTrains(long.state, long.model).count(), 1);

  // Two tiles is 20 m of line against a 51 m train.
  const stub = city({ from: 10, to: 11, station: false });
  assert.equal(createTrains(stub.state, stub.model).count(), 0,
    "a train longer than its line was put on it anyway");
});

test("a station beside the line is a platform on it", () => {
  const { state, model } = city();
  const line = model.rail.corridors[0];
  const cum = [0];
  for (let i = 1; i < line.points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(line.points[i].x - line.points[i - 1].x,
      line.points[i].z - line.points[i - 1].z));
  }
  const stations = state.buildings.filter((b) => b.def === "railStation");
  assert.equal(stations.length, 1);
  const stop = platformOn(line, cum, stations, T, SPEC.width / 2);
  assert.ok(stop, "the station beside the line is not a platform on it");
  // The projection of the building's middle onto the track: x 19.5 tiles.
  assert.ok(Math.abs(stop.s - 19.5 * T) < T, `the platform is at ${stop.s} m, not ${19.5 * T}`);

  // And a line with nothing beside it stops nowhere.
  const empty = city({ station: false });
  assert.equal(createTrains(empty.state, empty.model).stats().platforms, 0);
});

// --- what it does ------------------------------------------------------------

test("a train travels its speed a second, and arrives on the line", () => {
  const { state, model } = city({ station: false });
  const trains = createTrains(state, model);
  const before = trains.fleet().length;
  assert.equal(before, 0, "the train was already on the line before it moved");

  // It starts one carriage back, so a second at `speed` brings the head on and
  // leaves the rest of the train behind it.
  run(trains, 1);
  const after = trains.fleet();
  assert.ok(after.length > 0, "nothing arrived in a second");
  assert.ok(after.length < SPEC.carriages, "the whole train arrived at once");

  // Timed by the CALLER, not by the machine: the same seconds in bigger steps
  // put it in the same place (D7).
  const coarse = createTrains(state, model);
  for (let i = 0; i < 6; i += 1) coarse.update(1 / 6);
  const fine = createTrains(state, model);
  run(fine, 1);
  assert.equal(coarse.fleet().length, fine.fleet().length);
  const a = coarse.fleet()[0];
  const b = fine.fleet()[0];
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9,
    "the same second in different steps put the train somewhere else");
});

test("the train stops at the platform, waits, and goes on", () => {
  const { state, model } = city();
  const trains = createTrains(state, model);
  // Long enough to reach the middle of a 40-tile line at 22 m/s.
  run(trains, 22);
  assert.equal(trains.stats().standing, 1, "the train ran through its own platform");
  const standing = trains.fleet().map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`);
  assert.equal(standing.length, SPEC.carriages, "part of the train is off the line at the platform");

  // It is still there half a dwell later, and in the same place.
  run(trains, SPEC.dwell / 2);
  assert.equal(trains.stats().standing, 1);
  assert.deepEqual(trains.fleet().map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`), standing,
    "a standing train moved");

  // And gone by the time the dwell is over.
  run(trains, SPEC.dwell);
  assert.equal(trains.stats().standing, 0, "the train never left");
});

test("the train leaves by the edge and comes back, rather than vanishing", () => {
  const { state, model } = city({ station: false });
  const trains = createTrains(state, model);
  const line = model.rail.corridors[0];

  // Watched rather than sampled at a guessed moment: the run is two ends and a
  // turn-around, and the arithmetic that says WHEN it is off the line is the
  // arithmetic under test. A run long enough for two full lengths sees the
  // whole cycle whatever the numbers are.
  const seen = [];
  const seconds = (line.length / SPEC.speed) * 2 + 60;
  for (let i = 0; i < Math.round(seconds * 30); i += 1) {
    trains.update(1 / 30);
    const on = trains.fleet().length > 0;
    if (seen.length === 0 || seen[seen.length - 1] !== on) seen.push(on);
  }
  // off → on → off → on: it arrives, runs the line, leaves by the far end, and
  // comes back. A train that vanished would stop at the second entry.
  assert.deepEqual(seen.slice(0, 4), [false, true, false, true], `saw ${seen.join(" → ")}`);
  assert.equal(trains.count(), 1, "a second train appeared");
});

// --- the rules it has to keep ------------------------------------------------

test("life: false freezes the train exactly where it stands", () => {
  const { state, model } = city();
  const moving = createTrains(state, model);
  run(moving, 8);
  const where = moving.fleet();

  const frozen = createTrains(state, model, { life: false });
  run(frozen, 8);
  assert.equal(frozen.fleet().length, 0, "a frozen train moved onto the line");
  assert.ok(where.length > 0, "the moving train did not move either, so this proves nothing");
});

test("the train asks nobody for the time", () => {
  // The D7 rule, asserted the only way a module can be: it takes its seconds
  // from the caller. A `Date.now()` here is a screenshot that depends on when
  // it was taken.
  const source = readFileSync(join(repoRoot, "client", "life", "train.js"), "utf8");
  for (const pattern of [/Date\.now/, /performance\.now/, /new Date/, /requestAnimationFrame/]) {
    assert.equal(pattern.test(source), false, `client/life/train.js uses ${pattern}`);
  }
});

test("sampling a line carries the tangent, so a carriage faces where it goes", () => {
  const points = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }];
  const cum = [0, 100, 200];
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  sampleLine(points, cum, 50, out);
  assert.deepEqual([out.x, out.z, out.tx, out.tz], [50, 0, 1, 0]);
  sampleLine(points, cum, 150, out);
  assert.deepEqual([out.x, out.z, out.tx, out.tz], [100, 50, 0, 1]);
  // Clamped at both ends rather than running off into nothing.
  sampleLine(points, cum, -40, out);
  assert.deepEqual([out.x, out.z], [0, 0]);
  sampleLine(points, cum, 900, out);
  assert.deepEqual([out.x, out.z], [100, 100]);
});

test("a train keeps its place across a build (B11)", () => {
  // The lines are rail corridors, so they carry W6a's keys: a build that does
  // not touch the track leaves the train where it was, instead of putting it
  // back a carriage off the end of the line to arrive all over again.
  const { state, model } = city();
  const trains = createTrains(state, model, { life: true });
  for (let t = 0; t < 120; t += 1) trains.update(0.25);
  const before = trains.snapshot();
  assert.equal(before.length, 1, `expected one line, got ${before.length}`);
  assert.ok(before[0].s > 0, "the train never left the end of the line");

  // A road somewhere else: a new corridor, and every id in the model after it
  // renumbered.
  const road = state.tiles.road;
  for (let x = 4; x < 12; x += 1) road[at(x, 6)] = NET_PRESENT;
  for (let x = 4; x < 12; x += 1) {
    road[at(x, 6)] = NET_PRESENT | adjacencyMask(W, W, x, 6, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const rebuilt = createModel(state);
  const carried = createTrains(state, rebuilt, { life: true, carry: before }).snapshot();

  assert.equal(carried.length, before.length);
  assert.equal(carried[0].key, before[0].key, "the line lost its identity");
  assert.equal(carried[0].s, before[0].s, "the train restarted its run");
  assert.equal(carried[0].dir, before[0].dir);
  assert.equal(carried[0].stopped, before[0].stopped, "the train forgot it was at a platform");
});

test("a train whose line is gone is not put on another one (B11)", () => {
  const { state, model } = city();
  const trains = createTrains(state, model, { life: true });
  for (let t = 0; t < 120; t += 1) trains.update(0.25);
  const before = trains.snapshot();

  // A different city, with its line somewhere else entirely.
  const other = city({ from: 2, to: 20 });
  const carried = createTrains(other.state, other.model, { life: true, carry: before }).snapshot();
  assert.equal(carried.length, 1, "the other city lost its own line");
  assert.notEqual(carried[0].key, before[0].key, "the two lines are the same line, so this proves nothing");
  assert.equal(carried[0].s, -DEFAULTS.rail.carriageLen,
    "a train was re-seated onto a line it was never on");
});
