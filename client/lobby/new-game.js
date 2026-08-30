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
import { GROUPS, rowsIn, optionsFor, sanitiseChoices, paramsForChoices, SEED_MAX, NAME_MAX } from "./options-model.js";
import { createDiorama } from "./diorama.js";
import { prefersReducedMotion } from "../capabilities.js";

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

  // The region, turning slowly behind everything. `aria-hidden`, because every
  // fact it shows is also in the text beside it and a screen reader announcing
  // a rotating picture of a field would be noise.
  const stage = el("div", "lobby-stage");
  const stageCanvas = el("canvas", "lobby-diorama");
  stageCanvas.setAttribute("aria-hidden", "true");
  stage.append(stageCanvas, el("div", "lobby-scrim"));
  screen.append(stage);

  const sheet = el("div", "lobby-sheet");
  const header = el("header", "lobby-head");
  header.append(el("h1", undefined, t("app.title")), el("p", "tagline", t("app.tagline")));
  if (onSettings) {
    const settings = el("button", "lobby-settings", t("menu.settings"));
    settings.type = "button";
    settings.id = "settings";
    settings.addEventListener("click", () => onSettings());
    header.append(settings);
  }
  sheet.append(header);

  // --- names (§5.1, step one) -----------------------------------------------
  //
  // The only typed fields in the game. Optional: a player who wants to build
  // should not be stopped by a form, and an unnamed city falls back to the
  // region's own name, which the generator already produced.
  const begin = el("section", "lobby-block");
  begin.append(el("h2", undefined, t("lobby.begin")));
  const names = el("div", "lobby-names");
  const nameFields = {};
  for (const [field, labelKey, placeholderKey] of [
    ["cityName", "lobby.cityName", "lobby.cityName.hint"],
    ["mayorName", "lobby.mayorName", "lobby.mayorName.hint"],
  ]) {
    const wrap = el("label", "lobby-name");
    wrap.append(el("span", undefined, t(labelKey)));
    const input = document.createElement("input");
    input.type = "text";
    input.id = field;
    input.maxLength = NAME_MAX;
    input.autocomplete = "off";
    input.placeholder = t(placeholderKey);
    input.value = choices[field];
    input.addEventListener("input", () => {
      // No regenerate: the name does not change the region, and re-running
      // worldgen on every keystroke would be absurd.
      choices = sanitiseChoices({ ...choices, [field]: input.value });
    });
    nameFields[field] = input;
    wrap.append(input);
    names.append(wrap);
  }
  begin.append(names);
  sheet.append(begin);

  // --- option rows ----------------------------------------------------------
  const form = el("div", "lobby-options");
  const buttonsByRow = new Map();
  const groupBoxes = new Map();
  for (const group of GROUPS) {
    const box = el("section", "lobby-block");
    box.dataset.group = group.key;
    box.append(el("h2", undefined, t(group.labelKey)));
    groupBoxes.set(group.key, box);
    form.append(box);
  }
  for (const row of GROUPS.flatMap((g) => rowsIn(g.key))) {
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
    groupBoxes.get(row.group).append(group);
  }
  sheet.append(form);

  // --- the region -----------------------------------------------------------
  const preview = el("section", "lobby-preview");
  preview.append(el("h2", "preview-title", t("lobby.regionIs")));
  const regionName = el("p", "region-name");
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
  sheet.append(preview);

  // --- start ----------------------------------------------------------------
  const actions = el("div", "lobby-actions");
  const start = el("button", "lobby-start", t("lobby.start"));
  start.type = "button";
  start.id = "start";
  start.addEventListener("click", () => {
    if (!world?.ok) return;
    // The region does not depend on the name, so the name is applied to the
    // already-generated world rather than re-running worldgen on every
    // keystroke. Through `defaultOptions` so it is capped and sanitised by the
    // same path the engine would use — this record is hashed.
    // An unnamed city is called after its region — the generator already named
    // the place, and a city with no name at all leaves the top bar empty.
    const named = defaultOptions(optionsFor(choices)).cityName || t(world.nameKey);
    world.state.options.cityName = named;
    // The diorama shares this world's tile arrays. Let go before the game takes
    // them, or two renderers hold the same region.
    diorama?.dispose();
    diorama = undefined;
    onStart?.({ world, options: optionsFor(choices), choices, cityName: named, mayorName: choices.mayorName });
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
  sheet.append(actions);
  screen.append(sheet);
  root.append(screen);

  // ONE state object for the life of the screen. Each new region is copied into
  // it field by field rather than replacing it, so the diorama's renderer keeps
  // its pools and only rebuilds what changed — the same trick `game.js` uses to
  // load a save without reloading the page.
  let previewState;
  let diorama;

  function regenerate() {
    world = generateWorld(defaultOptions(optionsFor(choices)));
    if (world.ok) {
      if (!previewState) {
        previewState = world.state;
        diorama = createDiorama(stageCanvas, previewState, {
          // An explicit choice beats the OS preference; `data-motion` carries
          // whichever won (slice N13).
          motion: document.documentElement.dataset.motion !== "reduced"
            && !(prefersReducedMotion() && !document.documentElement.dataset.motion),
        });
      } else {
        for (const key of Object.keys(previewState)) delete previewState[key];
        Object.assign(previewState, world.state);
        diorama?.regionChanged();
      }
    }
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
    dispose() { diorama?.dispose(); diorama = undefined; root.innerHTML = ""; },
  };
}
