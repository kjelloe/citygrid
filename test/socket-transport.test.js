// The client half of a room, without a socket (X1c, slice 5.1).
//
// `client/transport/socket.js` is the third transport. The first two answer
// their own caller: a worker and the echo stub both compute the reply to the
// message they were handed. A ROOM does not — it sequences a command among
// other seats' and broadcasts one frame, so the reply to my command arrives in
// the same message as somebody else's, and a frame carrying only their command
// has no promise waiting for it at all. That is why the contract grew
// `onMessage` (the X1 review, item 1).
//
// **Three plants, and two of them changed the code rather than the test.**
//   - *A local apply at post time* — the optimistic client this file exists to
//     forbid. It survived the first version of the test, because the WELCOME's
//     save has no player 1 in it (a seat joining is a COMMAND and arrives in
//     the next frame), so the reducer answered `invalid` and the city did not
//     move whatever the transport did. `connected()` now settles both seats
//     first, and the plant fires on the assertion whose name forbids it.
//   - *Matching a frame to a pending post by seat alone* — a frame carries
//     commands for my seat that I never posted, starting with my own
//     `CMD_JOIN`, and the first cut resolved a build with the result of the
//     join beside it. Caught here, not reasoned about.
//   - *Comparing commands by reference* — the fake socket serialises, as a real
//     one does, so a drag-painted road's `runs` is a different array with the
//     same numbers. Every road command hung for ever and the test timed out.
//
// What is asserted here is everything that does not need a wire: the handshake,
// that a command is applied when the ROOM says so and not when it is sent, the
// FIFO matching of frames to pending posts, the pushed path, the resync, and the
// refusals. The socket is injected, which is the lever that makes all of that
// node-testable — the real one is `tools/room_soak.mjs`'s and the browser
// gate's business.

import test from "node:test";
import assert from "node:assert/strict";
import { createSocketTransport } from "../client/transport/socket.js";
import { C2S, S2C, REFUSAL, RESULT, PROTOCOL_VERSION } from "../shared/protocol.js";
import { buildHash } from "../shared/build-hash.js";
import { createRoom } from "../server/room.js";
import { CMD_PLACE_ROAD, CMD_SET_TAX } from "../engine/commands.js";
import { encodeRuns } from "../shared/grid.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const OPTIONS = { seed: 31, width: 48, height: 48, seats: 2 };

/** A socket that goes nowhere: it records what was sent and lets the test push
 * whatever a room would have pushed. The shape is the browser's — `send`,
 * `close`, `onopen`/`onmessage`/`onclose`/`onerror` — because that is what the
 * real one will be. */
function fakeSocket() {
  const sent = [];
  const socket = {
    sent,
    readyState: 0,
    onopen: undefined, onmessage: undefined, onclose: undefined, onerror: undefined,
    send(text) { sent.push(JSON.parse(text)); },
    close() { socket.readyState = 3; socket.onclose?.({}); },
    /** The room speaking. */
    push(message) { socket.onmessage?.({ data: JSON.stringify(message) }); },
    open() { socket.readyState = 1; socket.onopen?.({}); },
    last(type) { return [...sent].reverse().find((m) => m.type === type); },
    of(type) { return sent.filter((m) => m.type === type); },
  };
  return socket;
}

/** A road the city will actually accept, found by ASKING it (the same helper
 * `test/room.test.js` has, and for the same reason: three of the first four
 * coordinates picked by hand on this seed were water or rock, and a test whose
 * subject is "two commands interleave" must not fail because one of them was
 * refused for a reason of its own). */
function road(room, actor, row, length = 6) {
  const state = room.state;
  const W = state.width;
  for (let z = row; z < state.height - 2; z += 1) {
    for (let x = 2; x + length < W - 2; x += 1) {
      const cells = Array.from({ length }, (unused, i) => z * W + x + i);
      const clear = cells.every((i) => state.tiles.terrain[i] !== 3 && state.tiles.terrain[i] !== 4
        && state.tiles.road[i] === 0 && state.tiles.buildingId[i] === 0);
      if (clear) return { type: CMD_PLACE_ROAD, actor, runs: encodeRuns(cells) };
    }
  }
  throw new Error("no dry ground on this map");
}

/** A real room, used as the thing that decides what a frame looks like — a
 * fake frame shape is a test that passes against a wire nobody has. */
function roomAndTransport(opts = {}) {
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  const socket = fakeSocket();
  const transport = createSocketTransport("ws://nowhere/ws", {
    room: room.code(), seat: 1, name: "One", ...opts,
  }, { connect: () => socket });
  return { room, socket, transport };
}

