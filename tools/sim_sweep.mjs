// The N8 gate: the first real balance sweep.
//
// "200+ games per configuration, a report in reports/, era 1 pinned, and the
// three logged debts either fixed or explicitly accepted with numbers."
//
// The three debts, from `dev-log.md`:
//   1. runaway treasuries      — cities accumulating money with nothing to spend it on
//   2. runaway industrial demand
//   3. pollution averaged over the whole REGION rather than the developed part,
//      so it reads 0 on most maps and cannot drive anything
//
// Everything here obeys the measurement discipline in CLAUDE.md: never tune on
// five seeds, every number belongs to an era, and telemetry must record failure
// as well as success. The report names the commit's era and is written to
// reports/ so a later era's numbers can be compared against it — or, more
// honestly, so a later era's numbers can be seen to be incomparable.
//
//   node tools/sim_sweep.mjs [games] [years]

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = Number(process.argv[2] ?? 200);
const YEARS = Number(process.argv[3] ?? 25);

const CONFIGS = [
  { name: "relaxed-64", difficulty: "relaxed", size: 64, disasters: true },
  { name: "steady-64", difficulty: "steady", size: 64, disasters: true },
  { name: "demanding-64", difficulty: "demanding", size: 64, disasters: true },
  { name: "steady-64-nodisasters", difficulty: "steady", size: 64, disasters: false },
];

function quantile(values, q) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return Math.round(sorted[low] + (sorted[high] - sorted[low]) * (at - low));
}

/** Pollution over DEVELOPED land only — debt 3. The regional average is what
 * reads 0 on most maps: a 64x64 region is 4096 tiles and a city might occupy
 * 400 of them, so any real number is divided into invisibility. */
function pollutionOverDeveloped(state) {
  let total = 0;
  let tiles = 0;
  for (let i = 0; i < state.tiles.zone.length; i += 1) {
    if (state.tiles.zone[i] === 0 && state.tiles.buildingId[i] === 0) continue;
    total += state.tiles.pollution[i];
    tiles += 1;
  }
  return { average: tiles === 0 ? 0 : Math.round(total / tiles), tiles };
}

function play(config, seed) {
  const world = generateWorld(defaultOptions({
    seed,
    width: config.size,
    height: config.size,
    seats: 1,
    difficulty: config.difficulty,
    disasters: config.disasters,
    waterStyle: "river",
  }));
  if (!world.ok) return undefined;
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");

  let peakTreasury = 0;
  let peakPopulation = 0;
  const events = new Map();

  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    const outcome = apply(state, { type: CMD_TICK });
    for (const event of outcome.events ?? []) {
      events.set(event.kind, (events.get(event.kind) ?? 0) + 1);
    }
    if (tick % 6 === 0) deputyTurn(state, deputy);
    peakTreasury = Math.max(peakTreasury, state.players[0].treasury);
    peakPopulation = Math.max(peakPopulation, state.population);
  }

  const pollution = pollutionOverDeveloped(state);
  let roads = 0;
  for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) roads += 1;

  return {
    seed,
    population: state.population,
    peakPopulation,
    buildings: state.buildings.length,
    treasury: state.players[0].treasury,
    peakTreasury,
    demandR: state.demand.residential,
    demandC: state.demand.commercial,
    demandI: state.demand.industrial,
    pollutionDeveloped: pollution.average,
    pollutionRegional: state.civic.pollutionAverage,
    developedTiles: pollution.tiles,
    crime: state.civic.crimeAverage,
    landValue: state.civic.landValueAverage,
    roads,
    congested: state.traffic.congested,
    stranded: state.traffic.stranded,
    commuters: state.traffic.commuters,
    events: Object.fromEntries(events),
  };
}

const report = { era: rules().era, games: GAMES, years: YEARS, configs: {} };
const lines = [];
function say(text = "") {
  lines.push(text);
  console.log(text);
}

say(`# Balance sweep — era ${rules().era}`);
say();
say(`${GAMES} games per configuration, ${YEARS} years each.`);
say();
say("Numbers below belong to **era " + rules().era + "**. Numbers from a previous era are void,");
say("not roughly comparable (CLAUDE.md).");
say();

