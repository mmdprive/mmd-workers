# Core

This folder is reserved for canonical production workers and production-facing runtime boundaries.

Rules:
- `admin-worker` = dashboard facade / read model
- `payments-worker` = payment truth
- `events-worker` = session lifecycle truth
- `chat-worker` = client-facing concierge / direct assistance
- `telegram-worker` = internal messaging only
- `realtime-worker` = live coordination support
- `api-worker` = public proxy layer

Do not place migration bridges, legacy compatibility code, or experimental chat variants here.
