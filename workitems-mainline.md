# mainline — work items

*Written 2026-09-06, brought current 2026-09-07: the cityviewer lane finished at `ed96699` and
its last review left two short slices, **R4** and **T1** (`workitems-cityviewer.md` §2f) — do
those first, then this lane. The branch, the gates and the release: what has to happen before
`dev_night` is the game rather than a branch of it. Do this lane **first** after R4, because everything else — the measurements, the
film, the worker — should land on `main`. Same rules as the cityviewer hand-off §0: slice
workflow, tests first, green twice, a dev-log entry with numbers, commit as `slice-<id>` only
when asked.*

## M1 — Merge `dev_night` into `main` (S, needs Kjell) — **done 2026-09-08; pushed**

`main` fast-forwarded from `491f9bf` to `9339ba4`: 55 commits, no squash, no rebase, no merge
commit. `slice-E0` is `04bc793` and `slice-V8`, `slice-R4` and `slice-T1` are all in the history.
`./test.sh` green twice on the merged tree and `gates.mjs quick` **380 s of 480**, no leaked
browsers. **Kjell pushed it on 2026-09-08 (P57).** The item is closed.

**Goal.** `main` is `dev_night`. Nothing is rewritten, nothing is squashed: the per-slice
history is the project's memory and the dev-log cites SHAs.

**Do.**
- `git checkout main && git merge --ff-only dev_night`. It must fast-forward: `main` has had no
  commit of its own since `491f9bf`. If it does not, stop and say so — something landed on
  `main` that nobody knows about.
- Push both. Delete nothing; `dev_night` stays as the working branch or is recreated from
  `main`, Kjell's choice.
- `test/docs.test.js` "the local documents stay out of git" and the precache test run on the
  merged tree.

**Gate.** `./test.sh` twice on `main`; `node tools/gates.mjs quick` (M2) green; `git log
--oneline main | head -3` in the dev-log.

**Review will check:** no squash, no rebase, `main`'s SHA for `slice-E0` is `04bc793`, and
`slice-V8` (`2544c08`), `slice-R4` and `slice-T1` are all in `main`'s history.

## M2 — A gate runner with a time budget (S) — **done 2026-09-08 as `slice-M2`**

**Measured.** `quick` **375 s** over 12 gates (budget_gate 102, ui_smoke 66, a11y_smoke 45),
`render` **3 s** over 3. The item guessed `quick ≤ 5 min` and `render ≤ 15`; the budgets in the
file are the measurement plus room. `test/gates.test.js` fails if a gate file is in no set, if a
set names a gate that does not exist, if `all` is not the union, if a set has no budget, or if
the README stops naming the runner. The `quick` set leaked no browsers, which narrows the V8
review's three stray chromium trees to a FAILURE path.

**Goal.** One command runs the gates a slice needs, and the full set has a known cost.

*Sets as they stand (B3a, 2026-09-24): `quick` 11 browser smokes (394 s of 480), `render`
walkthrough + passability + lanes_dump (55 s of 120), **`budget` on its own** (231 s of 360), `sim`
the three soaks (541 s of 900). `budget_gate` left `quick` in K1 (A64) and left `render` in B3a,
both times because the set reached its budget — which is the rule below working, not failing.*

**Do.**
- `tools/gates.mjs [quick|render|sim|all]`: `quick` is the ten browser smokes (`a11y`, `client`,
  `lobby`, `offline`, `play`, `reach`, `save`, `serve`, `ui`, `update`) plus `budget_gate`; `render`
  adds `walkthrough`, `passability`, `lanes_dump`, `style-sheet`;
  `sim` is the soaks (`disaster_soak`, `traffic_gate`, `sim_sweep`); `all` is everything. Each
  gate's wall time is printed and written to `reports/gates-<date>.json`.
- A budget per set in the file header, from the first measured run: `quick` ≤ 5 min, `render` ≤
  15 min. A gate that grows past its share is a finding, not a fact of life — `walkthrough`
  walks 161 km today and `passability` samples 32,000 points; both can sample. The reviewer's
  serial run of the suite plus seven gates on 2026-09-07 took about six minutes on SwiftShader,
  `play_smoke` the longest; that is the first era for the budget.
