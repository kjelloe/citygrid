# Ruling 002 — A room is a persistent world

- **Date:** 2026-08-25
- **Source:** P5 (asked), answered directly by the user
- **Status:** ruled

## Question

Is a multiplayer room a match with an ending, or a world that persists?

## Ruling

**A persistent world, in every mode.** No victory condition and no forced ending. A room keeps its
city across days and weeks; players come and go; the clock runs while anyone is connected and
hibernates when the room is empty.

Region Rivals scores continuously and drops a **season marker** every 25 city years — a ranking, a
recap, an entry in the room's history — **without** ending the world, resetting the map, or
evicting anyone.

Scenario Co-op is the single exception: it ends on its objective or timer, by definition.

## Why

Drop-in only makes sense if the world outlives the session. The whole design is built around a
player being useful in five minutes and leaving without harm; a match timer contradicts that, and
in a city builder the pleasure is the long accumulation. Nobody should be thrown out of a city they
have built for a week because a timer expired.

## Consequences

Three things stopped being optional the moment this was ruled:

- **Yearly checkpoints with command-log truncation.** A room that runs for weeks would otherwise
  accumulate an unbounded log; replay works from the nearest checkpoint.
- **Room lifetime policy** (`keepForDays`), so dead worlds are eventually reclaimed, with a host
  pin for permanent rooms and an export-to-singleplayer path for anyone who wants to keep building
  alone.
- **Empty-room hibernation.** A city nobody is watching does not need to grow, and this is what
  makes many rooms per host viable.

## Enforced by

- `specs/gamedesign.md` §27.1
- `specs/plan.md` §5.4, §2.7, §3.7 lever 7
- `plan-v1.md` ruling 3, slices 6.2 and 6.3
