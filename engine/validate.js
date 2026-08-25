// Argument validation for commands.
//
// Every command arrives from a network or a replay file and is therefore
// untrusted. The trap this module exists for: `undefined < 0` and
// `undefined > 3` are BOTH false, so a naive range check accepts undefined and
// writes it straight into hashed state. Found by tools/chaos.mjs.

export function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

export function isIntInRange(value, low, high) {
  return isInt(value) && value >= low && value <= high;
}

export function isString(value) {
  return typeof value === "string";
}

export function isBool(value) {
  return value === true || value === false;
}

/** An array of integers, as run-length pairs or index lists arrive. */
export function isIntArray(value, maxLength) {
  if (!Array.isArray(value)) return false;
  if (maxLength !== undefined && value.length > maxLength) return false;
  for (var i = 0; i < value.length; i += 1) {
    if (!isInt(value[i])) return false;
  }
  return true;
}

/** Player-authored text is untrusted input and hashed state at once: cap it,
 * strip control characters, and normalise whitespace. Never rendered as
 * markup, never run through the locale catalogue.
 *
 * Truncation is by BYTE budget but on a character boundary, so a multi-byte
 * character is never cut in half — a lone surrogate would hash differently
 * depending on how the runtime repaired it. */
export function sanitiseText(value, maxBytes) {
  if (typeof value !== "string") return "";
  var cleaned = "";
  for (var i = 0; i < value.length; i += 1) {
    var code = value.charCodeAt(i);
    // C0 and C1 control ranges, plus the line separators.
    var isControl = (code < 32) || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
    cleaned += isControl ? " " : value.charAt(i);
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  var bytes = 0;
  var out = "";
  for (var k = 0; k < cleaned.length; k += 1) {
    var ch = cleaned.charAt(k);
    var point = cleaned.codePointAt(k);
    var width = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    // A surrogate pair is one code point across two units; take both or neither.
    if (point >= 0x10000) {
      if (bytes + width > maxBytes) break;
      out += cleaned.charAt(k) + cleaned.charAt(k + 1);
      k += 1;
      bytes += width;
      continue;
    }
    if (bytes + width > maxBytes) break;
    out += ch;
    bytes += width;
  }
  return out;
}
