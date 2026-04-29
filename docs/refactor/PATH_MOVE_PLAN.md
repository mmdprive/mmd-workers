# Path Move Plan

Date: 2026-04-19

This document is the move-preparation checklist for the later structural refactor.

## Canonical production moves

| Current path | Future path | Notes |
| --- | --- | --- |
| `admin-worker/` | `core/admin-worker/` | Preserve dashboard facade and member dashboard routes |
| `payments-worker/` | `core/payments-worker/` | Preserve payment truth and confirm-link behavior |
| `events-worker/` | `core/events-worker/` | Preserve session lifecycle truth and event contracts |
| `chat-worker/` | `core/chat-worker/` | Preserve public concierge boundary |
| `telegram-worker/` | `core/telegram-worker/` | Preserve internal-only bot boundary |
| `realtime-worker/` | `core/realtime-worker/` | Preserve live room coordination |

## App and operator surface moves

| Current path | Future path | Notes |
| --- | --- | --- |
| `admin-console-V1/` | `apps/dashboard/admin-console-v1/` | `/dashboard` remains the single real dashboard |

## Migration and legacy moves

| Current path | Future path | Notes |
| --- | --- | --- |
| `immigrate-worker/` | `migration/immigrate-worker/` | Keep bridge behavior isolated from core |
| `jobs-worker/` | `migration/jobs-worker/` | Treat as migration-only |
| `ai-worker/` | `migration/legacy-chat/ai-worker/` | Keep out of public boundary |
| `services/mmd-chat-webhook/` | `migration/legacy-chat/mmd-chat-webhook/` | Legacy webhook overlap |
| `admin-worker/mmd-chat-webhook/` | `migration/legacy-chat/admin-worker-mmd-chat-webhook/` | Remove chat overlap from admin boundary |
| `exports/` | `migration/legacy-artifacts/exports/` | Archive only |
| `patch.diff` | `migration/legacy-artifacts/patch.diff` | Archive only |

## Specs and infra moves

| Current path | Future path | Notes |
| --- | --- | --- |
| `openapi/mmd-core-api.v1.yaml` | `openapi/core-api/mmd-core-api.v1.yaml` | Move once consumers are updated |
| `spec/openapi.payments.v2.yaml` | `openapi/payments/openapi.payments.v2.yaml` | Consolidate under `openapi/` |
| `infra/omni/models-airtable-schema.template.json` | `infra/airtable/models-airtable-schema.template.json` | Re-group by infra domain |

## Duplicate quarantine candidates

Quarantine before deletion:

- `index 2.js`
- `index 3.js`
- `package 2.json`
- `package-lock 2.json`
- `README 2.md`
- `wrangler 2.toml`
- `tsconfig 2.json`

## Pre-move checks

Before moving any runtime folder:

1. Update deploy and dev scripts only in the same change that moves the real folder.
2. Confirm relative imports inside the moved worker still resolve.
3. Confirm Wrangler config paths still point at the right entrypoint.
4. Confirm no frontend surface calls truth workers directly after the move.
5. Confirm `/dashboard` still resolves through the same real dashboard app and facade path.
