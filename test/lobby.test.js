// The new-game screen's model.
//
// The failure this prevents is the one the P18 audit found: three difficulties
// balanced and measured across 200 games each in era 1, and no way to select
// any of them, because `defaultOptions()` was called with no difficulty and
// returned `steady` every time. A choice that does not reach the options record
// is not a choice.

import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZES, DIFFICULTIES, TERRAINS, WATERS, DISASTERS, ROWS,
  defaultChoices, sanitiseChoices, optionsFor, choicesFromParams, paramsForChoices, NAME_MAX,
} from "../client/lobby/options-model.js";
import { defaultOptions, OPTION_FIELDS } from "../engine/options.js";
import { rules } from "../engine/rules.js";

test("every choice the screen offers survives into the options record", () => {
  // The whole point. Walk every value of every row and assert the engine's
  // options object came out carrying it.
  for (const size of SIZES) {
    const options = defaultOptions(optionsFor({ ...defaultChoices(), size: size.value }));
    assert.equal(options.width, size.value);
    assert.equal(options.height, size.value);
  }
  for (const difficulty of DIFFICULTIES) {
    const options = defaultOptions(optionsFor({ ...defaultChoices(), difficulty: difficulty.value }));
    assert.equal(options.difficulty, difficulty.value,
      `${difficulty.value} did not reach the options record`);
  }
  for (const terrain of TERRAINS) {
    assert.equal(defaultOptions(optionsFor({ ...defaultChoices(), terrainStyle: terrain.value })).terrainStyle,
      terrain.value);
  }
  for (const water of WATERS) {
    assert.equal(defaultOptions(optionsFor({ ...defaultChoices(), waterStyle: water.value })).waterStyle,
      water.value);
  }
  for (const disasters of DISASTERS) {
    assert.equal(defaultOptions(optionsFor({ ...defaultChoices(), disasters: disasters.value })).disasters,
      disasters.value);
  }
});

test("every difficulty the screen offers is one the balance data knows", () => {
  // A fourth difficulty in the menu with no row in balance.json would silently
  // fall back to steady's numbers.
  const known = Object.keys(rules().difficulty);
  for (const difficulty of DIFFICULTIES) {
    assert.ok(known.includes(difficulty.value),
      `${difficulty.value} is offered but has no entry in balance.json`);
  }
});

test("every row's field is a real option, and every choice has a label key", () => {
  for (const row of ROWS) {
    assert.ok(row.choices.length >= 2, `${row.field} offers ${row.choices.length} choices`);
    assert.ok(row.labelKey, `${row.field} has no label key`);
    for (const choice of row.choices) {
      assert.ok(choice.labelKey, `a ${row.field} choice has no label key`);
      assert.notEqual(choice.value, undefined);
    }
  }
  // `size` maps to width/height rather than to a field of its own; the rest are
  // named exactly as `engine/options.js` names them, so a typo cannot create a
  // choice that lands nowhere.
  for (const row of ROWS) {
    if (row.field === "size") continue;
    assert.ok(OPTION_FIELDS.includes(row.field), `${row.field} is not an option field`);
  }
});

test("a hand-edited URL starts a game rather than being refused", () => {
  // `?size=999` is a link someone typed. A bad link should still open a city.
  const choices = sanitiseChoices({ size: 999, difficulty: "impossible", waterStyle: "lava", seed: -5 });
  assert.deepEqual(choices, defaultChoices());
});

test("choices survive a round trip through the URL", () => {
  const chosen = {
    seed: 424242, size: 128, difficulty: "demanding",
    terrainStyle: "hilly", waterStyle: "archipelago", disasters: false,
    cityName: "Ny Bergen", mayorName: "",
  };
  const params = new URLSearchParams(paramsForChoices(chosen));
  assert.deepEqual(choicesFromParams(params), chosen);
});

test("the shareable link carries the seed and only what differs from the defaults", () => {
  // A city is a link, and a link nobody can read is a link nobody shares.
  const params = new URLSearchParams(paramsForChoices(defaultChoices()));
  assert.equal(params.get("seed"), String(defaultChoices().seed));
  assert.deepEqual([...params.keys()], ["seed"]);
});

test("the default city is a standard region on steady, with disasters on", () => {
  // Pinned deliberately. The default is what almost everyone plays, and it
  // should not drift with a device probe: `recommendedMapSize()` answers what
  // hardware can cope with, which is not the same question as what makes a
  // good first city.
  const choices = defaultChoices();
  assert.equal(choices.size, 64);
  assert.equal(choices.difficulty, "steady");
  assert.equal(choices.disasters, true, "the game a player opens is not free-build");
});

test("singleplayer asks for one seat, and the seat count is the only thing 5.2 changes", () => {
  assert.equal(optionsFor(defaultChoices()).seats, 1);
  assert.equal(optionsFor(defaultChoices(), 8).seats, 8);
});

// --- names (§5.1) -----------------------------------------------------------

test("a city and a mayor can be named, and the name is capped", () => {
  // §5.1's first step, and the only typed field in the game. The reducer caps
  // and sanitises it again — this only stops the field accepting two hundred
  // characters it would silently lose.
  const long = sanitiseChoices({ cityName: "x".repeat(200), mayorName: "y".repeat(200) });
  assert.equal(long.cityName.length, NAME_MAX);
  assert.equal(long.mayorName.length, NAME_MAX);
  assert.equal(sanitiseChoices({ cityName: 42 }).cityName, "", "a non-string is no name");
});

test("an unnamed city is empty, not a placeholder", () => {
  // A placeholder the player leaves alone is a city called by a placeholder,
  // and §5.1 asks them to name it. The screen falls back to the REGION's name,
  // which the generator already produced, rather than to "My City".
  assert.equal(defaultChoices().cityName, "");
  assert.equal(defaultChoices().mayorName, "");
});

test("the city name reaches the options record, where it is hashed", () => {
  assert.equal(optionsFor({ ...defaultChoices(), cityName: "Ny Bergen" }).cityName, "Ny Bergen");
});

test("the name travels with the shareable link", () => {
  const params = new URLSearchParams(paramsForChoices({ ...defaultChoices(), cityName: "Ny Bergen" }));
  assert.equal(params.get("city"), "Ny Bergen");
  assert.equal(choicesFromParams(params).cityName, "Ny Bergen");
  // An unnamed city adds nothing to the link.
  assert.equal(new URLSearchParams(paramsForChoices(defaultChoices())).has("city"), false);
});
