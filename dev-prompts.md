# City Grid — Design of Record (prompts, verbatim)

*Every product decision from the user, recorded verbatim in the order it arrived. Code comments
and rulings cite these by number (`P3`, `P6`). Nothing here is edited for spelling or style — the
point of a verbatim record is that it cannot drift. Companion files: `dev-questions.md` (what was
asked back, and what is still open), `plan-v1.md` (execution), `specs/` (design and architecture),
`dev-log.md` (what was actually built).*

---

## P1 — 2026-08-25 — Initial brief

> Good evening. Please read the specs in ./ subdir and the game stack and dev technique in
> @../Retrogradegames/ And make a plan for making the game "City Grid" a reimagination of the
> original Sim City games plus some bonus features, in a three.js render for mobile and browser.

*Context: `/add-dir /home/kjelloe/GIT/Retrogradegames/` immediately before.*

**Produced:** `specs/plan.md` rev 1 — deterministic reducer core, no build step, three.js mesh
rendering, nine slices S0–S9, bonus feature set. Established the title **City Grid** (superseding
the working title "Pocket Metropolis" in `specs/gamedesign.md`) and the clean-room posture toward
`specs/referencedata.md`.

---

## P2 — 2026-08-25 — Multiplayer requirements

> Further requirements, game needs to be fully client side singleplayer, but when playing
> multiplayer, with a starting lobby with game options i.e map size, difficulty, terrain style
> (flat, hilly, amount of water), and drop in multiplayer up to 16 players, depending on the map
> size. Players can not destroy anytihng another player has made directly, but have to request it,
> which sends the title, location and reason if given to the player owning the area. We may also
> have a game option where each player gets a section of the map exclusively. Different modes.
> Please review design to cater for those needs as well

**Produced:** `specs/plan.md` rev 2 — ownership as hashed engine state, the demolition-request
entity, four game modes, the lobby and its options record, district generation with a fairness
gate, drop-in/drop-out with AI regency, server-owned clock, and the M1–M6 multiplayer lane.

**Standing constraints from this prompt:** singleplayer must remain fully client-side; a player
may never directly destroy another player's work; player cap follows map size; exclusive-sector
mode must exist as an option.

---

## P3 — 2026-08-25 — Server load

> Thanks. How to avoid server being overloaded? Could we use the 20 Hz approach from @../Fireline/ ?

*Context: `/add-dir /home/kjelloe/GIT/Fireline/` immediately after.*

**Correction of record:** Fireline runs at **10 Hz**, not 20 (`engine/clock.js`,
`TICKS_PER_SECOND = 10`).

**Produced:** `specs/plan.md` §3.6–3.8 — adopt Fireline's 10 Hz pump and its jitter
instrumentation, but broadcast **accepted commands, not snapshots**, because a city builder has no
authoritative motion to interpolate and its vehicles are client-side decoration sampled from
traffic density. Server cost is therefore flat in player count. Load levers: drag-paint coalesced
into one RLE command, per-seat rate limits, one sim per room, queued join snapshots, degrade the
game clock never the pump, hibernate empty rooms, autosave off the pump.

---

## P4 — 2026-08-25 — Review for omissions

> Thanks. Please review plan to look for any omissons or things we have missed.

**Produced:** `specs/plan.md` rev 3. Ten real gaps closed, five of which needed deciding before
code: multiplayer simulation semantics (§2.6), session lifecycle, unlocks, protocol versioning
against a cached PWA (§3.9), and a disasters slice. Also added: persistence and replay-log growth,
ops, communication and moderation, audio, accessibility, drop-in onboarding, platform support,
content production, chaos injection, and the rule that perf is measured on a saturated city.

---

## P5 — 2026-08-25 — Update the design, then plan the slices

> Please update design with the missing elements, ask me for clarifications when needed, and then
> write up an implementation plan in appropriate slices, documented as plan-v1.md

**Produced:** four blocking questions asked and answered (see `dev-questions.md` A1–A4);
`specs/gamedesign.md` rev 2 with §25–33 and an amendments table; `plan-v1.md` with 7 waves,
27 slices, three release gates and a twelve-item questionnaire.

---

## P6 — 2026-08-25 — Balance provenance and art style

> Q9, start from reference and tune by sweep. Q1 art, could we do three variants to test, or could
> we even have different style that users can choose? i.e 1) Isometric 2D / 2.5D: Classic angled
> view used in games like SimCity 4, showing buildings from a diagonal perspective. 2) Pixel Art:
> Retro, detailed grid or free-form sprite styles showing tiny animated streets, cars, and
> citizens. example in @./specs/screenshots 3) Voxel / Low Poly: Modern toy-like 3D dioramas with
> clean, minimalist shapes and cozy color palettes.

