# City Grid — Version 1 Implementation Plan

*Written 2026-08-25. Design of record: `specs/gamedesign.md` (rev 2). Architecture and stack
decisions: `specs/plan.md` (rev 3). Product decisions verbatim: `dev-prompts.md`. Questions asked
and still open: `dev-questions.md`. This file is the authority for **execution order, slice
contents and definitions of done**. History: `dev-log.md`.*

## Rulings that shape this plan

1. **Singleplayer ships first.** Ownership and the session seam are built in from day one, at one
   seat. The server lane starts only once the core loop is proven fun.
2. **Demand is one regional pool** in every mode, allocated by relative attractiveness.
3. **A room is a persistent world**, not a match.
4. **Unlocks are room-level**, never per-player.
5. **`engine/` core is written in the restricted Lua-portable subset**; everything else is
   idiomatic modern JS.
6. **Balance constants start from `specs/referencedata.md` §13 and are tuned by sweep** (Q9).
   They enter `data/balance.json` labelled "era 0, untuned", are never trusted as shipped values,
   and every later number names the era and commit that measured it.
7. **One art style ships at v1**, chosen by probe (1.2b). The renderer is built behind a style
   seam so a second style is additive later, and style is a per-viewer client preference — in
   multiplayer, rendering is local, so two players may view the same region in different styles.
8. **Four-angle camera rotation is a hard requirement** (`gamedesign.md` §13.4). This selects the
   **mesh pipeline** for v1: a drawn-sprite style would need four sprite sets per building state.
   The pixel-art *look* remains available inside that pipeline as a post-process (low-resolution
   render target, nearest upscale, palette quantisation, outline pass), which keeps rotation,
   zoom and procedural asset generation. A true drawn-sprite pipeline is post-v1 and only if an
   artist is funded.

## What Version 1 is

A city builder that runs in a browser and on a phone, playable offline alone, and playable with
up to sixteen people in a persistent shared region where nobody can destroy anyone else's work.

| Acceptance check | Belongs to |
|---|---|
| The thirteen singleplayer criteria in `gamedesign.md` §24, run as an automated script | Singleplayer MVP |
| A city can be built, saved, closed, reloaded and continued, on mouse and on touch | Singleplayer MVP |
| Eight players build one region together, drop in and out, and resolve demolition requests | Multiplayer MVP |
| Sixteen seats on a 128×128 region for one hour: hashes identical, jitter p99 < 150 ms | Version 1 |
| Districts, Region Rivals, mutual aid and contracts all playable and swept for fairness | Version 1 |
| A deploy, a kill and a restart with every live room resumed | Version 1 |

## Ordering principles

1. **Engine before client.** Every mechanic lands headless and soak-verified before its interface,
   so design evaluation never waits on art.
2. **Ownership before the second command exists.** The permission gate lands with the first
   placement tool, not after the command set has grown.
3. **The simulation must be fun alone before it is shared.** Wave 5 does not start until the
   singleplayer MVP is accepted.
4. **Content runs as a parallel lane** from Wave 1 — procedural assets are consumed whenever they
   appear, with no code change.
5. **Tooling lands with the wave that needs it**, never as a retrofit.
6. **Design-blocked items are flagged, not scheduled** (questionnaire at the end).

## Progress

*Updated 2026-08-29 after the P18 audit. Slice numbers below are the N-series in
"The next ten slices"; the wave tables are what they map onto.*

**Waves 0–3 are complete.** 0.1–0.4, 1.1–1.5, 2.1–2.6, 3.1–3.4, plus the
renderer and the style decision (N1, N2 / ruling 022). Era 1 is pinned
(`reports/balance-era1.md`, 200 games × 4 configurations).

**Wave 4 is complete.** 4.1 (HUD, overlays, minimap), 4.2 (advisor and quest
engine), 4.3 (**20 quests** and the acceptance script), 4.4 (audio), 4.5
(accessibility **and** the PWA half), 4.6 (statistics). **Wave 0 is finally
complete too** — 0.4's fixture half was built in N17, having been marked done
with an empty `test/fixtures/` for the life of the project.

**The Singleplayer MVP release gate is met**: the thirteen §24 criteria pass as
an automated script on desktop and on a 390×844 phone.

**Wave 5 has NOT been started, deliberately.** Ruling 003 holds it behind the
singleplayer MVP being *accepted*, and acceptance is Kjell's playtest, not a
green suite. `playtest-notes.md` is the file to open first.

**The §24 release gate passes 13 of 13** (`tools/mvp_acceptance.mjs`), driving
the real page by pointer on desktop and a 390×844 phone.

**What the audit found is missing from a *playable* game**, none of which the
§24 criteria ask about:

- ~~No new-game screen~~ — **built in N12.** Size, difficulty, terrain, water,
  disasters and seed are chosen by pointer; a URL naming a seed still opens that
  exact city.
- ~~Quest text is not localised~~ — **done in N12.** 310 keys per catalogue.
  Norwegian is drafted, not reviewed (A21).
- ~~No settings screen~~ — **built in N13**: language, high contrast, reduced
  motion. Sound and visual style are deliberately not offered — there is no
  audio, and ruling 022 settled the style, so both would be controls that change
  nothing.
- ~~No city or mayor name~~ — **built in N21.**
- ~~Department funding (§9.4) does not exist~~ — **built in N20.**
- `client/capabilities.js`'s `deviceClass` and `isCoarsePointer` are still
  unused; `recommendedMapSize` and `sizeAdvice` were revived by N12.
- **Exports with no importer**, swept 2026-09-05. Most are used inside their own
  module and merely need not be exported; three are worth naming. `deleteSave`
  (`client/storage/db.js`) has no control — deliberate, since the three save
  slots are fixed and always overwritable, and N5's comment says the slice's job
  is "not that it has a file manager". `markDirty` (`client/render/terrain.js`)
  is dead because `worldChanged()` marks every chunk; that is now load-bearing
  rather than wasteful, since N30 paints roads into the mesh, but a build action
  still costs a full terrain rebuild (~12 ms measured on 128×128). `compatible`
  (`shared/protocol.js`) is the multiplayer version handshake and belongs to
  slice 5.1.
