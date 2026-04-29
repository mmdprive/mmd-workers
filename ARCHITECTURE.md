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
```

### Maintain this separation

Do not collapse these two concepts into one:

1. **client identity**

   * canonical client record
   * long-term business identity

2. **channel/chat identity**

   * LINE inbound log
   * inbox record
   * platform/channel-specific identity

These are related, but not the same thing.

Any refactor that blurs this boundary is high-risk.

---

## Core vs Migration Separation

These must remain explicitly separated.

### Core production

* `admin-worker`
* `payments-worker`
* `events-worker`
* `chat-worker`
* `api-worker`

### Migration layer

* `immigrate-worker`
* LINE bridge utilities
* `jobs-worker` bridge logic
* migration inbox/import flows
* legacy transition helpers still needed for live operations

### Additional rules

* `jobs-worker` and similar bridge utilities must be treated as migration layer, not core production
* migration assumptions must not leak into canonical production contracts
* core production rules must not erase active migration needs

---

## Shared Layer

The shared layer exists for **low-risk reusable utilities first**.

Safe early shared candidates:

* response helpers
* http helpers
* internal auth helpers
* constants
* simple utilities
* thin wrappers

Shared layer must **not** become:

* a dumping ground for unstable business logic
* a shortcut around worker boundaries
* a place to mix core truth with migration logic

### Deferred or protected shared candidates

These are not early shared candidates unless explicitly approved:

* Airtable business logic
* field mapping
* payment truth logic
* session lifecycle truth
* dashboard aggregation logic
* token/session resolution

---

## Dashboard Rule

`/dashboard` must remain the single real dashboard.

This means:

* no fake dashboard clones
* no second truth source
* no public layer bypassing worker boundaries
* no UI-driven state invention

Frontend may render state.
Backend workers own truth.

---

## Frontend / Auth Model

### Airtable

* operational truth
* back-office records
* sessions / payments / migration-linked data

### Memberstack

* public auth / membership layer
* public/member-facing identity and access layer

### Frontend

* render only
* should not call truth workers directly
* should call approved safe surfaces such as `api-worker` or `admin-worker` facade routes

---

## Narrative Surface Constraints

Narrative exists at the surface only.

### Kenji

* continuity layer for client flow
* client-facing guidance and care

### TarT

* apply/model-side intelligence only
* not a front-facing guide in client purchase flow

### Boss Per

* authority / gate moments

### Rule

Narrative must never override:

* payment truth
* lifecycle truth
* dashboard truth
* token/session contracts
* migration boundaries

---

## Risk Model

### Low-risk

Safe first:

* response helpers
* http helpers
* internal bearer auth helpers
* constants
* simple utilities
* thin wrappers

### Medium-risk

Requires caution:

* cors helpers
* proxy behavior
* token parsing
* internal fetch wrappers

### High-risk

Protected:

* Airtable logic
* field mapping
* payments-worker verification logic
* events-worker lifecycle transitions
* admin-worker dashboard aggregation
* token/session resolution
* LINE migration bridge
* destructive chat-layer consolidation
* migration/core boundary changes
* public/internal chat boundary changes

---

## Working Rules for Humans and AI Tools

When changing this repo:

* work incrementally
* keep commits small
* preserve runtime behavior
* prefer thin wrappers over forced merges
* update one helper family at a time
* update one worker at a time when possible
* validate after each batch

Do not:

* make one giant refactor
* merge ambiguous workers prematurely
* standardize protected logic too early
* clean up migration code just because it looks old

---

## Stop Conditions

Stop and report before changing anything if:

* helper behavior differs across workers
* runtime contract may change
* Airtable/session/payment/dashboard logic is touched
* migration flow may be impacted
* client identity and channel/chat identity may be merged or blurred
* public-facing chat boundaries may be impacted
* `telegram-worker` may be exposed beyond internal/system-only scope
* migration-layer assumptions may leak into core production contracts

When stopped, report:

* the issue
* 2 safe options
* the recommended option

---

## Practical Refactor Order

Preferred sequence:

1. repo guardrails and docs
2. low-risk shared extraction
3. non-destructive core vs migration separation
4. dashboard binding hardening
5. active migration protection review
6. high-risk refactor planning
7. high-risk refactor execution only after approval

---

## Short Version

* Protect production truth.
* Refactor low-risk first.
* Preserve active migration flows.
* Keep core production separate from migration infrastructure.
* Do not break LINE Official -> Airtable client immigration.
