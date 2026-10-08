// The join code (X2a, slice 5.2's headless half).
//
// A room is addressed by something a player can read off one screen and type
// into another, or say out loud. That makes the code a parser of UNTRUSTED
// TEXT — the same class as a request title or a player name (CLAUDE.md's
// multiplayer invariants) — and it makes the alphabet a decision rather than a
// convenience: `O` beside `0` in a code read aloud is a room nobody can join.
//
// The alphabet is Crockford base32, which exists for exactly this and has the
// mapping written down: `I`, `L`, `O` and `U` are not in it, and the first
// three normalise onto `1`, `1` and `0`. `U` is excluded so that no six
// characters of it spell anything a player would rather not read out.

import test from "node:test";
import assert from "node:assert/strict";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, makeRoomCode, normaliseRoomCode, formatRoomCode }
  from "../shared/roomcode.js";

test("the alphabet has no confusable pair in it", () => {
  // The authored convention, asserted rather than trusted (the rail-station
  // lesson): a later edit that adds `O` back for a rounder-looking code has to
  // argue with this test first.
  assert.equal(ROOM_CODE_ALPHABET.length, 32);
  assert.equal(new Set(ROOM_CODE_ALPHABET).size, 32, "a character appears twice");
  for (const banned of ["I", "L", "O", "U"]) {
    assert.ok(!ROOM_CODE_ALPHABET.includes(banned), `${banned} is in the alphabet`);
  }
  assert.match(ROOM_CODE_ALPHABET, /^[0-9A-Z]+$/, "the alphabet is not plain uppercase and digits");
});

test("a code is made from bytes, deterministically, and spends them all", () => {
  const bytes = [0, 31, 32, 255, 7, 128];
  const code = makeRoomCode(bytes);
  assert.equal(code.length, ROOM_CODE_LENGTH);
  assert.equal(code, makeRoomCode(bytes), "the same bytes gave two codes");
  for (const ch of code) assert.ok(ROOM_CODE_ALPHABET.includes(ch), `${ch} is not in the alphabet`);
  // **Unbiased, which is a property of the number and not of the loop.** 32
  // divides 256, so a byte taken modulo the alphabet reaches every character
  // from exactly eight of the 256 values; an alphabet of 31 or 30 would make
  // the first characters of it likelier than the last, and the only way to see
  // that is to count.
  const seen = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const ch = makeRoomCode([byte, 0, 0, 0, 0, 0])[0];
    seen.set(ch, (seen.get(ch) ?? 0) + 1);
  }
  assert.equal(seen.size, 32, `${seen.size} of 32 characters are reachable`);
  for (const [ch, n] of seen) assert.equal(n, 8, `${ch} comes from ${n} byte values, not 8`);
  // And every position matters, or a code is shorter than it looks.
  const base = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const moved = base.slice();
    moved[i] += 1;
    assert.notEqual(makeRoomCode(moved), makeRoomCode(base), `byte ${i} changes nothing`);
  }
});

test("typing it back in is case-, separator- and confusable-insensitive", () => {
  const code = makeRoomCode([3, 14, 15, 9, 26, 5]);
  const typed = [
    code,
    code.toLowerCase(),
    formatRoomCode(code),
    formatRoomCode(code).toLowerCase(),
    ` ${code} `,
    code.split("").join(" "),
    code.replace(/^(...)/, "$1_"),
  ];
  for (const attempt of typed) {
    assert.equal(normaliseRoomCode(attempt), code, `"${attempt}" did not come back as ${code}`);
  }
  // The confusables, both directions of the Crockford mapping.
  assert.equal(normaliseRoomCode("o1lIO0".slice(0, 6)), normaliseRoomCode("011100".slice(0, 6)));
  assert.equal(normaliseRoomCode("ABCDEO"), normaliseRoomCode("ABCDE0"));
  assert.equal(normaliseRoomCode("ABCDEI"), normaliseRoomCode("ABCDE1"));
  assert.equal(normaliseRoomCode("ABCDEl"), normaliseRoomCode("ABCDE1"));
});

test("anything that is not a code comes back empty, and says nothing about why", () => {
  // A normaliser that STRIPS what it does not recognise turns garbage into a
  // plausible code: `"<script>ABCDEF"` would become `ABCDEF` and join a room.
  // Only separators are removed; every surviving character has to be in the
  // alphabet, and the length has to be exact.
  for (const bad of ["", "ABCDE", "ABCDEFG", "ABCDE!", "<script>ABCDEF</script>", "ÅBCDEF",
    "ABCD EFG", "123456789", "----", null, undefined, 123456, {}, ["ABCDEF"]]) {
    assert.equal(normaliseRoomCode(bad), "", `${JSON.stringify(bad)} was accepted`);
  }
  // **These are the ones that discriminate**, and the first list did not: a
  // stripping normaliser was planted and stayed green, because every string
  // above has either too few alphabet characters left or too many. What a
  // stripper actually accepts is junk WRAPPED AROUND exactly six good ones.
  for (const bad of ["<ABCDEF>", "!ABCDEF!", "'ABCDEF'", "ABCDEF;--", "(ABCDEF)",
    "ABC/DEF", "ABC\\DEF", "ABC+DEF", "ABC=DEF", "АBCDEF"]) {
    assert.equal(normaliseRoomCode(bad), "", `${JSON.stringify(bad)} was stripped into a code`);
  }
});

test("a megabyte of text is not parsed as a join code", () => {
  // Untrusted input is capped BEFORE it is walked, not after: the cap is the
  // reason this cannot be a way to spend the server's time.
  const huge = "A".repeat(1_000_000);
  assert.equal(normaliseRoomCode(huge), "");
  assert.equal(normaliseRoomCode(`${huge}ABCDEF`), "");
  // And a valid code padded with a megabyte of separators is still refused —
  // "strip the separators first" must not mean "walk a megabyte first".
  assert.equal(normaliseRoomCode(`ABCDEF${" ".repeat(1_000_000)}`), "");
});

test("the displayed form is grouped, and round-trips", () => {
  const code = makeRoomCode([1, 2, 3, 4, 5, 6]);
  const shown = formatRoomCode(code);
  assert.ok(shown.includes("-"), "the code is shown as one run of six characters");
  assert.equal(normaliseRoomCode(shown), code);
  assert.equal(formatRoomCode("nonsense"), "", "a non-code was formatted as one");
});
