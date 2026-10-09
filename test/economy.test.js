// Slice 2.3: taxes, upkeep and the monthly budget.
//
// Accounting is per owner from the start, even at one seat — retrofitting
// per-owner money into a system that assumed one purse is the same mistake as
// retrofitting ownership into the reducer.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { TREASURY_SPLIT, TREASURY_SEPARATE } from "../engine/constants.js";
import * as constants from "../engine/constants.js";
const TREASURY_SHARED = constants.TREASURY_SHARED;
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import { budgetFor, economyPass, loanCeiling } from "../engine/economy.js";
import { developmentPass } from "../engine/development.js";
import {
  CMD_JOIN, CMD_SET_TAX, CMD_PLACE_ROAD, CMD_PLACE_BUILDING, CMD_TAKE_LOAN, CMD_REPAY_LOAN,
} from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_NONE } from "../engine/constants.js";
import { rules } from "../engine/rules.js";

const W = 20;
const at = (x, y) => tileAt(W, x, y);

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 21, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  return state;
}

/** The city's rank, which is a quest variable (`engine/unlock.js`): the loan
 * ceiling is a ladder, and a test that cannot climb it tests one rung. */
function setRank(state, value) {
  state.quests.vars = state.quests.vars.filter((v) => v.name !== "rank");
  state.quests.vars.push({ name: "rank", value });
  state.quests.vars.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function addLot(state, owner, zone, x, y, level = 2, occupancy = 20) {
  state.buildings.push({
    id: state.nextId, def: zone === ZONE_RESIDENTIAL ? "res" : "com", zone, x, y, w: 1, h: 1,
    owner, level, valueTier: 1, occupancy, condition: 100, builtTick: 0, flags: 0,
  });
  state.nextId += 1;
  state.tiles.buildingId[at(x, y)] = state.nextId - 1;
  state.tiles.landValue[at(x, y)] = 120;
}

test("the tax rate can be set within its range and refused outside it", () => {
  const state = city();
  assert.equal(apply(state, { type: CMD_SET_TAX, actor: 1, rate: 12 }).result, RESULT.OK);
  assert.equal(state.tax, 12);
  for (const rate of [-1, 21, 1.5, undefined, "7", NaN]) {
    assert.equal(apply(state, { type: CMD_SET_TAX, actor: 1, rate }).result, RESULT.INVALID,
      `rate ${String(rate)} was accepted`);
  }
  assert.equal(state.tax, 12, "a refused rate did not stick");
});

test("residents pay tax, and more of it at a higher rate", () => {
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 5;
  const low = budgetFor(state, 1).income;
  state.tax = 15;
  const high = budgetFor(state, 1).income;
  assert.ok(low > 0, "an occupied home should yield something");
  assert.ok(high > low, `${high} should exceed ${low}`);
});

test("land value is worth as much as headcount", () => {
  // Which is what makes parks and waterfronts an economic decision rather
  // than decoration.
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 10;
  state.tiles.landValue[at(3, 3)] = 60;
  const poor = budgetFor(state, 1).income;
  state.tiles.landValue[at(3, 3)] = 240;
  assert.ok(budgetFor(state, 1).income > poor);
});

test("an empty home yields nothing", () => {
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3, 2, 0);
  state.tax = 10;
  assert.equal(budgetFor(state, 1).income, 0);
});

test("income and upkeep are attributed to the right owner", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  addLot(state, 2, ZONE_RESIDENTIAL, 5, 5);
  state.tax = 10;
  assert.ok(budgetFor(state, 1).income > 0);
  assert.ok(budgetFor(state, 2).income > 0);
  assert.equal(budgetFor(state, 3).income, 0, "a seat with nothing earns nothing");
});

test("roads, wires and pipes all cost their owner upkeep", () => {
  const state = city({ treasury: "separate" });
  const bare = budgetFor(state, 1).expenses;
  const cells = [];
  for (let x = 2; x < 12; x += 1) cells.push(at(x, 8));
  state.players[0].treasury = 100000;
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  const withRoad = budgetFor(state, 1).expenses;
  assert.ok(withRoad > bare, "a road should cost something to keep");
});

test("a placed building costs its catalogue upkeep", () => {
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 100000;
  const before = budgetFor(state, 1).expenses;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  assert.equal(budgetFor(state, 1).expenses - before, 80, "coal plant upkeep");
});

test("difficulty scales both sides of the ledger", () => {
  const yieldAt = (difficulty) => {
    const state = city({ difficulty, treasury: "separate" });
    addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
    state.tax = 10;
    return budgetFor(state, 1).income;
  };
  assert.ok(yieldAt("relaxed") > yieldAt("steady"));
  assert.ok(yieldAt("steady") > yieldAt("demanding"));
});

