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

## The slice ritual

Every slice, without exception: tests written first → implementation → suite double-run green →
the wave's gate → a `dev-log.md` entry naming what was measured → docs and memory synced.
Commit prefix `slice-`. A slice that cannot state its gate is not a slice yet.

---

## Wave 0 — Foundation

No gameplay. This wave exists so that every later slice has a gate to run.

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 0.1 | **Repo and harness** — layout per `plan.md` §1, importmap, no-build static serve, `run.sh`, `test.sh`, `node --test` wired, `CLAUDE.md` working rules, `dev-log.md` started | — | `./test.sh` runs green twice in a row on an empty suite; the client serves a blank page with no console errors |
| 0.2 | **Deterministic primitives** — `prng.js` (xorshift32, state in game state), `idiv.js`, `grid.js` (index and neighbour helpers), `canonical.js`, `statehash.js` (FNV-1a 64, rejects float/null/NaN), `protocol.js` (version + build hash) | 0.1 | Pinned test vectors for the PRNG sequence and for three known state hashes; the hash function refuses an illegal value in a test |
| 0.3 | **State and reducer skeleton** — SoA allocation including `owner` and `district`, `GameOptions` record hashed into initial state, command envelope with `actor`, `TICK`, `copyState` with deep copies, the restricted-subset lint for `engine/` | 0.2 | 1000 empty ticks are hash-stable and allocation-free; the subset lint fails on a planted `class` and a planted `Map` |
| 0.4 | **Test drivers** — JSON fixture runner, soak driver skeleton, chaos injector skeleton, event-census probe | 0.3 | `test/fixtures/empty.json` passes; the chaos injector fires 10k random malformed commands without corrupting state or throwing |

---

## Wave 1 — The city canvas and the core loop

The wave that answers "is this a game". Everything here is singleplayer, one seat, `owner = 1`.

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 1.1 | **Terrain generation** — seeded, with style (flat/rolling/hilly), water (none/lakes/river/coastal/archipelago) and tree density; district partition following terrain with a fairness score; region identity naming | 0.3 | Same seed and options produce an identical map hash on two runs; a 200-seed sweep reports fairness spread and zero degenerate maps (no buildable land, no water) |
| 1.2 | **Renderer bootstrap** — vendored three.js, WebGL2 probe with an honest unsupported screen, chunked terrain geometry, orthographic camera with snapped yaw and zoom-to-cursor, grid picking by ray-plane maths, ghost preview, 2D minimap painted from state | 1.1 | A screenshot test renders a known seed identically under SwiftShader; picking returns the correct tile at four zoom levels and all four yaw angles |
| 1.2b | **Style probe** — one pinned 16×16 city block from a real save, rendered through the real renderer in three candidates, all within the mesh pipeline so all four camera angles work: **(a) clean low-poly toy diorama** — flat colour, baked shading, cozy palette; **(b) pixel-art post-process** — the same meshes rendered to a low-resolution target with nearest upscale, palette quantisation, dither and outline, for the look of the reference screenshot with rotation intact; **(c) higher-detail hand-painted atlas** — richer silhouettes and texture, closest to a modern isometric builder | 1.2 | Three candidates × two zoom levels × phone and desktop, screenshotted; draw calls, triangles and frame time measured for each; a written note on cost per building state and on how each survives the territory overlay and sixteen player colours. **Style chosen and `specs/art-direction.md` settled** |
| 1.3 | **Roads and the permission gate** — `PLACE_ROAD` with path input, auto-connect shape table, instanced road rendering, transactional commit with cost preview, `BULLDOZE`, undo of one transaction, **`engine/permissions.js` with every command routed through it**, `owner` written by every placement | 1.2 | The permission matrix test passes (every command × every ownership relation); a drag of 400 tiles is **one** command; an illegal edit is refused identically by two independent engine instances |
| 1.4 | **Zoning, lots and development** — zone paint (pencil, rectangle, brush), road-access check, lot aggregation to 1×2 and 2×2, **regional RCI demand pool**, growth and decay scoring, building instancing keyed by category/level/value tier | 1.3 | Soak: five pinned seeds each grow a self-sustaining town of 500 residents within 20 city years with no manual intervention; the demand pool allocates correctly with one seat (the multi-seat path is tested in 6.1) |
| 1.5 | **Save and load** — IndexedDB, schema v1, three rotating autosaves plus five manual slots, export and import, migration framework and the fixture corpus | 1.4 | Save → reload → hash identical; a planted v0 save migrates and hashes correctly; the corpus test runs on every suite |

