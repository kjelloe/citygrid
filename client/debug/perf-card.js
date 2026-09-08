// `?perf=1` — the performance card (slice D1).
//
// The problem this exists for: every frame time in this repository was measured
// on SwiftShader, a software rasteriser, and the whole quality system — three
// tiers, a frame-time governor and a sacrifice ladder — was designed for phones
// nobody has run it on. `RELEASE.md` calls it the largest gap in the project.
//
// So: a scripted sweep the player can run on their own device, and a card they
// can paste back. **Nothing is sent anywhere.** There is no endpoint, no fetch
// and no consent question to get wrong; the measurement leaves the device only
// if the person copies it and chooses where to put it.
//
// It drives the REAL page — `main.js` hands its own `play()` in, so the sweep
// is measuring the game with its HUD, its input, its clock and its ticking
// simulation, not a harness that happens to share a renderer. A gate that
// measures a mock proves the mock is fast.
//
// **It needs the repository, not just the app.** The fixture comes from
// `tools/lib/saturated.mjs` — the recipe three gates already measure on, and a
// second copy of it would be a second chance to measure a different place from
// the one this card names. That import is the one thing here the service worker
// does not precache, so `?perf=1` wants a served checkout (`./run.sh`) and not
// an offline install. Everything the game itself is made of stays precached.
//
// `tools/perf_card.mjs` drives the same `SWEEP` under Playwright so a
// SwiftShader row and a phone row land in the same shape and can go in one
// table. What that comparison is FOR is naming the machine, not comparing the
// two numbers: they are different measurements of different hardware.

import { SWEEP, MAPS, stepLabel } from "./perf-sweep.js";
import { deviceClass } from "../capabilities.js";
import { applyPose, applyZoom } from "../render/camera.js";

/** Seconds before each step's samples begin. Streaming, the chunk baker and the
 * governor's 60-frame ring all need a moment after the camera moves, and a
 * percentile taken across that moment is a percentile of the move. */
const WARMUP_MIN = 1;
const WARMUP_MAX = 8;

/** The commuter load seeded onto every road tile, the same 200 `lanes_dump` has
 * used since E4. Cars are uncapped at High and are 76 triangles each, so a
 * sweep of a city with no traffic in it measures a frame no player will see. */
const TRAFFIC = 200;

/**
 * The warm-up: hold the view until the city has stopped arriving, and count
 * what arriving cost.
 *
 * Two things settle here, and neither is instant. The chunk baker builds street
 * chunks as the camera reaches them — and this is the *only* place the bake is
 * measurable, because a chunk is 16 tiles, 320 m, and the walker's 60 m leg
 * never leaves the one it started in. The traffic fills at one car per link per
 * frame, which on a busy view is several seconds; sampling before it has
 * finished is sampling a road that is still filling up.
 *
 * It ends when the car count stops moving, or at `maxS`, whichever is first —
 * and it reports which, because a step that ran out of warm-up was measured
 * mid-fill and the reader has to be able to see that.
 */
function settle(renderer, minS, maxS) {
  return new Promise((resolve) => {
    let chunks = 0;
    let worstMs = 0;
    let lastCars = -1;
    let steadyFrom = 0;
    const start = performance.now();
    const tick = (now) => {
      const streets = renderer.stats.streets;
      if (streets) {
        chunks += streets.built ?? 0;
        worstMs = Math.max(worstMs, streets.buildMs ?? 0);
      }
      const cars = renderer.stats.cars ?? 0;
      if (Math.abs(cars - lastCars) > Math.max(2, lastCars * 0.02)) steadyFrom = now;
      lastCars = cars;
      const elapsed = (now - start) / 1000;
      const steady = (now - steadyFrom) / 1000 >= 0.5;
      if (elapsed < minS || (!steady && elapsed < maxS)) requestAnimationFrame(tick);
      else resolve({ chunks, worstMs, settleS: Math.round(elapsed * 10) / 10, settled: steady });
    };
    requestAnimationFrame(tick);
  });
}

/** Frame deltas, from `requestAnimationFrame`. Measured here rather than read
 * off the governor because the governor is a 60-frame ring with a target and a
 * ladder attached, and what a step needs is the raw list. */
function sampleFrames(seconds) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = 0;
    const until = performance.now() + seconds * 1000;
    const tick = (now) => {
      if (last > 0) deltas.push(now - last);
      last = now;
      if (now < until) requestAnimationFrame(tick);
      else resolve(deltas);
    };
    requestAnimationFrame(tick);
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return Math.round(sorted[index] * 100) / 100;
}

/** The walker's leg, in metres of ground actually covered — not of ground
 * asked for. A wall, a hedge or a parked car stops the walker, and a step that
 * reported the leg it intended would be reporting its own intention. The
 * walker's pose is already in metres; only the camera works in tiles. */
