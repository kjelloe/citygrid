# Playtest notes

**Read this before playing. It is a list of questions, not a changelog** —
`dev-log.md` is the changelog.

Everything below is a decision I took without being able to ask. Each one names
**what I chose**, **why**, and **the specific thing that would tell you I chose
wrong**. Part 1 is ranked: the top five change what I build next. Part 2 is a
play session that walks through every one of them in order. Part 3 is the full
record, including the calls that need no answer unless something looks off.

Waves 0–4 are complete. Wave 5 (multiplayer) has **not** been started, because
ruling 003 holds it behind the singleplayer MVP being *accepted* — and
acceptance is this playtest, not a green suite.

---

# Part 1 — What I most need from you

## 1. Is the loop satisfying?

**The one thing no gate can answer.** `gamedesign.md` §24 closes on "a satisfying
and understandable feedback loop", and `tools/mvp_acceptance.mjs` says so out
loud rather than pretending to measure it. Thirteen of thirteen criteria pass;
none of them is this.

**What I need:** play for forty minutes and tell me whether you wanted to keep
going. If the answer is no, the next slice is not multiplayer — it is whatever
you were bored by.

## 2. Is the interface out of the way now?

**It was 55–56% of the screen; that is fixed.** Measured today:

| Viewport | Top bar | Bottom bar | Rail | Chrome |
|---|---|---|---|---|
| 1280×720 desktop | 56 px | 172 px | — | **32%** (was 56%) |
| 1920×1080 desktop | 56 px | 172 px | — | **21%** (was 37%) |
| 390×844 phone | 90 px | 164 px | 94 px | **41%** (was 55%) |

The bottom panel was seven stacked rows. It is one bar now, with the twelve
building buttons behind a **Build** button and the overlays, tax and saves
behind a **left rail** with drawers.

**What to check:** whether it is now *too* hidden. Three things that used to be
permanently on screen are one click away, and the trade may have gone too far —
particularly the demand bars and the money, which you glance at constantly.

**Still open, and I did not want to invent it:** the phone is 41% and the
remaining reduction needs the rail to be **icons rather than words**. Six
buttons labelled "Overlays / Tax / Saves / Controls / Statistics / Settings"
wrap to two rows at 390px. An icon set is an art decision, not a layout one.

## 3. Money stops mattering around year 20

**What I found, and accepted rather than fixed.** Era 1, 200 games, steady,
64×64, 25 years:

| | p25 | median | p75 |
|---|---|---|---|
| Treasury at year 25 | 975 k | **1.95 M** | 2.95 M |

Peak treasury p95 is **3.77 M**. Past roughly year 20 there is nothing you cannot
afford.

**Why I did not tune it.** The obvious lever — per-tile upkeep on wire and pipe —
was measured **twice** and rejected twice: it does not slow the rich city, it
kills the poor one (p25 treasury 0, p25 population 647 → 187). The likely real
cause is that there is nothing expensive to want. That is **content**, not a
constant, and guessing at a constant would have hidden it.

**What to check:** the year at which you stop reading the money. If it is year
12, this is the most urgent balance problem in the game. If you never stop
reading it because you keep overspending, I have this wrong and should leave it
alone.

## 4. Does the audio sound cheap?

**What I chose.** Every sound is synthesised at runtime from oscillators and a
noise buffer. There are no audio files.

**Why.** Zero runtime dependencies and no build step make an audio bank a
vendoring and licensing decision rather than a slice.

**What to check:** play with sound on for twenty minutes. Synthesised audio has a
ceiling. If your answer is "this needs real sound", then content lane **C4
becomes a sourcing decision** — and I should stop polishing oscillators
immediately rather than spending another slice on them. Listen especially to the
ambience layer, which is the one sound that never stops.

## 5. Is one month of disaster warning enough?

**What I chose.** Every disaster is telegraphed exactly one game month ahead —
`warningMonths: 1` in `data/balance.json`.

**Why.** Long enough to be a warning, short enough to be frightening. But I
picked it, and I never watched a person try to act on it.

**What to check:** when the warning fires, can you actually *do* anything? If you
find yourself watching helplessly, the number is too small. If you can fully
prepare every time, it is too large and disasters are a tax rather than an event.

---

# Part 2 — A play session that covers everything

