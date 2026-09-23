// What is behind a window (slice S7).
//
// A facade at eye height was a grid of flat rectangles: every opening got one
// backing panel, in glass or in lamplight, and nothing else. The difference
// between a window and a painted rectangle is that something is behind it —
// a curtain half drawn, a blind pulled down, a shop's shelves.
//
// Decided here so it is a function of the building and the opening and nothing
// else: the baked facade is the only thing that draws it today, but a window
// that changes when you look away is worse than a flat one, and the same rule
// has to hold between two players' cities (ruling 032).

import { jitter } from "./hash.js";

/** How far behind the glass the dressing sits, metres. Less than the reveal's
 * own depth, so it reads as inside the opening rather than as a second pane. */
export const INSET = 0.05;

/** Three tones, because a street of one curtain colour is a hotel. */
export const CURTAIN_TONES = 3;

/** How far down a blind comes, at the extremes. */
export const BLIND = { least: 0.25, most: 0.8 };

const KINDS = ["curtain", "blind", "open"];

/**
 * What is behind one opening: `{ kind, tone, drop }`.
 *
 * `kind` is "shop" for a storefront, and otherwise a curtain, a blind or an
 * empty room. `tone` picks one of `CURTAIN_TONES`; `drop` is how far a blind
 * has come down, as a share of the opening.
 */
export function windowTreatment(id, hole) {
  if (hole.shop) return { kind: "shop", tone: id % CURTAIN_TONES, drop: 0 };
  if (hole.door) return { kind: "open", tone: 0, drop: 0 };
  const seed = id * 31 + (hole.floor ?? 0) * 7 + (hole.bay ?? 0) * 3;
  const roll = jitter(seed, 17);
  // Rather more curtains than blinds, and a third of the windows show the room
  // behind them — which is what makes the ones with something in them read.
  const kind = roll < 0.45 ? KINDS[0] : roll < 0.68 ? KINDS[1] : KINDS[2];
  return {
    kind,
    tone: Math.floor(jitter(seed, 23) * CURTAIN_TONES) % CURTAIN_TONES,
    drop: kind === "blind" ? BLIND.least + (BLIND.most - BLIND.least) * jitter(seed, 29) : 0,
  };
}

/**
 * Is this window lit?
 *
 * The share comes from the building's occupancy (B2), and which windows are
 * lit stays put between frames and between cities. Moved here from the baker
 * so the rule can be tested and so the dressing and the light agree: a lit
 * window with a curtain across it is a glow, not a pane.
 */
export function windowLit(id, hole, share) {
  if (hole.door) return false;
  if (hole.shop) return true;
  const pick = ((id * 7 + (hole.floor ?? 0) * 13 + (hole.bay ?? 0) * 5) % 100) / 100;
  return pick < share;
}
