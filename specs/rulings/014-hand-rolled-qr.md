# Ruling 014 — QR codes are hand-rolled

- **Date:** 2026-08-26
- **Source:** P9, answering Q15
- **Status:** ruled

## Question

A private room is shared by join code, with a QR representation for pointing a phone at
(ruling from Q5). Does the QR encoder come from a dependency, or do we write it?

## Ruling

**Hand-rolled, no dependency.** It lives in `client/`, never in `engine/`.

## Why

The zero-runtime-dependency rule is one of the few things holding the whole stack's auditability
together: `three.js` is vendored and pinned, `ws` is the only server dependency, and that is the
entire tree. A QR encoder is a few hundred lines of well-specified, entirely testable arithmetic
with no upstream risk and no reason to age.

`client/` rather than `engine/` because a QR code is a way of showing a join code to a phone. It is
not a rule of the game, it never reaches the reducer, and it must never reach the state hash.

## Consequences

- Scope: byte mode, error-correction level M, versions 1–4 is enough for a join code and a URL.
  Anything larger is a sign the join code got too clever.
- Tested against known vectors, the same discipline as the PRNG and the state hash: a pinned
  encoding, computed and not authored.
- The QR encodes the full join URL rather than the bare code, so a phone that scans it lands in the
  room instead of landing somewhere that asks it to type the code in again.

## Enforced by

- `client/qr.js` (from slice 5.2), `test/qr.test.js`
- `test/purity.test.js` — it must not appear in `engine/`
- `package.json` — the dependency tree stays as it is
