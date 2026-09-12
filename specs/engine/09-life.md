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

## 9.1b As built (B4, 2026-09-12) — the hour, the doors and the lamps

**The hour.** `client/world/rush.js` is a curve over the light cycle's phase: 0.4 at night, about
1.0 by day, 1.3 at the two rushes (phase 0.08 and 0.44). It multiplies the per-link target in
`targetFor`, under the same `jam` cap, so a rush cannot ask for more cars than a road holds. The
phase is handed in (`setPhase`, and `options.phase` at construction so a frozen `?life=0` city
settles at its own hour); `client/life/` still reads no clock (ruling 037). `tideAt` names the
tide: `out` in the morning, `in` in the evening.

**The doors.** A lot's door is the same point the pedestrians use — `doorPoint` on the lot's front
edge — seated on the nearest block lane within 12 m, and never within a car and a gap of either end
of the link. A car spawns at a door that is EMITTING at this hour (homes in the morning, shops and
works in the evening, all of them otherwise), pulling out at half the street's speed with a headway
in front and two of the follower's behind; failing that, at the link's tail as before. A car the
density control wants gone turns in at a RECEIVING door ahead of it, indicating for the last 20 m;
failing that, the car nearest the end goes, as before. **Doors change where a car appears, never how
many** — the item's own words, and the test that holds them to it (a street with lots settles within
10% of the same street without). A first version boosted every link with frontage by 1.35: the
ordinary day went from 295 cars to 412 and the junctions filled.

**The lamps.** Two pools that ride the car bodies, unlit (a lamp shaded by the sun is off at the
hour it exists for) and shadowless. Brakes: decelerating harder than 0.8 m/s², or crawling below
1.5 m/s on a road that wants more than 2 — a queue at a red light is a line of red lamps, and on a
four-junction city only 2.5% of cars decelerate at any instant while 13% are held. Indicators: the
turn already chosen is not the straight one and the car is within 20 m of the end, or it is turning
in at a door; blinking at 1.5 Hz off the traffic clock, and always lit when life is off — a frozen
settle of 240 steps of 1/30 lands at 7.999999999999981 s, on the dark half of the blink, forever.

