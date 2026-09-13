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

## 6.2b House furniture (S9, 2026-09-11)

*Kjell, P61: "houses need more details."* Every house was a correct house and no house was
anybody's. `client/world/house-spec.js` adds the furniture — a chimney and its pot, dormers from
level 2, a skylight, a downpipe, a plinth, clapboard and brick courses, shutters, a bay window, a
porch, a fanlight, a number plate, a garage door — all from `(id, storeys, variant)`, all through
the existing grammar, no new pipeline.

**Three rules came out of the budget, and they generalise.**

1. **Flat things are quads.** A course, a shutter, a fanlight, a number plate and a garage door
   have no thickness anybody can see: two triangles, not twelve. Built as boxes the furniture was
   276–348 a house and took the crowd frame from 289k to **370k of a 320k budget**; as panels it
   is **126 a house** with every part still on it.
2. **Per-house detail is a chunk-rank decision.** The furniture is baked into the **three nearest
   chunks** (`FURNISHED` in `street-chunks.js`), salted into the chunk hash the way the territory
   overlay is. A rank rather than a pixel threshold, because `chunksNear` already orders by
   distance and a threshold would rebake on every zoom.
3. **Anything that sits on a roof must use `ridgeRise()`.** The roof is built on a box expanded by
   the eave, so a ridge computed from the wall span alone is 0.4 m short — and a chimney sized to
   it is buried in the slope, which no test that checks "nothing is in the sky" can see.

Measured: per chunk **269,940 → 282,474** over 8 chunks (+4.6%); the crowd frame **289,446 →
301,980 of 320,000**; chunk bake p95 6 ms. Shots: `reports/smoke-S9-{street,garden,city20}.png`
from `tools/house_shots.mjs`.

## 6.1b Twelve civic definitions, and buildings that age (S1/B2, 2026-09-11)

`client/world/civic-spec.js` holds one shape per catalogue definition as a list of **masses** in
unit space — x and z in [-1, 1] across the lot, y in units of the lot's height — so one description
serves a 1×1 water tower and a 3×3 hospital, and the instanced box and the baked facade read the
same one. A civic building's "variant" is its definition's INDEX, which is what lets the instanced
pass keep its `civic<n>` pool keying. `civicSpin(lot.frontage)` turns a shape so its entrance faces
the street; the masses are authored with the front on +z.

`client/world/age.js` answers what a record LOOKS like: the phase (site, standing, abandoned), the
build progress, the grime multiplier, the boarded fraction, whether the garden has gone, and the
share of windows lit at night. Two rules came out of building it:

1. **A missing clock means STANDING.** `buildingParams` takes the tick; with a default of 0 and a
   `builtTick` of 0 every building in a fresh city became a 10%-height shell.
2. **The chunk hash carries a QUANTISED visual key.** Condition and occupancy move most ticks, so
   hashing them rebakes half the city every month; ignoring them leaves a building pristine as it
   decays. `visualKey` buckets to five steps of progress, eight of grime, four of boarding and
   eight of lighting.

And one for anything that stands on the ground: **a building's own ground is not a lid.** The
park's lawn at the full lot covered every ground pixel of its tile, and an overlay is a texture on
the ground (ruling 041), so a park showed no pollution at all.

## 6.1c The density ladder (S10, 2026-09-11)

A residential lot is a FORM, not a building. `client/world/homes.js` answers what a lot of a given
size draws at a given level — detached houses at level 1, semis or a terrace at 2, low flats at 3,
the block at 4 and above — in lot-local `u` (along the frontage) and `v` (back from the street).
`houseLots(lot, level)` maps that to sub-lots in world metres, and a sub-lot is a lot: the facade
grammar, the house furniture and the props all work on it unchanged, and the instanced pass pushes
one box per house from the same function.

**`storeys = 1 + level` applies from level 3 only.** Below it the form decides, which is where the
14 m × 34 m three-storey slab came from.

**The sizes are in metres and the placement is in fractions.** A form expressed only in fractions
gives a 34 m lot a 34 m house; one expressed only in metres cannot be turned to face a frontage.

Measured: street chunks 282,474 → 275,248 over 8 (smaller houses are less wall); the crowd frame
301,980 → 329,464 of the 400,000 High budget, because the instanced pass draws two to four boxes
where it drew one.

## 6.1d Civic materials, and the chunk under the camera (S1b, 2026-09-12)

Every civic mass names a **material** — brick, concrete, steel, white, red, glass, tank, dark, lawn
— which `palettes.js` resolves per style for the baked facade and `shadeOf` turns into a per-vertex
multiplier for the instanced box. A definition made of one material is the defect S1 shipped: from
the pavement it reads as a warehouse. The name on the sign comes from the game's own catalogue
lookup, or from `defaultName` in a harness that has no catalogue.

