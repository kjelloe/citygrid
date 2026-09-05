// Deterministic per-id and per-tile hashes.
//
// Everything cityviewer varies — a building's variant, its roof, the side of
// the road a lamp stands on — is a function of an integer that is already in
// state and one of these. Nothing is remembered, saved, replayed or agreed
// between clients (ruling 032); the world looks varied because the hash is
// stable, not because the variation is stored.

/** A well-spread value in [0, 1) for an integer. */
export function pseudo(n) {
  let h = ((n + 1) * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 8) / 0xffffff;
}

/** A second hash with a salt, for the several independent choices one index
 * has to make — a tile that rolls "lamp or car" and then "which side". */
export function jitter(index, salt) {
  let h = (((index + 1) * 2654435761) ^ (salt * 40503)) >>> 0;
  h ^= h >>> 13;
  return (h >>> 8) / 0xffffff;
}
