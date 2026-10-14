# Deploying City Grid to a box (M12)

One Node process serves the client over HTTP and the rooms over a WebSocket.
No build step, no database, one runtime dependency (`ws`).

This playbook is adapted from `../Fireline/DEPLOYING.md` and
`../CarrierDominion/DEPLOYING.md`, and it follows
`../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md` — every rule in
that file was paid for in real breakage on the shared host, and the
one-sentence version is: **the box is a neighbourhood. Every global thing you
touch — nginx, certbot, ports, disk, RAM — is shared, so make each change
self-testing and self-rolling-back, one change at a time.**

## What the server is

`node server/index.js` — the page, `/ws`, and `/healthz`. It is the **only**
server: `run.sh` starts it, and so do `serve_smoke`, `reach_smoke` and
`a11y_smoke`. There used to be a second static server for development, and
that is how `serve_smoke` came to exist at all: eight gates passed while
`./run.sh` was broken, because the server a player used sent a
Content-Security-Policy the others did not.

The static half is `server/static.js` — the type table, the per-page policy and
the handler — and since Q167 every browser tool calls it too. They do not share
the PROCESS, because a picture harness needs no pump and no rooms, but a file
served to a gate now carries the headers it carries to a player. Nothing in
`tools/` serves this tree its own way, and `test/tools.test.js` keeps it that
way.

## Configuration

Everything comes from the environment, and `server/config.js` owns the defaults
and the reasons. `argv[2]` still sets the port, because `./run.sh 8200` is in
every document.

| Variable | Default | What it decides |
|---|---|---|
| `NODE_ENV` | *(unset)* | `production` turns the loopback default on. The unit sets it; nothing else in the game reads it |
| `PORT` | `8123` | The port. Claim one in the box's hosting document first, one per game |
| `HOST` | `0.0.0.0`, or `127.0.0.1` under `NODE_ENV=production` | The bind address. **Loopback on a shared box**: a `0.0.0.0` bind exposes the raw port through the firewall and bypasses TLS entirely |
| `ROOMS_DIR` | `rooms` | Where hibernated rooms live. Point it **outside** the deployed tree so an allowlist rsync can neither skip them nor carry them |
| `KEEP_FOR_DAYS` | `30` | How long a room nobody came back to is kept before `prune` takes it |
| `MAX_SOCKETS_PER_IP` | `16` | How many sockets one address may hold open. It was a literal **8** until K6d — exactly the number of players the release gate claims — so eight people behind one NAT were one short of a room. The default is the room's own seat cap (`LIMITS.SEATS_MAX`), which is the real limit on how many clients a city can hold; set it lower on a box that wants it tighter |
| `TRUST_PROXY` | off | Read `X-Forwarded-For` for the per-address connection cap. Behind nginx every socket's address is `127.0.0.1`, so without it the cap counts the internet as one client — and believed unconditionally it is a limit anybody can type their way around. Set it **only** where a proxy really sets the header |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated origins that may open a socket, exactly as a browser sends them. The browser's same-origin policy does **not** apply to `new WebSocket(...)`, so without this a page the player merely visits can open a socket into their room |

A socket with **no** `Origin` is always allowed: `room_soak`, `room_smoke`'s
`ws` clients and any script are originless, and a non-browser client cannot be
tricked by a web page.

## `/healthz`

`/healthz` and `/health` are the same handler. `/healthz` is the box-wide
convention — one path a monitoring sweep hits across every port on the machine.

```json
{ "ok": true, "build": "43879f3c6729", "uptimeSeconds": 412, "rssMb": 83,
  "rooms": 2, "seats": 5,
  "jitter": { "p50Ms": 100, "p99Ms": 102, "maxMs": 104 }, "resyncs": 0 }
```

- **`rssMb`** because the box caps this process and a sweep should see the climb
  before the OOM reaper acts.
- **`jitter`** is the **worst** room's, not an average over rooms: one city
  stalling is the thing worth seeing, and averaging it away is how a stall hides.
- **`resyncs` must be 0.** The monthly state hash is compared on the client —
  the only place that holds both numbers — so the server cannot count desyncs;
  a resync request is what a client sends when it finds one, which is the
  server-side shadow of the same event.

## Where the deploy files live

