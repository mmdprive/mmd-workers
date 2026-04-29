# chat-worker-ai-integration

Public AI chat gateway for MMD SĪGIL.

Phase 1A adds the Telegram direct-chat adapter for **Per AI**. `chat-worker`
owns public AI chat behavior; `telegram-worker` remains internal/system
notification only.

## Routes

- `GET /health`
- `POST /v1/chat/message`
- `POST /v1/chat/telegram/webhook`
- `GET /v1/chat/telegram/webhook-info`
- `POST /v1/chat/telegram/set-webhook`
- `POST /v1/chat/internal`

## Telegram adapter

`POST /v1/chat/telegram/webhook` receives Telegram updates, verifies
`X-Telegram-Bot-Api-Secret-Token` when `TELEGRAM_WEBHOOK_SECRET` is configured,
parses `message` and `callback_query`, and routes private direct chats to
Per AI.

Unsupported group/channel messages return a safe ignored response unless
`ALLOW_TELEGRAM_GROUP_CHAT=true`.

The bot must introduce itself as **Per AI**. Kenji is only an optional
client-facing persona layer inside Per AI, not the bot name.

`POST /v1/chat/telegram/set-webhook` is a protected operational helper for
registering the Telegram webhook from Worker-side secrets. It accepts
`X-Internal-Token` or `X-Telegram-Setup-Token`.

`GET /v1/chat/telegram/webhook-info` is protected by `X-Internal-Token` and
returns a redacted Telegram webhook status without exposing the bot token or
secret token.

## Normalized message handler

`POST /v1/chat/message` accepts normalized chat input:

```json
{
  "channel": "telegram",
  "assistant": "per_ai",
  "persona": "kenji",
  "language": "auto",
  "message": "Hello",
  "metadata": {
    "telegram_user_id": "123",
    "telegram_chat_id": "123"
  }
}
```

The response includes `reply` for compatibility plus a normalized `response`.

## AI provider

Phase 1A uses the configured model provider directly from `chat-worker`.
Set `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or use the default mock
provider for local smoke tests.

## Local development

```bash
npm install
wrangler secret put INTERNAL_TOKEN
wrangler secret put OPENAI_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler dev --config "wrangler 2.toml"
```

## Required env

`[vars]`

- `AI_WORKER_BASE_URL`
- `ADMIN_WORKER_BASE_URL`
- `ALLOWED_ORIGINS`
- `AI_PROVIDER`
- `OPENAI_MODEL`
- `TELEGRAM_RATE_LIMIT_PER_MINUTE`
- `ALLOW_TELEGRAM_GROUP_CHAT`

`[[kv_namespaces]]`

- `CHAT_SESSIONS_KV` (optional for web chat history and Telegram rate counters)

`secrets`

- `INTERNAL_TOKEN`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_SETUP_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TG_THREAD_CONFIRM`

Existing production aliases are also supported:

- `CHAT_BOT_TOKEN`
- `WEBHOOK_SECRET`

## Example request

```bash
curl -X POST http://127.0.0.1:8787/v1/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "telegram",
    "assistant": "per_ai",
    "language": "auto",
    "message": "Tonight at Four Seasons. I want someone tall, confident, good English. Budget around 40k.",
    "metadata": {
      "telegram_user_id": "123",
      "telegram_chat_id": "123"
    }
  }'
```
