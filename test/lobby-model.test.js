// The join screen's pure half (X2b, slice 5.2).
//
// The screen is three things: a code a player types, a name they may leave
// blank, and a button that must not be clickable while the code is nonsense.
// All three decisions live here so node can hold them, which is the same
// arrangement `client/lobby/options-model.js` has for the new-game rows and
// `client/world/` has for the renderer (the S1/B2 shape).
//
// What it deliberately does NOT decide: which seat. A player who types a code
// cannot know which seats are taken, so the door picks the lowest free one
// (X2b) and the screen never asks.

import test from "node:test";
import assert from "node:assert/strict";
import { joinReady, JOIN_FIELD_MAX, hostOptions, REFUSAL_LABELS, refusalKey,
  reloadFor, RELOAD_NOTICE } from "../client/lobby/join-model.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
import { REFUSAL } from "../shared/protocol.js";
import { optionsFor, sanitiseChoices } from "../client/lobby/options-model.js";
import { seatsForSize } from "../engine/options.js";
import { ROOM_CODE_LENGTH, formatRoomCode } from "../shared/roomcode.js";
import { NAME_MAX } from "../client/lobby/options-model.js";

const CHOICES = sanitiseChoices({ seed: 1003, size: 64 });

test("a code typed any way a player might type it is ready to join", () => {
  for (const typed of ["ABC123", "abc123", "ABC-123", "abc 123", " abc-123 ", "ABC_123"]) {
    const ready = joinReady({ code: typed });
    assert.equal(ready.ok, true, `"${typed}" was refused: ${ready.reasonKey}`);
    assert.equal(ready.join, "ABC123", `"${typed}" normalised to ${ready.join}`);
  }
  // And the confusables, because this is the field they exist for: a code read
  // aloud as "oh" is typed as the letter.
  assert.equal(joinReady({ code: "ABCDEO" }).join, "ABCDE0");
  assert.equal(joinReady({ code: "ABCDEl" }).join, "ABCDE1");
});

test("an empty field and a wrong code are told apart", () => {
  // Two different sentences, because they ask the player to do two different
  // things — type something, or check what they typed. The same distinction
  // X1b drew between `ROOM_FULL` and `SEAT_TAKEN`.
  assert.deepEqual(joinReady({ code: "" }), { ok: false, reasonKey: "lobby.join.needCode" });
  assert.deepEqual(joinReady({ code: "   " }), { ok: false, reasonKey: "lobby.join.needCode" });
  assert.deepEqual(joinReady({}), { ok: false, reasonKey: "lobby.join.needCode" });
  for (const bad of ["ABC", "ABCDEFG", "<ABCDEF>", "ABCDE!", "nonsense"]) {
    assert.deepEqual(joinReady({ code: bad }), { ok: false, reasonKey: "lobby.join.badCode" },
      `"${bad}" was not refused as a bad code`);
  }
});

test("the name is carried, capped and optional", () => {
  // Capped HERE as well as in the reducer: a field that lets a player type two
  // hundred characters and then silently keeps twenty-four is a field that
  // lies. `NAME_MAX` is the new-game screen's own cap, so there is one number.
  const long = "M".repeat(NAME_MAX * 3);
  const ready = joinReady({ code: "ABC123", name: long });
  assert.equal(ready.ok, true);
  assert.ok(ready.mayorName.length <= NAME_MAX, `${ready.mayorName.length} characters survived`);
  // Blank is blank, not a space: the room calls an unnamed joiner `Mayor <n>`,
  // and a name of one space would stand in the way of that.
  assert.equal(joinReady({ code: "ABC123", name: "   " }).mayorName, "");
  assert.equal(joinReady({ code: "ABC123" }).mayorName, "");
});

test("the field is wide enough for the code a player is shown", () => {
  // `formatRoomCode` puts a hyphen in the middle, so the field has to hold more
  // than the code: a `maxlength` of six would cut "ABC-12" out of "ABC-123" and
  // the player would be typing into a field that refuses the thing on the other
  // screen.
  assert.ok(JOIN_FIELD_MAX >= formatRoomCode("ABC123").length,
    `${JOIN_FIELD_MAX} cannot hold ${formatRoomCode("ABC123")}`);
  assert.ok(JOIN_FIELD_MAX > ROOM_CODE_LENGTH, "the field is no wider than the bare code");
  // And not so wide that it invites a paste of something else entirely.
  assert.ok(JOIN_FIELD_MAX <= ROOM_CODE_LENGTH + 4, `${JOIN_FIELD_MAX} is a paste target`);
});

