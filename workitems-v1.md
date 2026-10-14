# v1.0, v1.1, v1.2 — the milestones

*Written 2026-10-09 from Kjell's P113: "help local ally come to a ready-to-play multiplayer version,
let's call it v1.0, and then we can gather all the remaining details and balance issue into v1.1
milestone and v1.2 if needed." This re-cuts `plan-v1.md`'s "What Version 1 is": the old Version 1
(sixteen seats for an hour, districts and rivals, a deploy with every room resumed) is now v1.1 and
v1.2; **v1.0 is the Multiplayer MVP, deployed, played once by people**. Every item here points at a
lane file for its tests and gates; this file owns only the definition of done and the order.*

**Status 2026-10-15 — v1.0 is code-complete. Two things are left, and the first one is Kjell's.**

| | What | Who | Where |
|---|---|---|---|
| ~~**M12b**~~ | ~~the ops directory in the box's shape~~ — **built 2026-10-15**: `site.conf` and `citygrid.nginx.conf` pass `box/nginx-site.sh`'s lint and render both forms, `DEPLOYING.md` steps 5–7 are the helpers' commands, and two things wait on Kjell in `game-ops` — the `git rm -r CityGrid/` and `ops/box-tests-draft-fixture.patch` beside it | the ally | `workitems-mainline.md` |
| **V5** | one real evening on the deployed box: DNS, `DEPLOYING.md` steps 1–8, both gate sets against the deployed server, an hour with three or more people and a phone among them, notes into `playtest-notes.md` Part 4 | **Kjell** | the checklist below |
| **M7b** | the release: `RELEASE.md` re-measured, `git tag v1.0`, `main` fast-forwarded and **pushed** | the ally writes it, Kjell pushes | `workitems-mainline.md` |

Everything else in every lane is either built or deliberately in v1.1 — `dev_night` carries the
whole game, the suite is **2,155 tests green twice — on a clean worktree as well as here**, and
there are **sixteen gate sets**. The open
items per lane are listed in the status block at the top of each lane file; nothing open is in
v1.0's way. The tables below are kept as written: they are the record of how v1.0 was cut and what
each pass found.

## v1.0 — ready to play

**Definition of done.** Somebody with the address can open it on a phone or a desktop, host a
Shared City room, read the code to a friend across a table or a continent, build together for an
evening with up to the map's seat cap, lose a connection and come back to their seat, ask and
answer a demolition request, and find the room where they left it the next day. Singleplayer is
untouched: no socket, offline as an installed app.

**What is already true** (`workitems-multiplayer.md`, X0–X4h, eras 29–31): the room, the relay, the
door, the lobby's host and join, ownership on screen, requests both ways, regency, the abandonment
sweep, spectators, hibernation to disk, the history, the region's money and aid rules. `room_soak`,
`room_churn` and `room_smoke` (eight browsers, one of them a phone) are green. `main` is merged to `28b7800`.

**What v1.0 still needs**, in order:

