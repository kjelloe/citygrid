// The shot list (F2).
//
// A film is decided by looking at a storyboard, and a storyboard costs a minute
// of SwiftShader — so everything that can be wrong with a list before it is
// rendered is wrong here instead: a shot with no duration, a walk that starts
// in a field, a style or an hour that does not exist, a total that is not a
// minute. The easing and the camera arithmetic are pure for the same reason.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { CAMERAS, EASES, easeFor, problemsIn, lengthOf, shotAt, poseAt } from "../client/world/film.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/disasters.js";
import "../engine/fire.js";
import "../engine/quests.js";
import "../engine/requests.js";
import { generateWorld } from "../engine/worldgen.js";
import { createModel } from "../client/world/model.js";
import { PALETTES } from "../client/render/palettes.js";
import { PRESET_NAMES } from "../client/render/time-of-day.js";

setConfig(DEFAULTS);

const SIXTY = JSON.parse(readFileSync(join(repoRoot, "data", "film", "sixty-seconds.json"), "utf8"));

/** The hours the renderer has, READ from the renderer rather than copied: a
 * list of names beside the real one is a model of code that nothing re-derives,
 * and `time-of-day.js` is pure enough for node to import. */
const HOURS = [...PRESET_NAMES];

test("every easing is a function of 0..1 that starts at 0 and ends at 1", () => {
  for (const [name, fn] of Object.entries(EASES)) {
    assert.equal(fn(0), 0, `${name} does not start where it is`);
    assert.equal(fn(1), 1, `${name} does not arrive`);
    const half = fn(0.5);
    assert.ok(half >= 0 && half <= 1, `${name} leaves the shot at halfway: ${half}`);
  }
  assert.equal(easeFor("nonsense"), EASES.smooth, "an unknown ease is not the default");
});

test("a list says what is wrong with it, in sentences", () => {
  const world = { styles: Object.keys(PALETTES), hours: HOURS };
  assert.deepEqual(problemsIn(SIXTY, world), [], "the shipped list does not validate");

  const broken = {
    name: "",
    shots: [
      { title: "", camera: "zoom", duration: 0, from: { x: 1, z: 1 }, to: { x: 2, z: 2 } },
      { title: "no ends", camera: "orbit", duration: 4, span: 20 },
      { title: "bad style", camera: "crane", duration: 4, span: 20, style: "neon", time: "dawn",
        ease: "bounce", from: { x: 1, z: 1 }, to: { x: 2, z: 2 } },
    ],
  };
  const said = problemsIn(broken, world).join(" | ");
  for (const want of ["no name", "no title", "camera \"zoom\"", "no duration", "no \"from\" point",
    "style \"neon\"", "time \"dawn\"", "ease \"bounce\""]) {
    assert.ok(said.includes(want), `nothing said about ${want}: ${said}`);
  }
});

test("a walk shot has both feet on a street", () => {
  // The movement code is `walkthrough`'s: a walker that starts in a field
  // cannot move, and the film would be sixty seconds of a hedge.
  const world = { styles: Object.keys(PALETTES), hours: HOURS, onCorridor: (p) => p.x > 10 };
  const list = {
    name: "walks",
    shots: [{ title: "a high street", camera: "walk", duration: 8, from: { x: 2, z: 2 }, to: { x: 20, z: 2 } }],
  };
  const said = problemsIn(list, world).join(" | ");
  assert.ok(said.includes("starts off any street"), said);
  assert.ok(!said.includes("ends off any street"), said);
});

test("the shipped list is a minute, and every walk in it is on a real street", () => {
  // Within a second of sixty, which is the item's own number — and the walk
  // endpoints are checked against the fixture the film is shot on, because a
  // list that validates against nothing proves nothing.
  const total = lengthOf(SIXTY);
  assert.ok(Math.abs(total - 60) <= 1, `the film runs ${total} seconds`);

  // The city the film is SHOT on, played the way the list says: a generated
  // world has no streets in it at all, so checking a walk against one proves
  // nothing — which is what the first run of this test did.
  const world = generateWorld(defaultOptions({
    seed: SIXTY.seed, width: SIXTY.size, height: SIXTY.size, seats: 1, waterStyle: "river",
  }));
  assert.ok(world.ok, `the film's own fixture does not generate: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= SIXTY.years * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  const model = createModel(state);
  // A corridor within three tiles, which is what `enterStreet` asks for.
  const onCorridor = (p) => model.nearestCorridor(p.x * DEFAULTS.tileM, p.z * DEFAULTS.tileM, DEFAULTS.tileM * 3) !== undefined;
  const walks = SIXTY.shots.filter((s) => s.camera === "walk");
  assert.ok(walks.length > 0, "a film with nobody walking in it");
  for (const shot of walks) {
    assert.ok(onCorridor(shot.from), `${shot.title}: starts at ${shot.from.x},${shot.from.z} with no street`);
    assert.ok(onCorridor(shot.to), `${shot.title}: ends at ${shot.to.x},${shot.to.z} with no street`);
  }
});

test("the timeline hands back the right shot, and a hold holds", () => {
  const list = {
    name: "two",
    shots: [
      { title: "one", camera: "orbit", duration: 4, hold: 1, span: 20, from: { x: 0, z: 0 }, to: { x: 10, z: 0 } },
      { title: "two", camera: "pan", duration: 5, span: 30, from: { x: 0, z: 0 }, to: { x: 0, z: 20 } },
    ],
  };
  assert.equal(lengthOf(list), 10);
  assert.equal(shotAt(list, 0).index, 0);
  assert.equal(shotAt(list, 3.9).index, 0);
  // Inside the hold: still shot one, still at the end of its move.
  const held = shotAt(list, 4.5);
  assert.equal(held.index, 0);
  assert.equal(held.f, 1, "the camera moved during the hold");
  assert.equal(held.holding, true);
  assert.equal(shotAt(list, 5.1).index, 1);
  // Past the end: the last shot, rather than nothing.
  assert.equal(shotAt(list, 99).index, 1);
});

test("the pose is the shot's own arithmetic: eased, framed and facing", () => {
  const list = {
    name: "one",
    shots: [{
      title: "a crane", camera: "crane", duration: 10, ease: "linear",
      from: { x: 0, z: 0 }, to: { x: 10, z: 0 }, span: 40, spanTo: 10,
      pitch: 60, pitchTo: 12, look: { x: 5, z: 20 }, style: "plain", time: "sunset",
    }],
  };
  const start = poseAt(list, 0);
  const mid = poseAt(list, 5);
  const end = poseAt(list, 10);
  assert.equal(start.x, 0);
  assert.equal(mid.x, 5, "a linear ease is not linear");
  assert.equal(end.x, 10);
  assert.equal(mid.span, 25, "the span does not travel with the shot");
  assert.equal(mid.pitch, 36);
  assert.equal(start.mode, "city");
  assert.equal(start.style, "plain");
  assert.equal(start.time, "sunset");
  // Facing the thing it was told to look at, which is what lets a crane
  // descend while keeping a crossroads in frame.
  assert.ok(Math.abs(mid.yaw - Math.atan2(0, 20)) < 1e-9, `yaw ${mid.yaw}`);
  // And a walk is street mode, which is a different camera entirely.
  const walk = { name: "w", shots: [{ title: "w", camera: "walk", duration: 4, from: { x: 1, z: 1 }, to: { x: 2, z: 1 } }] };
  assert.equal(poseAt(walk, 0).mode, "street");
  assert.ok(CAMERAS.includes("walk"));
});
