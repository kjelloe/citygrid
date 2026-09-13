// The L3 facade builder (slice E5; spec §6.2, §6.5).
//
// Takes the generated spec and returns baker-ready pieces: walls with the
// openings cut out of them, reveals built OUTWARD (four inner faces and a
// backing panel, the Higashiyama way — which is why those streets have shadows
// in their windows), a ground band with storefront bays and a fascia, a
// stringcourse, a cornice or parapet, and the roof.
//
// Pure. No three, no DOM, no palette lookup — colours arrive in the spec. That
// is what lets node assert the things a screenshot cannot: that a window is
// 1.2 m wide on a six-storey block, that an opening is actually a hole rather
// than a decal, and that nothing reaches past the lot line onto the pavement.
//
// `streets-l3.js` turns the pieces into geometry and hands them to the baker.

import { sink } from "./solid.js";
import { EDGES, originOf } from "./edges.js";
import { roof } from "./roof-kit.js";
import { buildHouseParts } from "./house-parts.js";
import { buildCivic, buildAge } from "./civic-parts.js";
// Re-exported so `signs.js` and anything else that draws on a wall keeps one
// import for "where the walls are".
export { EDGES, originOf } from "./edges.js";

/** How far a reveal sets a window back from the wall it is in. */
const DEPTH = 0.14;

/**
 * One wall face with rectangular holes in it.
 *
 * The holes are not subtracted — they are avoided. The face is split into
 * horizontal bands at every opening's top and bottom, and each band is split
 * sideways only by the openings that band actually crosses. Exact, no clipper,
 * and it leaves the opening's own boundary for the reveal to attach to.
 */
function panels(s, edge, origin, holes, y0, y1) {
  const [ox, oz] = origin;
  const [ax, az] = edge.along;
  const [nx, nz] = edge.out;
  const at = (u, y) => [ox + ax * u, y, oz + az * u];
  const ys = new Set([y0, y1]);
  for (const h of holes) { ys.add(h.y0); ys.add(h.y1); }
  const yList = [...ys].sort((a, b) => a - b);
  const emit = (u0, u1, b0, b1) => {
    if (u1 - u0 < 1e-6 || b1 - b0 < 1e-6) return;
    // Wound so the outward normal points out of the building.
    const a = at(u0, b0); const b = at(u1, b0);
    const c = at(u1, b1); const d = at(u0, b1);
    if (nx + nz > 0) s.quad(a, b, c, d);
    else s.quad(b, a, d, c);
  };
  // A band at a time, split sideways only by the holes THAT BAND has in it.
  // Splitting the whole face by every opening's coordinates in both axes was
  // the first version and gave a wall of 77 quads where 31 will do — a facade
  // is drawn for every building in a chunk, so the difference is thousands of
  // triangles a chunk for a picture nobody can tell apart.
  for (let j = 0; j < yList.length - 1; j += 1) {
    const b0 = yList[j];
    const b1 = yList[j + 1];
    const mid = (b0 + b1) / 2;
    const band = holes.filter((h) => mid > h.y0 && mid < h.y1).sort((a, b) => a.u0 - b.u0);
    if (band.length === 0) { emit(0, edge.length, b0, b1); continue; }
    let u = 0;
    for (const hole of band) {
      emit(u, hole.u0, b0, b1);
      u = Math.max(u, hole.u1);
    }
    emit(u, edge.length, b0, b1);
  }
}

/** The four inner faces and the backing panel of one opening. */
function reveal(s, edge, origin, hole, depth) {
  const [ox, oz] = origin;
  const [ax, az] = edge.along;
  const [nx, nz] = edge.out;
  const at = (u, y, d) => [ox + ax * u - nx * d, y, oz + az * u - nz * d];
  const { u0, u1, y0, y1 } = hole;
  const f = [at(u0, y0, 0), at(u1, y0, 0), at(u1, y1, 0), at(u0, y1, 0)];
  const b = [at(u0, y0, depth), at(u1, y0, depth), at(u1, y1, depth), at(u0, y1, depth)];
  // Sill, jamb, head, jamb — each a quad from the face back to the backing,
  // wound so its front points INTO the opening. Emitting both windings was the
  // first version and doubled the cost of every window in the city for a face
  // nobody can see.
  s.quad(f[0], f[1], b[1], b[0]);   // sill, facing up
  s.quad(f[2], f[3], b[3], b[2]);   // head, facing down
  s.quad(f[1], f[2], b[2], b[1]);   // jamb, facing back along the wall
  s.quad(f[3], f[0], b[0], b[3]);   // jamb, the other way
  return b;
}

