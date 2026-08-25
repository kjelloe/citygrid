// The wire and save contract.
//
// A PWA caches its own client, so after every deploy the DEFAULT case is a
// stale client meeting a new server. A mismatched reducer desyncs silently,
// which is the worst way to find out. The handshake makes it loud instead.

export const PROTOCOL_VERSION = 1;

/** Bumped whenever the rules change — engine/ or data/. Set by the build step;
 * "dev" locally, where a mismatch is expected and tolerated. */
export const BUILD_HASH = "dev";

export const SAVE_VERSION = 1;

/** Client → server. */
export const C2S = Object.freeze({
  HELLO: "hello",
  COMMAND: "cmd",
  RESYNC_REQUEST: "resync",
  PING: "ping",
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
