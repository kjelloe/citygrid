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
- **And the inverse, which happened three times in one day on 2026-10-07: an item that says "to do"
  for work that SHIPPED.** M8 and X1b were both reported open to Kjell and both were in the history
  with their tests; the three UI skins P108 asked for had been in the settings panel since N24. The
  heading is written once and ticking it is a fourth step after the gate, the log and the commit, so
  it is the one that gets skipped — and the lane files are what the next session reads to decide
  what to do. **Before reporting an item open, read the code for the thing it names**, and grep for
  the BARE name: a callback passed by reference (`["cityviewer.json", setConfig, …]`) never matches
  `setConfig(`, and an exclusion added to quieten the output is how the one piece of evidence gets
  dropped. Tick the item in the same breath as the dev-log entry.
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

**A new result code is three files, and nothing used to check two of them.** `RESULT` is in
`shared/protocol.js`, its words are in `data/i18n/en.json` and `no.json`, and `t()` returns its own
argument on a miss — so a forgotten string shows the player `result.tooSteep` and no test said so
until H6 added one. `test/i18n.test.js` now checks both directions (every code has words, every
`result.*` string is a code the reducer can still give). The third place is the PREVIEW: a refusal
the ghost cannot predict only speaks after the click (Q136).

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
the importmap and the game would not boot at all. `tools/serve_smoke.mjs` spawns `server/index.js`
— the deployed server, since M12 deleted `tools/serve.mjs` — and loads the bare origin. **Listen
for console errors, not only `pageerror`** — a CSP violation is reported to the console, which is
why this was invisible.

**And no tool stands one up of its own any more** (Q167). The handler is `server/static.js`'s
`makeStatic()`, which `server/index.js` and all sixteen browser tools call: a picture harness needs
no pump, no socket and no city, so the PROCESS is not shared, but the bytes and the headers are.
Before this, every picture this project argued art direction from was served by a fourteen-line
harness with its own type table and no CSP. `test/tools.test.js` pins it — a tool that calls
`createServer` without `makeStatic` is a red suite.

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

**A "nothing uses this" audit must strip comments and strings.** Q148's first cut reported eleven
unread options and the real number was thirteen: `copyOptions` and `writeState` name every option, so
serialization looked like reading, and a mention in a COMMENT counted as a reader — the comment that
rescued `seasonYears` was one I had written ten minutes earlier about that very option.
`test/helpers/sources.js` has `stripCommentsAndStrings`; use it, exclude the module that declares the
thing and the one that serializes it, and state the rule in the assertion. Then PIN the result, so
adding another is a deliberate act.

**And verify the stripper itself.** Those three functions read a `/` as division and a quote as the
start of a string, so `/^\+\s*"([^"]+)"/` — a regex literal holding two quotes — turned the rest
of the file into one unterminated string: the last 88 of `tools/i18n_review.mjs`'s 143 lines were
invisible to every scan that lists `tools/`, and the tell was four module constants reading as
dead. They know regex literals since Q167's round, and `test/sources.test.js` is the instrument's
own gate — the cases that broke it, plus the division that must not be mistaken for a pattern.

**A shot aimed by a proxy photographs the proxy.** F2's first shot list picked its subjects with
"the longest straight corridor", "the furthest house" and "near the centre of mass", and the
storyboard came back with a sawtooth factory roof where the high street should be, a forest where
the suburb should be, and no works at all in the shot called "the works". The fix is to ask the
fixture for the SUBJECT — the corridor with the most shopfronts on it, the densest patch of each
zone — which is what `tools/film_spots.mjs` prints. Every aiming rule in this repo has now been
wrong at least once; the instrument that catches it is a person opening the picture.

**And `node tools/gates.mjs film` is the only gate that renders a MINUTE.** Sixty-one frames of a
played city, each counted for triangles and for life. It is what sees a defect that only exists
between frames: a style change builds a new renderer, and the new renderer's traffic starts at
nobody, so every car in the city vanished on two cuts. No single-frame tool can have that bug, and
no single-frame tool can see it.

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

