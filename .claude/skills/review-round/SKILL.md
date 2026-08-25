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
| `specs/art-direction.md` | Visual language | The style changes, or §3 is still empty after the probe |
| `CLAUDE.md` | Working rules | A rule is learned the hard way and stays only in someone's head |
| `.claude/skills/` | Repeatable workflows | A workflow changes and the skill still describes the old one |
| Memory | Durable facts about the user and the project | A preference is stated and only survives in the transcript |

## 2. The checks

**Docs**
- Does `plan-v1.md` reflect which slices are actually done?
- Did any slice change behaviour that `specs/gamedesign.md` still describes the old way?
- Are the budgets in `specs/plan.md` §3.8 and §6 still predictions, or have they been measured? A
  measured number replaces a predicted one and names its era and commit.
- Is `specs/art-direction.md` §3 still empty? Nothing in the content lane may start before it.

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
- Do the doc-consistency tests still pass? `test/docs.test.js` is what keeps this checklist honest.

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