function legWatcher(renderer) {
  // `walker.pose`, not `walker.foot` — `foot` is the height of the ground under
  // the walker, a single number. Differencing it gave NaN, `NaN < 60` is false,
  // and the first run's street step released the walk keys on its first frame
  // and reported a leg of `null` (D1).
  const foot = () => renderer.walker?.pose;
  let previous = foot();
  let metres = 0;
  return {
    step() {
      const now = foot();
      if (previous && now) {
        metres += Math.hypot(now.x - previous.x, now.z - previous.z);
      }
      previous = now ? { x: now.x, z: now.z } : undefined;
    },
    get metres() { return Math.round(metres); },
  };
}

/** Real key events, because that is the walker's only input path — `game.js`
 * reads `controller.move` once a frame and the controller reads held keys. */
function holdWalkKeys(down) {
  for (const key of ["w", "Shift"]) {
    globalThis.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key, bubbles: true }));
  }
}

async function walkFor(renderer, seconds, wantedM) {
  const leg = legWatcher(renderer);
  holdWalkKeys(true);
  const until = performance.now() + seconds * 1000;
  while (performance.now() < until && leg.metres < wantedM) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    leg.step();
  }
  holdWalkKeys(false);
  return leg.metres;
}

/**
 * A session on this state, in this style, with the clock stopped.
 *
 * **Paused, and every one of them.** The reducer recomputes `tiles.traffic`
 * each tick from commutes the seeded buildings do not generate, so a running
 * clock washes the fixture's load out — the first run with traffic had 1,546
 * cars in step 1 and 0 in step 7, which is nine measurements of nine different
 * cities. Pausing also keeps the 53.7 ms model rebuild (Q60) out of a frame-time
 * percentile: that is a simulation cost, and this card is about the frame.
 *
 * It is a *helper* because pausing the boot session was not enough and looked
 * exactly like it was. A style is a renderer rebuild (R2), the stored default
 * style is `painted` and the sweep opens on `plain`, so step 1 already replaced
 * the session that had been paused with one that had not — and the tick went on
 * climbing through all nine steps with `CITY.pause()` visibly called.
 */
async function begin(state, style, play) {
  const session = await play({ world: { ok: true, state }, style });
  session.pause();
  return session;
}

/** Puts the session in the step's view. Returns the session, which the style
 * change replaces — a style decides the materials, so it is a new renderer over
 * the same state (R2). */
async function poseFor(step, session, play, hold) {
  // **A fresh session per step, not only per style.** The local traffic sim
  // fills a link when it is on screen and never empties it again, so cars
  // accumulate across a sweep: the run before this one went 1,546 → 3,071 →
  // 5,454 → 7,455 → 8,927 → 9,052 → 9,222 and then fell back to 1,546 the
  // moment a style change happened to rebuild the renderer. Step 7 read 700 ms
  // and it was not the night — it was six times the cars of step 2. Nine views
  // of one city have to start from one place.
  const { state } = session;
  session.stop();
  session = await begin(state, step.style, play);
  const { renderer } = session;
  const { view } = renderer;
  session.setTime(step.time);

  let entered = true;
  if (step.mode === "street") {
    // `enterStreet` needs a corridor within three tiles of the camera target
    // and returns false when there is none. A step that quietly measured a city
    // frame under the label "street" would be the worst kind of wrong number,
    // so the failure is carried into the row.
    if (view.mode !== "street") entered = renderer.enterStreet() !== false;
  } else {
    if (view.mode === "street") renderer.leaveStreet(step.mode);
    else session.setProjection(step.mode);
    view.span = step.span;
    view.pitch = step.pitch * (Math.PI / 180);
    applyZoom(view, view.aspect);
    applyPose(view);
  }
  return { session, entered };
}

async function measure(step, session, play, hold) {
  const posed = await poseFor(step, session, play, hold);
  session = posed.session;
  const { renderer } = session;
  // `?perfHold` shortens a gate's run; a gate that then spent eight seconds
  // settling per step would have saved nothing.
  const bake = await settle(renderer, WARMUP_MIN, hold > 0 ? 2 : WARMUP_MAX);

  let walkedM = 0;
  const frames = step.walkM > 0
    ? await Promise.all([sampleFrames(step.seconds), walkFor(renderer, step.seconds, step.walkM)])
      .then(([deltas, metres]) => { walkedM = metres; return deltas; })
    : await sampleFrames(step.seconds);

  const sorted = frames.slice().sort((a, b) => a - b);
  const s = renderer.stats;
  return {
    session,
    row: {
      step: stepLabel(step),
      frames: frames.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      worst: percentile(sorted, 1),
      triangles: s.triangles,
      estimate: s.estimate,
      budget: s.budget,
      drawCalls: s.drawCalls,
      overBudget: s.overBudget === true,
      lod: s.lod,
      given: (s.given ?? []).join(",") || "none",
      streets: s.streets,
      // Q66: one unculled mesh for the whole map, two triangles a tile. On a
      // 96-tile river map that is 2% of the High budget; the question is what it
      // is on 256.
      waterTiles: s.waterTiles,
      waterTriangles: (s.waterTiles ?? 0) * 2,
      bakedChunks: bake.chunks,
      worstBakeMs: Math.round(bake.worstMs * 10) / 10,
      settleS: bake.settleS,
      ...(bake.settled ? {} : { settled: false }),
      cars: s.cars,
      peds: s.peds,
      ...(posed.entered ? {} : { entered: false }),
      ...(step.walkM > 0 ? { walkedM, wantedM: step.walkM } : {}),
    },
  };
}

