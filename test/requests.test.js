// X3a: a demolition request is state, a command and a hash (slice 5.3).
//
// The rule the whole ownership design rests on is `canDemolish`: what you did
// not build is not yours to destroy. That rule is only liveable if there is a
// way to ASK — and until this slice there was not one. `requestDemolition`,
// `resolveRequest`, `withdrawRequest`, `reportNuisance` and `ping` had
// constants, a record shape in the state, a hashed field list and a line in
// `test/omissions.test.js` saying they were slice 5.3's, and no handler.
//
// What is asserted here is the lifecycle, the money and the refusals — the
// inbox as a weapon (the per-pair cap), the owner's answer, the requester's
// withdrawal, the clock, and the one transaction that both clears the ground
// and moves the compensation. The permission rows are in `test/build.test.js`'s
// matrix, where every other command's rows are.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import {
  TICKS_PER_MONTH, TICKS_PER_YEAR, MODE_SHARED_CITY, MODE_DISTRICTS, MODE_REGION_RIVALS,
} from "../engine/constants.js";
import { RESULT, LIMITS } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import {
  CMD_JOIN, CMD_TICK, CMD_PLACE_ROAD, CMD_BULLDOZE,
  CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST, CMD_WITHDRAW_REQUEST,
  CMD_REPORT_NUISANCE, CMD_PING,
} from "../engine/commands.js";
import { requestById, markDerelict, REQUEST_DEMOLITION, REQUEST_NUISANCE, PENDING, APPROVED, DECLINED, WITHDRAWN, EXPIRED, MOOT, ACKNOWLEDGED } from "../engine/requests.js";
import { price } from "../engine/build-commands.js";
import "../engine/build-commands.js";
import "../engine/requests.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);

/** Two seats, and seat two owns a road at (6,6)–(8,6) that seat one would like
 * gone. Every test below is about that road. */
function world(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 4, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  const theirs = [at(6, 6), at(7, 6), at(8, 6)];
  const built = apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(theirs) });
  assert.equal(built.result, RESULT.OK, "the fixture's own road was refused");
  return { state, theirs };
}

const asking = (actor, cells, over = {}) => ({
  type: CMD_REQUEST_DEMOLITION, actor, runs: encodeRuns(cells),
  title: "Your road blocks my pipe", reason: "It runs through my water main", offer: 0, ...over,
});

test("a demolition request is a record in the state, pending and dated", () => {
  const { state, theirs } = world();
  const outcome = apply(state, asking(1, theirs, { offer: 500 }));
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(state.requests.length, 1);

  const request = state.requests[0];
  assert.equal(request.kind, REQUEST_DEMOLITION);
  assert.equal(request.from, 1);
  assert.equal(request.to, 2, "a request is addressed to the owner of the ground, not chosen");
  assert.equal(request.status, PENDING);
  assert.equal(request.offer, 500);
  assert.equal(request.createdTick, state.tick);
  assert.equal(request.expiresTick,
    state.tick + state.options.requestExpiryMonths * TICKS_PER_MONTH,
    "the expiry comes from the option, which nothing read before this slice");
  assert.ok(request.id > 0, "a request without an id cannot be answered");
  // Nothing was demolished by ASKING.
  assert.notEqual(state.tiles.road[theirs[0]], 0, "asking removed the road");
});

test("a request against your own ground is refused — bulldoze it yourself", () => {
  const { state } = world();
  const mine = [at(3, 3), at(4, 3)];
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(mine) });
  const outcome = apply(state, asking(1, mine));
  assert.equal(outcome.result, RESULT.INVALID);
  assert.equal(state.requests.length, 0);
});

test("a request has one recipient: ground belonging to two seats is refused", () => {
  const { state, theirs } = world();
  const mine = [at(9, 6)];
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(mine) });
  const outcome = apply(state, asking(1, [...theirs, ...mine]));
  assert.equal(outcome.result, RESULT.INVALID,
    "a request is one owner's to answer, so it cannot span two owners");
  assert.equal(state.requests.length, 0);
});

test("player text is capped and sanitised on the way into hashed state", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs, {
    title: `${"t".repeat(400)}\u0007`,
    reason: `line one\nline two${"r".repeat(400)}`,
  }));
  const request = state.requests[0];
  assert.ok(request.title.length <= LIMITS.TITLE_BYTES, "the title was not capped");
  assert.ok(request.reason.length <= LIMITS.REASON_BYTES, "the reason was not capped");
  assert.ok(!request.title.includes("\u0007"), "a control character reached hashed state");
  assert.ok(!request.reason.includes("\n"), "a newline reached hashed state");
});

