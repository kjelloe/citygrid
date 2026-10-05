// Taxes, upkeep and the monthly budget.
//
// Accounting is PER OWNER from the start, even in singleplayer where there is
// only one. Retrofitting per-owner money into a system that assumed one purse
// is the same class of mistake as retrofitting ownership into the reducer, and
// it is avoided the same way: do it once, at the beginning, when it is free.

import { registerMonthly, register, ok, fail } from "./reducer.js";
import { gateFare } from "./gates.js";
import { RESULT } from "../shared/protocol.js";
import { CMD_SET_TAX, CMD_SET_FUNDING, CMD_TAKE_LOAN, CMD_REPAY_LOAN } from "./commands.js";
import { rules, difficultyOf } from "./rules.js";
import { definition } from "./catalogue.js";
import { rankOf } from "./unlock.js";
import { idiv } from "../shared/idiv.js";
import { canAct, playerAt } from "./permissions.js";
import { tileAt } from "../shared/grid.js";
import { hasNet } from "./network.js";
import { isInt, isIntInRange } from "./validate.js";
import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, ZONE_NONE,
  TREASURY_SHARED, TREASURY_SPLIT, FUNDING_SERVICES,
} from "./constants.js";

register(CMD_SET_TAX, function setTax(state, command) {
  var tax = rules().tax;
  if (!isIntInRange(command.rate, tax.min, tax.max)) return fail(RESULT.INVALID);
  state.tax = command.rate;
  return ok([{ kind: "taxSet", rate: command.rate, actor: command.actor }]);
});

/** §9.4: each service can be funded from 50% to 150%.
 *
 * A rate outside the range is refused rather than clamped: a clamp turns a bug
 * in a caller into a silent surprise, and the reducer is the one place that
 * must not be forgiving. */
register(CMD_SET_FUNDING, function setFunding(state, command) {
  if (FUNDING_SERVICES.indexOf(command.service) < 0) return fail(RESULT.INVALID);
  var service = rules().service;
  if (!isIntInRange(command.percent, service.fundingMinPercent, service.fundingMaxPercent)) {
    return fail(RESULT.INVALID);
  }
  state.funding[command.service] = command.percent;
  return ok([{ kind: "fundingSet", service: command.service, percent: command.percent, actor: command.actor }]);
});

/** What one lot yields a month. Land value matters as much as headcount — a
 * prosperous small district can out-earn a large poor one, which is what makes
 * parks and waterfronts an economic decision rather than decoration. */
function taxFrom(state, building) {
  var development = rules().development;
  var centre = tileAt(state.width, building.x, building.y);
  var value = state.tiles.landValue[centre];
  var area = building.w * building.h;

  // Divisors are the reference's scale (population x land value / 120 x tax),
  // expressed per lot. The first attempt used divisors a hundred times larger
  // and produced an income of about one coin per building per month against an
  // upkeep of several hundred: every city ran to -160,000 in twenty years.
  var tax = rules().economy;
  if (building.zone === ZONE_RESIDENTIAL) {
    return idiv(building.occupancy * value * state.tax, tax.residentialDivisor);
  }
  if (building.zone === ZONE_COMMERCIAL) {
    var comJobs = development.commercialJobsPerLevel[building.level - 1] * area;
    return idiv(comJobs * value * state.tax, tax.commercialDivisor);
  }
  if (building.zone === ZONE_INDUSTRIAL) {
    var indJobs = development.industrialJobsPerLevel[building.level - 1] * area;
    return idiv(indJobs * value * state.tax, tax.industrialDivisor);
  }
  return 0;
}

/** Counts network tiles per owner. Roads are cheap individually and ruinous in
 * bulk, which is the point: a sprawling city costs more to keep than a compact
 * one earns. */
function networkUpkeep(state) {
  var upkeep = rules().upkeep;
  var perOwner = {};
  for (var i = 0; i < state.tiles.owner.length; i += 1) {
    var owner = state.tiles.owner[i];
    if (owner === 0 || owner === 255) continue;
    var cost = 0;
    if (hasNet(state.tiles.road[i])) cost += upkeep.road;
    if (hasNet(state.tiles.wire[i])) cost += upkeep.wire;
    if (hasNet(state.tiles.pipe[i])) cost += upkeep.pipe;
    if (hasNet(state.tiles.rail[i])) cost += upkeep.rail;
    if (cost === 0) continue;
    perOwner[owner] = (Object.hasOwn(perOwner, owner) ? perOwner[owner] : 0) + cost;
  }
  return perOwner;
}

