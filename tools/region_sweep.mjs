// The multi-seat balance sweep (X4g, era 31).
//
// `sim_sweep` plays **one seat**. The three options this era wires up do
// nothing at one seat by construction:
//
//   - `splitRule` divides a region's net between seats, and one seat is not a
//     division;
//   - `mutualAid` decides whether a station covers a NEIGHBOUR's street, and
//     one seat has no neighbour;
//   - `disasterAid` decides whether relief reaches the seats a disaster
//     reached or every seat in the region, and with one seat those are the
//     same sentence.
//
// So they cannot be measured by the sweep this project already has, and
// CLAUDE.md is explicit that multiplayer rows never mix into singleplayer
// baselines. This is their sweep: four seats, four deputies, one map, no
// sockets and no browser — the engine, like `sim_sweep`, because what is being
// measured is the rules and not the wire.
//
// **What it searches for**, printed with the numbers rather than left implied
// (`an-instrument-aimed-at-where-the-city-used-to-be`): the SPREAD between
// seats. Population and treasury totals answer "is the region alive"; the
// spread answers "is it fair", which is the only question these three rules
// are about. A rule that moves the total and not the spread has not done what
// it was turned on for.
//
//   node tools/region_sweep.mjs [games] [years]

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR, ZONE_RESIDENTIAL } from "../engine/constants.js";
import { definition } from "../engine/catalogue.js";
import { rules } from "../engine/rules.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/chronicle.js";
import "../engine/quests.js";
import "../engine/requests.js";
import { loadContent } from "./lib/content.mjs";

// Era 30's lesson, and fatal if it fails: a tool that fell back to the engine's
// mirrors would measure a city in which no quest can fire, while a browser has
// twenty-one of them (`a-mirror-with-no-loader`).
await loadContent();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = Number(process.argv[2] ?? 200);
const YEARS = Number(process.argv[3] ?? 25);
const SEATS = 4;

/**
 * The arms. The null arm first, and every other arm differs from it in exactly
 * ONE option — which is the discipline `one-deputy-turn-moves-the-sweep` and
 * `constraint-concentrates-the-agent` both arrived at: two rules changed
 * together measure their sum and nothing else.
 */
const ARMS = [
  { name: "null", what: "the defaults: shared treasury, aid on, disaster aid off", options: {},
    subject: "residentsHoused" },
  {
    name: "split-equal",
    what: "a split treasury on the rule it always used, which is the baseline the next arm moves",
    options: { treasury: "split", splitRule: "equal" },
    subject: "residentsHoused",
  },
  {
    name: "split-population",
    what: "a split treasury divided by the residents each seat houses",
    options: { treasury: "split", splitRule: "population" },
    subject: "residentsHoused",
  },
  {
    name: "no-mutual-aid",
    what: "a station covers its own seat's ground and the commons, and stops at a neighbour",
    options: { mutualAid: false },
    subject: "stations",
  },
  {
    name: "disaster-aid",
    what: "the solvent seats pay for a seat's emergency relief; with it off, the faucet does",
    options: { disasterAid: true },
    // **Not `reliefPaid`.** The relief itself is identical in both arms — the
    // seat below the floor is topped up either way, because §12's
    // recoverability is not a fairness option's to take away — and what the
    // option changes is who the money came FROM. A subject that cannot differ
    // between the arms would make this one look inert for ever, which is the
    // same mistake as measuring a rule on a city it cannot reach.
    subject: "levyCount",
    needs: 1,
  },
];

/**
 * Two configurations, and the second one is the point.
 *
 * `steady` is the default experience and where the region's fairness is worth
 * knowing. It is also a city where **emergency relief never fires**: era 30's
 * own report counted `disasterRelief` **0 times in 200 relaxed games and 0 in
 * 200 steady**, against 23 in 200 demanding — the floor is 3,000 and a steady
 * region ends 25 years with millions. So a `disasterAid` arm measured on steady
 * alone is byte-identical to the null, which is exactly what the first run of
 * this sweep reported, and it says nothing about the rule
 * (`an-instrument-aimed-at-where-the-city-used-to-be`). The rule needs a seat
 * below the floor AND a neighbour above it, and only a demanding region has
 * either.
 *
 * `demanding` is where all three rules bite: a disaster one month in 59, a
 * starting treasury of 12,000, and 120% build costs.
 */
