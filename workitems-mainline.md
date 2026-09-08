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

## Order

R4 → T1 (both cityviewer §2f) → M2 → M1 → M3 → M4. The fix slice and the signal slice before anything merges; the runner first so the merge is gated by one command; the checklist after
the merge because it names the SHA; the Norwegian pass whenever Kjell has an hour.

**This lane is finished, 2026-09-08.** R4, T1, M2, M3, M4 done, and M1 merged **and pushed**
(P57). A21 is closed: the Norwegian was read and passed. Nothing here is outstanding.

What came next was `workitems-measurement.md`, and its first item found what this lane could not:
the frame-time governor, running on a real device for the first time, was giving up its entire
ladder on an RTX 4090 at a locked 60 fps (D2/D5).
