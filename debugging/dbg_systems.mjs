// Event census: which systems actually FIRED.
//
// A system that never fires passes every soak — the city is fine, the
// invariants hold, and the feature simply does nothing. This is the probe that
// catches it, and it is the second instrument in the sim gate for that reason.
//
// Usage: node debugging/dbg_systems.mjs [years] [seed]
//        SEED=1003 YEARS=40 node debugging/dbg_systems.mjs

import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply, systemNames } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_TICK, CMD_JOIN } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";

/** Every event kind the engine can currently emit. Anything here that never
 * fires in a full city's lifetime is either dead code or a feature nobody can
 * reach — and the difference matters. */
export const EXPECTED = [
  "seatJoined", "seatLeft", "seatReclaimed", "seatStatus",
  "built", "zoned", "dezoned", "placed",
  "developed", "upgraded", "downgraded", "abandoned",
  "powerShortfall", "waterShortfall",
  "budget", "fundsLow", "unpaidUpkeep", "bankrupt", "taxSet",
  "highCrime", "highPollution",
  "fireStarted", "fireSpread", "fireOut", "burntDown",
];

export function census({ years = 40, seed = 1001, size = 64 } = {}) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats: 1, waterStyle: "river" }));
  if (!world.ok) return { ok: false, reason: world.reason };
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Deputy" });
  const deputy = makeDeputy(1, "expand");

  const counts = {};
  const firstSeen = {};
  const record = (events, tick) => {
    for (const event of events ?? []) {
      counts[event.kind] = (counts[event.kind] ?? 0) + 1;
      if (firstSeen[event.kind] === undefined) firstSeen[event.kind] = tick;
    }
  };

  // The deputy's own commands must be recorded too. The first version of this
  // probe watched only the tick, so "built", "zoned" and "placed" appeared to
  // have never fired in a city that was visibly full of roads — a probe
  // reporting zeros about a world full of the thing it is counting.
  const seatJoin = apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Observer" });
  record(seatJoin.events, 0);

  let now = 0;
  const spy = (outcome) => record(outcome.events, now);

  for (let tick = 1; tick <= years * TICKS_PER_YEAR; tick += 1) {
    now = tick;
    record(apply(state, { type: CMD_TICK }).events, tick);
    if (tick % 6 === 0) deputyTurn(state, deputy, spy);
  }
  return { ok: true, counts, firstSeen, state, deputy };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const years = Number(process.env.YEARS ?? process.argv[2] ?? 40);
  const seed = Number(process.env.SEED ?? process.argv[3] ?? 1001);
  const result = census({ years, seed });
  if (!result.ok) {
    console.error("generation failed:", result.reason);
    process.exit(1);
  }

  console.log(`event census — seed ${seed}, ${years} city years\n`);
  console.log("systems registered:");
  for (const name of systemNames()) console.log(`  ${name}`);

  console.log("\nevents fired:");
  const fired = Object.keys(result.counts).sort();
  for (const kind of fired) {
    const year = Math.floor(result.firstSeen[kind] / TICKS_PER_YEAR);
    console.log(`  ${kind.padEnd(18)} ${String(result.counts[kind]).padStart(7)}   first in year ${year}`);
  }

  const silent = EXPECTED.filter((kind) => !fired.includes(kind));
  console.log(`\n${fired.length} of ${EXPECTED.length} known event kinds fired.`);
  if (silent.length > 0) {
    // Not a failure by itself — a city that never goes bankrupt is a healthy
    // city, not a broken one. It is a list to look at and explain.
    console.log("never fired (explain each, or it is dead code):");
    for (const kind of silent) console.log(`  ${kind}`);
  }
}
