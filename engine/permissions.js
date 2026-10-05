// The permission gate. Every command routes through here.
//
// A check that exists only in the UI is not a rule, it is a suggestion, and
// the next client build will forget it. This module is what makes "nobody can
// destroy anyone else's work" true rather than merely intended.

import { RESULT } from "../shared/protocol.js";
import {
  OWNER_NATURE, OWNER_COMMONS, SEAT_MIN, SEAT_MAX,
  MODE_DISTRICTS, MODE_SHARED_CITY, MODE_REGION_RIVALS,
} from "./constants.js";
import { xOf, yOf, DIR4, neighbour } from "../shared/grid.js";
import { rules } from "./rules.js";

export function isSeat(owner) {
  return owner >= SEAT_MIN && owner <= SEAT_MAX;
}

export function playerAt(state, seat) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].seat === seat) return state.players[i];
  }
  return undefined;
}

/** May `actor` build on this tile? Nature is claimable, the commons is shared,
 * another player's land is not. */
/**
 * Whose DISTRICT is this, and may `actor` act here? (X3d)
 *
 * One question, asked by everything that touches ground. It was two: the rule
 * lived inside `canBuildOn` — which has exactly one caller, `placeBuilding` —
 * and `canConnectAcross` did not know about districts at all, so in Districts a
 * seat could pave, wire and pipe straight across a neighbour's district and
 * could not put a hut on it.
 *
 * `consent` is what separates the two answers now. A NETWORK crosses a district
 * the way it crosses a border: with the owner's consent (`openBorders`, or
 * `openTo` for that seat), because a region whose only route runs through a
 * neighbour is a region nobody can play. A BUILDING never does: "unclaimed land
 * inside somebody's district is theirs to develop" (§25), and consent to cross
 * is a right of way, not a right to develop.
 */
export function districtAllows(state, actor, index, consent) {
  if (!ownershipPartitions(state.options.mode)) return RESULT.OK;
  var district = state.tiles.district[index];
  if (district === 0 || district === actor) return RESULT.OK;
  if (consent && state.options.openBorders) return RESULT.OK;
  if (consent) {
    var holder = playerAt(state, district);
    if (holder && holder.openTo && holder.openTo[actor]) return RESULT.OK;
  }
  return RESULT.OUT_OF_SECTOR;
}

export function canBuildOn(state, actor, index) {
  var owner = state.tiles.owner[index];
  if (owner === actor) return RESULT.OK;
  if (owner === OWNER_COMMONS) return RESULT.OK;
  if (owner === OWNER_NATURE) return districtAllows(state, actor, index, false);
  return RESULT.NOT_OWNER;
}

/** May `actor` demolish here? The rule the whole design rests on: what you did
 * not build is not yours to destroy — request it instead. */
export function canDemolish(state, actor, index) {
  var owner = state.tiles.owner[index];
  if (owner === OWNER_NATURE) return RESULT.OK;
  if (owner === actor) return RESULT.OK;
  if (owner === OWNER_COMMONS) {
    // Anyone may build on the commons; only the builder may remove it. The
    // builder is recorded on the building, so a bare commons tile with no
    // building is removable by anyone.
    var building = buildingAt(state, index);
    if (!building) return RESULT.OK;
    if (building.owner === actor) return RESULT.OK;
    return RESULT.NOT_OWNER;
  }
  return RESULT.NOT_OWNER;
}

export function buildingAt(state, index) {
  var id = state.tiles.buildingId[index];
  if (!id) return undefined;
  for (var i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].id === id) return state.buildings[i];
  }
  return undefined;
}

/** May `actor` run a road, wire or pipe across this tile? Networks are the one
 * thing that legitimately crosses a border, and only with consent. */
export function canConnectAcross(state, actor, index) {
  var owner = state.tiles.owner[index];
  if (owner === actor) return RESULT.OK;
  // Unowned ground still belongs to a DISTRICT in the modes that have them
  // (X3d): crossing one takes the same consent crossing a border does.
  if (owner === OWNER_NATURE || owner === OWNER_COMMONS) {
    return districtAllows(state, actor, index, true);
  }
  if (state.options.openBorders) return RESULT.OK;
  var owning = playerAt(state, owner);
  if (owning && owning.openTo && owning.openTo[actor]) return RESULT.OK;
  return RESULT.NOT_OWNER;
}

/** The steepest step between this tile and one of its four neighbours, in
 * elevation units (H6, A100). Exported since J3, because `placeNetwork` asks
 * the same question about the same ground — one rule in two directions. */
export function slopeAt(state, index) {
  var width = state.width;
  var x = xOf(width, index);
  var y = yOf(width, index);
  var here = state.tiles.elevation[index];
  var worst = 0;
  for (var d = 0; d < DIR4.length; d += 1) {
    var n = neighbour(width, state.height, x, y, DIR4[d]);
    if (n < 0) continue;
    var step = state.tiles.elevation[n] - here;
    if (step < 0) step = -step;
    if (step > worst) worst = step;
  }
  return worst;
}

/** May `actor` zone here? Region Rivals keeps neutral land between cities,
 * so zoning is confined to claimed ground.
 *
 * And the ground must be ground a street could be built on (H6, A100). S11 let
 * a junction's height move within six metres of its own land and took `hilly`
 * 128 from 177 cliffs on the walked route to 30; what was left was 20 m
 * corridors with 10 m of land between their ends, which no cutting a person
 * would dig fixes at 15%. Kjell took the expensive option: the city is not on
 * the cliff in the first place.
 *
 * It is `canZone`'s rule rather than worldgen's so that it is the REDUCER's —
 * one rule, checked once, the same for a player and for the deputy, and
 * answered with a result code that says what the ground is rather than "that
 * cannot go there".
 */
export function canZone(state, actor, index) {
  var base = canBuildOn(state, actor, index);
  if (base !== RESULT.OK) return base;
  if (state.options.mode === MODE_REGION_RIVALS) {
    var owner = state.tiles.owner[index];
    if (owner === OWNER_NATURE) return RESULT.OUT_OF_SECTOR;
  }
  if (slopeAt(state, index) > rules().development.maxZoneSlope) return RESULT.TOO_STEEP;
  return RESULT.OK;
}

/** Does the actor exist and hold a seat that may act at all? A departed seat
 * under regency still owns land, but its commands come from the deputy, not
 * from a socket. */
export function canAct(state, actor) {
  if (!isSeat(actor)) return RESULT.INVALID;
  var player = playerAt(state, actor);
  if (!player) return RESULT.INVALID;
  return RESULT.OK;
}

/** Shared City records ownership only so that demolition is protected; it does
 * not partition the map. Districts does both. */
export function ownershipPartitions(mode) {
  return mode === MODE_DISTRICTS || mode === MODE_REGION_RIVALS;
}

export function isCooperative(mode) {
  return mode === MODE_SHARED_CITY;
}
