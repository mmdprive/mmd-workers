# chat-worker-ai-integration

Example Cloudflare Worker project showing how `chat-worker` can call `ai-worker`
and `admin-worker` to:
- extract preferences from a client message
- fetch lean model cards
- shortlist matches
- draft a concierge reply
- notify Per on Telegram when review is required

## Routes

- `GET /v1/chat/health`
- `POST /v1/chat/incoming`

## Expected upstream services

### ai-worker
- `POST /v1/ai/extract-preferences`
- `POST /v1/ai/match`
- `POST /v1/ai/reply`

### admin-worker
- `GET /v1/admin/models/list-lite`

## Local development

```bash
npm install
wrangler secret put INTERNAL_TOKEN
wrangler dev
```

## Example request

```bash
curl -X POST http://127.0.0.1:8787/v1/chat/incoming \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "cli_123",
    "clientTier": "premium",
    "messageText": "Tonight at Four Seasons. I want someone tall, confident, good English. Budget around 40k.",
    "channel": "web"
  }'
```