Roughly 45–60 minutes. Each step names what it is testing: **(Q*n*)** against
Part 1, **(D*n*)** against the decision record in Part 3.

Start it with `./run.sh` and open `http://localhost:8123`.

## A. Starting a city — 5 minutes

1. **Open the game with no URL parameters.** You should get the new-game screen,
   not a city.
2. **Type a city name and your own name.** Both are optional.
   → *(D1)* Does an optional name field at the top of the screen feel like a form
   in your way, or like the start of something? §5.1 asks for it; I built it as
   two boxes you can ignore.
3. **Look at the region line** — "The Dust Valley", "80% buildable · 19% water ·
   27% forest".
   → *(D2)* Does the name match what you then see on the map? The classifier was
   measurably wrong until two days ago and is now measured, but it is still a
   heuristic.
4. **Press "Another region" four or five times.**
   → *(D2)* Do the name and the three numbers give you enough to choose between
   regions without a picture of each?
5. **Switch the difficulty to Relaxed, then Demanding, then back to Steady.**
   → *(D3)* Three difficulties are balanced across 200 games each, and until
   three days ago none of them was selectable. Do the hint lines mean anything?
6. **Start on Steady, 64×64, disasters on** — the defaults.

## B. The first ten minutes — the part that decides everything

7. **Do exactly what the advisor tells you and nothing else.** Sunny asks for a
   road first.
   → **(Q1)** This is the ten-quest tutorial chain. Does it teach, or does it nag?
8. **Try to place something you cannot afford.** Pick the coal plant early, while
   you are poor.
   → *(D4)* The ghost turns red and the readout says "Not enough money". Until
   three days ago every refusal in the game's history said "0 tiles". **Is the
   message where you are looking?** It is at the bottom of the panel.
9. **Press Build and find the water pump.**
   → *(D5)* The buildings are behind one button now, in a popover above the bar,
   grouped power / water / services / amenities, cheapest first. Picking one
   closes it. **Is one click too many, or exactly right?**
10. **Lay wire and pipe out to your zoning, then watch.** A lot develops when it
    has road, power and water.
    → **(Q1)** Time yourself from first road to first resident. §24 wants a
    first-time player under two minutes.
11. **Listen while you build.**
    → **(Q4)** A rising pair when something is placed, a falling one when it is
    refused, a chime for a completed quest.
    → *(D6)* **The refusal sound fires on every mis-click**, and mis-clicks are
    common while you are still learning footprints. If it grates, the fix is to
    play it only for "not enough money".

## C. Growing — 15 minutes

12. **Zone commercial and industrial. Run at Fast.**
13. **Leave the overlay on "Auto"** while you lay wire and pipe, then open the
    **Overlays** drawer on the left rail and pick one by hand.
    → *(D19)* Auto follows the tool: zone tools show zoning, wire shows power,
    pipe shows water, and putting the tool down clears the map. A hand-picked
    overlay **wins** until you choose Auto again. Is that the right precedence,
    and does Auto ever show you something you did not want?
14. **Open Statistics** (top bar). Ten graphs, each with a sentence under it.
    → *(D7)* The sentence is there because §30 makes a plain-language reading an
    accessibility feature. **Do you read the sentence or the line?** If the line
    is enough the sentences are clutter; if the sentence is enough the graphs are.
15. **Use the minimap** — click it, and drag on it.
    → *(D8)* Is one pixel per tile enough to make anything out at 64×64? Try a
    128×128 region later and see whether it is still legible.
16. **Watch the money as you grow.** → **(Q3)** Note the year you stop caring.

## D. Services and the budget — 10 minutes

17. **Build a fire station, a police station and a hospital.**
18. **Set each department to Lean, then Generous** — the three dropdowns in the
    budget row — and watch the upkeep figure beside them.
    → *(D9)* **Do you ever choose Lean?** If Generous is always correct, funding
    is a tax on attention rather than a decision, and either the numbers need
    widening or the feature does not deserve its row.
19. **Move the tax slider and watch income, upkeep and net.**
    → *(D10)* One slider and one line of books is the whole budget; §13.1
    describes a fuller sheet. Do you want more, or is this the right amount of
    economy for this game?
