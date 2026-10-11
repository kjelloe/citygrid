// The tools parse (slice D9).
//
// `tools/` is a directory of scripts that nothing imports: a gate is run, not
// required, so a syntax error in one is invisible to the suite and shows up the
// moment somebody runs it — usually at the end of a long slice, usually as the
// last step before a commit.
//
// `tools/perf_report.mjs` was the third instance: it builds a Markdown page in a
// template literal, and three separate edits quoted a `name` in the prose and
// closed the template early. Half a second of `node --check` moves that from a
// surprise into a red suite.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot, jsFilesIn, stripComments, stripCommentsAndStrings } from "./helpers/sources.js";

const scripts = () => {
  const dir = join(repoRoot, "tools");
  return readdirSync(dir)
    // Not `.` files: a probe somebody is mid-way through is their business.
    .filter((name) => /\.mjs$/.test(name) && !name.startsWith("."))
    .map((name) => join("tools", name));
};

test("every tool parses", () => {
  const broken = [];
  for (const script of scripts()) {
    try {
      execFileSync(process.execPath, ["--check", script], { cwd: repoRoot, stdio: "pipe" });
    } catch (error) {
      broken.push(`${script}: ${String(error.stderr ?? error).split("\n").slice(0, 3).join(" ")}`);
    }
  }
  assert.deepEqual(broken, [], broken.join("\n"));
});

test("there are tools to check, so an empty pass is not a pass", () => {
  assert.ok(scripts().length > 15, `${scripts().length} tools found`);
});

// --- a tool that plays a city for a number loads the real data (D8b) --------

/**
 * Tools that play a deputy city and are **still** measured on the engine's
 * mirrors, with what each one would cost to move.
 *
 * `engine/rules.js` and `engine/catalogue.js` are mirrors kept identical to
 * `data/` by a drift test; `engine/quests.js` has **none**, so `CATALOGUE = []`
 * and a city nothing loaded content into is a city in which no quest can fire.
 * Every number in `reports/` was measured that way until era 30 (Q158 → A136),
 * and quests pay money and set `rank`.
 *
 * The four measurement tools load it now. The ones below are pictures: loading
 * quests into `tools/lib/aim.mjs`'s `playedCity` moves every photograph in the
 * project, which is its own slice with its own re-shoot, so it is named here
 * rather than left to be discovered again. **The fix when this list shortens is
 * to delete the entry, not to widen it.**
 */
const QUEST_FREE = {
  "tools/lib/aim.mjs": "playedCity, which every _shots gate builds its city with — "
    + "the re-shoot is the slice",
  "tools/lib/saturated.mjs": "the scripted city the walks and lanes_dump measure; it is built "
    + "by explicit commands and has no deputy turn to spend a quest's money",
  "tools/embankment_shots.mjs": "its own played city, for the wall pictures (S18c)",
  "tools/lanes_dump.mjs": "the saturated city, through lib/saturated.mjs",
  "tools/film_spots.mjs": "a shot list for the film, not a measurement",
  "tools/fire_arms.mjs": "B1a's two arms, a question about fire rather than about money",
  "tools/model_cost.mjs": "a timing table; the city is the subject's size, not its economy",
  "tools/seam_cost.mjs": "the same, for the seam",
  "tools/where.mjs": "a probe that prints where something is",
};

test("a tool that plays a city for a number loads the real content", () => {
  const plays = jsFilesIn("tools")
    .filter(({ source }) => /\bdeputyTurn\b/.test(stripComments(source)))
    .map(({ path, source }) => ({ path, source }));
  assert.ok(plays.length > 8, `only ${plays.length} tools play a deputy city — this scans nothing`);
  const missing = plays
    .filter(({ source }) => !/lib\/content\.mjs/.test(stripComments(source)))
    .map(({ path }) => path)
    .filter((path) => !Object.hasOwn(QUEST_FREE, path));
  assert.deepEqual(missing, [],
    "these play a deputy city and measure the engine's mirrors — load "
    + `tools/lib/content.mjs or say why not in QUEST_FREE: ${missing.join(", ")}`);
});

test("the quest-free list has no entries for tools that now load the content", () => {
  // The direction that rots: a tool moved onto the real data must leave this
  // list in the same commit, or the list stops describing the repository.
  const sources = new Map(jsFilesIn("tools").map(({ path, source }) => [path, stripComments(source)]));
  const stale = Object.keys(QUEST_FREE).filter((path) => {
    const source = sources.get(path);
    return source === undefined || /lib\/content\.mjs/.test(source);
  });
  assert.deepEqual(stale, [], `QUEST_FREE names tools that are gone or already loading: ${stale.join(", ")}`);
});

test("every entry on the quest-free list says what it would cost to move", () => {
  for (const [path, why] of Object.entries(QUEST_FREE)) {
    assert.ok(typeof why === "string" && why.length > 20, `${path} has no reason on it`);
  }
});

