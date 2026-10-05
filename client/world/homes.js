// What a residential lot is at each level (slice S10; A71).
//
// The reviewer's histogram of a played city: most homes are one- and two-tile
// lots at level 1 or 2, and the kit drew every one of them as a block filling
// its lot — a 2×1 lot at level 2 came out a 14 m × 34 m three-storey slab,
// because `storeys = 1 + level` and the footprint is the lot less its setback.
// S9's chimneys and porches then landed on a block of flats. Development is
// not the cause and nothing here touches it: this is what a lot DRAWS.
//
// Pure, and in lot-local coordinates: `u` runs along the frontage and `v` back
// from the street, both 0..1 across the lot. The caller maps them to world
// metres by the lot's own frontage, the way `civic-spec.js` does — so one rule
// serves a lot fronting north and one fronting west.
//
// The sizes are in METRES because the rules are: "9 to 11 m wide" is a house,
// "half the lot" is whatever the lot happens to be.

import { lotSpan, placeUnits } from "./sublots.js";

/** A detached house, in metres. The reference is suburban: a frontage a car
 * could park across and a depth with a garden behind it.
 *
 * **Thirteen since A113** (Q102), with the residential setback halved to 1.5 m
 * in the same breath. D4's compare sheet measured the street against the
 * reference's and ours is far too wide: there, the carriageway kerb to kerb is
 * about two thirds of a house; ours was 1.3 houses at street level and two from
 * the air. The verge fixed the air (A113's first half); this is the other side
 * of the same ratio — a 13 m house on a 17 m lot leaves two metres either side,
 * and the 8 m carriageway is 0.6 of a house, which is the reference's number.
 */
export const HOUSE = { width: 13, depth: 9, gap: 3.5 };

/** How deep the front garden is, as a share of the lot's depth. The path and
 * the hedge live here (V6), and it is what stops a house sitting on the kerb. */
export const FRONT_GARDEN = 0.22;

/** Which form a lot takes. Named rather than inferred, because the L2 box, the
 * L3 facade and the test all have to agree about what a lot IS. */
export const FORMS = ["detached", "semi", "terrace", "flats", "block"];

/** Storeys per form. `1 + level` is right from level 3 and wrong below it: a
 * level-2 house is two storeys and a pair, not a three-storey slab. */
function storeysFor(form, level) {
  if (form === "detached") return level >= 1 ? 2 : 1;
  if (form === "semi" || form === "terrace") return 2;
  if (form === "flats") return 3;
  return 1 + level;
}

/** Which form a lot of this size takes at this level.
 *
 * Level 4 and above is the block the kit already draws — a city needs
 * somewhere for density to go, and that is what the existing silhouettes are
 * good at. */
export function formFor(widthM, level) {
  if (level >= 4) return "block";
  if (level === 3) return "flats";
  if (level === 2) return widthM >= 26 ? "terrace" : "semi";
  return "detached";
}

/**
 * The houses on one lot, in lot-local fractions.
 *
 * Returns `{ form, houses: [{ u0, u1, v0, v1, storeys, roof, party }] }`, where
 * `party` marks a wall shared with the next house along — a semi and a terrace
 * have one, a detached house does not, and the renderer uses it to decide
 * whether there is a gap to see through.
 */
export function homeForm(widthM, depthM, level) {
  const form = formFor(widthM, level);
  const front = FRONT_GARDEN;
  const back = 0.06;

  if (form === "block" || form === "flats") {
    // One building across the lot. Flats keep a communal lawn in front of them;
    // a block fills what it is given, which is what the kit has always done.
    const v0 = form === "flats" ? front * 0.8 : 0.02;
    return {
      form,
      houses: [{
        u0: 0.02, u1: 0.98, v0, v1: 0.98,
        storeys: storeysFor(form, level),
        roof: form === "flats" ? "hip" : "flat",
        party: false,
      }],
    };
  }

  // How many houses fit along the frontage, at a real house's width plus the
  // gap between two of them. Never fewer than one: a 9 m lot still gets a
  // house, narrower than the ideal rather than none at all.
  const usable = Math.max(HOUSE.width, widthM - 2);
  const count = form === "detached"
    ? Math.max(1, Math.floor((usable + HOUSE.gap) / (HOUSE.width + HOUSE.gap)))
    : Math.max(2, Math.round(usable / (form === "terrace" ? 7.5 : 9)));

  // A semi and a terrace are JOINED: the row spans the frontage as one run and
  // the houses divide it. Detached houses are spaced, with the leftover split
  // between them as garden.
  const houses = [];
  const depth = form === "detached" ? HOUSE.depth : HOUSE.depth * 0.95;
  const v0 = front;
  const v1 = Math.min(0.98, front + depth / Math.max(depth + 1, depthM));
  if (form === "detached") {
    const span = count * HOUSE.width + (count - 1) * HOUSE.gap;
    const margin = Math.max(1, (widthM - span) / 2);
    for (let i = 0; i < count; i += 1) {
      const x0 = margin + i * (HOUSE.width + HOUSE.gap);
      houses.push({
        u0: x0 / widthM, u1: (x0 + HOUSE.width) / widthM,
        v0, v1, storeys: storeysFor(form, level), roof: i % 2 === 0 ? "gable" : "hip",
        party: false,
      });
    }
  } else {
    const margin = 1.5 / widthM;
    const each = (1 - margin * 2) / count;
    for (let i = 0; i < count; i += 1) {
      houses.push({
        u0: margin + i * each, u1: margin + (i + 1) * each,
        v0, v1, storeys: storeysFor(form, level), roof: "gable",
        party: true,
      });
    }
  }

  // A deep lot at level 1 gets a second row behind the first, round a shared
  // back — the item's "a 2×2 lot is four round a shared back". Only when there
  // is room for a garden between them, or it is a terrace in disguise.
  if (form === "detached" && depthM >= 28) {
    const backRow = houses.map((house) => ({
      ...house,
      v0: 1 - back - (v1 - v0),
      v1: 1 - back,
      roof: house.roof === "gable" ? "hip" : "gable",
    }));
    houses.push(...backRow);
  }
  return { form, houses };
}

/** How many buildings a lot draws. The instanced pass pushes one box each, so
 * the silhouette from the air matches the pavement (E5's rule). */
export function houseCount(widthM, depthM, level) {
  return homeForm(widthM, depthM, level).houses.length;
}

/**
 * The lot's houses as SUB-LOTS, in world metres.
 *
 * The mapping — `u` along the frontage, `v` back from the street, through the
 * lot's `frontage` side — lives in `sublots.js` since S16a, because the trade
 * ladder needs the identical arithmetic and two copies of it is two chances to
 * put the front gardens at the back.
 *
 * A sub-lot is a lot: same `building`, same `frontage`, same `seat`, a smaller
 * box. Everything downstream — the facade grammar, S9's furniture, the props —
 * works on it unchanged, which is what makes this slice renderer-only.
 */
export function houseLots(lot, level) {
  const { widthM, depthM } = lotSpan(lot);
  const { form, houses } = homeForm(widthM, depthM, level);
  return { form, lots: placeUnits(lot, houses) };
}
