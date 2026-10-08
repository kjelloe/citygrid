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
  FLAG_RUINED, PLAYER_ACTIVE, PLAYER_REGENT, PLAYER_GONE, OWNER_COMMONS,
} from "../engine/constants.js";
import { toSave, fromSave } from "../engine/save.js";
import { RESULT, LIMITS } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import {
  CMD_JOIN, CMD_TICK, CMD_PLACE_ROAD, CMD_BULLDOZE,
  CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST, CMD_WITHDRAW_REQUEST,
  CMD_REPORT_NUISANCE, CMD_PING, CMD_SET_REQUEST_POLICY, CMD_SET_STATUS,
} from "../engine/commands.js";

/** The player record for a seat — several tests below read a field off it. */
const playerOf = (state, seat) => state.players.find((p) => p.seat === seat);
import { requestById, markDerelict, PING_MESSAGES, REQUEST_POLICIES, REQUEST_DEMOLITION, REQUEST_NUISANCE, PENDING, APPROVED, DECLINED, WITHDRAWN, EXPIRED, MOOT, ACKNOWLEDGED } from "../engine/requests.js";
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
  // `message: "look"` since X3b — a ping with no message is a plain "look at
  // this", because pointing at something is what a ping IS.
  assert.deepEqual(outcome.events, [{ kind: "ping", actor: 1, x: 4, z: 9, message: "look" }],
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

test("a request whose ground changes hands goes MOOT, not to the new owner (X3b)", () => {
  // `specs/plan.md` §25.3 promised that such a request "transfers to the new
  // owner with the clock reset". It does not, and it should not: the offer was
  // made to a person who no longer owns the ground, and transferring it asks
  // somebody who never agreed to be asked about land they have just acquired.
  // So the ruling is MOOT and the requester refiles — which is what the code
  // has always done, implicitly, through `anythingToRemove`'s owner check. The
  // spec is corrected and this test is what makes the behaviour a decision
  // rather than a side effect.
  const { state, theirs } = world();
  const filed = apply(state, asking(1, theirs));
  assert.equal(filed.result, RESULT.OK);
  const id = state.requests[0].id;
  assert.equal(state.requests[0].status, "pending");
  assert.equal(state.requests[0].to, 2, "the fixture's road is not seat two's");

  // The ground changes hands: seat two's road goes and seat THREE builds there.
  // (Bulldozing it themselves is the ordinary way a request becomes moot; this
  // is the other way, and the one the spec was wrong about.)
  apply(state, { type: CMD_JOIN, actor: 3, seat: 3, name: "Three" });
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 2, runs: encodeRuns(theirs) }).result,
    RESULT.OK, "the owner could not clear their own road");
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 3, runs: encodeRuns(theirs) }).result,
    RESULT.OK, "the third seat could not build on the cleared ground");
  assert.equal(state.tiles.owner[theirs[0]], 3, "the ground did not change hands");

  // The monthly pass is where it is settled — a request is answered against the
  // city as it stood when the month began (the pass's own rule).
  for (let n = 0; n < TICKS_PER_MONTH + 1; n += 1) apply(state, { type: CMD_TICK });
  const now = state.requests.find((r) => r.id === id);
  assert.equal(now.status, "moot", `the request is ${now.status}`);
  assert.equal(now.to, 2, "the request was moved to the new owner");

  // And the new owner was never asked: nothing pending sits in seat three's
  // inbox, which is the whole of why moot is the right answer.
  const theirs3 = state.requests.filter((r) => r.to === 3 && r.status === "pending");
  assert.deepEqual(theirs3, [], "the new owner inherited a request they never agreed to");
});

// --- who answered (X3b) ------------------------------------------------------

test("a resolved request records WHO resolved it, which is the only way to tell agreement from force", () => {
  // X3c left this for X3b to decide "with the inbox's words in front of you".
  // The words settle it: a row in the owner's inbox has to say either **you
  // approved this** or **your ruin was cleared by your neighbour**, and those
  // are different sentences about the same `status: APPROVED`. Nothing in the
  // record told them apart — `request.from`, `request.to` and `status` are
  // identical on both paths, and the actor was never stored.
  //
  // Being outvoted silently is the grief move in the other direction (the
  // item's own words), so the owner is told; and for that the record has to
  // remember the answerer.
  const { state, theirs } = world();
  apply(state, asking(1, theirs));
  const id = state.requests[0].id;
  assert.equal(state.requests[0].resolvedBy, 0, "a pending request already has an answerer");

  const approved = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true });
  assert.equal(approved.result, RESULT.OK);
  assert.equal(requestById(state, id).resolvedBy, 2, "the owner's approval was not recorded as theirs");
});

