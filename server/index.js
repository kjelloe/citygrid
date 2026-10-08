// One process: the client over HTTP and the rooms over a socket (X1).
//
//   node server/index.js [port]
//
// Descends from `../CarrierDominion/server/index.js` (one HTTP server with the
// socket attached to it, no web framework), its `static.js` (serve a directory,
// resolve the path and then check it is still inside the root — a request for
// `../../etc/passwd` resolves outside and is refused) and its `doorman.js` (a
// refusal carries a reason, and a connection that has not said HELLO may say
// nothing else). Rewritten against this game: that one hosts one war per
// process, this one hosts rooms, and its wire is snapshots while this one's is
// commands.
//
// **Nothing a player can see** (A125). There is no `?room=` in the page, no
// socket transport in the client and no lobby: this serves the singleplayer
// game exactly as `tools/serve.mjs` does, and answers `/ws` for the headless
// soak. Until Kjell has playtested, that is the whole of it.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createRoom } from "./room.js";
import { createPump } from "./pump.js";
import { createStore } from "./store.js";
import { C2S, S2C, REFUSAL, LIMITS } from "../shared/protocol.js";
import { setBuildHash } from "../shared/build-hash.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};

/** The build hash the handshake compares, read from the manifest the client
 * reads (X0). The server does the I/O the engine may not. */
async function readBuildHash() {
  try {
    const manifest = JSON.parse(await readFile(join(root, "client", "precache.json"), "utf8"));
    return setBuildHash(manifest.build);
  } catch {
    return setBuildHash("dev");
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";
  const target = join(root, normalize(path));
  // Resolved first, then checked: a path that climbs out of the root is refused
  // rather than normalised into something that looks safe.
  if (!resolve(target).startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  readFile(target).then((body) => {
    res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
    res.end(body);
  }).catch(() => res.writeHead(404).end("Not found"));
}

export async function startServer({ port = 0, options, tickMs = 100, roomId = "room", store, fresh = false } = {}) {
  await readBuildHash();
  const saves = store ?? createStore();
  // **A room survives a restart** (plan.md §3.5) — which it did not until this
  // read existed. The store wrote a checkpoint every thirty beats and nobody
  // ever opened one: "persists so a restart resumes it" was true of the writing
  // half only. `fresh: true` is the lever a test or a new region takes to
  // ignore what is on disk.
  const kept = fresh ? undefined : await saves.get(roomId);
  // The join code the room keeps: the caller's, else the one it was restored
  // with, else a fresh one. A restart that renamed the room would lock out
  // everybody holding the code (X2a).
  const wanted = code ?? kept?.code;
  // **A registry, not a room** (X2c): hosting means a player makes one, so the
  // process holds several. The one it boots with is `keep`, which is how the
  // reaper tells the process's own room from an abandoned host's.
  const rooms = createRooms({ tickMs, heldForMs, regencyAfterMs });
  const booted = kept?.save
    ? rooms.add({ save: kept.save, code: wanted, keep: true })
    : rooms.add({ options: options ?? { seed: 1003, width: 64, height: 64, seats: LIMITS.SEATS_MAX }, code: wanted, keep: true });
  if (!booted.ok) throw new Error(`the server could not start its room: ${booted.reason}`);
  const room = booted.room;
  const pump = booted.pump;

  const http = createServer(serveStatic);
  const sockets = new WebSocketServer({
    server: http,
    path: "/ws",
    // A frame larger than the biggest command there is, is not a command.
    maxPayload: LIMITS.CELLS_PER_COMMAND * 8,
  });

  const perIp = new Map();
  sockets.on("connection", (socket, request) => {
    const ip = request.socket.remoteAddress ?? "?";
    const open = (perIp.get(ip) ?? 0) + 1;
    perIp.set(ip, open);
    // A connection cap per address, which is the cheapest half of §3.5's
    // robustness and the half a single machine can actually exhaust.
    if (open > 8) {
      socket.send(JSON.stringify({ type: S2C.REFUSED, reason: REFUSAL.RATE_LIMIT }));
      socket.close();
      return;
    }

    let seat;
    const connection = { send: (message) => socket.send(JSON.stringify(message)) };
    let acted = 0;
    let second = Math.floor(Date.now() / 1000);

    socket.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      // An allowlist, before the queue: a frame whose type is not one of these
      // never reaches the room (§3.5).
      if (!Object.values(C2S).includes(message.type)) return;

      if (message.type === C2S.HELLO) {
        if (seat !== undefined) return;
        // **Which room?** The code is the door's business (X2a) and now the
        // registry's too: a code nobody is hosting is `BAD_CODE`, and it must
        // be answered before `join` is reached or there is no room to ask.
        mine = rooms.get(message.room);
        if (mine === undefined) {
          connection.send({ type: S2C.REFUSED, reason: REFUSAL.BAD_CODE });
          socket.close();
          return;
        }
        const refusal = mine.join(connection, message);
        if (refusal) { socket.close(); return; }
        seat = Number(message.seat) || 1;
        return;
      }
      if (seat === undefined) return;   // nothing before HELLO

      if (message.type === C2S.COMMAND) {
        // Per-seat rate limit as a RESULT, never a disconnect (§3.7.3).
        const now = Math.floor(Date.now() / 1000);
        if (now !== second) { second = now; acted = 0; }
        acted += 1;
        if (acted > LIMITS.COMMANDS_PER_SECOND) {
          connection.send({ type: S2C.REFUSED, reason: REFUSAL.RATE_LIMIT, soft: true });
          return;
        }
        room.submit(seat, message.command);
        return;
      }
      if (message.type === C2S.RESYNC_REQUEST) room.resync(connection, seat);
      if (message.type === C2S.LATENCY) connection.send({ type: S2C.PONG, at: message.at });
    });

    socket.on("close", () => {
      perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
      if (seat !== undefined) room.leave(seat);
    });
  });

  await new Promise((resolve) => http.listen(port, resolve));
  const stop = pump.start();

  // A checkpoint every thirty beats — three seconds at 100 ms — started and not
  // awaited, because a write that the beat waits for is a late beat.
  const checkpoint = setInterval(() => {
    saves.put(roomId, { save: room.save(), tick: room.tick() });
  }, tickMs * 30);

  // **And the rooms nobody came back to.** `prune` had no caller when it was
  // written — `keepForDays` was read, the sweep existed, and nothing ever ran
  // it, which is `setRules` with a different name (A124). Once at startup,
  // before this process writes anything of its own, and then daily for a server
  // left running.
  await saves.prune();
  const sweep = setInterval(() => { saves.prune(); }, 24 * 60 * 60 * 1000);
  sweep.unref?.();

  return {
    port: http.address().port,
    room,
    pump,
    /** Whether this room came off the disk, for a caller that wants to say so. */
    restored: kept?.save !== undefined,
    async close() {
      clearInterval(checkpoint);
      clearInterval(sweep);
      stop();
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise((resolve) => http.close(resolve));
      await saves.settled();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 8123);
  const server = await startServer({ port });
  console.log(`city grid: http://localhost:${server.port}/  (ws on /ws)`);
}
