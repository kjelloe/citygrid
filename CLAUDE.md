# City Grid — working rules

Read this before touching anything. Rules here override general habits. Most exist because a
sibling project already paid for them — `../Fireline/techstack-and-development.md` and
`../Retrogradegames/game-stack-overview.md` are the receipts.

## The documents

- **What the game is** → `specs/gamedesign.md`
- **How it is built** → `specs/plan.md`; the renderer, `specs/engine/` (cityviewer)
- **What to do next** → `plan-v1.md`; renderer work items → `workitems-cityviewer.md`
- **Why a decision was made** → `specs/rulings/`
- **The user's words, verbatim** → `dev-prompts.md`
- **What is still open** → `dev-questions.md`, bottom section
- **What actually happened** → `dev-log.md`

`specs/referencedata.md` is an analysis of a GPL-licensed classic. It is a **behavioural
specification to compare against**. Never copy its code, never inherit its constants unexamined,
and label anything derived from it `era 0, untuned`.

## Non-negotiables

1. **The engine is pure.** `apply(state, command) → state`. No I/O, no wall clock, no
   `Math.random`, no DOM, no `three.js`, in `engine/` or `shared/`.
2. **No floats in state. No `null` in state.** Integers only; fixed point at `FP = 256` where
   fractions are unavoidable; integer division through `idiv()`.
3. **Randomness comes from the state.** One xorshift32 PRNG whose state is a hashed field.
4. **`engine/` core is written in the restricted, Lua-portable subset** — no `class`, no `this`,
   no `Map`/`Set`, no exceptions, plain functions over plain objects and typed arrays, index maths
   only through named helpers. `shared/`, `worker/`, `server/` and `client/` use idiomatic modern
   JS. Enforced by `test/subset.test.js` (ruling 004).
5. **The client changes the city only through the seam.** `client/session.js` owns `apply`, `undo`
   and `tick`; since W2 the reducer runs in a Web Worker and **`CITY.state` is a MIRROR** — writing
   into it changes a copy that the next patch overwrites. A gate that must drive the engine inside
   the page takes `?worker=0` and says why; a gate that clicks waits on `tools/lib/settle.mjs`.
6. **Permission checks live in the reducer.** A check that exists only in the UI is not a rule, it
   is a suggestion, and the next client build will forget it.
7. **The renderer never writes to state.** Ever. It reads and draws. And it never *imports*
   `engine/` either: `client/world/`, `client/render/` and `client/life/` read the handful of
   constants they need through `client/constants-mirror.js` (rulings 032, 037). `client/world/`
   is pure and re-derivable — no three, no DOM, no clock; `client/life/` may remember things
   between frames but takes its time as a delta from the caller, which is what makes `?life=0`
   freeze it. Enforced by `test/purity.test.js`.
8. **Zero runtime dependencies** in the game itself. `three.js` is vendored and pinned; `ws` is
   the only server dependency; dev tools may have their own.
9. **No build step.** Plain ES modules and an importmap.

## The slice ritual

Every change is a slice, named after its entry in `plan-v1.md`:

1. Tests first. A slice that cannot state its gate is not a slice yet.
2. Implement.
3. `./test.sh` — the suite, twice, green both times. **Read the fail count, not the exit code.**
   A green suite does not mean the page boots: nothing in `test/` can import `client/render/`, so
   `test/purity.test.js` parses every module with `node --check` and that is what catches a syntax
   error in the renderer. A renderer change still wants one browser gate.
4. Run the slice's gate from `plan-v1.md` (soak, sweep, event census, UI acceptance, perf).
5. A `dev-log.md` entry naming what was measured, including anything that failed on the way.
6. Sync docs, rulings, skills and memory if the slice changed any of them.
7. Commit with prefix `slice-`. Commit only when asked.

## Determinism machinery

- `shared/statehash.js` is the contract: save checksum, desync detector, replay verifier and
  multiplayer acceptance gate, all one function.
- Hashed fields are listed in **two** places — `writeState()` in `engine/state.js` and
  `HASHED_FIELDS` in `test/fixture.test.js` — so a hash change is always a deliberate two-file act.
  A field in one and not the other is a red suite.
