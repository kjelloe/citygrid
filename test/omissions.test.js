// What is deliberately not built yet — as code, so it is reviewed.
//
// The failure this prevents is the one slice N11 was spent on. `CMD_SET_TAX`
// sat in `engine/commands.js` for four slices with a working reducer handler
// and nothing in the client to send it, so the tax rate was a constant the
// design document described and the player could not touch. Nobody noticed,
// because nothing was watching the gap between "the engine can do this" and
// "the game can do this" (ruling 026).
//
// So the gap is written down. A command constant that is neither wired up nor
// listed below is a red suite, and moving a command off the list is a
// deliberate act with a diff.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { knownCommands } from "../engine/reducer.js";
import * as COMMANDS from "../engine/commands.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/quests.js";

/** Commands with a constant and no reducer handler, each with the slice that
 * will build it. Every one of these is multiplayer or a budget mechanic that
 * Wave 4 does not need — none of them is an oversight, which is the claim this
 * list exists to keep honest. */
const NOT_BUILT = {
  takeLoan: "gamedesign.md §10 — borrowing",
  transferFunds: "slice 6.1 — multiplayer treasuries",
  requestDemolition: "slice 5.3",
  resolveRequest: "slice 5.3",
  withdrawRequest: "slice 5.3",
  setRequestPolicy: "slice 5.4",
  reportNuisance: "slice 5.3",
  claimSector: "slice 6.1",
  openBorder: "slice 6.1",
  mutualAid: "slice 6.1",
  offerContract: "slice 6.1",
  resolveContract: "slice 6.1",
  ping: "slice 5.3",
};

function commandNames() {
  return Object.entries(COMMANDS)
    .filter(([name]) => name.startsWith("CMD_"))
    .map(([, value]) => value);
}

const registered = new Set(knownCommands());
const isBuilt = (type) => registered.has(type);

test("every command is either wired to the reducer or listed as not built", () => {
  const orphans = commandNames()
    .filter((type) => !isBuilt(type))
    .filter((type) => !Object.hasOwn(NOT_BUILT, type));
  assert.deepEqual(orphans, [],
    `commands with no handler and no entry in NOT_BUILT: ${orphans.join(", ")}`);
});

test("nothing on the not-built list has quietly been built", () => {
  // The other direction. A command that gains a handler must leave the list in
  // the same commit, or the list becomes a lie people stop reading.
  const built = Object.keys(NOT_BUILT).filter(isBuilt);
  assert.deepEqual(built, [],
    `these have handlers now and should leave NOT_BUILT: ${built.join(", ")}`);
});

test("nothing on the not-built list has a control in the client", () => {
  // The N11 failure in its other form: a button that sends a command the
  // reducer will always refuse.
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".js")) sources.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(repoRoot, "client"));
  const text = sources.join("\n");
  const wired = Object.keys(NOT_BUILT).filter((type) => text.includes(`"${type}"`));
  assert.deepEqual(wired, [], `the client sends unimplemented commands: ${wired.join(", ")}`);
});

test("every command the singleplayer game needs has a way to reach it", () => {
  // The positive claim, named so its failure reads as what it is. These are the
  // commands a person must be able to issue to play a city start to finish;
  // each must have a handler AND appear in the client.
  const PLAYER_COMMANDS = [
    "tick", "join", "paintZone", "dezone", "placeRoad", "placeWire", "placePipe",
    "placeBuilding", "bulldoze", "setTax", "setFunding", "questChoice",
  ];
  const client = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".js")) client.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(repoRoot, "client"));
  const text = client.join("\n");
  for (const type of PLAYER_COMMANDS) {
    assert.ok(isBuilt(type), `${type} has no reducer handler`);
    const constant = Object.entries(COMMANDS).find(([, v]) => v === type)?.[0];
    assert.ok(text.includes(constant), `${type} (${constant}) is not reachable from the client`);
  }
});

test("the placeholder directories are still empty, or their slice has started", () => {
  // `server/`, `worker/` and `client/transport/` were created by the Wave 0
  // skeleton and are empty. That is correct — Waves 5 and 6 have not started.
  // This test exists so that half-finished work in one of them cannot sit
  // unnoticed between waves.
  //
  // `client/lobby/` left this list when the new-game screen was built: it is
  // the singleplayer half of slice 5.2, and slice 5.2 adds seats to it rather
  // than replacing it (Q22).
  for (const dir of ["server", "worker", "client/transport"]) {
    const path = join(repoRoot, dir);
    if (!existsSync(path)) continue;
    const contents = readdirSync(path);
    assert.deepEqual(contents, [],
      `${dir} has files but its wave has not started — move them or start the slice: ${contents.join(", ")}`);
  }
});

test("every module the client imports actually exists", () => {
  // `client/main.js` has imported `./debug.js` since it was written and the
  // file was never created, so `?debug=1` fetched it, failed, and the boot's
  // catch replaced the running game with "Something went wrong". A documented
  // URL parameter that breaks the app is worse than one that does nothing.
  //
  // Static imports fail loudly at load. DYNAMIC ones fail only on the path that
  // reaches them, which for a debug flag or an error screen may be never — so
  // they are exactly the imports nothing else checks.
  const problems = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.endsWith(".js")) continue;
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(/\bimport\(\s*["'](\.[^"']+)["']\s*\)/g)) {
        const target = join(dir, m[1]);
        if (!existsSync(target)) problems.push(`${path.replace(repoRoot + "/", "")} imports ${m[1]}`);
      }
    }
  };
  walk(join(repoRoot, "client"));
  assert.deepEqual(problems, [], problems.join("; "));
});
