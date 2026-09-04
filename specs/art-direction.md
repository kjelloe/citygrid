# City Grid — art direction

**Status: framework only. The style itself is blocked on probe 1.2b** (`plan-v1.md`), and no
production asset is made before it is settled. What follows is everything that is decided
regardless of which candidate wins, plus the brief the probe has to answer.

---

## 1. Decided already

### 1.1 Pipeline (ruling 006)

Four-angle camera rotation is a hard requirement, so v1 is the **mesh pipeline**: procedurally
baked low-poly meshes, free rotation, continuous zoom, one texture atlas. A drawn-sprite pipeline
would need four sprite sets per building state and is post-v1 only, contingent on an artist.

### 1.2 One style ships (ruling 005)

One coherent art set, not two half-finished ones. `client/render/` implements a `RenderStyle`
interface so a second style is additive later, and because rendering is entirely local, style is a
per-viewer preference — two players can eventually view the same region differently.

### 1.3 Assets are baked, not hand-modelled

`tools/build_assets.mjs` generates meshes procedurally into a glTF library plus an atlas, with the
manifest width pinned by test. A style change is therefore a re-bake, not a re-modelling job. An
asset gallery page renders every asset through the real renderer at rest pose so visual work is
screenshot-diffable in CI rather than eyeball-reviewed.

### 1.4 Silhouette first

A building must be identifiable at phone size, at the default zoom, from all four angles, with the
territory overlay on. Category reads from silhouette; development level reads from height; value
tier reads from roof and material. If it only reads when you zoom in, it does not read.

### 1.5 The palette has three jobs at once

This is the constraint that will decide more than taste, and it is why the palette is designed
before the buildings:

1. **Terrain and buildings** must stay legible against each other.
2. **Eleven data overlays** are blended over the ground in one shader pass and must remain readable
   on top of any building colour.
3. **Sixteen player colours** must be told apart — including with deuteranopia, protanopia and
   tritanopia — while sitting on top of both of the above.

Sixteen distinguishable colours do not exist. Player identity is therefore always **colour plus
pattern plus label** (hatch, dots, chevrons; a name on the territory overlay and minimap). The
palette is verified by colour-vision simulation in a test, never by eye.

### 1.6 Overlays never rely on colour alone

Green good, yellow strained, red failing, grey not applicable — always paired with an icon, a
pattern or a label. Same rule for the minimap.

### 1.7 Mood

The design's pillar is a "colourful miniature world" that stays optimistic and gently satirical.
Cosy, toy-like, legible. Not grim, not photoreal, not ironic.

### 1.8 Budgets

≤150 draw calls typical, ≤80k triangles on mobile, 60 fps desktop and 30 fps mid-range mobile,
measured on the **saturated** 128×128 fixture rather than an empty map.

---

## 2. The probe brief (slice 1.2b)

One pinned 16×16 city block from a real save, rendered through the real renderer, in three
candidates that all rotate and all bake procedurally:

| | Candidate | The question it asks |
|---|---|---|
| **a** | **Clean low-poly toy diorama** — flat colour, baked ambient occlusion, cosy palette | Is the cheapest, most legible option also good enough to be the identity? |
| **b** | **Pixel-art post-process** — the same meshes rendered to a low-resolution target, nearest upscale, palette quantisation, dither, outline | Can we have the charm of the reference screenshot while keeping rotation, zoom and procedural assets? |
| **c** | **Hand-painted atlas** — richer silhouettes and surface detail | Does the extra art cost per building state buy enough? |

Each is judged at two zoom levels, on phone and desktop, with:

- Draw calls, triangle count and frame time measured on the saturated fixture.
- A screenshot with the **territory overlay on and sixteen player colours present** — the case that
  usually breaks a style late.
- A written note on cost per building state, since that number multiplies by roughly sixty
  buildings × four levels × two value tiers.

Reference supplied by the user for candidate (b)'s target feel:
`specs/screenshots/isometric-1.jpg` — dense isometric pixel art, cutaway interiors, individually
drawn citizens and vehicles. Note that its interior detail is a drawn-sprite affordance and is
**not** in scope for a mesh pipeline; what (b) borrows is the palette discipline, the outline and
the pixel texture, not the cutaways.

**Output:** the style is chosen, this document's §3 is written, and the content lane (C1) starts.

### 2.1 What the probe produced

All three candidates are built and rendered from the same city, seed and camera. The comparison
sheet is `reports/style-sheet.png` (regenerate with `node tools/style-sheet.mjs`); individual
frames are `reports/probe-close-{plain,pixel,painted}.png`.

Findings that outlived the probe, whichever style is chosen:

- **A style is geometry, shading and palette; the filter is last** (ruling 017). The first attempt
  differed only in post-process and all three looked identical.