test("a monthly pass moves money and reports the budget", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 10;
  const before = state.players[0].treasury;
  const events = economyPass(state);
  assert.ok(state.players[0].treasury > before, "income was not paid");
  assert.ok(events.some((e) => e.kind === "budget" && e.seat === 1));
});

test("a city that cannot pay does not run up an unbounded overdraft", () => {
  // Twenty years of silent debt reaching -130,000 is not a balance question,
  // it is a missing rule. It fails to maintain what it has instead.
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 10;
  state.players[1].treasury = 10;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  state.players[0].treasury = 10;
  for (let i = 0; i < 24; i += 1) economyPass(state);
  assert.ok(state.players[0].treasury >= 0, `treasury fell to ${state.players[0].treasury}`);
});

test("an unpayable bill is reported rather than absorbed silently", () => {
  const state = city({ treasury: "separate" });
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  state.players[0].treasury = 5;
  const events = economyPass(state);
  assert.ok(events.some((e) => e.kind === "unpaidUpkeep" && e.seat === 1));
});

test("the player is warned before the money runs out, not after", () => {
  // gamedesign 9.5: warnings before bankruptcy, never losing without notice.
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 500;
  const events = economyPass(state);
  assert.ok(events.some((e) => e.kind === "fundsLow" && e.seat === 1));
});