**Measured**, the 64-tile played city (seed 1003, forty years, 294 buildings), uncapped as at High,
120 s settled: before B4 295 cars, 25% stopped; after, 312 on an ordinary day (25%) and 432 at the
morning rush (36%). `lanes_dump` on the 96-tile city: morning 10,616, sunset 8,023, night 4,706
(night/morning 0.44 — the rush is clipped by `jam`, so the ratio is above the curve's 0.38). Door
derivation: 1.0 ms a rebuild on the 64-tile saturated city, 2.0 ms on the 96.

**Not fixed here: cars through each other in a junction (Q96).** It predates B4 and the per-link
overlap invariant cannot see it; `lanes_dump` prints the count.

## 9.2 Signals

Nodes with degree ≥ 3 on a corridor of `road` kind get a two-phase cycle (Union Square:
60 s) with a hashed phase offset. **Narrowed by A51 in T1**: only where two real streets cross —
four arms with a corridor of more than one tile on each axis. Everything else is give-way, and
the through road (the axis with two arms) holds priority. `isSignalled` and `givesWayAt` in
`client/world/signals.js` are the one place both rules live, because the lane graph, the heads
and the pedestrians all have to agree with them. At L2 nothing is drawn; at L3 a signal head per approach with
the lit lamp as an emissive bucket swap. Pedestrian walk phases feed the nav graph.

**Built (V8, 2026-09-07.)** `client/world/signals.js` — pure — decides where a head stands (on
the kerb, on the near right of its arm, back at the junction box where a driver can see it),
where the zebra's bars go, and which of the three lenses is lit. The head's POST and HOUSING are
baked into the chunk with everything else; the LENS is not, because it changes three times a
minute — `baker.signals` records where each one is and `scene.js` poses an instance there
coloured from **the same `phaseAt` the cars read**. Two answers to "which way is green" would be
a car driving through a red one, and it would be visible for exactly the second it took.

The crossing bars are painted only where there is a light: a zebra with nothing to stop the
traffic is a lie about who has right of way (A33). The pedestrians already wait at the same
signal (§9.3), so the light, the queue and the person standing at the kerb are one fact.

Cost, measured on the saturated 96×96 at High: **1,920 triangles a chunk** — four heads and
twelve bars at sixteen junctions — and the lens is an OCTAHEDRON rather than a sphere, because
36 triangles for something two pixels across took the night frame's ladder a rung further down.
Drawing them surfaced something nobody had seen: **every junction on an ordinary city grid was
signalled**, true since E1 and invisible while nothing stood there (Q67). A51 narrowed it in T1 —
on the deputy 64×64 that is 1,126 signalled junctions down to 41 — and an unsignalled junction
keeps its crossing bars and loses only its heads: a zebra is where people cross, a head is what
stops the traffic, and at a give-way junction there is nothing there to stop.

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

## 9.3b As built (B7, 2026-09-12) — the crowd seen from the air

E7's crowd is 120 people spent nearest the eye and drawn from 50 px a tile, which the city camera
reaches only on a big screen — so from the air a street with people on it had nobody on it.

**Two crowds over one nav graph.** The **city crowd** (`createPedestrians({ spread: true })`) fills
every pavement towards its demand, in an order hashed from the pavements, and never thins for being
off screen: how many exist is a function of the city and `pedCapCity` (Low 0, Medium 200, High
600) and nothing else, and the camera decides only which are drawn (D7). E7's crowd is unchanged
except that it reads the city crowd's count per pavement (`reserve`) and tops a street up to its
demand instead of doubling it. Both walk the same edges at the same pace, and both are handed to
the cars at crossings.

**The figure** is `client/world/figure.js`: twelve triangles — a tapered three-sided body with a
lid and a floor, and a pointed three-sided head in a lighter shade — 1.84 m tall, faceted, never a
billboard. Pure, so node checks the count, the size and that every face winds outwards;
`building-kit.js` only hands the faces to three.

**Which figure, where.** `figureAt(x, z)` in `scene.js` asks what the SPOT resolves — E7's person
from 50 px a tile, the figure from the air from 30 (`RESOLVE.pedsCity`), nobody below — so a person
the camera zooms in on keeps their stride and changes detail. Under perspective the frame plan does
not cut the city crowd at the target's zoom, because the foreground is finer than the target: at
40 tiles across the target read 27 px and the first version dropped all of them while its counter
reported 167. The ladder drops the crowd straight after E7's people.

**Measured**, the 64-tile played city (forty years), High, 1920×1080, city camera at pitch 30:
at 20 tiles across **570 of 600 posed** (297 as the figure from the air, 273 as E7's), and
**1,041 pixels** that are magenta only in the magenta shot; at 40 across **167 posed** and 184
pixels, +2,004 triangles (167 × 12). What that looks like: at 20 across a person is an upright tick
about two pixels by five, at 40 a one- or two-pixel dot strung along a pavement — life on the
street rather than figures, which is what thirty pixels a tile buys.

## 9.4 Ambient motion

Higashiyama's rule: restrained. Trees sway a little, a flag moves, smoke from an industrial
stack drifts, a crane on a construction site turns. Nothing bounces, nothing pulses. Each is a
per-frame uniform on an instanced pool, not per-instance work.

## 9.4a Sound, at eye height (V8, 2026-09-07)

`ambienceFor` is a property of the CITY — population and congestion — and it is the right answer
from the city camera. At street level it is the wrong question: a busy arterial and a cul-de-sac
two streets away are the same city and very different places. `streetAmbienceFor` takes the
engine's own `tiles.traffic` under the walker and adds it to a third of the city's level, so the
city is a floor and the road under your feet is what changes. Both numbers are hashed state, so
§9.5's rule holds: a muted client and a loud one stay hash-identical.

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
