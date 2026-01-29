realtime-worker — LOCK v2026-LOCK-RT-01

Deploy (macOS):
1) cd realtime-worker
2) wrangler login
3) wrangler secret put INTERNAL_TOKEN
4) wrangler deploy

Test:
- curl https://<your-realtime-worker>.workers.dev/health

Open room (internal):
curl -X POST https://<your-realtime-worker>.workers.dev/v1/rt/room/open \
  -H "X-Internal-Token: <INTERNAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"job_id":"JOB-TEST-001"}'

Then connect WebSocket:
wss://<your-realtime-worker>.workers.dev/v1/rt/ws?room=room:JOB-TEST-001&token=<token-from-open>

Message examples:
{"type":"chat","text":"hi"}
{"type":"location","lat":13.7563,"lng":100.5018}
