// The request inbox, as data (X3b, slice 5.3).
//
// Five commands have had reducer handlers, tests and words in both catalogues
// since X3a and **no way for a player to issue them** — `requestDemolition`,
// `resolveRequest`, `withdrawRequest`, `reportNuisance` and `ping`. The three
// `request*` events are declared invisible in the event census for the same
// reason. The inbox is what ends that, and this is the half that decides what a
// row SAYS and what may be done to it; `client/ui/hud.js` only draws it.
//
// The sentence is the whole difficulty. `status: APPROVED` happens two ways —
// the owner agreeing, and a neighbour clearing a ruin over their head under the
// derelict rule — and X3b gave the record `resolvedBy` precisely so this file
// can tell them apart. Each row therefore carries a KEY and its arguments
// rather than a string: the catalogue holds the words, in both languages.

import test from "node:test";
import assert from "node:assert/strict";
import { inboxFor, ACTIONS, policyChoices } from "../client/ui/inbox-model.js";
import { REQUEST_POLICIES } from "../engine/requests.js";
import { PING_MESSAGES, PING_LABELS } from "../client/ui/ping-model.js";
import { createState, copyState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import {
  CMD_JOIN, CMD_PLACE_ROAD, CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST, CMD_WITHDRAW_REQUEST,
  CMD_REPORT_NUISANCE, CMD_SET_REQUEST_POLICY,
} from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const W = 24;
const at = (x, y) => tileAt(W, x, y);

/** Seat one would like seat two's road gone — the same fixture
 * `test/requests.test.js` uses, so the two files describe one city. */
function world() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 4 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const theirs = [at(6, 6), at(7, 6), at(8, 6)];
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(theirs) }).result,
    RESULT.OK, "the fixture's own road was refused");
  return { state, theirs };
}

const ask = (actor, cells, over = {}) => ({
  type: CMD_REQUEST_DEMOLITION, actor, runs: encodeRuns(cells),
  title: "Your road blocks my pipe", reason: "It runs through my water main", offer: 50, ...over,
});

test("a request to me is waiting; one I sent is sent; and neither is in the other list", () => {
  const { state, theirs } = world();
  assert.equal(apply(state, ask(1, theirs)).result, RESULT.OK);

  const mine = inboxFor(state, 2);
  assert.equal(mine.waiting.length, 1, "the owner has nothing to answer");
  assert.equal(mine.sent.length, 0);
  assert.equal(mine.waiting[0].title, "Your road blocks my pipe");
  assert.equal(mine.waiting[0].offer, 50);
  assert.equal(mine.waiting[0].otherName, "Ada", "the row does not name who is asking");

  const theirs2 = inboxFor(state, 1);
  assert.equal(theirs2.waiting.length, 0, "the requester was asked to answer their own request");
  assert.equal(theirs2.sent.length, 1);
  assert.equal(theirs2.sent[0].otherName, "Grace", "the row does not name who was asked");

  // A seat with nothing to do has an empty inbox rather than everybody's.
  const bystander = inboxFor(state, 3);
  assert.deepEqual([bystander.waiting.length, bystander.sent.length, bystander.settled.length],
    [0, 0, 0], "a third seat can read somebody else's inbox");
});

test("the actions on a row are the ones that seat may actually take", () => {
  // A button that is refused by the reducer is a lie told by the interface, and
  // permission checks live in the reducer (CLAUDE.md) — so these have to be the
  // same answer, which is why the model decides and the panel only draws.
  const { state, theirs } = world();
  apply(state, ask(1, theirs));

  assert.deepEqual(inboxFor(state, 2).waiting[0].actions, [ACTIONS.APPROVE, ACTIONS.DECLINE]);
  assert.deepEqual(inboxFor(state, 1).sent[0].actions, [ACTIONS.WITHDRAW]);

  // And once it is answered, nothing may be done to it by anybody.
  const id = state.requests[0].id;
  apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: false });
  for (const seat of [1, 2]) {
    const settled = inboxFor(state, seat).settled;
    assert.equal(settled.length, 1, `seat ${seat} cannot see the answer`);
    assert.deepEqual(settled[0].actions, [], `seat ${seat} is still offered a button`);
  }
});

test("an agreed demolition and a forced one are different sentences (X3b)", () => {
  // The decision X3c left to be made here. Both are `status: APPROVED`; what
  // tells them apart is `resolvedBy`, and what the OWNER is told has to differ
  // or being outvoted is silent.
  const agreed = world();
  apply(agreed.state, ask(1, agreed.theirs));
  apply(agreed.state, {
    type: CMD_RESOLVE_REQUEST, actor: 2, id: agreed.state.requests[0].id, approve: true,
  });
  const ownerSees = inboxFor(agreed.state, 2).settled[0];
  const askerSees = inboxFor(agreed.state, 1).settled[0];
  assert.equal(ownerSees.forced, false, "an owner's own approval reads as forced");
  assert.notEqual(ownerSees.textKey, askerSees.textKey,
    "the owner and the requester are told the same thing about their own act");

  // The forced path, built by hand: the record is what the inbox reads, and
  // `test/requests.test.js` is where the reducer's half is proved.
  const forced = copyState(agreed.state);
  const record = forced.requests[0];
  record.resolvedBy = record.from;
  const forcedOwner = inboxFor(forced, record.to).settled[0];
  assert.equal(forcedOwner.forced, true, "a ruin cleared over the owner's head reads as agreed");
  assert.notEqual(forcedOwner.textKey, ownerSees.textKey,
    "the owner is told the same sentence whether they agreed or were overruled");
});

