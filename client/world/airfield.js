// The airfield's ground plan (slice T5b; ruling 044).
//
// One pure function over a building record, in world METRES, read by three
// things that must agree: the L2 silhouette in `civic-spec.js`, the L3 asphalt
// and paint in `render/airport-l3.js`, and the aircraft in `life/plane.js`. A
// runway the plane lands beside is the defect this slice can ship, and it is
// invisible to every instrument except a person looking at the right frame.
//
// **The plan takes no frontage.** An orientable definition carries its own
// rotation in its footprint (ruling 044), so the runway runs along the long
// side and `civicSpin` is not applied to it — the two rotations are different
// questions and, before the airport, no footprint was lopsided enough for them
// to disagree.

import { getConfig } from "./config.js";

/**
 * The three strips, across the SHORT axis, in unit space (−1 … 1) so that one
 * description serves a 6×4 lot and a 4×6 one. `civic-spec.js` builds the
 * airport's slabs from these, which is what keeps the block at city zoom and
 * the asphalt at street level the same shape (E5's L2/L3 rule).
 */
export const BANDS = Object.freeze({
  runway: Object.freeze({ z0: -0.94, z1: -0.36 }),
  // The apron STARTS where the runway ends: the first cut left 0.16 of a unit
  // between them, which on a four-tile lot is six metres of grass for an
  // aircraft to taxi across.
  apron: Object.freeze({ z0: -0.36, z1: 0.4 }),
  terminal: Object.freeze({ z0: 0.46, z1: 0.94 }),
});

/** How much of the long axis the asphalt takes, leaving a grass end. */
const ALONG = 0.97;

function rectangle(mid, half, from, to, axis) {
  return axis === "x"
    ? { x0: from, x1: to, z0: mid - half, z1: mid + half }
    : { x0: mid - half, x1: mid + half, z0: from, z1: to };
}

/**
 * Everything the airport puts on the ground, in metres.
 *
 * `undefined` for any other definition, so a caller can walk every building.
 */
export function airfieldOf(building) {
  if (!building || building.def !== "airport") return undefined;
  const cfg = getConfig();
  const spec = cfg.airport;
  const tileM = cfg.tileM;

  const x0 = building.x * tileM;
  const z0 = building.y * tileM;
  const x1 = x0 + building.w * tileM;
  const z1 = z0 + building.h * tileM;
  // The long side is the runway's, whichever way the footprint was turned.
  const axis = building.w >= building.h ? "x" : "z";
  const alongLow = axis === "x" ? x0 : z0;
  const alongHigh = axis === "x" ? x1 : z1;
  const acrossLow = axis === "x" ? z0 : x0;
  const acrossHigh = axis === "x" ? z1 : x1;
  const acrossMid = (acrossLow + acrossHigh) / 2;
  const acrossHalf = (acrossHigh - acrossLow) / 2;
  const alongMid = (alongLow + alongHigh) / 2;
  const alongHalf = (alongHigh - alongLow) / 2 * ALONG;
  const from = alongMid - alongHalf;
  const to = alongMid + alongHalf;

  /** A band's middle and half-width in metres, from its unit span. */
  const band = (b) => ({
    mid: acrossMid + ((b.z0 + b.z1) / 2) * acrossHalf,
    half: ((b.z1 - b.z0) / 2) * acrossHalf,
  });
  const strip = band(BANDS.runway);
  const apronBand = band(BANDS.apron);

  // The strips. The runway is as wide as its band allows but never wider than
  // the data asks for, so a bigger lot is a longer runway rather than a wider
  // one — a 40 m runway would read as a car park.
  const runway = rectangle(strip.mid, Math.min(spec.runwayHalf, strip.half), from, to, axis);
  // The taxiway runs down the apron's RUNWAY edge, so a plane turning off the
  // runway is on asphalt from the moment it leaves the centreline.
  const taxiway = rectangle(apronBand.mid - apronBand.half + spec.taxiwayHalf,
    Math.min(spec.taxiwayHalf, apronBand.half), from, to, axis);
  const apron = rectangle(apronBand.mid, apronBand.half, from, to, axis);

  // The paint. Everything here is ON the runway: a mark beside it is a line in
  // the grass, which is what the first cut of the threshold bars drew.
  const marks = [];
  const paint = spec.paintW / 2;
  const runHalf = Math.min(spec.runwayHalf, strip.half);
  for (let a = from + spec.dashM; a + spec.dashM <= to - spec.dashM; a += spec.dashM + spec.gapM) {
    marks.push({ kind: "dash", ...rectangle(strip.mid, paint, a, a + spec.dashM, axis) });
  }
  // The thresholds: a comb of bars across each end, the width of the runway.
  for (const end of [0, 1]) {
    const base = end === 0 ? from + spec.thresholdM * 0.4 : to - spec.thresholdM * 1.4;
    for (let k = 0; k < spec.thresholdBars; k += 1) {
      const span = (runHalf * 2) / (spec.thresholdBars * 2 + 1);
      const mid = strip.mid - runHalf + span * (k * 2 + 1.5);
      marks.push({ kind: "threshold", ...rectangle(mid, span * 0.4, base, base + spec.thresholdM, axis) });
    }
  }

  // The apron's lights, down its outer edge — away from the runway, so they
  // light the stand rather than the landing.
  const lights = [];
  const edge = apronBand.mid + apronBand.half - 1.5;
  for (let a = from + spec.lightSpacingM / 2; a <= to; a += spec.lightSpacingM) {
    lights.push(axis === "x" ? { x: a, z: edge } : { x: edge, z: a });
  }

  // The centreline, threshold to threshold, which is the aircraft's whole
  // world on the ground.
  const line = [
    axis === "x" ? { x: from, z: strip.mid } : { x: strip.mid, z: from },
    axis === "x" ? { x: to, z: strip.mid } : { x: strip.mid, z: to },
  ];
  const stand = axis === "x"
    ? { x: alongMid, z: apronBand.mid + apronBand.half * 0.35 }
    : { x: apronBand.mid + apronBand.half * 0.35, z: alongMid };
  // The taxiway's own centreline, which is what an aircraft turns onto.
  const taxiMid = apronBand.mid - apronBand.half + Math.min(spec.taxiwayHalf, apronBand.half);
  const on = (along, across) => (axis === "x" ? { x: along, z: across } : { x: across, z: along });

  return { axis, runway, taxiway, apron, marks, lights, line, stand, on,
    centre: strip.mid, taxiMid, from, to,
    length: Math.hypot(line[1].x - line[0].x, line[1].z - line[0].z) };
}
