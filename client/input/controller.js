// Input, wired up.
//
// The thin half. Everything hard about input lives in `gestures.js` and
// `runs.js`, both pure and both tested; this attaches listeners, converts
// screen pixels to tiles, and turns finished gestures into commands.
//
// Two rules it does not get to break:
//   - it never decides whether an action is allowed. It issues the command and
//     reports what the reducer said. A check that exists only here is not a
//     rule, it is a suggestion.
//   - a drag becomes ONE command with run-length encoded tiles, never one per
//     tile crossed.

import { apply } from "../../engine/reducer.js";
import { price, undoLast, lastUndoFor } from "../../engine/build-commands.js";
import { buildingCost } from "../../engine/utilities.js";
import { footprintAt } from "../ui/build-model.js";
import { RESULT } from "../../shared/protocol.js";
import { pickTile } from "../render/picking.js";
import { panBy, zoomBy, rotate, clampToMap } from "../render/camera.js";
import { createGestures, down, move, up, cancel } from "./gestures.js";
import { lineTiles, rectTiles, toRuns, tileIndex, runsLength } from "./runs.js";
import { TOOLS, DRAG, buildCommand, toolForKey } from "./tools.js";

/** Screen pixels to world tiles for a pan. An orthographic camera shows
 * `span` tiles down the canvas height, so this ratio is exact rather than
 * tuned — the map moves precisely with the finger at any zoom. */
function pixelsToTiles(view, canvasHeight, pixels) {
  return (pixels / canvasHeight) * view.span;
}