/** The room's own WELCOME, so the handshake under test is the one that ships. */
function welcomeFrom(room, seat = 1) {
  const messages = [];
  room.join({ send: (m) => messages.push(m) }, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat, room: room.code(),
  });
  return messages.find((m) => m.type === S2C.WELCOME);
}

/** A transport that has joined, with **both seats settled on both sides**.
 *
 * Why this is a helper and not three lines in each test: a seat joining is a
 * COMMAND (X1), so the WELCOME's save does NOT contain the joiner — the
 * `CMD_JOIN` is queued and arrives in the next frame. A test that posts a
 * command before that frame posts it into a city with no player 1 in it, where
 * the reducer answers `invalid` and **every assertion about whether the city
 * moved passes whatever the transport does**. That is how an optimistic-apply
 * plant survived the test whose name forbids it. So: join, let the room beat,
 * play the frame, and only then measure. */
async function connected(opts = {}) {
  const { room, socket, transport } = roomAndTransport(opts);
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push(welcomeFrom(room, 1));
  // Seat two is in the room too, so a frame can carry somebody else's command.
  room.join({ send: () => {} }, {
    type: C2S.HELLO, version: PROTOCOL_VERSION, build: buildHash(), seat: 2, room: room.code(),
  });
  await ready;
  socket.push(room.beat());
  assert.equal(transport.hash(), room.hash(), "the arms do not start level");
  assert.equal(transport.pending, 0, "a post was outstanding before the test began");
  return { room, socket, transport };
}

test("the handshake: HELLO on open, and init resolves on WELCOME", async () => {
  const { room, socket, transport } = roomAndTransport();
  const ready = transport.post({ type: "init" });
  socket.open();
  const hello = socket.last(C2S.HELLO);
  assert.equal(hello.type, C2S.HELLO);
  assert.equal(hello.room, "ABC123", "the hello does not name the room");
  assert.equal(hello.version, PROTOCOL_VERSION);
  assert.equal(hello.build, buildHash(), "the door compares build hashes and this one sent none");
  assert.equal(hello.seat, 1);

  socket.push(welcomeFrom(room));
  const reply = await ready;
  assert.equal(reply.type, "ready");
  assert.ok(reply.patch, "a joiner with no patch has no city to draw");
  assert.equal(reply.tick, room.tick(), "the joiner starts at a different tick from the room");
  assert.equal(transport.seat, 1);
  transport.dispose();
});

test("nothing is sent before the socket opens, and nothing before WELCOME", async () => {
  const { socket, transport } = roomAndTransport();
  const joining = transport.post({ type: "init" });
  assert.deepEqual(socket.sent, [], "a hello went out before the socket was open");
  socket.open();
  assert.equal(socket.of(C2S.HELLO).length, 1);
  // A command posted while the door is still shut waits for it rather than
  // being dropped: the lobby's first build can land in the same breath as the
  // join, and a transport that threw there would be a race nobody could see.
  const held = transport.post({ type: "apply", command: { type: CMD_SET_TAX, actor: 1, rate: 9 } });
  assert.equal(socket.of(C2S.COMMAND).length, 0, "a command was sent before the room welcomed us");
  assert.equal(transport.pending, 1, "a held command is not pending");

  // And a transport that goes away REJECTS what it was holding. A promise that
  // never settles is a game that quietly stops responding (the worker
  // transport's lesson) — and the first run of this file proved the point by
  // raising it as an unhandled rejection instead of a failure.
  transport.dispose();
  socket.close();
  await assert.rejects(held, /closed/);
  // The join itself too: a transport disposed at the door has not joined, and a
  // caller waiting on it has to be told rather than left.
  await assert.rejects(joining, /closed/);
});

test("a command is applied when the ROOM says so, not when it is sent", async () => {
  const { room, socket, transport } = await connected();
  const before = transport.hash();
  const command = { type: CMD_SET_TAX, actor: 1, rate: 9 };
  const posted = transport.post({ type: "apply", command });
  assert.equal(socket.last(C2S.COMMAND)?.command.type, CMD_SET_TAX);
  // **This is the whole point.** The city has not moved: the room has not
  // spoken. A client that applied its own command here would be a city ahead of
  // every other seat, and the hash check would find it a month later.
  assert.equal(transport.hash(), before, "the client applied its own command optimistically");

  room.submit(1, command);
  socket.push(room.beat());
  const reply = await posted;
  assert.equal(reply.result, RESULT.OK);
  assert.ok(reply.patch, "the frame that answered carried no patch");
  assert.notEqual(transport.hash(), before, "the room spoke and the city did not move");
  transport.dispose();
});

