// Who is in the room (X4, slice 5.4's first player-facing piece).
//
// `CMD_LEAVE` and `CMD_SET_STATUS` have had reducer handlers since Wave 0 and
// no control — the last two on `test/omissions.test.js`'s list — and their
// events, `seatLeft` and `seatStatus`, are declared invisible "pending the
// roster". This is the roster.
//
// **It is built from `state.players`, not from a wire message.** Seat, name and
// status are hashed state and every client already has them, identically; a
// `S2C.ROSTER` carrying the same thing would be a second source for one fact.
// What the state does NOT know is whether a socket is open — that is the
// server's and belongs with regency, which is why the message stays on the
// wire census pointing at X4's second half.

import test from "node:test";
import assert from "node:assert/strict";
import { rosterFor, ROSTER_ACTIONS, canStart } from "../client/ui/roster-model.js";
import { PLAYER_COLOURS } from "../client/render/palette.js";
import { PLAYER_ACTIVE, PLAYER_AFK, PLAYER_REGENT, PLAYER_GONE } from "../engine/constants.js";

const city = (players) => ({ players });

test("every seat in the city is a row, in seat order, with its colour and its name", () => {
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "", status: PLAYER_ACTIVE },
  ]);
  const rows = rosterFor(state, 1);
  assert.deepEqual(rows.map((r) => r.seat), [1, 2]);
  assert.deepEqual(rows.map((r) => r.name), ["Ada", "Mayor 2"]);
  assert.deepEqual(rows.map((r) => r.colour), [PLAYER_COLOURS[1], PLAYER_COLOURS[2]]);
  assert.deepEqual(rows.map((r) => r.you), [true, false]);
});

test("each status has its own word, and they are not the same word", () => {
  // Four states and four sentences: playing, away, run by the deputy, gone.
  // A roster that called three of them "here" would be a roster that answers
  // the question wrongly in the two cases somebody is actually asking.
  const state = city([
    { seat: 1, name: "A", status: PLAYER_ACTIVE },
    { seat: 2, name: "B", status: PLAYER_AFK },
    { seat: 3, name: "C", status: PLAYER_REGENT },
    { seat: 4, name: "D", status: PLAYER_GONE },
  ]);
  const keys = rosterFor(state, 1).map((r) => r.statusKey);
  assert.equal(new Set(keys).size, 4, `four statuses, ${new Set(keys).size} words: ${keys}`);
  for (const key of keys) assert.match(key, /^roster\.status\./);
});

test("the actions offered are your own, and only yours", () => {
  // You can say you are away and you can leave. You cannot do either TO
  // somebody else — kicking is the host's and is X4's, and a button the reducer
  // would refuse is a lie told by the interface.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
  ]);
  const [mine, theirs] = rosterFor(state, 1);
  assert.deepEqual(mine.actions, [ROSTER_ACTIONS.AWAY, ROSTER_ACTIONS.LEAVE]);
  assert.deepEqual(theirs.actions, [], "a seat was offered a button on somebody else's row");

  // Away becomes back, because the one control has to say which way it goes.
  const away = city([{ seat: 1, name: "Ada", status: PLAYER_AFK }]);
  assert.deepEqual(rosterFor(away, 1)[0].actions, [ROSTER_ACTIONS.BACK, ROSTER_ACTIONS.LEAVE]);

  // And a seat that has already gone is offered nothing: there is nothing left
  // to say, and `CMD_LEAVE` on a seat that has left changes nothing.
  const gone = city([{ seat: 1, name: "Ada", status: PLAYER_GONE }]);
  assert.deepEqual(rosterFor(gone, 1)[0].actions, []);
});

test("a city with nobody in it has an empty roster rather than a row about nature", () => {
  assert.deepEqual(rosterFor(city([]), 1), []);
  assert.deepEqual(rosterFor(undefined, 1), []);
  assert.deepEqual(rosterFor(city([{ seat: 0, name: "nature", status: PLAYER_ACTIVE }]), 1), []);
});

// --- the host's remove (X2d) -------------------------------------------------

