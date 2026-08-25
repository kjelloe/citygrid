// Canonical little-endian serialization. One byte order, one field order, one
// answer — on every machine, in every browser, forever.
//
// The rule that makes it work: nothing here ever iterates an object's own
// keys. Every writer names its fields in an explicit order, because
// `Object.keys` order is an implementation detail and a state hash cannot rest
// on an implementation detail.

const GROWTH = 2;

export function makeSink(initial = 1024) {
  return { bytes: new Uint8Array(initial), length: 0 };
}

function ensure(sink, extra) {
  if (sink.length + extra <= sink.bytes.length) return;
  let size = sink.bytes.length * GROWTH;
  while (size < sink.length + extra) size *= GROWTH;
  const grown = new Uint8Array(size);
  grown.set(sink.bytes.subarray(0, sink.length));
  sink.bytes = grown;
}

export function writeU8(sink, value) {
  ensure(sink, 1);
  sink.bytes[sink.length] = value & 0xff;
  sink.length += 1;
}

export function writeU16(sink, value) {
  ensure(sink, 2);
  sink.bytes[sink.length] = value & 0xff;
  sink.bytes[sink.length + 1] = (value >>> 8) & 0xff;
  sink.length += 2;
}

export function writeI32(sink, value) {
  ensure(sink, 4);
  const v = value | 0;
  sink.bytes[sink.length] = v & 0xff;
  sink.bytes[sink.length + 1] = (v >>> 8) & 0xff;
  sink.bytes[sink.length + 2] = (v >>> 16) & 0xff;
  sink.bytes[sink.length + 3] = (v >>> 24) & 0xff;
  sink.length += 4;
}

/** Integers wider than 32 bits (treasury over a long game, tick counts) are
 * written as two 32-bit lanes rather than as a double, so the byte pattern
 * never depends on floating-point representation. */
export function writeI64(sink, value) {
  const low = value % 0x100000000;
  const high = Math.trunc(value / 0x100000000);
  writeI32(sink, low | 0);
  writeI32(sink, high | 0);
}

/** Length-prefixed UTF-8. Player-authored text reaches the hash through here:
 * it is untrusted input and hashed state at once. */
export function writeString(sink, text) {
  const bytes = new TextEncoder().encode(String(text));
  writeI32(sink, bytes.length);
  ensure(sink, bytes.length);
  sink.bytes.set(bytes, sink.length);
  sink.length += bytes.length;
}

export function writeBytes(sink, source) {
  writeI32(sink, source.length);
  ensure(sink, source.length);
  sink.bytes.set(source, sink.length);
  sink.length += source.length;
}

export function writeBool(sink, value) {
  writeU8(sink, value ? 1 : 0);
}

/** Writes a list through an explicit per-item writer, length first. */
export function writeList(sink, items, writeItem) {
  writeI32(sink, items.length);
  for (let i = 0; i < items.length; i += 1) writeItem(sink, items[i]);
}

export function finish(sink) {
  return sink.bytes.subarray(0, sink.length);
}

/** Rejects anything that cannot be hashed reproducibly. This is the guard that
 * turns "the hash moved and nobody knows why" into a named error at the moment
 * the bad value enters state. */
export function assertHashable(value, path = "state") {
  const type = typeof value;
  if (value === null) {
    throw new Error(`${path} is null — null vanishes from tables in a Lua twin`);
  }
  if (type === "undefined") throw new Error(`${path} is undefined`);
  if (type === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} is ${value}`);
    if (!Number.isInteger(value)) throw new Error(`${path} is a float: ${value}`);
    return;
  }
  if (type === "boolean" || type === "string") return;
  if (type === "function" || type === "symbol" || type === "bigint") {
    throw new Error(`${path} is a ${type}`);
  }
  if (ArrayBuffer.isView(value)) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) assertHashable(value[i], `${path}[${i}]`);
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    throw new Error(`${path} is a ${value.constructor.name} — iteration order is not a contract`);
  }
  for (const key of Object.keys(value)) assertHashable(value[key], `${path}.${key}`);
}
