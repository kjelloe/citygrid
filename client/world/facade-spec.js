// The facade grammar, generated (slice E5; spec §6.2).
//
// Union Square authors a `FacadeSpec` per building by hand. City Grid has no
// research and no authoring step, so the spec is DERIVED from the same
// parameter function the instanced kit reads — which is what makes an L3
// building recognisably the L2 box it replaced: same variant, same wall
// colour, same roof hue, same door side.
//
// Pure, and in `client/world/` for the usual reason: everything that can be
// wrong here is arithmetic about metres, and a window that has stretched
// because the building got taller is invisible in a screenshot until you are
// standing in front of it.
//
// The one idea worth stating: **an opening does not scale**. A window is 1.2 m
// wide on a two-storey house and on a six-storey block, and a shop bay is
// around 5 m however long the frontage. The instanced kit cannot say that,
// because it scales one prototype by a matrix; this can, because it divides a
// real frontage into whole bays and puts a real window in each.

import { getConfig } from "./config.js";
import { jitter } from "./hash.js";
/**
 * The names over the shops — a mirror of `data/names.json`, one list per locale.
 *
 * The browser cannot import JSON without a build step, so this is the same
 * arrangement `config.js` has with `data/cityviewer.json`: the file is the
 * source of truth and `test/facade-spec.test.js` refuses to let the two drift.
 *
 * Equal length in every locale, deliberately: a shop's name is picked by INDEX
 * from a hash of its id, so a language change renames every shop and moves
 * none of them (slice R2, A40).
 */
export const SHOP_NAMES = Object.freeze({
  en: Object.freeze([
    "Bakery",
    "Books",
    "Butcher",
    "Cafe",
    "Chemist",
    "Cycles",
    "Deli",
    "Flowers",
    "Grocer",
    "Hardware",
    "Launderette",
    "Newsagent",
    "Optician",
    "Pizzeria",
    "Records",
    "Shoes",
    "Tailor",
    "Toys",
  ]),
  no: Object.freeze([
    "Bakeri",
    "Bøker",
    "Slakter",
    "Kafé",
    "Apotek",
    "Sykler",
    "Deli",
    "Blomster",
    "Kolonial",
    "Jernvare",
    "Vaskeri",
    "Kiosk",
    "Optiker",
    "Pizzeria",
    "Plater",
    "Sko",
    "Skredder",
    "Leker",
  ]),
});

/** A window module, in metres. Not per category: a window is a window. */
const WINDOW = { w: 1.2, h: 1.5, sill: 0.9, reveal: 0.12 };
/** How far a roof hangs over the wall it sits on. The eave's shadow line is
 * the single most legible cue at eye height (spec §6.3) — and it is also the
 * one part of a building that reaches over the pavement, so it is capped where
 * `walkthrough` can still get past. */
const EAVE = { residential: 0.6, commercial: 0.25, industrial: 0.3, civic: 0.5 };

const DIR4 = [
  { side: 0, axis: "z", at: "z0" },   // north
  { side: 1, axis: "x", at: "x1" },   // east
  { side: 2, axis: "z", at: "z1" },   // south
  { side: 3, axis: "x", at: "x0" },   // west
];

/** Whole bays, never a stretched one.
 *
 * `round` rather than `floor`: a 22 m frontage at a 5 m module is four bays of
 * 5.5 m, not four of 5 m and a 2 m stub, and the stub is what reads as a
 * window that has been pulled. Never fewer than one — a 3 m lot still has a
 * front door. */
function bayCount(length, module) {
  return Math.max(1, Math.round(length / module));
}

/** The name over a shop. From the id, so it survives a reload and never enters
 * game state; the LOCALE only chooses which list the index is read from. */
function signFor(id, index, locale) {
  const list = SHOP_NAMES[locale] ?? SHOP_NAMES.en;
  return list[Math.floor(jitter(id * 31 + index * 7, 53) * list.length) % list.length];
}

