// What a player can change about the game, as data.
//
// The pure half of the settings panel, shaped like `lobby/options-model.js`
// because it is the same kind of thing: rows of choices, a sanitiser, and no
// DOM. `test/settings.test.js` walks it.
//
// **Only settings that do something are here.** The catalogue has carried
// `settings.sound`, `settings.volume.*` and `settings.style` since the first
// commit; there is no audio (slice 4.4) and the visual style was settled by
// ruling 022, so offering either would be a control that changes nothing —
// which is the exact failure the P18 audit was about. They stay in the
// catalogue, listed in `test/reachability.test.js` with the slice that will
// use them, and out of this file until then.

export const LANGUAGES = [
  // Named in their own language. A language picker that translates its own
  // options is unusable to the person who needs it: someone stranded in a
  // language they cannot read is looking for the word "Norsk".
  { value: "en", label: "English" },
  { value: "no", label: "Norsk" },
];

export const CONTRAST = [
  { value: "normal", labelKey: "settings.off" },
  { value: "high", labelKey: "settings.on" },
];

/** `auto` leaves it to `prefers-reduced-motion`. The explicit settings exist
 * because the OS preference is a blunt instrument — someone may want the system
 * default everywhere else and full motion here, or the reverse. */
export const MOTION = [
  { value: "auto", labelKey: "settings.auto" },
  { value: "reduced", labelKey: "settings.on" },
  { value: "full", labelKey: "settings.off" },
];

export const SETTING_ROWS = [
  { field: "locale", labelKey: "settings.language", choices: LANGUAGES },
  { field: "contrast", labelKey: "settings.highContrast", choices: CONTRAST },
  { field: "motion", labelKey: "settings.reducedMotion", choices: MOTION },
];

export function defaultSettings(locale = "en") {
  return {
    locale: LANGUAGES.some((l) => l.value === locale) ? locale : "en",
    contrast: "normal",
    motion: "auto",
  };
}

/** Forces stored settings back inside the legal values.
 *
 * What comes out of `localStorage` was written by an older build, or by hand,
 * or is corrupt. An unrecognised value falls back rather than throwing: a bad
 * preference must never be a game that will not start. */
export function sanitiseSettings(given = {}, locale = "en") {
  const base = defaultSettings(locale);
  const pick = (choices, value, fallback) =>
    (choices.some((c) => c.value === value) ? value : fallback);
  return {
    locale: pick(LANGUAGES, given.locale, base.locale),
    contrast: pick(CONTRAST, given.contrast, base.contrast),
    motion: pick(MOTION, given.motion, base.motion),
  };
}

/** The `data-*` attributes the stylesheet reads. Returned rather than applied,
 * so the decision is testable without a document.
 *
 * An empty string means "remove the attribute", which for motion hands the
 * question back to `prefers-reduced-motion`. */
export function documentAttributes(settings) {
  const s = sanitiseSettings(settings);
  return {
    contrast: s.contrast === "high" ? "high" : "",
    motion: s.motion === "auto" ? "" : s.motion,
  };
}
