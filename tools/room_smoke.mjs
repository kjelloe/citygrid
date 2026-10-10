// Two browsers, one city (X1c — the gate X1 named for its client half).
//
// `tools/room_soak.mjs` proves the wire with scripted clients in node: five
// city years, one hash, a resync, a refused build. What it cannot prove is that
// the PAGE joins — that `?join=<code>` reaches `openSession`, that the socket
// transport builds a mirror from a room's WELCOME, that another seat's command
// arrives through `onMessage` and redraws, and that the two clients agree about
// what time it is. A feature is not built until it is driven on the real page.
//
// **The real server**, not a static one of this gate's own. Every other browser
// gate stands up its own file server, and that is how a Content-Security-Policy
// that blocked the importmap went unnoticed while eight gates were green — and
// here there is no choice anyway, because the socket lives in
// `server/index.js`. Console errors are listened for as well as `pageerror`: a
// CSP violation is reported to the console and nowhere else.
//
// **The build goes through the seam** (`CITY.apply`), not through a pointer.
// The subject is the wire: whether a command crosses it, is sequenced, comes
// back and reaches the other seat. `play_smoke` owns the question of whether a
// hand on a screen reaches a command, and it owns it on one client — aiming
// this gate at the hand as well would be two subjects and twice the flake.

import { chromium } from "playwright";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/index.js";
import { createStore } from "../server/store.js";
import { formatRoomCode } from "../shared/roomcode.js";

const SIZE = 48;
const problems = [];
function check(name, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!condition) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Where a tile is on screen, asked of the same camera the renderer uses — the
 * helper `play_smoke` has, for the same reason: a click has to land on the tile
 * the gate means, and at the tile's own HEIGHT rather than at y = 0 (V4). */
async function tilePixel(page, x, y) {
  return page.evaluate(([tx, ty]) => {
    const { renderer } = globalThis.CITY;
    const canvas = document.getElementById("city");
    const model = renderer.model;
    const h = model.heightAt((tx + 0.5) * model.tileM, (ty + 0.5) * model.tileM) / model.tileM;
    const v = new globalThis.THREE_VEC(tx + 0.5, h, ty + 0.5);
    v.project(renderer.view.camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }, [x, y]);
}

/** Waits for something to become true in the page, with a reason when it does
 * not — a gate that times out saying "timeout" is a gate nobody can debug. */
async function until(page, what, read, arg, ms = 30_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < ms) {
    last = await page.evaluate(read, arg).catch((error) => ({ error: String(error.message ?? error) }));
    if (last?.ok) return last;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`${what}: ${JSON.stringify(last)}`);
}

const roomDir = await mkdtemp(join(tmpdir(), "citygrid-room-smoke-"));
const server = await startServer({
  port: 0,
  store: createStore({ dir: roomDir }),
  fresh: true,
  tickMs: 100,
  roomId: "smoke",
  // **Eight seats** (X7): the release gate `plan-v1.md` has named since August
  // is eight players in one region, and a room with four of them cannot be
  // asked the question.
  options: { seed: 1003, width: SIZE, height: SIZE, seats: 8 },
});
const code = server.room.code();
const origin = `http://127.0.0.1:${server.port}`;
console.log(`room ${formatRoomCode(code)} at ${origin}`);

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

/** One client: its own context, so its storage and its service worker are its
 * own — two seats sharing a profile is one browser pretending to be two. */
async function openClient(seat, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto(`${origin}/?join=${code}&seat=${seat}&life=0`);
  const joined = await until(page, `seat ${seat} never joined`, () => {
    const city = globalThis.CITY;
    if (!city) return { ok: false, why: "no CITY" };
    if (city.room === undefined) return { ok: false, why: "no room on the session" };
    return { ok: true, room: city.room, seat: city.seat, width: city.state?.width };
  });
  return { seat, context, page, errors, joined };
}

