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
| V2 | **The stale client is told to reload.** `compatible()` refuses a build mismatch and the join screen has the words; the page must then actually update — `skipWaiting` on the explicit reload, never mid-room (plan §3.9) — and `update_smoke` proves a client on the old build is refused, reloads, and joins. Without this the first deploy after v1.0 desyncs every cached phone | `workitems-multiplayer.md` **X6** | S |
| V3 | **The lobby's last rows**: the join code as a QR (Q5, a hand-rolled encoder under `shared/`, no dependency), *ready* before the host starts, joining a room that has started, and `lateJoin` meaning something. `privacy` stays unread until a room list exists (v1.2); **and the treasury option loses its redundant `shared` value (A142)** — the lobby offers an equal split and a split by residents, an old save naming `shared` loads as `equal` | `workitems-multiplayer.md` **X2d** | S |
| V4 | **The release gate at eight** — plus a 390×844 context in `room_smoke` and a room row in `reach_smoke` and `a11y_smoke`, because no room has ever been seen on a phone: `room_soak` with eight scripted clients and `room_smoke` with eight browsers (or four, if the gate machine cannot hold eight, and the number written down), across a disconnect and a reconnect, requests resolved both ways — the gate `plan-v1.md` has named since August | `workitems-multiplayer.md` **X7** | S |
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
- **No room has ever been seen on a phone.** `room_smoke`'s five contexts are all 1280×800; the
  join screen, the inbox, the roster, the chat and the request panel have no phone row, and
  `reach_smoke` and `a11y_smoke` never open a room, so the room's panels have never been hit-tested
  or contrast-checked. V4 adds a 390×844 context to `room_smoke` and a room row to both sweeps.
- **A resync is silent to the player.** `session.js` counts desyncs and asks the transport to
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

## v1.1 — the remaining details and the balance

Everything that makes the game better without making it a different game, gathered after V5's
notes. In the order the notes are likely to rank them:

- **What the evening found** — the top of this list is written on the night.
- **Balance**: the deputy's spacing and stranded homes (Q157/A135 stands, re-read with the
  notes), a single purse if the evening wants a common pot (A142), the quests-in-the-sweep era's
  follow-ups, W6d's re-seat (Q161), a phone performance card and the tier retune it unblocks (D2,
  D3, D5).
- **The world**: S19b, S18's shore line, S15b and S15c (tone), S14, S20's subject counts, B15 and
  B6's rain, the film (F3, needs a phone's frame rate).
- **The stall**: W6c, if V5 felt it.
- **Modes and districts** (Wave 6.1): `data/modes.json`, district claiming, the commons band, open
  borders, supply contracts, shared civic projects, the multi-seat demand allocation — the first
  thing that makes two rooms play differently.
- **Rivals and seasons** (Wave 6.2): per-seat scoring, per-seat rank (A129), season markers, the
  recap.

## v1.2 — scale and operations, if needed

- **Scale** (Wave 6.3): sixteen seats on 128×128 for an hour with hashes identical and jitter p99
  under 150 ms; clock degradation under load; checkpointing with log truncation; `profile_run`
  and `host_probe`; the predicted budgets in plan §3.8 replaced with measured ones.
- **Operations** (Wave 6.4): backups and room restore proven by a kill and a restart with every
  live room resumed; `/metrics`; the master index and the server browser, and `privacy` with it.
- **Whatever v1.1's evening ranked below the line.**

## Order

V1 → V2 → V3 → V4 → V5 (Kjell) → V6. V1 first because V4 and V5 need a server that is not a
laptop; V2 before V3 because the first deploy after the lobby changes is the first stale client.
