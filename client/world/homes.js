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

/** A detached house, in metres. The reference is suburban: a frontage a car
 * could park across and a depth with a garden behind it. */
export const HOUSE = { width: 10, depth: 9, gap: 3.5 };

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
 * `u` runs along the frontage and `v` back from the street, so the same form
 * serves a lot fronting north and one fronting west — the mapping is here
 * rather than in the renderer for the reason `civicSpin` is in `civic-spec`:
 * two renderers must not each have their own idea of which way a house points.
 *
 * A sub-lot is a lot: same `building`, same `frontage`, same `seat`, a smaller
 * box. Everything downstream — the facade grammar, S9's furniture, the props —
 * works on it unchanged, which is what makes this slice renderer-only.
 */
export function houseLots(lot, level) {
  const alongX = lot.frontage === 0 || lot.frontage === 2;
  const widthM = alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
  const depthM = alongX ? lot.z1 - lot.z0 : lot.x1 - lot.x0;
  const { form, houses } = homeForm(widthM, depthM, level);
  return {
    form,
    lots: houses.map((house) => {
      // `v` measured FROM the street, which is whichever side the frontage is:
      // on side 0 the street is at z0 and v runs +z, on side 2 it is at z1 and
      // v runs -z. Getting this backwards puts the front gardens at the back.
      const [u0, u1] = [house.u0, house.u1];
      const [v0, v1] = [house.v0, house.v1];
      const span = (a, b, lo, hi) => [lo + (hi - lo) * a, lo + (hi - lo) * b];
      let x0; let x1; let z0; let z1;
      if (lot.frontage === 0) {
        [x0, x1] = span(u0, u1, lot.x0, lot.x1);
        [z0, z1] = span(v0, v1, lot.z0, lot.z1);
      } else if (lot.frontage === 2) {
        [x0, x1] = span(1 - u1, 1 - u0, lot.x0, lot.x1);
        [z0, z1] = span(1 - v1, 1 - v0, lot.z0, lot.z1);
      } else if (lot.frontage === 1) {
        [z0, z1] = span(u0, u1, lot.z0, lot.z1);
        [x0, x1] = span(1 - v1, 1 - v0, lot.x0, lot.x1);
      } else {
        [z0, z1] = span(1 - u1, 1 - u0, lot.z0, lot.z1);
        [x0, x1] = span(v0, v1, lot.x0, lot.x1);
      }
      return {
        ...lot,
        x0, z0, x1, z1,
        cx: (x0 + x1) / 2,
        cz: (z0 + z1) / 2,
        frontageLen: alongX ? x1 - x0 : z1 - z0,
        storeys: house.storeys,
        roofKind: house.roof,
        party: house.party,
      };
    }),
  };
}
