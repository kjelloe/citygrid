// What happened while you were away (X4h, slice 5.4).
//
// The alert list IS the activity feed — X3b's finding, once `sim.onChange`
// stopped dropping other seats' events. What it is not is a RECORD: alerts live
// in the page, collapse by kind, expire after two sim-years and are capped at
// what fits on screen, so a player who closed the tab has none of them. This is
// the half that survives, and it survives because it is STATE.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_LEAVE, CMD_SET_STATUS, CMD_PLACE_ROAD, CMD_TICK, CMD_BULLDOZE,
  CMD_REQUEST_DEMOLITION, CMD_RESOLVE_REQUEST, CMD_WITHDRAW_REQUEST,
  CMD_REPORT_NUISANCE } from "../engine/commands.js";
import { PLAYER_AFK, PLAYER_REGENT, PLAYER_GONE } from "../engine/constants.js";
import { CHRONICLE_CAP, CHRONICLED, chronicle } from "../engine/chronicle.js";
import { toSave, fromSave } from "../engine/save.js";
import { chronicleRows, STATUS_LABELS, RESOLUTION_LABELS,
  CHRONICLE_LABELS } from "../client/ui/chronicle-model.js";
import { TICKS_PER_MONTH } from "../engine/constants.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { RESULT } from "../shared/protocol.js";
import { loadSystems } from "../tools/fixtures.mjs";

await loadSystems();

const city = () => createState(defaultOptions({ width: 16, height: 16, seed: 3, seats: 4 }));

test("a new city has an empty record and not an absent one", () => {
  const state = city();
  assert.deepEqual(state.chronicle, { entries: [] },
    "a city with no past is not a city with no chronicle");
});

test("the commands worth remembering are remembered, through the reducer", () => {
  // Written in `apply`, after the command, which is the one place every
  // handler's events pass through — so a new handler cannot be forgotten, and
  // the DEPUTY's commands are recorded on the same terms as a player's, which
  // is the half "what did the deputy do while I was gone" needs.
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  apply(state, { type: CMD_SET_STATUS, actor: 2, status: PLAYER_AFK });
  apply(state, { type: CMD_LEAVE, actor: 2 });
  assert.deepEqual(state.chronicle.entries.map((e) => `${e.kind}:${e.seat}`),
    ["seatJoined:1", "seatJoined:2", "seatStatus:2", "seatLeft:2"]);
});

test("a refused command leaves no trace", () => {
  // The record is of what HAPPENED. A refusal is not news about the city, and a
  // chronicle full of somebody's mistakes would push out the entries the
  // feature exists for.
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  const before = state.chronicle.entries.length;
  assert.notEqual(apply(state, { type: CMD_SET_STATUS, actor: 9, status: PLAYER_AFK }).result, "ok");
  assert.equal(state.chronicle.entries.length, before, "a refusal was written down");
});

test("it is a ring: the oldest goes when the newest arrives", () => {
  // A save that grows without bound is a save that eventually will not cross a
  // wire — which X2d found the hard way at 32 KB.
  const state = city();
  for (let i = 0; i < CHRONICLE_CAP + 10; i += 1) {
    chronicle(state, [{ kind: "disasterStruck", x: i, z: i }]);
  }
  assert.equal(state.chronicle.entries.length, CHRONICLE_CAP);
  assert.equal(state.chronicle.entries[0].x, 10, "the ring dropped the wrong end");
  assert.equal(state.chronicle.entries[CHRONICLE_CAP - 1].x, CHRONICLE_CAP + 9);
});

test("only the listed kinds are kept, and the list is the decision", () => {
  // Spelled out rather than "everything with a seat on it": a kind that started
  // appearing because somebody added an event elsewhere would change what a
  // save contains without anybody choosing it.
  const state = city();
  chronicle(state, [{ kind: "built", actor: 1 }, { kind: "budget" }, { kind: "zoned", actor: 1 }]);
  assert.deepEqual(state.chronicle.entries, [], "an unlisted kind was written down");
  for (const kind of CHRONICLED) {
    const one = city();
    chronicle(one, [{ kind, actor: 1 }]);
    assert.equal(one.chronicle.entries.length, 1, `${kind} is on the list and was not kept`);
  }
});