const CONFIGS = [
  { name: "steady-64", difficulty: "steady", size: 64, disasters: true },
  { name: "demanding-64", difficulty: "demanding", size: 64, disasters: true },
];

function quantile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (at - low));
}

/** The spread, as a percentage of the mean: 0 is four equal seats and 100 is a
 * region where the gap between the best and the worst seat is the size of an
 * average seat. Relative rather than absolute, because an absolute gap grows
 * with the city and would say every era is less fair than the last (A119). */
function spread(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const mean = total / values.length;
  return Math.round(((Math.max(...values) - Math.min(...values)) / mean) * 100);
}

function residentsBySeat(state) {
  const out = new Array(SEATS).fill(0);
  for (const lot of state.buildings) {
    if (lot.zone !== ZONE_RESIDENTIAL) continue;
    if (lot.owner >= 1 && lot.owner <= SEATS) out[lot.owner - 1] += lot.occupancy;
  }
  return out;
}

function play(config, arm, seed) {
  const world = generateWorld(defaultOptions({
    seed,
    width: config.size,
    height: config.size,
    seats: SEATS,
    difficulty: config.difficulty,
    disasters: config.disasters,
    waterStyle: "river",
    ...arm.options,
  }));
  if (!world.ok) return undefined;
  const state = world.state;
  const deputies = [];
  for (let seat = 1; seat <= SEATS; seat += 1) {
    apply(state, { type: CMD_JOIN, actor: seat, seat, name: `Mayor ${seat}` });
    deputies.push(makeDeputy(seat, "expand"));
  }

  // **The subject each arm acts on, counted beside the outcome** — `fire_arms`'
  // rule (A83). A flat population row can mean the rule does nothing OR that
  // the arm never fired, and only the subject count tells those apart.
  let reliefPaid = 0;
  let disastersStruck = 0;
  let levyCount = 0;
  let levied = 0;
  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    const outcome = apply(state, { type: CMD_TICK });
    for (const event of outcome.events ?? []) {
      if (event.kind === "disasterRelief") reliefPaid += 1;
      if (event.kind === "disasterStruck") disastersStruck += 1;
      // What `disasterAid` actually moves: money OUT of a solvent seat.
      if (event.kind === "disasterLevy") { levyCount += 1; levied += event.amount; }
    }
    // Every seat plays on the same beat and in seat order, so the arms differ
    // by their option and not by who moved first.
    if (tick % 6 === 0) for (const deputy of deputies) deputyTurn(state, deputy);
  }

  const treasuries = state.players.map((p) => p.treasury);
  const residents = residentsBySeat(state);
  let owned = new Array(SEATS).fill(0);
  for (let i = 0; i < state.tiles.owner.length; i += 1) {
    const owner = state.tiles.owner[i];
    if (owner >= 1 && owner <= SEATS) owned[owner - 1] += 1;
  }

  // A station is what `mutualAid` is about: a region whose deputies built none
  // cannot show the rule either way.
  let stations = 0;
  for (const b of state.buildings) {
    if (b.zone !== 0) continue;
    const def = definition(b.def);
    if (def && (def.coverage || def.service)) stations += 1;
  }

  return {
    seed,
    population: state.population,
    buildings: state.buildings.length,
    residentsHoused: residents.reduce((a, b) => a + b, 0),
    stations,
    reliefPaid,
    disastersStruck,
    levyCount,
    levied,
    treasuryTotal: treasuries.reduce((a, b) => a + b, 0),
    treasurySpread: spread(treasuries),
    residentsSpread: spread(residents),
    landSpread: spread(owned),
    poorestSeat: Math.min(...treasuries),
    emptySeats: residents.filter((r) => r === 0).length,
    crime: state.civic.crimeAverage,
    landValue: state.civic.landValueAverage,
    powerStarved: state.supply.power.starved,
  };
}

