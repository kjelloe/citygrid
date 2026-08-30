// State, copyState and the hash. The deep-copy tests exist because three
// separate aliasing bugs in a sibling project came from a nested mutable array
// that copyState shared instead of copying — and a shared nested object lets a
// backward replay scrub read the future.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState, TILE_LAYERS } from "../engine/state.js";
import { defaultOptions, seatsForSize, copyOptions, OPTION_FIELDS } from "../engine/options.js";
import { assertHashable } from "../shared/canonical.js";
import { LIMITS } from "../shared/protocol.js";
import { TERRAIN_GRASS, OWNER_NATURE } from "../engine/constants.js";

const opts = (over) => defaultOptions({ width: 16, height: 16, seed: 7, ...over });

test("a fresh state is entirely hashable", () => {
  const state = createState(opts());
  assertHashable(state);
});

test("every tile layer is allocated at map size", () => {
  const state = createState(opts());
  for (const layer of TILE_LAYERS) {
    assert.equal(state.tiles[layer.name].length, 256, `${layer.name} is the wrong length`);
  }
});

test("a fresh map is grass owned by nature", () => {
  const state = createState(opts());
  assert.ok(state.tiles.terrain.every((v) => v === TERRAIN_GRASS));
  assert.ok(state.tiles.owner.every((v) => v === OWNER_NATURE));
  assert.ok(state.tiles.buildingId.every((v) => v === 0));
});

test("the same options produce the same hash", () => {
  assert.equal(hashState(createState(opts())), hashState(createState(opts())));
});

test("a different seed produces a different hash", () => {
  assert.notEqual(hashState(createState(opts({ seed: 7 }))), hashState(createState(opts({ seed: 8 }))));
});

test("every option is hashed — options are part of the replay contract", () => {
  // Catches the failure where a new lobby option is added and silently omitted
  // from the hash, so two clients configure differently and agree anyway.
  const base = createState(opts());
  const baseHash = hashState(base);
  const variants = {
    mode: "districts", difficulty: "demanding", terrainStyle: "hilly", waterStyle: "lakes",
    treeDensity: 99, seats: 3, startingTreasury: 999, disasters: true, quests: false,
    treasury: "split", splitRule: "population", mutualAid: false, disasterAid: true,
    openBorders: false, derelictYears: 9, absenceYears: 9, abandonYears: 9,
    requestExpiryMonths: 3, freeTextReasons: false, chatEnabled: true, privacy: "public",
    lateJoin: false, seasonYears: 50, keepForDays: 90, cityName: "Ny Bergen",
  };
  for (const [field, value] of Object.entries(variants)) {
    const changed = hashState(createState(opts({ [field]: value })));
    assert.notEqual(changed, baseHash, `changing ${field} did not change the hash`);
  }
  // And the fields the variants do not cover are the dimensional ones, which
  // are obviously hashed because the tile arrays change size.
  const covered = new Set([...Object.keys(variants), "seed", "width", "height"]);
  const missed = OPTION_FIELDS.filter((f) => !covered.has(f));
  assert.deepEqual(missed, [], `these options are never varied by this test: ${missed}`);
});

test("the city's name is capped and sanitised before it reaches the hash", () => {
  // Player-authored text is untrusted input and hashed state at once
  // (CLAUDE.md): cap it, sanitise it, canonicalise its bytes. A control
  // character in a name would otherwise cross the wire and into a checksum.
  const control = createState(opts({ cityName: "Ny\u0000Berg\u2028en" }));
  assert.equal(control.options.cityName.includes("\u0000"), false);
  assert.equal(control.options.cityName.includes("\u2028"), false);

  const long = createState(opts({ cityName: "x".repeat(200) }));
  assert.ok(long.options.cityName.length <= LIMITS.NAME_BYTES,
    `${long.options.cityName.length} characters survived a ${LIMITS.NAME_BYTES}-byte cap`);

  // Whitespace is collapsed, so two names that look identical hash identically.
  assert.equal(createState(opts({ cityName: "  Ny   Bergen " })).options.cityName, "Ny Bergen");
  assert.equal(
    hashState(createState(opts({ cityName: "Ny Bergen" }))),
    hashState(createState(opts({ cityName: "  Ny   Bergen  " }))),
    "two spellings of the same name must not be two different cities");

  // An unnamed city is the empty string, never undefined or null: no nulls in
  // state, and `undefined` would not survive canonical serialisation.
  assert.equal(createState(opts()).options.cityName, "");
});

