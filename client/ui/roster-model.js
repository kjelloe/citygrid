// Who is in the room (X4, slice 5.4).
//
// `CMD_LEAVE` and `CMD_SET_STATUS` have had reducer handlers since Wave 0 and
// no control; their events, `seatLeft` and `seatStatus`, are declared invisible
// in the event census "pending the roster". This is the roster, and it is the
// last two commands' control.
//
// **Built from `state.players`, not from a wire message.** Seat, name and
// status are hashed state and every client already has them, identically — a
// `S2C.ROSTER` carrying the same thing would be a second source for one fact,
// and the two would disagree on the day one of them was forgotten. What the
// state does NOT know is whether a socket is open; that is the server's, it is
// not deterministic, and it belongs with regency.

import { PLAYER_ACTIVE, PLAYER_AFK, PLAYER_REGENT, PLAYER_GONE } from "../../engine/constants.js";
import { PLAYER_COLOURS } from "../render/palette.js";
import { seatName } from "./seats.js";

export const ROSTER_ACTIONS = Object.freeze({
  AWAY: "away",
  BACK: "back",
  LEAVE: "leave",
});

/** Each action's label, spelled out — a key built as `roster.${action}` is
 * invisible to `test/reachability.test.js`'s scan, which is how `inbox.approve`
 * and all seven ping labels read as dead strings while they were on screen. */
export const ROSTER_LABELS = Object.freeze({
  [ROSTER_ACTIONS.AWAY]: "roster.away",
  [ROSTER_ACTIONS.BACK]: "roster.back",
  [ROSTER_ACTIONS.LEAVE]: "roster.leave",
});

/** One word per status, and four different ones: playing, away, run by the
 * deputy, gone. A roster that called three of them "here" would answer the
 * question wrongly in the two cases somebody is actually asking it. */
const STATUS_KEYS = {
  [PLAYER_ACTIVE]: "roster.status.active",
  [PLAYER_AFK]: "roster.status.away",
  [PLAYER_REGENT]: "roster.status.regent",
  [PLAYER_GONE]: "roster.status.gone",
};

/**
 * One row per seat, in seat order — the territory legend's rule, and for the
 * same reason: a list that reorders itself between frames cannot be learned.
 *
 * The actions are **your own and only yours**. Kicking somebody is the host's
 * and is X4's; a button the reducer would refuse is a lie told by the
 * interface (CLAUDE.md: permission checks live in the reducer).
 */
export function rosterFor(state, seat) {
  const rows = [];
  for (const player of state?.players ?? []) {
    if (!(player.seat > 0)) continue;
    const you = player.seat === seat;
    const actions = [];
    if (you && player.status !== PLAYER_GONE) {
      actions.push(player.status === PLAYER_AFK ? ROSTER_ACTIONS.BACK : ROSTER_ACTIONS.AWAY);
      actions.push(ROSTER_ACTIONS.LEAVE);
    }
    rows.push({
      seat: player.seat,
      name: seatName(state, player.seat),
      colour: PLAYER_COLOURS[player.seat] ?? PLAYER_COLOURS[0],
      status: player.status,
      statusKey: STATUS_KEYS[player.status] ?? STATUS_KEYS[PLAYER_ACTIVE],
      you,
      actions,
    });
  }
  return rows.sort((a, b) => a.seat - b.seat);
}