**Wave gate:** the soak driver grows five seeds for 40 city years with per-tick invariants green,
and the event census shows every implemented system firing.

---

## Wave 2 — Utilities, money and civic services

| # | Slice | Depends on | Done when |
|---|---|---|---|
| 2.1 | **Power** — coal, gas, wind and solar plants, wire drawing, union-find components with dirty rebuild, capacity versus demand, brown-outs, power overlay | 1.4 | A 200-building grid rebuilds in under 2 ms after an edit; no phantom outage over 20 city years in soak |
| 2.2 | **Water** — pumps, treatment, towers, underground pipe network with an automatic underground view, water quality, dry tiles, overlay | 2.1 | Contaminating a source measurably reduces downstream quality and health within a year, verified headlessly |
| 2.3 | **Economy** — construction and maintenance costs, three tax sliders with lagged effect, department funding, monthly budget, loans, bankruptcy warnings, budget panel | 1.4 | Sweep across difficulty tiers: solvency curves are sane, no tier is unloseable or unwinnable; tax changes take effect over several months, not instantly |
| 2.4 | **Service coverage** — police and crime, fire risk, hospital and health, coverage deposits and smoothing, funding effects, coverage overlays | 2.3 | Halving a department's funding measurably shrinks coverage and raises the matching problem within two years |
| 2.5 | **Pollution and land value** — sources, spread, decay, land value inputs and penalties, both overlays | 2.4 | Land value responds to parks, water, pollution and crime in the documented directions, asserted per input |
| 2.6 | **Fire incidents** — ignition, spread, response vehicles routed over roads, extinguish rate from coverage, ruins and rebuilding | 2.4 | Fires start, spread, are fought, and leave recoverable damage; response time degrades measurably with congestion |

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

## Open questions

**`dev-questions.md` is the live list** — its bottom section holds everything still open, and its
top section keeps every answered ruling with the reasoning that produced it. The table below
mirrors it; the numbers match. User prompts are recorded verbatim in `dev-prompts.md` and cited
by number from the code they create.

| # | Question | Blocks |
|---|---|---|
| Q13 | Post-v1 only: is a drawn-sprite pipeline ever funded — four sprite sets per building state, hand-drawn, needing an artist — and is user-selectable style a Wave 7 goal? (Q1 is otherwise answered: one style at v1, mesh pipeline, chosen by probe 1.2b) | Wave 7 |
| Q2 | Advisor's character — name, tone, and how much personality is too much for a repeated tutorial voice? | 4.2 |
| Q3 | Music: three ambient tracks, or ambience only? | C4 |
| Q4 | Is Norwegian a first-class launch locale or a later addition? | C5 scope |
| Q5 | Default room privacy: are public rooms with strangers a supported case at v1, or is v1 friends-only by join code? Decides how much moderation tooling 5.3 needs | 5.3 |
| Q6 | Should chat exist at v1 at all, or are pings enough? | 5.3 |
| Q7 | Derelict threshold and abandonment grace — five city years each, or longer? | 5.4 |
| Q8 | Do you want a hosted public server, or is v1 self-host and LAN only? Decides whether 6.4 needs the master index at all | 6.4 |
| Q10 | If measurement says 128×128 with sixteen seats cannot hold the frame budget on mid mobile, do we cut the map size or ship it desktop-only? | 6.3 |
| Q11 | Should Shared City default to a shared treasury or separate ones? It changes how co-op feels more than any other single option | 6.1 |
| Q12 | Campaign scenarios (`gamedesign.md` §4.1) are not in v1. Confirm they are post-v1 | scope |

## What would make us stop and re-plan

- Wave 1's gate cannot be met: a town does not grow on its own across five seeds. The demand and
  development model is wrong and no amount of later work fixes it.
- Wave 3's traffic assignment cannot meet the month-tick budget at 128×128. Either the map size
  goes, or traffic becomes coarser — decide with numbers, not preference.
- The singleplayer MVP is not fun. Wave 5 is expensive; it must not start on an unproven loop.
- Hash divergence between client and server survives a week of investigation. The whole
  multiplayer design rests on one engine producing one answer.
