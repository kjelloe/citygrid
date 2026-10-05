// What makes one shop that shop (slice S16b).
//
// S9 gave a house a chimney, a porch, shutters and a downpipe; a shop had
// nothing at all. S16a's probe is the measurement: on the widest commercial lot
// in a played city the facade spec's `extras` list came back EMPTY, for every
// unit, at every level. What a high street has instead is a fascia with a name
// on it — and under the fascia, since S7, a pane of glass with a card behind it
// the width of its own opening, which a shopper standing at an angle sees past
// and out the back of the building (S21 left that one).
//
// Pure in the facade spec and nothing else: no clock, no random, no state
// (ruling 032). A shop keeps its awning for life and two players see one street.

import { jitter } from "./hash.js";

/**
 * What a shop may spend.
 *
 * `parts` is the count this module may return, which is what a test can hold;
 * the triangles are the renderer's and are measured by `trade_shots` with the
 * `?ladder=0` arm. S9's budget is the precedent: 180 triangles a house, arrived
 * at by building to the item's number and finding it three times the frame's
 * headroom. A shop is one unit of a parade, so it gets about a house's worth.
 */
export const SHOP_BUDGET = { parts: 12, triangles: 180 };

/** How deep an awning hangs over the pavement, in metres.
 *
 * S16's words: **a sloped strip one metre deep over the shop window**, not a
 * canopy over the pavement — measured from the pavement camera so it never
 * covers more than a tenth of a street frame. */
const AWNING_DEPTH = 1.1;

/** How far behind the glass the shop's back wall stands. Deep enough to be a
 * room rather than a pane, shallow enough that the light the window lets in
 * still falls on it. */
const INTERIOR_DEPTH = 1.2;

/**
 * Everything on and around one shop, as a list of parts in metres.
 *
 * The shape `houseParts` returns: a flat list the renderer switches on, where a
 * part the renderer does not know draws nothing.
 */
export function shopParts(spec, { furniture = true } = {}) {
  const id = spec.id;
  const out = [];
  const front = spec.edges.find((e) => e.street) ?? spec.edges[0];

  // --- the ground floor ----------------------------------------------------
  // The interior, spanning the WHOLE frontage behind the glass. One quad, not
  // one per opening: a card the width of its own hole leaves a gap at every
  // pier, and a shopper standing at an angle looks through the shop and out the
  // far wall. This is the part that makes a parade a row of shops rather than a
  // carport with signs on it.
  out.push({
    kind: "interior",
    side: front.side,
    u0: 0,
    u1: front.length,
    depth: INTERIOR_DEPTH,
  });

  // Everything below is FURNITURE — the nearest chunks only (S9's rule, and its
  // measurement: the parts are a few hundred triangles a building and there are
  // thirty buildings in a chunk). The interior above is not: a shop with no back
  // wall is a shop you can see through, at any distance.
  if (!furniture) return out;

  // An awning where the storefront asks for one. The flag has been in the spec
  // since the grammar was written and nothing has ever read it (found in the
  // S16b omissions sweep), which is why a street of fascias has no shade on it.
  for (const store of spec.storefronts) {
    if (!store.awning) continue;
    out.push({
      kind: "awning",
      side: front.side,
      u0: store.from + 0.35,
      u1: store.to - 0.35,
      depth: AWNING_DEPTH,
      // A hanging sign on the awning's bracket, on some of them.
      bracket: jitter(id * 7 + Math.round(store.from), 61) > 0.55,
    });
  }

  // --- the roof ------------------------------------------------------------
  // A flat roof with nothing on it is a lid. Two or three units by hash, each
  // inside the footprint and short enough to read as plant rather than as a
  // storey: a vent, a condenser, a skylight.
  const w = spec.x1 - spec.x0;
  const d = spec.z1 - spec.z0;
  const count = 2 + (jitter(id, 67) > 0.6 ? 1 : 0);
  for (let i = 0; i < count; i += 1) {
    const u = 0.25 + 0.5 * jitter(id * 13 + i, 71);
    const v = 0.3 + 0.4 * jitter(id * 17 + i, 73);
    out.push({
      kind: "roofPlant",
      what: ["vent", "condenser", "skylight"][i % 3],
      x: spec.x0 + w * u,
      z: spec.z0 + d * v,
      w: 0.8 + 0.6 * jitter(id * 19 + i, 79),
      h: 0.5 + 0.7 * jitter(id * 23 + i, 83),
    });
  }

  // --- the back ------------------------------------------------------------
  // Where the stock arrives. On the OPPOSITE side to the shop window, which is
  // the one thing a delivery door must never share with it.
  const back = (front.side + 2) % 4;
  out.push({ kind: "deliveryDoor", side: back, u: 0.5, w: 2.2, h: 2.6 });
  out.push({ kind: "binStore", side: back, u: jitter(id, 89) > 0.5 ? 0.2 : 0.8, w: 1.6, h: 1.2 });

  return out;
}
