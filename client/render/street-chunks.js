// The street-chunk cache (slice E2; spec §6.4).
//
// L3 is the level where a chunk stops being instanced pools and becomes one
// baked group. Baking is a few milliseconds, so it cannot happen for the whole
// city in a frame — and it does not have to. **One build per frame, nearest
// first**, with the L2 pools covering everything until a chunk lands; a chunk
// is rebuilt only when its content hash moves; a chunk that leaves the radius
// is disposed after a grace period so panning along a street does not thrash.
//
// E2 ships a placeholder builder — one slab per lot at its seat — so the
// mechanism is visible and measurable. E3 and E5 replace the content, not the
// machinery.

import { createBaker } from "./baker.js";
import { chunkHash, chunksNear, CHUNK } from "../world/chunks.js";
import { PALETTES } from "./palettes.js";
import { bakeStreets } from "./streets-l3.js";
import { getConfig } from "../world/config.js";
import { nextBuild, expired } from "./streaming.js";

/** How long a chunk outside the radius is kept before its geometry goes.
 *
 * Panning a street back and forth across a boundary would otherwise rebuild the
 * same chunk every second — the grace is what makes the cache a cache. */
const GRACE_MS = 2000;

export function createStreetChunks(scene, options = {}) {
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  /** chunkKey → { hash, group, cx, cy, seen } */
  const live = new Map();
  let built = 0;
  let lastBuildMs = 0;

  function bake(state, model, cx, cy) {
    const baker = createBaker(styleName);
    // E2 baked a placeholder slab per lot so the mechanism could be measured;
    // E3 puts the street there instead — carriageway, kerbs, pavements,
    // junction boxes and the wire runs above them, all draped on the height
    // field (spec §5.2).
    bakeStreets(baker, state, model, cx, cy, palette);
    return baker;
  }

  return {
    /**
     * Brings the cache one step closer to what the view wants. At most one
     * chunk is built per call — the budget for a frame is a frame.
     */
    update(state, model, view, plan, now = 0) {
      // A COUNT, not a radius (ruling 040: Low none, Medium 4, High 9). Nine
      // chunks is a 3×3 block around the camera, which at 16 tiles a chunk and
      // 20 m a tile is about a thousand metres of street — the range E5's
      // budget is specified against.
      const budget = plan?.streetChunks ?? 0;
      if (budget <= 0) {
        // The tier does not allow street chunks at all (Low). Drop everything
        // immediately rather than holding geometry nothing will draw.
        for (const [key, entry] of live) {
          scene.remove(entry.group);
          createBaker(styleName).dispose(entry.group);
          live.delete(key);
        }
        return { built: 0, live: 0, triangles: 0, buildMs: 0 };
      }

      const radius = Math.max(1, Math.ceil(Math.sqrt(budget) / 2));
      const wanted = chunksNear(view, radius, state.width, state.height).slice(0, budget);
      const wantedKeys = new Set(wanted.map((c) => c.key));

      for (const c of wanted) {
        const entry = live.get(c.key);
        if (entry) entry.seen = now;
      }

      // Which chunk to build, and which to let go, are decided in
      // `streaming.js` — pure, and therefore tested, which nothing in this file
      // can be (it imports three).
      let didBuild = 0;
      const next = nextBuild(wanted, live, (c) => chunkHash(state, c.cx, c.cy));
      if (next) {
        const { chunk, hash } = next;
        const started = Date.now();
        const baker = bake(state, model, chunk.cx, chunk.cy);
        const group = baker.build();
        lastBuildMs = Date.now() - started;
        const old = live.get(chunk.key);
        if (old) { scene.remove(old.group); baker.dispose(old.group); }
        // Baked in METRES; the scene is in tile units until the camera moves
        // (V5 left that boundary where it was).
        group.scale.setScalar(1 / getConfig().tileM);
        scene.add(group);
        live.set(chunk.key, { hash, group, cx: chunk.cx, cy: chunk.cy, seen: now, triangles: baker.triangles });
        built += 1;
        didBuild = 1;
      }

      for (const key of expired(live, wantedKeys, now, GRACE_MS)) {
        const entry = live.get(key);
        scene.remove(entry.group);
        createBaker(styleName).dispose(entry.group);
        live.delete(key);
      }

      let triangles = 0;
      for (const entry of live.values()) triangles += entry.triangles;
      return { built: didBuild, live: live.size, triangles, buildMs: lastBuildMs, total: built };
    },

    /** Everything goes: a new world is a new set of chunks. */
    clear() {
      const baker = createBaker(styleName);
      for (const entry of live.values()) {
        scene.remove(entry.group);
        baker.dispose(entry.group);
      }
      live.clear();
    },

    get size() { return live.size; },

    /** Which chunks are actually baked right now. The instanced pass draws the
     * L2 street furniture everywhere EXCEPT here, so the two never double up —
     * and it asks the cache rather than the plan, because a chunk the plan
     * wants at L3 has not been baked until the frame that bakes it. */
    get keys() { return new Set(live.keys()); },
  };
}
