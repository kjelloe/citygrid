# multiplayer — work items

*Written 2026-10-04 from Kjell's P102: "and multiplayer as discussed." This is Wave 5 of
`plan-v1.md` — slices 5.1 to 5.4 — rewritten as work items against what is actually built now,
which is not what the wave was planned against in August. `specs/plan.md` §3 is the architecture
and stays the authority; this file is the order and the done-whens. Same rules as
`workitems-cityviewer.md` §0, plus CLAUDE.md's determinism machinery: **the server and every
client run one reducer and must agree on one hash**, and a divergence that survives a week of
investigation is a stop-and-re-plan condition (`plan-v1.md`).*

**Ruling 003 holds Wave 5 behind the singleplayer MVP being accepted, and acceptance is Kjell's,
not a green suite. A125 (Kjell, 2026-10-04): the headless room is built now — X0 and X1's room
half — because it adds a directory and a dependency and changes nothing a singleplayer player
touches. X1's client half, X2, X3 and X4 wait for the playtest.** W6's second half runs beside
X1 and lands before X3 (A126).

## What is already there (plan.md §3.9b, checked 2026-10-04)

- **The seam** (W1, W2, W4): `openMirrorSession(given, transport)` takes anything with
  `post(message, transfer) → Promise<reply>`. `client/transport/worker.js` is the thread,
  `client/transport/echo.js` answers with a sequence number, and `test/session-remote.test.js`
  plays both fixtures through it hash for hash. **The socket is the third transport and nothing
  above the seam has to know.**
- **The client's local engine copy is the worker.** A remote session replaces where commands come
  from, not the worker or the mirror.
- **Everything that changes the city is a command**, including undo (`CMD_UNDO`, A123).
- **The session owns the clock** (`session.setSpeed`), so a remote session can tick when a frame
  says to.
- `shared/protocol.js`: `C2S`, `S2C`, `REFUSAL`, `LIMITS`, `compatible()` — written, no caller.
- The reducer keeps seats and ownership, and `test/fixtures/two_player.json` pins two joins, a
  cross-border build attempt, a bulldoze and a tax change. **It does not pin a demolition request
  and its approval, and it could not**: see the omissions pass below. `state.requests` and
  `state.contracts` are empty arrays nothing writes.
- Thirteen options declared and read by nothing, pinned by `test/omissions.test.js` (A124). Each
  item below says which of them it finally reads — the test goes red in the right direction.

## What has changed since the wave was planned, and matters

1. **A build action costs every client 115 ms and resets its traffic.** W6 measured it: a model
   rebuild plus `deriveNav` on every accepted command, and `worldChanged` throws away the cars,
   the crowd, the trains and the boats each time. In singleplayer that is one hitch per action
   the player chose to take. **In a room it is one hitch per action anybody takes** — eight
   mayors building is a client that never stops stalling and a street whose traffic never
   settles. W6's second half (stable identity, a dirty set, life that survives a rebuild) is
   therefore a prerequisite of a playable room, not a nicety. It runs beside X1 and must land
   before X3.
2. **The hour is the room's** (A63): the light, the rush hour (B4) and the crowd's roles (B5)
   follow each client's own clock today. In a room they follow the room's tick, within a game hour.
3. **Life is renderer-local and must agree anyway.** D7's invariants — a rate per second, never a
   function of the camera — are what let two clients show the same street. The room gate checks
   it: two clients, one city, car counts within 10% after a settle.
4. **The deputy has its own PRNG stream** (era 8). In a room the deputy runs on the SERVER only,
   as commands in the frame like anybody's, so regency cannot desync a client.
5. **Gates, ranks and the Outside are per seat** (T2, T5): a station, an airport and a city hall
   belong to a seat, and a neighbour's is reachable over the shared road graph. The fixtures do
   not cover it; X3 does.
6. **`BUILD_HASH` is `"dev"`.** There is no build step and there must not be one (CLAUDE.md). The
   precache already computes a hash of every shipped file; the handshake's hash is that mechanism
   restricted to `engine/`, `shared/` and `data/`.

## Omissions pass (2026-10-04, after P103) — what the lane had wrong

