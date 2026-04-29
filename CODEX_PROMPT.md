# Codex Operating Prompt

You are working inside the MMD / SIGIL workers repository.

Operate with a long-term mindset:
- maintainability over speed
- safety over completeness
- incremental changes over big rewrites

## Core System Architecture

- admin-worker = dashboard facade / read model
- payments-worker = payment truth
- events-worker = session lifecycle truth
- chat-worker = the only public-facing AI/chat concierge layer
- api-worker = public proxy layer
- telegram-worker = internal system messaging only

- session_id = primary operational reference
- t = canonical public token param

- Airtable = back-office truth
- Memberstack = public auth / membership layer

- frontend must NOT call truth workers directly
- /dashboard must remain the single real dashboard
- client lane and model/apply lane must remain separated

Narrative constraints:
- Kenji = client-facing continuity
- TarT must NOT be used as front-facing guide in client purchase flow

## Architecture Separation

Core production and migration layer must remain explicitly separated.

- Core production = admin-worker, payments-worker, events-worker, chat-worker, api-worker
- Migration layer = immigrate-worker, LINE bridge utilities, jobs-worker bridge logic, inbox/import flows, and related transition utilities

Do not mix migration assumptions into core production contracts unless explicitly approved.

- jobs-worker and similar bridge utilities must be treated as migration layer, not core production
- telegram-worker must not be repurposed into a public-facing product/chat surface

## Critical Policies

### 1. Protect production truth.

Do NOT change:
- payment truth
- session lifecycle truth
- dashboard read model logic
- token/session resolution
- Airtable write contracts

### 2. Refactor low-risk first.

Only extract or reorganize helpers that:
- are reusable
- are duplicated
- do NOT change runtime behavior

Prefer thin wrappers over forced merges.

### 3. Preserve active migration flows.

Do NOT break or de-scope:
- LINE Official -> Airtable client immigration
- immigrate-worker and related bridge utilities
- inbound logging / console inbox / identity matching

Treat migration layer as ACTIVE, not legacy.

Maintain the separation between:
- client identity in canonical client records
- channel/chat identity from LINE inbound logs / inbox records

Do not collapse these into one model during refactor.

## Risk Classification

### LOW-RISK

- response helpers
- http helpers
- internal auth helpers (bearer check only)
- constants
- simple utilities
- thin wrappers

### MEDIUM-RISK

- cors helpers
- api-worker proxy behavior
- token parsing (not validation)
- internal fetch wrappers

### HIGH-RISK

- Airtable logic
- field mapping
- payments-worker verification logic
- events-worker transitions
- admin-worker dashboard aggregation
- token/session resolution
- LINE migration bridge
- destructive chat-layer consolidation
- public/internal chat boundary changes
- migration/core boundary changes

Proceed only with LOW-RISK unless explicitly approved.

## Working Rules

- one helper family at a time
- one worker at a time when possible
- no destructive changes
- no behavior changes
- keep entrypoint imports unchanged where possible
- validate after every batch

## Required Output for Each Batch

- Batch name
- Files created/updated
- Old pattern
- New pattern
- Why low-risk
- Risk level
- Validation notes
- Exact commit message

## Stop Conditions

Stop and report if:
- helper behavior differs across workers
- runtime contract may change
- Airtable/session/payment/dashboard logic is touched
- migration flow may be impacted
- client identity and channel/chat identity may be merged or blurred
- public-facing chat boundaries may be impacted
- telegram-worker may be exposed beyond internal/system-only scope
- migration-layer assumptions may leak into core production contracts

If stopped, provide:
- issue description
- 2 safe options
- recommended option
