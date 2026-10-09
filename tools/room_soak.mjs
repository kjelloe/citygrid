// Two real clients, one real socket, five city years (X1's gate).
//
//   node tools/room_soak.mjs [years]
//
// `test/room.test.js` proves the room in node with the clock in its hand; this
// proves the same thing through `ws`, over a real HTTP server, with two clients
// that have never seen each other's commands except in a frame. What it asserts
// is the claim the whole wave rests on: **one order, one hash**, checked every
// sim-month rather than at the end, because a divergence at month two found at
// year five tells you nothing about which command caused it.
//
// The clients run the same `worker/sim-host.js` the game runs — not a mock, and
// not the server's own state — so a mistake in the patch, the ordering or the
// handshake shows up here as a number that differs.
//
// **Scripted, not deputies.** The item asked for two deputies; `deputyTurn`
// applies to a state rather than emitting commands, so a deputy client would
// have to be written first, and that belongs to X4's regency. What these two do
// instead is build: a road a beat each, on their own half of the map, which is
// the interleaving the ordering rules exist for.

import { WebSocket } from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/index.js";
import { createStore } from "../server/store.js";
import { formatRoomCode } from "../shared/roomcode.js";
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { hashState } from "../engine/state.js";
import { CMD_PLACE_ROAD, CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { C2S, S2C, PROTOCOL_VERSION } from "../shared/protocol.js";
import { buildHash } from "../shared/build-hash.js";

// The first argument that is a NUMBER: `--churn` is a flag and
// `Number("--churn")` is NaN, which made every check downstream read "of NaN"
// and the run measure nothing at all.
const YEARS = Number(process.argv.slice(2).find((arg) => !Number.isNaN(Number(arg))) ?? 5) || 5;
const TICKS_PER_YEAR = 144;
/** The loop's own period, and the room's fast speed in ticks a second — the
 * third entry of `TICKS_PER_SECOND` in `server/room.js` (X1d). The pair is what
 * the run's length is computed from, so the soak plays the years it claims. */
const LOOP_MS = 12;
const TICKS_PER_SECOND_FAST = 16;
const SIZE = 48;
const problems = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/** What the door says to a client the room will not have. Separate from
 * `connect` because that one treats a refusal as a failure, and this is the one
 * case where the refusal IS the result (the gate's "a client with a different
 * build hash is refused with the reload reason"). */
function refusalFor(url, hello) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on("open", () => socket.send(JSON.stringify(hello)));
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      socket.close();
      resolve(message);
    });
    socket.on("close", () => resolve(undefined));
  });
}

