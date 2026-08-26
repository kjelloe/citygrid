// The placement commands. Registered against the reducer rather than living
// inside it, so adding a tool never edits the dispatcher.

import { RESULT, LIMITS } from "../shared/protocol.js";
import { register, ok, fail } from "./reducer.js";
import {
  CMD_PLACE_ROAD, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_BULLDOZE,
} from "./commands.js";
import { begin, commit, undo as undoTransaction, stage, charge, reject, peek, failed, priceOnly } from "./transaction.js";
import { placeNetwork, removeNetwork, cellsFromRuns, hasNet, NETWORKS } from "./network.js";
import { canDemolish } from "./permissions.js";
import { buildCost } from "./rules.js";
import { isWater } from "./terrain.js";
import { TERRAIN_FOREST, TERRAIN_GRASS, OWNER_NATURE, OWNER_COMMONS, FLAG_RUINED } from "./constants.js";
import { isIntArray } from "./validate.js";

/** Undo is one deep, per player, and only for their own last action. Deeper
 * undo would need the whole world's history, and in a shared region another
 * player may already have built on top of what you are trying to rewind. */
var LAST = {};

export function lastUndoFor(actor) {
  return Object.hasOwn(LAST, actor) ? LAST[actor] : undefined;
}

export function clearUndo(actor) {
  if (Object.hasOwn(LAST, actor)) delete LAST[actor];
}

export function resetUndoHistory() {
  LAST = {};
}

function runArea(state, command, body) {
  var indices = cellsFromRuns(state, command.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return fail(RESULT.INVALID);
  var tx = begin(state, command.actor);
  body(tx, indices);
  if (failed(tx)) return fail(tx.result);
  var outcome = commit(tx);
  if (outcome.result !== RESULT.OK) return fail(outcome.result);
  LAST[command.actor] = outcome.undo;
  return ok([{ kind: "built", actor: command.actor, tiles: outcome.tiles, cost: outcome.cost }]);
}

/** Prices an edit without applying it. The tool preview calls this, so what
 * the player is quoted and what they are charged come from one code path. */
export function price(state, command, kind) {
  var indices = cellsFromRuns(state, command.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return { result: RESULT.INVALID, cost: 0, tiles: 0 };
  var tx = begin(state, command.actor);
  if (kind === "bulldoze") bulldozeInto(tx, indices);
  else placeNetwork(tx, kind, indices);
  return priceOnly(tx);
}

function registerNetwork(type, kind) {
  register(type, function place(state, command) {
    if (!isIntArray(command.runs, LIMITS.CELLS_PER_COMMAND)) return fail(RESULT.INVALID);
    return runArea(state, command, function body(tx, indices) {
      placeNetwork(tx, kind, indices);
    });
  });
}

registerNetwork(CMD_PLACE_ROAD, "road");
registerNetwork(CMD_PLACE_WIRE, "wire");
registerNetwork(CMD_PLACE_PIPE, "pipe");

/** Bulldoze clears networks, zoning and vegetation from tiles the actor is
 * allowed to touch. What it will never do is remove another player's work —
 * that is what a request is for. */
export function bulldozeInto(tx, indices) {
  var state = tx.state;
  for (var i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    var permitted = canDemolish(state, tx.actor, index);
    if (permitted !== RESULT.OK) {
      reject(tx, permitted);
      return;
    }
    var didSomething = false;

    for (var key in NETWORKS) {
      if (!Object.hasOwn(NETWORKS, key)) continue;
      var layer = NETWORKS[key].layer;
      if (hasNet(peek(tx, index, layer))) {
        stage(tx, index, layer, 0);
        didSomething = true;
      }
    }
    if (peek(tx, index, "zone") !== 0) {
      stage(tx, index, "zone", 0);
      didSomething = true;
    }
    if (state.tiles.terrain[index] === TERRAIN_FOREST) {
      stage(tx, index, "terrain", TERRAIN_GRASS);
      didSomething = true;
    }
    if ((state.tiles.flags[index] & FLAG_RUINED) !== 0) {
      stage(tx, index, "flags", state.tiles.flags[index] & ~FLAG_RUINED);
      didSomething = true;
    }

    if (didSomething) {
      charge(tx, buildCost(state, isWater(state.tiles.terrain[index]) ? "bulldozeWater" : "bulldoze"));
      // Cleared ground the actor owned reverts to nature, so an abandoned
      // plot can be claimed by whoever builds next rather than being fenced
      // off forever by whoever touched it first.
      if (state.tiles.owner[index] === tx.actor) stage(tx, index, "owner", OWNER_NATURE);
    }
  }
  // Neighbours of every cleared tile need their shape recomputed; removing the
  // networks above already staged the tiles, so re-running the network removal
  // gives the reshape for free.
  for (var k in NETWORKS) {
    if (Object.hasOwn(NETWORKS, k)) removeNetwork(tx, k, indices);
  }
}

register(CMD_BULLDOZE, function bulldoze(state, command) {
  if (!isIntArray(command.runs, LIMITS.CELLS_PER_COMMAND)) return fail(RESULT.INVALID);
  return runArea(state, command, bulldozeInto);
});

/** Undo of the actor's own last committed action. Refused once anyone else has
 * touched the same tiles: in a shared region the world may have moved on, and
 * silently reverting someone else's work would be the very thing ownership
 * exists to prevent. */
export function undoLast(state, actor) {
  var record = lastUndoFor(actor);
  if (!record) return RESULT.INVALID;
  for (var i = 0; i < record.indices.length; i += 1) {
    var index = record.indices[i];
    var owner = state.tiles.owner[index];
    if (owner !== actor && owner !== OWNER_NATURE && owner !== OWNER_COMMONS) return RESULT.NOT_OWNER;
  }
  var result = undoTransaction(state, record);
  clearUndo(actor);
  return result;
}