- **`test/reachability.test.js`'s `NOT_YET` is the live inventory** of strings
  the catalogue promises and no screen keeps — 24 keys, each naming its slice.
  Ruling 027 makes an unlisted one a red suite.
- ~~The fixtures do not exist~~ — **built in N17.** Three fixtures, a runner
  that checks every step, a repin tool that demands a reason, and the second
  copy of the hashed-field list in `test/fixture.test.js`.
- **Tree density** is a worldgen option with no row on the new-game screen —
  one entry in `ROWS` when it is wanted.

**Settled balance debts:** pollution averaging fixed; industrial demand settled
by measurement; **runaway treasuries accepted with numbers**, not tuned away
(median 1.9M by year 25). See the N8 row and `playtest-notes.md`.

## The slice ritual

Every slice, without exception: tests written first → implementation → suite double-run green →
the wave's gate → a `dev-log.md` entry naming what was measured → docs and memory synced.
Commit prefix `slice-`. A slice that cannot state its gate is not a slice yet.

---

## Wave 0 — Foundation

No gameplay. This wave exists so that every later slice has a gate to run.

| # | Slice | Depends on | Done when |
|---|---|---|---|
| ✅ 0.1 | **Repo and harness** — layout per `plan.md` §1, importmap, no-build static serve, `run.sh`, `test.sh`, `node --test` wired, `CLAUDE.md` working rules, `dev-log.md` started | — | `./test.sh` runs green twice in a row on an empty suite; the client serves a blank page with no console errors |
| ✅ 0.2 | **Deterministic primitives** — `prng.js` (xorshift32, state in game state), `idiv.js`, `grid.js` (index and neighbour helpers), `canonical.js`, `statehash.js` (FNV-1a 64, rejects float/null/NaN), `protocol.js` (version + build hash) | 0.1 | Pinned test vectors for the PRNG sequence and for three known state hashes; the hash function refuses an illegal value in a test |
| ✅ 0.3 | **State and reducer skeleton** — SoA allocation including `owner` and `district`, `GameOptions` record hashed into initial state, command envelope with `actor`, `TICK`, `copyState` with deep copies, the restricted-subset lint for `engine/` | 0.2 | 1000 empty ticks are hash-stable and allocation-free; the subset lint fails on a planted `class` and a planted `Map` |
| ✅ 0.4 | **Test drivers** — JSON fixture runner, soak driver skeleton, chaos injector skeleton, event-census probe | 0.3 | `test/fixtures/empty.json` passes; the chaos injector fires 10k random malformed commands without corrupting state or throwing. **The fixture half was not actually built until slice N17** — it was marked done with an empty `test/fixtures/` for the life of the project (P22 audit) |

---

## Wave 1 — The city canvas and the core loop

The wave that answers "is this a game". Everything here is singleplayer, one seat, `owner = 1`.

| # | Slice | Depends on | Done when |
|---|---|---|---|
| ✅ 1.1 | **Terrain generation** — seeded, with style (flat/rolling/hilly), water (none/lakes/river/coastal/archipelago) and tree density; district partition following terrain with a fairness score; region identity naming | 0.3 | Same seed and options produce an identical map hash on two runs; a 200-seed sweep reports fairness spread and zero degenerate maps (no buildable land, no water) |
| ✅ 1.2 | **Renderer bootstrap** — vendored three.js, WebGL2 probe with an honest unsupported screen, chunked terrain geometry, orthographic camera with snapped yaw and zoom-to-cursor, grid picking by ray-plane maths, ghost preview, 2D minimap painted from state | 1.1 | A screenshot test renders a known seed identically under SwiftShader; picking returns the correct tile at four zoom levels and all four yaw angles |
| 1.2b | **Style probe** — one pinned 16×16 city block from a real save, rendered through the real renderer in three candidates, all within the mesh pipeline so all four camera angles work: **(a) clean low-poly toy diorama** — flat colour, baked shading, cozy palette; **(b) pixel-art post-process** — the same meshes rendered to a low-resolution target with nearest upscale, palette quantisation, dither and outline, for the look of the reference screenshot with rotation intact; **(c) higher-detail hand-painted atlas** — richer silhouettes and texture, closest to a modern isometric builder | 1.2 | Three candidates × two zoom levels × phone and desktop, screenshotted; draw calls, triangles and frame time measured for each; a written note on cost per building state and on how each survives the territory overlay and sixteen player colours. **Style chosen and `specs/art-direction.md` settled** |
| ✅ 1.3 | **Roads and the permission gate** — `PLACE_ROAD` with path input, auto-connect shape table, instanced road rendering, transactional commit with cost preview, `BULLDOZE`, undo of one transaction, **`engine/permissions.js` with every command routed through it**, `owner` written by every placement | 1.2 | The permission matrix test passes (every command × every ownership relation); a drag of 400 tiles is **one** command; an illegal edit is refused identically by two independent engine instances |
| ✅ 1.4 | **Zoning, lots and development** — zone paint (pencil, rectangle, brush), road-access check, lot aggregation to 1×2 and 2×2, **regional RCI demand pool**, growth and decay scoring, building instancing keyed by category/level/value tier | 1.3 | Soak: five pinned seeds each grow a self-sustaining town of 500 residents within 20 city years with no manual intervention; the demand pool allocates correctly with one seat (the multi-seat path is tested in 6.1) |
| ✅ 1.5 | **Save and load** — IndexedDB, schema v1, three rotating autosaves plus five manual slots, export and import, migration framework and the fixture corpus | 1.4 | Save → reload → hash identical; a planted v0 save migrates and hashes correctly; the corpus test runs on every suite |

**Wave gate:** the soak driver grows five seeds for 40 city years with per-tick invariants green,
and the event census shows every implemented system firing.

---

## Wave 2 — Utilities, money and civic services

