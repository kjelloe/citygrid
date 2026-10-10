// Walks source trees for the guard tests. Deliberately dependency-free.
//
// These guards run before the code they guard exists: an absent directory is a
// pass, not an error, so the rules are in place on the first line written.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function jsFilesIn(dir) {
  const abs = join(repoRoot, dir);
  const out = [];
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return out; // not created yet
  }
  for (const entry of entries) {
    const full = join(abs, entry.name);
    if (entry.isDirectory()) {
      out.push(...jsFilesIn(relative(repoRoot, full)));
    // `.mjs` too, or `tools/` contributes NOTHING to every scan that lists it —
    // which is how `test/unused-imports.test.js` passed with an unused import in
    // `tools/rail_shots.mjs` on the day it was written (2026-10-06).
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      out.push({ path: relative(repoRoot, full), source: readFileSync(full, "utf8") });
    }
  }
  return out;
}

export function readDoc(name) {
  return readFileSync(join(repoRoot, name), "utf8");
}

export function docExists(name) {
  try {
    statSync(join(repoRoot, name));
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a regex literal ends, or -1 if the `/` at `i` is a division.
 *
 * The three strippers below all read a quote as the start of a string, and a
 * pattern like `/^\+\s*"([^"]+)"/` holds two of them — so from the first
 * such regex onwards the whole file was one unterminated string and every
 * census that scanned it saw NOTHING. `tools/i18n_review.mjs` lost its last 88
 * lines that way, which is why its four module constants read as dead
 * (Q167's omissions round, 2026-10-10).
 *
 * The regex-or-division question is decided by what comes before, which is the
 * only way to decide it without a parser: after a value — a name, a number, a
 * closing bracket — a `/` divides; after an operator, a comma, an opening
 * bracket or a keyword it opens a pattern.
 */
function regexEnd(source, i) {
  let k = i - 1;
  while (k >= 0 && /\s/.test(source[k])) k -= 1;
  const before = k < 0 ? "" : source[k];
  if (before && !/[=(,:[!&|?{};+\-*%~^<>\n]/.test(before)) {
    const word = /[\w$)\]]/.test(before) ? source.slice(0, k + 1).match(/[\w$]+$/)?.[0] : "";
    if (!["return", "typeof", "case", "in", "of", "new", "delete", "void", "do", "else", "yield", "await"].includes(word ?? "")) {
      return -1;
    }
  }
  let j = i + 1;
  let inClass = false;
  while (j < source.length) {
    const c = source[j];
    if (c === "\\") { j += 2; continue; }
    if (c === "\n") return -1; // an unterminated "pattern" was a division after all
    if (inClass) { if (c === "]") inClass = false; }
    else if (c === "[") inClass = true;
    else if (c === "/") return j;
    j += 1;
  }
  return -1;
}

// Strips line comments, block comments and string literals so that a banned
// word in prose or in a message never fails a guard.
export function stripCommentsAndStrings(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < n && source[i] !== "\n") i += 1;
    } else if (two === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
    } else if (source[i] === "/" && regexEnd(source, i) !== -1) {
      i = regexEnd(source, i) + 1;
      out += '/""/';
    } else if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const quote = source[i];
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

// Strips comments and KEEPS the strings — for a scan that is looking for a
// string literal rather than for prose. `stripCommentsAndStrings` above cannot
// be used for that, and a scan over the raw source counts a key quoted in a
// comment as a caller (`a-grep-that-counts-a-comment`, X5).
export function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < n && source[i] !== "\n") i += 1;
    } else if (two === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
    } else if (source[i] === "/" && regexEnd(source, i) !== -1) {
      const end = regexEnd(source, i);
      out += source.slice(i, end + 1);
      i = end + 1;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const quote = source[i];
      out += source[i];
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") { out += source[i]; i += 1; }
        out += source[i];
        i += 1;
      }
      out += quote;
      i += 1;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

export function findViolations(files, pattern) {
  const hits = [];
  for (const file of files) {
    const code = stripCommentsAndStrings(file.source);
    const lines = code.split("\n");
    lines.forEach((line, index) => {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
      let match;
      while ((match = re.exec(line)) !== null) {
        hits.push(`${file.path}:${index + 1} — ${match[0].trim()}`);
      }
    });
  }
  return hits;
}

/** Comments and string bodies out, `${…}` kept. */
export function stripButKeepInterpolations(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < n && source[i] !== "\n") i += 1;
    } else if (two === "/*") {
      i += 2;
      while (i < n && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
    } else if (source[i] === "/" && regexEnd(source, i) !== -1) {
      i = regexEnd(source, i) + 1;
      out += '/""/';
    } else if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
    } else if (source[i] === "`") {
      i += 1;
      let depth = 0;
      while (i < n && (depth > 0 || source[i] !== "`")) {
        if (source[i] === "\\") { i += 2; continue; }
        if (depth === 0 && source.slice(i, i + 2) === "${") { depth = 1; i += 2; out += " "; continue; }
        if (depth > 0) {
          if (source[i] === "{") depth += 1;
          if (source[i] === "}") { depth -= 1; i += 1; out += " "; continue; }
          out += source[i];
        }
        i += 1;
      }
      i += 1;
      out += '""';
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}
