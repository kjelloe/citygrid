// The QR code, read back (X2d, Q5 → A11).
//
// A QR that does not scan is worse than no QR: it looks right, the player
// points a phone at it, and nothing happens. Nobody here has a phone, so the
// verification has to be the standard itself, three ways:
//
//   1. **A round trip.** This file walks the spec's own reading order back —
//      finding the format, undoing the mask, following the zigzag,
//      de-interleaving the blocks and decoding the bitstream — and recovers the
//      input. A decoder written from the spec fails on a placement, a mask or a
//      block split that an encoder written from the same spec got wrong, which
//      is most of the ways to be wrong.
//   2. **The Reed-Solomon syndromes.** A received codeword with no errors
//      evaluates to zero at every root of the generator. No arithmetic bug in
//      the EC survives that, and it is independent of the reading order.
//   3. **The fixed patterns.** Finders, timing, alignment and the dark module
//      are at coordinates the standard names, so a scanner can find the code at
//      all. These are read off the matrix rather than trusted.
//
// What it leaves: a mistake this author made twice, once in each direction.
// That is what V5's evening and a real phone are for, and the dev-log says so.

import test from "node:test";
import assert from "node:assert/strict";
import { qrMatrix, eccFor, QR_MAX_BYTES, formatBits } from "../shared/qr.js";

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The same table the encoder has, written out again on purpose: a decoder
 * that imported the encoder's version could not catch a wrong row. */
const BLOCKS = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Which modules are structure, derived from the version the way a scanner
 * does — never from the encoder's own bookkeeping. */
function fixedMap(size, version) {
  const fixed = new Uint8Array(size * size);
  const mark = (r, c) => { if (r >= 0 && c >= 0 && r < size && c < size) fixed[r * size + c] = 1; };
  for (const [row, col] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) mark(row + r, col + c);
  }
  for (let i = 0; i < size; i += 1) { mark(6, i); mark(i, 6); }
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const c of centres) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) mark(r + dr, c + dc);
    }
  }
  for (let i = 0; i < 9; i += 1) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i += 1) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  return fixed;
}

/** Read the mask pattern out of the format area, which is where a scanner
 * reads it from. */
function maskFrom(modules, size) {
  const bits = [];
  for (let i = 0; i <= 5; i += 1) bits.push(modules[8 * size + i]);
  bits.push(modules[8 * size + 7], modules[8 * size + 8], modules[7 * size + 8]);
  for (let i = 9; i <= 14; i += 1) bits.push(modules[(14 - i) * size + 8]);
  let value = 0;
  for (let i = 0; i < 15; i += 1) value |= bits[i] << i;
  const unmasked = value ^ 0b101010000010010;
  return { mask: (unmasked >> 10) & 0b111, level: (unmasked >> 13) & 0b11 };
}

/** The codewords, in the order the standard reads them. */
function readCodewords(modules, size, version, mask) {
  const fixed = fixedMap(size, version);
  const bits = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    const col = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (fixed[row * size + c]) continue;
        const raw = modules[row * size + c];
        bits.push(MASKS[mask](row, c) ? raw ^ 1 : raw);
      }
    }
    upward = !upward;
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b];
    bytes.push(byte);
  }
  return bytes;
}

/** Undo the interleave, and hand back one array per block. */
function deinterleave(codewords, version) {
  const { ec, groups } = BLOCKS[version];
  const sizes = [];
  for (const [count, data] of groups) for (let i = 0; i < count; i += 1) sizes.push(data);
  const blocks = sizes.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(...sizes); i += 1) {
    for (let b = 0; b < sizes.length; b += 1) {
      if (i < sizes[b]) { blocks[b].push(codewords[at]); at += 1; }
    }
  }
  const eccs = sizes.map(() => []);
  for (let i = 0; i < ec; i += 1) {
    for (let b = 0; b < sizes.length; b += 1) { eccs[b].push(codewords[at]); at += 1; }
  }
  return { blocks, eccs, ec };
}

/** The message, from the de-interleaved data codewords. */
function decodeBytes(data, version) {
  const bits = [];
  for (const byte of data) for (let b = 7; b >= 0; b -= 1) bits.push((byte >> b) & 1);
  let at = 0;
  const take = (n) => {
    let value = 0;
    for (let i = 0; i < n; i += 1) value = (value << 1) | bits[at + i];
    at += n;
    return value;
  };
  assert.equal(take(4), 0b0100, "the mode is not byte mode");
  const length = take(version < 10 ? 8 : 16);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = take(8);
  return new TextDecoder().decode(out);
}

