# Ruling 008 — Localisation from the first string

- **Date:** 2026-08-25
- **Source:** P8, answering Q4
- **Status:** ruled

## Question

Is Norwegian a launch locale or a later addition?

## Ruling

**Norwegian and English from the start.** No user-facing string is ever written inline. Every one
lives in `data/i18n/{en,no}.json` behind a key, from the first slice that renders text.

Catalogue key parity is enforced by test: a key present in one locale and missing in the other is a
red suite, never a runtime fallback.

## Why

Retrofitting i18n is the expensive version of this. Every inline string written before the rule
exists has to be found again later, and the ones that get missed are exactly the ones nobody looks
at — error messages, edge-case tooltips, the text that only appears when something has gone wrong.

Making it a rule on day one costs a lookup call per string and nothing else.

## Consequences

- The advisor's voice is the hard part: personality does not survive literal translation, so
  persona-flavoured strings are authored per locale rather than translated (see ruling 010).
- Number, date and currency formatting go through the locale too, not through string concatenation.
- Player-authored text (city names, request reasons) is **not** localised and must never be run
  through the catalogue — it is untrusted data, displayed as plain text.
- Q16 is open: whether Kjell writes the Norwegian himself or reviews a draft.

## Enforced by

- `test/i18n.test.js` — key parity, no empty values, no stray interpolation tokens
- `test/no-inline-strings.test.js` — client modules must not contain user-facing literals
- `data/i18n/en.json`, `data/i18n/no.json`
