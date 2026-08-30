// The controls card, as data.
//
// A playtester who forgets a key currently has nowhere to look: the shortcuts
// exist, and the only place any of them is written down is the map canvas's
// `aria-label`, which is for screen readers. §13.3 asks for keyboard shortcuts;
// it does not say where the player finds out about them.
//
// **The tool shortcuts are derived from `TOOLS`, never listed by hand.** A key
// added there and not here would be a card that lies, and a card that lies is
// worse than no card — the same argument as ruling 027 for strings and 028 for
// roles.

import { TOOLS } from "../input/tools.js";

/** Fixed bindings, each one asserted against the controller by
 * `test/help.test.js` so the card cannot drift from the code. */
export const CAMERA_KEYS = [
  { keys: ["↑", "↓", "←", "→"], labelKey: "help.pan" },
  { keys: ["Q", "E"], labelKey: "help.rotate" },
  { keys: ["+", "−"], labelKey: "help.zoom" },
  { keys: ["Space"], labelKey: "help.pause" },
];

export const ACTION_KEYS = [
  { keys: ["Esc"], labelKey: "help.clearTool" },
  { keys: ["Ctrl", "Z"], labelKey: "help.undo" },
  { keys: ["?"], labelKey: "help.help" },
];

export const POINTER = [
  { labelKey: "help.drag" },
  { labelKey: "help.wheel" },
  { labelKey: "help.rightDrag" },
  { labelKey: "help.tapInspect" },
  { labelKey: "help.minimapClick" },
];

/** One row per tool that has a shortcut, in the order the toolbar shows them. */
export function toolKeys() {
  return Object.keys(TOOLS)
    .filter((name) => TOOLS[name].key !== undefined)
    .map((name) => ({ keys: [TOOLS[name].key.toUpperCase()], labelKey: labelKeyFor(name) }));
}

/** The toolbar's own label for a tool, so the card and the button agree. */
function labelKeyFor(name) {
  if (name === "zoneResidential") return "zone.residential";
  if (name === "zoneCommercial") return "zone.commercial";
  if (name === "zoneIndustrial") return "zone.industrial";
  return `tool.${name}`;
}

export function helpSections() {
  return [
    { titleKey: "help.tools", rows: toolKeys() },
    { titleKey: "help.camera", rows: CAMERA_KEYS },
    { titleKey: "help.actions", rows: ACTION_KEYS },
    { titleKey: "help.pointer", rows: POINTER },
  ];
}
