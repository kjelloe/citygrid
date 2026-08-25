# Ruling 003 — Singleplayer ships first

- **Date:** 2026-08-25
- **Source:** P5 (asked), answered directly by the user
- **Status:** ruled

## Question

Does the server lane run alongside the first systems, or after the singleplayer loop is proven?

## Ruling

**Singleplayer MVP first.** Waves 0–4 are singleplayer. Wave 5 does not begin until the
singleplayer MVP is accepted against the thirteen criteria in `gamedesign.md` §24.

Two things are built in from day one anyway, at one seat:

- **Ownership**, because retrofitting an owner check into a reducer is how permission bugs are born
  (slice 1.3, before the command set grows).
- **The session seam** — `session.state`, `session.apply()`, `session.onChange` — so that no UI
  module ever learns whether a socket exists.

## Why

Wave 5 is expensive. Carrying server complexity through every early slice while the core loop is
still unproven pays for infrastructure around a game that might not be fun. The cheapest possible
answer to "is this fun" comes from a singleplayer city, and it comes months earlier.

The two exceptions above cost almost nothing now and would cost enormously later.

## Consequences

- Listed in `plan-v1.md`'s stop-and-re-plan section: *the singleplayer MVP is not fun* is a
  stop condition, not a reason to press on into Wave 5.
- Singleplayer must stay genuinely client-side — no server, no account, no network call, playable
  offline as an installed PWA (P2).
- Singleplayer is Shared City with one seat, so there is one code path rather than two.

## Enforced by

- `plan-v1.md` ruling 1, wave order, release gates
- `specs/plan.md` §0, §3.1
- `specs/gamedesign.md` §33 amendment to §22
