---
name: review-round
description: The periodic "do the docs, rulings, skills, memories and tests need updating?" checkpoint for City Grid. Run it when that question arrives in any form, after a run of slices, or before a break in the work.
---

# Review round

A checklist of what lives where, and what usually drifts. Work through it in order and report what
you changed — or state plainly that nothing needed changing, which is a valid outcome.

## 1. What lives where

| File | Holds | Drifts when |
|---|---|---|
| `specs/gamedesign.md` | What the game is | A mechanic is implemented differently from how it was designed |
| `specs/plan.md` | How it is built; budgets | An architecture decision or a measured budget changes |
| `plan-v1.md` | Waves, slices, gates | Slices complete, or dependencies shift |
| `specs/rulings/` | One decision per file | A decision gets taken in conversation and never written down |
| `dev-prompts.md` | The user's words, verbatim | A prompt carrying a product decision is not appended |
| `dev-questions.md` | Questions, open ones at the bottom | A question is answered but stays in the open section |
| `dev-log.md` | What happened, with numbers | An entry says "passed" instead of the measurement |
| `specs/engine/` | cityviewer — the renderer's specification (ruling 032); `12-decisions.md` is the settled table, `11-roadmap.md` the E/V/P slices | A renderer slice lands and the document that specified it still describes the plan; a decision in `12-decisions.md` has no ruling; a slice in `11-roadmap.md` has no row in `plan-v1.md` — `test/docs.test.js` checks the last two |
| `specs/art-direction.md` | Visual language | Any palette, lighting or silhouette change — §3 quotes real hex values and `test/docs.test.js` compares them against `palettes.js` |
| `CLAUDE.md` | Working rules | A rule is learned the hard way and stays only in someone's head |
| `.claude/skills/` | Repeatable workflows | A workflow changes and the skill still describes the old one |
| Memory | Durable facts about the user and the project | A preference is stated and only survives in the transcript |
| `client/precache.json` | Which files the offline app is made of | Any file is added to or removed from `client/`, `engine/`, `shared/`, `data/` or `vendor/` — regenerate with `node tools/make_precache.mjs`, or the game works online and breaks offline |
| `test/fixtures/` | The determinism tripwire | Hashed state changes — re-pin through `/fixture-repin`, never by regenerating to get to green |

## 2. The checks

**Docs**
- Does `plan-v1.md` reflect which slices are actually done? **Check the gate, not the tick** — 0.4
  was marked done for months with `test/fixtures/empty.json` as its gate and an empty
  `test/fixtures/` directory. A slice's "done when" column is a claim, and claims are checkable.
- Does a rule in `CLAUDE.md` describe something that is actually true? "Hashed fields are listed in
  two places" described one place for the life of the project.
- Did any slice change behaviour that `specs/gamedesign.md` still describes the old way?
- Are the budgets in `specs/plan.md` §3.8 and §6 still predictions, or have they been measured? A
  measured number replaces a predicted one and names its era and commit.
- Did a palette or lighting value change without §3 changing with it? The two are compared by test, but the *prose* around them can still go stale.

**Rulings**
- Was a decision taken in conversation without a file in `specs/rulings/`? Write it, with its
  reasoning and where it is enforced.
- Does any code implement a rule without citing its ruling in a comment?

**Questions**
- Anything answered still sitting in the open section of `dev-questions.md`?
- Any *new* uncertainty discovered during the slices that nobody has asked about?
- Any open question now blocking the next slice? That is worth raising immediately, not at the
  next checkpoint.

**Tests**
- Does every new command have a permission-matrix row?
- Does every new nested state have a `copyState` deep-copy test?
- Is any gate in `plan-v1.md` not actually runnable yet? A gate that cannot be run is a wish.
- Does the saturated fixture still represent a realistic mature city, or has development changed
  under it?
- **Is the CONTENT at the volume the slice asked for?** A shortfall is invisible in a green suite —
  content that has not been written looks exactly like content whose conditions have not been met.
  Count it (`test/quests.test.js` counts quests per category against slice 4.3).