20. **Try to bankrupt yourself.** Tax to 0, everything funded Generous.
    → *(D11)* You should be warned before bankruptcy, never fail silently.

## E. A disaster — 5 minutes

21. **Keep playing until one arrives.** On Steady it is roughly one in 239 months;
    if you are impatient, start a second city on **Demanding**, where it is one in
    59.
22. **When the warning fires, try to act on it.** → **(Q5)**
23. **After it strikes:** you get an emergency grant topping your treasury to a
    floor, and a quest asking you to clear the wreckage.
    → *(D12)* The grant exists so that "can still afford to rebuild" is true by
    construction rather than by luck. **Does being handed money after a disaster
    feel like a rescue, or like the game apologising?**

## F. Traffic — 5 minutes

24. **Build a bottleneck deliberately** — one road connecting two halves of your
    city — and let it fill up.
25. **Open the Traffic overlay.**
    → *(D13)* **Everyone takes the shortest route even when it is full.** There is
    no rerouting around congestion; that is the honest limit of a distance field.
    If you expect cars to divert and they never do, that is the thing to fix, and
    it means a real per-origin search on a smaller sample.
26. **Look for homes that never fill.**
    → *(D14)* On the saturated test fixture, **161 of 629 homes have no road route
    to any job**. I believe that is the deputy AI's road-building rather than the
    traffic model, which correctly reports it. **Do *your* houses connect?** If a
    sensible grid still strands homes, my diagnosis is wrong.

## G. Keeping it — 5 minutes

27. **Save to Slot 1, then shift-click it to load.**
    → *(D15)* Click saves, shift-click loads, no dialog. Discoverable, or did you
    have to be told?
28. **Press `?`.** The controls card.
    → *(D16)* Built two days ago because there was nowhere to look up a key. **Did
    you want it earlier than this step?**
29. **Close the tab and reopen it.** The screen should offer **Continue**.
30. **Turn your network off and reload.** It should still play — it is an
    installable app with everything cached.
    → *(D17)* Then try installing it on your phone. The icons are **SVG**; some
    launchers insist on PNG, and if yours refuses that is half an hour to fix.

## H. Settings and the phone — 5 minutes

31. **Open Settings and switch to Norsk while the panel is open.** The panel and
    the game behind it both re-render.
    → *(D18)* The Norwegian is **my draft, not reviewed** — A21 says you review
    it. The quest text especially: all twenty, translated by me.
32. **Switch on high contrast.** Does it help, or just look flatter?
33. **Open the game on your phone and play for five minutes.**
    → **(Q2)** This is where the chrome question is sharpest: 55% of a 390×844
    screen is interface.

---

# Part 3 — The full decision record

Numbered to match Part 2. Nothing here needs an answer unless the scenario made
you notice it.

**D1 — naming is two optional boxes.** §5.1's first line is "the player names the
city and mayor". An unnamed city takes its region's name, because a placeholder
the player leaves alone is a city called by a placeholder.

**D2 — the region names itself from what generation actually produced.** The
classifier tested landmass count before water, so a river splitting a plain in
two produced "islands" — 62 times in 80 river maps, and never once "valley".
Fixed against 400 measured regions: river is now 74/80 valley, coastal 54/80
coast. **Left alone:** the archipelago style mostly produces one big landmass
with fragments, so it is named "coast" 43 times in 80. That is the generator
being honest, not the namer being wrong.

**D3 — the default is 64×64 on Steady, not what your hardware can handle.**
`recommendedMapSize()` answers "what can this device cope with", which is a
different question from "what makes a good first city". Wiring it to the default
opened every desktop player on a 128×128 region.

**D4 — a refusal names its reason, before the click as well as after.** The seven
`result.*` strings were in both catalogues from the first commit and nothing ever
rendered one. Affordability for buildings is checked client-side as a **hint**,
never a rule: the click still goes through and the reducer still answers.

**D5 — the build menu is a flat row, not a palette.** A palette with categories
you open is a screen to learn before you can build, and the thing being fixed was
that a power plant could not be built at all. A building added to
`data/buildings.json` now appears in the game with no UI work.

**D6 — three sounds a tick, ranked, and refusals are audible.** Fifty-nine power
shortfalls in one month make one warning tone. A disaster is never crowded out by
a quest chime.

