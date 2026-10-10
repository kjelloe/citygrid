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
// **Everything a player can see** (A131, 2026-10-07, which lifted A125's hold).
// The page has a lobby that hosts and joins, `?join=CODE` opens the door, and
// the client has a socket transport — so this is the whole game over HTTP and
// the rooms over `/ws`, not a static server with a soak endpoint attached.
// Ruling 003 is unmoved: singleplayer opens no socket at all, and
// `offline_smoke` asserts it.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createRooms } from "./rooms.js";
import { loadServerContent } from "./content.js";
import { chatFrom, CHATS_PER_SECOND } from "./chat.js";
import { formatRoomCode } from "../shared/roomcode.js";
import { createStore } from "./store.js";
import { C2S, S2C, REFUSAL, LIMITS } from "../shared/protocol.js";
import { setBuildHash, buildHash } from "../shared/build-hash.js";
import { serverConfig, originAllowed, clientAddress } from "./config.js";
import { makeStatic } from "./static.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
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

export async function startServer({
  port, host, options, tickMs = 100, roomId = "room", store, fresh = false, code,
  heldForMs, regencyAfterMs, env = {},
} = {}) {
  // **The environment, through one pure module** (M12, `server/config.js`): the
  // port, the bind address, where the rooms live, how long they are kept,
  // whether a proxy's forwarded address may be believed, and which origins may
  // open a socket. A caller's explicit `port`/`host` still wins, which is what
  // every gate in this project passes (`port: 0` for an ephemeral one).
  const config = serverConfig(env);
  const bind = host ?? config.host;
  const listenPort = port === undefined ? config.port : port;
  const startedAt = Date.now();
  await readBuildHash();
  // **Before the room is generated** (X1c): `generateWorld` reads `rules()`,
  // and a room built from the engine's mirror with no quests in it cannot agree
  // with a browser that loaded `data/` — quest progress is hashed state.
  await loadServerContent();
  const saves = store ?? createStore({ dir: config.roomsDir, keepForDays: config.keepForDays });
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
  // The store goes to the registry too (X4f): the reaper writes a room out
  // before it drops it, and the door reads one back when somebody types a code
  // this process is not holding.
  const rooms = createRooms({ tickMs, heldForMs, regencyAfterMs, store: saves });
  // **The codes asleep on the disk, claimed once** (A143). A new room can never
  // be minted onto a hibernated one's code, and the door stays synchronous
  // because this is the only read — see `freeCode()` in `server/rooms.js`.
  rooms.claimCodes(await saves.codes());
  const booted = kept?.save
    ? rooms.add({ save: kept.save, code: wanted, keep: true })
    : rooms.add({ options: options ?? { seed: 1003, width: 64, height: 64, seats: LIMITS.SEATS_MAX }, code: wanted, keep: true });
  if (!booted.ok) throw new Error(`the server could not start its room: ${booted.reason}`);
  const room = booted.room;
  const pump = booted.pump;

  /**
   * What the unit, nginx and a person read (`/health` and `/healthz`, M12).
   *
   * The shared box caps this process's memory, so `rssMb` is here for the
   * reason `../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md` gives:
   * a sweep should see the climb before the OOM reaper acts. The pump's jitter
   * is here because a restart policy needs something to read, and `desyncs` is
   * the one number that must be zero — a room whose clients disagree is the
   * failure this whole wave is built to make visible.
   */
  function health() {
    const rooms_ = rooms.all();
    const beats = rooms_.map(({ pump: each }) => each.jitter()).filter(Boolean);
    const worst = (key) => (beats.length === 0 ? undefined : Math.max(...beats.map((j) => j[key])));
    return {
      ok: true,
      build: buildHash(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      rooms: rooms_.length,
      seats: rooms_.reduce((n, { room: each }) => n + each.seats().length, 0),
      // The worst room's jitter, not an average over rooms: one city stalling
      // is the thing worth seeing, and averaging it away is how a stall hides.
      jitter: beats.length === 0 ? undefined : { p50Ms: worst("p50Ms"), p99Ms: worst("p99Ms"), maxMs: worst("maxMs") },
      // **Not "desyncs"** — the monthly hash is compared on the CLIENT, which is
      // the only place that holds both numbers, so the server cannot count
      // them. A resync request is what a client sends when it finds one, which
      // is the server-side shadow of the same event and the number a sweep can
      // actually read. It must be 0.
      resyncs: rooms_.reduce((n, { room: each }) => n + each.resyncs(), 0),
    };
  }

  const http = createServer(makeStatic({ health }));
  const sockets = new WebSocketServer({
    server: http,
    path: "/ws",
    // Big enough for the biggest MESSAGE, which since X2d is a `CREATE`
    // carrying a saved city — not the biggest command. See `LIMITS` for the
    // measurement; the old ceiling was 32 KB and a 48x48 save is 14, a 128x128
    // is 89.
    maxPayload: LIMITS.MESSAGE_BYTES,
    /**
     * **The Origin check** (M12). The browser's same-origin policy does NOT
     * apply to `new WebSocket(...)`: without this, a page the player merely
     * visits can open a socket into their room and play as them, and there is
     * no cookie to be missing because a room needs none. `server/config.js`
     * owns the rule — no origin is allowed (every gate here is a script), an
     * exact `ALLOWED_ORIGINS` entry is allowed, and otherwise the origin's host
     * must equal the request's.
     */
    verifyClient({ origin, req }, done) {
      if (originAllowed(origin, config, req.headers.host)) return done(true);
      // 403 rather than a silent drop: a developer with a reverse proxy and no
      // `ALLOWED_ORIGINS` needs to be able to tell this from a crash.
      console.warn(`refused a socket from origin ${origin} (host ${req.headers.host})`);
      return done(false, 403, "origin not allowed");
    },
  });

  const perIp = new Map();
  sockets.on("connection", (socket, request) => {
    // The forwarded address only when a proxy put it there (M12): behind nginx
    // every socket's `remoteAddress` is 127.0.0.1, so without `TRUST_PROXY=1`
    // the per-address cap would count the whole internet as one client — and
    // WITH it believed unconditionally, anybody could set the header and have
    // their own.
    const ip = clientAddress(request, config);
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

    /** True from the moment a HELLO is accepted until its room is open. See the
     * HELLO branch: `seat` cannot carry this, because it is only set once the
     * room has answered and the read in between is a turn of the event loop. */
    let entering = false;

    /** The door, once it may have to wait (X4f). Everything here was inline
     * until the room could be on the disk. */
    async function enter(message) {
      mine = await rooms.wake(message.room);
      if (mine === undefined) {
        connection.send({ type: S2C.REFUSED, reason: REFUSAL.BAD_CODE });
        socket.close();
        return;
      }
      // The socket may have gone while the disk was being read — a player who
      // gave up, or a tunnel. Joining then would seat a connection nobody is
      // on the other end of, and the seat would be held for `heldForMs`.
      if (socket.readyState !== socket.OPEN) return;
      const refusal = mine.join(connection, message);
      if (refusal) { socket.close(); return; }
      // A watcher is welcomed with seat 0 (X4e) and `gave` is therefore
      // undefined, which is exactly right: everything gated on having a seat
      // is reached by nothing a watcher sends.
      watching = message.spectate === true;
      seat = gave;
    }

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
        if (seat !== undefined || entering) return;
        // **Options OR a save** (X2d). `createRoom` has taken `{ save }` since
        // X1a — "hosting from a save is §3.3's the world never pauses, seen
        // from the other end" — and the door dropped it on the floor, so the
        // only way to host a city that already existed was to have the server
        // boot with it. One field, and the half that was missing was this line.
        // **A hosted room has not started** (X2d). The process's own room plays
        // at once — `room_soak` and the restored room both depend on it — and a
        // room a player made for friends who have not arrived holds its clock
        // until the host presses Start, or the city is twelve years old before
        // the second person types the code.
        const made = rooms.add({
          ...(message.save === undefined ? { options: message.options } : { save: message.save }),
          started: false,
        });
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
        if (seat !== undefined || entering) return;
        // **Which room?** The code is the door's business (X2a) and now the
        // registry's too: a code nobody is hosting is `BAD_CODE`, and it must
        // be answered before `join` is reached or there is no room to ask.
        //
        // **And it may be on the disk** (X4f), which is why this one branch
        // waits: a room everybody left is dropped after five minutes and its
        // city is in a file, so the code is good and the answer takes a read.
        // `entering` is set here, synchronously, because `seat` cannot be — two
        // HELLOs in the same tick would both pass the guard above and the
        // second would join a room the first is still opening.
        entering = true;
        enter(message).finally(() => { entering = false; });
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
      // **A seat says it is ready, and the host starts the room** (X2d). Not
      // commands: nothing about who has pressed a button belongs in a city's
      // replay, so both ride the frame the way `speed` and `host` do.
      if (message.type === C2S.READY) {
        if (watching) return;
        mine.setReady(seat, message.ready === true);
        return;
      }
      if (message.type === C2S.START) {
        if (watching) return;
        mine.start(seat);
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

  // **The bind address is the rule, not the port** (M12). Under
  // `NODE_ENV=production` it is loopback unless `HOST` says otherwise, because
  // a `0.0.0.0` bind on a shared box exposes the raw port through the firewall
  // and bypasses TLS entirely — the one mistake in the sibling's dos-and-donts
  // that cannot be undone by a later nginx edit.
  await new Promise((resolve) => http.listen(listenPort, bind, resolve));
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
    host: bind,
    config,
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
  // `argv[2]` still wins, because `run.sh` has taken a port there since slice 0
  // and `./run.sh 8200` is in every document. Everything else comes from the
  // environment, which is what a systemd unit can set.
  const server = await startServer({
    port: process.argv[2] ? Number(process.argv[2]) : undefined,
    env: process.env,
  });
  console.log(`city grid: http://${server.host}:${server.port}/  (ws on /ws, health on /healthz)`);
  console.log(`room code: ${formatRoomCode(server.room.code())}`);
  console.log(`rooms: ${server.config.roomsDir}, kept ${server.config.keepForDays} days`
    + `${server.config.trustProxy ? ", trusting X-Forwarded-For" : ""}`);
}
