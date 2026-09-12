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

/** How many of the nearest baked chunks carry the houses' furniture (S9).
 *
 * Three: the one the camera is in and its two nearest neighbours, which at 16
 * tiles a chunk and 20 m a tile is the block a player can actually look at from
 * the pavement. `budget_gate` is what chose the number — eight was 50,000
 * triangles over a 320,000 frame. */
export const FURNISHED = 3;
import { PALETTES } from "./palettes.js";
import { bakeStreets, bakeLots } from "./streets-l3.js";
import { createGroundColour } from "../world/ground-colour.js";
import { getConfig } from "../world/config.js";
import { nextBuild, expired } from "./streaming.js";
import { inFootprint, inBounds } from "./lod.js";

/** How long a chunk outside the radius is kept before its geometry goes.
 *
 * Panning a street back and forth across a boundary would otherwise rebuild the
 * same chunk every second — the grace is what makes the cache a cache. */
const GRACE_MS = 2000;

/** Is any part of this chunk inside what the camera can see? The same "any
 * corner or the centre" rule `countScene` uses for the terrain, because they
 * are the same chunks. */
/** Is the camera standing IN this chunk?
 *
 * `inView` samples a chunk's centre and its four corners against the visible
 * bounds, and every one of them can be outside the wedge while the chunk's
 * interior — the ground the player is standing on — is inside it: north of the
 * eye is behind the camera, and the far corners are wide of a 60° field. So the
 * chunk under the camera was culled, never baked, and the buildings closest to
 * the player were drawn as instanced boxes.
 *
 * That is why twelve civic screenshots were taken of the L2 kit believing they
 * were of the L3 facade, and why the S1 review's "the baked path is reached"
 * probe (a 360-triangle drop) was reading the roads, not the building (S1b).
 */
function holdsCamera(chunk, view) {
  const x = view?.targetX;
  const z = view?.targetZ;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return x >= chunk.cx * CHUNK && x < (chunk.cx + 1) * CHUNK
    && z >= chunk.cy * CHUNK && z < (chunk.cy + 1) * CHUNK;
}

function inView(chunk, bounds) {
  const x0 = chunk.cx * CHUNK;
  const z0 = chunk.cy * CHUNK;
  const test = bounds.footprint
    ? (x, z) => inFootprint(bounds, x, z)
    : (x, z) => inBounds(bounds, x, z);
  return test(x0 + CHUNK / 2, z0 + CHUNK / 2)
    || test(x0, z0) || test(x0 + CHUNK, z0)
    || test(x0, z0 + CHUNK) || test(x0 + CHUNK, z0 + CHUNK);
}

