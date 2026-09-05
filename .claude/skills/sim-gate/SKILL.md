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
| **Soak** | `node tools/soak.mjs [years] [seeds…]` | Does it survive? Five pinned seeds × N city years with invariants and checkpoint hashes |
| **Event census** | `node debugging/dbg_systems.mjs [years] [seed]` | Did it actually *fire*? Per-event-kind counts and the year each was first seen |
| **Chaos** | `node tools/chaos.mjs [commands] [seed]` | Can it be broken? Random legal and illegal commands against two engines |
| **Map sweep** | `node tools/mapsweep.mjs [count] [size] [seats]` | Is generation fair? Acceptance rate and district spread. `MODE=`, `WATER=`, `STYLE=` |
| **Balance sweep** | *not built yet — Wave 3* | Is the game fair? One row per game |
| **Client smoke** | `node tools/client_smoke.mjs` | Does the real client draw a real city? Page errors, draw calls, instancing |
| **Screenshot** | `STYLE=… SPAN=… node tools/screenshot.mjs out.png [seed] [years]` | What does the renderer look like? |
| **Play gate** | `node tools/play_smoke.mjs` | Can a person actually build, on a mouse AND on a phone? |
| **UI gate** | `node tools/ui_smoke.mjs` | Does every button do what it claims, hit-tested? Does every overlay render, and render *differently*? |
| **Save gate** | `node tools/save_smoke.mjs` | Does a city survive a closed tab, hash for hash? |
| **MVP acceptance** | `node tools/mvp_acceptance.mjs` | All thirteen §24 criteria, desktop and phone |
| **Disaster soak** | `node tools/disaster_soak.mjs [games] [years]` | Does every disaster fire, and leave a repairable city? |
| **Traffic gate** | `node tools/traffic_gate.mjs [games] [years]` | Does routing fit the month tick? Does congestion track the city or the dice? |
| **Balance sweep** | `node tools/sim_sweep.mjs [games] [years]` | 200 games × 4 configurations; writes reports/balance-eraN.md |
| **Play shot** | `node tools/play_shot.mjs` | What does the real page look like, both viewports? |
| **Style sheet** | `node tools/style-sheet.mjs` | All three styles from one city, side by side |
| **Where is it?** | `ZONE=residential node tools/where.mjs` | The densest window of a zone, the zone mix, the paved fraction |
| **Server gate** | `node tools/serve_smoke.mjs` | Does the game work on the server `run.sh` starts, at the bare origin? |
| **Reach gate** | `node tools/reach_smoke.mjs` | Can every control be brought on screen and clicked — and does the map still take a click? |
| **Access gate** | `node tools/a11y_smoke.mjs` | Keyboard only, 200% text, high contrast and each skin repainting real colours |
| **Lobby gate** | `node tools/lobby_smoke.mjs` | New game, settings, Continue — hash for hash |
| **Offline gate** | `node tools/offline_smoke.mjs` | Network off: does it open, start, build and save? |
| **Update gate** | `node tools/update_smoke.mjs` | Does a NEW build ever reach a player who already has the app? |
| **Budget gate** | `node tools/budget_gate.mjs [--tier=low\|medium\|high]` | Is the frame inside its triangle budget on a SATURATED city, at every tier and at the opening span — and does the planner's estimate still match what three drew? |
| **Lane dump** | `node tools/lanes_dump.mjs [size]` | What did the lane graph come out as? Link, node, turn and signal counts, and the shortest link against a car's length. No browser: the model is pure |

**Twelve browser gates, and they are cheap to run all of them.** Do:

```
for g in serve_smoke reach_smoke ui_smoke a11y_smoke lobby_smoke \
         mvp_acceptance save_smoke play_smoke offline_smoke update_smoke \
         budget_gate client_smoke; do
  printf "%-16s " "$g"; node tools/$g.mjs 2>&1 | tail -1
done
```

**Freeze the life before you measure or shoot.** `?life=0` (and `life: false` to
`screenshot.mjs`) stops the traffic where it settled. Without it two shots of one city differ by
however far the cars moved between them, and every picture gate becomes a flake.

### A cost model is a memory, and memories go stale

The triangle budget is enforced by measurement (ruling 019) — and for four
slices nothing compared the planner's *estimate* with what three actually drew.
N28 turned a road into a twelve-triangle skirted box while the cost table still
said "one upward quad": the planner believed 79,068 triangles, the renderer drew
97,500, and a saturated city rendered with no trees and no markings and was over
budget anyway. Twelve gates, a green suite, and plausible screenshots throughout.