test("mutating a copy never touches the original", () => {
  const state = createState(opts());
  state.players.push({
    seat: 1, name: "A", colour: 1, status: 0, treasury: 100,
    requestPolicy: "manual", joinedTick: 0, lastSeenTick: 0,
  });
  state.buildings.push({
    id: 1, def: "house", x: 1, y: 1, owner: 1, level: 1, valueTier: 0,
    occupancy: 4, condition: 100, builtTick: 0, flags: 0,
  });
  state.requests.push({
    id: 2, from: 1, to: 2, runs: [5, 3], title: "t", reason: "r", offer: 0,
    createdTick: 0, expiresTick: 10, status: "pending",
  });
  state.contracts.push({
    id: 3, from: 1, to: 2, kind: "power", units: 10, price: 2,
    status: "offered", createdTick: 0,
  });

  const before = hashState(state);
  const clone = copyState(state);

  clone.tiles.terrain[0] = 5;
  clone.tiles.buildingId[0] = 9;
  clone.players[0].name = "B";
  clone.buildings[0].occupancy = 99;
  clone.requests[0].runs.push(77);
  clone.requests[0].status = "approved";
  clone.contracts[0].units = 999;
  clone.rng.s = 12345;
  clone.demand.residential = 500;
  clone.options.seats = 2;

  assert.equal(hashState(state), before, "the original changed when the copy was mutated");
  assert.notEqual(hashState(clone), before);
});

test("every nested array in state is deep-copied", () => {
  // Walks the object rather than naming fields, so a new nested list added
  // later fails here instead of becoming the fourth aliasing bug.
  const state = createState(opts());
  const clone = copyState(state);
  const seen = [];
  const walk = (a, b, path) => {
    if (ArrayBuffer.isView(a)) {
      assert.notEqual(a.buffer, b.buffer, `${path} shares a buffer`);
      seen.push(path);
      return;
    }
    if (Array.isArray(a)) {
      assert.notEqual(a, b, `${path} is the same array object`);
      seen.push(path);
      a.forEach((item, i) => walk(item, b[i], `${path}[${i}]`));
      return;
    }
    if (a && typeof a === "object") {
      assert.notEqual(a, b, `${path} is the same object`);
      for (const key of Object.keys(a)) walk(a[key], b[key], `${path}.${key}`);
    }
  };
  walk(state, clone, "state");
  assert.ok(seen.length >= TILE_LAYERS.length, "the walk did not reach the tile layers");
});

test("tile changes reach the hash", () => {
  const state = createState(opts());
  const before = hashState(state);
  state.tiles.pollution[100] = 1;
  assert.notEqual(hashState(state), before, "a tile layer is not being hashed");
});

test("every tile layer is hashed", () => {
  // A layer added to TILE_LAYERS but forgotten in hashState would let two
  // engines disagree about the map and still agree about the hash.
  for (const layer of TILE_LAYERS) {
    const state = createState(opts());
    const before = hashState(state);
    state.tiles[layer.name][3] = 7;
    assert.notEqual(hashState(state), before, `${layer.name} is not hashed`);
  }
});

test("seat caps follow map size", () => {
  assert.equal(seatsForSize(48), 4);
  assert.equal(seatsForSize(64), 8);
  assert.equal(seatsForSize(96), 12);
  assert.equal(seatsForSize(128), 16);
  assert.equal(seatsForSize(200), 16, "never more than sixteen seats");
});

test("copyOptions carries every declared field and nothing else", () => {
  const options = defaultOptions({ width: 64 });
  const copy = copyOptions(options);
  assert.deepEqual(Object.keys(copy).sort(), [...OPTION_FIELDS].sort());
});

test("defaults match the rulings", () => {
  const options = defaultOptions({});
  assert.equal(options.derelictYears, 5, "P8: five city years");
  assert.equal(options.absenceYears, 5);
  assert.equal(options.mutualAid, true, "services cross borders by default");
  assert.equal(options.disasters, false, "disasters are opt-in");
  assert.equal(options.privacy, "private");
  assert.equal(options.lateJoin, true, "a room nobody can join is a room that dies");
});