export function createStreetChunks(scene, options = {}) {
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  /** chunkKey → { hash, group, cx, cy, seen } */
  const live = new Map();
  let built = 0;
  let lastBuildMs = 0;

  /** A bake in progress. One PHASE a frame, not one chunk a frame.
   *
   * E2's placeholder took a millisecond and E3's streets seven; adding E5's
   * facades took a chunk to 15 ms against an 8 ms budget, which on a 16 ms
   * frame is a visible hitch every time the player walks into a new block.
   * The work splits cleanly in two — the street is one pass over the corridors,
   * the buildings another over the lots — and neither half is worth showing on
   * its own, so the group is published only when both are done. */
  let pending;

  /** Is the territory overlay showing? It changes what colour a baked building
   * is painted without changing a tile, so it is a salt on the chunk hash
   * rather than something the bake can read for itself (slice V7, A44). */
  let territory = false;
  /** Which chunks are near enough to carry the houses' furniture (S9).
   *
   * A COUNT of the nearest, not a distance: `chunksNear` already orders by
   * distance to the target, so the rank is stable — it changes when the player
   * moves a chunk, not every time the camera breathes, which is what a pixel
   * threshold would have done to the bake queue. */
  let furnished = new Set();
  /** The ground module, for the verge's colour (A38). Built once per world:
   * `natural()` reads the terrain layer, which a build action does not move. */
  let ground;

  const PHASES = [
    (baker, state, model, cx, cy) => bakeStreets(baker, state, model, cx, cy, palette, ground),
    (baker, state, model, cx, cy) =>
      bakeLots(baker, state, model, cx, cy, palette, styleName, options.locale ?? "en", territory,
        furnished.has(`${cx},${cy}`), options.buildingName),
  ];

  return {
    /**
     * Brings the cache one step closer to what the view wants. At most one
     * chunk is built per call — the budget for a frame is a frame.
     */
    update(state, model, view, plan, now = 0, bounds = undefined, showTerritory = false) {
      territory = showTerritory === true;
      ground ??= createGroundColour(state, palette);
      // A COUNT, not a radius (ruling 040: Low none, Medium 4, High 9). Nine
      // chunks is a 3×3 block around the camera, which at 16 tiles a chunk and
      // 20 m a tile is about a thousand metres of street — the range E5's
      // budget is specified against.
      const budget = plan?.streetChunks ?? 0;
      if (budget <= 0) {
        // The tier does not allow street chunks at all (Low). Drop everything
        // immediately rather than holding geometry nothing will draw.
        pending = undefined;
        for (const [key, entry] of live) {
          scene.remove(entry.group);
          createBaker(styleName).dispose(entry.group);
          live.delete(key);
        }
        return { built: 0, live: 0, triangles: 0, buildMs: 0 };
      }

      const radius = Math.max(1, Math.ceil(Math.sqrt(budget) / 2));
      // ON SCREEN first, then nearest (R2). `chunksNear` orders by distance to
      // the orbit target, and under perspective at a low pitch the chunks
      // around the target include the ones BEHIND the camera — so the cache
      // spent its budget baking a block the player had walked past.
      const near = chunksNear(view, radius, state.width, state.height);
      const visible = bounds
        ? near.filter((c) => holdsCamera(c, view) || inView(c, bounds))
        : near;
      const ranked = visible.length > 0 ? visible : near;
      const wanted = ranked.slice(0, budget);
      const wantedKeys = new Set(wanted.map((c) => c.key));
      // The three nearest carry the furniture. Thirty houses a chunk at 126
      // triangles each is 3,800 a chunk: on all eight that is 32,000 of a
      // 320,000 frame and `budget_gate` said no; on three it is 11,000, and a
      // shutter four chunks away is two pixels of the wall's own colour (S9).
      //
      // Ranked by DISTANCE, not by what this frame's budget let in. The flag is
      // part of a chunk's hash, so taking it from `wanted` meant a frame the
      // ladder squeezed below three chunks changed the hash of chunks it KEPT
      // — they rebaked, and rebaked again when the budget came back. Once the
      // street rung could shed more than one chunk (B4), `budget_gate`'s
      // territory check caught two such rebakes with nothing changing.
      furnished = new Set(ranked.slice(0, FURNISHED).map((c) => `${c.cx},${c.cy}`));

      for (const c of wanted) {
        const entry = live.get(c.key);
        if (entry) entry.seen = now;
      }

      // Which chunk to build, and which to let go, are decided in
      // `streaming.js` — pure, and therefore tested, which nothing in this file
      // can be (it imports three).
      let didBuild = 0;
      if (!pending) {
        const next = nextBuild(wanted, live,
          (c) => chunkHash(state, c.cx, c.cy, territory, furnished.has(`${c.cx},${c.cy}`)));
        if (next) pending = { ...next, baker: createBaker(styleName), phase: 0 };
      }
      if (pending) {
        const started = Date.now();
        if (pending.phase < PHASES.length) {
          PHASES[pending.phase](pending.baker, state, model, pending.chunk.cx, pending.chunk.cy);
          pending.phase += 1;
        } else {
          const { chunk, hash, baker } = pending;
          const group = baker.build();
          const old = live.get(chunk.key);
          if (old) { scene.remove(old.group); baker.dispose(old.group); }
          // Baked in METRES; the scene is in tile units until the camera moves
          // (V5 left that boundary where it was).
          group.scale.setScalar(1 / getConfig().tileM);
          scene.add(group);
          live.set(chunk.key, {
            hash, group, cx: chunk.cx, cy: chunk.cy, seen: now,
            triangles: baker.triangles, lamps: baker.lamps, signals: baker.signals,
          });
          built += 1;
          didBuild = 1;
          pending = undefined;
        }
        lastBuildMs = Date.now() - started;
      }

      for (const key of expired(live, wantedKeys, now, GRACE_MS)) {
        const entry = live.get(key);
        scene.remove(entry.group);
        createBaker(styleName).dispose(entry.group);
        live.delete(key);
      }

      let triangles = 0;
      for (const entry of live.values()) triangles += entry.triangles;
      // WHICH chunks are live, not only how many. Twelve civic screenshots were
      // taken of the instanced box believing they were of the baked facade,
      // and "3 live" could not tell anyone whether the building in front of the
      // camera was one of the three (S1b).
      return {
        built: didBuild, live: live.size, triangles, buildMs: lastBuildMs, total: built,
        keys: [...live.values()].map((e) => `${e.cx},${e.cy}`).sort().join(" "),
      };
    },

    /**
     * The model was rebuilt; the geometry was not necessarily wrong.
     *
     * A build action rebuilds the whole city model, and the cache used to be
     * cleared with it: nine chunks thrown away and re-baked one a frame, so
     * every road tile painted cost six frames of L2 (R1.5). `chunkHash` already
     * says which chunk changed, and `nextBuild` compares it every frame — so
     * all this has to do is stop the bake that is in flight, which was built
     * against the old model.
     */
    remodel() {
      pending = undefined;
    },

    /** Everything goes: a new world is a new set of chunks. */
    clear() {
      pending = undefined;
      ground = undefined;
      const baker = createBaker(styleName);
      for (const entry of live.values()) {
        scene.remove(entry.group);
        baker.dispose(entry.group);
      }
      live.clear();
    },

    get size() { return live.size; },

    /** Everything the cache is holding, for the night rig to find its lamps
     * in and for the budget to price. */
    entries() { return [...live.values()]; },

    /**
     * Dials every emissive bucket in every baked chunk (spec §7.3, E6).
     *
     * The baker put the lit windows and shopfronts in their own bucket with
     * their own material precisely so this is one number rather than a shader
     * patch — `intensity` 0 is noon and 1 is midnight.
     */
    setNight(intensity) {
      for (const entry of live.values()) {
        for (const mesh of entry.group.children) {
          const material = mesh.material;
          if (material?.emissive === undefined || !material.userData?.emissive) continue;
          material.emissiveIntensity = intensity;
        }
      }
    },

    /** Which chunks are actually baked right now. The instanced pass draws the
     * L2 street furniture everywhere EXCEPT here, so the two never double up —
     * and it asks the cache rather than the plan, because a chunk the plan
     * wants at L3 has not been baked until the frame that bakes it. */
    get keys() { return new Set(live.keys()); },
  };
}
