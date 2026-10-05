// Which ladder a lot climbs (S16a).
//
// Three readers ask "what buildings are on this lot?" — the L3 baker, the
// instanced pass and the foliage — and until S16a two of them asked it with
// `kind === "residential"` written out in full and the third asked about zones.
// A fourth form (S10's houses, S16a's parades and sheds, civic's single mass)
// would have been three edits in three files, which is how the L2 box and the
// L3 facade come to disagree about what a lot is (E5's rule, ruling 032).
//
// So: one function, every reader. Pure.

import { houseLots } from "./homes.js";
import { tradeLots } from "./trade.js";
import { getConfig } from "./config.js";

const ZONE_OF = { residential: 1, commercial: 2, industrial: 3 };

/**
 * The buildings on a lot, as sub-lots. One entry — the lot itself — when the
 * lot is a single mass, which is every civic definition and anything whose
 * kind we do not recognise.
 */
export function unitsOf(lot, kind) {
  const level = lot.building?.level ?? 0;
  if (kind === "residential") return houseLots(lot, level).lots;
  const zone = ZONE_OF[kind];
  if ((zone === 2 || zone === 3) && getConfig().lot.ladder !== false) {
    return tradeLots(lot, level, zone).lots;
  }
  return [lot];
}
