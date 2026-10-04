// Plays a shot list in the page (F2).
//
// The arithmetic is `client/world/film.js` and this is the plumbing: it puts
// the renderer where `poseAt` says, sets the hour and the style the shot asks
// for, and hands the frame back to whoever asked for it.
//
// **The caller owns the clock.** `frame(i)` is a function of the frame NUMBER
// and the frame rate, never of `performance.now()`, so a storyboard rendered at
// one frame a second and a film rendered at thirty are the same camera — and
// the same on a 4090 and on SwiftShader, which is the only way a film can be
// reviewed on one machine and rendered on another.

import { poseAt, lengthOf } from "../world/film.js";
import { applyPose, applyZoom } from "../render/camera.js";

/**
 * A player over one shot list.
 *
 * `renderer` is what `createRenderer` returned — the shot harness's own object,
 * not a session, because a film is rendered by the same page that takes every
 * other picture in this project. `rebuild(style)` returns a new renderer over
 * the same state, which is how a style change is made: a style decides the
 * materials, so it is a new renderer (the same thing the perf card does between
 * its steps).
 */
export function createTour(list, renderer, { rebuild } = {}) {
  let current = renderer;
  let style = list.shots[0]?.style ?? "plain";
  const seconds = lengthOf(list);

  /** Puts the camera where the film says it is at `t` seconds. */
  async function seek(t) {
    const pose = poseAt(list, t);
    if (pose.style && pose.style !== style && rebuild) {
      current = await rebuild(pose.style);
      style = pose.style;
    }
    const view = current.view;
    // A cut, not a fade: the hour arrives on the frame the shot starts, because
    // the fade is a function of a clock the film tool does not run — the first
    // storyboard had a "night" street in full daylight.
    if (pose.time) current.setTime(pose.time, true);

    if (pose.mode === "street") {
      // The real walker, on the real ground: `enterStreet` refuses a tile with
      // no corridor near it, and a shot that cannot stand is a shot nobody
      // should have put in the list — `test/film.test.js` checks both ends
      // against the fixture so this never has to.
      // `enterStreet` is what puts the camera in street mode and the walker on
      // a pavement; after that the frame poses the camera from the walker every
      // draw, so a teleport is the whole of a walk shot's motion.
      if (view.mode !== "street") current.enterStreet(Math.floor(pose.x), Math.floor(pose.z));
      const tileM = current.model.tileM;
      current.walker.teleport(pose.x * tileM, pose.z * tileM, pose.yaw, 0);
    } else {
      if (view.mode === "street") current.leaveStreet("city");
      view.targetX = pose.x;
      view.targetZ = pose.z;
      view.span = pose.span > 0 ? pose.span : view.span;
      view.pitch = (pose.pitch * Math.PI) / 180;
      view.yaw = pose.yaw;
      applyZoom(view, view.aspect);
      applyPose(view);
    }
    return pose;
  }

  return {
    get renderer() { return current; },
    seconds,
    /** Frame `i` at `fps` frames a second, which is the only clock here. */
    frame: (i, fps = 1) => seek(i / fps),
    seek,
    frames: (fps = 1) => Math.max(1, Math.round(seconds * fps)),
  };
}