const report = { era: rules().era, games: GAMES, years: YEARS, seats: SEATS, configs: {} };
const lines = [];
function say(text = "") {
  lines.push(text);
  console.log(text);
}

say(`# Region sweep — era ${rules().era}`);
say();
say(`${GAMES} games per arm per configuration, ${YEARS} years each, **${SEATS} seats** and one`);
say("deputy per seat on one map. Numbers below belong to **era " + rules().era + "**; numbers from");
say("a previous era are void, not roughly comparable (CLAUDE.md).");
say();
say("**What this sweep searches for:** the spread between seats, as a percentage of the mean —");
say("treasury, residents and land. The totals say whether the region is alive; only the spread");
say("says whether it is fair, and fairness is the whole of what these three options change.");
say();
for (const arm of ARMS) say(`- \`${arm.name}\` — ${arm.what}`);
say();

for (const config of CONFIGS) {
  say(`## ${config.name}`);
  say();
  say("| arm | alive | population | treasury total | treasury spread | residents spread | land spread | seats with nobody | relief paid | levied |");
  say("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const arm of ARMS) {
    const rows = [];
    for (let game = 0; game < GAMES; game += 1) {
      const row = play(config, arm, 700000 + game);
      if (row) rows.push(row);
    }
    const live = rows.filter((r) => r.population > 0);
    const pick = (key) => live.map((r) => r[key]);
    const summary = {
      games: rows.length,
      livingCities: live.length,
      population: quantile(pick("population"), 0.5),
      treasuryTotal: quantile(pick("treasuryTotal"), 0.5),
      treasurySpread: quantile(pick("treasurySpread"), 0.5),
      residentsSpread: quantile(pick("residentsSpread"), 0.5),
      landSpread: quantile(pick("landSpread"), 0.5),
      poorestSeat: quantile(pick("poorestSeat"), 0.5),
      residentsHoused: quantile(pick("residentsHoused"), 0.5),
      stations: quantile(pick("stations"), 0.5),
      // Totals, not medians: these are what says the rule was REACHED, and a
      // median of 0 over 200 games hides 23 payments in the tail.
      reliefPaid: live.reduce((sum, r) => sum + r.reliefPaid, 0),
      disastersStruck: live.reduce((sum, r) => sum + r.disastersStruck, 0),
      levyCount: live.reduce((sum, r) => sum + r.levyCount, 0),
      levied: live.reduce((sum, r) => sum + r.levied, 0),
      emptySeats: quantile(pick("emptySeats"), 0.5),
      crime: quantile(pick("crime"), 0.5),
      landValue: quantile(pick("landValue"), 0.5),
      powerStarved: quantile(pick("powerStarved"), 0.5),
    };
    report.configs[`${config.name}/${arm.name}`] = { config, arm, summary, rows };
    say(`| \`${arm.name}\` | ${summary.livingCities} of ${summary.games} | ${summary.population} `
      + `| ${summary.treasuryTotal} | ${summary.treasurySpread}% | ${summary.residentsSpread}% `
      + `| ${summary.landSpread}% | ${summary.emptySeats} | ${summary.reliefPaid} `
      + `| ${summary.levied} |`);
  }
  say();
}

say("## What moved");
say();
const base = report.configs["steady-64/null"].summary;
for (const arm of ARMS.slice(1)) {
  const got = report.configs[`steady-64/${arm.name}`].summary;
  const delta = (key, unit = "") => {
    const was = base[key];
    const now = got[key];
    const sign = now === was ? "=" : now > was ? "+" : "";
    return `${key} ${was}${unit} → ${now}${unit} (${sign}${now - was}${unit})`;
  };
  say(`- **\`${arm.name}\`**: ${delta("population")}, ${delta("treasuryTotal")}, `
    + `${delta("treasurySpread", "%")}, ${delta("residentsSpread", "%")}`);
}
say();

