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
*Read on `dev_night` with the committed tree at `1f13ee7` (B14, 2026-10-06) and the working tree
two days ahead of it. The node suite is green on the committed tree (1,662 at HEAD's own count) and
green on the working tree (**1,939 of 1,942, 3 skipped, 0 failed**); the `quick` set was running
while this was written and its result is below. Everything since the last review is **accepted**:
the world lane through S21b, behaviour through B14, L1, M7 and M8, W6a and W6b, and the multiplayer
lane from X0 to X4e — a room a player can host, join by code, build in, ask a neighbour in, leave
and come back to. The quality of the finding-writing held through it: X1d's eight-times-too-fast
room, X1c's three hashes from a server with no quests, X2c's one-seat room, each caught by the gate
the item asked for. Looked at by the reviewer: the territory overlay with three seats, the three
skins, the water as one sheet, the shops from the air, the train. They are what the items say.*

**The one finding that matters is not in the code.** Every multiplayer slice from X1b to X4e —
71 files, 5,152 lines, three fixture re-pins, `SAVE_VERSION` 5 → 6, a `PROTOCOL_VERSION` bump and
the whole rewrite of the lane files for an architect — is **uncommitted**. The last commit is B14 on
2026-10-06; the dev-log has fourteen entries after it. §0's rule is one commit per slice, and the
reason is not tidiness: a crash, a bad `git checkout --`, or the reviewer's own worktree habit loses
two days, and `main` cannot be fast-forwarded to a tree that is not in the history. **Commit now,
one `slice-<id>` per dev-log entry in the order the entries were written**, with the fixture re-pin
in X3b's commit where its `why` says it is. Then `tools/gates.mjs all` on the committed tree, and
M7's merge note updated — `main` is at era 26's release and the game is at era 29.


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

1. **A build action costs every client 115 ms and resets its traffic.** **(void since slice-W6b part, 2026-10-04: that number was `createModel` timed COLD plus a nav graph nobody had warmed. Warm, a build action was 98.3 ms and is 58.9 ms now — and life survives a build since B11.)** W6 measured it: a model
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

## X1d — A room runs at the game's speed (S) — **BUILT 2026-10-07**, found by `room_smoke`

*`SPEEDS = [0, 2, 6, 16]` was applied once per 100 ms beat, so a room ran at 20 ticks a second
where singleplayer's play speed is 2.5 — a city in a room aged **eight times faster** than the same
city on one machine, for the whole life of the room half. `room_smoke` measured 19.9 ticks a second
the moment a browser could join. Now `TICKS_PER_SECOND`, with the remainder carried in integer
thousandths so a slow beat does not lose the time it took.*

**Three sources, two of which said both things.** `specs/plan.md` §3.6: "1× = 2 fast ticks/s (one
sim-month per 6 s)" — self-consistent — and then "so a pump does at most ~2 fast ticks", which is
the arithmetic of the defect. `test/room.test.js`: the rule in a comment ("two fast ticks a second")
above the defect in an assertion (24 ticks in 1.2 s). Nothing compares a comment with the number
below it, and singleplayer was the tie-breaker.

**The instruments moved with it.** The rate test asserts a RATE now, including that the carried
remainder is not dropped. The monthly-resync test needed sixty beats rather than twelve, landing
exactly on the boundary — the monthly hash is the city AT the frame that carried it. `room_soak`
plays the five city years it claims again: 45 s of wall clock rather than four, with its command
intervals derived from the length so it still files ~63 builds a seat. And its ten-times-longer run
took the worst warm beat from 13.85 to 22.25 ms with nothing about the work having changed, so the
pump reports a `costDigest` of what the beat costs and the budget is checked at the p99:
**p50 0.10 ms, p99 1.78, worst warm 15.89 over 3,000 beats, worst cold 44.26**, against §3.8's 20.

## X1c — The client half (L) — **BUILT 2026-10-07**, A131 lifted A125

*`client/transport/socket.js`, the third transport: the contract's new `onMessage(handler)` (this
lane's review item 1), a sim host driven by frames, nothing applied at post time, FIFO matching of
frames to pending posts **by command and not by seat** — a frame carries my own `CMD_JOIN`, which I
never posted — and **by value, not by reference**, because the frame crossed a wire and a road's
`runs` is a different array with the same numbers. `?join=<code>` opens the socket and skips the
lobby; `?seat=` goes with it until X2 picks one. Every command in `game.js` takes the session's seat
rather than the module constant 1, which seat two would have been spending seat one's money with.
The room's hour is the room's PLAYED milliseconds, stamped on each frame, never hashed and held
while paused — A63's own reading (derive it from the tick) is the one A41 rejected with a
measurement.*

