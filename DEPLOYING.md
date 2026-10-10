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

1. **Claim the port** in the box's hosting document (`multiciv/ops/multi-game-hosting.md`),
   one row, one port, loopback-bound.
2. **Node 22+ and a user:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
   sudo useradd -r -m -d /opt/citygrid citygrid
   sudo mkdir -p /var/lib/citygrid/rooms && sudo chown -R citygrid: /var/lib/citygrid
   ```
3. **The unit:** copy `ops/citygrid.service`, set `User`, `WorkingDirectory`,
   `PORT`, `ROOMS_DIR` and `ALLOWED_ORIGINS`, then
   `sudo systemctl daemon-reload && sudo systemctl enable citygrid`.
4. **Deploy once:** `cp tools/deploy.env.example tools/deploy.env`, fill it in,
   `bash tools/ssh-deploy.sh`. Then
   `curl http://127.0.0.1:8133/healthz` **on the box** — the loopback check
   proves the process, nothing more.
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

`bash tools/ssh-deploy.sh` (or `--yes` to skip the dirty-tree prompt). It
refreshes `client/precache.json` first, because the build hash the join
handshake compares is read from it — a deploy with a stale manifest refuses
every client that has the new code.

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