| # | Slice | Depends on | Done when |
|---|---|---|---|
| ✅ 2.1 | **Power** — coal, gas, wind and solar plants, wire drawing, union-find components with dirty rebuild, capacity versus demand, brown-outs, power overlay | 1.4 | A 200-building grid rebuilds in under 2 ms after an edit; no phantom outage over 20 city years in soak |
| ✅ 2.2 | **Water** — pumps, treatment, towers, underground pipe network with an automatic underground view, water quality, dry tiles, overlay | 2.1 | Contaminating a source measurably reduces downstream quality and health within a year, verified headlessly |
| ✅ 2.3 | **Economy** — construction and maintenance costs, three tax sliders with lagged effect, department funding, monthly budget, loans, bankruptcy warnings, budget panel | 1.4 | Sweep across difficulty tiers: solvency curves are sane, no tier is unloseable or unwinnable; tax changes take effect over several months, not instantly |
| ✅ 2.4 | **Service coverage** — police and crime, fire risk, hospital and health, coverage deposits and smoothing, funding effects, coverage overlays | 2.3 | Halving a department's funding measurably shrinks coverage and raises the matching problem within two years |
| ✅ 2.5 | **Pollution and land value** — sources, spread, decay, land value inputs and penalties, both overlays | 2.4 | Land value responds to parks, water, pollution and crime in the documented directions, asserted per input |
| ✅ 2.6 | **Fire incidents** — ignition, spread, response vehicles routed over roads, extinguish rate from coverage, ruins and rebuilding | 2.4 | Fires start, spread, are fought, and leave recoverable damage; response time degrades measurably with congestion |

**Wave gate:** event census shows every system firing; a 200-game sweep produces no city that is
unrecoverable through play.

---

## Wave 3 — Events, disasters, traffic and maturity

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 3.1 | **Event system and routine events** — the notification pipeline with three severities, camera jump, the advisory checks from `gamedesign.md` §17, minor events (water-main break, collision, factory closure, festival) | 2.6 | Every advisory fires in a crafted scenario; notifications carry a location and the camera reaches it |
| 3.2 | **Disasters** — wildfire, flood, severe storm, earthquake, industrial accident, large blackout; telegraphing, recovery, disaster state on tiles | 3.1 | Each disaster type fires, spreads, is survivable, and leaves a city that play can repair; disasters can be disabled entirely |
| 3.3 | **Traffic** — monthly commuter flow assignment over the road graph, capacity-aware integer routing on sampled origin–destination pairs, congestion effects, pooled vehicle sampling for display | 2.6 | Assignment for a saturated 128×128 region completes inside the month-tick budget; congestion correlates with density rather than with seed luck across 200 games |
| 3.4 | **Maturity** — building upgrades and downgrades, abandonment, derelict state, 3×3 lots, high-density development | 3.3 | A city left alone for 40 years reaches a stable mature state rather than oscillating or dying; abandonment is reversible through play |

**Wave gate:** sweep n ≥ 200 across difficulties and map sizes; balance report written to
`reports/` and the first balance era pinned.

---

## Wave 4 — The game around the simulation → **Singleplayer MVP**

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 4.1 | **HUD and overlays** — top bar, RCI bars, alert area, build toolbar, inspector, all eleven overlays with pattern and icon encoding, minimap integration | 3.1 | UI acceptance: every toolbar button does what it claims, hit-tested; every overlay renders in one pass and is readable in a screenshot diff |
| 4.2 | **Advisor and quest engine** — dialogue panels, the closed condition DSL, quest tracker, choices and consequences, milestones and mayor rank | 3.1 | Quests are pure data; a crafted quest completes headlessly; a choice changes simulation variables and later dialogue |
| 4.3 | **Tutorial and story content** — ten tutorial quests, five milestone quests, three civic events, one recoverable disaster scenario, the advisor's voice | 4.2 | A scripted player completes the tutorial chain headlessly; a first-time human reaches their first residents within two minutes |
| 4.4 | **Audio** — feedback, notification, ambience and event layers; mixer; first-gesture unlock; pooled voices | 4.1 | Audio is derived from state only: a muted client and a loud one stay hash-identical, asserted in test |
| 4.5 | **Mobile, accessibility and PWA** — touch gestures, portrait and landscape layouts, reduced-effects and reduced-motion modes, high contrast, 200% text, keyboard operation, service worker with the version handshake, offline play | 4.1 | Colour-vision palette test passes; keyboard-only and 200%-text passes; the app installs and plays with the network disabled; native-GPU perf run on the saturated fixture meets budget |
| 4.6 | **Statistics** — history ring buffers, graphs, plain-language interpretation of every headline number | 4.1 | Every statistic has an explanation string; history buffers are bounded and hashed |

**Release gate — Singleplayer MVP:** the thirteen criteria of `gamedesign.md` §24 pass as an
automated acceptance script, on desktop and on a real phone.

---

## Wave 5 — Multiplayer → **Multiplayer MVP**

Does not start until the singleplayer MVP is accepted.

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 5.1 | **Server and relay** — `server/` room, seats, store; 10 Hz pump; command relay with sequence numbers; hash verification; snapshot on join; resync; version handshake refusing stale clients | 4.5 | Two real ws clients play five city years with identical hashes; a deliberately corrupted client is detected and resynced; a mismatched build is refused with a reload instruction |
| 5.2 | **Lobby** — room creation, join codes, the options record hashed into initial state, seed preview and regenerate, seats, ready, spectate, host controls, late joining | 5.1 | Four clients configure and start a room end to end; the same options and seed reproduce the same region on every client |
| 5.3 | **Ownership in play** — territory overlay with colour, pattern and label; request inbox; `REQUEST_DEMOLITION` end to end with compensation; standing policies; nuisance reports; pings; activity feed; name and text sanitisation | 5.2 | Multi-client acceptance: request → approve → demolition executes and is paid for; the direct-destruction path is refused; a request whose target burns down resolves as moot |
| 5.4 | **Drop-in and absence** — leave and rejoin by seat token, grace window, deputy mayor doctrines answering requests by policy, abandonment sweep, derelict property rule, spectators | 5.3 | Soak: seats join and leave at random ticks for 40 city years with no divergence and no orphaned land; an absent player's city neither collapses nor is destroyed |

