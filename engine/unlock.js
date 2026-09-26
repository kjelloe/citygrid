// Ranks, read (slice T5a; A69).
//
// `unlock` sat on every catalogue entry from the first commit and nothing read
// it. One rule, in one place, because it has three readers that must agree: the
// reducer refuses, the build menu greys, and the deputy declines to ask.
//
// The rank itself is a QUEST VARIABLE — city-wide, not per seat. A69 speaks of
// "the seat's rank" and the game has no per-seat variable to hold one; giving
// `state.quests.vars` a seat dimension is a state schema change for a
// distinction nothing else in the game makes yet (Q122).

import { definition } from "./catalogue.js";
import { variableOf } from "./quests.js";

export function rankOf(state) {
  return variableOf(state, "rank");
}

export function isUnlocked(state, id) {
  var def = definition(id);
  if (!def) return false;
  return (def.unlock | 0) <= rankOf(state);
}
