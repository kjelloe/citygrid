// The instrument the censuses are read through (Q167's omissions round).
//
// Fourteen guard tests ask their question of `test/helpers/sources.js`'s
// strippers rather than of the raw source, because a name quoted in a comment
// is not a caller (`a-grep-that-counts-a-comment`). None of them could tell
// whether the stripper had understood the file — and it had not:
// `/^\+\s*"([^"]+)"/` is a regex literal holding two quotes, so from that line
// onwards `tools/i18n_review.mjs` was ONE UNTERMINATED STRING and the last 88
// of its 143 lines were invisible to every scan that listed `tools/`. The
// symptom was four module constants reading as dead.
//
// So the instrument gets its own gate. These are the cases that broke it and
// the division that must not be mistaken for a pattern.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripCommentsAndStrings, stripComments, stripButKeepInterpolations } from "./helpers/sources.js";

const STRIPPERS = [
  ["stripCommentsAndStrings", stripCommentsAndStrings],
  ["stripComments", stripComments],
  ["stripButKeepInterpolations", stripButKeepInterpolations],
];

test("a regex literal holding a quote does not swallow the rest of the file", () => {
  const source = 'const re = /^\\+\\s*"([^"]+)"/;\nconst after = used;\n';
  for (const [name, strip] of STRIPPERS) {
    assert.match(strip(source), /\bafter\b/, `${name} lost everything after the pattern`);
    assert.match(strip(source), /\bused\b/, `${name} lost everything after the pattern`);
  }
});

test("an apostrophe in a pattern is not a string either", () => {
  for (const [name, strip] of STRIPPERS) {
    const out = strip("const q = /don't/;\nconst after = used;\n");
    assert.match(out, /\bafter\b/, name);
  }
});

test("a division is still a division", () => {
  for (const [name, strip] of STRIPPERS) {
    const out = strip("const half = total / 2;\nconst third = count / 3;\n");
    assert.match(out, /total \/ 2/, name);
    assert.match(out, /count \/ 3/, name);
  }
});

test("a slash inside a character class does not end the pattern", () => {
  for (const [name, strip] of STRIPPERS) {
    const out = strip('const path = /[a-z\\/]+"x"/;\nconst after = used;\n');
    assert.match(out, /\bafter\b/, name);
  }
});

test("a pattern after return, and one divided by a call's result", () => {
  for (const [name, strip] of STRIPPERS) {
    const out = strip('function f() { return /"a"/.test(s); }\nconst r = size() / 2;\n');
    assert.match(out, /\br\b/, name);
    assert.match(out, /size\(\) \/ 2/, name);
  }
});

test("comments and strings still go, and interpolations still stay", () => {
  const source = 'const a = "secret"; // comment\nconst b = `x ${used} y`;\n';
  assert.doesNotMatch(stripCommentsAndStrings(source), /secret|comment|used/);
  assert.match(stripComments(source), /secret/);
  assert.doesNotMatch(stripComments(source), /comment/);
  assert.match(stripButKeepInterpolations(source), /\bused\b/);
  assert.doesNotMatch(stripButKeepInterpolations(source), /secret/);
});

test("the strippers are read on the real tree, not only on these fixtures", () => {
  // The cases above are five lines each; the file they stand for is 143.
  // `tools/i18n_review.mjs` is the one that went blind, so it is the one
  // asserted: what comes after its quote-bearing pattern has to survive.
  const source = readFileSync(new URL("../tools/i18n_review.mjs", import.meta.url), "utf8");
  const tail = source.slice(source.indexOf("const key = /"));
  assert.ok(tail.length > 0, "the pattern that broke it has moved — re-aim this check");
  assert.match(stripButKeepInterpolations(source), /writeFileSync\(NO/,
    "the tail of i18n_review.mjs is invisible to the stripper again");
});
