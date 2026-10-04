// The simulation on a worker thread, as a transport (W4).
//
// A transport is `post(message, transfer) → Promise<reply>` and nothing else.
// That is the whole seam below the seam: `client/session.js` keeps the mirror
// and does not care whether the reply came from a thread, from a stub, or one
// day from a socket — which is the claim ruling 003 made when it said the
// session seam goes in from day one, and the claim W4 exists to check.
//
// It is also what makes the mirror side testable at all: a `Worker` cannot be
// constructed in node, a transport can.

export function createWorkerTransport(url) {
  const worker = new Worker(url, { type: "module" });
  const pending = new Map();
  let nextId = 1;

  worker.onmessage = (event) => {
    const reply = event.data;
    const settle = pending.get(reply.id);
    pending.delete(reply.id);
    if (reply.type === "error") settle?.reject(new Error(reply.reason));
    else settle?.resolve(reply);
  };
  worker.onerror = (event) => {
    // A worker that dies takes every outstanding command with it, and a promise
    // that never settles is a game that quietly stops responding.
    const error = new Error(event.message ?? "the simulation worker failed");
    for (const settle of pending.values()) settle.reject(error);
    pending.clear();
  };

  return {
    post(message, transfer = []) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...message, id }, transfer);
      });
    },
    get pending() { return pending.size; },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
