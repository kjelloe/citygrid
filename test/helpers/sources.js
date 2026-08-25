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
    } else if (entry.name.endsWith(".js")) {
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
