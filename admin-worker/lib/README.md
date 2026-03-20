# ai-worker

Lean Cloudflare Worker skeleton for MMD Concierge AI.

## Routes
- GET /v1/ai/health
- POST /v1/ai/extract-preferences
- POST /v1/ai/match
- POST /v1/ai/reply

## Setup
1. Install deps
2. Set secret: `wrangler secret put INTERNAL_TOKEN`
3. Run: `npm run dev`

## Notes
- Rule-based v1
- Designed to be called by chat-worker/admin-worker
- Does not access Airtable directly in v1
