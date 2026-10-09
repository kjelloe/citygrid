// A QR code, hand-rolled (X2d, Q5 → A11).
//
// "QR generation will be hand-rolled to keep the zero-dependency rule" — A11,
// written at P8 and cashed here. The game has one runtime dependency (`ws`, on
// the server) and the client has none at all, so a library for one picture on
// one screen is not a trade this project makes.
//
// **What it is for.** A host reads a six-character code down a telephone or
// sends a link; a QR is the third way, and the one that works when the other
// person is standing next to you with a phone. It encodes the join URL, so
// scanning it opens the room rather than showing six characters to type.
//
// **What it supports, and why so little.** Byte mode, error correction level
// **M**, versions 1 to 10 — which is 271 characters at this level, against the
// ~50 a join URL needs. Alphanumeric mode would pack an uppercase URL tighter
// and is a second encoder to be wrong in; the extra versions are a table nobody
// would exercise. Narrow and verified beats general and plausible.
//
// **How it is verified**, because a QR that does not scan is worse than no QR
// and nobody here has a phone: `test/qr.test.js` walks the spec's own reading
// order back — unmasking, de-interleaving and decoding the bitstream — and
// recovers the input; it checks the Reed-Solomon syndromes are zero, which no
// encoder bug survives; and it holds the finder, timing and alignment patterns
// to their fixed positions. A round trip through one author's two mistakes is
// the gap that leaves, and the evening in V5 is where a real phone meets it.

/** The field QR arithmetic lives in: GF(256) with the primitive 0x11d. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `n` error-correction codewords, as
 * coefficients high-order first. */
function generator(n) {
  let poly = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The Reed-Solomon remainder: `n` codewords that make the message divisible
 * by the generator, which is what lets a scanner repair a smudge. */
export function eccFor(data, n) {
  const gen = generator(n);
  const out = new Uint8Array(n);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.copyWithin(0, 1);
    out[n - 1] = 0;
    for (let i = 0; i < n; i += 1) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

/**
 * Versions 1 to 10 at error-correction level **M**, from the standard's
 * tables: total codewords, EC codewords per block, and how the data splits
 * into blocks.
 *
 * Transcribed rather than derived — the standard is a table and so is this —
 * which is exactly the kind of list that goes wrong silently, so
 * `test/qr.test.js` checks each row against the capacity it claims and against
 * the matrix the version actually produces.
 */
const VERSIONS = [
  // version, total codewords, ec per block, blocks in group 1, data per block
  { version: 1, total: 26, ecPerBlock: 10, blocks: [{ count: 1, data: 16 }] },
  { version: 2, total: 44, ecPerBlock: 16, blocks: [{ count: 1, data: 28 }] },
  { version: 3, total: 70, ecPerBlock: 26, blocks: [{ count: 1, data: 44 }] },
  { version: 4, total: 100, ecPerBlock: 18, blocks: [{ count: 2, data: 32 }] },
  { version: 5, total: 134, ecPerBlock: 24, blocks: [{ count: 2, data: 43 }] },
  { version: 6, total: 172, ecPerBlock: 16, blocks: [{ count: 4, data: 27 }] },
  { version: 7, total: 196, ecPerBlock: 18, blocks: [{ count: 4, data: 31 }] },
  { version: 8, total: 242, ecPerBlock: 22, blocks: [{ count: 2, data: 38 }, { count: 2, data: 39 }] },
  { version: 9, total: 292, ecPerBlock: 22, blocks: [{ count: 3, data: 36 }, { count: 2, data: 37 }] },
  { version: 10, total: 346, ecPerBlock: 26, blocks: [{ count: 4, data: 43 }, { count: 1, data: 44 }] },
];

/** Where the alignment patterns' centres go, per version (the standard's
 * table). Version 1 has none. */
const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** How many data bytes a version holds at level M. */
const capacityOf = (v) => v.blocks.reduce((n, g) => n + g.count * g.data, 0);

export const QR_MAX_BYTES = capacityOf(VERSIONS.at(-1)) - 3;

function versionFor(byteLength) {
  // Mode (4 bits) + length (8 or 16) + the data, in bytes, rounded up.
  for (const v of VERSIONS) {
    const header = v.version < 10 ? 2 : 3;
    if (byteLength + header <= capacityOf(v)) return v;
  }
  return undefined;
}

/** The message as a bit array: mode, length, data, terminator and padding. */
function bitstream(bytes, v) {
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);                               // byte mode
  push(bytes.length, v.version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = capacityOf(v) * 8;
  // The terminator is up to four zeros, and only as many as fit.
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  // The two pad bytes the standard names, alternating, until the version is
  // full. A scanner reads the length and ignores them; they exist so that the
  // error correction has a fixed amount to work on.
  const pads = [0xec, 0x11];
  for (let i = 0; bits.length < capacity; i += 1) push(pads[i % 2], 8);
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i += 1) {
    for (let b = 0; b < 8; b += 1) out[i] = (out[i] << 1) | bits[i * 8 + b];
  }
  return out;
}

/** Data and EC codewords, split into blocks and interleaved the way the
 * standard asks — which is what spreads a smudge across every block instead of
 * destroying one. */
function interleave(data, v) {
  const blocks = [];
  let at = 0;
  for (const group of v.blocks) {
    for (let i = 0; i < group.count; i += 1) {
      const slice = data.subarray(at, at + group.data);
      at += group.data;
      blocks.push({ data: slice, ecc: eccFor(slice, v.ecPerBlock) });
    }
  }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < v.ecPerBlock; i += 1) {
    for (const block of blocks) out.push(block.ecc[i]);
  }
  return Uint8Array.from(out);
}

