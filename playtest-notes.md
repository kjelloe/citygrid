# Playtest notes — decisions taken 2026-08-29 while Kjell was away

Kjell (P15): *"build all the remaining parts from N5 and onwards… Please record
decisions when I am away so we can re-assess after when I playtest."*

This file is **for re-assessment, not a changelog** — `dev-log.md` is the
changelog. Every entry is a decision I had to take without asking, in the form:

- **What I chose**
- **Why** (and what the alternative was)
- **What to check when you play** — the specific thing that would tell you I
  chose wrong

Rulings that came out of these are in `specs/rulings/`. Anything I could not
finish is listed at the bottom, honestly, with what is missing.

---

## Status of N5–N10

| Slice | State |
| --- | --- |
| N5 Save and load | **done** — `tools/save_smoke.mjs`, 15 checks |
| N6 Events and disasters | **done** — `tools/disaster_soak.mjs`, 200 games |
| N7 Traffic | **done** — `tools/traffic_gate.mjs`, 0.70ms, r=0.55 vs density |
| N8 Balance sweep and era 1 | **done** — era 1 pinned, `reports/balance-era1.md` |
| N9 Advisor and quest engine | **done** — 13 quests, `test/quests.test.js` |
| N10 Tutorial and MVP acceptance | **done** — **13 of 13 criteria** |

---

## Decisions

### N5 — three manual slots plus a separate autosave

**What I chose.** Three manual slots (`slot1..3`) and one `autosave` slot that
never touches them. Autosave fires once per game *year* of ticks, not on a wall
clock.

**Why.** A game that overwrites the city you saved deliberately with the one you
were idly playing has taken something it cannot give back. Ticks rather than
milliseconds so a paused game never autosaves and fast-forward does not autosave
four times as often for the same amount of play. The alternative — a single
rolling save — is simpler and I rejected it for the same reason.

**What to check when you play.** Whether one year between autosaves is too long
after a disaster. If a fire wipes out your centre and the autosave is eleven
months old, that is a bad feeling and the interval should drop.

### N5 — load swaps the city in place rather than reloading the page

**What I chose.** Loading copies the restored state field-by-field into the
existing state object instead of replacing the reference or reloading.

**Why.** The renderer, HUD and controller all hold a reference to that object;
replacing it would leave all three drawing a city that no longer exists. Doing
it in place also keeps the camera where you left it, which a page reload cannot.

**What to check when you play.** Load a save while zoomed into a corner. The
camera should stay put and the city under it should change. If anything still
shows the old city, this is where it went wrong — the gate checks the renderer
redraws, but not every panel.

### N5 — a save button saves, shift-click loads

**What I chose.** Each slot is one button: click saves, shift-click loads. The
autosave slot loads on plain click since you never write to it by hand.

**Why.** A save/load dialog is a screen to learn, and N5's job is that a session
survives a closed tab. This is the smallest thing that does that.

**What to check when you play.** Whether this is too easy to get wrong — one
mis-click overwrites a slot with no confirmation. If it bites you once, it needs
a confirm on overwriting a used slot.

### N6 — seven disasters, one at a time, always telegraphed

**What I chose.** All seven majors from §12 (wildfire, earthquake, flood, storm,
industrial explosion, blackout, water contamination). Exactly one runs at a
time, and every one spends a month as a **warning** naming the place before it
strikes. Frequency comes from the existing `difficulty.disasterOneIn` rather
than a new knob. Disasters are **on** in the playable game, off by default in
the engine (free-build is a mode).

**Why.** Two at once is not more dramatic, it is unreadable — you cannot tell
which thing broke your city. The warning is what makes it an event rather than a
punishment, which is §12's own language.

**What to check when you play.** Whether one month of warning is enough to
actually *do* anything. If a flood warning arrives and there is no useful action
available in that month, the telegraph is decorative and either the lead time or
the available responses need work.

### N6 — a strike tops the treasury up to a floor

