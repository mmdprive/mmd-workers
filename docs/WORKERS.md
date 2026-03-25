# Workers

This document lists the current worker roles and layer boundaries in the MMD platform.

## Experience worker

### `chat-worker`
Public-facing AI concierge and TMIB character interface layer.

Responsibilities:
- receive user/member input
- express the system through TMIB characters
- act as the public interaction surface
- relay into internal system flows

Important:
- this is not the internal system bot
- this is not a generic persona-less assistant
- this is the character-led entry point of MMD

## Core production workers

### `payments-worker`
Money truth and payment lifecycle.

Responsibilities:
- payment verification
- payment status handling
- session-payment coupling
- payment notifications and truth layer logic

### `admin-worker`
Authority and orchestration layer.

Responsibilities:
- membership lifecycle
- admin actions
- access control
- system-level orchestration
- controlled admin-side writing and coordination

### `events-worker`
Session and automation engine.

Responsibilities:
- reminder and state progression
- dispatch / arrival / work state control
- review / payout sequence handling
- timeline orchestration for sessions and jobs

### `telegram-worker`
Internal system messaging only.

Responsibilities:
- internal notifications
- thread/forum messaging
- system bot communication

Important:
- not a public chatbot
- remains internal-only

## Real-time worker

### `realtime-worker`
Live interaction layer.

Responsibilities:
- real-time room handling
- websocket/session coordination
- live interaction and room token behavior
- bridging automation with live session behavior

## Migration worker

### `immigrate-worker`
Migration and bridge layer.

Responsibilities:
- moving legacy data/workflows into main system
- controlled migration support
- bridge-layer operations outside core production contracts

Important:
- must stay logically separate from core production

## Operator surface

### `Admin Console V1`
Operator-facing control surface.

Responsibilities:
- admin/operator interaction with the system
- control and visibility layer for human operators

Important distinction:
- `admin-worker` = backend authority / orchestrator
- `Admin Console V1` = human-facing operational surface

## Worker boundary summary

```txt
Experience
- chat-worker

Core Production
- payments-worker
- admin-worker
- events-worker
- telegram-worker

Real-time
- realtime-worker

Migration
- immigrate-worker

Operator
- Admin Console V1
```