- Every gate closes its browser in a `finally`: three headless-chromium trees from 2026-09-06
  were still alive during the V8 review, which means some gate's failure path leaks one. The
  runner reports leftover `chrome-headless-shell` processes after a set.
- `README.md`'s gate list is replaced by the runner's sets, and names every gate that exists
  (it does not name `walkthrough`, `passability`, `lanes_dump` or the budget gate's flags
  today).
- The slice-workflow skill's step 5 says which set a slice runs: renderer slices `render`,
  gameplay slices `sim`, everything `quick`.

**Tests.** `tools/gates.mjs --list` prints every gate file under `tools/` that ends in
`_smoke.mjs`, `_gate.mjs` or is named in the sets, and a test fails if a gate file exists that
no set names.

**Done when** `node tools/gates.mjs quick` is green on `main` and its time is in the dev-log.

## M3 — The release checklist (S) — **done 2026-09-08 as `slice-M3`**

`RELEASE.md` at `36aeefb`: era 1, the tier table, the three gate sets and their measured times,
a frame at High, and what is known to be missing. `test/docs.test.js` gains five checks — the
SHA is a real commit, the drift from `HEAD` is a printed NOTE rather than a failure (as the item
asked), the tier budgets come from `data/cityviewer.json`, and the open-question count has to
equal `dev-questions.md`'s. `plan-v1.md`'s Progress rewritten; `specs/plan.md` §6 and §9 pointed
at it.

**Goal.** A page that says what the game is at this commit, for a player and for the next
developer.

**Do.**
- `RELEASE.md` at the root: the commit, the era, the tier table, the gates that were green
  and their times, what is known to be missing (from `dev-questions.md` open list and the
  omissions pass in `workitems-cityviewer.md` §2e), and how to run it (`./run.sh`).
- `plan-v1.md` "Progress" paragraph rewritten for the merged state: Waves 0–4 and cityviewer
  complete, Wave 5 still gated on playtest acceptance (ruling 003), and the lanes that follow
  (`workitems-measurement.md`, `workitems-film.md`, `workitems-worker.md`).
- `specs/plan.md` §6 and §9 (milestones) get a two-line pointer each rather than a rewrite.

**Done when** `test/docs.test.js` requires `RELEASE.md` and its commit matches `git rev-parse
HEAD` at the time of the release commit (a test that reads the file's SHA and warns, not fails,
when it is stale).

## M4 — The Norwegian pass (S, Kjell reviews) — **done 2026-09-08; Kjell passed the table**

`node tools/i18n_review.mjs` writes `reports/i18n-review.md` — 414 strings with the English, the
Norwegian and the slice that added them (280 from the initial commit, 67 from 0.1, 21 from N21,
the rest across ten more). Kjell edits the Norsk column; `--apply` writes it back and refuses the
whole file rather than applying the rows it could parse. `test/i18n.test.js` holds the other
half: no Norwegian value may equal its English except on an allow-list with a reason each (10
entries, all genuine), and two more checks keep that list from rotting. It also found something
nothing was watching — `data/names.json`'s shop names, which are outside the catalogue entirely.

**Closed 2026-09-08 (P57).** Kjell read the 414 strings and passed them with no corrections, so
A21's "drafted, not reviewed" note is closed and the catalogue is a reviewed translation. The tool
stays, because the next string a slice adds is a draft again — regenerate and re-read the diff.

**Goal.** Every string a Norwegian player reads has been read by a Norwegian.

**Do.**
- A single Markdown table, generated by `tools/i18n_review.mjs`, with every key, the English,
  the Norwegian, and the slice that added it — including the shop names R2 added to
  `data/names.json` (A40) and the street-mode strings E4 added. Kjell marks changes in the
  table; the tool writes them back.
- `test/i18n.test.js` already holds key parity; it gains a check that no `no` value is
  byte-identical to its `en` value except on an allow-list (proper nouns).

