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
  "workitems-cityviewer.md",
  "workitems-mainline.md",
  "workitems-measurement.md",
  "workitems-film.md",
  "workitems-worker.md",
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

/** Working files under `reports/` that a reviewer or a probe produced and
 * nobody meant to keep: gate transcripts and the scratch captures a slice takes
 * while it is looking at something. The artefacts a slice DELIVERS — the perf
 * cards, the compare sheet, the overlay shots, `i18n-review.md` — stay. */
const SCRATCH = ["reports/review*.log", "reports/tmp/"];

test("the reviewer's scratch stays out of git", () => {
  // Same argument as the local documents above and a different shape of leak:
  // `reports/review3-*.log` is seven gate transcripts and `reports/tmp/` four
  // PNGs a probe wrote while somebody was looking at a bug, all committed by a
  // `git add -A` at the end of a long session (M5). Patterns rather than names,
  // because the next review round writes `review4-` and would slip through a
  // list.
  if (!existsSync(join(repoRoot, ".git"))) return;   // a tarball, not a checkout
  const tracked = execFileSync("git", ["ls-files", "--", ...SCRATCH], {
    cwd: repoRoot, encoding: "utf8",
  }).split("\n").filter(Boolean);
  assert.deepEqual(tracked, [],
    `scratch is tracked and must not be: ${tracked.join(", ")}. `
    + "Untrack with: git rm --cached <path>  (the file stays on disk)");

  const ignored = readFileSync(join(repoRoot, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
  for (const pattern of SCRATCH) {
    assert.ok(ignored.includes(pattern),
      `${pattern} is not in .gitignore, so the next 'git add -A' takes it`);
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

test("every cityviewer work item is a slice in plan-v1", () => {
  // The hand-off names slices by id; an id with no row in the plan is work
  // nobody scheduled and nobody will tick.
  const items = [...readDoc("workitems-cityviewer.md").matchAll(/^### ([EPV]\d) —/gm)].map((m) => m[1]);
  assert.ok(items.length >= 12, `only ${items.length} work items`);
  const plan = readDoc("plan-v1.md");
  const missing = items.filter((id) => !new RegExp("^\\| \\*\\*" + id + "\\*\\* \\|", "m").test(plan));
  assert.deepEqual(missing, [], `work items with no plan-v1 row: ${missing}`);
});

test("ruling 040's tier table is the one in the data (R2)", () => {
  // The ruling said 200k/80k for two slices after E5 measured them at
  // 320k/140k. A table in a document describing numbers in a file is the same
  // defect class as a cost table describing code elsewhere — nothing goes red
  // when the file moves under it.
  const ruling = readdirSync(join(repoRoot, "specs", "rulings"))
    .filter((n) => n.startsWith("040"))
    .map((n) => readFileSync(join(repoRoot, "specs", "rulings", n), "utf8"))
    .join("\n");
  const data = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8")).tiers;
  const thousands = (n) => `${Math.round(n / 1000)}k`;
  for (const [name, tier] of Object.entries(data)) {
    const row = ruling.split("\n").find((l) => l.trim().startsWith(`| ${name[0].toUpperCase()}${name.slice(1)} |`));
    assert.ok(row, `ruling 040 has no row for the ${name} tier`);
    assert.ok(row.includes(thousands(tier.budget)),
      `ruling 040's ${name} row does not say ${thousands(tier.budget)}: ${row.trim()}`);
    const chunks = tier.streetChunks === 0 ? "none" : String(tier.streetChunks);
    assert.ok(row.includes(chunks),
      `ruling 040's ${name} row does not say ${chunks} street chunks: ${row.trim()}`);
    // The frame target, added to the table in D5. It was in the data file and
    // in no document at all, which is how it stayed at the refresh interval —
    // 16 ms against a 16.666 ms frame — for the life of the governor, giving up
    // the whole ladder on a machine at a locked 60 fps.
    assert.ok(row.includes(`${tier.frameMs} ms`),
      `ruling 040's ${name} row does not say its ${tier.frameMs} ms frame target: ${row.trim()}`);
  }
});

test("no tier aims at the refresh interval it is trying to hit", () => {
  // The defect D5 fixed, guarded where the number lives rather than only where
  // the governor reads it. `p95 <= target` is the whole test and a 60 Hz
  // display delivers 16.666 ms, so a target of 16 is unmeetable — and silent,
  // because the picture degrades while the frame time stays perfect.
  const tiers = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8")).tiers;
  for (const [name, tier] of Object.entries(tiers)) {
    for (const hz of [30, 60, 120, 144]) {
      const interval = 1000 / hz;
      assert.ok(Math.abs(tier.frameMs - interval) > 0.5,
        `the ${name} tier's ${tier.frameMs} ms target is the ${hz} Hz interval (${interval.toFixed(2)} ms)`);
    }
  }
});

test("the README names every gate a slice has to run", () => {
  const readme = readDoc("README.md");
  for (const gate of [
    "budget_gate", "walkthrough", "passability", "lanes_dump",
    "a11y_smoke", "lobby_smoke", "serve_smoke", "offline_smoke", "update_smoke",
  ]) {
    assert.match(readme, new RegExp(`tools/${gate}`), `the README does not name ${gate}`);
  }
});

// --- the release page (slice M3) ---------------------------------------------
//
// A page that says what the game IS at this commit, for a player and for the
// next developer. The rest of the documents say what it is meant to be; this one
// says what was true when somebody last looked, which is a different claim and
// the only one a reader can check.

test("RELEASE.md exists and names the commit it describes", () => {
  assert.ok(docExists("RELEASE.md"), "there is no release page");
  const release = readDoc("RELEASE.md");
  assert.match(release, /^- \*\*Commit:\*\* `[0-9a-f]{7,40}`/m,
    "the release page does not name a commit");
});

test("the release page's commit is a commit that exists", () => {
  // Not "is HEAD": the page is written at the release commit and every commit
  // after it makes the page one older, which is normal and not a failure. What
  // would be a lie is a SHA that is not in the history at all.
  const sha = /^- \*\*Commit:\*\* `([0-9a-f]{7,40})`/m.exec(readDoc("RELEASE.md"))[1];
  const known = execFileSync("git", ["cat-file", "-t", sha], { cwd: repoRoot, encoding: "utf8" }).trim();
  assert.equal(known, "commit", `${sha} is a ${known}, not a commit`);
});

test("the release page says how far behind HEAD it is, or warns", () => {
  // A WARNING, not a failure, exactly as M3 asks. A stale release page is a
  // normal state — it is stale the moment the next slice lands — and a test
  // that goes red for it would be re-dated rather than read.
  const sha = /^- \*\*Commit:\*\* `([0-9a-f]{7,40})`/m.exec(readDoc("RELEASE.md"))[1];
  const behind = Number(execFileSync("git", ["rev-list", "--count", `${sha}..HEAD`],
    { cwd: repoRoot, encoding: "utf8" }).trim());
  if (behind > 0) {
    console.log(`      note: RELEASE.md describes ${sha}, ${behind} commit(s) behind HEAD`);
  }
  assert.ok(Number.isFinite(behind));
});

test("the release page carries the numbers a reader would otherwise have to run", () => {
  const release = readDoc("RELEASE.md");
  for (const wanted of ["./run.sh", "./test.sh", "gates.mjs", "era 1", "dev-log.md"]) {
    assert.ok(release.includes(wanted) || release.includes(wanted.replace("./", "")),
      `the release page never mentions ${wanted}`);
  }
  // The tier budgets, which are the numbers every other measurement is against.
  const tiers = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8")).tiers;
  for (const [name, tier] of Object.entries(tiers)) {
    assert.ok(release.includes(tier.budget.toLocaleString("en-GB")) || release.includes(String(tier.budget)),
      `the release page does not carry the ${name} tier's budget of ${tier.budget}`);
    assert.ok(release.includes(`${tier.frameMs} ms`),
      `the release page does not carry the ${name} tier's ${tier.frameMs} ms frame target`);
  }
});

test("the release page's open-question count matches dev-questions.md", () => {
  // The one number on the page that rots silently: "what is known to be
  // missing" is a count of the open list, and the open list grows every slice.
  const open = readDoc("dev-questions.md").split("# OPEN QUESTIONS")[1]
    .match(/^\| \*\*Q\d+\*\*/gm).length;
  const claimed = /(\d+)\s+open questions/i.exec(readDoc("RELEASE.md"));
  assert.ok(claimed, "the release page does not say how many questions are open");
  assert.equal(Number(claimed[1]), open,
    `the page says ${claimed[1]} open questions and dev-questions.md has ${open}`);
});
