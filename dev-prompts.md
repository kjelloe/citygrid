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
