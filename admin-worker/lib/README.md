# Legacy Note

This folder is part of `admin-worker`, but it is no longer the home of MMD AI decision logic.

## Canonical AI source

The canonical AI worker now lives in:

- [`/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/ai-worker`](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/ai-worker)

Its canonical v1 endpoints are:

- `GET /v1/ai/health`
- `POST /v1/ai/extract-preferences`
- `POST /v1/ai/match`
- `POST /v1/ai/reply`

Compatibility aliases also exist there:

- `POST /v1/ai/intent`
- `POST /v1/ai/dispatch`
- `POST /v1/ai/respond`

## Boundary

- `ai-worker` owns AI extraction, matching, and reply drafting
- `chat-worker` owns orchestration and client-facing flow
- `admin-worker` owns model data and deal persistence

If you need to change AI behavior, update `ai-worker`, not this folder.
