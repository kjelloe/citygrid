// Quests, milestones and the advisor's reasons to speak.
//
// **Quests are pure data** (`plan-v1.md` N9). Nothing in `data/quests/*.json`
// is code, and nothing here knows about any specific quest. That is what lets
// content be written after v1 without touching the engine, which is the whole
// reason the quest engine is a slice of its own.
//
// The condition language is CLOSED: a fixed vocabulary of comparisons against
// state, listed in `CONDITIONS` below. No expressions, no `eval`, no callbacks
// from data. An open language in a save file is a way to run code you did not
// write, and in a multiplayer game it is a way to run code your opponent wrote.
// A closed one can also be checked at load time, so a broken quest is a startup
// error rather than a silent no-op at hour three.
//
// Quest progress is hashed state. Two clients must agree about which quests are
// running, or they will disagree about the rewards those quests paid out.

import { registerMonthly, register, ok, fail } from "./reducer.js";
import { RESULT } from "../shared/protocol.js";
import { CMD_QUEST_CHOICE } from "./commands.js";
import { idiv } from "../shared/idiv.js";
import { hasNet } from "./network.js";
import { definition } from "./catalogue.js";
import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, ZONE_NONE,
  FLAG_POWERED, FLAG_WATERED, FLAG_RUINED,
} from "./constants.js";

var CATALOGUE = [];

/** Loaded by the adapter at boot, like the ruleset. engine/ does no I/O. */
export function setQuests(list) {
  CATALOGUE = list ? list : [];
}

export function questCatalogue() {
  return CATALOGUE;
}

// --- the closed condition language ------------------------------------------

function countZone(state, zone) {
  var n = 0;
  var i;
  for (i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].zone === zone) n += 1;
  }
  return n;
}

function countTiles(state, layer, flag) {
  var n = 0;
  var i;
  var tiles = state.tiles[layer];
  for (i = 0; i < tiles.length; i += 1) {
    if (flag === 0 ? hasNet(tiles[i]) : (tiles[i] & flag) !== 0) n += 1;
  }
  return n;
}

/** Placed buildings of a kind, by what the CATALOGUE says they are rather than
 * by name — so a new station or a new park in `data/buildings.json` counts
 * without editing a quest.
 *
 * `"service"` matches anything with a service field (fire, police, health);
 * anything else matches the `category`. */
function countBy(state, kind) {
  var n = 0;
  var i;
  for (i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].zone !== ZONE_NONE) continue;
    var def = definition(state.buildings[i].def);
    if (!def) continue;
    if (kind === "service" ? Boolean(def.service) : def.category === kind) n += 1;
  }
  return n;
}

function zoneOf(name) {
  if (name === "residential") return ZONE_RESIDENTIAL;
  if (name === "commercial") return ZONE_COMMERCIAL;
  if (name === "industrial") return ZONE_INDUSTRIAL;
  return -1;
}

/** Every measurement a quest is allowed to ask about.
 *
 * Adding one here is a deliberate act with a test; a quest cannot invent one. */
var MEASURES = {
  population: function (state) { return state.population; },
  jobs: function (state) { return state.jobs; },
  treasury: function (state) { return state.players.length > 0 ? state.players[0].treasury : 0; },
  buildings: function (state) { return state.buildings.length; },
  roadTiles: function (state) { return countTiles(state, "road", 0); },
  wireTiles: function (state) { return countTiles(state, "wire", 0); },
  pipeTiles: function (state) { return countTiles(state, "pipe", 0); },
  poweredTiles: function (state) { return countTiles(state, "flags", FLAG_POWERED); },
  wateredTiles: function (state) { return countTiles(state, "flags", FLAG_WATERED); },
  year: function (state) { return idiv(state.tick, 144) + 1; },
  crime: function (state) { return state.civic.crimeAverage; },
  landValue: function (state) { return state.civic.landValueAverage; },
  congestedTiles: function (state) { return state.traffic.congested; },
  residential: function (state) { return countZone(state, ZONE_RESIDENTIAL); },
  commercial: function (state) { return countZone(state, ZONE_COMMERCIAL); },
  industrial: function (state) { return countZone(state, ZONE_INDUSTRIAL); },
  // The rate the player is charging. Reachable from the interface since slice
  // N11, and a tutorial step since the content pass.
  tax: function (state) { return state.tax; },
  serviceBuildings: function (state) { return countBy(state, "service"); },
  amenities: function (state) { return countBy(state, "amenity"); },
  // What a disaster left behind. This is what makes a recoverable disaster
  // scenario expressible: available while there is wreckage, complete when it
  // is cleared.
  ruinedTiles: function (state) { return countTiles(state, "flags", FLAG_RUINED); },
};

export function measureNames() {
  return Object.keys(MEASURES);
}

