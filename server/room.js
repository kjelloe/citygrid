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
import { CMD_TICK, CMD_JOIN } from "../engine/commands.js";
import { TICKS_PER_MONTH } from "../engine/constants.js";
import { C2S, S2C, REFUSAL, PROTOCOL_VERSION, compatible, LIMITS } from "../shared/protocol.js";
import { buildHash } from "../shared/build-hash.js";
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

/** Ticks a pump owes at each speed (plan.md §3.6): 1× is two fast ticks a
 * second, which is one sim-month every six seconds. Speed 0 is a room whose
 * clock a test drives by hand. */
const SPEEDS = [0, 2, 6, 16];

let tokens = 0;
const nextToken = () => `seat-${(tokens += 1)}-${Math.floor(Date.now() % 1e6)}`;

/**
 * A room over one city.
 *
 * `given` is `{ options }` to generate one or `{ save }` to host one that was
 * saved — hosting from a save is §3.3's "the world never pauses", seen from the
 * other end.
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
  const seats = new Map();
  const queue = [];
  let seq = 0;
  let lastHashedMonth = -1;
  let speed = given.speed === undefined ? 1 : given.speed;

  const broadcast = (message) => {
    for (const { connection } of seats.values()) connection.send(message);
  };

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
    if (!hello || hello.type !== C2S.HELLO) return refuse(REFUSAL.BAD_CODE);
    const mismatch = compatible(hello.version, hello.build, buildHash());
    if (mismatch) return refuse(mismatch);
    const seat = Number(hello.seat) || 1;
    if (seats.has(seat)) return refuse(REFUSAL.ROOM_FULL);

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

    const frame = { type: S2C.FRAME, tick: state.tick, seq, cmds, ticks };
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
      speed = Math.max(0, Math.min(SPEEDS.length - 1, Math.floor(next)));
      return speed;
    },
    leave(seat) { seats.delete(seat); },
  };
}
