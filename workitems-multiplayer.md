# multiplayer — work items

*Written 2026-10-04 from Kjell's P102: "and multiplayer as discussed." This is Wave 5 of
`plan-v1.md` — slices 5.1 to 5.4 — rewritten as work items against what is actually built now,
which is not what the wave was planned against in August. `specs/plan.md` §3 is the architecture
and stays the authority; this file is the order and the done-whens. Same rules as
`workitems-cityviewer.md` §0, plus CLAUDE.md's determinism machinery: **the server and every
client run one reducer and must agree on one hash**, and a divergence that survives a week of
investigation is a stop-and-re-plan condition (`plan-v1.md`).*

**Ruling 003 holds Wave 5 behind the singleplayer MVP being accepted, and acceptance is Kjell's,
not a green suite.** Q149 asks whether P102 is that acceptance. Until it is answered, X0 and the
headless half of X1 are safe to build — they add a directory and a dependency and change nothing
a singleplayer player touches — and nothing a player sees is built.

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
- The reducer already keeps seats, ownership, requests, contracts; `test/fixtures/two_player.json`
  pins a join, a cross-border build, a demolition request and its approval.
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

## X0 — The ground under the server (S)

**Goal.** Everything the server needs that is not the server.

**Do.**
- `ws` as the server's one runtime dependency, pinned exact, in `dependencies` (the client still
  has none; `test/purity.test.js` asserts nothing under `client/`, `engine/`, `shared/` or
  `worker/` imports it). Q151.
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
host controls (start, kick, speed), and joining a room that has started. Reads `lateJoin` and
`privacy`. Every string in both catalogues; the join code field is the game's first text input,
so `a11y_smoke` and the sanitiser (`LIMITS.NAME_BYTES`) get it.

**Tests first.** `test/lobby-model.test.js`: the room's options and seed reproduce one region on
every client (the hash of the generated state); a full room refuses; a code is case- and
confusable-insensitive. **Gate.** `room_smoke` with four contexts: configure, ready, start, all on
one hash; `reach_smoke` and `ui_smoke` cover the two new screens.

## X3 — Ownership in play (L) — slice 5.3

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

**X0 → X1 (headless room, then the socket transport) ∥ W6 second half → X2 → X3 → X4.** X0 and
the headless half of X1 are safe before Q149 is answered. W6 runs beside X1 because they touch
different files and X3 cannot be played without it. Wave 6 (modes, seasons, scale to sixteen,
operations) is not in this file and does not start until the release gate above is met.
