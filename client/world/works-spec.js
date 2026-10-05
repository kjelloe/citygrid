// What makes one works that works (slice S16c).
//
// S16a's industrial ladder put two sheds on a 36 m lot, each set back with the
// yard between it and the kerb — and the air shot showed the yard is GRASS,
// because nothing draws anything on an industrial lot's open ground
// (`params.js`: `lawn` is a residential and civic colour, and industry gets 0).
// An estate from the air was sheds on a lawn.
//
// Pure in the facade spec, like `shop-spec.js`. The parts are placed in WORLD
// metres because a yard is a thing on the ground rather than a thing on a wall.

import { jitter } from "./hash.js";

/** What a works may spend. `parts` is what a test can hold; the triangles are
 * the renderer's, measured by `trade_shots`. */
export const WORKS_BUDGET = { parts: 10, triangles: 220 };

/** How high a loading dock stands: a lorry bed, so the forklift runs out level.
 * 1.2 m is the number every loading bay in the world is built to. */
const DOCK_H = 1.2;

/**
 * Everything on and around one works, as a list of parts in metres.
 *
 * The shape `houseParts` and `shopParts` return: a flat list the renderer
 * switches on, where a part the renderer does not know draws nothing.
 */
export function worksParts(spec, { furniture = true } = {}) {
  const id = spec.id;
  const out = [];
  const front = spec.edges.find((e) => e.street) ?? spec.edges[0];
  // The whole lot, which is what a yard covers — `spec` itself is the SHED when
  // the trade ladder has divided the lot (S16a), and a yard the size of the
  // shed is not a yard.
  const lot = spec.lotBox ?? { x0: spec.x0, z0: spec.z0, x1: spec.x1, z1: spec.z1 };
  const d = spec.z1 - spec.z0;

  // --- the ground ----------------------------------------------------------
  // The yard, as a rectangle on the lot. Hardstanding, not grass: it is what
  // the lorries turn on, and it is the single strongest cue that a shed is a
  // works rather than a hall. A margin so the lot does not meet its neighbour's
  // kerb to kerb — a works has a boundary, which `addFence` already says.
  out.push({
    kind: "yard",
    x0: lot.x0 + 0.4, z0: lot.z0 + 0.4, x1: lot.x1 - 0.4, z1: lot.z1 - 0.4,
  });

  // Everything below is FURNITURE — the nearest chunks only, like a house's
  // (S9). The yard above is not: a shed on grass is wrong from the air, which
  // is the zoom the furniture is dropped at.
  if (!furniture) return out;

  // --- the street side -----------------------------------------------------
  // The dock, and the roller door over it. Both on the STREET side: a lorry
  // arrives from the road, and a dock at the back of a lot nothing can reach is
  // the kind of detail that only looks right in a plan view.
  out.push({ kind: "dock", side: front.side, u: front.length * 0.5, w: 4.4, depth: 2.2, h: DOCK_H });
  out.push({ kind: "rollerDoor", side: front.side, u: front.length * 0.5, w: 3.6, h: DOCK_H + 2.6 });
  // And the name, on the wall beside the door rather than over it: a board over
  // a roller door is a board a lorry hits.
  out.push({ kind: "nameBoard", side: front.side, u: front.length * 0.18, w: 3.2, h: 0.9 });

  // --- the yard's furniture ------------------------------------------------
  // In the yard, never inside the shed: a tank on a roof is what a hash gives
  // you if nobody checks. The lot's own margin is where they stand — along the
  // side away from the street, which is the service strip of every estate.
  // The strip between the shed and the lot's own edge, on whichever side has
  // room for it — which on a one-tile works is the back, because the shed takes
  // the width. `clear` keeps everything out of the building's own footprint.
  const gapRight = lot.x1 - spec.x1;
  const gapLeft = spec.x0 - lot.x0;
  const gapBack = lot.z1 - spec.z1;
  const gapFront = spec.z0 - lot.z0;
  const widest = Math.max(gapRight, gapLeft, gapBack, gapFront);
  const lateral = (t) => {
    const offset = 0.8 + t * 1.2;
    if (widest === gapRight) return { x: spec.x1 + Math.min(offset, gapRight - 0.5), z: spec.z0 + d * (0.3 + 0.3 * jitter(id * 11 + t, 101)) };
    if (widest === gapLeft) return { x: spec.x0 - Math.min(offset, gapLeft - 0.5), z: spec.z0 + d * (0.3 + 0.3 * jitter(id * 11 + t, 101)) };
    if (widest === gapBack) return { x: spec.x0 + (spec.x1 - spec.x0) * (0.25 + 0.5 * jitter(id * 11 + t, 101)), z: spec.z1 + Math.min(offset, gapBack - 0.5) };
    return { x: spec.x0 + (spec.x1 - spec.x0) * (0.25 + 0.5 * jitter(id * 11 + t, 101)), z: spec.z0 - Math.min(offset, gapFront - 0.5) };
  };
  if (widest < 1.6) return out;
  const tank = lateral(0);
  out.push({ kind: "tank", x: tank.x, z: tank.z, r: 1.1 + 0.5 * jitter(id, 103), h: 2.6 + jitter(id, 107) });
  if (jitter(id, 109) > 0.35) {
    const stack = lateral(1);
    out.push({ kind: "pallets", x: stack.x, z: stack.z, w: 1.6, h: 1.1 + 0.5 * jitter(id, 113) });
  }

  // A gate in the boundary, on the street side, wide enough for what uses it.
  out.push({ kind: "gate", side: front.side, u: front.length * 0.82, w: 5 });

  return out;
}
