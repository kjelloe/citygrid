// Ruling 008 — localisation from the first string.
//
// A missing key in one locale must be a red suite, not a runtime fallback.
// Fallbacks hide exactly the strings nobody looks at: error messages and
// edge-case tooltips, which is where a missing translation is most visible
// when it finally appears.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, jsFilesIn, stripComments } from "./helpers/sources.js";
import { RESULT, REFUSAL } from "../shared/protocol.js";
import { DISASTER_NAMES } from "../engine/disasters.js";

const dir = join(repoRoot, "data", "i18n");
const locales = Object.fromEntries(
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name.replace(".json", ""), JSON.parse(readFileSync(join(dir, name), "utf8"))]),
);

const names = Object.keys(locales);

// --- every refusal the reducer can give has words for it (P98) ---------------

test("every RESULT code has a string in every catalogue", () => {
  // `t()` returns its own argument on a miss, so a refusal with no string shows
  // the player the literal `result.tooSteep` — and `setResult` in `hud.js`
  // renders whatever the reducer answered, whether or not anybody wrote words
  // for it. H6 added `TOO_STEEP` and nothing in the suite would have noticed if
  // its two strings had been forgotten; the comment in `hud.js` still says
  // "the seven result.* strings", and there are ten.
  for (const code of Object.values(RESULT)) {
    for (const [name, catalogue] of Object.entries(locales)) {
      assert.ok(Object.hasOwn(catalogue, `result.${code}`),
        `${name} has no words for RESULT ${code} — a player refused for this reason reads "result.${code}"`);
    }
  }
});

test("every result.* string is a code the reducer can actually give", () => {
  // The other direction: a string for a result that no longer exists is a
  // translation somebody paid for and nobody will ever see.
  const codes = new Set(Object.values(RESULT));
  for (const [name, catalogue] of Object.entries(locales)) {
    const orphans = Object.keys(catalogue)
      .filter((key) => key.startsWith("result."))
      .map((key) => key.slice("result.".length))
      .filter((code) => !codes.has(code));
    assert.deepEqual(orphans, [], `${name} has words for results the reducer cannot give: ${orphans.join(", ")}`);
  }
});

// --- and every way the DOOR can say no (X1b, ruling 027) ---------------------

test("every REFUSAL code has a string in every catalogue", () => {
  // The same claim as the one above, for the seven — now eight — ways a room
  // can turn a client away, and it was simply never made: `RESULT` was covered
  // after P98 and `REFUSAL` was added to the protocol in the same wave with
  // nothing watching it. Two of these are the only thing between a stale client
  // and a silent desync (plan §3.9), so what the player reads has to be
  // "reload", not "refused".
  for (const code of Object.values(REFUSAL)) {
    for (const [name, catalogue] of Object.entries(locales)) {
      assert.ok(Object.hasOwn(catalogue, `refused.${code}`),
        `${name} has no words for REFUSAL ${code} — a player turned away for this reason reads "refused.${code}"`);
    }
  }
});

test("every refused.* string is a code the door can actually give", () => {
  const codes = new Set(Object.values(REFUSAL));
  for (const [name, catalogue] of Object.entries(locales)) {
    const orphans = Object.keys(catalogue)
      .filter((key) => key.startsWith("refused."))
      .map((key) => key.slice("refused.".length))
      .filter((code) => !codes.has(code));
    assert.deepEqual(orphans, [], `${name} has words for refusals the door cannot give: ${orphans.join(", ")}`);
  }
});

test("the two mismatch refusals tell the player to reload", () => {
  // Not decoration: a client one deploy behind is refused precisely so that it
  // does not diverge silently, and a refusal the player cannot act on wastes
  // the only thing the handshake bought.
  for (const [name, catalogue] of Object.entries(locales)) {
    for (const code of [REFUSAL.VERSION_MISMATCH, REFUSAL.BUILD_MISMATCH]) {
      const words = catalogue[`refused.${code}`] ?? "";
      assert.match(words, /reload|last inn|oppdater/i,
        `${name}: "${words}" does not tell the player to reload (${code})`);
    }
  }
});

test("both launch locales exist", () => {
  assert.ok(names.includes("en"), "English catalogue missing");
  assert.ok(names.includes("no"), "Norwegian catalogue missing");
});

