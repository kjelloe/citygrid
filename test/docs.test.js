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
import { PALETTES } from "../client/render/palettes.js";
import { PLAYER_COLOURS } from "../client/render/palette.js";

const REQUIRED_DOCS = [
  "README.md",
  "CLAUDE.md",
  "dev-log.md",
  "plan-v1.md",
  "specs/gamedesign.md",
  "specs/plan.md",
  "specs/referencedata.md",
  "specs/art-direction.md",
];

/** `dev-prompts.md` and `dev-questions.md` are LOCAL, by Kjell's decision
 * (P24): they are in `.gitignore` and untracked, so a fresh clone does not have
 * them. The checks below are still the ones that keep the decision record
 * honest, so they run wherever the files are — and skip, loudly, where they are
 * not, rather than turning a clean clone's suite red. */
const LOCAL_DOCS = ["dev-prompts.md", "dev-questions.md"];
const haveLocalDocs = LOCAL_DOCS.every((doc) => docExists(doc));

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

test("open questions agree between plan-v1.md and dev-questions.md", { skip: haveLocalDocs ? false : "dev-questions.md is local and not in this checkout" }, () => {
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

test("answered questions have left the open section", { skip: haveLocalDocs ? false : "dev-questions.md is local and not in this checkout" }, () => {
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

test("dev-prompts.md numbers its prompts without gaps", { skip: haveLocalDocs ? false : "dev-prompts.md is local and not in this checkout" }, () => {
  const ids = [...readDoc("dev-prompts.md").matchAll(/^## P(\d+) —/gm)].map((m) => Number(m[1]));
  assert.ok(ids.length > 0, "there should be at least one recorded prompt");
  assert.deepEqual(ids, ids.map((_, i) => i + 1), `prompt numbering has a gap: ${ids}`);
});

test("the chosen style is specified, not merely named", () => {
  // Replaces the gate that used to block the content lane. §3 was empty until
  // the probe reported; now that it is written, what matters is that it says
  // enough to build content against.
  const art = readDoc("specs/art-direction.md");
  assert.match(art, /^## 3\. The chosen style/m, "art-direction §3 must exist");
  assert.doesNotMatch(art, /Empty until probe/, "§3 is settled — ruling 022");
  for (const heading of ["Palette", "Lighting rig", "Silhouette rules", "Ladders"]) {
    assert.ok(art.includes(heading), `§3 must specify the ${heading.toLowerCase()}`);
  }
});

test("the documented palette matches the code", () => {
  // A palette written down in one place and implemented in another is two
  // palettes. Every hex the art direction quotes has to be a hex the renderer
  // actually uses, or the content lane builds against a document that lies.
  const art = readDoc("specs/art-direction.md");
  const section = art.slice(art.indexOf("### 3.1 Palette"), art.indexOf("### 3.2"));
  const quoted = new Set([...section.matchAll(/`(0x[0-9a-f]{6})`/g)].map((m) => m[1]));
  assert.ok(quoted.size > 20, `only ${quoted.size} colours documented — §3.1 looks truncated`);

  const plain = PALETTES.plain;
  const real = new Set([
    plain.sky, plain.road, plain.roadMark, plain.wire, plain.lamp, plain.tree,
    plain.lawn, plain.civic,
    ...plain.terrain, ...plain.zone.slice(1),
    ...plain.roof.house, ...plain.roof.flat,
    ...PLAYER_COLOURS.slice(1),
  ].map((v) => `0x${v.toString(16).padStart(6, "0")}`));

  const stale = [...quoted].filter((hex) => !real.has(hex));
  assert.deepEqual(stale, [], `art-direction quotes colours the renderer does not use: ${stale}`);
});