test("a place is kept where there is one, and -1 where there is not", () => {
  // The panel makes a row with a place clickable, exactly as the alert list
  // does for a ping. `0,0` is a real tile, so absence cannot be zero.
  const state = city();
  chronicle(state, [{ kind: "disasterStruck", x: 0, z: 0 }]);
  chronicle(state, [{ kind: "seatLeft", seat: 2 }]);
  assert.deepEqual(state.chronicle.entries.map((e) => [e.x, e.y]), [[0, 0], [-1, -1]]);
});

test("the record is hashed, so two clients cannot disagree about it", () => {
  // It is state, which is the whole point: every client derives it from the
  // same commands in the same order and a returning player gets it in the
  // WELCOME. A field in the state and not in the hash would be a field two
  // seats could differ on for ever.
  const a = city();
  const b = city();
  assert.equal(hashState(a), hashState(b));
  chronicle(a, [{ kind: "seatLeft", seat: 2 }]);
  assert.notEqual(hashState(a), hashState(b), "the chronicle is not in the hash");
});

test("it survives a save, and an older save gets an empty one", () => {
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  const back = fromSave(toSave(state));
  assert.equal(back.ok, true, back.reason);
  assert.deepEqual(back.state.chronicle, state.chronicle);
  assert.equal(hashState(back.state), hashState(state), "the save does not round-trip");

  // A version 6 save has no chronicle and no business inventing one: entries
  // for events nobody witnessed would be a history the city never had.
  const old = toSave(state);
  delete old.chronicle;
  old.v = 6;
  delete old.hash;
  const migrated = fromSave(old);
  assert.equal(migrated.ok, true, migrated.reason);
  assert.deepEqual(migrated.state.chronicle, { entries: [] });
});

// --- and what the panel makes of it ------------------------------------------

test("the rows are newest first, named, and clickable where there is a place", () => {
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  chronicle(state, [{ kind: "disasterStruck", x: 4, z: 9 }]);
  const rows = chronicleRows(state);
  assert.deepEqual(rows.map((r) => r.textKey),
    ["chronicle.disasterStruck", "chronicle.seatJoined", "chronicle.seatJoined"]);
  assert.deepEqual(rows[0].at, { x: 4, y: 9 }, "a disaster has nowhere to go");
  assert.equal(rows[1].name, "Grace", "newest first, so the second row is the later join");
  assert.equal(rows[2].at, undefined, "a join is not a place");
});

test("a status change is four sentences, not one with a word swapped", () => {
  // "went away" and "was handed to the deputy" are not the same event with a
  // different noun, so they are not the same string with a different token.
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  for (const [status, key] of [[PLAYER_AFK, "chronicle.statusAway"],
    [PLAYER_REGENT, "chronicle.statusRegent"], [PLAYER_GONE, "chronicle.statusGone"]]) {
    const one = city();
    chronicle(one, [{ kind: "seatStatus", seat: 1, status }]);
    assert.equal(chronicleRows(one)[0].textKey, key);
  }
  assert.equal(new Set(Object.values(STATUS_LABELS)).size, 4, "two statuses share a sentence");
});

test("a request names both sides, and the resolution names who answered", () => {
  // The first run of `room_smoke` read "Mayor 0 agreed to clear the ground":
  // `requestResolved` carried an id and a status, which is enough for an alert
  // that says "a request ended" and not enough for a row a player reads an
  // hour later. A request is BETWEEN two people both ways round — and the
  // answerer is not always the owner, because a derelict override is somebody
  // else's approval.
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const theirs = [tileAt(16, 6, 6), tileAt(16, 7, 6)];
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(theirs) }).result,
    RESULT.OK, "the test's own road was refused");
  assert.equal(apply(state, {
    type: CMD_REQUEST_DEMOLITION, actor: 1, runs: encodeRuns(theirs),
    title: "Your road blocks my pipe", reason: "It runs through my water main", offer: 0,
  }).result, RESULT.OK);
  const id = state.requests[0].id;
  assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve: true }).result,
    RESULT.OK);

  const rows = chronicleRows(state);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.textKey, r.name, r.other]), [
    ["chronicle.approved", "Grace", "Ada"],
    ["chronicle.requestFiled", "Ada", "Grace"],
  ]);
});