**A rung that can give repeatedly must not be stepped past after giving once.** The street-chunk
rung dropped ONE chunk and the ladder moved on: at street level on a played city that chunk was
38,700 triangles, and everything after it on the ladder — props, cars, people, markings, poles,
networks, shadows, building detail, trees — came to 25,000. So every street-level frame gave up
every car and every person to save a fifth of what the next chunk would have, and no street
screenshot the project had taken contained a moving car (B4). When a rung's resource comes in
units, ask how many units it has and what one of them is worth against the rest of the ladder.

**A decision priced on the state it changes will oscillate.** The estimate charges the street
chunks that are baked, so it could only say "the ninth fits" while the ninth was not baked; the
measured frame shed it, the cache evicted it, the estimate asked for it again, and a still camera
rebaked it every two seconds (B7). Four guesses at the mechanism came first; one run with the
cache's state logged after every draw settled it. When something flaky lives in a loop, record
every iteration before changing code, and when the loop feeds back on its own threshold, give it
hysteresis rather than a better constant.

**An invariant scoped to one structure cannot see a defect between two.** "Cars never overlap"
was asserted per LINK on a straight road for the life of the traffic code; every overlap B4
measured was between two turn links crossing one junction box (Q96). Ask of any invariant what
it is keyed by, and whether the failure it guards against can happen across the key. And define the
failure once, geometrically: B8's first overlap metric (centres under 2 m) counted two cars passing
round a bend and missed one sitting on another's rear, and its first threshold came from an assumed
car width — the kit's cars are 2.2 m, and the lanes they drove bowed to 2.00 m apart in every
junction. Read the dimensions from the code that draws them before tuning anything against them.

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

**A gate that fails oddly may have outgrown its fixture.** Six instruments in one round were
measuring a city five eras old: `budget_gate` laid its demonstration road across a 27-tile river and
reported "nobody braked"; the perf card asked for two frames from a one-second hold; `walkthrough`'s
three crossing counters read 0 in a city with no crossing; `disaster_shot` counted fire smoke out of
a pool fires no longer use; `airport_shots` looked for a free 6×4 on a 48-tile map the deputy now
covers completely; and a "frozen" screenshot was never reproducible because the street baker slices
by wall clock. **When a gate fails in a way that does not match the change, ask what its own fixture
looks like today** — print the thing it is searching for, not only the result.

**A conditional rule needs a conditional arm.** A 200-game sweep answers "did anything break across
every kind of city". It cannot answer "what is this worth" for a rule that only applies to some
worlds: era 26's bridge rule read FLAT over two hundred games and, measured per seed, fires in two
cities of twelve and gives those two a quarter of a city each. Record how often a rule fired, and
compare the cities where it fired against the same seeds with it off.

**A failure counter reads zero in a world with no subject in it.** `walkthrough` grew three
counters for crossings at H7 — refusals at the water's edge, legs abandoned there, steep refusals —
and at S13 all three read 0 because the played 96 contains no road tile on water at all (its river
is wider than `build.bridgeSpan` nearly everywhere). The gate was green about a thing that was not
there. Count the SUBJECT beside the failures (`1,356 steps over 15 legs on decks`, `4 road tiles
stand on water`), fail when the city has one and the walk never touched it, and put one in the
fixture deliberately if the city only sometimes grows one.

**A scripted city must read the result of its own commands.** S13 refused a road run spanning more
than six tiles of water; the middle row of seed 1003 crosses twenty-seven, so `budget_gate`,
`a11y_smoke`, `play_smoke` and `shoot.html` each laid NOTHING and reported numbers about brakes,
contrast and street mode. `apply()` returns a result. One command per CLEAR stretch, and check what
came back before measuring anything on it.

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

**And plant it on BOTH sides of any normaliser between the defect and the value the test reads.**
The 2026-10-06 round wrote the assertion S18's deck bullet had never had — `heightAt` sampled every
quarter tile across a crossing, bounded by `road.maxGrade` — and a 3 m staircase planted in
`pavableAt` left it green, because `gradeProfile` sits between the two and smooths whatever it is
handed. The same plant reddened the walker's test, so it was real; it simply could not reach this
one. Planting at the READER instead (`heightAt` answering from the tile rather than from the
profile, the pre-S13 shape) fired it at 2.481 m. Trace the path from the constant you corrupt to
the value the assertion reads, plant at the last step before the read as well as at the source, and
then write BOTH results into the test file — otherwise the next reader has to redo the experiment
to learn what the green means.

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

