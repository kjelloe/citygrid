// Slice 4.5's accessibility gate: "keyboard-only and 200%-text passes".
//
// Both were in `plan-v1.md` from the start and neither had ever been measured.
// The keyboard half was worse than unmeasured — four rows carried
// `role="toolbar"`, which announces one tab stop and arrow-key navigation, and
// had neither. A promise assistive technology repeats is worse than an absence.
//
// 200% text is emulated by doubling the root font size. Every length in
// `style.css` that should scale is in `rem`, so that is exactly what a browser's
// text-size setting does — and the `px` that remain (touch targets, hairlines,
// swatches) are the ones that must NOT scale.
//
//   node tools/a11y_smoke.mjs

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

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;
// `lock=0`: Playwright cannot drive a page that has taken the pointer, and
// this gate presses F and C (K3, A58). The locked path has its own pass in
// `play_smoke`.
const game = `${base}?seed=1003&size=64&lock=0`;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const pageErrors = [];
/** Waits for the city, then puts the first-run controls card away.
 *
 * In the helper rather than after each `goto`: this gate opens the game four
 * times and the card was dismissed on one of them, so the other three met a
 * dialog sitting over the interface they were about to click (K3, A58). */
const started = async (page) => {
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await page.evaluate(() => document.querySelector("#controls-dismiss")?.click());
};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  await page.goto(game);
  try { await started(page); } catch (e) {
    throw new Error(`the page never became ready:\n  ${pageErrors.join("\n  ") || String(e)}`);
  }
  await page.evaluate(() => globalThis.CITY.pause());

  // --- a toolbar is one tab stop -------------------------------------------
  const tabStops = await page.evaluate(() =>
    [...document.querySelectorAll('[role="toolbar"]')].map((bar) => ({
      label: bar.getAttribute("aria-label"),
      buttons: bar.querySelectorAll("button").length,
      stops: [...bar.querySelectorAll("button")].filter((b) => b.tabIndex === 0).length,
    })));
  check("every toolbar exposes exactly one tab stop",
    tabStops.length > 0 && tabStops.every((b) => b.stops === 1),
    tabStops.map((b) => `${b.label}: ${b.stops} of ${b.buttons}`).join(", "));

  // --- the arrows move within it -------------------------------------------
  await page.focus('#tools button[data-id="road"]');
  const walk = [];
  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home"]) {
    await page.keyboard.press(key);
    walk.push(await page.evaluate(() => document.activeElement?.dataset.id ?? document.activeElement?.tagName));
  }
  check("the arrows move along a toolbar, and Home and End jump",
    new Set(walk).size > 1 && walk[0] !== walk[1] && walk[4] !== walk[3], walk.join(" → "));

  const wrapped = await page.evaluate(() => {
    const bar = document.querySelector("#tools");
    const buttons = [...bar.querySelectorAll("button")];
    buttons[buttons.length - 1].focus();
    return buttons.length;
  });
  await page.keyboard.press("ArrowRight");
  const afterWrap = await page.evaluate(() => document.activeElement?.dataset.id);
  const first = await page.evaluate(() => document.querySelector("#tools button")?.dataset.id);
  check("the arrows wrap rather than dead-ending", afterWrap === first,
    `${wrapped} buttons, last → ${afterWrap}, first is ${first}`);

  // --- the tab stop follows you --------------------------------------------
  const remembered = await page.evaluate(() => {
    const bar = document.querySelector("#tools");
    return [...bar.querySelectorAll("button")].filter((b) => b.tabIndex === 0)[0]?.dataset.id;
  });
  check("the toolbar remembers where you were", remembered === first, String(remembered));

  // --- shortcuts ------------------------------------------------------------
  await page.evaluate(() => document.getElementById("city").focus());
  const shortcuts = {};
  for (const [key, expected] of [["r", "road"], ["w", "wire"], ["p", "pipe"], ["b", "bulldoze"],
    ["1", "zoneResidential"], ["2", "zoneCommercial"], ["3", "zoneIndustrial"], ["0", "dezone"]]) {
    await page.keyboard.press(key);
    shortcuts[key] = await page.evaluate(() => globalThis.CITY.controller.tool);
    await page.keyboard.press("Escape");
    if (shortcuts[key] !== expected) shortcuts[key] += ` (wanted ${expected})`;
  }
  const wrongKeys = Object.entries(shortcuts).filter(([, v]) => v.includes("wanted"));
  check("every frequent tool has a shortcut that selects it", wrongKeys.length === 0,
    wrongKeys.length ? JSON.stringify(shortcuts) : Object.keys(shortcuts).join(" "));

  // --- the map pans by keyboard, and ONLY from the map ---------------------
  const panned = await page.evaluate(async () => {
    document.getElementById("city").focus();
    const before = { x: globalThis.CITY.renderer.view.targetX, y: globalThis.CITY.renderer.view.targetZ };
    return before;
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const moved = await page.evaluate(() => ({
    x: globalThis.CITY.renderer.view.targetX, y: globalThis.CITY.renderer.view.targetZ,
  }));
  check("the arrows pan the map when the map has focus",
    moved.x !== panned.x || moved.y !== panned.y,
    `(${panned.x.toFixed(1)}, ${panned.y.toFixed(1)}) → (${moved.x.toFixed(1)}, ${moved.y.toFixed(1)})`);

  // The overlay list is in a drawer now; open it before focusing inside it.
  await page.click("#rail-overlays");
  await page.focus('.hud-overlays button[data-overlay="power"]');
  const beforeToolbarArrow = await page.evaluate(() => globalThis.CITY.renderer.view.targetX);
  await page.keyboard.press("ArrowRight");
  const afterToolbarArrow = await page.evaluate(() => globalThis.CITY.renderer.view.targetX);
  check("the arrows do NOT pan the map from inside a toolbar",
    beforeToolbarArrow === afterToolbarArrow,
    `${beforeToolbarArrow.toFixed(2)} → ${afterToolbarArrow.toFixed(2)}`);

  // --- the map is announced -------------------------------------------------
  const canvas = await page.evaluate(() => {
    const c = document.getElementById("city");
    return { tabIndex: c.tabIndex, label: c.getAttribute("aria-label"), role: c.getAttribute("role") };
  });
  check("the map is focusable and labelled",
    canvas.tabIndex === 0 && (canvas.label ?? "").length > 0 && !(canvas.label ?? "").includes("."),
    JSON.stringify(canvas));

  // --- a keyboard-only player can build ------------------------------------
  //
  // The whole point, and the thing the checks above only imply.
  const built = await page.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const c = await import("/engine/commands.js");
    globalThis.CITY.state.players[0].treasury = 500000;
    let roads = 0;
    for (let i = 0; i < globalThis.CITY.state.tiles.road.length; i += 1) {
      if (globalThis.CITY.state.tiles.road[i] & 16) roads += 1;
    }
    return roads;
  });
  await page.evaluate(() => document.getElementById("city").focus());
  await page.keyboard.press("r");
  const toolAfterKey = await page.evaluate(() => globalThis.CITY.controller.tool);
  check("a keyboard-only player can select a tool without touching a pointer",
    toolAfterKey === "road", `${built} roads before, tool is ${toolAfterKey}`);
  await page.keyboard.press("Escape");

  // --- audio (slice 4.4) ----------------------------------------------------
  //
  // A browser leaves an AudioContext suspended until a real gesture, so the
  // check is "does it run AFTER one", not "does it exist".
  //
  // On its OWN page: by this point in the run the main one has been clicked
  // and typed at dozens of times, so "has not been interacted with" is not
  // true of it and the check would pass or fail for the wrong reason.
  const fresh = await context.newPage();
  fresh.on("pageerror", (e) => pageErrors.push(`audio: ${e.message}`));
  await fresh.goto(game);
  await started(fresh);
  const beforeGesture = await fresh.evaluate(() => globalThis.CITY.audio.running);
  await fresh.mouse.click(640, 300);
  const audio = await fresh.evaluate(() => ({
    running: globalThis.CITY.audio.running,
    voices: globalThis.CITY.audio.voices,
  }));
  check("the mixer stays silent until the player has interacted",
    beforeGesture === false, `running before a gesture: ${beforeGesture}`);
  check("the mixer runs after a gesture", audio.running === true, JSON.stringify(audio));
  await fresh.close();

  const muted = await page.evaluate(async () => {
    const { cuesFor } = await import("/client/audio/audio-model.js");
    globalThis.CITY.setAudioSettings({ sound: false, volumeMaster: 100, volumeEffects: 100, volumeAmbience: 100 });
    const played = globalThis.CITY.audio.play(cuesFor([{ kind: "fireStarted" }])[0]);
    globalThis.CITY.setAudioSettings({ sound: true, volumeMaster: 100, volumeEffects: 70, volumeAmbience: 35 });
    return played;
  });
  check("muting reaches the mixer", muted === false, `play() returned ${muted}`);

  // --- high contrast and skins must CHANGE something -------------------------
  //
  // `lobby_smoke` checks that `data-contrast` reaches the document. That was
  // the whole check for two slices, while 61 rules used the system colours
  // `Canvas`/`CanvasText`, which `--bg`/`--fg` cannot touch — so high contrast
  // set an attribute and repainted almost nothing (P30). Measuring the part
  // instead of the whole, again.
  const repaint = await page.evaluate(() => {
    const root = document.documentElement;
    const sample = () => {
      const bar = getComputedStyle(document.querySelector(".hud-bottom"));
      const button = getComputedStyle(document.querySelector("#tools button"));
      return [bar.backgroundColor, button.backgroundColor, button.color, button.borderTopColor].join("|");
    };
    root.removeAttribute("data-contrast");
    root.removeAttribute("data-skin");
    const plain = sample();
    root.dataset.contrast = "high";
    const high = sample();
    root.removeAttribute("data-contrast");
    root.dataset.skin = "dark";
    const dark = sample();
    root.dataset.skin = "retro";
    const retro = sample();
    root.removeAttribute("data-skin");
    return { plain, high, dark, retro };
  });
  check("high contrast actually changes the interface's colours",
    repaint.plain !== repaint.high, `${repaint.plain} -> ${repaint.high}`);
  check("each skin actually repaints the interface",
    new Set([repaint.plain, repaint.dark, repaint.retro]).size === 3,
    JSON.stringify({ clean: repaint.plain, dark: repaint.dark, retro: repaint.retro }));

  // --- the overlays are still readable at night (slice E6) -------------------
  //
  // Night dims the whole city and the overlays are how a player with poor
  // colour vision reads it. An overlay wash that is legible at noon and a mush
  // at midnight is an accessibility regression with no error attached to it.
  //
  // Measured as the DISTANCE between adjacent bands in 8-bit RGB, not as a
  // luminance contrast ratio. These four are told apart by hue as much as by
  // brightness — green, amber, red, grey — and their worst adjacent luminance
  // ratio is 1.29 in broad daylight, so a contrast-ratio threshold would either
  // fail the palette the game has always shipped or be set so low it proved
  // nothing. What night actually does is scale every channel by the
  // hemisphere's intensity, so the question is whether what is left is still
  // above the level at which two flat washes read as one.
  const overlaySeparation = await page.evaluate(async () => {
    const { OVERLAY_COLOURS } = await import("/client/render/palette.js");
    const { presetFor } = await import("/client/render/time-of-day.js");
    const dim = (hex, k) => [16, 8, 0].map((shift) => Math.round(Math.min(255, ((hex >> shift) & 255) * k)));
    const out = {};
    for (const hour of ["day", "night"]) {
      const k = hour === "day" ? 1 : Math.max(presetFor(hour).hemi, 0.2);
      const gaps = [];
      for (let i = 1; i < OVERLAY_COLOURS.length; i += 1) {
        const a = dim(OVERLAY_COLOURS[i], k);
        const b = dim(OVERLAY_COLOURS[i - 1], k);
        gaps.push(Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
      }
      out[hour] = gaps;
    }
    return out;
  });
  const worstDay = Math.min(...overlaySeparation.day);
  const worstNight = Math.min(...overlaySeparation.night);
  console.log(`      overlay bands: nearest pair ${worstDay} apart by day, ${worstNight} at night (of 441)`);
  // Thirty is about where two large flat areas stop reading as two. Measured:
  // 122 by day and 41 at night, so there is room, and the number is here to
  // notice a palette or a preset that eats it.
  check("the overlay bands are told apart by day", worstDay >= 30, `nearest pair ${worstDay} apart`);
  check("and still at night", worstNight >= 30, `nearest pair ${worstNight} apart`);

  // --- the wash is on the GROUND now, so a slope shades it (slice V7) --------
  //
  // The check above is arithmetic on the palette, and it was enough while the
  // overlay was a flat unlit quad floating over the tile. Ruling 041 put the
  // wash INSIDE the terrain material, mixed into the diffuse colour before the
  // light touches it — so a hillside facing away from the sun now dims the
  // bands as well as the grass, and the palette's separation is an upper bound
  // rather than what the player sees.
  //
  // Measured on rendered pixels, on `hilly`, at a low pitch, which is where the
  // shading spread is widest. `?pollute=` puts the whole map in one band while
  // changing nothing that is drawn, so three shots of one city differ ONLY in
  // the wash and the distance between them is the wash's own separation.
  const washPixels = async (pollute) => {
    const shotContext = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const shot = await shotContext.newPage();
    // A shoot page that throws otherwise looks exactly like a slow one (V6).
    shot.on("pageerror", (error) => console.log(`      shoot page error: ${error.message}`));
    shot.on("console", (msg) => { if (msg.type() === "error") console.log(`      shoot console: ${msg.text()}`); });
    await shot.goto(`http://127.0.0.1:${port}/tools/shoot.html`
      // `years=0`: bare hillside, no city. What this measures is the WASH under
      // shading, and a city is only the thing standing in front of it — but the
      // sample is the ground pixels a city leaves visible, so every slice that
      // changes how much ground a city covers moves the number. It has happened
      // twice: S1's civic footprints freed ground and took the fifth percentile
      // 31 → 29, and B1a's fire stations covered ground and took the median
      // 67 → 58 (2,212 washed pixels → 1,935) with the shader untouched. On bare
      // ground the sample is the hillside itself, which is what the check is about.
      + `?seed=1003&size=48&years=0&terrain=hilly&pitch=16&mode=city&span=14`
      + `&overlay=pollution&pollute=${pollute}&frames=6&life=0`);
    await shot.waitForFunction(() => globalThis.SHOT_REPORT !== undefined, undefined, { timeout: 120000 });
    const pixels = await shot.evaluate(() => {
      const gl = document.getElementById("city");
      const flat = document.createElement("canvas");
      flat.width = gl.width;
      flat.height = gl.height;
      flat.getContext("2d").drawImage(gl, 0, 0);
      const data = flat.getContext("2d").getImageData(0, 0, flat.width, flat.height).data;
      // A fixed lattice, so the three shots sample the same points.
      const out = [];
      for (let y = 8; y < flat.height; y += 7) {
        for (let x = 8; x < flat.width; x += 7) {
          const i = (y * flat.width + x) * 4;
          out.push([data[i], data[i + 1], data[i + 2]]);
        }
      }
      return out;
    });
    await shotContext.close();
    return pixels;
  };
  // 0 clean, 100 hazy, 200 foul — either side of the 60/150 thresholds.
  const washes = [];
  for (const value of [0, 100, 200]) washes.push(await washPixels(value));
  const gaps = [];
  for (let b = 1; b < washes.length; b += 1) {
    const distances = [];
    for (let i = 0; i < washes[b].length; i += 1) {
      const [r1, g1, b1] = washes[b][i];
      const [r0, g0, b0] = washes[b - 1][i];
      const d = Math.hypot(r1 - r0, g1 - g0, b1 - b0);
      // Only pixels the wash actually reaches: sky, water and rooftops are the
      // same in all three shots and would drag a mean to zero.
      if (d > 1) distances.push(d);
    }
    distances.sort((a, c) => a - c);
    gaps.push({
      lit: distances.length,
      worst: Math.round(distances[Math.floor(distances.length * 0.05)] ?? 0),
      median: Math.round(distances[Math.floor(distances.length / 2)] ?? 0),
    });
  }
  for (const [i, gap] of gaps.entries()) {
    console.log(`      band ${i} to ${i + 1} on a hillside: ${gap.median} apart at the median, `
      + `${gap.worst} in the darkest twentieth (${gap.lit} washed pixels)`);
  }
  check("the wash reaches the ground at all", gaps.every((g) => g.lit > 200),
    gaps.map((g) => g.lit).join(", "));
  // The FLOORS are re-derived on bare ground (B1a). Thirty is where two flat
  // washes read as one — the palette check above says so and uses it — and the
  // hillside is the same question after shading, so 45 is that limit with room
  // for the slope. The old floor was 60, which was simply above whatever a
  // 20-year city on this seed happened to leave visible: measured on bare
  // hillside the medians are 97 and 57, and the same city measured 102/67
  // before B1a and 96/58 after, with the shader untouched in between.
  //
  // TWO statistics, because the tail one moves with something that is not
  // readability. `worst` is the fifth percentile of the separations, so it
  // falls when MORE ground becomes visible — the extra pixels are the ones at
  // the edges of buildings, in shadow, separating least. S1 gave twelve civic
  // definitions their own footprints, several of them smaller than the generic
  // box they replaced: washed pixels went 1,935 → 2,074 and the fifth
  // percentile went 31 → 29, which is more of the city showing its overlay and
  // a lower number saying so. The median is the stable half and is what a
  // player reads the city by; the tail keeps a floor so a genuinely washed-out
  // band still fails.
  check("adjacent bands are told apart on a shaded hillside",
    gaps.every((g) => g.median >= 45), gaps.map((g) => g.median).join(", "));
  check("and the worst twentieth of them is still separated",
    gaps.every((g) => g.worst >= 25), gaps.map((g) => g.worst).join(", "));

  // --- reduced motion reaches the CITY (R2, finding 12) ----------------------
  //
  // Slice 4.5 set `data-motion="reduced"` on the document and nothing in the
  // renderer read it: a player who asked for stillness got streaming traffic
  // and a sun that cycled. Nothing throws; it is simply ignored.
  // A road with traffic on it, so the two pages have something to differ about:
  // a check whose baseline is also zero is a check that cannot fail.
  const seedTraffic = async (target) => target.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const C = await import("/engine/commands.js");
    await import("/engine/build-commands.js");
    const state = globalThis.CITY.state;
    const W = state.width;
    apply(state, { type: C.CMD_PLACE_ROAD, actor: 1, runs: [Math.round(W / 2) * W + 4, W - 8] });
    for (let i = 0; i < state.tiles.road.length; i += 1) {
      if (state.tiles.road[i] & 16) state.tiles.traffic[i] = 200;
    }
    globalThis.CITY.renderer.worldChanged();
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 40; i += 1) await frame();
    return globalThis.CITY.renderer.traffic.count();
  });
  const moving = await seedTraffic(page);
  check("the reduced-motion check has a baseline to compare against",
    moving > 0, `${moving} cars on a page with no preference set`);
  const stillContext = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: "reduce" });
  const stillPage = await stillContext.newPage();
  stillPage.on("pageerror", (error) => problems.push(`motion: ${error.message}`));
  await stillPage.goto(`http://127.0.0.1:${port}/index.html?seed=1003&size=48&lock=0`);
  await started(stillPage);
  const stillCars = await seedTraffic(stillPage);
  const still = await stillPage.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const at = () => globalThis.CITY.renderer.traffic.cars().map((c) => `${c.link}:${c.s.toFixed(4)}`).join("|");
    const before = at();
    for (let i = 0; i < 30; i += 1) await frame();
    const after = at();
    globalThis.CITY.setTime("auto");
    return {
      motion: document.documentElement.dataset.motion,
      time: globalThis.CITY.time,
      moved: before !== after,
      cars: globalThis.CITY.renderer.traffic.count(),
    };
  });
  await stillContext.close();
  check("reduced motion is picked up", still.motion === "reduced", `data-motion is "${still.motion}"`);
  // NOTHING MOVES, rather than nothing is there: `life: false` settles the
  // traffic and stops the clock, which is what a still street looks like — an
  // empty road is a different city, not a calmer one (R2, deviating from the
  // review's "car count is 0").
  check("and nothing on it moves", still.moved === false,
    `the cars moved over thirty frames (${still.cars} of them, ${moving} on a page without the preference)`);
  check("and refuses a cycling sun", still.time === "day", `the hour is "${still.time}"`);

  // --- the settings dialog is a real modal ----------------------------------
  await page.click("#settings");
  await page.waitForSelector("dialog.settings[open]");
  const focusInside = await page.evaluate(() =>
    document.querySelector("dialog.settings")?.contains(document.activeElement));
  check("opening settings moves focus into the dialog", focusInside === true);
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => document.querySelector("dialog.settings[open]") === null);
  check("Escape closes the settings dialog", closed);

  // Keys must not reach the map while a modal is up.
  await page.click("#settings");
  await page.waitForSelector("dialog.settings[open]");
  const beforeModal = await page.evaluate(() => globalThis.CITY.controller.tool);
  await page.keyboard.press("r");
  const afterModal = await page.evaluate(() => globalThis.CITY.controller.tool);
  check("a shortcut does not reach the map through an open dialog",
    beforeModal === afterModal, `${beforeModal} → ${afterModal}`);
  await page.keyboard.press("Escape");

  // --- 200% text ------------------------------------------------------------
  for (const [where, url] of [["the game", game], ["the new-game screen", base]]) {
    for (const [size, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
      const big = await browser.newContext({ viewport });
      const bigPage = await big.newPage();
      bigPage.on("pageerror", (e) => pageErrors.push(`200%: ${e.message}`));
      await bigPage.goto(url);
      if (url === game) await started(bigPage);
      else await bigPage.waitForSelector(".lobby");
      await bigPage.addStyleTag({ content: "html { font-size: 200% }" });
      await bigPage.waitForTimeout(200);

      const overflow = await bigPage.evaluate(() => ({
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        // Text cut off by a container that cannot grow. Scrolling containers are
        // fine — that is the design; clipped ones are not.
        clipped: [...document.querySelectorAll("button, h1, h2, dt, dd, li, label, output, .region-name, .region-facts")]
          .filter((n) => {
            const style = getComputedStyle(n);
            if (style.overflow === "auto" || style.overflowX === "auto") return false;
            return n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2;
          })
          .map((n) => `${n.className || n.tagName}:"${(n.textContent ?? "").slice(0, 24)}"`)
          .slice(0, 6),
      }));
      check(`200% text · ${where} · ${size}: no sideways scroll`, !overflow.sideways);
      check(`200% text · ${where} · ${size}: no text is clipped`,
        overflow.clipped.length === 0, overflow.clipped.join(" | "));

      if (url === game) {
        // The minimap sits above the panel, and the panel is taller at 200%.
        // A minimap pushed off the top of the screen is a minimap that is gone.
        const map = await bigPage.evaluate(() => {
          const box = document.querySelector(".hud-minimap");
          if (!box) return { missing: true };
          const r = box.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: window.innerHeight,
            shown: getComputedStyle(box).display !== "none" };
        });
        check(`200% text · ${size}: the minimap is still on screen`,
          map.missing || !map.shown || (map.top >= 0 && map.bottom <= map.height),
          map.missing ? "no minimap" : `${map.top}..${map.bottom} of ${map.height}${map.shown ? "" : " (hidden on phone)"}`);

        // The tallest scrolling dialog in the game, at the largest text.
        await bigPage.click("#statistics");
        await bigPage.waitForSelector("dialog.stats[open]", { timeout: 10000 });
        const dialog = await bigPage.evaluate(() => {
          const d = document.querySelector("dialog.stats");
          const r = d.getBoundingClientRect();
          const clipped = [...d.querySelectorAll("h1, h2, p, button, span")]
            .filter((n) => getComputedStyle(n).overflow !== "auto"
              && (n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2))
            .map((n) => `${n.className || n.tagName}:"${(n.textContent ?? "").slice(0, 20)}"`);
          return {
            insideViewport: r.left >= -1 && r.right <= window.innerWidth + 1,
            scrollable: d.scrollHeight > d.clientHeight,
            reachable: d.querySelector("#stats-close") !== null,
            clipped: clipped.slice(0, 4),
          };
        });
        check(`200% text · ${size}: the statistics screen fits and scrolls`,
          dialog.insideViewport && dialog.reachable, JSON.stringify(dialog));
        check(`200% text · ${size}: no statistic is clipped`,
          dialog.clipped.length === 0, dialog.clipped.join(" | "));
        await bigPage.keyboard.press("Escape");
      }
      await big.close();
    }
  }

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\naccessibility smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
