# Ruling 023 — The alert area collapses repeats and ranks by severity

- **Date:** 2026-08-29
- **Source:** N4, implementing `gamedesign.md` §13.1's alert area
- **Status:** ruled

## Question

The design lists six kinds of problem the alert area reports. It does not say
what happens when the simulation produces fifty-nine of one of them in a single
month — which it does routinely. What reaches the player?

## Ruling

Three rules, in `client/ui/alerts-model.js`:

1. **Collapse.** Repeats of one kind become one line with a count. Fifty-nine
   power shortfalls are one alert reading `Power shortfall ×59`.
2. **Rank, then cap.** Sorted by severity first and recency second, then cut to
   six. Sorting *before* capping is the whole point.
3. **Whitelist.** Only listed event kinds become alerts at all. An unrecognised
   kind produces nothing rather than an "unknown" line.

Routine success is not an alert. `developed`, `zoned` and `placed` are the
player's own actions working, and they never reach the area.

## Why

Measured, not guessed: one 1200-tick run of the standard fixture produced **59
`powerShortfall` events and 100 `budget` events**, against a single
`fireStarted` that actually mattered. Without collapsing, that run puts 160
lines on screen. Without ranking before the cap, the one fire is pushed off the
list by the chatter that arrived after it.

An alert list that floods has hidden the alert that mattered, which is strictly
worse than having no list — the player learns to ignore it, and then misses the
next fire too.

The whitelist is the same argument from the other side. Reporting every event
the engine emits would mean the alert area grows noisier every time a system is
added, and the noise would arrive from systems whose authors never thought about
the alert area at all.

## Consequences

- New event kinds are invisible to the player until someone deliberately adds
  them to `KINDS` with a severity. That is the intended friction.
- Severity is carried by colour, by a thick leading border and by position, so
  it survives greyscale and colour-vision deficiency (§30).
- Alerts expire after 288 ticks — two years — so a solved problem stops
  shouting without the player having to dismiss it.

## Enforced by

- `client/ui/alerts-model.js`
- `test/hud.test.js` — collapsing, the cap keeping the worst, the whitelist
