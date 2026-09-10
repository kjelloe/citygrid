// What the mouse buttons mean (slice K3, ruling 042 §2).
//
// Kjell asked for this by name. The table is pure so every combination can be
// planted here rather than discovered in a browser: three buttons is eight
// states, times four modes, times a tool in hand or not — which is more than
// anybody checks by clicking, and exactly the kind of grid where the one nobody
// tried is the one that does something surprising.

import test from "node:test";
import assert from "node:assert/strict";
import { buttonsToIntent, allCombinations, INTENT, LEFT, RIGHT, MIDDLE } from "../client/input/buttons.js";

const city = (buttons, opts) => buttonsToIntent("city", buttons, opts);
const street = (buttons, opts) => buttonsToIntent("street", buttons, opts);
const photo = (buttons, opts) => buttonsToIntent("photo", buttons, opts);

test("nothing held means nothing happens, in every mode", () => {
  for (const mode of ["city", "ortho", "street", "photo"]) {
    const r = buttonsToIntent(mode, 0);
    assert.equal(r.intent, INTENT.none, mode);
    assert.equal(r.forward, 0, mode);
    assert.equal(r.look, false, `${mode} looks with nothing held`);
  }
});

// --- the city ----------------------------------------------------------------

test("left pans with nothing in hand, and builds with something", () => {
  assert.equal(city(LEFT).intent, INTENT.pan);
  assert.equal(city(LEFT, { hasTool: true }).intent, INTENT.tool);
});

test("the hand pans even with a tool selected", () => {
  // The one gap ruling 042 §2 names: with a tool in hand the only pan is the
  // middle button, which a trackpad may not have.
  assert.equal(city(LEFT, { hasTool: true, hand: true }).intent, INTENT.pan);
  assert.equal(city(LEFT, { hasTool: false, hand: true }).intent, INTENT.pan);
});

test("right orbits and middle pans, tool or no tool", () => {
  for (const hasTool of [false, true]) {
    assert.equal(city(RIGHT, { hasTool }).intent, INTENT.orbit, `tool ${hasTool}`);
    assert.equal(city(MIDDLE, { hasTool }).intent, INTENT.pan, `tool ${hasTool}`);
  }
});

test("both buttons dolly — the zoom a wheel-less trackpad never had", () => {
  assert.equal(city(LEFT | RIGHT).intent, INTENT.dolly);
  // And it beats the tool: two buttons is never a build gesture.
  assert.equal(city(LEFT | RIGHT, { hasTool: true }).intent, INTENT.dolly);
});

test("middle wins over everything, because it has only ever meant pan", () => {
  assert.equal(city(LEFT | MIDDLE).intent, INTENT.pan);
  assert.equal(city(RIGHT | MIDDLE).intent, INTENT.pan);
  assert.equal(city(LEFT | RIGHT | MIDDLE).intent, INTENT.pan);
});

test("no city combination ever builds by accident", () => {
  // The rule worth stating as its own test: the tool fires on the left button
  // ALONE and with no hand. Anything else is a camera gesture, and a stray
  // second button while dragging must not paint a district.
  for (const buttons of allCombinations()) {
    const r = city(buttons, { hasTool: true });
    if (r.intent !== INTENT.tool) continue;
    assert.equal(buttons, LEFT, `${buttons} fired the tool`);
  }
});

// --- the street and the photo camera ----------------------------------------

test("left walks forward, right walks back, both run", () => {
  for (const mode of [street, photo]) {
    assert.equal(mode(LEFT).forward, 1);
    assert.equal(mode(RIGHT).forward, -1);
    const both = mode(LEFT | RIGHT);
    assert.equal(both.run, true, "two buttons is not a run");
    assert.equal(both.forward, 0, "forward and back cancel, and the run carries it");
  }
});

test("and a run is a run, not a standstill", () => {
  // The combination worth being deliberate about: left+right cancels to zero on
  // the forward axis, so `run` is what makes it mean something. A caller that
  // reads `forward` alone gets a standstill, which is why `run` is separate and
  // why this test says so out loud.
  const both = street(LEFT | RIGHT);
  assert.equal(both.intent, INTENT.walk);
  assert.ok(both.run);
});

test("holding anything looks, which is the drag-look Q43 chose", () => {
  for (const buttons of [LEFT, RIGHT, MIDDLE, LEFT | RIGHT]) {
    assert.equal(street(buttons).look, true, String(buttons));
    assert.equal(photo(buttons).look, true, String(buttons));
  }
  assert.equal(street(0).look, false);
});

test("a tool in hand changes nothing down there", () => {
  // Street and photo mode own the pointer: there are no build tools at eye
  // height (ruling 034), so the flag must not reach the walk.
  for (const buttons of allCombinations()) {
    assert.deepEqual(street(buttons, { hasTool: true }), street(buttons), String(buttons));
    assert.deepEqual(photo(buttons, { hand: true }), photo(buttons), String(buttons));
  }
});

test("every combination in every mode has an answer", () => {
  // Eight button states times four modes times a tool or not. The grid is the
  // point: the combination nobody tried is the one that does something odd.
  for (const mode of ["city", "ortho", "street", "photo"]) {
    for (const buttons of allCombinations()) {
      for (const hasTool of [false, true]) {
        const r = buttonsToIntent(mode, buttons, { hasTool });
        assert.ok(Object.values(INTENT).includes(r.intent),
          `${mode} ${buttons} tool=${hasTool} gave "${r.intent}"`);
        assert.ok([-1, 0, 1].includes(r.forward), `${mode} ${buttons} forward ${r.forward}`);
        assert.equal(typeof r.run, "boolean");
        assert.equal(typeof r.look, "boolean");
      }
    }
  }
});

test("the city never walks and the street never orbits", () => {
  // Each mode's intents are its own; a camera intent leaking into the street is
  // how a walker ends up on an orbit.
  for (const buttons of allCombinations()) {
    assert.notEqual(city(buttons).intent, INTENT.walk, String(buttons));
    for (const mode of [street, photo]) {
      for (const banned of [INTENT.orbit, INTENT.dolly, INTENT.tool]) {
        assert.notEqual(mode(buttons).intent, banned, `${banned} at ${buttons}`);
      }
    }
  }
});
