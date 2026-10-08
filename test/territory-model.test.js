// Whose city is which, as data (X3b, Q61).
//
// The territory overlay has coloured buildings by owner since V7 and **had no
// control**: `options.territory` was honoured by the instanced half, the baked
// half and the chunk hash, and nothing in the interface could turn it on. A
// capability with no control, and the oldest one on the list.
//
// Turning it on is a button. What this file is about is the other half of
// §16's rule — **never colour alone**: sixteen seats cannot be told apart by
// hue by a player who cannot see hue, so the overlay ships a legend that NAMES
// each seat beside its colour, and the names come from the state rather than
// from a table somebody has to keep in step.

import test from "node:test";
import assert from "node:assert/strict";
import { TERRITORY, territoryLegend } from "../client/ui/territory-model.js";
import { PLAYER_COLOURS } from "../client/render/palette.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN } from "../engine/commands.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

function city(names) {
  const state = createState(defaultOptions({ width: 24, height: 24, seed: 5, seats: 4 }));
  names.forEach((name, i) => apply(state, { type: CMD_JOIN, actor: i + 1, seat: i + 1, name }));
  return state;
}

test("the legend names every seat that is in the city, and nobody else", () => {
  const state = city(["Ada", "Grace"]);
  const rows = territoryLegend(state);
  assert.equal(rows.length, 2, `${rows.length} rows for two players`);
  assert.deepEqual(rows.map((r) => r.seat), [1, 2]);
  assert.deepEqual(rows.map((r) => r.name), ["Ada", "Grace"]);
  // In seat order, always: a legend that reordered itself between frames would
  // be a legend nobody could learn.
  const again = territoryLegend(state);
  assert.deepEqual(again.map((r) => r.seat), rows.map((r) => r.seat));
});

test("each row carries the colour the renderer actually paints", () => {
  // One table. The legend showing a colour the buildings are not is worse than
  // no legend, and this is the pair of readers the `VARIANTS` lesson is about.
  const state = city(["Ada", "Grace", "Katherine"]);
  for (const row of territoryLegend(state)) {
    assert.equal(row.colour, PLAYER_COLOURS[row.seat],
      `seat ${row.seat}'s legend is ${row.colour.toString(16)}`);
  }
});

test("a seat with no name is still a seat, under the name the room gave it", () => {
  // `server/room.js` calls an unnamed joiner `Mayor <seat>` and the reducer
  // caps whatever arrives; a legend that showed an empty swatch would be a seat
  // the player can see on the map and not in the key.
  const state = city(["", "Grace"]);
  const rows = territoryLegend(state);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].name.length > 0, "a nameless seat has no label at all");
  assert.notEqual(rows[0].name, rows[1].name, "two seats share a label");
});

test("nature is not a seat", () => {
  // `PLAYER_COLOURS[0]` is black and is never drawn as an owner. A legend row
  // for it would promise the player a colour they will never find.
  const state = city(["Ada"]);
  const rows = territoryLegend(state);
  assert.ok(rows.every((r) => r.seat > 0), "the legend offers nature as a player");
  assert.equal(territoryLegend(createState(defaultOptions({ width: 24, height: 24, seats: 4 }))).length, 0,
    "an empty city has players in its legend");
});

test("the overlay's name is the one the rail and the renderer both use", () => {
  // The string is exported rather than written twice: the HUD puts it in the
  // rail, `game.js` turns it into `draw({ territory: true })`, and a typo in
  // either would be a button that does nothing (the `pools.moored` lesson).
  assert.equal(TERRITORY, "territory");
});
