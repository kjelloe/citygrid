// The airfield on the ground at L3 (slice T5b).
//
// Plumbing only, and deliberately free of `three` so node can load it: the
// LAYOUT is `client/world/airfield.js`, which has the tests, and this turns
// rectangles into quads. Everything here is flat — a runway with a thickness is
// twelve triangles where two will do (S9), and the slab the silhouette carries
// is already under it.
//
// It rides along with the lot-extras phase rather than taking a phase of its
// own: a phase costs a whole frame per chunk, and this pass is a walk over the
// buildings of one chunk (T3's crossings made the same choice).

import { sink } from "./solid.js";
import { airfieldOf } from "../world/airfield.js";

/** A rectangle, flat, at `y`. Two triangles. */
function slab(s, r, y) {
  // Wound so that the face points UP. The other order — +x then +z, which is
  // how `sink.box` writes its top and how `props-l3`'s flat quads are written —
  // gives a normal of (0, -1, 0) and a surface that is culled from above: four
  // aerial shots of this slice had asphalt in the baker and grass in the
  // picture, with every count green, until a magenta box twenty-five metres
  // tall showed the quads were there and facing the wrong way.
  s.quad([r.x0, y, r.z0], [r.x0, y, r.z1], [r.x1, y, r.z1], [r.x1, y, r.z0]);
}

/** Is this the chunk that OWNS the building? The same rule the facades and the
 * instanced kit use — a lot belongs to the chunk its centre is in (R2) — rather
 * than "does the field overlap this box". A 6x4 airport straddles a boundary
 * more often than not, and overlapping bakes it into both chunks while the
 * instanced kit, which follows the centre rule, draws its L2 slabs over the
 * top of whichever copy is nearer. */
function owns(building, box, tileM) {
  const cx = (building.x + building.w / 2) * tileM;
  const cz = (building.y + building.h / 2) * tileM;
  return cx >= box.x0 && cx < box.x1 && cz >= box.z0 && cz < box.z1;
}

/**
 * The asphalt, the paint and the apron lights of every airport that reaches
 * into this chunk.
 *
 * A building is baked WHOLE by the chunk its footprint starts in — a 6×4 lot
 * crosses a chunk boundary often, and splitting a runway down a seam would put
 * half of it in a chunk that is not baked yet.
 */
export function buildAirfield({ buildings, lots = [], heightAt, palette, box, cfg }) {
  const spec = cfg.airport;
  const asphalt = sink();
  const apronMix = sink();
  const paint = sink();
  const lamps = [];
  let fields = 0;

  for (const building of buildings) {
    const plan = airfieldOf(building);
    if (!plan) continue;
    if (!owns(building, box, cfg.tileM)) continue;
    fields += 1;
    // The LOT'S SEAT, and the highest ground under the footprint, whichever is
    // higher. Two things had to be learnt here, both of them invisible to every
    // count this gate makes:
    //
    //   `airport.maxDrop` limits the drop to about three metres and LEVELS
    //   NOTHING — only roads are graded (spec §5.1) — so a slab at the height
    //   of the footprint's middle is buried at the high end and floating at the
    //   low one. The first aerial shot of this slice was a dark triangle.
    //
    //   And a lot is cut into the hill: its own plot is drawn at the SEAT, so
    //   asphalt laid on the raw height field is under the plot, invisible, with
    //   every pool count green. Three shots said "ok" before a magenta box
    //   twenty-five metres tall said where it had been all along.
    const lot = lots.find((l) => l.id === building.id);
    let ground = -Infinity;
    for (let dx = 0; dx <= building.w; dx += 1) {
      for (let dz = 0; dz <= building.h; dz += 1) {
        const h = heightAt((building.x + dx) * cfg.tileM, (building.y + dz) * cfg.tileM);
        if (h > ground) ground = h;
      }
    }
    const y = Math.max(lot ? lot.seat : -Infinity, ground) + spec.lift;
    slab(asphalt, plan.runway, y);
    slab(apronMix, plan.apron, y);
    slab(asphalt, plan.taxiway, y + 0.002);
    for (const mark of plan.marks) slab(paint, mark, y + spec.lift);
    for (const light of plan.lights) {
      lamps.push({ id: building.id * 64 + lamps.length, x: light.x, y: y + 6, z: light.z });
    }
  }

  return {
    fields,
    lamps,
    pieces: [
      { part: asphalt.done(), colour: palette.road },
      { part: apronMix.done(), colour: palette.civic ?? palette.road },
      { part: paint.done(), colour: palette.roadMark ?? 0xf2f2f2 },
    ].filter((p) => p.part.triangles > 0),
  };
}
