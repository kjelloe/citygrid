# worker — work items

*Written 2026-09-06. `specs/plan.md` §0 and §3.1 put the simulation in a Web Worker from the
first draft — "always a Web Worker on the client, never on the render thread" — and `worker/`
has been an empty directory for the life of the project. Every `apply()` runs on the render
thread today, beside a renderer whose model rebuild costs **53.7 ms** per build action on a 128×128
(Q60, after R2 cut it from 80.0) and a month tick of a few milliseconds. This lane builds the session seam the plan
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

## W1 — The session seam, on the main thread first (M)

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

## W2 — The worker (M)

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

## W3 — The renderer off the tick (S)

**Goal.** Measure what the worker bought, and take the second half if it is there.

**Do.**
- With the tick off the render thread, the remaining stall per build action is cityviewer's
  model rebuild — **Q60**: 53.7 ms on the saturated 128×128 after R2 (corridors 7.3, ground 0.0,
  lanes 41.3 of which about 28 is the graph's own construction, lots 15.0), plus E7's `deriveNav`
  and E8's `deriveWater`, which R2 did not time. Measure all of it from `lanes_dump`. It is over
  a frame, so the pure model (`client/world/`) is exactly the kind of code a second
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

## W4 — The server reuses the seam (S, the door to Wave 5)

**Goal.** Not the server — ruling 003 keeps Wave 5 behind playtest acceptance — but the proof
that `session-remote.js` is a drop-in: a stub transport in `client/transport/` that echoes
commands back with a sequence number, and the session running against it with the same hash
as the local session. When Wave 5 starts, the socket replaces the echo and nothing above the
seam knows.

**Tests.** `test/session-remote.test.js`: the echo transport and the local session agree on
every hash of the founding fixture; a rejected command produces the toast path and no state
change.

## Order

W1 → W2 → W3 → W4. W1 is safe and cheap and makes W2 a swap rather than a rewrite; W3 is a
measurement with an optional second half; W4 is the receipt for the whole plan.