*Reference supplied: `specs/screenshots/isometric-1.jpg` — dense isometric pixel art with cutaway
interiors, individually drawn citizens and vehicles.*

**Ruled (Q9):** balance constants start from `specs/referencedata.md` §13, enter
`data/balance.json` labelled `era 0, untuned`, and are tuned by sweep.

**Produced (Q1):** two further questions asked and answered (see `dev-questions.md` A5–A6) — one
style at v1 chosen by a probe, and four-angle rotation as a hard requirement. Consequence: v1 uses
the mesh pipeline; the pixel-art *look* stays available as a post-process over the same meshes;
a drawn-sprite pipeline is post-v1 and contingent on an artist. Slice 1.2b rewritten around three
rotation-capable candidates.

---

## P7 — 2026-08-25 — Records

> Please record all my prompts in ./dev-prompts.md and questions for me in ./dev-questions.md ,
> make sure open questions are listed a separate bottom section for clarity.

**Produced:** this file and `dev-questions.md`.

**Standing practice from this prompt:** every future user prompt that carries a product decision
is appended here verbatim, with what it produced. Every question put to the user is recorded in
`dev-questions.md`, and open ones live in its bottom section.

---

## P8 — 2026-08-25 — The questionnaire, answered

> Q2 tone happy cheerful, overly optimistic. Add later opportunity to change advisor to be british
> sarcastic or german strict Q3: three ambinent tracks, sound on/off and volume adjustable
> Q4. Language Norwegian and English for starters. localization from the get go Q5: room can be
> private with join code and QR code representation, or public where anyone can join, Q6: Location
> pings and a set of standard commands i.e remove, I'm working here, and AFK status Q7: we'll try 5
> city years Q8: self hosted and LAN game only for now, make a note of master server for later
> Q10: advice map size to be lower for mobile Q11: Game option, shared or a fixed split of income.
> Q12: Campaign scenarios after v1 ok, but plan them in where they need ot be hooked into code
> Q13, user selectable style yes, for art, make placeholders and list of which assets needs to be
> drawn. Anything else before I step away for 6 hours and you build all the slices you can?

**Produced:** rulings 008–013; `dev-questions.md` A8–A18; amendments to `specs/gamedesign.md`;
`specs/asset-list.md`; and the autonomous build session logged in `dev-log.md`.

**Answers in full:**

| Q | Answer |
|---|---|
| Q2 | Advisor is happy, cheerful, overly optimistic. Alternate personas later: British sarcastic, German strict |
| Q3 | Three ambience tracks; sound on/off and volume adjustable |
| Q4 | Norwegian and English from the start — localisation from the get-go |
| Q5 | Rooms are private by join code (with a QR representation) **or** public and open to anyone |
| Q6 | Location pings plus a set of standard commands — *remove*, *I'm working here* — and an AFK status |
| Q7 | Derelict and absence thresholds: try 5 city years |
| Q8 | Self-hosted and LAN only for now; note the master server for later |
| Q10 | Advise a lower map size on mobile |
| Q11 | Game option: shared treasury, or a fixed split of income |
| Q12 | Campaign scenarios after v1, but plan where they hook into the code now |
| Q13 | User-selectable style: yes. For art, make placeholders and a list of what needs drawing |

**Standing authorisation from this prompt:** build as many slices as possible unattended over a
six-hour window.

---

## P9 — 2026-08-26 — The remaining questionnaire

> Q14: comsetic unlocked by earned mayor rank, Q15: hand rolled, no dep Q16: you draft, I can review
> Q17: Split N ways for N players

**Answers:**

| Q | Answer |
|---|---|
| Q14 | Alternate advisor personas are a **cosmetic unlock earned by mayor rank** |
| Q15 | QR generation is **hand-rolled, no dependency** |
| Q16 | I draft the Norwegian, Kjell reviews |
| Q17 | A fixed split is **equal shares, N ways for N players** |

**Produced:** rulings 010 and 014 updated; `dev-questions.md` A19–A22; the split
rule confirmed in `data/modes.json`; three new open questions (Q18–Q20) that
these answers raised.

## P10 — Art-direction page, then N1 with a configurable budget

> Please make an art-direction.html file and then go ahead with N1, but do make the budget configurable for the LOD system i.e start at 80k

## P11 — More house references; remake plain with soft lighting

> For art direction, please review the additional screenshots from Transport-World in @debugging/transport-world-2.png  and @debugging/transport-world-3.png  to see level of detail on houses. The remake plain 1 soft lighting, because all three candidates looked very similar