- **Key parity is not translation.** Every English string having a Norwegian one has been true
since slice 4.2 and says nothing about whether the Norwegian is any good: `t()` returns its own
argument on a miss, so a complete catalogue can still be English. The check that can see it is
"no value is byte-identical to its English", with an allow-list carrying a REASON per entry — and
the same question applies to any data file outside the catalogue (`data/names.json`'s shop names
were outside it and nothing had ever looked at them). M4.

**Does a data file carry prose where it should carry an i18n key?** `t()` returns its own
  argument on a miss, so English ships as its own translation and nothing goes red. The check is a
  test that refuses the raw field, not a test that the key resolves.
- Do the doc-consistency tests still pass? `test/docs.test.js` is what keeps this checklist honest.

**Reachability** — the sweep that found the N11, N12 and N13 omissions. Two of the four are tests
now; run all four:

```sh
# 1. Commands with a constant but no handler, or a handler but no control (ruling 026).
# 2. i18n keys the catalogue promises and no screen keeps (ruling 027).
node --test test/omissions.test.js test/reachability.test.js
#    ...and that every control is clickable, and nothing invisible eats the map (ruling 029).
node tools/reach_smoke.mjs

# 3. Data the engine mirrors and nothing reads.
grep -o '"[a-zA-Z]*"' data/balance.json | sort -u   # then grep engine/ for each suspicious key

# 4. Exported functions with no importer. Note that a same-file use is fine and
#    common — the question is which of these is a CAPABILITY WITH NO CONTROL.
for f in $(grep -rhn '^export function' client/ engine/ shared/ \
             | sed 's/.*export function \([a-zA-Z0-9_]*\).*/\1/' | sort -u); do
  def=$(grep -rl "export function $f\b" client/ engine/ shared/ | head -1)
  n=$(grep -rn "\b$f\b" client/ engine/ shared/ test/ tools/ | grep -v "^$def:" | wc -l)
  [ "$n" -eq 0 ] && echo "no importer: $f  ($def)"
done

# 5. Dynamic imports of files that do not exist. Static imports fail at load;
#    a dynamic one fails only on the path that reaches it, which for a debug
#    flag or an error screen may be never. Covered by test/omissions.test.js.
grep -rn 'import(' client/
```

**At least one gate must use the real server.** Every gate stood up its own static server inside
its own file, so all eight passed while `./run.sh` served a Content-Security-Policy that blocked
the importmap and the game would not boot at all. `tools/serve_smoke.mjs` spawns `tools/serve.mjs`
and loads the bare origin. **Listen for console errors, not only `pageerror`** — a CSP violation is
reported to the console, which is why this was invisible.

**Reachability runs in two directions.** `test/reachability.test.js` asks whether every function
has a control; `tools/reach_smoke.mjs` asks whether every control can actually be clicked, and
whether anything invisible is eating clicks meant for the map. The second one found two containers
swallowing a quarter of the map (ruling 029) — every control still worked, every screenshot still
looked right, and nine gates saw nothing.

**A green suite says nothing about what the game LOOKS like.** Wire and pipe drew a square per tile
with a gap at every boundary for four slices: the pool counts were right, the overlay was right,
the simulation was right, and a run of ten poles read as ten dots (ruling 030). No test can see
this and no gate has ever caught one. The only instrument is a person, or a screenshot somebody
actually looks at — so when a slice changes what is drawn, **look at it** before reporting it done.
It took two playtests: N27 joined the runs and N28 found them still reading as dots, because the hub
was wider than its arms and at city zoom the arm fell under a pixel. Look at it **at the zoom the
player uses**, not only at the zoom that proves the change.

