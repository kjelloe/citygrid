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
import { OPTION_FIELDS } from "../engine/options.js";
import { repoRoot, jsFilesIn, stripCommentsAndStrings } from "./helpers/sources.js";
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

test("every module under server/ is reached from its entry point (X1)", () => {
  // This replaces "the placeholder directories are still empty". `server/`,
  // `worker/` and `client/transport/` were created empty by the Wave 0
  // skeleton and this test asserted they stayed that way until their slice —
  // `worker/` left the list in W2, `client/transport/` in W4, `client/lobby/`
  // when the new-game screen was built, and **`server/` leaves it in X1**. The
  // list is now empty, and a loop over an empty list is a test that cannot
  // fail.
  //
  // What takes its place is the same question asked of started work: X1 is five
  // modules and one of them could be imported by nothing. A name grep would be
  // the wrong instrument — `server/store.js` appears in no test by name and is
  // reached through `server/index.js` — so the imports are FOLLOWED, from the
  // entry point the process actually starts at.
  const entry = "index.js";
  const dir = join(repoRoot, "server");
  if (!existsSync(dir)) return;
  const present = readdirSync(dir).filter((name) => name.endsWith(".js"));
  assert.ok(present.includes(entry), "server/ has no index.js to start from");

  const reached = new Set();
  const follow = (name) => {
    if (reached.has(name)) return;
    reached.add(name);
    // Comments stripped but strings kept: an import specifier IS a string, and
    // `stripCommentsAndStrings` would delete the very path being looked for —
    // which is how the first cut of this test reported all four modules as
    // orphans.
    const text = readFileSync(join(dir, name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const match of text.matchAll(/from\s*"\.\/([\w.-]+\.js)"/g)) follow(match[1]);
  };
  follow(entry);

  const orphans = present.filter((name) => !reached.has(name));
  assert.deepEqual(orphans, [],
    `server/ modules nothing imports: ${orphans.join(", ")} — wire them up or delete them`);
});

test("the options the project declares and nothing reads are exactly these (Q148)", () => {
  // Thirteen options are declared in `engine/options.js` — most of them Wave 5's
  // contract, §3.3's regency and abandonment rules, the season length, the
  // lobby's chat and privacy switches — and **no code anywhere reads them**.
  // Declaring ahead of the mechanics is reasonable; leaving it unwritten is how
  // `setRules` sat with no caller for the life of the project, because a number
  // nothing reads is indistinguishable from a number that STOPPED being read.
  //
  // The rule, exactly: no mention outside `options.js` and `rules.js` in
  // `engine/`, `client/`, `shared/` or `worker/`, with comments and strings
  // stripped — the first cut of this test counted a mention in a COMMENT as a
  // reader, and the comment was one I had just written about the option.
  //
  // So the list is pinned rather than argued about. Adding a fourteenth is a
  // deliberate act; wiring one up turns this red in the direction that means
  // somebody did the work.
  const files = ["engine", "client", "shared", "worker"].flatMap((dir) => jsFilesIn(dir))
    .filter((f) => !/(engine\/options|engine\/rules)\.js$/.test(f.path))
    .map((f) => stripCommentsAndStrings(f.source));
  const unread = OPTION_FIELDS.filter((name) => !files.some((src) => new RegExp(`\\b${name}\\b`).test(src)));
  assert.deepEqual(unread.sort(), [
    "abandonYears", "absenceYears", "chatEnabled", "derelictYears", "disasterAid",
    "freeTextReasons", "keepForDays", "lateJoin", "mutualAid", "privacy",
    "requestExpiryMonths", "seasonYears", "splitRule",
  ], "the set of declared-but-unread options moved — wire it, delete it, or pin it here on purpose");
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
