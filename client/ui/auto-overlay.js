// "Auto": show me the layer I am working in.
//
// Kjell's playtest (P29): "we need to have a layer called Auto which switches
// to the layer you need to see the work you are trying to do."
//
// The bugs that made this urgent are fixed — zoning, power lines and water
// mains are drawn on the map now — so Auto is a convenience rather than a
// workaround. It is still the right convenience: the overlay answers a question
// the map cannot ("is this lot actually SUPPLIED?"), and that is exactly the
// question you have while holding the wire tool.
//
// Pure, and a plain table rather than a rule: "the tool whose name starts with
// zone" is the kind of cleverness that breaks the day a tool is renamed.

/** Which overlay each tool wants behind it. A tool that is not here wants no
 * overlay — the bulldozer and the building tool are about the ground itself. */
const WANTS = {
  zoneResidential: "zoning",
  zoneCommercial: "zoning",
  zoneIndustrial: "zoning",
  dezone: "zoning",
  wire: "power",
  pipe: "water",
  road: "traffic",
};

export const AUTO = "auto";

/** The overlay to draw, given what the player chose and what they are holding.
 *
 * `chosen` is what they picked from the menu. If that is a real overlay it
 * WINS — a player who asked for pollution wants pollution, whatever tool is in
 * their hand. Auto is the only mode that follows the tool, and it shows nothing
 * when nothing is held, so putting the tool down clears the map.
 */
export function resolveOverlay(chosen, tool) {
  if (chosen !== AUTO) return chosen;
  return WANTS[tool];
}

/** Whether `chosen` would show something right now — for the menu, so "Auto"
 * can say what it is currently doing rather than just being selected. */
export function autoTarget(tool) {
  return WANTS[tool];
}

export function toolsWithOverlay() {
  return Object.keys(WANTS).sort();
}
