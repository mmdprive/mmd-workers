# immigrate-worker

Repo location:
- `workers/immigrate-worker`

MVP migration layer for Control Room.

Canonical routes:
- `GET /v1/immigrate/health`
- `GET /v1/immigrate/line-inbox`
- `POST /v1/immigrate/line-inbox/refresh-status`
- `POST /v1/immigrate/line-inbox/sync-airtable`
- `POST /v1/immigration/intake`
- `POST /v1/immigration/promote`
- `GET /v1/immigration/:id`

Control Room compatibility routes:
- `GET /internal/admin/control-room/health`
- `GET /internal/admin/control-room/line-inbox`
- `POST /internal/admin/control-room/refresh-status`
- `POST /internal/admin/control-room/sync-airtable`
- `GET /internal/admin/control-room/logs`
- `GET /internal/admin/control-room/sessions/live`
- `POST /internal/admin/control-room/sessions/refresh`
- `POST /internal/jobs/create-links`

Notes:
- `intake` and `promote` are promotion-layer v1 scaffolds aligned with the big-bang immigration rule lock
- when `ADMIN_WORKER_BASE_URL` is configured, `promote` forwards to `admin-worker /v1/admin/members/promote-immigration`
- without `ADMIN_WORKER_BASE_URL`, `promote` falls back to a local projected response
- accepts either `Authorization: Bearer <INTERNAL_TOKEN>` or `X-Internal-Token: <INTERNAL_TOKEN>`
- line inbox reads from Airtable when `AIRTABLE_API_KEY` is configured; otherwise it falls back to seed data
- sessions read from `REALTIME_SESSIONS_URL` when configured, otherwise from Airtable sessions table when available, otherwise seed data
- logs and sessions can use placeholder responses if upstream services are not configured yet
- `sync-airtable` writes migration payloads into Airtable table `MMD — Console Inbox`
- set `CREATE_LINKS_URL` to an exact upstream endpoint for confirmation-link creation
- legacy fallback: set `JOBS_WORKER_BASE_URL` to proxy create-link requests to jobs-worker
- set `REALTIME_SESSIONS_URL` to proxy session reads to a real live-session endpoint when available
- when `ENABLE_AIRTABLE_SYNC=false`, sync route returns mock sync results
- when `CREATE_LINKS_URL` points to `payments-worker /v1/confirm/link`, `POST /internal/jobs/create-links` supports a simplified booking payload without `opt1/opt2/opt3`

Simplified booking payload for `POST /internal/jobs/create-links`:
- required: `client_name`, `model_name`, `job_type`, `job_date`, `start_time`, `end_time`, `location_name`, `amount_thb`
- optional: `google_map_url`, `payment_type` (defaults to `deposit`), `payment_method` (defaults to `promptpay`), `note`, `confirm_page`, `model_confirm_page`
- recommended `job_type` for this flow: `private_vip`

Production checklist:
- set secret `INTERNAL_TOKEN`
- set secret `AIRTABLE_API_KEY`
- change `ENABLE_AIRTABLE_SYNC` to `"true"` in `wrangler.toml` or via environment-specific vars
- for the current account/zone, bind routes on `mmdbkk.com`
- keep `CREATE_LINKS_URL` pointed at `payments-worker` unless you intentionally replace that upstream
- set `REALTIME_SESSIONS_URL` to a real live sessions endpoint if you do not want placeholder session data
- set `JOBS_WORKER_BASE_URL` to your real jobs-worker base URL if you do not want mock create-link responses
- bind a route on a domain/zone you control and point Control Room traffic there

Deployment:
- bind this worker to a domain/zone you control, not directly to `*.webflow.io`
- current production routes:
- `mmdbkk.com/internal/admin/control-room*`
- `mmdbkk.com/internal/jobs*`

Smoke test:
- from `mmd-workers`, run `INTERNAL_TOKEN=... ./scripts/smoke-test-immigrate.sh`
- the smoke script now exercises `health -> intake -> promote -> get`

Netlify LINE webhook:
- scaffolded function: `netlify/functions/webhook.js`
- target URL after Netlify deploy: `https://<your-site>.netlify.app/.netlify/functions/webhook`
- required Netlify environment variables:
- `LINE_CHANNEL_SECRET`
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- optional: `AIRTABLE_SYNC_TABLE` (defaults to `MMD — Console Inbox`)
- optional: `LINE_CHANNEL_ACCESS_TOKEN` (required for auto-reply and fetching LINE profile names)
- optional: `LINE_AUTO_REPLY_ENABLED` (`false` by default)
- the function verifies `x-line-signature` and writes each LINE event into Airtable as a new inbox record
- only messages tagged with `#client` are marked as manual immigrate candidates and eligible for profile lookup / optional auto-reply