/** What a developed lot costs the city each month (H8, A101). */
function serviceCost(building) {
  var ladder = rules().economy.serviceCostPerLevel;
  var level = building.level < 1 ? 1 : building.level;
  if (level > ladder.length) level = ladder.length;
  return ladder[level - 1] * building.w * building.h;
}

export function budgetFor(state, seat) {
  var income = 0;
  var expenses = 0;
  var i;

  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.owner !== seat) continue;
    if (building.zone !== ZONE_NONE) {
      income += taxFrom(state, building);
      // And what it costs to SERVE (H8, A101). A developed lot was pure income
      // until era 21 — it paid tax and cost nothing — while the only expenses
      // were the civic buildings and a penny a road tile, so a steady city took
      // four times what it spent and banked the difference for twenty-five
      // years. Per-TILE upkeep was tried twice and rejected twice because it
      // bankrupts a young town without touching a rich one (era 0 and era 1);
      // this scales with what the city has GROWN, so a village of cottages pays
      // cottage money and a city of towers pays for towers.
      expenses += serviceCost(building);
      continue;
    }
    var def = definition(building.def);
    if (!def) continue;
    // A department funded at 150% costs 150% to run. That is the trade §9.4
    // exists for: better cover, or a smaller bill.
    if (def.service) expenses += idiv(def.upkeep * state.funding[def.service], 100);
    else expenses += def.upkeep;
  }

  var networks = networkUpkeep(state);
  if (Object.hasOwn(networks, seat)) expenses += networks[seat];

  // The Outside pays a fare (T2, A65): every resident within a live gate's
  // range, billed with the utilities. Before the difficulty scaling, like the
  // taxes it sits beside — a relaxed city keeps more of it.
  income += gateFare(state, seat);

  var scaled = idiv(expenses * difficultyOf(state).upkeepPercent, 100);
  var yielded = idiv(income * difficultyOf(state).taxYieldPercent, 100);
  return { income: yielded, expenses: scaled, net: yielded - scaled };
}

/** Pays what can be paid. A city that cannot meet its upkeep does not run up
 * an unbounded overdraft — it fails to maintain what it has. Deterioration
 * itself lands with the service slice; for now the shortfall is reported and
 * the treasury floors at zero, because twenty years of silent debt reaching
 * -130,000 is not a balance question, it is a missing rule. */
function settle(player, budget, events) {
  player.treasury += budget.income;
  var paid = budget.expenses;
  if (paid > player.treasury) {
    var unpaid = paid - player.treasury;
    paid = player.treasury;
    events.push({ kind: "unpaidUpkeep", seat: player.seat, unpaid: unpaid });
  }
  player.treasury -= paid;
  events.push({
    kind: "budget", seat: player.seat, income: budget.income,
    expenses: budget.expenses, net: budget.income - budget.expenses,
  });
}

