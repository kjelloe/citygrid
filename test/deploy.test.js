// The deploy surface (M12): the unit, the nginx block, the script and the
// playbook, held against the server they deploy.
//
// None of this runs on a developer's machine, which is exactly why it needs a
// test: a template nobody parses is a file that goes stale the first time a
// variable is added, and the way you find out is a box that will not start.
// Three of the checks below are the sibling box's rules in executable form
// (`../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md`), because each
// of those takes down EVERY site on the host rather than only this one.
//
// **`ops/` is a symlink to the private ops repo** since 2026-10-14 (the host's
// identity, the unit, the nginx block and `ssh-deploy.sh` all live there, as
// they do for every sibling game). So these tests skip on a checkout that has no
// `ops/` — and run on the machine that can actually deploy, which is the one
// where being wrong costs something.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdirSync, writeFileSync, symlinkSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { serverConfig } from "../server/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(root, name), "utf8");

const SCRIPT = "ops/ssh-deploy.sh";
const haveOps = existsSync(join(root, SCRIPT));
const noOps = haveOps ? false : "ops/ is a symlink to the private ops repo and is not in this checkout";

const unit = haveOps ? read("ops/citygrid.service") : "";
const nginx = haveOps ? read("ops/nginx.conf") : "";
const script = haveOps ? read(SCRIPT) : "";
const playbook = read("DEPLOYING.md");

/** A file with its `#` comment lines removed.
 *
 * Every "this must not appear" check below needs it, and the first run of this
 * file proved why: these templates are commented with the exact strings they
 * forbid — `listen 443`, `http2`, `grep -w ':8136'` — because the comment is
 * where the reason lives. `a-grep-that-counts-a-comment`, in the test that was
 * written to hold a comment's promise. */
const code = (text) => text.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");

test("every variable the server reads is documented, and every documented one is read", () => {
  // The config module is the source: `serverConfig` names what it reads, and
  // the playbook's table is what a person setting up a box has. A variable in
  // one and not the other is either an undocumented knob or a knob that does
  // nothing, and both have happened in this project under other names.
  const source = read("server/config.js");
  const named = [...source.matchAll(/env\.([A-Z_]+)/g)].map((m) => m[1]);
  const vars = [...new Set(named)].sort();
  assert.ok(vars.length >= 6, `only found ${vars.join(", ")} — this is scanning nothing`);
  const missing = vars.filter((name) => !playbook.includes(`\`${name}\``));
  assert.deepEqual(missing, [], `DEPLOYING.md documents no ${missing.join(", ")}`);
});