*Checked against the code rather than against the plan's description of it.*

1. **Thirteen commands have a constant and no handler**, and `test/omissions.test.js` has listed
   them honestly all along: `requestDemolition`, `resolveRequest`, `withdrawRequest`,
   `reportNuisance`, `ping` (slice 5.3), `setRequestPolicy` (5.4), `claimSector`, `openBorder`,
   `mutualAid`, `offerContract`, `resolveContract`, `transferFunds` (6.1) and `takeLoan`
   (singleplayer, gamedesign §9.5). **X3 was written as if the request system existed and only
   needed a screen. It is engine work**: handlers, hashed state, the permission matrix, a
   `copyState` test, a fixture — and `specs/plan.md` §2.5 and §3.9b said the two-player fixture
   pinned "a demolition request and its approval", which it never has (corrected). X3 is split
   below.
2. **Rank is one number for the whole city — and that is the ruling for the MVP (A129).**
   Shared City has one ladder; rank becomes per seat in slice 6.2. Each seat places its own rank
   buildings: `onePerSeat` is already checked against the actor, so X3a adds the two-seat test
   (both mayors build a city hall, neither a second) and X3b shows whose each one is.
3. **There is no speed command and there should not be one.** The tick count rides the frame, so
   speed is the room's, not the state's: a `C2S` message, host-only at the MVP, with the majority
   vote of plan §3.4 adapted from `../CarrierDominion/server/vote.js` afterwards. X2.
4. **The seven `REFUSAL` codes have no words** in either catalogue (ruling 027; a refusal needs
   words and a warning). X1's client half.
5. **Not written down at all until now:** hosting a room from a save (X2); the seat token kept in
   `localStorage` and what a second tab on the same token gets (X1 client half: the newer socket
   wins and the older one is told why); a service-worker update arriving mid-room (plan §3.9 —
   the handshake refuses, the client says reload, a room is never swapped under a player); what
   singleplayer controls mean in a room (Space is a personal pause of the VIEW, speed keys are a
   request to the host, import-save is refused); and socket hardening the siblings learned —
   `maxPayload` from `LIMITS`, an origin check, per-IP connection caps, frames validated against
   an allowlist before they reach the queue (X1 room half).
6. **A watchdog.** `../CarrierDominion/server/watch.js` records the first tick the state goes
   somewhere it should not; a room's soak wants the same — negative funds, a tile owned by a seat
   that does not exist, a building on a network — as invariants checked every month in
   `room_soak`, not only at the end.

## X0 — The ground under the server (S)

**Goal.** Everything the server needs that is not the server.

**Do.**
- `ws` as the server's one runtime dependency, **set up as the sibling games have it** (A127):
  the version `../Fireline` and `../CarrierDominion` both pin, attached to the one HTTP server
  that serves the client, no web framework. The client still has no dependency;
  `test/purity.test.js` asserts nothing under `client/`, `engine/`, `shared/` or `worker/`
  imports it.
- **Read `../CarrierDominion/server/` before writing `server/`** — `static.js`, `clock.js`,
  `save.js`, `reconnect.js`, `doorman.js`, `lobby.js`, `vote.js`, `watch.js` — and
  `../Fireline/server/metrics.js` for the jitter ring. They are the shape to adapt, rewritten
  against this engine and this protocol, never copied in: that game hosts one war per server
  and this one hosts rooms. Say in the dev-log which module each of ours descends from.
- `shared/build-hash.js`: the hash of `engine/`, `shared/` and `data/` as shipped, computed by
  `tools/make_precache.mjs` into `client/precache.json` beside the version and read at boot — no
  build step. `BUILD_HASH` stops being a literal. `test/pwa.test.js`: a changed balance file is a
  new build hash; a changed stylesheet is not.
- `tools/gates.mjs` gains a `room` set, empty until X1, with a budget.
- `worker/sim-host.js`'s `snapshot` reply and the save format are asserted to be one shape
  (`test/session-worker.test.js`), because the join snapshot is that shape.

## X1 — Server and relay (L) — plan-v1 slice 5.1

