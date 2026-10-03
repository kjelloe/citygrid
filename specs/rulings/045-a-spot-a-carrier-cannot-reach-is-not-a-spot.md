# Ruling 045 — A spot a carrier cannot reach is not a spot

- **Date:** 2026-10-03
- **Source:** G2 — the deputy's carriers reach a live grid. A86 asked for one thing (prefer a
  carrier the supply pass has flagged satisfied, for every building rather than for the rail
  station alone) and the measurement found two more, both of which end with a building nothing can
  ever reach.
- **Status:** ruled

*Specified by `specs/gamedesign.md` §7.4–§7.5 — supply reaches, it does not touch — and by ruling
016, which makes a working supply a hard gate on development in both directions. A building the
carrier never reaches is a building that ruling 016 condemns.*

## Question

`connectToNetwork` runs a wire and a pipe from a new building to the grid. Three cities in twelve
ended with a building that had neither, and in each case the search had nowhere to go: seed 1003's
fire station was a 2×2 whose top-left tile had two of its own tiles as neighbours and buildings on
the other two sides; seed 404's clinics sat inside a solid block of lots; seed 1111's reservoir had
an empty side that faced into a pocket with no grid in it.

Is that the carrier search's problem to solve, or the spot chooser's?

## Ruling

**The spot chooser's.** `findSpotFor` refuses a spot unless at least one ORTHOGONAL side of the
footprint is a tile a carrier run could actually arrive at — reachable from the grid the deputy
already has, over the same walls `connectToNetwork` walks. Empty is not enough; reachable is the
test. When there is no grid at all — the first plant in a new city — the requirement does not
apply, because nothing is reachable yet and the building is what makes the grid.

The search itself gains the other half: it starts from **every tile of the lot**, not from the one
tile it was handed, so a footprint can never seal itself in.

## Why

A carrier run that finds no route is the quietest failure in the engine: it issues no command, so
nothing is refused, nothing is charged, and no counter moves. The building stands there looking
exactly like a connected one, and `state.supply` reports it as one more starved lot among the lots
that are starved because the city is genuinely short of capacity. That is how it survived for the
life of the project.

Fixing it in the search is impossible — there is no route to find, and inventing one means laying
wire under somebody's building. Fixing it in the chooser costs one flood fill per placement
decision over ground the deputy was already scanning tile by tile, and it answers the question the
placement is actually asking: *can this building be part of the city?*

The two halves are deliberately kept in agreement: `carrierReach` uses `connectToNetwork`'s walls,
so a lot the chooser says yes to is a lot the search can reach. If those two ever disagree, the
disagreement is a dark building.

## Consequences

- The deputy declines spots it used to take, so its buildings sit nearer the street and nearer each
  other, and it refuses rather than wasting a turn — this is a change to what the deputy DECIDES
  and therefore its own balance era (14).
- `deputy.unconnected` counts runs that reached nothing. It is expected to be zero; it exists so
  that the next version of this failure is loud. `tools/soak.mjs` reports it beside `refusals`.
- A lot can still be sealed in AFTER it is built, by lots developing around it, and that is fine:
  the carrier it was connected to is a tile under or beside it that nothing may build on, so it
  keeps its supply. The geometry is not the invariant; the supply is.
- **Not covered:** a grid a disaster cuts in two. The deputy connects a building when it builds it
  and never looks again, so a component that loses its producer stays dark — Q130.

## Enforced by

- `test/deputy.test.js` — "every building the deputy builds ends up on a live grid": over three
  seeds chosen because each shows a different one of the three defects, `deputy.unconnected` is 0,
  the power grid is at most two components, and nothing is dark in a city that has the capacity for
  it
- `tools/sim_sweep.mjs` — the component count and the dark-building counts are columns in every
  balance report from era 14, so a regression is visible in the sweep rather than in a single city
