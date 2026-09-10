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
import { pickTile, groundPoint } from "../render/picking.js";
import { panBy, zoomBy, rotate, yawBy, pitchBy, clampToMap, applyPose, focusOn } from "../render/camera.js";
import { CAMERA_BUTTONS, PAN_SECONDS, TURN_PER_SECOND, ZOOM_PER_SECOND } from "../ui/camera-model.js";
import { createGestures, down, move, up, cancel } from "./gestures.js";
import { lineTiles, rectTiles, toRuns, tileIndex, runsLength } from "./runs.js";
import { TOOLS, DRAG, buildCommand, toolForKey } from "./tools.js";

/** Screen pixels to world tiles for a pan. An orthographic camera shows
 * `span` tiles down the canvas height, so this ratio is exact rather than
 * tuned — the map moves precisely with the finger at any zoom.
 *
 * Under perspective there IS no such ratio: the same drag moves the ground a
 * long way at the horizon and barely at all under the eye. That case is handled
 * by `panToGrab` instead, which is exact for a different reason. */
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

  // The model comes from the renderer rather than being held: it is rebuilt
  // whole on `worldChanged`, and a picker holding the old one would march a
  // height field the city no longer has.
  const tileAtPixel = (x, y) => pickTile(
    renderer.view, x, y, canvas.clientWidth, canvas.clientHeight, state.width, state.height,
    renderer.model,
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

  /** The ground point the drag started on, in tile coordinates. Under
   * perspective a pan is "keep this point under the pointer" rather than "move
   * the camera by so many tiles", because the conversion is not a constant
   * (slice V5). Exact by construction, and it is what makes a drag near the
   * horizon feel like dragging the ground rather than nudging the camera. */
  let grabbed;

  function grabAt(x, y) {
    const view = renderer.view;
    if (view.mode !== "city") { grabbed = undefined; return; }
    const tile = groundAtPixel(x, y);
    grabbed = tile ? { ...tile, px: x, py: y } : undefined;
  }

  /** Where the pointer is on the ground, in TILE coordinates and unrounded —
   * `pickTile` floors to a tile and a pan needs the fraction. One ray builder
   * for both projections, in `picking.js`. */
  const groundAtPixel = (px, py) => groundPoint(
    renderer.view, px, py, canvas.clientWidth, canvas.clientHeight,
    renderer.model, state.width, state.height,
  );

  /** Moves the camera so the grabbed ground point sits under the pointer. */
  function panToGrab(px, py) {
    if (!grabbed) return false;
    const now = groundAtPixel(px, py);
    if (!now) return false;
    renderer.view.targetX += grabbed.x - now.x;
    renderer.view.targetZ += grabbed.z - now.z;
    applyPose(renderer.view);
    clampToMap(renderer.view, state.width, state.height);
    return true;
  }

  /**
   * Street mode's input (slice E4, spec §8.1).
   *
   * The keys are held rather than pressed, so the walker is driven from the
   * frame loop by a set the key handler maintains — a keypress repeat rate is
   * the operating system's business and has nothing to do with how fast a
   * person walks. `move` is read once a frame by `game.js`.
   */
  const held = new Set();
  const WALK_KEYS = {
    w: "forward", s: "back", a: "left", d: "right",
    ArrowUp: "forward", ArrowDown: "back", ArrowLeft: "left", ArrowRight: "right",
  };
  const walkKey = (key) => WALK_KEYS[key] ?? WALK_KEYS[key?.toLowerCase?.()];
  const street = () => renderer.view.mode === "street";
  const photo = () => renderer.view.mode === "photo";
  /** The two modes where the eye is its own and WASD moves it. One predicate,
   * so a branch that means "free look" cannot come to mean "street" (F1). */
  const freeLook = () => street() || photo();

  /** Enters street mode over a tile, or over the middle of the view. */
  function enterStreet(tile) {
    if (street()) return false;
    // The tile under the pointer first, the middle of the view second. A key
    // pressed with the pointer over a field would otherwise refuse, which
    // reads as the key being broken rather than as that field having no
    // pavement in it.
    const middle = { x: Math.round(renderer.view.targetX - 0.5), y: Math.round(renderer.view.targetZ - 0.5) };
    const entered = (tile && renderer.enterStreet?.(tile.x, tile.y))
      || renderer.enterStreet?.(middle.x, middle.y);
    if (entered) { setTool(undefined); options.onMode?.("street"); onChange(); }
    return entered === true;
  }

  function leaveStreet() {
    if (!street()) return false;
    held.clear();
    renderer.leaveStreet?.();
    options.onMode?.("city");
    onChange();
    return true;
  }

  /** Into photo mode, from anywhere (F1, ruling 027: the P key has a button).
   *
   * Unlike the street there is nowhere it can refuse: a photo camera needs no
   * pavement, so this always succeeds and the caller never has to explain why
   * it did not. */
  function enterPhoto() {
    if (photo()) return false;
    renderer.enterPhoto?.();
    setTool(undefined);
    held.clear();
    options.onMode?.("photo");
    onChange();
    return true;
  }

  function leavePhoto() {
    if (!photo()) return false;
    held.clear();
    renderer.leavePhoto?.();
    options.onMode?.(renderer.view.mode);
    onChange();
    return true;
  }

  function handle(intents) {
    for (const intent of intents) {
      switch (intent.type) {
        case "panBy":
          // Negated: dragging the map right must move the CITY right, which
          // means moving the camera left.
          if (renderer.view.mode === "city") {
            if (!grabbed) grabAt(intent.x - intent.dx, intent.y - intent.dy);
            if (panToGrab(intent.x, intent.y)) break;
          }
          panBy(renderer.view,
            -pixelsToTiles(renderer.view, canvas.clientHeight, intent.dx),
            -pixelsToTiles(renderer.view, canvas.clientHeight, intent.dy));
          clampToMap(renderer.view, state.width, state.height);
          break;
        case "zoomBy":
          zoomStep(1 / intent.factor);
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
        case "tap": {
          if (street()) {
            // Touch has no keyboard and a stick on a phone is a thumb over the
            // thing you are looking at: a tap on the ground is where to walk.
            const at = groundAtPixel(intent.x, intent.y);
            if (at) renderer.walker?.seek(at.x * renderer.model.tileM, at.z * renderer.model.tileM);
            break;
          }
          options.onTap?.(tileAtPixel(intent.x, intent.y));
          break;
        }
        default:
          break;
      }
    }
  }

  const point = (event) => ({ id: event.pointerId, x: event.offsetX, y: event.offsetY });

  /** The three buttons, settled at the second playtest (P34):
   *
   *   left    — the tool, or a pan when no tool is held
   *   middle  — pan
   *   right   — ORBIT: sideways turns the camera, up and down tilts it
   *
   * Three slices to get here. N21 recorded right and middle as panning while
   * `onPointerDown` returned early on both and they did nothing at all; N27
   * woke them up and put snapped rotation on the right button, which is not
   * what was asked for and reads from the hand as nothing happening and then
   * the world flipping; N28 made it pan, which the playtest then reported as
   * indistinguishable from the left button. It is an orbit.
   *
   * Free, not snapped, and this is the amendment to ruling 006: the four
   * comfortable angles are what Q and E give — and pressing one from anywhere
   * lands back on them — while the mouse may sit between them. The pitch moves
   * too, between the horizon and almost straight down, because "can we only
   * view the city from above" was asked twice.
   *
   * All of it works with a tool in hand, which is the whole point: these are
   * the desktop equivalent of the second finger. */
  const drag = { button: -1, x: 0, y: 0 };
  /** Radians per pixel dragged. A quarter turn across ~315px sideways, and the
   * whole tilt range across ~470px, which is most of a canvas either way: the
   * camera has to be steerable without the pointer leaving the window. */
  const YAW_PER_PIXEL = 0.005;
  const PITCH_PER_PIXEL = 0.0026;

  const onPointerDown = (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    if (freeLook()) {
      // Every button looks, and the gesture recogniser still runs so a TAP on
      // a touch screen comes through as one.
      drag.button = event.button;
      drag.x = event.offsetX;
      drag.y = event.offsetY;
      handle(down(gestures, point(event)));
      return;
    }
    if (event.button === 1 || event.button === 2) {
      drag.button = event.button;
      drag.x = event.offsetX;
      drag.y = event.offsetY;
      return;
    }
    handle(down(gestures, point(event)));
  };
  const onPointerMove = (event) => {
    if (freeLook()) {
      if (drag.button < 0) return;
      const dx = event.offsetX - drag.x;
      const dy = event.offsetY - drag.y;
      drag.x = event.offsetX;
      drag.y = event.offsetY;
      // Drag-look, the way the city camera's orbit reads: the hand is on the
      // world. Dragging right turns you left, so the street swings right.
      // Photo mode looks through the renderer because there is no walker to
      // ask — the same gesture, a different thing being turned (F1).
      if (photo()) renderer.lookPhoto?.(-dx * YAW_PER_PIXEL, -dy * PITCH_PER_PIXEL);
      else renderer.walker?.look(-dx * YAW_PER_PIXEL, -dy * PITCH_PER_PIXEL);
      onChange();
      return;
    }
    if (drag.button >= 0) {
      const dx = event.offsetX - drag.x;
      const dy = event.offsetY - drag.y;
      drag.x = event.offsetX;
      drag.y = event.offsetY;
      if (drag.button === 2) {
        // Dragging right turns the city to the right, which means turning the
        // camera the other way — the same inversion the pan needs, and for the
        // same reason: the hand is on the world, not on the tripod.
        yawBy(renderer.view, -dx * YAW_PER_PIXEL);
        // Dragging DOWN lowers the camera towards the ground. Pulling the far
        // edge of the map towards you is what tipping a model on a table feels
        // like; the other way round reads as a stuck control.
        pitchBy(renderer.view, -dy * PITCH_PER_PIXEL);
      } else {
        panBy(renderer.view,
          -pixelsToTiles(renderer.view, canvas.clientHeight, dx),
          -pixelsToTiles(renderer.view, canvas.clientHeight, dy));
        clampToMap(renderer.view, state.width, state.height);
      }
      onChange();
      return;
    }
    handle(move(gestures, point(event)));
  };
  const onPointerUp = (event) => {
    canvas.releasePointerCapture?.(event.pointerId);
    grabbed = undefined;
    // In street mode the drag IS the gesture, so the recogniser still has to
    // see the release — otherwise a tap never completes and touch cannot walk.
    if (drag.button >= 0 && !freeLook()) { drag.button = -1; return; }
    drag.button = -1;
    handle(up(gestures, point(event)));
  };
  const onPointerCancel = () => { drag.button = -1; grabbed = undefined; handle(cancel(gestures)); };
  /** The minimum span, and the pitch below which zooming past it steps out of
   * the car and onto the pavement (spec §8.1). Both match `camera.js`: the
   * zoom stops at 8 tiles, so "past the minimum" is a zoom-in that would not
   * move. */
  const MIN_SPAN = 8;
  const STREET_PITCH = 25 * (Math.PI / 180);

  /** Camera buttons (or keys, from K2) held down right now, by button id.
   *
   * Ruling 042 §3: held is a RATE, per second, scaled by the caller's delta —
   * so a button held for a second moves the same distance at any frame rate.
   * The frame loop calls `stepCamera(dt)`; nothing here reads a clock. */
  const cameraHold = new Map();

  /** Starts or stops a held camera intent. The cluster and the keyboard both
   * come through here, which is what makes ruling 042 §1's "a button that does
   * something a key cannot is a defect" true by construction. */
  function holdCamera(id, on, axis) {
    if (!on) { cameraHold.delete(id); return; }
    const button = CAMERA_BUTTONS.find((b) => b.id === id);
    if (button) cameraHold.set(id, { button, axis });
  }

  /** One frame of whatever is held. */
  function stepCamera(dt) {
    if (cameraHold.size === 0 || !(dt > 0)) return false;
    const view = renderer.view;
    for (const { button, axis } of cameraHold.values()) {
      if (button.intent === "pan") {
        const step = (view.span / PAN_SECONDS) * dt;
        if (freeLook()) continue;   // the pad walks or flies there, through `move`
        panBy(view, (axis?.x ?? 0) * step, (axis?.y ?? 0) * step);
        clampToMap(view, state.width, state.height);
      } else if (button.intent === "rotate") {
        yawBy(view, button.direction * TURN_PER_SECOND * dt);
      } else if (button.intent === "tilt") {
        const by = button.direction * TURN_PER_SECOND * dt;
        if (photo()) renderer.lookPhoto?.(0, by);
        else if (street()) renderer.walker?.look(0, by);
        else pitchBy(view, by);
      } else if (button.intent === "zoom") {
        zoomBy(view, Math.pow(2, button.direction * ZOOM_PER_SECOND * dt));
      }
    }
    onChange();
    return true;
  }

  /**
   * The whole city, in view (ruling 042, the cluster's Home button).
   *
   * A camera that has wandered is the commonest way a player gets lost, and
   * until now the only way back was to zoom out by hand until something looked
   * familiar. Leaves any free-look mode first: "fit the city" from the pavement
   * means standing up, not flying the walker into the sky.
   */
  function fitCity() {
    if (photo()) leavePhoto();
    if (street()) leaveStreet();
    const view = renderer.view;
    focusOn(view, state.width / 2, state.height / 2);
    // The longer side, plus a margin, so a rectangle fits in either aspect.
    zoomBy(view, Math.max(state.width, state.height) * 1.1 / view.span);
    clampToMap(view, state.width, state.height);
    onChange();
  }

  /** One notch of zoom, and the two mode changes it can cause. */
  function zoomStep(factor) {
    const view = renderer.view;
    if (street()) {
      // Zooming out is the way back, which is the same gesture that brought
      // you here run backwards.
      if (factor > 1) leaveStreet();
      return;
    }
    // In photo mode the zoom is the flight speed, not the way out: the span
    // scales how fast the camera crosses what it can see (`photoSpeed`), so a
    // wheel notch is "move about the city faster" and Escape is the way back.
    if (photo()) { zoomBy(view, factor); return; }
    const wouldStick = view.span <= MIN_SPAN + 1e-9 && factor < 1;
    if (wouldStick && view.mode === "city" && (view.pitch ?? 1) <= STREET_PITCH) {
      if (enterStreet(ui.hover)) return;
    }
    zoomBy(view, factor);
  }

  const onWheel = (event) => {
    event.preventDefault();
    zoomStep(event.deltaY > 0 ? 1.12 : 1 / 1.12);
  };
  const onContextMenu = (event) => event.preventDefault();

  // gamedesign.md §13.4: "Double-click: focus selected object." The tile under
  // the pointer is the object; there is no selection model to consult.
  const onDoubleClick = (event) => {
    const tile = tileAtPixel(event.offsetX, event.offsetY);
    if (!tile) return;
    options.onFocusTile?.(tile);
    onChange();
  };

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

    // Street mode owns the keyboard: WASD walks, Shift runs, Escape leaves. The
    // build tools are not merely ignored, they are gone — a street is for
    // looking at (ruling 034), and a zoning drag from eye height would be a
    // player painting a district they cannot see.
    if (street() && !modified) {
      if (event.key === "Escape") { event.preventDefault(); leaveStreet(); return; }
      const walk = walkKey(event.key);
      if (walk) { event.preventDefault(); held.add(walk); return; }
      if (event.key === "Shift") { held.add("run"); return; }
      if (event.key === "f" || event.key === "F") { event.preventDefault(); leaveStreet(); return; }
      if (event.key === "c" || event.key === "C") { event.preventDefault(); enterPhoto(); return; }
      return;
    }
    // Photo mode owns the keyboard for the same reason street mode does, and
    // more so: it is a camera, and a build tool reached from it would paint a
    // district from an angle no player could check (F1).
    if (photo() && !modified) {
      if (event.key === "Escape") { event.preventDefault(); leavePhoto(); return; }
      if (event.key === "c" || event.key === "C") { event.preventDefault(); leavePhoto(); return; }
      const fly = walkKey(event.key);
      if (fly) { event.preventDefault(); held.add(fly); return; }
      if (event.key === "Shift") { held.add("run"); return; }
      return;
    }
    // The key that gets you there. It has a button too (ruling 027).
    //
    // `C` for camera, and not `P`: `p` is the pipe tool's shortcut, F1 took it,
    // and the pipe silently stopped being selectable by keyboard. Nothing
    // caught it — `test/keyboard.test.js` compares the tools only with each
    // other. `client/ui/camera-model.js` holds every key the camera claims now
    // and `test/camera-model.test.js` fails on a collision (K1).
    if (!modified && (event.key === "c" || event.key === "C")) {
      event.preventDefault();
      enterPhoto();
      return;
    }
    // The key that gets you there. It has a button too (ruling 027).
    if (!modified && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      if (!enterStreet(ui.hover)) options.onStatus?.("street.noStreet");
      return;
    }

    if (modified && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      undo();
      onChange();
      return;
    }

    // Tilt and fit, which the cluster has buttons for — so the keys do the same
    // thing (ruling 042 §1: a button that does something a key cannot, or the
    // reverse, is a defect). `PageUp`/`PageDown` were in ruling 042's list and
    // bound nowhere; `Home` fits the city, which K4 builds "go there" on top of.
    if (!modified && (event.key === "PageUp" || event.key === "PageDown")) {
      if (event.target !== canvas) return;
      event.preventDefault();
      const by = TURN_PER_SECOND * 0.25 * (event.key === "PageUp" ? 1 : -1);
      if (photo()) renderer.lookPhoto?.(0, by);
      else if (street()) renderer.walker?.look(0, by);
      else pitchBy(renderer.view, by);
      onChange();
      return;
    }
    if (!modified && event.key === "Home") {
      if (event.target !== canvas) return;
      event.preventDefault();
      fitCity();
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

    if (!modified && event.key === "?") {
      event.preventDefault();
      options.onHelp?.();
      return;
    }

    if (!modified && (event.key === "q" || event.key === "Q")) rotate(renderer.view, -1);
    else if (!modified && (event.key === "e" || event.key === "E")) rotate(renderer.view, 1);
    else if (event.key === "Escape") { setTool(undefined); handle(cancel(gestures)); }
    else if (!modified && (event.key === "+" || event.key === "=")) zoomStep(1 / 1.2);
    else if (!modified && event.key === "-") zoomStep(1.2);
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

  const onKeyUp = (event) => {
    const walk = walkKey(event.key);
    if (walk) held.delete(walk);
    if (event.key === "Shift") held.delete("run");
  };
  // A key held while the window loses focus is a key that never comes up, and
  // the walker walks into a wall for as long as the tab is in the background.
  const onBlur = () => held.clear();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("dblclick", onDoubleClick);
  globalThis.addEventListener?.("keydown", onKey);
  globalThis.addEventListener?.("keyup", onKeyUp);
  globalThis.addEventListener?.("blur", onBlur);

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
    enterStreet,
    leaveStreet,
    enterPhoto,
    leavePhoto,
    fitCity,
    holdCamera,
    stepCamera,
    /** What a camera button does when it is pressed rather than held.
     *
     * `home` only. The cluster's Street and Photo buttons go through the HUD's
     * own callbacks instead, because the HUD is what says "there is no street
     * here to stand on" — and a branch here for them would be a handler nothing
     * reaches, which is ruling 026's defect exactly. */
    cameraAction(id) {
      if (id === "home") { fitCity(); return true; }
      return false;
    },
    /** What the walker or the photo camera should do this frame. Read by the
     * frame loop; empty in every mode but the two free-look ones. */
    get move() {
      if (!freeLook()) return undefined;
      const forward = (held.has("forward") ? 1 : 0) - (held.has("back") ? 1 : 0);
      const strafe = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      // `run` for the walker and `fast` for the photo camera: the same key, and
      // the two modules name it for what it means to each of them.
      return { forward, strafe, run: held.has("run"), fast: held.has("run") };
    },
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
      canvas.removeEventListener("dblclick", onDoubleClick);
      globalThis.removeEventListener?.("keydown", onKey);
      globalThis.removeEventListener?.("keyup", onKeyUp);
      globalThis.removeEventListener?.("blur", onBlur);
    },
  };
}
