# MMD / SIGIL Workers Architecture

## Purpose

This document defines the intended architecture, ownership boundaries, and safety rules for the MMD / SIGIL workers repository.

This file is written for both:
- humans working in the repository
- AI coding assistants such as Codex or Copilot

The goal is long-term maintainability without breaking production truth or active migration flows.

---

## Core Principles

1. Protect production truth.
2. Refactor low-risk first.
3. Preserve active migration flows.
4. Keep core production separate from migration infrastructure.
5. System truth always overrides UI, copy, and narrative surface.

---

## System Model

The system is designed with:

- **system at the core**
- **character at the surface**
- **experience as the output**

This means:
- business truth belongs to backend workers and protected contracts
- characters shape presentation, guidance, and mood
- narrative must never override system truth

---

## Protected Contracts

The following are protected and must not be changed casually:

- `session_id` = primary operational reference
- `t` = canonical public token param
- Airtable = back-office truth
- Memberstack = public auth / membership layer
- frontend must not call truth workers directly
- `/dashboard` must remain the single real dashboard

Any proposed change that affects these contracts is high-risk and requires explicit review.

---

## Core Production Workers

These workers define the canonical system behavior.

### `admin-worker`
Role:
- dashboard facade
- read model aggregation
- single source of dashboard payload construction

Responsibilities:
- aggregate truth from payments + lifecycle layers
- expose safe frontend-facing dashboard payloads
- keep dashboard state aligned with backend truth

Must not become:
- payment truth owner
- lifecycle truth owner
- public chat surface

---

### `payments-worker`
Role:
- payment truth

Responsibilities:
- payment verification state
- payment status
- payment reference logic
- payment-related transitions only where explicitly owned

Must not become:
- dashboard facade
- session lifecycle owner
- general migration bridge

---

### `events-worker`
Role:
- session lifecycle truth

Responsibilities:
- canonical lifecycle transitions
- session state progression
- aftercare lifecycle/state handling

Must not become:
- payment truth owner
- dashboard facade
- public chat surface

---

### `chat-worker`
Role:
- the only public-facing AI/chat concierge layer

Responsibilities:
- direct assistance handoff
- client-facing conversational interface
- concierge/intake layer for public or member-facing chat

Must not become:
- payment truth
- lifecycle truth
- internal system messaging bus

---

### `api-worker`
Role:
- public proxy layer

Responsibilities:
- frontend-safe gateway for selected public APIs
- proxy access to approved backend surfaces
- shield frontend from calling truth workers directly

Must not become:
- a second truth layer
- a business-logic dumping ground
- a replacement for admin-worker

---

### `telegram-worker`
Role:
- internal system messaging only

Responsibilities:
- internal operational messaging
- system notifications
- private/internal messaging flows

Must not become:
- public-facing chat layer
- member-facing AI concierge
- general dashboard/API facade

---

## Migration Layer

Migration is active and must remain visible.

Migration layer exists to support customer, channel, and system transition into the canonical production model.

Examples include:
- `immigrate-worker`
- LINE bridge utilities
- inbox/import flows
- `jobs-worker` bridge logic
- related transition utilities
- legacy migration helpers still required for live business operations

### Critical rule
Migration layer is **active business infrastructure**, not disposable legacy.

Do not:
- delete it casually
- hide it during cleanup
- merge it into core production without explicit approval
- treat web-first assumptions as universal

---

## LINE Official -> Airtable Migration

This is an active requirement.

The repository must preserve support for:

```text
LINE Official
-> inbound log / console inbox
-> identity matching
-> canonical client record
-> bookings / payments / sessions / notes / logs
