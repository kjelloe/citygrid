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
- Check `specs/rulings/` for anything that constrains it. Rulings are cited in code as
  `// ruling 004`.
- Check the bottom section of `dev-questions.md`. **If the slice depends on an open question, stop
  and ask** rather than guessing — a guessed answer becomes load-bearing before anyone notices.
- Check `dev-log.md` for a previous attempt. Dead ends are recorded with their measurements
  precisely so they are not re-walked.

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

## 3. Implement

Obey the non-negotiables in `CLAUDE.md`. The ones most often forgotten:

- Purity in `engine/` and `shared/`: no `Math.random`, no clocks, no I/O, no floats, no `null`.
- The restricted subset in `engine/` (ruling 004).
- Permission checks in the reducer, never only in the UI.
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
- `plan-v1.md` — tick the slice, adjust dependents.
- `specs/rulings/` — if a new decision was taken.
- `dev-questions.md` — if a question was answered or a new one appeared.
- `.claude/skills/` — if a workflow changed.
- Memory — if something durable about the project or the user's preferences changed.

## 8. Commit

Prefix `slice-`, e.g. `slice-1.3 roads and the permission gate`. **Commit only when asked.**