**A screenshot proves nothing if the fixture has nothing to show.** V7's overlay wash was invisible
in three screenshots while every diagnostic said the shader had compiled, the uniform was set and
the byte plane was filled — and the plane was filled, with band GOOD for the whole map, because the
fixture had no pollution. A green wash over green grass is a green picture. **Verify the
instrument, then verify what the instrument is pointed at**: histogram the data the picture is
supposed to be showing before concluding anything from the picture.

**A derived index can be read backwards, and only half the city will show it.** R2 gave the lane
graph the corridor's own profile instead of a height per point — a real 80 → 53.7 ms win — and
mapped a lane's fraction of length onto a profile built in forward order. Every lane running the
other way read it mirrored: 1.79 m mean error, worst 12.44 m, half the traffic in the city posed
against the wrong end of its street, for four slices. When a derivation is shared by two
directions, assert the SECOND one; `budget_gate` counts triangles and `walkthrough` never looks
at a car.

**The gate that was asked for is not always the gate that can see it.** T1 changed how traffic
flows and the review asked for a `traffic_gate` re-baseline; the numbers came back byte-identical,
because `traffic_gate` measures the engine's commuter pass and T1 is renderer-local (ruling 037).
Record both runs and say why they match — a null result with a reason is a finding, and a null
result presented as a re-baseline is a lie. Then find the instrument that can see it.

**A number that never mattered starts mattering the moment its scale changes.** V8 scaled the sky
dome from 1,800 tiles to 85 so street mode could see it, and it became a pale ball sitting in the
middle of the map: the dome had always been centred on the world origin rather than on the eye,
and at 1,800 tiles the camera was always near enough to the centre for that to be invisible. When
you change a constant by an order of magnitude, ask what was true only because it was large.

**The budget ladder is an instrument, and it moves.** Three separate additions in V8 were paid for
in buildings — seven-sided tree blobs and 36-triangle signal lenses each took the night frame's
ladder a rung further down. Watch the `lod` string in `budget_gate`, not only the triangle count:
the count staying under budget is the ladder doing its job, and the rung is what it cost.

**Colour arithmetic happens in linear space, and your eye does not.** E8 dimmed an unlit water
surface by the night preset's hemisphere — 0.34 — and got a river glowing cyan through a black
city, because in three's working space that factor is about 0.6 to the eye while everything lit
beside it had gone to almost nothing. The general fix is not a better constant: it is to let the
LIGHTING do it, so the thing dims by exactly what everything else dims by and there is only one
copy of the rules. A probe that reads back a hex value will confirm the material is "correct" the
whole time.

**Check what the "before" actually was.** R3 spent an hour concluding that grading streets had
made them steeper, because the number it compared against was the bare land along a centre line —
and the old code did not return that, it returned the land blended across every nearby corridor.
The blend was most of the steepness in both. A before/after is only a before/after if the "before"
is the code that shipped: give the change an off switch (`?grade=0`) and measure both from one
harness, rather than measuring the new thing against a quantity that merely sounds like the old one.

**A count is not a picture.** E7's `stats.peds` said 120 people were in the visible box while the
street the camera stood in had two on it: the box under perspective at a low pitch stretches to the
horizon, so "on screen" and "where you are looking" are different questions. Three separate
placement defects hid behind that number. What found them was a screenshot with the subject painted
magenta at three times size, and then a **histogram of distance from the eye** — when something is
drawn and cannot be seen, measure where it actually is before changing the code that draws it.

**Ask what the unit suite structurally cannot see.** In this repo that is every
module importing `three`, because node cannot resolve it — three defects have
lived there behind a green suite. The answer is not more browser gates; it is to
move the DECISION into a module node can load and leave the plumbing thin.
`test/purity.test.js` pins the list of three-importing modules so it cannot grow
without someone saying so.

**An estimate that does not price what the renderer draws sacrifices detail for
nothing.** This has now happened three times: the cost table went stale when a
road became a box (P35), it priced every chunk at the frame's plan when the plan
became per chunk (V5, 77% over), and it charged for terrain inside a bounding
box when the frustum is a wedge (V5, a quarter over). Ask of any budget: *does
the thing that spends it know what the thing that draws it actually did?* And
watch the direction — a render-and-measure loop corrects an over-estimate by
stepping down and is blind to an under-estimate.

