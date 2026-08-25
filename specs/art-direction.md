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

---

## 3. The chosen style

*Empty until probe 1.2b reports. Nothing in the content lane starts before this section exists.*

Will specify: palette with hex values and its colour-vision verification, player-colour set with
patterns, silhouette rules per category, height and material ladders for development level and
value tier, terrain and water treatment, road and network appearance, vehicle and character scale,
lighting rig and its day/night behaviour, particle and effect language, and the icon grid.

---

## 4. Open

- **Q2** — the advisor's visual character, alongside their voice.
- **Q13** — whether a drawn-sprite pipeline is ever funded post-v1.

See `dev-questions.md`.
