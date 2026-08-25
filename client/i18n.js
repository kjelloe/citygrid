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

export function setLocale(locale) {
  if (catalogues.has(locale)) active = locale;
}

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
