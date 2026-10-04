// The wire and save contract.
//
// A PWA caches its own client, so after every deploy the DEFAULT case is a
// stale client meeting a new server. A mismatched reducer desyncs silently,
// which is the worst way to find out. The handshake makes it loud instead.

// **2 since X3a**, because `C2S.PING` became `C2S.LATENCY`: a message name is
// the wire, so renaming one is a protocol change whether or not anybody is
// speaking it yet. Nothing outside this repo is — X1 is headless and the client
// half is unbuilt — which is exactly when a version bump is free.
export const PROTOCOL_VERSION = 2;

/** Which build's RULES these are — `engine/`, `shared/` and `data/`, hashed by
 * `tools/make_precache.mjs` into `client/precache.json` and handed in at boot
 * (X0). It was a literal `"dev"` until then, which meant the handshake could
 * only ever compare two identical strings. `shared/build-hash.js` holds it. */
export { buildHash, setBuildHash } from "./build-hash.js";

export const SAVE_VERSION = 3;

/** Client → server. */
export const C2S = Object.freeze({
  HELLO: "hello",
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
  ROOM_CLOSED: "roomClosed",
  BAD_CODE: "badCode",
  BANNED: "banned",
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
});

/** Server-side caps. Deliberately here rather than in the server, so the
 * client can refuse to build an oversized command instead of having it
 * rejected after the fact. */
export const LIMITS = Object.freeze({
  COMMANDS_PER_SECOND: 20,
  CELLS_PER_COMMAND: 4096,
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