**A boundary that is only a habit is not a boundary.** `client/world/`, `client/render/` and
`client/life/` must never import `engine/`, and until V2 nothing checked it — they were clean
because everyone had been careful. Ask of any architectural rule in a document: *what would go
red if someone broke this?* `test/purity.test.js` now plants a violation's shape for each of
them; a structural test that has never been shown to fire is a comment.

**A model of the code is not the code, and nothing tells you when it drifts.**
The LOD cost table priced a road at "one upward quad" for two slices after a
road became a twelve-triangle box, so the triangle budget was 23% wrong and a
saturated city rendered with no trees (ruling 019, amended). Ask of any table of
constants that describes code elsewhere: **what re-derives this, and would
anything go red if the thing it describes changed?** If the answer is nothing,
either measure it at runtime or write the gate that compares the two.

**A rising triangle count is not proof anything was drawn.** E3's ribbons flipped a face's normal
when it pointed downward and left the vertex order alone — so half the streets in the city were lit
correctly and then backface-culled, while `info.render.triangles` went up exactly as expected and
every unit test passed. Winding and normals are two halves of one fact; assert them against each
other. And when a render looks wrong, **make the suspect geometry impossible to miss** — a magenta
carriageway floated five metres in the air answers in one shot what an hour of reasoning about
depth precision, frustum culling and material flags will not.

**Look at it at the zoom the slice is ABOUT.** E3's job was the street at street level, where a road
tile painted asphalt for its whole 20 m leaves an 8 m carriageway floating in grey, the water pipes
are a blue staircase down the middle of the road, and the pavement runs across the mouth of every
side street. None of that is visible at city zoom, none of it fails a test, and all three were
found in the first screenshot anybody actually opened.