**An item's stated premise is a claim, not a fact.** K3 said "the wheel keeps the ground point
under the cursor fixed — it does today under perspective, assert it". It did not: zooming re-orbits
an unchanged target, so the point drifts toward the centre. Writing the assertion as instructed and
running it at the middle of the canvas would have produced a green test protecting nothing. **Check
the premise before writing the test that depends on it**, and when a behaviour is only correct at
one point of the screen, test it somewhere else.

**When a browser gesture misbehaves, log the event stream before re-reading the code.** K3's dolly
did nothing, with no error and no obviously wrong line. One instrumented run showed why: a second
mouse button pressed while one is held fires `pointermove`, not `pointerdown`, so the branch that
started the gesture was in a handler the browser never called. Inspection had not found it and
would not have.

**Deriving one thing from another drops whatever the source does not carry.** K1 made the help
card derive its camera rows from the camera table, which is right — and silently lost the `Space`
row, because pausing is not a camera movement and so has no entry in a table of camera movements.
When you replace a hand-written list with a derived one, **diff the two before deleting the old**:
what the list had and the source does not is either a bug in the source or a row that belongs
somewhere else.

**Run the omissions sweep AFTER a slice, on the slice.** The usual four directions look outward at
the project; the cheapest findings are the ones the slice just made — a table left behind when its
reader changed, CSS for an element that moved, a handler branch nothing can reach any more. And
make the sweep see same-file use: a first pass here reported a constant as unused that was read ten
lines below its own definition, and a sweep nobody trusts is worse than none.

**A value that depends on state must be recomputed where the state is READ, not where you happen
to change it.** Photo mode's near and far planes were chosen in `applyZoom` and re-chosen when a
flight crossed the height they change at — correct for a camera that is flown, stale for one that
is jumped, placed by a shot list, or put down by a gate. `budget_gate` set the eye at street level
directly and got the city's half-tile near plane, which clips the pavement. Moving the choice into
`applyPose` — which every path goes through — fixes it for paths that do not exist yet. Ask of any
derived value: **what are all the ways the thing it derives from can change?**

**An estimate has to price the frame the way the renderer draws it — and "the same modes" is part
of that.** F1 taught `lod.js`'s estimate to plan per chunk in every perspective mode; `instances.js`
does it only in `city`. In street mode the estimate then priced distant chunks cheaply, the ladder
stopped stepping down, and the street frame came back **empty** — a gate failure three files away
from the change. Two places asking one question now read one exported predicate. When you widen a
mode test, grep for every other place that asks about modes and decide each one deliberately.

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

**A fixture can hold a state the engine never makes.** S3a painted crossings where shop doors draw
people, by `occupancy`; its test gave a shop forty occupants and passed — and the engine fills
`occupancy` with residents, so every shop in a played city has none, and no crossing was painted at
any of them. Found when the next slice's shot tool asked the page for an occupied shop and got none
of forty. Before a rule keys on a state field, ask a played city what that field holds, and build
the fixture from what it says.

**A constraint moves an agent onto ground nothing has tested.** B9 kept the deputy's roads within
reach of its town and hopped a blocked deputy to one of its lots: the far bank became country and
every town became a mesh of empty streets, because random hops had almost always landed on fresh
ground and the randomness had been doing the protecting. The second cut then added two "fresh land"
rules AND a better hop target in one go, and **halved every city** (demanding 766 → 88). One probe
per rule, on 30 seeds against the old baseline, said the hop was the whole fix and both rules were
harmful — refusing zoned land alone halved the sweep, because crossing a zoned strip is how blocks
join into one network. Change WHERE the agent lands before adding rules about what it may do, and
A/B each rule alone before the 200-game sweep.