test("another seat's command arrives with no promise, and is pushed", async () => {
  const { room, socket, transport } = await connected();
  const pushed = [];
  transport.onMessage((message) => pushed.push(message));

  // Seat two builds; seat one hears about it in a frame it did not ask for.
  room.submit(2, road(room, 2, 6));
  const before = transport.hash();
  socket.push(room.beat());

  assert.equal(pushed.length, 1, `${pushed.length} pushed messages, expected one`);
  assert.ok(pushed[0].patch, "a pushed frame with no patch cannot change the mirror");
  assert.notEqual(transport.hash(), before, "the other seat's command did not reach this city");
  assert.equal(transport.hash(), room.hash(), "the two cities disagree after one command");
  transport.dispose();
});

test("frames match pending posts in order, one seat, two commands in one beat", async () => {
  const { room, socket, transport } = await connected();
  // Two of mine and one of somebody else's, sequenced into ONE frame. The
  // client knows no `seq` when it sends, so the match is FIFO per seat — and
  // this is the case that tells FIFO from "the first command in the frame".
  const first = { type: CMD_SET_TAX, actor: 1, rate: 8 };
  const second = road(room, 1, 10);
  const a = transport.post({ type: "apply", command: first });
  const b = transport.post({ type: "apply", command: second });
  room.submit(2, road(room, 2, 20));
  room.submit(1, first);
  room.submit(1, second);
  socket.push(room.beat());

  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.result, RESULT.OK);
  assert.equal(rb.result, RESULT.OK);
  assert.equal(transport.pending, 0, `${transport.pending} posts never settled`);
  assert.equal(transport.hash(), room.hash(), "one frame, three commands, two different cities");
  transport.dispose();
});

test("the room's clock is the only clock: a tick post does not tick", async () => {
  const { room, socket, transport } = await connected();
  const before = transport.tick();
  const reply = await transport.post({ type: "tick", count: 5 });
  assert.equal(transport.tick(), before, "the client ticked its own city in a room");
  assert.equal(reply.result, RESULT.OK, "a tick post is a no-op, not a failure");

  // What DOES move it is the frame's own count (plan.md §3.6). `beat(500)` is
  // half a second, which at two ticks a second is exactly one tick — since X1d
  // the room owes its ticks per SECOND, so a beat told nothing about the clock
  // owes nothing and this asserted that a frame moved the client's city.
  room.setSpeed(1);
  socket.push(room.beat(500));
  assert.ok(transport.tick() > before, "the frame's ticks did not reach the client");
  assert.equal(transport.tick(), room.tick(), "the client's clock is not the room's");
  transport.dispose();
});

test("a refusal at the door rejects the join, with the reason the player must read", async () => {
  const { socket, transport } = roomAndTransport();
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push({ type: S2C.REFUSED, reason: REFUSAL.BUILD_MISMATCH });
  await assert.rejects(ready, (error) => {
    assert.equal(error.refusal, REFUSAL.BUILD_MISMATCH,
      "the reason has to survive as a CODE: the page shows `refused.buildMismatch`, not a sentence");
    return true;
  });
  transport.dispose();
});

test("a soft refusal is a result for one command, not the end of the room", async () => {
  const { socket, transport } = await connected();
  // The rate limit is a RESULT by design (§3.7.3): never a disconnect, because
  // a player who clicks too fast has not done anything wrong.
  const posted = transport.post({ type: "apply", command: { type: CMD_SET_TAX, actor: 1, rate: 7 } });
  socket.push({ type: S2C.REFUSED, reason: REFUSAL.RATE_LIMIT, soft: true });
  const reply = await posted;
  assert.equal(reply.result, RESULT.RATE_LIMITED);
  assert.equal(transport.closed, false, "a soft refusal closed the room");
  transport.dispose();
});

