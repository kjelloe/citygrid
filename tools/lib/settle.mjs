// Waiting for the city to have actually changed (W2).
//
// The seam is asynchronous: a build click is posted to the simulation, which
// may be another thread, and the mirror the page reads is patched when the
// answer comes back. A gate that clicks and then reads `CITY.state` in the next
// CDP command is reading the city as it was.
//
// This is not a sleep. It waits for `CITY.pending` to reach zero — the count of
// commands posted and unanswered — so it returns as soon as the city is in
// hand, and it throws when the simulation never answers, which is a defect and
// not a slow machine.
export async function settle(page, timeout = 5000) {
  await page.waitForFunction(() => (globalThis.CITY?.pending ?? 0) === 0, undefined, { timeout });
}
