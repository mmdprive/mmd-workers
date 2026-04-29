# Member Dashboard Smoke Test

Last updated: 2026-04-18

Use this note to smoke test the canonical member dashboard endpoints on `admin-worker`.

## Base URL

Replace `<ADMIN_WORKER_BASE_URL>` with the deployed worker URL, for example:

- `https://admin-worker.<subdomain>.workers.dev`
- `https://mmdbkk.com`

## Required Query Param

All three endpoints require query param `t`.

Example:

```text
?t=<SIGNED_DASHBOARD_TOKEN>
```

## Endpoints

- `GET /api/member/dashboard`
- `GET /api/member/session/next`
- `GET /api/member/payments/summary`

## Quick Curl Smoke

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/dashboard?t=<SIGNED_DASHBOARD_TOKEN>"
```

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/session/next?t=<SIGNED_DASHBOARD_TOKEN>"
```

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/payments/summary?t=<SIGNED_DASHBOARD_TOKEN>"
```

## Mint Test Token

Use the admin-only helper to mint a signed dashboard token without touching the UI.

Requires either:

- `X-Confirm-Key: <CONFIRM_KEY>`
- or `Authorization: Bearer <ADMIN_BEARER or INTERNAL_TOKEN>`

Example:

```bash
curl -s -X POST "<ADMIN_WORKER_BASE_URL>/v1/admin/member/dashboard-test-token" \
  -H "Content-Type: application/json" \
  -H "X-Confirm-Key: <CONFIRM_KEY>" \
  -d '{
    "display_name": "QA Smoke Live",
    "email": "member@example.com",
    "expires_in_seconds": 1800
  }'
```

Expected shape:

```json
{
  "ok": true,
  "token": "<SIGNED_DASHBOARD_TOKEN>",
  "expires_at": "2026-04-18T17:27:47.000Z",
  "payload": {
    "kind": "customer_invite",
    "role": "customer",
    "lane": "customer_onboarding"
  },
  "urls": {
    "dashboard": "/api/member/dashboard?t=<SIGNED_DASHBOARD_TOKEN>",
    "next_session": "/api/member/session/next?t=<SIGNED_DASHBOARD_TOKEN>",
    "payments_summary": "/api/member/payments/summary?t=<SIGNED_DASHBOARD_TOKEN>"
  }
}
```

Notes:

- Use `email` when you want to smoke test a real member record from `members/list`
- Use `member_id` or `memberstack_id` only when you know the source tables carry that identifier
- If no source data is found, the dashboard should still return `ok: true` with safe empty/zero-state payloads

## Expected Success Shape

### 1. `GET /api/member/dashboard`

```json
{
  "ok": true,
  "member": {
    "member_id": "mem_001",
    "display_name": "Per",
    "full_name": "Per Spective",
    "username": "@malemodel.bkk",
    "identity": "mem_001 · @malemodel.bkk",
    "tier": "BLACK CARD",
    "status": "ACTIVE",
    "points": 1240,
    "avatar_letter": "P",
    "total_sessions": 12,
    "landing_status": "Landingpage active",
    "dashboard_status": "Dashboard verified",
    "concierge_status": "Kenji AI ready"
  },
  "kenji": {
    "mode": "demo"
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

### 2. `GET /api/member/session/next`

```json
{
  "ok": true,
  "session": {
    "session_id": "sess_001",
    "date": "2026-04-26T13:00:00.000Z",
    "date_label": "26 APR 2026",
    "name": "Private Evening Experience",
    "location": "Bangkok",
    "venue": "Private Venue",
    "time": "20:00",
    "meta": "Bangkok · Private Venue · 20:00",
    "payment_status": "verified",
    "payment_badge": "Deposit Verified",
    "reminder_status": "pending",
    "reminder_badge": "Awaiting Reminder",
    "toast_payment": "Deposit verified successfully.",
    "toast_reminder": "Reminder will be sent automatically."
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

Empty-state:

```json
{
  "ok": true,
  "session": {
    "date_label": "No upcoming session",
    "name": "No active session",
    "meta": "Private route available when a new session is created",
    "payment_badge": "No Payment Yet",
    "reminder_badge": "No Reminder Scheduled"
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

### 3. `GET /api/member/payments/summary`

```json
{
  "ok": true,
  "payments": {
    "total_amount": 15000,
    "paid_amount": 5000,
    "balance_amount": 10000,
    "verified_payments_count": 8,
    "currency": "THB"
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

Zero-state:

```json
{
  "ok": true,
  "payments": {
    "total_amount": 0,
    "paid_amount": 0,
    "balance_amount": 0,
    "verified_payments_count": 0,
    "currency": "THB"
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

## Expected Error Shape

### Missing Token

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/dashboard"
```

```json
{
  "ok": false,
  "error": {
    "code": "token_missing",
    "message": "Missing dashboard token.",
    "status": 400,
    "retryable": false
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

### Invalid Token

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/dashboard?t=bad.token.value"
```

```json
{
  "ok": false,
  "error": {
    "code": "token_invalid",
    "message": "This dashboard link is invalid.",
    "status": 401,
    "retryable": false
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

### Expired Token

```json
{
  "ok": false,
  "error": {
    "code": "token_expired",
    "message": "This dashboard link has expired.",
    "status": 410,
    "retryable": false
  },
  "meta": {
    "request_id": "req_xxx",
    "ts": "2026-04-18T00:00:00.000Z"
  }
}
```

## QA Checklist

- `dashboard` returns `member`, `kenji`, and `meta`
- `session/next` returns only one next upcoming session, not a historical list
- `session/next` returns the empty-state object when there is no upcoming session
- `payments/summary` returns totals only
- signed invite-style tokens minted by the admin helper are accepted by the public dashboard routes
- all failures return `ok: false`, structured `error`, and `meta`
- invalid and expired tokens are distinguishable

## Optional Pretty Print

If `jq` is available:

```bash
curl -s "<ADMIN_WORKER_BASE_URL>/api/member/dashboard?t=<SIGNED_DASHBOARD_TOKEN>" | jq
```