test("every way a request can end has a sentence, and every sentence an ending", () => {
  // Driven rather than transcribed: the five resolutions are collected from a
  // city that actually produced them, and held against the panel's catalogue
  // in BOTH directions. The second direction is the one that found something —
  // `chronicle.withdrawn` sat in `RESOLUTION_LABELS` where `how` could never
  // hold the word, because a withdrawal is its own event kind and the
  // chronicler had no rule for it. The row did not exist at all.
  const state = createState(defaultOptions({
    width: 16, height: 16, seed: 3, seats: 4, requestExpiryMonths: 1,
  }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const road = (x) => {
    const cells = [tileAt(16, x, 6), tileAt(16, x + 1, 6)];
    assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(cells) }).result,
      RESULT.OK, "the test's own road was refused");
    return cells;
  };
  const ask = (cells) => {
    assert.equal(apply(state, {
      type: CMD_REQUEST_DEMOLITION, actor: 1, runs: encodeRuns(cells),
      title: "Your road blocks my pipe", reason: "", offer: 0,
    }).result, RESULT.OK);
    return state.requests[state.requests.length - 1].id;
  };
  const answer = (id, approve) =>
    assert.equal(apply(state, { type: CMD_RESOLVE_REQUEST, actor: 2, id, approve }).result, RESULT.OK);

  answer(ask(road(2)), true);                       // approved
  answer(ask(road(5)), false);                      // declined
  const reported = road(8);
  assert.equal(apply(state, {
    type: CMD_REPORT_NUISANCE, actor: 1, runs: encodeRuns(reported),
    title: "Your road is noisy", reason: "", offer: 0,
  }).result, RESULT.OK);
  answer(state.requests[state.requests.length - 1].id, true);   // acknowledged
  const withdrawn = ask(road(11));
  assert.equal(apply(state, { type: CMD_WITHDRAW_REQUEST, actor: 1, id: withdrawn }).result,
    RESULT.OK);                                     // withdrawn — its own kind
  const mooted = road(13);
  ask(mooted);
  // The owner clears it themselves, which is their right and makes the request
  // meaningless rather than wrong.
  apply(state, { type: CMD_BULLDOZE, actor: 2, runs: encodeRuns(mooted) });
  ask(road(2));                                     // expires: its ground stays
  for (let n = 0; n < TICKS_PER_MONTH; n += 1) apply(state, { type: CMD_TICK });

  const seen = new Set(state.chronicle.entries
    .filter((e) => e.kind === "requestResolved").map((e) => e.how));
  assert.deepEqual([...seen].sort(), Object.keys(RESOLUTION_LABELS).sort(),
    "a resolution with no sentence, or a sentence for an ending nothing emits");
  assert.ok(state.chronicle.entries.some((e) => e.kind === "requestWithdrawn"),
    "a withdrawal left no row, so an owner never learns their inbox emptied");
  assert.ok(chronicleRows(state).every((r) => r.textKey !== CHRONICLE_LABELS.requestResolved),
    "a resolution fell back to the generic sentence");
});

test("a nuisance report is not a demolition request with a different noun", () => {
  // §25.4: a report cannot force a change, so a row calling it a request for
  // ground would be the panel arguing with the design. The entry carries the
  // request KIND in the same short string a resolution uses for its ending —
  // one field read through `kind`, which every reader already switches on.
  const state = city();
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Ada" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Grace" });
  const cells = [tileAt(16, 6, 6), tileAt(16, 7, 6)];
  assert.equal(apply(state, { type: CMD_PLACE_ROAD, actor: 2, runs: encodeRuns(cells) }).result,
    RESULT.OK);
  assert.equal(apply(state, {
    type: CMD_REPORT_NUISANCE, actor: 1, runs: encodeRuns(cells),
    title: "Your road is noisy", reason: "", offer: 0,
  }).result, RESULT.OK);
  const [row] = chronicleRows(state);
  assert.equal(row.textKey, CHRONICLE_LABELS.reportFiled);
  assert.deepEqual([row.name, row.other], ["Ada", "Grace"]);
});

test("a row this build has no words for is left out, not left blank", () => {
  // The catalogue is the list of what the panel can SAY. A kind the engine
  // starts emitting and nobody has written a sentence for would otherwise read
  // as its own key on screen, which is what `t()` does on a miss.
  const state = city();
  state.chronicle.entries.push({ kind: "somethingNew", how: "", tick: 1, seat: 1, other: 0, x: -1, y: -1, status: 0 });
  assert.deepEqual(chronicleRows(state), []);
});