test("the unit, the nginx block and the deploy script agree on one port", { skip: noOps }, () => {
  // Four files and one number, and it has already been wrong: the templates
  // claimed **8133 from M12 until 2026-10-14**, and 8133 is Sunset Runner's
  // live port on the same box — the first `systemctl start` would have fought a
  // running neighbour for the socket. The number had been written down and
  // never checked against the hosting table that decides it.
  const ports = {
    unit: /Environment=PORT=(\d+)/.exec(unit)?.[1],
    nginxProxy: /proxy_pass http:\/\/127\.0\.0\.1:(\d+);/.exec(nginx)?.[1],
    scriptDefault: /GAME_PORT="\$\{GAME_HTTP_PORT:-(\d+)\}"/.exec(script)?.[1],
  };
  for (const [where, value] of Object.entries(ports)) {
    assert.ok(value, `no port found in ${where}`);
  }
  assert.equal(new Set(Object.values(ports)).size, 1,
    `${Object.keys(ports).length} files, ${new Set(Object.values(ports)).size} ports: ${JSON.stringify(ports)}`);
  // And it is not the development default, or a box would collide with a
  // developer's habit the first time somebody ran both.
  assert.notEqual(ports.unit, String(serverConfig({}).port),
    "the deployed port is the dev default, so a box and a laptop cannot be told apart");
  // The script reads the unit's port and refuses to run on a disagreement,
  // which is the only check that survives somebody editing one file.
  assert.match(script, /UNIT_PORT=\$\(sed .* "\$SERVICE_FILE"/,
    "the script does not read the port out of the unit it deploys");
  // Same rule for the node floor it demands of the box: `package.json`'s
  // `engines.node` is what the project claims to run on, and a number typed
  // into the script is a second answer to one question — too high fails a good
  // box, too low lets a bad one serve.
  assert.equal(/NODE_MIN=\d/.test(script), false, "the node floor is typed into the deploy script");
  assert.match(script, /NODE_MIN=\$\(node -e .*engines/, "the script does not read engines.node");
});

test("the script refuses a wrong cwd and a port the unit does not agree with", { skip: noOps }, () => {
  // The behavioural half, in a throwaway repo: the two prerequisites that can
  // be driven without a box. Running `ssh-deploy.sh` from inside the ops repo
  // lands cwd in game-ops/, where the rsync allowlist matches nothing and npm
  // on the box dies on a missing package.json (measured in Sunset Runner). The
  // port guard is the one above, exercised rather than read.
  const dir = join(tmpdir(), `citygrid-deploy-test-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  for (const sub of ["repo/server", "repo/engine", "repo/client", "opsdir"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  writeFileSync(join(dir, "repo/package.json"), "{}");
  symlinkSync("../opsdir", join(dir, "repo/ops"));
  copyFileSync(join(root, SCRIPT), join(dir, "opsdir/ssh-deploy.sh"));

  const run = (cwd, path = "./ops/ssh-deploy.sh") => {
    try {
      execFileSync("bash", [path, "--dry"], { cwd, encoding: "utf8", stdio: "pipe" });
      return { status: 0, out: "" };
    } catch (error) {
      return { status: error.status, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  };

  // No unit at all: the ops symlink is there and empty, which is the broken
  // symlink case and must not be read as "fine".
  let result = run(join(dir, "repo"));
  assert.equal(result.status, 1, "a missing systemd unit did not stop the deploy");
  assert.match(result.out, /is missing/);

  // A unit on another port: the mismatch the real templates had.
  writeFileSync(join(dir, "opsdir/citygrid.service"), "Environment=PORT=8133\n");
  result = run(join(dir, "repo"));
  assert.equal(result.status, 1, "a port the unit does not agree with did not stop the deploy");
  assert.match(result.out, /the unit says PORT=8133/);
  assert.match(result.out, /multi-game-hosting\.md/, "the refusal does not name what settles it");

  // And the cwd guard, from the ops directory itself.
  result = run(join(dir, "opsdir"), "./ssh-deploy.sh");
  assert.equal(result.status, 1, "running from the ops repo did not stop the deploy");
  assert.match(result.out, /is not the City Grid repo root/);

  rmSync(dir, { recursive: true, force: true });
});

test("a failed check reaches the exit code", { skip: noOps }, () => {
  // The script's promise, and the reason it is a promise: a deploy that prints
  // `!!` eight times and exits 0 is a deploy somebody walks away from. Every
  // non-fatal problem goes through `fail`, which collects, and the tail exits 1
  // if anything collected. The two guards above are this behaviour driven; this
  // is the half that needs a box to reach.
  assert.match(script, /^fail\(\) \{.*FAILURES\+=/m, "there is no collecting fail()");
  assert.match(script, /if \[ \$\{#FAILURES\[@\]\} -gt 0 \]; then[\s\S]*?exit 1/,
    "the failures are collected and never spent on the exit code");
  // The checks that must not be advisory: each of these is a thing you cannot
  // see from the outside and must not walk away from.
  for (const must of ["is not installed on the box", "nothing is listening on", "serves build"]) {
    assert.ok(script.includes(must), `no check mentions "${must}"`);
  }
});

test("V8's heap cap sits a quarter under the unit's memory cap, and the other caps exist", { skip: noOps }, () => {
  // V8 cannot see the cgroup. Without `--max-old-space-size` BELOW `MemoryMax`
  // the first sign of memory pressure is a SIGKILL from the OOM reaper — no GC
  // pressure, no stack trace, possibly mid-write of a room's checkpoint. This
  // is arithmetic, so it is a test rather than a comment.
  const memoryMax = Number(/MemoryMax=(\d+)M/.exec(unit)?.[1]);
  const heap = Number(/--max-old-space-size=(\d+)/.exec(unit)?.[1]);
  assert.ok(memoryMax > 0 && heap > 0, `MemoryMax=${memoryMax} heap=${heap}`);
  assert.ok(heap <= memoryMax * 0.8,
    `the heap cap ${heap}M is not under the ${memoryMax}M unit cap by enough`);
  assert.ok(heap >= memoryMax * 0.5, `${heap}M of ${memoryMax}M wastes most of the cap`);
  // The box's own rule: a leak in one game must not take the neighbours down.
  // The CPU cap is deliberately a WHOLE core rather than the template's half —
  // a room's pump is a single-threaded clock and throttling it adds jitter,
  // which is the number `/healthz` publishes — so what is asserted is that a
  // cap exists and is at least one core, not that it is any particular number.
  const cpu = Number(/CPUQuota=(\d+)%/.exec(unit)?.[1]);
  assert.ok(cpu >= 50, `CPUQuota=${cpu}% — a runaway process has no cap at all`);
  assert.match(unit, /TasksMax=\d+/, "no TasksMax: a fork bomb in a dependency takes the box");
});

test("the nginx template is HTTP-only and owns its upgrade map", { skip: noOps }, () => {
  // `listen 443 ssl` with no certificate fails the WHOLE config, and certbot
  // runs `nginx -t` before it does anything — so it cannot fix what blocks it.
  const live = code(nginx);
  assert.equal(/listen\s+443/.test(live), false,
    "ship the block HTTP-only and let certbot add the TLS half");
  // `http2` is a per-socket property and the box already logs
  // "protocol options redefined" from one site declaring it.
  assert.equal(/http2/.test(live), false, "do not add a third voice to someone else's warning");
  // Our own map under our own name: referencing the shared `$connection_upgrade`
  // fails when it is not loaded, and redeclaring it is a config error.
  const map = /map \$http_upgrade \$(\w+)/.exec(nginx);
  assert.ok(map, "no upgrade map at all — the socket will not upgrade");
  assert.notEqual(map[1], "connection_upgrade",
    "redeclaring the shared map name is a config error on a shared box");
  assert.ok(nginx.includes(`proxy_set_header Connection $${map[1]};`),
    "the map is defined and a different variable is used");
});

test("the deploy script's allowlist covers everything the page is told to cache", { skip: noOps }, () => {
  // Derived rather than transcribed: `client/precache.json` is what the service
  // worker fetches, so its top-level directories are exactly what a player's
  // browser will ask the box for. A file the page caches and the rsync skips is
  // a 404 for every installed client, and the gate that would catch it needs a
  // deployed server.
  const manifest = JSON.parse(read("client/precache.json"));
  const wanted = [...new Set(manifest.files.map((f) => f.replace(/^\.\//, "").split("/")[0]))];
  assert.ok(wanted.length >= 4, `only ${wanted.join(", ")} — this is scanning nothing`);
  const missing = wanted.filter((entry) => !new RegExp(`--include '/${entry}(/\\*\\*\\*)?'`).test(script));
  assert.deepEqual(missing, [], `the rsync allowlist is missing ${missing.join(", ")}`);
  // And the things the server itself needs that the page never fetches.
  for (const entry of ["server", "engine", "shared", "package.json"]) {
    assert.ok(new RegExp(`--include '/${entry}`).test(script), `the allowlist is missing ${entry}`);
  }
  // The dev surface must never leave this machine.
  for (const kept of ["test", "tools", "specs", "reports", "debugging", ".claude"]) {
    assert.equal(new RegExp(`--include '/${kept}`).test(script), false,
      `${kept}/ is in the allowlist and should not leave the dev machine`);
  }
  // And a developer's own cities must not land on the box: `rooms/` is state,
  // it is where `ROOMS_DIR` defaults when nothing sets it, and the allowlist
  // excludes it explicitly rather than relying on nobody naming it.
  assert.match(script, /--exclude '\/rooms\/\*\*\*'/, "a local rooms/ could be synced over the box's");
});

test("the deploy guard curls a path the server actually serves", { skip: noOps }, () => {
  // A deploy guard is only a guard if the thing it curls exists. `/healthz` is
  // the box-wide convention and `server/index.js` answers both it and `/health`.
  assert.ok(script.includes("/healthz"), "the script checks no health path");
  // Both server files, because the static handler moved to `server/static.js`
  // when the picture harness started sharing it (Q167) — and the claim here is
  // about the SERVER, not about which of its files holds the route.
  const server = read("server/index.js") + read("server/static.js");
  assert.ok(server.includes('path === "/healthz"'), "the server answers no /healthz");
  assert.ok(server.includes('path === "/health"'), "the server answers no /health");
  // A restart that is checked immediately reports success while a unit
  // crash-loops; the sleep is the whole point of the guard.
  assert.ok(/systemctl restart/.test(script) && /sleep 3/.test(script) && /is-active/.test(script),
    "restart, sleep, is-active: the deploy guard is not all three");
  // And the strongest check the script has: /healthz reports the build hash read
  // from `client/precache.json`, so the box can be asked whether it is serving
  // the build this deploy just made. Anything else is an old unit, a second
  // process, or a sync that did not land.
  assert.ok(script.includes("LOCAL_BUILD"), "nothing compares the served build with the synced one");
  assert.ok(read("server/index.js").includes("build: buildHash()"),
    "/healthz does not report the build the script compares");
});

test("the public health body is the one the playbook documents, and names nothing private", () => {
  // `/healthz` is curlable by anyone on the internet, and it is the one endpoint
  // whose body nothing in the suite had ever looked at: the deploy script's
  // tripwire reads it AFTER a deploy, which is the wrong end. The playbook
  // documents the body; the code builds it. A field added to a public endpoint
  // without anybody writing it down is how a room code gets published — and a
  // room code is a seat in somebody's city (`a-token-handed-out-and-never-checked`,
  // from the other side).
  const documented = Object.keys(JSON.parse(
    /```json\n([\s\S]*?)```/.exec(playbook.split("## `/healthz`")[1])[1]));
  // The object literal `health()` returns, read at brace depth 1.
  const body = read("server/index.js").split("function health() {")[1];
  const open = body.indexOf("return {");
  let depth = 0, end = -1;
  for (let i = open + "return ".length; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > 0, "could not find the object health() returns");
  const built = [...body.slice(open, end).matchAll(/^ {6}([a-zA-Z_]+):/gm)].map((m) => m[1]);
  assert.ok(built.length >= 6, `only read ${built.join(", ")} out of health() — the scan is wrong`);
  assert.deepEqual(built.sort(), documented.sort(),
    "the body /healthz returns and the body DEPLOYING.md documents are different objects");
  // And none of it may be a secret, whatever it is called.
  const private_ = built.filter((key) => /code|token|secret|password|name/i.test(key));
  assert.deepEqual(private_, [],
    `/healthz is public and would be naming ${private_.join(", ")}`);
});

test("the port check uses ss's own filter, not grep -w", { skip: noOps }, () => {
  // `grep -w ':8136'` NEVER matches `127.0.0.1:8136`, because a colon preceded
  // by a digit is not a word boundary — so the check reports every port free,
  // for ever. This bug shipped in two deploy scripts on this box before it was
  // caught, and it is the reason this test exists rather than a comment.
  assert.equal(/grep -w ['"]?:/.test(code(script)), false, "grep -w cannot match a host:port");
  assert.ok(/ss -ltnpH .*sport = :/.test(script), "the port check does not use ss's sport filter");
});

test("the host's identity is never in this repo", () => {
  // It moved to the private ops repo on 2026-10-14. What this repo must carry is
  // the IGNORE — a symlinked `ops/` that is not ignored is a private repo's
  // contents staged by the next `git add -A`.
  const ignored = read(".gitignore").split("\n").map((line) => line.trim());
  assert.ok(ignored.includes("ops"), "ops/ is not gitignored, so the private ops repo can be committed");
  const tracked = execFileSync("git", ["ls-files", "ops", "tools/deploy.env", "tools/ssh-deploy.sh"],
    { cwd: root, encoding: "utf8" }).trim();
  assert.equal(tracked, "", `these are tracked and should not be: ${tracked.split("\n").join(", ")}`);
  // The playbook may name the public hostname — it is public — but never a key.
  assert.equal(/BEGIN [A-Z ]*PRIVATE KEY/.test(playbook), false);
});