test("a derelict override records the REQUESTER, which is what makes it forced", () => {
  // The one path where somebody other than the owner may answer (X3c). The
  // record now says so: `resolvedBy === request.from` on a request whose `to`
  // is somebody else is the definition of "cleared over their head", and it is
  // what the inbox will read to choose its sentence.
  // The request has to OUTLIVE the derelict clock: a year of ticks is well past
  // `requestExpiryMonths`, so the first cut of this expired the request and the
  // override came back `invalid` — the refusal was right and the test was
  // asking the wrong question.
  const { state, theirs } = world({ derelictYears: 1, requestExpiryMonths: 48 });
  // Make the road a ruin and let it stand long enough.
  for (const tile of theirs) markDerelict(state, tile);
  for (const tile of theirs) state.tiles.flags[tile] |= FLAG_RUINED;
  apply(state, asking(1, theirs));
  const id = state.requests[0].id;
  for (let n = 0; n < TICKS_PER_YEAR * 2; n += 1) apply(state, { type: CMD_TICK });

  const forced = apply(state, { type: CMD_RESOLVE_REQUEST, actor: 1, id, approve: true });
  if (forced.result !== RESULT.OK) {
    // The clock, not the ownership: say which, so a failure here is readable.
    assert.fail(`the override was refused: ${forced.result}`);
  }
  const record = requestById(state, id);
  assert.equal(record.status, "approved");
  assert.equal(record.resolvedBy, 1, "the override was recorded as the owner's own approval");
  assert.notEqual(record.resolvedBy, record.to, "forced and agreed are still indistinguishable");
});

test("a decline, a withdrawal and a clock are each recorded as what they are", () => {
  const first = world();
  apply(first.state, asking(1, first.theirs));
  const declined = first.state.requests[0].id;
  apply(first.state, { type: CMD_RESOLVE_REQUEST, actor: 2, id: declined, approve: false });
  assert.equal(requestById(first.state, declined).resolvedBy, 2, "a decline has no answerer");

  const second = world();
  apply(second.state, asking(1, second.theirs));
  const withdrawn = second.state.requests[0].id;
  apply(second.state, { type: CMD_WITHDRAW_REQUEST, actor: 1, id: withdrawn });
  assert.equal(requestById(second.state, withdrawn).resolvedBy, 1,
    "a withdrawal is the requester's own act and should say so");

  // **Nobody** resolved an expired one: the clock did, and `0` is how the
  // inbox knows not to name anybody. A seat number here would be a sentence
  // blaming a player for a deadline.
  const third = world();
  apply(third.state, asking(1, third.theirs));
  const expired = third.state.requests[0].id;
  const months = third.state.options.requestExpiryMonths + 1;
  for (let n = 0; n < TICKS_PER_MONTH * months + 1; n += 1) apply(third.state, { type: CMD_TICK });
  const record = requestById(third.state, expired);
  assert.ok(record.status === "expired" || record.status === "moot", `it is ${record.status}`);
  assert.equal(record.resolvedBy, 0, "the clock was recorded as a player");
});

test("the answerer survives a copy and a save", () => {
  const { state, theirs } = world();
  apply(state, asking(1, theirs));
  const id = state.requests[0].id;
  apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true });

  const copied = copyState(state);
  assert.equal(requestById(copied, id).resolvedBy, 2, "copyState dropped the answerer");
  const restored = fromSave(toSave(state));
  assert.equal(restored.ok, true, restored.reason);
  assert.equal(requestById(restored.state, id).resolvedBy, 2, "a save dropped the answerer");
  // And it is hashed: two cities that disagree about who cleared the ground
  // disagree about the city.
  const other = copyState(state);
  requestById(other, id).resolvedBy = 1;
  assert.notEqual(hashState(other), hashState(state), "the answerer is not in the hash");
});

// --- pings (X3b) -------------------------------------------------------------

test("a ping carries one of a CLOSED set of messages, and nothing else", () => {
  // The same rule the quest condition language follows (`engine/quests.js`): a
  // closed vocabulary, because an open one in a multiplayer message is a way to
  // run somebody else's words through every client. Seven canned phrases, which
  // have had words in both catalogues since X3a and no way to send one.
  const { state } = world();
  const ping = (over) => apply(state, { type: CMD_PING, actor: 1, x: 3, z: 4, ...over });

  const looked = ping({ message: "look" });
  assert.equal(looked.result, RESULT.OK);
  assert.deepEqual(looked.events, [{ kind: "ping", actor: 1, x: 3, z: 4, message: "look" }]);

  for (const message of PING_MESSAGES) {
    assert.equal(ping({ message }).result, RESULT.OK, `"${message}" is in the list and was refused`);
  }
  // Anything else is refused rather than passed through: a message the
  // catalogue has no words for would reach the other player as a raw key.
  for (const bad of ["", "shout", "LOOK", 7, null, {}, "ping.look"]) {
    assert.equal(ping({ message: bad }).result, RESULT.INVALID, `${JSON.stringify(bad)} was accepted`);
  }
  // And a ping with no message at all is a plain "look at this", because that
  // is what pointing is.
  assert.deepEqual(ping({}).events[0].message, "look");
});

test("a ping changes nothing — it is a gesture, not a move", () => {
  // It touches no state, which is why it needs no migration and no re-pin, and
  // why a client that misses one has not diverged.
  const { state } = world();
  const before = hashState(state);
  assert.equal(apply(state, { type: CMD_PING, actor: 1, x: 5, z: 5, message: "help" }).result, RESULT.OK);
  assert.equal(hashState(state), before, "a ping moved the city");
});