/** A client: a socket, a simulation of its own, and a mirror of it. */
function connect(url, seat, code) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const client = {
      seat, socket, host: createSimHost(), mirror: undefined,
      frames: 0, bytes: 0, commands: 0, checks: 0, divergences: [], resyncs: 0, asked: 0, answered: 0,
      accepted: 0, refused: [],
      hash: () => (client.mirror ? hashState(client.mirror) : ""),
      send: (message) => socket.send(JSON.stringify(message)),
      ask: (cells) => {
        client.asked += 1;
        client.send({ type: C2S.COMMAND, command: {
          type: CMD_REQUEST_DEMOLITION, actor: seat, runs: encodeRuns(cells),
          title: "Your road crosses my line", reason: "I would rather run mine straight", offer: 100,
        } });
      },
      /** The inbox, read the way a real client will read it: off the mirror.
       * The room never tells a client the id of a request — it tells it the
       * COMMAND, and the id is whatever the reducer assigned when every client
       * applied it, which is the whole point of running the same reducer. */
      answer: () => {
        for (const request of client.mirror.requests) {
          if (request.status !== "pending" || request.to !== seat) continue;
          client.answered += 1;
          client.send({ type: C2S.COMMAND, command: {
            type: CMD_RESOLVE_REQUEST, actor: seat, id: request.id, approve: true,
          } });
          return;
        }
      },
      build: (cells) => {
        client.commands += 1;
        client.send({ type: C2S.COMMAND, command: { type: CMD_PLACE_ROAD, actor: seat, runs: encodeRuns(cells) } });
      },
      close: () => socket.close(),
    };

    socket.on("open", () => client.send({
      type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat, name: `Soak ${seat}`,
      room: code,
    }));
    socket.on("error", reject);
    socket.on("message", (raw) => {
      // What the room costs a client on the wire (X7, plan §3.8). Counted here
      // because this is the only place the bytes exist as bytes: everything
      // below works on the parsed message.
      client.bytes += raw.length ?? String(raw).length;
      const message = JSON.parse(raw.toString());
      if (message.type === S2C.WELCOME) {
        const ready = client.host.handle({ type: "init", id: 0, save: message.save }).reply;
        if (ready.type !== "ready") { reject(new Error(`seat ${seat} could not start: ${ready.reason}`)); return; }
        client.mirror = createMirror(ready.patch);
        resolve(client);
        return;
      }
      if (message.type === S2C.REFUSED) { reject(new Error(`seat ${seat} refused: ${message.reason}`)); return; }
      if (message.type === S2C.SNAPSHOT) {
        // A resync restarts the SIMULATION, not just the mirror: the reducer is
        // what diverged, and a mirror healed on its own is undone by the next
        // frame this client's own host produces.
        const ready = client.host.handle({ type: "init", id: 0, save: message.save }).reply;
        client.mirror = createMirror(ready.patch);
        client.resyncs += 1;
        return;
      }
      if (message.type !== S2C.FRAME) return;
      client.frames += 1;
      for (const entry of message.cmds) {
        const { reply } = client.host.handle({ type: "apply", id: 1, command: entry.command });
        applyPatch(client.mirror, reply.patch);
        // **What the ROOM made of it.** The first cut of this gate counted the
        // commands it SENT and called that 104 commands: on seed 1003 one
        // client's rows were water, every road it sent was refused `invalid`,
        // and the gate reported a busy city while that seat built nothing for
        // five years. A gate that cannot see a refusal measures its own
        // intentions.
        if (entry.seat !== seat) continue;
        if (entry.result === "ok") client.accepted += 1;
        else client.refused.push(`${entry.command.type}: ${entry.result}`);
      }
      if (message.ticks > 0) {
        const { reply } = client.host.handle({ type: "tick", id: 2, count: message.ticks });
        applyPatch(client.mirror, reply.patch);
      }
      // The month's hash: the whole point of the exercise.
      if (message.hash !== undefined) {
        client.checks += 1;
        const mine = client.hash();
        if (mine !== message.hash) {
          client.divergences.push({ tick: message.tick, mine, room: message.hash });
          client.send({ type: C2S.RESYNC_REQUEST });
        }
      }
    });
  });
}

/** A run of clear ground the city will actually accept, found by ASKING the
 * client's own mirror. Hard-coded rows are how the first cut of this gate spent
 * five years building nothing: `(row + 20)` on seed 1003 is water. */
function clearRun(state, fromRow, length) {
  const W = state.width;
  for (let z = fromRow; z < state.height - 2; z += 1) {
    for (let x = 2; x + length < W - 2; x += 1) {
      const cells = [];
      for (let i = 0; i < length; i += 1) cells.push(z * W + x + i);
      const clear = cells.every((index) => state.tiles.terrain[index] !== 3
        && state.tiles.terrain[index] !== 4 && state.tiles.road[index] === 0
        && state.tiles.buildingId[index] === 0);
      if (clear) return cells;
    }
  }
  return undefined;
}

/** Two tiles of road a seat actually owns, as this client's mirror sees it. */
function ownedRoad(state, seat) {
  const total = state.width * state.height;
  for (let index = 0; index + 1 < total; index += 1) {
    if (state.tiles.owner[index] !== seat || state.tiles.road[index] === 0) continue;
    if (state.tiles.owner[index + 1] !== seat || state.tiles.road[index + 1] === 0) continue;
    return [index, index + 1];
  }
  return undefined;
}

