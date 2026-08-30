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
const game = `${base}?seed=1003&size=64`;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const pageErrors = [];
const started = (page) => page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(game);
  await started(page);
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
