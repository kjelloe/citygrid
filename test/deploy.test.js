// The deploy surface (M12): the unit, the nginx block, the script and the
// playbook, held against the server they deploy.
//
// None of this runs on a developer's machine, which is exactly why it needs a
// test: a template nobody parses is a file that goes stale the first time a
// variable is added, and the way you find out is a box that will not start.
// Three of the checks below are the sibling box's rules in executable form
// (`../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md`), because each
// of those takes down EVERY site on the host rather than only this one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverConfig } from "../server/config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(root, name), "utf8");

const unit = read("ops/citygrid.service");
const nginx = read("ops/nginx.conf");
const script = read("tools/ssh-deploy.sh");
const example = read("tools/deploy.env.example");
const playbook = read("DEPLOYING.md");

/** A file with its `#` comment lines removed.
 *
 * Every "this must not appear" check below needs it, and the first run of this
 * file proved why: these templates are commented with the exact strings they
 * forbid — `listen 443`, `http2`, `grep -w ':8133'` — because the comment is
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

test("the unit, the nginx block and the deploy script agree on one port", () => {
  // Three files and one number. The classic way this breaks is a port claimed
  // in the hosting document, written into the unit, and left at the old value
  // in the proxy — which answers 502 while the service is perfectly healthy.
  const ports = {
    unit: /Environment=PORT=(\d+)/.exec(unit)?.[1],
    nginxProxy: /proxy_pass http:\/\/127\.0\.0\.1:(\d+);/.exec(nginx)?.[1],
    exampleEnv: /PORT="(\d+)"/.exec(example)?.[1],
  };
  for (const [where, value] of Object.entries(ports)) {
    assert.ok(value, `no port found in ${where}`);
  }
  assert.equal(new Set(Object.values(ports)).size, 1,
    `three files, ${new Set(Object.values(ports)).size} ports: ${JSON.stringify(ports)}`);
  // And it is not the development default, or a box would collide with a
  // developer's habit the first time somebody ran both.
  assert.notEqual(ports.unit, String(serverConfig({}).port),
    "the deployed port is the dev default, so a box and a laptop cannot be told apart");
});

test("V8's heap cap sits a quarter under the unit's memory cap", () => {
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
});

test("the nginx template is HTTP-only and owns its upgrade map", () => {
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

test("the deploy script's allowlist covers everything the page is told to cache", () => {
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
});

test("the deploy guard curls a path the server actually serves", () => {
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
});

test("the port check uses ss's own filter, not grep -w", () => {
  // `grep -w ':8133'` NEVER matches `127.0.0.1:8133`, because a colon preceded
  // by a digit is not a word boundary — so the check reports every port free,
  // for ever. This bug shipped in two deploy scripts on this box before it was
  // caught, and it is the reason this test exists rather than a comment.
  assert.equal(/grep -w ['"]?:/.test(code(script)), false, "grep -w cannot match a host:port");
  assert.ok(/ss -ltnpH .*sport = :/.test(script), "the port check does not use ss's sport filter");
});

test("the host's identity is never in the repo", () => {
  const ignored = read(".gitignore");
  assert.ok(ignored.split("\n").some((line) => line.trim() === "tools/deploy.env"),
    "tools/deploy.env is not gitignored, so a key and a hostname can be committed");
  assert.ok(script.includes("tools/deploy.env"), "the script reads no env file");
  // And the example must not carry a real key path by accident.
  assert.equal(/BEGIN [A-Z ]*PRIVATE KEY/.test(example), false);
});
