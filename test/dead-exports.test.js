// An export nothing reaches (the omissions round, 2026-10-05).
//
// The companion to `test/unused-imports.test.js`, from the other end. A module
// that exports a function nobody calls is a claim the project no longer makes:
// `streets-l3.js` exported `bakeLots`, the all-at-once baker, for every slice
// since the chunk baker went phased — and two tests in `facade-spec.test.js`
// quoted its name while asserting about code that never ran.
//
// What this does NOT object to is an export used only by a test or a tool: a
// budget constant a test checks, a form table a sweep prints. Those have a
// reader; it is simply not the game.
//
// What is left is declared AHEAD of its mechanics, which this project does on
// purpose (Wave 5's contract) — so the list is pinned with the slice that will
// use each one, and adding to it is a deliberate act.

import test from "node:test";
import assert from "node:assert/strict";
import { jsFilesIn, repoRoot, stripButKeepInterpolations } from "./helpers/sources.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Declared ahead of the slice that will read it, on purpose. */
const DECLARED_AHEAD = [
  // Wave 5's commands: a constant and no handler, listed with their slices in
  // `test/omissions.test.js` as well.
  "engine/commands.js: CMD_TRANSFER_FUNDS",
  "engine/commands.js: CMD_SET_REQUEST_POLICY",
  "engine/commands.js: CMD_CLAIM_SECTOR",
  "engine/commands.js: CMD_OPEN_BORDER",
  "engine/commands.js: CMD_MUTUAL_AID",
  "engine/commands.js: CMD_OFFER_CONTRACT",
  "engine/commands.js: CMD_RESOLVE_CONTRACT",
  "engine/commands.js: isSystemCommand",
  // Tile flags and modes. These document the BIT LAYOUT as much as the feature:
  // deleting one frees a bit a later slice would quietly reuse.
  "engine/constants.js: FLAG_CONDUCTS",
  "engine/constants.js: FLAG_PROTECTED",
  // X3c put the derelict CLOCK in `state.derelicts`; the flag is the renderer's
  // half of §25.4 — "derelict buildings are visibly marked" — which is X3b.
  "engine/constants.js: FLAG_DERELICT",
  "engine/constants.js: NET_NONE",
  "engine/constants.js: MODE_SCENARIO_COOP",
  "engine/constants.js: TREASURY_SEPARATE",
  "engine/constants.js: PLAYER_REGENT",
];

const DIRS = ["engine", "client", "shared", "worker", "server"];

/** Every .html in the repo's own folders — `tools/shoot.html` is a real reader
 * (it drives `client/debug/tour.js`), and a scan of .js files alone called that
 * module dead. */
function htmlSources() {
  const out = [];
  for (const dir of ["tools", "client", "."]) {
    const base = join(repoRoot, dir);
    for (const name of readdirSync(base, { withFileTypes: true })) {
      if (!name.isFile() || !name.name.endsWith(".html")) continue;
      out.push(readFileSync(join(base, name.name), "utf8"));
    }
  }
  return out;
}

test("every export has a reader somewhere, or is pinned as declared ahead", () => {
  const files = DIRS.flatMap((dir) => jsFilesIn(dir));
  const elsewhere = [
    ...files.map((f) => ({ path: f.path, code: stripButKeepInterpolations(f.source) })),
    ...jsFilesIn("test").map((f) => ({ path: f.path, code: stripButKeepInterpolations(f.source) })),
    ...jsFilesIn("tools").map((f) => ({ path: f.path, code: stripButKeepInterpolations(f.source) })),
  ];
  const html = htmlSources();

  const orphans = [];
  for (const file of files) {
    const code = stripButKeepInterpolations(file.source);
    const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1];
      const word = new RegExp(`\\b${name}\\b`);
      const readBySomebody = elsewhere.some((other) => other.path !== file.path && word.test(other.code))
        || html.some((source) => word.test(source))
        || word.test(code.replace(m[0], ""));
      if (!readBySomebody) orphans.push(`${file.path}: ${name}`);
    }
  }
  assert.deepEqual(orphans.sort(), [...DECLARED_AHEAD].sort(),
    "an export nothing reaches — call it, delete it, or pin it here with the slice that will");
});
