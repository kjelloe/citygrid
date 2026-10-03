// Q105, measured: is a demanding city smaller because of FIRE, or because of
// the coupling A82 removed? And Q121, agreed at P93: WHY is a city that burns
// bigger — which of the two candidates is it, fresh ground to grow into or the
// vacancy term? The census is the same two arms with `developed` and
// `abandoned` counted per city, which is one more field and the only way to
// tell a city that grows MORE from a city that merely loses less.
//
// B1a (A62) made a fire nobody fights spread four times as readily while
// consuming its own house more slowly, so it outlives what it is standing on.
// Era 4's sweep then moved demanding 1,203 → 1,039 — 14% — while the other
// three rows were flat or better, and the question has sat open since, because
// until A82 the deputy drew from the same PRNG as the fire and "era 4 against
// era 3" compared two different worlds rather than two rules.
//
// It does not any more. This runs the SAME build twice, changing nothing but
// B1a's two constants, on the sweep's own recipe — so the only difference
// between the arms is the rule.
//
//   node tools/fire_arms.mjs [games] [years]

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

const GAMES = Number(process.argv[2] ?? 200);
const YEARS = Number(process.argv[3] ?? 25);

const CONFIGS = [
  { name: "demanding-64", difficulty: "demanding", size: 64, disasters: true },
  { name: "steady-64", difficulty: "steady", size: 64, disasters: true },
];

/** The sweep's own recipe, so these numbers sit beside `reports/balance-era*`. */
function play(config, seed) {
  const world = generateWorld(defaultOptions({
    seed, width: config.size, height: config.size, seats: 1,
    difficulty: config.difficulty, disasters: config.disasters, waterStyle: "river",
  }));
  if (!world.ok) return undefined;
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  let burned = 0;
  let spread = 0;
  // Q121's census: the churn, not just the outcome. A city that burns ends
  // bigger, and "it grew more" and "it lost less" are different mechanisms
  // with the same population column.
  let developed = 0;
  let abandoned = 0;
  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    const outcome = apply(state, { type: CMD_TICK });
    for (const event of outcome.events ?? []) {
      if (event.kind === "fireStarted") burned += 1;
      if (event.kind === "fireSpread") spread += 1;
      if (event.kind === "developed") developed += 1;
      if (event.kind === "abandoned") abandoned += 1;
    }
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  let ruined = 0;
  for (let i = 0; i < state.tiles.flags.length; i += 1) if ((state.tiles.flags[i] & 8) !== 0) ruined += 1;
  return { population: state.population, burned, spread, ruined, developed, abandoned,
    buildings: state.buildings.filter((b) => b.zone !== 0).length,
    stations: state.buildings.filter((b) => b.def === "fireStation").length };
}

function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { p25: at(0.25), median: at(0.5), p75: at(0.75) };
}

const fire = rules().fire;
const shipped = { spread: fire.unfoughtSpread, damage: fire.unfoughtDamage };
// "Before B1a" is not a switch: it is the two constants at the values that make
// an unfought fire behave exactly like a fought one — spread once, and eat its
// own house at the ordinary rate. There was no distinction at all before A62.
const ARMS = [
  { name: "B1a's fire, as shipped", spread: shipped.spread, damage: shipped.damage },
  { name: "as it was before B1a", spread: 1, damage: fire.damagePerTick },
];

console.log(`Q105 — fire against the rest, era ${rules().era}.`);
console.log(`${GAMES} games per configuration, ${YEARS} years each. Same build, same seeds, two constants.\n`);

const rows = {};
for (const arm of ARMS) {
  fire.unfoughtSpread = arm.spread;
  fire.unfoughtDamage = arm.damage;
  for (const config of CONFIGS) {
    const pops = [];
    let burned = 0;
    let spread = 0;
    let ruined = 0;
    let stations = 0;
    let developed = 0;
    let abandoned = 0;
    let standing = 0;
    let live = 0;
    for (let game = 0; game < GAMES; game += 1) {
      const row = play(config, 70000 + game);
      if (!row) continue;
      live += 1;
      pops.push(row.population);
      burned += row.burned;
      spread += row.spread;
      ruined += row.ruined;
      stations += row.stations;
      developed += row.developed;
      abandoned += row.abandoned;
      standing += row.buildings;
    }
    const q = quantiles(pops);
    rows[`${config.name} | ${arm.name}`] = {
      ...q,
      developed: developed / live, abandoned: abandoned / live, standing: standing / live,
    };
    console.log(`${config.name.padEnd(14)} ${arm.name.padEnd(26)} `
      + `p25 ${String(q.p25).padStart(5)}  median ${String(q.median).padStart(5)}  p75 ${String(q.p75).padStart(5)}   `
      + `fires ${(burned / live).toFixed(1)}/city  spread ${(spread / live).toFixed(1)}  `
      + `ruins ${(ruined / live).toFixed(1)}  stations ${(stations / live).toFixed(1)}`);
    console.log(`${"".padEnd(14)} ${"".padEnd(26)} `
      + `developed ${(developed / live).toFixed(0)}/city  abandoned ${(abandoned / live).toFixed(0)}  `
      + `standing at the end ${(standing / live).toFixed(0)}`);
  }
}
fire.unfoughtSpread = shipped.spread;
fire.unfoughtDamage = shipped.damage;

console.log("");
for (const config of CONFIGS) {
  const on = rows[`${config.name} | B1a's fire, as shipped`];
  const off = rows[`${config.name} | as it was before B1a`];
  const delta = ((on.median - off.median) * 100) / off.median;
  console.log(`${config.name}: B1a's fire costs the median city ${(-delta).toFixed(1)}% `
    + `(${off.median} without it, ${on.median} with it)`);
  // Q121: which mechanism. More developments with the same abandonments is
  // fresh ground to grow into (clearRuins); the same developments with fewer
  // abandonments would be the vacancy term instead.
  console.log(`  census: developed ${off.developed.toFixed(0)} -> ${on.developed.toFixed(0)}`
    + ` (${(100 * (on.developed - off.developed) / off.developed).toFixed(1)}%),`
    + ` abandoned ${off.abandoned.toFixed(0)} -> ${on.abandoned.toFixed(0)}`
    + ` (${(100 * (on.abandoned - off.abandoned) / off.abandoned).toFixed(1)}%),`
    + ` standing ${off.standing.toFixed(0)} -> ${on.standing.toFixed(0)}`);
}
