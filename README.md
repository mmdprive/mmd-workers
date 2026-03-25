# MMD Platform

MMD is a channel-agnostic operating system with personality.

It is designed to control human experience through system, flow, character, and real-time coordination — not just through pages, bots, or manual operations.

## What MMD is

MMD is not a single product.

It is an operating system that supports multiple layers at once:

- service operations
- membership and access
- character-driven interface
- real-time session coordination
- admin/operator control
- migration from legacy flows into core production

At the center of the platform is one principle:

**System at the core. Character at the surface. Experience as the output.**

## Core architecture

### Experience Layer
This is the user-facing surface of MMD.

- `chat-worker`
- TMIB character interface
- web / LINE / Telegram / future channels

`chat-worker` is the public member-facing AI gateway and is explicitly separated from `telegram-worker`, which remains system/internal only :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

### Core Production Layer
This is the business control engine.

- `payments-worker`
- `admin-worker`
- `events-worker`
- `telegram-worker`

The current lock registry defines these boundaries clearly:
- `admin-worker` is the only holder of key admin secrets
- `payments-worker` is payment / points only
- `telegram-worker` is internal/system gateway only
- `chat-worker` is the public AI concierge layer :contentReference[oaicite:4]{index=4}

### Real-time Layer
This is the live interaction layer.

- `realtime-worker`

`realtime-worker` provides WebSocket rooms for chat/location and issues room tokens via internal endpoints; it also opens live URLs for customer/model session use :contentReference[oaicite:5]{index=5}

### Migration Layer
This is the bridge layer used to move data and workflows into the main system.

- `immigrate-worker`

Current architecture direction treats migration separately from core production contracts. In the latest code I could verify, `admin-worker` still contains controlled immigration bridge endpoints, which is why this separation must stay explicit :contentReference[oaicite:6]{index=6}

### Operator Layer
This is the admin/operator control surface.

- `Admin Console V1`

`Admin Console V1` is the human-facing control surface for operating the platform, while `admin-worker` is the backend authority and orchestrator.

## Worker roles

### `chat-worker`
Public-facing AI concierge and interface layer.

Current verified code shows:
- `GET /health`
- `POST /v1/chat/message`
- `POST /v1/chat/internal`

It is designed as the public/member-facing gateway, with internal relay support for system workers :contentReference[oaicite:7]{index=7}

### `payments-worker`
Money truth and payment lifecycle.

Current verified code shows:
- `GET /ping`
- `POST /v1/pay/verify`
- `POST /v1/payments/notify`

It locks `session_id` as the primary payment/session idempotency reference and enforces payment-stage logic across deposit/final/tips/membership flows :contentReference[oaicite:8]{index=8}

### `admin-worker`
Admin API, core orchestrator, and controlled bridge.

Current verified code explicitly describes:
- core admin system routes
- Airtable-writing authority
- controlled immigration bridge endpoints
- job creation that mints confirm links via `payments-worker` :contentReference[oaicite:9]{index=9}

### `events-worker`
Job/session automation and dispatch timeline.

Current verified code defines:
- job create/get/event routes
- canonical state machine
- hard gate preventing `work_started` unless `final_payment_confirmed` exists
- integration path to `realtime-worker` and `telegram-worker` :contentReference[oaicite:10]{index=10}

### `telegram-worker`
Internal messaging gateway only.

The lock registry treats this worker as internal/system-only, not a public chatbot surface :contentReference[oaicite:11]{index=11}

### `realtime-worker`
Live room infrastructure.

Current verified code shows:
- tokenized room open flow
- WebSocket endpoint
- allowlisted message types like `chat`, `location`, and `photo_meta`
- live URLs generated from `WEB_BASE_URL` for customer/model usage :contentReference[oaicite:12]{index=12}

## TMIB character layer

MMD does not present itself as a neutral interface.

The experience layer is character-driven. Users interact through TMIB characters, not through a generic system voice.

This means MMD is not only worker-based infrastructure — it is also a personality-based interface model.

## Hard production truths

The latest verified locks include:

- `session_id` is the primary idempotency/session reference
- token parameter must be `t`
- core worker boundaries must stay intact
- Airtable wiring is treated as production contract
- `/login` stays separated from server-side secret handling :contentReference[oaicite:13]{index=13}

## Architecture summary

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
