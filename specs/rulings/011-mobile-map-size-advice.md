# Ruling 011 — Advise a smaller map on mobile; never forbid

- **Date:** 2026-08-25
- **Source:** P8, answering Q10
- **Status:** ruled

## Question

If a large region cannot hold the frame budget on mid-range mobile, do we cut the map size or ship
it desktop-only?

## Ruling

**Neither. Advise.** The lobby detects a coarse pointer and low device memory, **recommends** a map
size, marks larger ones as "may run slowly on this device", and lets the host proceed anyway.

Recommended ceilings, era 0 until measured: phone 64×64, tablet 96×96, desktop 128×128.

## Why

A hard block fails the wrong person. A phone player must be able to **join** a 128×128 region that
someone else created — refusing would make map size a social problem rather than a performance one,
and drop-in is the whole design.

Degradation is the honest answer: reduced-effects mode, a lower device pixel ratio, fewer sampled
vehicles, and a smaller draw distance keep a large region playable on a phone even when it is not
pretty.

## Consequences

- Map size stays a host choice; the client adapts rather than the world shrinking.
- Reduced-effects mode must be automatic on a weak device, not only a manual setting, and it must
  be announced rather than silent — a player should know why their city looks simpler.
- The client may also fall back to a coarser simulation cadence for *rendering* purposes only; it
  never changes the simulation itself, which is authoritative and identical everywhere.
- Slice 6.3 measures the real ceilings and replaces the era-0 numbers above.

## Enforced by

- `client/lobby/` size recommendation from `navigator.deviceMemory` and `(pointer: coarse)`
- `plan-v1.md` slice 6.3
- `specs/gamedesign.md` §26.2
