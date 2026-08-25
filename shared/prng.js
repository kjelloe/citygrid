// The only source of randomness in the game. xorshift32, with its state living
// inside the game state so that a save carries its own future.
//
// Never Math.random: the same seed must produce the same city forever, on
// every machine, in every language a twin is ever written in.

const DEFAULT_SEED = 0x9e3779b9;

/** The rng is a plain object so it can live in state and be deep-copied.
 * Zero is not a valid xorshift state — it is a fixed point that produces
 * nothing but zeros — so it is replaced rather than accepted. */
export function makeRng(seed) {
  const s = (seed >>> 0) || DEFAULT_SEED;
  return { s };
}

export function copyRng(rng) {
  return { s: rng.s >>> 0 };
}

export function nextU32(rng) {
  let x = rng.s >>> 0;
  x ^= (x << 13) >>> 0;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  x >>>= 0;
  rng.s = x;
  return x;
}

/** Uniform integer in [0, bound). Rejection sampling rather than modulo:
 * modulo bias is small but deterministic, which means it is a permanent,
 * reproducible thumb on the scale of every map ever generated. */
export function nextInt(rng, bound) {
  if (bound <= 1) return 0;
  const limit = 0x100000000 - (0x100000000 % bound);
  let value = nextU32(rng);
  while (value >= limit) value = nextU32(rng);
  return value % bound;
}

/** Inclusive range. */
export function nextRange(rng, low, high) {
  if (high <= low) return low;
  return low + nextInt(rng, high - low + 1);
}

/** True one time in `oneIn`. Reads at the call site the way the odds are
 * usually stated in design notes: chance(rng, 20) is "one in twenty". */
export function chance(rng, oneIn) {
  if (oneIn <= 1) return oneIn === 1;
  return nextInt(rng, oneIn) === 0;
}

/** True with probability `numerator / denominator`. */
export function chanceIn(rng, numerator, denominator) {
  if (numerator <= 0) return false;
  if (numerator >= denominator) return true;
  return nextInt(rng, denominator) < numerator;
}

export function pick(rng, items) {
  return items[nextInt(rng, items.length)];
}

/** In-place Fisher-Yates. Order matters for determinism, so it consumes
 * exactly one draw per element regardless of outcome. */
export function shuffle(rng, items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, i + 1);
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
  return items;
}

/** Derives an independent seed from a seed. Used to give each subsystem its
 * own stream, so adding a draw in terrain generation cannot shift the
 * sequence a quest system sees. */
export function mix32(value) {
  let x = value >>> 0;
  x = (Math.imul(x ^ (x >>> 16), 0x45d9f3b)) >>> 0;
  x = (Math.imul(x ^ (x >>> 16), 0x45d9f3b)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}

/** FNV-1a 32 over UTF-8, so a human-typed seed word maps to a number.
 * Same word, same region, on any machine. */
export function seedFromString(text) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(String(text));
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A seed for a named subsystem, derived from the game seed. */
export function streamSeed(gameSeed, name) {
  return mix32((gameSeed >>> 0) ^ seedFromString(name));
}
