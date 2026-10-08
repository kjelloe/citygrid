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

export function seatName(state, seat) {
  const player = state?.players?.find((p) => p.seat === seat);
  return player?.name && player.name.length > 0 ? player.name : `Mayor ${seat}`;
}