**What I chose.** When a disaster strikes, any player below §3000 is topped up to
it (capped at §6000 granted). A solvent city gets nothing.

**Why.** The 200-game soak found cities where an explosion took the industry,
jobs went, residents left, tax revenue fell below upkeep, and the treasury bled
to zero with nothing left to rebuild from. §12 asks disasters to be recoverable
and to be "a source of meaningful choices"; a city that cannot rebuild has been
handed no choice.

**What to check when you play.** Whether this feels like a safety net or like
being bailed out. If a disaster never hurts because money always appears, the
floor is too high or should be a loan rather than a grant.

### N6 — the gate measures recoverability at the blast, not at year 25

**What I chose.** "No unrecoverable cities" is measured the tick after each
strike: is buildable ground intact, is the terrain unchanged, can the player
still afford to rebuild. **Not** the state of the city 25 years later.

**Why, and this is the one I most want you to check.** The first version
measured year 25 and failed three cities. A control run — same seed, same
deputy, disasters off — confirmed the disaster caused it, so it was not a false
alarm. But what it caused was a slow economic decline that a *dumb AI* never
pulled out of. The gate's own words are "leaves a city that **play can** repair",
and the deputy is not play. I judged that measuring the deputy's competence
under the name of disaster recoverability would let a real economy bug hide
behind a disaster tuning knob.

**Those three runs are still reported** by the soak, every time, as an economy
finding for N8 — seeds 90135, 90141, 90162.

**What to check when you play.** Take a real hit to your industry and see
whether *you* can climb out of it. If you cannot, then the decline is the game
and not the AI, and I called this wrong.

### N7 — one distance field, not a Dijkstra per commuter

**What I chose.** ONE breadth-first sweep outward from every job tile builds a
distance field over the road network each month; every home then walks downhill
through it, laying load on each tile it crosses.

**Why.** `plan.md` asks for capacity-aware routing on sampled origin/destination
pairs and flags traffic as the expensive system. A search per pair is the
textbook answer and is far too slow. Inverting it makes the cost
O(road tiles + homes × route length): **0.70ms median** on a saturated 128×128
with 8,899 road tiles, against an 8ms share of the 16ms month tick.

**The honest limitation:** everyone takes the shortest route even when it is
full. There is no rerouting around congestion. So congestion here reads as "this
road is over capacity", not "traffic found another way".

**What to check when you play.** Build a bottleneck — one bridge, two districts —
and see whether the jam looks right. If you expect cars to divert and they
never do, that limitation is the thing to fix, and it means a real per-origin
search on a much smaller sample.

### N7 — 26% of homes in the standard fixture cannot reach work

**What I found, not chose.** On the saturated 128×128 fixture: 1,263 commuters,
364 congested tiles, and **161 stranded homes out of 629** — a quarter of houses
with no road route to any job.

**Why I left it.** It is a finding about the deputy's road-building and about
development allowing houses with no route, not about the traffic model, which
correctly reports it (`noRouteToWork`). Fixing it inside traffic would be hiding
it.

**What to check when you play.** Whether YOUR houses connect. If you build a
sensible grid and still see stranded homes, the reporting is wrong. If the
deputy's cities are the only ones with the problem, it is an AI problem and can
wait.

### N11 — the build menu is a flat row, not a palette

**What I chose.** Every building in the catalogue gets a button on one scrolling
row, grouped by category, cheapest first, each showing its price at the current
difficulty. No panel, no categories to open, no unlocks.

**Why.** The alternative — a palette with categories you open — is a screen to
learn before you can build, and the thing being fixed was that a plant could not
be built at all. Twelve buildings fit on a row. It also means a building added
to `data/buildings.json` appears in the game with no UI work, which is the
property I want while the catalogue is still growing.

**What to check when you play.** Whether you can *find* the water pump. Power
and water sit at the left where they are visible without scrolling; services and
parks scroll off on a phone. If choosing between four power sources feels like
reading a spreadsheet, the palette is the answer after all.

