// What is behind a window (slice S7).
//
// The item asks for "a curtain or blind colour and depth as an inset quad, a
// lit ratio at night that follows occupancy". All three are decisions, so all
// three are here rather than in the baker — a window that changes when you look
// away is worse than a flat one, and two players' cities must agree (ruling 032).

import test from "node:test";
import assert from "node:assert/strict";
import {
  windowTreatment, windowLit, CURTAIN_TONES, BLIND,
} from "../client/world/windows.js";

const hole = (over = {}) => ({ u0: 0, u1: 1.2, y0: 3, y1: 4.5, floor: 1, bay: 0, ...over });

test("a window is dressed the same way every time it is asked about", () => {
  for (const floor of [0, 1, 4]) {
    for (const bay of [0, 2, 5]) {
      const a = windowTreatment(41, hole({ floor, bay }));
      const b = windowTreatment(41, hole({ floor, bay }));
      assert.deepEqual(a, b, `floor ${floor} bay ${bay} differs between two asks`);
    }
  }
});

test("a street is not one curtain: the openings of one building differ", () => {
  const kinds = new Set();
  const tones = new Set();
  for (let floor = 0; floor < 6; floor += 1) {
    for (let bay = 0; bay < 6; bay += 1) {
      const t = windowTreatment(41, hole({ floor, bay }));
      kinds.add(t.kind);
      tones.add(t.tone);
    }
  }
  assert.ok(kinds.size >= 2, `36 windows of one building have ${kinds.size} kind(s)`);
  assert.ok(tones.size >= 2, `36 windows of one building have ${tones.size} tone(s)`);
});

test("and two buildings are not the same building", () => {
  const a = [];
  const b = [];
  for (let bay = 0; bay < 8; bay += 1) {
    a.push(windowTreatment(41, hole({ bay })).kind);
    b.push(windowTreatment(42, hole({ bay })).kind);
  }
  assert.notDeepEqual(a, b, "two buildings dress their windows identically");
});

test("every treatment is one the baker knows how to draw", () => {
  const known = new Set(["curtain", "blind", "open", "shop"]);
  for (let id = 1; id < 40; id += 1) {
    for (let floor = 0; floor < 4; floor += 1) {
      const t = windowTreatment(id, hole({ floor }));
      assert.ok(known.has(t.kind), `${t.kind} is not a treatment`);
      assert.ok(t.tone >= 0 && t.tone < CURTAIN_TONES, `tone ${t.tone}`);
      if (t.kind === "blind") {
        assert.ok(t.drop >= BLIND.least && t.drop <= BLIND.most, `a blind is ${t.drop} down`);
      } else {
        assert.equal(t.drop, 0, `a ${t.kind} has a blind's drop`);
      }
    }
  }
});

test("a storefront is a shop, and a door is not a window", () => {
  assert.equal(windowTreatment(41, hole({ shop: true })).kind, "shop");
  assert.equal(windowTreatment(41, hole({ door: true })).kind, "open");
});

test("the lit share follows occupancy, and is monotone in it", () => {
  // B2 made `spec.state.lit` the building's occupancy; S7 moves the choice of
  // WHICH windows out of the baker so it can be asserted.
  const counts = [0.0, 0.25, 0.5, 0.75, 1].map((share) => {
    let lit = 0;
    for (let id = 1; id < 30; id += 1) {
      for (let floor = 0; floor < 5; floor += 1) {
        for (let bay = 0; bay < 5; bay += 1) if (windowLit(id, hole({ floor, bay }), share)) lit += 1;
      }
    }
    return lit;
  });
  for (let i = 1; i < counts.length; i += 1) {
    assert.ok(counts[i] >= counts[i - 1], `lit windows fell from ${counts[i - 1]} to ${counts[i]}`);
  }
  assert.equal(counts[0], 0, "an empty building has lit windows");
  assert.ok(counts[counts.length - 1] > counts[0], "a full building lights none");
});

test("a shop window is lit whoever lives upstairs, and a door never is", () => {
  assert.equal(windowLit(41, hole({ shop: true }), 0), true);
  assert.equal(windowLit(41, hole({ door: true }), 1), false);
});
