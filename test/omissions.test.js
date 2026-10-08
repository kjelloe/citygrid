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
import { alertKinds } from "../client/ui/alerts-model.js";
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
import "../engine/requests.js";

/** Commands with a constant and no reducer handler, each with the slice that
 * will build it. Every one of these is multiplayer or a budget mechanic that
 * Wave 4 does not need — none of them is an oversight, which is the claim this
 * list exists to keep honest. */
const NOT_BUILT = {
  // X3a built five of these: `requestDemolition`, `resolveRequest`,
  // `withdrawRequest`, `reportNuisance` and `ping` left this list in the commit
  // that gave them handlers, which is the rule below working in the direction
  // that means somebody did the work.
  transferFunds: "slice 6.1 — multiplayer treasuries",
  setRequestPolicy: "slice 5.4",
  claimSector: "slice 6.1",
  openBorder: "slice 6.1",
  mutualAid: "slice 6.1",
  offerContract: "slice 6.1",
  resolveContract: "slice 6.1",
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

test("every wire message has a sender and a reader, or says which slice gives it one (X1c)", () => {
  // The N11 question asked of the PROTOCOL. A message in `shared/protocol.js`
  // with nothing on one end is the same shape as a command with no handler —
  // and worse, because the half that exists looks like a finished wire.
  //
  // This found `C2S.RESYNC_REQUEST`: `server/index.js` had answered it since
  // X1a, the socket transport handled the `S2C.SNAPSHOT` that comes back, and
  // **nothing in the page had ever sent one** — the session's desync detector
  // printed `DESYNC` and left the client wrong for ever. `tools/room_soak.mjs`
  // was the only sender in the project, which is why the wire looked done.
  const names = [];
  for (const [side, table] of [["C2S", C2S], ["S2C", S2C]]) {
    for (const key of Object.keys(table)) names.push(`${side}.${key}`);
  }
  // **Both ends, counted separately.** "Appears somewhere" is one end wearing
  // the other's clothes: `C2S.LATENCY` is answered by `server/index.js` and has
  // never been sent by anything, so a single grep over the whole repo would
  // call it used. A `C2S` message needs a sender outside `server/` and a
  // handler inside it; an `S2C` message needs the reverse. Tools count as
  // clients — a gate driving the wire is a client of it — and `protocol.js`
  // itself counts as neither, since declaring a name is not using it.
  const side = (dirs) => dirs.flatMap((dir) => jsFilesIn(dir)
    .filter((file) => !file.path.endsWith("shared/protocol.js"))
    .map((file) => stripCommentsAndStrings(file.source))).join("\n");
  const client = side(["client", "worker", "tools", "shared"]);
  const server = side(["server"]);
  const unused = names.filter((name) => {
    const ends = name.startsWith("C2S.") ? [client, server] : [server, client];
    return !(ends[0].includes(name) && ends[1].includes(name));
  });
  const declared = Object.keys(WIRE_NOT_BUILT).sort();
  assert.deepEqual(unused.sort(), declared,
    `wire messages with nothing on either end: ${unused.join(", ")} — use them, or list them in `
    + "WIRE_NOT_BUILT with the slice that will");
  for (const [name, why] of Object.entries(WIRE_NOT_BUILT)) {
    assert.ok(why.length > 20, `${name}'s reason is too short to be one`);
  }
});

test("every event the engine can emit is either an alert or deliberately silent", () => {
  // The N11 question, asked of EVENTS. An engine event the player cannot see is
  // the same defect as a command the player cannot send: `pushAlerts` looks its
  // kind up in `KINDS` and skips what it does not know, so a new kind is
  // silently dropped rather than shown as a raw key. X3a added `requestFiled`,
  // `requestResolved` and `requestWithdrawn` and nothing noticed — correctly,
  // because the inbox is X3b's, but "correctly" has to be written down or it is
  // indistinguishable from forgotten.
  //
  // Comments stripped, strings KEPT: the kinds are string literals, which is
  // the opposite of the options audit's rule and the reason that one got it
  // wrong once already.
  const SILENT = {
    // Routine bookkeeping. An alert a player gets every month is furniture.
    budget: "a monthly accrual, not news",
    built: "the thing appearing on the map IS the feedback",
    placed: "as `built`",
    zoned: "as `built`",
    dezoned: "as `built`",
    avenue: "as `built`",
    developed: "the lot growing is the feedback",
    upgraded: "the building changing is the feedback",
    taxSet: "the slider the player just moved",
    fundingSet: "the slider the player just moved",
    bankrupt: "shown by the treasury readout and the budget drawer",
    fireSpread: "`fireStarted` is the alert; a spread would be an alert a minute",
    burntDown: "`wrecked` covers the loss",
    // The quest card is its own interface (N14).
    questOffered: "the advisor card",
    questCompleted: "the advisor card",
    questChoice: "the player's own click",
    questReward: "the card and the treasury",
    // Seats. The lobby and the roster are X2's; nothing in singleplayer.
    seatJoined: "the lobby (X2)",
    seatLeft: "the roster, built X4 2026-10-08 — every seat's status is a row in it",
    seatReclaimed: "the roster (X2)",
    seatStatus: "the roster, built X4 2026-10-08 — every seat's status is a row in it",
    // L1's two. The budget drawer shows the debt and the ceiling as numbers,
    // which is the feedback; an alert every month saying "you still owe money"
    // is furniture, and the one that matters — cannot pay the interest — is
    // already `fundsLow` and `bankrupt`.
    borrowed: "the budget drawer's own readout",
    repaid: "the budget drawer's own readout",
    interest: "billed with the month; `fundsLow` is the alert when it bites",
    // X3a's three, and the camera gesture. The inbox that shows them is X3b.
    requestFiled: "the request inbox (X3b)",
    requestResolved: "the request inbox (X3b)",
    requestWithdrawn: "the request inbox (X3b)",
    ping: "a camera gesture: the other player's marker is X3b",
  };

  const emitted = new Set();
  for (const file of jsFilesIn("engine")) {
    const source = file.source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const match of source.matchAll(/kind:\s*"([A-Za-z]+)"/g)) emitted.add(match[1]);
  }
  assert.ok(emitted.size > 30, `only ${emitted.size} event kinds found — the scan is broken`);

  const unaccounted = [...emitted].filter((kind) => !alertKinds().includes(kind) && !Object.hasOwn(SILENT, kind));
  assert.deepEqual(unaccounted.sort(), [],
    `event kinds the player can never see and that nobody declared silent: ${unaccounted.join(", ")}`);

  // And the other direction: an alert kind the engine no longer emits is a
  // translation nobody will ever read.
  const orphanAlerts = alertKinds().filter((kind) => !emitted.has(kind));
  assert.deepEqual(orphanAlerts, [],
    `alert kinds no engine event produces: ${orphanAlerts.join(", ")}`);
});