/** What the device is, as far as a browser will say. `deviceClass()` is the
 * same function the lobby uses to recommend a map size, so a card that
 * disagrees with the advice the player was given is itself a finding. */
/** Which build this is, without a build step: `client/precache.json`'s version
 * is the hash of every file the game is made of, and the service worker already
 * uses it for exactly this. A card with no build on it cannot be compared to
 * anything later, and D2 asks for the identity in the file. */
async function buildId() {
  try {
    const response = await fetch("./client/precache.json", { cache: "no-store" });
    return (await response.json()).version;
  } catch {
    return "unknown";
  }
}

function machine(session) {
  const screen = globalThis.screen;
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: globalThis.devicePixelRatio,
    deviceClass: deviceClass(),
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    deviceMemory: navigator.deviceMemory ?? 0,
    screen: screen ? `${screen.width}x${screen.height}` : "unknown",
    viewport: `${globalThis.innerWidth}x${globalThis.innerHeight}`,
    tier: session.renderer.tier,
    style: session.style,
    reducedMotion: document.documentElement.dataset.motion === "reduced",
  };
}

/** A strip while measuring, the whole screen when done.
 *
 * Not cosmetic: an opaque panel over the canvas is a different compositing path
 * from the one a player is on, and a sweep that measured a hidden canvas would
 * be measuring its own overlay. The city stays visible until the numbers are
 * in. */
const STRIP = "position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:30vh;overflow:auto;";
const FULL = "position:fixed;inset:0;z-index:9999;overflow:auto;";
const SKIN = "background:#0d1117;color:#e6edf3;font:12px/1.45 ui-monospace,monospace;padding:16px";

function panel() {
  const box = document.createElement("div");
  box.id = "perf-card";
  box.setAttribute("style", STRIP + SKIN);
  box.innerHTML = '<h1 style="font-size:15px;margin:0 0 8px">City Grid — performance card</h1>'
    + '<p id="perf-note" style="margin:0 0 10px;max-width:70ch">Measuring. Do not touch the screen '
    + 'until this says it is done — a finger on the canvas is a frame this is trying to time.</p>'
    + '<button id="perf-copy" style="font:inherit;padding:6px 12px;margin-bottom:10px" hidden>Copy</button>'
    + '<pre id="perf-json" style="white-space:pre-wrap;margin:0"></pre>';
  document.body.appendChild(box);
  return box;
}

export async function runPerfCard({ play, hold, map: wanted }) {
  const map = MAPS.find((m) => m.id === wanted) ?? MAPS[0];
  const { saturatedCity } = await import("../../tools/lib/saturated.mjs");
  const box = panel();
  const note = box.querySelector("#perf-note");
  const out = box.querySelector("#perf-json");
  const copy = box.querySelector("#perf-copy");

  const rows = [];
  let session;
  try {
    // The fixture every other gate measures on, and the same recipe — a second
    // copy of it would be a second chance to measure a different place from the
    // one the card claims (`tools/lib/saturated.mjs`).
    // Opened in the first step's style, or step 1 would immediately throw the
    // renderer away and build another.
    session = await begin(
      saturatedCity({ size: map.size, terrain: map.terrain, traffic: TRAFFIC }).state,
      SWEEP[0].style, play,
    );

    for (const step of SWEEP) {
      note.textContent = `Measuring ${stepLabel(step)} — ${rows.length + 1} of ${SWEEP.length}. `
        + "Do not touch the screen.";
      const seconds = hold > 0 ? hold : step.seconds;
      const result = await measure({ ...step, seconds }, session, play, hold);
      session = result.session;
      rows.push(result.row);
      out.textContent = JSON.stringify(rows, undefined, 1);
    }
  } catch (error) {
    // A card that stops updating looks exactly like a card that is still
    // measuring, and the first run of this sweep sat on "Measuring" for a
    // hundred seconds with a thrown TypeError behind it. Say so, on the page.
    box.setAttribute("style", FULL + SKIN);
    note.textContent = `Failed after ${rows.length} of ${SWEEP.length} steps — ${error.message}`;
    out.textContent = `${error.stack ?? error.message}\n\n${JSON.stringify(rows, undefined, 1)}`;
    throw error;
  }

  const card = {
    kind: "citygrid-perf-card",
    version: 1,
    date: new Date().toISOString(),
    map: map.id,
    fixture: `saturated ${map.size}x${map.size} ${map.terrain}, seed 1003, 400 ticks, `
      + `commuter load ${TRAFFIC}`,
    simulation: "paused for the sweep",
    build: await buildId(),
    machine: machine(session),
    steps: rows,
  };
  const text = JSON.stringify(card, undefined, 1);
  box.setAttribute("style", FULL + SKIN);
  out.textContent = text;
  note.textContent = "Done. Press Copy and paste it into the issue or the chat. "
    + "Nothing has been sent anywhere.";
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    copy.textContent = "Copied";
  });
  globalThis.PERF_CARD = card;
  return card;
}
