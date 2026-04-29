# Step 5 Runtime Map

Date: 2026-04-28

This document records the current runtime-oriented repo map before any real worker path move begins.

It supersedes older assumptions that every planned move was still pending in the same way.

## Purpose

Step 5 is a move-preparation step only.

It does not:

- move workers into `core/`
- delete legacy folders
- merge away migration infrastructure
- change deploy/runtime contracts
- de-scope the LINE Official -> Airtable immigration flow

## Current observed runtime map

### Canonical MMD production workers still at top level

- `admin-worker/`
- `payments-worker/`
- `events-worker/`
- `chat-worker/`
- `telegram-worker/`

These should still be treated as the current live/canonical MMD production worker locations until explicitly moved and re-verified.

### Canonical worker already present under `core/`

- `core/api-worker/`
- `core/realtime-worker/`

Notes:

- `api-worker` is still scaffold-only
- `realtime-worker` already exists under `core/` and should be treated as the current canonical realtime location unless a later verification shows otherwise

### Dashboard and app surfaces

- `apps/dashboard/admin-console-v1/`
- `apps/web-client/`

Rule:

- `/dashboard` remains the single real dashboard
- dashboard frontend must continue through the same backend facade/read-model boundary

### Protected migration infrastructure

Treat as active migration infrastructure unless clearly proven otherwise:

- `immigrate-worker/`
- `jobs-worker/`
- LINE ingestion utilities
- inbox logging utilities
- client matching utilities related to immigration flow
- migration bridge services

Critical protection rule:

- do not break or de-scope the active LINE Official -> Airtable client immigration flow

Important separation to preserve:

- `Clients` table = client identity
- LINE inbound logs / console inbox = channel/chat identity and migration trace

### Legacy and quarantined chat overlap

- `migration/legacy-chat/ai-worker/`
- `migration/legacy-chat/mmd-chat-webhook/`
- `migration/legacy-chat/admin-worker-mmd-chat-webhook/`

These are not the canonical public chat boundary.

Canonical public chat layer remains:

- `chat-worker`

### Newly observed adjacent workers requiring classification before any move

- `himai-chat-worker/`
- `himai-shop-worker/`

Current interpretation:

- these are active adjacent workers/surfaces
- they should not be silently folded into canonical MMD core moves
- they should not be treated as legacy by default
- they require explicit classification before any path move or consolidation

Observed behavior hints:

- `himai-chat-worker` appears to handle Himai LINE/shop interaction plus Airtable/report flows
- `himai-shop-worker` appears to proxy a catalog surface and an admin dashboard surface

Step 5 rule:

- hold `himai-*` outside the canonical MMD core worker move waves until ownership and target grouping are approved

## Current move-state truth

### Already in forward structure

- `apps/dashboard/admin-console-v1/`
- `core/api-worker/`
- `core/realtime-worker/`
- `migration/legacy-chat/*`
- `migration/legacy-artifacts/*`
- grouped `openapi/` folders
- grouped `infra/` folders
- `shared/` low-risk helper layer

### Not yet moved into forward structure

- `admin-worker/`
- `payments-worker/`
- `events-worker/`
- `chat-worker/`
- `telegram-worker/`
- `immigrate-worker/`
- `jobs-worker/`

## Worker boundary reminders

- `admin-worker` = dashboard facade / read model
- `payments-worker` = payment truth
- `events-worker` = session lifecycle truth
- `chat-worker` = client-facing concierge / direct assistance
- `api-worker` = public proxy layer scaffold only for now
- `session_id` = primary operational reference
- `t` = canonical public token param
- Airtable = back-office truth
- frontend must not call truth workers directly
- client lane and model/apply lane must remain separated
- migration/legacy workers must remain isolated from core production decisions
