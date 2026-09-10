// The gate runner (slice M2).
//
//   node tools/gates.mjs [quick|render|sim|all] [--list]
//
// One command runs the gates a slice needs, and the full set has a known cost.
// Before this, "run the gates" was a thing somebody had to remember, and the
// README's list had not named `walkthrough`, `passability`, `lanes_dump` or the
// budget gate's flags for the whole of the cityviewer lane.
//
// **A budget per set, not just a list.** A gate that grows past its share is a
// finding rather than a fact of life: `walkthrough` walks 161 km and
// `passability` samples 32,659 points, and both of those numbers were chosen
// once and never revisited. The budgets below are from the first measured run
// on SwiftShader (era `476c69c`, 2026-09-08) — every number in this project is
// SwiftShader until somebody runs it on a phone, which is the measurement
// lane's first item.
//
// **Every gate closes its browser.** Three headless-chromium trees from
// 2026-09-06 were still alive during the V8 review, so some gate's failure path
// leaks one. The runner counts what is left behind after a set and says so;
// finding which gate it is needs the count to exist first.

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const run = promisify(execFile);

/** How each gate is run. `args` is argv after `node`. */
export const GATES = {
  a11y_smoke: { args: ["tools/a11y_smoke.mjs"], what: "keyboard, contrast, reduced motion, the overlays at night" },
  client_smoke: { args: ["tools/client_smoke.mjs"], what: "the renderer, all three styles" },
  lobby_smoke: { args: ["tools/lobby_smoke.mjs"], what: "the start screen, three cities in one page" },
  offline_smoke: { args: ["tools/offline_smoke.mjs"], what: "the game runs with the network off" },
  play_smoke: { args: ["tools/play_smoke.mjs"], what: "input on a mouse viewport and a phone one" },
  reach_smoke: { args: ["tools/reach_smoke.mjs"], what: "every control clickable, nothing eating the map" },
  save_smoke: { args: ["tools/save_smoke.mjs"], what: "a city survives a closed tab, hash for hash" },
  serve_smoke: { args: ["tools/serve_smoke.mjs"], what: "the REAL server, so a CSP that blocks the importmap goes red" },
  ui_smoke: { args: ["tools/ui_smoke.mjs"], what: "every button hit-tested, every overlay rendered" },
  update_smoke: { args: ["tools/update_smoke.mjs"], what: "a new build reaches a returning player" },
  mvp_acceptance: { args: ["tools/mvp_acceptance.mjs"], what: "all thirteen §24 criteria, desktop and phone" },
  budget_gate: { args: ["tools/budget_gate.mjs"], what: "3 tiers × 2 projections × 4 spans, plus every added row" },

  walkthrough: { args: ["tools/walkthrough.mjs"], what: "the walker walks every corridor, and the steepest street" },
  passability: { args: ["tools/passability.mjs"], what: "a lane wide enough for a walker, everywhere" },
  lanes_dump: { args: ["tools/lanes_dump.mjs"], what: "the lane graph, its height error and its step time" },

  disaster_soak: { args: ["tools/disaster_soak.mjs", "200", "25"], what: "every disaster fires, no unrepairable cities" },
  traffic_gate: { args: ["tools/traffic_gate.mjs", "200", "25"], what: "routing fits the month tick" },
  sim_sweep: { args: ["tools/sim_sweep.mjs", "200", "25"], what: "200 games × 4 configs → reports/balance-eraN.md" },
};

/** What a slice runs. `quick` after any change, `render` for a renderer slice,
 * `sim` for a gameplay one — the slice-workflow skill's step 5 names these. */
export const SETS = {
  quick: [
    "a11y_smoke", "client_smoke", "lobby_smoke", "offline_smoke", "play_smoke",
    "reach_smoke", "save_smoke", "serve_smoke", "ui_smoke", "update_smoke",
    "mvp_acceptance",
  ],
  // `budget_gate` moved here from `quick` in K1 (Q79 → A64). It is a renderer
  // MEASUREMENT — three tiers, two projections, four spans, and since D8 a
  // second viewport at a real desktop's pixel count — and it belongs with the
  // other renderer measurements rather than in the set every slice runs. It
  // was 102 s when M2 set the budgets and 151 s after D8; leaving it in `quick`
  // put that set at 477 s of 480, where the next slice to add a check trips it.
  render: ["walkthrough", "passability", "lanes_dump", "budget_gate"],
  sim: ["disaster_soak", "traffic_gate", "sim_sweep"],
};
SETS.all = [...SETS.quick, ...SETS.render, ...SETS.sim];