function roofOf(kind, variant, params, id) {
  const colour = params.roof;
  if (kind === "commercial" || kind === "civic") {
    return { kind: "flat", colour, eave: 0, parapet: kind === "civic" ? 1.1 : 0.7, pitch: 0 };
  }
  if (kind === "industrial") {
    return {
      kind: variant % 2 === 0 ? "sawtooth" : "flat",
      colour, eave: EAVE.industrial, parapet: variant % 2 === 0 ? 0 : 0.4, pitch: 0.5,
    };
  }
  // Residential: the three pitched forms, by variant, so a terrace is not all
  // one roof and a house keeps its own for life.
  const kinds = ["gable", "hip", "gable", "mansard"];
  return {
    kind: kinds[variant % kinds.length],
    colour,
    eave: EAVE.residential,
    parapet: 0,
    // A pitch in metres of rise per metre of half-span, jittered a little so a
    // street of gables is not a comb.
    pitch: 0.55 + jitter(id, 23) * 0.25,
  };
}

/** Balconies, fire escapes, porticos, roof clutter — by category and variant. */
function extrasOf(kind, variant, spec, id) {
  const out = [];
  if (kind === "civic") out.push({ kind: "portico", bays: Math.min(6, Math.max(2, spec.edges[0].bays)), depth: 1.6 });
  if (kind === "residential" && variant === 1) out.push({ kind: "porch", w: 1.8, depth: 1.1 });
  if (kind === "commercial" && spec.storeys >= 4) out.push({ kind: "fireEscape", side: (variant + 1) % 4 });
  if (kind === "industrial") out.push({ kind: "stack", h: 3 + jitter(id, 29) * 4 });
  if (spec.storeys >= 3 && kind !== "industrial") out.push({ kind: "stringcourse", at: spec.groundH });
  return out;
}

/**
 * The whole facade of one lot, in metres, in world coordinates.
 *
 * `lot` is what `lots.js` derived and `params` is `buildingParams` — the same
 * two the instanced kit reads, which is the guarantee that L2 and L3 are the
 * same house.
 */
export function facadeSpec(lot, params, locale = "en") {
  const cfg = getConfig();
  const kind = params.kind;
  const id = lot.building.id;
  const bayW = cfg.lot.bayW[kind === "civic" ? "none" : kind];

  const edges = DIR4.map(({ side, axis }) => {
    const length = axis === "x" ? lot.z1 - lot.z0 : lot.x1 - lot.x0;
    const street = side === lot.frontage;
    const bays = bayCount(length, bayW);
    return {
      side,
      street,
      length,
      bayW,
      bays,
      window: { ...WINDOW },
      // A door on the frontage, and only there.
      door: street,
      // An industrial ground floor is a blank wall with a roller door in it;
      // everything else has windows down to the pavement.
      groundWindows: kind !== "industrial",
      storefront: street && kind === "commercial",
    };
  });

  const spec = {
    id,
    kind,
    variant: params.variant,
    wall: params.colour,
    base: params.lawn || params.colour,
    groundH: params.groundH,
    floorH: params.floorH,
    storeys: params.storeys,
    seat: lot.seat,
    x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1,
    edges,
    storefronts: [],
    extras: [],
  };
  spec.roof = roofOf(kind, params.variant, params, id);

  if (kind === "commercial") {
    // One tenant per bay along the frontage, each with its own fascia. Two
    // narrow bays make one shop when the frontage is long, because a high
    // street of 5 m shops all the way down reads as a toy.
    const front = edges.find((e) => e.street);
    const perShop = front.bays >= 6 ? 2 : 1;
    for (let b = 0; b < front.bays; b += perShop) {
      const to = Math.min(front.bays, b + perShop);
      spec.storefronts.push({
        from: (b / front.bays) * front.length,
        to: (to / front.bays) * front.length,
        module: front.bayW,
        sign: signFor(id, b, locale),
        // An awning on some of them, by hash. All of them is a market.
        awning: jitter(id * 13 + b, 37) > 0.6,
      });
    }
  }

  spec.extras = extrasOf(kind, params.variant, spec, id);
  return spec;
}
