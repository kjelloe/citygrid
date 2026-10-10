# v1.0, v1.1, v1.2 — the milestones

*Written 2026-10-09 from Kjell's P113: "help local ally come to a ready-to-play multiplayer version,
let's call it v1.0, and then we can gather all the remaining details and balance issue into v1.1
milestone and v1.2 if needed." This re-cuts `plan-v1.md`'s "What Version 1 is": the old Version 1
(sixteen seats for an hour, districts and rivals, a deploy with every room resumed) is now v1.1 and
v1.2; **v1.0 is the Multiplayer MVP, deployed, played once by people**. Every item here points at a
lane file for its tests and gates; this file owns only the definition of done and the order.*

## v1.0 — ready to play

**Definition of done.** Somebody with the address can open it on a phone or a desktop, host a
Shared City room, read the code to a friend across a table or a continent, build together for an
evening with up to the map's seat cap, lose a connection and come back to their seat, ask and
answer a demolition request, and find the room where they left it the next day. Singleplayer is
untouched: no socket, offline as an installed app.

**What is already true** (`workitems-multiplayer.md`, X0–X4h, eras 29–31): the room, the relay, the
door, the lobby's host and join, ownership on screen, requests both ways, regency, the abandonment
sweep, spectators, hibernation to disk, the history, the region's money and aid rules. `room_soak`,
`room_churn` and `room_smoke` (five browsers) are green. `main` is merged to `28b7800`.

**What v1.0 still needs**, in order:

| | Item | Where | Size |
|---|---|---|---|
| ~~V1~~ | ~~**The server you can run on a box**~~ — **built 2026-10-09**, bar running the steps on the box itself — plus the omissions below: an `Origin` check, `X-Forwarded-For` behind a trusted proxy, and `server/index.js` as the one server the smokes drive, **and the hibernated rooms' codes indexed at boot so `freeCode()` never hands one out (A143)** — `HOST` honoured (loopback by default when `NODE_ENV=production`), `PORT`, a data directory for rooms outside the repo, a systemd unit template with `MemoryMax` and `--max-old-space-size` a quarter under it, an nginx server block shipped HTTP-only with its own upgrade map, `tools/ssh-deploy.sh` reading a gitignored `deploy.env`, and `DEPLOYING.md` — all adapted from `../Fireline/DEPLOYING.md` and `../CarrierDominion/DEPLOYING.md`, with the shared-box rules in `../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md` followed to the letter (claim a port, bind loopback, `ln … ; nginx -t \|\| rm …`). `/health` with the pump's jitter and the room count, because the unit's restart policy needs something to read | `workitems-mainline.md` **M12** | M |
| ~~V2~~ | ~~**The stale client is told to reload**~~ — **built 2026-10-09 as X6**, with the gate row in `room_smoke` (the path needs a real room to be refused by) and `?build=` as the lever that makes a client stale. `compatible()` refuses a build mismatch and the join screen has the words; the page must then actually update — `skipWaiting` on the explicit reload, never mid-room (plan §3.9) — and `update_smoke` proves a client on the old build is refused, reloads, and joins. Without this the first deploy after v1.0 desyncs every cached phone | `workitems-multiplayer.md` **X6** | S |
| V3 | **The lobby's last rows** — ~~ready~~, ~~joining a started room~~, ~~`lateJoin`~~ and ~~the treasury value~~ all built 2026-10-09; ~~**the QR**~~ built 2026-10-09 — **V3 is done**, bar a phone actually scanning `reports/lobby-qr.png` at V5: the join code as a QR (Q5, a hand-rolled encoder under `shared/`, no dependency), *ready* before the host starts, joining a room that has started, and `lateJoin` meaning something. `privacy` stays unread until a room list exists (v1.2); **and the treasury option loses its redundant `shared` value (A142)** — the lobby offers an equal split and a split by residents, an old save naming `shared` loads as `equal` | `workitems-multiplayer.md` **X2d** | S |
| ~~V4~~ | ~~**The release gate at eight**~~ — **built 2026-10-09** as two gates (`release` is the scripted eight, `room` holds eight browsers with a phone among them), and the room rows found three phone defects in one run; what is left is running both against the DEPLOYED server, which is V5's evening — plus a 390×844 context in `room_smoke` and a room row in `reach_smoke` and `a11y_smoke`, because no room has ever been seen on a phone: `room_soak` with eight scripted clients and `room_smoke` with eight browsers (or four, if the gate machine cannot hold eight, and the number written down), across a disconnect and a reconnect, requests resolved both ways — the gate `plan-v1.md` has named since August | `workitems-multiplayer.md` **X7** | S |
| V5 | **One real evening.** Kjell and at least three people, on the deployed server, for an hour: a notes file in `playtest-notes.md`'s shape, every refusal they hit, every "what is this", every hitch (A134's trigger for W6c is read here). This is the acceptance; nothing in a gate replaces it | **Kjell** | — |
| V6 | **The release**: `RELEASE.md` re-measured at the tag, `git tag v1.0`, `main` fast-forwarded and **pushed**, and the README leading with how to host a room | `workitems-mainline.md` **M7b** | S |

