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

import * as THREE from "three";
import { createBaker } from "./baker.js";
import { chunkHash, chunksNear, CHUNK } from "../world/chunks.js";
import { buildingParams } from "../world/params.js";
import { PALETTES } from "./palettes.js";

/** How long a chunk outside the radius is kept before its geometry goes.
 *
 * Panning a street back and forth across a boundary would otherwise rebuild the
 * same chunk every second — the grace is what makes the cache a cache. */
const GRACE_MS = 2000;

/** The placeholder: a lot's footprint as a thin slab at its seat. Flat, so it
 * is obviously not a building; visible, so the mechanism can be seen working;
 * and the right SIZE, so the triangle and draw-call numbers E3 and E5 will be
 * measured against mean something now. */
const SLAB = new THREE.BoxGeometry(1, 0.06, 1);

export function createStreetChunks(scene, options = {}) {
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  /** chunkKey → { hash, group, cx, cy, seen } */
  const live = new Map();
  const matrix = new THREE.Matrix4();
  let built = 0;
  let lastBuildMs = 0;

  function bake(state, model, cx, cy) {
    const baker = createBaker(styleName);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const tileM = model.tileM;
    for (const lot of model.lots) {
      // A lot belongs to the chunk its building is anchored in, so a lot that
      // straddles a boundary is baked once rather than twice.
      const b = lot.building;
      if (b.x < x0 || b.x >= x0 + CHUNK || b.y < y0 || b.y >= y0 + CHUNK) continue;
      const p = buildingParams(b, palette, palette.civic, false);
      const w = (lot.x1 - lot.x0) / tileM;
      const d = (lot.z1 - lot.z0) / tileM;
      matrix.makeScale(Math.max(w, 0.1), 1, Math.max(d, 0.1));
      matrix.setPosition(
        (lot.x0 + lot.x1) / 2 / tileM,
        lot.seat / tileM + 0.03,
        (lot.z0 + lot.z1) / 2 / tileM,
      );
      baker.add(SLAB, matrix, p.lawn ?? palette.lawn);
    }
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

      // One build, nearest first: the first chunk that is missing or stale.
      let didBuild = 0;
      for (const chunk of wanted) {
        const hash = chunkHash(state, chunk.cx, chunk.cy);
        const entry = live.get(chunk.key);
        if (entry) { entry.seen = now; if (entry.hash === hash) continue; }
        const started = Date.now();
        const baker = bake(state, model, chunk.cx, chunk.cy);
        const group = baker.build();
        lastBuildMs = Date.now() - started;
        if (entry) { scene.remove(entry.group); baker.dispose(entry.group); }
        scene.add(group);
        live.set(chunk.key, { hash, group, cx: chunk.cx, cy: chunk.cy, seen: now, triangles: baker.triangles });
        built += 1;
        didBuild = 1;
        break;
      }

      // And drop what has been outside the radius for the grace period.
      for (const [key, entry] of live) {
        if (wantedKeys.has(key)) continue;
        if (now - entry.seen < GRACE_MS) continue;
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
  };
}
