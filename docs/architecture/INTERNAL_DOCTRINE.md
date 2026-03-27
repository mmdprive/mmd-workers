# Current MMD System Summary — Corrected Latest Architecture

## Definition

MMD is a channel-agnostic operating system with personality.

It is not just a booking flow, a chatbot, or a single product. It is a structured system that separates interface, business control, real-time coordination, migration, and operator control into distinct layers.

Core principle:

**System at the core. Character at the surface. Experience as the output.**

## Layer map

### 1. Experience Layer
User-facing surface of the system.

Includes:
- `chat-worker`
- TMIB character interface
- web / LINE / Telegram / future channels

This layer is where users interact with MMD through character-led guidance rather than a generic software voice.

### 2. Core Production Layer
Business control engine.

Includes:
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

This layer owns the platform's operational truth, payment flow, admin authority, session automation, and internal system messaging.

### 3. Real-time Layer
Live session interaction layer.

Includes:
- `realtime-worker`

This layer supports live coordination and real-time interactions during active flows.

### 4. Migration Layer
Bridge layer for moving into the main system.

Includes:
- `immigrate-worker`

This layer exists for migration and must remain conceptually separate from core production contracts.

### 5. Operator Layer
Human control surface.

Includes:
- `Admin Console V1`

This is the operator-facing interface used to run and control the platform at an administrative level.

## Worker summary

### `chat-worker`
- public AI concierge
- TMIB character interface layer
- entry point for user-facing interaction
- not a single neutral assistant

### `payments-worker`
- payment verification
- payment lifecycle control
- proof/slip handling
- payment-session linkage
- money truth

### `admin-worker`
- backend authority
- membership and access control
- operational orchestration
- admin-facing system actions

### `events-worker`
- session/job automation
- reminder and movement states
- arrival/work/review/payout sequencing
- timeline control

### `telegram-worker`
- internal system messaging gateway
- not a public chatbot layer
- used for internal notification and routing

### `realtime-worker`
- real-time session infrastructure
- live interaction support
- room/session coordination layer

### `immigrate-worker`
- migration-only worker
- data/workflow movement into the main system
- not part of core production logic

## Character layer

MMD is not just worker-based infrastructure.

Its public interface is character-driven. Users do not simply interact with a generic system; they interact through TMIB characters.

Current TMIB interface set:
- Hito
- Hiro
- Hima
- Hiei
- Kenji
- Tart

This makes the interface layer part of the architecture itself, not merely a branding treatment.

## Core production truths

Current system assumptions:

- `session_id` is the primary session/idempotency reference
- token parameter is `t`
- Airtable is the source of truth for back-office operations
- Memberstack is the public auth/membership layer
- worker boundaries must remain intact
- migration logic must not be treated as core production by default

## Corrected architectural map

```txt
MMD Operating System

Experience Layer
- chat-worker
- TMIB character interface

Core Production Layer
- payments-worker
- admin-worker
- events-worker
- telegram-worker

Real-time Layer
- realtime-worker

Migration Layer
- immigrate-worker

Operator Layer
- Admin Console V1
```

## One-line official summary

MMD is a channel-agnostic operating system with personality — expressed through TMIB characters, powered by core production workers, extended by a real-time layer, supported by a migration layer, and operated through Admin Console V1.