test("one implementation of serving the tree, and the tools share it (Q167)", () => {
  // M12 deleted `tools/serve.mjs` because two static servers for one tree is
  // two chances to be wrong about it — and left sixteen more, one per picture
  // gate, each with its own type table and none sending the headers a player
  // gets. `tools/screenshot.mjs` was the one that mattered: every picture this
  // project has taken came off its fourteen-line server, so the frames the art
  // direction is argued from were served by a harness rather than by the game.
  //
  // The handler is shared, not the process: a picture harness needs no pump,
  // no socket and no city. What had to stop differing is the bytes and the
  // headers.
  const own = [];
  for (const { path, source } of jsFilesIn("tools")) {
    const code = stripCommentsAndStrings(source);
    if (!/\bcreateServer\s*\(/.test(code)) continue;
    // A tool may still call `createServer`, but what it passes has to come
    // from `server/static.js` — directly, or wrapped so it can patch a file
    // first (`update_smoke` deploys twice, `offline_smoke` goes offline).
    if (/makeStatic\s*\(/.test(code)) continue;
    own.push(path);
  }
  assert.deepEqual(own, [],
    `tools that still serve the tree their own way: ${own.join(", ")} — use server/static.js`);
});

test("and the shared handler is the one the server itself runs (Q167)", () => {
  // The other direction: a `server/static.js` nothing in `server/` used would
  // be a second implementation wearing the first one's name.
  const server = readFileSync(join(repoRoot, "server", "index.js"), "utf8");
  assert.match(server, /from "\.\/static\.js"/,
    "server/index.js does not use the handler the tools share");
});

// --- the room gates against another server (K6d) ------------------------------
//
// V4 says "the gates against the deployed box once" and there was no command
// behind the sentence: `room_soak` and `room_smoke` start a server of their own
// and have no way to be pointed at one. `--url <origin>` is that way, and this
// is the half of it node can hold — the parsing, and that the DEFAULT is still
// a server of the gate's own, because a flag that changes behaviour when it is
// absent is a flag nobody can trust.

test("the room gates take --url, and spawn their own server without it (K6d)", async () => {
  const { roomTarget } = await import("../tools/lib/room-url.mjs");

  const own = roomTarget(["node", "room_soak.mjs", "5"]);
  assert.equal(own.spawn, true, "no --url has to mean the gate's own server");
  assert.equal(own.origin, undefined);

  const plain = roomTarget(["node", "x", "--url", "http://box.test:8123"]);
  assert.deepEqual(plain, { spawn: false, origin: "http://box.test:8123", ws: "ws://box.test:8123/ws" });

  // `wss` under `https`, which is the whole reason this is a function and not a
  // string concatenation at the call site: a gate that dialled `ws://` at a
  // TLS origin would be refused by the browser and by nginx, and the error it
  // gives says nothing about why.
  const secure = roomTarget(["node", "x", "--url", "https://citygrid.kjell.today"]);
  assert.equal(secure.ws, "wss://citygrid.kjell.today/ws");
  assert.equal(secure.origin, "https://citygrid.kjell.today");

  // A trailing slash is what a person pastes out of a browser.
  assert.equal(roomTarget(["node", "x", "--url", "https://box.test/"]).origin, "https://box.test");
  assert.equal(roomTarget(["node", "x", "--url", "https://box.test/"]).ws, "wss://box.test/ws");
});

test("--url with nothing after it, or something that is not an origin, refuses (K6d)", () => {
  // A gate pointed at nonsense must say so rather than fall back to spawning
  // its own server and reporting a green run of the wrong thing — which is the
  // `a-knob-you-turned-is-not-a-knob-it-read` shape, in a release gate.
  return import("../tools/lib/room-url.mjs").then(({ roomTarget }) => {
    for (const bad of [["--url"], ["--url", "--eight"], ["--url", "box.test"], ["--url", "ftp://box.test"]]) {
      assert.throws(() => roomTarget(["node", "x", ...bad]), /--url/,
        `${JSON.stringify(bad)} was accepted`);
    }
  });
});

test("every gate the runner hands --url to actually reads it (K6d)", async () => {
  // A flag passed to a gate that does not read it is a green run of the gate's
  // own server — which is the one thing v1.0's V4 is trying to stop. The
  // runner's list and the gates' own argument handling, asserted as a pair.
  const runner = stripCommentsAndStrings(readFileSync(join(repoRoot, "tools", "gates.mjs"), "utf8"));
  const names = /TAKES_URL = new Set\(\[([^\]]*)\]/.exec(runner);
  assert.ok(names, "the runner no longer names which gates take --url");
  // The names are gone with the strings — this file's scanner strips them —
  // so they are read off the RAW source and the stripped copy is only used to
  // find the list.
  const raw = readFileSync(join(repoRoot, "tools", "gates.mjs"), "utf8");
  const list = /TAKES_URL = new Set\(\[([^\]]*)\]/.exec(raw);
  const takers = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(takers.length >= 2, `only ${takers.join(", ")} take --url`);
  const { GATES } = await import("../tools/gates.mjs");
  for (const name of takers) {
    const gate = GATES[name];
    assert.ok(gate, `${name} is on the --url list and is not a gate`);
    const file = gate.args[0];
    const source = stripCommentsAndStrings(readFileSync(join(repoRoot, file), "utf8"));
    assert.match(source, /roomTarget\(/,
      `${name} is handed --url and ${file} never asks what it means`);
  }
});

test("both room gates and the runner read the same --url (K6d)", () => {
  // The three places the flag has to exist, asserted as a set rather than
  // trusted: a flag the runner passes to a gate that does not read it is a
  // green run of the gate's own server.
  for (const path of ["tools/room_soak.mjs", "tools/room_smoke.mjs", "tools/gates.mjs"]) {
    const source = stripCommentsAndStrings(readFileSync(join(repoRoot, path), "utf8"));
    assert.match(source, /roomTarget|--url|urlArg/, `${path} does not know about --url`);
  }
});