**The gate found what the soak cannot.** `tools/room_smoke.mjs` — two browsers on the real server,
in `quick` and in `room` — put the two clients and the room on **three different hashes at one
tick with zero desyncs anywhere** on its first run: the server had no content adapter, so the room
ran with no quests while every browser had 21, and quest progress is hashed state. `room_soak`
could not see it because its scripted clients share the server's own process and mirrors. This
lane's review filed it as item 2 on 2026-10-04. `server/content.js` fixes it, fatally rather than
with a fallback. It then cost the pump its 20 ms budget honestly — 11.35 → 36.68 ms worst beat —
and the attribution is 10 ms of monthly quest pass, of which the overrun is the FIRST run of it:
**13.85 ms warm over 471 beats against 32.77 ms cold**, so the pump reports both and the gate
checks the warm one.

**Measured:** both browsers on one hash (`a3096376bd197a6c`) at tick 364, seat two saw seat one's
road 6 of 6 tiles, one shared hour (18.259 s on both, unmoved after 500 ms of pause), no page or
console errors, 41 s. Suite 1,862 green twice.

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

## X1b — The door has words (S) — **BUILT 2026-10-04** as `slice-X1b`

*As built: eight `REFUSAL` codes including `SEAT_TAKEN`, which `server/room.js` gives when the seat
is taken and keeps `ROOM_FULL` for when the room actually is (`room.js:90–92`, `test/room.test.js`
drives both). `refused.<code>` in both catalogues — eight keys each — and `test/i18n.test.js` has
the same pair of assertions it makes for `RESULT`, plus a third that the two mismatch strings say
reload in both languages. The review round of 2026-10-06 listed this item as open: it read the
header, which had never been ticked, rather than the code.*

## X1b — the item as written, 2026-10-04

**Goal.** Every way the door can say no is a sentence a player can read, in both catalogues, before
anybody is standing at it.

**Analysis.** `shared/protocol.js` has seven `REFUSAL` codes and **not one of them has words**, in
either locale. `RESULT` codes are covered — `test/i18n.test.js` asserts both directions, and P98
built that after H6's `TOO_STEEP` nearly shipped mute — and the refusals were simply never added to
the same test, so the gap is invisible rather than known. Two of them are load-bearing in a way the
others are not: `versionMismatch` and `buildMismatch` are the *only* thing standing between a stale
client and a silent desync (plan §3.9), and what the player must read is **reload**, not "refused".

And a defect found while reading them: **a taken seat is refused as `ROOM_FULL`**
(`server/room.js`). A room with one of four seats taken is not full, and a player told "the room is
full" will not try another seat. `REFUSAL.SEAT_TAKEN` is the eighth code.

**Do.**
- `REFUSAL.SEAT_TAKEN`, used where `join` means it.
- `refused.<code>` in `data/i18n/en.json` and `no.json` — eight keys each. The two mismatch strings
  say **reload**; `rateLimit` borrows the register of `result.rateLimited`, which already exists.
- `test/i18n.test.js` gains the same pair of assertions it makes for `RESULT`: every code has words
  in every catalogue, and every `refused.*` string is a code the protocol can actually give.

**Not in this item.** Showing them. The join screen is X2's and the toast is X1's client half; this
is the half that can be done now and the half that is cheapest to forget once a screen exists.

**Done when** the suite refuses to go green with a wordless refusal code, in either direction.

## X3c — The derelict override (M) — gamedesign §25.4, found in X3a

**BUILT (slice-X3c, 2026-10-05).** `state.derelicts` is the clock the analysis below said did not
exist: five places plus a save migration (4 → 5) that starts an old save's ruins at the tick it
loads, because nobody can prove how long they have stood. `RESULT.NOT_DERELICT` with words in both
catalogues. The deputy reads the list instead of sweeping 4,096 tiles, and the swap was **proved
free rather than assumed free**: six 25-year deputy cities with disasters on, byte-identical state
hashes and identical `cleared` counts in both arms, so no sweep was voided and era 28 stands.
`test/disasters.test.js` derives the ruins both ways and compares, which is the invariant the
deputy's new reader rests on — and `test/deputy.test.js` had to pair its own two writes, because a
fixture that sets `FLAG_RUINED` by hand was making state the engine never makes. Gate:
`disaster_soak` 200 × 25, all eight kinds fired, 0 cities ended empty. Still open: X3b's half, the
visible mark and an inbox — the client cannot reach the request channel at all yet.

**Goal.** A ruin left to rot against a neighbour's park can be removed on the neighbour's request,
against the owner's wishes, after `derelictYears`.

**Analysis — the clock does not exist.** §25.4 says "a building abandoned for longer than a set
number of years may have its demolition approved on a neighbour's request". The engine knows a tile
is a ruin (`FLAG_RUINED`, set by `fire.js` and `disasters.js`) and it knows when every *building*
went up (`builtTick`), and **nothing records when a tile became a ruin** — a ruin is not a building
record at all, it is a flag on a tile whose building is already gone. So the rule cannot be written
without new hashed state. Four shapes were considered:

