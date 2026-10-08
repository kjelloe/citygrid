// What a room will carry between players (X3b, slice 5.3's last piece).
//
// Chat is **not a command**: it never reaches the reducer, it is not hashed
// state, and a client that misses a line has not diverged. That is the whole
// design — a message that could desync a city would be a liability for the sake
// of saying hello.
//
// Which means the safety is all on the way IN. Player-authored text is
// untrusted input and hashed state at once everywhere else in this project
// (CLAUDE.md's multiplayer invariants); here it is untrusted input that is not
// state, so what matters is the cap, the sanitising, the rate and the fact that
// the client renders it as plain text and never as markup.

import test from "node:test";
import assert from "node:assert/strict";
import { chatFrom, CHATS_PER_SECOND } from "../server/chat.js";
import { LIMITS } from "../shared/protocol.js";

const room = (over) => ({ options: { chatEnabled: true, ...over } });

test("a line is carried, trimmed and capped", () => {
  const said = chatFrom(room(), 2, "  Hello  there  ");
  assert.deepEqual(said, { ok: true, seat: 2, text: "Hello there" });

  // The cap is in BYTES, which is what `LIMITS.CHAT_BYTES` is: a line of
  // Norwegian is not the same number of characters as a line of English.
  const long = chatFrom(room(), 1, "å".repeat(LIMITS.CHAT_BYTES));
  assert.equal(long.ok, true);
  assert.ok(Buffer.byteLength(long.text, "utf8") <= LIMITS.CHAT_BYTES,
    `${Buffer.byteLength(long.text, "utf8")} bytes survived a ${LIMITS.CHAT_BYTES} cap`);
});

test("control characters and line breaks come out as spaces", () => {
  // A newline in a chat line is a way to push the rest of the panel off the
  // screen; the control ranges are a way to do stranger things. The same
  // sanitiser the reducer uses for a request title, because two rules for one
  // idea is two that can disagree.
  const said = chatFrom(room(), 1, "one\ntwo\u0000three four");
  assert.equal(said.ok, true);
  assert.equal(said.text, "one two three four");
});

test("nothing to say is not said", () => {
  // An empty line, a line of spaces, a line of control characters: all of them
  // sanitise to nothing, and a room that broadcast them would let a player
  // scroll everybody else's panel with an empty field.
  for (const nothing of ["", "   ", "\n\n", "\u0000\u0000", undefined, null, 7, {}]) {
    const said = chatFrom(room(), 1, nothing);
    assert.equal(said.ok, false, `${JSON.stringify(nothing)} was carried`);
    assert.equal(said.reason, "empty");
  }
});

test("a room with chat off carries nothing at all", () => {
  // `chatEnabled` has been an option since Wave 0 with nothing reading it. It
  // is **off by default** (`engine/options.js`), which is the right default for
  // a room anybody can join with a code.
  const said = chatFrom(room({ chatEnabled: false }), 1, "Hello");
  assert.equal(said.ok, false);
  assert.equal(said.reason, "disabled");
  // And the refusal is about the ROOM, not about the words: a player whose
  // line was dropped for being empty and one in a room with chat off need
  // different sentences.
  assert.notEqual(said.reason, chatFrom(room(), 1, "").reason);
});

test("the rate is its own budget, not the command budget", () => {
  // A player who talks a lot must not lose the ability to build, and a player
  // who builds a lot must not lose the ability to say why. `LIMITS.COMMANDS_PER_SECOND`
  // is twenty; this is deliberately smaller, because a chat line costs every
  // client a repaint and nobody types twenty lines a second in good faith.
  assert.ok(CHATS_PER_SECOND > 0 && CHATS_PER_SECOND < LIMITS.COMMANDS_PER_SECOND,
    `${CHATS_PER_SECOND} is not a sensible chat rate beside ${LIMITS.COMMANDS_PER_SECOND} commands`);
});
