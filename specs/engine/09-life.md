# 09 - Life

## 9.1 Traffic you can see (V1), from the lane graph

The engine has computed a per-tile commuter load since N7 and only an overlay reads it. The
plan's V1 says: cars stream along a road at a speed that falls with load and bunch up where it
is over capacity, renderer-side, no float in state, no hash moves. Two ways to get there (D6):

**A - hashed time.** Position = `(time × speed(load) + hash(tile)) mod linkLength`. No local
state, perfectly reproducible, two clients agree. Cars never queue; a full road is a fast
conveyor of evenly spaced cars, which is not what the reference shot shows.

**B - a local car-following sim.** Union Square's `Traffic.ts` reduced to what a grid needs:
vehicles on links with IDM following (`S0 = 2 m`, `HEADWAY = 1.2 s`), a target density per link
from `tiles.traffic`, spawn at entry links and at the density deficit, despawn at the surplus,
right turns and straight-through by hash at each node, a stop line at nodes with a signal.
Cars bunch behind a signal and crawl on a link over capacity, which *is* the reference.
Local state: a few numbers per car, thrown away on reload. Seeded from the map seed so a
screenshot is repeatable at a fixed time.

B is the recommendation. It does not touch state, and the deterministic-across-clients argument
does not apply to something two players are not meant to compare.

Vehicles: the existing two `car` variants in `building-kit.js` at L2, plus a van and a bus at L3;
one instanced pool per variant with a per-instance colour from the accent palette; yaw from the
link tangent; wheels not needed below L3. Per-tier cap (8.3) and a ladder rung.

## 9.2 Signals

Nodes with degree ≥ 3 on a corridor of `road` kind get a two-phase cycle (Union Square:
60 s) with a hashed phase offset. At L2 nothing is drawn; at L3 a signal head per approach with
the lit lamp as an emissive bucket swap. Pedestrian walk phases feed the nav graph.

## 9.3 Pedestrians (later)

Union Square's `Pedestrians` is a role state machine over a nav graph with grid-hash separation
and an instanced procedural rig. For a street mode in City Grid the useful subset is:
commuters between a lot door and the map edge, shoppers between commercial doors, waiting at a
signal, sitting on a bench. Density from the building's `occupancy` and level. L3 only, capped
by tier, the rig simplified to a two-part body with a walk-cycle bob. A separate slice after
street mode exists.

## 9.4 Ambient motion

Higashiyama's rule: restrained. Trees sway a little, a flag moves, smoke from an industrial
stack drifts, a crane on a construction site turns. Nothing bounces, nothing pulses. Each is a
per-frame uniform on an instanced pool, not per-instance work.

## 9.5 What life must never do

- Read anything but `state` and its own local memory. It never issues a command.
- Cost anything when the tier says off: `Config.noLife` in Union Square exists for the QA
  capture; the same flag freezes life for a deterministic screenshot here.
- Enter the hash. `tiles.traffic` is the only coupling and it is one-way.
