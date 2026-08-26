# City Grid — Questions for the user

*Everything asked of the user, with the answer and what it changed. **Open questions are in the
bottom section**, and that section is the only place to look for what is still undecided.
Answered items are kept forever — a ruling without its question is hard to re-litigate honestly.
Companion: `dev-prompts.md` (the user's own words), `plan-v1.md` (execution).*

Numbering: `A*` are answered rulings, in the order they were asked. `Q*` are the open
questionnaire items and keep the numbers used in `plan-v1.md`, so a reference like "Q7" means the
same thing in both files.

---

## Answered

### A1 — Demand model across players
**Asked** 2026-08-25 (from P5). *In multiplayer, how should RCI demand work across players?*

| Option | |
|---|---|
| **One regional pool** | **CHOSEN** |
| Per-player demand | |
| Regional pool, mode-dependent | |

**Answer:** one regional pool, in every mode. Residents and firms belong to the region and settle
where they are best served; taxes, services, commute time and pollution are the real competition.

**Changed:** `specs/plan.md` §2.6 and §0; `specs/gamedesign.md` §25.6 and the §33 amendment to
§8.1; `plan-v1.md` ruling 2 and slice 1.4. **Watch:** snowballing — per-seat land share and score
spread are already sweep columns for exactly this reason.

### A2 — Session shape
**Asked** 2026-08-25 (from P5). *What shape is a multiplayer session?*

| Option | |
|---|---|
| **Persistent worlds** | **CHOSEN** |
| Match-based sessions | |
| Both, per lobby option | |

**Answer:** a room is a persistent world in every mode. No victory condition, no forced ending.

**Changed:** `specs/plan.md` §5.4 — Region Rivals lost its chapter-ending and instead drops a
**season marker** every 25 city years (ranking, recap, history entry) without resetting the world;
`specs/gamedesign.md` §27.1; `plan-v1.md` ruling 3 and slice 6.2. **Consequence:** room lifetime
policy, yearly checkpoints with command-log truncation, and hibernation for empty rooms all became
required rather than optional.

### A3 — Build order
**Asked** 2026-08-25 (from P5). *What ships first?*

| Option | |
|---|---|
| **Singleplayer MVP first** | **CHOSEN** |
| Multiplayer-capable from the start | |
| Vertical slice of both | |

**Answer:** singleplayer first, with ownership and the session seam built in from day one at one
seat. The server lane starts only once the core loop is proven.

**Changed:** `plan-v1.md` ruling 1 and the whole wave order — Waves 0–4 are singleplayer, Wave 5
does not begin until the singleplayer MVP is accepted. Listed in the stop-and-re-plan section:
Wave 5 is expensive and must not start on an unproven loop.

### A4 — Engine language subset
**Asked** 2026-08-25 (from P5). *Should the engine be written in the restricted Lua-portable JS
subset from the RetroMultiCiv stack?*

| Option | |
|---|---|
| Idiomatic modern JS | |
| Restricted portable subset | |
| **Restricted in engine core only** | **CHOSEN** |

**Answer:** `engine/` core only — no `class`/`this`, no `Map`/`Set`, no exceptions, plain functions
over plain objects and typed arrays, index maths through named helpers, integer division through
`idiv()`. `shared/`, `worker/`, `server/` and `client/` use idiomatic modern JS.

**Changed:** `specs/plan.md` §0; `plan-v1.md` ruling 5 and slice 0.3, which carries a subset lint
that must fail on a planted `class` and a planted `Map`. Keeps a mechanical Luau twin possible
(Wave 7) without paying the verbosity everywhere.

### A5 — Art style scope
**Asked** 2026-08-25 (from P6). *How many art styles does v1 ship?*

| Option | |
|---|---|
| **One, chosen by probe** | **CHOSEN** |
| Two styles at v1, user-selectable | |
| Sprite-first: pixel art is the v1 style | |

**Answer:** one style at v1, chosen by the 1.2b probe, with the `RenderStyle` seam kept so a
second is additive later.

**Changed:** `specs/plan.md` §6 style seam; `plan-v1.md` ruling 7, slice 1.2b, content lane C0–C1.
**Reasoning of record:** the three named styles are two pipelines, not three — pixel art and
isometric 2.5D are the same depth-sorted sprite code at different resolutions. The cost is the art
sets, and content was already the long pole (`specs/plan.md` §8.1). Style is a per-viewer client
preference because rendering is entirely local, so a shared room can be viewed in two styles at
once whenever a second one exists.

### A6 — Camera rotation
**Asked** 2026-08-25 (from P6). *Is four-angle camera rotation a hard requirement, or negotiable
if a style is worth it?*

| Option | |
|---|---|
| **Hard requirement** | **CHOSEN** |
| Negotiable — fixed angle is acceptable | |
| Per-style, whatever that style affords | |

**Answer:** hard requirement. `gamedesign.md` §13.4 keeps its promise on desktop and on touch.

**Changed:** `specs/gamedesign.md` §33 amendment to §13.4; `specs/plan.md` §6; `plan-v1.md`
ruling 8 and slice 1.2b. **Consequence:** v1 is the mesh pipeline, because a drawn-sprite style
would need four sprite sets per building state. The pixel-art look survives as a post-process over
the same meshes — low-resolution render target, nearest upscale, palette quantisation, dither,
outline — which keeps rotation, zoom and procedural asset generation.

### A7 — Balance constant provenance (questionnaire Q9)
**Asked** in the `plan-v1.md` questionnaire. **Answered directly in P6.**

**Answer:** start from the reference constants and tune by sweep.

**Changed:** `plan-v1.md` ruling 6; `specs/plan.md` §8 provenance note. Constants enter
`data/balance.json` labelled `era 0, untuned`; every value that survives to release names the era
and the commit whose sweep measured it. They were tuned for a different demand model, a different
map size and no multiplayer, so they are a starting point and never a shipped balance.

### A8 — Advisor tone (Q2)
**Answered** P8. Happy, cheerful, overly optimistic. **Alternate personas later:** British
sarcastic, German strict.

**Changed:** ruling 010. The consequence is structural rather than cosmetic — dialogue data is
keyed by `persona` from the first line written, so alternates are a data pack rather than a
retrofit. Default persona `sunny`.

### A9 — Music (Q3)
**Answered** P8. Three ambience tracks; sound on/off and volume adjustable.

**Changed:** `gamedesign.md` §29 mixer requirement confirmed; content lane C4 target set at three
tracks.

### A10 — Localisation (Q4)
**Answered** P8. Norwegian and English from the start, localisation from the get-go.

**Changed:** ruling 008. No user-facing string is ever written inline; every one goes through the
catalogue from slice 0.1, with key parity enforced by test. Retrofitting i18n is the expensive
version of this and the whole reason it is ruled now.

### A11 — Room privacy (Q5)
**Answered** P8. A room is either **private** — join code, with a QR representation — or **public**
and open to anyone.

**Changed:** `gamedesign.md` §26.3; slice 5.2. QR generation will be hand-rolled to keep the
zero-dependency rule (see Q15).

### A12 — Communication vocabulary (Q6)
**Answered** P8. Location pings plus standard commands — *remove*, *I'm working here* — and an
**AFK status**.

**Changed:** `gamedesign.md` §28. AFK is a player-state field, not a chat message, so it shows in
the roster and can gate request auto-policies. Free-text chat stays optional and off the game
record.

### A13 — Derelict and absence thresholds (Q7)
**Answered** P8. Try **5 city years** for both.

**Changed:** `data/balance.json` defaults; `gamedesign.md` §25.4, §25.7. "Try" is taken literally —
these are era-0 values for the sweep to challenge.

### A14 — Hosting (Q8)
**Answered** P8. Self-hosted and LAN only for now; note the master server for later.

**Changed:** ruling 009. Slice 6.4 loses the master index and keeps systemd, TLS, deploy, backups
and room restore. LAN discovery is in scope; the index is a documented later addition with its
hooks named.

### A15 — Mobile map size (Q10)
**Answered** P8. Advise a lower map size on mobile.

**Changed:** ruling 011. The lobby detects a coarse pointer and low memory, recommends a size,
warns above it, and never silently forbids — a phone may still join a large region someone else
made, and that path degrades rather than breaks.

### A16 — Shared City treasury (Q11)
**Answered** P8. A game option: shared treasury, **or a fixed split of income**.

**Changed:** `gamedesign.md` §26.1, §26.3; `data/modes.json`. See Q17 — the split rule itself still
needs picking.

### A17 — Campaign scenarios (Q12)
**Answered** P8. After v1, **but plan where they hook into the code now.**

**Changed:** ruling 012. Six hook points are named and built as part of their own slices rather
than bolted on later: scenario-defined starting state, objective evaluation, restriction rules,
scripted events, completion tiers, and region progression.

### A18 — User-selectable art style (Q13)
**Answered** P8. Yes. For art: make placeholders and a list of what needs drawing.

**Changed:** ruling 013. Two consequences: the `RenderStyle` seam becomes a v1 requirement rather
than a nicety, and `specs/asset-list.md` is the drawing brief — every placeholder names the asset
it stands in for, so the list is generated from the code that consumes it and cannot drift.

### A19 — Alternate advisor personas (Q14)
**Answered** P9. A **cosmetic unlock earned by mayor rank**.

**Changed:** ruling 010. Fits the existing constraints without strain: mayor rank already persists
in the local profile as recognition and never gates a building (ruling from §27.2), and persona is
already a client display preference that never reaches game state. So the unlock is profile-local
too — two players in one room can hear different advisors, and one of them has earned theirs.

### A20 — QR generation (Q15)
**Answered** P9. **Hand-rolled, no dependency.**

**Changed:** ruling 014. Keeps the zero-runtime-dependency rule intact. Lives in `client/`, never in
`engine/` — a QR code is a way of showing a join code to a phone, not a rule of the game.

### A21 — Norwegian strings (Q16)
**Answered** P9. I draft, Kjell reviews.

**Changed:** content lane C5. The advisor's voice is the hard part: persona-flavoured lines are
authored per locale rather than translated (ruling 008), so the draft is a starting point for a
native speaker rather than a finished text.

### A22 — The fixed income split (Q17)
**Answered** P9. **Equal shares, N ways for N players.**

**Changed:** confirmed what `engine/economy.js` already implements, now recorded rather than
assumed. Simplest and most co-operative: nobody has to argue about whose district earned what.

---

---

# OPEN QUESTIONS

*Nothing below is decided. Each item names what it blocks and when an answer is actually needed —
none of them block the next slice. `plan-v1.md` carries the same numbers.*

*Q2–Q17 are all answered. These three arose from the P9 answers themselves. None blocks the
current work — each has a stated assumption being built against, and each is cheap to change while
it stays small.*

| # | Question | Assumption being built against | Needed by |
|---|---|---|---|
| **Q18** | Which mayor ranks unlock which advisor personas? Five ranks, two alternates — so which two, and does the player choose freely once unlocked or is each tied to its rank? | Both alternates unlock together at rank 3 (City Mayor), and the player picks freely from what they have earned | Wave 4, content lane C3 |
| **Q19** | In a split-income room, does a seat in **regency** still receive its share? Paying an absent player rewards absence; not paying them punishes someone who left properly and told the deputy what to do. | An absent seat still receives its share — the design is built so that leaving is safe, and docking pay for it contradicts that | Slice 6.1 |
| **Q20** | When a player leaves permanently and their land is released to unclaimed, what happens to their **money**? | It stays with the seat, so a returning player finds their treasury as they left it; if the seat is reused by someone new, the money goes with the land back to nothing | Slice 5.4 |