| shape | cost | verdict |
| --- | --- | --- |
| a `since` tile layer (u16 months) | a new `TILE_LAYERS` entry: the RLE save, the hash, `copyState`, the patch, 32 KB at 128² before compression | rejected — a whole layer for a few dozen tiles |
| `ruinedTick` on the building record | ruins have no building record | impossible |
| derive it from `state.history` | city-wide samples, not per tile | impossible |
| **a `derelicts` list in state** | the same shape `requests` and `contracts` already have: five places, sparse, canonical by tile order | **chosen** |

A list also answers a second question for free: **B1a's deputy scans the map for ruins** to clear
them, and a list is what it should be reading.

**Do.**
- `state.derelicts: [{ tile, sinceTick }]`, kept sorted by tile — written where `FLAG_RUINED` is
  set, removed where it is cleared (`bulldozeInto`, and whatever rebuilds on the tile).
- The five places, every time: `createState`, `copyState`, `writeState`, `HASHED_FIELDS` in
  `test/fixture.test.js`, and the save with a **`SAVE_VERSION` bump** and a migration that starts an
  old save's ruins at its own tick (the honest default: nobody can prove how long they have stood).
- `resolveRequest`: the **requester** may approve their own demolition request when every target tile
  is in `derelicts` and `state.tick - sinceTick >= derelictYears * TICKS_PER_YEAR`. The owner keeps
  every earlier answer they have today; this is an extra door, not a replacement.