**D7 — every statistic carries a sentence, and the sentence is the chart's text
alternative.** §30: a graph is not a statistic until somebody who cannot see it
gets the same answer. Movement under 5% reads as "steady", because a city that
wobbles 2% is not doing anything.

**D8 — the minimap is a picture.** `role="img"`, not focusable, no key handling.
It briefly took focus with Enter jumping to the middle of the map, which is
ruling 028's own defect — a role that announces a static image, on something that
takes keys. Keyboard users pan with the arrows, which aims.

**D9 — funding is three steps, not a slider.** Lean 50%, Normal 100%, Generous
150%, per department. Coverage *and* upkeep both scale, so it is a real trade. A
range input is a poor keyboard target and nobody hears the difference between 96%
and 104%.

**D10 — the tax slider is the whole budget.** The rate is the lever that changes
what happens; per-service funding (D9) is the other half and arrived separately.
The full sheet §13.1 describes is not built.

**D11 — an unpayable month floors the treasury at zero and reports a shortfall**
rather than running up unbounded debt. Twenty years of silent debt reaching
−130,000 is a missing rule, not a balance question.

**D12 — a disaster tops the treasury up to a floor, and recoverability is measured
at the blast, not at year 25** (ruling 025). A 25-year soak measures the deputy
AI's competence, not whether a person could repair the city — and the fix that
invites is making disasters weaker, which hides a real economy bug behind a
disaster knob forever. Three cities in 200 still decline to nothing afterwards;
confirmed disaster-caused against a disasters-off control run, and reported as an
**economy finding**, separately.

**D13 — one distance field, not a search per commuter.** One breadth-first sweep
outward from every job builds a field; every home walks downhill through it.
**0.70 ms** on a saturated 128×128 with 8,899 road tiles, against an 8 ms budget.
The honest limitation is no rerouting under congestion.

**D14 — 26% of homes on the saturated fixture cannot reach work.** A finding, not
a choice. Fixing it inside traffic would be hiding it.

**D15 — three manual slots and an autosave; click saves, shift-click loads.** A
save dialog is a screen the player has to learn, and the slice's job was that a
session survives a closed tab. The autosave takes its own slot and never
overwrites a manual one.

**D16 — the controls card derives its tool half from `TOOLS`.** A card that
advertises a key the game does not have is worse than no card.

**D17 — icons are SVG.** Generating PNGs needs an image pipeline the project does
not have, and committing binaries for something drawable in forty lines is worse
than the limitation.

**D19 — Auto is the default overlay, and a hand-picked one beats it.** It shows
nothing when no tool is held, so putting the tool down clears the map.

**D20 — skins are chrome only.** Your call (P29): ruling 022 settled the world
style, so a skin is a set of CSS custom properties. `clean` is the bare
stylesheet rather than a third copy of the defaults.

**D21 — the map now draws what you build.** Empty zoned lots take a subtle tint
that fades once built on; power lines draw on every tile they cover, not every
third; water mains are drawn at all, which they never were. This is the bug your
first playtest found.

**D18 — the Norwegian is drafted, not reviewed.** A21 says you review it. 379 keys
per catalogue, including all twenty quests.

---

# What is not built, and is not an oversight

| | Why |
|---|---|
| **Wave 5 — all multiplayer** | Ruling 003: held behind this playtest |
| Advisor personas | **Q18** is open — which ranks unlock which |
| Long press on mobile | A plain tap already inspects; the contextual actions a long press would open are slice 5.3 |
| Right-drag rotating | It pans. Rotation is four snapped angles on Q and E; a free-rotate drag would fight ruling 006 |
| An About screen | `menu.about` is a string with nowhere to go |
| Music | There is none, so there is no volume slider for it |
| A full budget sheet | See D10 |

`test/reachability.test.js`'s `NOT_YET` list is the live inventory of every string
the catalogue promises and no screen keeps, each naming the slice that will use
it. `test/omissions.test.js` does the same for the commands with no handler.

---

# The one thing I would fix before you play, if you tell me to

**Part 1, question 2.** Collapse the overlay row behind a single button, and
Help / Statistics / New city / Settings behind one menu. About an hour. It needs
your call on which controls are second-class, and it would take the phone from
55% chrome to somewhere near 35%.

Everything else in this file can wait for your answers.
