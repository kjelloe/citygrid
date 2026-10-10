// The handler sixteen tools and the deployed server share (Q167).
//
// It was `server/index.js`'s private function until Q167 and had never been
// asked anything directly: `serve_smoke` drives it through a browser, which is
// the right gate for "does the page boot" and cannot ask for `/../../etc/passwd`.
// The `403` branch — the one that matters if this is ever on a box — had no
// assertion anywhere in the project.
//
// The fake response is deliberately lossy in the one way that counts: it
// records the status and the headers it was given and nothing else, so a check
// here cannot accidentally be about Node's own plumbing.

import test from "node:test";
import assert from "node:assert/strict";
import { makeStatic, TYPES, contentPolicy } from "../server/static.js";
import { repoRoot } from "./helpers/sources.js";

function ask(handler, url) {
  return new Promise((resolve) => {
    let status = 0;
    let headers = {};
    const res = {
      writeHead(code, given) {
        status = code;
        headers = given ?? {};
        return res;
      },
      end(body) {
        resolve({ status, headers, body: body === undefined ? "" : String(body) });
      },
    };
    handler({ url }, res);
  });
}

const serve = makeStatic({ root: repoRoot });

test("a directory is served its index, as a document with a policy", async () => {
  const answer = await ask(serve, "/");
  assert.equal(answer.status, 200);
  assert.equal(answer.headers["content-type"], TYPES[".html"]);
  assert.match(answer.headers["content-security-policy"], /script-src[^;]*sha256-/);
  assert.match(answer.body, /<!DOCTYPE html>/i);
});

test("a module is not sent a policy, and carries the type that lets it run", async () => {
  const answer = await ask(serve, "/client/main.js");
  assert.equal(answer.status, 200);
  assert.equal(answer.headers["content-type"], TYPES[".js"]);
  assert.equal(answer.headers["content-security-policy"], undefined);
  // The one header a service worker's correctness depends on (`offline_smoke`).
  assert.equal(answer.headers["cache-control"], "no-cache");
});

test("nothing outside the root is ever served", async () => {
  // The property, not the branch. `new URL()` flattens `..` in the pathname and
  // `normalize()` flattens what percent-decoding puts back, so these arrive at
  // `/etc/passwd` UNDER the root and come back 404 — the `403` is the backstop
  // behind both, and a test that demanded 403 would be asserting which of the
  // three refused rather than that the file is not served.
  for (const url of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd",
    "/client/../../etc/passwd", "/..%2f..%2fetc%2fpasswd"]) {
    const answer = await ask(serve, url);
    assert.ok(answer.status === 403 || answer.status === 404, `${url} answered ${answer.status}`);
    assert.doesNotMatch(answer.body, /root:/, `${url} served the file`);
  }
});

test("a file that is not there is a 404, and a query is not part of the path", async () => {
  assert.equal((await ask(serve, "/nothing-here.js")).status, 404);
  assert.equal((await ask(serve, "/index.html?seed=3&size=48")).status, 200);
});

test("health answers only for a caller that has rooms to report", async () => {
  const bare = await ask(serve, "/healthz");
  assert.equal(bare.status, 404, "a picture harness must not claim to be a running server");

  const withRooms = makeStatic({ root: repoRoot, health: () => ({ ok: true, rooms: 2 }) });
  for (const path of ["/health", "/healthz"]) {
    const answer = await ask(withRooms, path);
    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.body).rooms, 2);
    assert.match(answer.headers["cache-control"], /no-store/);
  }
});

test("a page's policy is its own inline scripts, hashed", async () => {
  const index = await contentPolicy(`${repoRoot}/index.html`);
  const shoot = await contentPolicy(`${repoRoot}/tools/shoot.html`);
  assert.notEqual(index, shoot,
    "one policy for two pages is what refused shoot.html's scripts in M12");
  for (const policy of [index, shoot]) {
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /connect-src 'self'/);
    assert.doesNotMatch(policy, /'unsafe-inline'[^;]*script/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  }
});
