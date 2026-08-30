// The region, turning slowly behind the menu.
//
// `gamedesign.md` §26.3 asks the lobby for "a preview of the generated region" —
// which was a line of text saying "80% buildable · 19% water". This renders the
// actual region you are about to play, with the game's own renderer, so
// "Another region" means something you can look at rather than three numbers.
//
// Three things make it cheap enough to leave running:
//
//   - it draws the SAME state object the screen already generated. Nothing is
//     generated twice, and nothing is generated for the diorama's sake.
//   - the LOD system does its job. A 128×128 region at this zoom is mostly
//     tier-0 blocks, which is what a backdrop wants anyway.
//   - it stops when the tab is hidden, and it never starts if the player has
//     asked for reduced motion.
//
// It is a **backdrop**: it takes no input, and it is `aria-hidden`, because a
// screen reader announcing a rotating picture of a field would be noise. Every
// fact it shows is also in the text beside it.

import { createRenderer } from "../render/scene.js";
import { focusOn, applyPose, zoomBy } from "../render/camera.js";

/** A full turn in seconds. Slow enough to be scenery rather than motion —
 * anything faster reads as a screensaver and competes with the menu. */
const SECONDS_PER_TURN = 240;

/** How much of the region is in frame, as a fraction of its width. Under 1, so
 * the region overflows the edges and reads as a place you are standing in
 * rather than a map on a table with a border around it. */
const SPAN_FRACTION = 0.72;

export function createDiorama(canvas, state, { style = "plain", motion = true } = {}) {
  const fit = () => {
    // Half resolution. It is a blurred backdrop behind a panel, and the pixels
    // buy nothing — but the triangle budget and the fill rate are real.
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * 0.5));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * 0.5));
  };
  fit();

  const renderer = createRenderer(canvas, state, { style, antialias: false, pixelRatio: 1 });
  let frame;
  let last = 0;
  let disposed = false;

  function frameRegion() {
    focusOn(renderer.view, state.width / 2, state.height / 2);
    // `zoomBy` clamps, so set the span through it rather than assigning: a
    // 128-region wants a span the clamp would otherwise refuse.
    renderer.view.span = Math.min(160, Math.max(20, Math.round(state.width * SPAN_FRACTION)));
    zoomBy(renderer.view, 1);
    // Start at an angle rather than square on, so the first frame already
    // looks like a place.
    renderer.view.yaw = Math.PI / 5;
    applyPose(renderer.view);
  }
  frameRegion();

  function draw(now) {
    if (disposed) return;
    if (motion && document.visibilityState === "visible") {
      const elapsed = last === 0 ? 0 : (now - last) / 1000;
      renderer.view.yaw += (elapsed * Math.PI * 2) / SECONDS_PER_TURN;
      applyPose(renderer.view);
    }
    last = now;
    renderer.draw({});
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);

  const onResize = () => {
    if (disposed) return;
    fit();
    renderer.resize(canvas.width, canvas.height);
  };
  globalThis.addEventListener?.("resize", onResize);

  return {
    /** A new region was generated. The state object is the same one throughout,
     * so the renderer keeps its pools and only its terrain is rebuilt — the
     * trick `game.js` uses to load a save without reloading the page. */
    regionChanged() {
      renderer.worldChanged();
      frameRegion();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      globalThis.removeEventListener?.("resize", onResize);
      renderer.dispose();
    },
    get stats() { return renderer.stats; },
  };
}
