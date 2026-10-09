// What a deployed server reads from its environment (M12).
//
// `server/index.js` took a port on `argv[2]` and nothing else. A box that
// already serves several games behind one nginx and one certbot has rules —
// `../Fireline/deploy-new-sibling-game-in-box-dos-and-donts.md` is the list,
// and every line of it was paid for in real breakage — and three of them are
// decisions this module makes rather than a deploy script's:
//
//   - **bind loopback in production**, because a `0.0.0.0` bind exposes the raw
//     port through the firewall and bypasses TLS entirely. A deploy script that
//     remembers to pass `HOST` is a deploy script somebody will copy without
//     it, so the default carries the rule.
//   - **believe `X-Forwarded-For` only when there is a proxy**, because it is a
//     string the client sends. Trusting it unconditionally hands the per-address
//     connection cap to anybody who can type a header.
//   - **check the `Origin` of a WebSocket upgrade**, because the browser's
//     same-origin policy does not apply to `new WebSocket(...)`: without it a
//     page the player merely visits can open a socket into their room, and
//     there is no cookie to be missing because the room needs none.
//
// Pure, and it reads an env OBJECT rather than `process.env`, so every branch
// is a test rather than a deployment (`test/server-config.test.js`).

/** The port `run.sh` and the smokes have always used. */
const DEFAULT_PORT = 8123;
const DEFAULT_KEEP_DAYS = 30;

function intOr(value, fallback, { min = 1, max = 65535 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function flag(value) {
  return value === "1" || value === "true";
}

/**
 * The server's configuration from an environment.
 *
 * @param env `process.env` or a test's object.
 */
export function serverConfig(env = {}) {
  const production = env.NODE_ENV === "production";
  return {
    port: intOr(env.PORT, DEFAULT_PORT),
    // Loopback under production unless something says otherwise. In
    // development the default is every interface on purpose: the phone on the
    // same WiFi is how this project tests a phone at all, and a dev server it
    // cannot reach is a dev server nobody uses.
    host: env.HOST ? env.HOST : (production ? "127.0.0.1" : "0.0.0.0"),
    // Rooms live OUTSIDE the repo on a box: an allowlist rsync would otherwise
    // either skip them (and lose every city on a deploy) or carry them.
    roomsDir: env.ROOMS_DIR ? env.ROOMS_DIR : "rooms",
    keepForDays: intOr(env.KEEP_FOR_DAYS, DEFAULT_KEEP_DAYS, { min: 1, max: 3650 }),
    trustProxy: flag(env.TRUST_PROXY),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * Whether a WebSocket upgrade's `Origin` may open a socket here.
 *
 * Three rules, in order:
 *
 * - **No origin is allowed.** `room_soak`, `room_smoke`'s `ws` clients and any
 *   script are originless; refusing them would refuse every gate in the
 *   project, and a non-browser client cannot be tricked by a web page anyway.
 * - **An exact entry in `ALLOWED_ORIGINS`.** Behind nginx the `Host` the server
 *   sees is `127.0.0.1:8123` while the browser's `Origin` is the public name,
 *   so same-host cannot be the only rule.
 * - **The same host as the request.** Exact, never a prefix: a prefix match
 *   would admit `city.example.evil.com`.
 */
export function originAllowed(origin, config, host) {
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  if (!host) return false;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === host;
}

/** How long a forwarded address may be before it is nonsense rather than an
 * address. An unbounded header would become an unbounded `Map` key in the
 * per-address cap, which is the cap paying for its own bypass. */
const ADDRESS_MAX = 64;

/**
 * The address to count a connection against.
 *
 * `X-Forwarded-For` is a comma-separated chain whose FIRST entry is the client
 * and whose later ones are proxies, so the first is what a per-client cap wants.
 * Only read when `TRUST_PROXY` says a proxy put it there; otherwise the socket's
 * own address, which nobody can forge.
 */
export function clientAddress(request, config) {
  const direct = request.socket?.remoteAddress ?? "?";
  if (!config.trustProxy) return direct;
  const header = request.headers?.["x-forwarded-for"];
  if (typeof header !== "string") return direct;
  const first = header.split(",")[0].trim();
  if (first.length === 0 || first.length > ADDRESS_MAX) return direct;
  return first;
}