**Release gate — Multiplayer MVP:** eight players build one Shared City region together across a
session that spans a disconnect and a reconnect, with requests resolved both ways.

---

## Wave 6 — Modes, scale and operations → **Version 1**

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 6.1 | **Modes and districts** — `data/modes.json`, district claiming, commons band, open borders, supply contracts, mutual aid, shared civic projects; the multi-seat demand allocation | 5.4 | Mode rules are data and unit-tested; sweep across 200 seeds shows district fairness within tolerance and no seat snowballing attributable to geometry |
| 6.2 | **Region Rivals and seasons** — per-seat scoring, season markers every 25 city years, recap generation, room history | 6.1 | A season completes headlessly and produces a ranking and a recap without ending the world |
| 6.3 | **Scale** — sixteen seats on 128×128, per-seat rate limits, room caps, clock degradation under load, empty-room hibernation, checkpointing with log truncation, `profile_run` and `host_probe` | 6.1 | One hour, sixteen simulated clients: hashes stable, memory flat, jitter p99 < 150 ms; the predicted budgets in `plan.md` §3.8 are replaced with measured numbers |
| 6.4 | **Operations** — systemd unit with limits from the measured profile, TLS, allowlist deploy, backups, room restore, master index and server browser, `/health` and `/metrics` | 6.3 | A deploy, a kill and a restart with every live room resumed; a second machine finds and joins the server through the index |

---

## Wave 7 — After v1

Replays and time-lapse; photo mode; seasons and weather; scenario and challenge editor; Scenario
Co-op mode; the region layer connecting several cities; a Luau twin of `engine/` if a Roblox port
is ever wanted — the restricted subset in the engine core is what keeps that door open.

---

## Parallel lanes

**Content lane** — starts at Wave 1, runs continuously.

| Step | Output |
|---|---|
| C0 | `specs/art-direction.md` settled by the 1.2b probe, before the first production asset |
| C1 | Asset bake (`tools/build_assets.mjs`), texture atlas, asset gallery page for screenshot diffing. **Procedural for a 3D style; a hand-drawn sprite style cannot be baked and changes this lane from a tool into a hiring decision** |
| C2 | Buildings by tier as Wave 1–3 needs them; vehicles for 3.3 |
| C3 | Advisor and supporting characters for 4.2–4.3 |
| C4 | Audio bank for 4.4 |
| C5 | Writing: quests, advisories, character voice, English and Norwegian, key-identical and enforced by test |

**Tooling lane** — each tool lands with the wave that first needs it: fixture runner and chaos
injector (0.4), soak driver (1.4), balance sweep and analyser (2.3), event census (2.6), saturated
fixture generator (3.4), UI acceptance (4.1), multi-client harness (5.1), server profiler and host
probe (6.3).

---

## The next ten slices

*Written 2026-08-28, after Waves 0–2 and the renderer. Ordered by dependency and
by what unblocks a decision. Sizes are rough: **S** a sitting, **M** a day,
**L** more than a day.*

