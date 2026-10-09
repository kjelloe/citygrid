// GameOptions — everything the lobby decides, hashed into the initial state so
// that options are part of the replay contract and cannot drift.
//
// Every field is an integer, a string or a boolean. The field ORDER below is
// the hash order; append new fields at the end and never reorder.

import { sanitiseText } from "./validate.js";
import { LIMITS } from "../shared/protocol.js";
import {
  MODE_SHARED_CITY, TREASURY_SPLIT, TREASURY_SEPARATE, TERRAIN_STYLE_ROLLING, WATER_RIVER,
  SPLIT_EQUAL, SPLIT_POPULATION,
  DIFFICULTY_STEADY, SEAT_MAX,
} from "./constants.js";

export var OPTION_FIELDS = [
  "seed",
  "width",
  "height",
  "mode",
  "difficulty",
  "terrainStyle",
  "waterStyle",
  "treeDensity",
  "seats",
  "startingTreasury",
  "disasters",
  "quests",
  "treasury",
  "splitRule",
  "mutualAid",
  "disasterAid",
  "openBorders",
  "derelictYears",
  "abandonYears",
  "requestExpiryMonths",
  "freeTextReasons",
  "chatEnabled",
  "privacy",
  "lateJoin",
  "seasonYears",
  "keepForDays",
  // Appended, never reordered - this list IS the hash order. The city name is
  // the lobby's decision like every other field here, and it is player-authored
  // text in hashed state, so it is capped and sanitised on the way in.
  "cityName",
];

/** Sizes and their seat caps. A phone is advised toward the smaller ones
 * (ruling 011) but never prevented from joining a large region. */
export var SIZE_SEATS = [
  { size: 48, seats: 4 },
  { size: 64, seats: 8 },
  { size: 96, seats: 12 },
  { size: 128, seats: 16 },
];

export function seatsForSize(size) {
  var best = 4;
  for (var i = 0; i < SIZE_SEATS.length; i += 1) {
    if (size >= SIZE_SEATS[i].size) best = SIZE_SEATS[i].seats;
  }
  return best;
}

export function defaultOptions(overrides) {
  var given = overrides ? overrides : {};
  var width = given.width ? given.width : 64;
  var height = given.height ? given.height : width;
  var options = {
    seed: given.seed ? given.seed >>> 0 : 1,
    width: width,
    height: height,
    mode: given.mode ? given.mode : MODE_SHARED_CITY,
    difficulty: given.difficulty ? given.difficulty : DIFFICULTY_STEADY,
    terrainStyle: given.terrainStyle ? given.terrainStyle : TERRAIN_STYLE_ROLLING,
    waterStyle: given.waterStyle ? given.waterStyle : WATER_RIVER,
    treeDensity: given.treeDensity === undefined ? 40 : given.treeDensity,
    seats: given.seats ? given.seats : seatsForSize(width),
    startingTreasury: given.startingTreasury === undefined ? 20000 : given.startingTreasury,
    disasters: given.disasters === undefined ? false : given.disasters === true,
    quests: given.quests === undefined ? true : given.quests === true,
    // `split` or `separate` (A142). Anything else — a typo, a lobby from
    // another build, or the `shared` that era 31 measured as the same
    // arithmetic — reads as `split`, which is what `shared` always was. The old
    // line passed any string through, so a typo reached `economyPass`, matched
    // neither branch and became `separate`: a region playing a money rule
    // nobody chose.
    treasury: given.treasury === TREASURY_SEPARATE ? TREASURY_SEPARATE : TREASURY_SPLIT,
    // `equal` or `population` (X4g, era 31) — read by `splitNet` in
    // `engine/economy.js` when the treasury is SPLIT. Anything else is read as
    // `equal`, which is what an unknown rule has to mean: a lobby from a later
    // build must not divide a region's money by a rule this one cannot do.
    splitRule: given.splitRule === SPLIT_POPULATION ? SPLIT_POPULATION : SPLIT_EQUAL,
    // Ruling 001: services and aid cross borders by default — a neighbour
    // should be worth having before they are worth resenting.
    mutualAid: given.mutualAid === undefined ? true : given.mutualAid === true,
    disasterAid: given.disasterAid === undefined ? false : given.disasterAid === true,
    openBorders: given.openBorders === undefined ? true : given.openBorders === true,
    // Ruling from P8: five city years, era 0, for the sweep to challenge.
    derelictYears: given.derelictYears === undefined ? 5 : given.derelictYears,
    abandonYears: given.abandonYears === undefined ? 5 : given.abandonYears,
    requestExpiryMonths: given.requestExpiryMonths === undefined ? 12 : given.requestExpiryMonths,
    freeTextReasons: given.freeTextReasons === undefined ? true : given.freeTextReasons === true,
    chatEnabled: given.chatEnabled === undefined ? false : given.chatEnabled === true,
    privacy: given.privacy ? given.privacy : "private",
    lateJoin: given.lateJoin === undefined ? true : given.lateJoin === true,
    seasonYears: given.seasonYears === undefined ? 25 : given.seasonYears,
    keepForDays: given.keepForDays === undefined ? 30 : given.keepForDays,
    cityName: sanitiseText(given.cityName, LIMITS.NAME_BYTES),
  };
  if (options.seats > SEAT_MAX) options.seats = SEAT_MAX;
  return options;
}

export function copyOptions(options) {
  var out = {};
  for (var i = 0; i < OPTION_FIELDS.length; i += 1) {
    out[OPTION_FIELDS[i]] = options[OPTION_FIELDS[i]];
  }
  return out;
}
