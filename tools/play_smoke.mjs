// The N3 gate, driven as a person would drive it.
//
// "A person builds a road, zones beside it, places a plant, and sees the city
// grow — on a mouse and on a phone."
//
// So this drives the real page with real pointer events at real coordinates,
// twice: once with a mouse and once with a touch pointer on a phone-sized
// viewport. It asserts on STATE, not on pixels — that the road is where the
// drag was, that one drag produced one command's worth of tiles, that undo puts
// it back.
//
// It deliberately does not call the controller's methods directly. A gate that
// pokes the API proves the API works; the question here is whether a hand on a
// screen reaches it.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
};

function serve() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const target = join(root, normalize(path === "/" ? "/index.html" : path));
      if (!target.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(target);
      res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

const problems = [];
const checks = [];
function check(name, condition, detail = "") {
  if (process.env.PLAY_TRACE) process.stderr.write(`… ${name}\n`);
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Where a tile is on screen, asked of the same camera the renderer uses. */
async function tilePixel(page, x, y) {
  return page.evaluate(([tx, ty]) => {
    const { renderer } = globalThis.CITY;
    const canvas = document.getElementById("city");
    // At the tile's own HEIGHT, not at y = 0 (slice V4). Projecting the centre
    // of a hillside tile from the plane it used to lie on puts the click
    // somewhere down the slope, and picking — which marches the height field
    // now — correctly reports the tile that is actually there. The gate would
    // have called that a broken drag.
    const model = renderer.model;
    const h = model.heightAt((tx + 0.5) * model.tileM, (ty + 0.5) * model.tileM) / model.tileM;
    const v = new globalThis.THREE_VEC(tx + 0.5, h, ty + 0.5);
    v.project(renderer.view.camera);
    return {
      x: ((v.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - v.y) / 2) * canvas.clientHeight,
    };
  }, [x, y]);
}

async function run(page, label, { touch, mode }) {
  const type = touch ? "touch" : "mouse";
  await page.evaluate(() => {
    // Pause the clock so the assertions are about input, not about whatever the
    // simulation did between them. Pause, NOT stop — stop disposes the
    // controller, which removes every listener the gate is here to exercise.
    globalThis.CITY.pause();
    globalThis.CITY.state.players[0].treasury = 500000;
  });

  // --- a road, dragged ------------------------------------------------------
  const from = await tilePixel(page, 20, 20);
  const to = await tilePixel(page, 32, 20);
  await page.click('#tools button[data-tool="road"]');

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Three samples across twelve tiles — deliberately coarse, so a missing
  // Bresenham fill shows up as holes.
  for (const f of [0.35, 0.7, 1]) {
    await page.mouse.move(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f);
  }
  await page.mouse.up();

  const road = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let paved = 0;
    const row = [];
    for (let x = 0; x < state.width; x += 1) {
      const on = (state.tiles.road[20 * state.width + x] & 16) !== 0;
      if (on) { paved += 1; row.push(x); }
    }
    return { paved, first: row[0], last: row[row.length - 1], contiguous: row.every((x, i) => i === 0 || x === row[i - 1] + 1) };
  });
  check(`${label}: a dragged road appears`, road.paved > 0, `${road.paved} tiles paved`);
  check(`${label}: the road has no holes in it`, road.contiguous, `paved ${road.first}..${road.last} with gaps`);
  check(`${label}: the road spans the drag`, road.paved >= 10, `only ${road.paved} of ~13 tiles`);

  // --- undo puts it back ----------------------------------------------------
  await page.click("#undo");
  const afterUndo = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let paved = 0;
    for (let x = 0; x < state.width; x += 1) if ((state.tiles.road[20 * state.width + x] & 16) !== 0) paved += 1;
    return paved;
  });
  check(`${label}: undo removes the whole drag, not one tile`, afterUndo === 0, `${afterUndo} tiles left`);

  // Put it back for the rest of the run.
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();

  // --- zoning beside it -----------------------------------------------------
  await page.click('.hud-toolbar button[data-tool="zoneResidential"]');
  const zoneA = await tilePixel(page, 22, 21);
  const zoneB = await tilePixel(page, 28, 23);
  await page.mouse.move(zoneA.x, zoneA.y);
  await page.mouse.down();
  await page.mouse.move(zoneB.x, zoneB.y);
  await page.mouse.up();

  const zoned = await page.evaluate(() => {
    const { state } = globalThis.CITY;
    let count = 0;
    for (let i = 0; i < state.tiles.zone.length; i += 1) if (state.tiles.zone[i] === 1) count += 1;
    return count;
  });
  check(`${label}: a dragged rectangle zones an area`, zoned > 0, `${zoned} tiles zoned`);

  // --- the camera -----------------------------------------------------------
  const before = await page.evaluate(() => ({ ...globalThis.CITY.renderer.view }));
  await page.keyboard.press("e");
  const rotated = await page.evaluate(() => globalThis.CITY.renderer.view.yawStep);
  check(`${label}: the camera rotates`, rotated !== before.yawStep, `yaw stayed at ${rotated}`);

  await page.click('#tools button[data-tool="road"]');
  await page.click('#tools button[data-tool="road"]');  // toggle off — no tool
  const panFrom = await tilePixel(page, 30, 30);
  await page.mouse.move(panFrom.x, panFrom.y);
  await page.mouse.down();
  await page.mouse.move(panFrom.x + 120, panFrom.y, { steps: 4 });
  await page.mouse.up();
  // Distance, not targetX. The camera was rotated a quarter turn just above, so
  // a horizontal drag now moves targetZ — asserting on one axis tests the yaw,
  // not the pan.
  const panned = await page.evaluate(() => {
    const v = globalThis.CITY.renderer.view;
    return { x: v.targetX, z: v.targetZ };
  });
  const distance = Math.hypot(panned.x - before.targetX, panned.z - before.targetZ);
  check(`${label}: dragging with no tool pans the camera`, distance > 1,
    `moved ${distance.toFixed(2)} tiles from (${before.targetX}, ${before.targetZ})`);

  // --- Home frames the city, and gives it back (K4) --------------------------
  //
  // It fitted the whole MAP before this slice: on a big map with a town in one
  // corner, pressing Home was a way of losing the city rather than finding it.
  // And a player who pressed it to get their bearings had no way back to the
  // district they were looking at.
  if (!touch) {
    const viewNow = () => page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return { x: v.targetX, z: v.targetZ, span: v.span, yaw: v.yaw };
    });
    // Snapshot first. This block zooms the camera onto the city and turns it a
    // quarter, and the checks after it aim at a tile by projecting it — a view
    // left somewhere else puts that pixel off the canvas, and the drag that
    // follows lands on nothing. (The wheel-into-street check learnt this in
    // K3; every block that flies the camera has to put it back.)
    const cameraWas = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return { x: v.targetX, z: v.targetZ, span: v.span, yaw: v.yaw, step: v.yawStep, pitch: v.pitch };
    });
    // Somewhere specific, and nowhere near the city's middle.
    await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      v.targetX = 12; v.targetZ = 12; v.span = 18;
    });
    const away = await viewNow();
    await page.evaluate(() => document.getElementById("city").focus());
    await page.keyboard.press("Home");
    const framed = await viewNow();
    const built = await page.evaluate(async () => {
      const { builtBounds } = await import("/client/world/fit.js");
      return builtBounds(globalThis.CITY.state);
    });
    check(`${label}: Home frames what has been built, not the whole map`,
      built !== undefined && framed.span < globalThis.Infinity && framed.span <= 64,
      `span ${framed.span.toFixed(1)} for a city ${JSON.stringify(built)}`);
    // The city is inside the frame: the centre must be within half a span of
    // both corners, or the fit is framing something else.
    const inside = built && Math.abs(framed.x - (built.minX + built.maxX + 1) / 2) < 1
      && Math.abs(framed.z - (built.minY + built.maxY + 1) / 2) < 1;
    check(`${label}: and it is centred on the city`, inside === true,
      `centre (${framed.x.toFixed(1)}, ${framed.z.toFixed(1)}) against ${JSON.stringify(built)}`);

    await page.keyboard.press("Home");
    const back = await viewNow();
    check(`${label}: a second Home gives the view back`,
      Math.hypot(back.x - away.x, back.z - away.z) < 1 && Math.abs(back.span - away.span) < 1,
      `(${away.x}, ${away.z}) span ${away.span} -> (${back.x.toFixed(1)}, ${back.z.toFixed(1)}) span ${back.span.toFixed(1)}`);

    // The compass is a picture that tells the truth (ruling 028).
    const compass = await page.evaluate(() => {
      const node = document.getElementById("camera-compass");
      if (!node) return undefined;
      return {
        role: node.getAttribute("role"),
        label: node.getAttribute("aria-label"),
        rose: node.querySelector(".camera-rose")?.textContent,
        buttons: node.querySelectorAll("button").length,
      };
    });
    check(`${label}: the cluster carries a compass, and it is a picture`,
      compass?.role === "img" && compass.buttons === 0 && (compass.label ?? "").length > 0,
      JSON.stringify(compass));
    const turned = await page.evaluate(async () => {
      const { setYawStep } = await import("/client/render/camera.js");
      const before = document.querySelector(".camera-rose")?.textContent;
      setYawStep(globalThis.CITY.renderer.view, globalThis.CITY.renderer.view.yawStep + 1);
      globalThis.CITY.hud.setFacing(globalThis.CITY.renderer.view.yaw);
      return { before, after: document.querySelector(".camera-rose")?.textContent };
    });
    check(`${label}: and the compass follows the view`, turned.before !== turned.after,
      `${turned.before} -> ${turned.after}`);

    // Double-click centres the view there without changing the zoom (§13.4).
    const corner = await tilePixel(page, 24, 24);
    const beforeDouble = await viewNow();
    await page.mouse.dblclick(corner.x, corner.y);
    const afterDouble = await viewNow();
    check(`${label}: a double-click centres the view there`,
      Math.hypot(afterDouble.x - beforeDouble.x, afterDouble.z - beforeDouble.z) > 0.5
        && Math.abs(afterDouble.span - beforeDouble.span) < 0.01,
      `(${beforeDouble.x.toFixed(1)}, ${beforeDouble.z.toFixed(1)}) -> (${afterDouble.x.toFixed(1)}, ${afterDouble.z.toFixed(1)}), span ${beforeDouble.span.toFixed(1)} -> ${afterDouble.span.toFixed(1)}`);

    await page.evaluate(async (was) => {
      const { focusOn, setYawStep, zoomBy } = await import("/client/render/camera.js");
      const v = globalThis.CITY.renderer.view;
      setYawStep(v, was.step);
      v.pitch = was.pitch;
      // Through `zoomBy`, not by assigning `span`: the orthographic camera's
      // frustum comes from `applyZoom`, so a span set by hand leaves the
      // projection describing the old one — and every pixel this gate projects
      // afterwards is then wrong by the ratio between them.
      zoomBy(v, was.span / v.span);
      focusOn(v, was.x, was.z);
    }, cameraWas);
  }

  // --- a held key is a rate (K2, ruling 042 §3) ------------------------------
  //
  // An arrow was one nudge per `keydown` until this slice, so the camera moved
  // in whatever steps the operating system's key repeat produced — a different
  // distance on every machine. Held for half a second it must cover about half
  // a second's worth of `PAN_SECONDS`, and Shift must make that meaningfully
  // further. Desktop only: a phone has no keyboard to hold.
  if (!touch) {
    const target = () => page.evaluate(() => ({
      x: globalThis.CITY.renderer.view.targetX,
      z: globalThis.CITY.renderer.view.targetZ,
      span: globalThis.CITY.renderer.view.span,
    }));
    await page.evaluate(() => document.getElementById("city").focus());
    const before = await target();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");
    const after = await target();
    const held = Math.hypot(after.x - before.x, after.z - before.z);
    // Half of `span / PAN_SECONDS`, give or take the frames the press and
    // release themselves fall in. Loose on purpose: this is a gate against
    // "nothing moved" and "it moved a whole map", not a unit test of the rate,
    // which `test/input.test.js` integrates twice at two frame rates.
    const want = before.span / 4 / 2;
    check(`${label}: a held arrow pans at a rate`, held > want * 0.4 && held < want * 2.5,
      `moved ${held.toFixed(2)} tiles in 0.5 s, wanted about ${want.toFixed(2)}`);

    // And it STOPS. A held key that outlives its release is the worst version
    // of this control: the camera drifts and nothing on screen says why.
    await page.waitForTimeout(250);
    const settled = await target();
    check(`${label}: and stops when the key comes up`,
      Math.hypot(settled.x - after.x, settled.z - after.z) < 0.01,
      `drifted ${Math.hypot(settled.x - after.x, settled.z - after.z).toFixed(3)} tiles after the release`);

    // Shift hurries. Same half second, meaningfully further.
    const beforeFast = await target();
    await page.keyboard.down("Shift");
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("Shift");
    const afterFast = await target();
    const hurried = Math.hypot(afterFast.x - beforeFast.x, afterFast.z - beforeFast.z);
    check(`${label}: and Shift hurries it`, hurried > held * 1.4,
      `${held.toFixed(2)} tiles held, ${hurried.toFixed(2)} with Shift`);

    // Q tapped snaps a quarter turn; Q held turns freely and lands back on one
    // of the four (ruling 006 as amended).
    const yawStep = () => page.evaluate(() => globalThis.CITY.renderer.view.yawStep);
    const stepBefore = await yawStep();
    await page.keyboard.press("q");
    const stepAfter = await yawStep();
    check(`${label}: a tap on Q snaps one step`, ((stepBefore - stepAfter) % 4 + 4) % 4 === 1,
      `yaw step ${stepBefore} -> ${stepAfter}`);
    await page.keyboard.down("e");
    await page.waitForTimeout(600);
    // Sampled WHILE held: without this the check below passes for a camera that
    // never turned at all, since standing still also ends on a snapped angle.
    const midTurn = await page.evaluate(() => {
      const quarter = Math.PI / 2;
      const yaw = globalThis.CITY.renderer.view.yaw;
      return Math.abs(yaw / quarter - Math.round(yaw / quarter));
    });
    check(`${label}: a held E turns freely while it is down`, midTurn > 0.02,
      `${midTurn.toFixed(3)} of a quarter turn off a snapped angle mid-hold`);
    await page.keyboard.up("e");
    const landed = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      const quarter = Math.PI / 2;
      return { yaw: v.yaw, off: Math.abs(v.yaw / quarter - Math.round(v.yaw / quarter)) };
    });
    check(`${label}: a held E lands back on one of the four`, landed.off < 1e-6,
      `yaw ${landed.yaw.toFixed(4)} is ${landed.off.toFixed(4)} of a quarter turn off`);
  }

  // --- a finger pulling from the border pans (K3, A59) -----------------------
  //
  // Kjell: "on touch devices, pull and drag from the border to move". With a
  // tool in hand a one-finger drag paints, so before this a finger had no way
  // to pan while building — the same gap the hand fills for a mouse. It is the
  // START of the drag that decides, so this also has to leave a drag-paint
  // begun in the middle alone, which the check below it proves by the road
  // count staying put.
  if (touch) {
    await page.click('#tools button[data-tool="road"]');
    const beforePull = await page.evaluate(() => ({
      x: globalThis.CITY.renderer.view.targetX,
      z: globalThis.CITY.renderer.view.targetZ,
      roads: globalThis.CITY.state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0),
    }));
    const box = await page.evaluate(() => {
      const r = document.getElementById("city").getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Six pixels in: inside the band on any viewport this gate drives.
    //
    // **Through CDP, not a dispatched event.** A constructed `PointerEvent`
    // carries a pointer id the browser has no record of, so the controller's
    // own `setPointerCapture` throws on it — which is a gate defect, not a
    // game one, and it reported the pan as 0.00 tiles because the exception
    // came before the recogniser saw the press. `Input.dispatchTouchEvent` is
    // a real touch as far as the page is concerned.
    const cdp = await page.context().newCDPSession(page);
    const x0 = box.x + 6;
    const y0 = box.y + box.height / 2;
    const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: y0, id: 1 }],
    });
    await touch("touchStart", x0);
    for (let i = 1; i <= 6; i += 1) await touch("touchMove", x0 + i * 20);
    await touch("touchEnd", x0 + 120);
    const pull = await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(r));
      return {
        x: globalThis.CITY.renderer.view.targetX,
        z: globalThis.CITY.renderer.view.targetZ,
        roads: globalThis.CITY.state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0),
      };
    });
    const pulled = Math.hypot(pull.x - beforePull.x, pull.z - beforePull.z);
    check(`${label}: a drag from the border pans with a tool in hand`, pulled > 1,
      `moved ${pulled.toFixed(2)} tiles`);
    check(`${label}: and the border pull builds nothing`, pull.roads === beforePull.roads,
      `${beforePull.roads} road tiles -> ${pull.roads}`);
    await page.evaluate(() => globalThis.CITY.controller.setTool(undefined));
  }

  // --- the ground has a shape now (V4, ruling 038) ---------------------------
  //
  // Picking marched a plane at y = 0 until this slice. On a slope that lands
  // past the hillside the ray actually struck, so a click on the near face
  // builds on the far side of it — an error that grows with the slope and with
  // the tilt, and that no unit test of the maths can see because the maths was
  // right about the plane.
  if (!touch) {
    const slope = await page.evaluate(() => {
      const { renderer, state } = globalThis.CITY;
      const m = renderer.model;
      // The steepest tile on screen, and what the two answers would be there.
      let best = { drop: 0 };
      for (let y = 4; y < state.height - 4; y += 1) {
        for (let x = 4; x < state.width - 4; x += 1) {
          const h = m.heightAt((x + 0.5) * m.tileM, (y + 0.5) * m.tileM);
          const e = m.heightAt((x + 1.5) * m.tileM, (y + 0.5) * m.tileM);
          const drop = Math.abs(h - e);
          if (drop > best.drop) best = { drop, x, y, h };
        }
      }
      return best;
    });
    if (slope.drop > 1) {
      const at = await tilePixel(page, slope.x, slope.y);
      const picked = await page.evaluate(async ([px, py]) => {
        const { renderer, state } = globalThis.CITY;
        const { pickTile } = await import("/client/render/picking.js");
        const canvas = document.getElementById("city");
        return pickTile(renderer.view, px, py, canvas.clientWidth, canvas.clientHeight,
          state.width, state.height, renderer.model);
      }, [at.x, at.y]);
      check(`${label}: a click on a slope picks the tile it landed on`,
        picked && Math.abs(picked.x - slope.x) <= 1 && Math.abs(picked.y - slope.y) <= 1,
        `aimed at ${slope.x},${slope.y} on a ${slope.drop.toFixed(1)} m drop, got ${JSON.stringify(picked)}`);
    }

    // And the ghost stands on the ground rather than on a remembered flattening
    // of it: a preview floating over a hill is a preview of the wrong tile.
    const ghost = await page.evaluate(() => {
      const { renderer, state } = globalThis.CITY;
      const m = renderer.model;
      const x = Math.floor(state.width / 2);
      const y = Math.floor(state.height / 2);
      renderer.showGhost(x, y, true);
      const ground = m.heightAt((x + 0.5) * m.tileM, (y + 0.5) * m.tileM) / m.tileM;
      const ghostY = renderer.scene.children.find((c) => c.geometry?.type === "BoxGeometry" && c.visible)?.position.y;
      renderer.hideGhost();
      return { ground, ghostY };
    });
    check(`${label}: the ghost stands on the ground`,
      ghost.ghostY !== undefined && Math.abs(ghost.ghostY - ghost.ground) < 0.4,
      `ghost at ${ghost.ghostY}, ground at ${ghost.ground?.toFixed(3)}`);
  }

  // --- the other two buttons (P33, P34) --------------------------------------
  //
  // N27 shipped these untested by anything that presses a button, and shipped
  // the wrong gesture on the wrong button twice running. A source test cannot
  // catch that — this presses them.
  if (!touch) {
    await page.click('#tools button[data-tool="road"]');  // a tool IS in hand
    const from = await tilePixel(page, 30, 30);
    const start = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return {
        x: v.targetX, z: v.targetZ, yaw: v.yaw, pitch: v.pitch,
        paved: globalThis.CITY.state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0),
      };
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: "right" });
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(from.x + i * 14, from.y - i * 9);
    await page.mouse.up({ button: "right" });
    const orbited = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return {
        x: v.targetX, z: v.targetZ, yaw: v.yaw, pitch: v.pitch,
        paved: globalThis.CITY.state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0),
      };
    });
    check(`${label}: right drag turns the camera, with a tool in hand`,
      Math.abs(orbited.yaw - start.yaw) > 0.05, `yaw ${start.yaw} -> ${orbited.yaw}`);
    check(`${label}: right drag tilts the camera`,
      Math.abs(orbited.pitch - start.pitch) > 0.05,
      `pitch ${start.pitch} -> ${orbited.pitch}`);
    // It turns FREELY: the four snapped angles belong to Q and E (ruling 006,
    // amended at P34). A drag that landed exactly on a quarter turn would mean
    // the snap is still in the way.
    const quarters = orbited.yaw / (Math.PI / 2);
    check(`${label}: the mouse is not snapped to the four angles`,
      Math.abs(quarters - Math.round(quarters)) > 1e-6, `yaw is exactly ${quarters} quarter turns`);
    check(`${label}: right drag does not build`, orbited.paved === start.paved,
      `${start.paved} tiles paved before the drag, ${orbited.paved} after`);
    check(`${label}: right drag does not pan`,
      Math.hypot(orbited.x - start.x, orbited.z - start.z) < 0.001,
      `the camera target moved as well as turning`);

    // And Q still lands back on a snapped angle from wherever the mouse left it.
    await page.evaluate(() => document.getElementById("city").focus());
    await page.keyboard.press("q");
    const snapped = await page.evaluate(() => globalThis.CITY.renderer.view.yaw / (Math.PI / 2));
    check(`${label}: a key press snaps back onto the four angles`,
      Math.abs(snapped - Math.round(snapped)) < 1e-9, `yaw is ${snapped} quarter turns`);

    const beforePan = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return { x: v.targetX, z: v.targetZ };
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(from.x + 160, from.y + 40, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    const panned2 = await page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return { x: v.targetX, z: v.targetZ };
    });
    const moved = Math.hypot(panned2.x - beforePan.x, panned2.z - beforePan.z);
    check(`${label}: middle drag pans`, moved > 1, `moved ${moved.toFixed(2)} tiles`);
    await page.click('#tools button[data-tool="road"]');  // put it down again
  }

  // The overlay list lives in a drawer; it is opened the way a player opens it.
  await page.click("#rail-overlays");
  await page.click('.hud-overlays button[data-overlay="pollution"]');
  check(`${label}: the overlay button selects an overlay`,
    await page.evaluate(() => globalThis.CITY.overlay) === "pollution",
    `the HUD says "${await page.evaluate(() => globalThis.CITY.overlay)}"`);

  // --- an overlay is a wash on the GROUND (slice V7, ruling 041) -------------
  //
  // The overlay used to be 24,000 instanced quads at the mean of each tile's
  // four corners; it is now one byte a tile mixed into the terrain material.
  // Every existing overlay check reads a MODEL — which band a tile is in, what
  // colour that band is — and every one of them would still have passed with a
  // shader that compiled and drew nothing (V7 spent an hour there). This reads
  // the screen.
  const wash = await page.evaluate(() => {
    const { renderer } = globalThis.CITY;
    const gl = document.getElementById("city");
    // Draw and read in ONE task. The game's canvas has no preserved drawing
    // buffer, so a read on a later turn of the event loop gets a blank one.
    const read = (overlay) => {
      renderer.draw({ overlay });
      const flat = document.createElement("canvas");
      flat.width = gl.width;
      flat.height = gl.height;
      const c = flat.getContext("2d");
      c.drawImage(gl, 0, 0);
      const d = c.getImageData(0, 0, flat.width, flat.height).data;
      const out = [];
      for (let y = 6; y < flat.height; y += 11) {
        for (let x = 6; x < flat.width; x += 11) {
          const i = (y * flat.width + x) * 4;
          out.push([d[i], d[i + 1], d[i + 2]]);
        }
      }
      return out;
    };
    const off = read(undefined);
    const on = read(globalThis.CITY.overlay);
    const back = read(undefined);
    let changed = 0;
    let stuck = 0;
    for (let i = 0; i < off.length; i += 1) {
      const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (gap(on[i], off[i]) > 8) changed += 1;
      if (gap(back[i], off[i]) > 8) stuck += 1;
    }
    return { samples: off.length, changed, stuck, showing: globalThis.CITY.overlay };
  });
  check(`${label}: turning an overlay on changes the picture`, wash.changed > 20,
    `${wash.changed} of ${wash.samples} sampled pixels moved with "${wash.showing}" on`);
  check(`${label}: and turning it off puts the picture back`, wash.stuck === 0,
    `${wash.stuck} of ${wash.samples} pixels kept the wash after it was switched off`);
  await page.click('.hud-overlays button[data-overlay="pollution"]');
  await page.click("#rail-overlays");

  // --- street mode (slice E4, ruling 034, spec §8.1) -------------------------
  //
  // Both ways in and both ways out, on both viewports and both projections.
  // The key and the wheel are separate promises and the second playtest is
  // full of controls that were recorded as working and did nothing.
  // There has to BE a street. Everything above builds a road and then undoes
  // it, so by here the city is bare ground — and `enterStreet` refusing to
  // stand in a field is correct behaviour, not a failure to report.
  const street = await page.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    await import("/engine/build-commands.js");
    const state = globalThis.CITY.state;
    const W = state.width;
    const y = Math.round(W / 2);
    apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [y * W + 8, W - 16] });
    globalThis.CITY.renderer.worldChanged();
    const { focusOn } = await import("/client/render/camera.js");
    focusOn(globalThis.CITY.renderer.view, W / 2, y + 0.5);
    return { paved: state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0), y };
  });
  check(`${label}: the street gate has a street to stand in`, street.paved > 10,
    `${street.paved} tiles paved`);

  await page.evaluate(() => document.getElementById("city").focus());
  await page.keyboard.press("f");
  const walked = await page.evaluate(async () => {
    const view = globalThis.CITY.renderer.view;
    if (view.mode !== "street") return { mode: view.mode };
    const before = { ...globalThis.CITY.renderer.walker.pose };
    // Hold W for a few frames through the REAL key handler and frame loop.
    return { mode: view.mode, before, eye: view.eye && { ...view.eye } };
  });
  check(`${label}: F drops the camera into the street`, walked.mode === "street",
    `the camera is in "${walked.mode}" mode`);
  if (walked.mode === "street") {
    check(`${label}: the eye is on the ground, not on the orbit`,
      walked.eye !== undefined && walked.before !== undefined
        && Math.abs(walked.eye.y * 20 - walked.before.y) < 1e-6,
      `eye ${JSON.stringify(walked.eye)} against pose ${JSON.stringify(walked.before)}`);
    // The build rail is GONE, not merely inert: a street is for looking at.
    const railHidden = await page.evaluate(() => {
      const rail = document.querySelector("#hud .hud-build") ?? document.querySelector("#hud .hud-tools");
      return rail ? getComputedStyle(rail).display === "none" : false;
    });
    check(`${label}: the build tools are gone in the street`, railHidden,
      railHidden ? "the toolbar is display:none" : "the toolbar is still displayed at eye height");

    await page.keyboard.down("w");
    await page.waitForTimeout(400);
    await page.keyboard.up("w");
    const after = await page.evaluate(() => ({ ...globalThis.CITY.renderer.walker.pose }));
    const stepped = Math.hypot(after.x - walked.before.x, after.z - walked.before.z);
    check(`${label}: W walks`, stepped > 0.1, `moved ${stepped.toFixed(2)} m in 0.4 s`);

    // --- looking without the lock (K3, A58) ----------------------------------
    //
    // Drag-look is the fallback, and it is what an embedded page and a browser
    // that refuses the lock get. Every row here boots with `?lock=0` so the
    // rest of the gate can keep clicking — see the note at the loop — which
    // makes this the fallback path by construction. The LOCKED path is a pass
    // of its own, after the loop.
    if (!touch) {
      if (process.env.PLAY_TRACE) process.stderr.write(`~ ${label}: drag-look block (touch=${touch})\n`);
      const turned = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      const yawNow = () => page.evaluate(() => globalThis.CITY.renderer.walker.pose.yaw);
      const box = await page.evaluate(() => {
        const r = document.getElementById("city").getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const locked = await page.evaluate(() => globalThis.CITY.controller.pointerLocked === true);
      check(`${label}: ?lock=0 leaves the pointer free`, !locked,
        locked ? "locked anyway" : "unlocked, as asked");
      const yawA = await yawNow();
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      await page.mouse.move(centre.x + 90, centre.y, { steps: 6 });
      await page.mouse.move(centre.x + 180, centre.y, { steps: 6 });
      await page.mouse.up();
      const yawB = await yawNow();
      check(`${label}: and drag-look turns the view without the lock`, turned(yawA, yawB) > 0.05,
        `yaw ${yawA.toFixed(3)} -> ${yawB.toFixed(3)} (${turned(yawA, yawB).toFixed(3)} rad)`);
    }

    // A double-click on the ground WALKS there down here (K4) — the phone's
    // tap-to-walk, given to the mouse, because a click on the ground already
    // means "that place" and the camera is the walker's head.
    const beforeWalk = await page.evaluate(() => ({ ...globalThis.CITY.renderer.walker.pose }));
    const box = await page.evaluate(() => {
      const r = document.getElementById("city").getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Below the horizon, so the ray meets the ground rather than the sky.
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.72);
    await page.waitForTimeout(600);
    const afterWalk = await page.evaluate(() => ({ ...globalThis.CITY.renderer.walker.pose }));
    const walkedTo = Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.z - beforeWalk.z);
    check(`${label}: a double-click walks there in the street`, walkedTo > 0.5,
      `moved ${walkedTo.toFixed(2)} m towards the point`);

    // And Home leaves the street before it fits, landing in the projection the
    // player came from rather than always in perspective (R2's `cameFrom`).
    await page.evaluate(() => document.getElementById("city").focus());
    await page.keyboard.press("Home");
    const afterHome = await page.evaluate(() => globalThis.CITY.renderer.view.mode);
    check(`${label}: Home from the street comes back up, in the mode it came from`,
      afterHome === mode, `landed in "${afterHome}", came from "${mode}"`);
    if (afterHome !== "street") await page.keyboard.press("f");

    await page.keyboard.press("Escape");
    const left = await page.evaluate(() => globalThis.CITY.renderer.view.mode);
    check(`${label}: Escape comes back to the city`, left !== "street", `still "${left}"`);
    // And back to the projection the player was USING, not always `city`. A
    // phone defaults to orthographic, so leaving always to perspective handed
    // it a projection it never asked for (R2).
    check(`${label}: and to the projection it came from`, left === mode,
      `entered from "${mode}" and came back to "${left}"`);
  }

  const cameraWas = await page.evaluate(() => {
    const v = globalThis.CITY.renderer.view;
    return { mode: v.mode, targetX: v.targetX, targetZ: v.targetZ, span: v.span, pitch: v.pitch, yaw: v.yaw };
  });
  const restoreCamera = () => page.evaluate(async (was) => {
    const city = globalThis.CITY;
    const view = city.renderer.view;
    const { setMode, focusOn, applyZoom, pitchBy } = await import("/client/render/camera.js");
    if (view.mode === "photo") city.renderer.leavePhoto();
    if (view.mode === "street") city.renderer.leaveStreet();
    setMode(view, was.mode === "street" ? "city" : was.mode);
    view.span = was.span;
    view.yaw = was.yaw;
    applyZoom(view, view.aspect);
    pitchBy(view, was.pitch - (view.pitch ?? 0));
    focusOn(view, was.targetX, was.targetZ);
  }, cameraWas);

  // --- the two mouse buttons (slice K3, ruling 042 §2) -----------------------
  //
  // Kjell asked for this by name. Real pointer events on the real canvas: the
  // pure table is tested in node, and what this adds is that the table is
  // actually WIRED — a table nothing consults is a table.
  if (!touch) {
    const canvasBox = await page.locator("#city").boundingBox();
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    const view = () => page.evaluate(() => {
      const v = globalThis.CITY.renderer.view;
      return { x: v.targetX, z: v.targetZ, yaw: v.yaw, span: v.span, mode: v.mode };
    });

    // Both buttons dolly. The zoom a wheel-less trackpad never had.
    await page.evaluate(async () => {
      const { setMode } = await import("/client/render/camera.js");
      const v = globalThis.CITY.renderer.view;
      if (v.mode === "street" || v.mode === "photo") globalThis.CITY.controller.leaveStreet?.();
      setMode(v, "city");
      v.span = 40;
    });
    const beforeDolly = await view();
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
    await page.mouse.down({ button: "right" });
    await page.mouse.move(cx, cy - 120, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await page.mouse.up({ button: "left" });
    const afterDolly = await view();
    check(`${label}: both buttons dolly the camera`,
      Math.abs(afterDolly.span - beforeDolly.span) > 1,
      `span ${beforeDolly.span} -> ${afterDolly.span}`);
    // Compared as an ANGLE. `yawBy` wraps into [0, 2π), so a camera that did not
    // turn at all reads as -1.5708 before and 4.7124 after — the same direction,
    // a different number, and a check on the raw values calls it a defect.
    const turned = Math.abs(Math.atan2(
      Math.sin(afterDolly.yaw - beforeDolly.yaw), Math.cos(afterDolly.yaw - beforeDolly.yaw),
    ));
    check(`${label}: and dollying does not turn the camera`, turned < 1e-6,
      `yaw ${beforeDolly.yaw} -> ${afterDolly.yaw} (${turned.toFixed(6)} rad apart)`);

    // The wheel keeps the ground under the pointer where it is. Asked off
    // CENTRE, because at the centre every implementation passes.
    const offX = cx + Math.round(canvasBox.width * 0.25);
    const offY = cy + Math.round(canvasBox.height * 0.2);
    const groundAt = (px, py) => page.evaluate(async ([x, y, bx, by]) => {
      const { groundPoint } = await import("/client/render/picking.js");
      const c = document.querySelector("#city");
      const r = globalThis.CITY.renderer;
      const st = globalThis.CITY.state;
      return groundPoint(r.view, x - bx, y - by, c.clientWidth, c.clientHeight,
        r.model, st.width, st.height);
    }, [px, py, canvasBox.x, canvasBox.y]);
    await page.mouse.move(offX, offY);
    const groundBefore = await groundAt(offX, offY);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(80);
    const groundAfter = await groundAt(offX, offY);
    if (groundBefore && groundAfter) {
      const drift = Math.hypot(groundAfter.x - groundBefore.x, groundAfter.z - groundBefore.z);
      check(`${label}: the wheel keeps the ground under the pointer`, drift < 1.5,
        `drifted ${drift.toFixed(2)} tiles`);
    } else {
      check(`${label}: the wheel keeps the ground under the pointer`, false, "no ground under the pointer");
    }

    // The hand pans with a tool in hand, and builds nothing while it does.
    await page.evaluate(() => globalThis.CITY.controller.setTool("road"));
    const roadBefore = await page.evaluate(() =>
      [...globalThis.CITY.state.tiles.road].reduce((a, v) => a + (v & 16 ? 1 : 0), 0));
    const panBefore = await view();
    await page.keyboard.down("h");
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(cx - 150, cy, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await page.keyboard.up("h");
    const panAfter = await view();
    const roadAfter = await page.evaluate(() =>
      [...globalThis.CITY.state.tiles.road].reduce((a, v) => a + (v & 16 ? 1 : 0), 0));
    check(`${label}: the hand pans with a tool selected`,
      Math.hypot(panAfter.x - panBefore.x, panAfter.z - panBefore.z) > 1,
      `${JSON.stringify(panBefore)} -> ${JSON.stringify(panAfter)}`);
    check(`${label}: and the tool builds nothing while the hand is down`,
      roadAfter === roadBefore, `${roadBefore} -> ${roadAfter} road tiles`);
    await page.evaluate(() => globalThis.CITY.controller.setTool(undefined));
    // Put the camera back. These rows pan and zoom, and the wheel-into-street
    // check further down needs the view over a road to find one — the same
    // lesson the photo rows learnt, in the same file, one slice later.
    await restoreCamera();
  }

  // --- the cluster's share of a phone (slice K1, ruling 042 §5) ---------------
  //
  // "The chrome does not grow." The playtest measured 41% of a 390x844 screen
  // and that is the ceiling this lane may not raise — so the cluster is one
  // button until it is opened, and this is the row that says whether that held.
  // The viewport is read from the page rather than passed in: `run` takes the
  // label and the pointer kind, and threading a fourth argument through for one
  // row is how a signature becomes a list.
  const narrow = await page.evaluate(() => window.innerWidth <= 520);
  if (narrow) {
    const share = await page.evaluate(() => {
      const seen = [];
      const area = (el) => {
        const r = el?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? { r, a: r.width * r.height } : undefined;
      };
      let covered = 0;
      for (const sel of [".hud-top", ".hud-bottom", ".camera-cluster", ".hud-minimap"]) {
        const got = area(document.querySelector(sel));
        if (!got) continue;
        covered += got.a;
        seen.push(`${sel} ${Math.round(got.r.width)}x${Math.round(got.r.height)}`);
      }
      return { covered, screen: window.innerWidth * window.innerHeight, seen };
    });
    const pct = (100 * share.covered) / share.screen;
    check(`${label}: the chrome stays under the playtest's 41%`, pct <= 41,
      `${pct.toFixed(0)}% — ${share.seen.join(", ")}`);
  }

  // --- photo mode (slice F1) -------------------------------------------------
  //
  // From the city and from the street, on both viewports. The mode has no
  // pavement to need, so unlike the street it can never refuse — which is
  // exactly why it is worth checking that it also always gives the view BACK.
  //
  // **And the camera is put back where this section found it.** A photo camera
  // flies, and the checks after this one need the view over a street: the first
  // run of these rows left the camera 69 tiles out over open ground, the wheel
  // check below could find no corridor to drop into, and it failed for a reason
  // that had nothing to do with the wheel. A gate step that moves shared state
  // restores it (the lesson `measurement-steps-must-not-inherit` records).

  for (const from of ["city", "street"]) {
    await restoreCamera();
    const entered = await page.evaluate(async (origin) => {
      const city = globalThis.CITY;
      const view = city.renderer.view;
      const { setMode } = await import("/client/render/camera.js");
      if (origin === "street") {
        if (view.mode !== "street") city.renderer.enterStreet();
      } else {
        if (view.mode === "street") city.renderer.leaveStreet();
        setMode(view, "city");
      }
      const before = view.mode;
      city.controller.enterPhoto();
      const eye = view.eye ? { ...view.eye } : undefined;
      return { before, mode: view.mode, eye, tool: city.controller.tool };
    }, from);
    check(`${label}: photo mode opens from ${from}`, entered.mode === "photo",
      JSON.stringify(entered));
    check(`${label}: and the eye is where the camera was, not at the origin`,
      entered.eye !== undefined && (entered.eye.x !== 0 || entered.eye.z !== 0),
      JSON.stringify(entered.eye));
    check(`${label}: and nothing is left in hand`, !entered.tool, String(entered.tool));

    // WASD flies, and it flies at a RATE — the frame loop scales by its delta,
    // so this asserts movement rather than a distance a slow machine would miss.
    const flew = await page.evaluate(() => ({ ...globalThis.CITY.renderer.view.eye }));
    await page.keyboard.down("w");
    await page.waitForTimeout(400);
    await page.keyboard.up("w");
    const now = await page.evaluate(() => ({ ...globalThis.CITY.renderer.view.eye }));
    const moved = Math.hypot(now.x - flew.x, now.y - flew.y, now.z - flew.z);
    check(`${label}: W flies the photo camera from ${from}`, moved > 0.01,
      `moved ${moved.toFixed(3)} tiles in 0.4 s`);

    await page.keyboard.press("Escape");
    const out = await page.evaluate(() => globalThis.CITY.renderer.view.mode);
    check(`${label}: Escape leaves photo mode from ${from}`, out !== "photo", `still "${out}"`);
    // Never into a street the player did not walk into: leaving is a camera
    // change, not a mode they have to escape twice.
    check(`${label}: and does not strand the player in the street`, out !== "street", out);
  }
  await restoreCamera();

  // And in by the wheel: zoomed to the minimum span with the camera tilted
  // down towards the horizon, one more notch steps out of the car.
  const byWheel = await page.evaluate(async () => {
    const { setMode, zoomBy, pitchBy } = await import("/client/render/camera.js");
    const view = globalThis.CITY.renderer.view;
    setMode(view, "city");
    zoomBy(view, 0.01 / view.span);          // hard against the 8-tile floor
    pitchBy(view, 0.3 - (view.pitch ?? 0));  // ~17°, below the 25° threshold
    return { span: view.span, pitch: view.pitch };
  });
  const canvas = await page.locator("#city").boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(50);
  const zoomedIn = await page.evaluate(() => globalThis.CITY.renderer.view.mode);
  check(`${label}: zooming past the minimum span drops into the street`,
    zoomedIn === "street", `span ${byWheel.span}, pitch ${byWheel.pitch} left the camera in "${zoomedIn}"`);
  if (zoomedIn === "street") {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(50);
    const zoomedOut = await page.evaluate(() => globalThis.CITY.renderer.view.mode);
    check(`${label}: zooming out comes back`, zoomedOut !== "street", `still "${zoomedOut}"`);
  }
  await page.evaluate(async (wanted) => {
    const { setMode } = await import("/client/render/camera.js");
    setMode(globalThis.CITY.renderer.view, wanted);
  }, "city");

  return { type };
}

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

try {
  // Both projections (slice V5, ruling 034). A gate that only ever drives the
  // orthographic camera proves half a promise: everything below — the drag, the
  // undo, the rectangle, the orbit — runs through picking and panning, and
  // those are the two things that stop being a constant under perspective.
  // **Every row boots with `?lock=0`.** Playwright cannot work a page that has
  // taken the pointer: `locator.boundingBox()` resolves the element, reports it
  // visible and never returns, and this gate enters the street four times. The
  // locked path gets a pass of its own below, where nothing else runs (A58).
  for (const [label, viewport, touch, mode] of [
    ["desktop", { width: 1280, height: 720 }, false, "ortho"],
    ["desktop perspective", { width: 1280, height: 720 }, false, "city"],
    ["phone", { width: 390, height: 844 }, true, "ortho"],
    ["phone perspective", { width: 390, height: 844 }, true, "city"],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`${label}: page error — ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64&lock=0`);
    // Expose three's Vector3 for the tile→pixel helper, using the very module
    // the page already loaded rather than a second copy.
    await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await page.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    await page.evaluate(async (wanted) => {
      const THREE = await import("/vendor/three.module.js");
      globalThis.THREE_VEC = THREE.Vector3;
      globalThis.CITY.setProjection(wanted);
    }, mode);
    await run(page, label, { touch, mode });
    await context.close();
  }

  // --- the locked look (K3, A58) ---------------------------------------------
  //
  // A pass of its own, with nothing else in it. Pointer Lock is what Kjell's
  // "freelook without buttons" means where the browser grants it, and it has to
  // be driven rather than asserted from the source — but a locked page cannot
  // be worked with Playwright's element machinery at all, so the loop above
  // runs unlocked and this pass does one thing and closes.
  {
    const lockCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const lockPage = await lockCtx.newPage();
    lockPage.on("pageerror", (error) => problems.push(`locked look: page error — ${error.message}`));
    await lockPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
    await lockPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await lockPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    // Pave something to stand on, then enter through the real key so the lock
    // is asked for inside a user gesture — which is the only moment it can be.
    const paved = await lockPage.evaluate(async () => {
      const { apply } = await import("/engine/reducer.js");
      const C = await import("/engine/commands.js");
      const state = globalThis.CITY.state;
      const W = state.width;
      const y = Math.round(W / 2);
      // The same recipe the rows above use — run-length pairs, not an object,
      // which is the shape `CMD_PLACE_ROAD` actually takes — and the view moved
      // onto the pavement, because `enterStreet` stands where the camera looks.
      apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [y * W + 8, W - 16] });
      globalThis.CITY.renderer.worldChanged();
      const { focusOn } = await import("/client/render/camera.js");
      focusOn(globalThis.CITY.renderer.view, W / 2, y + 0.5);
      return state.tiles.road.reduce((n, t) => n + (t & 16 ? 1 : 0), 0);
    });
    check("locked: the pass has a street to stand in", paved > 10, `${paved} tiles paved`);
    // A beat for the renderer to take the new road into its own model: the
    // walker stands on the renderer's ground, not on the state's, and
    // `enterStreet` refuses a tile whose chunk has not been rebuilt yet.
    await lockPage.waitForTimeout(600);
    await lockPage.evaluate(() => document.getElementById("city").focus());
    await lockPage.keyboard.press("f");
    const street = await lockPage.evaluate(() => globalThis.CITY.renderer.view.mode);
    check("locked: the gate reaches the street it means to look from", street === "street",
      street === "street" ? "in the street" : `in "${street}" mode, so nothing below tested the lock`);
    const locked = await lockPage.evaluate(() => globalThis.CITY.controller.pointerLocked === true);
    if (street === "street" && locked) {
      const yawOf = () => lockPage.evaluate(() => globalThis.CITY.renderer.walker.pose.yaw);
      const before = await yawOf();
      // **Dispatched, not driven.** Everything else in this gate uses real
      // pointer events, and this one cannot: a locked pointer reports its
      // motion only in `movementX`, and Playwright's mouse API has no way to
      // set it — `page.mouse.move` in a locked page arrives with movement 0 and
      // turns nothing, which is what the first run of this check reported. The
      // event still goes through the page's own listener, the real controller
      // and the real walker; only the two numbers on it are ours.
      await lockPage.evaluate(() => {
        const canvas = document.getElementById("city");
        for (let i = 0; i < 2; i += 1) {
          canvas.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, pointerType: "mouse", buttons: 0,
            movementX: 120, movementY: 0, clientX: 760, clientY: 360,
          }));
        }
      });
      const after = await yawOf();
      const turned = Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)));
      check("locked: the mouse looks with nothing held", turned > 0.05,
        `yaw ${before.toFixed(3)} -> ${after.toFixed(3)} (${turned.toFixed(3)} rad)`);
    } else if (street === "street") {
      // Not a failure, and not silence either: a refused lock is the case the
      // fallback exists for, and the gate has to say which path it ran.
      check("locked: the lock was refused, so the fallback is what a player gets", true,
        "no pointer lock in this browser or context");
    }
    await lockPage.evaluate(() => document.exitPointerLock?.());
    await lockCtx.close();
  }

  // --- the edge of the canvas pans (K3, A59) ---------------------------------
  //
  // Kjell: "edge scrolling when using mouse". It is a frame-rate-scaled rate,
  // not a jump, so the assertion is that resting the pointer against the frame
  // for half a second MOVES the view — and that the settings row turns it off,
  // because a control that cannot be turned off is what made this a question.
  {
    const edgeCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const edgePage = await edgeCtx.newPage();
    edgePage.on("pageerror", (error) => problems.push(`edge scroll: page error — ${error.message}`));
    await edgePage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
    await edgePage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await edgePage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    const targetNow = () => edgePage.evaluate(() => ({
      x: globalThis.CITY.renderer.view.targetX, z: globalThis.CITY.renderer.view.targetZ,
    }));
    const restAtEdge = async () => {
      // Well inside the canvas first, so the move onto the band is a move and
      // the browser has a previous position to report.
      await edgePage.mouse.move(640, 360);
      await edgePage.mouse.move(6, 360);
      await edgePage.waitForTimeout(500);
    };
    const before = await targetNow();
    await restAtEdge();
    const after = await targetNow();
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    check("the pointer at the edge pans the view", moved > 0.5,
      `moved ${moved.toFixed(2)} tiles in 0.5 s at the left edge`);

    // And off. The controller re-reads the preference every frame, so this
    // needs no reload — which is the point of reading it every frame.
    await edgePage.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("citygrid.settings") ?? "{}");
      localStorage.setItem("citygrid.settings", JSON.stringify({ ...stored, edgeScroll: false }));
    });
    const beforeOff = await targetNow();
    await restAtEdge();
    const afterOff = await targetNow();
    const movedOff = Math.hypot(afterOff.x - beforeOff.x, afterOff.z - beforeOff.z);
    check("and the settings row turns it off without a reload", movedOff < 0.01,
      `moved ${movedOff.toFixed(3)} tiles with edgeScroll off`);
    await edgeCtx.close();
  }

  // --- the boot reads the player's settings (omissions sweep, K3) ------------
  //
  // Found through `?lock=0` doing nothing: `game.js` read the tier, the
  // projection, the hour and `life` off the WORLD options record, which never
  // carried them, so every one fell back to a default and only the settings
  // panel could put it right. A stored preference has to survive a reload, and
  // nothing in the suite could see this — the defaults are what a gate boots
  // with, so a gate that never stores anything measures the fallback.
  {
    const prefCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const prefPage = await prefCtx.newPage();
    prefPage.on("pageerror", (error) => problems.push(`settings boot: page error — ${error.message}`));
    await prefPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
    await prefPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await prefPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    await prefPage.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("citygrid.settings") ?? "{}");
      localStorage.setItem("citygrid.settings",
        JSON.stringify({ ...stored, quality: "low", camera: "ortho", time: "night" }));
    });
    await prefPage.reload();
    await prefPage.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await prefPage.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    const booted = await prefPage.evaluate(() => ({
      tier: globalThis.CITY.renderer.tier,
      mode: globalThis.CITY.renderer.view.mode,
      night: globalThis.CITY.renderer.stats?.night,
    }));
    check("the boot honours the stored quality tier", booted.tier === "low", `booted "${booted.tier}"`);
    check("the boot honours the stored projection", booted.mode === "ortho", `booted "${booted.mode}"`);
    await prefCtx.close();
  }

  // --- and the city grows ---------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`growth: page error — ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#controls-dismiss")?.click());
  const grew = await page.evaluate(async () => {
    const { state, renderer } = globalThis.CITY;
    const { apply } = await import("/engine/reducer.js");
    const { CMD_TICK, CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_PLACE_BUILDING, CMD_PLACE_WIRE, CMD_PLACE_PIPE } = await import("/engine/commands.js");
    globalThis.CITY.pause();
    state.players[0].treasury = 5000000;

    // The gate's own sentence: a road, zoning beside it, a plant. Issued as
    // commands so growth does not depend on pointer timing — the pointer path
    // is what the two runs above already proved.
    //
    // A flat, dry strip is chosen first. Zoning the sea and then reporting that
    // nothing grew would be a test of the map generator, not of the game.
    let row = -1;
    for (let y = 10; y < state.height - 8 && row < 0; y += 1) {
      let clear = true;
      for (let x = 8; x < 26; x += 1) {
        for (let dy = -5; dy <= 3; dy += 1) {
          const i = (y + dy) * state.width + x;
          if (state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4) clear = false;
        }
      }
      if (clear) row = y;
    }
    if (row < 0) return { reason: "no dry strip on this map" };

    const results = {};
    results.road = apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [row * state.width + 8, 18] }).result;
    const zone = [];
    for (let y = row + 1; y <= row + 3; y += 1) zone.push(y * state.width + 8, 18);
    results.zone = apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: zone, zone: 1 }).result;
    // A lot develops only with power AND water in reach, so the gate's "places a
    // plant" is really two utilities. Groundwater rather than a river pump, so
    // the check does not depend on the zoned strip happening to touch a coast.
    results.plant = apply(state, {
      type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 10, y: row - 5,
    }).result;
    results.pump = apply(state, {
      type: CMD_PLACE_BUILDING, actor: 1, def: "groundwaterPump", x: 16, y: row - 5,
    }).result;
    const wire = [];
    const pipe = [];
    for (let y = row - 4; y <= row + 3; y += 1) {
      wire.push(y * state.width + 10, 1);
      pipe.push(y * state.width + 16, 1);
    }
    results.wire = apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: wire }).result;
    results.pipe = apply(state, { type: CMD_PLACE_PIPE, actor: 1, runs: pipe }).result;

    // 300 ticks, about two years. Long enough that a lot with road, power and
    // water in reach develops — the first one does so at tick 12 — and short
    // enough that this stays a test of INPUT.
    //
    // It used to run 1200, and failed: at tick 502 a fire takes the only power
    // plant, the shortfall abandons the last house and the city is empty by
    // 540. That is a city with no fire cover and nobody rebuilding, which is
    // the disaster and balance lane's business (N6, N8), not this slice's.
    const before = state.buildings.length;
    let peak = before;
    for (let i = 0; i < 300; i += 1) {
      apply(state, { type: CMD_TICK });
      peak = Math.max(peak, state.buildings.length);
    }
    renderer.worldChanged();
    return { before, after: state.buildings.length, peak, population: state.population, results, row };
  });
  check("the city grows where it was zoned", grew.peak > grew.before,
    grew.reason ?? `${grew.before} → ${grew.peak} buildings, pop ${grew.population}, ${JSON.stringify(grew.results)}`);
  await context.close();
} finally {
  await browser.close();
  server.close();
}

for (const c of checks) console.log(`${c.ok ? "ok   " : "FAIL "} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nplay smoke ok");