test("a SNAPSHOT restarts the reducer, which is what a resync is", async () => {
  const { room, socket, transport } = await connected();
  const pushed = [];
  transport.onMessage((message) => pushed.push(message));

  // Drive the ROOM away from the client, then hand the client the room's bytes.
  room.submit(2, road(room, 2, 14));
  room.beat();                                  // not pushed: the client misses it
  assert.notEqual(transport.hash(), room.hash(), "the arms were never made to differ");

  socket.push({ type: S2C.SNAPSHOT, seat: 1, tick: room.tick(), hash: room.hash(), save: room.save() });
  assert.equal(transport.hash(), room.hash(), "the snapshot did not heal the client");
  // A full patch, not a difference: the mirror is rebuilt from the new city
  // (`a resync must restart the reducer`).
  assert.ok(pushed.at(-1)?.patch, "the resync pushed no patch");
  assert.equal(pushed.at(-1).resynced, true, "a resync that does not say so is a silent one");
  transport.dispose();
});

test("a client that has diverged can ASK to be put back (X1c, the omissions round)", async () => {
  // The gap this closes: `server/index.js` has handled `C2S.RESYNC_REQUEST`
  // since X1a and the transport has handled `S2C.SNAPSHOT` since X1c, and
  // **nothing in the page connected the two** — the session's desync detector
  // printed `DESYNC` to the console and left the client wrong for ever. A
  // capability with no control, found by sweeping the protocol for messages
  // with no sender: `tools/room_soak.mjs` was the only thing that had ever sent
  // one, which is why the wire looked finished.
  const { room, socket, transport } = await connected();
  const before = socket.of(C2S.RESYNC_REQUEST).length;
  transport.resync();
  assert.equal(socket.of(C2S.RESYNC_REQUEST).length, before + 1,
    "asking for a resync sent nothing");

  // And the answer heals it, which is the half that already worked.
  room.submit(2, road(room, 2, 24));
  room.beat(100);                                  // not pushed: the client misses it
  assert.notEqual(transport.hash(), room.hash());
  socket.push({ type: S2C.SNAPSHOT, seat: 1, tick: room.tick(), hash: room.hash(), save: room.save() });
  assert.equal(transport.hash(), room.hash(), "the answer to the ask did not heal the client");
  transport.dispose();
});

test("hosting sends CREATE with the options, and joins the room it made (X2c)", async () => {
  // The one message that arrives with no room (X2c). Everything after it is the
  // same path a joiner takes — the answer is the `WELCOME` of the room the
  // server just made — which is why there is no second message to invent and no
  // second code path in this file.
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  const socket = fakeSocket();
  const options = { seed: 77, width: 48, height: 48, seats: 4 };
  const transport = createSocketTransport("ws://nowhere/ws", {
    create: options, name: "Host",
  }, { connect: () => socket });

  const ready = transport.post({ type: "init" });
  socket.open();
  const made = socket.last(C2S.CREATE);
  assert.ok(made, "hosting sent no CREATE");
  assert.equal(socket.of(C2S.HELLO).length, 0, "hosting sent a HELLO as well, to a room with no code");
  assert.deepEqual(made.options, options, "the room would be generated from different options");
  assert.equal(made.version, PROTOCOL_VERSION);
  assert.equal(made.build, buildHash());
  assert.equal(made.name, "Host");
  assert.equal(made.room, undefined, "a CREATE named a room, which cannot exist yet");

  // And the welcome tells it which room it is now in — the only way the host
  // learns the code it has to read out.
  socket.push(welcomeFrom(room));
  const reply = await ready;
  assert.equal(reply.type, "ready");
  assert.equal(transport.room, "ABC123", "the host does not know its own room's code");
  assert.ok(reply.patch, "the host has no city to draw");
  transport.dispose();
});

test("a refused CREATE says why, rather than dropping the host (X2c)", async () => {
  // A server already holding its limit answers `RATE_LIMIT` — the player did
  // nothing wrong and later is the right advice. It has to arrive as a code the
  // page can turn into a sentence, like every other refusal (X1b).
  const socket = fakeSocket();
  const transport = createSocketTransport("ws://nowhere/ws", {
    create: { seed: 1, width: 48, height: 48, seats: 2 },
  }, { connect: () => socket });
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push({ type: S2C.REFUSED, reason: REFUSAL.RATE_LIMIT });
  await assert.rejects(ready, (error) => {
    assert.equal(error.refusal, REFUSAL.RATE_LIMIT);
    return true;
  });
  transport.dispose();
});