**Goal.** Two real clients play one city, hash for hash, through a real socket.

**Do — the room, headless first.**
- `server/room.js`: one room is one state and one reducer. The pump (`server/pump.js`, an
  injectable clock, 100 ms): drain the inbound queue, assign `seq`, validate through `apply`,
  advance the ticks the speed owes, broadcast one frame `{tick, seq, cmds[]}` serialised once,
  record the gap in a jitter ring (plan §3.6). The state hash rides the frame once a sim-month.
- `server/index.js`: the static client (what `tools/serve.mjs` does today — one server, not two)
  plus `/ws`. `HELLO` → `compatible()` → `WELCOME` with seat, token and snapshot, or `REFUSED`
  with the reason; allowlist-validated inbound frames; `LIMITS` enforced; per-seat rate limits as
  a `RATE_LIMITED` result, never a disconnect.
- `server/store.js`: a room persists as state plus command log, written off the pump; a restart
  resumes it. `keepForDays` is read here.
- Resync: a client whose monthly hash differs gets a snapshot and the divergent `seq` is written
  to a replay artifact. Loud, never silent.

**Do — the client.**
- `client/transport/socket.js`: the third transport. `post(apply)` sends `COMMAND` and resolves
  when the frame carrying it (or its refusal) arrives; frames carrying other seats' commands are
  fed to the worker in `(tick, seq)` order; the tick count in a frame drives the worker's clock.
- `client/session-remote.js` is `openMirrorSession(given, socketTransport)` and nothing else — if
  it needs to be more, the seam was wrong and that is the finding.
- The optimistic ghost stays a ghost until its frame arrives; a refusal is the existing toast.
- `?room=<code>` boots into a room; without it nothing opens a socket (ruling 003: singleplayer
  makes no network call — `offline_smoke` already asserts it and keeps asserting it).
- **The room's hour** (A63): `phaseOf` takes the room's tick in a room and the wall clock in
  singleplayer; B4's rush and B5's roles read the same phase.

**Tests first.** `test/room.test.js` (node, no sockets — the pump driven by an injected clock and
an in-process transport): two clients' command streams interleave into one `(tick, seq)` order and
both end on the server's hash; a refused command changes nobody; a late joiner's snapshot plus the
frames after it equals the state of a client that was there from the start; a corrupted client is
detected at the next monthly hash and resynced; a mismatched build is refused. Both generated
fixtures replay through a room against their pinned hashes. The permission matrix runs unchanged.

**Gate.** `tools/room_soak.mjs` (the `room` set): the real server, two real `ws` clients driving
deputies, **five city years, identical hashes every month**; one client's state is corrupted on
purpose and is resynced; a client with a different build hash is refused with the reload reason.
`tools/room_smoke.mjs`: two browser contexts on the real page — one builds a road, the other sees
it within two frames, and both light clocks are within a game hour. Pump time and frame bytes go
in the dev-log as the first measured row of plan §3.8.

**Must not change:** any fixture hash; `offline_smoke`; the worker's message shapes.

## X2 — The lobby (M) — slice 5.2

**Goal.** Four people configure and start a room without a URL parameter.

**Do.** The new-game screen (N12) gains **Host a room** and **Join a room**: room creation with
the options record hashed into the initial state, a human-typeable join code and its QR (Q5),
the seed preview and regenerate (the diorama, already built), seats and names, ready, spectate,
host controls (start, kick, **speed as a `C2S` message — the tick count rides the frame, so speed
is the room's and never the state's**), **hosting a room from a save**, and joining a room that
has started. Reads `lateJoin` and
`privacy`. Every string in both catalogues; the join code field is the game's first text input,
so `a11y_smoke` and the sanitiser (`LIMITS.NAME_BYTES`) get it.

**Tests first.** `test/lobby-model.test.js`: the room's options and seed reproduce one region on
every client (the hash of the generated state); a full room refuses; a code is case- and
confusable-insensitive. **Gate.** `room_smoke` with four contexts: configure, ready, start, all on
one hash; `reach_smoke` and `ui_smoke` cover the two new screens.

