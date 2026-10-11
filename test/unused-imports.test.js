// A name imported and never used (the omissions round, 2026-10-05).
//
// `streets-l3.js` kept `import { houseLots }` after S16a moved the question to
// `unitsOf`, and nothing noticed: the suite was green, the page was right, and
// the file said it still asked the residential ladder what was on a lot. That
// is the shape this project keeps finding from the other end — a module
// imported and never called is a claim the code no longer makes.
//
// So the whole repo, pinned at zero. It is cheap to keep and it says something
// true: every import is a dependency somebody can follow.
//
// The stripper is this file's own, because `stripCommentsAndStrings` removes a
// template literal WHOLE — and `${t("ready")}` is a use of `t`. Strings and
// comments go; what is inside `${}` stays.
//
// **A property is not a use** (M13). `rows.join(", ")` kept
// `import { join } from "node:path"` alive in six tools, which is
// `a-grep-that-counts-a-comment` one layer in: the scan was asking whether the
// NAME appears, and a method call of the same name always makes it appear. The
// match is rejected when a `.` comes before it — with one correction, because
// `...name` has a dot in front of it and IS a use. Measured on the tree
// (2026-10-11): without the spread correction the stricter rule reports 15
// findings of which 9 are spreads; with it, 6 findings and no false ones.

import test from "node:test";
import assert from "node:assert/strict";
import { jsFilesIn, stripButKeepInterpolations } from "./helpers/sources.js";

/** Code with the spread operator flattened, so `...name` cannot be mistaken for
 * a property access by the rule below. Three dots, not one. */
function withoutSpread(code) {
  return code.replace(/\.\.\./g, " ");
}

/** Whether `name` is READ anywhere in this code — a mention after a `.` is a
 * property of something else and not this binding (M13). */
function reads(code, name) {
  return new RegExp(`(?<![.\\w$])\\b${name}\\b`).test(code);
}

/** The local names an import statement binds. */
function boundNames(clause) {
  const names = [];
  const braced = clause.match(/\{([^}]*)\}/);
  if (braced) {
    for (const part of braced[1].split(",")) {
      const bit = part.trim();
      if (bit) names.push((bit.split(/\s+as\s+/).pop() ?? bit).trim());
    }
  }
  for (const part of clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+(\w+)/, "$1").split(",")) {
    const bit = part.trim();
    if (bit) names.push(bit);
  }
  return names.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

test("no module imports a name it never uses", () => {
  const unused = [];
  for (const dir of ["engine", "client", "shared", "worker", "server", "tools"]) {
    for (const file of jsFilesIn(dir)) {
      const code = withoutSpread(stripButKeepInterpolations(file.source));
      const re = /import\s+([^"';]+?)\s+from\s*["'][^"']*["']/g;
      let m;
      while ((m = re.exec(code)) !== null) {
        const rest = code.slice(0, m.index) + code.slice(m.index + m[0].length);
        for (const name of boundNames(m[1])) {
          if (!reads(rest, name)) unused.push(`${file.path}: ${name}`);
        }
      }
    }
  }
  assert.deepEqual(unused, [],
    `${unused.length} name(s) imported and never used — delete the import, or call it`);
});

/**
 * The same question one line down: a module constant declared and never read.
 *
 * `building-kit.js` kept `TOP = 1.0` after the roof stopped multiplying by it,
 * and nine tools kept `const root = …` after Q167 moved serving the tree into
 * `server/static.js` — where it did something worse than nothing: it kept
 * `join`, `dirname` and `fileURLToPath` LOOKED-AT, so the import census above
 * passed over three dead imports per file.
 *
 * Top-level only, and `const` only. A local in a 200-line function is a
 * different question with a different answer, and `let` is often written to
 * before it is read.
 */
test("no module declares a top-level const it never reads", () => {
  const dead = [];
  for (const dir of ["engine", "client", "shared", "worker", "server", "tools"]) {
    for (const file of jsFilesIn(dir)) {
      const code = withoutSpread(stripButKeepInterpolations(file.source));
      const re = /^const\s+([A-Za-z_$][\w$]*)\s*=/gm;
      let m;
      while ((m = re.exec(code)) !== null) {
        const rest = code.slice(0, m.index) + code.slice(m.index + m[0].length);
        if (!reads(rest, m[1])) dead.push(`${file.path}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(dead, [],
    `${dead.length} constant(s) declared and never read — delete them, or read them`);
});
