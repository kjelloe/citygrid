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

export const CATEGORY_ORDER = ["power", "water", "service", "amenity"];

export function categoryLabelKey(category) {
  return `category.${category}`;
}

export function buildingLabelKey(def) {
  return `building.${def}`;
}

export function buildMenu(source = catalogue()) {
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
export function menuDefs(source = catalogue()) {
  return buildMenu(source).flatMap((group) => group.items.map((item) => item.def));
}

/** The footprint a building would occupy if placed with its corner here.
 *
 * The reducer anchors a building at its top-left tile, so a 3x3 plant grows
 * right and down from the tile under the pointer. The ghost has to show the
 * same nine tiles the reducer will test, or the player learns the footprint by
 * being refused. */
export function footprintAt(x, y, def, source = catalogue()) {
  const spec = source[def];
  if (!spec) return [{ x, y }];
  const tiles = [];
  for (let dy = 0; dy < spec.h; dy += 1) {
    for (let dx = 0; dx < spec.w; dx += 1) tiles.push({ x: x + dx, y: y + dy });
  }
  return tiles;
}
