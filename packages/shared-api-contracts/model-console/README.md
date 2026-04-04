# Model Session API

This folder is the canonical source of truth for the public model-session facade contract.

## Files

- [`model-session-api.contract.ts`](./model-session-api.contract.ts)
  Shared TypeScript contract used by the codebase.

- [`model-session-api.openapi.yaml`](./model-session-api.openapi.yaml)
  OpenAPI document for the live facade routes exposed by `admin-worker`.

## Current public facade

- `GET /model/session/current`
- `GET /model/session/{sessionId}`
- `POST /model/session/{sessionId}/start-travel`
- `POST /model/session/{sessionId}/share-location`
- `POST /model/session/{sessionId}/arrived`
- `POST /model/session/{sessionId}/met-client`
- `POST /model/session/{sessionId}/payment-status`
- `POST /model/session/{sessionId}/start-work`
- `POST /model/session/{sessionId}/work-finished`
- `POST /model/session/{sessionId}/separated`
- `POST /model/session/{sessionId}/emergency`

## Rules

- Canonical token parameter is `t`
- `session_id` is the primary session reference
- Error responses use `{ ok: false, code, message }`
- `admin-worker` is the public facade
