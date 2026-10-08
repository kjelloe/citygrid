// What a room will carry between players (X3b).
//
// Chat is **not a command**. It never reaches the reducer, it is not hashed
// state, and a client that misses a line has not diverged — which is the whole
// design: a message that could desync a city would be a liability for the sake
// of saying hello.
//
// So the safety is all on the way in, and it is the server's: the client
// renders what arrives as plain text and never as markup, and everything below
// happens before a line is broadcast. `chatEnabled` has been an option since
// Wave 0 with nothing reading it, and it is **off by default** — the right
// default for a room anybody can join with a code.

import { sanitiseText } from "../engine/validate.js";
import { LIMITS } from "../shared/protocol.js";

/** Lines a seat may say in one second. Deliberately smaller than
 * `LIMITS.COMMANDS_PER_SECOND`: a chat line costs every client a repaint,
 * nobody types four lines a second in good faith, and the two budgets are
 * separate so that a player who talks a lot does not lose the ability to build
 * — or the other way round. */
export const CHATS_PER_SECOND = 4;

/**
 * @returns `{ ok: true, seat, text }` — the line as it will be broadcast — or
 *   `{ ok: false, reason }`. The reasons are told apart because they ask the
 *   player to do different things: a room with chat off is not the same
 *   as a line with nothing in it.
 */
export function chatFrom(state, seat, text) {
  if (state?.options?.chatEnabled !== true) return { ok: false, reason: "disabled" };
  // The same sanitiser the reducer uses for a request title (`engine/validate.js`):
  // control ranges and line separators become spaces, runs of whitespace
  // collapse, and the cap is in BYTES — a line of Norwegian is not the same
  // number of characters as a line of English. Two rules for one idea would be
  // two that can disagree.
  const clean = sanitiseText(text, LIMITS.CHAT_BYTES);
  if (clean.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, seat, text: clean };
}
