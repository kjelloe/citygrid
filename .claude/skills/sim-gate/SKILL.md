---
name: sim-gate
description: Run and interpret City Grid's headless simulation gates — soak, event census, and the balance sweep. The standard verification for any gameplay slice. Use after changing growth, economy, services, traffic, disasters, demand or AI mayor doctrine, or when asked whether a balance change is safe.
---

# The simulation gate

The unit suite alone has never been enough for gameplay. AI mayors playing headless cities are what
stand in for playtesting at scale, and every gameplay slice ends here.

## The three instruments

| Instrument | Command | Answers |
|---|---|---|
| **Soak** | `node tools/sim_soak.mjs` | Does it survive? Five pinned seeds × 40 city years with per-tick invariants and golden checkpoint hashes |
| **Event census** | `SEED=… node debugging/dbg_systems.mjs` | Did it actually *fire*? Per-system event counts |
| **Sweep** | `node tools/sim_sweep.mjs 200` | Is it fair? One CSV row per game, then `python3 tools/analyze_sweep.py` |

Sweep flags: `MODE=`, `SEATS=`, `SIZE=`, `CHURN=` (join/leave rate), `DIFFICULTY=`.

## Order of use

1. **Soak first.** If invariants break or a golden hash moves, nothing else matters yet.
2. **Event census second.** A system that never fires passes every soak. This is the step that
   catches a feature which silently does nothing — the most common way a slice looks done and
   is not.
3. **Sweep last**, and only for balance questions.

## Reading the results

**Never tune on five seeds.** Five seeds tell you a system fires. Only 200+ games tell you what is
fair. A lean that looks decisive at n=30 is regularly geometry at n=600.

**Verify the instrument before believing the reading.** A probe filtering on the wrong event field
reports zero of something in a world full of it, and telemetry that only records success will
present a dead subsystem as a live one. If a number looks impossible, check the probe first.

**When a probe and a sweep disagree, check the config plumbing first.** `=== true` versus
`!== false` on a config flag once meant the served game and the sweeps were running different
games for days. This is the single most expensive class of bug in the reference project.

**Sandbox traps.** Before diagnosing an "engine bug", check the fixture: a test city with whole-map
utilities, one road, or a single seat produces fake verdicts.

## Era discipline

Every number belongs to an era — a coordinate change, a balance pass, a demand-model change all
start new ones. Record the **commit** and the **era** with every measurement. Numbers from a
previous era are void, not "roughly comparable". Multiplayer rows never mix into singleplayer
baselines. Constants inherited from `specs/referencedata.md` are `era 0, untuned` until a sweep
says otherwise (ruling 007).

## What to report

Not "the gate passed". Report:

- Seeds, games, era, commit.
- The invariants that held and any that were close.
- Which systems fired and which did not.
- The distribution, not just the mean — a fair average hiding a bimodal outcome is not fair.
- For multiplayer sweeps: per-seat land share and score spread, because regional demand
  (ruling 001) makes snowballing the named risk.

Then write it into `dev-log.md`, and into `reports/` if it pins a new era.
