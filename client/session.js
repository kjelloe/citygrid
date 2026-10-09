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

/** Where the room is: this origin's `/ws`, over `wss` when the page is served
 * over `https`. One process serves the client and the sockets (X1's
 * `server/index.js`), so there is no second address to configure. */
function roomUrl() {
  const at = new URL(globalThis.location?.href ?? "http://localhost/");
  at.protocol = at.protocol === "https:" ? "wss:" : "ws:";
  at.search = "";
  at.hash = "";
  at.pathname = "/ws";
  return at.toString();
}

export async function openSession(given = {}) {
  // **A room, if one was asked for** (X1c). `?join=<code>` is the only thing in
  // the project that opens a socket — ruling 003 says singleplayer makes no
  // network call and `offline_smoke` keeps asserting it, so this branch is
  // reached by a URL parameter or by the lobby and never by a default.
  //
  // The work item called the parameter `?room=`; it is `?join=`, which is the
  // name `client/main.js` has declared since X0 and which nothing read until
  // now — a flag that is read and never used is off, and this one was.
  if (given.join || given.host) {
    const { createSocketTransport } = await import("./transport/socket.js");
    return openMirrorSession(given, createSocketTransport(given.roomUrl ?? roomUrl(), {
      // `host` is the options a new room is generated from (X2c); `join` is the
      // code of one that exists. One or the other, never both: a player who
      // hosts is not choosing somebody else's city.
      create: given.host,
      room: given.join, seat: given.seat, name: given.mayorName,
      // Watching rather than playing (X4e): no seat is asked for and none is
      // given, so a full room is still watchable.
      spectate: given.spectate === true,
    }));
  }
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
    // **And ask to be put back.** Saying so is half of it: in a room the
    // authority is somewhere else and has answered `C2S.RESYNC_REQUEST` since
    // X1a, and until the omissions round after X1c nothing in the page had ever
    // sent one. A transport with no authority behind it — the worker, the echo
    // stub — has no `resync` and nothing happens, which is right: a mirror that
    // disagrees with the worker is a bug in the patch, not a divergence.
    transport.resync?.();
  }

  function announce(command, reply, pushed = false) {
    check(reply);
    // **`resynced` travels with the change** (X6). The transport marks the
    // reply it builds from a room's snapshot, and until now the session
    // dropped the flag — so the page could not tell a frame from the room
    // re-sending the entire city, which is the most alarming thing that can
    // happen to a session and said nothing at all.
    const change = {
      command, result: reply.result, events: reply.events, tick: reply.tick, pushed,
      resynced: reply.resynced === true,
    };
    for (const listener of [...listeners]) listener(change);
  }

  /** **A reply nobody asked for** (X1c, the X1 review item 1). A room
   * broadcasts a frame carrying another seat's command; there is no promise
   * waiting for it, so the transport pushes it here. The mirror is patched and
   * the change announced exactly as if this seat had made it — which is what
   * makes the minimap, the advisor and the alerts notice another player at all.
   * The worker and echo transports never call this. */
  transport.onMessage?.((reply) => {
    if (reply.patch) {
      if (state === undefined) state = createMirror(reply.patch);
      else applyPatch(state, reply.patch);
    }
    announce({ type: "frame" }, reply, true);
  });

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
    /** Which seat this client is, and which room — undefined in singleplayer.
     * The HUD and the lobby read them; nothing below the seam knows either. */
    get seat() { return transport.seat; },
    get room() { return transport.room; },
    /** The room's played clock in seconds, or undefined outside a room. The
     * light cycle takes it so every seat is at one hour (A63) without the sun
     * racing the game's speed (A41). */
    get roomSeconds() { return transport.roomSeconds; },
    /** The room's speed, and whether this client may change it (X2d).
     * `undefined` outside a room, which is what the HUD reads to decide whether
     * the speed control is this page's business at all. */
    get roomSpeed() { return transport.roomSpeed; },
    get isHost() { return transport.isHost; },
    /** Whether the host has started the room, and who has said they are ready
     * (X2d). Both ride the frame, so a lobby never has to ask. */
    get roomStarted() { return transport.roomStarted; },
    get readySeats() { return transport.readySeats; },
    setReady: transport.setReady ? (value) => transport.setReady(value) : undefined,
    start: transport.start ? () => transport.start() : undefined,
    /** Chat, passed straight through (X3b). It is NOT the city: it never
     * reaches the reducer or the mirror, so it is here only because `game.js`
     * holds one object, and it is absent on every transport that has no room
     * behind it. */
    say: transport.say ? (text) => transport.say(text) : undefined,
    onChat: transport.onChat ? (handler) => transport.onChat(handler) : undefined,
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
    /** Whether this session is driving a clock of its own. A getter rather than
     * a boolean somebody sets, because the thing that must be true is that the
     * interval is not running — and that is what a gate can read. */
    get clocked() { return clock !== undefined; },
    setSpeed(ms) {
      clearInterval(clock);
      clock = undefined;
      // **In a room the server owns the clock** (plan.md §3.6): the tick count
      // rides the frame. A session that also kept an interval would tick a city
      // the room never ticked, and the socket transport answers a `tick` post
      // with a no-op — so the defect would be a desync with no local symptom at
      // all. `game.js` still asks for a speed; in a room the answer is the
      // host's, which is X2's control.
      if (ms > 0 && transport.roomClock !== true) clock = setInterval(() => tick(), ms);
    },
    /** Ask the ROOM to change speed (X2d). Outside a room there is nothing to
     * ask: the caller uses `setSpeed` and this is absent, which is how
     * `game.js` tells the two situations apart without knowing what a socket
     * is. */
    setRoomSpeed: transport.setRoomSpeed ? (next) => transport.setRoomSpeed(next) : undefined,
    /** The host's removal, and the end of a session (X2d). Both absent on every
     * transport with no room behind it, which is how `game.js` tells the two
     * situations apart without knowing what a socket is. */
    kick: transport.kick ? (seat) => transport.kick(seat) : undefined,
    onEnded: transport.onEnded ? (handler) => transport.onEnded(handler) : undefined,
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
