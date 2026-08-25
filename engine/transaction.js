// Transactional placement: stage every write, price the whole edit, then
// commit it all or none of it.
//
// The reference implementation's staging buffer is the one mechanic worth
// keeping verbatim. It is what makes a 400-tile drag either happen or not
// happen — never half of it because the money ran out in the middle — and it
// is what makes undo the inverse of exactly one player action.

import { RESULT } from "../shared/protocol.js";

export function begin(state, actor) {
  return {
    state: state,
    actor: actor,
    // Parallel arrays rather than a keyed object: no allocation per tile, and
    // no iteration-order question when the writes are replayed.
    indices: [],
    layers: [],
    values: [],
    previous: [],
    cost: 0,
    result: RESULT.OK,
  };
}

/** Stages one write. Later writes to the same tile and layer are kept in
 * order, so the last one wins on commit and undo still rewinds to the
 * original. */
export function stage(tx, index, layer, value) {
  tx.indices.push(index);
  tx.layers.push(layer);
  tx.values.push(value);
  tx.previous.push(tx.state.tiles[layer][index]);
}

export function charge(tx, amount) {
  tx.cost += amount;
}

export function reject(tx, result) {
  if (tx.result === RESULT.OK) tx.result = result;
}

export function failed(tx) {
  return tx.result !== RESULT.OK;
}

/** Reads through the staged writes, so a transaction sees its own edits — a
 * road placed at step three must be visible to the auto-connect at step four. */
export function peek(tx, index, layer) {
  for (var i = tx.indices.length - 1; i >= 0; i -= 1) {
    if (tx.indices[i] === index && tx.layers[i] === layer) return tx.values[i];
  }
  return tx.state.tiles[layer][index];
}

function purse(state, actor) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].seat === actor) return state.players[i];
  }
  return undefined;
}

export function affordable(state, actor, cost) {
  var player = purse(state, actor);
  if (!player) return false;
  return player.treasury >= cost;
}

/** Commits, or refuses and changes nothing. Returns the result and an undo
 * record that reverses exactly this action. */
export function commit(tx) {
  if (failed(tx)) return { result: tx.result, undo: undefined };

  var player = purse(tx.state, tx.actor);
  if (!player) return { result: RESULT.INVALID, undo: undefined };
  if (player.treasury < tx.cost) return { result: RESULT.NO_FUNDS, undo: undefined };

  for (var i = 0; i < tx.indices.length; i += 1) {
    tx.state.tiles[tx.layers[i]][tx.indices[i]] = tx.values[i];
  }
  player.treasury -= tx.cost;

  return {
    result: RESULT.OK,
    cost: tx.cost,
    tiles: tx.indices.length,
    undo: {
      actor: tx.actor,
      indices: tx.indices.slice(),
      layers: tx.layers.slice(),
      previous: tx.previous.slice(),
      refund: tx.cost,
    },
  };
}

/** Reverses a committed transaction. Applied in reverse order so that repeated
 * writes to one tile rewind to the value before the whole action, not to the
 * value between two of its steps. */
export function undo(state, record) {
  if (!record) return RESULT.INVALID;
  for (var i = record.indices.length - 1; i >= 0; i -= 1) {
    state.tiles[record.layers[i]][record.indices[i]] = record.previous[i];
  }
  var player = purse(state, record.actor);
  if (player) player.treasury += record.refund;
  return RESULT.OK;
}

/** Prices an edit without performing it, for the cost preview every tool shows
 * before the player commits. Runs the same code path as the real thing, so the
 * preview cannot disagree with the outcome. */
export function priceOnly(tx) {
  return { cost: tx.cost, result: tx.result, tiles: tx.indices.length };
}
