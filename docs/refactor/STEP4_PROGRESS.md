# Step 4 Progress

Date: 2026-04-20

This document records the safe shared-helper extraction work completed so far in Step 4.

## Scope completed

Completed with thin-wrapper shared extraction:

- response helper
- http helper
- auth guard helper

Deferred:

- shared cors extraction
- entrypoint-level auth standardization
- Airtable logic extraction
- field mapping extraction used by production truth
- session lifecycle logic extraction
- payment truth logic extraction
- dashboard read model extraction

## Workers currently using shared low-risk helpers

### Response helper

- `admin-worker/lib/http.js`
- `payments-worker/lib/http.js`
- `telegram-worker/lib/http.js`

Shared target:

- `shared/src/lib/response/http.js`

### HTTP helper core

- `admin-worker/lib/http.js`
- `payments-worker/lib/http.js`
- `telegram-worker/lib/http.js`

Shared target:

- `shared/src/lib/http/core.js`

### Auth guard helper

- `admin-worker/lib/guard.js`
- `payments-worker/lib/guard.js`
- `telegram-worker/lib/guard.js`

Shared target:

- `shared/src/lib/auth/guard.js`

## Extraction pattern used

The pattern is intentionally conservative:

1. keep existing worker-local import paths unchanged
2. add shared implementation only for identical helper behavior
3. keep worker-local wrappers in place
4. preserve worker-local `HttpError` semantics where needed

This reduces risk because entrypoints still import from their original worker-local files.

## Deferred mismatches

### CORS

Worker-local `lib/cors.js` files are identical in some places, but production entrypoints still contain inline CORS behavior that differs in:

- allowed headers
- response header shape
- `withCors` signature
- credentials behavior

Decision:

- do not standardize shared CORS yet

### Auth policy

Guard helpers in `lib/guard.js` are identical and were extracted safely.

But entrypoint-level auth policy still differs across workers:

- some use `X-Confirm-Key`
- some use `X-Internal-Token`
- some use `Authorization: Bearer ...`
- some use `INTERNAL_TOKEN`
- some use `INTERNAL_API_TOKEN`

Decision:

- do not standardize entrypoint auth policy yet

## Migration protection rule

The active LINE Official -> Airtable client immigration flow remains protected during refactor.

Treat as active migration infrastructure unless clearly proven otherwise:

- `immigrate-worker`
- LINE ingestion utilities
- inbox logging utilities
- client matching utilities related to immigration flow
- migration bridge services

Important separation to preserve:

- `Clients` table = client identity
- LINE inbound logs / console inbox = channel/chat identity and migration trace

## Non-goals confirmed

The completed Step 4 work does not:

- move workers into `core/`
- delete legacy folders
- merge away migration utilities
- change frontend boundaries
- change `/dashboard`
- touch payment truth logic
- touch session truth logic
- change dashboard read model behavior
- de-scope the LINE -> Airtable migration plan