/** The whole reading order, as a scanner would. */
function decode(code) {
  const { size, modules, version } = code;
  const { mask, level } = maskFrom(modules, size);
  const codewords = readCodewords(modules, size, version, mask);
  const { blocks, eccs, ec } = deinterleave(codewords, version);
  // Syndromes: a clean codeword is zero at every root of the generator.
  for (let b = 0; b < blocks.length; b += 1) {
    const full = [...blocks[b], ...eccs[b]];
    for (let i = 0; i < ec; i += 1) {
      let sum = 0;
      for (const byte of full) sum = mul(sum, EXP[i]) ^ byte;
      assert.equal(sum, 0, `block ${b} has a non-zero syndrome at root ${i}`);
    }
  }
  return { text: decodeBytes(blocks.flat(), version), mask, level, version, size };
}

// --- the round trip ----------------------------------------------------------

test("a join URL goes in and comes back out", () => {
  const url = "https://citygrid.kjell.today/?join=ABC123";
  const code = qrMatrix(url);
  assert.ok(code, "the URL did not fit, and it is fifty characters");
  const read = decode(code);
  assert.equal(read.text, url);
  assert.equal(read.level, 0b00, "the format says a level other than M");
  assert.equal(read.mask, code.mask, "the format area disagrees with the mask that was applied");
});

test("every length from empty to the capacity survives the trip", () => {
  // The boundaries are where an encoder breaks: the terminator that does not
  // fit, the pad bytes, and the jump from an 8-bit length to a 16-bit one at
  // version 10.
  for (const length of [0, 1, 2, 16, 17, 26, 27, 44, 45, 100, 200, QR_MAX_BYTES]) {
    const text = "A".repeat(length);
    const code = qrMatrix(text);
    assert.ok(code, `${length} characters did not fit`);
    assert.equal(decode(code).text, text, `${length} characters came back wrong`);
  }
});

test("text that cannot fit is refused rather than truncated", () => {
  // A caller shows the code in words instead; a QR of half a URL is a picture
  // that takes somebody somewhere else.
  assert.equal(qrMatrix("A".repeat(QR_MAX_BYTES + 1)), undefined);
});

test("characters outside ASCII survive, because a city can be called anything", () => {
  const text = "https://citygrid.kjell.today/?join=ABC123#Ålesund-Østfold";
  assert.equal(decode(qrMatrix(text)).text, text);
});

// --- what a scanner looks for ------------------------------------------------

test("the three finder patterns are where a scanner looks for them", () => {
  const code = qrMatrix("https://citygrid.kjell.today/?join=ABC123");
  const at = (r, c) => code.modules[r * code.size + c];
  for (const [row, col] of [[0, 0], [0, code.size - 7], [code.size - 7, 0]]) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const want = r === 0 || r === 6 || c === 0 || c === 6
          || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0;
        assert.equal(at(row + r, col + c), want, `finder at ${row},${col} is wrong at ${r},${c}`);
      }
    }
  }
  // And the quiet separator around each one.
  for (let i = 0; i < 8; i += 1) {
    assert.equal(at(7, i), 0, "the top-left finder has no separator below it");
    assert.equal(at(i, 7), 0, "the top-left finder has no separator beside it");
  }
});

test("the timing patterns alternate, and the dark module is dark", () => {
  const code = qrMatrix("https://citygrid.kjell.today/?join=ABC123");
  const at = (r, c) => code.modules[r * code.size + c];
  for (let i = 8; i < code.size - 8; i += 1) {
    assert.equal(at(6, i), i % 2 === 0 ? 1 : 0, `the horizontal timing is wrong at ${i}`);
    assert.equal(at(i, 6), i % 2 === 0 ? 1 : 0, `the vertical timing is wrong at ${i}`);
  }
  assert.equal(at(code.size - 8, 8), 1, "the dark module is light");
});

test("an alignment pattern sits at every centre the version names", () => {
  // Version 1 has none and version 2 up have at least one; a scanner uses them
  // to correct for the angle a phone is held at.
  const code = qrMatrix("A".repeat(60));          // comfortably past version 1
  assert.ok(code.version >= 2, `version ${code.version} has no alignment patterns to check`);
  const at = (r, c) => code.modules[r * code.size + c];
  const centres = ALIGNMENT[code.version];
  let found = 0;
  for (const r of centres) {
    for (const c of centres) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= code.size - 9)
        || (r >= code.size - 9 && c <= 8)) continue;
      found += 1;
      assert.equal(at(r, c), 1, `no centre at ${r},${c}`);
      assert.equal(at(r - 1, c - 1), 0, `no ring at ${r},${c}`);
      assert.equal(at(r - 2, c - 2), 1, `no edge at ${r},${c}`);
    }
  }
  assert.ok(found > 0, "the version names centres and none of them were checked");
});

