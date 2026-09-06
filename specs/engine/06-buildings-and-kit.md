# 06 - Buildings and the kit

## 6.1 Four levels, one parameter function

| Level | Geometry | Batching | Exists |
|---|---|---|---|
| L0 BLOCK | box + roof cap, 36 tris | instanced per (category, variant) | yes |
| L1 SHAPE | walls, roof form, chimney, stacks | instanced | yes |
| L2 FULL | + window grids, doors, balconies, fences, roof clutter, stepped roofs | instanced, 620 tris | yes |
| L3 STREET | + per-bay openings with reveals, storefront band, fascia sign, awnings, cornice or eave with overhang, gutters, downpipes, lit interiors | **baked per chunk**, cached | new |

L0-L2 stay exactly what `building-kit.js` is. The important design decision is that L3 is not
a fifth variant of the same instanced kit but a **different construction**: instead of scaling a
unit-height prototype by a matrix, it builds the *actual* building at its actual size on its
actual lot, the way `FacadeBuilder` and `machiya.js` do, because openings do not stretch. A
window is 1.2 m wide however tall the building is, and a storefront bay is 4 m however long the
frontage; the instanced kit cannot say that and the facade grammar can.

Both draw from the one parameter function in 04.5, so an L3 building is recognisably the same
house the L2 instance was: same variant, same roof hue, same wall colour, same chimney side.

## 6.2 The facade grammar, without JSON authoring

Union Square's `FacadeSpec` is authored per building by research agents. City Grid has no
research; the spec is *generated* from the parameters, and the builder consumes the same shape:

```
spec = {
  wall, base, groundH, floorH, floors, cornice, parapet, roof,
  edges: [{ edge: 'street', window, bayW, endPad, storefront }],
  storefronts: [{ from, to, module, sign }],   // commercial only
  extras: [...]                                 // balconies, fire escapes, ac units
}
```

per category (the same four the kit has, so the silhouette rule in art-direction §3.3 still
holds):

| Category | Ground band | Upper floors | Roof | Signature at L3 |
|---|---|---|---|---|
| Residential | door with a step, one or two windows, porch on variant 2 | window per bay, sill, reveal | gable / hip / stepped (variant), 0.6 m overhang, dormers | garden fence, hedge, path to the door |
| Commercial | glazed bays 4-6 m wide, fascia sign per tenant, awning by hash | strip or punched windows | flat with parapet, roof clutter | lit shopfronts at night, blade signs |
| Industrial | blank wall, roller door, loading canopy | high clerestory windows only | sawtooth or flat | yard fence, stacks, a skip |
| Civic | portico on posts, wide doors | tall windows, two rows | flat with deep parapet, tower or cupola on variant 0 | flag, steps, a sign board with the building's name |

Depth is **built outward** (Higashiyama KIT §10): a shopfront is the wall stopping short plus
piers, a header, a threshold and a lit backdrop; a window is a reveal of four inner faces plus
a backing panel. That is what `FacadeBuilder.reveal` and `panel` do and it is why those streets
have shadows in the openings.

## 6.3 Roofs

Higashiyama's `roof.js` returns baker-ready parts for gable, hip, hip-and-gable, shed, with
overhang and curvature. City Grid needs the European subset: gable, hip, mansard, flat with
parapet, sawtooth. The stepped roof the reference is recognised by (art-direction §3.3) is a
FULL-tier trick and stays at L2; at L3 the roof is a real pitched form with an eave that casts a
shadow line on the wall - the single most legible cue at eye height, and free.

## 6.4 The baker

`../fable51-worlds/kyoto-higashiyama/src/core/util.js: Baker` ported as `client/render/baker.js`:

- `add(geometry, matrix, colourHex, { bands?, transparent?, side?, emissive? })` writes the colour
  into a vertex attribute and buckets by shading signature.
- `build()` merges each bucket into one `BufferGeometry` and returns a `Group` - one mesh per
  material for the whole chunk.