| # | Slice | Size | Why now | Done when |
|---|---|---|---|---|
| **N1** | **Level of detail** — configurable triangle budget (`setBudget`, default 80k); resolvability gate drops what cannot be seen, budget gate steps down a fixed ladder | M | The detail pass measured 201k triangles against an 80k budget. This is the one blocking number, and it blocks *every* later visual decision including the style choice | **Done.** Saturated 128×128 sixteen-seat region: 19k–69k triangles across every zoom from span 12 to span 180, against the 80k budget. Enforced against three.js's own counter after an actual render, not against the estimate (ruling 019). `test/lod.test.js`, 13 tests |
| **N2** | **1.2b decision and `art-direction.md` §3** | S | The content lane cannot start until the style is picked, and the probe is rendered and waiting. **User decision, not mine** | **Done.** P13 chose **plain** — soft cool light, bright cosy palette, shadows (ruling 022). §3 written with real hex values, the lighting rig, silhouette rules and the height/value/detail ladders. `test/docs.test.js` compares the documented palette against `palettes.js` so the two cannot drift. **Lane C1 is unblocked** |
| **N3** | **Input and tools** — pointer and touch, camera pan/pinch/twist, drag-paint with RLE coalescing, ghost preview, cost preview, undo | L | The renderer draws a city nobody can touch. This is the first slice where a person can actually play, and everything after it is judged by hand rather than by soak | **Done.** `tools/play_smoke.mjs` drives `index.html` with real pointer events on a 1280×720 mouse viewport and a 390×844 touch one: a dragged road appears with no holes, undo removes the whole drag, a dragged rectangle zones, the camera rotates and pans, and a road + zoning + plant + pump grows the city to pop 16 by tick 300. 15 checks, both viewports. `test/input.test.js`, 24 tests |
| **N4** | **HUD and overlays** (slice 4.1) — top bar, RCI bars, alert area, build toolbar, inspector, the eleven overlays | L | Once N3 exists the simulation is invisible: no money, no demand, no diagnosis. Overlays are also the design's answer to "every action has visible consequences" | **Done.** `tools/ui_smoke.mjs`, 54 checks: every toolbar button hit-tested by coordinate for a 44px target, the tool it selects and the state it reports; undo and speed; all eleven overlays render in ≤4 extra draw calls and produce **eleven distinct images**; the inspector opens on tap; the phone layout does not scroll sideways and leaves 59% of the screen to the city. `test/overlays.test.js` and `test/hud.test.js`, 28 tests |
| **N5** | **Save and load in the client** — IndexedDB, autosave, slots, export/import | M | The engine half is done and tested; the client half is what makes a session survive a closed tab. Also the last piece of the singleplayer MVP that is pure plumbing | **Done.** `tools/save_smoke.mjs`, 15 checks: builds a city, saves, **closes the page**, opens a fresh one in the same origin, loads, and compares state hashes — `fa545978cf5a3b39` both sides. Export/import round-trips to the same hash; a foreign file is refused; the autosave takes its own slot and does not touch a manual one. `test/storage.test.js`, 10 tests |
| **N6** | **Events and disasters** (slice 3.2) — wildfire, flood, storm, quake, industrial accident, blackout; telegraphing and recovery | L | Wave 3's first half. Fire exists; the rest of `gamedesign.md` §12 does not, and disasters are where the civic systems earn their keep | **Done.** All seven majors, one at a time, each telegraphed a month ahead. `tools/disaster_soak.mjs` over 200 games × 25 years: 356 strikes, every type fired (44–55 each), no city left unrepairable at the moment of damage. Three cities declined to nothing afterwards — confirmed disaster-caused by a disasters-off control run, reported as an **economy finding for N8** rather than tuned away. `test/disasters.test.js`, 16 tests |
| **N7** | **Traffic** (slice 3.3) — monthly O/D flow assignment over the road graph, congestion effects, sampled vehicles following real flow | L | The largest missing system, and the one the plan flags as the expensive one. Vehicles are currently parked decoration; they should move because people commute | **Done.** One multi-source BFS distance field from all jobs, then downhill walks per home — O(road tiles + homes × route). `tools/traffic_gate.mjs`: **0.70ms median** on a saturated 128×128 (8,899 road tiles) against an 8ms share of the month tick. Across 200 games congestion correlates with people-per-road **r=0.547** and with the seed **r=-0.075**. `test/traffic.test.js`, 9 tests |
| **N8** | **The balance sweep and era 1** (Wave 3 gate) | L | Everything measured so far is era 0 on 20 seeds. Three debts are already logged | **Done.** `tools/sim_sweep.mjs`, 200 games × 4 configurations. **Era 1 pinned** (`reports/balance-era1.md`). Pollution average fixed (0 → 8, it divided by the region instead of developed land); industrial demand settled by measurement (p95 294 against a cap of 1500); **runaway treasuries accepted, not fixed** — median 1.9M, p95 3.8M, and the obvious lever re-measured the era-0 failure it already recorded |
| **N9** | **Advisor and quest engine** (slice 4.2) | L | With N3 and N4 the game is playable but says nothing | **Done.** Quests are pure JSON over a **closed** condition language, validated at load. 13 authored quests across tutorial, growth, service, environmental and character, including a branch whose choice gates later quests. Advisor panel in the HUD. `test/quests.test.js`, 16 tests |
| **N10** | **Tutorial chain and the MVP acceptance script** (slice 4.3) | M | The thirteen criteria in `gamedesign.md` §24 are the singleplayer MVP definition, and an automated script is the only honest way to claim them | **Done. 13 of 13.** `tools/mvp_acceptance.mjs` drives the real page on desktop and a 390×844 phone viewport, using pointer events at coordinates. Two criteria are honestly partial and say so: whether the loop is *satisfying*, and whether touch is *comfortable* |
| **N11** | **The interface catches up with the engine** (P16, P17) — build menu, tax and budget panel, i18n for the whole HUD, and an acceptance script that drives the interface instead of reaching past it | M | The audit found the toolbar had no way to place a building, so no plant, so no water, so **no human player could grow a city** — while the acceptance script reported 13 of 13 by calling `apply()` for exactly the two criteria that are about the interface | **Done.** Twelve buildings reachable from a build row that quotes the difficulty-adjusted price; footprint ghosts; a tax slider wired to `CMD_SET_TAX`, which had existed since the economy slice with nothing to send it; 227 i18n keys in both locales with the HUD's own strings scanned by test. `tools/mvp_acceptance.mjs` 13 of 13 with criteria 3, 7 and 9 driven by pointer and slider (ruling 026); `tools/ui_smoke.mjs` 90 checks. `test/hud.test.js` refuses a catalogue building the menu cannot reach |

| **N12** | **A city you chose** (P19) — the new-game screen as `client/lobby/`, and slice 4.3's quest content finished and localised | M | The audit found the game could only ever play one city: seed and size were URL parameters, difficulty was not even that, and three difficulties balanced across 200 games each in era 1 were unreachable | **Done.** Size, difficulty, terrain, water, disasters and seed chosen by pointer, with the region named and previewed — and the previewed region is the object handed to `startGame`, not a second generation of the same seed. A URL naming a seed skips the screen, so a city is a link. Quests 13 → **20** (10 tutorial, 5 milestone, 3 civic, 1 disaster, 1 character), every string in both catalogues. `tools/lobby_smoke.mjs` 26 checks; the region namer fixed against 400 measured regions |

| **N13** | **The game says what it is doing** (P20) — refusal feedback, the settings screen, Continue, and the reachability sweep as a test | S | The audit found that **every refused action in the game's history showed "0 tiles" and no reason**: seven `result.*` strings carried in both catalogues since the first commit, handed to a `setPreview` that ignored them | **Done.** Refusals name their reason, before the click as well as after; a build you cannot afford turns the ghost red. Settings panel (language, high contrast, reduced motion) as a native `<dialog>`; Continue resumes the newest save hash for hash. `test/reachability.test.js` (ruling 027) requires every catalogue key to be reachable or listed with its slice. `tools/lobby_smoke.mjs` 46 checks |

| **N14** | **The keyboard half of 4.5** (P21) — real toolbar navigation, tool shortcuts, keyboard panning, 200% text, and the debug hook that never existed | S | `plan-v1.md` names "keyboard-only and 200%-text passes" as 4.5's gate and neither had been measured. Worse, four rows carried `role="toolbar"`, which **announces** a keyboard pattern — so the game was telling assistive technology to press keys that did nothing | **Done.** `tools/a11y_smoke.mjs`, 21 checks: one tab stop per toolbar, arrows walk and wrap, Home and End jump, eight tool shortcuts, arrows pan from the map and not from a toolbar, an open dialog owns the keyboard, and 200% text clips nothing on either screen at either size. Ruling 028. `?debug=1` no longer replaces the game with an error screen |

| **N15** | **Statistics and the minimap** (P22) — slice 4.6 in full, and 4.1's last piece | M | 4.1 asked for "minimap integration" and 4.6 for history with plain-language interpretation; neither existed, and the statistics screen is §30's accessibility answer as much as §15.5's usability one | **Done.** `engine/history.js`: one integer sample a month, oldest first, capped at 240, **hashed and saved**, reaching all five places. Ten series, each with a sparkline, a trend that knows up from better, and an explanation sentence that doubles as the chart's text alternative. Minimap painted once into an `ImageData` and blitted, viewport box on top. `test/history.test.js` (16), `test/minimap.test.js` (7); `ui_smoke` 99 checks |

