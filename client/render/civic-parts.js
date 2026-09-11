// Drawing a civic building as what it is (slice S1), and what age does to any
// building (slice B2).
//
// `client/world/civic-spec.js` says which masses a definition is made of, in
// unit space across its lot; this puts them in metres. The same table builds
// the instanced box at city zoom, which is what makes the coal plant a player
// walks up to the coal plant they saw from the air (E5's rule).
//
// B2's half is here too because it is the same question asked of every
// building: a construction shell, grime on the walls, boards on the windows.
// The judgements are all in `client/world/age.js` — this only draws them.

import { sink } from "./solid.js";
import { EDGES, originOf } from "./edges.js";

/** How many sides a round mass gets. Eight: a tank at street level reads as
 * round at eight and the difference to sixteen is 48 triangles a tank, on a
 * building there may be four of. */
const ROUND_SIDES = 8;

const volume = (m) => (m.x1 - m.x0) * (m.z1 - m.z0) * (m.y1 - m.y0);

/** A prism with `sides` faces filling the mass's box. */
function drum(s, m, y0, y1) {
  const cx = (m.x0 + m.x1) / 2;
  const cz = (m.z0 + m.z1) / 2;
  const rx = (m.x1 - m.x0) / 2;
  const rz = (m.z1 - m.z0) / 2;
  const at = (i, y) => {
    const a = (i / ROUND_SIDES) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
  };
  for (let i = 0; i < ROUND_SIDES; i += 1) {
    const j = (i + 1) % ROUND_SIDES;
    s.quad(at(i, y0), at(j, y0), at(j, y1), at(i, y1));
    // The lid, as a fan. The floor is never seen — a drum stands on the ground.
    s.tri([cx, y1, cz], at(i, y1), at(j, y1));
  }
}

/**
 * One civic building's masses, in world metres.
 *
 * `spec.civic.masses` are in [-1, 1] across the lot and in units of the lot's
 * own height; `height` is what one unit of y is worth, which the caller knows
 * because it worked out the wall top already.
 */
export function buildCivic(spec, { height, trim, glass }) {
  if (!spec.civic) return [];
  const out = [];
  const body = sink();
  const cap = sink();
  const detail = sink();
  const cx = (spec.x0 + spec.x1) / 2;
  const cz = (spec.z0 + spec.z1) / 2;
  const hx = (spec.x1 - spec.x0) / 2;
  const hz = (spec.z1 - spec.z0) / 2;
  let top = 0;
  for (const m of spec.civic.masses) top = Math.max(top, m.y1);

  for (const m of spec.civic.masses) {
    const x0 = cx + m.x0 * hx;
    const x1 = cx + m.x1 * hx;
    const z0 = cz + m.z0 * hz;
    const z1 = cz + m.z1 * hz;
    const y0 = spec.seat + m.y0 * height;
    const y1 = spec.seat + m.y1 * height;
    // The tallest mass wears the roof colour — the tank on a water tower, the
    // stack on a power station — and a flat one under 0.15 of the lot's height
    // is ground rather than building: a yard, a coal heap, the park's lawn.
    const target = m.y1 >= top - 1e-6 && spec.civic.masses.length > 1 ? cap
      : (m.y1 - m.y0) < 0.15 ? detail : body;
    if (m.round) drum(target, { x0, x1, z0, z1 }, y0, y1);
    else target.box(x0, y0, z0, x1, y1, z1);
  }

  // Windows on the front of the biggest mass — the one a person goes into.
  // Flat quads, two triangles each (S9's lesson): a civic building drawn as
  // masses alone has no scale on it at all, and a police station with no
  // windows reads as a warehouse.
  const hall = spec.civic.masses.reduce((best, m) =>
    volume(m) > volume(best) ? m : best, spec.civic.masses[0]);
  if (hall.y1 - hall.y0 > 0.35) {
    const glassSink = sink();
    const fx0 = cx + hall.x0 * hx;
    const fx1 = cx + hall.x1 * hx;
    const fz = cz + hall.z1 * hz + 0.03;
    const wide = fx1 - fx0;
    const rows = hall.y1 - hall.y0 > 0.8 ? 2 : 1;
    const columns = Math.max(2, Math.min(5, Math.round(wide / 6)));
    for (let r = 0; r < rows; r += 1) {
      const y0 = spec.seat + (hall.y0 + (hall.y1 - hall.y0) * (0.25 + r * 0.4)) * height;
      const y1 = y0 + Math.min(1.6, (hall.y1 - hall.y0) * height * 0.28);
      for (let c = 0; c < columns; c += 1) {
        const u0 = fx0 + wide * ((c + 0.3) / columns);
        const u1 = fx0 + wide * ((c + 0.7) / columns);
        glassSink.quad([u0, y0, fz], [u1, y0, fz], [u1, y1, fz], [u0, y1, fz]);
      }
    }
    out.push({ part: glassSink.done(), colour: glass });
  }

  out.push({ part: body.done(), colour: spec.wall });
  out.push({ part: cap.done(), colour: spec.roof?.colour ?? trim });
  out.push({ part: detail.done(), colour: spec.base ?? trim });
  return out.filter((piece) => piece.part.triangles > 0);
}