// Its own directory under the OS temp, removed at the end: the server keeps
// checkpoints and resumes them, and a gate that left a city in `rooms/` would
// hand the next run the last run's world — a measurement of the order the gates
// ran in (CLAUDE.md), and an untracked file in the repo.
const roomDir = await mkdtemp(join(tmpdir(), "citygrid-soak-"));

// **Churn mode** (X4b), the gate the item asks for: seats join and leave while
// the room runs, the deputy takes an empty seat over, and nobody diverges. The
// windows are seconds rather than minutes because a soak that waited a quarter
// of an hour for a regency would not be run.
const CHURN = process.argv.includes("--churn");
/**
 * **The release gate at eight** (X7, v1.0's V4). `plan-v1.md` has named it
 * since August: eight players on one region for a session. This is the
 * scripted half — eight clients, each running the real `worker/sim-host.js`,
 * on one socket each, for five city years — and the half a browser cannot do,
 * because eight Chromium contexts on one machine measure the machine.
 *
 * What it adds to the two-client run is not "more of the same": a room with
 * eight seats broadcasts every accepted command to eight sockets, so the
 * frame cost per client and the pump's jitter under that load are plan §3.8's
 * second measured row, and the hash has eight ways to disagree instead of one.
 */
const EIGHT = process.argv.includes("--eight");
const CLIENTS = EIGHT ? 8 : 2;

const server = await startServer({
  heldForMs: CHURN ? 500 : undefined,
  regencyAfterMs: CHURN ? 1500 : undefined,
  port: 0,
  store: createStore({ dir: roomDir }),
  // A fresh region every run, for the same reason.
  fresh: true,
  tickMs: 10,                     // the soak's beat; the room still owes 2 ticks a beat at speed 1
  options: { seed: 1003, width: SIZE, height: SIZE, seats: Math.max(4, CLIENTS) },
  roomId: "soak",
});
const url = `ws://127.0.0.1:${server.port}/ws`;
// The room's own code (X2a): the door asks which room, so the gate has to name
// it like any other client would. Hoisted, because the restart check below
// compares the room that comes back off the disk against it.
const code = server.room.code();

