# worker — work items

*Written 2026-09-06. `specs/plan.md` §0 and §3.1 put the simulation in a Web Worker from the
first draft — "always a Web Worker on the client, never on the render thread" — and `worker/`
has been an empty directory for the life of the project. Every `apply()` runs on the render
thread today, beside a renderer whose model rebuild costs **53.3 ms** per build action on a 96×96, **68.3 ms** on a
128 `hilly` and **184.7 ms on a 256×256** — eleven frames (Q60, D6) — and a month tick of a few milliseconds. This lane builds the session seam the plan
describes, moves the reducer behind it, and measures what it bought. It is the largest of the
four lanes and the one with the most ways to break determinism, so it goes **last**, on
`main`, after the measurement lane has real frame times to compare against. Same rules as
`workitems-cityviewer.md` §0, plus CLAUDE.md's determinism machinery: **no hash may move**,
and the hash is what proves the worker runs the same game.*

## The shape

```
render thread                          worker thread
─────────────                          ─────────────
session.apply(command) ──postMessage──► reducer: apply(state, command)
session.state  (a MIRROR)  ◄──────────  { result, events, tick, hash, patch }
renderer reads the mirror              owns the only state
```

The mirror is the render thread's copy of `state`, updated from what the worker sends back.
The renderer, the HUD, the minimap and cityviewer's model all read it exactly as they read
`state` today; nothing above the seam changes. The worker owns the only authoritative copy and
is the only thing that calls `apply`.

Three things decide whether this is cheap or expensive, and they are settled here rather than
discovered:

1. **What crosses back.** Per accepted command and per tick: the `RESULT`, the events the HUD
   needs, `tick`, and the **tile layers that changed** as transferred `ArrayBuffer`s (a
   `Uint8Array` a layer, 16 KB on a 128×128, sixteen layers worst case — 256 KB, once a tick at
   2.5 Hz). The buildings list is small and goes whole. A full mirror refresh (all layers plus
   every entity) is the join/resume path and happens once.
2. **Hash on both sides.** The worker sends its hash every tick; the mirror hashes itself every
   month and compares. A mismatch is the loudest alarm in the project (CLAUDE.md), and it is the
   test that the mirror is a faithful copy.
3. **Latency is a UI fact.** A build click round-trips through the worker before the ghost
   becomes a building: a few milliseconds on a desktop, more on a phone. The optimistic ghost
   already exists and is never state; the seam keeps it on screen until the result comes back.

## W1 — The session seam, on the main thread first (M) — **done 2026-10-04 as `slice-W1`**

`client/session.js`: `state`, `apply`, `undo`, `tick`, `onChange`, `hash` — the reducer on this
thread, and the engine's ten side-effect imports moved behind it, so the seam is what makes `apply`
a whole game. `client/game.js` and `client/input/controller.js` are the only callers; the controller
takes the SESSION where it took the state, so it cannot reach the reducer at all.

Two things the item did not list and the slice found. **`undoLast` is a second hole in the seam** —
the client's one change to the city that is not a command, mutating state directly from the
controller — so the session owns it. And **`renderer.worldChanged()` does not hang off `onChange`**
as the item assumed: it rebuilds the model (53.3 ms on a 96), and hanging it on every accepted
command would pay that on every tick. It stays at the build sites; what hangs off the seam is the
tick's own work — the HUD, the audio cues, the ambience and the autosave — which leaves
`setInterval(() => sim.tick(), ms)` as the whole clock.

**Measured** (3 runs of 2,400 ticks on a played 96, era 26): direct 933.9 / 822.3 / 808.7 ms, through
the seam 819.9 / 825.0 / 811.9 ms — +0.3% and +0.4% after the first run's JIT warm-up, and both arms
end at population 2,065. `quick` 494 s against 495 s before. The seam costs nothing measurable, which
is the point of doing it empty-handed first.

**Gate:** suite green twice (1,635); `quick` green; `test/session.test.js` replays all three fixtures
THROUGH the seam with every pinned hash, result and event matching — `tools/fixtures.mjs`'s `replay`
takes a `through` for exactly that.



**Goal.** `client/session.js` with `session.state`, `session.apply(command)`,
`session.onChange`, `session.hash()`, wrapping the reducer on the same thread. Every caller of
`apply` in `client/` goes through it. Nothing else changes and every gate stays green.

