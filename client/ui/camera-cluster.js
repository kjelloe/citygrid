// The camera cluster (slice K1, ruling 042).
//
// Every camera movement, in one place, on the screen, in every mode. Before
// this the camera was folklore: right-drag orbits, middle-drag pans, Q and E
// snap, arrows nudge, F stands in the street — and a player found out from the
// help card or never.
//
// The DOM only. What the buttons ARE is `camera-model.js`, which node can load
// and a test can argue with; what they DO is `client/input/controller.js`,
// through the same intents the keys use. This module knows neither the camera
// nor the renderer, which is what makes ruling 042 §1's "a button that does
// something a key cannot, or the reverse, is a defect" true by construction
// rather than by vigilance.

import { t } from "../i18n.js";
import { makeRoving } from "./roving.js";
import { buttonsFor, labelFor, hintFor } from "./camera-model.js";

/** The pad's four directions, in screen space. */
const PAD = [
  { id: "up", x: 0, y: -1, glyph: "▲", labelKey: "camera.pan" },
  { id: "left", x: -1, y: 0, glyph: "◀", labelKey: "camera.pan" },
  { id: "right", x: 1, y: 0, glyph: "▶", labelKey: "camera.pan" },
  { id: "down", x: 0, y: 1, glyph: "▼", labelKey: "camera.pan" },
];

/** The glyphs, and every one of them chosen for rendering rather than for
 * meaning alone.
 *
 * The first set used `＋` (fullwidth plus) and `🚶` (an emoji), and both came
 * back as empty boxes in `reports/smoke-K1-desktop.png` — a button with tofu on
 * it, in a suite that was entirely green. Nothing here is outside the range a
 * default UI font is certain to have.
 *
 * The mode buttons carry their KEY rather than a picture, which is the one
 * place this cluster can teach a shortcut: ruling 042 exists because the camera
 * was folklore — the keys were real and never on screen. */
const GLYPH = {
  "rotate-left": "↺", "rotate-right": "↻",
  "tilt-up": "⌃", "tilt-down": "⌄",
  "zoom-in": "+", "zoom-out": "−",
  home: "⌂", street: "F", photo: "C",
};

function button(className, text, label, hint) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = text;
  node.setAttribute("aria-label", label);
  if (hint) node.title = hint;
  return node;
}

/**
 * Builds the cluster into `root` and returns a handle.
 *
 * `controller` is asked to hold and release intents; nothing here touches the
 * view. A held button repeats at a rate the controller applies per frame
 * (ruling 042 §3), so pressing and releasing is start-and-stop rather than a
 * timer of this module's own — a timer here would be a second clock, and the
 * frame rate would decide how far a press moved you.
 */
export function createCameraCluster(root, { controller, onOpen, onMode } = {}) {
  const cluster = document.createElement("div");
  cluster.className = "camera-cluster";
  cluster.id = "camera-cluster";
  cluster.setAttribute("role", "toolbar");
  cluster.setAttribute("aria-label", t("camera.cluster"));

  // On a phone the cluster is one button until it is opened (ruling 042 §5: the
  // chrome does not grow, and the playtest's 41% at 390×844 is the ceiling).
  const opener = button("camera-open", "◎", t("camera.open"), t("camera.open"));
  opener.id = "camera-open";
  opener.addEventListener("click", () => {
    const open = cluster.dataset.open !== "true";
    cluster.dataset.open = String(open);
    onOpen?.(open);
  });

  /** The opener EXISTS only where it is used.
   *
   * It is the phone's way in and is `display: none` on a desktop — and a button
   * that is styled away is still a button to anything that walks the interface:
   * `reach_smoke` reported it as a control that could not be brought on screen,
   * which is exactly what it was. Presence rather than paint, so the question
   * "can a player reach this?" has the same answer as "is this here?". */
  const narrow = globalThis.matchMedia?.("(max-width: 520px)");
  const syncOpener = () => {
    if (narrow?.matches) {
      if (!opener.isConnected) cluster.prepend(opener);
    } else {
      opener.remove();
      cluster.dataset.open = "true";
    }
  };
  narrow?.addEventListener?.("change", syncOpener);

  const body = document.createElement("div");
  body.className = "camera-body";

  const pad = document.createElement("div");
  pad.className = "camera-pad";
  const held = [];

  /** Press-and-hold, on mouse and on touch, with the release always heard.
   *
   * `pointercancel` and `pointerleave` as well as `pointerup`: a finger that
   * slides off a button and lifts elsewhere never sends `pointerup` to it, and
   * a camera that keeps panning after the hand has gone is the worst bug this
   * control can have. */
  function holdable(node, id, axis) {
    const stop = () => controller?.holdCamera?.(id, false);
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      controller?.holdCamera?.(id, true, axis);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      node.addEventListener(type, stop);
    }
    held.push(stop);
  }

  for (const dir of PAD) {
    const node = button(`camera-pad-${dir.id}`, dir.glyph, t("camera.pan"), t("camera.pan.hint"));
    node.dataset.cameraId = `pan-${dir.id}`;
    holdable(node, "pan", { x: dir.x, y: dir.y });
    pad.append(node);
  }
  body.append(pad);

  const rest = document.createElement("div");
  rest.className = "camera-rest";
  const nodes = new Map();
  for (const spec of buttonsFor("city").filter((b) => b.intent !== "pan")) {
    const node = button(`camera-${spec.id}`, GLYPH[spec.id] ?? "•",
      t(spec.labelKey), t(spec.hintKey));
    node.dataset.cameraId = spec.id;
    node.id = `camera-${spec.id}`;
    if (spec.repeats) holdable(node, spec.id);
    else if (spec.intent === "street" || spec.intent === "photo") {
      node.addEventListener("click", () => onMode?.(spec.id));
    } else node.addEventListener("click", () => controller?.cameraAction?.(spec.id));
    nodes.set(spec.id, node);
    rest.append(node);
  }
  body.append(rest);
  cluster.append(body);
  root.append(cluster);
  syncOpener();
  const roving = makeRoving(cluster);

  return {
    node: cluster,
    /** The mode changed: show the buttons that belong to it and relabel the
     * ones whose job it changes (the pad pans, walks or flies). */
    setMode(mode) {
      cluster.dataset.mode = mode;
      const shown = new Set(buttonsFor(mode).map((b) => b.id));
      for (const [id, node] of nodes) node.hidden = !shown.has(id);
      const padLabel = t(labelFor(buttonsFor(mode).find((b) => b.intent === "pan"), mode));
      for (const node of pad.children) node.setAttribute("aria-label", padLabel);
      for (const [id, node] of nodes) {
        const spec = buttonsFor(mode).find((b) => b.id === id);
        if (!spec) continue;
        const label = t(labelFor(spec, mode));
        node.setAttribute("aria-label", label);
        node.title = t(hintFor(spec, mode));
        node.setAttribute("aria-pressed", String(id === mode));
      }
    },
    relabel() {
      cluster.setAttribute("aria-label", t("camera.cluster"));
      opener.setAttribute("aria-label", t("camera.open"));
    },
    dispose() {
      narrow?.removeEventListener?.("change", syncOpener);
      for (const stop of held) stop();
      roving?.dispose?.();
      cluster.remove();
    },
  };
}
