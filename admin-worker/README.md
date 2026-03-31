# MMD Platform

Worker packages in this repo now live under `workers/`.

MMD is a channel-agnostic operating system with personality.

It is designed to control human experience through system, flow, character, real-time coordination, and operator control — not just through pages, bots, or manual operations.

## What MMD is

MMD is not a single product.

It is an operating system that supports multiple layers at once:

- service operations
- membership and access
- TMIB character-driven interface
- real-time session coordination
- admin/operator control
- migration from legacy flows into core production

At the center of the platform is one principle:

**System at the core. Character at the surface. Experience as the output.**

## Repository guide

This repository structure is documented through the files below:

- [`docs/architecture/README.md`](docs/architecture/README.md) — architecture docs index
- [`docs/architecture/SYSTEM_OVERVIEW.md`](docs/architecture/SYSTEM_OVERVIEW.md) — platform summary and layer map
- [`docs/architecture/WORKERS.md`](docs/architecture/WORKERS.md) — worker roles and boundaries
- [`docs/architecture/INTERNAL_DOCTRINE.md`](docs/architecture/INTERNAL_DOCTRINE.md) — internal principles and rules

## Current architecture

### Experience Layer
- `chat-worker`
- TMIB character interface
- web / LINE / Telegram / future channels

### Core Production Layer
- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

### Real-time Layer
- `realtime-worker`

### Migration Layer
- `immigrate-worker`

### Operator Layer
- `Admin Console V1`

## Character layer

MMD does not present itself as a neutral interface.

The experience layer is character-driven. Users interact through TMIB characters, not through a generic system voice.

Core TMIB interface characters:
- Hito
- Hiro
- Hima
- Hiei
- Kenji
- Tart

## Hard truths

- `session_id` is the primary session / idempotency reference
- canonical token parameter is `t`
- Airtable is the back-office source of truth
- Memberstack is the public auth / membership layer
- `telegram-worker` is internal only
- migration must stay separate from core production

## One-line definition

**MMD is a channel-agnostic operating system with personality — expressed through TMIB characters, powered by core production workers, extended by a real-time layer, supported by a migration layer, and operated through Admin Console V1.**
