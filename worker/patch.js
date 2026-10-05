// A city, as something that can cross a thread or a wire (W2, X1).
//
// The shape is `{ layers, rest }`: the tile layers as transferable buffers and
// everything else — buildings, players, requests, contracts, the scalars — as a
// deep copy. `client/mirror.js` applies it, `worker/sim-host.js` sends it after
// every command, and a room sends a WHOLE one to a joiner (plan.md §3.3: the
// join payload and the worker's snapshot are one shape, and
// `test/session-worker.test.js` holds them to it).
//
// It lives here rather than inside the host because the server needs the same
// answer and must not grow a second copy of it: two shapes for one city is how
// a client ends up with something it can draw and not save.

import { TILE_LAYERS, copyState } from "../engine/state.js";

function same(a, b) {
  if (a === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The layers that changed since `sent` last saw them, and the whole of the rest.
 *
 * `sent` is a `Map` the caller keeps: what the other side already has, per
 * layer. Pass `everything` for a snapshot — a joiner has nothing, so nothing of
 * theirs can be compared against.
 *
 * Two copies are made of each changed layer: one is transferred (and detached by
 * the post), one is what the next comparison is made against.
 */
export function patchOf(state, sent, everything = false) {
  const layers = {};
  const transfer = [];
  for (const layer of TILE_LAYERS) {
    const live = state.tiles[layer.name];
    if (!everything && same(sent.get(layer.name), live)) continue;
    const copy = live.slice();
    sent.set(layer.name, live.slice());
    layers[layer.name] = copy.buffer;
    transfer.push(copy.buffer);
  }
  const rest = copyState(state);
  delete rest.tiles;
  return { patch: { layers, rest }, transfer };
}
