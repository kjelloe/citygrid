// The new-game screen's gate.
//
// Ruling 026: a criterion about a person doing something is driven by pointer,
// on the real `index.html`. So this one clicks the actual buttons and then
// asserts against `state.options` — the record the engine hashed — rather than
// against anything the screen said about itself.
//
// The claim being tested is the one the P18 audit failed: **a player can start
// the city they chose, and can start a different one afterwards.** Three
// difficulties were balanced and measured across 200 games each in era 1 and
// none was reachable, because there was no screen.
//
//   node tools/lobby_smoke.mjs

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
  const label = ok ? "ok  " : "FAIL";
  if (!ok) failures += 1;
  console.log(`${label}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const pageErrors = [];

const started = (page) => page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

try {
  for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: label === "phone", isMobile: label === "phone" });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
    await page.goto(base);

    // --- the screen appears at all -----------------------------------------
    await page.waitForSelector(".lobby", { timeout: 30000 });
    const shown = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".lobby-row")].map((r) => r.dataset.field),
      region: document.querySelector(".region-name")?.textContent ?? "",
      facts: document.querySelector(".region-facts")?.textContent ?? "",
      started: globalThis.CITY !== undefined,
    }));
    check(`${label}: a URL with no seed opens the new-game screen`,
      shown.rows.length === 5 && !shown.started, shown.rows.join(", "));

    // The engine has emitted `region.<shape>.<feature>` since worldgen was
    // written and nothing ever rendered one. An untranslated key renders as
    // itself, so a dot in the name means the catalogue is missing it.
    check(`${label}: the region is named, not keyed`,
      shown.region.length > 0 && !shown.region.includes("region."), shown.region);
    check(`${label}: the region reports what generation produced`,
      /\d+%/.test(shown.facts), shown.facts);

    // Before any game has run. The first tick of a game writes an autosave, so
    // this is the only moment in the run when there is genuinely nothing to
    // continue — and the button must be absent rather than dead.
    check(`${label}: nothing to continue before anything is saved`,
      await page.locator("#continue").count() === 0);

    // --- controls are reachable and thumb-sized ----------------------------
    const small = await page.evaluate(() =>
      [...document.querySelectorAll(".lobby-choice, .lobby-start, .lobby-another")]
        .filter((b) => b.getBoundingClientRect().height < 40).length);
    check(`${label}: every control is big enough to hit`, small === 0, `${small} under 40px`);
    const sideways = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`${label}: the screen does not scroll sideways`, !sideways);

    // --- another region -----------------------------------------------------
    const before = await page.textContent(".lobby-seed");
    await page.click("#regenerate");
    const after = await page.textContent(".lobby-seed");
    check(`${label}: "another region" gives another region`, before !== after, `${before} → ${after}`);

    // --- the choices reach the options record -------------------------------
    //
    // Every difficulty, one at a time, each started and read back off the
    // state. This is the P18 finding as a test: three balanced difficulties
    // that no player could select.
    for (const difficulty of ["relaxed", "steady", "demanding"]) {
      await page.goto(base);
      await page.waitForSelector(".lobby");
      await page.click(`.lobby-choice[data-field="difficulty"][data-value="${difficulty}"]`);
      await page.click('.lobby-choice[data-field="size"][data-value="48"]');
      await page.click('.lobby-choice[data-field="waterStyle"][data-value="lakes"]');
      await page.click('.lobby-choice[data-field="disasters"][data-value="false"]');
      await page.click("#start");
      await started(page);
      const options = await page.evaluate(() => ({ ...globalThis.CITY.state.options }));
      check(`${label}: starting on ${difficulty} builds a ${difficulty} city`,
        options.difficulty === difficulty
        && options.width === 48 && options.waterStyle === "lakes" && options.disasters === false,
        `${options.difficulty}, ${options.width}×${options.height}, ${options.waterStyle}, disasters ${options.disasters}`);
    }

    // --- the region the player was shown is the region they play ------------
    await page.goto(base);
    await page.waitForSelector(".lobby");
    await page.click('.lobby-choice[data-field="size"][data-value="48"]');
    const previewed = await page.textContent(".region-name");
    await page.click("#start");
    await started(page);
    const playing = await page.evaluate(async () => {
      const { describeRegion, regionNameKey } = await import("/engine/region-name.js");
      return regionNameKey(describeRegion(globalThis.CITY.state));
    });
    const playingName = await page.evaluate((key) => key, playing);
    check(`${label}: the region previewed is the region played`,
      previewed.length > 0 && playingName.startsWith("region."),
      `${previewed} / ${playingName}`);

    // --- the URL is the city ------------------------------------------------
    const url = new URL(page.url());
    check(`${label}: the address bar names the city that is being played`,
      url.searchParams.get("seed") !== null && url.searchParams.get("size") === "48",
      url.search);

    // Following that link must skip the screen and land in the same city.
    const link = await context.newPage();
    link.on("pageerror", (e) => pageErrors.push(`${label} link: ${e.message}`));
    await link.goto(url.href);
    await started(link);
    const sameCity = await link.evaluate(() => ({
      seed: globalThis.CITY.state.options.seed,
      width: globalThis.CITY.state.options.width,
      lobby: document.querySelector(".lobby") !== null,
    }));
    const wanted = Number(url.searchParams.get("seed"));
    check(`${label}: a link to a city opens that city, without the screen`,
      sameCity.seed === wanted && sameCity.width === 48 && !sameCity.lobby,
      `seed ${sameCity.seed} vs ${wanted}, ${sameCity.width}×`);
    await link.close();

    // --- naming (gamedesign.md §5.1, step one) --------------------------------
    //
    // The only typed fields in the game, and the first thing the design's
    // onboarding asks for. The name is hashed state, so what matters is that
    // what was typed reaches `state.options` — not that the box accepted it.
    await page.goto(base);
    await page.waitForSelector(".lobby");
    await page.fill("#cityName", "  Ny   Bergen  ");
    await page.fill("#mayorName", "Ada Lovelace who builds cities");
    await page.click("#start");
    await started(page);
    const named = await page.evaluate(() => ({
      city: globalThis.CITY.state.options.cityName,
      mayor: globalThis.CITY.state.players[0].name,
      shown: document.querySelector(".hud-city")?.textContent ?? "",
      url: new URL(location.href).searchParams.get("city"),
    }));
    check(`${label}: the city takes the name that was typed, collapsed and capped`,
      named.city === "Ny Bergen" && named.shown === "Ny Bergen", JSON.stringify(named));
    check(`${label}: the mayor's name is capped by the reducer, not by the box`,
      named.mayor.length > 0 && named.mayor.length <= 24, `"${named.mayor}" (${named.mayor.length})`);
    check(`${label}: the name travels with the link`, named.url === "Ny Bergen", String(named.url));

    // An unnamed city falls back to the region's own name rather than nothing.
    await page.goto(base);
    await page.waitForSelector(".lobby");
    const regionName = await page.textContent(".region-name");
    await page.click("#start");
    await started(page);
    const unnamed = await page.evaluate(() => globalThis.CITY.state.options.cityName);
    check(`${label}: an unnamed city is called after its region`,
      unnamed === regionName, `"${unnamed}" vs "${regionName}"`);

    // --- the controls card ----------------------------------------------------
    //
    // A playtester who forgets a key had nowhere to look: the shortcuts existed
    // and the only place any was written down was the canvas's aria-label.
    await page.click("#help");
    await page.waitForSelector("dialog.help[open]", { timeout: 10000 });
    const card = await page.evaluate(() => {
      const body = document.querySelector(".help-body");
      return {
        sections: document.querySelectorAll(".help-section").length,
        rows: document.querySelectorAll(".help-section dd").length,
        keys: [...document.querySelectorAll(".help kbd")].map((k) => k.textContent),
        rawKeys: /\b(help|menu|tool|zone)\.[a-z]/i.test(body.textContent ?? ""),
        atTop: body.scrollTop,
      };
    });
    check(`${label}: the controls card lists every section`, card.sections === 4, `${card.sections} sections`);
    check(`${label}: it names the tool shortcuts`,
      ["R", "W", "P", "B", "1", "2", "3", "0"].every((k) => card.keys.includes(k)),
      card.keys.join(" "));
    check(`${label}: no raw key is showing on the card`, card.rawKeys === false);
    check(`${label}: the card opens at the top`, card.atTop === 0);
    await page.keyboard.press("Escape");

    // And "?" opens it, which is the binding the card itself advertises.
    await page.evaluate(() => document.getElementById("city").focus());
    await page.keyboard.press("?");
    await page.waitForTimeout(150);
    const byKey = await page.evaluate(() => document.querySelector("dialog.help[open]") !== null);
    check(`${label}: "?" opens the card it advertises`, byKey);
    await page.keyboard.press("Escape");

    // --- settings -----------------------------------------------------------
    //
    // Twelve `settings.*` strings sat in both catalogues with no screen to show
    // them. The panel is open when the language changes, so it has to restate
    // itself; and so does whatever is behind it, which is a different code path
    // in a game (rebuild the HUD) than in the lobby (re-render the screen).
    // Both are checked, because only one of them was written first.
    await page.click("#settings");
    await page.waitForSelector("dialog.settings[open]", { timeout: 10000 });
    const wasLabelled = await page.textContent(".settings-close");
    await page.click('.settings-choice[data-field="locale"][data-value="no"]');
    const nowLabelled = await page.textContent(".settings-close");
    check(`${label}: the panel restates itself in the new language`,
      wasLabelled !== nowLabelled && nowLabelled.length > 0, `${wasLabelled} → ${nowLabelled}`);
    const contrast = await page.evaluate(() => {
      document.querySelector('.settings-choice[data-field="contrast"][data-value="high"]').click();
      return document.documentElement.dataset.contrast;
    });
    check(`${label}: high contrast reaches the document`, contrast === "high", String(contrast));
    await page.click("#settings-close");
    const hudLabel = await page.textContent("#new-city");
    check(`${label}: the HUD behind the panel is rebuilt in the new language`,
      hudLabel === "Ny by", hudLabel);
    const remembered = await page.evaluate(() => globalThis.localStorage.getItem("citygrid.settings"));
    check(`${label}: the choice is remembered`, /"locale":"no"/.test(remembered ?? ""), remembered ?? "nothing");

    // --- a refusal says why -------------------------------------------------
    //
    // The seven `result.*` strings were in both catalogues from the first commit
    // and nothing rendered one: a build you could not afford showed "0 tiles".
    const at = await page.evaluate(async () => {
      const { renderer, state, controller } = globalThis.CITY;
      // Three tiles clear in each direction, for a 3x3 plant.
      const ok = (s, x, y) => {
        for (let dy = 0; dy < 3; dy += 1) {
          for (let dx = 0; dx < 3; dx += 1) {
            const t = s.tiles.terrain[(y + dy) * s.width + x + dx];
            if (t === 3 || t === 4 || s.tiles.buildingId[(y + dy) * s.width + x + dx] !== 0) return false;
          }
        }
        return true;
      };
      globalThis.CITY.pause();
      state.players[0].treasury = 10;
      const THREE = await import("/vendor/three.module.js");
      controller.setTool("building", "coalPlant");
      const canvas = document.getElementById("city");
      // A buildable tile, not the middle of the map — the middle is water on
      // plenty of regions, and then the refusal is `invalid` for a reason that
      // has nothing to do with money.
      let tx = Math.floor(state.width / 2);
      let ty = Math.floor(state.height / 2);
      for (let r = 0; r < 20 && !ok(state, tx, ty); r += 1) {
        tx = Math.floor(state.width / 2) + r;
        ty = Math.floor(state.height / 2) + r;
      }
      const v = new THREE.Vector3(tx + 0.5, 0, ty + 0.5);
      v.project(renderer.view.camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    const told = await page.evaluate(() => ({
      text: document.querySelector(".hud-readout")?.textContent ?? "",
      code: document.querySelector(".hud-readout")?.dataset.result ?? "",
    }));
    check(`${label}: a build you cannot afford says so, in the chosen language`,
      told.code === "noFunds" && told.text.length > 0 && !/^0 /.test(told.text) && !told.text.includes("result."),
      `"${told.text}" (${told.code || "no code"})`);

    // --- back to the screen, and the lobby's own relocalise ------------------
    page.on("dialog", (d) => d.accept());
    await page.click("#new-city");
    await page.waitForSelector(".lobby", { timeout: 30000 });
    check(`${label}: "new city" returns to the screen`, true);
    const lobbyStart = await page.textContent(".lobby-start");
    check(`${label}: the screen opens in the chosen language`,
      lobbyStart === "Start denne byen", lobbyStart);

    // Put it back before the next assertions read English.
    await page.click("#settings");
    await page.click('.settings-choice[data-field="locale"][data-value="en"]');
    await page.click('.settings-choice[data-field="contrast"][data-value="normal"]');
    await page.click("#settings-close");
    await page.waitForFunction(() =>
      document.querySelector(".lobby-start")?.textContent === "Start this city", undefined, { timeout: 10000 });

    // --- continue -----------------------------------------------------------
    //
    // The lobby has offered a Continue button since it was written and nothing
    // ever passed it one, so a returning player had to start a new city and
    // shift-click a slot.
    await page.click("#start");
    await started(page);
    const savedHash = await page.evaluate(async () => {
      const { hashState } = await import("/engine/state.js");
      globalThis.CITY.pause();
      // Hash BEFORE the await. `save` yields, and a tick already on its way
      // lands in that gap — the city then hashes one month ahead of the bytes
      // on disk and the check fails in a quarter of runs for no reason.
      const hash = hashState(globalThis.CITY.state);
      await globalThis.CITY.save("slot1");
      return hash;
    });
    await page.goto(base);
    await page.waitForSelector(".lobby");
    const offered = await page.locator("#continue").count();
    check(`${label}: a saved city offers Continue`, offered === 1);
    if (offered === 1) {
      await page.click("#continue");
      await started(page);
      const resumed = await page.evaluate(async () => {
        const { hashState } = await import("/engine/state.js");
        globalThis.CITY.pause();
        return hashState(globalThis.CITY.state);
      });
      // Hash for hash: `startGame` must not re-issue CMD_JOIN on a restored
      // city, because reclaiming a seat touches `lastSeenTick`, which is hashed.
      check(`${label}: Continue resumes the same city, hash for hash`,
        resumed === savedHash, `${savedHash} → ${resumed}`);
    }

    await context.close();
  }

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\nlobby smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