export function variableOf(state, name) {
  var i;
  for (i = 0; i < state.quests.vars.length; i += 1) {
    if (state.quests.vars[i].name === name) return state.quests.vars[i].value;
  }
  return 0;
}

function setVariable(state, name, value) {
  var i;
  for (i = 0; i < state.quests.vars.length; i += 1) {
    if (state.quests.vars[i].name === name) {
      state.quests.vars[i].value = value;
      return;
    }
  }
  state.quests.vars.push({ name: name, value: value });
  // Sorted by name so canonical serialisation never depends on insertion
  // order — the same rule entities follow (CLAUDE.md).
  state.quests.vars.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
}

/** Evaluates one condition. Returns true or false and never throws — a
 * malformed condition is FALSE, and `validateQuests` is what catches it loudly
 * at load time. */
export function evaluate(state, condition) {
  if (!condition || typeof condition !== "object") return false;
  var type = condition.type;

  if (type === "all") {
    var i;
    if (!condition.of) return false;
    for (i = 0; i < condition.of.length; i += 1) {
      if (!evaluate(state, condition.of[i])) return false;
    }
    return true;
  }
  if (type === "any") {
    var k;
    if (!condition.of) return false;
    for (k = 0; k < condition.of.length; k += 1) {
      if (evaluate(state, condition.of[k])) return true;
    }
    return false;
  }
  if (type === "not") return !evaluate(state, condition.of);

  if (type === "measure") {
    var measure = MEASURES[condition.name];
    if (!measure) return false;
    var value = measure(state);
    if (condition.atLeast !== undefined && value < condition.atLeast) return false;
    if (condition.atMost !== undefined && value > condition.atMost) return false;
    return true;
  }

  if (type === "variable") {
    var current = variableOf(state, condition.name);
    if (condition.equals !== undefined) return current === condition.equals;
    if (condition.atLeast !== undefined) return current >= condition.atLeast;
    return false;
  }

  if (type === "questDone") return isDone(state, condition.id);
  if (type === "always") return true;
  return false;
}

// --- quest state ------------------------------------------------------------

export function isDone(state, id) {
  var i;
  for (i = 0; i < state.quests.completed.length; i += 1) {
    if (state.quests.completed[i] === id) return true;
  }
  return false;
}

export function isActive(state, id) {
  var i;
  for (i = 0; i < state.quests.active.length; i += 1) {
    if (state.quests.active[i].id === id) return true;
  }
  return false;
}

export function activeQuests(state) {
  return state.quests.active;
}

function questById(id) {
  var i;
  for (i = 0; i < CATALOGUE.length; i += 1) {
    if (CATALOGUE[i].id === id) return CATALOGUE[i];
  }
  return undefined;
}

function grant(state, reward, events) {
  if (!reward) return;
  if (reward.money && state.players.length > 0) {
    state.players[0].treasury += reward.money;
  }
  if (reward.variable) setVariable(state, reward.variable, reward.value === undefined ? 1 : reward.value);
  if (reward.rank) setVariable(state, "rank", reward.rank);
  events.push({ kind: "questReward", money: reward.money ? reward.money : 0 });
}

// --- the pass ---------------------------------------------------------------

export function questPass(state) {
  var events = [];
  if (!state.options.quests) return events;
  var i;

  // Offer anything newly available. Sorted by id on insert so two clients agree
  // on the order quests appear in, not merely on the set.
  for (i = 0; i < CATALOGUE.length; i += 1) {
    var quest = CATALOGUE[i];
    if (isDone(state, quest.id) || isActive(state, quest.id)) continue;
    if (!evaluate(state, quest.available)) continue;
    state.quests.active.push({ id: quest.id, startedTick: state.tick, choice: -1 });
    state.quests.active.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    events.push({ kind: "questOffered", id: quest.id });
  }

  // Complete anything whose objective is met. Backwards, because completing
  // removes from the array being walked.
  for (i = state.quests.active.length - 1; i >= 0; i -= 1) {
    var entry = state.quests.active[i];
    var definition = questById(entry.id);
    if (!definition) continue;
    // A quest with choices waits for one. The player is the objective.
    if (definition.choices && entry.choice < 0) continue;
    if (!evaluate(state, definition.objective)) continue;
    state.quests.active.splice(i, 1);
    state.quests.completed.push(entry.id);
    state.quests.completed.sort();
    grant(state, definition.reward, events);
    events.push({ kind: "questCompleted", id: entry.id });
  }
  return events;
}

/** The player picks an option. This is the "choice changes simulation
 * variables and later dialogue" half of the slice: an option writes a variable,
 * and later quests can gate on it with `{"type":"variable"}`. */
