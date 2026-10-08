// Asking a neighbour to clear their ground (X3b, slice 5.3).
//
// The inbox answers and withdraws; this is the hand that FILES one. The door it
// comes through is a refusal: a player drags Demolish across ground they do not
// own, the reducer says `notOwner`, and instead of only a toast the game offers
// to ask. No new tool, and the refusal becomes a door — which is also why this
// module must not re-implement the rule. **Permission checks live in the
// reducer** (CLAUDE.md), so what is decided here is only what the DIALOG needs
// to say: who owns it and how much of it there is.

import test from "node:test";
import assert from "node:assert/strict";
import { askTargetFor, defaultOffer } from "../client/ui/ask-model.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { CMD_JOIN, CMD_PLACE_ROAD } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const W = 24;
const at = (x, y) => tileAt(W, x, y);

function world() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5, seats: 4 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const theirs = [at(6, 6), at(7, 6), at(8, 6)];
  const mine = [at(6, 10), at(7, 10)];
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(theirs) }).result, RESULT.OK);
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(mine) }).result, RESULT.OK);
  return { state, theirs, mine };
}

test("ground with one other owner on it can be asked about, and the owner is named", () => {
  const { state, theirs } = world();
  const target = askTargetFor(state, theirs, 1);
  assert.equal(target.ok, true, target.reasonKey);
  assert.equal(target.to, 2);
  assert.equal(target.toName, "Grace", "the dialog cannot name who it is asking");
  assert.equal(target.tiles, 3, "the dialog cannot say how much ground it is about");
});

test("your own ground, and nobody's, are refused with different words", () => {
  // Two different sentences, because they ask the player to do two different
  // things: bulldoze it yourself, or stop trying to ask the weather.
  const { state, theirs, mine } = world();
  assert.deepEqual(askTargetFor(state, mine, 1), { ok: false, reasonKey: "ask.yours" });
  assert.deepEqual(askTargetFor(state, [at(1, 1)], 1), { ok: false, reasonKey: "ask.nobody" });
  assert.deepEqual(askTargetFor(state, [], 1), { ok: false, reasonKey: "ask.nobody" });
  // And ground belonging to two people: the reducer refuses it (`recipientOf`),
  // so the dialog must not offer to send something that cannot be sent.
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([at(9, 6)]) });
  assert.deepEqual(askTargetFor(state, [...theirs, at(9, 6)], 1), { ok: false, reasonKey: "ask.twoOwners" });
});

test("a mixture of their ground and bare land is about THEIR ground", () => {
  // A drag is a rectangle and the world is not. Bare land in the selection is
  // not a second owner — `recipientOf` ignores it — so the dialog counts what
  // is actually theirs and says that number, rather than refusing a drag that
  // the reducer would have accepted.
  const { state, theirs } = world();
  const target = askTargetFor(state, [...theirs, at(1, 1), at(2, 1)], 1);
  assert.equal(target.ok, true, target.reasonKey);
  assert.equal(target.to, 2);
  assert.equal(target.tiles, 3, "bare land was counted as ground to clear");
});

test("the offered price starts at nothing, and nothing is a legal offer", () => {
  // §25.4's channel is civil, not a market: an offer is optional and the
  // default is zero, so a player who just wants the road gone is not nudged
  // into paying for it.
  assert.equal(defaultOffer(), 0);
});
