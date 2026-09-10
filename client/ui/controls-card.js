// The first-run controls card (slice K3, A58).
//
// Kjell: *"freelook without buttons, best practice, but add overlay for first
// time players with 'dont show this again' and option to re-enable overlay
// later."*
//
// It is the discovery surface for a scheme that has no buttons in it by design.
// Ruling 027 says a control needs a screen; a free look has no control to put on
// one, so what it needs instead is to be *told once*. The camera cluster (K1)
// covers the movements that do have buttons — this covers the ones that are
// gestures: the mouse buttons, the drag-look, the edge of the screen.
//
// The rows come from `camera-model.js` and `buttons.js` rather than a list of
// their own, for the reason the help card does: a card that describes controls
// from memory describes the controls of an earlier build.

import { t } from "../i18n.js";
import { CAMERA_BUTTONS } from "./camera-model.js";

/** What the mouse does, per mode. Not derivable from the camera table — these
 * are gestures rather than buttons — so they are named here, and
 * `test/help.test.js` checks the controller binds what they claim. */
export const POINTER_ROWS = [
  { keysKey: "controls.mouse.left", labelKey: "camera.pan" },
  { keysKey: "controls.mouse.right", labelKey: "camera.rotateLeft" },
  { keysKey: "controls.mouse.both", labelKey: "camera.zoomIn" },
  { keysKey: "controls.mouse.hand", labelKey: "camera.hand" },
  // The two free-look rows are the reason this card exists at all: looking
  // needs nothing held (A58), and a control with no button and no key is
  // invisible until something says it out loud.
  { keysKey: "controls.mouse.walk", labelKey: "controls.walk" },
  { keysKey: "controls.mouse.move", labelKey: "controls.look" },
];

/**
 * Shows the card, once, unless the player has put it away.
 *
 * `shown` is the stored preference — `settings.controlsCard`. Returns the node
 * so the caller can dispose of it; returns `undefined` when there is nothing to
 * show, so a returning player is never interrupted.
 */
export function createControlsCard(root, { shown = true, onDismiss } = {}) {
  if (!shown) return undefined;

  const card = document.createElement("div");
  card.className = "controls-card";
  card.id = "controls-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-label", t("controls.title"));

  const title = document.createElement("h2");
  title.textContent = t("controls.title");
  card.append(title);

  const list = document.createElement("dl");
  for (const row of POINTER_ROWS) {
    const key = document.createElement("dt");
    key.textContent = t(row.keysKey);
    const what = document.createElement("dd");
    what.textContent = t(row.labelKey);
    list.append(key, what);
  }
  // And the keys the cluster carries, so the card and the buttons agree.
  for (const button of CAMERA_BUTTONS) {
    if (button.keys.length === 0) continue;
    const key = document.createElement("dt");
    key.textContent = button.keys
      .map((k) => (k.length === 1 ? k.toUpperCase() : k))
      .join(" ");
    const what = document.createElement("dd");
    what.textContent = t(button.labelKey);
    list.append(key, what);
  }
  card.append(list);

  const note = document.createElement("p");
  note.className = "controls-note";
  note.textContent = t("controls.reopen");
  card.append(note);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.id = "controls-dismiss";
  dismiss.className = "controls-dismiss";
  dismiss.textContent = t("controls.dismiss");
  // One button, and it is the "don't show this again" Kjell asked for by name.
  // A separate close-without-remembering would mean deciding twice about a card
  // whose whole purpose is to be read once.
  dismiss.addEventListener("click", () => {
    onDismiss?.();
    card.remove();
  });
  card.append(dismiss);

  root.append(card);
  // Focus goes to the button: a dialog that appears without focus is a dialog a
  // keyboard player has to hunt for, and this one has exactly one action.
  dismiss.focus?.();
  return {
    node: card,
    dispose() { card.remove(); },
  };
}
