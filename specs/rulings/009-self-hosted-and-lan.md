# Ruling 009 — Self-hosted and LAN only; master index deferred

- **Date:** 2026-08-25
- **Source:** P8, answering Q8
- **Status:** ruled

## Question

Does v1 need a hosted public server and a master index for discovery?

## Ruling

**Self-hosted and LAN only for now.** Slice 6.4 keeps systemd with measured limits, TLS, allowlist
deploy, backups and room restore. It **drops** the master index.

The master index is a documented later addition, and its hook points are named now so that adding
it is additive rather than a rework.

## Why

Discovery infrastructure is the part of multiplayer that carries ongoing cost, moderation exposure
and an availability promise. None of it is needed to play with people you know, which is the case
that matters first. Join codes and LAN discovery cover it, and both work with no infrastructure at
all.

## Consequences

- Rooms are reachable three ways: a join code (private, with a QR representation), a direct
  address, and **LAN discovery** by UDP broadcast on the local network.
- Public rooms (ruling from Q5) exist, but "public" means open to anyone who has the address — not
  listed in a global directory.
- **Hooks for the later index**, built as part of 6.4 and inert without it: a server identity
  record (name, address, build hash, open room count), a `heartbeat()` no-op behind a config flag,
  and a client-side "Find a game" source interface with exactly one implementation (LAN) at v1.
  Adding the index later means a second implementation of that interface and turning the flag on.

## Enforced by

- `plan-v1.md` slice 6.4
- `specs/plan.md` §3.10
- `server/discovery.js` (from 6.4) — the source interface and its LAN implementation
