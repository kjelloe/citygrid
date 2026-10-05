// What a commercial or industrial lot is at each level (slice S16a).
//
// S10 fixed this for houses and left trade behind. The measurement that filed
// the item: in a 25-year played city (seed 1003, 96²) **45 of 61 trade
// buildings are 20 m or more across**, the median commercial lot is **40 m wide
// at level 1**, and every one of them was one box from the air and one facade
// from the pavement — a corner shop drawn as a department store, and an
// industrial estate drawn as one shed the size of a block.
//
// The ladder, per zone:
//
//   commercial  1 shops   a parade of single-storey units, joined, under one run
//               2 parade  the same frontage, two storeys, flats over the shops
//               3+ block   one mass — what the kit has always been good at
//   industrial  1 shed    one shed set back, with the yard between it and the kerb
//               2 units   two or three sheds in a row, sharing the yard
//               3+ works   one mass across the lot
//
// Pure in `(widthM, depthM, level, zone)` and nothing else: no clock, no
// random, no state (ruling 032), which is what lets `test/trade.test.js` plant
// the cases that matter instead of counting them in a screenshot.

import { lotSpan, placeUnits } from "./sublots.js";

const ZONE_COMMERCIAL = 2;

export const TRADE_FORMS = ["shops", "parade", "block", "shed", "units", "works"];

/**
 * How wide a unit wants to be, in metres.
 *
 * A shop unit is a shop's frontage, not a share of the lot: `facade-spec.js`
 * already refuses to put a 5 m shop bay on a long frontage ("a high street of
 * 5 m shops all the way down reads as a toy"), and the same number from the
 * other end is what a unit must be. 12 m against a 20 m tile is the proportion
 * D4's reference has; a shed is wider because a shed is one span.
 */
export const UNIT = { min: 7.5, max: 19, shop: 12, shed: 16, gap: 1.2 };

/** The setback from the kerb, as a fraction of the lot's depth.
 *
 * A shop stands ON the pavement — that is what a high street is — so commerce
 * gets almost nothing, and industry gets the yard its lorries turn in. */
const KERB = { shops: 0.04, parade: 0.04, block: 0.02, shed: 0.16, units: 0.16, works: 0.02 };

function storeysFor(form, level) {
  if (form === "shops") return 1;
  if (form === "parade") return 2;
  if (form === "shed" || form === "units") return 1;
  return 1 + level;
}

/** Which form a lot of this size takes at this level. */
export function tradeFormFor(widthM, level, zone) {
  const trade = zone === ZONE_COMMERCIAL;
  if (level >= 3) return trade ? "block" : "works";
  if (level === 2) return trade ? "parade" : "units";
  return trade ? "shops" : "shed";
}

/**
 * The units on one lot, in lot-local fractions.
 *
 * Returns `{ form, units: [{ u0, u1, v0, v1, storeys, roof, party }] }` — the
 * shape `homeForm` returns, so `placeUnits` serves both.
 */
export function tradeForm(widthM, depthM, level, zone) {
  const form = tradeFormFor(widthM, level, zone);
  const kerb = KERB[form];

  if (form === "block" || form === "works") {
    return {
      form,
      units: [{
        u0: 0.02, u1: 0.98, v0: kerb, v1: 0.98,
        storeys: storeysFor(form, level), roof: "flat", party: false,
      }],
    };
  }

  const joined = form === "shops" || form === "parade";
  const ideal = joined ? UNIT.shop : UNIT.shed;
  // Never fewer than one: a 12 m lot gets a narrow unit rather than nothing.
  // `round` rather than `floor` so a 40 m frontage is three 13 m shops and not
  // two 20 m ones — the ceiling in `UNIT` is what stops the rounding drifting
  // into the slab this slice is about.
  const margin = joined ? 1 : 1.5;
  const usable = Math.max(ideal, widthM - margin * 2);
  const count = Math.max(1, Math.min(
    Math.round(usable / ideal),
    Math.floor(usable / UNIT.min),
  ));

  // The depth: a shop is as deep as its lot allows and a shed is a shed. Both
  // in metres against the lot, so a 36 m deep industrial lot keeps its yard
  // rather than growing a 36 m shed.
  const deep = joined
    ? Math.min(depthM * 0.82, Math.max(12, depthM * 0.6))
    : Math.min(depthM * 0.62, 26);
  const v0 = kerb;
  const v1 = Math.min(0.98, v0 + deep / depthM);

  const units = [];
  if (joined) {
    // One run divided: a parade has no gaps, which is the single strongest cue
    // that a row of boxes is a high street and not a retail park.
    const u0 = margin / widthM;
    const each = (1 - (margin / widthM) * 2) / count;
    for (let i = 0; i < count; i += 1) {
      units.push({
        u0: u0 + i * each, u1: u0 + (i + 1) * each,
        v0, v1, storeys: storeysFor(form, level), roof: "flat", party: true,
      });
    }
    return { form, units };
  }

  // Sheds are spaced, with the leftover between them as service road.
  const span = count * ideal + (count - 1) * UNIT.gap;
  const left = Math.max(margin, (widthM - span) / 2);
  for (let i = 0; i < count; i += 1) {
    const x0 = left + i * (ideal + UNIT.gap);
    units.push({
      u0: x0 / widthM, u1: Math.min(0.99, (x0 + ideal) / widthM),
      v0, v1, storeys: storeysFor(form, level),
      roof: i % 2 === 0 ? "sawtooth" : "flat", party: false,
    });
  }
  return { form, units };
}

/** How many buildings a lot draws. The instanced pass pushes one box each, so
 * the silhouette from the air matches the pavement (E5's rule). */
export function tradeCount(widthM, depthM, level, zone) {
  return tradeForm(widthM, depthM, level, zone).units.length;
}

/** The lot's units as SUB-LOTS, in world metres. */
export function tradeLots(lot, level, zone) {
  const { widthM, depthM } = lotSpan(lot);
  const { form, units } = tradeForm(widthM, depthM, level, zone);
  return { form, lots: placeUnits(lot, units) };
}