| | Item | Where | Size |
|---|---|---|---|
| ~~V1~~ | ~~**The server you can run on a box**~~ — **built 2026-10-09**, bar running the steps on the box itself — plus the omissions below: an `Origin` check, `X-Forwarded-For` behind a trusted proxy, and `server/index.js` as the one server the smokes drive, **and the hibernated rooms' codes indexed at boot so `freeCode()` never hands one out (A143)** — `HOST` honoured (loopback by default when `NODE_ENV=production`), `PORT`, a data directory for rooms outside the repo, a systemd unit template with `MemoryMax` and `--max-old-space-size` a quarter under it, an nginx server block shipped HTTP-only with its own upgrade map, `tools/ssh-deploy.sh` reading a gitignored `deploy.env` (both **moved into the private ops repo on 2026-10-14**, where the script was re-cut from CarrierDominion's and the port corrected from a neighbour's 8133 to **8136**), and `DEPLOYING.md` — all adapted from `../Fireline/DEPLOYING.md` and `../CarrierDominion/DEPLOYING.md`, with the shared-box rules in `../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md` followed to the letter (claim a port, bind loopback, `ln … ; nginx -t \|\| rm …`). `/health` with the pump's jitter and the room count, because the unit's restart policy needs something to read | `workitems-mainline.md` **M12** | M |
| ~~V2~~ | ~~**The stale client is told to reload**~~ — **built 2026-10-09 as X6**, with the gate row in `room_smoke` (the path needs a real room to be refused by) and `?build=` as the lever that makes a client stale. `compatible()` refuses a build mismatch and the join screen has the words; the page must then actually update — `skipWaiting` on the explicit reload, never mid-room (plan §3.9) — and `update_smoke` proves a client on the old build is refused, reloads, and joins. Without this the first deploy after v1.0 desyncs every cached phone | `workitems-multiplayer.md` **X6** | S |
| ~~V3~~ | ~~**The lobby's last rows**~~ — **done 2026-10-09**: ~~ready~~, ~~joining a started room~~, ~~`lateJoin`~~ and ~~the treasury value~~ all built 2026-10-09; ~~**the QR**~~ built 2026-10-09 — **V3 is done**, bar a phone actually scanning `reports/lobby-qr.png` at V5: the join code as a QR (Q5, a hand-rolled encoder under `shared/`, no dependency), *ready* before the host starts, joining a room that has started, and `lateJoin` meaning something. `privacy` stays unread until a room list exists (v1.2); **and the treasury option loses its redundant `shared` value (A142)** — the lobby offers an equal split and a split by residents, an old save naming `shared` loads as `equal` | `workitems-multiplayer.md` **X2d** | S |
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
- ~~**`plan-v1.md`'s Wave 5 rows were unticked**~~ while the lane was built; ticked in this pass.
  ~~`specs/gamedesign.md` §34's as-built table has no multiplayer rows~~ — **ten were added the same
  day**, the multiplayer half of §25 and §26 as it was actually built — and ~~`playtest-notes.md`
  still opens with "Wave 5 has not been started"~~, which it no longer does: it opens with the two
  halves it has now, and **Part 4 is where V5's notes go**.
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
  edge. It is the first thing a phone player sees at V5. Before V5. ~~**K6a built 2026-10-10**~~ —
  six gesture rows on a coarse pointer, the card one column wide on a phone and opening at its
  first row; K6c, K6b and K6d remain.
- ~~**Q169, the advisor's card cut mid-sentence on a phone**~~ — **built with K6a (A146)**. It was
  not a cap at all: a `top: 3.2rem` left over from an older layout moved the card's PAINT inside a
  column that clips, so 51 px of it were cut away. The card scrolls inside a cap bounded by the
  rail now, and `play_smoke` asserts both.
- ~~**Q170 — the sun's shadow is invisible**~~ (8% darker than the ground, by the gate's own
  number) — **answered A145** and scheduled as **S22d**, before V5. The item is in
  `workitems-world.md`, written on 2026-10-11: it had been named in the order since P120 with no
  entry in any lane, and so had **S8b**.

**Found on 2026-10-12, by re-running the region sweep (D11):**

- ~~**X8 — the three region rules have no control**~~ — **built 2026-10-13**: a "Playing
  together" block on the new-game screen, the money rule as one question with three answers, and
  `room_smoke` reading the hosted room's options off the server. The `room` set split in two on the
  way (`room` for browsers, `wire` for the scripted soaks).

**Found on 2026-10-11, after K6a–K6c** (the omissions sweep on those slices):

- ~~**The help sheet offered a phone three sections of keys**~~ — **fixed the same day.** The rail's
  Controls button opens `help.js`, the same table as the first-run card one layer along; a phone
  gets the gestures and not one `<kbd>` now. `lobby_smoke` had been ASSERTING the defect — it asked
  both viewports for four sections and the tool shortcuts — and asks each its own question now.
- ~~**The share half of Copy link was never driven**~~ — **gated the same day.** `navigator.share`
  is the path every phone at V5 takes and no gate machine has one; `room_smoke` installs it before
  the page loads and asserts the button hands it the invitation.
- ~~**K7 — a phone cannot load a save**~~ — **built 2026-10-12**: two rows, *Save to* and *Load
  from*, no modifier anywhere, and the gate that presses the buttons found that `save()` never
  refreshed the slot list either.
- ~~**K8 — thirty-one controls are smaller than `--touch`**~~ — **built 2026-10-12**: one
  `@media (pointer: coarse)` block at the end of the stylesheet; 79 controls, none under 44 px, and
  the chrome is still 30% of the screen.
- ~~**M13 — the import census cannot tell `path.join` from `Array#join`**~~ — **built 2026-10-11**:
  the lookbehind, the spread corrected for, six dead imports gone.
- ~~**M14 — `quick` is 560 s of 600**~~ — **built 2026-10-11**: three sets, each one a question —
  `quick` 114/180, `screens` 276/360, `access` 122/210.
- ~~**D10 — the street row is a percentile over 39 frames**~~ — **built 2026-10-12**: a thin row
  has no p95 at all now, and a walking row records where it walked.