**Verify the instrument before believing the reading — including a gate that PASSES.** E4's
walkthrough walked 54 km of city and reported a clean sweep with zero steps blocked by anything,
because a corridor centre line never comes within seven metres of a building (ruling 035). A gate
that cannot fail is not a gate. Every sweep should count how often the thing it is testing actually
fired, and refuse to report success when that count is zero; the same check turned E3's
passability sweep from "narrowest street 33 m" (the search ceiling wearing a number's clothes) into
a real measurement.

**A pass that returns nothing looks exactly like a pass whose conditions were not met.** E5's prop
pass built no lamps, no hedges and no paths for a whole slice, because `bakeLots` called
`corridorsIn` with five arguments where it takes six: `trim` got `undefined`, every point came out
`NaN`, and the empty list that came back was indistinguishable from "this chunk has no streets in
it". No error, no red test, and the screenshots looked right because the L2 instanced lamps stood
in the same places. What found it was E6 asking a question nobody had asked before — *where are the
lamps* — and getting zero. When a builder can legitimately return nothing, give something
downstream a reason to count what it produced.

**A `replace` that does not match is a silent no-op.** V6's `garden` field never landed in
`buildingParams` because the text searched for was not the text in the file, and two runs went by
with everything looking right and the pools reporting zero. After any scripted edit, grep for what
you meant to add — and where a pass can legitimately produce nothing, report its COUNT so an empty
one cannot be mistaken for an unmet condition.

**An unhandled rejection is a blank page with no error in it.** `main.js` awaited `play()` in three
places without a catch, so a `ReferenceError` inside `startGame` produced a silent white screen —
no `pageerror`, no console output, nothing for a gate to report. `client_smoke` stayed green
throughout because it drives `tools/shoot.html` and never loads `index.html`. Catch what you await
at the boot boundary, and remember that the renderer gates do not exercise the real page.

**A test that passes with the bug planted is worse than no test.** R1's junction-speed finding had
two behavioural tests written for it and both passed with the defect restored — the two key spaces
overlap, so the wrong answer is a plausible speed, and a car crosses an 8 m junction in under a
second so nothing about its position moves. Plant the bug before believing the test. When the
honest instrument turns out to be a source assertion, say in the file why the behavioural one could
not be made to discriminate.

**Moving code invalidates the tests that read it.** Four source assertions went red when the eye
arithmetic moved into `client/world/orbit.js` — they were right to. A source test is a model of the
code, and the moment to re-read it is the moment the code moves.

**A number written down twice is a defect waiting for the next edit.** `VARIANTS` was in
`client/world/params.js` (which picks a building's variant) and in `client/render/building-kit.js`
(which builds a pool per variant). They agreed, so nothing was wrong — until the slice that raised
one of them, at which point every building of the new variants would have silently stopped being
drawn. Look for the pair before you change either.

**A caption is a measurement nobody read.** The style sheet has printed "pixel — 1 draw, 2 tris"
next to two styles reporting eighty thousand, in every run since the pixel style shipped, and it
was a real defect the whole time: `renderer.info.render` is reset by every `render()` call, so the
budget's measurement loop was reading the full-screen quad. When a tool prints a number beside
comparable numbers, read the comparison.

**A shader that does not compile looks exactly like a shader that is too subtle.** three logs
`Fragment shader is not compiled` to the console and otherwise draws nothing; the picture is the
scene without its finish. Print every page problem, not the first two — and never name a GLSL local
after a builtin the same shader calls (`vec2 step` cost three runs).

**A gate that shares a page with a running game must drive the game, not the frame.** `budget_gate`
set the hour by calling `renderer.draw({time: "night"})` and then waited two animation frames — in
which the page's own loop drew again with the setting's value and undid it. Go through the session.

**A budget is a prediction until something measures it.** City Grid's tier budgets were written in
V2 and not revisited until E5 put real facades in a chunk — at which point nine chunks of L3 cost
more than the whole High-tier budget, and the ladder was quietly selling the cars and the props to
pay for the buildings behind them. The frame was never over budget and no gate went red; what went
wrong was that the number the budget was defending had stopped meaning anything. When a slice adds
a new KIND of geometry, re-measure the budget it lands in, and put the measurement in the spec next
to the prediction it replaces.

**A gate with its own copy of a number will one day measure a different game.** `ui_smoke` carried
all three tier budgets as literals and went red the moment the data changed; `budget_gate` and the
LOD cost table have each done the same. A gate reads the data file.

**A screenshot harness that draws one frame cannot photograph a cache.** The street cache bakes one
chunk a frame on purpose; the shot tool drew once, so an L3 city photographed with one chunk of
street in it and the gate believed it. If the thing under test converges over frames, the harness
has to run frames.

**A flag that is read but never used is off.** `?life=1` reached `tools/shoot.html`, was passed
into the renderer, and did nothing for the life of the project, because the frame loop never gave
`client/life/` the delta it takes its time from (ruling 037) — so `life=1` and `life=0` drew the
same empty roads and every screenshot in `reports/` has no moving car in it. Found in D4, by
putting the picture next to one that had cars. The check is the same one as everywhere else in
this file: **assert the effect, not the setting**.

**A question in the open list is a hypothesis, and hypotheses are wrong sometimes.** Q69 said the
traffic sim spawns only on screen and never empties a link that leaves the view — a story that
explained the evidence (1,546 cars growing to 9,222 across a sweep) and was false in both halves.
`update(dt)` takes no bounds at all. The truth was simpler and was already written down beside it
as Q76: the fill was per frame, and the sweep's steps shared a session, so the city was just
getting fuller. **Re-read the code before building the fix a question asks for** — and when a
question's remedy would break a ruling (here, a camera-dependent population against ruling 037's
locally-derived traffic), that is the strongest possible sign to check the diagnosis first.

**Rule out the arithmetic before blaming the machine.** A card came back with 18 m of a 60 m leg
where a machine twenty times slower walked all of it. The tempting story — "the fast machine is
different somehow" — was checked instead: the walker driven in node over twelve starting points
covers 60.0 m at 60 fps and 60.4 at 10, so the model is not frame-rate dependent and the cause is
in the session. Where the pure half can be run in node, run it, and let the instrument carry
whatever tells the remaining candidates apart rather than reasoning about which is likeliest.

**Two numbers are the same measurement only if they cover the same amount of time.** The perf card
compared a row that had lived 12 simulated seconds with one that had lived 3 and read the
difference as a frame-rate defect. The delta clamp means a machine below 15 fps advances its world
more slowly than the clock (Q78), so wall-clock seconds are not city seconds. Whatever a
measurement is a function of, **print that thing next to it**.

**`git add -A` at the end of a long session is how scratch reaches a public repository.** Seven
gate transcripts and four probe captures were committed and pushed that way (M5). The guard is a
test that matches **patterns** — `reports/review*.log`, `reports/tmp/` — not a list of names, since
the next round writes `review4-`. Before committing a slice, look at what `git status` is actually
offering you, not only at what you meant to change.

**A number in a document has to say which measurement it is.** `RELEASE.md` said "a frame at High
is 289,446 triangles"; two views of the same city at the same tier differ by a factor of two
(`budget_gate`'s street zoom against D5's `city 40t`, 289,446 against 130,936), and the page named
neither. A measured number without its view, its map and its era is not checkable, which is the
only thing the page is for.

**The gate's viewport is a configuration too.** Every headless gate in this project runs
1280×800 at DPR 1. Street chunks are gated on resolvability and `tilePixels` is a function of
canvas height, so at that size the ladder drops them — and the most expensive thing the renderer
builds (258,536 of 289,086 triangles, 90% of the High budget) had **never once appeared in a
city-zoom measurement** until a real 2560×1305 screen at DPR 1.5 drew it (Q77). When a subsystem
is gated on a threshold, ask which side of that threshold the gate's own window sits on.

D8 closed it, and the closing had a lesson of its own: the fix's *first* viewport (1440 px of
canvas) still resolved nothing at span 20. **A threshold has a margin, and reproducing a finding
means matching the number that crosses it**, not merely moving in its direction — the gate now
matches the card's canvas height exactly, and asserts the two viewports resolve in exactly the
ratio of their heights so the claim cannot drift into being about the camera.

