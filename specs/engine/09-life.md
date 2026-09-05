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

## 9.1a As built (V1, 2026-09-06)

**B**, as recommended, in `client/life/traffic.js` — with one thing the plan had backwards, found
by measuring rather than by reading.

The plan says "a target density per link from `tiles.traffic`" and "a speed factor". Density
first, speed as a modifier. Built that way it produced **the same picture at every load**: 36
cars at 8.6 m/s whether the engine said 40 or 255. Two reasons, both arithmetic:

1. **The density target is never the binding constraint.** At `HEADWAY = 1.2 s` and 11 m/s, free
   flow is 5.7 cars per 100 m. You cannot push more onto a road than that without slowing it
   down, so any `maxDensity` above it is a number the road never reaches.
2. **The entry was a plug.** A car admitted a token gap behind another braked hard, and the slow
   car it became throttled everything behind it — the tail ran at 3.8 m/s while the head ran at
   9.1. A car now arrives at the speed of the traffic and one full headway behind it, or it does
   not arrive at all.

So the coupling is the other way round: **load sets the desired speed, and the density follows
from it.** `LOAD_SLOWS = 0.65` — a fully loaded road wants 35% of the limit — with the density
target kept only as a ceiling, itself capped by what the road physically holds
(`len / (CAR_M + S0)`).

| engine load | cars per 100 m | mean speed |
| --- | --- | --- |
| 40 | 1.9 | 9.6 m/s |
| 128 | 6.1 | 6.0 m/s |
| 255 | 8.0 | 3.2 m/s |

Both numbers track the load, which is the point: a jam has to read as a jam and not as a longer
line of cars going the same speed as an empty street.

Measured: 997 cars on a 64×64 at **0.09 ms** a step, 3,660 on a 128×128 at **0.5 ms**. A car is
82 measured triangles, so cars are a ladder rung between props and markings and a resolvability
gate at 18 px a tile. `?life=0` freezes them where they settled and two `screenshot.mjs` runs of
one city come out byte identical.

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
