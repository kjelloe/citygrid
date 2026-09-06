// Chunk identity and order (slice E2; spec §6.4).
//
// A baked street chunk is expensive to build and cheap to keep, so the cache's
// whole value is knowing when a chunk has actually changed. The hash decides
// that, and it has exactly two failure modes: too sensitive, and every build
// action rebuilds the city; not sensitive enough, and a road appears under a
// chunk that never notices.
//
// The order decides the streaming: one build a frame, nearest first, with the
// L2 pools covering everything until a chunk lands.
//
// Pure, like the rest of `client/world/` (ruling 032).

import { getConfig } from "./config.js";

export const CHUNK = getConfig().chunkTiles;

/** A chunk's key. Chunk coordinates are small; a map is at most 128 tiles, so
 * eight chunks a side, and this leaves room for a great deal more. */
export function chunkKey(cx, cy) {
  return cy * 4096 + cx;
}

export function chunkOf(x, y) {
  return { cx: Math.floor(x / CHUNK), cy: Math.floor(y / CHUNK) };
}

/** FNV-1a over 32 bits. Cheap, well spread, and — unlike a sum or an xor —
 * sensitive to ORDER, so two tiles swapping values changes the answer. */
function fnv(hash, value) {
  let h = (hash ^ (value & 0xff)) >>> 0;
  h = Math.imul(h, 16777619) >>> 0;
  h = (h ^ ((value >>> 8) & 0xff)) >>> 0;
  return Math.imul(h, 16777619) >>> 0;
}

/**
 * What this chunk is made of, as one integer.
 *
 * The tile layers a chunk draws, plus the RECORDS of the buildings anchored in
 * it — a lot that grows a storey changes what is drawn without changing a tile,
 * so hashing `buildingId` alone would leave a stale chunk on screen.
 *
 * The chunk's own coordinates go in first: without them two identical empty
 * chunks share a hash, and a cache keyed by hash hands one chunk's geometry to
 * another.
 */
export function chunkHash(state, cx, cy) {
  const { width, height } = state;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(x0 + CHUNK, width);
  const y1 = Math.min(y0 + CHUNK, height);

  let h = fnv(2166136261, cx);
  h = fnv(h, cy);
  const { terrain, elevation, zone, road, buildingId } = state.tiles;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      h = fnv(h, terrain[i]);
      h = fnv(h, elevation[i]);
      h = fnv(h, zone[i]);
      h = fnv(h, road[i]);
      h = fnv(h, buildingId[i]);
    }
  }
  for (const b of state.buildings) {
    if (b.x < x0 || b.x >= x1 || b.y < y0 || b.y >= y1) continue;
    h = fnv(h, b.id);
    h = fnv(h, b.level);
    h = fnv(h, b.valueTier);
    h = fnv(h, b.w * 16 + b.h);
    h = fnv(h, b.zone);
    h = fnv(h, b.owner);
    h = fnv(h, b.flags);
  }
  return h;
}

/**
 * The chunks within `radius` chunks of the view's orbit target, nearest first.
 *
 * The order IS the streaming policy: one build a frame from the front of this
 * list means the chunk the player is looking at lands first and the rest arrive
 * as they become worth having.
 */
export function chunksNear(view, radius, mapWidth, mapHeight) {
  const centre = chunkOf(view.targetX, view.targetZ);
  const acrossX = Math.ceil(mapWidth / CHUNK);
  const acrossY = Math.ceil(mapHeight / CHUNK);
  const out = [];
  for (let cy = centre.cy - radius; cy <= centre.cy + radius; cy += 1) {
    for (let cx = centre.cx - radius; cx <= centre.cx + radius; cx += 1) {
      if (cx < 0 || cy < 0 || cx >= acrossX || cy >= acrossY) continue;
      const dx = (cx + 0.5) * CHUNK - view.targetX;
      const dy = (cy + 0.5) * CHUNK - view.targetZ;
      out.push({ cx, cy, key: chunkKey(cx, cy), distance: Math.hypot(dx, dy) });
    }
  }
  out.sort((a, b) => a.distance - b.distance || a.key - b.key);
  return out;
}