- ~~**D11 — `reports/region-era31.md` predates the firing table**~~ — **done 2026-10-12**: the
  re-run found `split-equal` reading identically to `null`, and the arm now measures a separate
  treasury (101% spread against 2%). It raised **X8**.

**V5, as a checklist for Kjell** (everything the ally cannot do):
0. The DNS record for `citygrid.kjell.today` pointing at the box, live before certbot runs.
1. `DEPLOYING.md` "First-time box setup", steps 1–8, run in order on the shared box — the port
   (claimed: 8136), the user and Node, `./ops/ssh-deploy.sh --bootstrap --first`, the loopback
   `/healthz`, then the three `game-ops/box/` commands (vhost, certificate, vhost again, written
   out in steps 5 and 6) and `box/check.sh --outside`, the neighbour sweep, the games index and the
   siblings' `NEIGHBOURS` once the name answers. **Two `game-ops` commits come first**, both in
   M12b's entry: the draft directory's `git rm` and the box suite's fixture patch.
2. `node tools/gates.mjs release --url https://citygrid.kjell.today` and `room --url …` once —
   **built as K6d on 2026-10-11** and measured against a hand-started server: eight clients on one
   hash in 49 s, eight browsers on one hash in 79 s. `room_soak` and `room_churn` print `n/a`
   there on purpose; they read the room inside the gate's own process.
3. Open the address on a phone, scan the QR from a second device, host a room, invite at least
   three people, play an hour at the map's seat cap, lose a connection on purpose and come back,
   file and answer a request both ways, leave the room overnight and open it the next day.
4. Notes into `playtest-notes.md`: every refusal, every "what is this", every hitch — A134's W6c
   trigger is read here — and the top of v1.1 is written from them.

Then **M7b**: the release page re-measured, `git tag v1.0`, `main` fast-forwarded and pushed.

## Omissions pass, second (2026-10-10, after P119) — the evening, rehearsed on paper

*Walked through V5's checklist as a host and as a guest on a phone, against the code and
`reports/hud-phone.png`, before anybody does it for real.*

- ~~**A host cannot copy the invitation.**~~ — **built 2026-10-10 as K6b.** `navigator.share` where
  it exists and the clipboard otherwise, beside the code in the lobby and on the started roster;
  `room_smoke` opens what was copied in a second browser and lands in the room. → K6.
- ~~**The phone's rail wraps to two rows**~~ — **built 2026-10-10 as K6c.** 94 px of a 44 px
  button before, 44 after, with a conditional fade at the edge a button is cut off at; `room_smoke`'s
  phone client measures the nine-button case. Icons are still an art decision and v1.1's. → K6.
- ~~**The deployed half of V4 cannot be run as written.**~~ — **built 2026-10-11 as K6d.**
  `gates.mjs release --url https://…` and `room --url …`, measured against a hand-started server:
  eight clients on one hash in 49 s, eight browsers on one hash in 79 s, and the gates that read
  the room inside this process print `n/a` rather than passing. → K6, done.
- **The DNS record is step zero.** `DEPLOYING.md` assumes `citygrid.kjell.today` resolves; nothing
  says who creates the record or that certbot's challenge needs it live first. → V5's checklist.
- **Checked and fine:** the join screen and roster strings exist in both catalogues (the parity
  test); `ALLOWED_ORIGINS` is documented with the exact-match rule; the release set's scripted
  eight and the room set's eight browsers are two gates on purpose.

## Omissions pass, third (2026-10-14, after P122) — the box, read beside `game-ops/`

*Thirty-one commits since P120 reviewed; everything accepted. **Measured by the reviewer on a clean
worktree of `3247e46`:** `quick` 139 s of 180, `screens` 283 s of 360, `access` 131 s of 210, all
green; the suite 2,141 of 2,156 with one failure (below) and 14 skips. Then the first deploy rehearsed on paper against the private ops repo, for the single
player's installed app and the room alike.*

- **The ops directory is not in the box's shape, and steps 5–7 are the hand-run steps the box
  retired.** `game-ops/box/nginx-site.sh` and `expand-cert.sh` are how every sibling gets its
  vhost and its name on the shared certificate; they want `<game>.nginx.conf` with exactly one
  `listen 80;` and a `site.conf` with a marker only this game serves. `ops/` has `nginx.conf` with
  two `listen` lines and no `site.conf`, and `DEPLOYING.md` step 6 runs `certbot certonly`, which
  writes no 443 block — the site would come up HTTP-only with an origin allowlist that only admits
  `https`. → **M12b**, **built 2026-10-15**.
