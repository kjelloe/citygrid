// What a new city can be, as data.
//
// The pure half of the new-game screen. It knows which options exist, which
// values are legal, and how a set of choices becomes the overrides
// `defaultOptions()` wants. It does not know about the DOM, and it never
// generates a region — that is `engine/worldgen.js`, and the screen calls it.
//
// This exists because until now there was no way to choose any of it. Seed and
// size were URL parameters and difficulty was not even that: `defaultOptions()`
// returned `steady` every time, so **relaxed and demanding were balanced,
// measured across 200 games each in era 1, and unreachable** (P18 audit).
//
// Shaped for slice 5.2. The multiplayer lobby is this screen with seats, a join
// code and privacy added — so the option rows are a table rather than a fixed
// form, `seats` is already a choice rather than a constant, and everything
// funnels through `optionsFor()` so the room's options record and a
// singleplayer game are built by one code path.

import {
  TERRAIN_STYLE_FLAT, TERRAIN_STYLE_ROLLING, TERRAIN_STYLE_HILLY,
  WATER_NONE, WATER_LAKES, WATER_RIVER, WATER_COASTAL, WATER_ARCHIPELAGO,
  DIFFICULTY_RELAXED, DIFFICULTY_STEADY, DIFFICULTY_DEMANDING,
} from "../../engine/constants.js";
import { sanitiseText } from "../../engine/validate.js";
import { LIMITS } from "../../shared/protocol.js";

/** Sizes, in the order they are offered. The seat caps in `engine/options.js`
 * hang off the same numbers, which is why 5.2 does not need a second table. */
export const SIZES = [
  { value: 48, labelKey: "lobby.size.small" },
  { value: 64, labelKey: "lobby.size.standard" },
  { value: 96, labelKey: "lobby.size.large" },
  { value: 128, labelKey: "lobby.size.region" },
];

export const DIFFICULTIES = [
  { value: DIFFICULTY_RELAXED, labelKey: "difficulty.relaxed", hintKey: "difficulty.relaxed.hint" },
  { value: DIFFICULTY_STEADY, labelKey: "difficulty.steady", hintKey: "difficulty.steady.hint" },
  { value: DIFFICULTY_DEMANDING, labelKey: "difficulty.demanding", hintKey: "difficulty.demanding.hint" },
];

export const TERRAINS = [
  { value: TERRAIN_STYLE_FLAT, labelKey: "lobby.terrain.flat" },
  { value: TERRAIN_STYLE_ROLLING, labelKey: "lobby.terrain.rolling" },
  { value: TERRAIN_STYLE_HILLY, labelKey: "lobby.terrain.hilly" },
];

export const WATERS = [
  { value: WATER_NONE, labelKey: "lobby.water.none" },
  { value: WATER_LAKES, labelKey: "lobby.water.lakes" },
  { value: WATER_RIVER, labelKey: "lobby.water.river" },
  { value: WATER_COASTAL, labelKey: "lobby.water.coastal" },
  { value: WATER_ARCHIPELAGO, labelKey: "lobby.water.archipelago" },
];

export const DISASTERS = [
  { value: true, labelKey: "lobby.disasters.on" },
  { value: false, labelKey: "lobby.disasters.off" },
];

/** The two things a player is choosing between: **where** they will build, and
 * **how hard** it will be. Rows are grouped so the screen reads as two
 * decisions rather than five dropdowns in a column. */
export const GROUPS = [
  { key: "place", labelKey: "lobby.group.place" },
  { key: "play", labelKey: "lobby.group.play" },
];

/** The rows the screen renders, in order. A row is a name, a field, a group and
 * the choices for it — so adding `seats` in 5.2 is a row, not a rewrite. */
export const ROWS = [
  { field: "size", group: "place", labelKey: "lobby.size", choices: SIZES },
  { field: "terrainStyle", group: "place", labelKey: "lobby.terrain", choices: TERRAINS },
  { field: "waterStyle", group: "place", labelKey: "lobby.water", choices: WATERS },
  { field: "difficulty", group: "play", labelKey: "lobby.difficulty", choices: DIFFICULTIES },
  { field: "disasters", group: "play", labelKey: "lobby.disasters", choices: DISASTERS },
];

export function rowsIn(group) {
  return ROWS.filter((row) => row.group === group);
}

export const SEED_MAX = 0xffffffff;

/** §5.1's first step, and the one thing on the screen that is typed rather than
 * chosen. Capped here as well as in the reducer — the reducer owns the rule,
 * this stops the field accepting two hundred characters it will silently lose. */
