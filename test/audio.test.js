// What the city sounds like (slice 4.4).
//
// `plan-v1.md`'s gate: "Audio is derived from state only: a muted client and a
// loud one stay hash-identical, asserted in test." That is the first test
// below, and it is the only one that would matter in multiplayer.

import test from "node:test";
import assert from "node:assert/strict";
import {
  cuesFor, cueForResult, ambienceFor, streetAmbienceFor,
  knownCueKinds, voiceNames, VOICES_PER_TICK, BUS,
} from "../client/audio/audio-model.js";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/traffic.js";
import "../engine/history.js";

function city() {
  const state = createState(defaultOptions({ seed: 11, width: 16, height: 16, seats: 1 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  return state;
}

test("a muted client and a loud one stay hash-identical", () => {
  // The gate. Two identical cities, ticked identically; one has every event fed
  // to the audio model and its ambience read, the other does not. If audio ever
  // reached into state — a cached level, a counter, a "last played" tick — this
  // is where it would show.
  const quiet = city();
  const loud = city();
  for (let tick = 0; tick < 120; tick += 1) {
    apply(quiet, { type: CMD_TICK });
    const outcome = apply(loud, { type: CMD_TICK });
    for (const cue of cuesFor(outcome.events)) assert.ok(cue.voice);
    ambienceFor(loud);
    cueForResult(outcome.result);
  }
  assert.equal(hashState(loud), hashState(quiet),
    "playing sound changed the city; audio must be a projection, never a writer");
});

test("ambience reads state without touching it", () => {
  const state = city();
  const before = hashState(state);
  for (let i = 0; i < 50; i += 1) ambienceFor(state);
  assert.equal(hashState(state), before);
});

test("fifty-nine shortfalls make one sound, not fifty-nine", () => {
  // The alert area learned this in slice N4; the speaker learns it here. A
  // sound played fifty-nine times at one instant is one louder sound.
  const events = Array.from({ length: 59 }, () => ({ kind: "powerShortfall" }));
  const cues = cuesFor(events);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].voice, "warn");
});

test("a tick is capped, and keeps the worst", () => {
  const events = [
    { kind: "fireOut" }, { kind: "questCompleted" }, { kind: "powerShortfall" },
    { kind: "waterShortfall" }, { kind: "disasterStruck" }, { kind: "burntDown" },
  ];
  const cues = cuesFor(events);
  assert.ok(cues.length <= VOICES_PER_TICK, `${cues.length} voices in one tick`);
  assert.equal(cues[0].voice, "boom", "a disaster must not be crowded out by a chime");
  assert.equal(cues.some((c) => c.voice === "chime"), false, "the quiet news lost, correctly");
});

test("unknown events make no sound rather than an unknown one", () => {
  // A whitelist, like the alert area: routine growth is not news, and a chime
  // every month is a chime the player stops hearing.
  assert.deepEqual(cuesFor([{ kind: "developed" }, { kind: "zoned" }, { kind: "budget" }]), []);
  assert.deepEqual(cuesFor([]), []);
  assert.deepEqual(cuesFor(undefined), []);
});

test("a refusal is audible, and success is quieter than failure", () => {
  // Refusals are the one thing the player most needs to notice, and the readout
  // that names them is at the bottom of the screen (slice N13).
  const ok = cueForResult("ok");
  const refused = cueForResult("noFunds");
  assert.equal(refused.voice, "refuse");
  assert.equal(ok.voice, "place");
  assert.ok(refused.priority < ok.priority, "a refusal must win a contested voice pool");
});

test("ambience is an integer that rises with the city and stops rising", () => {
  const empty = { population: 0, traffic: { congested: 0 } };
  const town = { population: 800, traffic: { congested: 20 } };
  const huge = { population: 900000, traffic: { congested: 9000 } };
  assert.equal(ambienceFor(empty), 0);
  assert.ok(ambienceFor(town) > 0);
  assert.ok(ambienceFor(huge) <= 100, "a big city must not creep upward forever");
  assert.ok(Number.isInteger(ambienceFor(town)));
  assert.equal(ambienceFor({}), 0, "a state with no numbers yet is silent, not NaN");
});

test("every cue names a voice the mixer has", async () => {
  const { voiceCatalogue } = await import("../client/audio/mixer.js");
  const built = voiceCatalogue();
  for (const voice of voiceNames()) {
    assert.ok(built.includes(voice), `no mixer voice for '${voice}'`);
  }
});

test("every cue lands on a bus the mixer creates", () => {
  const buses = new Set(Object.values(BUS));
  for (const kind of knownCueKinds()) {
    const [cue] = cuesFor([{ kind }], 99);
    assert.ok(buses.has(cue.bus), `${kind} plays on '${cue.bus}'`);
  }
  assert.ok(buses.has(cueForResult("ok").bus));
});

// --- what the street sounds like (slice V8, spec §9.4) -----------------------

/** A city with a given size and congestion, and nothing else. */
function cityWith({ population, congested }) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  state.population = population;
  state.traffic.congested = congested;
  return state;
}


test("street ambience follows the road under the walker, not the whole city", () => {
  // `ambienceFor` is a property of the CITY — population and congestion — and
  // it is the right answer from the city camera. At eye height it is the wrong
  // question entirely: standing on a busy arterial and standing in a cul-de-sac
  // two streets away are the same city and very different places.
  const state = cityWith({ population: 4000, congested: 40 });
  const busy = streetAmbienceFor(state, { x: 5, y: 5 }, 240);
  const quiet = streetAmbienceFor(state, { x: 5, y: 5 }, 0);
  assert.ok(busy > quiet, `${busy} against ${quiet}`);
});

test("a quiet street in a big city is still quiet", () => {
  const big = cityWith({ population: 40000, congested: 200 });
  assert.ok(streetAmbienceFor(big, { x: 5, y: 5 }, 0) < ambienceFor(big),
    "the city's own level drowns out where you are standing");
});

test("a busy street in a small city is still busy", () => {
  const small = cityWith({ population: 200, congested: 0 });
  assert.ok(streetAmbienceFor(small, { x: 5, y: 5 }, 255) > ambienceFor(small));
});

test("the level is an integer between 0 and 100, like the city's", () => {
  const state = cityWith({ population: 4000, congested: 40 });
  for (const load of [0, 1, 60, 128, 255]) {
    const level = streetAmbienceFor(state, { x: 5, y: 5 }, load);
    assert.ok(Number.isInteger(level), `${level}`);
    assert.ok(level >= 0 && level <= 100, `${level}`);
  }
});

test("off the map is silence rather than a crash", () => {
  const state = cityWith({ population: 4000, congested: 40 });
  assert.equal(streetAmbienceFor(state, undefined, undefined), ambienceFor(state));
});