| **N16** | **Finishing N15** (P23) — the minimap's cache invalidation and its ARIA role | S | An audit of N15's own code: the minimap repainted only when the PLAYER built, so growth, fire and disasters never reached it; and it carried `role="img"` while being focusable and handling keys, which is ruling 028's defect in the slice written after the ruling | **Done.** Repaints when `state.tick` moves — proved stale first (346 road tiles added, image byte-identical), then proved fixed. Now a picture and nothing else; the keyboard path is N14's arrow-key panning, which aims. `ui_smoke` 101 checks |

| **N17** | **The tripwire that was never built** (P24) — slice 0.4's fixture half | M | `test/fixtures/` was empty while 0.4 was marked done, `CLAUDE.md`'s "hashed fields live in two places" described one place, and the `/fixture-repin` skill documented a ritual for artefacts nobody had written. Four slices added hashed state with nothing watching | **Done.** `tools/fixtures.mjs` replays a fixture and checks **every step's** hash, result and event kinds; `tools/repin.mjs` requires a written reason and refuses to re-pin over event drift. Three fixtures: `empty`, `founding` (grown to 156 residents), `two_player`. `test/fixture.test.js` holds the second copy of the hashed-field list, so a hash change is finally the two-file act `CLAUDE.md` promised. Verified by planting a balance change and watching it name the step |

| **N18** | **Audio** (slice 4.4) | M | The last silent thing in the game, and the slice with the sharpest gate: audio must be derived from state only | **Done.** Web Audio oscillators and a noise buffer — no sound files, because zero dependencies and no build step make an audio bank a vendoring decision rather than a slice. Feedback, notification (collapsed, ranked, capped at three a tick) and ambience. The gate as a test: two identical cities ticked 120 times, one with every event fed to the audio model, `hashState` equal. `settings.sound` and the two volume rows became real |
| **N19** | **The PWA half of 4.5** | M | "The app installs and plays with the network disabled" had never been measured, and there is no build step to produce a precache list | **Done.** `manifest.webmanifest`, two SVG icons, and a service worker keeping one versioned cache whose version is a hash of the cached bytes — the handshake without a build step. `test/pwa.test.js` regenerates the precache list and fails when it is stale. `tools/offline_smoke.mjs` turns the network off and then plays: the screen opens with its strings, a city starts, a road is built by pointer, the clock runs, a save round-trips hash for hash. **The version handshake was never triggered** — a browser re-installs a worker only when the worker's own bytes change — so no new build reached a returning player until N28 (ruling 031) |

| **N20** | **Department funding** (gamedesign.md §9.4) | S | The last named gap in the singleplayer design, and the one whose absence a code comment actively denied — `coveragePass` claimed coverage fell off "with distance and with funding" while `strength` was a flat 100 | **Done.** `state.funding` per service, hashed; coverage and upkeep both scale with it; a rate outside 50–150 is refused rather than clamped. Three steps in the budget row. **The first real use of the N17 tripwire**: all three fixtures moved and were re-pinned with a written reason |

| **N21** | **Ready to playtest** (P25) — naming, the controls card, double-click focus | S | Two things a playtest hits in its first minute and neither existed: §5.1's step one is "the player names the city and mayor", and a player who forgot a shortcut had nowhere to look — the only place any key was written down was the map canvas's `aria-label` | **Done.** City and mayor names as the game's only typed fields; the city name is a hashed lobby option, sanitised through the engine's own `sanitiseText` so box, link and checksum agree. An unnamed city takes its region's name. A controls card on `?` whose tool half is **derived from `TOOLS`**, so it cannot advertise a key that does not exist. Double-click focuses (§13.4) |

| **N22** | **`./run.sh` was broken** (P27) — the CSP blocked the importmap | S | Kjell opened localhost and got "Failed to resolve module specifier three". `tools/serve.mjs` sends `default-src 'self'` with no `script-src`, which blocks the inline importmap — and **all eight gates stand up their own server**, so none of them ever ran the one `run.sh` starts | **Done.** The server hashes every inline script in `index.html` at startup and puts those hashes in `script-src` — hashes, not `'unsafe-inline'`, and computed from the file served so the policy cannot drift. `tools/serve_smoke.mjs` spawns the real server, loads the bare origin, listens for **console** errors as well as page errors, and starts a city |

