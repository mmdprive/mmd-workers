# MMD Workers (Monorepo)

Workers:
- payments-worker: /v1/payments/notify
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