**A test written for a defect has to separate it from health.** That same cut came with "at most two
tiles in five inside the town are road". Measured afterwards on six seeds: the old deputy 41–45%,
the mesh 41–53%, the final rule 43–54%. It could not tell any of them apart — the mesh was empty
lots, not more road — so it was deleted rather than loosened. Measure the bad state AND the good one
before trusting a bound.

**A gate's proxy can lean on how the deputy plays.** `traffic_gate` held "congestion tracks
people-per-road" at r 0.55 for two eras and fell to 0.07 when B9 changed only the deputy. The old
deputy paved ~2,060 tiles in every game, so people-per-road was population over a constant. Four
probes ruled out the alternatives (spread, choke points, outliers) before the gate was touched, and
congestion against driving demand — cars × `state.traffic.averageCommute`, the engine's own routing
rather than the capped traffic layer — was 0.87 before and 0.92 after. When a change to the
INSTRUMENT turns a gate red, ask what the gate's measure divides by, and whether the old instrument
held it fixed. Add the direct measure beside the old ones; never quietly replace them.

**A fill that counts presence leaks while things move.** E7 topped each pavement up to its doors'
demand by counting who stood on it; a person who walked away left it looking empty and it spawned
again. B5's journeys made it obvious — 24 became 47 in a minute on the test town, 259 for about 90
on the played city's night. Count each agent against the source that asked for it, everywhere that
count is read, and write the invariant as a test over time.

**A tool that checks itself is a gate nobody runs.** Five picture tools — water, damage, services,
windows, rain — each count what they photographed and exit non-zero when the count is wrong, and
none of them was in a gate set: they were run by hand in the slice that wrote them and never again.
`gates.mjs shots` ran all five in 166 s, and six with T1b's `avenue_shots` in 306 s of a 360 s
budget — the next picture tool has to earn its place or the set needs splitting. When a slice
writes a tool that can fail, ask what runs it next month.

**Measure the baseline before judging a correction by the residual.** P89 added the overlay's
missing term and the estimate went from 1,339 UNDER to 1,553 OVER, which reads as a correction
that made things worse — until the arm with the overlay OFF showed the estimate was already 1,553
over on that frame and the 1,339 under WAS the missing term. A residual is a difference of two
numbers and says nothing about either.

**And check the path your term actually travels.** `estimate` splits per chunk under perspective
(V5), so a term added only to the top-level counts is priced in the orthographic path and nowhere
a city camera looks. Terrain, street chunks and the overlay marks are whole-frame terms and go in
once; everything else is per chunk.

**Every instanced POOL the renderer makes needs a term in the estimate — check after any slice
that adds one.** `test/lod.test.js` does the scan now: every `make("…")` against the cost table,
refusing one that is neither priced nor on `UNPRICED_POOLS` with a reason saying how its triangles
reach the estimate another way. The check exists because this was found by hand twice. Four times now: P35's road that had become a box, V5's per-chunk plan, V5's
frustum wedge, and T2/T3's three pools (the L2 rail line's hub and arm, and the train's carriages)
with no term at all. The same sweep found that B3b's service vehicles have never been counted
either — they are pushed into the CAR pools and `counts.cars` was `traffic.count(bounds)` alone.
The check is a grep: every `make("name", …)` in `instances.js` against the cost table in `lod.js`.
An under-estimate is the dangerous direction, because the render-and-measure loop only steps down.

**A measurement is not an assertion.** A82's whole value was an invariant — the deputy's rolls do
not move when the world's PRNG does — proved by two arms that used to be byte-identical and a term
sweep that became monotonic. None of that is a test anybody runs again. When a slice's result is a
PROPERTY, write the property down: here, advance `state.rng` a hundred times and assert the
deputy's rolls are unchanged, then assert fifty deputy draws leave `state.rng` where it was.

**And read the object before comparing it.** That second assertion compared
`[rng.a, rng.b, rng.c, rng.d]` before and after — four `undefined`s against four `undefined`s,
because this xorshift32 keeps its state in `rng.s`. It passed with the defect planted. Assert the
field exists (`typeof before === "number"`) before you assert it did not change, and plant the
defect to see the test fire.

