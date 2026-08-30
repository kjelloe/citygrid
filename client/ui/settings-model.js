// What a player can change about the game, as data.
//
// The pure half of the settings panel, shaped like `lobby/options-model.js`
// because it is the same kind of thing: rows of choices, a sanitiser, and no
// DOM. `test/settings.test.js` walks it.
//
// **Only settings that do something are here.** Sound and its two volumes
// arrived with slice 4.4 and are now real. `settings.style` is not offered
// (ruling 022 settled the style, so the picker would have one entry) and
// neither is `settings.volume.music` — there is no composed music, and a
// volume slider for silence is a control that changes nothing, which is the
// exact failure the P18 audit was about.

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

export const SOUND = [
  { value: true, labelKey: "settings.sound.on" },
  { value: false, labelKey: "settings.sound.off" },
];

/** Four steps rather than a slider: a range input is a poor keyboard target
 * and the difference between 62 and 68 is not a difference anyone hears. */
export const LEVELS = [
  { value: 0, labelKey: "settings.level.off" },
  { value: 35, labelKey: "settings.level.quiet" },
  { value: 70, labelKey: "settings.level.normal" },
  { value: 100, labelKey: "settings.level.loud" },
];

export const SETTING_ROWS = [
  { field: "sound", labelKey: "settings.sound", choices: SOUND },
  { field: "volumeEffects", labelKey: "settings.volume.effects", choices: LEVELS },
  { field: "volumeAmbience", labelKey: "settings.volume.ambience", choices: LEVELS },
  { field: "locale", labelKey: "settings.language", choices: LANGUAGES },
  { field: "contrast", labelKey: "settings.highContrast", choices: CONTRAST },
  { field: "motion", labelKey: "settings.reducedMotion", choices: MOTION },
];

export function defaultSettings(locale = "en") {
  return {
    locale: LANGUAGES.some((l) => l.value === locale) ? locale : "en",
    contrast: "normal",
    motion: "auto",
    // Sound ON by default, at a level that does not startle. A browser will not
    // let it make a noise until the player interacts anyway, so defaulting it
    // off would mean two decisions before the game says anything.
    sound: true,
    volumeEffects: 70,
    volumeAmbience: 35,
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
    sound: pick(SOUND, given.sound, base.sound),
    volumeEffects: pick(LEVELS, given.volumeEffects, base.volumeEffects),
    volumeAmbience: pick(LEVELS, given.volumeAmbience, base.volumeAmbience),
  };
}

/** What the mixer needs, and nothing else. The mixer is handed values; it never
 * sees the settings object, and it never sees state at all. */
export function mixerSettings(settings) {
  const s = sanitiseSettings(settings);
  return {
    sound: s.sound,
    volumeMaster: 100,
    volumeEffects: s.volumeEffects,
    volumeAmbience: s.volumeAmbience,
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