**An instrument that never gets enough input never speaks, and silence reads as "fine".** The
frame-time governor was giving up its entire quality ladder on an RTX 4090 at a locked 60 fps —
because every tier's target was the *refresh interval* (16 ms against a 16.666 ms frame) rather
than a threshold above it, so a machine hitting its target exactly was judged to be missing it,
forever. It was invisible for eight months because the only machine ever measured was SwiftShader,
which drew **5 to 26 frames in a five-second hold** while the governor ignores its first 10 samples
and averages over 60. Not an instrument pointed at nothing — an instrument that was never handed
enough to say anything. Ask of any threshold: **what value does the real hardware actually
produce, and is my threshold on the wrong side of it by a fraction?**

**A gate that has only ever been run on one input has only ever tested one input.**
`walkthrough` had run on `rolling` terrain for its whole life because the fixture could not make
anything else. Given the option in D6, it failed on `hilly` immediately: 80 places where the
ground rises over a metre in two, a cliff no walker can climb, on a map the lobby offers (Q74).
The same sweep found ungradeable corridors going from 1% to 33% — and size changed nothing, so
every "measure it on a bigger map" instinct was aimed at the wrong axis. **Ask what a gate's
fixture cannot express**, and give it the option before believing the green.

**A green suite says nothing about which build the player is running.** The service worker served
cache-first and re-installed only when its own bytes changed, which they never did — so two P33
playtest items were reports about code that had shipped three days earlier and could not arrive
(ruling 031). Every gate opens a clean profile and every gate was green. When a report contradicts
what the code plainly does, check delivery before you check the code.

