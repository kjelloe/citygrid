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
   (both mayors build a city hall, neither a second) and X3b shows whose each one is. **Done in
   X3a** (`test/unlock.test.js`): a seat that has completed nothing places the rank-2 building,
   because the CITY earned it, and gets exactly one.
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

## X0 — The ground under the server (S) — **done 2026-10-04 as `slice-X0`**

`ws` 8.18.0 pinned exact (the siblings' version), with `test/purity.test.js` keeping it out of
everything the browser ships. `shared/build-hash.js` holds the build hash with a setter — the shape
`engine/rules.js` has, since that module may not do I/O — computed by `tools/make_precache.mjs` over
`engine/`, `shared/` and `data/` only, written into `client/precache.json` beside the cache version
and read by `client/main.js` at boot. `BUILD_HASH` the literal is gone. `test/pwa.test.js`
demonstrates the boundary (drop `data/balance.json` from the list and the hash moves; drop
`client/style.css` and it does not), and `test/protocol.test.js` — the first test this protocol has
ever had — asserts what `compatible()` does with a version mismatch, a build mismatch and a dev
build on either side. The `room` set exists in the runner, empty, with its budget written before its
first gate. `test/session-worker.test.js` asserts the snapshot and the save restore one city.

Ancestry, as A127 asks: read `../CarrierDominion/server/{static,clock,save,reconnect,doorman,lobby,
vote,watch}.js` and `../Fireline/server/metrics.js` before writing anything; X1's modules name which
of them each descends from.

## X0 — The ground under the server (S) — the item as written

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

## Review before X1 (2026-10-04, after X0)

*Read against the seam as built, not against the plan's description of it.*

1. **The transport contract is request/response and a room PUSHES.** `openMirrorSession(given,
   transport)` takes `post(message) → Promise<reply>` and nothing else — which is all a worker or
   the echo stub ever needs, and is why W4 did not notice. A room broadcasts frames: a frame
   carrying **another seat's** command has no promise waiting for it, so with today's contract the
   mirror would never hear about it. **The contract gains one member** — `onMessage(handler)`, which
   the worker transport never calls and the socket transport calls per frame — and the session
   treats a pushed message as an apply it did not ask for: feed the local worker, patch the mirror,
   announce. Settled here because X1's ROOM half decides the frame shape, and a frame shaped for a
   reply is a frame that cannot be pushed.
2. **The server needs the content the way the worker did.** W2's first `worker_smoke` had the two
   arms 5,300 apart in the treasury because the worker ran on `engine/rules.js`'s mirrors with no
   quests. The server imports `engine/` the same way and may do I/O, so it loads `data/` at startup
   — and the room's content is what the build hash is OF, which is what the handshake compares.
   A room whose content differs from a client's is the same defect wearing a socket.
3. **`keepForDays` leaves the unread list** when `server/store.js` reads it, and
   `test/omissions.test.js` will go red in the direction that means somebody did the work (A124).
   Twelve left after that.
4. **Nothing in `server/` is precached.** `tools/make_precache.mjs`'s roots are `client`, `engine`,
   `shared`, `worker`, `data`, `vendor` — the server is not shipped to a browser and must not be.
5. **The two walks and `passability` are a nine-second set now** (S18's split): a room slice can run
   `render` as cheaply as the suite, and `lanes` only when the model changes.

## X1 — Server and relay (L) — plan-v1 slice 5.1

**Goal.** Two real clients play one city, hash for hash, through a real socket.

**The room half is BUILT (slice-X1a, 2026-10-04).** `server/{room,pump,store,index}.js`,
`worker/patch.js`, `test/room.test.js` (11 tests), `test/store.test.js` (6, added in the round after — the store had
none, which is why `prune` was never called by anybody), `tools/room_soak.mjs` in a `room` gate set
that is now a set with a member in it. Measured: five city years, 480 beats, **no divergence and
one hash for all three** (room, both clients), monthly checks 79 of 79, **worst beat 9.81 ms of a
20 ms budget**, jitter p50 10 / p99 11 / late 0%. Each module names its ancestor in its header
(A127) and the dev-log entry lists them. Two findings came out of it and are written where they
can be read: **a seat joining is a COMMAND, not a side effect** (`server/room.js`), and **a
resync is a re-join, not a patch** (`server/room.js`, plan.md §3.2). What is left of X1 is the
client half below, which waits for the playtest (A125).

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
  resumes it. `keepForDays` is read here — and **`prune` is called** (startup and daily from
  `server/index.js`), which it was not when it was written: an option read by a sweep nobody runs is
  the `setRules` shape with a different name.
- Resync: a client whose monthly hash differs gets a snapshot and the divergent `seq` is written
  to a replay artifact. Loud, never silent.

**Do — the client.**
- `client/transport/socket.js`: the third transport. `post(apply)` sends `COMMAND` and resolves
  when the frame carrying it (or its refusal) arrives; frames carrying other seats' commands are
  fed to the worker in `(tick, seq)` order through the contract's **`onMessage`** (see the review
  above — a reply-only transport cannot carry somebody else's command); the tick count in a frame
  drives the worker's clock.
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

**Gate.** `tools/room_soak.mjs` (the `room` set): the real server, two real `ws` clients,
**five city years, identical hashes every month**; one client's state is corrupted on
purpose and is resynced; a client with a different build hash is refused with the reload reason.
All of that is green at X1a with two amendments, both written in the tool: the clients are
**scripted rather than deputies** (`deputyTurn` applies to a state rather than emitting commands,
so a deputy client is X4's regency work, not this gate's), and the corruption is of a client's
**simulation** rather than its mirror — a mirror edited by hand is overwritten by the next patch,
so the first cut of that check passed with no resync having happened at all.
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

**BUILT (slice-X3a, 2026-10-04; tests and omissions round the same day).** `engine/requests.js`:
five handlers, one record with two kinds,
a monthly pass for the clock and the quiet endings. `test/requests.test.js` (14 tests), the
permission matrix's request rows, A129's two-seat city-hall proof in `test/unlock.test.js`, the
two-player fixture extended to the request and its approval and re-pinned, and `room_soak` now
files nine requests over the wire and answers them from the owner's inbox. Save version 2 → 3 with
a migration, because a request gained a `kind`. Three things came out of it: **a bulldoze is free
at two of three difficulties** (Q155 — `idiv(1 × 90, 100)` is 0, which is how the money assertion
found it), **`toSave` aliased the live state** and now builds off `copyState`, and the omissions
option-scan **could not see `server/`**, so the X0 review's claim that `keepForDays` would leave
the unread list was wrong until the scan was widened. Found in the round after: **`C2S.PING` and `CMD_PING` were the same string** — a latency probe and
a camera gesture with one name on one wire, which nothing would have caught until somebody sent the
command type at the top level and got a `pong`. The probe is `C2S.LATENCY` now, `PROTOCOL_VERSION`
is **2** (a message name is the wire, and a rename is free only while nobody outside the repo speaks
it), and `test/protocol.test.js` pins the two namespaces as disjoint. Also: X3a's three events are
invisible to the player, which is correct until X3b builds the inbox and is now *declared* in
`test/omissions.test.js`'s event census rather than merely true.

What is NOT built, deliberately:
`setRequestPolicy` (5.4, X4's regency) and §25.4's **derelict override** — a neighbour approving
the demolition of a ruin against its owner's wishes needs a clock the building record does not
have (`builtTick` is when it went up, not when it was abandoned), and inventing one is a hashed
field in five places and a re-pin of every fixture. Written here rather than half-built.

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
(`disaster_soak` with requests in play); `room_soak` issues requests between its two clients —
scripted, not deputies, for the reason the gate's own header gives.

**Measured at X3a.** `room_soak` five years: 124 commands accepted and **none refused**, 9 requests
filed and 9 approved over the wire, one hash on all three machines with the clock stopped, worst
beat 11.63 ms. Two of those numbers are new instruments rather than new behaviour, and both found
something: the gate used to count the commands it **sent** (on seed 1003 one seat's rows are water,
so a whole seat built nothing for five years while the gate reported a busy city), and it used to
compare the three hashes **while the pump was still beating**, which read one client a frame behind
and called it a divergence. It now reads the room's own result code for every command, and stops
the clock before comparing.

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

**~~X0~~ → ~~X1's room half~~ ∥ W6 second half ∥ ~~X3a~~ (engine, no player-visible change) — and
there it stops until Kjell has played (A125).** X0, X1's room half and X3a are built (2026-10-04);
what is left before the playtest is W6's second half, which is a renderer slice. X0 and X1's room half are built (2026-10-04). Then X1's client half → X2 → X3b → X4. W6 runs beside X1 because they touch
different files and X3 cannot be played without it. Wave 6 (modes, seasons, scale to sixteen,
operations) is not in this file and does not start until the release gate above is met.