/** The BCH(15,5) format information, with the standard's mask applied. */
export function formatBits(maskPattern) {
  // 0b00 is level M in the format's own encoding.
  const data = (0b00 << 3) | maskPattern;
  let rest = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if ((rest >> (10 + i)) & 1) rest ^= 0b10100110111 << i;
  }
  return ((data << 10) | rest) ^ 0b101010000010010;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** A blank grid plus a map of which modules are structure rather than data. */
function frame(v) {
  const size = v.version * 4 + 17;
  const modules = new Uint8Array(size * size);
  const fixed = new Uint8Array(size * size);
  const set = (r, c, value) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r * size + c] = value ? 1 : 0;
    fixed[r * size + c] = 1;
  };

  const finder = (row, col) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6
          && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(row + r, col + c, on);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const on = i % 2 === 0;
    set(6, i, on);
    set(i, 6, on);
  }

  const centres = ALIGNMENT[v.version];
  for (const r of centres) {
    for (const c of centres) {
      // Not where a finder already is.
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // The dark module, which is always on, and the format areas, reserved here
  // and written once a mask has been chosen.
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) { set(8, i, false); set(i, 8, false); }
  }
  for (let i = 0; i < 8; i += 1) {
    set(8, size - 1 - i, false);
    if (size - 1 - i !== size - 8) set(size - 1 - i, 8, false);
  }
  return { size, modules, fixed };
}

/** The zigzag the data follows: two columns at a time, right to left, upwards
 * then downwards, skipping the timing column and everything structural. */
function placeData(grid, codewords) {
  const { size, modules, fixed } = grid;
  let bit = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    // **Every column at or left of the timing column shifts by one**, not only
    // the pair that lands on it. Adjusting at `right === 6` alone gives the
    // pairs (5,4), (4,3), (2,1): column 4 is written twice, the second write
    // wins, and column 0 is never written at all. The encoder and the decoder
    // shared that bug and still disagreed, because a module written twice is
    // read once — which is what the round-trip test is for.
    const col = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (fixed[row * size + c]) continue;
        const byte = codewords[bit >> 3];
        const on = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
        modules[row * size + c] = on;
        bit += 1;
      }
    }
    upward = !upward;
  }
}

/** The standard's four penalties, which is how a mask is chosen: the lower the
 * score the easier the code is to read. */
function penalty(size, at) {
  let score = 0;
  // 1: runs of five or more.
  for (let i = 0; i < size; i += 1) {
    for (const line of [(j) => at(i, j), (j) => at(j, i)]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        if (line(j) === line(j - 1)) run += 1;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  }
  // 2: 2×2 blocks of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }
  // 3: the finder-like 1011101 pattern with four light modules beside it.
  const pattern = [1, 0, 1, 1, 1, 0, 1];
  const light = [0, 0, 0, 0];
  const run = [...pattern, ...light];
  const runBack = [...light, ...pattern];
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j + run.length <= size; j += 1) {
      for (const line of [(k) => at(i, j + k), (k) => at(j + k, i)]) {
        if (run.every((want, k) => line(k) === want)) score += 40;
        if (runBack.every((want, k) => line(k) === want)) score += 40;
      }
    }
  }
  // 4: how far the whole code is from half dark.
  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) dark += at(r, c);
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function writeFormat(grid, maskPattern) {
  const { size, modules } = grid;
  const bits = formatBits(maskPattern);
  const on = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i += 1) modules[8 * size + i] = on(i);
  modules[8 * size + 7] = on(6);
  modules[8 * size + 8] = on(7);
  modules[7 * size + 8] = on(8);
  for (let i = 9; i <= 14; i += 1) modules[(14 - i) * size + 8] = on(i);
  // Seven in the bottom-left column and eight in the top-right row: the module
  // at `(size - 8, 8)` between them is the DARK module and belongs to neither.
  // Writing eight here put a format bit over it, and the dark module is the
  // first thing a scanner checks after the finders.
  for (let i = 0; i <= 6; i += 1) modules[(size - 1 - i) * size + 8] = on(i);
  for (let i = 7; i <= 14; i += 1) modules[8 * size + size - 15 + i] = on(i);
}

/**
 * The QR matrix for `text`.
 *
 * @returns `{ size, modules }` — `modules` is one byte per module, 1 for dark,
 *   row by row — or `undefined` when the text does not fit, which a caller
 *   shows as the code in words rather than as a broken picture.
 */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  const v = versionFor(bytes.length);
  if (!v) return undefined;
  const codewords = interleave(bitstream(bytes, v), v);

  let best;
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const grid = frame(v);
    placeData(grid, codewords);
    const { size, modules, fixed } = grid;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!fixed[r * size + c] && MASKS[mask](r, c)) modules[r * size + c] ^= 1;
      }
    }
    writeFormat(grid, mask);
    const score = penalty(size, (r, c) => modules[r * size + c]);
    if (best === undefined || score < best.score) best = { score, grid, mask };
  }
  return { size: best.grid.size, modules: best.grid.modules, version: v.version, mask: best.mask };
}
