// Where the room gates point (K6d).
//
// `room_soak` and `room_smoke` start a server of their own, which is right for
// every run but one: v1.0's V4 says **the gates against the deployed box
// once**, and that sentence had no command behind it. `--url <origin>` is the
// command — the browsers open the origin, the scripted clients dial its `/ws`,
// and nothing is spawned.
//
// It is a module rather than a line at each call site for two reasons. The
// `wss`-under-`https` rule is one of them: a gate that dialled `ws://` at a TLS
// origin is refused by the browser and by nginx, and neither error says why.
// The other is that three files have to agree about the flag — both gates and
// the runner that passes it through — and `test/tools.test.js` asserts that as
// a set.

/**
 * @param argv `process.argv`, or the runner's own list.
 * @returns `{ spawn: true }` — the default, a server of the gate's own — or
 *   `{ spawn: false, origin, ws }` for a server somebody else is running.
 * @throws when `--url` is given something that is not an http(s) origin. A gate
 *   pointed at nonsense must say so rather than quietly fall back to spawning
 *   and report a green run of the wrong thing.
 */
export function roomTarget(argv = []) {
  const at = argv.indexOf("--url");
  if (at < 0) return { spawn: true };
  const given = argv[at + 1];
  if (!given || given.startsWith("--")) {
    throw new Error("--url needs an origin, e.g. --url https://citygrid.kjell.today");
  }
  let parsed;
  try {
    parsed = new URL(given);
  } catch {
    throw new Error(`--url ${given} is not a URL (http://host:port or https://host)`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`--url ${given} is not http or https`);
  }
  const origin = parsed.origin;
  return { spawn: false, origin, ws: `${origin.replace(/^http/, "ws")}/ws` };
}

// **There is no `hostRoom` here**, and there was for an afternoon. A gate that
// hosts a room over a bare socket takes a seat and a connection that no player
// would: `room_soak`'s first client CREATEs the room and plays in it, and
// `room_smoke` presses **Host** on the page like a person. Both are the shape a
// real evening has, and both were found by the box refusing the extra socket.

/**
 * The pump's numbers off a box's `/healthz` (M12), for a run that does not own
 * the process keeping them. Shaped like `pump.jitter()` so the caller's
 * printout does not need two spellings; `undefined` when the box answers
 * something else, which a gate prints as `undefined ms` rather than pretending.
 */
export async function remoteJitter(origin) {
  try {
    const response = await fetch(`${origin}/healthz`);
    const body = await response.json();
    return body?.jitter ?? body?.pump?.jitter;
  } catch {
    return undefined;
  }
}