/**
 * What age and neglect add to any building (B2).
 *
 * A construction shell while it is being built, boards over some windows when
 * the condition has gone, and nothing at all for a building in good repair —
 * which is most of them, so this returns an empty list on the common path.
 */
export function buildAge(spec, { groundTop, wallTop, trim }) {
  const state = spec.state;
  if (!state || state.phase === "standing" && state.boarded === 0) return [];
  const out = [];
  const timber = sink();

  if (state.phase === "site") {
    // A scaffold to the FINISHED height, with the shell growing inside it.
    // Standing it on the shell was the first version and it is what a building
    // site does not look like: at a tenth of a two-storey civic building the
    // whole thing was under a metre tall and read as a bump in the grass. The
    // spec's heights are already scaled by `progress`, so the finished top is
    // that divided back out.
    const shellTop = wallTop;
    const finishedTop = spec.seat + (wallTop - spec.seat) / Math.max(0.05, state.progress);
    const posts = [[spec.x0, spec.z0], [spec.x1, spec.z0], [spec.x1, spec.z1], [spec.x0, spec.z1]];
    for (const [px, pz] of posts) {
      const ox = px === spec.x0 ? -0.25 : 0.25;
      const oz = pz === spec.z0 ? -0.25 : 0.25;
      timber.box(px + ox - 0.09, spec.seat, pz + oz - 0.09,
        px + ox + 0.09, finishedTop + 1.2, pz + oz + 0.09);
    }
    for (const lift of [0.35, 0.7, 1.0]) {
      const y = spec.seat + (finishedTop - spec.seat) * lift;
      for (const z of [spec.z0 - 0.25, spec.z1 + 0.25]) {
        timber.box(spec.x0 - 0.25, y, z - 0.05, spec.x1 + 0.25, y + 0.1, z + 0.05);
      }
      for (const x of [spec.x0 - 0.25, spec.x1 + 0.25]) {
        timber.box(x - 0.05, y, spec.z0 - 0.25, x + 0.05, y + 0.1, spec.z1 + 0.25);
      }
    }
    out.push({ part: timber.done(), colour: 0xb08040 });
    return out.filter((piece) => piece.part.triangles > 0);
  }

  // Boards. Over the street windows first — the ones a player is standing in
  // front of — and as many of them as the condition has lost.
  const boards = sink();
  for (const edge of spec.edges) {
    if (!edge.street && state.boarded < 0.7) continue;
    const geom = EDGES[edge.side];
    const [ox, oz] = originOf(spec, edge.side);
    const bay = edge.length / edge.bays;
    for (let b = 0; b < edge.bays; b += 1) {
      // Deterministic, from the building's id: the same windows stay boarded
      // between frames, and between one player's city and another's.
      if (((spec.id * 13 + b * 7) % 100) / 100 >= state.boarded) continue;
      const u = (b + 0.5) * bay;
      const at = (uu, y) => [
        ox + geom.along[0] * uu - geom.out[0] * 0.03,
        y,
        oz + geom.along[1] * uu - geom.out[1] * 0.03,
      ];
      const y0 = groundTop + 0.9;
      const a = at(u - 0.65, y0); const bb = at(u + 0.65, y0);
      const c = at(u + 0.65, y0 + 1.5); const d = at(u - 0.65, y0 + 1.5);
      if (geom.out[0] + geom.out[1] > 0) boards.quad(a, bb, c, d);
      else boards.quad(bb, a, d, c);
    }
  }
  out.push({ part: boards.done(), colour: 0x7a6a58 });
  return out.filter((piece) => piece.part.triangles > 0);
}