## P12 — Split walls and roof; what else gets us closer to the reference

> Yes please split Fixing it properly    means splitting a building into two instanced meshes (walls, roof) with independent colours . Anything else we can do to get closer to Transport World refernce pictures 2 and 3?

## P13 — Plain ships; update everything, then continue

> Ok, go for plain    Soft cool light, bright cosy palette, shadows. The cheapest to produce and the most legible. Then update docs, specs, md, skills, memories and  tests, and then go ahead with next slices please

## P14 — Sync everything, then the next slice

> Please update docs, specs, MD,  memories, skills and tests. Go ahead with next slice

## P15 — Build N5 onwards unattended, and record the decisions

> 1update docs, specs, MD, memories,     skills and tests. then  build all the remaining  parts from N5 and onwards , as I have to step away for 7 hours and would like to see a complete game when I get back. Please record decisions when I am away so we can re-assess after when I playtest


## P16 — Review the omissions, then how to get to a working version

> Please review omissions, things we have missed. And then sum up what we need to do to get to a working version. And then suggestions options on how to solve each

**Produced:** the audit that found the blocking omission — no building-placement
tool in the UI, so no plant, so no growth — and that `tools/mvp_acceptance.mjs`
had validated criteria 3 and 9 through `apply()` rather than through the
interface. Ranked list of the remaining gaps with options for each.

## P17 — Build the first four

> Go ahead with 1,2,3,4 please

Items 1–4 of the audit's ranked list: the building-placement UI, an acceptance
script that drives the interface for criteria 3 and 9, a tax and budget panel,
and i18n for the whole HUD.

**Produced:** slice N11. Ruling 026.

## P18 — Review the omissions again, sync everything, and how to get to a working version

> Please review omissions, things we have missed. Then update docs, specs, MD, skills memories and tests. And then sum up what we need to do to get to a working version. And then suggestions options on how to solve each

**Produced:** the audit that found the game could only ever play one city — no
new-game screen, so seed and size were URL parameters and three balanced,
measured difficulties were unreachable. Also: quest text unlocalised, department
funding absent with a comment claiming otherwise, four dead exports in
`capabilities.js`. `test/omissions.test.js`, ruling 026's list of what is
deliberately not built, and a three-wave-stale Progress section rewritten.

## P19 — Build the new-game screen, then the quest content

> go ahead with (1) then (2a)

Items 1 and 2a of the audit's ranked list: the new-game screen as
`client/lobby/`, shaped so slice 5.2 adds seats; then the six missing quests
written first and all of them moved into the i18n catalogues in one pass.

**Produced:** slice N12. Answers A23 (Q22) and A24 (Q23).

## P20 — Audit again, sync everything, and keep building

> Please review omissions, things we have missed. Then update docs, specs, MD, skills memories and tests. Then go ahead with next parts to build

**Produced:** slice N13. The audit found that **every refused action in the
game's history had been silent** — seven `result.*` strings carried in both
catalogues since the first commit, and `game.js` passing the reason to a
`setPreview` that ignored it. Also: no settings screen, and a Continue button in
the lobby that nothing ever passed. Ruling 027 and `test/reachability.test.js`.

## P21 — Audit again, sync, and build what was suggested

> Please review omissions, things we have missed. Then update docs, specs, MD, skills memories and tests. Then go ahead with next parts as suggested

**Produced:** slice N14 — slice 4.5's accessibility half. The audit found
`?debug=1` replacing the game with an error screen (`client/debug.js` was
imported from the first commit and never written), and four `role="toolbar"`
rows promising a keyboard pattern that did not exist. Ruling 028.

## P22 — Audit, then statistics and the minimap

> Please review omissions, then go ahead with statistics and minimap

**Produced:** slice N15 — slice 4.6 (history buffers, graphs, plain-language
interpretation) and 4.1's last piece, the minimap. The audit's finding was that
**`test/fixtures/` is empty**: the founding and two-player fixtures, the fixture
runner and `tools/repin.mjs` were never written, so the project's headline
tripwire does not exist and `CLAUDE.md`'s "hashed fields live in two places" is
one place.

## P23 — Sync, audit, and statistics and the minimap

> Please update docs, specs, MS, skills. memories and tests, then review omissions and things forgotten, then go ahead with statistics and minimap

Statistics and the minimap had landed the previous turn as slice N15, so this
was read as "finish them": the audit was pointed at the new code itself.

**Produced:** slice N16 — two defects in N15's own work. The minimap only
repainted when the player built, so growth, fire and disasters never reached it;
and it carried `role="img"` while being focusable and handling keys, which is
ruling 028's defect in the code written to honour ruling 028.
