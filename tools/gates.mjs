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
  worker_smoke: { args: ["tools/worker_smoke.mjs"], what: "the same city played on the worker and on this thread, hash for hash (W2)" },
  mvp_acceptance: { args: ["tools/mvp_acceptance.mjs"], what: "all thirteen §24 criteria, desktop and phone" },
  budget_gate: { args: ["tools/budget_gate.mjs"], what: "3 tiers × 2 projections × 4 spans, plus every added row" },

  // The picture tools that check themselves (P75). Each counts what it
  // photographed — smoke over the fire, walls on the burnt plot, streaks, an
  // engine out — and exits non-zero when the count is wrong, which is what
  // makes them gates rather than screenshots.
  water_shots: { args: ["tools/water_shots.mjs"], what: "the river's trough and its bank, measured before they are called a river" },
  disaster_shot: { args: ["tools/disaster_shot.mjs"], what: "a building alight and the ground it leaves, at both zooms" },
  service_shots: { args: ["tools/service_shots.mjs"], what: "an engine answering a fire, a patrol on its beat, vans off the industry" },
  window_shots: { args: ["tools/window_shots.mjs"], what: "what is behind a window, day and night, from the pavement" },
  rain_shots: { args: ["tools/rain_shots.mjs"], what: "the overcast hour, from the street and from the air" },
  avenue_shots: { args: ["tools/avenue_shots.mjs"], what: "the deputy's own avenue: its width, its median and its two lanes each way" },
  rail_shots: { args: ["tools/rail_shots.mjs"], what: "the track, a level crossing and a train that is actually posed on the line" },
  harbour_shots: { args: ["tools/harbour_shots.mjs"], what: "boats at a marina, a ferry with a wake, and a port with its ship" },
  bridge_shots: { args: ["tools/bridge_shots.mjs"], what: "a crossing from the bank, from the deck and side on, with the deck, the water and the bed measured beside each" },
  embankment_shots: { args: ["tools/embankment_shots.mjs"], what: "a street's faced shoulder from the water, before and after, with the baked chunk count that is the point (S18, A128)" },
  airport_shots: { args: ["tools/airport_shots.mjs"], what: "a runway with its markings, an apron lit at night, and an aircraft on the ground" },
  civic_shots: { args: ["tools/civic_shots.mjs"], what: "one street-level picture per catalogue definition, counting that the reducer accepted each one" },
  foliage_shots: { args: ["tools/foliage_shots.mjs"], what: "trees, gardens and a park, counted before they are called a picture" },
  motion_shots: { args: ["tools/motion_shots.mjs"], what: "the things that move at rest and in motion — rotor, flag, crane, smoke" },
  role_shots: { args: ["tools/role_shots.mjs"], what: "a building per role, told apart" },
  street_shots: { args: ["tools/street_shots.mjs"], what: "a street at eye height, with what S3 put on it counted" },
  film: { args: ["tools/film.mjs"], what: "the sixty-second shot list, a frame a second, each one counted for triangles and for life" },

  walkthrough: { args: ["tools/walkthrough.mjs"], what: "the walker walks every corridor, and the steepest street" },
  // The same walk on the terrain S11 and J3 are about. It could not be RUN at
  // all until S11 taught the fixture that a network refuses rock, and J3 took it
  // from 25 cliffs and 218 of 612 ungradeable corridors to 0 and 20 of 177.
  //
  // Out of every set between era 23 and A119, and the reason was a lesson rather
  // than a defect: its criteria were absolute (no cliff, nothing walked into) and
  // the hilly city changes with every balance era. It was green at era 22 and red
  // at era 23 with no change to the rule, because the economy moved what the
  // deputy builds and `maxRoadSlope` had been chosen at the rung that made THIS
  // gate pass on THAT city.
  //
  // **Back in at A119**, and not by loosening a number: the counts are
  // ATTRIBUTED. A cliff on a corridor no grading can flatten is terrain and is
  // counted under its own name, exactly as a steep refusal already was; a lot
  // the walker stands on top of is a building buried in a hillside (Q144), not a
  // wall it walked through. What is left over is a defect wherever it happens,
  // which is a criterion a moving city cannot drift through.
  walkthrough_hilly: { args: ["tools/walkthrough.mjs", "128", "hilly"], what: "the same walk on a hilly 128, where the terrain is attributed rather than counted (A119)" },
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
    "worker_smoke", "mvp_acceptance",
  ],
  // `budget_gate` moved here from `quick` in K1 (Q79 → A64). It is a renderer
  // MEASUREMENT — three tiers, two projections, four spans, and since D8 a
  // second viewport at a real desktop's pixel count — and it belongs with the
  // other renderer measurements rather than in the set every slice runs. It
  // was 102 s when M2 set the budgets and 151 s after D8; leaving it in `quick`
  // put that set at 477 s of 480, where the next slice to add a check trips it.
  // `budget_gate` moved OUT again in B3a, which is M2's own rule doing what it
  // was written for: the `render` set reached **298 s of its 300 s budget**
  // (budget_gate 235, lanes_dump 60), so the next slice would have had to
  // raise the budget to fit — which the rule forbids. It is a set of its own
  // now, and `render` is restated from what is left in it.
  // **Split at S18**, for the fourth time M2's rule has fired. The reviewer read
  // `render` at 248 s of 240 with `lanes_dump` at 239 of it; this machine reads
  // 220 with `lanes_dump` at 211. Both are the same finding: one gate is 95% of
  // the set, it grows with every era's city, and raising the budget to fit is
  // what the rule forbids. What is left is nine seconds — a set any slice can
  // afford to run, which is what `render` was for.
  render: ["walkthrough", "walkthrough_hilly", "passability"],
  lanes: ["lanes_dump"],
  budget: ["budget_gate"],
  // The picture tools that CHECK themselves (P75's omissions round): each one
  // counts what it photographed and exits non-zero when the count is wrong, and
  // until now nothing ran them. They are slow and they are pictures, so they
  // are a set of their own rather than part of `render`.
  //
  // **Split at T4b**, for the third time M2's rule has fired: seven tools came
  // to 397 s of a 360 s budget, and raising the budget to fit is what the rule
  // forbids. The line is the lane — `shots` is the world and behaviour lanes'
  // pictures, `transport` is T1–T4's — so a slice runs the set its own lane
  // owns and the two halves stay honest about what they cost.
  shots: ["water_shots", "bridge_shots", "embankment_shots", "disaster_shot", "service_shots",
    "window_shots", "rain_shots"],
  transport: ["avenue_shots", "rail_shots", "harbour_shots", "airport_shots"],
  // Its own set (M2's rule: split rather than raise). One picture per catalogue
  // definition is twenty-eight shots and seven minutes, which no other set can
  // absorb — and it is a gate rather than a tool since T7 taught it to exit
  // non-zero when the reducer refused what it was photographing.
  kits: ["civic_shots", "foliage_shots", "motion_shots", "role_shots", "street_shots"],
  sim: ["disaster_soak", "traffic_gate", "sim_sweep"],
  // The storyboard (F2). A set of its own for the same reason `kits` is one: it
  // is 61 frames of a played 96-tile city on SwiftShader and nothing else can
  // absorb five minutes. It is also the only gate that renders the game as a
  // film — every other picture tool shoots one frame and this one shoots a
  // minute, which is how a shot that is right on its own and wrong after the
  // one before it is seen at all.
  film: ["film"],
  // The room (X0, empty until X1 fills it). Declared now because a set that
  // appears with its first gate is a set whose budget was chosen to fit that
  // gate — and because `gates.mjs --list` is where somebody looks to find out
  // what this project can check.
  room: [],
};
SETS.all = [...SETS.quick, ...SETS.render, ...SETS.lanes, ...SETS.budget, ...SETS.sim, ...SETS.shots,
  ...SETS.transport, ...SETS.kits, ...SETS.film, ...SETS.room];

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
  // **Restated at S13 from a measured run: 490 s.** Not a gate that grew — the
  // FIXTURE under one did, which is the same restatement `render` took at H7.
  // `ui_smoke` carries the perf card, the card measures `saturatedCity`, and
  // that recipe has been a played city since H7: eras 17 to 24 gave it parks,
  // police stations, a bigger population and (here) a bridge, and the card's
  // nine steps are nine views of whatever it has become. Measured today:
  // ui_smoke 197 s against about 110 at P96, play_smoke 91, reach_smoke 62.
  // 540 s, and `worker_smoke` (7 s, W2) fits inside it: the set was measured at
  // 494 s with the seam in place, which is 46 s of headroom and the reason this
  // gate went here rather than into a set of its own.
  quick: 9 * 60 * 1000,
  // Measured after the split (B3a): walkthrough 2, passability 0, lanes_dump 60.
  // Restated at H7, when the FIXTURE changed: `saturatedCity` plays the deputy
  // now, so the lane graph is 7,694 links against 2,436 and the walk is 405 real
  // buildings against 1,129 copies of one. Measured: lanes_dump 150 s,
  // walkthrough 4, passability 1. That is the set's contents changing under it
  // rather than a gate that grew (M2's rule), and the fixture was chosen at ONE
  // mayor and twenty years for exactly this reason — at four mayors lanes_dump
  // had not finished in thirteen minutes.
  render: 2 * 60 * 1000,
  // `lanes_dump` alone: 211 s here, 239 s on the reviewer's machine, and it
  // derives a model per size and terrain — so it tracks the city, not the code.
  lanes: 6 * 60 * 1000,
  // `budget_gate` alone, 235 s at B3a with three tiers, two projections, four
  // spans and the desktop viewport D8 added.
  budget: 6 * 60 * 1000,
  // Measured at P75, all five in one run: water 23 s, damage 29, services 50,
  // windows 36, rain 28 — 166 s. The first guess was 20 minutes, from timings
  // taken while probing interactively rather than from the tools themselves.
  // Restated at T4b's split from what is left in it: 210 s measured.
  // `embankment_shots` joined at S18 (six photo frames of a played hilly 128,
  // about 90 s): restated from the contents rather than raised to fit.
  shots: 7 * 60 * 1000,
  // The transport lane's pictures, measured at T4b in one run: avenue 38 s,
  // rail 76, harbour 73 — 187 s.
  transport: 5 * 60 * 1000,
  kits: 16 * 60 * 1000,
  sim: 15 * 60 * 1000,
  // The storyboard, measured at F2: 61 frames in 291 s at 960×540, of which the
  // two walk shots are half — a street frame on SwiftShader is a quarter of a
  // second and the film settles the street cache at every one of them.
  film: 8 * 60 * 1000,
  // X1's `room_soak` is two `ws` clients driving deputies for five city years
  // and `room_smoke` is two browser contexts on one page; the budget is written
  // before them so the first measurement is read against something.
  room: 10 * 60 * 1000,
  // Measured at T4b: quick 411 s, render 62, budget 274, sim 628, shots 210,
  // transport 187 — which is where 35 minutes came from, and `kits` (365 s) was
  // added to `all` in P94 without it. Restated from the contents at P96, the
  // first full run since: **2,467 s** — quick 396, render 113, budget 277,
  // sim 768, shots 385, transport 181, kits 347. That is a restatement, not a
  // raise to fit a gate that grew (M2's rule): the set gained a member and the
  // number it was measured from no longer described it.
  // Restated again at F2, which added `film` (291 s) to the contents: a set
  // gained a member, so the number is restated from what is in it rather than
  // raised to fit a gate that grew (M2's rule).
  all: 50 * 60 * 1000,
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
    // ALL of it, kept, and written to a file per gate. The tail alone lost a
    // `budget_gate` failure after S2: twelve lines printed, piped through a
    // `tail` by the caller, and which check had failed was gone for good.
    let output = "";
    const keep = (chunk) => { output += chunk; };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      resolve({ name, ok: code === 0, ms: Date.now() - started, tail: output.slice(-4000), output });
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

  const logs = join(root, "reports", "gates");
  await mkdir(logs, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const name of names) {
    process.stdout.write(`  ${name.padEnd(16)} `);
    const result = await runGate(name);
    results.push(result);
    console.log(`${result.ok ? "ok  " : "FAIL"} ${(result.ms / 1000).toFixed(1)}s`);
    const log = join(logs, `${day}-${name}.log`);
    await writeFile(log, result.output);
    if (!result.ok) {
      // Every FAIL line first — the checks that failed, by name — then where
      // the whole run is.
      const fails = result.output.split("\n").filter((l) => /^\s*FAIL\b/.test(l));
      for (const line of fails.slice(0, 12)) console.log(`      ${line.trim()}`);
      console.log(`      full output: ${log.slice(root.length + 1)}`);
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
