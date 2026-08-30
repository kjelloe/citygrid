// Taxes and the monthly books.
//
// `CMD_SET_TAX` has existed since the economy slice and nothing ever sent it:
// the one lever the design gives the player over their income was in the engine
// and not in the game. A rate the player cannot change is a constant.
//
// Every number here comes from `budgetFor()` — the same function the monthly
// pass settles the accounts with. A panel that computed income itself would be
// a second implementation of the tax rules, and the two would disagree in the
// month it mattered.

import { budgetFor } from "../../engine/economy.js";
import { rules } from "../../engine/rules.js";
import { FUNDING_SERVICES } from "../../engine/constants.js";

export function taxRange() {
  const tax = rules().tax;
  return { min: tax.min, max: tax.max, fallback: tax.default };
}

/** What the player is charging, what it brings in, and what it costs to keep
 * the city running — this seat's share of each. */
export function budgetPanel(state, seat) {
  const books = budgetFor(state, seat);
  const range = taxRange();
  return {
    rate: state.tax,
    min: range.min,
    max: range.max,
    income: books.income,
    expenses: books.expenses,
    net: books.net,
  };
}

/** Clamped into the range the reducer will accept, so the slider cannot send a
 * command that is refused. The reducer still checks — that is the rule — but
 * there is no reason for the UI to aim outside the target. */
export function clampRate(rate) {
  const range = taxRange();
  if (!Number.isInteger(rate)) return range.fallback;
  return Math.max(range.min, Math.min(range.max, rate));
}

/** §9.4: the three departments and what each is funded at.
 *
 * Three steps rather than a slider, for the reason the volume rows give: a
 * range input is a poor keyboard target, and "half, normal, generous" is the
 * decision — not the difference between 96% and 104%. */
export function fundingSteps() {
  const service = rules().service;
  return [
    { value: service.fundingMinPercent, labelKey: "funding.lean" },
    { value: 100, labelKey: "funding.normal" },
    { value: service.fundingMaxPercent, labelKey: "funding.generous" },
  ];
}

export function fundingRows(state) {
  return FUNDING_SERVICES.map((service) => ({
    service,
    labelKey: `funding.${service}`,
    percent: state.funding[service],
  }));
}

/** Clamped into the range the reducer accepts — the reducer still refuses, but
 * there is no reason for the UI to aim outside the target. */
export function clampFunding(percent) {
  const service = rules().service;
  if (!Number.isInteger(percent)) return 100;
  return Math.max(service.fundingMinPercent, Math.min(service.fundingMaxPercent, percent));
}
