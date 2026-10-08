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
import { joinReady, JOIN_FIELD_MAX, hostOptions } from "../client/lobby/join-model.js";
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
