# SIGIL System — Read First

This repository contains the MMD / SIGIL worker system.

Before making any change, follow these rules.

## Core Policies

1. Protect production truth.
2. Refactor low-risk first.
3. Preserve active migration flows.

## Production Truth (Do Not Break)

The following are protected system contracts:

- `admin-worker` = dashboard facade / read model
- `payments-worker` = payment truth
- `events-worker` = session lifecycle truth
- `chat-worker` = client-facing concierge / direct assistance
- `api-worker` = public proxy layer

- `session_id` = primary operational reference
- `t` = canonical public token param
- Airtable = back-office truth

- frontend must not call truth workers directly
- `/dashboard` must remain the single real dashboard

## Critical Migration Rule

LINE Official -> Airtable client immigration is ACTIVE.

Do not:
- delete or hide `immigrate-worker`
- remove LINE ingestion / inbox / matching logic
- assume all customers start from web only
- collapse client identity and channel/chat identity into one thing

Migration layer is active business infrastructure, not disposable legacy.

## Safe Refactor Order

Allowed first:
- response helpers
- http helpers
- internal auth helpers

Defer:
- cors
- public proxy behavior
- token parsing that may affect contracts

Blocked until explicitly approved:
- Airtable logic
- field mapping
- payment verification logic
- session lifecycle transitions
- dashboard aggregation logic
- token/session resolution
- LINE migration bridge
- destructive chat-layer consolidation

## Working Style

- small commits only
- one helper family at a time
- preserve runtime behavior
- prefer thin wrappers over forced merges
- stop if unsure

If unsure, stop and report the risk before changing anything.