**`ops/` is a symlink to the private ops repo** (`game-ops/citygrid/`), as it is
for every sibling game on this box — `game-ops/README.md` is the mapping. It
holds three files: `citygrid.service`, `nginx.conf` and **`ssh-deploy.sh`**. They
are not in this repo and never should be: between them they carry the host's
identity and they are the only files on a developer's machine that can change a
live box. `ops` is gitignored here, and a clean checkout simply has no `ops/` —
`test/deploy.test.js` skips itself there and runs on the machine that can deploy.

## The templates

`ops/citygrid.service` and `ops/nginx.conf`, both commented with the reason for
every line. Two of those reasons are worth repeating here because they take down
**every** site on the box rather than only this one:

- **`MemoryMax` AND `--max-old-space-size` ~25% under it.** V8 cannot see the
  cgroup, so without the flag the first sign of memory pressure is a SIGKILL
  from the OOM reaper: no GC pressure, no stack trace, possibly mid-write of a
  room's checkpoint. The checkpoint write is atomic (tmp + rename) precisely
  because that kill lands whenever it likes.
- **Link nginx the safe way.**

  ```bash
  sudo ln -s /etc/nginx/sites-available/citygrid /etc/nginx/sites-enabled/citygrid
  sudo nginx -t || sudo rm /etc/nginx/sites-enabled/citygrid
  ```

  `ln -sf` *then* `nginx -t` leaves a broken file live: nginx keeps serving the
  old config from memory so nothing looks wrong, and every future reload on the
  box fails — a neighbour's deploy, certbot's renewal.

And one that is only ours: **our own upgrade map, under our own name**
(`$citygrid_connection_upgrade`). The classic snippet references
`$connection_upgrade`, which may or may not be defined when our file parses —
and redeclaring the shared one is itself a config error.

## First-time box setup

Written as the steps to run, in order. Each one is verifiable before the next.

1. **Claim the port** in the box's hosting document
   (`game-ops/RetroMultiCiv/multi-game-hosting.md`), one row, one port,
   loopback-bound. **City Grid is 8136.** It was written down as 8133 from M12
   until 2026-10-14, and 8133 is Sunset Runner's live port on this same box: the
   first `systemctl start` would have fought a running neighbour for the socket.
   The number had been copied from a sibling's unit rather than claimed in the
   table. `ops/ssh-deploy.sh` now reads the port out of the unit and refuses to
   run when the two disagree — but only this table can catch the wrong row.
2. **Node 22+ and a user:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
   sudo useradd -r -m -d /opt/citygrid citygrid
   sudo mkdir -p /var/lib/citygrid/rooms && sudo chown -R citygrid: /var/lib/citygrid
   ```
3. **The unit and the first deploy, in one command:**
   ```bash
   cd ~/GIT/citygrid && ./ops/ssh-deploy.sh --bootstrap --first
   ```
   `--bootstrap` creates the system user, `/opt/citygrid`,
   `/var/lib/citygrid/rooms` and their ownership, then installs and **enables**
   (does not start) `/etc/systemd/system/citygrid.service` from
   `ops/citygrid.service` — so step 2's `useradd`/`mkdir` are only there for
   anybody doing it by hand. `--first` says nginx and TLS are not up yet, which
   turns the public check from an error into a note. Add `--dry` to see every
   change first.
4. **Prove the process:** `curl http://127.0.0.1:8136/healthz` **on the box**.
   The script does this itself and fails the deploy if it does not answer; doing
   it by hand once is how you learn what the body looks like.
5. **nginx, HTTP-only:** copy `ops/nginx.conf`, link it with the
   `ln … ; nginx -t || rm …` form above, reload, and verify
   `curl http://citygrid.kjell.today/healthz` **from outside**.
6. **TLS:** extend the box's **shared** certificate lineage rather than minting
   a new one. Transcribe the existing `-d` list exactly from
   `sudo certbot certificates`, then add ours:
   ```bash
   sudo certbot certonly --nginx --cert-name <lineage> -d <every existing name> -d citygrid.kjell.today
   ```
   A failed certbot run leaves the old certificate intact; a wrong `-d` list is
   the real risk. The TLS block then points at the **lineage's** path, not at
   `/etc/letsencrypt/live/citygrid.../`.
7. **Verify like you mean it:** `curl https://citygrid.kjell.today/healthz` from
   outside, then sweep the neighbours, because the failure mode is that our site
   is perfect while a neighbour serves the wrong chain:
   ```bash
   for h in multiciv aworldbegun pitfall retromulticiv games fireline servers.multiciv; do
     echo -n "$h: "; curl -sI --max-time 10 "https://$h.kjell.today" | head -1
   done
   ```
   **A 404 can be a pass** — any HTTP status proves the TLS chain worked,
   because a bad certificate fails as a curl *error*, not a status code.