**Do.**
- Find every `apply(state, …)` in `client/` (`game.js` has five, `controller.js` one, the lobby
  and the gates several) and route them through `session.apply`. The gates keep their direct
  `apply` where they deliberately drive the engine (`play_shot.mjs`), and say so.
- `session.onChange(fn)` fires after every accepted command and every tick with `{ result,
  events, tick }`; `game.js`'s `onChange` and `renderer.worldChanged` hang off it instead of
  being called at each site.
- The clock (`setInterval` in `game.js`) becomes `session.tick()` on the same schedule.

**Tests.** `test/session.test.js`: a command through the seam produces the same hash as a
command applied directly; `onChange` fires once per command; the fixtures replay through the
seam with every hash matching (`test/fixture.test.js` gains a seam variant).

**Gate.** Every gate green, unchanged. The dev-log records that the seam cost nothing
measurable, which is the point of doing it first.

## W2 — The worker (M) — **done 2026-10-04 as `slice-W2`**

`worker/sim-worker.js` is four lines of thread; `worker/sim-host.js` is the simulation and is a
plain module, because node cannot load a Web Worker and a decision nothing can instantiate is a
decision no test can see (ruling 037's rule, one lane along). `client/session.js` is the mirror side
and the chooser; `client/session-local.js` is W1's seam, kept as the fallback and as `?worker=0`;
`client/mirror.js` patches an ordinary state object in place.

**Three deviations from the plan above**, each with its reason in the dev-log: the node test drives
the HOST rather than node's `Worker` (same decisions, no thread, and the browser proves the thread);
the content — balance, catalogue, quests — is handed across in the init message rather than fetched
by the worker, because the first `worker_smoke` run had the two arms 5,300 apart in the treasury
with the worker on `engine/rules.js`'s mirror and no quests at all; and `toSave` runs on the mirror
rather than in the worker, which is sound precisely because the mirror hashes identically.

**Gates:** `worker_smoke` (both arms, 46 commands and 200 ticks, hash `1f41dfccc566819c` on each,
6.6 s, in `quick`); `quick` green with the worker on (504 s of 540), `offline_smoke` included, which
is what proves the worker file is precached and served; `budget` green. `test/session-worker.test.js`
replays both generated fixtures through the simulation and checks the mirror's hash at every step;
`test/purity.test.js` pins that `worker/` imports nothing but `engine/` and `shared/`.

**What the gates had to learn.** `CITY.state` is a mirror now, so a gate that wrote into it was
writing to a copy the next patch overwrote. The UI gates go through the seam (`CITY.apply`,
`CITY.tick`, and `?funds=` for the treasury they used to poke); the measurement harnesses take
`?worker=0` and say why; the pointer gates wait on `tools/lib/settle.mjs`.



**Goal.** `worker/sim-worker.js` owns the state and runs the reducer; `client/session.js`
becomes the mirror side of the seam; `client/session-local.js` (the W1 wrapper) stays as the
fallback when workers are unavailable and for the gates that need a synchronous engine.

**Do.**
- The worker imports `engine/` and `shared/` only. It receives `{ type: "init", options |
  save }`, `{ type: "apply", command }`, `{ type: "tick", count }`, `{ type: "snapshot" }`,
  and answers `{ type: "result", result, events, tick, hash, patch }` where `patch` is `{ layers:
  { name: ArrayBuffer }, buildings, players, requests, contracts, treasury, … }` for whatever
  changed. Transfer, never copy: the worker keeps its own arrays and sends copies it made for
  the purpose, as transferables.
- `client/session.js`: posts, keeps the mirror, applies patches (`state.tiles[name] = new
  Uint8Array(buffer)`), fires `onChange`. The mirror's `state` object identity never changes,
  because the renderer, the controller and the HUD hold it.
- Which layers changed is decided in the worker by comparing against the last sent copy — one
  pass over sixteen layers, cheap — or by the reducer marking dirty layers if that turns out
  to be measurably cheaper. Measure both, keep one.
- `client/main.js` chooses: a worker when `typeof Worker !== "undefined"` and the importmap is
  honoured inside it (Chromium yes; check Firefox and Safari and record which), else the local
  session. The precache lists the worker file; the service worker serves it offline
  (`test/pwa.test.js`).
- Saves: `toSave` runs in the worker and the bytes come back; `fromSave` goes to the worker and
  a full mirror follows.

**Tests first.** `test/session-worker.test.js` runs the worker under node's `Worker` (the
engine is plain ESM and node can host it): the founding fixture replayed through the worker
matches every hash; a patch after one road contains exactly the `road` layer and the
`buildings` list; a full snapshot equals `copyState`. `test/purity.test.js`: `worker/` imports
nothing outside `engine/` and `shared/`.

