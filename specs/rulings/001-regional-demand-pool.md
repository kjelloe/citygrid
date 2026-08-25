# Ruling 001 — Demand is one regional pool

- **Date:** 2026-08-25
- **Source:** P5 (asked), answered directly by the user
- **Status:** ruled

## Question

In multiplayer, does each player have their own RCI demand, or do all players draw on one shared
regional demand?

## Ruling

**One regional pool, in every mode**, including co-operative ones. Residents, shoppers and firms
belong to the region, not to a player. Each month the pool is allocated between eligible lots
across all players by relative attractiveness: land value, tax rate, service quality, commute time,
pollution.

Three consequences follow and are part of the ruling:

- **Employment crosses borders.** Your residents may work in my district; the commute is assigned
  over the shared road graph and both of us feel the congestion.
- **Service coverage crosses borders** by default, revocable per neighbour through mutual aid.
- **Nuisances and disasters cross borders**, with liability defined in `gamedesign.md` §25.6.

## Why

It is what makes a shared map a shared *city* rather than parallel singleplayer games on one
texture. Undercutting a neighbour's tax rate genuinely pulls growth across the border; the hospital
they did not build costs them population. Taxes, services and commute time become the actual
competition, and no separate PvP system has to be invented for a genre that should never be
violent.

In co-operative modes it needs no special case: it simply means the city grows where it is best
served.

## Consequences

- The demand system cannot be written per-seat and then generalised. It is regional from slice 1.4,
  where it runs with a single seat, and multi-seat allocation is tested at 6.1.
- Snowballing is the risk. Per-seat land share and score spread are sweep columns for exactly this
  reason, and demand elasticity is a difficulty-tier knob.

## Enforced by

- `specs/gamedesign.md` §25.6, and the §33 amendment to §8.1
- `specs/plan.md` §2.6
- `plan-v1.md` ruling 2, slices 1.4 and 6.1
- Sweep columns: per-seat land share, score spread