8. **Record it:** the port row in the hosting document, City Grid in the games
   index, and any new lesson back into the dos-and-donts file.

## Deploying again

```bash
cd ~/GIT/citygrid && ./ops/ssh-deploy.sh
```

| flag | what it does |
|---|---|
| *(none)* | check, sync, install, restart, verify |
| `--dry` | print what would sync and change nothing, on the box or here |
| `--yes` | skip the prompts: an uncommitted tree, and a city with players in it |
| `--unit` | also install `ops/citygrid.service` when the box's copy differs |
| `--bootstrap` | first run: user, directories, unit (then carries on and deploys) |
| `--first` | nginx/TLS not set up yet — the public check becomes a note |
| `--neighbours` | only curl the other sites on the box; needs no ssh key |

It refreshes `client/precache.json` first, because the build hash the join
handshake compares is read from it — a deploy with a stale manifest refuses
every client that has the new code, and every installed browser keeps the old
cache for ever.

### What it checks, and when it fails

**The exit code is the whole point: 0 only when every check passed.** Anything
that failed is listed under `FAILED` at the end and exits 1, because a deploy
that prints `!!` eight times and exits 0 is a deploy somebody walks away from.

*Before anything is touched, on this machine:* `ssh`, `rsync`, `curl`, `git`,
`node` and `sha1sum` on `PATH`; the deploy key readable (`GAME_SSH_KEY`
overrides the path); `ops/citygrid.service` present, which is how a broken
symlink is caught; **the unit's `PORT`, nginx's `proxy_pass` port and the
script's own port all the same number**; the branch, the commit and how many
tracked changes are about to become public.

*On the box, while the old process is still serving:* `nginx -t` (a neighbour's
broken config becomes our outage at the next reload); who owns our port, and a
refusal if it is anybody but node; a `0.0.0.0` bind; `node` present and 22+;
`npm` present; `/var/lib/citygrid/rooms` present and writable by the service
user (without it the rooms fall back **inside** the synced tree); disk and
memory headroom; what `/healthz` says is running — build, uptime, rss, rooms,
**seats**, jitter and resyncs — and a prompt if anybody is in a city, because a
restart drops them even though the room is checkpointed and comes back; whether
the installed unit still matches `ops/citygrid.service`.

*After the restart:* `systemctl is-active`, then the loopback `/healthz`, then a
hash of `package.json`, `data/balance.json`, `engine/reducer.js` and
`client/precache.json` on both sides — a half-finished rsync leaves a tree that
serves; then the bind address (loopback only); then **the build hash the box
reports against the one this deploy just made**, which catches an old unit, a
second process and a sync that did not land; then the public endpoint, matched
on **our build** rather than on `ok` (every health endpoint on this box says
ok, so `ok` cannot tell our site from a neighbour answering our name); then
every neighbour on the box.

## Operations

- Logs: `journalctl -u citygrid -f`
- Rooms: `/var/lib/citygrid/rooms/<code>.json`, one file per sleeping room,
  pruned after `KEEP_FOR_DAYS`. A room that is awake is checkpointed every
  thirty beats; one that empties is written out and dropped five minutes later.
- A restart resumes the room the server booted with, and any sleeping room wakes
  when somebody types its code.
- Changing a limit or an origin is a unit edit, `daemon-reload`, restart. No
  code involved.

## What is not here yet

The room list and the master index (ruling 009 — a documented later addition
with inert hooks in place), and a metrics endpoint beyond `/healthz`. The
release gate for the wave is **eight clients and one real evening**
(`workitems-v1.md` V4 and V5), not a green suite.

The scripted half of that gate can be pointed at this box (K6d):

```sh
node tools/gates.mjs release --url https://citygrid.kjell.today   # eight clients, one hash
node tools/gates.mjs room    --url https://citygrid.kjell.today   # eight browsers, one of them a phone
```

Nothing is spawned: the browsers open the origin, the scripted clients dial its
`/ws` (`wss` under `https`), and a room is hosted the way a player hosts one. A
checkout that is not the build the box serves is refused at the door and the
gate says so. `room_soak` and `room_churn` print `n/a` there and mean it — they
read the room inside the gate's own process.