- **A screen-space outline fights detail.** The more windows and roof clutter a building gains,
  the more the edge test fires. `painted` is a lighting treatment for this reason.
- **The pixel style must be unlit.** Lighting gives smooth gradients across a face, which is the
  one thing pixel art does not have; its shading is baked into vertex colours.
- **Detail is flat panels, not boxes** — a window quad is two triangles where a box is twelve.
- **Roofing is dark whatever the walls are.** A cream house with a cream roof reads as one lump.
- **Windows need a frame.** Full-cell windows turn a wall into a bookcase.
- **The detail has a measured cost:** 201k triangles for 187 buildings against an 80k mobile
  budget. LOD by camera distance is required, not optional.

---

## 3. The chosen style — **plain** (ruling 022)

*Settled 2026-08-28 by P13. Soft cool light, a bright cosy palette, shadows.
The content lane (C1) is unblocked.*

Every hex below is the value in `client/render/palettes.js` and
`client/render/style-light.js`. `test/docs.test.js` compares the two, so this
section cannot quietly go stale.

### 3.1 Palette

**Ground and sky**

| Role | Hex |
| --- | --- |
| Sky | `0xbfe0f0` |
| Grass | `0x62c144` |
| Sand | `0xc0a274` |
| Forest | `0x3f9b34` |
| Water | `0x39c5e8` |
| Shallow | `0xa8ecfa` |
| Rock | `0xa8a49e` |
| Beach | `0xf0dfae` |
| Scrub | `0x74a05c` |
| Garden plot | `0x6fce4c` |

The greens are deliberately more saturated than life and the water is cyan
rather than navy. A cosy toy world does not use realistic colours — §1.7.

**Buildings**

| Role | Hex |
| --- | --- |
| Residential wall | `0xefc9a4` |
| Commercial wall | `0x8fd0f0` |
| Industrial wall | `0xd9a45c` |
| Civic wall | `0xd8d2c6` |
| House roofs | `0xd4623a` `0xe07a45` `0xb8422c` `0x94302a` `0x5d6d80` `0x404a5c` `0x334152` `0x3b7358` |
| Flat roofs | `0x4e535b` `0x424750` `0x5c6169` `0x6b6459` |

Roof colour is a **hue, not a shade of the wall** (ruling 021). Houses draw from
tile and slate; everything else from the flat greys of felt and gravel, and that
split is most of what tells a terrace from an office block at a zoom where no
other detail is legible.

Walls vary per building at full scatter; roofs at **half** that, because a roof
colour is a material and materials vary less than paint does.

**Network and props**

| Role | Hex |
| --- | --- |
| Road | `0x6f7278` |
| Road marking | `0xf2f2f2` |
| Power pole | `0x8a8377` |
| Lamp | `0xb8bcc0` |
| Tree | `0x2f8f3a` |

**Player seats** — sixteen, chosen by search and scored on the worst pair under
protan, deutan and tritan simulation simultaneously (ruling 018). Index 0 is
nature and is never drawn.

`0x8f82c4` `0xe7e792` `0x92e7e7` `0xd33636` `0xc2c247` `0x2525a7` `0x92b4e7`
`0xc4828f` `0x36d3b4` `0xe7a392` `0xc6de68` `0xa5cbd5` `0xa7a725` `0x9436d3`
`0x6897de` `0xb1599f`

Sixteen genuinely distinguishable colours do not exist. Identity is therefore
always **colour plus pattern plus label** — §1.6, `gamedesign.md` §30.

### 3.2 Lighting rig

| Setting | Value | Why |
| --- | --- | --- |
| Key intensity | 1.15 | Sculpts, does not dominate |
| Key colour | `0xfffaf0` | Barely warm; the palette carries the warmth |
| Hemisphere sky | `0xdcecff` | Cool fill from above |
| Hemisphere ground | `0x93aa78` | Green bounce, so shadow sides stay alive |
| Hemisphere intensity | 1.25 | **Outweighs the key** — this is what makes it soft |
| Sun height | 150 | High, so shadows sit under a building |
| Shadow radius | 5 | Blurred |
| Shadow intensity | 0.5 | Pale, not black |
| Face contrast | 0.65 | Baked shading, compressed towards flat |

**Softness is a ratio, not a level** (ruling 020). Dropping the key alone makes
the picture darker, not softer; the fill has to carry more of the exposure than
the key does. And the baked face contrast has to come down with it, or the
vertex shading keeps sculpting whatever the lights say — that was the actual
reason three candidates once looked alike.

Contrast 0.4 was tried and is wrong: at that setting a roof and the wall beneath
it land on the same value and the building loses its form. Soft means gentle,
not absent.

### 3.3 Silhouette rules

Every building is authored at **unit height** with the roof as a proportion of
it, so the instance matrix sets how tall a thing is and the geometry sets its
footprint. Four variants per category, picked deterministically from the
building id, so a terrace is never a row of clones.