// --- standing policies (X3b) -------------------------------------------------

test("a seat's request policy is theirs to set, from a closed list", () => {
  // `player.requestPolicy` has been born `"manual"`, copied and hashed since
  // Wave 0 and **nothing has ever set it or read it** — a dead field in hashed
  // state, the `landValueBonus` shape with a different name. `CMD_SET_REQUEST_POLICY`
  // has had a constant and no handler for just as long.
  const { state } = world();
  assert.equal(playerOf(state, 1).requestPolicy, "manual", "the default is not manual");

  for (const policy of REQUEST_POLICIES) {
    assert.equal(apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 1, policy }).result, RESULT.OK,
      `"${policy}" is in the list and was refused`);
    assert.equal(playerOf(state, 1).requestPolicy, policy);
  }
  // Closed, for the same reason a ping's message is: a policy the pass does not
  // know how to apply would sit in hashed state doing nothing, which is where
  // this field started.
  for (const bad of ["", "yes", "MANUAL", 1, null, undefined, {}]) {
    assert.equal(apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 1, policy: bad }).result,
      RESULT.INVALID, `${JSON.stringify(bad)} was accepted`);
  }
  // And it is one seat's own: nobody sets anybody else's.
  assert.equal(playerOf(state, 2).requestPolicy, "manual", "seat two's policy moved");
});

test("a standing policy answers a request without the owner, at the month", () => {
  // The point of the thing: a player who is not looking still answers. The
  // MONTH, not the moment — a request is answered against the city as it stood
  // when the month began, which is the pass's own rule and what keeps an
  // auto-answer in the same order on every machine.
  const { state, theirs } = world();
  assert.equal(apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 2, policy: "approve" }).result, RESULT.OK);
  apply(state, asking(1, theirs, { offer: 30 }));
  const id = state.requests[0].id;
  assert.equal(requestById(state, id).status, "pending", "it was answered before a month passed");

  const purse = playerOf(state, 2).treasury;
  for (let n = 0; n < TICKS_PER_MONTH + 1; n += 1) apply(state, { type: CMD_TICK });
  const answered = requestById(state, id);
  assert.equal(answered.status, "approved", `it ended as ${answered.status}`);
  // **The OWNER answered it**, because it is their standing policy: the inbox
  // reads `resolvedBy` to tell an agreement from a clearance over somebody's
  // head, and a policy is an agreement made in advance.
  assert.equal(answered.resolvedBy, 2);
  assert.ok(playerOf(state, 2).treasury > purse, "the owner was not paid the offer");
  for (const tile of theirs) assert.equal(state.tiles.road[tile], 0, "the ground was not cleared");
});

test("decline answers too, and manual still waits for a person", () => {
  const saying = (policy) => {
    const { state, theirs } = world();
    apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 2, policy });
    apply(state, asking(1, theirs));
    const id = state.requests[0].id;
    for (let n = 0; n < TICKS_PER_MONTH + 1; n += 1) apply(state, { type: CMD_TICK });
    return requestById(state, id);
  };
  assert.equal(saying("decline").status, "declined");
  assert.equal(saying("decline").resolvedBy, 2);
  // Manual is the default and means what it says: the request is still there,
  // waiting, until it expires on its own clock.
  assert.equal(saying("manual").status, "pending");
});

test("a policy that cannot be honoured leaves the request alone", () => {
  // An approval moves money. A requester who cannot pay must not have the
  // ground cleared for free, and the request must not be marked answered when
  // nothing happened — "I tried" and "I did" are the same to the caller.
  const { state, theirs } = world();
  apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 2, policy: "approve" });
  apply(state, asking(1, theirs, { offer: 1_000_000 }));
  const id = state.requests[0].id;
  for (let n = 0; n < TICKS_PER_MONTH + 1; n += 1) apply(state, { type: CMD_TICK });
  const stuck = requestById(state, id);
  assert.equal(stuck.status, "pending", `it ended as ${stuck.status}`);
  assert.equal(stuck.resolvedBy, 0, "an unanswerable request was marked answered");
  for (const tile of theirs) assert.notEqual(state.tiles.road[tile], 0, "the ground was cleared unpaid");
});

test("a nuisance report is acknowledged by a policy, never approved", () => {
  // §25.4: acknowledging is all the channel can do. A standing "approve" must
  // not turn a complaint into a demolition.
  const { state, theirs } = world();
  apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 2, policy: "approve" });
  apply(state, {
    type: CMD_REPORT_NUISANCE, actor: 1, runs: encodeRuns(theirs),
    title: "Noisy", reason: "Carts all night", offer: 0,
  });
  const id = state.requests[0].id;
  for (let n = 0; n < TICKS_PER_MONTH + 1; n += 1) apply(state, { type: CMD_TICK });
  const noted = requestById(state, id);
  assert.equal(noted.status, "acknowledged", `a report ended as ${noted.status}`);
  for (const tile of theirs) assert.notEqual(state.tiles.road[tile], 0, "a complaint cleared the ground");
});