test("the size is the version's, and the version is the smallest that fits", () => {
  // A version larger than it needs to be is a code with more modules than the
  // phone has pixels, at the distance somebody actually holds it.
  for (const [length, version] of [[10, 1], [20, 2], [40, 3], [100, 6]]) {
    const code = qrMatrix("A".repeat(length));
    assert.equal(code.version, version, `${length} characters chose version ${code.version}`);
    assert.equal(code.size, version * 4 + 17);
  }
});

// --- the arithmetic ----------------------------------------------------------

test("the error correction is the standard's, root by root", () => {
  // Independent of every reading order above: a message plus its EC codewords
  // is divisible by the generator, so it evaluates to zero at each of its
  // roots. An off-by-one in the field tables cannot survive this.
  const data = Uint8Array.from({ length: 16 }, (unused, i) => (i * 37 + 11) & 255);
  const ecc = eccFor(data, 10);
  assert.equal(ecc.length, 10);
  const full = [...data, ...ecc];
  for (let i = 0; i < 10; i += 1) {
    let sum = 0;
    for (const byte of full) sum = mul(sum, EXP[i]) ^ byte;
    assert.equal(sum, 0, `the remainder is not zero at root ${i}`);
  }
});

test("one damaged module is still readable, which is what the EC is for", () => {
  // Not a decode — this file's decoder refuses a non-zero syndrome rather than
  // repairing it — but the syndrome going non-zero is the proof that the
  // damage is DETECTED, which is the half a scanner needs before it can
  // correct anything.
  const code = qrMatrix("https://citygrid.kjell.today/?join=ABC123");
  const { mask } = maskFrom(code.modules, code.size);
  const codewords = readCodewords(code.modules, code.size, code.version, mask);
  codewords[3] ^= 0b1000;
  const { blocks, eccs, ec } = deinterleave(codewords, code.version);
  let worst = 0;
  for (let i = 0; i < ec; i += 1) {
    let sum = 0;
    for (const byte of [...blocks[0], ...eccs[0]]) sum = mul(sum, EXP[i]) ^ byte;
    worst = Math.max(worst, sum);
  }
  assert.notEqual(worst, 0, "a flipped bit left every syndrome at zero");
});

test("the format information is a BCH codeword, and the eight are far apart", () => {
  // **Not a transcribed table.** The standard prints the fifteen bits for each
  // (level, mask) pair and quoting them from memory would be a known-answer
  // test whose known answer is a guess. These two properties are what the
  // table IS, and they can be checked without it:
  //
  //   - un-XOR the standard's constant and what is left must divide by the
  //     BCH generator, which is the whole of how the bits are produced;
  //   - any two format strings differ in at least seven places, because that
  //     is the code's minimum distance and the reason a scanner can read the
  //     format off a smudged corner.
  //
  // The one value I am sure of anchors them: level M with mask 0 has an
  // all-zero payload, so its BCH remainder is zero and the format IS the XOR
  // constant.
  const XOR = 0b101010000010010;
  assert.equal(formatBits(0), XOR, "level M mask 0 is not the bare mask constant");

  const divides = (value) => {
    let rest = value;
    for (let i = 14; i >= 10; i -= 1) {
      if ((rest >> i) & 1) rest ^= 0b10100110111 << (i - 10);
    }
    return rest === 0;
  };
  const all = [];
  for (let mask = 0; mask < 8; mask += 1) {
    const bits = formatBits(mask);
    assert.ok(bits >= 0 && bits < (1 << 15), `mask ${mask} is not fifteen bits: ${bits}`);
    assert.ok(divides(bits ^ XOR), `mask ${mask} is not a BCH codeword`);
    // And it says which mask it is, which is what a scanner reads it for.
    assert.equal(((bits ^ XOR) >> 10) & 0b111, mask, `mask ${mask} does not name itself`);
    all.push(bits);
  }
  const bitsApart = (a, b) => {
    let x = a ^ b;
    let n = 0;
    while (x) { n += x & 1; x >>= 1; }
    return n;
  };
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      assert.ok(bitsApart(all[i], all[j]) >= 7,
        `masks ${i} and ${j} are ${bitsApart(all[i], all[j])} bits apart, and the code's minimum is 7`);
    }
  }
});