Two rules fall out of it:

- **Price a new cost AND measure it.** `createInstances` measures every pool's
  real geometry and passes it to `setCosts`. A constant in a table is a claim
  about code somewhere else.
- **Measure before you optimise, and delete what does not pay.** Three optimisations were
  attempted on the model's `heightAt` in E1. A corridor-box index took the rebuild from 123 ms
  to 75; a segment-level index on top of it measured **worse** and was reverted; taking a
  connector's end heights from the links it joins took it to 35.7. Two of the three guesses
  about where the time went were wrong, and only the measurement said which.
- **An over-charging model is as damaging as an under-charging one.** The
  correction loop only steps DOWN, so an estimate that is too high silently
  sacrifices detail the frame had room for and nothing gives it back. The shadow
  pass doubling cost the props at close zoom for exactly this reason — and the
  doubling was measured and true when it was written.

### Green gates say nothing if the player is running a different build

Two of the three items in the P33 playtest were reports about code that had
shipped three days earlier, been gated ten ways, and **never reached a
browser**: the service worker served cache-first and only ever installed once,
because a browser re-installs a worker when the WORKER'S OWN bytes change and
sw.js is static (ruling 031). Every gate was green the whole time, because every
gate opens a clean profile.

So: **when a playtest reports behaviour that the code says is impossible, check
delivery before you check the code.** Correct code plus a user who disagrees is
the shape of a delivery problem. `update_smoke` is the standing answer — it is
the only gate that opens the app twice with a deploy in between — and any
capability that is only ever exercised on a clean profile is untested by
definition.

### A browser gate is a program that can be wrong about the game

More than half of the failures these gates have reported were **the gate's own**,
and each one looked exactly like a real defect until it was chased. The four
that have actually happened, as rules:

- **Re-resolve, never hold a handle.** A panel that rebuilds its innerHTML — the
  advisor does, on every refresh — throws away any marker attached to its
  children. A walk that tagged once reported a working button as missing.
- **Put the state back after every step.** A gate that opens a panel and leaves
  it open reports collisions no player meets; one that injects a card to test a
  rule then measures that card as furniture.
- **Hash before the await.** `pause()` does not stop a tick already on its way;
  it lands during the next `await`, and the city hashes one month ahead of the
  bytes it just saved. One run in four, and it looks like a save bug.
- **Start from a known state, not from wherever the last step left things.** A
  toggle test that begins open measures the opposite of what it claims.
- **Measure a delta, not an absolute.** "Right drag does not build" failed at 13
  paved tiles that four checks earlier had deliberately laid down. Ask what
  changed across the step, not what the world contains.
- **Retry through a navigation the gate itself provoked.** `update_smoke` asked
  the page a question while the page was reloading — which is the behaviour it
  exists to prove — and got `Execution context was destroyed`.

Before believing a gate's red, ask what the gate did to the game.

**A long-run soak measures whoever played it.** If a gate runs the deputy for
25 years and reports the end state, it is measuring the deputy — an "expand"
heuristic that will not rebuild a lost power plant. Say whose competence a
measurement is about, and when a slow decline follows a shock, run the same seed
with the shock switched OFF before blaming it (ruling 025).

Frame the shot with `tools/where.mjs` first. Four screenshots were once taken at
spots with no buildings in them, which proves nothing and wastes a round.

**Plain is the shipping style** (ruling 022) — check it first and always; `pixel`
and `painted` are the seam and only need to still render.

Anything visual ends with a screenshot **that you then look at**. Four rendering
bugs in slice 1.2 — a backface-culled ground, terrain seams, pipes drawn above
ground, and a missing colour-space conversion — were all invisible to every
test and obvious in the picture. The reports were correct in each case.

To measure on seeds the change was **not** tuned against — which is the whole
point — call `soak({years, seeds})` from a one-liner with a different seed
block, as the dev-log entries do. Tuning until the five gate seeds pass and
then reporting that the gate passes is not a measurement.

## Order of use

1. **Soak first.** If invariants break or a hash moves, nothing else matters yet.
2. **Event census second.** A system that never fires passes every soak. This is the step that
   catches a feature which silently does nothing — the most common way a slice looks done and
   is not. It has already earned this position twice: it found that half the event kinds never
   fired (a probe defect), and then that the city was abandoning almost exactly as many buildings
   as it developed (a real one).
3. **Chaos third**, for anything that touches the command surface or permissions.
4. **Sweep last**, and only for balance questions.

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
