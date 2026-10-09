// The alert area.
//
// The design gives the alert area six kinds of problem to report
// (`gamedesign.md` §13.1): power failures, water shortages, fires, crime,
// hospital overload, quest updates. What it does not say, and what decides
// whether the area is useful, is what happens when the simulation produces
// fifty-nine of them in one month — which it does routinely. One soak run
// produced 59 `powerShortfall` events and 100 `budget` events.
//
// So: collapse repeats into one line with a count, rank by severity, and cap
// what is on screen. An alert list that floods has hidden the one alert that
// mattered, which is worse than having no list at all.

export const SEVERITY = { URGENT: 0, WARNING: 1, INFO: 2 };

/** Which engine events reach the player, and how loudly.
 *
 * Deliberately a whitelist. Routine growth is not an alert — `developed`,
 * `zoned` and `placed` are the player's own actions working, and reporting
 * them would drown the problems the area exists for. An event that is not
 * listed produces no alert rather than an "unknown" one. */
const KINDS = {
  // Disasters. A warning is URGENT even though nothing has happened yet — the
  // month of lead time is the only thing the player can act on, and an alert
  // they scroll past is a telegraph that did not arrive.
  //
  // `namedKey` is used when the event carries WHICH disaster. "Disaster
  // warning" tells the player nothing they can prepare for; "Flood warning"
  // does.
  disasterWarning: { severity: SEVERITY.URGENT, textKey: "alert.disasterWarning", namedKey: "alert.disasterWarning.named" },
  disasterStruck: { severity: SEVERITY.URGENT, textKey: "alert.disasterStruck", namedKey: "alert.disasterStruck.named" },
  wrecked: { severity: SEVERITY.WARNING, textKey: "alert.wrecked" },
  // **Somebody pointing at something** (X3b). Not a warning — nothing is wrong
  // — and `collapse: false`, because the second ping is somewhere else and the
  // place is the whole of what it says.
  ping: { severity: SEVERITY.INFO, textKey: "alert.ping", collapse: false },
  disasterRelief: { severity: SEVERITY.INFO, textKey: "alert.disasterRelief" },
  // **Your money went to a neighbour** (X4g). Only in a room with `disasterAid`
  // on, and a WARNING rather than info: the seat did nothing and is poorer, and
  // a treasury that falls with nothing on screen to say why is the thing this
  // row exists to stop.
  disasterLevy: { severity: SEVERITY.WARNING, textKey: "alert.disasterLevy" },
  disasterOver: { severity: SEVERITY.INFO, textKey: "alert.disasterOver", namedKey: "alert.disasterOver.named" },

  fireStarted: { severity: SEVERITY.URGENT, textKey: "alert.fireStarted" },
  fireSpread: { severity: SEVERITY.URGENT, textKey: "alert.fireSpread" },
  burntDown: { severity: SEVERITY.URGENT, textKey: "alert.burntDown" },
  bankrupt: { severity: SEVERITY.URGENT, textKey: "alert.bankrupt" },

  powerShortfall: { severity: SEVERITY.WARNING, textKey: "alert.powerShortfall" },
  waterShortfall: { severity: SEVERITY.WARNING, textKey: "alert.waterShortfall" },
  highCrime: { severity: SEVERITY.WARNING, textKey: "alert.highCrime" },
  highPollution: { severity: SEVERITY.WARNING, textKey: "alert.highPollution" },
  fundsLow: { severity: SEVERITY.WARNING, textKey: "alert.fundsLow" },
  unpaidUpkeep: { severity: SEVERITY.WARNING, textKey: "alert.unpaidUpkeep" },
  abandoned: { severity: SEVERITY.WARNING, textKey: "alert.abandoned" },
  downgraded: { severity: SEVERITY.WARNING, textKey: "alert.downgraded" },
  noRouteToWork: { severity: SEVERITY.WARNING, textKey: "alert.noRouteToWork" },
  congestion: { severity: SEVERITY.WARNING, textKey: "alert.congestion" },

  fireOut: { severity: SEVERITY.INFO, textKey: "alert.fireOut" },
};

/** Every event kind this model has words for. `test/omissions.test.js` reads
 * it against the kinds the engine can emit, so an event the player could never
 * see is either an alert or declared silent on purpose. */
export function alertKinds() {
  return Object.keys(KINDS);
}

/** Every key this model can ask the view to render. `test/hud.test.js` checks
 * each one against both catalogues, so a new alert kind with no translation is
 * a red suite rather than a raw `alert.congestion` on someone's screen. */
export function alertKeys() {
  const keys = [];
  for (const spec of Object.values(KINDS)) {
    keys.push(spec.textKey);
    if (spec.namedKey) keys.push(spec.namedKey);
  }
  return keys;
}

/** How many alerts the area shows at once. Six is about what fits above the
 * toolbar on a phone without becoming the interface. */
const VISIBLE = 6;

/** How long an alert stays before it stops being news, in ticks. */
const LIFETIME = 288;

export function createAlerts() {
  return { items: [] };
}

export function pushAlerts(alerts, events, tick) {
  for (const event of events ?? []) {
    const spec = KINDS[event.kind];
    if (!spec) continue;
    // **A ping does not collapse.** Every other kind does — "fifty-nine copies
    // are not information" — and for a ping that rule is exactly wrong: the
    // second one is somewhere ELSE, and merging them would leave the player a
    // camera jump to a tile nobody pointed at. The place is the information.
    const existing = spec.collapse === false
      ? undefined
      : alerts.items.find((a) => a.kind === event.kind);
    if (existing) {
      // Collapse. The count is the information; fifty-nine copies are not.
      existing.count += 1;
      existing.tick = tick;
      continue;
    }
    const named = spec.namedKey !== undefined
      && typeof event.disaster === "string" && event.disaster !== "none";
    alerts.items.push({
      kind: event.kind,
      textKey: named ? spec.namedKey : spec.textKey,
      // The view interpolates this, because naming the disaster means
      // translating it and the model does not read the catalogue.
      disasterKey: named ? `disaster.${event.disaster}` : undefined,
      // Where it happened and who said it, for the kinds that have somewhere to
      // go. `at` is what makes a row clickable — the camera jumps there — and
      // `messageKey` is carried rather than resolved, because this model does
      // not read the catalogue (the `disasterKey` rule, one row up).
      at: typeof event.x === "number" && typeof event.z === "number"
        ? { x: event.x, y: event.z }
        : undefined,
      by: event.actor,
      messageKey: typeof event.message === "string" ? `ping.${event.message}` : undefined,
      severity: spec.severity,
      count: 1,
      tick,
    });
  }
  return alerts;
}

/** Expire anything stale. Called with the current tick so the model itself
 * never reads a clock. */
export function expireAlerts(alerts, tick) {
  alerts.items = alerts.items.filter((a) => tick - a.tick < LIFETIME);
  return alerts;
}

/** Worst first, then newest. Capped.
 *
 * Sorting by severity BEFORE capping is the whole point: a fire must not be
 * pushed off the list by a stream of lesser news that happened to arrive
 * after it. */
export function visibleAlerts(alerts) {
  return [...alerts.items]
    .sort((a, b) => a.severity - b.severity || b.tick - a.tick)
    .slice(0, VISIBLE);
}