test("a shared treasury divides the region's net between the seats", () => {
  const state = city({ treasury: "shared" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 12;
  const before = state.players[1].treasury;
  economyPass(state);
  assert.ok(state.players[1].treasury > before, "seat two should share seat one's income");
});

// --- X4g: the split rule, era 31 ---------------------------------------------
//
// `TREASURY_SHARED` and `TREASURY_SPLIT` did the same arithmetic until now —
// both divided the region's net equally — and `splitRule` was one of the
// options `test/omissions.test.js` has pinned as unread since Wave 0, with a
// comment in `economyPass` saying "the rule is one line". It is one line, and
// the line is only worth writing if it can say something the equal split
// cannot: that a seat housing three quarters of the region's residents has
// three quarters of the region's costs.

test("a split treasury divides by the rule the lobby chose, and loses no coin (X4g)", () => {
  // Seat one houses 90 residents, seat two 30: three quarters against one.
  const byHead = city({ treasury: "split", splitRule: "population" });
  addLot(byHead, 1, ZONE_RESIDENTIAL, 3, 3, 2, 90);
  addLot(byHead, 2, ZONE_RESIDENTIAL, 6, 3, 2, 30);
  byHead.tax = 12;
  const was = byHead.players.map((p) => p.treasury);
  const events = economyPass(byHead);
  const net = events.find((e) => e.kind === "budget" && e.seat === undefined).net;
  const got = byHead.players.map((p, i) => p.treasury - was[i]);

  assert.equal(got[0] + got[1], net, "the split minted or lost money");
  assert.ok(got[0] > got[1] * 2, `by population seat one takes most of ${net}: ${got.join(" / ")}`);

  // And the equal rule on the same city, which is the arm the era report runs:
  // same net, different shares.
  const equal = city({ treasury: "split", splitRule: "equal" });
  addLot(equal, 1, ZONE_RESIDENTIAL, 3, 3, 2, 90);
  addLot(equal, 2, ZONE_RESIDENTIAL, 6, 3, 2, 30);
  equal.tax = 12;
  const flat = equal.players.map((p) => p.treasury);
  const flatEvents = economyPass(equal);
  const flatNet = flatEvents.find((e) => e.kind === "budget" && e.seat === undefined).net;
  const shares = equal.players.map((p, i) => p.treasury - flat[i]);
  assert.equal(flatNet, net, "the two rules are measuring different cities");
  assert.equal(shares[0] + shares[1], net, "the equal split minted or lost money");
  // Equal to within the remainder, which goes to the lowest seat rather than
  // being dropped: `idiv(net, seats)` each lost up to one coin per seat per
  // month for sixteen seats, every month, which is not nothing over 25 years.
  assert.ok(Math.abs(shares[0] - shares[1]) <= 1,
    `the equal rule stopped being equal: ${shares.join(" / ")}`);
});

test("a region with nobody living in it falls back to the equal share (X4g)", () => {
  // A proportional rule with a total of zero is a division by zero in disguise:
  // every share would be 0 and the whole net would vanish into the remainder.
  // Equal shares are what "by population" MEANS in a city with no population.
  const state = city({ treasury: "split", splitRule: "population" });
  addLot(state, 1, ZONE_COMMERCIAL, 3, 3, 2, 0);
  state.tax = 12;
  const was = state.players.map((p) => p.treasury);
  const events = economyPass(state);
  const net = events.find((e) => e.kind === "budget" && e.seat === undefined).net;
  const got = state.players.map((p, i) => p.treasury - was[i]);
  assert.equal(got[0] + got[1], net);
  assert.ok(Math.abs(got[0] - got[1]) <= 1,
    `with nobody housed the shares are not equal: ${got.join(" / ")}`);
});

test("a seat housing nobody still pays its share of a LOSS (X4g)", () => {
  // The direction nobody checks. Proportional-to-population on a negative net
  // means the big seat carries the deficit, which is the point — but a seat
  // with no residents and a bill of its own must not be made whole by the
  // rule, or an empty seat is the cheapest seat to play.
  const state = city({ treasury: "split", splitRule: "population" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3, 2, 80);
  // Seat two owns a station: upkeep and no residents.
  state.buildings.push({
    id: state.nextId, def: "fireStation", zone: ZONE_NONE, x: 8, y: 8, w: 2, h: 2,
    owner: 2, level: 1, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  });
  state.nextId += 1;
  state.tax = 0;
  const was = state.players.map((p) => p.treasury);
  const events = economyPass(state);
  const net = events.find((e) => e.kind === "budget" && e.seat === undefined).net;
  assert.ok(net < 0, `the test needs a loss to divide: ${net}`);
  const got = state.players.map((p, i) => p.treasury - was[i]);
  assert.equal(got[0] + got[1], net, "the loss minted or lost money");
  assert.ok(got[0] < got[1], `the housed seat carries more of the loss: ${got.join(" / ")}`);
});

test("separate treasuries do not share", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 12;
  const before = state.players[1].treasury;
  economyPass(state);
  assert.equal(state.players[1].treasury, before, "seat two earned from seat one's lot");
});

test("the economy is deterministic", () => {
  const a = city({ treasury: "separate" });
  const b = city({ treasury: "separate" });
  addLot(a, 1, ZONE_RESIDENTIAL, 3, 3);
  addLot(b, 1, ZONE_RESIDENTIAL, 3, 3);
  a.tax = 9;
  b.tax = 9;
  for (let i = 0; i < 30; i += 1) {
    economyPass(a);
    economyPass(b);
  }
  assert.equal(hashState(a), hashState(b));
});

// --- a lot costs money to serve (slice H8; A101, Q118) -----------------------

test("a developed lot costs the city money, and more as it grows", () => {
  // Q118: every income term in this project was decoration, because income ran
  // FOUR TIMES expenses at every size and every difficulty — a steady 25-year
  // city took 20,268 a month and spent 5,048, and banked the difference for
  // twenty-five years. The reason is here: a developed lot paid tax and cost
  // nothing, while the only expenses were the civic buildings and a penny a
  // road tile.
  //
  // Per-TILE upkeep was tried twice and rejected twice (era 0 and era 1): it
  // bankrupts a young town without touching a rich one. This scales with what
  // the city has GROWN.
  const state = city();
  const ladder = rules().economy.serviceCostPerLevel;
  const bare = budgetFor(state, 1).expenses;

  addLot(state, 1, ZONE_RESIDENTIAL, 6, 6, 1);
  const lot = state.buildings[state.buildings.length - 1];
  const one = budgetFor(state, 1).expenses;
  assert.equal(one - bare, ladder[0] * lot.w * lot.h,
    "a level-1 lot costs the city nothing to serve");

  lot.level = 4;
  const four = budgetFor(state, 1).expenses;
  assert.equal(four - bare, ladder[3] * lot.w * lot.h,
    "a tower costs the same as the cottage it replaced");
  assert.ok(ladder[3] > ladder[0] * 3, "the ladder is not steep enough to be a ladder");
});

test("a village pays village money", () => {
  // The shape that got per-tile upkeep rejected twice: a young town has a lot of
  // road and almost no city, so a charge on what it has PAVED bankrupts it while
  // a charge on what it has GROWN does not.
  const state = city();
  const before = budgetFor(state, 1);
  for (let i = 0; i < 9; i += 1) addLot(state, 1, ZONE_RESIDENTIAL, 4 + i, 4, 1);
  const after = budgetFor(state, 1);
  const ladder = rules().economy.serviceCostPerLevel;
  assert.equal(after.expenses - before.expenses, 9 * ladder[0],
    "nine cottages cost more than nine cottages");
  assert.ok(after.expenses - before.expenses < 300,
    `${after.expenses - before.expenses} a month is not village money`);
});

// --- the difficulties still order the way they say they do (J4; A106, Q141) --

test("a harder difficulty keeps less of its tax and pays more of its upkeep", () => {
  // The invariant a re-cut can quietly break. J4 took demanding's squeeze from
  // 80/120 to 90/110 so that it could absorb H8's service cost — the lever had
  // shipped at a third of its worth because demanding had nothing to absorb it
  // with — and a difficulty table is three numbers that only mean something
  // against each other.
  const order = ["relaxed", "steady", "demanding"];
  const yields = order.map((name) => rules().difficulty[name].taxYieldPercent);
  const upkeeps = order.map((name) => rules().difficulty[name].upkeepPercent);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(yields[i] < yields[i - 1],
      `${order[i]} keeps ${yields[i]}% of its tax and ${order[i - 1]} keeps ${yields[i - 1]}%`);
    assert.ok(upkeeps[i] > upkeeps[i - 1],
      `${order[i]} pays ${upkeeps[i]}% of its upkeep and ${order[i - 1]} pays ${upkeeps[i - 1]}%`);
  }
  // And the squeeze is still a squeeze: the hardest difficulty keeps less than
  // it spends, proportionally, or "demanding" is a label on nothing.
  assert.ok(yields[2] < upkeeps[2], "demanding keeps more of its tax than it pays of its upkeep");
});

test("the same city is richer on an easier difficulty", () => {
  // Asserted through `budgetFor`, which is where the two percentages meet, so a
  // re-cut that reversed one of them would be caught by arithmetic rather than
  // by reading the table.
  const nets = [];
  for (const difficulty of ["relaxed", "steady", "demanding"]) {
    const state = city({ difficulty });
    for (let i = 0; i < 6; i += 1) addLot(state, 1, ZONE_RESIDENTIAL, 4 + i, 4, 3, 40);
    apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "fireStation", x: 10, y: 10 });
    nets.push(budgetFor(state, 1).net);
  }
  assert.ok(nets[0] > nets[1] && nets[1] > nets[2],
    `relaxed ${nets[0]}, steady ${nets[1]}, demanding ${nets[2]}`);
});


