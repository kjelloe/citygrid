// What makes one house that house (slice S9; P61).
//
// Kjell, 2026-09-11: *"houses need more details."* The residential kit has six
// silhouettes and fourteen roofs (V6) and the facade grammar (E5) glazes every
// face — so every house is a correct house and no house is anybody's. What is
// missing is the furniture: a chimney, a porch, a downpipe, shutters, a number
// on the door.
//
// Pure, and its own module for the reason `facade-spec.js` is one: everything
// here is arithmetic in metres about where a thing sits on a wall, and a
// chimney that has drifted a metre into the roof is invisible in a screenshot
// until you are standing in the street looking at it.
//
// Everything is a function of `(id, storeys, variant)` and nothing else. No
// clock, no random, no state — so a house keeps its chimney for life and two
// players see the same street (ruling 003's argument, applied to decoration).

import { jitter } from "./hash.js";

/** The three wall materials, by variant. A street is not all one house, and
 * the difference between clapboard and brick reads from further away than any
 * amount of window detail. */
export const MATERIALS = ["render", "clapboard", "brick", "render", "clapboard", "brick"];

/** How much a house may spend on furniture, in triangles.
 *
 * **The item's +300 was three times what the frame had spare.** Built to that
 * number, the furniture cost 276–348 a house, **10,306 triangles a chunk**, and
 * took `budget_gate`'s crowd frame from 289,446 to 369,858 against a 320,000
 * budget — the chunk bake went from 6 ms to 9 ms with it. Eight chunks of about
 * thirty houses is 240 houses a frame, and 30k of headroom over 240 houses is
 * ~125 each.
 *
 * What made it fit was not cutting the list but drawing it correctly: a course
 * of brick, a shutter, a fanlight, a number plate and a garage door have no
 * thickness anybody can see, so they are quads rather than boxes — two
 * triangles where twelve were. 126 on a one-tile house with every part still on
 * it.
 *
 * Two numbers because a four-tile lot is four houses' worth of frontage.
 * `test/house-spec.test.js` counts both. */
export const HOUSE_BUDGET = 180;
export const HOUSE_BUDGET_WIDE = 240;

/** A course of brick or a band of clapboard, in metres. */
const COURSE = { clapboard: 0.62, brick: 0.9 };

/** How many courses a wall may carry.
 *
 * Measured, not chosen: unbounded, clapboard on a 14 m frontage cost **168 of
 * the 300 triangles** — more than half a house's furniture on a texture. Four
 * bands across the storey a passer-by is level with reads as clapboard from the
 * pavement and as nothing at all from the air, which is exactly the trade S9's
 * budget is about. */
export const MAX_COURSES = 4;

/** And how many windows get shutters. Per bay was 108 triangles on a wide
 * house; two bays is what the eye needs to call it a shuttered house. */
export const MAX_SHUTTERED_BAYS = 2;

export function materialOf(variant) {
  return MATERIALS[variant % MATERIALS.length];
}

/** Whether an L3 house has a porch. By hash, so it is the same house forever. */
export function hasPorch(id) {
  return jitter(id, 43) > 0.4;
}

/** And whether the INSTANCED box at city zoom has one.
 *
 * The L2/L3 agreement (E5): the box a player sees from the air has to be the
 * house they walk up to. The box only knows its variant, so it cannot match a
 * hash — what it can do is have a porch about as often, which is what these two
 * together say. Variant 2 is the bungalow and builds its own; variant 4 is a
 * semi with two front doors and nowhere to put one.
 *
 * A predicate rather than a condition inside `building-kit.js`, because that
 * file imports three and node cannot look at it — this is the half a test can
 * hold (the same reason `buttons.js` exists). */
export function hasPorchAtL2(variant) {
  return variant !== 2 && variant !== 4;
}

/** Where the horizontal courses go on the street wall, as heights in metres.
 *
 * The street wall only: a band on all four faces is four times the triangles
 * for three faces a player standing on the pavement cannot see at once, and
 * the budget is 300 for the whole house. Clapboard bands every 0.62 m; brick
 * gets one darker course every fourth, which is what a soldier course looks
 * like from across a road; render gets none, which is the point of render.
 */
export function coursesOf(material, wallH) {
  if (material === "render") return [];
  const step = COURSE[material];
  const out = [];
  for (let y = step; y < wallH - 0.3; y += step) {
    if (material === "brick" && Math.round(y / step) % 4 !== 0) continue;
    out.push(Number(y.toFixed(3)));
    if (out.length >= MAX_COURSES) break;
  }
  return out;
}

/**
 * How far the ridge of a pitched roof stands over the eaves, in metres.
 *
 * `roof-kit.js` builds the roof on a box EXPANDED by the eave, so the half-span
 * is half the short axis PLUS the overhang on both sides. Left out — which is
 * how this was first written — a chimney comes up 0.4 m short and sits buried
 * in the slope: invisible to every test that checks it is not in the sky, and
 * obvious in the first screenshot anybody takes (S9).
 *
 * Here rather than in the renderer so the test and the geometry read the same
 * number; `test/house-spec.test.js` asserts the chimney clears it.
 */
export function ridgeRise(shortSpan, eave, pitch) {
  return (shortSpan + eave * 2) * 0.5 * pitch;
}

/**
 * Everything on and around one house, as a list of parts in metres.
 *
 * `spec` is the facade spec — the lot in world coordinates, the storeys, the
 * frontage — and the answer is a flat list the renderer switches on, the same
 * shape `extrasOf` already produces. A part that the renderer does not know
 * draws nothing, which is what makes this safe to extend.
 */
