// Drawing what makes one house that house (slice S9; P61).
//
// `client/world/house-spec.js` says WHERE each piece sits, in metres, from the
// building's id alone; this turns the list into boxes. Split from `facade.js`
// for the reason the spec is split from the grammar: that file is the four
// categories' shared builder and this is one category's furniture, and a file
// that is both is a file nobody can read.
//
// Every part is boxes. No new pipeline, no new material — S9's constraint, and
// the reason a chimney costs 12 triangles rather than an atlas.

import { sink } from "./solid.js";
import { EDGES, originOf } from "./edges.js";
import { coursesOf, ridgeRise, MAX_SHUTTERED_BAYS } from "../world/house-spec.js";

/** A point on a wall face, `d` metres out from it. */
function atEdge(spec, side, u, d = 0) {
  const geom = EDGES[side];
  const [ox, oz] = originOf(spec, side);
  return [
    ox + geom.along[0] * u - geom.out[0] * d,
    oz + geom.along[1] * u - geom.out[1] * d,
  ];
}

/** A box centred on `(cx, cz)` at ground `y`, `w` by `d` by `h`. */
function upright(s, cx, cz, y, w, d, h) {
  s.box(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2);
}

/**
 * A flat panel ON a wall — two triangles where a box would be twelve.
 *
 * The lesson this file was rewritten around. Everything here started as a box,
 * and `budget_gate` priced it: the furniture added **10,306 triangles a chunk**
 * and took the crowd frame from 289k to 370k against a 320k budget. A course of
 * brick, a shutter, a fanlight and a number plate have no thickness anybody can
 * see — the facade's own window reveals provide all the depth a wall reads —
 * so they are quads, 1 cm proud of the wall, at a sixth of the cost.
 *
 * `u0..u1` along the wall, `y0..y1` up it, `d` out from it.
 */
function panel(s, spec, side, u0, u1, y0, y1, d = 0.02) {
  const geom = EDGES[side];
  const [ox, oz] = originOf(spec, side);
  const at = (u, y) => [
    ox + geom.along[0] * u - geom.out[0] * d,
    y,
    oz + geom.along[1] * u - geom.out[1] * d,
  ];
  const a = at(u0, y0); const b = at(u1, y0); const c = at(u1, y1); const e = at(u0, y1);
  // Wound so the face points out of the building, the way `panels()` does it.
  if (geom.out[0] + geom.out[1] > 0) s.quad(a, b, c, e);
  else s.quad(b, a, e, c);
}

/**
 * The house's own pieces, as `[{ part, colour, options }]`.
 *
 * `wallTop` and `groundTop` come from the facade builder, which has already
 * worked them out — passing them keeps the two from disagreeing about where
 * the eaves are, which is the one error that would put a chimney in the air.
 */
