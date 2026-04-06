# MMD Workers (Monorepo)

Workers:
- payments-worker: /v1/payments/notify, /v1/pay/verify, /v1/confirm/link, /pay/internal
- admin-worker: /v1/admin/*
- events-worker: /v1/rules/ack, /v1/points/threshold
- telegram-worker: /telegram/webhook (stub)

Deploy (Wrangler):
cd payments-worker && npx wrangler deploy
cd ../admin-worker && npx wrangler deploy
cd ../events-worker && npx wrangler deploy
cd ../telegram-worker && npx wrangler deploy

Important:
- Each worker has its own wrangler.toml
- No assets/site config (Worker only)
- `/pay/internal` is an internal-token compatibility alias on `payments-worker`.
- Use `action=verify` to route to `/v1/pay/verify` and `action=notify` to route to `/v1/payments/notify`.