**Gate.** Every browser gate green with the worker on; `save_smoke` and `lobby_smoke` in
particular (they hash a city across a reload); a new `worker_smoke.mjs` that forces the local
fallback and the worker in turn and compares the hash after 200 ticks and 50 commands.

**Must not change:** `engine/`, `shared/statehash.js`, any fixture hash.

## W3 — The renderer off the tick (S) — **done 2026-10-04 as the measurement; the second half is W6**

`tools/seam_cost.mjs` (node, not a browser: a frame time here is SwiftShader's and does not travel,
a blocked thread is CPU and does). On a played 96 at era 26 — 284 buildings, 2,051 residents:

- a build command on the main thread: **0.00 ms before the seam, 0.01 ms after** (the reducer's
  share was too small to measure either way);
- a month tick: **3.62 ms before, 0.00 ms after** — this is what moved, and 7.78 ms on a 128 hilly;
- the desync check the seam added back: **1.24 ms a sim-month**;
- `createModel`, which never moved: **38.5 ms p50 on the 96, 43.6 on the 128 hilly**, and D6
  measured 184.7 ms on a 256.

**A build action blocks the render thread for 38.47 ms before the seam and 38.47 ms after it.** The
model rebuild is 100% of what is left. The worker is what multiplayer needs and what made
`worker_smoke` possible; it is not what a player will notice. The phone half (the governor's p95
before and after) stays blocked on D2.

## W3 — The renderer off the tick (S) — the item as written

**Goal.** Measure what the worker bought, and take the second half if it is there.

**Do.**
- With the tick off the render thread, the remaining stall per build action is cityviewer's
  model rebuild — **Q60**, measured by D6 on the maps a player can start: **53.3 ms** on 96×96
  (lane graph 16.3), **68.3 ms** on 128 `hilly` (43.3), **184.7 ms on 256×256** (108.7 — the lane
  graph is two thirds at every size), plus E7's `deriveNav` and E8's `deriveWater`, which nobody
  has timed. `lanes_dump <size> <terrain>` prints the split. It is over a frame everywhere and
  eleven frames on the largest map, so the pure model (`client/world/`) is exactly the kind of code a second
  worker can run: derive corridors, lanes and lots in a worker from the patched layers and
  transfer the typed arrays back; `heightAt` and `surfaceAt` are rebuilt on the main thread
  from the transferred corridor list, which is what they read anyway. Two shapes to choose
  between with numbers: the whole derivation in a model worker, or per-chunk derivation keyed by
  `chunkHash` on the main thread (the deferral E0 recorded in `specs/engine/03-architecture.md`)
  — the second is what Q51/Q60 have pointed at since R1, and the worker may make it unnecessary.
  Write the number down either way.
- The frame-time governor's p95 on the phone card (`workitems-measurement.md` D2) before and
  after the worker is the era for this item.

**Done when** the dev-log has a table: build action stall, month tick stall, frame p95 on the
phone, before W2 and after.

## W6 — The model off the render thread (L) — **measured 2026-10-04; the shape is decided**

`tools/model_cost.mjs` split it, and the split changed the item.

- **The stall is ~115 ms, not 38.5.** `deriveNav` is derived in `worldChanged` beside the model and
  costs **64.5 ms on a played 96** — more than `createModel`'s 49.6 — and nothing had ever timed it.
  Inside the model, `deriveLanes` is 42–47% and everything else is small.
- **One build action changes 0.07% of it**: a ten-tile drag moves 1 corridor of 1,402, 0 lots of 284
  and 2 lanes of 8,896. A building moves one lot more.

So **not a worker.** A worker moves 115 ms off the thread and buys a staleness rule with it — the
walker stands on the model, the cars drive on it, picking reads it — while rebuilding only what
changed makes the same 115 ms into microseconds with nothing stale.

