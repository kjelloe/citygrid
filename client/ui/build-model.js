// The build menu: which buildings a player can place, in the order they should
// meet them.
//
// This exists because the toolbar had none. Zones, roads, wires, pipes and the
// bulldozer were everything a person could reach, and development needs both
// power and water — so a human player could zone and pave forever and nothing
// would ever develop. The engine could place a plant; the game could not.
//
// Categories run in the order a new mayor needs them: power, then water, then
// services, then amenities. Within a category the cheapest comes first, because
// the cheap one is nearly always the one to start with and a row is read left
// to right.
//
// Pure, like every other `*-model.js`: catalogue in, keys and numbers out. The
// cost quoted here is the LIST price from the catalogue; what the player is
// actually charged comes from `buildingCost()`, which knows the difficulty.

import { catalogue } from "../../engine/catalogue.js";

export const CATEGORY_ORDER = ["power", "water", "service", "amenity", "transport", "civic"];

export function categoryLabelKey(category) {
  return `category.${category}`;
}

export function buildingLabelKey(def) {
  return `building.${def}`;
}

/** The menu, at a RANK. A locked entry stays in it — greyed, with the rank it
 * wants named (T5, A69). Hiding it would mean a player never learns the airport
 * exists, and the build menu is the only place the catalogue is visible. */
export function buildMenu(source = catalogue(), rank = 0) {
  const groups = [];
  for (const category of CATEGORY_ORDER) {
    const items = Object.keys(source)
      .filter((def) => source[def]?.category === category)
      .map((def) => ({
        def,
        labelKey: buildingLabelKey(def),
        cost: source[def].cost,
        w: source[def].w,
        h: source[def].h,
        needsSurfaceWater: source[def].needsSurfaceWater === true,
        orientable: source[def].orientable === true,
        unlock: source[def].unlock | 0,
        locked: (source[def].unlock | 0) > rank,
      }))
      // Ties broken by name so the menu is the same on every machine — a
      // toolbar that reorders itself between builds makes every UI gate flaky.
      .sort((a, b) => a.cost - b.cost || (a.def < b.def ? -1 : 1));
    if (items.length > 0) groups.push({ category, labelKey: categoryLabelKey(category), items });
  }
  return groups;
}

/** Every building the menu offers, flat. The acceptance gate uses it to check
 * that nothing in the catalogue is unreachable from the interface. */
export function menuDefs(source = catalogue(), rank = 0) {
  return buildMenu(source, rank).flatMap((group) => group.items.map((item) => item.def));
}

/** Has this definition an axis the player may turn? The one building that has
 * (T5) is the reason the ghost and the command carry an orientation at all. */
export function isOrientable(def, source = catalogue()) {
  return source[def]?.orientable === true;
}

/** The footprint a building would occupy if placed with its corner here.
 *
 * The reducer anchors a building at its top-left tile, so a 3x3 plant grows
 * right and down from the tile under the pointer. The ghost has to show the
 * same nine tiles the reducer will test, or the player learns the footprint by
 * being refused. */
export function footprintAt(x, y, def, source = catalogue(), orientation = 0) {
  const spec = source[def];
  if (!spec) return [{ x, y }];
  // Turned, for the one definition with an axis (T5). The ghost has to show the
  // tiles the reducer will claim, and the reducer swaps w and h for
  // `orientation: 1` — a ghost that did not would teach the player the footprint
  // by refusing them.
  const turned = orientation === 1 && spec.orientable === true;
  const w = turned ? spec.h : spec.w;
  const h = turned ? spec.w : spec.h;
  const tiles = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) tiles.push({ x: x + dx, y: y + dy });
  }
  return tiles;
}