// --- borrowing (L1, A130) ----------------------------------------------------
//
// `specs/gamedesign.md` §9.5 has described a loan since the first draft and
// `CMD_TAKE_LOAN` has had a constant and no handler since the first commit.
// Era 21 (H8) is what made it matter: a developed lot costs money to serve, so
// a city can be short of cash while being worth lending to.

test("a loan raises the treasury and the debt by the same amount", () => {
  const state = city();
  setRank(state, 2);
  const before = state.players[0].treasury;
  const out = apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 5000 });
  assert.equal(out.result, RESULT.OK);
  assert.equal(state.players[0].treasury, before + 5000);
  assert.equal(state.players[0].debt, 5000);
  // And it is the borrower's money, not the region's.
  assert.equal(state.players[1].debt, 0);
});

test("the ceiling is the rank's, and asking past it is refused with a reason", () => {
  const state = city();
  setRank(state, 0);
  const ceiling = loanCeiling(state);
  assert.ok(ceiling > 0, "a town at rank 0 cannot borrow at all, which is not a ladder");

  assert.equal(apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: ceiling + 1 }).result,
    RESULT.AT_CEILING, "a loan past the ceiling was allowed");
  assert.equal(state.players[0].debt, 0, "a refused loan still moved the books");

  // At the ceiling exactly is allowed; one more after that is not.
  assert.equal(apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: ceiling }).result, RESULT.OK);
  assert.equal(apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 1 }).result, RESULT.AT_CEILING);

  // A higher rank lends more: the ladder is the point.
  setRank(state, 3);
  assert.ok(loanCeiling(state) > ceiling, "rank 3 lends no more than rank 0");
});

test("a loan of nothing, or of a fraction, is invalid", () => {
  const state = city();
  for (const amount of [0, -100, 12.5, undefined, "1000"]) {
    assert.equal(apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount }).result, RESULT.INVALID,
      `${amount} was accepted as a loan`);
  }
});