**The obstacle is identity, not performance.** Ids are array indices assigned at derivation, so one
new corridor renumbers every corridor, lane and lot — which is why `worldChanged` throws away the
traffic, the services and the trains each time. (The first cut of the measurement was keyed by id
and reported that one road tile changed 8,896 of 8,896 lanes: a measure of renumbering.)

**So W6 is: stable identity, then a dirty set.**
1. A corridor's identity is its geometry, not its index — a key that survives a rebuild (the ends of
   its polyline, or a hash of its tiles). Same for a lot (its anchor tile) and a lane (its corridor
   key plus its index along it).
2. `createModel(state, previous)` re-derives only what the changed tiles touch, and returns the rest
   by reference. The engine already knows which tiles a command wrote — that is what the patch in
   `worker/sim-host.js` carries.
3. `deriveNav` and the life systems keep their entities across a rebuild where their keys still
   exist, instead of being recreated wholesale.
4. The gate is `tools/model_cost.mjs` again — a build action under a frame on a played 96 — plus
   `budget_gate`, `walkthrough` and `traffic_gate` unmoved, because this must change what it COSTS
   and nothing else.

**Done when** a build action on a played 96 costs under a frame of derivation, and every gate reads
what it read before.

## W6 — The model off the render thread (L) — the item as written

**Goal.** The 38.5 ms (96), 43.6 ms (128 hilly) and 184.7 ms (256) that `createModel` blocks the
render thread for after **every accepted build action** — two and a half frames at 60 Hz on a
machine with headroom, eleven on the biggest map. This is Q60, and W3 is what finally priced it
against everything else: it is now 100% of the stall.

**Two shapes, and the measurement says what to ask of each.**

1. **A model worker.** `client/world/` is pure and takes typed arrays, so a second worker can
   derive corridors, lanes and lots from the patched layers and transfer the result back. The
   question to ask first is not performance, it is **what the renderer does while the model is
   stale**: every frame reads `model` synchronously — the walker stands on it, the cars drive on
   it, picking uses it. An async rebuild means a frame drawn against last tick's lots, which is
   fine for a building that just appeared and wrong for a road the player is dragging over.
2. **Per-chunk derivation keyed by `chunkHash`** (E0's deferral in
   `specs/engine/03-architecture.md`, and what Q51/Q60 have pointed at since R1). A build action
   touches a handful of chunks; the lane graph is two thirds of the cost at every size and is the
   part that is hardest to make local, because a lane leaves its chunk.

**And a third cost nobody has timed.** `worldChanged` does not only rebuild the model and the nav
graph: it recreates the traffic, the services, the trains, the boats and the planes, because every
one of them holds ids from a graph that no longer exists. That is the same identity problem wearing
a different hat, and it is why stable ids are the item rather than a detail of it — but the number
has never been taken, and a browser is the only place it can be. `budget_gate` is where it goes.

**Do first, before choosing:** split the 38.5 ms by phase on a played city (`lanes_dump` prints
corridors and lanes; `deriveNav` and `deriveWater` have never been timed), and count how much of it
a single build action actually invalidates. A rebuild that only had to redo one chunk's lots is a
different item from one that has to redo the lane graph.

**Done when** a build action on a played 96 blocks the render thread for under a frame, measured by
`tools/seam_cost.mjs` with the same city, and `budget_gate` and `walkthrough` are unmoved.

## W4 — The server reuses the seam (M, the door to Wave 5) — **done 2026-10-04 as `slice-W4`**

A transport is an argument: `openMirrorSession(given, transport)` over `client/transport/worker.js`
(the thread) or `client/transport/echo.js` (the stub that answers with a sequence number).
`test/session-remote.test.js` drives it in node — the echo arm and the local arm play the same city
hash for hash, both fixtures replay through it against their pinned hashes, a refusal changes
nothing, and the three sessions are compared member for member, which is the drop-in claim stated as
an assertion for the first time.

**Q147 is answered by building it:** `CMD_UNDO` is a command, with the ownership rule it already
had and a row in the permission matrix. The seam lost a member and the host lost a message type.

**The clock is the session's:** `setSpeed(ms)` on both sides, `game.js` asks for a speed, and
`dispose()` stops it — a remote session ticks when a frame says to, and a client that kept its own
interval would run the world twice.

