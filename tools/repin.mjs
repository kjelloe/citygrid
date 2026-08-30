// Re-pin the fixtures after a deliberate change to hashed state.
//
//   node tools/repin.mjs "why, in one sentence"
//   node tools/repin.mjs --only founding.json "why"
//
// Re-pinning is a deliberate, recorded act, never a way to get to green. So:
//
//   - the reason is REQUIRED and is written into the file. A fixture whose
//     `why` says "fix tests" is a fixture nobody will trust in six months.
//   - it ABORTS on event drift unless `--events-changed` is given with it.
//     A new event inside a pinned window means the reducer is wrong, not the
//     fixture (CLAUDE.md), and the abort is the tool working.
//   - it prints the old and new hash of every step it changes, so the diff in
//     the commit says what moved.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FIXTURE_DIR, loadSystems, readFixture, fixtureNames, replay } from "./fixtures.mjs";
import { rules } from "../engine/rules.js";

const argv = process.argv.slice(2);
const eventsChanged = argv.includes("--events-changed");
const onlyAt = argv.indexOf("--only");
const only = onlyAt >= 0 ? argv[onlyAt + 1] : undefined;
const why = argv.filter((a, i) => !a.startsWith("--") && i !== onlyAt + 1).join(" ").trim();

if (!why) {
  console.error("A reason is required:  node tools/repin.mjs \"why, in one sentence\"");
  process.exit(2);
}

await loadSystems();

const names = only ? [only] : await fixtureNames();
if (names.length === 0) {
  console.error(`No fixtures in ${FIXTURE_DIR}`);
  process.exit(2);
}

let aborted = false;
for (const name of names) {
  const fixture = await readFixture(name);
  const before = replay(fixture);

  const drift = before.problems.filter((p) => p.includes("EVENT DRIFT"));
  if (drift.length > 0 && !eventsChanged) {
    console.error(`\n${name}: REFUSING to re-pin — the events changed.\n`);
    for (const problem of drift) console.error(`  ${problem}`);
    console.error(`
Event drift inside a pinned window means the reducer is wrong, not the fixture.
Prefer silent state changes for routine ticks: counters, timers and accruals
should not emit events inside a fixture's window.

If the new events are genuinely intended, say so:
  node tools/repin.mjs --events-changed "${why}"`);
    aborted = true;
    continue;
  }

  const old = fixture.steps.map((s) => s.hash);
  replay(fixture, { record: true });

  let moved = 0;
  fixture.steps.forEach((step, i) => {
    if (old[i] !== undefined && old[i] !== step.hash) {
      console.log(`  step ${i} (${step.command.type}): ${old[i]} → ${step.hash}`);
      moved += 1;
    }
  });

  fixture.why = why;
  fixture.era = rules().era;
  fixture.repinnedAt = new Date().toISOString().slice(0, 10);
  await writeFile(join(FIXTURE_DIR, name), `${JSON.stringify(fixture, undefined, 1)}\n`);
  console.log(`${name}: ${moved} of ${fixture.steps.length} hashes moved, era ${fixture.era}`);
}

if (aborted) process.exit(1);
console.log(`\nRe-pinned: ${why}`);
console.log("Record it in dev-log.md: what changed in hashed state, why, and this reason string.");