**A dead field spreads, so the allow-list has to name the buildings as well as the field.** P79's
check refused a new unread field and let `landValueBonus` reach two more buildings the same day it
was filed — a field nothing reads looks exactly like a rule somebody implemented, so the next
slice copies it. The entry carries `on: [...]` now.

**And a data file that names a key in ANOTHER data file by string is a rename away from silence.**
`needsBody: "marinaMinBody"` resolves to `undefined`, `size < undefined` is `false`, and the rule
stops refusing anything instead of breaking. Assert the indirection resolves.

**Grep every field of a data file for a reader, not just every key of the file.** The third
direction usually asks "does anything read this BLOCK"; T2's round asked it per FIELD and found
two that nothing reads — `landValueBonus` on the park (its whole purpose; the amenity effect
comes only from its negative pollution) and `storage` on the water tower. Both had been there
since the catalogue was written, and T2 had just copied one of them onto a new building, which is
how a dead field spreads. `test/utilities.test.js` now refuses a new one without a written
reason, in the shape `SAME_IN_BOTH` uses for the Norwegian catalogue: an allow-list where every
entry says why.

**And the sweep's third direction catches your own hour-old work.** P75 found a `rain` block in
`data/cityviewer.json` and its config mirror that nothing read any more — B6a had removed the pool
that read it the same session — plus an `idle` field on B3b's service kinds that nothing ever
looked at. Run `grep -o '"[a-zA-Z]*"' data/*.json | sort -u` against the readers after every slice
that removes code, not only after ones that add it.

