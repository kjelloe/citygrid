// The planning documents are load-bearing, so they are tested like code.
//
// The failure this prevents: an answered question left sitting in the open
// list, a ruling with no reasoning, a document referenced everywhere and
// present nowhere. Drift in the record is harder to notice than drift in code
// and costs more, because every later decision is taken against it.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
  "specs/engine/README.md",
];

/** cityviewer's specification (ruling 032). The README is its index and every
 * file has to be listed there, or a document exists that nothing points at. */
const ENGINE_DIR = "specs/engine";

/** `dev-prompts.md` and `dev-questions.md` are LOCAL, by Kjell's decision
 * (P24): they are in `.gitignore` and untracked, so a fresh clone does not have
 * them. The checks below are still the ones that keep the decision record
 * honest, so they run wherever the files are — and skip, loudly, where they are
 * not, rather than turning a clean clone's suite red. */
const LOCAL_DOCS = ["dev-prompts.md", "dev-questions.md"];
const haveLocalDocs = LOCAL_DOCS.every((doc) => docExists(doc));

test("the local documents stay out of git", () => {
  // Kjell's call (P24, reaffirmed P28): these are working notes and the repo is
  // public. `.gitignore` lists them, but gitignore does not untrack — they were
  // committed for the life of the project before anyone noticed, and a
  // `git add -f`, a new clone with a stale ignore file, or a rename would put
  // them back just as quietly.
  //
  // A rule nobody enforces is a suggestion, so this enforces it.
  if (!existsSync(join(repoRoot, ".git"))) return;   // a tarball, not a checkout
  const tracked = execFileSync("git", ["ls-files", "--", ...LOCAL_DOCS], {
    cwd: repoRoot, encoding: "utf8",
  }).split("\n").filter(Boolean);
  assert.deepEqual(tracked, [],
    `these are tracked and must not be: ${tracked.join(", ")}. `
    + "Untrack with: git rm --cached <file>  (the file stays on disk)");

  const ignored = readFileSync(join(repoRoot, ".gitignore"), "utf8");
  for (const doc of LOCAL_DOCS) {
    assert.ok(ignored.split("\n").some((line) => line.trim() === doc),
      `${doc} is not in .gitignore, so the next 'git add -A' takes it`);
  }
});

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

// --- cityviewer ---------------------------------------------------------------

function engineDocs() {
  return readdirSync(join(repoRoot, ENGINE_DIR)).filter((n) => n.endsWith(".md") && n !== "README.md");
}

test("every cityviewer document is indexed by the engine README", () => {
  const index = readDoc(join(ENGINE_DIR, "README.md"));
  const unlisted = engineDocs().filter((name) => !index.includes("`" + name + "`"));
  assert.deepEqual(unlisted, [], `specs/engine documents missing from the README index: ${unlisted}`);
  assert.ok(engineDocs().length >= 12, "the specification is twelve documents plus the index");
});

test("every decision cityviewer settled names a ruling that exists", () => {
  // 12-decisions.md carries a table of choice → ruling number. A number in
  // that table with no file behind it is a decision taken and not written down
  // — the drift rulings exist to prevent.
  const decisions = readDoc(join(ENGINE_DIR, "12-decisions.md"));
  const table = decisions.slice(decisions.indexOf("| Decision |"), decisions.indexOf("The sections below"));
  const cited = new Set([...table.matchAll(/\| (\d{3})(?: \(amends \d{3}\))? \|$/gm)].map((m) => m[1]));
  assert.ok(cited.size >= 9, `only ${cited.size} rulings cited — the settled table looks truncated`);
  const files = readdirSync(join(repoRoot, "specs", "rulings"));
  const missing = [...cited].filter((n) => !files.some((f) => f.startsWith(n + "-")));
  assert.deepEqual(missing, [], `rulings cited by 12-decisions.md with no file: ${missing}`);
});

test("cityviewer's rulings point back at the specification", () => {
  // 032 onward were written from specs/engine; a later edit that drops the
  // pointer leaves a ruling nobody can trace to its design.
  const files = readdirSync(join(repoRoot, "specs", "rulings")).filter((f) => Number(f.slice(0, 3)) >= 32);
  assert.ok(files.length >= 9, "rulings 032-040 should exist");
  for (const name of files) {
    assert.ok(readDoc(join("specs", "rulings", name)).includes("specs/engine/"), `${name} does not cite specs/engine/`);
  }
});

test("plan-v1 carries the cityviewer lane the roadmap describes", () => {
  const plan = readDoc("plan-v1.md");
  const roadmap = readDoc(join(ENGINE_DIR, "11-roadmap.md"));
  const slices = new Set([...roadmap.matchAll(/^\| \*\*([EPV]\d)\*\* \|/gm)].map((m) => m[1]));
  assert.ok(slices.size >= 14, `roadmap lists ${slices.size} slices — expected the E, V and P series`);
  const missing = [...slices].filter((id) => !new RegExp("^\\| \\*\\*" + id + "\\*\\* \\|", "m").test(plan));
  assert.deepEqual(missing, [], `slices in the roadmap with no row in plan-v1.md: ${missing}`);
});

test("cityviewer's settled constants agree across the specification", () => {
  // The frame (04), the decisions table (12) and ruling 035 all state the tile
  // size; the relief step is in 12 and ruling 038. One number, three places.
  const model = readDoc(join(ENGINE_DIR, "04-city-model.md"));
  const decisions = readDoc(join(ENGINE_DIR, "12-decisions.md"));
  assert.match(model, /20 m is settled/, "04-city-model must record the settled tile size");
  assert.match(decisions, /\| D2 tile \| 20 m \|/, "12-decisions must settle D2 at 20 m");
  assert.match(readDoc("specs/rulings/035-a-tile-is-twenty-metres.md"), /TILE_M = 20/);
  assert.match(decisions, /\| D7 relief \| 0\.5 m per elevation step/);
  assert.match(readDoc("specs/rulings/038-relief-is-half-a-metre-a-step.md"), /RELIEF_M = 0\.5/);
});
