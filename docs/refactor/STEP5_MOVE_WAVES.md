# Step 5 Move Waves

Date: 2026-04-28

This document defines the recommended wave-by-wave execution order for the eventual path moves.

The goal is to make later structural changes predictable without changing runtime behavior now.

## Wave 0: Protected zones

Do not move in an opportunistic cleanup batch:

- `immigrate-worker/`
- `jobs-worker/`
- LINE ingestion utilities
- inbox logging utilities
- client matching utilities related to immigration flow
- migration bridge services
- `himai-chat-worker/`
- `himai-shop-worker/`

Rationale:

- the LINE Official -> Airtable immigration flow remains active and protected
- `himai-*` workers are active adjacent surfaces but not yet cleanly classified into the MMD core move plan

## Wave 1: Canonical top-level MMD production workers

Move only after per-worker verification:

1. `admin-worker/` -> `core/admin-worker/`
2. `payments-worker/` -> `core/payments-worker/`
3. `events-worker/` -> `core/events-worker/`
4. `chat-worker/` -> `core/chat-worker/`
5. `telegram-worker/` -> `core/telegram-worker/`

Notes:

- `realtime-worker` is already present under `core/`
- move one worker per change where possible
- update scripts, wrangler paths, and relative imports in the same change as the move

## Wave 2: Migration-only workers

Move only after Wave 1 is stable:

1. `immigrate-worker/` -> `migration/immigrate-worker/`
2. `jobs-worker/` -> `migration/jobs-worker/`

Special rule:

- do not perform this wave unless the LINE Official -> Airtable migration plan is explicitly re-checked in the moved paths

## Wave 3: Classification wave for adjacent workers

Before moving `himai-*`, decide and document:

- whether `himai-chat-worker` is a separate product surface, a migration-adjacent integration, or a future app-specific edge service
- whether `himai-shop-worker` belongs under `apps/`, `core/`, or a separate adjacent-worker grouping

Until that classification exists:

- do not move `himai-chat-worker/`
- do not move `himai-shop-worker/`

## Per-worker move checklist

Apply this checklist to each worker move:

1. destination folder exists
2. worker entrypoint still resolves
3. Wrangler `main` path is correct
4. root scripts point at the new location
5. relative imports still resolve
6. service bindings and upstream URLs still resolve
7. smoke checks still pass
8. no frontend surface now calls a truth worker directly

## Special checks by worker

### `admin-worker`

- preserve `/api/member/dashboard`
- preserve dashboard token flow using `t`
- preserve role as dashboard facade / read model

### `payments-worker`

- preserve payment truth behavior
- preserve confirm-link and verification behavior
- do not change `session_id` handling

### `events-worker`

- preserve session lifecycle truth
- preserve rules/job/event routes

### `chat-worker`

- preserve canonical concierge boundary
- do not let legacy chat overlap become canonical again

### `telegram-worker`

- preserve internal-only messaging boundary
- preserve internal send behavior

### `immigrate-worker`

- preserve LINE Official -> Airtable client immigration flow
- preserve separation between `Clients` identity and inbox/channel identity
- preserve migration trace visibility

## Step 5 exit criteria

Step 5 is complete when:

- the current runtime map is documented
- protected migration infrastructure is clearly marked
- move waves are defined
- newly observed adjacent workers are explicitly held out of automatic moves
- no runtime code or worker path has been changed
