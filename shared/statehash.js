// FNV-1a 64 over canonical bytes. The single most load-bearing function in the
// project: it is simultaneously the save checksum, the desync detector, the
// replay verifier and the multiplayer acceptance gate.
//
// Implemented in two 32-bit lanes rather than BigInt. Every intermediate
// product stays under 2^41, so it is exact in a double and identical on every
// engine — which is the whole point.
//
// The list of hashed fields lives HERE and in the fixture test's local copy.
// The duplication is deliberate: a hash change must be a conscious two-file act.

const OFFSET_HI = 0xcbf29ce4;
const OFFSET_LO = 0x84222325;
const PRIME_HI = 0x00000100;
const PRIME_LO = 0x000001b3;

export function newHash() {
  return { hi: OFFSET_HI, lo: OFFSET_LO };
}

/** h = (h ^ byte) * prime, 64-bit, in 32-bit lanes. */
export function hashByte(h, byte) {
  const lo = (h.lo ^ (byte & 0xff)) >>> 0;
  const hi = h.hi >>> 0;

  const loPlo = lo * PRIME_LO;
  const carry = Math.floor(loPlo / 0x100000000);
  const newLo = loPlo >>> 0;
  const newHi = (lo * PRIME_HI + hi * PRIME_LO + carry) >>> 0;

  h.lo = newLo;
  h.hi = newHi;
  return h;
}

export function hashBytes(h, bytes) {
  for (let i = 0; i < bytes.length; i += 1) hashByte(h, bytes[i]);
  return h;
}

export function digest(h) {
  return h.hi.toString(16).padStart(8, "0") + h.lo.toString(16).padStart(8, "0");
}

export function hashOf(bytes) {
  return digest(hashBytes(newHash(), bytes));
}

/** Convenience for pinning a value in a test vector. */
export function hashString(text) {
  return hashOf(new TextEncoder().encode(text));
}