export function houseParts(spec) {
  const id = spec.id;
  const out = [];
  const width = spec.x1 - spec.x0;
  const depth = spec.z1 - spec.z0;
  const front = spec.edges.find((e) => e.street) ?? spec.edges[0];
  const level = Math.max(0, spec.storeys - 2);

  // --- the roof ------------------------------------------------------------
  // A chimney on every house, because a house without one reads as a shed, and
  // at the RIDGE END so it is never in the middle of a gable's slope.
  out.push({
    kind: "chimney",
    // Which of the two ridge ends, by hash: a terrace whose chimneys all stand
    // at the same end is a comb.
    end: jitter(id, 11) > 0.5 ? 1 : 0,
    w: 0.6 + jitter(id, 13) * 0.2,
    h: 1.1 + jitter(id, 17) * 0.7,
    // A pot on half of them. It is 12 triangles on every house in the city and
    // `budget_gate` was 1,908 over with one on all of them — which is six
    // triangles a house, and this is the six.
    pots: jitter(id, 19) > 0.5 ? 1 : 0,
  });
  // Dormers from level 2, which is when a roof is deep enough to have a room
  // in it. One, or two on a wide house.
  if (level >= 2) {
    // Two only on a house that has room for two — in METRES, and a one-tile lot
    // is 14 m across.
    const count = width > 20 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      out.push({
        kind: "dormer",
        side: front.side,
        u: front.length * ((i + 1) / (count + 1)),
        w: 1.2,
        h: 1.0,
      });
    }
  }
  // A skylight instead, on the houses that have no dormer — the same idea for
  // a quarter of the triangles, and it keeps level-1 roofs from being bare.
  if (level < 2 && jitter(id, 23) > 0.55) {
    out.push({ kind: "skylight", side: front.side, u: front.length * 0.5, w: 0.9 });
  }
  // **No aerial.** It was on this list and `budget_gate` bought it out: a dish
  // is 12 triangles of lump on a roof nobody is looking at, and 12 triangles
  // times three hundred houses is four per cent of a frame. The roof already
  // has the chimney, which is the shape that says "house".

  // --- the walls -----------------------------------------------------------
  out.push({ kind: "plinth", h: 0.45 });
  const material = materialOf(spec.variant);
  if (material !== "render") out.push({ kind: "courses", material, side: front.side });
  // Shutters on half the street windows, by hash. Window boxes on the rest of
  // the shuttered ones, so a house has one or the other and not a fair.
  if (jitter(id, 37) > 0.35) {
    out.push({ kind: "shutters", side: front.side, boxes: jitter(id, 41) > 0.5 });
  }
  // A bay window is a level-3 house saying so from across the street. It takes
  // a window's place, so the house shutters one bay rather than two — a bay
  // window with shutters either side of it is a bay window in a costume.
  if (level >= 3) {
    out.push({ kind: "bay", side: front.side, u: front.length * 0.3, w: 2.0, depth: 0.5 });
    const shutters = out.find((p) => p.kind === "shutters");
    if (shutters) shutters.bays = 1;
  }

  // --- the front -----------------------------------------------------------
  // A porch on three houses in five. `extrasOf` gave one to variant 1 only; a
  // street where one house in six has a porch reads as a mistake rather than
  // variety — and one where every house has the same one reads as a terrace of
  // clones, which is the other half of why this is a hash and not a constant.
  if (hasPorch(id)) {
    out.push({ kind: "porch", w: 1.8, depth: 1.1, posts: true, step: true });
  }
  out.push({ kind: "doorFurniture", number: 1 + Math.floor(jitter(id, 47) * 98), fanlight: true });
  // A garage on a wide lot, and only where there is room beside the door.
  // In METRES, and a one-tile lot is 14 m across — the first threshold here
  // was 11 and gave every bungalow a double garage.
  if (width >= 20 && depth >= 14) {
    out.push({ kind: "garage", side: front.side, u: front.length * 0.82, w: 2.6, h: 2.1 });
  }
  // **No house is bare.** Every part above is behind a hash, and hashes
  // multiply: house 1 came out with a chimney, a plinth and nothing else — 36
  // triangles and the same bungalow the slice was written to fix. So a house
  // that drew nothing from the front counts as one that needs a porch.
  // The test is SHAPE, not decoration: courses and shutters are flat, and a
  // house whose only additions lie in the plane of its wall is still a box with
  // a chimney on it from anywhere but straight on.
  // The garage is NOT on this list: it became a flat quad when the budget was
  // cut, and a door painted on a wall is not a shape. Counting it left a 2×2
  // house with a chimney, a plinth, a number plate and two triangles of garage
  // — 38 in total, which is the bare box again.
  const SHAPE = new Set(["porch", "bay"]);
  if (!out.some((p) => SHAPE.has(p.kind))) {
    out.push({ kind: "porch", w: 1.8, depth: 1.1, posts: true });
  }

  // A downpipe on half of them, at a corner chosen by hash so a terrace's pipes
  // are not a colonnade.
  if (jitter(id, 53) > 0.5) {
    out.push({ kind: "gutter", corner: Math.floor(jitter(id, 59) * 4) % 4 });
  }
  // **No bin.** It belongs to the garden, which is S5 — and the same 12
  // triangles buy a chimney pot on every house, which is worth more.

  return out;
}
