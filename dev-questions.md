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

---

---

# OPEN QUESTIONS

*Nothing below is decided. Each item names what it blocks and when an answer is actually needed —
none of them block the next slice. `plan-v1.md` carries the same numbers.*

| # | Question | Blocks | Needed by |
|---|---|---|---|
| **Q2** | The advisor's character — name, tone, and how much personality is too much for a voice the player hears on every tutorial step and every milestone for hours? | Slice 4.2, content lane C3 | Wave 4 |
| **Q3** | Music: three ambient tracks, or ambience only and no score? | Content lane C4 | Wave 4 |
| **Q4** | Is Norwegian a first-class launch locale, or a later addition? Key-identical catalogs are enforced by test either way; this decides how much writing is in scope. | Content lane C5 | Wave 4 |
| **Q5** | Default room privacy: are public rooms with strangers a supported case at v1, or is v1 friends-only by join code? This decides how much moderation tooling slice 5.3 must carry. | Slice 5.3 | Wave 5 |
| **Q6** | Should chat exist at v1 at all, or are location pings enough? Pings need no moderation and work across languages. | Slice 5.3 | Wave 5 |
| **Q7** | Derelict-property threshold and absence grace period — five city years each, or longer? | Slice 5.4 | Wave 5 |
| **Q8** | Do you want a hosted public server, or is v1 self-host and LAN only? Decides whether the master index in slice 6.4 is built at all. | Slice 6.4 | Wave 6 |
| **Q10** | If measurement says 128×128 with sixteen seats cannot hold the frame budget on mid-range mobile, do we cut the map size or ship it desktop-only? | Slice 6.3 | Wave 6, decided with numbers |
| **Q11** | Should Shared City default to a shared treasury or separate ones? This changes how co-operative play feels more than any other single option. | Slice 6.1 | Wave 6 |
| **Q12** | Confirm that the Guided Campaign scenarios (`gamedesign.md` §4.1) are post-v1 scope. | Scope | Before Wave 7 planning |
| **Q13** | Post-v1 only: is a drawn-sprite pipeline ever funded — four sprite sets per building state, hand-drawn, needing an artist — and is user-selectable style a Wave 7 goal? | Wave 7 | After the 1.2b probe |