What is left for Wave 5 is the socket and the room, which is ruling 003's business, not this lane's.

## W4 — The server reuses the seam (M, the door to Wave 5) — the item as written

**Goal.** Not the server — ruling 003 keeps Wave 5 behind playtest acceptance — but the proof
that `session-remote.js` is a drop-in: a stub transport in `client/transport/` that echoes
commands back with a sequence number, and the session running against it with the same hash
as the local session. When Wave 5 starts, the socket replaces the echo and nothing above the
seam knows.

**W2 settled three things this item has to carry**, and they are the whole of its design:

1. **A transport is an argument, not a module.** `client/session.js` builds its own `Worker` and
   posts to it, which is why its half of the seam cannot be instantiated in node and has no test
   outside a browser. Give it a transport — `{ post(message, transfer) → Promise<reply> }` — and
   the worker becomes one implementation, the echo another, and `test/session-remote.test.js` can
   drive both. This is also what gives the lane the member-for-member parity test it has never had:
   three sessions, one list of members, one assertion.
2. **Who calls `tick()` belongs to the session.** `client/game.js` owns a `setInterval` today. A
   remote session cannot: the server owns the clock and the frame carries the tick count, so a
   client running its own interval would run the world twice (plan.md §3.4). `session.setSpeed(n)`
   on both sides, the interval inside the local one, the frame inside the remote one, and
   `game.js` asking for a speed rather than owning a clock.
3. **Undo is not a command, and everything that changes the city must be one.** `undoLast` changes
   the state directly; across a wire it would change one client's copy and desync it. Either
   `CMD_UNDO` (validated and ordered like any other, which also makes it fair — you undo your own
   last action) or undo is refused in a room. **Q147**, and it blocks this item's "drop-in" claim
   rather than the item itself.

**Tests.** `test/session-remote.test.js`: the echo transport and the local session agree on
every hash of the founding fixture; a rejected command produces the toast path and no state
change; all three sessions expose the same members; a frame that carries ticks advances the
remote session and nothing else does.

## W5 — The gates on the shipped configuration (S) — **done 2026-10-04 as `slice-W5`**

`tools/lib/scenario.mjs` arms the wildfire in node and the gate hands the bytes back through
`CITY.importSave`; the fixture city and the four hundred ticks go through the seam; `?funds=` buys
it. **`mvp_acceptance` is 13 of 13 with the worker on.** The seam learned to accumulate a batched
tick's events (it was answering with the last tick's, which would have had the tax criterion
asserting that nothing happened), and the settle audit found two checks in `play_smoke` that assert
NOTHING was built and could not have seen it if it had been. `budget_gate`, `play_shot` and
`street_proof` keep the lever, with the reason in each file.

## W5 — The gates on the shipped configuration (S) — the item as written

**Goal.** Four gates run with `?worker=0` because they drive the engine inside the page, and the
one that matters is `mvp_acceptance`: the thirteen §24 criteria are the release claim, and they are
currently proven on a configuration the player does not get.

**Do.**
- A scenario is a SAVE, built in node. `engine/save.js` recomputes the hash on load and refuses a
  hand-edited file — but a save written by `toSave` after setting `state.disaster` in node carries
  a hash that is correct by construction. So `tools/lib/scenario.mjs` builds the acceptance city and
  arms the wildfire in node, the gate hands the bytes to the page, and `CITY.importSave` loads them
  through the seam. The gate then drops `?worker=0` and plays the shipped configuration.
- `budget_gate`, `play_shot` and `street_proof` keep `?worker=0` and keep saying why: they are
  renderer measurements, the reducer's thread cannot change a triangle count, and a round trip per
  command would add minutes to a gate that already takes four.
- The audit the migration implies: every gate that reads `CITY.state` after a pointer or keyboard
  action waits on `tools/lib/settle.mjs`. Four were found by failing; the rest pass today on
  timing, which is not the same as being right.

**Done when** `mvp_acceptance` is green with the worker on, and no gate reads the city in the
statement after the click that changed it.

## Order

W1 → W2 → W3 → W4, with **W5** any time after W2 and **W6** when Kjell wants the stall gone (it is a gate repair, not a feature). W1 is safe
and cheap and makes W2 a swap rather than a rewrite; W3 is a measurement with an optional second
half; W4 is the receipt for the whole plan.