| **N23** | **The map was lying** (P29) — zoning, power lines and water mains were not drawn | S | A playtest: "trying to zone an area, but nothing keeps… only roads work". Three real rendering gaps, not a UI preference | **Done.** Empty zoned lots take a tint that fades once built on; power lines draw on every tile they cover rather than every third (LOD dropped poles below 14px/tile); water mains were behind `options.underground === true`, which **nothing anywhere passed** — they had never been rendered. Verified by pool counts on the real page. The start screen also got §26.3's diorama |
| **N24** | **The interface the playtest asked for** (P29) | M | The bottom panel was seven stacked rows at 55% of a phone screen | **Done.** One bottom bar with a **Build** popover; a **left rail** with drawers for overlays, tax and saves; **Auto** as the default overlay, following the tool; three UI skins as custom properties. Chrome **56% → 32%** on a 1280×720 window. Found on the way: `[hidden]` hid nothing (any class rule setting `display` beats it — the minimap's own toggle had never worked) and 61 rules used system colours `--bg`/`--fg` could not reach, so high contrast had done almost nothing since N13 |
| **N25** | **Docs, and the collisions the restructure left** (P30) | S | Moving four things at once left the advisor under the rail, and two gates checked that an attribute landed rather than that it changed a pixel | **Done.** The advisor and inspector became a right-hand column (the advisor had been at the top of the LEFT edge, exactly where the rail went — the tutorial guide, under the overlay buttons). `a11y_smoke` now asserts high contrast and each skin **repaint** real computed colours. `test/overlay-auto.test.js`. Q21 answered as **A25** |

| **N26** | **Can every function be reached?** (P31) | S | The restructure put 40 of 60 controls behind a rail, three drawers and a popover. That is the right trade and it is also how a control goes missing — nothing errors, the button is simply somewhere nobody finds | **Done.** `tools/reach_smoke.mjs` walks the HUD, works out what each control is behind, opens it the way a player does, and asserts a click at its centre lands on it. Every one is reachable. It also found the reverse: `#hud > *` sets `pointer-events: auto` and out-specifies a class, so two invisible columns were swallowing **101 of 403** clicks on the map — a quarter of it, including the whole right-hand third (ruling 029) |

| **N27** | **Three things the playtest asked for** (P32) — a × on the right-hand cards, utilities that read as connected runs, and the right mouse button | S | A card that cannot be closed is a card that covers the city for ever; wire and pipe drew one square per tile with a gap at every boundary, so a run of ten read as ten dots; and the right and middle buttons were **dropped by an early `return`** under a comment claiming they panned | **Done.** Wire and pipe draw a hub plus an arm towards each neighbour their connection mask names, so runs close across tile boundaries — thin grey poles and lines, wider blue mains, each in its own style. Right-drag steps the four snapped yaw angles (ruling 006), middle-drag pans, both with a tool still in hand. The advisor and inspector take a labelled ×; a card **waiting for a decision keeps none**, because closing it would take the only two buttons that answer it off the screen (ruling 027). `reach_smoke` gained both cases; a stale-handle bug in that gate is fixed — the advisor rebuilds its innerHTML, so a walk holding a marker reported a working control as missing |
| **N28** | **The build the playtest never received** (P33) — a client that can replace itself, right drag that pans, and ground layers that close up | S | Two of the three items in P33 were reports about code that shipped in N27 and could not arrive: sw.js keys its cache on a manifest version but a browser only re-installs a worker whose OWN bytes change, and sw.js is static, so `install` ran once in the player's first session and the cache-first handler served that build for ever | **Done.** The worker is registered at `./sw.js?v=<version>` and the page reloads once when a new one claims it (ruling 031); `tools/update_smoke.mjs` deploys twice and checks the player is running the second build. Right drag now **pans**, which is what P32 asked for — N27 had put snapped rotation there, which from the hand reads as nothing happening and then the world flipping; rotation keeps the wheel button, and `play_smoke` now presses both. Wire and pipe are one width end to end, cross a road instead of vanishing under it, and every ground layer hangs a skirt below its top face, which closes the green seam roads showed across every slope (ruling 030, amended) |
| **N29** | **The camera is an orbit, and a junction looks like a junction** (P34) | S | The right button had been changed twice and still did what the left one did; and the road markings were one centred dash per tile turned to the tile's axis, so a crossroads got a single stripe pointing one way | **Done.** Right drag orbits — sideways turns freely, up and down tilts between 12° and 82° — and middle drag pans, so the three buttons finally do three things. Ruling 006 amended: the four snapped angles are what Q, E and the two-finger twist give, and `rotate` now snaps from wherever a drag left the camera. `visibleBounds` reads the pitch (1/sin), or a low camera's distance is culled away. Road markings are drawn from the connection mask: a dash on a straight run, two arms meeting at a corner, an arm per approach stopping short of the middle at a T or an X |
| **N30** | **The budget was counting a fiction** (P35, review round) | S | Nothing compared the LOD planner's estimate with what three actually drew, so N28's skirts went unpriced: the planner believed 79,068 triangles while the renderer drew 97,500, over an 80,000 budget with the whole sacrifice ladder already spent | **Done.** A road is painted into the terrain mesh — seamless by construction, and 29,868 triangles lighter; the network ribbons are quads again (−48,600). Ground and prop costs are **measured** like buildings and trees, markings are counted per junction, wire and pipe are in the estimate at all, and casters count once because the shadow pass moves three's counter by exactly zero. Estimate against actual: **1–5%** across four zooms, from 38–92%. `tools/budget_gate.mjs` is the gate that was missing; `lobby_smoke`'s resume-side tick race is closed |

## Proposed lane — The city you can zoom into (P36)

*Written 2026-09-05 from two reference shots the user supplied
(`debugging/transport-world-example.png`, `transport-world-2.png`). **Superseded
the same day by P37**: the lane is now the first third of **cityviewer**, the
renderer rebuilt to match `../fable51-worlds/` — see `specs/engine/` and rulings
032–040. Q24 and Q25 are answered (A26, A27); V4 and V5 below are amended
accordingly. The whole lane is still cosmetic: it changes no rule, no number and
no hash.*

**What the reference has that we do not**, in the order it hits the eye:

1. **Individual moving vehicles**, queueing bumper-to-bumper where a road is
   full. We draw parked cars on 28% of road tiles and nothing that moves.
2. **Ground that does not read as a checkerboard.** Our terrain is one flat
   colour per tile, deliberately ("a city grid wants to read as tiles"); at the
   zoom the reference uses, the patchwork is the first thing you see.
3. **Real relief.** `HEIGHT_SCALE` is 0.02 and elevations span ~8 levels, so a
   whole map has about a sixth of a tile of height in it. The reference has
   hills a city block tall.
4. **Perspective.** The reference converges; we are orthographic by
   construction (ruling 006), which at a low pitch reads as a diagram rather
   than a place.
5. **Richer lots** — front gardens, fences, more silhouettes and colours.

| # | Slice | Size | Why | Done when |
|---|---|---|---|---|
| **V1** | **Traffic you can see** — moving cars driven by `state.tiles.traffic` and the road connection mask | M | The engine has computed a per-tile commuter load since N7, it is hashed state, and the only thing that reads it is an overlay tint and one inspector row. The single largest gap to the reference, and the one that needs no new rules | Cars stream along a road at a speed that falls with load and bunch up where it is over capacity; the whole thing is **renderer-side** — position is `time × speed + a per-tile hash`, so no float and no entity enters state and no hash moves. Cars have their own rung on the LOD ladder and a per-tier cap |
| **V2** | **The quality setting** — Low / Medium / High, defaulted from `deviceClass()` | S | `createScene` already takes `pixelRatio`, `antialias`, `shadowMap`, `triangleBudget`, `trees`, `props` and `shadows`, and **nothing sets any of them**; `deviceClass()` has been written and unused since N12; `settings.reducedEffects` is a catalogue string with no screen. The tier is mostly wiring that exists | **Done (slice V2).** Three tiers in `data/cityviewer.json`, defaulted from `deviceClass()`, remembered, applied live without a reload; a pure frame-time governor (p95 over 60 frames, ink → shadows → supersample, never handed back); `budget_gate` at all three tiers plus the opening span. The Low tier did not fit its own budget until the ladder gained a **networks** rung — the two utility ribbons are 43% of the frame on a wired city (Q27). `ui_smoke` hit-tests the row: 101 → 108 checks |
| **V3** | **Ground that is not a checkerboard** | S | See 2 above | Natural terrain blends across tile corners; **built and zoned land keeps its flat tiles**, because that is what makes a grid legible. One knob, checked by screenshot at three zooms |
| **V4** | **Real relief** (ruling 038) | M | See 3 above. `RELIEF_M = 0.5`; a road is a corridor that owns the ground inside its half-width, so it climbs without breaking | `heightAt` in `client/world/` is the one ground; buildings seat on the lowest lot corner; picking marches the height field; every remaining flat layer — markings, zone tint, lawn, overlays, ghost — is re-checked for the seam class of bug at full relief |
| **V5** | **Perspective play camera** (ruling 034) | M | See 4 above | Perspective is the camera the game is played from; orthographic stays as a mode and the phone default; the four snapped yaws snap in every mode. `pixelsToTiles`, the LOD's `tilePixels` and `visibleBounds` become per-chunk. Ahead of the street lane |
| **V6** | **Lots with something on them** | L | See 5 above | Front gardens, fences and hedges, more silhouettes per category, wider roof and wall colour range. Pure content against the existing kit |

**Sequencing.** Set by `specs/engine/11-roadmap.md`: E0 → V2 → E1 → V1 → V3 →
V4 → V5 → P1 → E2 → E3 → E4 → E5 → E6 → P2, with V6 and E7 when wanted.

## Proposed lane — cityviewer (P37, rulings 032–040)

*The renderer rebuilt to match fable51-worlds, in place, behind the interface
`game.js` already calls. Specification: `specs/engine/`. Sizes and definitions
of done are in `specs/engine/11-roadmap.md`; this table is the index.*

| # | Slice | Size | Depends on |
|---|---|---|---|
| **E0** | **The city model** — `client/world/`: `TILE_M`, `heightAt`, corridors from masks, lots and frontages, the building parameter function; node-tested; gate is a pixel-identical picture. **Done 2026-09-05**: 21 model tests, `instances.js` reads every building through `buildingParams`, both screenshots byte-identical before and after, `client_smoke` green | M | 035 |
| **E1** | **Lane graph** in the model | S | E0 |
| **E2** | **The baker and the chunk cache** — vertex-colour merge per 16×16 chunk, keyed by content hash, one build a frame | M | E0, 039 |
| **E3** | **Ribbons** — carriageway, kerbs, sidewalks, junction boxes, a marking canvas per chunk | M | E2, V4 |
| **E4** | **Street camera and collision** — walk controls, walls from lots, patches from sidewalks, enter and exit; `walkthrough` and `passability` gates | M | E3, V5 |
| **E5** | **Street-level facades** — the generated spec, four category grammars, roofs with eaves, openings built outward, signage canvases, emissive buckets | L | E2, P1, 036 |
| **E6** | **Time of day** — presets per rig, clock-driven with an off switch, lit windows, lamp pools, a following snapped shadow frustum | M | E5 |
| **E7** | **Pedestrians** — nav graph, commuters and shoppers, signal waiting, a simplified rig | M | E4, E6 |
| **P1** | **Toon shading and the anime rig** — `shading: 'toon'`, ramps, the shadow-tint patch, a painted palette | M | V2, 033 |
| **P2** | **Ink and grade** — depth-texture target, second-difference ink, split-tone grade, FXAA; desktop tier, governor-gated | M | P1, V2 |

**Sequencing note.** N1 and N2 are both small and both unblock everything
visual, so they come first even though N3 is the more interesting work. N8 sits
deliberately after N6 and N7: tuning a balance before disasters and traffic exist
would be tuning the wrong game, and the sweep is expensive enough that it should
be run once against a complete simulation rather than three times against
partial ones.

**What is NOT in the next ten.** The whole multiplayer lane (M1–M6) stays behind
the singleplayer MVP by ruling 003 — the server is expensive and must not be
built on an unproven loop. Audio, accessibility and PWA (slice 4.5) come after
N10 for the same reason: they polish a game that has to be worth polishing first.

## Open questions

**`dev-questions.md` is the live list** — its bottom section holds everything still open, and its
top section keeps every answered ruling with the reasoning that produced it. The table below
mirrors it; the numbers match. User prompts are recorded verbatim in `dev-prompts.md` and cited
by number from the code they create.

| # | Question | Blocks |
|---|---|---|
| Q18 | Which mayor ranks unlock which advisor personas, and does the player then pick freely? | C3 |
| Q19 | In a split-income room, does a seat in regency still receive its share? | 6.1 |
| Q20 | When a player leaves permanently and their land is released, what happens to their money? | 5.4 |
| Q27 | Is dropping the utility ribbons the right ladder rung for a Low tier? | V2, reversible |

## What would make us stop and re-plan

- Wave 1's gate cannot be met: a town does not grow on its own across five seeds. The demand and
  development model is wrong and no amount of later work fixes it.
- Wave 3's traffic assignment cannot meet the month-tick budget at 128×128. Either the map size
  goes, or traffic becomes coarser — decide with numbers, not preference.
- The singleplayer MVP is not fun. Wave 5 is expensive; it must not start on an unproven loop.
- Hash divergence between client and server survives a week of investigation. The whole
  multiplayer design rests on one engine producing one answer.
