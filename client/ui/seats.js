// What a seat is called (X3b).
//
// Three panels needed this within a week — the territory legend, the inbox and
// the alert list — and each had its own copy of the same four lines, which is
// the `VARIANTS` shape with names instead of numbers. One place, so a change to
// the fallback changes it everywhere.
//
// The fallback is the ROOM's: `server/room.js` calls an unnamed joiner
// `Mayor <seat>`, and a seat visible on the map must never be nameless in a
// panel that is about it.

import { OWNER_NATURE, OWNER_COMMONS } from "../../engine/constants.js";
import { buildingAt } from "../../engine/permissions.js";

export function seatName(state, seat) {
  const player = state?.players?.find((p) => p.seat === seat);
  return player?.name && player.name.length > 0 ? player.name : `Mayor ${seat}`;
}

const nobody = (owner) => owner === OWNER_NATURE || !(owner > 0);

/**
 * Whose ground this is, named — the owner of the first tile in `tiles` that
 * belongs to somebody other than `actor`, or `undefined` if none does.
 *
 * **The second question asked about a seat** (X5 item 1). `result.notOwner` is
 * "That belongs to {player}", `hud.js` renders every answer the reducer gives
 * through one line, and `t()` leaves an unfilled token in the output by design
 * — so a refusal showed the player its own template, and
 * `smoke-X3b-territory.png` is the screenshot of it.
 *
 * A drag is a rectangle and the world is not: bare land and the actor's own
 * ground are in the selection too, and neither is who the refusal is about.
 *
 * **Ground belongs to somebody in two ways**, and `engine/permissions.js`
 * refuses on both: the tile's owner, and — on the commons, where anyone may
 * build and only the builder may remove — the BUILDING's. A name taken from the
 * tile alone would leave the brace on screen in exactly the case §25's civil
 * channel exists for.
 */
export function otherOwnerName(state, tiles, actor) {
  for (const index of tiles ?? []) {
    const owner = state.tiles.owner[index];
    if (owner === OWNER_COMMONS) {
      const building = buildingAt(state, index);
      if (building && building.owner !== actor) return seatName(state, building.owner);
      continue;
    }
    if (nobody(owner) || owner === actor) continue;
    return seatName(state, owner);
  }
  return undefined;
}