test("only the host is offered a remove, and never on their own row", () => {
  // A button the ROOM would refuse is the same lie as one the reducer would:
  // the host is passed in rather than guessed, and the room checks it again
  // beside the seats it protects.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
    { seat: 3, name: "Alan", status: PLAYER_AFK },
  ]);
  const asHost = rosterFor(state, 1, 1);
  assert.deepEqual(asHost.map((r) => r.actions.includes(ROSTER_ACTIONS.REMOVE)), [false, true, true],
    "the host can remove themselves, or cannot remove a guest");
  // Away is still removable: a seat somebody has stepped away from is exactly
  // the one a host wants back.
  const asGuest = rosterFor(state, 2, 1);
  assert.deepEqual(asGuest.map((r) => r.actions.includes(ROSTER_ACTIONS.REMOVE)), [false, false, false],
    "a guest was offered somebody else's removal");
});

test("a seat that has already gone cannot be removed", () => {
  // Nothing to close and nothing to free, and a button that does nothing is the
  // defect X2d's speed control was.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_GONE },
  ]);
  const rows = rosterFor(state, 1, 1);
  assert.equal(rows[1].actions.includes(ROSTER_ACTIONS.REMOVE), false);
});

test("with no host named, nobody is offered a removal", () => {
  // Singleplayer and the in-process rooms: `host` defaults to 0, which is not a
  // seat, so the table is the one it was before X2d.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
  ]);
  for (const row of rosterFor(state, 1)) {
    assert.equal(row.actions.includes(ROSTER_ACTIONS.REMOVE), false);
  }
});

// --- X2d: ready, and the host's start ----------------------------------------

test("a room that has not started offers ready, and the host offers start (X2d)", () => {
  // Before the clock runs, the roster IS the lobby: it is the only place that
  // lists who is here, so it is where "I am ready" belongs rather than in a
  // second panel that exists for ninety seconds.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
  ]);
  const room = { started: false, ready: [] };
  const waiting = rosterFor(state, 2, 1, room);
  assert.ok(waiting.find((r) => r.you).actions.includes(ROSTER_ACTIONS.READY),
    "a guest in a room that has not started cannot say so");
  assert.equal(canStart(2, 1, room), false, "a guest was offered the start");
  assert.equal(canStart(1, 1, room), true, "the host cannot start the room");

  // And the row says who is ready, for everybody, because waiting for somebody
  // is the whole of what the screen is for.
  const seen = rosterFor(state, 1, 1, { started: false, ready: [2] });
  assert.equal(seen.find((r) => r.seat === 2).ready, true);
  assert.equal(seen.find((r) => r.seat === 1).ready, false);
});

test("a seat that has said it is ready is offered the way back (X2d)", () => {
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
  ]);
  const mine = rosterFor(state, 2, 1, { started: false, ready: [2] }).find((r) => r.you);
  assert.ok(mine.actions.includes(ROSTER_ACTIONS.NOT_READY), "ready cannot be taken back");
  assert.equal(mine.actions.includes(ROSTER_ACTIONS.READY), false, "both halves were offered");
});

test("a started room has no ready and no start at all (X2d)", () => {
  // The controls are gone rather than disabled: a button that cannot do
  // anything is the defect X2d's own speed control was, and nothing about a
  // running city is waiting for anybody.
  const state = city([
    { seat: 1, name: "Ada", status: PLAYER_ACTIVE },
    { seat: 2, name: "Grace", status: PLAYER_ACTIVE },
  ]);
  const room = { started: true, ready: [2] };
  for (const seat of [1, 2]) {
    assert.equal(canStart(seat, 1, room), false, `seat ${seat} was offered a start in a running room`);
    for (const row of rosterFor(state, seat, 1, room)) {
      assert.equal(row.actions.includes(ROSTER_ACTIONS.READY), false, "ready in a running room");
      assert.equal(row.actions.includes(ROSTER_ACTIONS.NOT_READY), false);
    }
  }
});

test("singleplayer has no lobby, so it has neither (X2d)", () => {
  // `rosterFor` is called with no room at all in singleplayer, and the default
  // has to be "already playing" or a city with one seat would wait for itself.
  const state = city([{ seat: 1, name: "Ada", status: PLAYER_ACTIVE }]);
  assert.equal(canStart(1, 0, undefined), false);
  for (const row of rosterFor(state, 1, 0)) {
    assert.equal(row.actions.includes(ROSTER_ACTIONS.READY), false);
  }
});