export const NAME_MAX = 24;

export function defaultChoices() {
  return {
    seed: 1003,
    // Empty, not "My City". A placeholder the player leaves alone is a city
    // called by a placeholder, and §5.1 asks them to name it.
    cityName: "",
    mayorName: "",
    // Standard, always — NOT `recommendedMapSize()`. That answers "what can
    // this device handle", which is a different question from "what is a good
    // first city", and conflating them opened every desktop player on a
    // 128x128 region they would spend hours failing to fill. Capability feeds
    // `sizeAdvice()`, which MARKS the heavy sizes (ruling 011).
    size: 64,
    difficulty: DIFFICULTY_STEADY,
    terrainStyle: TERRAIN_STYLE_ROLLING,
    waterStyle: WATER_RIVER,
    // Disasters ON for the game a player opens. `defaultOptions()` defaults
    // them off because free-build is a mode, not because this is.
    disasters: true,
  };
}

/** Forces a set of choices back inside the legal values.
 *
 * The screen cannot produce an illegal one, but the URL can — `?size=999` is a
 * link someone edited — and so can a stale saved preference. Anything
 * unrecognised falls back to the default rather than being refused, because a
 * bad link should still start a game. */
export function sanitiseChoices(given = {}) {
  const base = defaultChoices();
  const pick = (choices, value, fallback) =>
    (choices.some((c) => c.value === value) ? value : fallback);
  const seed = Number.isInteger(given.seed) && given.seed >= 0 && given.seed <= SEED_MAX
    ? given.seed
    : base.seed;
  // Through the ENGINE's sanitiser, so the name in the link, the name in the
  // box and the name in hashed state are the same string. Slicing alone left
  // the link carrying "  Ny   Bergen  " for a city called "Ny Bergen".
  const text = (value) => sanitiseText(value, LIMITS.NAME_BYTES);
  return {
    seed,
    cityName: text(given.cityName),
    mayorName: text(given.mayorName),
    size: pick(SIZES, given.size, base.size),
    difficulty: pick(DIFFICULTIES, given.difficulty, base.difficulty),
    terrainStyle: pick(TERRAINS, given.terrainStyle, base.terrainStyle),
    waterStyle: pick(WATERS, given.waterStyle, base.waterStyle),
    disasters: pick(DISASTERS, given.disasters, base.disasters),
  };
}

/** Choices to the overrides `defaultOptions()` takes.
 *
 * `seats: 1` is the singleplayer part, and the only part 5.2 changes. */
export function optionsFor(choices, seats = 1) {
  const c = sanitiseChoices(choices);
  return {
    seed: c.seed,
    // The reducer sanitises it again on the way into state; this only carries
    // what was typed.
    cityName: c.cityName,
    width: c.size,
    height: c.size,
    seats,
    difficulty: c.difficulty,
    terrainStyle: c.terrainStyle,
    waterStyle: c.waterStyle,
    disasters: c.disasters,
    quests: true,
  };
}

/** Reads choices out of URL parameters, so a city is a link.
 *
 * `?seed=` is also what tells the boot to skip the screen entirely: a URL that
 * names a seed is a request for that exact city, which is what every gate in
 * `tools/` sends and what a player shares. */
export function choicesFromParams(params) {
  const number = (name) => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
  };
  const flag = (name) => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    return raw !== "0" && raw !== "false";
  };
  return sanitiseChoices({
    seed: number("seed"),
    size: number("size"),
    difficulty: params.get("difficulty") ?? undefined,
    terrainStyle: params.get("terrain") ?? undefined,
    waterStyle: params.get("water") ?? undefined,
    disasters: flag("disasters"),
    cityName: params.get("city") ?? undefined,
  });
}

/** The shareable link for a set of choices. Only what differs from the
 * defaults, so the common case is short. */
export function paramsForChoices(choices) {
  const c = sanitiseChoices(choices);
  const base = defaultChoices();
  const params = new URLSearchParams();
  params.set("seed", String(c.seed));
  // The name travels with the link: a city someone shares is that city, named.
  if (c.cityName) params.set("city", c.cityName);
  if (c.size !== base.size) params.set("size", String(c.size));
  if (c.difficulty !== base.difficulty) params.set("difficulty", c.difficulty);
  if (c.terrainStyle !== base.terrainStyle) params.set("terrain", c.terrainStyle);
  if (c.waterStyle !== base.waterStyle) params.set("water", c.waterStyle);
  if (c.disasters !== base.disasters) params.set("disasters", c.disasters ? "1" : "0");
  return params.toString();
}