- **Two directories for one game in `game-ops/`.** `CityGrid/` is the 2026-09-27 draft for the
  static game, still marked `DRAFT`; `citygrid/` is live and the symlink's target; the README's
  mapping names the first. → M12b hands Kjell the `git rm`, **and the patch the box suite needs beside it**: that
  draft directory is the suite's DRAFT and `CSP_FROM` fixture, so removing it alone turns
  `game-ops/test.sh` red and retires the CSP-hash render path. `ops/box-tests-draft-fixture.patch`
  gives the suite a synthetic draft game instead; 314 + 138 green in a copy.
- ~~**`tools/.probe8.mjs` is a committed scratch probe**~~ (S22d's shadow-rig reader). → M12b, deleted.
- **A clean checkout's suite is red by one test.** `dev-questions.md` is untracked (it is Kjell's
  file), and `test/docs.test.js`'s count check reads it unconditionally: on the reviewer's worktree
  of `3247e46` the suite is 2,141 of 2,156 with that one failure and 14 skips. The release
  claims "green twice" from a tree that has the file. → M12b, **done**: it skips the way
  `deploy.test.js` skips without `ops/`, and a clean worktree now runs 2,155 with 17 skips and no
  failures.
- **Checked and fine, for the single player:** every one of the 220 precache entries is under a
  directory the deploy's rsync allowlist carries (`client`, `data`, `engine`, `shared`, `vendor`,
  `worker`, `index.html`, `manifest.webmanifest`); `sw.js` and every file are served `no-cache`
  and `/healthz` `no-store`, so an installed phone revalidates and X6's reload path has something
  to find; the manifest's `scope` and `start_url` are `./`; the service worker registers with the
  precache version and the page works without it.
- **Checked and fine, for the room:** the unit binds loopback under `NODE_ENV=production`, caps
  memory with the heap a quarter under, keeps rooms in `/var/lib/citygrid` with `ProtectSystem=strict`
  and that one path writable, sets `TRUST_PROXY=1` behind nginx's `X-Forwarded-For` and
  `ALLOWED_ORIGINS=https://citygrid.kjell.today` exactly as a browser sends it; the vhost carries
  the upgrade under our own map name; 8136 is claimed in the port ledger with 8137 the next free;
  the deploy script checks DNS before it touches anything, compares the box's build hash with the
  one it just made, and matches the public check on that build rather than on `ok`;
  `test/deploy.test.js` is 11 green on the machine that has `ops/`.

## v1.1 — the remaining details and the balance

**The top of this list is written on the night of V5.** Below it, everything open in every lane,
gathered into one table so nothing has to be found by reading ten files. Cheapest first within each
group; sizes as the lane files have them. **Re-checked 2026-10-14** against each lane's status
block: no row below has been built since it was written, and the three rows marked *(new)* were
noticed in the rounds after 2026-10-10.

| Group | Item | Lane | Size |
|---|---|---|---|
| **Kjell's looks** | Q157/A135 the deputy's spacing, re-read with the evening's notes | behaviour | — |
| **The world** | S19b a station faces its track | world | S |
| | *(new)* the compare sheet's terrace row, re-shot now S23 draws terraces — and `terrace-as-it-was` dropped after one more sheet | world (S8) | XS |
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
| **The instruments** | *(new)* the gate-set budgets after X8 split `room` from `wire` — `room` was at 97% before it, and every new browser row eats `quick`, `screens` and `access` | measurement | S |
| | *(new)* `a-gate-run-is-exclusive` as a rule the runner enforces rather than a lesson: a set measured beside another reads 10–30% high | measurement | S |
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

~~V1 → V2 → V3 → V4~~ built 2026-10-09. ~~K6 (a → c → b → d)~~ 2026-10-10/11, ~~S22d~~ and ~~S8b~~
2026-10-11, ~~K7~~ and ~~K8~~ 2026-10-12, ~~X8~~ and ~~S23~~ and ~~S22e~~ 2026-10-13. **What is left
is V5 (Kjell) → M7b**, and then v1.1 from the evening's notes.

~~**M12b**~~ went before V5, as the review after P122 asked — **built 2026-10-15**. P120 (2026-10-10) answered Q168–Q170 as recommended, which is what put S22d and S8b ahead of the
evening; P121's round (2026-10-13) answered Q171 as **A148 — keep the soft rig**, and the ladder
that would price a harder light is in `sun_shots` rather than in a scratch script. **There are no
open questions.**
