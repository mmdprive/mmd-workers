# api-worker

Scaffold for the future public proxy worker.

Intended role:
- provide the frontend-safe public API boundary
- proxy and compose responses from canonical workers
- prevent the frontend from calling truth workers directly

Non-goals:
- not a payment truth worker
- not a session lifecycle truth worker
- not a dashboard replacement

Current status:
- basic placeholder runtime exists in `src/index.js`
- no production routes are wired
- no worker-to-worker calls are active

This scaffold is safe to evolve later without changing current runtime behavior elsewhere in the repo.