**A gate that sets a flag on its own draw is racing the page's frame loop.** V7 measured the
territory toggle by calling `renderer.draw({territory: true})` and read a cache thrashing — the
game's own loop drew without the flag on alternate frames, so every chunk rebaked forever. Wrap
the real entry point for the duration of the measurement, or drive the control the player uses.
The same shape as "a feature is not built until it is driven on the real page", one level down.

**A constant copied between two systems brings its units with it.** E7's pedestrians took the
cars' spawn rule, `here + 0.5 < target`, and a pavement outside an ordinary house asks for 0.24
people — so a whole city of houses had nobody on it while every unit test passed, because the test
fixture happened to ask for 1.44. When you copy a threshold, check what it is a threshold ON.

**A setting is not built until a pixel changes.** High contrast set an attribute for two slices
while 61 rules used system colours `--bg`/`--fg` could not reach, and the gate checked only that the
attribute landed. For anything that themes the interface, assert a **computed colour** before and
after — the same "measure the whole, not the part" as everywhere else in this file.

**A measurement whose steps inherit each other's state is not one measurement.** D1's perf sweep
held nine views of one city in one session, and the local traffic sim fills a link when it comes
on screen and never empties it — so the car count went 1,546 → 9,222 across the run and the
"night" row read 700 ms because it had six times the cars of the day row. Every step of a sweep
must start from the same place, and the way to check is to put the state it depends on *in the
row*: the defect was invisible until `cars` was printed beside `p50`. The same question applies to
any harness that reuses a session — **what has this step inherited from the last one?**

**And the pause you called may not be the pause that is running.** `session.pause()` was called,
on the right object, and the clock kept ticking for four runs: the sweep's first step rebuilt the
renderer (a style change is a new session, R2) and the replacement was born at speed 1. When a
control visibly does nothing, ask whether the thing it controls is still the thing that is there.

**When several things move at once, check what they now sit on top of.** N24 moved four panels and
left the advisor under the rail, the drawer over the rail, and the build popover under both. Each
was found by a gate rather than by looking, which is the system working — but a five-minute pass
over the new positions would have found them first.

**A feature is not built until it is driven on the real page.** N21's city name passed every unit
test and reached the URL and nowhere else, because the lobby generates its region *before* the name
is typed and hands that world on. Only `lobby_smoke` saw it. Unit tests check the parts; the gate
checks that they are connected.

**Audit the slice you just wrote, not only the project around it.** Two of N15's own defects
survived its gates because the gates checked that the feature existed, not that it kept working:
the minimap painted the right picture once and never again, and the code written to honour
ruling 028 broke it. Ask of anything with a cache: **what invalidates this, and is that every
path that changes the thing?**

**An ARIA role is part of this sweep** (ruling 028). A role that names a keyboard pattern is a
promise assistive technology repeats to the user, so an unimplemented one is worse than no role:
`role="toolbar"` on four rows told people to press arrow keys that did nothing for nine slices.

The question behind all four: **what can the engine do that the game cannot?**
It has never once come back empty. `CMD_SET_TAX` sat unreachable for four slices;
twelve buildings until N11; three balanced difficulties until N12; every refusal
in the game's history said "0 tiles" until N13. None of these breaks a test on its
own, because a feature that is absent throws no error and `t()` returns its own key.

When one of the two tests goes red, the fix is **build the thing or list it with its slice** —
never widen the allowlist to make the red go away.

**Skills**
- Did a workflow change? Update the skill in the same breath.
- Is there a repeated manual sequence that should become one?

**Memory**
- Anything durable learned about how the user wants to work?
- Anything about the project that is true, load-bearing, and *not* derivable from the repo? If the
  repo records it, do not duplicate it — a stale memory contradicting a live file is worse than no
  memory.

## 3. Report

Say what you changed, in one line each. If nothing needed changing, say that — do not manufacture
churn to look thorough.