- **New nested state touches five places**: `copyState` deep copy, both hash functions, the save
  migration, the snapshot projection, and the lobby options record. Every time.
- **A new FIELD on an existing nested record touches four**: its `copy…` helper in `engine/state.js`,
  `writeState`, a **save migration with a `SAVE_VERSION` bump** (the old records have to be given
  the new field, and the stored checksum is dropped because it was taken over a shorter field list),
  and a fixture re-pin if any fixture holds one. `HASHED_FIELDS` does NOT change — it lists the
  top-level field, which was already there, so the two-file rule cannot see this one. X3a's
  `request.kind` is the worked example.
- Prefer silent state changes for routine ticks. A new event inside a pinned fixture is drift, and
  means the reducer is wrong, not the fixture. Re-pin only through `/fixture-repin`, which runs
  `node tools/repin.mjs "<reason>"` — the reason is required and is written into the fixture, and
  the tool refuses to re-pin over event drift unless told the events were meant to change.
- Canonical serialization never depends on object key order or sort stability — explicit ordered
  field lists, entities sorted by id.

## Measurement discipline

- **Never tune on five seeds.** Five seeds tell you a system fires; 200+ games tell you what is
  fair.
- **A gate that drives one configuration proves one configuration.** Two projections, three
  quality tiers, two viewports and a height field: the same code path behaves differently in
  each, and three renderer bugs in the V lane were invisible to a single-configuration gate.
  When one combination is red and another green, the pair names the cause.
- **Every measured number belongs to an era.** Name the commit and the balance era. Numbers from a
  previous era are void, not "roughly comparable".
- **Telemetry must record failure**, not only success. Verify the instrument before believing the
  reading — a probe filtering on a wrong field reports zeros in a world full of events.
- **Warm the instrument before timing a phase.** W6's whole shape was argued from a gate that timed
  `createModel` on its first run and every phase afterwards: 29 ms of the "stall" was JIT warmup,
  the phase list accounted for 55% of the whole, and the biggest real cost was in a different module
  from the one the item named. Warm everything, then time; keep the cold run as its own row, because
  a player does pay it once; and take the biggest number twice, from both ends of the run.
- **A change to what the deputy DECIDES voids every sweep number, including a change that keeps
  every rule.** The pinned fixtures cannot see it — they are built by explicit commands, not by a
  deputy — so the suite stays green while every measured city in the project becomes a different
  city. P87 re-mixed `deputyRoll` inside a round labelled `docs:` and era 8's report described a
  world that no longer existed for two commits. Re-run the sweep in the same commit, or bump the
  era and say why.
- **When a probe and a sweep disagree, check the config plumbing first.**
- **Measure on a saturated city**, never an empty map.
- Multiplayer rows never mix into singleplayer baselines.

## Multiplayer invariants

- Commands cross the wire, not state. Frames carry accepted commands; clients run the same sim.
- The server owns the clock. Degrade the game clock, never the pump.
- Drag-paint is coalesced into **one** run-length-encoded command, never one per tile crossed.
- Player-authored text — request titles and reasons, player names, city names — is untrusted input
  and hashed state at once: cap it, sanitise it, canonicalise its bytes, render it as plain text.
- Any new positional subsystem must learn ownership, the territory overlay, and the sector-fairness
  transform in the sweep, or every fairness battery silently measures a malformed world.

## Style

- Small functions, clear names. Comments only where the *why* is non-obvious — a hidden
  constraint, a workaround, a subtle invariant. Never explain the *what*.
- Modules soft-capped around 300 lines, one subsystem each, acyclic imports.
- Numbers live in `data/*.json`, never in engine code. The mirrors in `engine/rules.js` and
  `engine/catalogue.js` exist because `engine/` may not do I/O; `client/content.js` loads the real
  files at boot and they are the FALLBACK. Until P90 nothing called `setRules` or `setCatalogue` and
  the mirror was all there was — a drift test kept them identical, which is exactly why nobody
  noticed the file was decoration.
- No defensive handling for things that cannot happen. No unrequested abstractions.
- Cite the ruling or prompt that created a rule: `// ruling 002`, `// P2`.