test("a hosted room has room for other people in it (X2c)", () => {
  // `optionsFor(choices)` defaults to `seats: 1` — the singleplayer part, and
  // the one thing slice 5.2 was always going to change. Hosting with it gives a
  // room ONE seat, so the first guest is refused `ROOM_FULL`: `room_smoke`'s
  // guest came back "no CITY" and that was why.
  //
  // The number is not invented here. `seatsForSize` is the engine's own cap per
  // map size and has been tested since Wave 0, so a bigger region hosts more
  // players for the same reason it always could.
  for (const size of [48, 64, 96, 128]) {
    const options = hostOptions({ ...CHOICES, size });
    assert.equal(options.seats, seatsForSize(size), `a ${size} room has ${options.seats} seats`);
    assert.ok(options.seats > 1, `a hosted ${size} room has room for nobody else`);
    assert.equal(options.width, size, "the room is not the size that was chosen");
  }
  // And everything else is the record the lobby would have started on its own:
  // a host is choosing a city, not a different kind of city.
  const mine = hostOptions(CHOICES);
  const alone = optionsFor(CHOICES);
  for (const key of Object.keys(alone)) {
    if (key === "seats") continue;
    assert.deepEqual(mine[key], alone[key], `hosting changed ${key}`);
  }
});

// --- the door's refusal reaches the player (X2d) -----------------------------

test("every way the door can say no has words, and they are spelled out", () => {
  // X1b wrote the eight — nine now — refusals the door can give and put them in
  // both catalogues. **Nothing showed any of them.** A refused join landed in
  // `main.js`'s `failed()` and the player read "the city failed to start",
  // whether the room was full, the code was mistyped or their copy of the game
  // was two versions behind — and the two that say *reload the page* are the
  // ones a player most needs to read.
  //
  // Keyed off `REFUSAL` so a tenth refusal fails here rather than falling
  // through to the generic notice, and spelled as literals because
  // `t(`refused.${reason}`)` is invisible to every reachability scan in the
  // project (the `a-key-assembled-at-runtime-is-invisible` lesson).
  const codes = Object.values(REFUSAL);
  assert.equal(Object.keys(REFUSAL_LABELS).length, codes.length,
    "the door has a refusal the lobby has no label for, or a label for one it cannot give");
  for (const code of codes) {
    assert.equal(refusalKey(code), `refused.${code}`, `${code} has no label`);
  }
});

test("a refusal this build has no words for gets no words, not the wrong ones", () => {
  // `undefined`, deliberately: showing a sentence about a DIFFERENT refusal is
  // worse than the generic one, which is the lesson X1b drew when `ROOM_FULL`
  // was answering for a taken seat — a refusal that lies about what to do next.
  assert.equal(refusalKey("somethingFromTheFuture"), undefined);
  assert.equal(refusalKey(undefined), undefined);
  assert.equal(refusalKey(""), undefined);
});

// --- X6: the stale client reloads --------------------------------------------
//
// `compatible()` has refused `BUILD_MISMATCH` since X1b and the join screen has
// had the words since X2b. What has never existed is the ACTION: a player on a
// cached old build is told to reload, presses reload, and a cache-first service
// worker serves them the same old build again. The first deploy after v1.0
// would do that to every phone that had ever opened the game.

test("only a build mismatch asks the page to go and get the new build (X6)", () => {
  // Not every refusal: a full room, a mistyped code or a taken seat are all
  // answered by the player doing something else, and reloading on them would
  // be a page that throws itself away whenever anything goes wrong.
  assert.equal(reloadFor(REFUSAL.BUILD_MISMATCH, "43879f3c6729"), true);
  for (const reason of Object.values(REFUSAL)) {
    if (reason === REFUSAL.BUILD_MISMATCH) continue;
    assert.equal(reloadFor(reason, "43879f3c6729"), false, `${reason} asked for a reload`);
  }
});

test("a dev build never reloads itself, however stale the room says it is (X6)", () => {
  // `readBuildHash` falls back to `"dev"` when there is no manifest, which is
  // every `node server/index.js` run from a tree with no precache. A page that
  // reloaded on that would loop: the reload fetches the same tree, the hash is
  // still `dev`, the room still refuses.
  assert.equal(reloadFor(REFUSAL.BUILD_MISMATCH, "dev"), false);
  assert.equal(reloadFor(REFUSAL.BUILD_MISMATCH, ""), false);
  assert.equal(reloadFor(REFUSAL.BUILD_MISMATCH, undefined), false);
});

test("the player is told what is about to happen, in both catalogues (X6)", () => {
  // A page that reloads itself with no warning is a page that lost the player's
  // typed code for no reason they can see.
  // `status.` and not `refused.`: the refusal namespace is a closed list keyed
  // off `REFUSAL`, and this is what happens after one.
  assert.equal(RELOAD_NOTICE, "status.fetchingBuild");
  for (const locale of ["en", "no"]) {
    const strings = JSON.parse(readFileSync(join(root, "data", "i18n", `${locale}.json`), "utf8"));
    assert.ok(strings[RELOAD_NOTICE], `${locale} has no ${RELOAD_NOTICE}`);
    assert.ok(strings["status.resynced"], `${locale} has no status.resynced`);
  }
});