**And the street cache culled the chunk the camera was standing in.** `inView` samples a chunk's
centre and its four corners against the visible bounds; for the chunk containing the eye, the near
corners are behind it and the far ones are wide of the field, so all five fail while the ground in
front of the player is in view. The nearest buildings were drawn as instanced boxes in every
street-level screenshot this project has taken. `holdsCamera` fixes it, and the cache now reports
which chunk KEYS are live rather than only how many.

Measured: street chunks 275,248 → 226,232 over 8 live with 9 groups; the crowd frame 329,464 →
310,885 of 400,000; bake p95 5 ms.

## 6.1e The board on the building (R5, 2026-09-13)

**The name board is on the building.** S1b hung it on the LOT's street edge at `groundH × 0.9`,
and a civic building is set back inside its lot — so it stood in the front garden, edge-on and
unlit, a black bar in the air. `civicSignFace(def, ux, uz, heightM)` in `civic-spec.js` chooses,
in unit space, the street face (+z) of the mass nearest the frontage — a wall at least 3 m wide,
in the front of the lot (z ≥ 0.3: a water works' control building behind its tanks held a board
that was unhidden straight on and hidden from anywhere a person stands), not a drum, a door or a
lawn — and puts a board up to 4 m by 1 m near its top, above anything that
stands in front of it (a fire station's doors). Where no wall faces the street — a park, a turbine,
a water tower, a solar plant's yard — it is on a post beside the entrance, the post a mass added to
the baked building. `facade-spec.js` maps it into metres through `civicPointOnLot`, the function
the rotor and the smoke are posed by, so it is on the wall the baker built at every quarter turn.

**The stacks are on the halls.** Beside it, a drum is a silo from the pavement; the coal plant's two
and the gas plant's one stand on their hall's roof now, and still clear it by its own height. The
hospital's entrance is a glazed bay one bay wide (it was 1.1 of the unit — a 33 m strip of dark
glass on a 3×3 hospital), and the fire station's bay is a little taller so the board fits over
the doors.

**Every board was black.** `makeMaterial` turns `vertexColors` on for every style — the baker
bakes colour into vertices — and the sign geometry had no colour attribute, so each fascia and each
civic board was multiplied by black: a dark rectangle with its name painted on it in dark. Since R2
made signs use the style's material, no shop in the city had a readable name. The sign geometry
carries white vertex colours now.

**The pale band across every house was the ground-floor band**, not the plinth or the lawn quad
the review guessed: `buildFacade` rings every building at the top of its ground floor with a box in
the trim's cream, 0.18 m deep and 0.1 m proud, and on a house that is a pale strip from the
pavement. `floorBand(spec, trim)` makes it a course on a house — a shade of its own wall, 0.1 m
deep, 0.04 m proud — and keeps the trim line on a shop, where it is the fascia's shelf.

**The lawn quad is not drawn on a baked lot** either: its lift is 0.055 of a tile, at street scale
1.1 m, and it lay over a baked park's own lawn and path. What S5 stood on it (benches, a pond, beds,
sheds) comes down to the ground there.

**And the porch stood inside the house.** `atEdge` moves INWARD for a positive depth, and S9 placed
the canopy and its post at `+depth`: half of each was inside the wall. Outward now, and turned with
the wall it is on (`upright` is axis-aligned).

## 6.6b Trees at eye height (V8, 2026-09-07)

The instanced kit is a trunk and a four-sided cone, and at eighteen pixels a tile that is right.
It was also what a walker was standing under, because the tree pass was the one thing in
`updateInstances` never gated on whether its chunk had been baked — close up, a four-sided cone
is a pyramid.

`client/render/trees-l3.js` builds a trunk and a cluster of faceted blobs into the chunk baker
(Higashiyama's rule: **never a billboard**), so a wood is part of the chunk's one draw call and
follows the ground for free. Three species that differ in SHAPE and not in tint — a tapered
conifer, one round crown on a bare trunk, and a fork with two — because V6's lesson is that two
variants which hash the same are a city of clones.

**Where** a tree stands is `client/world/foliage.js`, read by BOTH passes. Two copies of "a tree
is at `jitter(index, 7)` across the tile" is a tree that jumps sideways the moment its chunk
bakes and jumps back when the player walks away, and nothing goes red for it.

A blob has **five** sides, and it had seven: seven put 21,336 triangles into the saturated
fixture's eight baked chunks and took the night frame's ladder from "detail dropped" to
"silhouettes only" — the trees were being paid for in buildings.

## 6.6c Trees, gardens and parks (S5, 2026-09-13)

**Six species, by the ground and the lot.** `TREE_KINDS` in `client/world/foliage.js` is the one
list; the kit's `TREE_VARIANTS` is its length, so a species is never a pool nothing draws (V6's
lesson). A wild tree's species is a function of the terrain round its tile and a hash, nothing
else (`wildSpecies`): a **willow** where it meets water or shallows, a **conifer** where it meets
rock, otherwise one of the wood's three by the same hash over three it always used — no existing
wood changed. Some unzoned grass on a shore carries a willow too. A lot plants the rest: a
**street tree** in a pit on the pavement in front of a shop (frontage ≥ 8 m, placed by the door
point, shifted along the frontage), an **orchard** row of three across a third of small houses'
back gardens, and a **ring** round a park that leaves its path clear. Faceted blobs at both zooms,
never billboards.