- The deputy reads the list instead of scanning (B1a's `keepClear`), and the sweep says whether that
  changes what it does — **a change to what the deputy decides voids every sweep number** (CLAUDE.md),
  so it is the same slice or a stated era bump.
- "Derelict buildings are visibly marked" (§25.4) is the renderer's half and belongs with X3b.

**Tests first.** `test/requests.test.js`: a ruin younger than `derelictYears` cannot be force-approved
and the refusal says which (`NOT_OWNER` is wrong here — the ground is not the reason, the clock is,
so this wants its own `RESULT` code and therefore words in both catalogues, three layers, ruling 027);
an older one can; bulldozing clears the entry; two ruins of different ages in one request take the
younger one's answer. `test/save.test.js`: the list round-trips and an old save migrates.
**Gate.** `disaster_soak` (ruins are what it makes) and the `sim` set with the deputy's new reader.

**Done when** a neighbour can clear a five-year ruin, a four-year one is refused with a reason that
names the clock, and the sweep says what the deputy's new reader did to the city.

## X3d — Districts refuses a building and not a road (S) — **BUILT 2026-10-06** as `slice-X3d`

**Decided: option (b).** A network crosses a district with consent (`openBorders` or the holder's
`openTo`); a building never may. `districtAllows(state, actor, index, consent)` in
`engine/permissions.js` is the one question `canBuildOn` and `canConnectAcross` both ask, through
`ownershipPartitions(mode)` — the predicate that had no caller is the rule now. The pinned rows in
`test/build.test.js` flipped from "road: OK" to `outOfSector`, with two new rows for consent and for
one's own district. The `room_soak` two-seat Districts gate still waits on X2.

## X3d — the item as written, 2026-10-05

**Goal.** One question about whose ground this is, asked by everything that touches ground.

**Analysis.** `canBuildOn` carries the Districts rule — "unclaimed land inside somebody's district
is theirs to develop; only your own district is open to you" — and has **exactly one caller**,
`placeBuilding` in `engine/utilities.js`. Roads, wires, pipes and rails go through
`canConnectAcross`, which returns OK for `OWNER_NATURE` without looking at the district at all. So
in Districts mode a seat **may pave, wire and pipe straight across another seat's district** and may
not put a hut on it.

Nothing played today can see it: Shared City is the default and has no districts, and Wave 5 is
headless. It was found by writing a reader for `ownershipPartitions` and `isCooperative` — two
exported predicates that state exactly this rule and that **nothing has ever called**, which is why
the two halves could disagree for the life of the project. `test/build.test.js` pins both directions
now, so the day this is fixed the test says which half changed.

**Do.** Decide the rule first, because it is a design question rather than a bug to patch: a road
across a neighbour's district is either (a) the same trespass a building is, (b) allowed because a
network legitimately crosses a border with consent (`openBorders`, `openTo`) — in which case
Districts needs its own consent for the district as well as for the owner — or (c) allowed and the
building rule is the one that is wrong. §25 and `specs/plan.md` §2.5 describe (b) for borders and
say nothing about districts.

Then make it ONE question: `canConnectAcross` and `canBuildOn` both ask `ownershipPartitions(mode)`
and the district layer, instead of each carrying its own copy of a mode test.

**Tests first.** The rows in `test/build.test.js` flip from "road: OK" to whatever is decided, and
the matrix gains a district dimension. **Gate.** `room_soak` with two seats in Districts, once X2
can start one.

## X2a — The door asks which room (S) — **BUILT 2026-10-06**

*The headless half of slice 5.2, which is the half A125 allows. `shared/roomcode.js`: Crockford
base32, six characters, `I`/`L`/`O`/`U` out and the first three read back as `1`/`1`/`0`; the
caller owns the randomness, so the server passes `randomBytes(6)` and `shared/` stays generator-free.
A typed code is untrusted input — capped at 32 characters before it is walked, separators removed,
anything else `""` and never stripped. `createRoom({ code })` mints one when not told; `join`
refuses `BAD_CODE` for another room's code AND for none at all, normalising at the door rather than
only in the lobby; `WELCOME` names the room; the store keeps the code beside the save so a restart
is the same room. `REFUSAL.MALFORMED` is the eighth code, because `BAD_CODE` was also what a
message that is not a hello got — X1b's lying refusal one door along. `PROTOCOL_VERSION` 2 → 3: a
required field is a wire change. Gate `room_soak` green with three new rows, worst beat 11.35 ms of
20.*

**Two tests earned their keep by being planted.** The bad-input list could not tell a stripping
normaliser from a refusing one — every string in it had too few or too many alphabet characters —
so the discriminating cases (`"<ABCDEF>"`, `"!ABCDEF!"`, `"ABCDEF;--"`) were added and the plant
fires. And the alphabet's size is asserted by COUNTING: each of the 32 characters comes from
exactly 8 of the 256 byte values, which 31 would break silently.


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
**What X2a already did of that list (2026-10-06):** the code is case- and confusable-insensitive
(`test/roomcode.test.js`), and a full room refuses — with `SEAT_TAKEN` and `ROOM_FULL` told apart
since X1b (`test/room.test.js`). **What is left is the screen**, plus two things it implies and
X2a deliberately did not build: the client socket transport (X1's client half) and a **multi-room
registry** — one process still hosts one room, addressed by `roomId` for the store and by its code
at the door, and a lobby that creates rooms needs both a registry and a create message on the wire.
All of it is behind A125.

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
`setRequestPolicy` (5.4, X4's regency). §25.4's **derelict override** was not built here either —
a neighbour approving the demolition of a ruin against its owner's wishes needs a clock the
building record does not have (`builtTick` is when it went up, not when it was abandoned), and
inventing one is a hashed field in five places and a re-pin of every fixture — and that is exactly
what **X3c did on 2026-10-05**, including the five places and the three re-pins.

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

**Found in X3c (two).** `specs/plan.md` promises that a request whose land changes hands
"transfers to the new owner with the clock reset"; `request.to` is written at filing and never
moves, so today it sits in the former owner's inbox and the new owner never sees it. Either move it
when ownership moves or resolve it `moot` — and `request.to` is hashed state, so whichever it is
costs a fixture re-pin.

The inbox also has to be able to tell a demolition the owner **agreed** to from one
cleared over their head on the derelict rule: both end as `requestResolved` with status `APPROVED`
and the only difference in state is that `request.from === request.to`'s answerer was the requester.
Either the event says so (`forced`, which re-pins every fixture that holds a resolution) or the
inbox derives it from the record; decide it with the inbox's words in front of you, and also decide
what the OWNER is told, because being outvoted silently is the grief move in the other direction.
`derelictYears` is read now; `absenceYears` and `abandonYears` are X4's.

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
rule (built in X3c — what is left here is the deputy ANSWERING a request by a standing policy, and
the absent seat's own ruins ageing while nobody is watching); spectators (tokenless, no commands); a room where every seat is in regency
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
~~X0~~ → ~~X1's room half~~ → ~~X1b~~ → ~~X3a~~ → ~~X3c~~ → ~~X3d~~ → ~~X2a~~ → ~~X1c~~ →
~~X1d~~ → ~~X2b~~ → ~~X2c~~ → ~~X3b~~ → ~~X4a~~ → ~~X4b~~ → ~~X4c~~ → ~~X4d~~ → ~~X4e~~.

A125 held everything player-facing behind Kjell's singleplayer playtest and **A131 lifted it on
2026-10-07**. Ruling 003 did not move: singleplayer still opens no socket and `offline_smoke` still
asserts it.

### What a reader can do with it today

Host a room from the new-game screen, send somebody the address bar, have them join by typing the
code or watch without taking a seat. Build, ask a neighbour to clear their ground or report a
nuisance, answer from an inbox or set a standing answer and let the month do it, point at a tile
with one of seven phrases, chat if the room has it on, see who is in the room and say you are away.
Leave, and the city keeps going: the seat is yours for two minutes, then a deputy plays it, then
after `abandonYears` the ground goes to the commons. A room nobody is in stops playing.

### What is left