## X3a — Requests in the engine (L) — slice 5.3, the half the plan thought was built

**Goal.** A demolition request is state, a command and a hash.

**Do.** Handlers for `requestDemolition`, `resolveRequest`, `withdrawRequest`, `reportNuisance`
and `ping`, in `engine/requests.js`, registered like every other: a request is a record in
`state.requests` (id, from, to, target, reason, tick, status), resolved by the owner or by their
standing policy, expiring after `requestExpiryMonths`, moot when its target burns down; an
approved one executes the bulldoze and moves the compensation between treasuries in one
transaction. `ping` writes nothing hashed and is refused by the reducer as a no-op with `OK` — it
is a frame for the other clients' cameras. The hashed-field list changes in both places; the
permission matrix gains a row per command per relation per mode; `copyState` deep-copies the
records; **the two-player fixture is extended to the request and its approval it was always
described as pinning, and re-pinned through `/fixture-repin` with that reason.** The deputy
answers by policy (X4 builds the policy command; here it approves nothing).

**Tests first.** `test/requests.test.js`; the matrix; the fixture. **Gate.** the `sim` set
(`disaster_soak` with requests in play); `room_soak` issues requests between its two deputies.

## X3b — Ownership in play, on the screen (L) — slice 5.3

**Goal.** Nothing you did not build is yours to destroy, and the way to ask is on the screen.

**Do.** The territory overlay gets its control at last (Q61 — the baked half has honoured it
since V7): a button, an i18n key, colour and pattern and label per seat (never colour alone). The
request inbox; `REQUEST_DEMOLITION` end to end with compensation; standing policies
(`CMD_SET_REQUEST_POLICY`); nuisance reports; pings that jump the camera; an activity feed; names
and reasons sanitised; chat behind `chatEnabled` and `freeTextReasons`. `requestExpiryMonths` is
read. Per-seat gates, ranks and city halls (T2, T5) shown as whose they are in the inspector.
Undo in a room: yours, refused once somebody else owns the ground (A123) — the toast says why.

**Tests first.** The permission matrix gains the multi-seat rows it has only had at the reducer;
`test/requests.test.js`: a request whose target burns down resolves as moot. **Gate.** `room_smoke`
multi-client acceptance: request → approve → the demolition executes and is paid for; the direct
path is refused with `NOT_OWNER`; the overlay shows two seats in two patterns at night
(`a11y_smoke`'s contrast row).

**Needs first:** W6's second half. See "what has changed", 1.

## X4 — Drop-in and absence (L) — slice 5.4

**Goal.** Leaving is safe, coming back is easy, and a city nobody is watching is still there.

**Do.** Leave and rejoin by seat token inside a grace window; **regency** — the deputy runs an
absent seat on the server under the doctrine the player set and answers demolition requests by
their standing policy (`absenceYears`); the abandonment sweep (`abandonYears`) and the derelict
rule (`derelictYears`); spectators (tokenless, no commands); a room where every seat is in regency
ticks at 1× and an empty one hibernates to disk. `splitRule`, `mutualAid` and `disasterAid` are
read where income, coverage and repair are shared (A19/A20's answers are the rules).

**Tests first.** `test/regency.test.js`: an absent seat's city neither collapses nor is destroyed
over forty years; a returning player finds treasury and land as the rules say. **Gate.**
`room_soak` in churn mode: seats join and leave at random ticks for forty city years, no
divergence, no orphaned land, with the deputy on the server only.

## The release gate — Multiplayer MVP

Eight players build one Shared City region together across a session that spans a disconnect and
a reconnect, with requests resolved both ways (`plan-v1.md`). Run as `room_soak` with eight
deputy clients and as one real evening with real people — the second is Kjell's, like the
singleplayer playtest was.

## Order

**X0 → X1's room half ∥ W6 second half ∥ X3a (engine, no player-visible change) — and there it
stops until Kjell has played (A125).** Then X1's client half → X2 → X3b → X4. W6 runs beside X1 because they touch
different files and X3 cannot be played without it. Wave 6 (modes, seasons, scale to sixteen,
operations) is not in this file and does not start until the release gate above is met.
