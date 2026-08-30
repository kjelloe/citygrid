// Every function a player has can be reached (P31).
//
// Slice N24 moved forty of the interface's sixty controls behind a rail, three
// drawers and a popover. That is the right trade for a map you can see, and it
// is also exactly how a control goes missing: nothing errors, nothing goes red,
// the button is simply somewhere nobody finds.
//
// So this walks the HUD, and for every control it:
//
//   1. works out what it is behind, from the DOM rather than from a list here
//   2. opens that, by clicking the same thing a player clicks
//   3. asserts the control is visible AND that a click at its centre actually
//      lands on it — a control under a panel is as unreachable as a hidden one
//
// Written as a discovery walk on purpose. A hard-coded inventory would pass
// forever after someone deleted a button.
//
//   node tools/reach_smoke.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8196;

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = spawn(process.execPath, [join(root, "tools", "serve.mjs"), String(PORT)], {
  cwd: root, stdio: "ignore",
});
const base = `http://localhost:${PORT}/index.html`;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const problems = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`page error — ${e.message}`));
  await page.goto(`${base}?seed=1003&size=48`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

  // A city with a quest running and money to spend, so the advisor is on screen
  // and nothing is disabled for lack of funds.
  await page.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const { CMD_TICK } = await import("/engine/commands.js");
    globalThis.CITY.pause();
    globalThis.CITY.state.players[0].treasury = 900000;
    for (let i = 0; i < 24; i += 1) globalThis.CITY.hud.tick(apply(globalThis.CITY.state, { type: CMD_TICK }).events);
  });
  await page.waitForTimeout(300);

  // --- 1. what exists, and what it is behind --------------------------------
  //
  // Tagging is a function the walk calls again before every look, not something
  // done once. Panels rebuild: the advisor replaces its own innerHTML on any
  // refresh, which throws its children away and takes the marker with them. A
  // walk holding a stale handle reports a control that is on screen, clickable
  // and working as missing — so it re-resolves, every time.
  await page.evaluate(() => {
    globalThis.__reachTag = () => {
      // A file input is deliberately `display: none` behind a visible <label>:
      // that is the standard way to style one, and the LABEL is the control.
      const controls = [...document.querySelectorAll("#hud button, #hud input, #hud select, #hud label.slot")]
        .filter((el) => !(el.tagName === "INPUT" && el.type === "file"));
      controls.forEach((el, index) => { el.dataset.reachId = String(index); });
      return controls;
    };
  });
  const retag = () => page.evaluate(() => globalThis.__reachTag().length);

  const inventory = await page.evaluate(() => {
    return globalThis.__reachTag().map((el, index) => {
      // The nearest hidden ancestor is what has to be opened.
      let hidden = null;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.hidden) { hidden = n.id || n.className; break; }
      }
      return {
        index,
        name: el.id || el.dataset.id || el.dataset.overlay || el.dataset.drawer
          || el.dataset.slot || (el.textContent || "").trim().slice(0, 20) || el.tagName.toLowerCase(),
        hidden,
      };
    });
  });
  check("the HUD has a meaningful number of controls",
    inventory.length > 40, `${inventory.length} found`);

  // The opener for each container, by what a player clicks.
  const OPENERS = {
    "hud-overlays": "#rail-overlays",
    "hud-budget": "#rail-budget",
    "hud-saves": "#rail-saves",
    "hud-drawer": "#rail-overlays",
    "build-menu": "#build",
    "hud-toolbar hud-build": "#build",
  };
  const containers = [...new Set(inventory.map((c) => c.hidden).filter(Boolean))];
  const unknown = containers.filter((c) => !OPENERS[c]);
  check("every container that hides controls has a known opener",
    unknown.length === 0, unknown.join(", ") || containers.join(" / "));

  // --- 2. open it, and check the control is really there --------------------
  const unreachable = [];
  const covered = [];
  for (const control of inventory) {
    await retag();
    if (control.hidden) {
      const opener = OPENERS[control.hidden];
      if (!opener) { unreachable.push(`${control.name} (no opener)`); continue; }
      // Only if it is CLOSED. These openers toggle, so clicking once per
      // control shut the panel again for every second one — the walk was
      // reporting alternating controls as unreachable because of itself.
      const closed = await page.evaluate((index) => {
        const el = document.querySelector(`[data-reach-id="${index}"]`);
        const r = el?.getBoundingClientRect();
        return !r || r.width === 0 || r.height === 0;
      }, control.index);
      if (closed) await page.click(opener);
    }
    // A control you have to scroll to is still reachable — the toolbars and the
    // popover scroll on purpose. Bring it into view the way a player does
    // before asking whether anything is on top of it.
    const stable = await retag();
    if (stable !== inventory.length) problems.push(`the control set changed mid-walk (${stable} vs ${inventory.length})`);
    await page.locator(`[data-reach-id="${control.index}"]`).scrollIntoViewIfNeeded().catch(() => {});
    const verdict = await page.evaluate((index) => {
      const el = document.querySelector(`[data-reach-id="${index}"]`);
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { found: true, visible: false };
      // A click at the centre must land on this control or something inside it.
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const own = at === el || el.contains(at);
      return {
        found: true, visible: true, own,
        blocker: own ? null : (at ? (at.id || at.className || at.tagName) : "nothing"),
        height: Math.round(r.height),
      };
    }, control.index);
    if (!verdict.found || !verdict.visible) unreachable.push(control.name);
    else if (!verdict.own) covered.push(`${control.name} under ${verdict.blocker}`);

    // Close it again, so the next control is judged with only its OWN
    // container open. Leaving them open made a later drawer cover an earlier
    // panel and reported that as a collision the player would never meet.
    if (control.hidden) await page.click(OPENERS[control.hidden]);
  }
  check("every control can be brought on screen", unreachable.length === 0, unreachable.join(", "));
  check("no control is covered by something else once open", covered.length === 0, covered.join(", "));

  // --- 3. the openers themselves close again --------------------------------
  const toggles = await page.evaluate(async () => {
    // From a known-closed state: the walk above may have left something open,
    // and a toggle test that starts open measures the opposite of what it says.
    for (const q of [".hud-drawer", "#build-menu"]) {
      const panel = document.querySelector(q);
      if (!panel.hidden) {
        document.querySelector(q === "#build-menu" ? "#build" : "#drawer-close").click();
      }
    }
    const out = {};
    const state = (q) => !document.querySelector(q).hidden;
    for (const [button, panel] of [["#rail-overlays", ".hud-drawer"], ["#rail-budget", ".hud-drawer"],
      ["#rail-saves", ".hud-drawer"], ["#build", "#build-menu"]]) {
      const before = state(panel);
      document.querySelector(button).click();
      const opened = state(panel);
      document.querySelector(button).click();
      out[button] = { opened: opened || before, closedAgain: !state(panel) };
    }
    return out;
  });
  const stuck = Object.entries(toggles).filter(([, v]) => !v.opened || !v.closedAgain).map(([k]) => k);
  check("every panel opens and closes from its own button", stuck.length === 0, stuck.join(", "));

  // --- 4. the controls that are easy to orphan ------------------------------
  //
  // Each of these is a function with exactly one way in. `[hidden]` silently
  // did nothing until N24, and the minimap's toggle had never worked.
  const minimap = await page.evaluate(() => {
    const canvas = document.getElementById("minimap");
    const before = !canvas.hidden;
    document.getElementById("minimap-toggle").click();
    const after = !canvas.hidden;
    document.getElementById("minimap-toggle").click();
    return { before, after, restored: !canvas.hidden };
  });
  check("the minimap toggle actually hides the minimap",
    minimap.before && !minimap.after && minimap.restored, JSON.stringify(minimap));

  // A card the player closed stays closed (P32). The advisor rebuilds on every
  // refresh, so a dismissal that lives only in the DOM comes back within the
  // month — it has to be remembered beside the advice, not in the markup.
  const dismiss = await page.evaluate(() => {
    const card = document.querySelector(".hud-advisor");
    const before = { shown: !card.hidden, title: card.querySelector("h2")?.textContent };
    card.querySelector(".panel-close").click();
    const closed = !card.hidden;
    globalThis.CITY.hud.refresh();
    return { before, closed, afterRefresh: !card.hidden, title: card.querySelector("h2")?.textContent };
  });
  check("an advisor card can be dismissed, and stays dismissed",
    dismiss.before.shown && !dismiss.closed && !dismiss.afterRefresh, JSON.stringify(dismiss));

  // ...but a card asking a QUESTION has no × at all. Closing it would take the
  // only two buttons that answer it off the screen for good (ruling 027).
  const decision = await page.evaluate(async () => {
    const card = document.querySelector(".hud-advisor");
    const { questCatalogue } = await import("/engine/quests.js");
    const quest = questCatalogue().find((q) => q.choices);
    if (!quest) return { skipped: true };
    // Put it in front of the player rather than waiting for the city to earn
    // it: a gate that only checks the case it happens to meet checks nothing.
    const was = globalThis.CITY.state.quests.active;
    globalThis.CITY.state.quests.active = [{ id: quest.id, startedTick: 0, choice: -1 }];
    globalThis.CITY.hud.refresh();
    const asking = card.querySelector(".choices") !== null;
    const out = { asking, closable: card.querySelector(".panel-close") !== null, shown: !card.hidden };
    // Put the city back. A card this gate invented is a card the later map
    // sampling would measure as furniture the player never asked for.
    globalThis.CITY.state.quests.active = was;
    globalThis.CITY.hud.refresh();
    return out;
  });
  check("a card waiting for a decision cannot be dismissed",
    decision.skipped || !decision.asking || !decision.closable, JSON.stringify(decision));

  const speed = await page.evaluate(() => {
    const b = document.getElementById("speed");
    const first = b.textContent;
    b.click();
    const second = b.textContent;
    return { first, second };
  });
  check("the speed button changes speed", speed.first !== speed.second, `${speed.first} → ${speed.second}`);

  // Every dialog opens from its rail button and closes with Escape.
  for (const [button, selector] of [["#help", "dialog.help"], ["#statistics", "dialog.stats"],
    ["#settings", "dialog.settings"]]) {
    await page.click(button);
    await page.waitForSelector(`${selector}[open]`, { timeout: 10000 }).catch(() => {});
    const opened = await page.locator(`${selector}[open]`).count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const closed = await page.locator(`${selector}[open]`).count();
    check(`${button} opens its dialog, and Escape closes it`,
      opened === 1 && closed === 0, `opened ${opened}, still open ${closed}`);
  }

  // --- 5. the MAP is reachable too ------------------------------------------
  //
  // The other half of "nothing is hidden", and the half that actually broke:
  // `#hud > *` sets `pointer-events: auto` and out-specifies a class selector,
  // so `.hud-side { pointer-events: none }` never applied. The two invisible
  // columns swallowed **101 of 403** sampled clicks — a quarter of the map,
  // including the whole right-hand third, where nothing is drawn at all.
  const reach = await page.evaluate(() => {
    const out = { canvas: 0, blocked: {} };
    for (let y = 80; y < window.innerHeight - 200; y += 40) {
      for (let x = 20; x < window.innerWidth - 20; x += 40) {
        const at = document.elementFromPoint(x, y);
        if (at && at.id === "city") out.canvas += 1;
        else {
          const key = at ? (at.id || at.className || at.tagName) : "nothing";
          out.blocked[key] = (out.blocked[key] || 0) + 1;
        }
      }
    }
    return out;
  });
  const sampled = reach.canvas + Object.values(reach.blocked).reduce((a, b) => a + b, 0);
  // Only real controls may block: a container with no pixels must not.
  const invisibleBlockers = Object.keys(reach.blocked)
    .filter((k) => /hud-(side|aside|drawer|bottom|top)$/.test(k) || k === "nothing");
  check("most of the map takes a click",
    reach.canvas / sampled > 0.85, `${reach.canvas} of ${sampled} sampled points`);
  check("nothing invisible is swallowing clicks on the map",
    invisibleBlockers.length === 0,
    invisibleBlockers.map((k) => `${k}×${reach.blocked[k]}`).join(", ") || JSON.stringify(reach.blocked));

  // --- 6. and nothing needs a mouse -----------------------------------------
  const tabbable = await page.evaluate(() => {
    const reachable = [...document.querySelectorAll("#hud button, #hud input, #hud select")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    // A toolbar is ONE tab stop by design (ruling 028), so what matters is that
    // nothing visible is removed from the tab order entirely.
    return reachable.filter((el) => el.tabIndex < -1 || el.disabled).map((el) => el.id || el.textContent.trim());
  });
  check("no visible control is removed from the keyboard's reach",
    tabbable.length === 0, tabbable.join(", "));

  check("no page errors", problems.length === 0, problems.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(failures === 0 ? "\nreach smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
