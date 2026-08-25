// The state hash is the contract: save checksum, desync detector, replay
// verifier and multiplayer acceptance gate, all one function. These vectors
// are cross-language anchors — a Luau twin has to reproduce them exactly.

import test from "node:test";
import assert from "node:assert/strict";
import { newHash, hashByte, hashBytes, digest, hashOf, hashString } from "../shared/statehash.js";
import {
  makeSink, writeU8, writeU16, writeI32, writeI64, writeString,
  writeBool, writeBytes, writeList, finish, assertHashable,
} from "../shared/canonical.js";

test("FNV-1a 64 matches its published vectors", () => {
  // The reference values for FNV-1a 64. If these fail, the arithmetic is
  // wrong, not the expectation.
  assert.equal(digest(newHash()), "cbf29ce484222325", "offset basis");
  assert.equal(hashString(""), "cbf29ce484222325");
  assert.equal(hashString("a"), "af63dc4c8601ec8c");
  assert.equal(hashString("foobar"), "85944171f73967e8");
});

test("the 32-bit lanes carry correctly across the whole byte range", () => {
  // Every byte value exercises a different carry pattern out of the low lane.
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) all[i] = i;
  assert.equal(hashOf(all), "4242dc5249c33625");
});

test("hashing is order-sensitive", () => {
  assert.notEqual(hashString("ab"), hashString("ba"));
});

test("a one-bit change changes the digest", () => {
  const a = hashOf(new Uint8Array([0, 0, 0, 0]));
  const b = hashOf(new Uint8Array([0, 0, 0, 1]));
  assert.notEqual(a, b);
});

test("digests are always sixteen hex characters", () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(hashOf(new Uint8Array([i, i >> 1, i * 7])), /^[0-9a-f]{16}$/);
  }
});

test("incremental hashing equals one-shot hashing", () => {
  const bytes = new TextEncoder().encode("a city is a machine for living in");
  const one = hashOf(bytes);
  const h = newHash();
  for (const byte of bytes) hashByte(h, byte);
  assert.equal(digest(h), one);
  const halves = newHash();
  hashBytes(halves, bytes.subarray(0, 10));
  hashBytes(halves, bytes.subarray(10));
  assert.equal(digest(halves), one);
});

test("canonical writers produce little-endian bytes", () => {
  const sink = makeSink(8);
  writeU8(sink, 0x12);
  writeU16(sink, 0x3456);
  writeI32(sink, 0x789abcde);
  assert.deepEqual([...finish(sink)], [0x12, 0x56, 0x34, 0xde, 0xbc, 0x9a, 0x78]);
});

test("negative integers round-trip through writeI32's byte pattern", () => {
  const sink = makeSink();
  writeI32(sink, -1);
  writeI32(sink, -2147483648);
  assert.deepEqual([...finish(sink)], [0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x80]);
});

test("writeI64 splits wide values into two lanes rather than a double", () => {
  const sink = makeSink();
  writeI64(sink, 0x1_0000_0000);
  assert.deepEqual([...finish(sink)], [0, 0, 0, 0, 1, 0, 0, 0]);
});

test("the sink grows without corrupting what it already holds", () => {
  const sink = makeSink(4);
  for (let i = 0; i < 1000; i += 1) writeU8(sink, i & 0xff);
  const bytes = finish(sink);
  assert.equal(bytes.length, 1000);
  for (let i = 0; i < 1000; i += 1) assert.equal(bytes[i], i & 0xff);
});

test("strings are length-prefixed UTF-8", () => {
  const sink = makeSink();
  writeString(sink, "å");
  assert.deepEqual([...finish(sink)], [2, 0, 0, 0, 0xc3, 0xa5]);
});

test("bools and lists write through explicit item writers", () => {
  const sink = makeSink();
  writeBool(sink, true);
  writeBool(sink, false);
  writeList(sink, [1, 2], (s, value) => writeU8(s, value));
  assert.deepEqual([...finish(sink)], [1, 0, 2, 0, 0, 0, 1, 2]);
});

test("writeBytes is length-prefixed", () => {
  const sink = makeSink();
  writeBytes(sink, new Uint8Array([7, 8]));
  assert.deepEqual([...finish(sink)], [2, 0, 0, 0, 7, 8]);
});

test("assertHashable accepts what state is allowed to contain", () => {
  assertHashable({ tick: 0, funds: -50, name: "Oslo", ok: true, tiles: new Uint8Array(4) });
  assertHashable([1, 2, { nested: 3 }]);
});

test("assertHashable rejects every way a hash can stop being reproducible", () => {
  const cases = [
    [{ x: null }, /null/],
    [{ x: undefined }, /undefined/],
    [{ x: 1.5 }, /float/],
    [{ x: NaN }, /NaN/],
    [{ x: Infinity }, /Infinity/],
    [{ x: () => 1 }, /function/],
    [{ x: Symbol("s") }, /symbol/],
    [{ x: 1n }, /bigint/],
    [{ x: new Map() }, /Map/],
    [{ x: new Set() }, /Set/],
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => assertHashable(value), pattern, `should have rejected ${String(pattern)}`);
  }
});

test("assertHashable names the path to the offending value", () => {
  assert.throws(
    () => assertHashable({ city: { budget: { tax: 0.07 } } }),
    /state\.city\.budget\.tax/,
  );
});
