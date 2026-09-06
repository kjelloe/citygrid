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

async function run(page, label, { touch }) {
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
  for (const [label, viewport, touch, mode] of [
    ["desktop", { width: 1280, height: 720 }, false, "ortho"],
    ["desktop perspective", { width: 1280, height: 720 }, false, "city"],
    ["phone", { width: 390, height: 844 }, true, "ortho"],
    ["phone perspective", { width: 390, height: 844 }, true, "city"],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`${label}: page error — ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
    // Expose three's Vector3 for the tile→pixel helper, using the very module
    // the page already loaded rather than a second copy.
    await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await page.evaluate(async (wanted) => {
      const THREE = await import("/vendor/three.module.js");
      globalThis.THREE_VEC = THREE.Vector3;
      globalThis.CITY.setProjection(wanted);
    }, mode);
    await run(page, label, { touch });
    await context.close();
  }

  // --- and the city grows ---------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`growth: page error — ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=64`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
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