/** Where the windows go on one edge: one per bay, per storey. */
function openings(spec, edge, groundTop, wallTop) {
  const holes = [];
  const w = edge.window.w;
  const h = edge.window.h;
  const bay = edge.length / edge.bays;
  for (let b = 0; b < edge.bays; b += 1) {
    const centre = (b + 0.5) * bay;
    const u0 = centre - w / 2;
    const u1 = centre + w / 2;
    if (u0 < 0.3 || u1 > edge.length - 0.3) continue;
    for (let floor = 0; ; floor += 1) {
      const base = groundTop + floor * spec.floorH;
      const y0 = base + edge.window.sill;
      if (y0 + h > wallTop - 0.4) break;
      holes.push({ u0, u1, y0, y1: y0 + h, floor: floor + 1, bay: b });
    }
    // The ground floor, which is a different rule: a shop has a bay, a house
    // has a window, a shed has neither.
    if (edge.groundWindows && !edge.storefront) {
      const y0 = spec.seat + edge.window.sill;
      holes.push({ u0, u1, y0, y1: y0 + h, floor: 0, bay: b });
    }
  }
  return holes;
}

/** The front door: one bay of the frontage, floor to head height. */
function doorHole(spec, edge) {
  const bay = edge.length / edge.bays;
  const b = Math.floor(edge.bays / 2);
  const centre = (b + 0.5) * bay;
  const w = Math.min(1.1, bay * 0.5);
  return { u0: centre - w / 2, u1: centre + w / 2, y0: spec.seat + 0.05, y1: spec.seat + 2.1, door: true };
}

/**
 * Every piece of one building, in world metres.
 *
 * Returns `[{ part, colour, options }]` — `part` is the buffer shape the baker
 * merges, `options` its shading signature. Nothing here knows what a material
 * is (spec §7.1).
 */
