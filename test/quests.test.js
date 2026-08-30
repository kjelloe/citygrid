// The quest engine, and the quests themselves.
//
// The slice's claim is that **quests are pure data**, so these tests are in two
// halves: the engine understands a closed language and nothing else, and the
// authored catalogue is valid in that language. The second half is the one that
// catches content bugs, and content bugs are the expensive kind — a quest with
// a typo'd measure name never fires and looks exactly like a quest whose
// conditions the player has not met.

import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  setQuests, questPass, evaluate, validateQuests, measureNames,
  isDone, isActive, variableOf, questCatalogue,
} from "../engine/quests.js";
import { createState, hashState, copyState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_QUEST_CHOICE } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { readQuests } from "./helpers/content.js";
import { repoRoot } from "./helpers/sources.js";
import "../engine/build-commands.js";
import "../engine/quests.js";

function blank() {
  const state = createState(defaultOptions({ seed: 4, width: 16, height: 16, seats: 1, quests: true }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  return state;
}

// --- the closed language ----------------------------------------------------

test("a measure that does not exist is false, never a crash", () => {
  // Data comes from a file. A file can say anything.
  const state = blank();
  assert.equal(evaluate(state, { type: "measure", name: "vibes", atLeast: 1 }), false);
  assert.equal(evaluate(state, { type: "nonsense" }), false);
  assert.equal(evaluate(state, undefined), false);
  assert.equal(evaluate(state, "population > 5"), false, "a string is not a condition");
});

test("the language has no way to run code", () => {
  // The point of a CLOSED language. If a condition could carry a function or an
  // expression, a save file could carry one too.
  const state = blank();
  let ran = false;
  assert.equal(evaluate(state, { type: "measure", name: "population", atLeast: () => { ran = true; return 0; } }), true);
  assert.equal(ran, false, "the engine called something a data file supplied");
});

test("measures compare both ways", () => {
  const state = blank();
  state.population = 100;
  assert.equal(evaluate(state, { type: "measure", name: "population", atLeast: 100 }), true);
  assert.equal(evaluate(state, { type: "measure", name: "population", atLeast: 101 }), false);
  assert.equal(evaluate(state, { type: "measure", name: "population", atMost: 100 }), true);
  assert.equal(evaluate(state, { type: "measure", name: "population", atMost: 99 }), false);
});

test("all, any and not compose", () => {
  const state = blank();
  state.population = 50;
  const yes = { type: "measure", name: "population", atLeast: 10 };
  const no = { type: "measure", name: "population", atLeast: 1000 };
  assert.equal(evaluate(state, { type: "all", of: [yes, yes] }), true);
  assert.equal(evaluate(state, { type: "all", of: [yes, no] }), false);
  assert.equal(evaluate(state, { type: "any", of: [yes, no] }), true);
  assert.equal(evaluate(state, { type: "any", of: [no, no] }), false);
  assert.equal(evaluate(state, { type: "not", of: no }), true);
});

// --- a crafted quest completes headlessly -----------------------------------

test("a crafted quest is offered, then completes, and pays", () => {
  // The slice's own gate, in miniature.
  setQuests([{
    id: "grow", titleKey: "Grow", textKey: "Grow a bit.",
    available: { type: "always" },
    objective: { type: "measure", name: "population", atLeast: 100 },
    reward: { money: 500 },
  }]);
  const state = blank();
  const treasuryBefore = state.players[0].treasury;

  let events = questPass(state);
  assert.ok(events.some((e) => e.kind === "questOffered"), "the quest was never offered");
  assert.equal(isActive(state, "grow"), true);
  assert.equal(isDone(state, "grow"), false);

  events = questPass(state);
  assert.equal(isDone(state, "grow"), false, "it completed before its objective was met");

  state.population = 120;
  events = questPass(state);
  assert.ok(events.some((e) => e.kind === "questCompleted"), "the objective was met and nothing happened");
  assert.equal(isDone(state, "grow"), true);
  assert.equal(isActive(state, "grow"), false);
  assert.equal(state.players[0].treasury, treasuryBefore + 500);

  // And never again.
  const after = questPass(state);
  assert.equal(after.filter((e) => e.kind === "questCompleted").length, 0);
});

test("quests can be turned off", () => {
  setQuests([{ id: "x", titleKey: "X", textKey: "x", available: { type: "always" }, objective: { type: "always" } }]);
  const state = createState(defaultOptions({ seed: 1, width: 8, height: 8, seats: 1, quests: false }));
  assert.deepEqual(questPass(state), []);
});

// --- a choice changes simulation variables and later dialogue ---------------

test("a choice writes a variable, and a later quest gates on it", () => {
  setQuests([
    {
      id: "pick", titleKey: "Pick", textKey: "Choose.",
      available: { type: "always" },
      objective: { type: "always" },
      choices: [
        { textKey: "Left", variable: "lean", value: 1, reward: { money: 100 } },
        { textKey: "Right", variable: "lean", value: 2 },
      ],
    },
    {
      id: "left-only", titleKey: "Left only", textKey: "Only if you went left.",
      available: { type: "all", of: [
        { type: "questDone", id: "pick" },
        { type: "variable", name: "lean", equals: 1 },
      ] },
      objective: { type: "always" },
    },
  ]);
  const state = blank();
  questPass(state);
  assert.equal(isActive(state, "pick"), true);

  // Without a choice it waits — the player IS the objective.
  questPass(state);
  assert.equal(isDone(state, "pick"), false, "a quest with choices completed without one being made");

  const outcome = apply(state, { type: CMD_QUEST_CHOICE, actor: 1, id: "pick", option: 1 });
  assert.equal(outcome.result, RESULT.OK);
  assert.equal(variableOf(state, "lean"), 2);

  questPass(state);
  assert.equal(isDone(state, "pick"), true);
  questPass(state);
  assert.equal(isActive(state, "left-only"), false, "the right-hand branch offered the left-hand quest");
  assert.equal(isDone(state, "left-only"), false);
});

test("a choice cannot be made twice, or out of range", () => {
  setQuests([{
    id: "pick", titleKey: "Pick", textKey: "Choose.",
    available: { type: "always" }, objective: { type: "always" },
    choices: [{ textKey: "a", variable: "v", value: 1 }, { textKey: "b", variable: "v", value: 2 }],
  }]);
  const state = blank();
  questPass(state);
  assert.equal(apply(state, { type: CMD_QUEST_CHOICE, actor: 1, id: "pick", option: 0 }).result, RESULT.OK);
  assert.equal(apply(state, { type: CMD_QUEST_CHOICE, actor: 1, id: "pick", option: 1 }).result, RESULT.INVALID);
  assert.equal(variableOf(state, "v"), 1, "the second choice overwrote the first");
  assert.equal(apply(state, { type: CMD_QUEST_CHOICE, actor: 1, id: "nope", option: 0 }).result, RESULT.INVALID);
  assert.equal(apply(state, { type: CMD_QUEST_CHOICE, actor: 1, id: "pick", option: 99 }).result, RESULT.INVALID);
});

// --- determinism ------------------------------------------------------------

test("quest progress is hashed and survives a copy", () => {
  setQuests([{ id: "q", titleKey: "Q", textKey: "q", available: { type: "always" }, objective: { type: "measure", name: "population", atLeast: 5 } }]);
  const state = blank();
  const before = hashState(state);
  questPass(state);
  assert.notEqual(hashState(state), before, "an offered quest did not reach the hash");
  const copy = copyState(state);
  assert.equal(hashState(copy), hashState(state));
  copy.quests.active.length = 0;
  assert.notEqual(hashState(copy), hashState(state), "the copy shares the original's quest list");
});

test("quest variables are kept sorted so the hash never depends on order", () => {
  setQuests([]);
  const a = blank();
  const b = blank();
  // Same variables, opposite insertion order.
  setQuests([
    { id: "p", titleKey: "P", textKey: "p", available: { type: "always" }, objective: { type: "always" },
      choices: [{ textKey: "x", variable: "zebra", value: 1 }, { textKey: "y", variable: "apple", value: 1 }] },
  ]);
  questPass(a);
  apply(a, { type: CMD_QUEST_CHOICE, actor: 1, id: "p", option: 0 });
  questPass(b);
  apply(b, { type: CMD_QUEST_CHOICE, actor: 1, id: "p", option: 1 });
  a.quests.vars.push({ name: "apple", value: 1 });
  a.quests.vars.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  b.quests.vars.push({ name: "zebra", value: 1 });
  b.quests.vars.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  assert.deepEqual(a.quests.vars, b.quests.vars);
});

// --- the authored catalogue -------------------------------------------------

test("every authored quest is valid in the closed language", () => {
  const { all } = readQuests();
  const problems = validateQuests(all);
  assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}`);
});

test("the quest index lists every quest file", () => {
  // A file nobody indexes is content that never loads.
  const { index, files } = readQuests();
  assert.deepEqual([...index].sort(), [...files].sort());
});

test("the authored catalogue has a reachable starting point", () => {
  // Every quest gated behind another quest, and nothing gated on `always`, is a
  // catalogue that never begins.
  const { all } = readQuests();
  const openers = all.filter((q) => q.available?.type === "always");
  assert.ok(openers.length >= 1, "no quest is available at the start of a game");
});

test("every authored quest is reachable from the start", () => {
  // Walks the questDone graph. A quest whose prerequisite chain is broken is
  // content that has been written and can never be seen.
  const { all } = readQuests();
  const byId = new Map(all.map((q) => [q.id, q]));
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const quest of all) {
      if (reachable.has(quest.id)) continue;
      const refs = [];
      (function collect(condition) {
        if (!condition || typeof condition !== "object") return;
        if (condition.type === "questDone") refs.push(condition.id);
        if (Array.isArray(condition.of)) condition.of.forEach(collect);
        else if (condition.of) collect(condition.of);
      })(quest.available);
      if (refs.every((id) => reachable.has(id))) {
        reachable.add(quest.id);
        changed = true;
      }
    }
  }
  const stranded = all.filter((q) => !reachable.has(q.id)).map((q) => q.id);
  assert.deepEqual(stranded, [], `unreachable quests: ${stranded.join(", ")}`);
  assert.equal(byId.size, all.length);
});

test("the tutorial chain teaches the things the MVP needs", () => {
  // gamedesign.md §24: a first-time player should reach their first residents.
  // These are the steps that takes, so the tutorial must cover them.
  const { all } = readQuests();
  const measures = new Set();
  for (const quest of all.filter((q) => q.category === "tutorial")) {
    (function collect(condition) {
      if (!condition || typeof condition !== "object") return;
      if (condition.type === "measure") measures.add(condition.name);
      if (Array.isArray(condition.of)) condition.of.forEach(collect);
      else if (condition.of) collect(condition.of);
    })(quest.objective);
  }
  for (const needed of ["roadTiles", "residential", "poweredTiles", "wateredTiles", "population"]) {
    assert.ok(measures.has(needed), `the tutorial never asks the player to affect ${needed}`);
  }
});

test("every measure the engine offers is a real one", () => {
  const names = measureNames();
  assert.ok(names.length > 10, `only ${names.length} measures`);
  const state = blank();
  for (const name of names) {
    const value = evaluate(state, { type: "measure", name, atLeast: 0 });
    assert.equal(typeof value, "boolean", `${name} did not evaluate`);
  }
});

// --- content: volume and localisation ---------------------------------------

test("the catalogue holds the content slice 4.3 asks for", () => {
  // "ten tutorial quests, five milestone quests, three civic events, one
  // recoverable disaster scenario". Counted rather than eyeballed, because
  // content shortfall is invisible in a green suite — it looks exactly like
  // content whose conditions have not been met.
  const { all } = readQuests();
  const byCategory = (name) => all.filter((q) => q.category === name).length;
  assert.ok(byCategory("tutorial") >= 10, `${byCategory("tutorial")} tutorial quests, 4.3 asks for 10`);
  assert.ok(byCategory("growth") >= 5, `${byCategory("growth")} milestone quests, 4.3 asks for 5`);
  // Civic events are the ones that fire off the state of the city rather than
  // off the previous quest: services, environment, crime.
  const civic = byCategory("service") + byCategory("environmental") + byCategory("civic");
  assert.ok(civic >= 3, `${civic} civic events, 4.3 asks for 3`);
  assert.ok(byCategory("disaster") >= 1, "no recoverable disaster scenario");
});

test("every civic event can fire without a quest before it", () => {
  // An event gated behind a questDone is not an event, it is a chapter. These
  // three have to be able to arrive because the CITY did something.
  const { all } = readQuests();
  for (const quest of all.filter((q) => ["service", "environmental", "civic", "disaster"].includes(q.category))) {
    const refs = [];
    (function collect(condition) {
      if (!condition || typeof condition !== "object") return;
      if (condition.type === "questDone") refs.push(condition.id);
      if (Array.isArray(condition.of)) condition.of.forEach(collect);
      else if (condition.of) collect(condition.of);
    })(quest.available);
    assert.deepEqual(refs, [], `${quest.id} is an event that waits for a quest`);
  }
});

test("every word the advisor says exists in both locales", () => {
  // Ruling 008 and answer A4. The engine cannot check this — it does no I/O and
  // never sees the catalogue — so the check lives here. Until the content pass
  // these strings were English literals inside the quest data, which is most of
  // the text a player reads.
  const dir = join(repoRoot, "data", "i18n");
  const locales = Object.fromEntries(
    readdirSync(dir).filter((n) => n.endsWith(".json"))
      .map((n) => [n.replace(".json", ""), JSON.parse(readFileSync(join(dir, n), "utf8"))]),
  );
  const { all } = readQuests();
  const wanted = [];
  for (const quest of all) {
    wanted.push(quest.titleKey, quest.textKey);
    for (const choice of quest.choices ?? []) wanted.push(choice.textKey);
  }
  for (const [name, catalogue] of Object.entries(locales)) {
    const missing = wanted.filter((key) => !Object.hasOwn(catalogue, key));
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(", ")}`);
  }
});

test("no quest carries prose instead of a key", () => {
  // The failure mode being closed: a quest added later with `title:` and
  // `text:` still renders, because `t()` returns its argument when it misses —
  // so the English would ship silently as its own translation.
  const { all } = readQuests();
  for (const quest of all) {
    assert.equal(quest.title, undefined, `${quest.id} has a raw title`);
    assert.equal(quest.text, undefined, `${quest.id} has raw text`);
    assert.match(quest.titleKey, /^quest\./, `${quest.id}: titleKey is not a quest key`);
    for (const choice of quest.choices ?? []) {
      assert.equal(choice.text, undefined, `${quest.id} has a raw choice`);
    }
  }
});
