// The new-game screen.
//
// The thin half: option rows from `options-model.js`, a region generated from
// the current choices, and a Start button. Everything it shows about a region
// comes from `generateWorld()` — the SAME call `startGame()` would make, and the
// same result is handed on, so the preview is not a picture of a similar place.
// It is the place.
//
// Ruling 011 is the shape of the size row: every size stays selectable, and the
// ones this device will find heavy are MARKED rather than disabled.
//
// Slice 5.2 turns this into the multiplayer lobby by adding rows (seats,
// privacy) and a seat list. It should not need to change anything here.

import { generateWorld } from "../../engine/worldgen.js";
import { defaultOptions } from "../../engine/options.js";
import { sizeAdvice } from "../capabilities.js";
import { t } from "../i18n.js";
import { ROWS, optionsFor, sanitiseChoices, paramsForChoices, SEED_MAX } from "./options-model.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A seed nobody chose. `Math.random` is forbidden in `engine/` and `shared/`
 * because the simulation's randomness must come from state; picking which city
 * to generate is not the simulation, and this is client code. */
function randomSeed() {
  const buffer = globalThis.crypto?.getRandomValues?.(new Uint32Array(1));
  if (buffer) return buffer[0] % (SEED_MAX + 1);
  return Math.floor(Math.random() * SEED_MAX);
}

/**
 * @param onStart called with `{ world, options, choices }` — the already
 *   generated region, so the game does not generate a second one.
 * @param onContinue optional; shown only when there is a save to continue.
 */
export function createNewGame(root, { choices: initial, onStart, onContinue, onSettings } = {}) {
  let choices = sanitiseChoices(initial ?? {});
  let world;

  root.innerHTML = "";
  const screen = el("div", "lobby");

  const header = el("header", "lobby-head");
  header.append(el("h1", undefined, t("app.title")), el("p", "tagline", t("app.tagline")));
  if (onSettings) {
    const settings = el("button", "lobby-settings", t("menu.settings"));
    settings.type = "button";
    settings.id = "settings";
    settings.addEventListener("click", () => onSettings());
    header.append(settings);
  }
  screen.append(header);

  // --- option rows ----------------------------------------------------------
  const form = el("div", "lobby-options");
  const buttonsByRow = new Map();
  for (const row of ROWS) {
    const group = el("div", "lobby-row");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t(row.labelKey));
    group.dataset.field = row.field;
    group.append(el("h2", undefined, t(row.labelKey)));
    const options = el("div", "lobby-choices");
    const buttons = [];
    for (const choice of row.choices) {
      const button = el("button", "lobby-choice");
      button.type = "button";
      button.dataset.field = row.field;
      button.dataset.value = String(choice.value);
      button.append(el("span", undefined, t(choice.labelKey)));
      if (choice.hintKey) button.append(el("small", undefined, t(choice.hintKey)));
      // Ruling 011: a size above what this device is comfortable with is
      // MARKED, never disabled. Someone on a phone may still want the region.
      //
      // Only the heavy ones carry a note. Writing "recommended for this device"
      // on all four says nothing four times, and trains the player to stop
      // reading the line that matters.
      if (row.field === "size") {
        const advice = sizeAdvice(choice.value);
        button.dataset.advice = advice;
        if (advice === "heavy") button.append(el("small", "advice", t("lobby.size.heavy")));
      }
      button.addEventListener("click", () => {
        choices = sanitiseChoices({ ...choices, [row.field]: choice.value });
        regenerate();
      });
      buttons.push(button);
      options.append(button);
    }
    buttonsByRow.set(row.field, buttons);
    group.append(options);
    form.append(group);
  }
  screen.append(form);

  // --- the region -----------------------------------------------------------
  const preview = el("div", "lobby-preview");
  const regionName = el("h2", "region-name");
  const regionFacts = el("p", "region-facts");
  const regionProblem = el("p", "region-problem");
  regionProblem.hidden = true;
  const another = el("button", "lobby-another", t("lobby.regenerate"));
  another.type = "button";
  another.id = "regenerate";
  another.addEventListener("click", () => {
    choices = sanitiseChoices({ ...choices, seed: randomSeed() });
    regenerate();
  });
  preview.append(regionName, regionFacts, regionProblem, another);
  screen.append(preview);

  // --- start ----------------------------------------------------------------
  const actions = el("div", "lobby-actions");
  const start = el("button", "lobby-start", t("lobby.start"));
  start.type = "button";
  start.id = "start";
  start.addEventListener("click", () => {
    if (!world?.ok) return;
    onStart?.({ world, options: optionsFor(choices), choices });
  });
  actions.append(start);
  if (onContinue) {
    const resume = el("button", "lobby-continue", t("menu.continue"));
    resume.type = "button";
    resume.id = "continue";
    resume.addEventListener("click", () => onContinue());
    actions.append(resume);
  }
  const seedLine = el("p", "lobby-seed");
  actions.append(seedLine);
  screen.append(actions);
  root.append(screen);

  function regenerate() {
    world = generateWorld(defaultOptions(optionsFor(choices)));
    render();
  }

  function render() {
    for (const [field, buttons] of buttonsByRow) {
      for (const button of buttons) {
        button.setAttribute("aria-pressed", String(button.dataset.value === String(choices[field])));
      }
    }
    seedLine.textContent = t("lobby.seedIs", { seed: choices.seed });
    if (!world?.ok) {
      // Worldgen re-rolls the seed several times before giving up, so this is
      // a genuinely impossible combination — every dry style on a water-only
      // request, say — not bad luck.
      regionName.textContent = t("lobby.region.none");
      regionFacts.textContent = "";
      regionProblem.hidden = false;
      regionProblem.textContent = t("lobby.region.problem", { reason: world?.reason ?? "" });
      start.disabled = true;
      return;
    }
    regionProblem.hidden = true;
    start.disabled = false;
    // The engine names the region as a KEY, and always has — nothing had ever
    // rendered it, so the twenty-five `region.*` keys went untranslated until
    // this screen needed them (P18 audit).
    regionName.textContent = t(world.nameKey);
    const d = world.description;
    regionFacts.textContent = t("lobby.region.facts", {
      buildable: d.buildablePercent,
      water: d.waterPercent,
      forest: d.forestPercent,
    });
  }

  regenerate();

  return {
    get choices() { return { ...choices }; },
    get world() { return world; },
    /** The link that reproduces this city, for the address bar. */
    link: () => paramsForChoices(choices),
    dispose() { root.innerHTML = ""; },
  };
}