test("the inbox cannot be used as a weapon: three pending per pair", () => {
  const { state, theirs } = world();
  for (let n = 0; n < LIMITS.PENDING_REQUESTS_PER_PAIR; n += 1) {
    assert.equal(apply(state, asking(1, theirs)).result, RESULT.OK, `request ${n + 1} was refused`);
  }
  const over = apply(state, asking(1, theirs));
  assert.equal(over.result, RESULT.RATE_LIMITED);
  assert.equal(state.requests.length, LIMITS.PENDING_REQUESTS_PER_PAIR);

  // And the cap is per PAIR, not per player: a third seat may still ask.
  apply(state, { type: CMD_JOIN, actor: 3, seat: 3, name: "Three" });
  assert.equal(apply(state, asking(3, theirs)).result, RESULT.OK);
});

test("an approval clears the ground and moves the money, in one transaction", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs, { offer: 400 }));
  const id = state.requests[0].id;
  const one = state.players[0].treasury;
  const two = state.players[1].treasury;

  // What the demolition itself costs, asked of the same code path that will
  // charge it — rather than written in here as a number, which would be a
  // balance era pinned inside a rules test (and is how I found that a bulldoze
  // is FREE at two of the three difficulties: `idiv(1 * 90, 100)` is 0).
  const quote = price(state, { actor: 2, runs: encodeRuns(theirs) }, "bulldoze");

  const outcome = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true });
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(state.requests[0].status, APPROVED);
  assert.equal(state.tiles.road[theirs[0]], 0, "an approved request did not clear the ground");

  // The requester pays for the demolition AND the compensation; the owner is
  // never out of pocket for agreeing, which is what makes approval safe.
  assert.equal(state.players[0].treasury, one - 400 - quote.cost,
    "the requester did not pay the compensation and the demolition, exactly");
  assert.equal(state.players[1].treasury, two + 400, "the owner was not compensated exactly");
  // The cleared ground reverts to NATURE, exactly as it does when an owner
  // bulldozes their own road: "an abandoned plot can be claimed by whoever
  // builds next rather than being fenced off forever" (`bulldozeInto`). Any
  // other answer here would mean an approved removal left the plot locked while
  // the same act by the owner's own hand freed it — and a requester who wanted
  // the ground for a pipe would have gained nothing by asking.
  assert.equal(state.tiles.owner[theirs[0]], 0,
    "approved ground did not revert to nature the way a self-demolition does");
});

test("an approval nobody can pay for changes nothing", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs, { offer: 10 ** 9 }));
  const id = state.requests[0].id;
  const before = hashState(state);

  const outcome = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true });
  assert.equal(outcome.result, RESULT.NO_FUNDS);
  assert.equal(hashState(state), before, "a refused approval moved the world");
  assert.equal(state.requests[0].status, PENDING, "and it is still there to be answered");
});

test("only the owner may answer, and only the requester may withdraw", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs));
  const id = state.requests[0].id;

  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true }).result,
    RESULT.NOT_OWNER, "the requester approved their own request");
  assert.equal(apply(state, { type: CMD_WITHDRAW_REQUEST, actor: 2, id }).result,
    RESULT.NOT_OWNER, "the owner withdrew somebody else's request");

  assert.equal(apply(state, { type: CMD_WITHDRAW_REQUEST, actor: 1, id }).result, RESULT.OK);
  assert.equal(state.requests[0].status, WITHDRAWN);
  // And a settled request cannot be settled twice.
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true }).result,
    RESULT.INVALID);
});

test("a decline is an answer, and leaves the ground alone", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs, { offer: 100 }));
  const id = state.requests[0].id;
  const one = state.players[0].treasury;

  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: false }).result,
    RESULT.OK);
  assert.equal(state.requests[0].status, DECLINED);
  assert.notEqual(state.tiles.road[theirs[0]], 0);
  assert.equal(state.players[0].treasury, one, "a decline charged the requester");
});

