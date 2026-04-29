# Path Move Closeout Checklist

Date: 2026-04-24

Status:
- path move not fully executed
- repo is in a partial forward-structure state
- package script paths are now aligned with current real runtime paths

This document records the actual closeout status for the path move plan based on the current repository layout.

## Current repo truth

Observed in the repo now:
- canonical production workers still exist at the old top-level paths
- `core/` currently contains only `api-worker`
- the dashboard app now lives at `apps/dashboard/admin-console-v1/`
- `migration/legacy-chat/` and `migration/legacy-artifacts/` exist, but most planned source folders are still not moved there
- planned `openapi/` and `infra/` destination paths do not yet contain the moved artifacts

Operational implication:
- treat the move plan as incomplete
- do not represent any worker as moved until runtime entrypoints, deploy scripts, imports, and routes are verified on the destination path

Machine-check result on 2026-04-24:
- `npm run check:path-move-status` reports `package_script_targets_valid: true`
- `npm run check:path-move-status` reports `unresolved_move_count: 7`
- current closeout state is still `closeout_ready: false`

## Status matrix

Canonical production moves:

| Source | Planned destination | Current status |
| --- | --- | --- |
| `admin-worker/` | `core/admin-worker/` | not moved |
| `payments-worker/` | `core/payments-worker/` | not moved |
| `events-worker/` | `core/events-worker/` | not moved |
| `chat-worker/` | `core/chat-worker/` | not moved |
| `telegram-worker/` | `core/telegram-worker/` | not moved |
| `realtime-worker/` | `core/realtime-worker/` | moved |

App and operator moves:

| Source | Planned destination | Current status |
| --- | --- | --- |
| `admin-console-V1/` | `apps/dashboard/admin-console-v1/` | moved |

Migration and legacy moves:

| Source | Planned destination | Current status |
| --- | --- | --- |
| `immigrate-worker/` | `migration/immigrate-worker/` | not moved |
| `jobs-worker/` | `migration/jobs-worker/` | not moved |
| `ai-worker/` | `migration/legacy-chat/ai-worker/` | moved |
| `services/mmd-chat-webhook/` | `migration/legacy-chat/mmd-chat-webhook/` | moved |
| `admin-worker/mmd-chat-webhook/` | `migration/legacy-chat/admin-worker-mmd-chat-webhook/` | moved |
| `exports/` | `migration/legacy-artifacts/exports/` | moved |
| `patch.diff` | `migration/legacy-artifacts/patch.diff` | moved |

Spec and infra moves:

| Source | Planned destination | Current status |
| --- | --- | --- |
| `openapi/mmd-core-api.v1.yaml` | `openapi/core-api/mmd-core-api.v1.yaml` | moved |
| `spec/openapi.payments.v2.yaml` | `openapi/payments/openapi.payments.v2.yaml` | moved |
| `infra/omni/models-airtable-schema.template.json` | `infra/airtable/models-airtable-schema.template.json` | moved |

## Immediate blockers found in codebase

These should be treated as closeout blockers even before the actual folder moves begin:

1. Canonical `core/` runtime boundaries for `admin-worker`, `payments-worker`, `events-worker`, `chat-worker`, `telegram-worker`, and `realtime-worker` do not yet exist.
2. Remaining migration-only workers `immigrate-worker` and `jobs-worker` have not yet been relocated to `migration/`.
3. Duplicate suffix files such as `index 2.js`, `package 2.json`, `tsconfig 2.json`, and `wrangler 2.toml` are still present and should not be cleaned up until canonical runtime targets are established.

## Closeout order

Recommended order for finishing the move safely:

1. Freeze the current live runtime map.
2. Fix current deploy and dev script paths so they match the actual source-of-truth locations before introducing more path churn.
3. Move the dashboard app into `apps/dashboard/admin-console-v1/` and verify `/dashboard` behavior through the same facade path.
4. Move one canonical worker at a time into `core/`.
5. After each worker move, update Wrangler config references, deploy scripts, local dev scripts, and any relative imports in the same change.
6. Move migration-only workers into `migration/`.
7. Move openapi and infra artifacts into their planned grouped destinations.
8. Quarantine or delete duplicate suffix files only after each canonical runtime target has been verified.

## Per-worker closeout checklist

Run this checklist separately for each worker before calling the move complete:

- destination folder exists under `core/`
- worker entrypoint is moved and still builds
- Wrangler `main` path points to the correct file
- deploy and dev scripts point to the new config path
- service bindings and base URLs still resolve correctly
- relative imports still resolve
- route bindings still map to the intended worker
- smoke test for that worker passes
- no frontend surface now calls a truth worker directly

## Worker-specific notes

`admin-worker`
- preserve dashboard facade and `/api/member/dashboard`
- verify member dashboard token flow after move

`payments-worker`
- preserve payment truth and confirm-link behavior
- verify any partner eligibility write-back after move

`events-worker`
- preserve session lifecycle truth and job/create flow
- verify partner commission materialization still works

`chat-worker`
- preserve public concierge boundary
- do not let legacy chat overlap become canonical again

`telegram-worker`
- preserve internal-only bot boundary
- verify internal send routes and service bindings

`realtime-worker`
- preserve live room coordination behavior

## Definition of done

Do not mark the path move complete until all are true:

- old source path is no longer the canonical runtime location
- new destination path exists and is the live deploy target
- deploy and dev scripts are updated
- Wrangler config and imports are updated
- runtime routes and bindings are verified
- dashboard path and worker boundary rules are preserved
- duplicate suffix files are either quarantined or removed

## Evidence links

- [Path move plan](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/refactor/PATH_MOVE_PLAN.md)
- [Migration sequence](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/refactor/MIGRATION_SEQUENCE.md)
- [Target repo structure](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/refactor/TARGET_REPO_STRUCTURE.md)
- [Package scripts](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/package.json)
- [Path move status script](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/scripts/check-path-move-status.mjs)