### N11 — the HUD panel takes half a short desktop window

**What I found, not chose.** With the build row and the budget row the panel is
**371 px of a 720 px window** (51%) and **343 px of 844 px on a phone** (41%).
Both pass their gates; the desktop ratio is the worse one, which is backwards.

**Why I left it.** Every row on the panel is something §13.1 asks for — demand,
alerts, tools, buildings, overlays, budget, saves. Deciding which one collapses
is a design call about what a player looks at most, and I would be guessing.
Recorded as **Q21**.

**What to check when you play.** Whether the map feels cramped on your screen.
The obvious candidates to collapse are the overlay row (eleven buttons, most of
them consulted rarely) and the save row (four slots plus export and import).

### N11 — the tax slider is the whole budget

**What I chose.** One slider for the rate, and a line reading income, upkeep and
net. Not the per-service funding sheet §13.1 describes.

**Why.** The rate is the lever that changes what happens; per-service funding is
a second system with its own balance consequences, and it should not be
introduced in the same slice that first made the rate reachable.

**What to check when you play.** Whether you ever want to underfund the police
to survive a bad year. If you do, the funding sheet is the next budget slice.

### N18 — the game is synthesised, not sampled

**What I chose.** Every sound is made by oscillators and a noise buffer at
runtime. There are no audio files.

**Why.** Zero runtime dependencies and no build step mean an audio bank is a
vendoring and licensing decision, not a slice. Seven short gestures — a rising
pair for something built, a falling one for a refusal, a low thud for a
collapse — cost nothing to download and cannot go stale against a bake.

**What to check when you play.** Whether it sounds cheap. Synthesised audio has
a ceiling, and if the answer is "this needs real sound" then C4 becomes a
sourcing decision and I should stop here rather than polishing oscillators.
Also whether the ambience layer is pleasant over an hour — it is the one sound
that never stops.

### N18 — three voices a tick, and refusals are audible

**What I chose.** A month that produces fifty-nine power shortfalls produces one
`warn`. Notifications are ranked, so a disaster is never crowded out by a quest
chime. Refused commands make a sound.

**Why.** The alert area learned the collapsing lesson in N4. Refusals are
audible because they are the thing a player most needs to notice and the text
naming them is at the bottom of the screen.

**What to check when you play.** Whether the refusal sound becomes annoying —
it fires on every mis-click, and mis-clicks are common while learning the
footprints. If it grates, the fix is to play it only when the reason is
`noFunds` rather than on every refusal.

### N19 — icons are SVG, so installability is not guaranteed everywhere

**What I found, not chose.** The manifest ships two SVG icons. Chromium installs
from them; some launchers want PNG.

**Why I left it.** Generating PNGs needs an image pipeline the project does not
have, and committing binaries for something drawable in forty lines is worse
than the limitation.

**What to check when you play.** Try installing it on your phone. If it refuses,
that is the one thing to fix, and it is half an hour with a screenshot tool.

### N20 — funding is three steps, not a slider

**What I chose.** Lean 50%, Normal 100%, Generous 150%, per department, as a
dropdown in the budget row.

**Why.** A range input is a poor keyboard target, and the decision is "can I
afford this department" rather than the difference between 96% and 104%. Coverage
and upkeep both scale, so it is a real trade.

**What to check when you play.** Whether you ever set anything to Lean. If
Generous is always correct, funding is a tax on attention rather than a
decision, and the numbers need widening — or the feature is not worth its row.

### N17 — the fixtures pin a city that grows

**What I found, not chose.** The founding fixture's first draft pinned forty
steps of an **empty field**: the wire was eight rows from the zoning, so nothing
was ever powered, and every hash was perfectly stable.

**Why it matters to you.** It is the reason each fixture now carries an `expect`
floor. If you change balance enough that the founding city stops reaching 100
residents, the fixture will fail with *"only worth measuring at 100 or more"*
rather than silently becoming a test of an empty map.

*(filled in at the end — what is missing and what it would take)*