- The merge is in-repo (no `BufferGeometryUtils`): concatenate `position`, `normal`, `color`,
  optionally `uv`, of non-indexed geometry. Fifty lines.
- One baker **per 16×16 chunk**, never per world: a merged mesh is one cull unit and one shadow
  caster.

Chunk cache: key = chunk index + the model's content hash for that chunk; a rebuilt chunk
disposes the old group. Build is synchronous and takes a few milliseconds per chunk at
Higashiyama densities; build at most one chunk per frame, nearest first, and let the L2 pools
cover the rest until it lands. That is Union Square's streaming (`World.stream`, 130 m cells)
with a build step instead of a visibility toggle.

## 6.4a As built (E2, 2026-09-06)

Four pieces, and the split between them is what makes three of the four testable in node —
three cannot be resolved there.

- **`client/render/merge.js`** is pure arithmetic over typed arrays: `{ position, normal, color,
  uv, matrix }` in, one set of buffers out. Not three geometries, because the failures worth
  catching are all arithmetic — a matrix applied to positions but not to normals, a colour
  written per geometry rather than per vertex, a `uv` present on some inputs and not others
  (half a uv buffer is worse than none).
- **`client/render/baker.js`** wraps it for three: `add(geometry, matrix, colour, options)`
  buckets by shading signature, `build()` merges each bucket into one mesh, `dispose(group)`
  frees one.
- **`client/world/chunks.js`** is pure: `chunkHash` is FNV-1a over the chunk's tile layers AND
  the records of the buildings anchored in it — a lot that grows a storey changes what is drawn
  without changing a tile. The chunk's own coordinates go in first, or two identical empty
  chunks share a hash and the cache hands one chunk's geometry to another.
- **`client/render/street-chunks.js`** is the cache: at most one build per frame, nearest
  first, rebuild only when the hash moves, dispose two seconds after a chunk leaves the radius
  so panning across a boundary does not thrash.

`streetChunks` is a **count**, not a radius (ruling 040: none / 4 / 9), and the ladder's first
rung drops the farthest one — it is the most expensive thing in the frame and the one the player
is least likely to be looking at.

The chunk size moved into `data/cityviewer.json` as `chunkTiles`. Three things key off it and
they have to agree: the terrain mesh's rebuild unit, the LOD's per-chunk plan, and the street
cache's bake unit.

Measured on the budget gate's saturated 96×96 at High, placeholder slabs: **9 chunks live, 9
groups / 9 meshes** — one draw call per chunk because one signature is in use — **5,184
triangles**, build **p95 1 ms** against an 8 ms budget, and **0 rebuilds** over six frames of an
unchanged city.

## 6.5 Materials, with no binary assets

Everything City Grid draws is flat colour with baked face shading, and ruling 022 chose that on
purpose. L3 adds two things without breaking it:

- **Signage and small texture** through Canvas2D at start-up, the Higashiyama way
  (`textures.js`): a fascia with text, a shop window with a display, a road-marking canvas, a
  window-grid alpha. Cached by key, shared by material so forty shops are one draw call; merged
  by `mergeByMaterial` because textured meshes cannot go through the vertex-colour baker.
- **Emissive buckets** for lit windows and shopfronts at night: the baker's signature includes
  `emissive`, so lit panels land in their own bucket with an emissive material whose intensity
  the time-of-day rig dials, like `Materials.setNight` in Union Square.

GLB modules (Union Square's `tools/bpl/`) would need `GLTFLoader` vendored and a generation
toolchain with Blender; Higashiyama shows an eye-height street that needs neither. D5.

## 6.6 Props

The prop pass in `instances.js` (lamps and parked cars by hash on paved tiles, tufts on grass)
grows into a declared list the model produces per corridor and lot - lamp every N metres
alternating sides, hydrant, bin, bench, meter, tree pit, bollard - the way Union Square's
`Props.build` walks the street specs. At L2 they stay instanced pools; at L3 they go through the
chunk baker so a lamp can also be a light position for the night rig (07).