test("locale catalogues have identical key sets", () => {
  const reference = Object.keys(locales.en).sort();
  for (const name of names) {
    const keys = Object.keys(locales[name]).sort();
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `${name} has keys en does not: ${extra.join(", ")}`);
  }
});

test("no catalogue value is empty", () => {
  for (const name of names) {
    for (const [key, value] of Object.entries(locales[name])) {
      assert.equal(typeof value, "string", `${name}:${key} is not a string`);
      assert.ok(value.trim().length > 0, `${name}:${key} is empty`);
    }
  }
});

test("interpolation tokens match across locales", () => {
  const tokensOf = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(locales.en)) {
    const reference = tokensOf(locales.en[key]);
    for (const name of names) {
      assert.deepEqual(
        tokensOf(locales[name][key]),
        reference,
        `${name}:${key} has different interpolation tokens than en`,
      );
    }
  }
});

test("keys are namespaced, so the catalogue stays navigable as it grows", () => {
  // Hyphens are allowed after the first segment because content ids are
  // kebab-case — `quest.first-road.title`. Renaming those ids to fit a key
  // scheme is not an option: `state.quests.completed` holds them and is hashed,
  // so a rename would move every save's checksum.
  for (const key of Object.keys(locales.en)) {
    assert.match(key, /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9-]+)+$/, `${key} is not a dotted key`);
  }
});

/**
 * Keys whose Norwegian is deliberately the same as its English.
 *
 * Each one is a word a Norwegian has looked at and kept, with the reason. This
 * is not somewhere to put a string that has not been translated yet: the whole
 * point of the check below is that "the catalogue is complete" and "the
 * catalogue is Norwegian" are different claims, and the first one has been true
 * since slice 4.2 while the second has not (A21).
 */
const SAME_IN_BOTH = {
  "app.title": "the game's name, a proper noun",
  "alert.ping": "a template with no words in it — \"{name}: {message}\" — because both halves are "
    + "themselves already translated (X3b)",
  "lobby.join.code.hint": "an example join code, so it is the same six characters in every language "
    + "— and it has to LOOK like what the host is reading out (X2b)",
  "lobby.size.standard": "Standard is the same word in Norwegian",
  "lobby.size.region": "Region is the same word in Norwegian",
  "lobby.seedIs": "Region again, and the rest of the line is a token",
  "building.park": "Park is the same word in Norwegian",
  "category.transport": "Transport is the same word in Norwegian",
  "disaster.storm": "Storm is the same word in Norwegian",
  "overlay.auto": "Auto is the same word in Norwegian",
  "hud.slot.auto": "Auto again",
  "skin.retro": "Retro is the same word in Norwegian",
  "alert.disasterStruck.named": "the whole string is one interpolation token",
  "camera.pad.fly": "Fly is the same word in Norwegian",
  // The compass. N and S are the same letter in both, and a compass that says
  // something else in Norwegian would be a compass that lies (K4).
  "compass.n": "Nord and North both start with N",
  "compass.s": "Sør and South both start with S",
};

// --- the Norwegian pass (slice M4) -------------------------------------------
//
// Key parity has been enforced since slice 4.2, and it is the wrong question on
// its own: `t()` returns its own argument on a miss, so a catalogue can be
// complete and still be English. A21 has said "Norwegian is drafted, not
// reviewed" since N12, and nothing could see it.
//
// A value byte-identical to its English is either a word that is the same in
// both languages or a line nobody translated, and only a person can tell those
// apart — so the allow-list is the list of words a Norwegian has looked at and
// kept. It is not a way to make this test green.

test("no Norwegian string is its English twin, except where that was chosen", () => {
  const en = locales.en;
  const no = locales.no;
  const same = Object.keys(en).filter((key) => en[key] === no[key]);
  const unexplained = same.filter((key) => !Object.hasOwn(SAME_IN_BOTH, key));
  assert.deepEqual(unexplained, [],
    `untranslated, or the same word in both — say which in SAME_IN_BOTH: ${unexplained.join(", ")}`);
});

test("the allow-list has no entries for strings that have since been translated", () => {
  // The direction that rots. A key translated later must leave the list in the
  // same commit, or the list stops describing the catalogue.
  const stale = Object.keys(SAME_IN_BOTH).filter((key) => locales.en[key] !== locales.no[key]);
  assert.deepEqual(stale, [], `translated now, and still on the list: ${stale.join(", ")}`);
});