try {
  const a = await openClient(1);
  const b = await openClient(2);
  check("two browsers joined one room", a.joined.room === code && b.joined.room === code,
    `${a.joined.room} / ${b.joined.room}`);
  check("and took different seats", a.joined.seat === 1 && b.joined.seat === 2,
    `${a.joined.seat} / ${b.joined.seat}`);
  check("each is playing the room's city, not one of its own",
    a.joined.width === SIZE && b.joined.width === SIZE, `${a.joined.width} / ${b.joined.width}`);

  // Both seats' arrivals have to have landed on both clients before anything is
  // compared: a seat joining is a COMMAND and arrives in a frame, so until it
  // does the two cities differ for a reason that is not a defect.
  const players = (page) => until(page, "both seats never arrived", () => {
    const seats = globalThis.CITY.state.players.map((p) => p.seat).sort();
    return { ok: seats.length >= 2, seats };
  });
  const seatsA = await players(a.page);
  const seatsB = await players(b.page);
  check("both arrivals reached both clients", seatsA.seats.length === 2 && seatsB.seats.length === 2,
    `${JSON.stringify(seatsA.seats)} / ${JSON.stringify(seatsB.seats)}`);

  // **Seat one builds.** Through the seam, and on dry ground the city picks
  // rather than a tile somebody remembered.
  const built = await a.page.evaluate(async () => {
    const city = globalThis.CITY;
    const { width, height, tiles } = city.state;
    for (let z = 6; z < height - 6; z += 1) {
      for (let x = 4; x + 6 < width - 4; x += 1) {
        const cells = Array.from({ length: 6 }, (unused, i) => z * width + x + i);
        const clear = cells.every((i) => tiles.terrain[i] !== 3 && tiles.terrain[i] !== 4
          && tiles.road[i] === 0 && tiles.buildingId[i] === 0);
        if (!clear) continue;
        const outcome = await city.apply({ type: "placeRoad", actor: city.seat, runs: [cells[0], 6] });
        return { result: outcome.result, cells };
      }
    }
    return { result: "no dry ground" };
  });
  check("seat one's road was accepted by the ROOM", built.result === "ok", String(built.result));

  // **And seat two sees it**, which is the whole claim: a frame carrying
  // somebody else's command, with no promise waiting for it, reaching the
  // mirror through `onMessage`.
  const seen = await until(b.page, "seat two never saw seat one's road", (cells) => {
    const road = globalThis.CITY.state.tiles.road;
    const laid = cells.filter((i) => road[i] !== 0).length;
    return { ok: laid === cells.length, laid, of: cells.length };
  }, built.cells, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the other seat saw it", seen.ok === true, seen.why ?? `${seen.laid} of ${seen.of} tiles`);

  // **The room's clock belongs to the host** (X2d). Until this slice the speed
  // button in a room changed its own label and nothing else: `room.setSpeed`
  // had no caller and there was no message between them, so a guest pressing it
  // watched the city carry on at whatever speed the room was started at. Three
  // claims, and they are different: the guest has no button at all (ruling 029
  // — remove it, do not disable it), the host's press reaches the room, and the
  // guest's LABEL follows without a message of its own.
  const buttons = await Promise.all([a, b].map(({ page }) => page.evaluate(() =>
    ({ speed: Boolean(document.querySelector("#speed")), label: document.querySelector("#speed")?.textContent ?? "" }))));
  check("only the host has a speed button", buttons[0].speed === true
    && buttons.slice(1).every((b) => b.speed === false), JSON.stringify(buttons));
  const was = await b.page.evaluate(() => globalThis.CITY.state.tick);
  await a.page.click("#speed");
  const followed = await until(b.page, "the guest's clock never followed the host's", () => ({
    ok: globalThis.CITY.roomSpeed !== 1,
    speed: globalThis.CITY.roomSpeed,
    tick: globalThis.CITY.state.tick,
  }), undefined, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the host's press reaches the room, and the guest follows",
    followed.ok === true, followed.why ?? JSON.stringify(followed));
  check("and the city kept running while it changed", followed.tick >= was,
    `${was} then ${followed.tick}`);

  // **Stop the clock before comparing three hashes.** The pump never pauses, so
  // a hash read while frames are in flight compares a client to a room that has
  // moved on — and the first run of this gate duly reported three different
  // numbers with no divergence anywhere (`room_soak` learned the same thing).
  // Speed 0 is a room whose city stands still while its frames keep flowing.
  server.room.setSpeed(0);
  const settled = (page) => until(page, "a client never caught up to the stopped room", (want) => {
    const city = globalThis.CITY;
    return { ok: city.state.tick === want && city.pending === 0, tick: city.state.tick, want };
  }, server.room.tick(), 15_000);
  const ticks = await Promise.all([a, b].map(({ page }) => settled(page)))
    .catch((error) => { problems.push(String(error.message ?? error)); return []; });
  check("both clients caught up to the stopped room",
    ticks.length === 2 && ticks.every((t) => t.ok), JSON.stringify(ticks.map((t) => t?.tick)));

  // One city, by the project's own contract (`shared/statehash.js`).
  const hashes = await Promise.all([a, b].map(({ page }) => page.evaluate(() => globalThis.CITY.hash())));
  check("both browsers and the room are on one hash",
    hashes[0] === hashes[1] && hashes[0] === server.room.hash(),
    `${hashes[0]} / ${hashes[1]} / ${server.room.hash()}`);

  // **The same hour** (A63 against A41): the room's played clock, not each
  // page's own. Within one beat of each other, because the two read it from
  // different frames.
  const clocks = await Promise.all([a, b].map(({ page }) => page.evaluate(() => globalThis.CITY.roomSeconds)));
  // And the held moment: a stopped room's sun does not move (A41).
  await new Promise((resolve) => setTimeout(resolve, 500));
  const held = await Promise.all([a, b].map(({ page }) => page.evaluate(() => globalThis.CITY.roomSeconds)));
  check("a paused room holds its hour", held.every((s, i) => s === clocks[i]),
    `${clocks.join(" / ")} then ${held.join(" / ")}`);
  check("both clients take the hour from the room",
    clocks.every((s) => typeof s === "number") && Math.abs(clocks[0] - clocks[1]) < 1,
    `${clocks[0]} / ${clocks[1]}`);
  check("and the room's clock is running", Math.max(...clocks) > 0, `${Math.max(...clocks)} s`);

  // **A third player joins through the LOBBY** (X2b): no `?join=` in the URL,
  // just the code typed into the screen as a player would type it. This is the
  // whole of slice 5.2's join half driven end to end — the field, the
  // normalisation, the door's "any free seat", and the page that comes up.
  const third = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const lobby = await third.newPage();
  const lobbyErrors = [];
  lobby.on("pageerror", (error) => lobbyErrors.push(`pageerror: ${error.message}`));
  lobby.on("console", (message) => {
    if (message.type() === "error") lobbyErrors.push(`console: ${message.text()}`);
  });
  await lobby.goto(`${origin}/?life=0`);
  await lobby.waitForSelector("#joinCode", { timeout: 30_000 });

  // The refusal first, because a button that always navigates proves nothing
  // about the field. Nonsense stays on the lobby and says why.
  await lobby.fill("#joinCode", "nonsense");
  await lobby.click("#join");
  const refused = await lobby.evaluate(() => {
    const line = document.querySelector(".lobby-join-problem");
    return { shown: line !== null && !line.hidden, words: line?.textContent ?? "", onLobby: Boolean(document.querySelector("#joinCode")) };
  });
  check("a bad code is refused on the lobby, in words", refused.shown && refused.words.length > 10
    && refused.onLobby, JSON.stringify(refused));

  // **And the DOOR's refusal, which is a different thing** (X2d). The check
  // above never leaves the page: `joinReady` rejects "nonsense" before a socket
  // is opened. A code that is well formed and names no room goes all the way to
  // the room registry, which answers `badCode` — and until X2d the page threw
  // that away and showed "the city failed to start", the same sentence a full
  // room, a taken seat and a client two versions behind all got.
  const absent = code === "ZZZZZZ" ? "YYYYYY" : "ZZZZZZ";
  await lobby.fill("#joinCode", absent);
  await lobby.click("#join");
  const fromDoor = await until(lobby, "the door's refusal never reached the lobby", () => {
    const line = document.querySelector(".lobby-join-problem");
    return {
      ok: line !== null && !line.hidden && (line.textContent ?? "").length > 10,
      words: line?.textContent ?? "",
      onLobby: Boolean(document.querySelector("#joinCode")),
      code: document.querySelector("#joinCode")?.value ?? "",
    };
  }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("a room that does not exist is refused in the door's own words",
    fromDoor.ok === true && fromDoor.onLobby === true, fromDoor.why ?? JSON.stringify(fromDoor));
  // The two refusals must not read the same: "check what you typed" and "there
  // is no room with that code" ask for different next moves, which is the
  // distinction X1b drew at the door and X2d is about carrying to the screen.
  check("and it does not read like the one the field catches",
    fromDoor.words !== refused.words, `${refused.words} / ${fromDoor.words}`);
  // The code is still in the field, because that is the state the player was in.
  check("the code the player typed is still there", fromDoor.code.length > 0, fromDoor.code);

  // Then the real code, typed the way it is READ OUT — grouped and lower case.
  await lobby.fill("#joinCode", formatRoomCode(code).toLowerCase());
  await lobby.click("#join");
  const joined3 = await until(lobby, "the lobby never joined the room", () => {
    const city = globalThis.CITY;
    if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
    return { ok: true, room: city.room, seat: city.seat };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("a code typed into the lobby joins the room", joined3.ok === true && joined3.room === code,
    joined3.why ?? JSON.stringify(joined3));
  // Seats one and two are taken, so the door had to choose — and the player
  // never said which. That is the X2b decision, seen from the furthest end.
  check("the door gave it a seat it never asked for", joined3.seat === 3, `seat ${joined3.seat}`);
  check("the lobby join reported no page or console errors", lobbyErrors.length === 0,
    lobbyErrors.slice(0, 3).join(" | "));
  await third.close();

  // **The inbox, end to end** (X3b). The item's own gate line: request →
  // approve → the demolition executes and is paid for, and the direct path is
  // refused. Seat two asks about the road seat one built above.
  //
  // Filing goes through the seam because the hand that FILES one is still
  // unbuilt — the inbox answers and withdraws, and asking needs a tool that
  // picks tiles. Answering goes through the PANEL, because that is the half
  // under test.
  // **Through the HAND, not the seam.** The whole claim is that the refusal is
  // the door, and `onResult` is the controller's callback — a command posted
  // through `CITY.apply` never reaches it, so an earlier version of this drove
  // the seam and then waited for a panel nothing had opened. The tool is
  // picked and a tile of the other seat's road is clicked, as a player would.
  await b.page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js");
    globalThis.THREE_VEC = THREE.Vector3;
    document.querySelector("#controls-dismiss")?.click();
  });
  const theirTile = await b.page.evaluate((cell) => {
    const { width } = globalThis.CITY.state;
    return { x: cell % width, y: Math.floor(cell / width) };
  }, built.cells[1]);
  const spot = await tilePixel(b.page, theirTile.x, theirTile.y);
  await b.page.click('#tools button[data-tool="bulldoze"]').catch(async () => {
    await b.page.evaluate(() => globalThis.CITY.controller.setTool("bulldoze"));
  });
  await b.page.mouse.move(spot.x, spot.y);
  await b.page.mouse.down();
  // **While the hand is down, before the command is issued** (X5 item 1).
  // `price()` runs `canDemolish` for the ghost, so the readout says `notOwner`
  // while the stroke is still being painted — and that goes through
  // `setPreview`, a SECOND call site for the same template. A fix that only
  // filled the token after the release would have left the brace on the screen
  // for as long as the player held the button.
  //
  // There is no HOVER preview to check: `tilesForStroke` returns nothing
  // without `ui.start`, deliberately (a pointer that is only passing over the
  // map must not paint a ghost), and this gate's first version asked for one
  // and got an empty readout. The preview is the drag.
  const painted = await until(b.page, "the stroke never previewed a refusal", () => {
    const readout = document.querySelector("[data-result]");
    return { ok: readout?.dataset.result === "notOwner", words: readout?.textContent ?? "" };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the ghost says whose ground it is while the hand is down, with no brace in it",
    painted.ok === true && /Mayor 1\b/.test(painted.words ?? "")
      && !/[{}]/.test(painted.words ?? ""), painted.why ?? painted.words);
  await b.page.mouse.up();
  const direct = await until(b.page, "the demolish was never refused", () => {
    const readout = document.querySelector("[data-result]");
    return {
      ok: readout?.dataset.result === "notOwner",
      said: readout?.dataset.result ?? "nothing",
      words: readout?.textContent ?? "",
    };
  }, undefined, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the direct path is refused — nothing you did not build is yours to destroy",
    direct.ok === true, direct.why ?? direct.said);
  // **And the refusal says WHOSE** (X5 item 1). `result.notOwner` is the one
  // `result.*` string with a token in it, `hud.js` renders every answer the
  // reducer gives through `t(`result.${result}`)`, and `t()` leaves an unfilled
  // token in the output by design — so `smoke-X3b-territory.png` showed the
  // player *"That belongs to {player}"*. Two checks, because a name and the
  // absence of a brace are different claims: a string could carry the owner's
  // name and still trail an unfilled `{tiles}` from a later edit.
  // Seat one joined without a name here, so the name it is called is the ROOM's
  // fallback — which is the case worth driving: `seats.js` exists because a seat
  // visible on the map must never be nameless in a panel that is about it.
  check("the refusal names the owner rather than its own template",
    /Mayor 1\b/.test(direct.words ?? ""), direct.words ?? "");
  check("no brace reaches the screen", /[{}]/.test(direct.words ?? "") === false, direct.words ?? "");

  // **Filing goes through the HAND now** (X3b, 2026-10-08): the refusal above is
  // the door. Seat two's demolish was refused `notOwner`, so the game offered to
  // ask — the panel is open on their screen with the owner named in it, and all
  // that is left is to fill it in and press Ask. No new tool, and the player is
  // already looking at the ground in question.
  const offered = await until(b.page, "the refusal did not offer to ask", () => {
    const panel = document.querySelector("#ask");
    return { ok: panel !== null && !panel.hidden, words: panel?.querySelector(".ask-what")?.textContent ?? "" };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("a refused demolish offers to ask, and names the owner", offered.ok === true,
    offered.why ?? offered.words);

  // **The other button first** (§25.4): the same panel files a report, which
  // asks for nothing and ends as an acknowledgement. Filed, read back, and
  // withdrawn again so the demolition below is the only thing in the inbox.
  await b.page.fill("#ask-title", "Your road is noisy");
  await b.page.fill("#ask-reason", "Carts all night");
  await b.page.fill("#ask-offer", "99");
  await b.page.click("#ask-report");
  const reported = await until(b.page, "the report was never filed", () => {
    const nuisance = globalThis.CITY.state.requests.filter((r) => r.kind === "nuisance");
    return { ok: nuisance.length > 0, offer: nuisance[0]?.offer, title: nuisance[0]?.title };
  }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  // **The offer is dropped**, whatever was in the field: nobody pays somebody
  // to be told about a noise, and a number the owner could never take would
  // read as an offer in their inbox.
  check("a report is filed, and offers nothing however much was typed",
    reported.ok === true && reported.offer === 0 && reported.title === "Your road is noisy",
    reported.why ?? JSON.stringify(reported));
  await b.page.evaluate(async () => {
    const city = globalThis.CITY;
    const mine = city.state.requests.find((r) => r.kind === "nuisance" && r.status === "pending");
    if (mine) await city.apply({ type: "withdrawRequest", actor: city.seat, id: mine.id });
  });

  // Then the demolition, through the same door.
  await b.page.mouse.move(spot.x, spot.y);
  await b.page.mouse.down();
  await b.page.mouse.up();
  await until(b.page, "the second refusal did not offer to ask", () => {
    const panel = document.querySelector("#ask");
    return { ok: panel !== null && !panel.hidden };
  }, undefined, 15_000);
  await b.page.fill("#ask-title", "Your road blocks my pipe");
  await b.page.fill("#ask-reason", "It runs through my water main");
  await b.page.fill("#ask-offer", "40");
  await b.page.click("#ask-send");
  const filed = await until(b.page, "the request was never filed", () => {
    const pending = globalThis.CITY.state.requests.filter((r) => r.status === "pending");
    return { ok: pending.length > 0, pending: pending.length,
      offer: pending[0]?.offer, title: pending[0]?.title };
  }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the panel files the request, with what was typed in it",
    filed.ok === true && filed.offer === 40 && filed.title === "Your road blocks my pipe",
    filed.why ?? JSON.stringify(filed));

  // Seat ONE answers it, in the panel, as a player would.
  const waiting = await until(a.page, "the request never reached the owner's inbox", () => {
    const city = globalThis.CITY;
    const rail = document.querySelector("#rail-inbox");
    return { ok: rail !== null && city.state.requests.some((r) => r.status === "pending"),
      rail: rail !== null, requests: city.state.requests.length };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the owner's inbox exists and has the request in it", waiting.ok === true,
    waiting.why ?? JSON.stringify(waiting));

  await a.page.click("#controls-dismiss").catch(() => {});
  await a.page.click("#rail-inbox");
  const drawn = await until(a.page, "the inbox drawer never drew the row", () => {
    const rows = [...document.querySelectorAll(".inbox-row")].map((el) => el.textContent?.trim());
    const agree = document.querySelector('.inbox-row button[data-action="approve"]');
    return { ok: rows.length > 0 && agree !== null, rows: rows.length,
      words: rows[0]?.slice(0, 60) ?? "" };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the inbox draws the row, in words", drawn.ok === true,
    drawn.why ?? `${drawn.rows} row(s): ${drawn.words}`);

  const purseBefore = await a.page.evaluate(() => globalThis.CITY.state.players
    .find((p) => p.seat === globalThis.CITY.seat).treasury);
  await a.page.click('.inbox-row button[data-action="approve"]');
  // The tile the request was actually ABOUT — one, because the demolish that
  // opened the panel was a single click. An earlier cut waited for all six of
  // seat one's road to go and reported "never cleared" about a request that had
  // been honoured exactly as filed.
  const cleared = await until(b.page, "the tile was never cleared", (cell) => {
    const road = globalThis.CITY.state.tiles.road;
    return { ok: road[cell] === 0, still: road[cell] };
  }, built.cells[1], 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("agreeing in the inbox clears the ground, on the OTHER client",
    cleared.ok === true, cleared.why ?? JSON.stringify(cleared));

  const purseAfter = await a.page.evaluate(() => globalThis.CITY.state.players
    .find((p) => p.seat === globalThis.CITY.seat).treasury);
  check("and the owner was paid the offer", purseAfter - purseBefore === 40,
    `${purseBefore} → ${purseAfter}`);
  await a.page.click("#rail-inbox");

  // **Pointing at something** (X3b). Seven canned phrases from a closed list;
  // the inspector is already open on the tile, which is why the control is
  // there. The receiving seat gets it as an alert that is a BUTTON, and
  // pressing it moves their camera — which is the half the item names.
  const pinged = await a.page.evaluate(async () => {
    const city = globalThis.CITY;
    return (await city.apply({ type: "ping", actor: city.seat, x: 12, z: 14, message: "look" })).result;
  });
  check("a ping is accepted", pinged === "ok", String(pinged));
  const heard = await until(b.page, "the other seat never heard the ping", () => {
    const go = document.querySelector(".alert-go[data-ping]");
    return { ok: go !== null, at: go?.dataset.ping ?? "", words: go?.textContent?.trim() ?? "" };
  }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the other seat sees it, named and placed", heard.ok === true && heard.at === "12,14",
    heard.why ?? JSON.stringify(heard));

  // And pressing it takes them there.
  const before = await b.page.evaluate(() => ({
    x: globalThis.CITY.renderer.view.targetX, z: globalThis.CITY.renderer.view.targetZ,
  }));
  await b.page.click(".alert-go[data-ping]");
  const after = await until(b.page, "the camera never moved", (was) => {
    const view = globalThis.CITY.renderer.view;
    const moved = Math.abs(view.targetX - was.x) + Math.abs(view.targetZ - was.z);
    return { ok: moved > 0.5, moved: Math.round(moved * 100) / 100, x: view.targetX, z: view.targetZ };
  }, before, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("and pressing it jumps the camera to the tile", after.ok === true,
    after.why ?? JSON.stringify(after));

  // **Chat** (X3b). Off by default, so the room this gate boots has it off and
  // the panel is absent — which is the first thing to check, because a control
  // that can never carry anything is worse than none.
  const noChat = await a.page.evaluate(() => document.querySelector("#rail-chat") === null);
  check("a room with chat off has no chat panel at all", noChat === true, String(noChat));

  // And the ON path, in a room made with chat enabled. Two browsers, because a
  // line one player cannot see the other say proves nothing — and on this
  // server rather than a second one, since the registry can hold both.
  const talkative = server.rooms.add({
    options: { seed: 2024, width: 48, height: 48, seats: 4, chatEnabled: true },
  });
  check("a room can be made with chat on", talkative.ok === true, String(talkative.reason));
  if (talkative.ok) {
    server.rooms.start();
    const chatCode = talkative.room.code();
    const talkers = [];
    for (const seatWanted of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
      await page.goto(`${origin}/?join=${chatCode}&seat=${seatWanted}&life=0`);
      await until(page, `chat seat ${seatWanted} never joined`, () => ({ ok: globalThis.CITY?.room !== undefined }));
      await page.click("#controls-dismiss").catch(() => {});
      talkers.push({ context, page, errors });
    }
    await talkers[0].page.click("#rail-chat");
    await talkers[1].page.click("#rail-chat");
    await talkers[0].page.fill("#chat-text", "  Hello  there  ");
    await talkers[0].page.click("#chat-send");
    const heard = await until(talkers[1].page, "the other seat never heard the line", () => {
      const lines = [...document.querySelectorAll(".chat-line")].map((el) => el.textContent?.trim());
      return { ok: lines.length > 0, lines };
    }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    // Trimmed and collapsed on the way in, by the same sanitiser a request
    // title goes through — and rendered as TEXT, which is why the markup below
    // comes back as characters rather than as an element.
    check("a line reaches the other seat, trimmed", heard.ok === true
      && String(heard.lines?.[0]).includes("Hello there"), heard.why ?? JSON.stringify(heard.lines));

    await talkers[0].page.fill("#chat-text", "<b>not bold</b>");
    await talkers[0].page.click("#chat-send");
    const safe = await until(talkers[1].page, "the second line never arrived", () => {
      const last = [...document.querySelectorAll(".chat-line")].pop();
      return { ok: (last?.textContent ?? "").includes("not bold"),
        bold: last?.querySelector("b") !== null && last?.querySelector("b") !== undefined,
        text: last?.textContent ?? "" };
    }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("and markup arrives as characters, not as markup",
      safe.ok === true && safe.bold === false, safe.why ?? JSON.stringify(safe));
    check("neither talker reported a page or console error",
      talkers.every((t) => t.errors.length === 0),
      talkers.flatMap((t) => t.errors).slice(0, 3).join(" | "));

    // **The host removes a seat** (X2d). Here rather than in the room above,
    // because a kicked seat is gone and everything after this needs the two
    // seats up there — this room has two of its own and is finished with them.
    //
    // Three claims, and they are different: the host is offered a Remove on
    // everybody else's row and not their own, the guest is offered none;
    // pressing it ends that player's session on the lobby with the door's own
    // sentence; and the CITY hears about it as a `CMD_LEAVE` in the frame, so
    // the host's own roster moves rather than only the kicked page.
    // The roster is behind its own rail button, like the inbox and the chat.
    await talkers[0].page.click("#rail-roster");
    await talkers[1].page.click("#rail-roster");
    const offered = await talkers[0].page.evaluate(() => ({
      onTheirs: Boolean(document.querySelector('.roster-row:not(.you) [data-action="remove"]')),
      onMine: Boolean(document.querySelector('.roster-row.you [data-action="remove"]')),
    }));
    check("the host is offered a removal on somebody else's row and not their own",
      offered.onTheirs === true && offered.onMine === false, JSON.stringify(offered));
    const guestOffered = await talkers[1].page.evaluate(() =>
      document.querySelectorAll('[data-action="remove"]').length);
    check("a guest is offered none", guestOffered === 0, `${guestOffered} remove buttons`);

    await talkers[0].page.click('.roster-row:not(.you) [data-action="remove"]');
    const back = await until(talkers[1].page, "the removed player never left the city", () => ({
      ok: document.querySelector("#joinCode") !== null,
      said: document.querySelector(".lobby-join-problem")?.textContent ?? "",
    }), undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("the removed player is back on the lobby, told why",
      back.ok === true && back.said.length > 10, back.why ?? JSON.stringify(back));
    const told = await until(talkers[0].page, "the host's own city never heard", () => {
      const player = globalThis.CITY.state.players.find((p) => p.seat === 2);
      return { ok: player?.status === 3, status: player?.status };
    }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("and the city knows, in the frame, like everything else",
      told.ok === true, told.why ?? JSON.stringify(told));

    for (const talker of talkers) await talker.context.close();
  }

  // **What happened while you were away** (X4h). The alert list is the feed and
  // this is the RECORD: it is hashed state, so the two browsers must show the
  // same rows, and it survives a page that was closed — which the alert list,
  // living in the page, cannot. Driven here because by now both seats have
  // joined and a request has been filed and resolved between them, which is
  // most of what the panel is for.
  await a.page.click("#rail-chronicle");
  await b.page.click("#rail-chronicle");
  const histories = await Promise.all([a, b].map(({ page }) => page.evaluate(() => ({
    rows: [...document.querySelectorAll(".chronicle-row")].map((el) => el.textContent?.trim()),
    entries: globalThis.CITY.state.chronicle.entries.length,
  }))));
  check("both seats see the same history, and it is not empty",
    histories[0].entries > 1 && histories[0].rows.length === histories[1].rows.length
    && histories[0].rows.join("|") === histories[1].rows.join("|"),
    JSON.stringify(histories.map((h) => h.rows.length)));
  check("and it says who, in words", histories[0].rows.some((r) => String(r).includes("Mayor 1")),
    histories[0].rows.slice(0, 3).join(" / "));
  // **Nobody is Mayor 0.** The first run of this block read "Mayor 0 agreed to
  // clear the ground": `requestResolved` carried an id and a status, which is
  // all an alert beside the live request needs and not enough for a row read
  // an hour later. Seat 0 is the CITY — the weather's row — and a sentence
  // naming it as a player is the shape that defect takes. Asserted on the
  // words rather than on the state, because the state was correct both times.
  const seatZero = histories[0].rows.filter((r) => String(r).includes("Mayor 0"));
  check("and nobody in it is Mayor 0", seatZero.length === 0, seatZero.join(" / "));

  // **A standing answer** (X3b): what happens to requests while nobody is
  // looking. Seat one sets "always agree", seat two asks about the rest of its
  // road, and the MONTH answers — the request is gone and the ground with it,
  // with nobody having pressed anything.
  await a.page.click("#rail-inbox");
  await a.page.click('.inbox-policy button[data-policy="approve"]');
  const policy = await until(a.page, "the standing answer never took", () => {
    const player = globalThis.CITY.state.players.find((p) => p.seat === globalThis.CITY.seat);
    const pressed = document.querySelector('.inbox-policy button[data-policy="approve"]');
    return { ok: player?.requestPolicy === "approve" && pressed?.getAttribute("aria-pressed") === "true",
      policy: player?.requestPolicy, pressed: pressed?.getAttribute("aria-pressed") };
  }, undefined, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("a standing answer can be set, and the control says so",
    policy.ok === true, policy.why ?? JSON.stringify(policy));
  await a.page.click("#rail-inbox");

  const standing = await b.page.evaluate(async (cells) => {
    const city = globalThis.CITY;
    // **The whole original run**, not the tiles that happen to be left. A run
    // is `[start, length]` and the tiles still standing are no longer
    // contiguous — one in the middle went to the demolition above — so
    // `[left[0], left.length]` named a span that included a cleared tile and
    // ran one past the end. The reducer is perfectly happy to be asked about
    // ground that is already bare; it is the gate that cannot invent a run.
    const outcome = await city.apply({
      type: "requestDemolition", actor: city.seat, runs: [cells[0], cells.length],
      title: "The rest of it", reason: "Same pipe", offer: 10,
    });
    return { result: outcome.result, tiles: cells };
  }, built.cells);
  check("a second request is filed against a standing answer", standing.result === "ok",
    JSON.stringify(standing.result));
  // Let the room reach the next month. At the fast speed a sim-month is under a
  // second of wall clock, and the pass is where a standing answer is given.
  server.room.setSpeed(3);
  const answered = await until(b.page, "the standing answer never fired", (tiles) => {
    const road = globalThis.CITY.state.tiles.road;
    const left = (tiles ?? []).filter((i) => road[i] !== 0).length;
    const mine = globalThis.CITY.state.requests.filter((r) => r.status === "pending").length;
    return { ok: left === 0 && mine === 0, left, pending: mine };
  }, standing.tiles, 30_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the month answers it, with nobody pressing anything",
    answered.ok === true, answered.why ?? JSON.stringify(answered));

  // **Watching without playing** (X4e). A third browser joins with `?watch=1`,
  // takes no seat, sees the city — and has no tools at all, because a toolbar
  // that only ever says no is the "present but inert" control ruling 029 is
  // about.
  const seats = server.room.seats().length;
  const watchCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const watcher = await watchCtx.newPage();
  const watchErrors = [];
  watcher.on("pageerror", (error) => watchErrors.push(`pageerror: ${error.message}`));
  watcher.on("console", (m) => { if (m.type() === "error") watchErrors.push(`console: ${m.text()}`); });
  await watcher.goto(`${origin}/?join=${code}&watch=1&life=0`);
  const watching = await until(watcher, "the watcher never got a city", () => {
    const city = globalThis.CITY;
    if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
    return { ok: true, seat: city.seat, width: city.state?.width,
      tools: document.querySelectorAll("#tools button").length,
      overlays: document.querySelectorAll(".hud-overlays button").length };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("a watcher sees the city", watching.ok === true && watching.width === SIZE,
    watching.why ?? JSON.stringify(watching));
  check("and takes no seat", server.room.seats().length === seats,
    `${seats} seats before, ${server.room.seats().length} after`);
  check("and has no tools at all", watching.tools === 0, `${watching.tools} tool buttons`);
  // Everything that READS the city is still there — this is watching, not a
  // crippled game.
  check("but can still read the city", watching.overlays > 0, `${watching.overlays} overlays`);
  check("the watcher reported no page or console errors", watchErrors.length === 0,
    watchErrors.slice(0, 3).join(" | "));
  await watchCtx.close();

  // **Who is in the room** (X4): the last two commands with handlers and no
  // control, and the home of the two seat events. Built from `state.players`,
  // so every client draws the same list without a wire message.
  await b.page.click("#rail-roster");
  const roster = await until(b.page, "the roster never drew", () => {
    const rows = [...document.querySelectorAll(".roster-row")].map((el) => ({
      seat: el.dataset.seat, you: el.classList.contains("you"),
      text: el.textContent?.trim() ?? "",
    }));
    return { ok: rows.length > 0, rows };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the roster lists every seat in the room",
    roster.ok === true && roster.rows.length === server.room.state.players.length,
    roster.why ?? JSON.stringify(roster.rows?.map((r) => r.seat)));
  check("and marks which one is you", (roster.rows ?? []).filter((r) => r.you).length === 1,
    JSON.stringify(roster.rows?.map((r) => `${r.seat}:${r.you}`)));

  // Saying you are away reaches every client, because it is hashed state.
  await b.page.click('.roster-row.you button[data-action="away"]');
  const away = await until(a.page, "the other seat never heard about it", (who) => {
    const player = globalThis.CITY.state.players.find((p) => p.seat === who);
    return { ok: player?.status === 1, status: player?.status };
  }, 2, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("away reaches the other client, because a status is hashed state",
    away.ok === true, away.why ?? JSON.stringify(away));
  // And the one control says which way it goes.
  const back = await until(b.page, "the away button never became a back button", () => {
    const button = document.querySelector('.roster-row.you button[data-action="back"]');
    return { ok: button !== null, label: button?.textContent ?? "" };
  }, undefined, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("and the control now offers the way back", back.ok === true, back.why ?? back.label);
  await b.page.click('.roster-row.you button[data-action="back"]');
  await b.page.click("#rail-roster");

  // **Whose city is which** (X3b, Q61). The territory overlay has coloured
  // buildings by owner since V7 with no control at all; this is the control,
  // driven as a player would, with two seats' work on the map. The legend is
  // the half a gate can assert — §16's "never colour alone", which for
  // territory means a NAMED row per seat — and the picture is saved for
  // somebody to open, because no gate has ever caught a renderer defect of
  // this kind.
  // The first-run controls card covers the map, and a screenshot of a dialog is
  // not a screenshot of an overlay. Dismissed before anything is shot.
  await b.page.click("#controls-dismiss").catch(() => {});
  // `#rail-overlays` first: the rail is a drawer and its buttons are in the DOM
  // while it is shut, so clicking one without opening it waits for ever on a
  // control that is present and not visible (the inert-control lesson).
  await b.page.click("#rail-overlays");
  await b.page.click('.hud-overlays button[data-overlay="territory"]');
  const shown = await until(b.page, "the territory overlay never came on", () => {
    const rows = [...document.querySelectorAll(".legend-seat")]
      .map((el) => el.textContent?.trim()).filter(Boolean);
    return { ok: globalThis.CITY.overlay === "territory" && rows.length > 0, overlay: globalThis.CITY.overlay, rows };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the territory overlay has a control, and it works", shown.ok === true,
    shown.why ?? JSON.stringify(shown));
  // Against the ROOM's own player list, not a literal: by this point the lobby
  // join above has taken a third seat, and the first cut of this asked for two
  // and failed about a legend that was right. The claim is "every seat", so the
  // number comes from the thing that knows.
  const inRoom = server.room.state.players.length;
  check("its legend names every seat in the room", (shown.rows ?? []).length === inRoom,
    `${(shown.rows ?? []).length} rows for ${inRoom} players: ${JSON.stringify(shown.rows)}`);
  // **What this picture is, and is not.** It shows the control and the legend —
  // the half §16 calls "never colour alone", and the half a gate can assert.
  // It does NOT show two seats' buildings in two colours, because territory
  // colours BUILDINGS and this room is three months old with none: a city that
  // has nothing to show makes a green picture of a right overlay (V7's wash,
  // exactly). That half of the item's gate line needs a played multi-seat city
  // and is still open.
  await b.page.screenshot({ path: "reports/smoke-X3b-territory.png" });
  await b.page.click('.hud-overlays button[data-overlay="territory"]');
  await b.page.click("#rail-overlays");

  // **Hosting, through the lobby** (X2c). A browser that nobody gave a code to:
  // it picks its options on the new-game screen, clicks Host, and the room it
  // gets is a NEW one — not the one this gate booted the server with — which is
  // the whole of "four people start a room without a URL parameter".
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const hostPage = await hostCtx.newPage();
  const hostErrors = [];
  hostPage.on("pageerror", (error) => hostErrors.push(`pageerror: ${error.message}`));
  hostPage.on("console", (message) => {
    if (message.type() === "error") hostErrors.push(`console: ${message.text()}`);
  });
  await hostPage.goto(`${origin}/?life=0`);
  await hostPage.waitForSelector("#host", { timeout: 30_000 });
  await hostPage.click("#host");
  const hosted = await until(hostPage, "the lobby never hosted a room", () => {
    const city = globalThis.CITY;
    if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
    return { ok: true, room: city.room, seat: city.seat, width: city.state?.width, url: globalThis.location.search };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the lobby hosts a room", hosted.ok === true && typeof hosted.room === "string",
    hosted.why ?? JSON.stringify(hosted));
  check("and it is a NEW room, not the one the server booted with", hosted.room !== code,
    `${hosted.room} vs the server's ${code}`);
  check("the host takes seat one of its own room", hosted.seat === 1, `seat ${hosted.seat}`);
  // The URL is the invitation: `?join=` is the parameter a guest arrives on, so
  // the host can copy the address bar and send it.
  check("the host's address bar carries the code", String(hosted.url).includes(`join=${hosted.room}`),
    String(hosted.url));
  check("the hosting browser reported no page or console errors", hostErrors.length === 0,
    hostErrors.slice(0, 3).join(" | "));

  // And somebody joins THAT room by typing its code, which is the pair of
  // slices end to end: X2c made it, X2b gets into it.
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await guestCtx.newPage();
  const guestErrors = [];
  guest.on("pageerror", (error) => guestErrors.push(`pageerror: ${error.message}`));
  guest.on("console", (message) => {
    if (message.type() === "error") guestErrors.push(`console: ${message.text()}`);
  });
  await guest.goto(`${origin}/?life=0`);
  await guest.waitForSelector("#joinCode", { timeout: 30_000 });
  await guest.fill("#joinCode", formatRoomCode(hosted.room).toLowerCase());
  await guest.click("#join");
  const guestJoined = await until(guest, "the guest never joined the hosted room", () => {
    const city = globalThis.CITY;
    if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
    return { ok: true, room: city.room, seat: city.seat };
  }).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
  check("the guest reported no page or console errors", guestErrors.length === 0,
    guestErrors.slice(0, 3).join(" | "));
  check("a guest joins the hosted room by its code",
    guestJoined.ok === true && guestJoined.room === hosted.room,
    guestJoined.why ?? JSON.stringify(guestJoined));
  check("and is given seat two of it", guestJoined.seat === 2, `seat ${guestJoined.seat}`);

  // **The lobby waits, and the host starts it** (X2d's last rows). A hosted
  // room does not play until the host says go, which is the whole point: the
  // city would otherwise be twelve years old before the second person typed the
  // code. The guest is here, so this is the state a real lobby is in.
  {
    const before = server.rooms.get(hosted.room)?.tick() ?? -1;
    await hostPage.click("#rail-roster");
    await guest.click("#rail-roster");
    const waiting = await guest.evaluate(() => ({
      waiting: document.querySelector(".roster-waiting")?.textContent?.trim() ?? "",
      ready: document.querySelectorAll(".roster-ready").length,
      start: document.querySelectorAll(".roster-start").length,
    }));
    check("a guest is told what it is waiting for, and offered the way to be ready",
      waiting.waiting.length > 0 && waiting.ready === 1 && waiting.start === 0,
      JSON.stringify(waiting));
    const hostSees = await hostPage.evaluate(() => ({
      start: document.querySelectorAll(".roster-start").length,
      waiting: document.querySelectorAll(".roster-waiting").length,
    }));
    check("and the host is offered the start, not the waiting", hostSees.start === 1
      && hostSees.waiting === 0, JSON.stringify(hostSees));

    // **The code, and a QR of the link** (Q5 → A11). The code has only ever
    // been in the address bar; the QR is for the person standing next to the
    // host with a phone, who cannot be sent a link. Counted rather than
    // admired: a canvas with no dark modules in it is a white square, which is
    // exactly what a hand-rolled encoder fails as.
    const invite = await hostPage.evaluate(() => {
      const canvas = document.querySelector("canvas.roster-qr");
      if (!canvas) return { ok: false, why: "no QR canvas" };
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] < 128) dark += 1;
      return {
        ok: true,
        code: document.querySelector(".roster-code")?.textContent?.trim() ?? "",
        modules: Number(canvas.dataset.modules),
        label: canvas.getAttribute("aria-label") ?? "",
        width: canvas.width,
        darkShare: Math.round((dark / (canvas.width * canvas.height)) * 100),
      };
    });
    check("the lobby shows the room's code in words", invite.ok === true
      && invite.code.replace("-", "") === hosted.room, invite.why ?? JSON.stringify(invite));
    // A QR is between a third and a half dark by construction — the mask is
    // CHOSEN to keep it near half — so a blank canvas and a solid one both
    // fail here.
    check("and a QR of the join link, with modules actually drawn in it",
      invite.ok === true && invite.modules >= 21 && invite.width === (invite.modules + 8) * 4
      && invite.darkShare > 20 && invite.darkShare < 55, JSON.stringify(invite));
    check("the QR says in words what it is, for a reader that cannot see it",
      /scan|skann/i.test(invite.label ?? ""), invite.label);
    // **And a picture somebody can point a phone at.** Every check above is
    // this project checking its own arithmetic; the one thing it cannot do is
    // scan. The file is the handover — `reports/lobby-qr.png`, the real panel
    // at the size it is drawn, for V5's evening.
    await hostPage.locator(".roster-invite").screenshot({ path: "reports/lobby-qr.png" })
      .catch(() => {});
    console.log(`      wrote reports/lobby-qr.png — point a phone at it; it should open `
      + `?join=${hosted.room}`);

    // The guest says it is ready, and the HOST's roster hears it — which is
    // the half that proves this rides the frame rather than living in one page.
    await guest.click(".roster-ready");
    const heard = await until(hostPage, "the host never saw the guest get ready", () => {
      const row = [...document.querySelectorAll(".roster-row")]
        .find((r) => r.dataset.seat === "2");
      return { ok: /ready|klar/i.test(row?.textContent ?? ""), said: row?.textContent?.trim() };
    }, undefined, 15_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("a seat that says it is ready says so on every screen", heard.ok === true,
      heard.why ?? heard.said);

    check("and the room is not playing while it waits",
      (server.rooms.get(hosted.room)?.tick() ?? -1) === before,
      `${before} → ${server.rooms.get(hosted.room)?.tick()}`);

    await hostPage.click(".roster-start");
    const playing = await until(hostPage, "the room never started", () => ({
      ok: globalThis.CITY.state.tick > 0, tick: globalThis.CITY.state.tick,
    }), undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("the host's start sets the clock going", playing.ok === true,
      playing.why ?? JSON.stringify(playing));
    // And the controls are gone rather than inert, which is the rule a button
    // that cannot do anything broke in X2d's first round.
    const after = await hostPage.evaluate(() => ({
      start: document.querySelectorAll(".roster-start").length,
      ready: document.querySelectorAll(".roster-ready, .roster-notReady").length,
    }));
    check("a started room offers neither a start nor a ready",
      after.start === 0 && after.ready === 0, JSON.stringify(after));
  }

  // One city, which is the only claim that matters about a room.
  const hostedRoom = server.rooms.get(hosted.room);
  if (hostedRoom) hostedRoom.setSpeed(0);
  const pair = await Promise.all([hostPage, guest].map((page) => until(page,
    "a client never caught up to the hosted room", (want) => {
      const city = globalThis.CITY;
      return { ok: city.state.tick === want && city.pending === 0, tick: city.state.tick, want };
    }, hostedRoom?.tick() ?? -1, 15_000))).catch(() => []);
  check("the host and the guest caught up to their stopped room",
    pair.length === 2 && pair.every((p) => p.ok), JSON.stringify(pair.map((p) => p?.tick)));
  const hostedHashes = await Promise.all([hostPage, guest]
    .map((page) => page.evaluate(() => globalThis.CITY?.hash() ?? "no city").catch((e) => String(e.message ?? e))));
  check("the host, the guest and the hosted room are on one hash",
    hostedHashes[0] === hostedHashes[1] && hostedHashes[0] === hostedRoom?.hash(),
    `${hostedHashes[0]} / ${hostedHashes[1]} / ${hostedRoom?.hash()}`);
  // **And hosting a city that already exists** (X2d). `createRoom` has taken a
  // save since X1a and the door dropped the field, so the only way to host one
  // was to boot the server with it. The discriminator is the TICK: a generated
  // room starts at 0, and a hosted save starts where the city was saved.
  {
    // The tick is read in the SAME turn as the save, after the seam has
    // settled. Pausing stops the clock but not the posts already in flight, so
    // a tick read afterwards was one ahead of the one in the file — "saved at
    // 26, hosted at 25", which is a gate counting what it sent rather than
    // what arrived.
    const savedAt = await hostPage.evaluate(async () => {
      const city = globalThis.CITY;
      city.resume();
      // Somewhere to come back to, and far enough in that the tick is not zero.
      await new Promise((done) => { setTimeout(done, 2500); });
      // **Pausing a ROOM is a round trip** (X2d). `pause()` asks the room to
      // stop and the frames keep arriving until it does — `pending` counts
      // posts, not incoming frames, so a save taken on the next line was a
      // tick behind the page by the time the page was read. Wait for the
      // room's own dial to reach 0, then for the tick to stop moving: two
      // equal samples, which is the same shape `ui_smoke` waits for the
      // renderer with.
      city.pause();
      while (city.roomSpeed !== undefined && city.roomSpeed !== 0) {
        await new Promise((done) => { setTimeout(done, 20); });
      }
      let last = -1;
      while (last !== city.state.tick) {
        last = city.state.tick;
        await new Promise((done) => { setTimeout(done, 200); });
      }
      while (city.pending > 0) await new Promise((done) => { setTimeout(done, 20); });
      await city.save(1);
      return city.state.tick;
    });
    check("the host's city got somewhere to save", savedAt > 0, `tick ${savedAt}`);
    await hostPage.goto(`${origin}/?life=0`);
    await hostPage.waitForSelector("#host-save", { timeout: 30_000 });
    await hostPage.click("#host-save");
    const fromSave = await until(hostPage, "the lobby never hosted the saved city", () => {
      const city = globalThis.CITY;
      if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
      return { ok: true, room: city.room, tick: city.state?.tick };
    }, undefined, 30_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("the lobby hosts a room from a saved city", fromSave.ok === true,
      fromSave.why ?? JSON.stringify(fromSave));
    check("and it is that city, not a new one", fromSave.tick >= savedAt,
      `saved at ${savedAt}, hosted at ${fromSave.tick}`);
    check("hosting from a save reported no page or console errors", hostErrors.length === 0,
      hostErrors.slice(0, 3).join(" | "));
  }
  await guestCtx.close();
  await hostCtx.close();

  // **Hibernating to disk, and waking up** (X4f). X4d stopped an empty room's
  // clock; the reaper then dropped the room five minutes later and the city with
  // it, as far as anybody holding the code could tell — the checkpoint file stayed
  // on the disk, nothing ever opened it, and `prune` deleted it unread. Driven
  // here rather than in node because the whole point is the DOOR: a player types
  // their own code into the lobby and the room is in a file.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error.message ?? error)));
    await page.goto(`${origin}/?life=0`);
    await page.waitForSelector("#host", { timeout: 30_000 });
    await page.click("#host");
    const hosted = await until(page, "the lobby never hosted a room to hibernate", () => {
      const city = globalThis.CITY;
      if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
      return { ok: true, room: city.room, seat: city.seat };
    }, undefined, 30_000);
    const slept = hosted.room.replace("-", "");
    const road = await page.evaluate(async () => {
      const city = globalThis.CITY;
      const { width, height, tiles } = city.state;
      for (let z = 10; z < height - 6; z += 1) {
        for (let x = 4; x + 6 < width - 4; x += 1) {
          const cells = Array.from({ length: 6 }, (unused, i) => z * width + x + i);
          const clear = cells.every((i) => tiles.terrain[i] !== 3 && tiles.terrain[i] !== 4
            && tiles.road[i] === 0 && tiles.buildingId[i] === 0);
          if (!clear) continue;
          const outcome = await city.apply({ type: "placeRoad", actor: city.seat, runs: [cells[0], 6] });
          return { result: outcome.result, first: cells[0] };
        }
      }
      return { result: "no dry ground" };
    });
    check("the room to be slept has something in it worth keeping", road.result === "ok",
      String(road.result));
    while (await page.evaluate(() => globalThis.CITY.pending > 0)) {
      await new Promise((done) => { setTimeout(done, 20); });
    }

    // Everybody leaves, and the city stands still rather than being dropped —
    // that is X4d, and it is the state the reaper finds.
    await ctx.close();
    const was = { tick: server.rooms.get(slept).tick(), hash: server.rooms.get(slept).hash() };
    while (server.rooms.get(slept).seats().length > 0) {
      await new Promise((done) => { setTimeout(done, 50); });
    }
    // The reaper's own clock, moved on rather than waited out: the first sweep
    // STAMPS the room and the second takes it, and the gap between the two has
    // to be longer than the registry's grace — five minutes by default, so a
    // thousand milliseconds apart reaps nothing and says so ("reaped 0").
    const far = Date.now() + 60 * 60 * 1000;
    server.rooms.reapEmpty(far);
    const reaped = server.rooms.reapEmpty(far + 10 * 60 * 1000);
    check("a room nobody came back to is dropped from memory", reaped >= 1
      && server.rooms.get(slept) === undefined, `reaped ${reaped}`);
    // **Waited for, not stat'ed once.** `reapEmpty` STARTS the write and does
    // not await it — the store is deliberately off the pump — so a gate that
    // reads the directory in the same turn is reading before the rename. It
    // passed alone and failed inside the set, which is the shape of every
    // race: the set is just slower. (`a-gate-that-counts-what-it-sent`.)
    let onDisk = 0;
    for (let attempt = 0; attempt < 50 && onDisk === 0; attempt += 1) {
      onDisk = await stat(join(roomDir, `${slept}.json`)).then((i) => i.size).catch(() => 0);
      if (onDisk === 0) await new Promise((done) => { setTimeout(done, 100); });
    }
    check("and it is on the disk, not gone", onDisk > 0, `${onDisk} bytes`);

    // And a player types their own code into the lobby, as they would an hour
    // later. Before X4f this answered "No room with that code" with the city in
    // a file beside the answer.
    const back = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const backPage = await back.newPage();
    const backErrors = [];
    backPage.on("pageerror", (error) => backErrors.push(String(error.message ?? error)));
    await backPage.goto(`${origin}/?join=${slept}&life=0`);
    const woke = await until(backPage, "the slept room never woke up", (first) => {
      const city = globalThis.CITY;
      if (!city || city.room === undefined) return { ok: false, why: city ? "no room" : "no CITY" };
      return {
        ok: true, room: city.room, tick: city.state?.tick, width: city.state?.width,
        road: city.state?.tiles?.road[first] ?? 0,
      };
    }, road.first, 30_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("a code whose room is on the disk still opens it", woke.ok === true,
      woke.why ?? JSON.stringify(woke));
    check("and it is the same city, at the hour it stopped", woke.tick >= was.tick,
      `slept at ${was.tick}, woke at ${woke.tick}`);
    check("and the road the host built is still there", woke.road > 0, `road ${woke.road}`);
    const again = server.rooms.get(slept);
    check("the woken room is registered under the same code, and beating",
      again !== undefined && server.rooms.pumpFor(slept) !== undefined, String(again?.code()));
    check("waking reported no page or console errors",
      errors.length === 0 && backErrors.length === 0,
      [...errors, ...backErrors].slice(0, 3).join(" | "));
    await back.close();
  }

  // **A stale client goes and gets the new build** (X6, v1.0's V2). The door
  // has refused `BUILD_MISMATCH` since X1b and the page has said "reload the
  // page to join" ever since — and a reload of a page served by a cache-first
  // worker fetches the SAME build, so the player reloads, is refused again, and
  // the first deploy after v1.0 does that to every phone that ever opened the
  // game. `?build=` is the lever that makes this drivable at all: every gate
  // otherwise runs the same tree as the server it talks to.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error.message ?? error)));
    let navigations = 0;
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    await page.goto(`${origin}/?join=${code}&build=a-deploy-behind&life=0`);
    const told = await until(page, "the stale client was never told anything", () => {
      const said = document.querySelector("#join-refusal, .join-refusal, [role='status']");
      const text = said?.textContent?.trim() ?? "";
      return { ok: text.length > 0, text, navigations: 0 };
    }, undefined, 20_000).catch((error) => ({ ok: false, why: String(error.message ?? error) }));
    check("a client a deploy behind is told the build is old, not that the room is missing",
      told.ok === true && /out of date|utdatert/i.test(told.text), told.why ?? JSON.stringify(told));
    // And it does not sit there: with no new worker to wait for, the page
    // reloads itself, which is the half that was missing. `?build=` is still in
    // the address bar, so it is refused again and goes round — which is why the
    // context is closed rather than waited on. A real client's reload fetches a
    // build that is no longer stale.
    await page.waitForTimeout(2500);
    check("and it goes and fetches the new build rather than waiting to be told twice",
      navigations > 1, `${navigations} navigation(s)`);
    check("the stale client reported no page errors", errors.length === 0,
      errors.slice(0, 3).join(" | "));
    await ctx.close();
  }

  // **The release gate at eight** (X7, v1.0's V4), in browsers. `room_soak
  // --eight` is the scripted half and proves the HASH; this is the half that
  // proves the PAGE, because eight real clients each run the renderer, the
  // HUD and the worker as well as the reducer.
  //
  // **And one of them is a phone.** `plan-v1.md` has named eight since August
  // and every browser in this file has been 1280×800: the join screen, the
  // roster, the inbox and the history had never been opened on a 390×844
  // screen at all, which is how the advisor card came to be swallowing the
  // press meant for the rail (X7, and `a11y_smoke`'s room row found it).
  {
    const extra = [];
    for (let n = 0; n < 6; n += 1) {
      // **Seat 0 is "any"** (X2b): by this point in the run other blocks have
      // taken and released seats, so naming numbers here would be a gate
      // asking for a chair somebody is sitting in. The door hands out the
      // lowest free one, and the check below is that they are all different.
      //
      // The last one is a phone. One rather than eight, because eight Chromium
      // contexts on one machine measure the machine — and the claim is that a
      // phone can be IN the room, not that eight phones can.
      const phone = n === 5;
      extra.push(await openClient(0, phone ? { width: 390, height: 844 } : undefined));
    }
    const everyone = [a, b, ...extra];
    check(`${everyone.length} browsers are in one room`,
      everyone.every((c) => c.joined.room === code), everyone.map((c) => c.joined.room).join(" "));
    check("and every one of them took a seat of its own",
      new Set(everyone.map((c) => c.joined.seat)).size === everyone.length,
      everyone.map((c) => c.joined.seat).join(" "));

    // Settle, then one hash. The room is the authority and eight pages have to
    // agree with it, which is the whole claim of the wave.
    const room = server.rooms.get(code) ?? server.room;
    room.setSpeed(0);
    await Promise.all(everyone.map(({ page }) => until(page, "a client never caught up", (want) => {
      const city = globalThis.CITY;
      return { ok: city.state.tick === want && city.pending === 0, tick: city.state.tick };
    }, room.tick(), 25_000).catch(() => undefined)));
    const hashes = await Promise.all(everyone.map(({ page }) =>
      page.evaluate(() => globalThis.CITY?.hash() ?? "none").catch(() => "error")));
    check("eight browsers and the room are on one hash",
      new Set([...hashes, room.hash()]).size === 1,
      hashes.map((h, i) => `${i + 1}:${String(h).slice(0, 8)}`).join(" "));
    room.setSpeed(2);

    // The phone, specifically: it is in the room and its panels open.
    const onPhone = extra.at(-1);
    const panels = await onPhone.page.evaluate(async () => {
      document.querySelector("#controls-dismiss")?.click();
      const out = {};
      for (const key of ["roster", "inbox", "chronicle"]) {
        document.querySelector(`#rail-${key}`)?.click();
        const rect = document.querySelector(`.hud-${key}`)?.getBoundingClientRect();
        out[key] = rect ? Math.round(rect.width) : 0;
      }
      return out;
    });
    check("and the phone can open the room's panels",
      Object.values(panels).every((w) => w > 40), JSON.stringify(panels));

    // **A room's rail is the longest one there is** (K6c): the seven a
    // singleplayer city has plus Requests and Players. It wrapped to two rows
    // at 390 px — which is where the "icons rather than words" note from the
    // first playtest on 2026-08-29 came from — and is one scrolling strip now.
    // Asked here because this is the only gate that has a phone IN a room.
    const strip = await onPhone.page.evaluate(() => {
      const rail = document.querySelector(".hud-rail");
      const buttons = [...rail.querySelectorAll(".rail-button")];
      const unreachable = [];
      for (const button of buttons) {
        button.scrollIntoView({ block: "nearest", inline: "nearest" });
        const b = button.getBoundingClientRect();
        const r = rail.getBoundingClientRect();
        if (!(b.width > 0 && b.left >= r.left - 1 && b.right <= r.right + 1
          && b.right <= window.innerWidth + 1)) unreachable.push(button.id || button.textContent);
      }
      rail.scrollLeft = 0;
      return {
        buttons: buttons.length,
        height: Math.round(rail.getBoundingClientRect().height),
        tallest: Math.round(Math.max(...buttons.map((b) => b.getBoundingClientRect().height))),
        more: rail.dataset.more ?? "none",
        unreachable,
      };
    });
    check("a room's phone rail carries every panel", strip.buttons >= 9, `${strip.buttons} buttons`);
    check("and it is one button high, with nine on it",
      strip.height <= strip.tallest + 2, `${strip.height}px of a ${strip.tallest}px button`);
    check("and says there is more to scroll to", strip.more !== "none", strip.more);
    check("and every one of them can be brought on screen",
      strip.unreachable.length === 0, strip.unreachable.join(", "));
    check("no client in the room reported a page error",
      everyone.every((c) => c.errors.length === 0),
      everyone.flatMap((c) => c.errors).slice(0, 3).join(" | "));

    for (const client of extra) await client.context.close();
  }

  // The desync detector, which is the one thing that must read zero.
  const desyncs = await Promise.all([a, b].map(({ page }) => page.evaluate(
    () => ({ desyncs: globalThis.CITY.desyncs, checks: globalThis.CITY.desyncChecks }))));
  check("neither mirror disagreed with its own simulation",
    desyncs.every((d) => d.desyncs === 0), JSON.stringify(desyncs));

  for (const client of [a, b]) {
    check(`seat ${client.seat} reported no page or console errors`, client.errors.length === 0,
      client.errors.slice(0, 3).join(" | "));
  }

  await a.context.close();
  await b.context.close();
} finally {
  await browser.close();
  await server.close();
  await rm(roomDir, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("\nroom smoke ok");
