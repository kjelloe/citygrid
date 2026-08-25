# Ruling 004 — The restricted subset applies to `engine/` only

- **Date:** 2026-08-25
- **Source:** P5 (asked), answered directly by the user
- **Status:** ruled

## Question

Should the whole codebase use the restricted, Lua-portable JavaScript subset from the
RetroMultiCiv stack, none of it, or part of it?

## Ruling

**`engine/` core only.** Inside `engine/`:

- No `class`, no `this`, no `new`
- No `Map`, no `Set`
- No exceptions — no `throw`, no `try`
- Plain functions over plain objects, arrays and typed arrays
- Index and coordinate maths only through named helpers (`tileAt`, `neighbours`)
- Integer division only through `idiv()`
- No `null` anywhere in state

`shared/`, `worker/`, `server/` and `client/` use idiomatic modern JavaScript.

## Why

The full-codebase version of this discipline costs real verbosity every day, and most of the
codebase would never be transliterated to anything. The engine core is the only part a Luau twin
would need, and the restrictions double as a readability constraint on the rules themselves — the
part of the code that most needs to be legible to a non-author.

The specific bans are the classic cross-language traps: JSON `null` becomes `nil` in Lua and
*vanishes from tables*; 0-versus-1 indexing kills ports; float creep diverges across languages;
table iteration order differs.

## Consequences

- A Roblox/Luau port (Wave 7) stays a mechanical transliteration rather than a reimplementation.
  If a refactor would help the port, refactor the JS first, then re-twin.
- Enforced from slice 0.3 by `test/subset.test.js`, which must fail on a planted `class` and a
  planted `Map`.
- `test/purity.test.js` covers the neighbouring bans across `engine/` and `shared/`:
  `Math.random`, `Date.now`, `new Date`, timers, `null` literals, float literals.

## Enforced by

- `test/subset.test.js`, `test/purity.test.js`
- `CLAUDE.md` non-negotiable 4
- `specs/plan.md` §0
- `plan-v1.md` ruling 5, slice 0.3
