// The server's configuration, and the two things a shared box gets wrong (M12).
//
// `server/index.js` took a port on `argv[2]` and nothing else: no host, no data
// directory, no proxy, no origin check. A box that already serves several games
// behind one nginx and one certbot has rules — `../Fireline/
// deploy-new-sibling-game-in-box-dos-and-donts.md` is the list, paid for in
// real breakage — and three of them are decisions this module makes:
//
//   - **bind loopback**, because a `0.0.0.0` bind exposes the raw port through
//     the firewall and bypasses TLS entirely;
//   - **read the proxy's forwarded address only when there IS a proxy**, because
//     an `X-Forwarded-For` header is a string a client sends, and trusting it
//     unconditionally hands every rate limit to anybody who can type;
//   - **check the Origin of a WebSocket upgrade**, because the browser's
//     same-origin policy does not apply to `new WebSocket(...)` and a page on
//     another site can otherwise open a socket as the player.
//
// Pure, and reads an env object rather than `process.env`, so every branch is a
// test rather than a deployment.

import test from "node:test";
import assert from "node:assert/strict";
import { serverConfig, originAllowed, clientAddress } from "../server/config.js";

test("the defaults are a development machine", () => {
  const config = serverConfig({});
  assert.equal(config.port, 8123);
  assert.equal(config.host, "0.0.0.0", "a dev server a phone on the LAN cannot reach is useless");
  assert.equal(config.roomsDir, "rooms");
  assert.equal(config.keepForDays, 30);
  assert.equal(config.trustProxy, false);
  assert.deepEqual(config.allowedOrigins, []);
});

test("a production server binds loopback, and says so by default rather than by hope", () => {
  // The rule that matters most on a shared box, and the one that cannot be left
  // to a deploy script: nginx is the only public path.
  const config = serverConfig({ NODE_ENV: "production" });
  assert.equal(config.host, "127.0.0.1");

  // An explicit HOST still wins — a single-purpose box with no nginx is a
  // legitimate thing to run, and a config that cannot be overridden gets
  // overridden in a fork instead.
  assert.equal(serverConfig({ NODE_ENV: "production", HOST: "0.0.0.0" }).host, "0.0.0.0");
  assert.equal(serverConfig({ HOST: "127.0.0.1" }).host, "127.0.0.1");
});

test("every value comes from the environment, and nonsense falls back", () => {
  const config = serverConfig({
    PORT: "9001", HOST: "10.0.0.5", ROOMS_DIR: "/srv/citygrid/rooms",
    KEEP_FOR_DAYS: "7", TRUST_PROXY: "1",
    ALLOWED_ORIGINS: "https://city.example, https://www.city.example",
  });
  assert.equal(config.port, 9001);
  assert.equal(config.host, "10.0.0.5");
  assert.equal(config.roomsDir, "/srv/citygrid/rooms");
  assert.equal(config.keepForDays, 7);
  assert.equal(config.trustProxy, true);
  assert.deepEqual(config.allowedOrigins, ["https://city.example", "https://www.city.example"]);

  // A systemd unit with a typo in it must not become a server on port NaN.
  for (const bad of ["", "eight", "0", "-1", "70000", undefined]) {
    assert.equal(serverConfig({ PORT: bad }).port, 8123, `PORT=${String(bad)} was accepted`);
  }
  for (const bad of ["", "soon", "-3", undefined]) {
    assert.equal(serverConfig({ KEEP_FOR_DAYS: bad }).keepForDays, 30);
  }
  // Only `1` and `true` turn the proxy on. "0", "false" and "no" must not.
  for (const off of ["0", "false", "no", "", undefined]) {
    assert.equal(serverConfig({ TRUST_PROXY: off }).trustProxy, false, `TRUST_PROXY=${String(off)}`);
  }
  assert.equal(serverConfig({ TRUST_PROXY: "true" }).trustProxy, true);
});

// --- the Origin check --------------------------------------------------------

test("a socket with no Origin is allowed, because a non-browser has none", () => {
  // `room_soak`, `tools/room_smoke.mjs`'s `ws` clients and any script are
  // originless. Refusing them would be refusing every gate this project has.
  const config = serverConfig({});
  assert.equal(originAllowed(undefined, config, "city.example"), true);
  assert.equal(originAllowed("", config, "city.example"), true);
});

test("a page on another site cannot open a socket as the player", () => {
  // The browser's same-origin policy does not apply to `new WebSocket(...)`:
  // without this, a page the player merely VISITS can join their room, and the
  // cookie-free design does not save them because the room needs no cookie.
  const config = serverConfig({});
  assert.equal(originAllowed("https://city.example", config, "city.example"), true);
  assert.equal(originAllowed("http://city.example:8123", config, "city.example:8123"), true);
  assert.equal(originAllowed("https://evil.example", config, "city.example"), false);
  // The classic near-miss: a prefix match would let `city.example.evil.com` in.
  assert.equal(originAllowed("https://city.example.evil.com", config, "city.example"), false);
});

test("ALLOWED_ORIGINS is the list a proxy needs, and it is exact", () => {
  // Behind nginx the Host the server sees may be `127.0.0.1:8123` while the
  // browser's Origin is the public name, so same-host cannot be the only rule.
  const config = serverConfig({ ALLOWED_ORIGINS: "https://city.example" });
  assert.equal(originAllowed("https://city.example", config, "127.0.0.1:8123"), true);
  assert.equal(originAllowed("http://city.example", config, "127.0.0.1:8123"), false,
    "the scheme is part of an origin");
  assert.equal(originAllowed("https://other.example", config, "127.0.0.1:8123"), false);
  // And the same-host rule still applies, so a direct hit keeps working.
  assert.equal(originAllowed("http://127.0.0.1:8123", config, "127.0.0.1:8123"), true);
});

// --- the client's address ----------------------------------------------------

test("the forwarded address is read only when a proxy is trusted", () => {
  const direct = { socket: { remoteAddress: "203.0.113.7" }, headers: { "x-forwarded-for": "1.2.3.4" } };
  assert.equal(clientAddress(direct, serverConfig({})), "203.0.113.7",
    "an untrusted X-Forwarded-For was believed, so every rate limit is a text field");
  assert.equal(clientAddress(direct, serverConfig({ TRUST_PROXY: "1" })), "1.2.3.4");
});

test("a forwarded chain gives the client, not the last proxy, and nonsense falls back", () => {
  const trusted = serverConfig({ TRUST_PROXY: "1" });
  const chain = (value) => clientAddress(
    { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": value } }, trusted);
  assert.equal(chain("1.2.3.4, 10.0.0.1, 10.0.0.2"), "1.2.3.4");
  assert.equal(chain("  1.2.3.4  "), "1.2.3.4");
  // An empty or absurd header is not an address, and the socket still knows one.
  assert.equal(chain(""), "127.0.0.1");
  assert.equal(chain(", , "), "127.0.0.1");
  assert.equal(chain("x".repeat(200)), "127.0.0.1", "an unbounded header became a Map key");
  assert.equal(clientAddress({ socket: {}, headers: {} }, trusted), "?",
    "a socket with no address must still give a usable key");
});