register(CMD_QUEST_CHOICE, function questChoice(state, command) {
  if (!state.options.quests) return fail(RESULT.INVALID);
  if (typeof command.id !== "string") return fail(RESULT.INVALID);
  if (!Number.isInteger(command.option) || command.option < 0) return fail(RESULT.INVALID);
  var definition = questById(command.id);
  if (!definition || !definition.choices) return fail(RESULT.INVALID);
  if (command.option >= definition.choices.length) return fail(RESULT.INVALID);
  var i;
  for (i = 0; i < state.quests.active.length; i += 1) {
    if (state.quests.active[i].id !== command.id) continue;
    if (state.quests.active[i].choice >= 0) return fail(RESULT.INVALID);
    state.quests.active[i].choice = command.option;
    var events = [];
    var choice = definition.choices[command.option];
    if (choice.variable !== undefined) {
      setVariable(state, choice.variable, choice.value === undefined ? 1 : choice.value);
    }
    grant(state, choice.reward, events);
    events.push({ kind: "questChoice", id: command.id, option: command.option });
    return ok(events);
  }
  return fail(RESULT.INVALID);
});

// --- validation -------------------------------------------------------------

/** Checks a catalogue against the closed language, at LOAD time.
 *
 * Returns a list of problems. A quest that references a measure nobody
 * implements would otherwise sit in the catalogue for months, never firing,
 * looking exactly like a quest whose conditions the player has not met. */
export function validateQuests(list) {
  var problems = [];
  var seen = {};
  var i;

  function checkCondition(id, where, condition) {
    if (!condition || typeof condition !== "object") {
      problems.push(id + ": " + where + " is not a condition");
      return;
    }
    var type = condition.type;
    if (type === "all" || type === "any") {
      if (!Array.isArray(condition.of)) {
        problems.push(id + ": " + where + " " + type + " needs an 'of' list");
        return;
      }
      var k;
      for (k = 0; k < condition.of.length; k += 1) checkCondition(id, where, condition.of[k]);
      return;
    }
    if (type === "not") { checkCondition(id, where, condition.of); return; }
    if (type === "measure") {
      if (!MEASURES[condition.name]) {
        problems.push(id + ": " + where + " asks for measure '" + condition.name + "', which does not exist");
      }
      if (condition.atLeast === undefined && condition.atMost === undefined) {
        problems.push(id + ": " + where + " measure '" + condition.name + "' compares against nothing");
      }
      return;
    }
    if (type === "variable") {
      if (typeof condition.name !== "string") problems.push(id + ": " + where + " variable has no name");
      return;
    }
    if (type === "questDone") {
      if (typeof condition.id !== "string") problems.push(id + ": " + where + " questDone has no id");
      return;
    }
    if (type === "always") return;
    problems.push(id + ": " + where + " has unknown condition type '" + type + "'");
  }

  for (i = 0; i < list.length; i += 1) {
    var quest = list[i];
    if (typeof quest.id !== "string") { problems.push("a quest has no id"); continue; }
    if (seen[quest.id]) problems.push(quest.id + ": duplicate id");
    seen[quest.id] = true;
    // KEYS, not prose. The engine may not read the i18n catalogue — it does no
    // I/O — so it checks that a quest names a string for the client to look up
    // and leaves the looking up to the client. `test/quests.test.js` checks the
    // keys against both catalogues, which is the half the engine cannot do.
    if (typeof quest.titleKey !== "string") problems.push(quest.id + ": no titleKey");
    if (typeof quest.textKey !== "string") problems.push(quest.id + ": no textKey for the advisor to say");
    checkCondition(quest.id, "available", quest.available);
    checkCondition(quest.id, "objective", quest.objective);
    if (quest.choices) {
      if (!Array.isArray(quest.choices) || quest.choices.length < 2) {
        problems.push(quest.id + ": choices must offer at least two options");
      } else {
        var c;
        for (c = 0; c < quest.choices.length; c += 1) {
          if (typeof quest.choices[c].textKey !== "string") {
            problems.push(quest.id + ": choice " + c + " has no textKey");
          }
        }
      }
    }
  }

  // A quest that gates on another quest that does not exist can never fire.
  for (i = 0; i < list.length; i += 1) {
    var checked = list[i];
    var refs = [];
    collectQuestRefs(checked.available, refs);
    var r;
    for (r = 0; r < refs.length; r += 1) {
      if (!seen[refs[r]]) problems.push(checked.id + ": waits for quest '" + refs[r] + "', which does not exist");
    }
  }
  return problems;
}

function collectQuestRefs(condition, out) {
  if (!condition || typeof condition !== "object") return;
  if (condition.type === "questDone" && typeof condition.id === "string") out.push(condition.id);
  if (condition.of) {
    if (Array.isArray(condition.of)) {
      var i;
      for (i = 0; i < condition.of.length; i += 1) collectQuestRefs(condition.of[i], out);
    } else {
      collectQuestRefs(condition.of, out);
    }
  }
}

// After everything that could satisfy an objective, so a quest completes in the
// month its condition became true rather than the month after.
registerMonthly("quests", questPass, 80);
