// The tools parse (slice D9).
//
// `tools/` is a directory of scripts that nothing imports: a gate is run, not
// required, so a syntax error in one is invisible to the suite and shows up the
// moment somebody runs it — usually at the end of a long slice, usually as the
// last step before a commit.
//
// `tools/perf_report.mjs` was the third instance: it builds a Markdown page in a
// template literal, and three separate edits quoted a `name` in the prose and
// closed the template early. Half a second of `node --check` moves that from a
// surprise into a red suite.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

const scripts = () => {
  const dir = join(repoRoot, "tools");
  return readdirSync(dir)
    // Not `.` files: a probe somebody is mid-way through is their business.
    .filter((name) => /\.mjs$/.test(name) && !name.startsWith("."))
    .map((name) => join("tools", name));
};

test("every tool parses", () => {
  const broken = [];
  for (const script of scripts()) {
    try {
      execFileSync(process.execPath, ["--check", script], { cwd: repoRoot, stdio: "pipe" });
    } catch (error) {
      broken.push(`${script}: ${String(error.stderr ?? error).split("\n").slice(0, 3).join(" ")}`);
    }
  }
  assert.deepEqual(broken, [], broken.join("\n"));
});

test("there are tools to check, so an empty pass is not a pass", () => {
  assert.ok(scripts().length > 15, `${scripts().length} tools found`);
});
