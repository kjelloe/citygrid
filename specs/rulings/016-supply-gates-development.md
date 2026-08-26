# Ruling 016 — Nothing develops where nothing can be supplied

- **Date:** 2026-08-26
- **Source:** slice 2.1/2.2, implementing `gamedesign.md` §8.2
- **Status:** ruled

## Question

`gamedesign.md` §8.2 lists electricity and water among the conditions for a zone tile to develop.
Is that a hard gate, or a factor in the development score?

## Ruling

**A hard gate, in both directions.**

- A zoned tile does not develop unless a *working* supply is within reach.
- A developed lot that loses its supply has its development score forced negative, not merely
  penalised, and decays.

## Why

Penalising was tried first and does not work: with demand high enough, the penalty is simply
absorbed and an unpowered tower block keeps growing. People do not live without water because the
housing market is tight.

More importantly, the gate is the teaching loop the design describes — zone, watch it develop,
watch it fail, connect it. Without it, utilities are decoration: a city that ignores them looks
identical to one that does not, and the player never learns what the wire is for.

## Consequences

- It invalidated half the Wave-1 test fixtures, which had been building cities with roads and no
  power. They build supplied cities now, which is what the game asks of a player.
- "A working supply" means a network component that actually contains a producer. An earlier
  version treated a component with no demand as satisfied, which marked every stretch of
  unconnected wire as powered and made the gate meaningless.
- A city with no surface water is still playable: groundwater pumps work anywhere, which is what
  keeps the "Dry" lobby option and the desert-settlement scenario alive.
- The deputy had to learn to build a connected grid before it could play at all, which is how
  three separate routing bugs were found.

## Enforced by

- `engine/development.js` — `couldBeSupplied` and the forced `unsuppliedScore`
- `engine/utilities.js` — a component is satisfied only with `capacity > 0`
- `test/utilities.test.js` — "a lot that loses its supply decays", "a plant with no wire supplies
  nobody", "a component short of capacity browns out entirely"