test("a request expires on the option's clock, not on somebody's memory", () => {
  const { state, theirs } = world({ requestExpiryMonths: 2 });
  apply(state, asking(1, theirs));
  assert.equal(state.requests[0].expiresTick, 2 * TICKS_PER_MONTH);
  for (let n = 0; n < 2 * TICKS_PER_MONTH - 1; n += 1) apply(state, { type: CMD_TICK });
  assert.equal(state.requests[0].status, PENDING, "it expired early");
  apply(state, { type: CMD_TICK });
  assert.equal(state.requests[0].status, EXPIRED);
});

test("a request whose target is already gone becomes moot, quietly", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs));
  // The owner removes it themselves, which is their right and makes the
  // request meaningless rather than wrong.
  apply(state, { type: CMD_BULLDOZE, actor: 2, runs: encodeRuns(theirs) });
  for (let n = 0; n < TICKS_PER_MONTH; n += 1) apply(state, { type: CMD_TICK });
  assert.equal(state.requests[0].status, MOOT);
});

test("a nuisance report is attributable and cannot force a change", () => {
  const { state, theirs } = world();
  const outcome = apply(state, {
    type: CMD_REPORT_NUISANCE, actor: 1, runs: encodeRuns(theirs),
    title: "Smoke over my park", reason: "Every month since spring", offer: 0,
  });
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(state.requests[0].kind, REQUEST_NUISANCE);
  assert.equal(state.requests[0].offer, 0, "a nuisance report cannot carry money");

  const id = state.requests[0].id;
  // Approving one would be approving a demolition nobody asked for.
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true }).result,
    RESULT.OK);
  assert.equal(state.requests[0].status, ACKNOWLEDGED);
  assert.notEqual(state.tiles.road[theirs[0]], 0, "a nuisance report demolished something");
});

test("ping writes nothing hashed", () => {
  const { state } = world();
  const before = hashState(state);
  const outcome = apply(state, { type: CMD_PING, actor: 1, x: 4, z: 9 });
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(hashState(state), before, "a ping changed the city");
  assert.equal(state.requests.length, 0);
  assert.deepEqual(outcome.events, [{ kind: "ping", actor: 1, x: 4, z: 9 }],
    "a ping that carries no event is a message to nobody");
});

test("every request field survives a copy and a hash", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs, { offer: 250 }));
  // `copyState` is what the worker, the room and every save go through: a field
  // it forgets is a field two clients disagree about, and a field the hash
  // forgets is a field a desync cannot be seen in.
  assert.equal(hashState(copyState(state)), hashState(state),
    "a request field is missing from copyState or from the hash");
  const copy = copyState(state);
  copy.requests[0].kind = REQUEST_NUISANCE;
  assert.notEqual(hashState(copy), hashState(state), "the hash cannot see a request's kind");
  const other = copyState(state);
  other.requests[0].offer += 1;
  assert.notEqual(hashState(other), hashState(state), "the hash cannot see a request's offer");
});

test("a request is the same rule in every mode, deliberately (X3a)", () => {
  // The item asked for "a row per command per relation per mode". The rows per
  // relation are in `test/build.test.js`; this is the mode axis, and the answer
  // is that there ISN'T one: §25.3 gives every mode the same channel, so the
  // reducer checks ownership and never the mode. Pinned on purpose — the day a
  // mode wants to forbid asking (or to auto-approve inside a district), this
  // goes red and names the decision instead of being discovered in a lobby.
  for (const mode of [MODE_SHARED_CITY, MODE_DISTRICTS, MODE_REGION_RIVALS]) {
    const { state, theirs } = world({ mode });
    const filed = apply(state, asking(1, theirs, { offer: 50 }));
    assert.equal(filed.result, RESULT.OK, `${mode}: a request was refused`);
    const request = requestById(state, state.requests[0].id);
    assert.equal(request.to, 2, `${mode}: the request found the wrong owner`);

    const answered = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id: request.id, approve: true });
    assert.equal(answered.result, RESULT.OK, `${mode}: the owner could not approve`);
    assert.equal(state.tiles.road[theirs[0]], 0, `${mode}: approving cleared nothing`);
  }
});

test("a request names a record that exists, or it is invalid", () => {
  const { state } = world();
  assert.equal(requestById(state, 99), undefined);
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id: 99, approve: true }).result,
    RESULT.INVALID);
  assert.equal(apply(state, { type: CMD_WITHDRAW_REQUEST, actor: 1, id: 99 }).result, RESULT.INVALID);
});

