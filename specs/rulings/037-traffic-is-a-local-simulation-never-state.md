# Ruling 037 — Visible traffic is a local car-following simulation, never state

- **Date:** 2026-09-05
- **Source:** P37 — D6, the recommendation accepted; P36 asked for "cars on roads representing traffic"
- **Status:** ruled

## Question

`state.tiles.traffic` is a hashed per-tile commuter load the engine has computed since N7, and
only an overlay tint reads it. V1 draws moving cars from it. Do the cars come from a hashed
function of time — no state, identical on every client, never queueing — or from a
renderer-local car-following simulation that can bunch and crawl?

## Ruling

**A local simulation.** Vehicles live on the lane graph `client/world/` derives from the
corridors (block links between nodes, bezier connectors and right turns through each node,
right-hand traffic). Each link has a target density from `tiles.traffic`; vehicles follow the
car in front with the IDM rule Union Square uses (`S0 = 2 m`, `HEADWAY = 1.2 s`), stop at a
signal's stop line, spawn at entry links and at a density deficit, despawn at a surplus. The
simulation is seeded from the map seed so a capture at a fixed time is repeatable.

Its state is a few numbers per car, held by the renderer, thrown away on reload, never
serialised, never hashed, never sent. The only coupling to the game is `tiles.traffic`, read
one way.

## Why

The reference shot (`debugging/transport-world-example.png`) is recognised by its queues: cars
nose to tail behind a junction, a free road with gaps. A hashed time function cannot produce a
queue — it is a conveyor of evenly spaced cars whose speed drops with load — and it would be
the single most visible way the picture failed to match.

The determinism argument for the hashed function does not apply. Two clients in a shared
region must agree about every rule and every number; they are not meant to compare cars. The
same is already true of parked cars, tree species and roof hues, all of which are per-client
hashes today.

## Consequences

- Slice V1 depends on E1 (the lane graph) and V2 (the tier cap).
- Cars are a rung on the LOD ladder (between props and markings) and capped per tier: 60 on
  Low, 200 on Medium, uncapped on High.
- `?life=0` freezes the simulation for a deterministic screenshot, as Union Square's
  `Config.noLife` does; every capture gate passes it.
- Signals: nodes with degree ≥ 3 on a two-phase cycle with a hashed phase offset. Not drawn
  below L3; obeyed from V1.
- Pedestrians (E7) follow the same rule: local, capped, one-way.

## Enforced by

- `specs/engine/09-life.md` — the specification
- `test/purity.test.js` — nothing under `client/` writes to `state`
- `test/fixture.test.js` — the hashed field list does not gain a traffic entity
- `tools/budget_gate.mjs` — the car pool is counted and capped at every tier
