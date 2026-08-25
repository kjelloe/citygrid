// Integer arithmetic. Every division in engine/ goes through here.
//
// A bare `/` produces a float, floats drift between machines and languages,
// and a drifted float is a desync that only shows up on someone else's
// hardware. Fixed point is at FP = 256.

export const FP = 256;

/** Truncating division. Truncation, not floor, because floor-division on
 * signed values broke mirror symmetry in a sibling project — the asymmetry
 * only appears for negatives, which is exactly where it hides longest. */
export function idiv(a, b) {
  return Math.trunc(a / b);
}

/** Floor division, for the cases that genuinely want it (grid cell from a
 * possibly-negative coordinate). Named so the choice is always explicit. */
export function fdiv(a, b) {
  return Math.floor(a / b);
}

/** Remainder that is always non-negative, unlike `%` for negative operands. */
export function imod(a, b) {
  const r = a % b;
  return r < 0 ? r + Math.abs(b) : r;
}

export function clamp(value, low, high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Rounds a fixed-point value back to a whole number, half away from zero. */
export function fpRound(value) {
  return value >= 0 ? idiv(value + FP / 2, FP) : -idiv(-value + FP / 2, FP);
}

export function toFp(whole) {
  return whole * FP;
}

/** Fixed-point multiply: (a * b) / FP, staying in integers throughout. */
export function fpMul(a, b) {
  return idiv(a * b, FP);
}

/** Linear interpolation on integers. `t` is fixed point in [0, FP]. */
export function lerp(a, b, t) {
  return a + idiv((b - a) * t, FP);
}

/** Integer square root, for distances without floats. */
export function isqrt(value) {
  if (value <= 0) return 0;
  let x = value;
  let y = idiv(x + 1, 2);
  while (y < x) {
    x = y;
    y = idiv(x + idiv(value, x), 2);
  }
  return x;
}