test("the seat's token is remembered, and offered next time (X4a)", async () => {
  // A seat somebody left is theirs for a grace window and the token is what
  // proves it (X4a). The token has been in every WELCOME since X1a and the page
  // threw it away, so a player who reloaded came back as a stranger to their
  // own city — and with the hold in place they would now be refused their own
  // seat rather than given it to somebody else, which is a better failure and
  // still a failure.
  //
  // Per TAB, not per browser: two tabs are two players, and a token shared
  // between them would be two clients claiming one seat.
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
  };
  const first = fakeSocket();
  const a = createSocketTransport("ws://nowhere/ws", { room: "ABC123", seat: 1 },
    { connect: () => first, storage });
  const ready = a.post({ type: "init" });
  first.open();
  assert.equal(first.last(C2S.HELLO)?.token, undefined, "a first join offered a token from nowhere");
  first.push(welcomeFrom(room, 1));
  await ready;
  const token = [...store.values()][0];
  assert.ok(token?.length > 0, `nothing was remembered: ${JSON.stringify([...store])}`);
  a.dispose();

  // The same tab comes back to the same room.
  const second = fakeSocket();
  const b = createSocketTransport("ws://nowhere/ws", { room: "ABC123", seat: 1 },
    { connect: () => second, storage });
  b.post({ type: "init" }).catch(() => {});
  second.open();
  assert.equal(second.last(C2S.HELLO)?.token, token, "the remembered token was not offered");

  // A DIFFERENT room gets nothing: a token is one room's and offering it
  // elsewhere would be a claim on a seat in a city this tab has never seen.
  const third = fakeSocket();
  const c = createSocketTransport("ws://nowhere/ws", { room: "ZZZZZZ", seat: 1 },
    { connect: () => third, storage });
  c.post({ type: "init" }).catch(() => {});
  third.open();
  assert.equal(third.last(C2S.HELLO)?.token, undefined, "another room's token was offered");
  b.dispose();
  c.dispose();
});

test("a storage that throws does not stop a player joining (X4a)", async () => {
  // Private windows, blocked site data, previews: every read and write is
  // wrapped, and a tab that cannot remember still plays. The failure mode this
  // forbids is a game that will not start because it could not write a string.
  const room = createRoom({ options: OPTIONS, code: "ABC123" });
  const angry = {
    getItem() { throw new Error("no"); },
    setItem() { throw new Error("no"); },
  };
  const socket = fakeSocket();
  const transport = createSocketTransport("ws://nowhere/ws", { room: "ABC123", seat: 1 },
    { connect: () => socket, storage: angry });
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push(welcomeFrom(room, 1));
  const reply = await ready;
  assert.equal(reply.type, "ready", "a storage that throws stopped the join");
  transport.dispose();
});

// --- the room's clock, on the page (X2d) -------------------------------------

test("the welcome says whose clock it is, and where it is set", async () => {
  // Both on the WELCOME rather than waiting for a frame, because a speed button
  // that appears a second after the city does is a button a player has already
  // decided is not there.
  const { room, socket, transport } = roomAndTransport();
  const ready = transport.post({ type: "init" });
  socket.open();
  room.setSpeed(2);
  socket.push(welcomeFrom(room));
  await ready;
  assert.equal(transport.isHost, true, "the first seat in is not the host");
  assert.equal(transport.roomSpeed, 2, "the page does not know the room's speed");
});

test("a guest is not the host, and follows the dial off the frames", async () => {
  const { room, socket, transport } = roomAndTransport({ seat: 2 });
  // Somebody else got there first, so seat 2 is a guest.
  welcomeFrom(room, 1);
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push(welcomeFrom(room, 2));
  await ready;
  assert.equal(transport.isHost, false, "a guest thinks it is the host");
  assert.equal(transport.roomSpeed, 1);
  // The host turns it; the guest learns from the frame, with no message of its
  // own and nothing to miss.
  room.setSpeed(3, 1);
  socket.push({ type: S2C.FRAME, tick: 1, seq: 1, cmds: [], ticks: 1, at: 0, speed: 3 });
  assert.equal(transport.roomSpeed, 3, "the guest's dial did not follow the host's");
});

test("asking for a speed is a message and nothing else", async () => {
  // Nothing happens locally: the answer comes back as the `speed` on the next
  // frame, so a host whose message is refused sees the dial stay where it was
  // rather than snap back.
  const { room, socket, transport } = roomAndTransport();
  const ready = transport.post({ type: "init" });
  socket.open();
  socket.push(welcomeFrom(room));
  await ready;
  transport.setRoomSpeed(3);
  const asked = socket.last(C2S.SPEED);
  assert.ok(asked, "no speed message was sent");
  assert.equal(asked.speed, 3);
  assert.equal(transport.roomSpeed, 1, "the page moved its own dial instead of asking");
});