test("the options the project declares and nothing reads are exactly these (Q148)", () => {
  // Ten options are declared in `engine/options.js` — most of them Wave 5's
  // contract, §3.3's regency and abandonment rules, the season length, the
  // lobby's chat and privacy switches — and **no code anywhere reads them**.
  // Nine since X3c, which is this test going red in the good direction:
  // `derelictYears` is the override's clock and `engine/requests.js` reads it.
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
  // `server` is in the list since X1a, and it had to be: the X0 review claimed
  // `keepForDays` would leave this list when `server/store.js` read it, and it
  // did not, because the scan could not see the server at all. An instrument
  // that cannot see where the work happened reports that no work happened.
  const files = ["engine", "client", "shared", "worker", "server"].flatMap((dir) => jsFilesIn(dir))
    .filter((f) => !/(engine\/options|engine\/rules)\.js$/.test(f.path))
    .map((f) => stripCommentsAndStrings(f.source));
  const unread = OPTION_FIELDS.filter((name) => !files.some((src) => new RegExp(`\\b${name}\\b`).test(src)));
  assert.deepEqual(unread.sort(), [
    "abandonYears", "absenceYears", "chatEnabled", "disasterAid",
    "lateJoin", "mutualAid", "privacy", "seasonYears", "splitRule",
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
