// The seam, with the simulation on the other side of a transport (W2, W4).
//
// The simulation owns the only authoritative state and is the only thing that
// calls `apply`. What lives here is the MIRROR — the render thread's copy,
// patched from what comes back — and the renderer, the HUD, the minimap and
// cityviewer's model read it exactly as they read the state before. Nothing
// above the seam knows which side of it the reducer is on.
//
// **A transport is an argument** (W4). `openMirrorSession(given, transport)`
// takes anything with `post(message, transfer) → Promise<reply>`: a worker
// thread (`client/transport/worker.js`), the echo stub that stands in for a
// room (`client/transport/echo.js`), and one day a socket. That is the claim
// ruling 003 made when it put the seam in from day one, and it is only a claim
// while the mirror can be built over exactly one thing — so it takes an
// argument, and `test/session-remote.test.js` drives it in node.
//
// `openSession` is what the game calls. It chooses:
//
//   - `?worker=0`, or a browser with no `Worker`, or a worker that will not
//     start → `openLocalSession` (`session-local.js`), the W1 seam, same API.
//   - otherwise the worker.
//
// The fallback is a LEVER as well as a safety net: a self-recovering path that
// nothing can force is a path no gate ever measures, so `?worker=0` drives it
// on purpose and `session.local` says which one is running.
//
// **Latency is a UI fact.** A build click round-trips before the ghost becomes
// a building. The ghost already exists and is never state, so the seam leaves
// it on screen until the result comes back — which is why `apply` answers with
// a promise on every side of the choice.

import { toSave } from "../engine/save.js";
import { hashState } from "../engine/state.js";
import { TICKS_PER_MONTH } from "../engine/constants.js";
import { RESULT } from "../shared/protocol.js";
import { CMD_UNDO } from "../engine/commands.js";
import { createMirror, applyPatch } from "./mirror.js";
import { loadedContent } from "./content.js";
import { openLocalSession } from "./session-local.js";
import { createWorkerTransport } from "./transport/worker.js";

export async function openSession(given = {}) {
  if (given.worker === false || typeof Worker === "undefined") return openLocalSession(given);
  try {
    const url = new URL("../worker/sim-worker.js", import.meta.url);
    return await openMirrorSession(given, createWorkerTransport(url));
  } catch (error) {
    // A worker that will not start is a page that still has to play: the file
    // missing from the precache, a Content-Security-Policy without `worker-src`,
    // a browser that will not take a module worker. Say so loudly — a silent
    // fallback is how a project ends up measuring the wrong thing for a month.
    console.error("the simulation worker did not start; playing on this thread", error);
    const session = await openLocalSession(given);
    session.fellBack = String(error?.message ?? error);
    return session;
  }
}

/** What starts the simulation: the save bytes it should restore, or the options
 * it should generate from. A live state object — the lobby's preview, a restyle
 * — crosses as its own save bytes, and `fromSave` verifies the checksum they
 * were written with, which makes it the one transfer in the project that proves
 * itself. */
function initFor(given) {
  // `content` is what `client/content.js` read out of `data/`: the balance, the
  // catalogue and the quests. The simulation does no I/O, so it is handed the
  // same bytes the page is running on — and in a room it would be the ROOM's,
  // which is what the join handshake's build hash is for (plan.md §3.9).
  const content = loadedContent();
  if (given.save !== undefined) return { type: "init", content, save: given.save };
  if (given.state !== undefined) return { type: "init", content, save: toSave(given.state) };
  return { type: "init", content, options: given.options };
}

/**
 * A session whose state is a mirror of what `transport` is talking to.
 *
 * Exported for the tests and for Wave 5: the worker is one transport and a
 * socket will be another.
 */
export async function openMirrorSession(given = {}, transport) {
  const listeners = new Set();
  let state;
  let lastChecked = -1;
  let desyncs = 0;
  // How many times the detector actually COMPARED, beside how many times it
  // disagreed. A failure counter reads 0 both when the subject is fine and when
  // the check never ran, and those are the two readings a gate most needs to
  // tell apart.
  let checks = 0;
  let clock;

  /** Posts, and patches the mirror with what comes back BEFORE the caller is
   * answered — so a promise that resolves is a city that has already changed. */
  async function post(message, transfer = []) {
    const reply = await transport.post(message, transfer);
    if (reply.patch) {
      if (state === undefined) state = createMirror(reply.patch);
      else applyPatch(state, reply.patch);
    }
    return reply;
  }

  const ready = await post(initFor(given));
  check(ready);

  /** The desync detector (CLAUDE.md). Hashing the mirror is a pass over every
   * layer, so it runs once a month rather than once a tick — often enough that
   * a drift cannot reach a save, rare enough that it is not the cost the worker
   * was meant to remove. */
  function check(reply) {
    const month = Math.floor(reply.tick / TICKS_PER_MONTH);
    if (month === lastChecked) return;
    lastChecked = month;
    checks += 1;
    const mirrored = hashState(state);
    if (mirrored === reply.hash) return;
    desyncs += 1;
    console.error(`DESYNC at tick ${reply.tick}: the mirror is ${mirrored}, the simulation says ${reply.hash}`);
  }

  function announce(command, reply) {
    check(reply);
    const change = { command, result: reply.result, events: reply.events, tick: reply.tick };
    for (const listener of [...listeners]) listener(change);
  }

  async function apply(command) {
    const reply = await post({ type: "apply", command });
    if (reply.result === RESULT.OK) announce(command, reply);
    return { result: reply.result, events: reply.events };
  }

  async function tick(count = 1) {
    const reply = await post({ type: "tick", count });
    announce({ type: "tick" }, reply);
    return { result: reply.result, events: reply.events };
  }

  return {
    get state() { return state; },
    local: false,
    /** Commands posted and not yet answered. The city a player sees is this
     * many messages behind the simulation, which is what a gate waits on
     * instead of guessing at a delay. */
    get pending() { return transport.pending ?? 0; },
    get desyncs() { return desyncs; },
    get desyncChecks() { return checks; },
    apply,
    tick,
    /** Undo is a command like any other (Q147). It was a member of its own
     * until W4, which is how a change to the city that could not cross a wire
     * hid in plain sight. */
    undo: (actor) => apply({ type: CMD_UNDO, actor }).then((outcome) => outcome.result),
    /** The clock belongs to the SESSION (plan.md §3.4). A remote one ticks when
     * a frame says to; this one and the local one keep an interval, and
     * `game.js` asks for a speed rather than owning one. */
    setSpeed(ms) {
      clearInterval(clock);
      clock = undefined;
      if (ms > 0) clock = setInterval(() => tick(), ms);
    },
    async load(saveData) {
      try {
        const reply = await post({ type: "init", save: saveData });
        lastChecked = -1;
        check(reply);
        return { ok: true, tick: reply.tick };
      } catch (error) {
        return { ok: false, reason: String(error.message ?? error) };
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async hash() { return hashState(state); },
    dispose() {
      clearInterval(clock);
      clock = undefined;
      listeners.clear();
      transport.dispose?.();
    },
  };
}