**A hazard needs somebody who can answer it — and in a headless city that is the deputy.** B1a made
fire spread where no station is in range, and the first sweep row collapsed: the deputy has never
built a fire station, so no gate city in this project has ever had a fire service. The same slice's
omissions sweep found that nothing had ever cleared a ruin either (`clearRuin` has no caller;
bulldozing is the player's command), leaving 36 dead tiles per city. Before measuring a new threat,
ask whether the deputy can prevent it, respond to it and clean up after it — a repair function with
no importer is the shape of the gap.

**A per-tile quantity cannot describe a feature one tile wide.** Water depth was per tile and zero
for any tile touching land, so a river two tiles wide had no bed and was drawn as a blue strip at the
height of its banks; the first replacement field was per tile CORNER and read zero down a one-tile
channel for the same reason, since every one of those corners touches dry land (S4). Ask how narrow
the thing gets before choosing the lattice, and test the narrow case — the wide one passes either way.

**A shot probe has to sample the subject, not near it.** `water_shots.mjs` measured "the bank" 0.6 of
a tile from the channel's MIDDLE, which on the ten-tile river it had just found is open water, and
failed three perfectly good pictures with "the bank is 0.4 m under the water". The instrument was
wrong, not the slice.

**A percentile of eighteen samples is the maximum.** A78's bake check took a p95 over eighteen
chunks' worst frames, and the nearest-rank p95 of eighteen is the eighteenth: one stall failed it,
which was the very thing A78 set out to end. Before trusting a percentile, count what it is over.

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

**Commits**
- **Is the work in the history?** Not a tidiness question: a bad `git checkout --`, a crash or a
  reviewer's own worktree habit loses whatever is only in the tree, and `main` cannot be
  fast-forwarded to a tree that is not in the history. The X4 review's most expensive finding was
  not in the code — seventy-one files and fourteen dev-log entries, two days after the last commit.
  `tools/gates.mjs` now prints `UNCOMMITTED: n dev-log entries are in the tree and not in HEAD`
  whenever more than one is, so the cheapest version of this check runs on every gate run.
- One commit per slice, in the order the dev-log entries were written, and the fixture re-pin in the
  commit whose `why` names it. Reconstructing that later is possible — attribute each block of lines
  to the slice its comments cite — but it is approximate, and entries that edit the same files
  cannot be separated at all.
- Is `RELEASE.md` within `STALE_AT` of HEAD? `test/docs.test.js` fails past fifty commits of drift,
  which is a suite that goes red for a doc — deliberately, because a release page describing a
  commit 129 behind is worse than no page.

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

**A test written as a transcription of a line protects whatever the line got wrong.**
`test/render.test.js` asserted the source matched `life: stillness ? false : options.life` — the
exact text of a defect that had `?life=0`, the quality tier, the projection and the hour all
falling back to defaults at boot, because `options` there is the world-generation record and never
carried a preference. The suite had been green over it since R2. When a source-text assertion is
the only instrument available (a module node cannot import), **assert the thing the line has to be
true ABOUT** — the object the value comes from, the other fields that must come from the same
place — not the characters it happens to be spelled with today. K3 (part two).

**A bare call to a name nothing defines is invisible to the suite.** `hideGhost()` where the name
is `renderer.hideGhost` — a `ReferenceError` every time the hand went down, in a module node cannot
import, past a `node --check` that only reads syntax. The browser gate's `pageerror` hook is what
said it out loud. Three of these now (`loadSettings` in R2, `viewport` in `play_smoke`, this):
**hook `pageerror` in every browser gate and treat one as a failure**, because for renderer-side
and DOM-side modules it is the only linter the project has.

**Playwright cannot drive a page that holds the pointer.** With Pointer Lock granted,
`locator.boundingBox()` resolves the element, calls it visible, and never returns — twice for
fifteen minutes, in a section of the gate nowhere near the change. Keep the lock out of the rows
that click, give the locked path a pass of its own, and read geometry with
`page.evaluate(() => el.getBoundingClientRect())` when in doubt. K3/A58.

**Turning a per-press control into a per-second one kills the single press.** A rate multiplied by
the milliseconds between `keydown` and `keyup` is zero, so the key that used to nudge now moves
nothing and reads as broken. Give the press a floor in seconds and let the hold continue from it
(`TAP_SECONDS`, K2), and keep a gate that presses the key exactly once — `a11y_smoke` does, and it
is the only check that would have noticed.

**A gate's number can get worse because the thing got better.** S1 gave twelve civic definitions
their own footprints, most of them smaller than the generic box they replaced, so more ground
became visible — and `a11y_smoke`'s overlay-band separation fell from 31 to 29 against its floor of
30, because the fifth percentile of a sample that GREW at the dark end is not the same measurement.
Establish the before properly first: stash the WHOLE tree, not one directory, or the run you
compare against is a broken import. Then ask which way the cause points, and if the statistic moves
with sample size, assert the stable half too (the median) and keep the tail as a floor.

**A pure module in `client/world/` decides; the two renderers draw.** S1 and B2 are the same shape
as `buttons.js`, `held.js` and `house-spec.js` before them: the judgement ("below 40 a window is
boarded", "a coal plant is a hall and two stacks") goes where node can test it, and the instanced
box and the baked facade both read it. That is what makes the L2/L3 agreement (E5) true by
construction rather than by vigilance — and it is the only way anything in the renderer gets a
unit test at all.

**Prove which path drew it before changing the one you assume.** S1b's materials were built, tested
and correct in node while every screenshot stayed grey. A magenta test colour changed nothing (the
branch that reads the palette was never entered), and doubling the baked geometry changed nothing —
what settled it in one run was turning the SUSPECTED pass off and watching the building vanish. The
cause was that the chunk the camera stands in fails a centre-and-corners visibility test, so the
nearest buildings had been instanced boxes in every street-level shot the project has taken.

**And when a "3 live" style number cannot answer the question you are asking, make it answer.** The
street cache reported how many chunks were live and not WHICH; the whole investigation was "is the
building in front of me one of the three".

**A review finding's premise is a claim, and claims are checkable.** The X4 review read
`room_smoke` as being paid for twice in `gates.mjs all` because it is in two sets. `SETS.all` has
deduped since the day it was written, and `--list` already printed each gate once — so one third of
that item was work that did not exist, and acting on it without reading the code would have
produced a change with a false reason attached to it. The budget half of the same finding was real
(`quick` at 578 s of 540 with an 81 s smoke in it). **Read the code for every finding you did not
measure yourself, including your own from last week, and say which half was wrong.** Same shape as
[[an-item-outlives-its-implementation]] from the other direction: there, the docs were stale about
the code; here, a review was.