export function economyPass(state) {
  var events = [];
  var mode = state.options.treasury;
  var i;

  if (mode === TREASURY_SHARED || mode === TREASURY_SPLIT) {
    // One city, one purse — or one city whose income is divided. Either way
    // the whole region's books are balanced together first.
    var totalIncome = 0;
    var totalExpenses = 0;
    for (i = 0; i < state.players.length; i += 1) {
      var budget = budgetFor(state, state.players[i].seat);
      totalIncome += budget.income;
      totalExpenses += budget.expenses;
    }
    var net = totalIncome - totalExpenses;
    if (mode === TREASURY_SHARED) {
      // A shared treasury lives on every player's record so that a seat can
      // leave, return, or be added without the money having to move.
      for (i = 0; i < state.players.length; i += 1) {
        state.players[i].treasury += idiv(net, state.players.length);
      }
    } else {
      // Fixed split: equal shares (Q17 pending — the rule is one line).
      var share = idiv(net, state.players.length === 0 ? 1 : state.players.length);
      for (i = 0; i < state.players.length; i += 1) state.players[i].treasury += share;
    }
    events.push({ kind: "budget", income: totalIncome, expenses: totalExpenses, net: net });
    for (i = 0; i < state.players.length; i += 1) {
      if (state.players[i].treasury < 0) state.players[i].treasury = 0;
    }
  } else {
    for (i = 0; i < state.players.length; i += 1) {
      var own = budgetFor(state, state.players[i].seat);
      settle(state.players[i], own, events);
    }
  }

  // The interest, billed with the month (L1). A bill, not compounding: the debt
  // itself does not grow, so a player who stops borrowing stops the problem
  // getting worse — and a seat that cannot pay it is warned by the existing
  // bankruptcy rule rather than by a new failure mode.
  for (i = 0; i < state.players.length; i += 1) {
    var owing = state.players[i];
    var bill = interestOn(debtOf(owing));
    if (bill === 0) continue;
    owing.treasury -= bill;
    if (owing.treasury < 0) owing.treasury = 0;
    events.push({ kind: "interest", seat: owing.seat, amount: bill, debt: debtOf(owing) });
  }

  // Warn before the wheels come off, rather than announcing bankruptcy after.
  for (i = 0; i < state.players.length; i += 1) {
    var player = state.players[i];
    if (player.treasury < 0) {
      events.push({ kind: "bankrupt", seat: player.seat, treasury: player.treasury });
    } else if (player.treasury < 1000) {
      events.push({ kind: "fundsLow", seat: player.seat, treasury: player.treasury });
    }
  }
  return events;
}

/**
 * How much this city may owe at its rank (L1, A130).
 *
 * The rank is the CITY's, not the seat's (A129), so every mayor in a region
 * borrows against the same ladder — which is the same answer the build menu
 * gives, and one number to explain rather than two.
 */
export function loanCeiling(state) {
  var table = rules().loan.ceilingByRank;
  var rank = rankOf(state);
  if (rank < 0) rank = 0;
  if (rank >= table.length) rank = table.length - 1;
  return table[rank];
}

/** What a seat owes, as a number rather than an undefined on an old save. */
function debtOf(player) {
  return player.debt === undefined ? 0 : player.debt;
}

/** This month's interest on a debt: per thousand, integer, and never free for
 * a debt that exists — `idiv` would make a small loan interest-free, which is
 * the "a price of one rounds to zero" trap (Q155) in a rule written today. */
export function interestOn(debt) {
  if (debt <= 0) return 0;
  var rate = rules().loan.interestPerThousand;
  var bill = idiv(debt * rate, 1000);
  return bill < 1 ? 1 : bill;
}

register(CMD_TAKE_LOAN, function takeLoan(state, command) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isInt(command.amount) || command.amount <= 0) return fail(RESULT.INVALID);
  var player = playerAt(state, command.actor);
  var owed = debtOf(player);
  if (owed + command.amount > loanCeiling(state)) return fail(RESULT.AT_CEILING);
  player.debt = owed + command.amount;
  player.treasury += command.amount;
  return ok([{ kind: "borrowed", seat: player.seat, amount: command.amount, debt: player.debt }]);
});

register(CMD_REPAY_LOAN, function repayLoan(state, command) {
  var acting = canAct(state, command.actor);
  if (acting !== RESULT.OK) return fail(acting);
  if (!isInt(command.amount) || command.amount <= 0) return fail(RESULT.INVALID);
  var player = playerAt(state, command.actor);
  var owed = debtOf(player);
  if (owed === 0) return fail(RESULT.INVALID);
  // Repaying more than is owed repays what is owed: a player who types a big
  // number means "all of it", and taking the difference would be a trap.
  var paying = command.amount > owed ? owed : command.amount;
  if (player.treasury < paying) return fail(RESULT.NO_FUNDS);
  player.treasury -= paying;
  player.debt = owed - paying;
  return ok([{ kind: "repaid", seat: player.seat, amount: paying, debt: player.debt }]);
});

registerMonthly("economy", economyPass, 40);