/** A colour scaled towards black by `k`. */
function shadeHex(hex, k) {
  const r = Math.round(((hex >> 16) & 255) * k);
  const g = Math.round(((hex >> 8) & 255) * k);
  const b = Math.round((hex & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/**
 * The band at the top of the ground floor: its colour, overhang and depth.
 *
 * On a house it is a COURSE — a shade of its own wall, barely proud (R5). In
 * the trim's pale cream, 0.18 m deep and 0.1 m out, it read from the pavement
 * as a pale strip across every house in the street (`smoke-S10-street.png`),
 * which the review took for the lawn or the plinth. A shop or an office keeps
 * the trim line: there it is the fascia's shelf.
 */
export function floorBand(spec, trim) {
  if (spec.kind === "residential") return { colour: shadeHex(spec.wall, 0.82), overhang: 0.04, h: 0.1 };
  return { colour: trim, overhang: 0.1, h: 0.18 };
}

export function buildFacade(spec) {
  const out = [];
  const groundTop = spec.seat + spec.groundH;
  const wallTop = groundTop + (spec.storeys - 1) * spec.floorH;
  const glass = 0x39566b;
  const trim = 0xe8e4da;

  // A civic building is its definition's shape, not a wall with windows in it
  // (S1). It leaves this function early: a coal plant has no bays, no
  // storefront and no front door on a frontage, and pretending it does is what
  // made every civic building the same box.
  if (spec.civic) {
    const height = (wallTop - spec.seat) / 1.0;
    out.push(...buildCivic(spec, {
      height, trim, glass, palette: spec.palette, styleName: spec.styleName,
    }));
    out.push(...buildAge(spec, { groundTop, wallTop, trim }));
    return out.filter((piece) => piece.part.triangles > 0);
  }

  const walls = sink();
  const reveals = sink();
  const glazing = sink();
  const lit = sink();

  for (const edge of spec.edges) {
    const geom = EDGES[edge.side];
    const origin = originOf(spec, edge.side);
    // A party wall has no openings at all (S10): it is shared with the house
    // next door, and a window in it looks into their living room.
    const holes = edge.party ? [] : openings(spec, edge, groundTop, wallTop);
    if (edge.door) holes.push(doorHole(spec, edge));
    // A storefront is the wall stopping short: one wide opening a bay high.
    if (edge.storefront) {
      for (const front of spec.storefronts) {
        holes.push({
          u0: front.from + 0.35, u1: front.to - 0.35,
          y0: spec.seat + 0.25, y1: groundTop - 0.6, shop: true,
        });
      }
    }
    panels(walls, { ...geom, length: edge.length }, origin, holes, spec.seat, wallTop);
    for (const hole of holes) {
      const back = reveal(reveals, { ...geom, length: edge.length }, origin, hole, DEPTH);
      // The backing panel. A window is lit at night for about a third of the
      // building (spec §6.5) and goes in its own bucket so E6 can dial it.
      // How many windows are lit at night is the building's OCCUPANCY (B2),
      // not a third of them for everybody: `spec.state.lit` is the fraction,
      // and the choice stays deterministic from the id so the same windows are
      // lit between frames and between two players' cities.
      const share = spec.state?.lit ?? 1 / 3;
      const pick = ((spec.id * 7 + (hole.floor ?? 0) * 13 + (hole.bay ?? 0) * 5) % 100) / 100;
      const target = hole.door ? glazing
        : hole.shop ? lit
          : (pick < share ? lit : glazing);
      // One face, pointing out through the opening.
      if (geom.out[0] + geom.out[1] > 0) target.quad(back[0], back[1], back[2], back[3]);
      else target.quad(back[3], back[2], back[1], back[0]);
    }
  }

  out.push({ part: walls.done(), colour: spec.wall });
  out.push({ part: reveals.done(), colour: trim });
  out.push({ part: glazing.done(), colour: glass });
  // `emissive` puts these in their own bucket with their own material, whose
  // intensity is zero until the night rig turns it up (E6).
  out.push({ part: lit.done(), colour: glass, options: { emissive: 0xffdca8 } });

  // A ground band and a cornice: the two horizontal lines that stop a wall
  // reading as one flat sheet from the pavement.
  const bands = sink();
  const band = floorBand(spec, trim);
  const floorLine = sink();
  floorLine.box(spec.x0 - band.overhang, groundTop - band.h, spec.z0 - band.overhang,
    spec.x1 + band.overhang, groundTop, spec.z1 + band.overhang);
  out.push({ part: floorLine.done(), colour: band.colour });
  if (spec.roof.kind === "flat") {
    bands.box(spec.x0 - 0.16, wallTop - 0.3, spec.z0 - 0.16, spec.x1 + 0.16, wallTop, spec.z1 + 0.16);
  }
  for (const extra of spec.extras) {
    if (extra.kind !== "stringcourse") continue;
    const y = spec.seat + extra.at;
    bands.box(spec.x0 - 0.07, y, spec.z0 - 0.07, spec.x1 + 0.07, y + 0.12, spec.z1 + 0.07);
  }
  out.push({ part: bands.done(), colour: trim });

  out.push({
    part: roof({
      x0: spec.x0, z0: spec.z0, x1: spec.x1, z1: spec.z1, y: wallTop,
      kind: spec.roof.kind, eave: spec.roof.eave, pitch: spec.roof.pitch, parapet: spec.roof.parapet,
    }),
    colour: spec.roof.colour,
  });

  const extras = sink();
  for (const extra of spec.extras) {
    if (extra.kind === "portico") {
      const front = spec.edges.find((e) => e.street);
      const geom = EDGES[front.side];
      const [ox, oz] = originOf(spec, front.side);
      const depth = extra.depth;
      for (let i = 0; i <= extra.bays; i += 1) {
        const u = (i / extra.bays) * front.length;
        const cx = ox + geom.along[0] * u - geom.out[0] * (depth / 2);
        const cz = oz + geom.along[1] * u - geom.out[1] * (depth / 2);
        if (i === 0 || i === extra.bays) continue;
        extras.box(cx - 0.22, spec.seat, cz - 0.22, cx + 0.22, spec.seat + spec.groundH - 0.3, cz + 0.22);
      }
      const x0 = Math.min(ox, ox + geom.along[0] * front.length) - geom.out[0] * depth;
      const x1 = Math.max(ox, ox + geom.along[0] * front.length);
      const z0 = Math.min(oz, oz + geom.along[1] * front.length) - geom.out[1] * depth;
      const z1 = Math.max(oz, oz + geom.along[1] * front.length);
      extras.box(Math.min(x0, x1), spec.seat + spec.groundH - 0.3, Math.min(z0, z1),
        Math.max(x0, x1), spec.seat + spec.groundH, Math.max(z0, z1));
    }
    if (extra.kind === "stack") {
      extras.box(spec.x1 - 1.6, wallTop, spec.z0 + 0.6, spec.x1 - 0.9, wallTop + extra.h, spec.z0 + 1.3);
    }
    if (extra.kind === "porch") {
      const front = spec.edges.find((e) => e.street);
      const geom = EDGES[front.side];
      const [ox, oz] = originOf(spec, front.side);
      const u = front.length / 2;
      const cx = ox + geom.along[0] * u - geom.out[0] * (extra.depth / 2);
      const cz = oz + geom.along[1] * u - geom.out[1] * (extra.depth / 2);
      extras.box(cx - extra.w / 2, spec.seat + 2.2, cz - extra.depth / 2,
        cx + extra.w / 2, spec.seat + 2.4, cz + extra.depth / 2);
    }
  }
  out.push({ part: extras.done(), colour: trim });

  // The house's own furniture (S9). Last, because it reads the same `wallTop`
  // and `groundTop` this function worked out — passing them rather than
  // recomputing is what keeps a chimney on the roof rather than above it.
  out.push(...buildHouseParts(spec, { groundTop, wallTop, trim, glass }));
  // What age and neglect add (B2): a scaffold while it is going up, boards over
  // the windows when its condition has gone. Nothing at all for a building in
  // good repair, which is most of them.
  out.push(...buildAge(spec, { groundTop, wallTop, trim }));

  return out.filter((piece) => piece.part.triangles > 0);
}
