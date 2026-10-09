// The wire and save contract.
//
// A PWA caches its own client, so after every deploy the DEFAULT case is a
// stale client meeting a new server. A mismatched reducer desyncs silently,
// which is the worst way to find out. The handshake makes it loud instead.

// **3 since X2a**, because `HELLO` must now name the room it means: a message
// that gains a REQUIRED field is as much a wire change as a renamed one, and an
// old client sending no `room` is refused rather than admitted to a room it did
// not ask for. 2 was X3a, where `C2S.PING` became `C2S.LATENCY`. Nothing
// outside this repo speaks either — X1 is headless and the client half is
// unbuilt — which is exactly when a version bump is free.
export const PROTOCOL_VERSION = 3;

/** Which build's RULES these are — `engine/`, `shared/` and `data/`, hashed by
 * `tools/make_precache.mjs` into `client/precache.json` and handed in at boot
 * (X0). It was a literal `"dev"` until then, which meant the handshake could
 * only ever compare two identical strings. `shared/build-hash.js` holds it. */
export { buildHash, setBuildHash } from "./build-hash.js";

export const SAVE_VERSION = 8;

/** Client → server. */
export const C2S = Object.freeze({
  HELLO: "hello",
  // X2c: hosting. A room has to exist before a `HELLO` can name it, so this is
  // the one message that arrives with no room — the server makes one from the
  // options, registers it by code, and answers with the `WELCOME` of the room
  // it just made. **No version bump:** a message type that is only ever SENT by
  // a newer client is additive, unlike X2a's required field on an existing one.
  CREATE: "create",
  COMMAND: "cmd",
  RESYNC_REQUEST: "resync",
  // `"latency"`, not `"ping"` (X3a). The engine gained a `ping` COMMAND — a
  // player's "look at this", which rides the command stream in order like
  // everything else — and this is a round-trip timing probe that never reaches
  // the reducer. Two different things with one name on one wire is a message
  // that gets handled by whichever reader saw it first, and the nested command
  // type would have been indistinguishable from the top-level message type to
  // anybody reading the protocol. `test/protocol.test.js` pins the two
  // namespaces as disjoint.
  LATENCY: "latency",
  CHAT: "chat",
  // **The room's clock, which only the host may turn** (X2d). The tick count
  // rides the frame (plan.md §3.6), so speed is the ROOM's and never the
  // state's — a seat that ran its own interval would tick a city the room never
  // ticked, and the symptom would be a desync with no local cause. Before this
  // the speed button in a room changed its own label and nothing else: the
  // server had `room.setSpeed` with no caller and there was no message between
  // them. **No version bump:** a type only ever SENT by a newer client is
  // additive, which is the reasoning X2c's `CREATE` used.
  SPEED: "speed",
  // **The host removes a seat** (X2d). Not a command: the seat, the socket and
  // the token are the ROOM's and none of them is in the state, so this rides
  // the wire like the speed does — and the city learns about it as the
  // `CMD_LEAVE` the room queues on the kicked seat's behalf, which every client
  // replays in order like any other. Additive, so no version bump.
  KICK: "kick",
  // **X2d's last rows.** A seat says it is ready and the host starts the room.
  // Both are ROOM metadata and neither is a command: nothing about who pressed
  // a button belongs in a city's replay.
  READY: "ready",
  START: "start",
});

/** Server → client. */
export const S2C = Object.freeze({
  WELCOME: "welcome",
  REFUSED: "refused",
  SNAPSHOT: "snapshot",
  FRAME: "frame",
  ROSTER: "roster",
  PONG: "pong",
  CHAT: "chat",
});