// --- the derelict override (X3c, gamedesign §25.4) ---------------------------
//
// "A building abandoned for longer than a set number of years may have its
// demolition approved on a neighbour's request even against the owner's
// wishes." X3a could not build it: a ruin is a tile FLAG whose building is
// already gone, so nothing in the engine recorded when it became one. The clock
// is `state.derelicts` — the same shape `requests` and `contracts` have, sparse
// because ruins are rare, and sorted by tile so canonical order never depends on
// the order things burned down.

const RUINED = 8;
const years = (n) => n * TICKS_PER_YEAR;

/** A ruin on somebody else's ground, as the engine makes one. */
function ruin(state, index, seat = 2) {
  state.tiles.owner[index] = seat;
  state.tiles.flags[index] |= RUINED;
  markDerelict(state, index);
}

test("a ruin starts a clock, and bulldozing it stops one", () => {
  const { state } = world();
  const index = at(6, 6);
  ruin(state, index);
  assert.equal(state.derelicts.length, 1);
  assert.equal(state.derelicts[0].tile, index);
  assert.equal(state.derelicts[0].sinceTick, state.tick);

  // The owner clears their own ruin: the entry goes with it.
  apply(state, { type: CMD_BULLDOZE, actor: 2, runs: encodeRuns([index]) });
  assert.equal(state.derelicts.length, 0, "a cleared ruin kept its clock");
});

test("the list is sorted by tile, whatever order things burned in", () => {
  // Canonical order never depends on the order things happened (CLAUDE.md).
  const { state } = world();
  for (const index of [at(9, 9), at(3, 3), at(6, 6)]) ruin(state, index);
  assert.deepEqual(state.derelicts.map((d) => d.tile),
    [at(3, 3), at(6, 6), at(9, 9)]);
});

test("a neighbour cannot force a demolition before the clock runs out", () => {
  const { state } = world();
  const index = at(6, 6);
  ruin(state, index);
  apply(state, asking(1, [index]));
  const id = state.requests[0].id;

  // Seat one asking seat one: the requester approving their own request, which
  // only the derelict rule allows.
  const early = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true });
  assert.equal(early.result, RESULT.NOT_DERELICT,
    "a four-year-old ruin was cleared over its owner's head");
  assert.equal(state.requests[0].status, PENDING);
});

test("and can once it has stood for derelictYears", () => {
  const { state } = world();
  const index = at(6, 6);
  ruin(state, index);
  apply(state, asking(1, [index]));
  const id = state.requests[0].id;

  state.tick += years(state.options.derelictYears);
  const out = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true });
  assert.equal(out.result, RESULT.OK, "a five-year ruin could not be cleared by the neighbour");
  assert.equal(state.requests[0].status, APPROVED);
  assert.equal(state.tiles.flags[index] & RUINED, 0, "the ruin is still standing");
  assert.equal(state.derelicts.length, 0, "the clock outlived the ruin");
});

test("the owner's own answer is unchanged by any of it", () => {
  const { state } = world();
  const index = at(6, 6);
  ruin(state, index);
  apply(state, asking(1, [index]));
  const id = state.requests[0].id;
  // No waiting: the owner may always decline, and always approve.
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: false }).result,
    RESULT.OK);
  assert.equal(state.requests[0].status, DECLINED);
});

test("one young ruin in the request is enough to refuse it", () => {
  // Two tiles, one old and one new: the neighbour's override is about ground
  // that has been dead long enough, so the youngest tile answers.
  const { state } = world();
  const old = at(6, 6);
  const young = at(7, 6);
  ruin(state, old);
  state.tick += years(state.options.derelictYears);
  ruin(state, young);
  apply(state, asking(1, [old, young]));
  const id = state.requests[0].id;
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true }).result,
    RESULT.NOT_DERELICT);
});

test("a request on ground that is not derelict at all is still the owner's", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs));
  const id = state.requests[0].id;
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true }).result,
    RESULT.NOT_OWNER, "a standing building was cleared by the neighbour who asked about it");
});

test("the derelict list survives a copy, a hash and a save", () => {
  const { state } = world();
  ruin(state, at(6, 6));
  assert.equal(hashState(copyState(state)), hashState(state));
  const other = copyState(state);
  other.derelicts[0].sinceTick += 1;
  assert.notEqual(hashState(other), hashState(state), "the hash cannot see the clock");
});
