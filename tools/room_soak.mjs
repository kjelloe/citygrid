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
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { hashState } from "../engine/state.js";
import { CMD_PLACE_ROAD, CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { C2S, S2C, PROTOCOL_VERSION } from "../shared/protocol.js";
import { buildHash } from "../shared/build-hash.js";

const YEARS = Number(process.argv[2] ?? 5);
const TICKS_PER_YEAR = 144;
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
function connect(url, seat) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const client = {
      seat, socket, host: createSimHost(), mirror: undefined,
      frames: 0, commands: 0, checks: 0, divergences: [], resyncs: 0, asked: 0, answered: 0,
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
    }));
    socket.on("error", reject);
    socket.on("message", (raw) => {
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

const server = await startServer({
  port: 0,
  store: createStore({ dir: roomDir }),
  // A fresh region every run, for the same reason.
  fresh: true,
  tickMs: 10,                     // the soak's beat; the room still owes 2 ticks a beat at speed 1
  options: { seed: 1003, width: SIZE, height: SIZE, seats: 4 },
  roomId: "soak",
});
const url = `ws://127.0.0.1:${server.port}/ws`;

try {
  const a = await connect(url, 1);
  const b = await connect(url, 2);
  check("two clients joined one room", a.mirror !== undefined && b.mirror !== undefined);

  // Each on its own half of the map, a road at a time, while the room ticks.
  const beats = Math.ceil((YEARS * TICKS_PER_YEAR) / 2);
  for (let n = 0; n < beats; n += 1) {
    if (n % 7 === 0) {
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
    if (n % 40 === 13) {
      const theirRoad = ownedRoad(a.mirror, 2);
      if (theirRoad) a.ask(theirRoad);
    }
    if (n % 40 === 27) b.answer();
    await new Promise((resolve) => setTimeout(resolve, 12));
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
  console.log(`pump: ${server.pump.beats()} beats, worst beat ${server.pump.worstBeatMs().toFixed(2)} ms, `
    + `jitter ${JSON.stringify(jitter)}`);
  check("the pump kept its beat", jitter !== undefined && jitter.latePct < 25,
    `late ${jitter?.latePct}% of ${server.pump.beats()} beats`);
  check("a beat fits in its budget (plan §3.8: 20 ms)", server.pump.worstBeatMs() < 20,
    `worst ${server.pump.worstBeatMs().toFixed(2)} ms`);

  a.close();
  b.close();
} finally {
  await server.close();
  await rm(roomDir, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nroom soak ok");