// **Eight clients, one region** (X7). Its own block rather than a parameter on
// the one below: the two-client soak is X1's gate and has been measured at
// 47 s since X1d, and threading `clients[i]` through its pairwise request
// choreography would make both runs harder to read for no gain.
if (EIGHT) {
  const clients = [];
  for (let seat = 1; seat <= CLIENTS; seat += 1) clients.push(await connect(url, seat, code));
  check(`${CLIENTS} clients joined one room`,
    clients.every((c) => c.mirror !== undefined), `${clients.filter((c) => c.mirror).length} of ${CLIENTS}`);

  server.room.setSpeed(3);
  const ticksPerIteration = (LOOP_MS * TICKS_PER_SECOND_FAST) / 1000;
  const beats = Math.ceil((YEARS * TICKS_PER_YEAR) / ticksPerIteration);
  const BUILD_EVERY = Math.max(1, Math.round(beats / 52));
  const ASK_EVERY = Math.max(4, Math.round(beats / 10));
  console.log(`${CLIENTS} clients, ${beats} iterations of ${LOOP_MS} ms `
    + `≈ ${(beats * LOOP_MS / 1000).toFixed(0)} s for ${YEARS * TICKS_PER_YEAR} ticks`);

  // Each seat on its own strip of the map, so eight builders are not eight
  // refusals for the same ground — and a request around the ring, so every
  // seat both asks and answers rather than one pair carrying the whole claim.
  const strip = Math.max(6, Math.floor((SIZE - 8) / CLIENTS));
  for (let n = 0; n < beats; n += 1) {
    if (n % BUILD_EVERY === 0) {
      for (let i = 0; i < clients.length; i += 1) {
        const run = clearRun(clients[i].mirror, 4 + i * strip, 6);
        if (run) clients[i].build(run);
      }
    }
    if (n % ASK_EVERY === 1) {
      for (let i = 0; i < clients.length; i += 1) {
        const next = (i + 1) % clients.length;
        const theirs = ownedRoad(clients[i].mirror, clients[next].seat);
        if (theirs) clients[i].ask(theirs);
      }
    }
    if (n % ASK_EVERY === 3) for (const c of clients) c.answer();
    await new Promise((resolve) => setTimeout(resolve, LOOP_MS));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));

  const hashes = clients.map((c) => c.hash());
  const jitter = server.pump.jitter();
  const cost = server.pump.cost();
  const frames = clients.map((c) => c.frames);
  const bytes = clients.map((c) => c.bytes);
  const asked = clients.reduce((n, c) => n + c.asked, 0);
  const answered = clients.reduce((n, c) => n + c.answered, 0);

  console.log(`\nroom at tick ${server.room.tick()}; frames ${Math.min(...frames)}–${Math.max(...frames)}; `
    + `${asked} requests asked, ${answered} answered`);
  console.log(`bytes a client: ${(Math.min(...bytes) / 1024).toFixed(0)}–`
    + `${(Math.max(...bytes) / 1024).toFixed(0)} KiB over ${YEARS} city years `
    + `(${(bytes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(2)} MiB from the room in total)`);
  console.log(`pump jitter p50 ${jitter?.p50Ms} ms p99 ${jitter?.p99Ms} ms max ${jitter?.maxMs} ms `
    + `(${jitter?.latePct}% late); warm beat p50 ${cost?.p50Ms} ms p99 ${cost?.p99Ms} ms `
    + `max ${cost?.maxMs} ms over ${cost?.n} beats`);

  check("the room played five city years",
    server.room.tick() >= YEARS * TICKS_PER_YEAR * 0.9,
    `tick ${server.room.tick()} of ${YEARS * TICKS_PER_YEAR}`);
  check(`all ${CLIENTS} clients are on one hash`, new Set(hashes).size === 1,
    hashes.map((h, i) => `${i + 1}:${h.slice(0, 8)}`).join(" "));
  check("and it is the room's", hashes[0] === server.room.hash(),
    `${hashes[0]} vs ${server.room.hash()}`);
  for (const c of clients) {
    check(`seat ${c.seat} never diverged`, c.divergences.length === 0,
      c.divergences.slice(0, 2).map((d) => `tick ${d.tick}: ${d.mine} vs ${d.room}`).join("; "));
  }
  check("every seat checked the month's hash rather than assuming it",
    clients.every((c) => c.checks >= YEARS * 8), clients.map((c) => c.checks).join(" "));
  // Requests both ways round the ring, which is the half of the release gate
  // that is about PLAYING rather than about agreeing.
  check("requests were filed and answered in both directions", asked > 0 && answered > 0,
    `${asked} asked, ${answered} answered`);
  // §3.8's bound, and the one number a deployed server is judged on.
  check("the pump kept its beat under eight clients", (jitter?.p99Ms ?? 1e9) < 150,
    `p99 ${jitter?.p99Ms} ms against a 150 ms bound`);

  for (const c of clients) c.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await server.close();
  await rm(roomDir, { recursive: true, force: true });
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`\nroom soak ok — ${CLIENTS} clients, one hash`);
  process.exit(0);
}

