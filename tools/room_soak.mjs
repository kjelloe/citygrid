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
import { startServer } from "../server/index.js";
import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { hashState } from "../engine/state.js";
import { CMD_PLACE_ROAD } from "../engine/commands.js";
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
      frames: 0, commands: 0, checks: 0, divergences: [], resyncs: 0,
      hash: () => (client.mirror ? hashState(client.mirror) : ""),
      send: (message) => socket.send(JSON.stringify(message)),
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

const server = await startServer({
  port: 0,
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
      const row = 4 + ((n / 7) | 0) % 14;
      a.build(Array.from({ length: 6 }, (unused, i) => row * SIZE + 4 + i));
      b.build(Array.from({ length: 6 }, (unused, i) => (row + 20) * SIZE + 4 + i));
    }
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
  check("and both end on the room's hash", a.hash() === server.room.hash() && b.hash() === server.room.hash(),
    `${a.hash()} / ${b.hash()} / ${server.room.hash()}`);

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
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nroom soak ok");
