// The wire contract, and the handshake that refuses a stale client (X0).
//
// A PWA caches its own client, so a client one deploy behind meeting an updated
// server is the DEFAULT case, not an edge case — and a mismatched reducer
// desyncs silently, which is the worst way to find out (plan.md §3.9).
// `compatible()` has been written since Wave 0 and had no caller and no test;
// X0 gave it a real build hash to compare, so this is the first time it has been
// asked whether it does what the plan says.

import test from "node:test";
import assert from "node:assert/strict";
import { compatible, PROTOCOL_VERSION, REFUSAL, C2S, S2C } from "../shared/protocol.js";
import { buildHash, setBuildHash } from "../shared/build-hash.js";

test("a client and server on the same version and build are compatible", () => {
  assert.equal(compatible(PROTOCOL_VERSION, "abc123abc123", "abc123abc123"), "");
});

test("a different protocol version is refused, whatever the build", () => {
  assert.equal(compatible(PROTOCOL_VERSION + 1, "abc123abc123", "abc123abc123"),
    REFUSAL.VERSION_MISMATCH);
  // The version is checked FIRST: a client two protocols old would otherwise be
  // told its rules are stale, which is true and is not the reason.
  assert.equal(compatible(PROTOCOL_VERSION + 1, "aaa", "bbb"), REFUSAL.VERSION_MISMATCH);
});

test("different rules are refused — that is the whole point of the hash", () => {
  // `engine/`, `shared/` and `data/`: a changed balance file is a different
  // game. The client is told to reload rather than allowed to join and diverge.
  assert.equal(compatible(PROTOCOL_VERSION, "aaaaaaaaaaaa", "bbbbbbbbbbbb"),
    REFUSAL.BUILD_MISMATCH);
});

test("a dev build talks to anything, on either side", () => {
  // A developer's client and server are rebuilt at different moments and
  // blocking that would be theatre — which is also why `buildHash()` defaults
  // to "dev" when nothing has handed one in.
  assert.equal(compatible(PROTOCOL_VERSION, "dev", "bbbbbbbbbbbb"), "");
  assert.equal(compatible(PROTOCOL_VERSION, "aaaaaaaaaaaa", "dev"), "");
  assert.equal(compatible(PROTOCOL_VERSION, "dev", "dev"), "");
});

test("the build hash is a value with a setter, and falls back to dev", () => {
  // `shared/` may not do I/O, so the hash is handed in by whoever read
  // `client/precache.json` — the page at boot, the server at startup. The same
  // shape `engine/rules.js` has, and for the same reason.
  const was = buildHash();
  try {
    assert.equal(setBuildHash("0123456789ab"), "0123456789ab");
    assert.equal(buildHash(), "0123456789ab");
    // Anything that is not a hash leaves it a dev build rather than an empty
    // string that would compare equal to another empty string.
    assert.equal(setBuildHash(""), "dev");
    assert.equal(setBuildHash(undefined), "dev");
    assert.equal(setBuildHash(42), "dev");
    assert.equal(buildHash(), "dev");
  } finally {
    setBuildHash(was);
  }
});

test("every message name is distinct WITHIN its direction", () => {
  // Within, not across. `chat` is deliberately the same name both ways — a
  // player says something and the room repeats it, which is one idea travelling
  // in two directions — while `ping` and `pong` are a pair because the reply
  // carries different fields. Two names for one idea inside one direction is a
  // protocol bug that only shows on a wire that does not exist yet.
  for (const [label, table] of [["C2S", C2S], ["S2C", S2C]]) {
    const names = Object.values(table);
    assert.equal(new Set(names).size, names.length, `duplicate ${label} names: ${names.join(", ")}`);
    for (const name of names) assert.equal(typeof name, "string");
    assert.ok(Object.isFrozen(table), `${label} is not frozen`);
  }
  assert.equal(C2S.CHAT, S2C.CHAT, "chat is one idea in two directions");
});

test("every refusal has a code of its own", () => {
  // The words for these are X1's client half (ruling 027: a refusal needs words
  // and a warning). What this asserts is that the codes exist and are distinct,
  // so that the words can be hung on them.
  const codes = Object.values(REFUSAL);
  assert.ok(codes.length >= 5, `only ${codes.length} refusals`);
  assert.equal(new Set(codes).size, codes.length);
});
