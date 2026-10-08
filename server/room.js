// One room is one city (X1, slice 5.1).
//
// Descends from `../CarrierDominion/server/app.js` — one authoritative state, a
// queue drained on a beat, a frame broadcast to every connection — and from its
// `doorman.js` for the shape of a refusal with a reason. It is not that code:
// that game hosts one war per process and this one hosts rooms, its state is
// units and this one's is a city, and the whole of its wire is snapshots while
// this one's is commands (plan.md §3.6 says why).
//
// **Commands cross the wire, not state.** The room holds the only authoritative
// city; every client runs the same reducer over the same accepted commands in
// `(tick, seq)` order and compares hashes once a sim-month. There is no fog in a
// city builder, so one frame serves every socket.
//
// No sockets in this file. A connection is anything with `send(message)`, which
// is what lets `test/room.test.js` run a whole room in node — and what makes the
// socket in `server/index.js` a detail rather than the design.

import { apply } from "../engine/reducer.js";
import { hashState } from "../engine/state.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { toSave, fromSave } from "../engine/save.js";
import { CMD_TICK, CMD_JOIN, CMD_SET_STATUS } from "../engine/commands.js";
import { TICKS_PER_MONTH, PLAYER_ACTIVE, PLAYER_REGENT } from "../engine/constants.js";
import { C2S, S2C, REFUSAL, PROTOCOL_VERSION, compatible, LIMITS } from "../shared/protocol.js";
import { makeRoomCode, normaliseRoomCode } from "../shared/roomcode.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { buildHash } from "../shared/build-hash.js";
import { randomBytes } from "node:crypto";
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

/** Ticks a room owes **per SECOND** at each speed (plan.md §3.6): 1× is two
 * fast ticks a second, which is one sim-month every six seconds. Speed 0 is a
 * room whose clock a test drives by hand.
 *
 * **These were applied per BEAT until X1d**, and a beat is 100 ms — so a room
 * ran at 20 ticks a second where singleplayer's play speed is 2.5 (one tick
 * every 400 ms), and a city in a room aged **eight times faster** than the same
 * city on one machine. `room_smoke` measured it as soon as a browser could join
 * one: tick 364 at 18.259 s of room time, 19.9 ticks a second. The spec says
 * both things in one paragraph — "1× = 2 fast ticks/s (one sim-month per 6 s)"
 * and then "a pump does at most ~2 fast ticks" — and so did the test, whose
 * comment read "two fast ticks a second" above an assertion of 24 ticks in
 * 1.2 seconds. Singleplayer is the tie-breaker: a room is the same game. */
const TICKS_PER_SECOND = [0, 2, 6, 16];

let tokens = 0;
const nextToken = () => `seat-${(tokens += 1)}-${Math.floor(Date.now() % 1e6)}`;

/** How long a seat somebody has left stays theirs (X4a). Held for ever is a
 * room that fills up with ghosts; let go at once is a player whose train went
 * into a tunnel losing a city to whoever typed the code next. */
const HELD_FOR_MS = 2 * 60 * 1000;

/** How long a seat is empty before the deputy takes it over (X4b).
 *
 * Longer than the hold, and deliberately a different clock: letting SOMEBODY
 * ELSE take the seat and handing the city to a deputy are two different
 * decisions, and a player whose train has gone into a tunnel is not absent yet.
 * Fifteen minutes — long enough that a reconnect beats it, short enough that a
 * city is not left standing still for an evening. */
const REGENCY_AFTER_MS = 15 * 60 * 1000;

/**
 * A room over one city.
 *
 * `given` is `{ options }` to generate one or `{ save }` to host one that was
 * saved — hosting from a save is §3.3's "the world never pauses", seen from the
 * other end. `given.code` is the join code; a room that is not told one mints
 * its own, because a room with no code is one anybody who finds the socket is
 * in (X2a).
 */