test("a request the clock ended names nobody", () => {
  // `resolvedBy` 0 is the clock. A row that named a seat there would blame a
  // player for a deadline.
  const { state, theirs } = world();
  apply(state, ask(1, theirs));
  const ended = copyState(state);
  ended.requests[0].status = "expired";
  ended.requests[0].resolvedBy = 0;
  for (const seat of [1, 2]) {
    const row = inboxFor(ended, seat).settled[0];
    assert.equal(row.forced, false);
    assert.equal(row.otherName !== undefined, true, "the row lost the other party entirely");
    assert.ok(!String(row.textKey).includes("forced"), `${row.textKey} blames somebody`);
  }
});

test("waiting rows come first and oldest first, because a deadline is a queue", () => {
  const { state } = world();
  const rows = [[at(6, 6)], [at(7, 6)], [at(8, 6)]];
  for (const cells of rows) {
    assert.equal(apply(state, ask(1, cells)).result, RESULT.OK);
    apply(state, { type: "tick" });
  }
  const waiting = inboxFor(state, 2).waiting;
  assert.equal(waiting.length, 3);
  const ticks = waiting.map((r) => r.createdTick);
  assert.deepEqual(ticks, [...ticks].sort((a, b) => a - b), "the oldest request is not at the top");
  // And each one says how long is left, in months, because that is the unit the
  // engine ages them in (`requestExpiryMonths`).
  assert.ok(waiting.every((r) => r.expiresInMonths >= 0), JSON.stringify(ticks));
});

test("text that reached hashed state is carried, not re-sanitised here", () => {
  // Player text is capped and sanitised on the way IN (X3a, CLAUDE.md's
  // multiplayer invariants). Doing it again here would be a second rule that
  // can disagree with the first; the panel renders it as plain text.
  const { state, theirs } = world();
  apply(state, ask(1, theirs, { title: "  Spaced  ", reason: "x".repeat(400) }));
  const row = inboxFor(state, 2).waiting[0];
  assert.equal(row.title, state.requests[0].title, "the inbox re-wrote the title");
  assert.equal(row.reason, state.requests[0].reason, "the inbox re-wrote the reason");
});

test("a nuisance report is a different row from a demolition, on both sides (X3b)", () => {
  // §25.4's two kinds share one record, one inbox, one cap and one clock (X3a).
  // What they do not share is the sentence or the ending: a demolition asks for
  // something and a report only tells somebody, so the owner's only move is to
  // note it — `ACKNOWLEDGED`, not approved.
  const { state, theirs } = world();
  assert.equal(apply(state, {
    type: CMD_REPORT_NUISANCE, actor: 1, runs: encodeRuns(theirs),
    title: "Your plant smells", reason: "The whole street can taste it", offer: 0,
  }).result, RESULT.OK);

  const owner = inboxFor(state, 2).waiting[0];
  const asker = inboxFor(state, 1).sent[0];
  assert.equal(owner.kind, "nuisance");
  assert.equal(owner.textKey, "inbox.waiting.nuisance");
  assert.equal(asker.textKey, "inbox.sent.nuisance");
  // The owner's buttons are still Agree and Say no — the reducer turns either
  // into `ACKNOWLEDGED` for a report, which is the design's point: a civil
  // outlet, not a lever (§25.4). What matters here is that the row is not
  // offering the REQUESTER anything but a withdrawal.
  assert.deepEqual(asker.actions, [ACTIONS.WITHDRAW]);

  const id = state.requests[0].id;
  apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true });
  const settled = inboxFor(state, 2).settled[0];
  assert.equal(settled.status, "acknowledged", `a report ended as ${settled.status}`);
  assert.equal(settled.textKey, "inbox.settled.youNoted");
  assert.equal(inboxFor(state, 1).settled[0].textKey, "inbox.settled.theyNoted");
  assert.equal(settled.forced, false, "an acknowledgement read as a forced clearance");
});

test("every ping the engine allows has words, and no label is for a ping it does not (X3b)", () => {
  // Two lists in two layers — the engine's closed vocabulary and the catalogue
  // keys the buttons show — which is the `VARIANTS` shape: they agree until the
  // slice that adds an eighth phrase to one of them.
  assert.deepEqual([...PING_MESSAGES].sort(), Object.keys(PING_LABELS).sort());
  for (const [message, key] of Object.entries(PING_LABELS)) {
    assert.equal(key, `ping.${message}`, `${message}'s key is ${key}`);
  }
});

test("the inbox knows which standing answer is in force, and offers the others (X3b)", () => {
  // The control belongs here because this is the panel about what happens to
  // requests you get. The labels are spelled out rather than built from the
  // policy name, which is how `inbox.approve` and all seven ping labels came to
  // read as strings nothing can show.
  const { state } = world();
  assert.deepEqual(policyChoices(state, 1).map((c) => c.policy), REQUEST_POLICIES);
  assert.deepEqual(policyChoices(state, 1).map((c) => c.chosen), [true, false, false]);
  for (const choice of policyChoices(state, 1)) {
    assert.equal(choice.labelKey, `inbox.policy.${choice.policy}`);
  }

  apply(state, { type: CMD_SET_REQUEST_POLICY, actor: 1, policy: "decline" });
  assert.deepEqual(policyChoices(state, 1).map((c) => c.chosen), [false, false, true]);
  // One seat's own: seat two's row is unmoved by seat one's choice.
  assert.deepEqual(policyChoices(state, 2).map((c) => c.chosen), [true, false, false]);
});
