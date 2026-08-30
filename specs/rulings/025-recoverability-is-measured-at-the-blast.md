# Ruling 025 — Disaster recoverability is measured at the blast, not years later

- **Date:** 2026-08-29
- **Source:** N6's gate — "leaves a city that play can repair; soak shows no unrecoverable cities across 200 games"
- **Status:** ruled

## Question

What does "no unrecoverable cities" mean, and when is it measured?

## Ruling

**The tick after each strike**, and it asks three things:

- is buildable ground unchanged?
- is the terrain itself unchanged?
- can the player still afford to rebuild something?

**Not** the state of the city 25 years later.

Cities that merely *decline* to nothing over the following years are still
counted, still confirmed against a disasters-off control run, and still printed
by every soak — as an **economy finding**, under its own heading, never as a
disaster failure.

## Why

The first version measured year 25 and failed three cities out of 200. The
control run — same seed, same deputy, disasters off — confirmed the disaster was
the cause, so this was not a false alarm. But what the disaster caused was a slow
economic decline that a *dumb AI* never pulled out of.

The gate's own words are "leaves a city that **play can** repair". The deputy is
not play. It is an "expand" heuristic that does not rebuild a lost power plant.

Measuring the deputy's competence under the name of disaster recoverability has a
specific and bad consequence: the fix it invites is to make disasters weaker,
and a real economy bug then hides behind a disaster tuning knob forever. Both
things are worth knowing and they are different things, so they are reported
separately.

## Consequences

- A disaster may leave a city that later dies. That is allowed, reported, and
  N8's to settle. Three seeds do it today: 90135, 90141, 90162.
- Disasters top a player's treasury up to a floor when they strike, so
  "can still afford to rebuild" is true by construction rather than by luck.
- Any future gate that measures a long-run outcome must say whose competence it
  is measuring. A soak that runs an AI for 25 years and reports the result is
  measuring the AI.

## Enforced by

- `tools/disaster_soak.mjs` — the per-strike check, the control run, and the
  separate economy-finding section
- `engine/disasters.js` — relief on strike
