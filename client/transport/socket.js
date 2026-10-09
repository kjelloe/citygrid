// The room, as a transport (X1c, slice 5.1's client half).
//
// The first two transports answer their own caller: a worker and the echo stub
// each compute the reply to the message they were handed. **A room does not.**
// It sequences a command among other seats' and broadcasts one frame, so:
//
//   - the reply to my command arrives in the same message as somebody else's,
//   - a frame carrying only their command has no promise waiting for it, and
//   - the tick count rides the frame, because the server owns the clock.
//
// So the contract grew one member — `onMessage(handler)`, which the worker
// transport never calls and this one calls per frame (the X1 review, item 1).
//
// **Nothing is applied when it is posted.** A command goes to the room and is
// applied to this client's own simulation when the frame carrying it comes
// back, in `(tick, seq)` order, exactly as it is on every other seat. A client
// that applied its own command early would be one city ahead of the room until
// the monthly hash found it — which is the desync the whole handshake exists to
// prevent. The optimistic half of a build is the GHOST, which is the renderer's
// and was never state (plan.md §3.2, ruling 003).
//
// The simulation here is `worker/sim-host.js`, the same one the worker thread
// runs and the same one `tools/room_soak.mjs`'s scripted clients run. This file
// is plumbing: it owns a socket, a sim host and a queue, and it decides nothing
// about the city.

import { createSimHost } from "../../worker/sim-host.js";
import { C2S, S2C, RESULT, PROTOCOL_VERSION } from "../../shared/protocol.js";
import { buildHash } from "../../shared/build-hash.js";
import { normaliseRoomCode } from "../../shared/roomcode.js";

/** A refusal the page has to be able to show: the CODE survives, because what
 * the player reads is `refused.<code>` from the catalogue and not a sentence
 * somebody wrote in a throw (X1b). */
function refusalError(reason) {
  const error = new Error(`the room refused this client: ${reason}`);
  error.refusal = reason;
  return error;
}

/**
 * @param url      where the room is
 * @param given    `{ room, seat, name }` — the code to name at the door, the
 *                 seat asked for, and what to call the mayor
 * @param hooks    `{ connect }`, injected so every path below is testable in
 *                 node. A self-recovering transport whose socket cannot be
 *                 replaced is one no test ever drives (`a fallback needs a
 *                 lever`).
 */
/** Where a seat's token is kept: per TAB, because two tabs are two players and
 * a token shared between them would be two clients claiming one seat. Every
 * read and write is wrapped — a private window, blocked site data or a preview
 * can throw, and a tab that cannot remember still has to play (X4a). */
function tokenStore(storage) {
  const key = (room) => `citygrid.seat.${room}`;
  return {
    get(room) {
      try { return storage?.getItem(key(room)) ?? undefined; } catch { return undefined; }
    },
    set(room, token) {
      try { storage?.setItem(key(room), token); } catch { /* a tab that cannot remember */ }
    },
  };
}

