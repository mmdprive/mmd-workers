# Target Repo Structure

Date: 2026-04-19

This document defines the target long-term repo layout for the MMD / SIGIL workers repository.

## Top-level groups

```text
core/
migration/
shared/
apps/
docs/
openapi/
infra/
```

## Core production rules

- `admin-worker` = dashboard facade / read model
- `payments-worker` = payment truth
- `events-worker` = session lifecycle truth
- `chat-worker` = client-facing concierge / direct assistance
- `api-worker` = public proxy layer
- `telegram-worker` = internal-only system messaging
- `session_id` = primary operational reference
- `t` = canonical public token param
- Airtable = back-office truth
- frontend must not call truth workers directly
- `/dashboard` must remain the single real dashboard
- client lane and model/apply lane must remain separated
- TarT must not be used as front-facing guide in client purchase flow
- Kenji is the continuity layer for client-facing flow

## Layer assignment

### `core/`
Canonical production workers and public-safe runtime boundaries.

### `migration/`
Legacy, bridge, compatibility, prototype, and historical material.

### `shared/`
Stable shared libraries, contracts, constants, and field mapping utilities.

### `apps/`
Frontend and operator-facing applications.

### `docs/`
Architecture, decision records, migration plans, and refactor guides.

### `openapi/`
Published and in-progress API contracts.

### `infra/`
Airtable schemas, environment templates, Cloudflare/runtime setup, and infra references.

## Canonical chat decision

The single canonical chat layer is `chat-worker`.

Non-canonical chat overlaps should be treated as migration or legacy material until removed:
- `ai-worker`
- `services/mmd-chat-webhook`
- `admin-worker/mmd-chat-webhook`

## Step 2 scope

This step creates structure only.

It does not:
- move workers
- delete files
- rewrite business logic
- change current runtime entrypoints
