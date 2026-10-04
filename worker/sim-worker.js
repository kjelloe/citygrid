// The simulation's thread (W2; `workitems-worker.md`).
//
// Four lines on purpose: everything that decides is `sim-host.js`, which node
// can load and a Web Worker cannot be loaded by. A module worker gets no import
// map, which is why `worker/` imports `engine/` and `shared/` by relative path
// and nothing else — there is no bare specifier to resolve.

import { createSimHost } from "./sim-host.js";

const host = createSimHost();

self.onmessage = (event) => {
  const { reply, transfer } = host.handle(event.data);
  self.postMessage(reply, transfer);
};
