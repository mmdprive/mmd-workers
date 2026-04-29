# Worker Boundaries

Canonical responsibilities:

- `admin-worker` = dashboard facade / read model
- `payments-worker` = payment truth
- `events-worker` = session lifecycle truth
- `chat-worker` = client-facing concierge / direct assistance
- `api-worker` = public proxy layer
- `telegram-worker` = internal-only messaging

Rules:

- frontend must not call truth workers directly
- `/dashboard` remains the single real dashboard
- client lane and model/apply lane remain separated
- Kenji remains the continuity layer for client-facing flow
- TarT must not be used as the front-facing guide in the client purchase flow
