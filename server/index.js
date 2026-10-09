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
import { createRooms } from "./rooms.js";
import { loadServerContent } from "./content.js";
import { chatFrom, CHATS_PER_SECOND } from "./chat.js";
import { formatRoomCode } from "../shared/roomcode.js";
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

export async function startServer({
  port = 0, options, tickMs = 100, roomId = "room", store, fresh = false, code,
  heldForMs, regencyAfterMs,
} = {}) {
  await readBuildHash();
  // **Before the room is generated** (X1c): `generateWorld` reads `rules()`,
  // and a room built from the engine's mirror with no quests in it cannot agree
  // with a browser that loaded `data/` — quest progress is hashed state.
  await loadServerContent();
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
    // Big enough for the biggest MESSAGE, which since X2d is a `CREATE`
    // carrying a saved city — not the biggest command. See `LIMITS` for the
    // measurement; the old ceiling was 32 KB and a 48x48 save is 14, a 128x128
    // is 89.
    maxPayload: LIMITS.MESSAGE_BYTES,
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
    /** Which room this socket belongs to, decided at the door by the code in
     * its `HELLO` or made for it by a `CREATE`. Undefined until then, which is
     * why nothing but those two messages is accepted first. */
    let mine;
    /** The seat the DOOR gave, read off the WELCOME on its way out. Since X2b a
     * hello may name no seat and the room picks the lowest free one, so the
     * server cannot know it from the message it received — and `room.seats()`
     * deliberately does not hand out connections. */
    let gave;
    let watching = false;
    const connection = {
      send(message) {
        if (message.type === S2C.WELCOME) gave = Number(message.seat) || undefined;
        socket.send(JSON.stringify(message));
      },
      /** For the one message that ends a session rather than answering it
       * (X2d's kick). The room has no socket and should not grow one. */
      close() { socket.close(); },
    };
    let acted = 0;
    let second = Math.floor(Date.now() / 1000);
    let said = 0;
    let chatSecond = second;

    socket.on("message", (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      // An allowlist, before the queue: a frame whose type is not one of these
      // never reaches the room (§3.5).
      if (!Object.values(C2S).includes(message.type)) return;

      // **Hosting** (X2c). The one message that arrives with no room: the
      // server makes one from the options, registers it by its code, and then
      // the same socket joins it — so the client's answer is the `WELCOME` of
      // the room it just made and there is no second message to invent.
      if (message.type === C2S.CREATE) {
        if (seat !== undefined) return;
        // **Options OR a save** (X2d). `createRoom` has taken `{ save }` since
        // X1a — "hosting from a save is §3.3's the world never pauses, seen
        // from the other end" — and the door dropped it on the floor, so the
        // only way to host a city that already existed was to have the server
        // boot with it. One field, and the half that was missing was this line.
        const made = rooms.add(message.save === undefined
          ? { options: message.options }
          : { save: message.save });
        if (!made.ok) {
          connection.send({ type: S2C.REFUSED, reason: made.reason });
          socket.close();
          return;
        }
        rooms.start();
        mine = made.room;
        const refusal = mine.join(connection, { ...message, type: C2S.HELLO, room: mine.code() });
        if (refusal) { socket.close(); return; }
        seat = gave;
        return;
      }
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
        // A watcher is welcomed with seat 0 (X4e) and `gave` is therefore
        // undefined, which is exactly right: everything below this line is
        // gated on having a seat, so a watcher reaches none of it.
        watching = message.spectate === true;
        seat = gave;
        return;
      }
      if (seat === undefined || mine === undefined) return;   // nothing before the door

      if (message.type === C2S.COMMAND) {
        // Per-seat rate limit as a RESULT, never a disconnect (§3.7.3).
        const now = Math.floor(Date.now() / 1000);
        if (now !== second) { second = now; acted = 0; }
        acted += 1;
        if (acted > LIMITS.COMMANDS_PER_SECOND) {
          connection.send({ type: S2C.REFUSED, reason: REFUSAL.RATE_LIMIT, soft: true });
          return;
        }
        mine.submit(seat, message.command);
        return;
      }
      // **The room's clock** (X2d). Only the host's, and `room.setSpeed` is what
      // enforces that — the check lives with the state it protects, not at the
      // door, so a later caller cannot route around it (the `submit` rule).
      // A watcher has no seat and reaches none of this.
      if (message.type === C2S.SPEED) {
        if (watching) return;
        mine.setSpeed(Number(message.speed), seat);
        return;
      }
      // **The host removes a seat** (X2d). The room decides and frees the
      // chair; the door is the only thing holding the socket, so closing it is
      // the door's half — and `kick` hands the connection back for exactly
      // that, rather than the room reaching for a socket it does not have.
      if (message.type === C2S.KICK) {
        if (watching) return;
        const gone = mine.kick(Number(message.seat), seat);
        gone?.close?.();
        return;
      }
      // **Chat** (X3b). Not a command: it never reaches the reducer, so a line
      // cannot desync a city and a client that misses one has not diverged. Its
      // own rate budget, because a player who talks a lot must not lose the
      // ability to build — or the other way round.
      if (message.type === C2S.CHAT) {
        const now = Math.floor(Date.now() / 1000);
        if (now !== chatSecond) { chatSecond = now; said = 0; }
        said += 1;
        if (said > CHATS_PER_SECOND) return;
        const line = chatFrom(mine.state, seat, message.text);
        if (!line.ok) return;
        mine.broadcast({ type: S2C.CHAT, seat: line.seat, text: line.text });
        return;
      }
      if (message.type === C2S.RESYNC_REQUEST) mine.resync(connection, seat);
      if (message.type === C2S.LATENCY) connection.send({ type: S2C.PONG, at: message.at });
    });

    // **A bad frame must not end the room** (X2d). `ws` emits `error` on the
    // socket for a frame over `maxPayload` (close code 1009) and for a
    // malformed one — and an `error` event with no listener is an UNCAUGHT
    // EXCEPTION in node, so the whole server died. One client sending something
    // large could take down everybody else's city, which is a denial of
    // service with no attacker required: it is how this was found, by a gate
    // trying to host a saved city over a 32 KB ceiling.
    //
    // The socket is closed and the seat left through the handler below, like
    // any other disconnection. Nothing is told to the client, because by the
    // time `ws` raises this the frame is already refused and the connection is
    // going.
    socket.on("error", (error) => {
      console.warn(`a socket failed and was closed: ${String(error?.message ?? error)}`);
      socket.close();
    });

    socket.on("close", () => {
      perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
      if (watching) mine?.stopWatching(connection);
      else if (seat !== undefined) mine?.leave(seat);
    });
  });

  await new Promise((resolve) => http.listen(port, resolve));
  rooms.start();

  // A checkpoint every thirty beats — three seconds at 100 ms — started and not
  // awaited, because a write that the beat waits for is a late beat.
  //
  // **Every room, not just the one this process booted with** (X2c): a hosted
  // room that cannot survive a restart is a room whose players lose their city
  // to a deploy. The process's own room keeps its `roomId` key so `fresh` and
  // the restore path are unchanged; a hosted one is keyed by its code, which is
  // the only name anybody has for it.
  const checkpoint = setInterval(() => {
    for (const { room: each } of rooms.all()) {
      const key = each === room ? roomId : each.code();
      saves.put(key, { save: each.save(), tick: each.tick(), code: each.code() });
    }
  }, tickMs * 30);

  // **And rooms everybody has left** (X2c). A pump beating a city with no
  // audience is a core spent on nothing; five minutes of emptiness is long
  // enough for a reconnect. The process's own room is `keep` and never reaped.
  const reaper = setInterval(() => { rooms.reapEmpty(); }, 60 * 1000);
  reaper.unref?.();

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
    /** The room this process booted with. Hosted rooms are reached through
     * `rooms`, by the code their host was given. */
    room,
    pump,
    rooms,
    /** Whether this room came off the disk, for a caller that wants to say so. */
    restored: kept?.save !== undefined,
    async close() {
      clearInterval(checkpoint);
      clearInterval(sweep);
      clearInterval(reaper);
      rooms.stop();
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
  console.log(`room code: ${formatRoomCode(server.room.code())}`);
}
