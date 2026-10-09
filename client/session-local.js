// The seam, on this thread (W1, renamed in W2; `workitems-worker.md`).
//
// The reducer runs here, in the page, and `state` is the real state rather than
// a mirror. It is what runs when the browser has no `Worker`, what `?worker=0`
// forces, and what every gate that wants a synchronous engine beside an
// asynchronous seam can reason about.
//
// Its API is the ASYNCHRONOUS one, member for member with `session.js`, because
// the whole value of the seam is that the two are interchangeable — a local
// session that answered synchronously would let a caller depend on an ordering
// the worker cannot give it, and the swap would break in the UI rather than in
// a test.
//
// It owns NO clock: `tick()` is a call and `game.js` schedules it, for the same
// reason the renderer has no clock — a module that reads time cannot be driven
// by a test, a replay or a gate.
//
// It never replaces the state object it hands out. The renderer, the HUD, the
// minimap and the controller all hold that reference.
//
// The engine's subsystems are registered HERE, by the side-effect imports: they
// are what makes `apply` a whole game rather than an empty clock, and leaving
// them to each caller is how a script ends up ticking a city where nothing is
// ever built.

import { apply } from "../engine/reducer.js";
import { CMD_TICK, CMD_UNDO } from "../engine/commands.js";
import { hashState } from "../engine/state.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { fromSave } from "../engine/save.js";
import { RESULT } from "../shared/protocol.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/quests.js";
import "../engine/requests.js";

/**
 * A session over one city.
 *
 * `given` is `{ state }` (a city somebody already has — the lobby's preview or
 * a restyle), `{ save }` (the bytes of one), or `{ options }` to generate one.
 *
 * `onChange` fires after every command the reducer ACCEPTED and after every
 * tick, with `{ command, result, events, tick }`. A refusal is not a change:
 * the caller already has the result in its hand, and a listener that redrew on
 * one would redraw the whole city on every mis-click.
 */
export async function openLocalSession(given) {
  let state = given.state;
  if (state === undefined && given.save !== undefined) {
    const restored = fromSave(given.save);
    if (!restored.ok) throw new Error(`the save would not load: ${restored.reason}`);
    state = restored.state;
  }
  if (state === undefined) {
    const world = generateWorld(defaultOptions(given.options));
    if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
    state = world.state;
  }
  const listeners = new Set();
  let clock;

  function notify(command, outcome) {
    const change = { command, result: outcome.result, events: outcome.events, tick: state.tick };
    // Over a copy: a listener that unsubscribes itself is an ordinary thing for
    // a HUD being torn down to do.
    for (const listener of [...listeners]) listener(change);
  }

  function run(command) {
    const outcome = apply(state, command);
    if (outcome.result === RESULT.OK) notify(command, outcome);
    return outcome;
  }

  return {
    get state() { return state; },
    local: true,
    /** No seat and no room: this session is one player on one machine. Present
     * rather than absent, because the HUD reads them and a caller that has to
     * ask which session it holds is a caller the swap will break. */
    seat: undefined,
    room: undefined,
    /** No room clock either: the light cycle falls back to this page's own wall
     * clock, which is what A41 settled for singleplayer. */
    roomSeconds: undefined,
    /** And no room speed, and nobody to be host of (X2d). The clock here is
     * this page's own, which is what `setSpeed` turns; `setRoomSpeed` is the
     * member whose ABSENCE a caller reads to know there is no room to ask, and
     * it is declared rather than omitted for the reason below. */
    roomSpeed: undefined,
    isHost: false,
    setRoomSpeed: undefined,
    /** Nobody to remove and no room to end the session (X2d). Declared rather
     * than omitted, for the drop-in claim the member lists are compared on. */
    kick: undefined,
    onEnded: undefined,
    /** No chat either: there is nobody to say it to. Present rather than
     * absent, because the drop-in claim is checked by comparing the two APIs
     * and a caller that has to ask which session it holds is a caller the swap
     * will break. */
    say: undefined,
    onChat: undefined,
    /** Commands in flight. Always 0 here — the reducer is on this thread and a
     * command is done before `apply` returns — and it is on both sides of the
     * seam because a caller that has to ask "which session is this?" is a
     * caller the swap will break. */
    get pending() { return 0; },
    // There is no mirror to disagree with: the reducer is on this thread.
    get desyncs() { return 0; },
    get desyncChecks() { return 0; },
    async apply(command) { return run(command); },
    /** Undo is a command like any other since W4 (Q147): it used to be a direct
     * call into the reducer's module, which is a change to the city that could
     * not cross a wire. */
    async undo(actor) {
      return run({ type: CMD_UNDO, actor }).result;
    },
    /** The clock belongs to the SESSION (plan.md §3.4, W4), not to `game.js`:
     * a remote session ticks when a frame says to, and a client that also ran
     * its own interval would run the world twice. */
    /** Whether an interval is running. On both sides of the seam because the
     * drop-in claim is checked by comparing the two APIs, and because it is
     * what a gate reads to prove a room's client keeps no clock (X1c). */
    get clocked() { return clock !== undefined; },
    setSpeed(ms) {
      clearInterval(clock);
      clock = undefined;
      if (ms > 0) clock = setInterval(() => { this.tick(); }, ms);
    },
    async tick(count = 1) {
      // Every tick's events, as the worker does it: a batched tick that reports
      // only the last tick's events is a gate asserting nothing happened.
      let outcome;
      const events = [];
      for (let n = 0; n < count; n += 1) {
        outcome = run({ type: CMD_TICK });
        for (const event of outcome.events) events.push(event);
      }
      return { result: outcome.result, events };
    },
    /** A loaded city, copied field by field into the state everything holds —
     * replacing the reference would leave the renderer drawing a city that no
     * longer exists. */
    async load(saveData) {
      const restored = fromSave(saveData);
      if (!restored.ok) return { ok: false, reason: restored.reason };
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, restored.state);
      return { ok: true };
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The checksum the save, the replay and the desync detector all use. */
    async hash() { return hashState(state); },
    dispose() {
      clearInterval(clock);
      clock = undefined;
      listeners.clear();
    },
  };
}
