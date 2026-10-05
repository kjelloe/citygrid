// Drawing what makes one shop that shop (slice S16b).
//
// `client/world/shop-spec.js` says WHERE each piece sits, in metres, from the
// facade spec alone; this turns the list into geometry. Split from `facade.js`
// for the reason `house-parts.js` is split from it: that file is the four
// categories' shared builder, and this is one category's furniture.
//
// Flat things are quads (S9's measurement: a shutter has no thickness anybody
// can see, and a box is six times the triangles). The interior is the one piece
// that is not decoration — without it a parade of shops is a carport with signs
// over it.

import { sink } from "./solid.js";
import { EDGES, originOf, outwardQuad } from "./edges.js";

/** A point on a wall face, `d` metres out from it (negative is into the shop). */
function atEdge(spec, side, u, d = 0) {
  const geom = EDGES[side];
  const [ox, oz] = originOf(spec, side);
  return [
    ox + geom.along[0] * u - geom.out[0] * d,
    oz + geom.along[1] * u - geom.out[1] * d,
  ];
}

/** A quad on a wall face, `d` out from it, wound outward. */
function panel(s, spec, side, u0, u1, y0, y1, d = 0.02) {
  const at = (u, y) => {
    const [x, z] = atEdge(spec, side, u, d);
    return [x, y, z];
  };
  outwardQuad(s, [at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1)]);
}

/**
 * The shop's own pieces, as `[{ part, colour, name }]`.
 *
 * `groundTop` and `wallTop` come from the facade builder, which has already
 * worked them out — the same arrangement `buildHouseParts` has, and for the
 * same reason: two ideas of where the fascia sits puts an awning through a sign.
 */
export function buildShopParts(spec, { groundTop, wallTop, trim, glass }) {
  const parts = (spec.extras ?? []).filter((p) => SHOP_KINDS.has(p.kind));
  if (parts.length === 0) return [];

  const shell = sink();     // the shop's own colour: plant housings, bin store
  const metal = sink();     // trim: awning, roller door, brackets
  const inside = sink();    // what is behind the glass
  const roofGlass = sink(); // a skylight

  for (const part of parts) {
    if (part.kind === "interior") {
      // The back of the shop, the WHOLE frontage wide. A card per opening (S7)
      // leaves a gap at every pier that a shopper standing at an angle sees
      // through, and out the far wall of the building.
      // `d` counts INWARD from the wall face (the convention `reveal` uses for
      // a backing panel), so the interior stands a room's depth behind the
      // glass. The first cut passed a negative depth and hung a black wall a
      // metre out over the pavement, across the whole shopfront.
      panel(inside, spec, part.side, part.u0, part.u1,
        spec.seat + 0.1, groundTop - 0.5, part.depth);
    }
    if (part.kind === "awning") {
      // A sloped strip: out from the wall and DOWN, so it reads as canvas
      // rather than as a shelf. Two triangles, like everything else that has no
      // thickness worth paying for.
      const high = groundTop - 0.55;
      const low = high - 0.45;
      const a = atEdge(spec, part.side, part.u0, 0.02);
      const b = atEdge(spec, part.side, part.u1, 0.02);
      const c = atEdge(spec, part.side, part.u1, -part.depth);
      const d = atEdge(spec, part.side, part.u0, -part.depth);
      const top = [[a[0], high, a[1]], [b[0], high, b[1]], [c[0], low, c[1]], [d[0], low, d[1]]];
      // BOTH windings, four triangles. A canopy is seen from under it by
      // somebody on the pavement and from over it by somebody at a first-floor
      // window, and a single-sided quad is invisible from one of them — which
      // for an awning at 4 m is the one that matters (the walker's).
      metal.quad(top[0], top[1], top[2], top[3]);
      metal.quad(top[3], top[2], top[1], top[0]);
      if (part.bracket) {
        const u = (part.u0 + part.u1) / 2;
        const [hx, hz] = atEdge(spec, part.side, u, -part.depth);
        metal.box(hx - 0.06, low, hz - 0.06, hx + 0.06, high, hz + 0.06);
      }
    }
    if (part.kind === "roofPlant") {
      const target = part.what === "skylight" ? roofGlass : shell;
      const h = part.what === "skylight" ? 0.18 : part.h;
      target.box(part.x - part.w / 2, wallTop, part.z - part.w / 2,
        part.x + part.w / 2, wallTop + h, part.z + part.w / 2);
    }
    if (part.kind === "deliveryDoor") {
      const edge = spec.edges.find((e) => e.side === part.side);
      const length = edge?.length ?? (spec.x1 - spec.x0);
      const centre = length * part.u;
      panel(metal, spec, part.side, centre - part.w / 2, centre + part.w / 2,
        spec.seat + 0.05, spec.seat + 0.05 + part.h);
    }
    if (part.kind === "binStore") {
      const edge = spec.edges.find((e) => e.side === part.side);
      const length = edge?.length ?? (spec.x1 - spec.x0);
      const centre = length * part.u;
      const [x, z] = atEdge(spec, part.side, centre, part.w / 2);
      shell.box(x - part.w / 2, spec.seat, z - part.w / 2,
        x + part.w / 2, spec.seat + part.h, z + part.w / 2);
    }
  }

  return [
    { part: shell.done(), colour: spec.wall, name: "shopShell" },
    { part: metal.done(), colour: trim, name: "shopMetal" },
    // Darker than the wall and warmer than the glass: a room with the light off.
    { part: inside.done(), colour: 0x3b332c, name: "interior" },
    { part: roofGlass.done(), colour: glass, name: "shopSkylight" },
  ].filter((piece) => piece.part.triangles > 0);
}

const SHOP_KINDS = new Set(["interior", "awning", "roofPlant", "deliveryDoor", "binStore"]);