test("the allow-list has no entries for keys that are gone", () => {
  const missing = Object.keys(SAME_IN_BOTH).filter((key) => !Object.hasOwn(locales.en, key));
  assert.deepEqual(missing, [], `SAME_IN_BOTH names keys that no longer exist: ${missing.join(", ")}`);
});

test("every entry on the allow-list says why", () => {
  for (const [key, why] of Object.entries(SAME_IN_BOTH)) {
    assert.ok(typeof why === "string" && why.length > 8, `${key} has no reason on it`);
  }
});

test("the shop names are two different lists, not one copied twice", () => {
  // `data/names.json` is not in the i18n catalogue — R2 gave it `{en, no}` (A40)
  // and nothing checks it. A shop called the same thing in both languages is a
  // shop nobody named.
  const names = JSON.parse(readFileSync(join(repoRoot, "data", "names.json"), "utf8"));
  assert.equal(names.shops.en.length, names.shops.no.length, "the two lists are different lengths");
  const identical = names.shops.en.filter((name, i) => name === names.shops.no[i]);
  assert.ok(identical.length < names.shops.en.length / 3,
    `${identical.length} of ${names.shops.en.length} shop names are the same in both: ${identical.join(", ")}`);
});

test("every disaster the engine can name has words in every catalogue (B13)", () => {
  // The alerts' `namedKey` renders `disaster.<name>`: "Flood warning" tells a
  // player something and "disaster.downpour warning" does not. B13 added the
  // eighth kind and the suite was green with no string for it in either
  // locale — the RESULT and REFUSAL codes have had this test for a while and
  // the disasters never did.
  for (const name of DISASTER_NAMES) {
    if (name === "none") continue;
    for (const [locale, catalogue] of Object.entries(locales)) {
      assert.ok(Object.hasOwn(catalogue, `disaster.${name}`),
        `${locale} cannot name a ${name}`);
    }
  }
});

test("every disaster.* string is a disaster the engine can cause (B13)", () => {
  const known = new Set(DISASTER_NAMES);
  for (const [locale, catalogue] of Object.entries(locales)) {
    const orphans = Object.keys(catalogue)
      .filter((key) => key.startsWith("disaster."))
      .map((key) => key.slice("disaster.".length))
      .filter((name) => !known.has(name));
    assert.deepEqual(orphans, [], `${locale} names disasters the engine cannot cause: ${orphans.join(", ")}`);
  }
});

// --- a template that reaches the screen with its brace in it (X5, ruling 027)

/**
 * Every templated key whose NAME is assembled where it is rendered or carried
 * by a model, and the tokens whoever renders it fills.
 *
 * `t()` substitutes what it is given and leaves an unfilled token in the output
 * by design, so a templated key rendered through `t(key)` with no values shows
 * the player the template. `result.notOwner` reached a screenshot reading
 * *"That belongs to {player}"* exactly that way: `hud.js` renders every answer
 * the reducer gives through ``t(`result.${result}`)``, so the key is nowhere in
 * the sources for a scan to find and nobody was reading the catalogue either.
 *
 * The scan below catches the easy half — a literal key with a token and no
 * values beside it. A key assembled at runtime is invisible to that, so each
 * one is declared here with the tokens its caller passes. The fix when this
 * goes red is to pass the values or to write the string without the token;
 * adding a line here for a token nobody fills is how this test stops being one.
 */
