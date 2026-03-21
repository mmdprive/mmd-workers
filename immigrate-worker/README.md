# immigrate-worker (production-hardening version)

Immigration/migration layer worker for MMD Privé. This worker is intentionally separate from `admin-worker` and must remain separate from core production responsibility.

## Design goals
- Separate bridge/migration concerns from core production workers.
- Keep channel-specific or legacy intake (LINE, imported client/session/payment data) inside immigration layer.
- Use `session_id` as canonical bridge key.
- Respect MMD flow distinction:
  - `Session Status` = session workflow
  - `status` = verification/membership flow
  - `payment_status` = payment tracking flow
- Respect business rule from MMD memory:
  - `public` / `standard` + `fixed` => auto-confirm allowed
  - `premium` / `vip` / `svip` / `blackcard` OR non-fixed pricing => approval required by Per first

## Routes
- `GET /health`
- `POST /v1/immigrate/line/inbox`
- `POST /v1/immigrate/client/upsert`
- `POST /v1/immigrate/session/upsert`
- `POST /v1/immigrate/payment-proof/create`
- `POST /v1/immigrate/session/status`

All POST routes require either:
- `Authorization: Bearer <INTERNAL_TOKEN>`
- or `X-MMD-Internal-Token: <INTERNAL_TOKEN>`

## Environment
### Secrets
- `AIRTABLE_API_KEY`
- `INTERNAL_TOKEN`

### Vars
- `AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg`
- `AIRTABLE_TABLE_CONSOLE_INBOX=MMD - Console Inbox`
- `AIRTABLE_TABLE_CLIENTS=Clients`
- `AIRTABLE_TABLE_SESSIONS=Sessions`
- `AIRTABLE_TABLE_PAYMENT_PROOFS=MMD - Payment Proofs`
- `AIRTABLE_TABLE_ACTIVITY_LOGS=Activity Logs`
- `TELEGRAM_WORKER_BASE_URL=https://telegram-worker....workers.dev`
- `TELEGRAM_CHAT_ID=-1003546439681`
- `TG_THREAD_CONFIRM=61`
- `IMMIGRATE_WRITE_ENABLED=true`

## Install
```bash
npm install
npx wrangler secret put AIRTABLE_API_KEY
npx wrangler secret put INTERNAL_TOKEN
npx wrangler dev
```

## Example requests
### health
```bash
curl http://127.0.0.1:8787/health
```

### session upsert
```bash
curl -X POST http://127.0.0.1:8787/v1/immigrate/session/upsert \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_demo_001",
    "session_status": "Pending",
    "verification_status": "notified",
    "payment_status": "pending",
    "customer_telegram_username": "clientdemo",
    "model_telegram_username": "modeldemo"
  }'
```

### session status decision flow
```bash
curl -X POST http://127.0.0.1:8787/v1/immigrate/session/status \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "sess_demo_001",
    "model_tier": "premium",
    "price_mode": "approval",
    "notify_telegram": true,
    "note": "Needs Per approval before confirmation"
  }'
```

## Deployment
```bash
npx wrangler deploy
```

## Notes
- This worker is not the canonical admin surface.
- Do not move membership/admin business logic into this worker.
- This worker is safe for migration bridges, legacy intake, and sync/upsert tasks.
