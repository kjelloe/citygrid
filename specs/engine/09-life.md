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

## 9.3 Pedestrians

Union Square's `Pedestrians` is a role state machine over a nav graph with grid-hash separation
and an instanced procedural rig. For a street mode in City Grid the useful subset is:
commuters between a lot door and the map edge, shoppers between commercial doors, waiting at a
signal, sitting on a bench. Density from the building's `occupancy` and level. L3 only, capped
by tier, the rig simplified to a two-part body with a walk-cycle bob.

**Built (E7, 2026-09-07.)** Two modules and a kit piece, all pure and all in the shape the
traffic already has (ruling 037): nothing is state, nothing is saved, and every choice a person
makes is a hash of an integer that is already in state.

`client/world/nav.js` derives the graph. A **walk** edge is one side of one corridor, offset
`road.width / 2 + road.sidewalk / 2` and trimmed a junction box short at each end — the same
`offsetPolyline`/`trim` the lane graph uses, now shared through `client/world/polyline.js`. A
**cross** edge spans the carriageway at a node and carries that node's signal axis, so a person
waits at a red the same light the cars are going through. A **corner** edge joins two corridors'
pavements round a junction. A lot's **door** is a point ON a walk edge — the outer end of E5's
path, projected — rather than a node, because a door node would split every pavement it sat on.

`client/life/pedestrians.js` fills those pavements. **There is no route planner, deliberately**:
a person picks a successor edge at each junction by a hash of their own id, exactly as a car
picks its turn, and the doors decide where people enter and how many (`ped.perOccupant` of a
building's occupancy). That gives crowds outside busy buildings, people waiting at red and
nobody walking through a wall, for the cost of a hash. Roles, benches and real door-to-door
journeys are **Q62**.

Three things the summary above does not say, all of them found by looking at the render:

- **The cap is spent nearest the eye.** It is a budget, and a budget spent off screen buys
  nothing: filling pavements in derivation order put 39 of 120 people more than 250 m away with
  two on the street underfoot. Pavements are sorted by their nearest DOORWAY to the eye — not by
  where the pavement starts, because a corridor is 300 m long and its first point says nothing
  about where its people will be — and each is filled to its own capacity before the next.
- **A fractional demand is hashed, not rounded.** The cars' `here + 0.5 < target` copied over
  meant a pavement outside an ordinary house asked for 0.24 people and got none, so a city of
  houses had nobody on it at all.
- **Cars yield, the walker goes anywhere** (A45). `traffic.yieldTo` takes world points — people
  on crossings, plus the player's own walker in street mode — and `ahead()` treats one as a
  harder wall than a red light. The collision world deliberately never keeps a person off a
  carriageway.

## 9.4 Ambient motion

Higashiyama's rule: restrained. Trees sway a little, a flag moves, smoke from an industrial
stack drifts, a crane on a construction site turns. Nothing bounces, nothing pulses. Each is a
per-frame uniform on an instanced pool, not per-instance work.

## 9.5 What life must never do

- Read anything but `state` and its own local memory. It never issues a command.
- Cost anything when the tier says off: `Config.noLife` in Union Square exists for the QA
  capture; the same flag freezes life for a deterministic screenshot here.
- Enter the hash. `tiles.traffic` is the only coupling and it is one-way.

## 9.6 Review round after E3 (2026-09-06)

- A car in a junction takes the desired speed of the block link it came from. `traffic.js`
  looks it up by `link.from`, which for a turn link is a **node** id in a map keyed by **link**
  ids, so a car in the box gets an unrelated street's speed or the limit (R1: carry the speed
  on the car when it enters a turn).
- The car pools must be marked visible after `pose`, not before: `updateInstances` sets
  `visible = count > 0` and the moving cars are pushed afterwards, so a variant with no parked
  car in view draws no moving cars either (R1).
- Spawning happens at the tail of any under-target block link, which is "out of the last
  junction"; despawning takes the car nearest the end. Both read as plausible at city zoom and
  will not at street level. E7-time question: spawn only on `entry` links and at the map edge
  of the view.