**Done when** Kjell has returned the table once and A21's "drafted, not reviewed" note in
`dev-questions.md` is closed.

## M5 — Review fixes after the measurement lane (S) — **done 2026-09-09 as `slice-M5`**

Small, and each names its test. Commit as `slice-M5`.

1. **`traffic.busyAt` answers for the corridor, not the node.** `client/life/traffic.js` walks
   both block links of the corridor and ignores `node`, so a car within the gap of the FAR end —
   already past this crossing — holds the pedestrians at it. Filter on `link.to === node`. Test in
   `test/cars.test.js`: a car near the far end of a corridor leaves the near crossing open, and one
   near the near end closes it. `test/pedestrians.test.js`: the same through `setTraffic`.
2. **Untrack the reviewer's scratch and the tmp captures.** `git rm --cached reports/review3-*.log
   reports/tmp/`, and `.gitignore` gains `reports/review*.log` and `reports/tmp/`. `test/docs.test.js`
   "the local documents stay out of git" gains both patterns.
3. **`RELEASE.md` brought to D5's era**: the frame-at-High sentence names its view (`budget_gate`'s
   street-zoom night row, 289,446) beside D5's `city 40t` night (130,936, the same as day); the
   model rebuild line carries D6's three maps (53.3 / 68.3 / 184.7 ms); the commit line says how
   far `main` is behind and stops saying "one slice". The docs test's drift note is the reminder.
4. **`main` is two docs commits behind `dev_night`.** Kjell's push, or a note in `RELEASE.md` that
   `main` is the release and `dev_night` carries the docs since — say which.

**Done when** the busy-crossing test discriminates (plant the `void node` back and watch it fail),
`git ls-files reports/` lists no log and no `tmp/`, and the docs test is green.

**Done, all four.** `busyAt` filters on `link.to === node`; the discriminating test is the one that
parks every car midway and then brings one to a single stop line — put `void node` back and only
the far-end assertion fails. The scratch is untracked and `.gitignore` and `test/docs.test.js`
guard it **by pattern**, because the next round writes `review4-`. `RELEASE.md` now names which
view each frame number belongs to (`budget_gate`'s street-zoom night 289,446 beside D5's `city 40t`
night 130,936, equal to its own day frame) and carries D6's three rebuild times. `main` is three
commits behind and all three are documents, which the page says rather than the push fixing.
`lanes_dump` unchanged at 400 cars, 76% moving — `busyAt` has one reader and it is the crowd.

## M6 — The tidy-up the omissions sweep asked for (S) — **done 2026-09-24 as `slice-M6`**

*Three decisions, all "remove it and say so" rather than "leave it as a promise": there is **no
save-slot delete** — a slot is freed by saving over it, and the save bar is four buttons a playtest
already called crowded (N24); **`clearRuin` is gone** — clearing a ruin is the bulldoze command's
job, which is what B1a's deputy issues; **`setLocale` is gone** — `loadLocale` sets the active
catalogue itself. Each place carries the reason where the next reader will look.*

**Goal.** Three things the export sweep turned up, one of which is a capability with no control.

**Do.**
- **A save slot cannot be deleted.** `deleteSave(slot)` in `client/storage/db.js` has no caller and
  nothing in the interface offers it: three manual slots, and the only way past a full one is to
  overwrite it. By ruling 026's standard that is a capability with no control. Either give the save
  panel a delete (with a confirm, and a `save_smoke` row that drives it) or delete the function and
  say in `saves.js` that overwriting is the only way — a decision, either way, not an omission.
- **`clearRuin` in `engine/fire.js` has no caller.** Clearing a ruin is what the player's bulldoze
  does inline (`build-commands.js`), so the rule exists twice and only one copy is reachable. B1a's
  deputy uses the command, not this. Delete it, or make bulldoze call it so there is one copy.
- **`setLocale` in `client/i18n.js` is redundant** with `loadLocale`, which sets the active
  catalogue itself. Nothing calls it.

**Tests first.** Whatever the save decision is, `test/reachability.test.js` or `save_smoke` has to
be able to see it — a control that exists and a function that does not, or neither.
**Gate.** `node --test test/omissions.test.js test/reachability.test.js`, and the export sweep in
the review-round skill comes back without these three.

## M7 — The release, again (S, needs Kjell for the push) — review of 2026-10-04

**Goal.** `main` is the game and `RELEASE.md` is true. Neither is, by 122 commits and twenty-five
balance eras: the page names `782e759` from 2026-09-08 and says every commit since is a document.

**Do.**
- `RELEASE.md` rewritten at the head of `dev_night`: the era (26) and its report, the tier table
  with High at 400,000, the gate sets as they are now (eleven sets — `quick`, `budget`, `shots`,
  `transport`, `kits`, `film`, `render`, `sim`) with their measured times, what works (transport,
  gates and the Outside, ranks, leisure and education, the worker), and what is missing (a phone
  card; Wave 5; W6's stall — **58.9 ms warm**, not the 115 ms the page will want to copy: that was
  `createModel` timed cold beside an unwarmed nav graph, and `deriveLanes` is now the 27 ms the dirty
  set is for).
- `git checkout main && git merge --ff-only dev_night`, the suite twice and `gates.mjs all` on the
  merged tree, the three newest commits in the dev-log. **The push is Kjell's.**
- `test/docs.test.js`'s drift note becomes a failure past fifty commits: a release page a hundred
  commits stale is not a note.
- `REQUIRED_DOCS` in the same test names seven lane files and misses three that exist —
  `workitems-transport.md`, `workitems-rules.md`, `workitems-multiplayer.md` — and
  `specs/transport-and-landmarks.md`. A plan nothing points at quietly stops being true; add them.

**Done when** `main` is `dev_night`, the page names its own commit, and Kjell has pushed.

## M11 — "1 tiles" (S, i18n) — found in X3b, 2026-10-08

**Goal.** A sentence with a number in it reads correctly at every number.

**Analysis.** The catalogue has **no plural machinery**: `t(key, values)` does a
`{token}` substitution and nothing else, so `"hud.residents": "{count} residents"` says *"1
residents"* and has since slice 4.1. X3b put the same shape into a sentence a player reads **at a
decision point** — *"Ask them to clear 1 tiles?"* — which is where it stops being a blemish and
starts being sloppiness the player is asked to act on. Two keys fixed those two sentences
(`ask.what.one`, `inbox.waiting.demolition.one`, and the sent form), chosen in the model so the rule
is tested; that is deliberately **not** a plural system, because a second rule for the rest of the
game to disagree with is worse than two strings.

**Known instances**, from a grep for `{count}` and `{tiles}` in `data/i18n/en.json`: `hud.residents`
and whatever else carries a bare count — the sweep is part of the item, because the two found in
X3b were found by reading a screenshot rather than by looking.

**The decision is which way to go**, and it is small either way: (a) a `plural(key, n)` helper that
picks `key` or `key.one`, so a string with a count has at most two forms and Norwegian's rules
(which match English's for 1 vs many) are satisfied; or (b) phrase every counted sentence so the
number sits apart from the noun — *"Residents: 1"* — which needs no machinery and changes the tone
of several screens. (a) is the smaller change and the one X3b has already half-built.

**Tests first.** `test/i18n.test.js`: every key whose English contains `{count}` or `{tiles}` has a
`.one` form in both catalogues, or is listed with a reason. That is the shape this project uses for
every other catalogue rule, and it is what stops the next counted string shipping without one.

## M10 — The three skins, and whether the classic one is the right classic (S) — P108, 2026-10-07 — **closed 2026-10-08 (A137): `retro` stays as built**

**Goal.** Kjell looks at the three and says which is wrong.

**What already exists, checked rather than assumed.** P29 ordered three skins and N24 built them:
`clean` ("Modern clean"), `retro` and `dark`, in `client/ui/skins.js`, offered in the settings panel
under **Interface style**, applied as `data-skin` on `<html>`, and defined entirely as CSS custom
properties in `client/style.css` — chrome only, because P29's own answer was that the world keeps
`plain` and ruling 022 stands. `a11y_smoke` proves each one **repaints**: it samples computed
colours off the bottom bar and a tool button and refuses two skins that come out identical. So
P108's A, B and C map onto `retro`, `clean` and `dark` as built.

**What P108 changes.** The reference for the classic one. P29 said *"Retro like simcity 1"* and the
stylesheet's comment says so too — *"SimCity 1 had no rounded corners and no soft shadows; it had
bevels"*. P108 says **SimCity 2000, greyish**, which is a different machine's look: heavier grey
panels, chunkier bevels, and a chrome that frames the map rather than floating over it. The current
`retro` is `--bg: #b8bcc4` with 2 px outset borders and square corners — the right family, and
nobody has ever checked it against the thing it is now named after.