export function createController(canvas, state, renderer, options = {}) {
  const actor = options.actor ?? 1;
  const onChange = options.onChange ?? (() => {});
  const onPreview = options.onPreview ?? (() => {});
  const onResult = options.onResult ?? (() => {});

  const ui = {
    tool: undefined,
    def: undefined,
    /** Tiles the current stroke has touched, in order. */
    trail: [],
    start: undefined,
    hover: undefined,
  };

  const gestures = createGestures({ building: () => ui.tool !== undefined });

  const treasury = () => state.players.find((p) => p.seat === actor)?.treasury ?? 0;

  const tileAtPixel = (x, y) => pickTile(
    renderer.view, x, y, canvas.clientWidth, canvas.clientHeight, state.width, state.height,
  );

  function tilesForStroke() {
    const tool = TOOLS[ui.tool];
    if (!tool || !ui.start) return [];
    const last = ui.trail[ui.trail.length - 1] ?? ui.start;
    // A building is anchored at its top-left tile and grows right and down, so
    // the ghost has to show the whole footprint the reducer will test. Showing
    // one tile for a 3x3 plant teaches the footprint by refusal.
    if (tool.drag === DRAG.POINT) {
      return ui.def ? footprintAt(last.x, last.y, ui.def) : [last];
    }
    if (tool.drag === DRAG.RECT) return rectTiles(ui.start.x, ui.start.y, last.x, last.y);
    return ui.trail;
  }

  /** What the stroke would cost, asked of the engine rather than guessed.
   *
   * `price` runs the same staging the real command would and throws the
   * transaction away. A cost preview computed from a table in the client is a
   * second implementation of the pricing rules, and the two would drift. */
  function preview() {
    const tiles = tilesForStroke();
    if (tiles.length === 0) {
      renderer.hideGhost();
      onPreview(undefined);
      return;
    }
    const tool = TOOLS[ui.tool];
    const runs = toRuns(tiles.map((t) => tileIndex(t.x, t.y, state.width)));
    let quote;
    if (tool.priceKind) {
      quote = price(state, { type: tool.command, actor, runs }, tool.priceKind);
    }
    // Buildings have no staging path to price, so the cost comes from the same
    // helper the reducer charges with rather than from a table in the client.
    const cost = ui.def ? buildingCost(state, ui.def) : quote?.cost;
    // A HINT, not a rule. The reducer still decides and the click still goes
    // through — this only colours the ghost and names the likely reason, so the
    // player learns before committing rather than being told "0 tiles" after.
    // A UI check that REFUSED here would be inventing a rule nobody enforces.
    let result = quote?.result;
    if (result === undefined && cost !== undefined && cost > treasury()) result = RESULT.NO_FUNDS;
    renderer.showGhostTiles(tiles, result === undefined || result === RESULT.OK);
    onPreview({ tiles: runsLength(runs), cost, result });
  }

  function extendTo(pixelX, pixelY) {
    const tile = tileAtPixel(pixelX, pixelY);
    if (!tile) return;
    const last = ui.trail[ui.trail.length - 1];
    if (last && last.x === tile.x && last.y === tile.y) return;
    // Fill in the tiles between samples. Without this a fast drag leaves a road
    // with holes in it that the player cannot see until traffic will not flow.
    if (last) for (const step of lineTiles(last.x, last.y, tile.x, tile.y).slice(1)) ui.trail.push(step);
    else ui.trail.push(tile);
    preview();
  }

  function commit() {
    const tiles = tilesForStroke();
    ui.trail = [];
    ui.start = undefined;
    renderer.hideGhost();
    onPreview(undefined);
    if (tiles.length === 0) return;

    const tool = TOOLS[ui.tool];
    const command = tool.drag === DRAG.POINT
      ? buildCommand(ui.tool, actor, { x: tiles[0].x, y: tiles[0].y, def: ui.def })
      : buildCommand(ui.tool, actor, { runs: toRuns(tiles.map((t) => tileIndex(t.x, t.y, state.width))) });
    if (!command) return;

    const outcome = apply(state, command);
    onResult(outcome.result, command);
    if (outcome.result === RESULT.OK) {
      renderer.worldChanged();
      onChange();
    }
  }

  function handle(intents) {
    for (const intent of intents) {
      switch (intent.type) {
        case "panBy":
          // Negated: dragging the map right must move the CITY right, which
          // means moving the camera left.
          panBy(renderer.view,
            -pixelsToTiles(renderer.view, canvas.clientHeight, intent.dx),
            -pixelsToTiles(renderer.view, canvas.clientHeight, intent.dy));
          clampToMap(renderer.view, state.width, state.height);
          break;
        case "zoomBy":
          zoomBy(renderer.view, 1 / intent.factor);
          break;
        case "rotate":
          rotate(renderer.view, intent.direction);
          break;
        case "paintStart": {
          const tile = tileAtPixel(intent.x, intent.y);
          if (!tile) break;
          ui.start = tile;
          ui.trail = [tile];
          preview();
          break;
        }
        case "paintTo":
          extendTo(intent.x, intent.y);
          break;
        case "paintEnd":
          commit();
          break;
        case "hover": {
          const tile = tileAtPixel(intent.x, intent.y);
          ui.hover = tile;
          if (tile && ui.tool && ui.def) {
            // Red before the press, not after. Same hint as the stroke preview.
            const affordable = buildingCost(state, ui.def) <= treasury();
            renderer.showGhostTiles(footprintAt(tile.x, tile.y, ui.def), affordable);
          } else if (tile && ui.tool) renderer.showGhost(tile.x, tile.y, true);
          else renderer.hideGhost();
          break;
        }
        case "tap":
          options.onTap?.(tileAtPixel(intent.x, intent.y));
          break;
        default:
          break;
      }
    }
  }

  const point = (event) => ({ id: event.pointerId, x: event.offsetX, y: event.offsetY });

  const onPointerDown = (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    // Middle and right button pan even with a tool selected — the desktop
    // equivalent of the second finger.
    if (event.button === 1 || event.button === 2) return;
    handle(down(gestures, point(event)));
  };
  const onPointerMove = (event) => handle(move(gestures, point(event)));
  const onPointerUp = (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    handle(up(gestures, point(event)));
  };
  const onPointerCancel = () => handle(cancel(gestures));
  const onWheel = (event) => {
    event.preventDefault();
    zoomBy(renderer.view, event.deltaY > 0 ? 1.12 : 1 / 1.12);
  };
  const onContextMenu = (event) => event.preventDefault();

  /** How far one arrow press moves the camera, in tiles. A fraction of what is
   * on screen rather than a fixed number, so a press does the same thing to the
   * view at every zoom. */
  const PAN_FRACTION = 8;

  /** Typing somewhere that wants the key. There are no text fields yet, but the
   * tax slider is a range input and the arrows belong to it. */
  function editing(target) {
    if (!target || !target.tagName) return false;
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
  }

  const onKey = (event) => {
    if (editing(event.target)) return;
    // A modal is open: it owns the keyboard until it closes.
    if (document.querySelector?.("dialog[open]")) return;

    const modified = event.ctrlKey || event.metaKey || event.altKey;

    if (modified && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      undo();
      onChange();
      return;
    }

    // Arrows PAN, but only from the map. Inside a toolbar they move between
    // controls (`ui/roving.js`), and stealing them here would break the very
    // thing `role="toolbar"` promises.
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (arrow && !modified) {
      if (event.target !== canvas) return;
      event.preventDefault();
      const step = renderer.view.span / PAN_FRACTION;
      panBy(renderer.view, arrow[0] * step, arrow[1] * step);
      clampToMap(renderer.view, state.width, state.height);
      onChange();
      return;
    }

    if (!modified && (event.key === "q" || event.key === "Q")) rotate(renderer.view, -1);
    else if (!modified && (event.key === "e" || event.key === "E")) rotate(renderer.view, 1);
    else if (event.key === "Escape") { setTool(undefined); handle(cancel(gestures)); }
    else if (!modified && (event.key === "+" || event.key === "=")) zoomBy(renderer.view, 1 / 1.2);
    else if (!modified && event.key === "-") zoomBy(renderer.view, 1.2);
    else if (!modified && event.key === " ") {
      event.preventDefault();
      options.onSpeedToggle?.();
      return;
    } else {
      const tool = toolForKey(event.key, modified);
      if (tool === undefined) return;
      // The same toggle the toolbar button does, so the two agree.
      setTool(ui.tool === tool ? undefined : tool);
      return;
    }
    onChange();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  globalThis.addEventListener?.("keydown", onKey);

  function setTool(name, def) {
    handle(cancel(gestures));
    ui.tool = TOOLS[name] ? name : undefined;
    ui.def = def;
    renderer.hideGhost();
    onChange();
  }

  function undo() {
    const result = undoLast(state, actor);
    onResult(result, { type: "undo", actor });
    if (result === RESULT.OK) {
      renderer.worldChanged();
      onChange();
    }
    return result;
  }

  return {
    setTool,
    undo,
    canUndo: () => lastUndoFor(actor) !== undefined,
    get tool() { return ui.tool; },
    /** Which building the building tool is holding. The toolbar needs it to
     * tell two pressed buttons apart. */
    get def() { return ui.def; },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      globalThis.removeEventListener?.("keydown", onKey);
    },
  };
}
