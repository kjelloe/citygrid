// The settings panel.
//
// A native `<dialog>` opened with `showModal()`, because that gives focus
// trapping, a focus return and Escape-to-close for free — three accessibility
// jobs (slice 4.5) that a hand-rolled overlay would have to do badly.
//
// Preferences live in `localStorage`, not in state. They are about this person
// on this device: putting them in state would hash them, and two players with
// different contrast settings would then disagree about the world.

import { t, loadLocale } from "../i18n.js";
import { SETTING_ROWS, defaultSettings, sanitiseSettings, documentAttributes } from "./settings-model.js";

const KEY = "citygrid.settings";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Reading and writing both swallow their errors. Private browsing, a full
 * quota and a blocked-cookies setting all throw here, and none of them is a
 * reason to refuse to start the game. */
export function loadSettings(fallbackLocale = "en") {
  try {
    return sanitiseSettings(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}"), fallbackLocale);
  } catch {
    return defaultSettings(fallbackLocale);
  }
}

export function saveSettings(settings) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(sanitiseSettings(settings)));
  } catch {
    // A preference that cannot be remembered still applies to this session.
  }
}

/** Puts the display settings on the root element for the stylesheet to read. */
export function applyDisplaySettings(settings, root = document.documentElement) {
  const attributes = documentAttributes(settings);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === "") delete root.dataset[name];
    else root.dataset[name] = value;
  }
}

/**
 * Opens the panel. Resolves when it closes.
 *
 * @param onLocaleChange called after the new catalogue is loaded. The caller
 *   re-renders whatever is on screen; nothing here knows what that is.
 */
export async function openSettings({ onLocaleChange, onChange } = {}) {
  let settings = loadSettings();
  const previousLocale = settings.locale;

  const dialog = el("dialog", "settings");
  dialog.setAttribute("aria-label", t("menu.settings"));
  const form = el("div", "settings-body");
  form.append(el("h1", undefined, t("menu.settings")));

  const buttonsByRow = new Map();
  for (const row of SETTING_ROWS) {
    const group = el("div", "settings-row");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t(row.labelKey));
    group.dataset.field = row.field;
    group.append(el("h2", undefined, t(row.labelKey)));
    const choices = el("div", "settings-choices");
    const buttons = [];
    for (const choice of row.choices) {
      // A language is named in its own language and never translated; every
      // other choice goes through the catalogue.
      const button = el("button", "settings-choice", choice.label ?? t(choice.labelKey));
      button.type = "button";
      button.dataset.field = row.field;
      button.dataset.value = choice.value;
      button.addEventListener("click", async () => {
        settings = sanitiseSettings({ ...settings, [row.field]: choice.value });
        saveSettings(settings);
        applyDisplaySettings(settings);
        onChange?.(settings);
        if (row.field === "locale") {
          await loadLocale(settings.locale);
          relabel();
        }
        mark();
      });
      buttons.push(button);
      choices.append(button);
    }
    buttonsByRow.set(row.field, buttons);
    group.append(choices);
    form.append(group);
  }

  const close = el("button", "settings-close", t("settings.close"));
  close.type = "button";
  close.id = "settings-close";
  close.addEventListener("click", () => dialog.close());
  form.append(close);
  dialog.append(form);
  document.body.append(dialog);

  function mark() {
    for (const [field, buttons] of buttonsByRow) {
      for (const button of buttons) {
        // `dataset` is always a string; `sound` is a boolean and the volumes
        // are numbers, so comparing them raw meant no button in those rows ever
        // showed as pressed.
        button.setAttribute("aria-pressed", String(button.dataset.value === String(settings[field])));
      }
    }
  }

  /** The panel is the one screen that has to restate itself in the new language
   * without closing — the player is looking at it when they change it. */
  function relabel() {
    dialog.setAttribute("aria-label", t("menu.settings"));
    form.querySelector("h1").textContent = t("menu.settings");
    for (const row of SETTING_ROWS) {
      const group = form.querySelector(`.settings-row[data-field="${row.field}"]`);
      group.setAttribute("aria-label", t(row.labelKey));
      group.querySelector("h2").textContent = t(row.labelKey);
      row.choices.forEach((choice, index) => {
        if (choice.labelKey) buttonsByRow.get(row.field)[index].textContent = t(choice.labelKey);
      });
    }
    close.textContent = t("settings.close");
  }

  mark();
  dialog.showModal();
  await new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
  dialog.remove();
  if (settings.locale !== previousLocale) onLocaleChange?.(settings.locale);
  return settings;
}
