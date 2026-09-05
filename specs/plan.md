# City Grid — implementation plan

Title of record: **City Grid** (supersedes the working title "Pocket Metropolis" in
`gamedesign.md`). Design of record: `specs/gamedesign.md`. Mechanical reference:
`specs/referencedata.md`. Stack and practices adopted from `../Retrogradegames/`
(`game-stack-overview.md`, `game-stack-revised.md`).

Revision 2 folds in the multiplayer requirements: fully client-side singleplayer, a lobby,
drop-in/drop-out for up to 16 players, no direct destruction of another player's work, an
optional exclusive-sector mode, and several game modes.

Revision 3 closes the gaps found in review: multiplayer simulation semantics (§2.6), persistence
and replay-log growth (§2.7), protocol versioning against a cached PWA (§3.9), ops (§3.10),
communication and moderation (§4.5), session lifecycle (§5.4), unlocks (§5.5), difficulty (§5.6),
audio (§7.2), accessibility (§7.3), drop-in onboarding (§7.4), platform support (§7.5), content
production (§8.1), and a disasters slice (S5b).

---

## 0. Decisions taken up front

| Question | Decision |
|---|---|
| Core architecture | Pure deterministic reducer `apply(state, command) → state`. No I/O, no clocks, no `Math.random` in `engine/` or `shared/`. |
| Language | JavaScript, ESM, **no build step**, importmap. Zero runtime deps in engine/shared. `three.js` vendored and pinned; `ws` is the only server dep. |
| Engine subset (ruled) | **`engine/` core only** is written in the restricted Lua-portable subset: no `class`/`this`, no `Map`/`Set`, no exceptions, plain functions over plain objects and typed arrays, index math through named helpers, integer division through `idiv()`. `shared/`, `worker/`, `server/` and `client/` use idiomatic modern JS. The discipline is paid only where a Luau twin would need it, and it doubles as a readability constraint on the rules. |
| Singleplayer | **Fully client-side.** No server, no account, no network call. PWA-installable and playable offline; saves in IndexedDB. |
| Multiplayer | Same engine, server-authoritative **command relay with hash verification**. Clients apply the same command stream to a local engine copy; the server owns the state of record. |
| Transport | Node `ws` server, self-hostable, one process, join codes. The transport sits behind an adapter so a host-authoritative WebRTC variant (zero infrastructure) can be added later without touching the engine. |
| Cadence | 10 Hz pump (Fireline's proven rate and jitter tooling), but frames carry **accepted commands**, not snapshots — a city builder has no authoritative motion to interpolate. Server cost is flat in player count. See §3.6. |
| Players | 2–16, drop-in/drop-out, cap derived from map size. |
| Ownership | Every tile carries an `owner` id in hashed state. Ownership is checked in the reducer, not the UI — an illegal command is rejected by the engine on every machine identically. |
| Destruction | A player can never bulldoze another player's property. `REQUEST_DEMOLITION` creates a request entity (title, cells, reason, optional compensation); the owner approves or denies. Requests are game state, not chat. |
| Numbers | Integer only in state. Fixed-point where fractions are needed (`FP = 256`). No floats, no `null` (keeps a future Luau twin cheap). |
| Randomness | One xorshift32 PRNG whose state lives **inside** game state. |
| State layout | Structure-of-arrays typed arrays for the per-tile fields; buildings, players, requests, contracts, quests and incidents as entity lists. |
| Sim location | Always a Web Worker on the client (singleplayer *and* multiplayer, where it mirrors the authoritative copy); the server process is the authority in multiplayer. Never on the render thread. |
| Demand across players (ruled) | **One regional RCI pool**, allocated between players by relative attractiveness, in every mode. Taxes, services, commute time and pollution are therefore the real competition. See §2.6. |
| Session shape (ruled) | Rooms are **persistent worlds**, not matches, in every mode. See §5.4. |
| Unlocks (ruled) | Room-level, never per-player — a drop-in joiner is never handed a crippled build menu. See §5.5. |
| Build order (ruled) | **Singleplayer MVP first**, with ownership and the session seam built in from day one at one seat. Execution order lives in `plan-v1.md`. |
| Map sizes | 48×48 (≤4 players), 64×64 (≤8), 96×96 (≤12), 128×128 (≤16). |
| Density | MVP: one zone type per RCI that upgrades with land value (gamedesign §7.2 option 1). |
| Persistence | Singleplayer: IndexedDB, versioned + migrations. Multiplayer: server-side save + command log, seats resumable by token. |
| Licence posture | Original names/art/audio. `referencedata.md` is used as a **behavioural spec**, not as source: every formula is re-derived and re-tuned in `data/*.json`. No GPL code is copied, so City Grid ships MIT. |

---

## 1. Repository layout

```
citygrid/
  specs/        gamedesign.md, referencedata.md, plan.md, rulings/NNN-*.md
  data/         balance.json, buildings.json, zones.json, terrain.json, modes.json,
                quests/*.json, scenarios/*.json, i18n/{en,no}.json
  shared/       prng.js, idiv.js, grid.js, canonical.js, statehash.js, protocol.js
  engine/       reducer.js, state.js, permissions.js, systems/*.js   <- pure, no three.js, no DOM
  worker/       sim-worker.js                    <- singleplayer state owner
  server/       server.js, room.js, seats.js, lobby.js, store.js     <- multiplayer state owner
  client/       main.js, session.js, session-remote.js, transport/{ws,local}.js,
                render/{terrain,buildings,network,vehicles,overlay,camera}.js,
                ui/*.js (model/view split: pure *_model.js + thin DOM),
                lobby/*.js, input/{pointer,touch,keys}.js
  vendor/       three.module.js (pinned)
  test/         unit/*.test.js, scenarios/*.json, fixtures/, server/*.test.js
  tools/        sim_soak.mjs, sim_sweep.mjs, analyze_sweep.py,
                build_assets.mjs, screenshot.mjs, perf_native.ps1, multi_client.mjs
  debugging/    dbg_*.mjs (one-off probes, kept forever)
  dev-log.md    slice history — the real project history
  CLAUDE.md     working rules
```

Module soft cap ~300 lines, one subsystem per module, acyclic imports.

---

## 2. Engine model

### 2.1 Commands

Everything a player or the clock does is a command; a replay is `seed + options + command log`.
Every command carries `actor` (player id) and is validated against ownership and mode rules
inside the reducer.

```
TICK
PAINT_ZONE {cells, zone}           DEZONE {cells}
PLACE_ROAD {path}                  PLACE_WIRE {path}      PLACE_PIPE {path}
PLACE_BUILDING {defId, x, y}       BULLDOZE {cells}          <- own property only
SET_TAX {r, c, i}                  SET_FUNDING {dept, pct}
TAKE_LOAN {amount}                 TRANSFER_FUNDS {to, amount}
REQUEST_DEMOLITION {cells, title, reason?, offer?}
RESOLVE_REQUEST {id, approve|deny}   WITHDRAW_REQUEST {id}
SET_REQUEST_POLICY {policy}        REPORT_NUISANCE {cells, kind, reason?}
CLAIM_SECTOR {sectorId}            OPEN_BORDER {to, allow}
OFFER_CONTRACT {to, kind, units, price}   RESOLVE_CONTRACT {id, accept}
QUEST_ACCEPT / QUEST_CHOOSE {id, option}
SET_DEPUTY {dept, doctrine}
JOIN {name, seat}                  LEAVE {seat}           SET_SPEED_VOTE {n}
```

Placement is **transactional**: a command stages writes into a scratch buffer, prices the
whole edit (including auto-bulldoze of one's own rubble), then commits all-or-nothing or
fails with `OK | INVALID | NO_FUNDS | NEEDS_BULLDOZE | NOT_OWNER | OUT_OF_SECTOR |
MODE_FORBIDDEN`. The undo stack is the inverse of one committed transaction, and undo is
refused once another player's command has touched the same cells.

### 2.2 Tile state (SoA)

`Uint8Array`: terrain, elevation, zone, roadShape, wireShape, pipeShape, pollution, crime,
landValue, traffic, fireRisk, healthRisk, **owner**, **sector**. `Uint16Array`: buildingId.
`Uint8Array` flags bitfield: `POWERED | WATERED | BURNING | RUINED | ZONE_CENTRE | CONDUCTS |
PROTECTED`.

`owner`: `0` = nature/unclaimed, `1..16` = player seat, `255` = civic commons (border roads,
shared projects). `sector` is fixed at generation time and never changes; `owner` changes only
through claiming, gifting, abandonment or host action.

Coarse block maps (from `referencedata.md` §3.4, our own ranges): landValue/crime/pollution/
popDensity/traffic at 2×2; police, fire and growth cover at 8×8; smoothing passes on scratch
buffers that live outside the hash.

### 2.3 Systems

`terrain, sector, zone, development, roadNetwork, powerNetwork, waterNetwork, demand, economy,
traffic, serviceCoverage, crime, health, fire, pollution, landValue, ownership, request,
contract, quest, event, disaster, census, evaluation`.

Timing layers (gamedesign §18):

- **fast tick** (12/sim-month): utility flow, incidents, vehicle sampling, fire spread.
- **month tick**: taxes, expenses, demand valves, development/decay, quest and request expiry.
- **year tick**: milestones, rank, awards, evaluation, statistics history, abandonment sweep.

### 2.4 Network handling

Roads, wires and pipes are **incrementally maintained graphs**: union-find components with
dirty-component rebuild on edit, demolition or disaster. Each power and water component
carries `capacity`, `demand` and — in multiplayer — a per-owner accounting split so cross-border
supply can be billed through a contract instead of being free.

Traffic replaces the reference implementation's broken random walk: monthly, aggregate commuter
flow (residents → jobs) is assigned over the road graph with a capacity-aware integer Dijkstra
on a sampled set of origin/destination pairs. Commutes cross ownership borders freely — traffic
is a shared-consequence system by design, and one of the main reasons neighbours must talk.

### 2.5 Determinism machinery

- `shared/statehash.js`: FNV-1a 64 over canonical little-endian serialization; rejects illegal
  types (float, `null`, `NaN`). It is the save checksum, the desync detector, the replay verifier
  and the multiplayer acceptance gate — one function, one contract.
- Hashed fields live in **both** `statehash.js` and a local copy in the fixture test, so a hash
  change is always a deliberate two-file act.
- `copyState` deep-copies every nested mutable array on day one, including the new nested state
  (players, requests, contracts, sectors).
- Fixtures: `test/fixtures/founding.json` pins the singleplayer founding sequence;
  `test/fixtures/two_player.json` pins a join, a cross-border build, a demolition request and its
  approval, with every intermediate hash.
- Canonical serialization never depends on object key iteration order or on `sort()` stability —
  keys are emitted from an explicit ordered field list, entity lists are sorted by id.

### 2.6 Multiplayer simulation semantics

This is the part of the design that has no singleplayer equivalent, and it decides what the game
*is* between players. Ruled now because `demand` lands in S2:

- **RCI demand is one regional pool.** Residents, shoppers and firms belong to the region, not to
  a player. Each month the pool is allocated between eligible lots across all players by relative
  attractiveness — land value, tax rate, service quality, commute time, pollution. Undercutting a
  neighbour's tax rate genuinely pulls growth across the border; so does building the hospital
  they did not build. **This is the competitive core**, and it works identically in co-operative
  modes, where it simply means the city grows where it is best served.
- **Employment crosses borders.** Your residents may hold jobs in my district; the commute is
  assigned over the shared road graph and both of us feel the congestion. Neither player can
  wall off labour.
- **Service coverage crosses borders by default.** My fire station covers your street if it is in
  range. This is a gift, not a bug — it is what makes a neighbour worth having. `MUTUAL_AID`
  (lobby default on) can be revoked per-neighbour, which is a visible, attributable political act
  rather than a silent one.
- **Nuisances cross borders.** Pollution, noise and congestion spread on the block maps regardless
  of ownership. `REPORT_NUISANCE` is the civil channel; the systemic answer is that a polluter's
  own land value falls first.
- **Disaster liability.** Fire and flood spread across borders. Response comes from whoever has
  coverage and funded capacity; damage is paid by the owner of the burnt property; a `disasterAid`
  option lets the region share repair costs. An unfunded neighbour is a fire risk to everyone,
  which is exactly the tension worth having.
- **Regional statistics** (population, approval, score) exist alongside per-player ones. Both are
  displayed; the mode decides which one the game celebrates.

### 2.7 Persistence, saves and replay

- **Singleplayer**: IndexedDB. Autosave every sim-year and on visibility loss, three rotating
  autosave slots plus five manual slots, export/import as a `.citygrid` file (gamedesign §21).
  Schema version + forward migrations; a migration test per version bump, and a corpus of old
  saves kept in `test/fixtures/saves/` so migrations stay honest.
- **Multiplayer**: the room persists `{options, checkpoint state, command log since checkpoint}`.
  The log is truncated at each checkpoint (one per sim-year), so a room that runs for weeks does
  not accumulate an unbounded log; replay works from the nearest checkpoint rather than from
  founding. Full-history replay is an opt-in room setting for showcase games.
- **Bounded history**: census/statistics history arrays are hashed state and therefore must be
  bounded — fixed-length ring buffers (120 entries short-term, 120 long-term, as in the
  reference), never growing arrays.

---

## 3. Multiplayer architecture

### 3.1 Topology

```
singleplayer:   client ──> session.js ──> worker/sim-worker.js  (engine)
multiplayer:    client ──> session-remote.js ──ws──> server/room.js (engine, authoritative)
                                └── local engine copy, applies the same command stream
```

The **session seam** is the whole investment: `session.state`, `session.apply(command)`,
`session.onChange`. Every UI module uses only that and never knows whether a socket exists.
This exists from day one even while multiplayer is unimplemented.

### 3.2 Command relay, not state streaming

The server is a thin pump: queue commands, apply through the same reducer, broadcast the
accepted command with its sequence number and the resulting state hash. Clients apply the same
commands locally and compare hashes. There is no fog in a city builder — everybody sees the
whole map — so the wire carries commands (tens of bytes) rather than state, and rendering stays
local and immediate.

- Ordering: commands are applied in `(tick, seq)` order, `seq` assigned by the server on
  arrival. Ties never exist. Same order on every machine, forever.
- Rejection: an illegal command is rejected identically by client and server; the client's
  optimistic ghost preview is never state, so a rejection is a UI toast, not a rollback.
- Desync: a hash mismatch triggers a resync — the server sends a full snapshot and the client
  logs the divergent sequence number to a replay artifact. The alarm is loud, never silent.
- Bandwidth: worst case at 128×128 a full snapshot is ~250 KB before compression; that is a join
  cost, not a per-tick cost.

### 3.3 Drop-in / drop-out

- **Join** at any time: seat assignment (or spectator if full), full snapshot at a known tick,
  then the live stream. The world never pauses for a joiner.
- **Leave** — deliberately or by disconnect: the seat enters **regency**. The deputy mayor (§10.1)
  runs the departed player's departments under a doctrine the player set, and answers incoming
  demolition requests according to their standing request policy. Nothing the absent player owns
  is destroyed by their absence.
- **Reconnect** by seat token within a grace window resumes ownership and pending requests.
- **Abandonment**: after a configurable number of sim-years with no reconnect, a seat's land can
  be released to unclaimed (lobby option `abandonAfterYears`, default 5, or `never`).
- Joining mid-game is the normal case, not an edge case: a new player picks an unclaimed sector
  or an open plot and can be productive within a minute, exactly the "join an active situation"
  pattern from `batch-a-refinement.md`.

### 3.4 Clock authority

The server owns the clock. Speed is a lobby setting plus an in-game **majority vote**
(`SET_SPEED_VOTE`); the host can force it. No single player can pause the world — pausing is
a personal camera/UI state only, and building is allowed at every speed. This is what keeps
16 players from stalling each other.

### 3.5 Server

One Node process serves the static client and N rooms over `/ws`. Seats are tokens; join codes
are human-typeable; spectators are tokenless. Robustness is scoped from the start: connection
and room caps, per-IP limits, allowlist-validated inbound frames, command rate limits per seat,
save rotation. Rooms persist to disk (state + command log) so a restart resumes.

### 3.6 Cadence — what we take from Fireline, and what we do not

Fireline pumps at **10 Hz** (`engine/clock.js`, `TICKS_PER_SECOND = 10`). City Grid adopts the
same 100 ms pump, the same injectable-clock shape, and the same jitter instrumentation. It does
**not** adopt snapshot broadcast, because the two games have opposite state profiles.

| | Fireline | City Grid |
|---|---|---|
| Authoritative state that changes every tick | dozens of moving units | almost none — buildings do not move |
| Wire payload per tick | per-team fog-filtered snapshot | the accepted commands only (usually zero) |
| Per-player server cost | JSON serialization per socket, ~0.35% of a core each | one serialization per pump, N cheap sends |
| Client role | interpolate between two snapshots, 100 ms behind | run the same deterministic sim, no interpolation needed |
| Vehicles and pedestrians | authoritative sprites | **client-side decoration** sampled from traffic density — zero bandwidth, zero server cost |
| Fog | per-team views | none; everyone sees the whole map, so one frame serves every socket |

Snapshot interpolation at 10 Hz exists to smooth motion. A city builder has no authoritative
motion: its vehicles are a *sampled representation* of traffic density (gamedesign §8.4), which
every client can generate locally and deterministically from state it already has. That single
observation removes the dominant per-player cost measured in Fireline's profile.

**The pump**, every 100 ms:

1. Drain the inbound command queue, assign `seq`, validate through the reducer.
2. Advance the game clock by the ticks the current speed owes (see budget below).
3. Broadcast one frame `{tick, seq, cmds[]}` — serialized once, sent to every socket.
4. Record inter-pump gap into the jitter ring.

Speeds map to sim work, not to pump rate: 1× = 2 fast ticks/s (one sim-month per 6 s), 3× = 6/s,
8× = 16/s. So a pump does at most ~2 fast ticks and, twelve times per sim-month, one month tick.

### 3.7 Load levers

1. **Commands cross the wire, not state.** A frame is tens of bytes. 16 players at a busy
   1 action/s each is ~1 KB/s per socket. There is no idle traffic at all — a room where nobody
   is building broadcasts empty frames or nothing.
2. **Coalesce bursty input at the client.** A drag-paint of 400 tiles is **one** command with a
   run-length-encoded cell list, sent on commit — never one command per tile crossed (which is
   what the reference implementation's tool events do). This is the single biggest load lever in
   a city builder and it is a client-side rule enforced by a server-side cap.
3. **Per-seat rate limits**: commands/s, cells/command, pending requests/pair. Over the limit is
   a UI toast, never a disconnect.
4. **One sim per room, regardless of player count.** Clients run their own copy on their own CPU;
   the server's cost is flat in player count. This is the inverse of Fireline's scaling.
5. **Snapshot on join is the only large payload** — ~360 KB raw at 128×128, ~40–70 KB under
   `permessage-deflate`, once per join. Snapshot builds are queued at one per pump so sixteen
   simultaneous reconnects after a network blip cannot stall the clock.
6. **Degrade the game clock, never the pump.** The pump has a fixed CPU budget (target ≤20 ms).
   If the sim cannot keep up, the room advances fewer ticks per pump — the world runs slower for
   everyone, identically, and nothing desyncs, because the tick count is data in the frame.
   Clients that fall behind catch up by replaying; they render an older tick, never a wrong one.
7. **Hibernate empty rooms.** A room with no connected players stops ticking and persists to
   disk; a room where every seat is in regency ticks at 1×. A city with nobody watching it does
   not need to grow.
8. **Autosave off the pump** — async writes, rotated. Fireline's host probe specifically measures
   autosave-sized write stalls because they land as late pumps.
9. **Hash verification on a slow cadence** — full state hash once per sim-month (~0.2 ms over
   360 KB), not per command. Loud on mismatch, silent otherwise.

### 3.8 Budgets (predicted, era 0 — to be replaced by measured numbers)

| Quantity | Target | Instrument | Measured |
|---|---|---|---|
| Pump CPU, 128×128 / 16 seats / 8× speed | ≤20 ms | `tools/profile_run.mjs` | not yet |
| Room CPU at 1× speed | ≤5% of a core | same | not yet |
| Per connected player | ≤1 MB RSS, ≈0 CPU | real-server profile with N ws clients | not yet |
| Room state in memory | ≤20 MB | heap profile | not yet |
| Steady-state bandwidth per player | ≤2 KB/s | frame accounting | not yet |
| Join snapshot | ≤70 KB compressed | frame accounting | **83 KB raw** at 128×128 (`test/save.test.js`), so comfortably inside once deflated |
| Tick jitter | p99 <150 ms, late% <2 | `/health` `tickJitter` | not yet |

**Measured so far** (2026-08-26, era 0): region generation with the fairness gate is 0.74 ms p50
at 48×48 and 5.97 ms p50 at 128×128 (`tools/mapsweep.mjs`); a fresh 128×128 save is 83.2 KB of
JSON before compression, which is what makes yearly checkpoints affordable for a persistent room.

Every other number above is a prediction until the profiler says otherwise; they are labelled era 0 and
re-pinned per balance era, and a co-hosting budget is written only from measured values — the same
discipline as `reports/2026-08-06_resource_profile.md`.

### 3.9 Protocol versioning and client updates

A PWA caches its own client, so a stale client joining an updated server is not an edge case —
it is the *default* failure after every deploy, and a mismatched reducer silently desyncs.

- `shared/protocol.js` holds `PROTOCOL_VERSION` and a build hash of `engine/` + `data/`.
- The join handshake sends both. A mismatch is refused with an explicit reason, and the client
  shows "this game has been updated — reload" and self-updates the service worker, rather than
  connecting and diverging.
- `data/*.json` is part of the hash: a balance change is a rules change.
- The service worker uses a versioned cache name and `skipWaiting` only on an explicit user
  reload, so an in-progress singleplayer session is never swapped out mid-play.
- Singleplayer saves carry the same build hash: loading a save from a newer build warns; older
  builds migrate.

### 3.10 Ops

Single small VM, one Node process under systemd, caddy/nginx for TLS, rsync **allowlist** deploys
(runtime files only, never the repo). `MemoryMax` and `CPUQuota` set from the measured profile,
not from guesses. Backups: room checkpoints rotated off-box; a restart resumes every live room
from disk. Config with secrets stays gitignored with sanitized templates committed.

Discovery follows the QuakeWorld pattern from the reference stack: self-hosted servers POST a
heartbeat (name, address, build hash, open rooms) to a tiny master index, and the client's
"Find a game" browses it. No accounts, LAN-first, join codes always work without the index.

---

## 4. Ownership, permissions and requests

### 4.1 The rule

**Nothing you did not build is yours to destroy.** The reducer enforces it:

| Action | Own land | Commons | Unclaimed | Another player's |
|---|---|---|---|---|
| Build / zone | yes | mode-dependent | claim first (mode-dependent) | no |
| Bulldoze | yes | builder only | yes (nature) | **no — request only** |
| Connect road/wire/pipe across the border | yes | yes | yes | only if that border is open |
| Inspect | yes | yes | yes | yes (everything is public information) |

Auto-bulldoze only ever consumes the actor's own rubble.

### 4.2 Demolition requests

`REQUEST_DEMOLITION {cells, title, reason?, offer?}` creates a request entity:

```
{id, from, to, cells, title, reason, offer, createdTick, expiresTick, status}
status: pending | approved | denied | withdrawn | expired | auto-approved | auto-denied
```

The owner sees it in an inbox with a **camera jump to the location**, the title, the reason if
given, and the compensation offered. Approving executes the demolition as a single transaction
paid for by the requester and transfers the offer. Requests expire (default 12 sim-months) and
are rate-limited (max pending per player pair) so the inbox cannot be used as a weapon.

`SET_REQUEST_POLICY` covers absence and preference: `manual` (default), `auto-approve outside my
core district`, `auto-approve if compensated ≥ X`, `deny all`. Policy is applied by the reducer,
so an absent player's answers are deterministic and replayable.

`REPORT_NUISANCE` reuses the same pipeline for pollution, noise and traffic complaints across a
border — the tension that ownership creates gets a civil channel instead of a grief channel.

### 4.3 Untrusted text

`title` and `reason` are player-authored text crossing to another player. They are capped
(64 / 240 bytes UTF-8), stripped of control characters, hashed as canonical bytes, rendered as
**plain text only** (never as markup), and can be disabled entirely with the lobby option
`freeTextReasons: false`, which falls back to a fixed reason list.

### 4.4 Cooperation primitives

- `TRANSFER_FUNDS` — gifts and loans between players.
- `OFFER_CONTRACT` — sell power, water or waste capacity across a border at a per-unit price,
  billed monthly. Refusing to sell is legitimate play; the supply accounting in §2.4 makes it real.
- `OPEN_BORDER` — allow a neighbour to run roads, wires or pipes into your land.
- **Shared civic projects** — a hospital, transit line or landmark funded by several players,
  owned by the commons, maintained from a shared line item.
- `MUTUAL_AID {to, allow}` — grant or revoke emergency-service coverage across a border (§2.6).

### 4.5 Communication, moderation and blight

Sixteen strangers need more than a demolition inbox, and every channel is a moderation surface.

- **Map pings** are the primary channel: a fixed, translated phrase set (*help here*, *building
  soon*, *fire*, *look at this*, *thanks*) pinned to a location. No free text, works across
  languages, nothing to moderate, and it is a game command like any other.
- **Chat** is optional per room (`chatEnabled`), same sanitization as request text, and is
  **not** hashed state — it is a transport-level side channel, so a chat message can never
  desync a game or bloat a replay.
- **Names**: player and city names are untrusted text too, held to the same cap, sanitization and
  plain-text rendering as request titles. This was missing from the first draft, which covered
  only request text.
- **Player tools**: per-player mute (client-side), block requests from a player, and report.
  **Host tools**: kick, ban by seat token, close late joining, and disposition of the kicked
  player's land (regency, or release to unclaimed after a grace period).
- **Derelict property**: a building abandoned for more than N sim-years can have its demolition
  auto-approved on a neighbour's request, even if the owner is present and refusing. Otherwise
  "I own it and I will let it rot next to your park" is an unanswerable grief move. The threshold
  is a lobby option, and the derelict state is visible in the territory overlay.
- **Request lifecycle edge cases** are explicit: if the target is destroyed, upgraded past
  recognition, or already demolished before resolution, the request resolves to `moot`; if the
  owner changes, it transfers to the new owner with the clock reset.

---

## 5. Lobby, options and modes

### 5.1 Lobby

Host creates a room and gets a join code. The lobby is the same client, no separate app:

- Map size (48/64/96/128) — the player cap follows automatically (4/8/12/16).
- Terrain style: **flat / rolling / hilly**, water amount **none / lakes / river / coastal /
  archipelago**, tree density.
- Seed with a **regenerate** button and a live client-side minimap preview (terrain generation is
  deterministic and cheap, so no server render is needed) plus the situation name (§10.2).
- Difficulty, disasters on/off, quests on/off, starting treasury.
- Mode (§5.2) and its options: sector assignment, claim rules, shared or separate treasury,
  border default, demolition request expiry, free-text reasons, abandonment policy, speed rules.
- Seats: join, ready, spectate, kick (host), colour and city-name pick per player.
- Late joining stays open unless the host closes it.

Everything in the lobby is captured in a `GameOptions` record that is hashed into the initial
state, so options are part of the replay contract and cannot drift.

### 5.2 Modes

| Mode | Players | Land | Money | Point |
|---|---|---|---|---|
| **Shared City** | 2–16 | one city, build anywhere unclaimed; ownership recorded per builder for demolition protection only | shared treasury (option: separate) | co-operative — one city, one score |
| **Districts** | 2–16 | the map is partitioned into one exclusive sector per seat at generation | separate treasuries and tax rates | your district, your rules; borders, utilities and traffic force negotiation |
| **Region Rivals** | 2–12 | each player a separate city site with neutral land between | separate | competitive scoring; trade contracts across neutral ground |
| **Scenario Co-op** | 2–8 | scenario-defined | scenario-defined | a shared objective under a timer (flood recovery, cleanup, festival) |

Singleplayer is Shared City with one seat and no network — the same code path, which is what
keeps the singleplayer build honest.

### 5.3 Sector generation (Districts mode)

Sectors are cut at map-generation time and scored for fairness before the seed is accepted:

- Partition follows terrain features — rivers, ridges and coastlines become borders, so a
  district looks like a place rather than a rectangle.
- Fairness gate: each sector must have comparable buildable area (within a tolerance), at least
  one water-source access, and at least two connections to the sector graph. A seed failing the
  gate is re-rolled. (The mirror-fairness lesson from the reference stack, applied to N players:
  a bias that survives sector rotation is a *generator* bias, and the sweep tests for it.)
- A **commons band** of tiles along each border is owned by `255`: anyone may build roads there,
  only the builder may remove them.
- Unclaimed sectors sit ready for drop-in players; `CLAIM_SECTOR` is one command.

### 5.4 Session lifecycle

Drop-in only makes sense if the world outlives the session, so: **a room is a persistent world.**

- Shared City, Districts: **endless**. No win condition, no forced end. The room keeps its city
  across days and weeks; players come and go; the clock runs while anyone is connected and
  hibernates when nobody is (§3.7).
- Region Rivals: also endless. Scoring is continuous and a **season marker** is dropped every
  `seasonYears` (default 25 sim-years) — a ranking, a recap (§10.3) and an entry in the room's
  history — without ending the world or resetting the map. Nobody is thrown out of a city they
  have built for a week just because a timer expired.
- Scenario Co-op: ends on the scenario's objective or timer, with bronze/silver/gold.
- A room has a lifetime policy (`keepForDays`) so an abandoned world is eventually reclaimed;
  the host can pin a room as permanent, and any player can export the final state to singleplayer
  and keep building alone.

### 5.5 Progression and unlocks

Unlocks are **room-level**, tied to the room's own milestones (population, rank of the city,
scenario completions). A player joining a mature room gets the full unlocked build menu
immediately — the alternative, per-player unlock ladders, punishes exactly the drop-in player the
design is built around. Personal mayor rank persists in the local profile as flavour, awards and
cosmetics, and never gates a building. In competitive modes, quest rewards are capped in funds so
that quest luck cannot decide a chapter.

### 5.6 Difficulty

Difficulty is a data set, not a code path — `data/balance.json` difficulty tiers scale: starting
treasury, tax yield multiplier, construction and maintenance cost multipliers, demand elasticity,
disaster frequency, service effect per funded unit, and how fast land value recovers. In
multiplayer it is one room-wide setting; per-player handicaps are explicitly out of scope.

---

## 6. Rendering (three.js)

*Superseded 2026-09-05 by `specs/engine/` (cityviewer, rulings 032–040): perspective play
camera, a derived city model, four fidelity levels, the painted style. The bullets below
describe the renderer as built through N30 and stay as its record.*

- **Camera**: orthographic, low-isometric, 4 snapped yaw angles with eased rotation, clamped
  pitch, zoom-to-cursor. `focusOn(x, y)` with interpolation — notifications, incidents and
  request inbox entries drive it.
- **Terrain**: chunked (16×16 tiles) merged geometry, one material with an index/splat texture;
  water as a separate low plane; shoreline bevel from the coast bitmask. Dirty-chunk rebuild only.
- **Networks**: `InstancedMesh` per road/wire/pipe shape (16 shapes each) from the 4-neighbour
  adjacency bitmask.
- **Buildings**: one instance per building entity anchored at its lot origin; never render
  satellite tiles. Instance groups keyed by `(category, footprint, level, valueTier)`.
- **Ownership readability** — a multiplayer-specific requirement: player colour appears as a
  subtle ground tint at borders, a full-strength **territory overlay** on demand, coloured
  building trim, and a *pending request* pulse on affected cells. A newcomer must be able to tell
  at a glance whose city they are standing in.
- **Overlays**: block maps as `DataTexture` blended in one shader pass — zoning, power, water,
  traffic, land value, pollution, crime, fire cover, health cover, density, desirability,
  **territory**, **contracts**. Colour plus pattern/icon, never colour alone.
- **Effects**: pooled vehicles and particles; one directional shadow on buildings only, off in
  reduced-effects mode.
- **Picking**: ray-plane intersection + integer grid math, not scene raycasting.
- **Style seam**: `client/render/` implements a `RenderStyle` interface — terrain, networks,
  buildings, vehicles, effects, plus the camera constraints a style imposes (free vs fixed yaw,
  continuous vs integer zoom).
  **Ruled:** four-angle rotation is a hard requirement, so v1 uses the **mesh pipeline** —
  procedurally baked low-poly meshes, free rotation, continuous zoom. The pixel-art *look* is
  available within it as a post-process (low-resolution render target, nearest upscale, palette
  quantisation, dither, outline), which is how the reference screenshot's charm can be had
  without four drawn sprite sets per building state. A true **sprite pipeline** (depth-sorted
  atlas quads; isometric 2.5D and pixel art are the same code at different resolutions) stays
  expressible in the seam but is post-v1 and contingent on an artist.
  Everything above the seam — overlays, minimap, picking, UI, camera framing — is style-agnostic,
  and because rendering is entirely local, style is a per-viewer preference even in a shared room.
- **Minimap**: a 2D canvas painted directly from the block maps and the owner array — not a
  second three.js render. Cheap, readable at phone size, doubles as the lobby seed preview and as
  the overlay legend, and is the fastest way to answer "whose city is that?". Tap to focus.
- **Day/night**: a light rig driven by the game clock, off by default until the core is stable
  (gamedesign §3), and disabled in reduced-effects mode. Seasons ride the same rig (§10.5).

**Budgets**: ≤150 draw calls typical, ≤80k triangles on mobile, sim tick ≤4 ms at 64×64 on a mid
phone, 60 fps desktop / 30 fps mid mobile. Budgets are measured on a **saturated** city — a
fully-developed 128×128 16-seat save produced by the AI mayors and kept as
`test/fixtures/saturated_128.json` — never on an empty map, which measures nothing.

---

## 7. Client structure

### 7.1 Structure

- `session.js` (local) and `session-remote.js` (ws) implement one seam; `transport/` isolates the
  socket so a WebRTC host-authority adapter is a drop-in later.
- Model/view split in the UI: pure, unit-tested `*_model.js` (RCI bars, budget projection, quest
  tracker, alert queue, **request inbox**, **player roster**, statistics prose) feeding a thin DOM
  layer. No framework.
- Multiplayer HUD additions: player roster with online/regency state, request inbox badge,
  contract panel, territory toggle, speed-vote indicator, and a compact activity feed
  ("Mira zoned industry near your border") — attributable, so consequences have an author.
- Mobile is the same client, not a fork: touch affordances gated on `(pointer: coarse)`, bottom
  scrollable toolbar, confirm/undo for drag tools, full-screen sheets for budget/stats/quests/
  inbox. The request flow is designed thumb-first: long-press a foreign building → *Request
  removal* → title, reason, optional offer → send.
- i18n `en`/`no` key-identical catalogs, enforced by test.
- URL params as config surface: `?seed`, `?size`, `?join=CODE`, `?debug=1`; boot canonicalizes
  afterwards (capture `location.search` at module eval).
- PWA: service worker precaches engine and assets; **singleplayer works fully offline**.

### 7.2 Audio

Missing from the first draft entirely, and this is a game whose whole pillar is *every action has
visible consequences* — half of that feedback is audible. The reference implementation shipped
sound hooks that were never wired to anything; ours are wired from the start.

- **Feedback layer**: tool select, placement confirm, invalid action, demolition, transaction
  committed, notification by severity (informational / warning / critical, distinct timbres so a
  critical alert is recognisable without looking).
- **Ambience layer**: a bed that changes with what is under the camera — residential quiet,
  commercial bustle, industrial hum, traffic density, water, wind on empty land. Driven by the
  same block maps the overlays read, so it costs no new state.
- **Event layer**: sirens for a live incident, construction, disasters, quest character stings.
- **Multiplayer**: a soft cue for an incoming demolition request or ping, rate-limited and
  mutable per player; nothing another player does may produce a loud sound on your machine.
- Implementation: WebAudio, one small procedurally-generated or hand-authored sample bank baked
  by `tools/build_assets.mjs`, pooled voices with a hard cap, master/effects/ambience/music
  sliders, and **muted until first user gesture** (iOS requires it anyway). All audio is derived
  from state — it never feeds back into it, so a muted client and a loud one stay hash-identical.

### 7.3 Accessibility

- **Never colour alone** — already a rule for overlays; extended to ownership, which is the
  harder problem: **16 distinguishable player colours do not exist**, especially under common
  colour-vision deficiencies. So a player identity is a colour *plus* a pattern (hatch, dots,
  chevrons) *plus* a name label on the territory overlay and minimap, and the palette is checked
  against deuteranopia/protanopia/tritanopia simulation in a test rather than by eye.
- Text scaling to 200% without layout loss; minimum touch targets 44 px; a reduced-motion setting
  that disables camera easing, timelapse and particle churn; a high-contrast HUD theme.
- Every hover-only affordance has a tap/long-press equivalent (gamedesign §13.2 requires it).
- Full keyboard operation on desktop, including the build toolbar and the request inbox.
- Plain-language statistics (gamedesign §15.3) are an accessibility feature as much as a UX one.

### 7.4 Onboarding, single and drop-in

- Singleplayer teaches through the tutorial quest chain, not a manual (gamedesign §5).
- **Drop-in onboarding is a separate design problem** and was missing: a player joining a
  three-hour-old city needs to be useful within a minute. On join, the client shows a short
  situation card — what this room is, whose land is whose, what the region needs most right now
  (from the advisory system), and two or three concrete openings: an unclaimed sector, a public
  request for help, a joint project needing funds. This is the "join an active situation" pattern
  from `batch-a-refinement.md`, and it reuses the advisory and quest systems rather than adding a
  new one.
- A spectator can watch before taking a seat, which is the gentlest possible tutorial.

### 7.5 Platform support

- **WebGL2 required**, with a capability probe and an explicit unsupported-device screen rather
  than a broken render. Instancing, `DataTexture` overlays and the single-pass overlay shader all
  assume it. Verified headlessly under SwiftShader in CI.
- Support matrix pinned and tested: current Chrome/Edge/Firefox/Safari desktop, iOS Safari and
  Android Chrome two versions back. Known platform traps handled explicitly: iOS audio unlock,
  `100vh` and safe-area insets, pinch-zoom and pull-to-refresh suppression on the canvas, Android
  back button inside the PWA, and page-visibility pausing.

---

## 8. Content and data

Numbers never live in code. `data/balance.json` holds demand coefficients, tax tables, service
effects, decay rates and disaster odds; `data/buildings.json` the building definitions;
`data/modes.json` the mode rule sets (ownership rules, claim rules, treasury sharing, scoring).

**Provenance (ruled):** the starting values come from `referencedata.md` §13 and are entered
labelled `era 0, untuned`. They are a starting point for the sweep, never a shipped balance — the
reference numbers were tuned for a different demand model, a different map size and no multiplayer.
Every value that survives to release names the era and the commit whose sweep measured it.

Quests are declarative JSON over a small closed condition DSL, extended with multiplayer
condition and target types (`actor: any|owner|all`, `supplyToNeighbour`, `resolveRequests`,
`jointProject`):

```json
{"id":"q_first_water","giver":"engineer","scope":"player","objectives":[
  {"type":"supplyWater","count":10},
  {"type":"maintain","ticks":6,"of":{"type":"waterShortfall","max":0}}],
 "reward":{"funds":500,"rank":2}}
```

Scenarios are a seed, a starting-state delta, objectives and bronze/silver/gold targets; a
co-op scenario adds per-seat roles.

### 8.1 Content production

Systems work is finite; content is the long pole, and the first draft costed none of it. The
v1 content budget, tracked as its own backlog:

| Asset class | v1 target |
|---|---|
| Building meshes | ~60 (3 RCI categories × 4 levels × 2 value tiers, plus ~15 civic and utility) |
| Terrain and prop meshes | ~25 (trees, rocks, shoreline, rubble, fountains, poles, pipes) |
| Vehicles | 8 pooled types |
| Character portraits | advisor with ~6 poses, 10 supporting characters with ~3 each |
| UI icons | ~80 |
| Audio | ~40 short effects, 6 ambience beds, 3 music tracks |
| Writing | ~10 tutorial + ~25 quests + ~40 advisory strings + character voice, in `en` and `no` |

Art direction is settled once, in `specs/art-direction.md`, before the first mesh: silhouette
first, flat colour with baked ambient occlusion, no textures beyond one atlas, a fixed palette
that keeps the 16 player colours legible against every building colour. Meshes are procedural
where possible (`tools/build_assets.mjs`) so a style change is a re-bake, not a re-modelling job,
and the asset gallery page renders every asset through the real renderer at rest pose for
screenshot diffing.

---

## 9. Milestones (slices)

**`plan-v1.md` is the authority for execution order, slice contents and definitions of done.**
The table below is the summary view kept with the architecture.

Two lanes. The engine lane must land **ownership before the second command exists** — retrofitting
an owner check into a reducer is how permission bugs get born.

Every slice: tests written first, suite double-run green, its layer gate, a `dev-log.md` entry,
docs/memory sync. Commit prefix `slice-`.

| # | Slice | Contents | Gate |
|---|---|---|---|
| S0 | Foundation | repo skeleton, importmap, pinned three.js, `prng`, `idiv`, `grid`, `canonical`, `statehash` + pinned vector, protocol constants, `node --test`, CLAUDE.md, dev-log | unit suite |
| S1 | City canvas | seeded terrain gen (style + water options), SoA state **including `owner`/`sector`**, camera, chunked render, picking, ghost preview, IndexedDB save/load | client smoke screenshot + save/load hash round trip |
| S2 | Roads and zoning | road auto-connect, zone paint, road access, lot aggregation, RCI demand, development/decay, building instancing, **`engine/permissions.js` with every command routed through it** | soak: 5 seeds reach a self-sustaining town; permission unit matrix green |
| S3 | Utilities | plants, wires, pipes, underground view, component capacity, per-owner supply accounting, overlays | soak: no phantom outages over 20 sim-years |
| S4 | Economy | costs, maintenance, tax sliders with lagged response, funding, monthly budget, loans, bankruptcy warnings, `TRANSFER_FUNDS` | sweep: solvency curve sane across difficulties |
| S5 | Civic simulation | police/crime, fire + response, hospital/health, pollution spread, land value | event census: every system fires |
| S5b | Events and disasters | event system, routine civic events, wildfire/flood/storm/quake/industrial accident/blackout, telegraphing, recovery, cross-border spread and liability, disaster aid | soak: every disaster type fires, spreads and is recoverable; no unrecoverable city across 200 sweep games |
| **M1** | **Session seam + server** | `session-remote.js`, `transport/ws`, `server/` room + seats + store, command relay, hash verification, snapshot join, resync | 2 real ws clients play 5 sim-years hash-identical |
| **M2** | **Lobby** | room creation, join codes, options record hashed into initial state, seed preview + regenerate, seat/ready/spectate/kick | lobby e2e: 4 clients configure and start a game |
| **M3** | **Ownership UX** | territory overlay, colour language, request inbox, `REQUEST_DEMOLITION` end to end, policies, nuisance reports, activity feed | multi-client acceptance: request → approve → demolition, and the illegal path is refused |
| **M4** | **Modes and sectors** | `data/modes.json`, sector partition + fairness gate, `CLAIM_SECTOR`, borders, contracts, Shared City / Districts / Region Rivals | sweep: sector fairness across 200 seeds; mode rules unit-tested |
| **M5** | **DIDO and regency** | leave/rejoin, seat tokens, grace window, deputy doctrines answering requests, abandonment sweep, spectators | soak: players join and leave at random ticks for 40 sim-years with no divergence |
| S6 | Traffic and growth | flow assignment, congestion, upgrades, abandonment, 3×3 lots, vehicle sampling | sweep n≥200 |
| S7 | Story layer | dialogue, advisor + supporting cast, quest engine, choices, milestones and ranks, scenarios incl. co-op | scenarios complete headlessly |
| S8 | Mobile, PWA, audio, a11y | touch gestures, responsive/portrait, reduced-effects mode, service worker + version handshake, offline singleplayer, audio layers, accessibility pass, platform-trap list | perf harness on native GPU + real phone; colour-vision palette test; keyboard-only and 200%-text pass |
| **O1** | **Ops** | systemd unit with measured limits, TLS, allowlist deploy, backups and room restore, master index + server browser, `/health` and `/metrics` | a deploy, a kill and a restart with every live room resumed |
| **M6** | **Scale** | 16 seats on 128×128, rate limits, caps, clock degradation, empty-room hibernation, room persistence and restart, `profile_run`/`host_probe`/`/health` jitter | 16 simulated clients, 1 hour: memory and hash stable, p99 jitter <150 ms, budgets in §3.8 replaced with measured numbers |
| S9 | Bonus batch | §10 | per feature |

**Singleplayer MVP** = S0–S5 + the tutorial chain from S7 (gamedesign §22).
**Multiplayer MVP** = + M1–M3 (Shared City, drop-in, demolition requests).
**Feature-complete v1** = + S5b, M4–M6, S6, S8, O1.

Content production (§8.1) runs as a parallel lane from S2 onward, not as a phase — art direction
is settled before the first mesh, and the asset backlog is burned down alongside the systems that
need it.

---

## 10. Bonus features (beyond the original)

1. **Deputy mayor (AI regency).** Per-department doctrines with readable labels (`hold the line`,
   `expand`, `balance the books`, `green first`) that run a departed player's city and answer
   requests by policy. It is also the headless test instrument — the AI mayors play the soak and
   sweep cities and crew every seat in multiplayer scale tests, so doctrine is gated like gameplay
   code because it *is* the measurement instrument.
2. **Seeded situations with identity.** A seed produces a recognisable strategic map ("the delta
   with three islands", "the valley with one pass"), named, previewed in the lobby, and shareable
   as a code that reproduces terrain, options and sector layout exactly.
3. **Replays and timelapse.** `seed + options + command log` reproduces any city or any shared
   game. Scrub it, export a timelapse, produce a "story of the city" recap crediting each player.
   Bug reports become replayable artifacts.
4. **Photo/postcard mode.** Orthographic render target, free camera, time-of-day, PNG export.
5. **Seasons and weather.** Solar output, fire risk, floods, heating demand.
6. **Shared civic projects and joint quests.** Multi-player-funded landmarks, transit and
   objectives — the co-operative counterweight to territorial friction.
7. **Scenario/challenge editor.** Scenarios are already JSON; expose an editor and share codes.

---

## 11. Testing and gates

Each layer catches what the layer below cannot:

1. **Unit** — `node --test`, per system, no framework. Includes the **permission matrix**: every
   command × every ownership relation × every mode, asserted at the reducer.
2. **JSON scenario fixtures** — crafted state + command script + pinned final hash. Code-free, so
   they survive refactors and would serve a future engine twin for free.
3. **Headless soak** — `tools/sim_soak.mjs`: AI mayors play 5 pinned seeds × 40 sim-years with
   per-tick invariants (population conservation, no negative funds without a loan, no orphan
   buildings, **no tile mutated by a non-owner**, no float creep) and golden checkpoint hashes.
4. **Event census** — `dbg_systems.mjs` prints which systems actually fired. Silent no-ops are
   caught here, not in review.
5. **Balance sweep** — `tools/sim_sweep.mjs N`: one CSV row per game, with multiplayer columns
   (per-seat final score, land share, requests sent/approved, contracts, whether one seat
   snowballed). Flags: `MODE=`, `SEATS=`, `SIZE=`, `CHURN=` (join/leave rate). Never tune on 5
   seeds; 200+ games decide.
6. **Chaos injection** — a driver firing random *legal and illegal* commands from random seats,
   including malformed cell lists, oversized payloads, commands for seats that have left, and
   requests against tiles that no longer exist. State must never corrupt and the hash must never
   diverge. This is the natural predator of a permission system and of the request lifecycle, and
   it was missing from the first draft.
7. **Save migration tests** — a corpus of saves from every shipped schema version in
   `test/fixtures/saves/`, each loaded and hashed on every run. Migrations rot silently otherwise.
8. **Server tests** — real `ws` clients driving join / play / disconnect / reconnect / illegal
   command / version mismatch / tamper-reject against a real server instance, with poll-waits,
   never fixed settles.
9. **Multi-client e2e** — `tools/multi_client.mjs` (Playwright): N browsers in one room, hash
   equality asserted, the request flow driven end to end.
10. **Client smoke + UI acceptance** — page errors, boot, first tick, non-empty render; buttons
   *do* things, hit-tested with `elementFromPoint` and manually dispatched events (headless
   SwiftShader starves actionability waits).
11. **Perf, client** — native Windows run (`tools/perf_native.ps1`) for real FPS on the
    **saturated** 128×128 fixture, not an empty map; WSL Playwright is SwiftShader-only and
    useless for perf numbers.
12. **Perf, server** — `tools/profile_run.mjs` (headless room, heap + µs/pump per map size and
    seat count) and `tools/host_probe.mjs N` (real room at 10 Hz + event-loop delay histogram +
    autosave-sized write stalls, prints a verdict). `/health` serves the live `tickJitter` digest
    so a candidate host can be judged from outside while a real game runs. Both port almost
    directly from Fireline — the pattern is ~140 lines against a headless-steppable server.

Balance work is era-disciplined: every baseline names its commit and balance era; numbers from a
previous era are void. Multiplayer rows never mix into singleplayer baselines.

**Telemetry from real play** closes the loop that sweeps cannot: `/metrics` per room (final and
running population, solvency, approval, requests sent and approved, contracts signed, disasters
survived, seat churn, session length, where players quit) feeding a periodic balance report in
`reports/`. Sweeps say what the AI mayors do; telemetry says what people do. Both are needed, and
telemetry must record failures — abandoned rooms and rage-quits — not only successes.

---

## 12. Gotcha list, inherited and new

1. Probe and sweep disagree → **check config plumbing first** (`=== true` vs `!== false`).
2. New nested state → `copyState` deep copy, **both** hash functions, the save migration, the
   snapshot projection, **and the lobby options record**. Five places, every time.
3. Read the FAIL COUNT, not the exit code.
4. Telemetry must record failure, not only success; verify the instrument before believing it.
5. No `Math.random`, no `Date.now`, no `null`, no floats in `engine/`/`shared/`.
6. Never write literal world coordinates in tests — always the helper.
7. Sandbox traps: a test city with whole-map utilities or a single road produces fake verdicts.
8. Prefer silent state changes for routine ticks; a new event inside a pinned fixture is drift and
   means the reducer is wrong, not the fixture.
9. **New:** permission checks belong in the reducer only. A check that exists solely in the UI is
   not a rule — it is a suggestion, and the next client build will forget it.
10. **New:** any new positional subsystem must learn ownership, the territory overlay, and the
    sector-fairness mirror in the sweep, or every fairness battery silently measures a malformed
    world.
11. **New:** player-authored text is untrusted input and hashed state at once — cap it, sanitize
    it, render it as plain text, and canonicalize its bytes. That includes player and city names,
    not just request text.
12. **New:** a PWA caches its own client, so after every deploy the default case is a stale client
    meeting a new server. Version handshake on join, `data/*.json` inside the build hash, and
    never `skipWaiting` mid-session.
13. **New:** canonical serialization must not depend on object key iteration order or on sort
    stability — emit from an explicit ordered field list, sort entities by id.
14. **New:** measure on a saturated city. An empty map measures the renderer's idle path and
    nothing else, and it is the easiest way to ship a perf regression believing you tested it.

---

## 13. Main risks

| Risk | Mitigation |
|---|---|
| Permission model retrofitted late | `engine/permissions.js` lands in S2, before the command set grows; permission matrix test from the same slice |
| Divergence between client and server engine copies | One engine, one hash function, hash compared on every accepted command in dev builds and every N commands in production; loud resync with a replay artifact |
| Griefing within the rules (border pollution, blocking roads, request spam) | Nuisance reports, request rate limits, commons band at borders, host kick with land disposition, `freeTextReasons: false` |
| One player stalling 16 others | Server-owned clock, speed vote, no global pause, regency for absentees |
| Traffic assignment cost at 128×128 with 16 cities | Monthly, sampled O/D, integer Dijkstra with early termination; measured in M6 before the size ships |
| Weak client cannot run the sim locally at 128×128 | Map-size caps already gate this (the same limit singleplayer needs); clients may lag and catch up. Named escape hatch if measurement demands it: a thin-client mode where the server broadcasts dirty-tile deltas — cheap because there is no fog, so one delta frame serves every socket. Only build it on evidence |
| Server overload from bursty paint input | Drag-paint coalesced into one RLE command at the client, capped server-side; per-seat rate limits |
| Mobile GPU/memory ceiling in large rooms | Reduced-effects mode, instancing from S1, territory overlay as one shader pass, 128×128 gated on measured numbers |
| Sector generation unfair on some seeds | Fairness gate with re-roll at generation, 200-seed sweep verdict |
| Quest scope creep | Closed condition DSL; quests are data; new condition types need a ruling in `specs/rulings/` |
| Derivative-work exposure | Behavioural spec only, clean-room implementation, own constants, original names and assets |
| **Content is the long pole** — 60 meshes, 40 portraits, 40 sounds and ~75 pieces of writing outlast the systems work | Costed in §8.1 as its own lane from S2, procedural where possible so a style change is a re-bake, art direction settled once before the first mesh |
| **A stale cached client desyncs after every deploy** | Version handshake in §3.9; refused join with a reload instruction, never a silent connect |
| **16 player colours are not distinguishable**, least of all with colour-vision deficiency | Colour + pattern + label everywhere identity matters; palette verified by simulation test, not by eye |
| Regional demand pool makes one player's tax cut everyone's problem | That is the intended competition; sweeps measure whether it snowballs (per-seat land share and score spread are already sweep columns), and elasticity is a difficulty-tier knob |
| Moderation burden in public rooms | Pings as the primary channel, chat optional and off the hash, mute/block/report, host kick and ban, name sanitization |
| Persistent rooms accumulate state and logs forever | Yearly checkpoints with log truncation, `keepForDays` room lifetime, hibernation for empty rooms |

---

## 14. Immediate next steps

1. **Rule the five decisions in §2.6, §5.4 and §5.5 before writing the demand system** — regional
   demand pool, cross-border employment and services, disaster liability, persistent rooms,
   room-level unlocks. They are written here as recommendations; they need your ruling in
   `specs/rulings/` because they define what the game is between players, and `demand` lands in S2.
2. S0 scaffold: repo skeleton, `CLAUDE.md`, `dev-log.md`, `shared/` primitives with pinned test
   vectors, `shared/protocol.js` with the version and build hash, `node --test` green.
3. Write the `GameOptions` record and `data/modes.json` schema — hashed into initial state, and
   they touch generation, permissions, scoring and the lobby at once.
4. S1 terrain generator with the lobby's style/water knobs, sector partition stub, camera and
   chunked render, gated by a screenshot and a save/load hash round trip.
5. Settle `specs/art-direction.md` before the first mesh (§8.1).
