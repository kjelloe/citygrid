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
- **Does a data file carry prose where it should carry an i18n key?** `t()` returns its own
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

**A green suite says nothing about which build the player is running.** The service worker served
cache-first and re-installed only when its own bytes changed, which they never did — so two P33
playtest items were reports about code that had shipped three days earlier and could not arrive
(ruling 031). Every gate opens a clean profile and every gate was green. When a report contradicts
what the code plainly does, check delivery before you check the code.

**A setting is not built until a pixel changes.** High contrast set an attribute for two slices
while 61 rules used system colours `--bg`/`--fg` could not reach, and the gate checked only that the
attribute landed. For anything that themes the interface, assert a **computed colour** before and
after — the same "measure the whole, not the part" as everywhere else in this file.

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
