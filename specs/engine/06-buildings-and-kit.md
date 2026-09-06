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

## 6.2a As built (E5, 2026-09-06)

The spec is generated by `client/world/facade-spec.js` and built by
`client/render/facade.js`, both PURE — the second imports neither three nor a palette, colours
arrive in the spec. That is what lets node assert the things a screenshot cannot: that an opening
is a hole rather than a decal, that a window is 1.2 m wide on a six-storey block, and that nothing
but the eave reaches past the lot line onto the pavement the walker has to get down.

| Piece | Where | Note |
|---|---|---|
| `facade-spec.js` | `client/world/` | pure; mirrors `data/names.json` the way `config.js` mirrors `cityviewer.json` |
| `facade.js` | `client/render/` | pure; walls, reveals, bands, extras, and the roof |
| `roof-kit.js` | `client/render/` | pure; gable, hip, mansard, flat-with-parapet, sawtooth |
| `props-l3.js` | `client/render/` | pure; lamps, bins, hedges, the path to the door |
| `solid.js` | `client/render/` | pure; the growable triangle sink all four build into |
| `signs.js` | `client/render/` | the only part that touches three or a canvas |

**Measured** on the saturated 96×96 at High with 9 street chunks: **25.7k triangles a chunk**,
8 chunks live holding 205,864, **2 meshes a group** (the opaque bucket and the lit-window bucket),
build p95 **6 ms**. A facade costs 700–1,100 triangles: a five-storey shop 1,136, a house 862, a
shed 712, a two-storey civic block 438.

Three things that cost real triangles and were found by counting rather than by looking:

- **A wall is banded, not gridded.** Splitting a face at every opening's coordinate in BOTH axes
  gives 77 quads where 31 will do; the face is split into horizontal bands and each band split
  sideways only by the openings it actually crosses.
- **A reveal is one-sided.** Emitting both windings doubled the cost of every window in the city
  for a face nobody can see.
- **A chunk bake is two phases, not one.** E2's placeholder took 1 ms and E3's streets 7; adding
  facades took it to 15 against an 8 ms budget, which on a 16 ms frame is a hitch every time the
  player walks into a new block. The street pass and the lot pass run on separate frames and the
  group is published when both are done.

**The tier budgets moved** (`data/cityviewer.json`). 200k at High was set in V2, before L3
existed, and nine chunks of real facade is 200k on its own. Measured at street level on a
saturated city, a High frame is ~316k and a Medium one ~130k, so the budgets are now **320k High,
140k Medium**, Low unchanged at 40k because Low has no street chunks at all. The frame-time
governor is still what protects a device; the triangle budget only decides what to sacrifice.

## 6.6a As built (V6, 2026-09-06)

**Six silhouettes per category, not four**, and `VARIANTS` is now written down ONCE. It was in
`client/world/params.js` and again in `client/render/building-kit.js`; `variantFor` picks from the
first and `createInstances` builds a pool per variant from the second, so raising one and not the
other makes `pools[kind + variant]` undefined and every building of that variant silently stops
being drawn. The kit imports the model's number.

| Category | The two that V6 added | The one it separated |
|---|---|---|
| Residential | a semi-detached pair under one ridge; a tall narrow townhouse | — |
| Commercial | a corner block that steps back at the top; an arcade with a colonnade | 2 was a clone of 0 |
| Industrial | silos beside the shed; a monitor roof down the ridge | 2 was a clone of 0 |
| Civic | a hall behind a full colonnade; a stepped tower | 2 and 3 shared the `else` |

`client_smoke` hashes the vertex positions of every variant of every category and fails on a
duplicate. A triangle COUNT was the first version and gave false positives — residential 1 and 5
are different shapes with the same 316 triangles — and false negatives are the ones that matter
anyway: commercial 0 and 2 really were the same building.

**Fourteen house roofs and six flat ones**, up from eight and four. `test/kit.test.js` holds the
floor and requires three hue bands, because "more colours" that are all the same red is more of
nothing.

**A front garden is a setback.** The L2 box filled its tile, so a hedge and a path landed
underneath the house. Residential boxes are set back by `lot.setback.residential` — the same 3 m
E5's facade already leaves, so the box and the facade agree slightly better than before — and the
hedge stands on the lot line with the path crossing to the door. Measured on the 64-tile fixture:
198 lawns, 71 hedges and 71 paths at a wide zoom. At city zoom the hedge is one or two pixels and
mostly occluded; what reads there is the setback and the lawn, and the hedge is what E5's prop
pass draws properly at street level (**Q49**).

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

**Built (E5).** `signs.js` draws each shop name into a 256×64 Canvas2D at first use and caches it
by the string, so the eighteen names in `data/names.json` are eighteen textures for a whole city
however many shops there are, and one mesh per name carries every fascia in the chunk that says
it. Text shrinks to fit its board rather than being clipped. The signs ride in the baked chunk's
group so a chunk is still one cull unit, but they cannot go through the vertex-colour baker —
`baker.extra()` is the door they come in by.

Lit windows land in an `emissive` bucket at build time (about a third of them, by hash), with
intensity 0 until E6 turns it up.

GLB modules (Union Square's `tools/bpl/`) would need `GLTFLoader` vendored and a generation
toolchain with Blender; Higashiyama shows an eye-height street that needs neither. D5.

## 6.6 Props

The prop pass in `instances.js` (lamps and parked cars by hash on paved tiles, tufts on grass)
grows into a declared list the model produces per corridor and lot - lamp every N metres
alternating sides, hydrant, bin, bench, meter, tree pit, bollard - the way Union Square's
`Props.build` walks the street specs. At L2 they stay instanced pools; at L3 they go through the
chunk baker so a lamp can also be a light position for the night rig (07).