**What was missing, and is the finding.** **Nobody has looked at any of them.**
`specs/art-direction.md` shows `clean` and does not mention the other two; there was no screenshot
of `retro` or `dark` anywhere in `reports/`; and a computed-colour check is exactly the "measuring
the part instead of the whole" the a11y gate's own comment warns about — three skins can all repaint
and two of them still be ugly. A green suite says nothing about what the game looks like
(ruling 030), and the only instrument is a picture somebody opens.

**Built 2026-10-07:** `tools/skin_shots.mjs`, in the `shots` set. One played city, one camera, one
hour, three files — the only thing that differs between the frames is the attribute on `<html>`,
because three shots of three cities would compare the cities. It checks its own instrument first
(three different paints, `clean` sets no attribute at all) and prints what is behind the chrome, and
its last line says the quiet part: *now open them.* `reports/skin-{clean,retro,dark}.png`.

**Two things its own first runs found, both written into the file:** it shot a bare field, because
nothing builds itself in singleplayer and six hundred ticks of an empty map is chrome over grass;
and the streets it then laid were followed by six `invalid`s, because it had invented a
`zoneResidential` command — the real one is `paintZone` with a `zone` number. The zoned land still
does not GROW, which needs power and water, so that number is printed rather than gated: what this
gate photographs is the chrome.