test("a debt you cannot pay down is a trap, so there is a repayment", () => {
  const state = city();
  setRank(state, 2);
  apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 4000 });
  const purse = state.players[0].treasury;

  assert.equal(apply(state, { type: CMD_REPAY_LOAN, actor: 1, amount: 1500 }).result, RESULT.OK);
  assert.equal(state.players[0].debt, 2500);
  assert.equal(state.players[0].treasury, purse - 1500);

  // Repaying more than is owed repays what is owed, and no more.
  assert.equal(apply(state, { type: CMD_REPAY_LOAN, actor: 1, amount: 99999 }).result, RESULT.OK);
  assert.equal(state.players[0].debt, 0);
  assert.equal(state.players[0].treasury, purse - 4000);

  // And money you do not have cannot be repaid.
  apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 2000 });
  state.players[0].treasury = 10;
  assert.equal(apply(state, { type: CMD_REPAY_LOAN, actor: 1, amount: 2000 }).result, RESULT.NO_FUNDS);
  assert.equal(state.players[0].debt, 2000, "a refused repayment moved the debt");
});

test("interest is billed with the month, integer, and monotone in the debt", () => {
  const small = city();
  const large = city();
  setRank(small, 3);
  setRank(large, 3);
  apply(small, { type: CMD_TAKE_LOAN, actor: 1, amount: 2000 });
  apply(large, { type: CMD_TAKE_LOAN, actor: 1, amount: 20000 });
  const before = { small: small.players[0].treasury, large: large.players[0].treasury };

  const paidBy = (state) => {
    economyPass(state);
    return before[state === small ? "small" : "large"] - state.players[0].treasury;
  };
  const littleBill = paidBy(small);
  const bigBill = paidBy(large);
  assert.ok(Number.isInteger(littleBill) && Number.isInteger(bigBill), "interest is not an integer");
  assert.ok(bigBill > littleBill, `${bigBill} on 20,000 is not more than ${littleBill} on 2,000`);
  // The debt itself does not grow: interest is a bill, not compounding.
  assert.equal(large.players[0].debt, 20000);
});

test("a seat that cannot pay its interest is warned, not failed in a new way", () => {
  const state = city();
  setRank(state, 3);
  apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 20000 });
  state.players[0].treasury = 5;
  const events = economyPass(state);
  assert.ok(events.some((e) => e.kind === "fundsLow" || e.kind === "bankrupt"),
    "a seat that cannot service its debt was told nothing");
  assert.ok(state.players[0].treasury >= 0, "the treasury went negative rather than warning");
});

test("the debt survives a copy and reaches the hash", () => {
  const state = city();
  setRank(state, 2);
  apply(state, { type: CMD_TAKE_LOAN, actor: 1, amount: 3000 });
  assert.equal(hashState(copyState(state)), hashState(state));
  const other = copyState(state);
  other.players[0].debt += 1;
  assert.notEqual(hashState(other), hashState(state), "the hash cannot see a debt");
});

// --- A142: the treasury option loses its redundant value ---------------------

test("the treasury option has two values for two behaviours (A142)", () => {
  // Era 31 measured it: `TREASURY_SHARED` added `idiv(net, seats)` to every
  // seat's record and `TREASURY_SPLIT` on the `equal` rule added the same share
  // plus the remainder, and the whole difference over 200 four-seat games was
  // **+416** — the rounding, and nothing else. §26.1 offers "shared treasury,
  // or separate by option" and the engine had three values for two behaviours,
  // which is a lobby row that asks the player a question with no answer.
  assert.equal(TREASURY_SHARED, undefined, "`shared` is back as a constant");
  assert.deepEqual([TREASURY_SPLIT, TREASURY_SEPARATE].sort(), ["separate", "split"]);
  // And the default is the one that used to be `shared`, which is the same
  // arithmetic plus the coin that used to go to nobody.
  assert.equal(defaultOptions({}).treasury, TREASURY_SPLIT);
  assert.equal(defaultOptions({}).splitRule, "equal");
});

test("an option naming the value that is gone reads as the one that replaced it (A142)", () => {
  // Not a refusal: a lobby from another build, a URL somebody kept, or a save
  // migrated by the step below all hand this string in, and a region whose
  // money rule silently became `separate` would be a different game.
  const was = defaultOptions({ treasury: "shared" });
  assert.equal(was.treasury, TREASURY_SPLIT);
  assert.equal(was.splitRule, "equal", "a shared treasury was always an equal split");
  // And anything else is the DEFAULT rather than a pass-through. The old line
  // was `given.treasury ? given.treasury : TREASURY_SHARED`, so a typo in a
  // lobby reached `economyPass`, matched neither branch, and became `separate`
  // — a region playing a different money rule from the one anybody chose.
  // `splitRule` was given the same treatment in era 31 for the same reason.
  for (const nonsense of ["nonsense", "SPLIT", "", 7, null]) {
    assert.equal(defaultOptions({ treasury: nonsense }).treasury, TREASURY_SPLIT,
      `treasury ${JSON.stringify(nonsense)} was passed through`);
  }
});