| Category | Roof | Signature |
| --- | --- | --- |
| Residential | Pitched, **stepped** into bands at full detail | Chimney offset per variant, garden fence, dormers, porch |
| Commercial | Flat with a raised parapet | Storey bands of windows all round, glazed ground floor, shopfront awning, roof clutter |
| Industrial | Sawtooth, or flat with a parapet | Blank lower wall with high windows only, stacks, loading canopy, yard fence |
| Civic | Flat with a deep parapet | Portico on posts, wide doors, tower or cupola |

The stepped roof is not decoration — terracing is the most recognisable single
trait of the reference, and a smooth prism at this camera angle reads as a
wedge. It is full-detail only; at SHAPE tier the steps are sub-pixel.

### 3.4 Ladders

**Development level** sets height: `0.45 + level × 0.5` at unit scale, times a
per-building jitter of 0.88–1.18 so a terrace is not extruded from one profile.

**Value tier** sets wall lightness: four steps, each brighter than the last, off
the zone's base colour. A higher value tier is never darker — asserted in
`test/render.test.js`.

**Detail tier** is the LOD ladder, not an art choice: FULL keeps windows, sills,
doors, roof clutter and fences; SHAPE keeps the silhouette only; BLOCK is a box
with a roof-coloured cap. Which one is drawn is decided by pixels-per-tile and
the triangle budget (ruling 019), never by the artist.

### 3.5 Ground, network and props

Roads are **painted into the terrain mesh** (slice N30) — a road is a colour of
the ground, not a layer over it, so it shares the ground's corner heights and
meets its neighbours seamlessly on any slope at no cost in triangles. Centre
markings are instanced above it, drawn from the road's own connection mask
(slice N29); markings vanish below 20 pixels a tile. Three cases, and they have to be three:

- a **straight** run keeps one centred dash, the lane divider;
- a **corner** draws two arms that meet *at* the centre, so the elbow has no
  hole in it;
- a **T or an X** draws an arm per approach that stops short of the middle,
  because a road does not paint its centre line through a junction — and an
  unbroken cross reads as a plus sign rather than a crossroads.

A stub with one connection or none gets no marking at all: there is no lane to
divide, and a lone dash on the end of a road reads as a mistake. Houses and civic buildings
stand on a garden plot, which is what stops a suburb reading as buildings
dropped onto tarmac. Power poles are drawn every third tile of a wire run.

**Networks are drawn as runs, not as tiles (slice N27).** A wire or a pipe tile
draws a small hub at its centre plus an arm towards each neighbour the tile's
own connection mask names, each arm reaching exactly half a tile so two
neighbours meet in the middle with no seam. Anything less leaves a gap at every
tile boundary, which is what made a run of ten poles read as ten unconnected
dots at the N27 playtest. Each network keeps its own silhouette rather than
borrowing the road's: **wire** is a pale grey line thinner than a road marking;
**water** is a wider blue main. The rule generalises — any future network (rail,
transit) draws a hub and arms from its mask, and never a tile-shaped patch.

**Three rules the N28 playtest added, because the runs still read as dots
(ruling 030's amendment):**

- **One width from end to end.** N27's hub was wider than its arms, and at city
  zoom the arm falls under a pixel while the hub does not: a bead on a string.
  Hub and arm share a width; the networks differ from each other by width and
  colour.
- **A flat layer at its own tile's height does not meet its neighbour.** The
  terrain is one surface whose corners are the average of the four tiles meeting
  there, so a layer drawn flat leaves a vertical step wherever two neighbours
  differ — and at 35° the camera looks straight through it into the grass.
  Roads showed it as a green seam across every slope. N28 filled the step with a
  skirt; N30 removed the question by making the road part of the ground. A thin
  ribbon drawn well clear of the surface — wire, pipe — needs neither.
- **A network crosses a road, it does not dive under it.** Both were drawn below
  the road surface, so a run crossing a street broke in two. The water main is
  underground in the fiction and above the tarmac in the picture.

### 3.6 What plain deliberately does not have

- **No texture atlas.** Every surface is flat colour plus baked face shading.
  This is the whole reason plain is the cheapest to produce: a new building is a
  function, not eight drawn sprites across four levels and two value tiers.
- **No post-process.** `plain.post` is false. An outline pass fights detailed
  geometry — with windows, sills and roof clutter every edge fires the edge test
  and the image turns to mud.
- **No day/night cycle at v1.** The rig is one fixed time of day. Lit windows at
  dusk are the obvious first extension and are recorded as such, not built.

---

## 4. Open

- **Q2** — the advisor's visual character, alongside their voice.
- **Q13** — whether a drawn-sprite pipeline is ever funded post-v1.

See `dev-questions.md`.
