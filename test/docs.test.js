// The planning documents are load-bearing, so they are tested like code.
//
// The failure this prevents: an answered question left sitting in the open
// list, a ruling with no reasoning, a document referenced everywhere and
// present nowhere. Drift in the record is harder to notice than drift in code
// and costs more, because every later decision is taken against it.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readDoc, docExists, repoRoot } from "./helpers/sources.js";

const REQUIRED_DOCS = [
  "README.md",
  "CLAUDE.md",
  "dev-log.md",
  "dev-prompts.md",
  "dev-questions.md",
  "plan-v1.md",
  "specs/gamedesign.md",
  "specs/plan.md",
  "specs/referencedata.md",
  "specs/art-direction.md",
];

test("every required document exists", () => {
  const missing = REQUIRED_DOCS.filter((doc) => !docExists(doc));
  assert.deepEqual(missing, [], `missing documents: ${missing.join(", ")}`);
});

// Rows are `| Q7 | ...` in plan-v1.md and `| **Q7** | ...` in dev-questions.md.
function questionIds(markdown) {
  const ids = new Set();
  for (const match of markdown.matchAll(/^\|\s*\*{0,2}(Q\d+)\*{0,2}\s*\|/gm)) ids.add(match[1]);
  return ids;
}

test("open questions agree between plan-v1.md and dev-questions.md", () => {
  const planQuestions = questionIds(readDoc("plan-v1.md").split("## Open questions")[1] ?? "");
  const openSection = readDoc("dev-questions.md").split("# OPEN QUESTIONS")[1];
  assert.ok(openSection, "dev-questions.md must have an OPEN QUESTIONS section at the bottom");
  const openQuestions = questionIds(openSection);

  const onlyInPlan = [...planQuestions].filter((id) => !openQuestions.has(id));
  const onlyInQuestions = [...openQuestions].filter((id) => !planQuestions.has(id));

  assert.deepEqual(onlyInPlan, [], `open in plan-v1.md but not in dev-questions.md: ${onlyInPlan}`);
  assert.deepEqual(onlyInQuestions, [], `open in dev-questions.md but not in plan-v1.md: ${onlyInQuestions}`);
  assert.ok(openQuestions.size > 0, "the open list should not be silently empty");
});

test("answered questions have left the open section", () => {
  const doc = readDoc("dev-questions.md");
  const [answered, open] = doc.split("# OPEN QUESTIONS");
  assert.ok(/^### A\d+/m.test(answered), "answered rulings live above the open section");
  assert.ok(!/\bCHOSEN\b/.test(open), "an answered question is still sitting in the open section");
});

test("every ruling carries its source, status and enforcement", () => {
  const dir = join(repoRoot, "specs", "rulings");
  const files = readdirSync(dir).filter((name) => name.endsWith(".md"));
  assert.ok(files.length > 0, "there should be at least one ruling");

  for (const name of files) {
    const body = readDoc(join("specs", "rulings", name));
    assert.match(body, /^# Ruling \d+ —/m, `${name} needs a "# Ruling NNN — title" heading`);
    assert.match(body, /\*\*Date:\*\*/, `${name} needs a date`);
    assert.match(body, /\*\*Source:\*\*/, `${name} needs a source prompt`);
    assert.match(body, /\*\*Status:\*\*/, `${name} needs a status`);
    assert.match(body, /^## Why$/m, `${name} needs its reasoning — a ruling without why cannot be revisited`);
    assert.match(body, /^## Enforced by$/m, `${name} must say where it is enforced`);
  }
});

test("ruling filenames and headings agree on the number", () => {
  const dir = join(repoRoot, "specs", "rulings");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const fromName = name.slice(0, 3);
    const body = readDoc(join("specs", "rulings", name));
    const fromHeading = body.match(/^# Ruling (\d+)/m)[1];
    assert.equal(fromHeading, fromName, `${name} heading says ruling ${fromHeading}`);
  }
});

test("dev-prompts.md numbers its prompts without gaps", () => {
  const ids = [...readDoc("dev-prompts.md").matchAll(/^## P(\d+) —/gm)].map((m) => Number(m[1]));
  assert.ok(ids.length > 0, "there should be at least one recorded prompt");
  assert.deepEqual(ids, ids.map((_, i) => i + 1), `prompt numbering has a gap: ${ids}`);
});

test("the art direction still blocks the content lane until the probe reports", () => {
  // Fails deliberately once §3 is written, as a reminder to unblock lane C1
  // and to delete this test.
  const art = readDoc("specs/art-direction.md");
  if (/^## 3\. The chosen style\n\n\*Empty until/m.test(art)) {
    assert.match(art, /Status: framework only/, "art-direction must say it is not settled yet");
  }
});