export const REFUSAL = Object.freeze({
  VERSION_MISMATCH: "versionMismatch",
  BUILD_MISMATCH: "buildMismatch",
  ROOM_FULL: "roomFull",
  // X1b: a room with one of four seats taken is not full, and a player told it
  // is will not try another seat. `join` had been answering `ROOM_FULL` for
  // both, which is a refusal that lies about what to do next.
  SEAT_TAKEN: "seatTaken",
  ROOM_CLOSED: "roomClosed",
  // **X2d: the room started without you.** `lateJoin: false` refuses a seat
  // that has never played once the host has started the clock — and it needs
  // its own sentence rather than `ROOM_CLOSED`, which tells a player the room
  // is gone when it is running happily and simply not taking anybody new.
  ROOM_STARTED: "roomStarted",
  BAD_CODE: "badCode",
  // X2a: `BAD_CODE` meant "no room with that code" and was also what the door
  // gave a message that is not a hello at all — telling a player to check a
  // code they typed correctly, when what is wrong is the client. The same shape
  // as X1b's `ROOM_FULL` for a taken seat: a refusal that lies about what to do
  // next.
  MALFORMED: "malformed",
  BANNED: "banned",
  // **X2d: hosting from a save.** A `CREATE` may carry a city instead of a seed,
  // and a file the room cannot read needs its own sentence — it was answered
  // `BAD_CODE` ("No room with that code"), which is a refusal that lies about
  // what to do next in exactly the way X1b's `ROOM_FULL` did for a taken seat.
  // Additive for a client that has words for it; one that does not falls back
  // to the generic failure, which is what `refusalKey` returning `undefined`
  // is for.
  BAD_SAVE: "badSave",
  RATE_LIMIT: "rateLimit",
});

/** Command results. Every rejection is one of these — the client turns it into
 * a localised toast, and no rejection is ever a silent no-op. */
export const RESULT = Object.freeze({
  OK: "ok",
  INVALID: "invalid",
  NO_FUNDS: "noFunds",
  NEEDS_BULLDOZE: "needsBulldoze",
  NOT_OWNER: "notOwner",
  OUT_OF_SECTOR: "outOfSector",
  MODE_FORBIDDEN: "modeForbidden",
  RATE_LIMITED: "rateLimited",
  // T5: the two refusals the catalogue can give. Both were `INVALID` in the
  // first cut, which is the "0 tiles" problem again — a player told "that
  // cannot go there" about a building that is merely not earned yet learns
  // nothing, and tries the same tile again.
  LOCKED: "locked",
  ALREADY_BUILT: "alreadyBuilt",
  // H6 (A100): ground a street could not climb is ground nobody may zone. Its
  // own code for the same reason as the two above — "that cannot go there" about
  // a hillside teaches nothing, and the player is standing on the reason.
  TOO_STEEP: "tooSteep",
  // L1: the loan ceiling is a rank's, and "not enough money" is the wrong
  // sentence for it — the bank's answer is about what you have borrowed, not
  // about what you have. Its own code, with its words in both catalogues
  // (ruling 027).
  AT_CEILING: "atCeiling",
  // X3c: §25.4's derelict override. "That belongs to somebody else" is the
  // wrong sentence when the ground IS somebody else's and the answer is about
  // the clock — the ruin has not stood long enough yet.
  NOT_DERELICT: "notDerelict",
});

/** Server-side caps. Deliberately here rather than in the server, so the
 * client can refuse to build an oversized command instead of having it
 * rejected after the fact. */
export const LIMITS = Object.freeze({
  COMMANDS_PER_SECOND: 20,
  CELLS_PER_COMMAND: 4096,
  /** The biggest frame the door will read, in bytes (X2d).
   *
   * It was `CELLS_PER_COMMAND * 8` — the biggest COMMAND there is — and that
   * was right until one message type began carrying a city: a `CREATE` that
   * hosts a saved city sends the save, and a save is **14 KB on a 48x48 and
   * 89 KB on a 128x128** (measured 2026-10-09). The old ceiling was 32 KB, so
   * hosting from a save was refused by the transport before the server saw it.
   *
   * Half a megabyte is six times the biggest city this project generates, and
   * still far below anything a client sends by accident. **It is a ceiling, not
   * a budget**: `ws` closes the socket at 1009 and `server/index.js` has to
   * survive that, which is its own rule — a client must not be able to end a
   * room by sending something large.
   */
  MESSAGE_BYTES: 512 * 1024,
  PENDING_REQUESTS_PER_PAIR: 3,
  TITLE_BYTES: 64,
  REASON_BYTES: 240,
  NAME_BYTES: 24,
  CHAT_BYTES: 240,
  SEATS_MAX: 16,
});

export function compatible(clientVersion, clientBuild, serverBuild) {
  if (clientVersion !== PROTOCOL_VERSION) return REFUSAL.VERSION_MISMATCH;
  // "dev" builds are allowed to differ: a developer's client and server are
  // rebuilt at different moments and blocking that would be theatre.
  if (clientBuild !== serverBuild && clientBuild !== "dev" && serverBuild !== "dev") {
    return REFUSAL.BUILD_MISMATCH;
  }
  return "";
}
