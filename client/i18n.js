// Ruling 008 — every user-facing string goes through here.
//
// Deliberately tiny: a catalogue, a lookup, and an interpolator. The rule is
// enforced by test/i18n.test.js (key parity) rather than by cleverness here.

const catalogues = new Map();
let active = "en";

export const LOCALES = ["en", "no"];

export async function loadLocale(locale) {
  const name = LOCALES.includes(locale) ? locale : "en";
  if (!catalogues.has(name)) {
    const response = await fetch(`./data/i18n/${name}.json`);
    catalogues.set(name, await response.json());
  }
  active = name;
  return name;
}

// No `setLocale`: `loadLocale` sets the active catalogue itself, and the second
// entry point had no caller (M6).

export function locale() {
  return active;
}

/**
 * Look up a key. A missing key returns the key itself rather than an empty
 * string: a visible `menu.settings` in the interface is a bug report, whereas
 * a blank label is a mystery.
 */
export function t(key, values) {
  const catalogue = catalogues.get(active) ?? {};
  const template = catalogue[key];
  if (typeof template !== "string") return key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, token) =>
    Object.hasOwn(values, token) ? String(values[token]) : whole);
}

/**
 * The key for `n` of something — `key.one` at exactly one, `key` otherwise
 * (M11).
 *
 * The catalogue has no plural machinery and this is deliberately not one:
 * `t()` substitutes `{token}` and nothing else, and a string with a count read
 * *"1 residents"* from slice 4.1 until here. X3b put the same shape into a
 * sentence a player is asked to ACT on — *"Ask them to clear 1 tiles?"* — which
 * is where it stops being a blemish.
 *
 * Two forms, not a plural system. Norwegian's one-versus-many matches
 * English's, so a second rule for the rest of the game to disagree with would
 * be worse than two strings; a language that needs more than two gets this
 * function changed in one place, which is the reason it is a function.
 *
 * **Zero is plural** ("0 residents"), which is also the number a readout spends
 * its first minute showing. A count that is not a number is plural too: a
 * missing value must not pick a sentence written for exactly one.
 *
 * `catalogue` defaults to the live one and is a parameter because the choice
 * IS a question about a catalogue — which lets `test/i18n.test.js` ask it of
 * the files on disk, where a browser's `fetch` cannot reach.
 */
export function plural(key, n, catalogue = catalogues.get(active) ?? {}) {
  if (n !== 1) return key;
  // Fall back to the key itself rather than to a missing one: `t()` renders a
  // missing key AS the key, and "hud.residents.one" on screen is worse than
  // "1 residents".
  return typeof catalogue[`${key}.one`] === "string" ? `${key}.one` : key;
}

/** Fills every `[data-i18n]` element in a tree. */
export function localise(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  }
}

/** Locale-aware number formatting, so 1 234 567 does not become 1,234,567 in Norwegian. */
export function formatNumber(value) {
  return new Intl.NumberFormat(active === "no" ? "nb-NO" : "en-GB").format(value);
}

export function formatMoney(value) {
  return `§${formatNumber(value)}`;
}