**Not in v1.0, on purpose:** W6c (A134 — held until V5 says the hitch is felt); Wave 6's modes,
districts and contracts; rivals and seasons; sixteen seats for an hour; the master index and the
room list; a phone performance card; every picture question in Q161–Q166.

## Omissions pass (2026-10-09, after P113) — checked against the code

- ~~**No `Origin` check on the socket.**~~ **Built in M12.** `server/index.js` caps connections per IP and payloads per
  message, and accepts a WebSocket from any page on the internet. On a public hostname that is a
  cross-site socket: a stranger's page can open a room in a visitor's browser. V1 adds the check
  (the page's own origin, or an allowlist from the environment) and refuses the rest at the door.
- ~~**Behind nginx every client is one IP.**~~ **Built in M12** (`TRUST_PROXY=1`, first entry of the chain, capped at 64 characters). The per-IP cap reads `remoteAddress`, which is the
  proxy's; eight players behind TLS are "one address with eight connections" and the ninth is
  refused. V1 reads `X-Forwarded-For` only when a trusted proxy is configured (`TRUST_PROXY=1`).
- ~~**Three smokes drive `tools/serve.mjs`, not the room server.**~~ **Built in M12**: `tools/serve.mjs` is DELETED rather than aliased, and unifying them found a live CSP bug in one run — the policy was computed from `index.html` and sent with every file, so `tools/shoot.html`'s own inline scripts were refused. It is per page now. `serve_smoke`, `reach_smoke` and
  `a11y_smoke` spawn the static server, so the real server's static path and CSP have never been
  under a gate — and plan §3.5 said "one server, not two". V1 makes `server/index.js` the one
  server (`tools/serve.mjs` becomes a thin alias or goes), and the three smokes spawn it.
- ~~**No room has ever been seen on a phone.**~~ **Built in X7** — and it found three defects in one run: the first-run card covers the rail, the advisor's text swallowed the press meant for it, and `max-height` with `overflow: visible` is a decoration. Originally: `room_smoke`'s five contexts are all 1280×800; the
  join screen, the inbox, the roster, the chat and the request panel have no phone row, and
  `reach_smoke` and `a11y_smoke` never open a room, so the room's panels have never been hit-tested
  or contrast-checked. V4 adds a 390×844 context to `room_smoke` and a room row to both sweeps.
- ~~**A resync is silent to the player.**~~ **Built in X6** — `CLIENT_KINDS` is the alert list's second source, because a resync is not an engine event and must not become one. Originally: `session.js` counts desyncs and asks the transport to
  resync; nothing on screen says "the room re-sent the city". A short status line, in both
  catalogues, in X6.
- **`plan-v1.md`'s Wave 5 rows were unticked** while the lane was built; ticked in this pass.
  `specs/gamedesign.md` §34's as-built table has no multiplayer rows, and `playtest-notes.md` still
  opens with "Wave 5 has not been started" — both are the ally's next docs round, and the
  playtest file is where V5's notes go.
- **Checked and fine:** `wss:` follows the page's protocol (`session.js`); chat, names and reasons
  go through the reducer's sanitiser with `LIMITS`; the host-only speed is enforced on the server;
  the per-seat command rate is enforced; the stale-client reload path exists on `controllerchange`
  and only needs the refusal to trigger it (V2).

**Also in v1.0, from P114:** S22b (the sun stood further out) and S22c (the lit styles take the real
light) — two small world items that make S22 whole; they go after M12 and before X6, because the
evening should be played under the sun as it will ship.

## Review after X7, M11 and Q167 (2026-10-10) — P118

*Read on `dev_night` at `f401088`, the tree clean. On a clean checkout the suite is green twice;
the `room`, `release` and `quick` sets are below. **Everything since the last review is accepted**:
M12 (the box — config, an origin check, the proxy's address, `/healthz`, one static handler,
`DEPLOYING.md` with the first-time steps written as they will be run), S22b and S22c, X6, X2d's
last rows and the hand-rolled QR, X7 (eight scripted clients on one hash with a p99 of 16 ms
against the plan's 150; eight browsers with a phone among them), M11, the unplanned round and
Q167's one static handler under sixteen tools. The instrument findings are the best of the
batch: a gate that passes on zero subjects, a rule that cannot fire in the configuration an arm
measured, and a dead constant that fences dead imports.*

**Measured by the reviewer on a clean checkout of `f401088`:** suite green twice; `room` **262 s of 300**, 3 of 3 (room_smoke 157 — eight browsers with a phone among them — room_churn 58, room_soak 48); `release` **47 s of 180**, `room_eight` green. `quick` was green at 535 s of 600 on the previous checkout and was not re-run.

**V1 to V4 are built. What is left of v1.0 is one phone defect, one evening and one tag.**

- **K6 — the phone's first-run card** (`workitems-navigation.md`), found by looking at
  `reports/play-phone.png`: bare key names with no explanation and no touch row, clipped at the
  edge. It is the first thing a phone player sees at V5. Before V5.
- **Q169, the advisor's card cut mid-sentence on a phone**, is the second thing they see. The ally
  left it as a look for Kjell; the reviewer's recommendation is **scroll inside the cap**, which is
  one CSS line and the same shape as K6's fix, and it goes into K6 unless Kjell says ellipsis.
- **Q170 — the sun's shadow is invisible** (8% darker than the ground, by the gate's own number).
  Opened by the reviewer; a v1.1 picture item unless Kjell wants the evening played under visible
  shadows.

**V5, as a checklist for Kjell** (everything the ally cannot do):
0. The DNS record for `citygrid.kjell.today` pointing at the box, live before certbot runs.
1. `DEPLOYING.md` "First-time box setup", steps 1–8, run in order on the shared box — claim the
   port, the user and Node, the unit, one deploy, nginx HTTP-only, the shared certificate
   lineage, the outside check and the neighbour sweep, the hosting document.
2. `node tools/gates.mjs release --url https://citygrid.kjell.today` and `room --url …` once (the
   switch is K6's), which is the deployed half of V4 the ally could not run.
3. Open the address on a phone, scan the QR from a second device, host a room, invite at least
   three people, play an hour at the map's seat cap, lose a connection on purpose and come back,
   file and answer a request both ways, leave the room overnight and open it the next day.
4. Notes into `playtest-notes.md`: every refusal, every "what is this", every hitch — A134's W6c
   trigger is read here — and the top of v1.1 is written from them.

Then **M7b**: the release page re-measured, `git tag v1.0`, `main` fast-forwarded and pushed.

## Omissions pass, second (2026-10-10, after P119) — the evening, rehearsed on paper

*Walked through V5's checklist as a host and as a guest on a phone, against the code and
`reports/hud-phone.png`, before anybody does it for real.*

- **A host cannot copy the invitation.** X2c made the host's address bar the invitation and X2d
  drew the QR; there is no **Copy link** or share control anywhere, and on a phone the address bar
  is the hardest thing on the screen to copy. One button beside the code, `navigator.share` where
  it exists and the clipboard otherwise, in the lobby and on the roster. → K6.
- **The phone's rail wraps to two rows** — Overlays, Tax, Saves, History, Controls, Statistics,
  Settings — which the first playtest named on 2026-08-29 ("the rail needs to be icons rather than
  words") and nothing has done since; in a room it gains Requests and Players. Icons are an art
  decision and v1.1's; the v1.0 mitigation is a **single non-wrapping strip that scrolls**, like the
  alert chips under it. → K6.
- **The deployed half of V4 cannot be run as written.** `room_soak` and `room_smoke` have no way to
  be pointed at another server — they spawn their own — so "the gates against the box once" is a
  sentence with no command behind it. A `--url` on both (the browsers open the given origin, the
  scripted clients dial its `/ws`), and `gates.mjs release --url` passes it through. → K6.
- **The DNS record is step zero.** `DEPLOYING.md` assumes `citygrid.kjell.today` resolves; nothing
  says who creates the record or that certbot's challenge needs it live first. → V5's checklist.
- **Checked and fine:** the join screen and roster strings exist in both catalogues (the parity
  test); `ALLOWED_ORIGINS` is documented with the exact-match rule; the release set's scripted
  eight and the room set's eight browsers are two gates on purpose.

## v1.1 — the remaining details and the balance

**The top of this list is written on the night of V5.** Below it, everything open in every lane
on 2026-10-10, gathered into one table so nothing has to be found by reading ten files. Cheapest
first within each group; sizes as the lane files have them.

| Group | Item | Lane | Size |
|---|---|---|---|
| **Kjell's looks** | Q168 the compare sheet's terrace row has never photographed a facade — re-frame it | world | XS |
| | Q170 the sun's shadow is invisible — intensity, tint, radius, with `sun_shots` | world | S |
| | Q157/A135 the deputy's spacing, re-read with the evening's notes | behaviour | — |
| **The world** | S19b a station faces its track | world | S |
| | S18's shore line | world | XS |
| | S20's subject counts in the picture gates | world | S |
| | S15b the lit response · S15c the road is the largest colour | world | M + M |
| | S14 the embankment (now the wall's job; close or re-scope) | world | S |
| | S11's remaining half: `hilly` as a playable map, the walk green on it | world | M |
| | what is left of D8b — the picture tools still build quest-free cities | measurement | S |
| **Behaviour** | B15 count B14's refusals | behaviour | S |
| | B6's rain (the overcast hour is built; the rain itself is not) | behaviour | M |
| | a single purse if the evening wants a common pot (A142) | multiplayer | M, hashed |
| **The stall** | W6c the graph that is not rebuilt — only if V5 felt the hitch (A134) | worker | L |
| **Modes** (Wave 6.1) | `data/modes.json`, district claiming, the commons band, open borders, supply contracts, shared civic projects, the multi-seat demand allocation | new lane | L |
| **Rivals** (Wave 6.2) | per-seat scoring and per-seat rank (A129), season markers, the recap | new lane | L |
| **Hardware** | D2 a phone card · D3 the tier retune · D5's rest · F3 the film | measurement, film | needs a phone |

## v1.2 — scale and operations, if needed

- **Scale** (Wave 6.3): sixteen seats on 128×128 for an hour with hashes identical and jitter p99
  under 150 ms (eight measured 16 ms at X7); clock degradation under load; checkpointing with log
  truncation; `profile_run` and `host_probe`; plan §3.8's remaining rows measured.
- **Operations** (Wave 6.4): backups and room restore proven by a kill and a restart with every
  live room resumed; `/metrics` beyond `/healthz`; the master index and the server browser, and
  `privacy` with it (the one unread option left).
- **Whatever v1.1's evening ranked below the line.**

## Order

~~V1 → V2 → V3 → V4~~ built 2026-10-09. **K6 → V5 (Kjell) → M7b.** Then v1.1 from the notes.