export function createRoom(given = {}) {
  // A room is generated, or RESTORED. The first cut of this had the save branch
  // return `{ ok: true, state: undefined }` — a room with no city in it, which
  // looked supported and was not; nothing called it, so nothing said so.
  // `fromSave` is the same function the client restores through, checksum and
  // migrations included (X3a made that version 3).
  const world = given.save === undefined
    ? generateWorld(defaultOptions(given.options))
    : fromSave(given.save);
  if (!world.ok) throw new Error(`a room could not start: ${world.reason}`);
  const state = world.state;
  // The room's own name, as six characters a player can read out
  // (`shared/roomcode.js`). A room restored from the store is given the code it
  // had, because the code is what the people who were in it still have.
  const code = normaliseRoomCode(given.code) || makeRoomCode(randomBytes(6));
  const seats = new Map();
  /** Connections watching without playing (X4e). They take no seat — so a full
   * room is still watchable — get no token, because there is nothing to come
   * back to, and receive every frame, because watching a still picture is not
   * watching. They are **not** counted as somebody for the hibernation rule:
   * a city nobody is steering should not run because a tab is open on it. */
  const watchers = new Set();
  /** Seats whose player has gone, by seat: `{ token, since }`. **The token has
   * been handed out in every WELCOME since X1a and nothing has ever checked
   * one** — so a player whose connection dropped lost their treasury, their
   * land and their city to whoever asked next. It is checked here, and the
   * seat is held rather than freed (X4a). */
  const held = new Map();
  const heldForMs = given.heldForMs ?? HELD_FOR_MS;
  const regencyAfterMs = given.regencyAfterMs ?? REGENCY_AFTER_MS;
  /** Deputies for the seats nobody is sitting in, by seat. **Not in state**:
   * the cursor and the doctrine are the SERVER's, the deputy draws from its own
   * stream (era 8), and every client learns what it did from the commands that
   * ride the frame rather than by running one of its own. A second simulation
   * is a second answer. */
  const regents = new Map();
  /** When each empty seat was last sat in, by the same clock the hold uses. */
  const emptySince = new Map();
  const queue = [];
  let seq = 0;
  let lastHashedMonth = -1;
  /** Milliseconds this room has PLAYED — the hour every seat shares (X1c, A63).
   *
   * Not the tick, which A41 rejected with a measurement: at the play speed a
   * tick is 400 ms, so the sun raced whenever the game sped up, and the light
   * is scenery rather than simulation. Not each client's own wall clock either,
   * because a late joiner's noon would be somebody else's night. The room's
   * wall clock is the only one that is both slow and shared.
   *
   * It stops while the room is paused, because a paused city is a held moment
   * (A41) — and the PUMP does not stop, which is CLAUDE.md's "degrade the game
   * clock, never the pump". It is never hashed: scenery is not state. */
  let playedMs = 0;
  /** Thousandths of a tick owed and not yet taken. Integer, so no float enters
   * the count, and carried rather than dropped — a slow beat must not lose the
   * time it took, or a room under load runs slower than the clock says. */
  let tickCredit = 0;
  let speed = given.speed === undefined ? 1 : given.speed;

  const broadcast = (message) => {
    for (const { connection } of seats.values()) connection.send(message);
    for (const connection of watchers) connection.send(message);
  };

  /**
   * What the empty seats did this beat (X4b).
   *
   * Two clocks, deliberately: `heldForMs` is how long a seat stays ITS OWN —
   * the token is what opens it — and `regencyAfterMs` is how long before the
   * city is handed to a deputy. A player whose train has gone into a tunnel is
   * not absent yet, and letting somebody else sit down is a different decision
   * from letting a deputy build.
   *
   * Everything here is applied through `apply` and returned as a command, so a
   * client replaying the frame reaches the same city.
   */
  function regencyWork(at) {
    const work = [];
    for (let seat = 1; seat <= state.options.seats; seat += 1) {
      const player = state.players.find((p) => p.seat === seat);
      if (!player) continue;
      const sitting = seats.has(seat);
      if (sitting) {
        emptySince.delete(seat);
        // Back at the keys: the deputy stands down, and the status says so.
        if (player.status === PLAYER_REGENT) {
          regents.delete(seat);
          work.push(setStatusFor(seat, PLAYER_ACTIVE));
        }
        continue;
      }
      // Normally stamped by `leave` — the seat became empty when they left, not
      // when the next beat noticed — but a room restored from the disk has
      // seats nobody has ever sat in, and those start their clock here.
      if (!emptySince.has(seat)) emptySince.set(seat, at);
      if (player.status === PLAYER_REGENT) {
        const deputy = regents.get(seat);
        if (deputy) {
          // **Every command the turn issued, not the first.** One `deputyTurn`
          // a beat is what keeps a regency from out-building a person; a turn
          // itself may be several commands — a wire run and then the thing it
          // powers — and the deputy has already APPLIED all of them to this
          // state. Reporting one would leave every client short of the rest,
          // which is what the replay assertion in `test/room.test.js` caught.
          deputyTurn(state, deputy, (outcome, command) => {
            if (command !== undefined) work.push({ seat, command, result: outcome.result });
          });
        }
        continue;
      }
      if (at - emptySince.get(seat) < regencyAfterMs) continue;
      regents.set(seat, makeDeputy(seat, state.options.doctrine));
      work.push(setStatusFor(seat, PLAYER_REGENT));
    }
    return work;
  }

  /** Applied here and returned as a command, because the room is issuing it on
   * a seat's behalf and every client has to apply the same one. */
  function setStatusFor(seat, status) {
    const command = { type: CMD_SET_STATUS, actor: seat, status };
    const outcome = apply(state, command);
    return { seat, command, result: outcome.result };
  }

  /** The lowest seat nobody is sitting in, or 0 when the room is full. Lowest
   * rather than next, so a room whose middle seat has been left is filled
   * before its last one. */
  function firstFreeSeat(at) {
    for (let seat = 1; seat <= state.options.seats; seat += 1) {
      if (!seats.has(seat) && !isHeld(seat, at)) return seat;
    }
    return 0;
  }

  /** Is this seat still its last player's? The clock is an argument for the
   * same reason the pump's is: a hold that read the clock itself could not be
   * tested in a millisecond. */
  function isHeld(seat, at = Date.now()) {
    const hold = held.get(seat);
    if (hold === undefined) return false;
    if (at - hold.since < heldForMs) return true;
    held.delete(seat);
    return false;
  }

  /**
   * A client at the door (plan.md §3.9). The handshake is the whole of it: a
   * client one deploy behind is refused with a reason it can show, rather than
   * admitted to diverge silently.
   */
  function join(connection, hello) {
    const refuse = (reason) => {
      connection.send({ type: S2C.REFUSED, reason });
      return reason;
    };
    if (!hello || hello.type !== C2S.HELLO) return refuse(REFUSAL.MALFORMED);
    // **Which room?** (X2a.) Normalised HERE and not only in the lobby: the
    // decision belongs where the door is, or the lobby is the only client that
    // can ever open one. A hello that names no room is refused like one that
    // names the wrong room — before X2a the door asked nothing at all.
    if (normaliseRoomCode(hello.room) !== code) return refuse(REFUSAL.BAD_CODE);
    const mismatch = compatible(hello.version, hello.build, buildHash());
    if (mismatch) return refuse(mismatch);

    // **Watching, not playing** (X4e). Before the seat arithmetic, because a
    // watcher takes no seat: a room refusing one because every seat is taken
    // would be a rule about the wrong thing.
    if (hello.spectate === true) {
      watchers.add(connection);
      connection.send({
        type: S2C.WELCOME,
        seat: 0,
        protocol: PROTOCOL_VERSION,
        build: buildHash(),
        tick: state.tick,
        hash: hashState(state),
        room: code,
        save: JSON.parse(JSON.stringify(toSave(state))),
      });
      return "";
    }
    // **No seat named means "any"** (X2b). A player who types a join code cannot
    // know which seats are taken and the door is the only thing that does; this
    // used to default to seat 1, so the second person to join by code was
    // refused `SEAT_TAKEN` and had to guess. A seat asked for BY NUMBER is
    // still honoured, which is what lets somebody come back to their own.
    const asked = Number(hello.seat) || 0;
    const at = Number.isFinite(hello.at) ? hello.at : Date.now();
    const seat = asked > 0 ? asked : firstFreeSeat(at);
    if (seat === 0) return refuse(REFUSAL.ROOM_FULL);
    // `SEAT_TAKEN`, not `ROOM_FULL` (X1b): the room may have three seats free.
    if (seats.has(seat)) return refuse(REFUSAL.SEAT_TAKEN);
    // **A seat somebody left is theirs for a while, and the token proves it**
    // (X4a). Refused as `SEAT_TAKEN` rather than with a reason of its own: to
    // everybody but its owner a held seat is simply occupied, and a refusal
    // that said "held" would tell a stranger exactly how long to wait.
    if (isHeld(seat, at) && held.get(seat).token !== hello.token) return refuse(REFUSAL.SEAT_TAKEN);
    held.delete(seat);
    if (seats.size >= state.options.seats) return refuse(REFUSAL.ROOM_FULL);

    // **A seat joining is a COMMAND, not a side effect.** `CMD_JOIN` adds a
    // player and touches `lastSeenTick`, which is hashed — so a room that
    // applied it here would change the city without telling the clients that
    // were already in it, and every one of them would diverge at the next
    // monthly hash. `test/room.test.js` caught exactly that. It is queued like
    // anything else, and the WELCOME below is the city BEFORE it: the joiner
    // applies its own arrival from the next frame, in the same order everybody
    // else does.
    //
    // A reconnecting seat is not a new player and must not re-join: the command
    // would move a hashed field for nothing (the same reason `game.js` skips it
    // for a restored save).
    if (!state.players.some((p) => p.seat === seat)) {
      queue.push({ seat, command: { type: CMD_JOIN, actor: seat, seat, name: hello.name || `Mayor ${seat}` } });
    }
    const token = nextToken();
    seats.set(seat, { connection, token, seat });
    connection.send({
      type: S2C.WELCOME,
      seat,
      token,
      room: code,
      protocol: PROTOCOL_VERSION,
      build: buildHash(),
      tick: state.tick,
      hash: hashState(state),
      // The city as BYTES, copied. `toSave` aliases the live state — `disaster`,
      // `quests`, `requests` and the players are references into it — so a save
      // handed out and held is a window into the room: it stopped matching its
      // own hash the moment the next seat joined, which is how this was found.
      // A socket serialises it anyway; doing it here means the in-process room
      // behaves the same as the wire one.
      save: JSON.parse(JSON.stringify(toSave(state))),
    });
    return "";
  }

  /** A command from a seat, queued for the next beat. Never applied here: the
   * order commands are applied in is the pump's, and it is the same order on
   * every machine (plan.md §3.2). */
  function submit(seat, command) {
    if (queue.length >= LIMITS.CELLS_PER_COMMAND) return false;
    queue.push({ seat, command });
    return true;
  }

  /** One beat: drain, sequence, validate, advance, broadcast. */
  function beat() {
    const cmds = [];
    // **The regency, before anything else in the beat** (X4b). Deterministic
    // for every client because what it produces are COMMANDS: they are
    // sequenced into this frame like a player's and replayed in the same order
    // everywhere. A deputy that mutated the server's state without telling
    // anybody would be a desync at the next monthly hash.
    for (const entry of regencyWork(at)) {
      seq += 1;
      cmds.push({ seq, seat: entry.seat, command: entry.command, result: entry.result });
    }
    for (const { seat, command } of queue.splice(0)) {
      seq += 1;
      // Validated through the same reducer every client runs. A refusal rides
      // the frame too: a client that did not hear about it would be one command
      // ahead of the room for ever.
      const outcome = apply(state, { ...command, actor: command.actor ?? seat });
      cmds.push({ seq, seat, command: { ...command, actor: command.actor ?? seat }, result: outcome.result });
    }
    const ticks = SPEEDS[speed] ?? 0;
    for (let n = 0; n < ticks; n += 1) apply(state, { type: CMD_TICK });
    // The played clock follows the SPEED, not the tick count: a beat that owes
    // no whole tick yet is still time the room spent running, and the hour has
    // to advance through it (X1c).
    if (rate > 0) playedMs += ran;

    const frame = { type: S2C.FRAME, tick: state.tick, seq, cmds, ticks, at: playedMs };
    // The hash rides the frame once a sim-month (plan.md §3.7.9): often enough
    // that a drift cannot reach a save, rare enough that it is not the cost the
    // room is paying to avoid.
    const month = Math.floor(state.tick / TICKS_PER_MONTH);
    if (month !== lastHashedMonth) {
      lastHashedMonth = month;
      frame.hash = hashState(state);
    }
    broadcast(frame);
    return frame;
  }

  /**
   * The city as it stands, for a client whose hash disagreed. Loud by
   * construction: nothing asks for one unless something was wrong.
   *
   * **A resync is a re-join, and carries a SAVE rather than a patch.** The
   * first cut sent `snapshotOf(state)` — the same `{layers, rest}` the worker
   * sends — and `tools/room_soak.mjs` found it healed nothing: a patch rebuilds
   * the client's MIRROR, and the client's own simulation, which is the thing
   * that had diverged, writes over it at the very next frame (the mirror is
   * overwritten by the next patch). What a diverged client needs is the city as
   * bytes, to start its reducer again from — which is exactly what WELCOME
   * already carries, so there is one shape for both and not two.
   */
  function resync(connection, seat) {
    const message = {
      type: S2C.SNAPSHOT, seat, tick: state.tick, hash: hashState(state),
      save: JSON.parse(JSON.stringify(toSave(state))),
    };
    connection.send(message);
    return message;
  }

  return {
    state,
    code: () => code,
    /** Say something to every seat in the room (X3b). Not a command and not a
     * frame: chat never reaches the reducer, so it rides its own message and a
     * client that misses one has not diverged. */
    broadcast,
    join,
    submit,
    beat,
    resync,
    hash: () => hashState(state),
    tick: () => state.tick,
    /** The city as bytes a store or a joiner can keep — copied, because
     * `toSave` aliases the live state (see `join`). */
    save: () => JSON.parse(JSON.stringify(toSave(state))),
    seats: () => [...seats.values()].map(({ seat, token }) => ({ seat, token })),
    setSpeed(next) {
      speed = Math.max(0, Math.min(TICKS_PER_SECOND.length - 1, Math.floor(next)));
      return speed;
    },
    /** A player's connection has gone. The seat is HELD, not freed (X4a): their
     * city is still theirs for `heldForMs`, and the token in their last WELCOME
     * is what gets them back into it. */
    /** A watcher's connection has gone. Separate from `leave`, because there is
     * no seat to hold and nothing to come back to. */
    stopWatching(connection) { watchers.delete(connection); },
    leave(seat, at = Date.now()) {
      const sitting = seats.get(seat);
      seats.delete(seat);
      if (sitting) held.set(seat, { token: sitting.token, since: at });
      // The regency clock starts HERE, not at the next beat: the seat became
      // empty when they left, and starting it a beat later would make the
      // window depend on the pump's phase.
      if (sitting) emptySince.set(seat, at);
    },
  };
}