const FILLED_BY_ITS_RENDERER = {
  // `client/ui/alerts-model.js` hands the alert list a `namedKey`.
  "alert.disasterWarning.named": ["disaster"],
  "alert.disasterStruck.named": ["disaster"],
  "alert.disasterOver.named": ["disaster"],
  "alert.ping": ["message", "name"],
  // `client/ui/ask-model.js` → `whatKey`, filled by the HUD's ask panel (X3b).
  "ask.what": ["name", "tiles"],
  "ask.what.one": ["name"],
  // `client/ui/inbox-model.js` → one `textKey` per row, filled by the drawer.
  "inbox.waiting.demolition": ["name", "tiles"],
  "inbox.waiting.demolition.one": ["name"],
  "inbox.waiting.nuisance": ["name", "tiles"],
  "inbox.sent.demolition": ["name", "tiles"],
  "inbox.sent.demolition.one": ["name"],
  "inbox.sent.nuisance": ["name"],
  "inbox.settled.theyApproved": ["name"],
  "inbox.settled.theyDeclined": ["name"],
  "inbox.settled.theyWithdrew": ["name"],
  "inbox.settled.theyNoted": ["name"],
  "inbox.settled.wasCleared": ["name"],
  "inbox.settled.youCleared": ["name"],
  // `client/ui/budget-model.js` → `labelKey` on a funding step and a loan size.
  "funding.lean": ["percent"],
  "funding.normal": ["percent"],
  "funding.generous": ["percent"],
  "loan.quarter": ["amount"],
  "loan.half": ["amount"],
  "loan.all": ["amount"],
  // `client/ui/statistics-model.js` → `verdictKey`, filled in `statistics.js`.
  "stat.verdict.steady": ["months"],
  "stat.verdict.rising": ["change", "months"],
  "stat.verdict.falling": ["change", "months"],
  "stat.verdict.better": ["change", "months"],
  "stat.verdict.worse": ["change", "months"],
  // The one the reviewer found. `hud.js` assembles `result.<code>` for every
  // answer the reducer gives, and this is the only one of the eleven with a
  // token in it — which is why it was the only one that could show a brace.
  "result.notOwner": ["player"],
};

const tokensOf = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const templatedKeys = () => Object.keys(locales.en).filter((key) => tokensOf(locales.en[key]).length > 0);

test("a templated key called by its own name is called with values", () => {
  // The easy half, and the half a scan can see: `t("hud.tiles")` with no second
  // argument renders "{count} tiles" to the screen.
  const sources = [...jsFilesIn("client"), ...jsFilesIn("tools")];
  const bare = [];
  for (const key of templatedKeys()) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const called = new RegExp(`\\bt\\(\\s*["'\`]${escaped}["'\`]\\s*\\)`);
    for (const { path, source } of sources) {
      if (called.test(stripComments(source))) bare.push(`${path}: t("${key}")`);
    }
  }
  assert.deepEqual(bare, [],
    `these render a template with nothing to fill it: ${bare.join(", ")}`);
});

/** Does anything call `t()` on this key by name, with values beside it? */
function calledWithValues(key, sources) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const call = new RegExp(`\\bt\\(\\s*["'\`]${escaped}["'\`]\\s*,`);
  return sources.some((source) => call.test(source));
}

test("a templated key is either filled where it is named or declared here", () => {
  // A key that reaches `t()` through a variable — `textKey`, `labelKey`,
  // `verdictKey`, or `result.<code>` assembled from the reducer's answer — is
  // spelled as a literal somewhere (that is the rule a runtime-assembled key
  // broke three times) but never beside its values, so no scan can say whether
  // anybody fills it. Those are the ones that have to be declared.
  const sources = jsFilesIn("client").map(({ source }) => stripComments(source));
  const undeclared = templatedKeys()
    .filter((key) => !Object.hasOwn(FILLED_BY_ITS_RENDERER, key))
    .filter((key) => !calledWithValues(key, sources));
  assert.deepEqual(undeclared, [],
    "templated, and nothing fills them where they are named — say who does in "
    + `FILLED_BY_ITS_RENDERER: ${undeclared.join(", ")}`);
});

test("what a renderer says it fills is what the string actually has", () => {
  for (const [key, tokens] of Object.entries(FILLED_BY_ITS_RENDERER)) {
    assert.ok(Object.hasOwn(locales.en, key), `FILLED_BY_ITS_RENDERER names ${key}, which is gone`);
    assert.deepEqual([...tokensOf(locales.en[key])].sort(), [...tokens].sort(),
      `${key} is declared as filling ${tokens.join(", ")} and its string wants `
      + `${tokensOf(locales.en[key]).join(", ")}`);
  }
});

test("a declared key is one no scan could have checked", () => {
  // The direction that rots. A key that becomes a literal call with values is a
  // key the scan above covers, and leaving it declared here means the next
  // reader trusts a note instead of the code.
  const sources = jsFilesIn("client").map(({ source }) => stripComments(source));
  const covered = Object.keys(FILLED_BY_ITS_RENDERER).filter((key) => calledWithValues(key, sources));
  assert.deepEqual(covered, [],
    `filled at a named call site after all, so the declaration is stale: ${covered.join(", ")}`);
});