export function buildHouseParts(spec, { groundTop, wallTop, trim, glass }) {
  const parts = spec.extras ?? [];
  if (parts.length === 0) return [];
  const out = [];
  const front = spec.edges.find((e) => e.street) ?? spec.edges[0];
  const width = spec.x1 - spec.x0;
  const depth = spec.z1 - spec.z0;
  const cx = (spec.x0 + spec.x1) / 2;
  const cz = (spec.z0 + spec.z1) / 2;
  // The ridge, exactly where `roof-kit.js` puts it: the roof is built on a box
  // EXPANDED by the eave, so its half-span is half the short axis plus the
  // overhang on both sides. Left out, the chimney came up 0.4 m short and sat
  // buried in the slope — which is invisible in a unit test and obvious in the
  // first screenshot anybody takes (S9).
  const eave = spec.roof?.eave ?? 0.6;
  const pitch = spec.roof?.pitch ?? 0.6;
  const ridgeY = wallTop + ridgeRise(Math.min(width, depth), eave, pitch);

  const masonry = sink();     // the house's own colour: plinth, chimney, bay
  const woodwork = sink();    // trim: gutters, shutters, porch, dormer cheeks
  const dark = sink();        // ridge tiles, downpipe, bin — a shade to read against
  const panes = sink();       // fanlights, dormer and skylight glass

  for (const part of parts) {
    if (part.kind === "chimney") {
      // At a ridge END, which for a gable is the short axis' middle. Drawn on
      // the roof rather than through it: the stack starts at the eaves so it
      // is never a box floating over a slope.
      const alongX = width >= depth;
      const endX = alongX ? (part.end ? spec.x1 - 0.9 : spec.x0 + 0.9) : cx;
      const endZ = alongX ? cz : (part.end ? spec.z1 - 0.9 : spec.z0 + 0.9);
      const top = ridgeY + part.h;
      upright(masonry, endX, endZ, wallTop - 0.2, part.w, part.w, top - wallTop + 0.2);
      // A pot on half of them, one at most: 12 triangles on every house in the
      // city is four per cent of a frame, and two was a detail nobody can count
      // from the pavement.
      if (part.pots > 0) upright(dark, endX, endZ, top, part.w * 0.32, part.w * 0.32, 0.35);
    }
    if (part.kind === "dormer") {
      const [dx, dz] = atEdge(spec, part.side, part.u, -0.2);
      const sill = wallTop + 0.1;
      upright(woodwork, dx, dz, sill, part.w, 1.0, part.h);
      // The dormer's own window, flat on its face.
      panel(panes, spec, part.side, part.u - part.w * 0.3, part.u + part.w * 0.3,
        sill + 0.25, sill + 0.25 + part.h * 0.55, -0.62);
    }
    if (part.kind === "skylight") {
      panel(panes, spec, part.side, part.u - part.w / 2, part.u + part.w / 2,
        wallTop + 0.45, wallTop + 1.05, -1.1);
    }
    if (part.kind === "aerial") {
      // A dish, always: the mast and its three bars were 48 triangles of
      // silhouette that reads as noise at any distance a house is baked from.
      upright(dark, spec.x1 - 0.7, spec.z0 + 0.7, wallTop + 0.2, 0.5, 0.12, 0.5);
    }
    if (part.kind === "plinth") {
      // A course at the base, a little proud of the wall: the line that stops a
      // house looking like it was dropped on the grass. Four panels rather than
      // a box — the top and bottom of a 45 cm band are never in view.
      for (const side of [0, 1, 2, 3]) {
        const edge = spec.edges.find((e) => e.side === side);
        if (!edge) continue;
        panel(masonry, spec, side, -0.08, edge.length + 0.08, spec.seat, spec.seat + part.h, 0.08);
      }
    }
    if (part.kind === "courses") {
      for (const y of coursesOf(part.material, wallTop - spec.seat)) {
        panel(dark, spec, part.side, 0.1, front.length - 0.1,
          spec.seat + y, spec.seat + y + 0.07);
      }
    }
    if (part.kind === "shutters") {
      // Beside the street windows, at the ground floor's sill height — the two
      // a player walking past is level with.
      const bay = front.length / front.bays;
      let shuttered = 0;
      const want = Math.min(part.bays ?? MAX_SHUTTERED_BAYS, MAX_SHUTTERED_BAYS);
      for (let b = 0; b < front.bays && shuttered < want; b += 1) {
        if ((spec.id + b) % 2 === 1) continue;
        shuttered += 1;
        const u = (b + 0.5) * bay;
        for (const side of [-1, 1]) {
          const at0 = u + side * 0.78 - 0.16;
          panel(woodwork, spec, part.side, at0, at0 + 0.32, spec.seat + 0.9, spec.seat + 2.4, 0.04);
        }
        if (part.boxes && shuttered === 1) {
          const [bx, bz] = atEdge(spec, part.side, u, -0.2);
          upright(woodwork, bx, bz, spec.seat + 0.75, 1.1, 0.3, 0.22);
        }
      }
    }
    if (part.kind === "bay") {
      const [bx, bz] = atEdge(spec, part.side, part.u, -part.depth / 2);
      upright(masonry, bx, bz, spec.seat, part.w, part.depth * 2, groundTop - spec.seat);
      panel(panes, spec, part.side, part.u - part.w * 0.4, part.u + part.w * 0.4,
        spec.seat + 0.8, spec.seat + 2.1, part.depth + 0.03);
    }
    if (part.kind === "porch") {
      const u = front.length / 2;
      // OUT from the wall — `atEdge` moves inward for a positive depth, and the
      // canopy and its post were half inside the house since S9 (R5). And
      // turned with the wall: `upright` is axis-aligned, so on an east or west
      // front the width runs along z.
      const [px, pz] = atEdge(spec, front.side, u, -part.depth / 2);
      const [cw, cd] = front.side % 2 === 0 ? [part.w, part.depth] : [part.depth, part.w];
      upright(woodwork, px, pz, spec.seat + 2.2, cw, cd, 0.2);
      if (part.posts) {
        // One post, on the side the door is not. A canopy on two posts is 12
        // triangles more for a symmetry nobody notices.
        const [qx, qz] = atEdge(spec, front.side, u - (part.w / 2 - 0.1), -(part.depth - 0.15));
        upright(woodwork, qx, qz, spec.seat, 0.14, 0.14, 2.2);
      }
    }
    if (part.kind === "doorFurniture") {
      const bay = front.length / front.bays;
      const u = (Math.floor(front.bays / 2) + 0.5) * bay;
      if (part.fanlight) {
        panel(panes, spec, front.side, u - 0.5, u + 0.5, spec.seat + 2.12, spec.seat + 2.4);
      }
      panel(woodwork, spec, front.side, u + 0.64, u + 0.86, spec.seat + 1.6, spec.seat + 1.76);
    }
    if (part.kind === "garage") {
      panel(woodwork, spec, part.side, part.u - part.w / 2, part.u + part.w / 2,
        spec.seat + 0.02, spec.seat + part.h, 0.05);
    }
    if (part.kind === "gutter") {
      // The DOWNPIPE only. The eaves runs were two 12-triangle boxes for a line
      // that sits in the roof's own shadow; the pipe is the part a player
      // standing at the gate actually sees.
      const px = part.corner % 2 === 0 ? spec.x0 - 0.12 : spec.x1 + 0.12;
      const pz = part.corner < 2 ? spec.z0 - 0.12 : spec.z1 + 0.12;
      upright(dark, px, pz, spec.seat, 0.12, 0.12, wallTop - spec.seat);
    }
    if (part.kind === "bin") {
      const [bx, bz] = atEdge(spec, part.side, part.u, 0.45);
      upright(dark, bx, bz, spec.seat, 0.55, 0.5, 0.9);
    }
  }

  out.push({ part: masonry.done(), colour: spec.wall });
  out.push({ part: woodwork.done(), colour: trim });
  out.push({ part: dark.done(), colour: spec.roof?.colour ?? trim });
  out.push({ part: panes.done(), colour: glass });
  return out.filter((piece) => piece.part.triangles > 0);
}