**Still to do.** (1) Kjell opens the three and says whether `retro` is the SimCity 2000 grey he
means — **Q159**. (2) The camera is wherever the page left it, so the town the tool builds is in the
minimap and not in frame; aim it (the `aim.mjs` pattern) if the pictures are to show chrome over a
CITY. (3) `specs/art-direction.md` gains a skins section whatever the answer is: three looks that
exist and are not in the art document are three looks nothing re-derives.

## M9 — The `quick` set starves its own gates (S, measurement) — found 2026-10-07

**Goal.** A gate set that fails tells you about the code.

**Measured, 2026-10-07:** `node tools/gates.mjs quick` took **986 s against its 540 s budget** and
reported five failures. Run one at a time afterwards, `update_smoke` and `play_smoke` were **green**
— they had failed on timing assumptions (`globalThis.CITY` not yet defined; "W flies the photo
camera, moved 0.000 tiles in 0.4 s"; two arms a single tick apart at 202 vs 201) while thirteen
gates and two browsers fought over twenty cores. `worker_smoke` is green alone too. The slowest
three are `ui_smoke` 301 s, `play_smoke` 175 s, `lobby_smoke` 113 s; the budget was restated from
the set's CONTENTS at P96 and has never been re-measured since the set grew.

**This is the project's own instrument-shares-a-budget lesson, one level up.** A set that takes
twice its budget starves the gates inside it, and a flake reported as a failure costs the next
reader the hour it takes to prove it was the machine — which is the hour this finding cost.

**Do.**
- Re-measure the budget from a run, per gate, and write the per-gate numbers beside the total so
  the next overrun names which gate grew.
- Give the three slow ones a hard look: `ui_smoke` at 301 s is half the budget on its own and it
  drives every overlay at every tier, which is a `render`-set shape rather than a `quick` one.
- Make a timing assumption impossible to write: the gates that flaked both read a global without
  waiting for it. `tools/lib/settle.mjs` exists; `room_smoke`'s `until(page, why, read)` prints the
  last value it saw when it gives up, which is the shape worth sharing.
- Consider splitting: the browser smokes that must stay cheap, and a `pages` set for the long ones.

**Two of its named failures are FIXED (2026-10-07)** — both were instruments rather than defects,
and both are now gates that cannot race: `lobby_smoke` waits for the label to change instead of
reading on the next line, and `ui_smoke` waits for the fade to arrive instead of sampling it two
frames in (the fade's SHAPE is proved in node, where the clock is an argument). What is left of this
item is the budget itself. The history:

**Two failures that are NOT load, measured against a `before` worktree at `1f13ee7`:**
`ui_smoke`'s "the hour changes over a second, not in a frame (night is 1)" fails identically on the
parent commit, so it is pre-existing. The check reads `renderer.night` two animation frames after
choosing night and asks for a value strictly between 0 and 1, while `dt` is `frameMs / 1000` and
uncapped — under SwiftShader two frames can be most of a second and the fade is simply over. The
fade is right; the instrument samples it at a moment it does not control. Either cap the sampled
`dt`, drive the fade a known number of milliseconds, or assert the fade's SHAPE over several frames
rather than its value at one. `lobby_smoke`'s "the panel restates itself in the new language
(Done → Done)" failed identically there as well, on both viewports — and then **passed** on a
later run of the same code, so it is flaky rather than broken: the catalogues are right
(`settings.close` is "Done" / "Ferdig") and the gate clicks the locale row and reads
`.settings-close` on the next line with nothing in between. Both want the same fix as each other —
wait for the effect, or assert it over a span you control — and `worker_smoke`'s one-tick arms
(202 vs 201) are a third of the same kind.

**One of the four is already paid for (X5 item 2, 2026-10-08).** `room_smoke` left `quick` for
`room`: five browsers against a real `ws` server and a room pumped for city years is **81 s**, and
M2's rule is split rather than raise. That takes the set's measured 578 s to about **497 s of 540**
— which is the first time in three re-measurements that `quick` has been inside its budget without
the budget moving. `test/gates.test.js`'s `NOT_IN_QUICK` keeps the exception honest: a smoke excused
from `quick` must say what it costs and must be in some other set.

**`sim` IS over budget, measured quiet: 982 s of 900** (2026-10-08, era 30). `sim_sweep` 628 s,
`traffic_gate` 204 s, `disaster_soak` 150 s. Two candidate causes and this is the item that has to
separate them: era 29's cities are bigger (B14 bought 7% more people) and era 30 added a monthly
pass — the quests — to every one of the 200 × 25-year games. The arms for era 30 were measured with
`QUESTS=0` and without, so the comparison is a re-run of two files that already exist.

**The earlier reading of the same number, and why it could not be used.** In the same `all`
run `sim_sweep` read **604 s** against the 439 s M2 measured, which would put `sim` at about 905 s
of an 845 s budget. **That reading is contended**: a 1,956-test node suite was running beside it,
and a browser gate later in the same run went red for the same reason and was identical when run
alone. It is recorded here as a thing to MEASURE, not as a measurement — this item's own rule is
one set at a time on a quiet machine. What is worth expecting is the direction: B14 (era 29) changed
what the deputy paves, so the sweep's 200 games are bigger cities for 25 years, and a set's budget
is a measurement of a city that every balance era rebuilds. The re-measurement M9 asks for is
therefore a table per set, taken quiet, not a number for `quick`.

**Done when** `quick` and `sim` each fit their stated budget on this machine twice running, the
budgets are a measurement with a date and a per-gate table rather than a prediction, and neither of
those two checks depends on when a frame happened to land.

## M8 — The renderer's numbers are a mirror with no loader (S) — **BUILT 2026-10-05** as `slice-M8`

*As built: `loadRuleset` takes three files, and `["cityviewer.json", setConfig, "cityviewer"]` sits
beside the other two. `test/content.test.js` has the pair the other two already had — a doctored
`road.width` of 99 reaches `getConfig()`, and a file that will not load leaves the mirror standing
and says which file it was. The item's last worry — a shot tool calling `setConfig(DEFAULTS)` by
hand would run different numbers from the page — is closed by `test/world.test.js`'s drift
assertion, which is a strict `deepEqual` between `DEFAULTS` and the file, so the mirror IS the
file's numbers or the suite is red.*

**The review round of 2026-10-06 reported this item as open and was wrong**: the grep behind the
claim looked for `setConfig(` and the call site passes the function by reference
(`["cityviewer.json", setConfig, …]`), while the import line was filtered out by the same command's
`grep -v world/config.js`. The item itself had never been ticked, which is what made the wrong
answer survive a reading. Checking the tick against the code is the point of the ritual's step 2.

## M8 — the item as written, 2026-10-05

**Goal.** Editing `data/cityviewer.json` changes the game.

**Analysis.** It does not. `client/content.js` loads `balance.json` and `buildings.json` — P90's
slice, which found exactly this for the engine's rules — and **nothing loads `cityviewer.json**.
The renderer runs on `client/world/config.js`'s `DEFAULTS`, and `test/world.test.js` keeps the two
identical, which is what makes the situation survivable and what hides it: S15's first two attempts
edited the file, changed nothing on screen, and would have turned the suite red for drift rather
than for being ignored. CLAUDE.md's own rule — "numbers live in `data/*.json`, never in engine
code" — is false for every renderer number today.

**Do.** `loadRuleset` gains a third file and calls `setConfig(loaded)`, exactly as it calls
`setRules` and `setCatalogue`; the mirror stays as the FALLBACK and the drift test stays as the
thing that keeps it honest. The worker needs nothing (it does not render), but `client/content.js`'s
`contentForWorker` and the shot tools' `setConfig(DEFAULTS)` should be checked: a tool that sets the
mirror by hand would then be running different numbers from the page, which is the drift this fixes
pointed the other way.

**Tests first.** `test/content.test.js`: a loaded cityviewer config reaches `getConfig()`; a failed
fetch leaves the mirror in place and says so. **Gate.** `client_smoke` and one `budget_gate` row,
because a config that arrives after the first frame would move what the first frame measured.

## Order

**Where this lane stands, 2026-10-08.** M1–M6 and M8 are built; `main` is the game and was pushed
on 2026-09-08. What is open: **M7** (the release again, and a merge — `main` is well behind, and
the push is Kjell's), **M9** (the `quick` gate set takes 986 s against a 540 s budget and starves
its own gates; two of its named failures are fixed, the budget itself is not), **M10** (the three
interface skins exist and nobody has looked at them — **Q159**, answered as **A137**: `retro` stays
as built, so M10 is **closed**), and **M11** ("1 tiles": the catalogue has no plural machinery at
all).

**M7 is the one with a date on it now.** `main` is 54 commits behind as of 2026-10-08, and the whole
multiplayer lane is on `dev_night`. `RELEASE.md` was re-measured at `7d3dbde` in the same round, so
what M7 needs is the merge and the push — and the release gate for the multiplayer lane (eight
clients, one real evening) is a different claim from the suite being green.

R4 → T1 (both cityviewer §2f) → M2 → M1 → M3 → M4. The fix slice and the signal slice before anything merges; the runner first so the merge is gated by one command; the checklist after
the merge because it names the SHA; the Norwegian pass whenever Kjell has an hour.

**This lane is finished.** R4, T1, M2, M3, M4 done on 2026-09-08, M1 merged **and pushed** (P57),
A21 closed, and **M5 done on 2026-09-09** — the four fixes the review after D5 asked for. Nothing
is outstanding here. What follows is `workitems-measurement.md` D7.

What came next was `workitems-measurement.md`, and its first item found what this lane could not:
the frame-time governor, running on a real device for the first time, was giving up its entire
ladder on an RTX 4090 at a locked 60 fps (D2/D5).