for (const config of CONFIGS) {
  const rows = [];
  for (let game = 0; game < GAMES; game += 1) {
    const row = play(config, 500000 + game);
    if (row) rows.push(row);
  }
  const live = rows.filter((r) => r.peakPopulation > 0);
  const pick = (key) => live.map((r) => r[key]);

  const summary = {
    games: rows.length,
    livingCities: live.length,
    population: [quantile(pick("population"), 0.25), quantile(pick("population"), 0.5), quantile(pick("population"), 0.75)],
    peakPopulation: quantile(pick("peakPopulation"), 0.5),
    treasury: [quantile(pick("treasury"), 0.25), quantile(pick("treasury"), 0.5), quantile(pick("treasury"), 0.75)],
    peakTreasury: [quantile(pick("peakTreasury"), 0.5), quantile(pick("peakTreasury"), 0.95)],
    demandI: [quantile(pick("demandI"), 0.5), quantile(pick("demandI"), 0.95)],
    demandR: quantile(pick("demandR"), 0.5),
    pollutionDeveloped: quantile(pick("pollutionDeveloped"), 0.5),
    pollutionRegional: quantile(pick("pollutionRegional"), 0.5),
    crime: quantile(pick("crime"), 0.5),
    congested: quantile(pick("congested"), 0.5),
    stranded: quantile(pick("stranded"), 0.5),
    emptied: rows.filter((r) => r.population === 0 && r.peakPopulation > 100).length,
  };
  report.configs[config.name] = { config, summary, rows };

  say(`## ${config.name}`);
  say();
  say(`| measure | p25 | median | p75 |`);
  say(`| --- | --- | --- | --- |`);
  say(`| population | ${summary.population[0]} | ${summary.population[1]} | ${summary.population[2]} |`);
  say(`| treasury | ${summary.treasury[0]} | ${summary.treasury[1]} | ${summary.treasury[2]} |`);
  say();
  say(`- living cities: ${summary.livingCities} of ${summary.games}`);
  say(`- cities that reached 100+ residents and ended empty: **${summary.emptied}**`);
  say(`- peak treasury median ${summary.peakTreasury[0]}, p95 **${summary.peakTreasury[1]}**`);
  say(`- industrial demand median ${summary.demandI[0]}, p95 **${summary.demandI[1]}**`);
  say(`- residential demand median ${summary.demandR}`);
  say(`- pollution over developed land ${summary.pollutionDeveloped}, over the whole region ${summary.pollutionRegional}`);
  say(`- crime ${summary.crime}, congested tiles ${summary.congested}, stranded homes ${summary.stranded}`);
  say();
}

// --- the three debts --------------------------------------------------------

const steady = report.configs["steady-64"].summary;
say("## The three logged debts");
say();

const debts = [];

// 1. Runaway treasuries.
const treasuryCap = 1000000;
say(`### 1. Runaway treasuries`);
say();
say(`Peak treasury p95 is **${steady.peakTreasury[1]}** on steady-64.`);
if (steady.peakTreasury[1] > treasuryCap) {
  say();
  say(`**Still open.** Above the ${treasuryCap} line where money stops being a constraint.`);
  debts.push("runaway treasuries");
} else {
  say();
  say(`**Settled.** Below ${treasuryCap}, so money is still a constraint at 25 years.`);
}
say();

// 2. Runaway industrial demand.
const demandCap = rules().demand.industrialCap;
say(`### 2. Runaway industrial demand`);
say();
say(`Industrial demand p95 is **${steady.demandI[1]}** against a cap of ${demandCap}.`);
if (steady.demandI[1] >= demandCap) {
  say();
  say(`**Still open.** Sitting at the cap means the cap is doing the work, not the model.`);
  debts.push("runaway industrial demand");
} else {
  say();
  say(`**Settled.** Below the cap, so the demand model is what is deciding.`);
}
say();

// 3. Pollution average.
say(`### 3. Pollution averaged over the region`);
say();
say(`Over developed land: **${steady.pollutionDeveloped}**. Over the whole region: ${steady.pollutionRegional}.`);
if (steady.pollutionRegional === 0 && steady.pollutionDeveloped > 0) {
  say();
  say(`**Confirmed and measured.** The regional average is 0 while developed land reads`);
  say(`${steady.pollutionDeveloped} — exactly the failure logged: a real number divided into`);
  say(`invisibility by thousands of empty tiles. \`civic.pollutionAverage\` cannot drive anything`);
  say(`until it is an average over developed land.`);
  debts.push("pollution averaged over the region");
} else {
  say();
  say(`**Settled.** The regional average carries signal.`);
}
say();

say("## Verdict");
say();
if (debts.length === 0) {
  say("All three debts settled by measurement.");
} else {
  say(`${debts.length} debt(s) still open after this sweep: ${debts.join(", ")}.`);
  say("Each is recorded above with the number that says so, which is the point of the sweep.");
}

await mkdir(join(root, "reports"), { recursive: true });
await writeFile(join(root, "reports", `balance-era${rules().era}.md`), lines.join("\n") + "\n");
await writeFile(join(root, "reports", `balance-era${rules().era}.json`), JSON.stringify(report, undefined, 1));
console.log(`\nwrote reports/balance-era${rules().era}.md and .json`);
