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
import { CAMERA_BUTTONS } from "./camera-model.js";

/** Fixed bindings, each one asserted against the controller by
 * `test/help.test.js` so the card cannot drift from the code. */
export const CAMERA_KEYS = deriveCameraKeys();

/** The camera's rows, derived from the cluster's own table (K1, ruling 042).
 *
 * Hand-written until now, which is how `PageUp`, `PageDown`, `Home` and the
 * photo key came to be bound or promised with nothing on the card saying so —
 * and how `P` could be taken from the pipe tool without a word changing here.
 * The table is the single source; `test/help.test.js` checks the controller
 * binds what this claims. */
function deriveCameraKeys() {
  const GLYPH = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  const rows = [];
  for (const button of CAMERA_BUTTONS) {
    const keys = button.keys.map((k) => GLYPH[k] ?? (k.length === 1 ? k.toUpperCase() : k));
    // One row per movement, not one per key: the card is read by a person, and
    // "↑ ↓ ← →  Move" is a row where four rows would be a list.
    rows.push({ keys, labelKey: button.labelKey });
  }
  return rows;
}


export const ACTION_KEYS = [
  // Space PAUSES, and it is here rather than with the camera because it is not
  // a camera movement. K1 derived the camera rows from `CAMERA_BUTTONS` and
  // this row fell off the card entirely — `test/reachability.test.js` caught it
  // as a catalogue string nothing could show, which is what that test is for.
  { keys: ["Space"], labelKey: "help.pause" },
  // Shift hurries every held camera key (K2). Not a camera movement of its own
  // — it has no button on the cluster and cannot have one, because it modifies
  // whatever is already held — so it belongs here, beside Space, for the same
  // reason: a control with no button still needs a screen (ruling 027).
  { keys: ["Shift"], labelKey: "help.hurry" },
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
