# MMD Workers

MMD is a channel-agnostic operating system with personality.

This repository contains the worker-based core of the MMD platform: the system layer that controls experience, payments, membership, automation, real-time coordination, and internal operations across channels.

## What this repo is

`mmd-workers` is the operational backbone of MMD.

It is not a single app and not a single workflow. It is a multi-layer system designed to run human experience through controlled flows, clear worker boundaries, and character-led interfaces.

At the center of the platform is one principle:

**System at the core. Character at the surface. Experience as the output.**

## Architecture at a glance

Worker packages now live under `workers/`.

### Experience Layer
- `chat-worker`
- TMIB character interface
- Web / LINE / Telegram / future channels

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

## Worker roles

### `chat-worker`
Public-facing AI concierge and TMIB character interface.  
This is the layer users experience directly.

### `payments-worker`
Payment truth and payment lifecycle control.  
Handles verification, payment state, and session-payment coupling.

### `admin-worker`
Administrative authority and orchestration layer.  
Handles membership lifecycle, access control, internal actions, and system operations.

### `events-worker`
Session and job automation engine.  
Controls timeline-driven state transitions across the platform.

### `telegram-worker`
Internal system messaging gateway only.  
Not a public chatbot surface.

### `realtime-worker`
Live interaction layer.  
Supports real-time session coordination such as room opening, chat/location signaling, and live session support.

### `immigrate-worker`
Migration bridge layer.  
Used to move data and workflows into the core production system without polluting core contracts.
Currently fronts `mmdbkk.com/internal/admin/control-room*` and `mmdbkk.com/internal/jobs*`, reads sessions from Airtable fallback, syncs migration payloads into `MMD — Console Inbox`, and proxies create-links to `payments-worker`.
Canonical source path: `workers/immigrate-worker`

## Ops

### Smoke Test
- run `INTERNAL_TOKEN=... ./scripts/smoke-test-immigrate.sh` from `mmd-workers`
- current script covers `GET /v1/immigrate/health`, `POST /v1/immigration/intake`, `POST /v1/immigration/promote`, and `GET /v1/immigration/:id`

## Core truths

- `session_id` is the primary session and idempotency reference
- token parameter must be `t`
- Airtable is the back-office source of truth
- Memberstack is the public auth and membership layer
- worker boundaries are production contracts
- migration must remain separate from the core

## Documentation

Architecture docs live in:

- `docs/architecture/README.md`
- `docs/architecture/SYSTEM_OVERVIEW.md`
- `docs/architecture/WORKERS.md`
- `docs/architecture/REALTIME.md`
- `docs/architecture/STATE_MACHINE.md`
- `docs/architecture/CHARACTERS.md`
- `docs/architecture/LAYERS.md`
- `docs/architecture/PRINCIPLES.md`
- `docs/architecture/INTERNAL_DOCTRINE.md`

## Final definition

MMD is a channel-agnostic operating system with personality — expressed through TMIB characters, powered by core production workers, extended by a real-time layer, supported by a migration layer, and operated through Admin Console V1.