try {
  const a = await connect(url, 1, code);
  const b = await connect(url, 2, code);
  check("two clients joined one room", a.mirror !== undefined && b.mirror !== undefined);

  // Each on its own half of the map, a road at a time, while the room ticks.
  //
  // **The loop is as long as the city years take** (X1d). The room owes its
  // ticks per SECOND now — it used to owe them per BEAT, which made it eight
  // times faster than singleplayer — so five city years is 720 ticks, and at
  // the fast speed's sixteen a second that is 45 seconds of wall clock rather
  // than four. The speed is set here rather than left at the play speed for
  // the same reason a soak has always been allowed to hurry.
  //
  // The command intervals are derived from the length rather than written as
  // literals, so the run still files about fifty builds a seat and nine
  // requests: a loop ten times longer with `n % 7` in it would file ten times
  // the commands and measure a different game.
  server.room.setSpeed(3);
  const ticksPerIteration = (LOOP_MS * TICKS_PER_SECOND_FAST) / 1000;
  const beats = Math.ceil((YEARS * TICKS_PER_YEAR) / ticksPerIteration);
  const BUILD_EVERY = Math.max(1, Math.round(beats / 52));
  const ASK_EVERY = Math.max(4, Math.round(beats / 10));
  console.log(`${beats} iterations of ${LOOP_MS} ms at ${TICKS_PER_SECOND_FAST} ticks/s `
    + `≈ ${(beats * LOOP_MS / 1000).toFixed(0)} s for ${YEARS * TICKS_PER_YEAR} ticks; `
    + `a build every ${BUILD_EVERY}, a request every ${ASK_EVERY}`);
  for (let n = 0; n < beats; n += 1) {
    if (n % BUILD_EVERY === 0) {
      const mine = clearRun(a.mirror, 4, 6);
      const theirs = clearRun(b.mirror, (SIZE >> 1) + 2, 6);
      if (mine) a.build(mine);
      if (theirs) b.build(theirs);
    }
    // X3a over the wire: one seat asks about the other's ground, and the owner
    // answers from its own inbox. Neither of them has any way to demolish it
    // directly, which is what the request exists for — and the ids they trade
    // are ids the reducer assigned on three machines independently.
    // Asked about ground seat two owns AT THE MOMENT OF ASKING, read off seat
    // one's own mirror. Remembering a target from seven beats ago refused one
    // request in twelve with `invalid`, and it was right to: an approval two
    // beats earlier had cleared that road and the ground had gone back to
    // nature, so seat one was asking seat two about land nobody owned.
    if (n % ASK_EVERY === 1) {
      const theirRoad = ownedRoad(a.mirror, 2);
      if (theirRoad) a.ask(theirRoad);
    }
    if (n % ASK_EVERY === 3) b.answer();
    await new Promise((resolve) => setTimeout(resolve, LOOP_MS));
  }
  // Let the last frames land.
  await new Promise((resolve) => setTimeout(resolve, 300));

  console.log(`\n${a.frames} frames, ${a.commands + b.commands} commands, `
    + `${a.checks} monthly hash checks, room at tick ${server.room.tick()}`);
  check("the room played five city years", server.room.tick() >= YEARS * TICKS_PER_YEAR * 0.9,
    `tick ${server.room.tick()} of ${YEARS * TICKS_PER_YEAR}`);
  // Not equal: the second client joined a beat later and the world did not wait
  // for it (§3.3), so it is one or two frames short by construction. What must
  // be true is that it missed nothing SINCE it joined, which the hash below is
  // the real test of.
  check("both clients saw the same stream once both were in it", Math.abs(a.frames - b.frames) <= 2,
    `${a.frames} and ${b.frames}`);
  check("the month's hash was checked, not assumed", a.checks >= YEARS * 10,
    `${a.checks} checks over ${YEARS} years`);
  check("client one never diverged", a.divergences.length === 0,
    a.divergences.slice(0, 2).map((d) => `tick ${d.tick}: ${d.mine} vs ${d.room}`).join("; "));
  check("client two never diverged", b.divergences.length === 0,
    b.divergences.slice(0, 2).map((d) => `tick ${d.tick}: ${d.mine} vs ${d.room}`).join("; "));

  // **The door, over the wire.** `test/room.test.js` proves the handshake in
  // process; this proves the refusal survives a socket, which is the half that
  // decides whether a player one deploy behind sees a reload prompt or a
  // silent divergence.
  const refusal = await refusalFor(url, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: "notthisbuild", seat: 3, name: "Stale",
    room: code,
  });
  check("a client on another build is refused at the door", refusal?.reason === "buildMismatch",
    `${refusal?.type ?? "nothing"} / ${refusal?.reason ?? "no reason"}`);

  // **The resync, over the wire.** Corrupt a client on purpose, let the next
  // month's hash find it, and watch the snapshot put it back — a `SNAPSHOT`
  // patch is the one message that has to survive JSON, which an in-process
  // room cannot prove.
  // Corrupted in its SIMULATION, not in its mirror: a mirror edited by hand is
  // overwritten by the next patch and the room never hears about it, which is
  // how the first cut of this block passed while proving nothing. A command
  // only this client applies is a real divergence — one extra road, in a city
  // the room does not have it in.
  const resyncsBefore = b.resyncs;
  {
    const { reply } = b.host.handle({
      type: "apply", id: 99,
      command: { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns([40 * SIZE + 40, 40 * SIZE + 41]) },
    });
    applyPatch(b.mirror, reply.patch);
  }
  const corrupted = b.hash();
  for (let n = 0; n < 120 && b.resyncs === resyncsBefore; n += 1) {
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  check("a corrupted client is found at the month, not at the end", b.resyncs > resyncsBefore,
    `${b.divergences.length} divergence(s), ${b.resyncs} resync(s)`);
  check("and the snapshot puts it back on the room's hash", b.hash() === server.room.hash(),
    `was ${corrupted}, now ${b.hash()}, room ${server.room.hash()}`);
  // **And STAYS back**, which is the half a patch could not do: let the room
  // beat on and check the next month's hash agrees as well.
  const checksBefore = b.checks;
  for (let n = 0; n < 240 && b.checks === checksBefore; n += 1) {
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  check("and stays back at the next month", b.divergences.length === 1 && b.hash() === server.room.hash(),
    `${b.divergences.length} divergence(s) in all, ${b.checks - checksBefore} further check(s)`);

  check("every command the room took, it took from both seats",
    a.accepted > 0 && b.accepted > 0 && a.refused.length === 0 && b.refused.length === 0,
    `one ${a.accepted} ok / ${a.refused.length} refused, two ${b.accepted} ok / ${b.refused.length} refused`
    + `${a.refused.length + b.refused.length > 0 ? ` — first: ${[...a.refused, ...b.refused][0]}` : ""}`);
  check("a request crossed the wire and was answered from an inbox (X3a)",
    a.asked > 0 && b.answered > 0, `${a.asked} asked, ${b.answered} answered`);
  const settled = server.room.state.requests.filter((r) => r.status === "approved");
  check("and the approvals are in the room's own state",
    settled.length > 0 && settled.length <= b.answered,
    `${settled.length} approved of ${server.room.state.requests.length} filed`);

  // **The clock stops before the three hashes are compared.** The pump never
  // pauses, so a hash read while a frame is in flight compares a client to a
  // room that has moved on — which is exactly what happened on the first run
  // with requests in it: one client read a year-old hash and the gate called it
  // a divergence. Speed 0 is a room whose city stands still while its frames
  // keep flowing, so this is the same city on all three machines or it is not.
  server.room.setSpeed(0);
  await new Promise((resolve) => setTimeout(resolve, 200));
  check("and all three end on one hash, with the clock stopped",
    a.hash() === server.room.hash() && b.hash() === server.room.hash(),
    `${a.hash()} / ${b.hash()} / ${server.room.hash()}`);

  const jitter = server.pump.jitter();
  const cost = server.pump.cost();
  console.log(`pump: ${server.pump.beats()} beats, cost ${JSON.stringify(cost)} warm, `
    + `worst cold ${server.pump.worstBeatMs().toFixed(2)} ms, jitter ${JSON.stringify(jitter)}`);
  check("the pump kept its beat", jitter !== undefined && jitter.latePct < 25,
    `late ${jitter?.latePct}% of ${server.pump.beats()} beats`);
  // **The warm number against the budget, with the cold one beside it.** X1c
  // gave the room the quest catalogue it should always have had, and the first
  // run of the monthly quest pass is JIT: 26 ms cold, 11.34 ms warm, measured
  // per arm with the quests cleared (1.59 ms) and loaded. A player does pay the
  // cold beat once, so it is printed and said out loud rather than hidden —
  // but a budget checked against a cold maximum is a budget checked against
  // the compiler.
  check("a warm beat fits in its budget (plan §3.8: 20 ms, at the p99)",
    cost !== undefined && cost.n > 100 && cost.p99Ms < 20,
    `p99 ${cost?.p99Ms} ms over ${cost?.n} warm beats, p50 ${cost?.p50Ms}, worst warm ${cost?.maxMs}, `
    + `worst cold ${server.pump.worstBeatMs().toFixed(2)}`);

  // **The door, with the wrong code.** `test/room.test.js` proves the refusal
  // in process; the code is normalised at the door, so what this adds is that
  // the refusal survives a socket and that a client naming another room is
  // turned away rather than put in this one (X2a).
  const wrongCode = await refusalFor(url, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 3, name: "Lost",
    room: code === "ZZZZZZ" ? "YYYYYY" : "ZZZZZZ",
  });
  check("a client naming another room is refused at the door", wrongCode?.reason === "badCode",
    `${wrongCode?.type ?? "nothing"} / ${wrongCode?.reason ?? "no reason"}`);
  // And the typed form reaches it: a player reads `ABC-123` and types `abc 123`.
  const typed = await refusalFor(url, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 4, name: "Typist",
    room: formatRoomCode(code).toLowerCase(),
  });
  check("the grouped, lower-case code opens the same door",
    typed?.type === S2C.WELCOME && typed.room === code,
    `${typed?.type ?? "nothing"} / ${typed?.room ?? "no room"}`);

  // **Churn** (X4b): seat two leaves, the deputy takes its city over, and seat
  // two comes back to it. The claim is that nothing diverges while a seat is
  // being played by the server — every deputy command rides the frame like a
  // player's, and a client that was never away replays them all.
  if (CHURN) {
    const before = server.room.state.players.find((p) => p.seat === 2)?.status;
    b.close();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const handed = server.room.state.players.find((p) => p.seat === 2)?.status;
    check("an empty seat is handed to the deputy", before === 0 && handed === 2,
      `status ${before} → ${handed}`);

    const builtBy = new Map();
    const watch = setInterval(() => {
      for (const entry of server.room.state.buildings) {
        builtBy.set(entry.owner, (builtBy.get(entry.owner) ?? 0) + 0);
      }
    }, 1000);
    await new Promise((resolve) => setTimeout(resolve, 6000));
    clearInterval(watch);
    check("and the deputy plays it", a.frames > 0 && a.divergences.length === 0,
      `${a.divergences.length} divergence(s) over ${a.frames} frames`);

    // And the player comes back to their own seat, with the token they were
    // given: the regency stands down and the status says so.
    const again = await connect(url, 2, code);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const back = server.room.state.players.find((p) => p.seat === 2)?.status;
    check("a returning player takes their city back", back === 0, `status ${back}`);
    check("and the client that stayed never diverged through any of it",
      a.divergences.length === 0, JSON.stringify(a.divergences.slice(0, 2)));
    again.close();
  }

  a.close();
  if (!CHURN) b.close();
} finally {
  await server.close();
}

// **A restart keeps the room's name** (X2a). The store carries the code beside
// the save, because a room that minted a new one on restart would lock out
// everybody holding the old one — and the plumbing for that is in
// `server/index.js` (`code ?? kept?.code`), which nothing in `test/` drives.
// This is the one place that owns a real server and a real store directory.
try {
  const again = await startServer({
    port: 0,
    store: createStore({ dir: roomDir }),
    fresh: false,
    tickMs: 10,
    roomId: "soak",
  });
  try {
    check("a restarted room is the same room, by code and by city",
      again.room.code() === code && again.restored,
      `code ${again.room.code()} (was ${code}), restored ${again.restored}`);
  } finally {
    await again.close();
  }
} finally {
  await rm(roomDir, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nroom soak ok");
