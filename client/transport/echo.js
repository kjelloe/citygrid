// The stub transport (W4) — a server that is not there yet.
//
// It runs `worker/sim-host.js` where it stands and answers with a sequence
// number, which is what a room's frame carries (plan.md §3.2: commands cross
// the wire, the server assigns `seq`, every client applies them in `(tick, seq)`
// order). Nothing here is a server: there is no socket, no queue, no other
// player. What it proves is the shape — that `client/session.js` holds a mirror
// over *a transport* rather than over *a worker*, so when Wave 5 replaces this
// with a socket nothing above the seam changes.
//
// It answers on a microtask rather than synchronously on purpose. A transport
// that resolved inline would let a caller depend on an ordering no real one can
// give it, and the swap would break in the UI rather than in a test.

import { createSimHost } from "../../worker/sim-host.js";

export function createEchoTransport({ latency = 0 } = {}) {
  const host = createSimHost();
  const sent = [];
  let seq = 0;
  let nextId = 1;

  return {
    /** Every accepted command, in the order the "server" sequenced them. */
    get frames() { return sent; },
    get pending() { return 0; },
    async post(message) {
      const id = nextId;
      nextId += 1;
      seq += 1;
      if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
      const { reply } = host.handle({ ...message, id });
      if (reply.type === "error") throw new Error(reply.reason);
      sent.push({ seq, type: message.type, result: reply.result, tick: reply.tick });
      return { ...reply, seq };
    },
    dispose() { sent.length = 0; },
  };
}
