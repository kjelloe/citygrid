---
name: slice-workflow
description: Deliver a City Grid slice end to end — design check, tests first, implementation, double-run suite, the slice's own gate, dev-log entry, doc sync. Use when implementing any slice from plan-v1.md, or any change substantial enough to need a gate.
---

# Slice workflow

A slice is the unit of work in this project. It is named after its entry in `plan-v1.md`
(`0.2`, `1.3`, `5.4`…). **A slice that cannot state its gate is not a slice yet** — go and find
the gate, or split the work until one exists.

## 1. Orient before touching code

- Read the slice's row in `plan-v1.md`: contents, **depends on**, and **done when**.
- Read the design it implements in `specs/gamedesign.md`, and the architecture in `specs/plan.md`.
  A renderer slice (E-, V- or P-series) is specified in `specs/engine/`; read the document the
  roadmap row names, and `12-decisions.md` for what is already settled.
- Check `specs/rulings/` for anything that constrains it. Rulings are cited in code as
  `// ruling 004`.
- Check the bottom section of `dev-questions.md`. **If the slice depends on an open question, stop
  and ask** rather than guessing — a guessed answer becomes load-bearing before anyone notices.
- Check `dev-log.md` for a previous attempt. Dead ends are recorded with their measurements
  precisely so they are not re-walked.
- **For a cityviewer item, `workitems-cityviewer.md` is the contract** — its "Do", "Tests first",
  "Gate", "Must not change" and "Review will check" lists are what the review re-runs. Read the
  whole item before starting: V1's zero-length right turns were caused by reading past a phrase
  ("short of the node **box**") that the item had already got right.
- **Check whether the file you are about to create already exists.** V1's tests were named
  `test/traffic.test.js` by the hand-off, which is also the ENGINE's traffic test — writing it
  overwrote 124 lines of a passing suite. `ls` first; a name that describes two different things
  is a name that needs two files.

## 2. Tests first

Write the failing tests before the implementation. Pick the layers the slice actually needs:

| Layer | When |
|---|---|
| Unit (`node --test`) | Always |
| Permission matrix | Any new command, or any change to who may do what |
| JSON scenario fixture | Any change to simulation behaviour worth pinning |
| Chaos injection | Any new command surface or request lifecycle |
| Soak | Any change to growth, decay, economy or services |
| Sweep (n ≥ 200) | Any balance-affecting change. **Never tune on five seeds** |
| Server tests | Anything touching `server/` or the protocol |
| UI acceptance | Any new control — buttons must *do* things |
| Perf | Anything touching the renderer or the pump; measured on the **saturated** fixture |

**Check the fixture before you measure it.** A gate that photographs an empty
city, or sweeps overlays over bare grass, proves nothing and looks like a pass.
Assert the fixture is worth measuring — buildings placed, population above zero,
the layers the test reads actually non-zero — as the FIRST check, so a broken
fixture fails as a broken fixture instead of as a broken feature. Three
separate N4 failures were fixture bugs wearing a feature's clothes.

**Read `state.supply` before blaming reach or wiring.** It reports `components`,
`served` and `starved` per network. `components: 2` means two disconnected
networks, and a producer in one of them supplies nothing to the other.

**Ask what the gate would still report if the feature were deleted from the
client** (ruling 026). A gate that reaches past the interface into `apply()`
cannot see an interface that is not there — it reports the same green it would
report if everything were fine. `tools/mvp_acceptance.mjs` said *13 of 13* while
the toolbar had no way to place a building, so no human player could power or
water a city. Where a criterion is about a person doing something, the script
clicks the control and then the map.

## 3. Implement

Obey the non-negotiables in `CLAUDE.md`. The ones most often forgotten:

- Purity in `engine/` and `shared/`: no `Math.random`, no clocks, no I/O, no floats, no `null`.
- The restricted subset in `engine/` (ruling 004).
- Permission checks in the reducer, never only in the UI.
- **A command with no control that sends it is not in the game.** `CMD_SET_TAX`
  sat in the reducer for four slices with nothing in the client to issue it, so
  the tax rate was a constant the design document described and the player could
  not touch. Same for a building in `data/buildings.json` with no toolbar button.
- **Every string the player reads goes through `t()`** (ruling 008). Models hand
  the view i18n KEYS; `hud.js` is the only place a key becomes words. Add the key
  to `en.json` and `no.json` in the same commit — `t()` returns the key when it
  misses, so an untranslated string ships as a literal `alert.congestion`.
- **New nested state touches five places**: `copyState` deep copy, both hash functions, the save
  migration, the snapshot projection, the lobby options record.
- Numbers go in `data/*.json`, never in engine code.
- Drag input coalesces into one run-length-encoded command.

## 4. Green twice

```sh
./test.sh
```

**Read the fail count, not the exit code.** A chained pipeline has hidden failing tests before.

## 5. Run the gate

The gate is whatever the slice's "done when" column names. Run it, and record the *numbers* it
produced — not "passed".

If a hash moved unexpectedly, that is the highest-value alarm in the project. Do not re-pin to make
it green; find out why. Deliberate schema changes re-pin through `/fixture-repin`.

## 6. Write the dev-log entry

Newest last, in `dev-log.md`. State:

- What was built.
- **What was measured** — the actual numbers, with the seed count and the era.
- What failed on the way and what the measurement said about it. Dead ends are the most valuable
  content in the file.
- What is next.

## 7. Sync

If the slice changed any of these, update them in the same slice, not later:

- `specs/gamedesign.md` — if behaviour the design describes changed.
- `specs/plan.md` — if architecture or a budget changed.
- `specs/engine/` — if a cityviewer slice changed what its document specifies, or measured a number it predicted.
- `plan-v1.md` — tick the slice, adjust dependents.
- `specs/rulings/` — if a new decision was taken.
- `dev-questions.md` — if a question was answered or a new one appeared.
- `.claude/skills/` — if a workflow changed.
- Memory — if something durable about the project or the user's preferences changed.

## 8. Commit

Prefix `slice-`, e.g. `slice-1.3 roads and the permission gate`. **Commit only when asked.**