export function createSocketTransport(url, given = {}, { connect, storage } = {}) {
  const host = createSimHost();
  const tokens = tokenStore(storage ?? globalThis.sessionStorage);
  const socket = (connect ?? ((at) => new WebSocket(at)))(url);
  /** Posts waiting for the room, oldest first. A client knows no `seq` when it
   * sends, so a frame is matched to these FIFO — but **per seat is not enough**:
   * a frame carries commands for my seat that I never posted, because a seat
   * joining is a COMMAND the room issues on my behalf (X1's finding), and the
   * first cut of this resolved my first build with the result of my own
   * `CMD_JOIN`. So an entry has to be my seat AND the command I am waiting for.
   */
  const waiting = [];

  /** Is this frame entry the command that post is waiting for? The room echoes
   * the command it was given with `actor` filled in, so every key of mine has
   * to be there and equal; `actor` is the room's to decide, and a field the
   * room adds is not my business.
   *
   * **By value, never by reference.** The frame crossed a wire and was parsed,
   * so a drag-painted road's `runs` array is a different array with the same
   * numbers in it — the first cut of this compared references, matched the
   * `setTax` beside it and left every road command pending for ever. The fake
   * socket in `test/socket-transport.test.js` serialises for exactly this
   * reason. */
  function isMine(posted, inFrame) {
    if (posted === undefined || inFrame === undefined) return false;
    for (const key of Object.keys(posted)) {
      if (key === "actor") continue;
      const mine = posted[key];
      const theirs = inFrame[key];
      if (mine === theirs) continue;
      if (typeof mine === "object" && typeof theirs === "object"
        && JSON.stringify(mine) === JSON.stringify(theirs)) continue;
      return false;
    }
    return true;
  }
  /** Posted before the door opened. A command can be clicked in the same breath
   * as the join, and dropping it there is a race nothing could see. */
  const held = [];
  let joining;
  /** The balance, the catalogue and the quests, as the init message carried
   * them. Taken from the message rather than from `given`, so the simulation
   * here is handed exactly what every other transport is handed — a thread
   * running the engine's own mirrors instead of the page's data is W2's
   * 5,300-in-the-treasury defect, and a room is one more thread. */
  let content = given.content;
  /** The seat asked for, or **0 for "any"** — which is what the lobby sends,
   * because a player who typed a join code cannot know which seats are free and
   * the door is the only thing that does (X2b). Defaulting this to 1 made the
   * lobby's first joiner ask for a seat somebody was already in and be refused
   * `seatTaken`; `room_smoke`'s third browser is what said so. The real seat
   * comes back in the WELCOME. */
  let seat = Number(given.seat) || 0;
  let code = normaliseRoomCode(given.room);
  /** The room's own played clock, off the last frame (X1c, A63). Seconds,
   * because that is what the light cycle counts in. */
  let roomSeconds = 0;
  /** The room's clock and whose it is (X2d). Both come off the WELCOME, so a
   * client knows before its first frame whether to offer a speed control; the
   * speed is refreshed by every frame, because the host can turn it and nobody
   * else is told twice. */
  let roomSpeed = 1;
  /** Whether the room has started, and who has said they are ready (X2d).
   * Room metadata like the speed and the host: it rides the WELCOME and every
   * frame, because a lobby that had to ask would be a frame behind. */
  let started = true;
  let readySeats = [];
  let hostSeat = 0;
  /** Why the room ended this session, if it said (X2d). A kick is a REFUSED
   * followed by a close; a reaped room, a restarted server and a pulled cable
   * are a close with nothing before it, and the page has to tell those apart —
   * one has a sentence to show and the others have "the room could not be
   * reached". */
  let endedBecause;
  let endedListener;
  let listener;
  let chatListener;
  let closed = false;
  let nextId = 1;

  const say = (message) => socket.send(JSON.stringify(message));

  function flush() {
    while (held.length > 0) say(held.shift());
  }

  function sendOrHold(message) {
    if (joining?.open) say(message);
    else held.push(message);
  }

  socket.onopen = () => {
    // **Hosting or joining** (X2c). A `CREATE` carries the options and names no
    // room, because the room does not exist yet; the server makes one and
    // answers with its `WELCOME`, so everything after this line is the same
    // path for both and there is no second code path to keep in step.
    if (given.create !== undefined) {
      // `create` is the options a new region is generated from, or `{ save }`
      // to host a city that already exists (X2d). One or the other, and the
      // room tells them apart by which field arrived.
      say({
        type: C2S.CREATE,
        version: PROTOCOL_VERSION,
        build: buildHash(),
        options: given.create?.save === undefined ? given.create : undefined,
        save: given.create?.save,
        name: given.name,
      });
      return;
    }
    say({
      type: C2S.HELLO,
      version: PROTOCOL_VERSION,
      build: buildHash(),
      room: code,
      seat,
      name: given.name,
      spectate: given.spectate === true,
      // **What proves the seat is mine** (X4a). A seat somebody left is held
      // for a grace window, and without this a player who reloaded came back to
      // their own city as a stranger. Absent on a first join, which is what the
      // door expects.
      token: given.token ?? tokens.get(code),
    });
  };

  socket.onerror = () => fail(new Error("the room could not be reached"));
  socket.onclose = () => {
    closed = true;
    fail(new Error("the room closed the connection"));
    // **The session is over and the page has to say so** (X2d). Before this
    // nothing watched the close at all: a kicked, reaped or restarted room left
    // the player in a city that had quietly stopped receiving frames, with no
    // message and nothing to do — the worst shape a failure can take, because
    // it looks exactly like a game that is still running.
    endedListener?.(endedBecause);
  };

  /** Everything outstanding fails together: a promise that never settles is a
   * game that quietly stops responding (the worker transport's lesson). */
  function fail(error) {
    joining?.reject?.(error);
    joining = undefined;
    while (waiting.length > 0) waiting.shift().reject(error);
  }

  /** The city as it stands, as a reply the session can patch its mirror from.
   * `snapshot` asks the host for a FULL patch, which is what a joiner and a
   * resynced client both need. */
  const fullPatch = () => host.handle({ type: "snapshot", id: nextId++ }).reply;

  function onWelcome(message) {
    seat = Number(message.seat) || seat;
    code = message.room ?? code;
    if (typeof message.speed === "number") roomSpeed = message.speed;
    if (typeof message.started === "boolean") started = message.started;
    if (Array.isArray(message.ready)) readySeats = message.ready;
    if (typeof message.host === "number") hostSeat = message.host;
    // A fresh token every time, so a copied one is good for one return.
    if (message.token) tokens.set(code, message.token);
    const ready = host.handle({
      type: "init", id: nextId++, content, save: message.save,
    }).reply;
    if (ready.type === "error") { fail(new Error(ready.reason)); return; }
    const settle = joining;
    joining = { open: true };
    flush();
    settle?.resolve?.({ ...ready, type: "ready", seat });
  }

  /** One frame: every accepted command applied in the order the room sequenced
   * them, then the ticks it owes, then one patch for the lot. Mine resolve
   * their posts; the rest are pushed. */
  function onFrame(frame) {
    if (typeof frame.at === "number") roomSeconds = frame.at / 1000;
    if (typeof frame.speed === "number") roomSpeed = frame.speed;
    if (typeof frame.started === "boolean") started = frame.started;
    if (Array.isArray(frame.ready)) readySeats = frame.ready;
    const answered = [];
    let next = 0;                     // how far down `waiting` the frame has got
    const events = [];
    for (const entry of frame.cmds ?? []) {
      const outcome = host.handle({ type: "apply", id: nextId++, command: entry.command }).reply;
      for (const event of outcome.events ?? []) events.push(event);
      if (entry.seat === seat && isMine(waiting[next]?.command, entry.command)) {
        answered.push({ post: waiting[next], result: entry.result ?? outcome.result });
        next += 1;
      }
    }
    if (frame.ticks > 0) {
      const ticked = host.handle({ type: "tick", id: nextId++, count: frame.ticks }).reply;
      for (const event of ticked.events ?? []) events.push(event);
    }

    // One patch after the whole frame, not one per command: the frame is what
    // the room decided, and a mirror patched halfway through it is a city no
    // seat ever had.
    const reply = { ...fullPatch(), type: "result", result: RESULT.OK, events, room: frame.hash };
    waiting.splice(0, answered.length);
    for (const { post, result } of answered) post.resolve({ ...reply, result });
    // A frame nobody was waiting for still changed the city, and the session
    // has to hear about it or the mirror is the only thing that moved.
    if (answered.length === 0) listener?.({ ...reply, pushed: true });
  }

  function onSnapshot(message) {
    const ready = host.handle({
      type: "init", id: nextId++, content, save: message.save,
    }).reply;
    if (ready.type === "error") { fail(new Error(ready.reason)); return; }
    listener?.({ ...ready, type: "result", result: RESULT.OK, events: [], resynced: true });
  }

  socket.onmessage = (event) => {
    let message;
    try { message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)); }
    catch { return; }
    switch (message.type) {
      case S2C.WELCOME: onWelcome(message); break;
      case S2C.FRAME: onFrame(message); break;
      case S2C.SNAPSHOT: onSnapshot(message); break;
      case S2C.REFUSED:
        // **Soft is a result, hard is the end.** A rate limit is one command's
        // answer and never a disconnect (§3.7.3); anything else means the door
        // said no and the player has a sentence to read.
        if (message.soft) waiting.shift()?.resolve({ ...fullPatch(), type: "result", result: RESULT.RATE_LIMITED, events: [] });
        else {
          // Remembered for the close that follows: a kick arrives on a session
          // with nothing pending, so rejecting the (empty) queue tells nobody.
          endedBecause = message.reason;
          fail(refusalError(message.reason));
        }
        break;
      // **Chat** (X3b): its own listener, because it is not the city. Nothing
      // here reaches the reducer or the mirror — a line that could move a city
      // would be a liability for the sake of saying hello.
      case S2C.CHAT: chatListener?.({ seat: message.seat, text: message.text }); break;
      default: break;    // ROSTER and PONG are X4's and the lobby's
    }
  };

  return {
    get seat() { return seat; },
    /** The room this client is in, which the HUD shows and the lobby copies. */
    get room() { return code; },
    /** How long the room has PLAYED, in seconds. The light cycle reads it so
     * that every seat is at the same hour, and it holds still while the room is
     * paused (A41, A63). */
    get roomSeconds() { return roomSeconds; },
    /** **The server owns the clock** (plan.md §3.6). The session reads this and
     * keeps no interval of its own; the ticks ride the frames. */
    roomClock: true,
    /** What speed the ROOM is running at, and whether this client may change it
     * (X2d). The HUD reads both: a seat that is not the host gets no speed
     * control at all rather than one that does nothing — ruling 029's rule, and
     * the defect this slice is about. */
    get roomSpeed() { return roomSpeed; },
    get roomStarted() { return started; },
    get readySeats() { return readySeats; },
    /** This seat says it is ready, or takes it back (X2d). Nothing happens
     * locally: the room decides and every lobby hears it on the next frame, so
     * no client's list moves early. */
    setReady(value) { sendOrHold({ type: C2S.READY, ready: value === true }); },
    /** The host starts the room. Only the host may, and the ROOM is what
     * enforces that — a client-side check would be a suggestion. */
    start() { sendOrHold({ type: C2S.START }); },
    get isHost() { return seat > 0 && seat === hostSeat; },
    /** Ask the room to change speed. Nothing happens locally: the answer comes
     * back as the `speed` on the next frame, like every other fact about the
     * room, so a host whose message is refused sees the dial stay where it was
     * rather than snap back. */
    setRoomSpeed(next) {
      sendOrHold({ type: C2S.SPEED, speed: next });
    },
    /** The host removes a seat (X2d). Like the speed, nothing happens locally:
     * the room frees the chair and the city hears about it as the `CMD_LEAVE`
     * that rides the next frame, so every roster moves at once and none of them
     * moved early. */
    kick(seat) {
      sendOrHold({ type: C2S.KICK, seat });
    },
    /** Called once, when the room ends this session — with the door's refusal
     * code if it gave one, and `undefined` for a close with nothing before it.
     * The page shows the first and says "the room could not be reached" for the
     * second, which are different facts. */
    onEnded(handler) { endedListener = handler; },
    get closed() { return closed; },
    /** Commands posted and not yet answered by a frame. The number a gate waits
     * on rather than guessing at a delay. `held` is not added to it: a command
     * waiting for the door to open is in `waiting` too, and counting both made
     * one click read as two. */
    get pending() { return waiting.length; },
    /** The client's own city, for a gate and for the desync detector. */
    hash: () => host.hash?.() ?? fullPatch().hash,
    tick: () => fullPatch().tick,

    post(message) {
      if (closed) return Promise.reject(new Error("the room is closed"));
      if (message.type === "init") {
        if (message.content !== undefined) content = message.content;
        return new Promise((resolve, reject) => { joining = { resolve, reject, open: false }; });
      }
      if (message.type === "tick") {
        // **The room owns the clock** (plan.md §3.6). The session keeps an
        // interval in singleplayer and calls this; in a room the frames carry
        // the ticks, so this is a no-op rather than a failure — a throw here
        // would make `setSpeed` a thing the lobby had to know about.
        return Promise.resolve({ ...fullPatch(), type: "result", result: RESULT.OK, events: [] });
      }
      if (message.type === "apply") {
        return new Promise((resolve, reject) => {
          waiting.push({ resolve, reject, command: message.command });
          sendOrHold({ type: C2S.COMMAND, command: message.command });
        });
      }
      if (message.type === "save") return Promise.resolve(host.handle({ type: "save", id: nextId++ }).reply);
      return Promise.reject(new Error(`a room cannot answer "${message.type}"`));
    },

    onMessage(handler) { listener = handler; },

    /** Chat, in and out (X3b). Deliberately not `post`/`onMessage`: those carry
     * the CITY, and a line of chat is not state, not ordered against commands,
     * and not something a client can diverge by missing. */
    onChat(handler) { chatListener = handler; },
    say(text) { sendOrHold({ type: C2S.CHAT, text }); },

    /** **Ask the room to put this client back** (X1c, the omissions round).
     *
     * `server/index.js` has answered `C2S.RESYNC_REQUEST` since X1a and this
     * transport has handled the `S2C.SNAPSHOT` that comes back since it was
     * written — and nothing in the page connected the two, so the session's
     * desync detector printed `DESYNC` and left the client wrong for ever.
     * `tools/room_soak.mjs` was the only thing in the project that had ever
     * sent one, which is exactly what a capability with no control looks like.
     */
    resync() { sendOrHold({ type: C2S.RESYNC_REQUEST }); },

    dispose() {
      listener = undefined;
      held.length = 0;
      // **Rejected, not dropped.** The first cut emptied `waiting` and left
      // every outstanding promise unsettled, which is a game that stops
      // responding without saying why — the same defect the worker transport
      // has an `onerror` for.
      closed = true;
      fail(new Error("the room was closed by this client"));
      try { socket.close(); } catch { /* a socket that is already gone */ }
    },
  };
}
