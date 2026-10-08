// What a ping can say, with its words (X3b).
//
// `engine/requests.js` owns the closed list — a ping's message is validated
// against it, for the same reason the quest condition language is closed — and
// this is the other half: each message's catalogue key, **spelled out**.
//
// Written as literals rather than built as `` `ping.${message}` ``, because a
// key assembled at runtime is invisible to `test/reachability.test.js`'s scan,
// which duly reported all seven as strings nothing can show while they were on
// screen. The same lesson `ACTION_LABELS` learned a day earlier; an i18n key
// nothing can find is one nobody can tell is dead.

import { PING_MESSAGES } from "../../engine/requests.js";

export { PING_MESSAGES };

export const PING_LABELS = Object.freeze({
  look: "ping.look",
  help: "ping.help",
  building: "ping.building",
  remove: "ping.remove",
  working: "ping.working",
  fire: "ping.fire",
  thanks: "ping.thanks",
});