/**
 * The first measured run, era `476c69c` on SwiftShader, 2026-09-08.
 *
 *   quick   375 s — budget_gate 102, ui_smoke 66, a11y_smoke 45, reach 43, play 40
 *   render    3 s — walkthrough 2.3, lanes_dump 0.5, passability 0.2
 *   sim     595 s — sim_sweep 439, traffic_gate 80, disaster_soak 76
 *
 * The budgets are the measurement plus room, not a wish. M2's own item guessed
 * "quick ≤ 5 min" and the measurement says 6.25, which is the point of
 * measuring. A set that grows past its budget prints a warning; the gate that
 * grew is a finding, not a fact of life.
 *
 * **Re-measured 2026-09-10 (K1, Q79 → A64), and the sets were rearranged rather
 * than the numbers raised.** `quick` had reached 477 s of 480 — the measurement
 * lane bought real coverage with time (D1's perf card put 26 s into `ui_smoke`,
 * D8's desktop viewport 49 s into `budget_gate`) and K1 added seven more checks.
 * Raising the budget to fit is what M2's rule forbids, so `budget_gate` moved to
 * `render` where it belongs: it is a renderer measurement, not a smoke test, and
 * `render` was 17 s of a 120 s budget with nothing else to spend it on.
 *
 *   quick   326 s — ui_smoke 112, play_smoke 45, a11y_smoke 45, reach 42
 *   render  166 s — budget_gate 151, lanes_dump 13, walkthrough 2
 *
 * `render`'s budget is restated from its new contents rather than kept at a
 * number set when the set took three seconds.
 */
export const BUDGET_MS = {
  quick: 8 * 60 * 1000,
  render: 5 * 60 * 1000,
  sim: 15 * 60 * 1000,
  all: 25 * 60 * 1000,
};

export function gatesIn(set) {
  const names = SETS[set];
  if (!names) throw new Error(`unknown gate set "${set}" — one of ${Object.keys(SETS).join(", ")}`);
  return names;
}

/** How many headless-chromium processes are alive right now.
 *
 * Not a hard failure: the count is the finding. Something's failure path leaks
 * one and nobody knows which, and a number after every run is how that gets
 * narrowed down.
 */
async function browsersAlive() {
  try {
    const { stdout } = await run("pgrep", ["-fc", "chrome-headless-shell|headless_shell"]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;   // pgrep exits 1 when nothing matches
  }
}

function runGate(name) {
  const gate = GATES[name];
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, gate.args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (chunk) => { tail = (tail + chunk).slice(-4000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      resolve({ name, ok: code === 0, ms: Date.now() - started, tail });
    });
  });
}

/** Everything below runs only when this file IS the command.
 *
 * `test/gates.test.js` imports the tables above to check that every gate is in
 * a set; without this guard that import runs every gate, which is a unit test
 * that takes an hour and hangs the suite. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const set = process.argv[2] ?? "quick";

  if (process.argv.includes("--list")) {
    for (const [name, gate] of Object.entries(GATES)) {
      const sets = Object.entries(SETS).filter(([k, v]) => k !== "all" && v.includes(name)).map(([k]) => k);
      console.log(`${name.padEnd(16)} ${sets.join(",").padEnd(14)} ${gate.what}`);
    }
    process.exit(0);
  }

  const names = gatesIn(set);
  const before = await browsersAlive();
  console.log(`gates: ${set} — ${names.length} of them, budget ${(BUDGET_MS[set] / 60000).toFixed(0)} min\n`);

  const results = [];
  for (const name of names) {
    process.stdout.write(`  ${name.padEnd(16)} `);
    const result = await runGate(name);
    results.push(result);
    console.log(`${result.ok ? "ok  " : "FAIL"} ${(result.ms / 1000).toFixed(1)}s`);
    if (!result.ok) {
      // The tail of the gate's own output, because "FAIL" alone sends the reader
      // back to run it again by hand — which is what the runner is for.
      console.log(result.tail.split("\n").slice(-12).map((l) => `      ${l}`).join("\n"));
    }
  }

  const total = results.reduce((a, r) => a + r.ms, 0);
  const failed = results.filter((r) => !r.ok);
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3);

  console.log(`\ntotal ${(total / 1000).toFixed(0)}s of a ${(BUDGET_MS[set] / 1000).toFixed(0)}s budget`);
  console.log(`slowest: ${slowest.map((r) => `${r.name} ${(r.ms / 1000).toFixed(0)}s`).join(", ")}`);
  if (total > BUDGET_MS[set]) {
    console.log(`OVER BUDGET by ${((total - BUDGET_MS[set]) / 1000).toFixed(0)}s — `
      + `the gate that grew is a finding, not a fact of life`);
  }

  const after = await browsersAlive();
  if (after > before) {
    console.log(`LEAKED ${after - before} headless browser(s) — some gate does not close its own on a failure path`);
  }

  await mkdir(join(root, "reports"), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  await writeFile(join(root, "reports", `gates-${stamp}.json`), `${JSON.stringify({
    set, total, budget: BUDGET_MS[set], leaked: Math.max(0, after - before),
    gates: results.map(({ name, ok, ms }) => ({ name, ok, ms })),
  }, null, 2)}\n`);

  if (failed.length > 0) {
    console.log(`\n${failed.length} gate(s) FAILED: ${failed.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n${set} gates ok`);
}
