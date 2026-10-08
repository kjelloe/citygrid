// The join code (X2a, slice 5.2).
//
// A room is addressed by six characters a player reads off one screen and types
// into another, or says out loud down a telephone. Two things follow.
//
// **The alphabet is a decision.** `O` beside `0`, or `1` beside `I` and `l`, is
// a room nobody can join and a support question nobody can answer. This is
// Crockford base32 — the standard answer to this exact problem, which has the
// normalisation written down rather than invented here: `I`, `L`, `O` and `U`
// are not in it, and the first three are read back as `1`, `1` and `0`. `U` is
// out so that six characters cannot spell something a player would rather not
// read aloud. Thirty-two is also the only size that makes a byte unbiased, and
// `test/roomcode.test.js` counts that rather than trusting it.
//
// **A typed code is untrusted input**, like a request title or a player name
// (CLAUDE.md's multiplayer invariants). It is capped before it is walked, only
// separators are removed, and anything else comes back empty — a normaliser
// that STRIPS what it does not recognise would turn `"<script>ABCDEF"` into a
// code that joins a room.

export const ROOM_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ROOM_CODE_LENGTH = 6;

/** What a player may type between the characters and have it ignored. */
const SEPARATORS = /[\s\-_.]/g;

/** Crockford's reading rule, and the whole of why the alphabet is this one. */
const CONFUSABLE = { O: "0", I: "1", L: "1" };

/** Longer than any grouped code with separators between every character; a
 * paste of a megabyte is refused by LENGTH before anything walks it. */
const MAX_TYPED = 32;

/** Six characters from six bytes. The caller owns the randomness — `shared/`
 * does no I/O and holds no generator, so the server passes `randomBytes(6)`
 * and a test passes the bytes it wants to read back. */
export function makeRoomCode(bytes) {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const byte = Number(bytes?.[i]) || 0;
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

/** A typed code as the canonical one, or `""` — which is the only thing it
 * ever says about why, because the player has one field and one answer. */
export function normaliseRoomCode(typed) {
  if (typeof typed !== "string" || typed.length > MAX_TYPED) return "";
  const bare = typed.toUpperCase().replace(SEPARATORS, "");
  if (bare.length !== ROOM_CODE_LENGTH) return "";
  let code = "";
  for (const ch of bare) {
    const mapped = CONFUSABLE[ch] ?? ch;
    if (!ROOM_CODE_ALPHABET.includes(mapped)) return "";
    code += mapped;
  }
  return code;
}

/** Grouped for reading aloud and for the lobby's field. A non-code formats as
 * `""` rather than as a plausible one. */
export function formatRoomCode(code) {
  const canonical = normaliseRoomCode(code);
  if (!canonical) return "";
  return `${canonical.slice(0, 3)}-${canonical.slice(3)}`;
}
