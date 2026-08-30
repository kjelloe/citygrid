// The eleven overlays.
//
// An overlay is the design's answer to "every action has visible consequences"
// (`gamedesign.md` §16), and it is also the player's only diagnostic tool. The
// failure it must not have is the quiet one: an overlay that renders something
// plausible from the wrong field, or that shows green where the simulation says
// failing. A probe filtering on a wrong field reports zeros in a world full of
// events, and an overlay doing the same reports health in a city on fire.
//
// So the banding is pure and tested against hand-built states, not eyeballed.

import test from "node:test";
import assert from "node:assert/strict";
import { OVERLAYS, OVERLAY_NAMES, BAND, bandAt, legendFor } from "../client/ui/overlays.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  FLAG_POWERED, FLAG_WATERED, TERRAIN_WATER,
} from "../engine/constants.js";
import { NET_PRESENT } from "../engine/network.js";

function blank() {
  return createState(defaultOptions({ seed: 7, width: 8, height: 8, seats: 1 }));
}
const at = (state, x, y) => y * state.width + x;

test("the design's eleven overlays all exist", () => {
  // gamedesign.md §16 names eleven. A missing one is a diagnostic the player
  // does not have.
  assert.equal(OVERLAY_NAMES.length, 11, `expected 11 overlays, got ${OVERLAY_NAMES.join(", ")}`);
  for (const name of ["zoning", "power", "water", "traffic", "landValue", "pollution",
    "crime", "fire", "health", "density", "desirability"]) {
    assert.ok(OVERLAYS[name], `no ${name} overlay`);
  }
});

test("every overlay declares a label and a legend", () => {
  // "Never colour alone" (§16, §30). An overlay with no legend is colour alone,
  // whatever the swatches do.
  for (const name of OVERLAY_NAMES) {
    const overlay = OVERLAYS[name];
    assert.ok(overlay.labelKey, `${name} has no label key`);
    const legend = legendFor(name);
    assert.ok(legend.length >= 2, `${name} has ${legend.length} legend entries`);
    for (const entry of legend) {
      assert.ok(entry.textKey, `${name} legend entry has no text key`);
      assert.equal(typeof entry.band, "number");
    }
  }
});

test("every overlay bands every tile without throwing", () => {
  const state = blank();
  for (const name of OVERLAY_NAMES) {
    for (let i = 0; i < state.width * state.height; i += 1) {
      const band = bandAt(state, name, i);
      assert.ok(Object.values(BAND).includes(band),
        `${name} produced band ${band} at tile ${i}, which is not one of the four`);
    }
  }
});

// --- the ones with a right answer -------------------------------------------

test("power reads the flag, not just the wire", () => {
  // The trap: a wire with no supply behind it looks identical in the `wire`
  // layer. An overlay that showed wire alone would say "powered" across a city
  // whose plant has burnt down — which is exactly the state the player opened
  // the overlay to diagnose.
  const state = blank();
  const wired = at(state, 1, 1);
  const supplied = at(state, 2, 1);
  state.tiles.wire[wired] = NET_PRESENT;
  state.tiles.wire[supplied] = NET_PRESENT;
  state.tiles.flags[supplied] |= FLAG_POWERED;

  assert.equal(bandAt(state, "power", supplied), BAND.GOOD);
  assert.equal(bandAt(state, "power", wired), BAND.SEVERE, "a wire with no supply is not 'good'");
  assert.equal(bandAt(state, "power", at(state, 5, 5)), BAND.NONE, "bare land has no power status");
});

test("water reads its own flag and not power's", () => {
  // Two flags one bit apart. Copy-paste between the two overlays would pass a
  // careless review and report water as fine in a drought.
  const state = blank();
  const i = at(state, 3, 3);
  state.tiles.pipe[i] = NET_PRESENT;
  state.tiles.flags[i] |= FLAG_POWERED;
  assert.equal(bandAt(state, "water", i), BAND.SEVERE, "power must not satisfy the water overlay");
  state.tiles.flags[i] |= FLAG_WATERED;
  assert.equal(bandAt(state, "water", i), BAND.GOOD);
});

