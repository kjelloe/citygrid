// The simulation, as a message handler (W2; `workitems-worker.md`).
//
// `sim-worker.js` is the thread and is four lines; everything that DECIDES is
// here, because node can load this module and cannot load a Web Worker. That is
// the same rule the renderer follows (ruling 037, `test/purity.test.js`): a
// decision that only exists inside a host nothing can instantiate is a decision
// no test can see.
//
// It imports `engine/` and `shared/` and nothing else, ever. The engine's ten
// subsystems are registered here by side effect, exactly as `client/session.js`
// does on the other side — they are what makes `apply` a whole game.
//
// **What crosses back**, per message: the result, the events, the tick, the
// hash, and the tile layers that actually changed, as transferable buffers. The
// rest of the state (buildings, players, requests, contracts, the scalars) is
// small and goes whole. The hash is what proves the mirror is faithful, and it
// is the same `hashState` the save, the replay and the desync detector use.

import { apply } from "../engine/reducer.js";
import { TILE_LAYERS, copyState, hashState } from "../engine/state.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { toSave, fromSave } from "../engine/save.js";
import { CMD_TICK } from "../engine/commands.js";
import "../engine/build-commands.js";
import { setRules } from "../engine/rules.js";
import { setCatalogue } from "../engine/catalogue.js";
import { setQuests } from "../engine/quests.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/quests.js";

function same(a, b) {
  if (a === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function createSimHost() {
  let state;
  /** The bytes the mirror has, per layer: what "changed" is measured against.
   * Kept here rather than asked of the reducer, because a dirty flag the
   * reducer maintains is a second copy of the truth and this is one pass over
   * eighteen layers (W2 — measure both, keep one; this one measured 0.4 ms on a
   * 96×96 and needs no engine change at all). */
  const sent = new Map();

  function layerPatch(everything) {
    const layers = {};
    const transfer = [];
    for (const layer of TILE_LAYERS) {
      const live = state.tiles[layer.name];
      if (!everything && same(sent.get(layer.name), live)) continue;
      const copy = live.slice();
      // Two copies: one is transferred (and detached by the post), one is what
      // the next comparison is made against.
      sent.set(layer.name, live.slice());
      layers[layer.name] = copy.buffer;
      transfer.push(copy.buffer);
    }
    return { layers, transfer };
  }

  function patchFor(everything) {
    const { layers, transfer } = layerPatch(everything);
    const rest = copyState(state);
    delete rest.tiles;
    return { patch: { layers, rest }, transfer };
  }

  function answer(type, extra, everything = false) {
    const { patch, transfer } = patchFor(everything);
    return {
      reply: { type, ...extra, tick: state.tick, hash: hashState(state), patch },
      transfer,
    };
  }

  const refuse = (id, reason) => ({ reply: { type: "error", id, reason }, transfer: [] });

  /** One message in, one reply out. `transfer` is what the poster transfers. */
  function handle(message) {
    const id = message.id;
    switch (message.type) {
      case "init": {
        // The same numbers the page is running on, handed in rather than
        // fetched: `engine/` may not do I/O, and a worker that read `data/`
        // itself could be running a different balance from the page beside it.
        // `worker_smoke` is where that shows up — the first run of it had the
        // two arms 5,300 apart in the treasury, because one had read the files
        // and the other was on `engine/rules.js`'s mirror with no quests in it.
        if (message.content !== undefined) {
          if (message.content.rules !== undefined) setRules(message.content.rules);
          if (message.content.catalogue !== undefined) setCatalogue(message.content.catalogue);
          if (message.content.quests !== undefined) setQuests(message.content.quests);
        }
        if (message.save !== undefined) {
          const restored = fromSave(message.save);
          if (!restored.ok) return refuse(id, restored.reason);
          state = restored.state;
        } else {
          const world = generateWorld(defaultOptions(message.options));
          if (!world.ok) return refuse(id, world.reason);
          state = world.state;
        }
        sent.clear();
        return answer("ready", { id }, true);
      }
      case "apply": {
        const outcome = apply(state, message.command);
        return answer("result", { id, result: outcome.result, events: outcome.events });
      }
      case "tick": {
        // Every tick's events, not the last one's. A count of one is the game's
        // clock and is unchanged; a count of four hundred is a gate building a
        // fixture city in one message, and dropping 399 ticks' events there is
        // how a gate ends up asserting that nothing happened.
        let outcome;
        const events = [];
        for (let n = 0; n < (message.count ?? 1); n += 1) {
          outcome = apply(state, { type: CMD_TICK });
          for (const event of outcome.events) events.push(event);
        }
        return answer("result", { id, result: outcome.result, events });
      }
      case "snapshot":
        return answer("ready", { id }, true);
      case "save":
        return { reply: { type: "save", id, save: toSave(state) }, transfer: [] };
      default:
        return refuse(id, `unknown message "${message.type}"`);
    }
  }

  return { handle };
}
