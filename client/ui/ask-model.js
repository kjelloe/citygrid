// Asking a neighbour to clear their ground (X3b, slice 5.3).
//
// The inbox answers and withdraws; this is the half that FILES. The door is a
// refusal: a player drags Demolish across ground they do not own, the reducer
// answers `notOwner`, and instead of only a toast the game offers to ask. No
// new tool — the refusal becomes a door, which is the smallest surface that
// completes the loop and the one a player is already looking at.
//
// **This does not re-implement the rule.** Permission checks live in the
// reducer (CLAUDE.md) and `engine/requests.js`'s `recipientOf` is what decides
// whether a request may be filed at all. What is decided here is only what the
// DIALOG has to say: who owns the ground, and how much of it there is. The two
// refusals below exist so the offer is not made when it could only fail — an
// interface that opens a form the reducer will reject is worse than one that
// says why now.

import { OWNER_NATURE, OWNER_COMMONS } from "../../engine/constants.js";

/** What a request offers by default. §25.4's channel is civil rather than a
 * market: zero is a legal offer, and a player who simply wants the road gone
 * should not be nudged into paying for it. */
export function defaultOffer() {
  return 0;
}

const nobody = (seat) => seat === OWNER_NATURE || seat === OWNER_COMMONS || !(seat > 0);

/**
 * @returns `{ ok: true, to, toName, tiles }` — the seat to ask, what they are
 *   called, and how many of the selected tiles are actually theirs — or
 *   `{ ok: false, reasonKey }`.
 *
 * Bare land in the selection is **not** a second owner: a drag is a rectangle
 * and the world is not, and `recipientOf` ignores unowned tiles too. Counting
 * them as a refusal would reject drags the reducer would have accepted.
 */
export function askTargetFor(state, tiles, seat) {
  const owners = new Set();
  let count = 0;
  for (const index of tiles ?? []) {
    const owner = state.tiles.owner[index];
    if (nobody(owner)) continue;
    owners.add(owner);
    if (owner !== seat) count += 1;
  }
  if (owners.size === 0) return { ok: false, reasonKey: "ask.nobody" };
  if (owners.size > 1) return { ok: false, reasonKey: "ask.twoOwners" };
  const to = [...owners][0];
  if (to === seat) return { ok: false, reasonKey: "ask.yours" };
  const player = state.players.find((p) => p.seat === to);
  return {
    ok: true,
    to,
    toName: player?.name && player.name.length > 0 ? player.name : `Mayor ${to}`,
    tiles: count,
    // **One tile is not "1 tiles".** The catalogue has no plural machinery —
    // `hud.residents` is "{count} residents" and says "1 residents" too — and
    // inventing one here would be a second rule for the rest of the game to
    // disagree with. Two keys is the smallest honest fix, and it is here rather
    // than in the panel so it is tested; the general gap is filed as its own
    // item.
    whatKey: count === 1 ? "ask.what.one" : "ask.what",
  };
}