// **An arm that changes nothing is an option nobody reads.** The null-arm
// discipline from `one-deputy-turn-moves-the-sweep`, pointed the other way:
// this sweep exists because three options were declared and unread, and the
// cheapest way to go back to that state is for a rule to be wired to something
// no city ever reaches. Measured on the arm's OWN configuration, and `=` on
// every column is the failure.
const MEASURES = ["population", "treasuryTotal", "treasurySpread", "residentsSpread", "landSpread",
  "poorestSeat", "crime", "landValue", "reliefPaid", "levied"];
const inert = [];
const unreached = [];
say("## Does every arm reach a city");
say();
say("| arm | moved | its subject | how much of it this sample had |");
say("| --- | --- | --- | --- |");
for (const arm of ARMS.slice(1)) {
  const moved = [];
  let subject = 0;
  for (const config of CONFIGS) {
    const got = report.configs[`${config.name}/${arm.name}`].summary;
    const was = report.configs[`${config.name}/null`].summary;
    subject += Math.max(got[arm.subject], was[arm.subject]);
    for (const key of MEASURES) if (got[key] !== was[key]) moved.push(`${config.name}/${key}`);
  }
  say(`| \`${arm.name}\` | ${moved.length === 0 ? "**nothing**" : `${moved.length} measure(s)`} `
    + `| \`${arm.subject}\` | ${subject} of the ${arm.needs ?? 1} it takes to tell |`);
  // **A sample too small to reach the rule is not a broken rule.** The two
  // failures look identical in a flat table and are opposite problems, so the
  // subject count is what tells them apart — `a-failure-counter-is-not-a-
  // subject-counter`, which is the lesson that three crossing counters read 0
  // because no gate city had a crossing.
  if (moved.length > 0) continue;
  const needs = arm.needs ?? 1;
  if (subject < needs) {
    unreached.push(`${arm.name} (${subject} ${arm.subject}, and it takes ${needs} to tell)`);
  } else {
    inert.push(`${arm.name} (${subject} ${arm.subject} and nothing moved)`);
  }
}
say();
if (inert.length === 0 && unreached.length === 0) {
  say(`All ${ARMS.length - 1} arms moved at least one measure on at least one configuration.`);
}
if (unreached.length > 0) {
  say(`**${unreached.length} arm(s) never reached the thing they are about: ${unreached.join(", ")}.**`);
  say("That is a statement about this sample's size, not about the rule — the era report runs 200");
  say("games per arm and `demanding-64` is the configuration where relief fires at all (era 30");
  say("counted it 23 times in 200 demanding games and 0 in 200 steady).");
}
if (inert.length > 0) {
  say(`**${inert.length} arm(s) had their subject and changed nothing: ${inert.join(", ")}.** An`);
  say("option wired to a rule no city reaches is an unread option with extra steps — which is what");
  say("this era was for.");
}
say();

// **A sample is not an era report.** The gate runs this tool with a small
// `games` so it can afford to, and a 40-game table written over
// `reports/region-era31.md` would replace the era's authority with a tripwire's
// output — `a-report-written-in-two-places`, from the direction where the two
// places are the same place at two sizes.
await mkdir(join(root, "reports"), { recursive: true });
if (GAMES >= 200) {
  await writeFile(join(root, "reports", `region-era${rules().era}.md`), lines.join("\n") + "\n");
  await writeFile(join(root, "reports", `region-era${rules().era}.json`), JSON.stringify(report, undefined, 1));
  console.log(`\nwrote reports/region-era${rules().era}.md and .json`);
} else {
  console.log(`\n${GAMES} games is a SAMPLE, not an era report (200+ per CLAUDE.md): nothing written.`);
}

if (inert.length > 0) {
  console.error(`\nregion sweep FAILED: ${inert.length} inert arm(s): ${inert.join(", ")}`);
  process.exit(1);
}
console.log("region sweep ok");