**One list per model.** `treesFor(state, model)` derives every tree once and caches it on the
model; the instanced pass, the street baker (`treesIn(…, model)`) and the estimate
(`countScene(…, forest)`) all read it. Without a model `treesIn` is still the wild scan, and the
test holds the two to the same wild trees.

**Back gardens** (`backGardens(lot)`): per house, the strip between the back of the house and the
back of the lot. A one-tile lot leaves about two metres: a flower bed along the house and, on half
of them, a small shed (1.8 by 1.4 m). An orchard wants six metres, so only deep lots grow one.
A deep lot holds one house behind another, so a strip ends at the next house behind, not at
the lot's back (the first cut put the front house's shed inside the back one; the test that found
it holds every bed and shed outside every house). Beds and sheds are posed from the lot's metres,
before the baked-lot `continue`, so both zooms agree; a shed stands on `LAWN_TOP`, the lawn quad's
lift, and a bed 1.6 m off the back wall — at a metre the eaves hid it from every city camera.

**The lawn quad was scaled wrongly since V6**: `(w, h, 1)` where a flat quad's depth is its z, so a
two-deep lot's lawn was one tile deep at twice its lift, over the back garden. It is `(w, 1, h)`.
It is not drawn under a BAKED park, where it lay over the park's own lawn and path; an instanced
park keeps it, because the L2 civic mesh has one instance colour and a park unlawned is a grey slab.

**Fence types** (`fenceOf(building)`, by variant): the kit's picket on most, a hedge on two, a low
stone wall on the one that had nothing. At L2 the wall is the hedge slab, lower and in stone; at
L3 `props-l3.js` draws posts and a rail, a wall or a hedge on the same spans the colliders use.
A post every **three** metres: at 1.2 the pickets were most of the 10% more triangles an S5 chunk
baked (31.3k against S6's 28.3k), and the bake check's worst steady build read 9–10 ms against 8.
That check times only the frame that MERGES a chunk (`buildMs` is recorded on the finishing
frame), and its p95 over eight builds is the maximum: the same geometry read 7, 10 and 13 ms on
three runs while every chunk rebuilt warm in 3–5 ms. `budget_gate` logs each build's chunk, cold
and warm, so a red can be told from a stall. **Since R5 (A78)** `street-chunks.js` times every
phase, a chunk's cost is its worst phase, and the check bounds the warm rebuilds at p95 ≤ 8 ms and
the cold builds at 16 ms. The first run of it read what nobody had timed: the lot phase of a
furnished chunk at 9.7–11.6 ms warm and 17.5–23.9 ms cold (streets ≤ 11 ms, the merge ≤ 5). So the
lot phase runs **in slices**: `bakeLotFacades` builds facades until `LOT_SLICE_MS` (4 ms) is spent
and resumes on the next frame, and `bakeLotExtras` — props, trees, lamps, signs — has a frame of
its own. With the lots sliced the STREET phase was the worst frame (5.6–10.2 ms warm), so it goes
the same way: `bakeStreetCorridors` in slices, then `bakeStreetJoints` (junction boxes,
connectors, signals, wires). The geometry is the same; a chunk takes a few more frames to arrive.
The gate reads every draw for its cold builds too — most chunks now finish on one of the page's own
draws, and the first run counted 2 cold builds of 9. **And since S3b the p95 is over FRAMES** — every phase
of every warm rebuild, about 125 of them — not over the eighteen chunks' worst phases: with
eighteen samples the nearest-rank p95 IS the maximum, so one stall failed it again (14.6 ms once,
every other warm chunk 4.3–6.6), which is the thing A78 was written to end.

**A park** has two benches beside its path, a pond on half of them (`parkHasPond` — the item said
"a big one" and every park in the catalogue is one tile, so a rule on size alone was a pond
nothing drew) and its ring near the fence at 0.4 scale: at full size a one-tile park's ring met
in the middle and hid its own lawn. Its path, instanced, is the path pool in path colour — as a
part of the civic mesh it was a shade of the lawn. **Open:** a BAKED park's path does not show; the
builder draws it (S1's `concrete` mass), a few centimetres over the seat like its lawn, and the
ground there reads over both. The walkers go in: `nav.js` adds two `park` edges from the
nearer end of the pavement to the park's middle, a little apart, so a person who walks in on one
walks out on the other.

**Priced.** `countScene` counts the lot trees from the list, and each building's small extras —
S6's rotor, smoke and flag, a crane, fire smoke, a park's benches and pond, a house's bed and shed —
as ground props, by the same rules the instanced pass uses. And trees are charged only for the
chunks that are NOT baked (`loose`, like the markings and the networks): a baked chunk's trees are
in its own measured mesh and the instanced pass skips them. Charged in full, S5's lot trees put
city span 10 at 98,496 estimated against 78,053 drawn — 26%, the gate's one red.

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
