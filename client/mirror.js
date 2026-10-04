// The render thread's copy of the city (W2; `workitems-worker.md`).
//
// The worker owns the only authoritative state. This is what the renderer, the
// HUD, the minimap and cityviewer's model read, and it is an ordinary engine
// state object in every respect — same fields, same typed arrays — so nothing
// above the seam can tell the difference. `shared/statehash.js` is what proves
// that: the mirror hashes to the same twelve characters as the worker's own
// state, or the seam is broken.
//
// **The object identity never changes.** A patch is applied INTO the state that
// everything already holds, field by field, for the same reason loading a save
// does (`adopt` in `game.js`): replacing the reference would leave the renderer
// drawing a city that no longer exists.

import { TILE_LAYERS } from "../engine/state.js";

const ARRAYS = { u8: Uint8Array, u16: Uint16Array };

/** A fresh mirror from a full patch — the `ready` reply's. */
export function createMirror(patch) {
  const state = { tiles: {} };
  applyPatch(state, patch);
  return state;
}

/**
 * Applies a patch in place: the layers that changed, then everything else.
 *
 * The buffers arrive transferred, so they are adopted rather than copied — the
 * worker made them for this and no longer has them.
 */
export function applyPatch(state, patch) {
  for (const layer of TILE_LAYERS) {
    const buffer = patch.layers[layer.name];
    if (buffer !== undefined) state.tiles[layer.name] = new ARRAYS[layer.kind](buffer);
  }
  for (const key of Object.keys(patch.rest)) state[key] = patch.rest[key];
}
