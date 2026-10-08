// Whose city is which (X3b, Q61).
//
// The territory overlay has coloured buildings by their owner since V7 — the
// instanced half, the baked half and the chunk hash all honour
// `options.territory` — and until now **nothing in the interface could turn it
// on**. That is the oldest capability-with-no-control in the project.
//
// This module is the half that is not a button: §16's rule is **never colour
// alone**, and sixteen seats cannot be told apart by hue by a player who cannot
// see hue. The overlay's legend therefore NAMES each seat beside its swatch,
// and the names come from the state rather than from a table somebody has to
// keep in step with the roster. A pattern per seat is not available here the
// way it is for the band overlays — territory colours BUILDINGS, which already
// carry their own geometry — so the label is what carries the non-colour
// information, together with the inspector naming an owner on click.

import { PLAYER_COLOURS } from "../render/palette.js";
import { seatName } from "./seats.js";

/** The overlay's name, exported so the rail and `game.js` cannot disagree about
 * it: one puts it in the toolbar and the other turns it into
 * `draw({ territory: true })`, and a typo in either is a button that does
 * nothing. */
export const TERRITORY = "territory";

/**
 * One row per seat in the city, in seat order — a legend that reordered itself
 * between frames would be a legend nobody could learn.
 *
 * Nature is seat 0 and is never a row: `PLAYER_COLOURS[0]` is black and is
 * never drawn as an owner, so offering it would promise a colour the player
 * will never find.
 */
export function territoryLegend(state) {
  const rows = [];
  for (const player of state?.players ?? []) {
    if (!(player.seat > 0)) continue;
    rows.push({
      seat: player.seat,
      // One place for the fallback (`seats.js`), because three panels needed it
      // within a week and each had its own copy.
      name: seatName(state, player.seat),
      colour: PLAYER_COLOURS[player.seat] ?? PLAYER_COLOURS[0],
    });
  }
  return rows.sort((a, b) => a.seat - b.seat);
}