test("zoning distinguishes the three zones and bare land", () => {
  const state = blank();
  state.tiles.zone[at(state, 0, 0)] = ZONE_RESIDENTIAL;
  state.tiles.zone[at(state, 1, 0)] = ZONE_COMMERCIAL;
  state.tiles.zone[at(state, 2, 0)] = ZONE_INDUSTRIAL;
  const bands = [0, 1, 2].map((x) => bandAt(state, "zoning", at(state, x, 0)));
  assert.equal(new Set(bands).size, 3, "the three zones must be distinguishable");
  assert.equal(bandAt(state, "zoning", at(state, 3, 0)), BAND.NONE);
});

test("severity overlays get worse as their layer gets worse", () => {
  // Monotonic, or the overlay is actively misleading: a player watching
  // pollution climb would see the colour improve.
  for (const [name, layer] of [["pollution", "pollution"], ["crime", "crime"], ["health", "healthRisk"]]) {
    const state = blank();
    const i = at(state, 4, 4);
    let previous = -1;
    for (const value of [0, 60, 120, 200, 255]) {
      state.tiles[layer][i] = value;
      const band = bandAt(state, name, i);
      assert.ok(band >= previous, `${name} improved as ${layer} rose to ${value}`);
      previous = band;
    }
    assert.equal(previous, BAND.SEVERE, `${name} never reaches severe`);
  }
});

test("land value and desirability get BETTER as they rise", () => {
  // The opposite direction to the severity overlays, and the reason they are
  // separate functions rather than one shared threshold table. Getting this
  // backwards would paint the best streets red.
  const state = blank();
  const i = at(state, 4, 4);
  state.tiles.landValue[i] = 20;
  const poor = bandAt(state, "landValue", i);
  state.tiles.landValue[i] = 240;
  const rich = bandAt(state, "landValue", i);
  assert.ok(rich < poor, `rich land banded ${rich}, poor land ${poor} — good is the LOW band`);
});

test("desirability is punished by pollution and crime, not only by value", () => {
  const state = blank();
  const clean = at(state, 1, 5);
  const filthy = at(state, 2, 5);
  state.tiles.landValue[clean] = 200;
  state.tiles.landValue[filthy] = 200;
  state.tiles.pollution[filthy] = 220;
  state.tiles.crime[filthy] = 200;
  assert.ok(bandAt(state, "desirability", filthy) > bandAt(state, "desirability", clean),
    "a polluted, high-crime street with good land value is not desirable");
});

test("water tiles are not applicable to most overlays", () => {
  // Grey means "not applicable" (§16). Painting the sea amber for crime is
  // noise in every screenshot and in every diff.
  const state = blank();
  const sea = at(state, 6, 6);
  state.tiles.terrain[sea] = TERRAIN_WATER;
  for (const name of ["crime", "pollution", "landValue", "density", "desirability", "health"]) {
    assert.equal(bandAt(state, name, sea), BAND.NONE, `${name} banded open water`);
  }
});

test("traffic is honest about being empty before the traffic slice", () => {
  // The traffic LAYER exists and is all zeros until N7 fills it. The overlay
  // must show an empty road network rather than inventing congestion, and must
  // not claim roads are 'good' when nothing has been measured.
  const state = blank();
  const road = at(state, 2, 2);
  state.tiles.road[road] = NET_PRESENT;
  assert.equal(bandAt(state, "traffic", road), BAND.GOOD, "an empty road is a clear road");
  assert.equal(bandAt(state, "traffic", at(state, 7, 7)), BAND.NONE, "off-road has no traffic");
  state.tiles.traffic[road] = 250;
  assert.equal(bandAt(state, "traffic", road), BAND.SEVERE);
});

test("an unknown overlay name bands nothing rather than throwing", () => {
  const state = blank();
  assert.equal(bandAt(state, "nonsense", 0), BAND.NONE);
  assert.deepEqual(legendFor("nonsense"), []);
});
