# immigrate-worker

Repo location:
- `workers/immigrate-worker`

MVP migration layer for Control Room.

This worker is part of the migration bridge only. It ingests legacy LINE identity data, preserves migration traceability, and can promote into canonical Airtable records without redefining core production truth.

Canonical routes:
- `GET /ping`
- `GET /v1/immigrate/health`
- `POST /v1/immigrate/line/preview`
- `POST /v1/immigrate/line/intake`
- `POST /v1/admin/create-job`
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
- `POST /internal/jobs/create-job`
- `POST /internal/jobs/create-links`
- `POST /internal/jobs/private-profile-import`

LINE client intake defaults:
- default canonical target is `Clients`
- default target table env is `AIRTABLE_TABLE_CLIENTS=Clients`
- optional sensitive profile table env is `AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES` and the current default points to Airtable `Internal Notes`
- default models table env is `AIRTABLE_TABLE_MODELS=tblI4B0bI446vp9GX`
- default lookup order is `line_user_id`, `email`, then `Phone Number`
- default field mapping uses current `Clients` fields:
- `Client Name`
- `nickname`
- `mmd_client_name`
- `line_user_id`
- `line_display_name`
- `email`
- `Phone Number`
- `source`
- `primary_channel`
- `notes_raw`
- `Status`
- new client defaults are `source=line`, `primary_channel=line`, `Status=Active`
- `Clients.line_id` is not assumed by default
- raw legacy `line_id` is preserved in `notes_raw`
- if you explicitly configure `AIRTABLE_CLIENT_FIELD_LINE_ID`, the worker will also write `line_id` to that custom field

Migration trace rules:
- legacy inference stays in `notes_raw`, not canonical entitlement fields
- `notes_raw` preserves raw legacy tags, inferred base membership, inferred badge tier, inferred member since, raw `line_id`, operator summary, manual note, and original payload snapshot
- legacy inference rules remain:
- nickname containing `lite` infers base membership `standard`
- otherwise `#client`, `#purchased`, and `#mem...`-style legacy signals infer base membership `premium`
- `-vip-` infers badge tier `vip`
- `-svip-` infers badge tier `svip`
- `#mem2025`, `#mem25`, and `#memFeb26` infer member-since hints

Inbox sync defaults:
- migration inbox writes go to Airtable table `MMD — Console Inbox`
- default select values are `source=line`, `intent=upsert_member`, `status=new`
- invalid scaffold defaults such as `line_official` and `immigration_intake` are no longer used for the migration intake path

Operational notes:
- `POST /v1/immigrate/line/preview` returns `target_table`, `lookup_strategy`, a `migration_trace` summary, and the projected `Clients` record fields
- `POST /v1/immigrate/line/intake` performs the `Clients` upsert and writes a migration inbox record when Airtable sync is enabled
- `POST /v1/admin/create-job` is the canonical admin facade for `Airtable -> promote member -> generate customer/model links -> Telegram`
- `POST /internal/jobs/create-job` is an alias of the same flow for admin/control-room callers
- `POST /internal/jobs/private-profile-import` upserts sensitive model/profile notes into a dedicated Airtable table when `AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES` is configured
- `POST /internal/jobs/model-history-import` now also emits `private_profiles` summary rows and will upsert them automatically when `AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES` is configured
- private profile imports now also back-link `Internal Notes -> Related Client` and, when a model record is found, link `Models.Internal Notes` directly to the imported note record
- `POST /v1/immigration/intake` and `POST /v1/immigration/promote` remain the older promotion-layer scaffolds
- when `ADMIN_WORKER_BASE_URL` is configured, `promote` forwards to `admin-worker /v1/admin/members/promote-immigration`
- without `ADMIN_WORKER_BASE_URL`, `promote` falls back to a local projected response
- accepts either `Authorization: Bearer <INTERNAL_TOKEN>` or `X-Internal-Token: <INTERNAL_TOKEN>`
- line inbox reads from Airtable when `AIRTABLE_API_KEY` is configured; otherwise it falls back to seed data
- sessions read from `REALTIME_SESSIONS_URL` when configured, otherwise from Airtable sessions table when available, otherwise seed data
- logs and sessions can use placeholder responses if upstream services are not configured yet
- set `CREATE_LINKS_URL` to an exact upstream endpoint for confirmation-link creation
- legacy fallback: set `JOBS_WORKER_BASE_URL` to proxy create-link requests to jobs-worker
- set `REALTIME_SESSIONS_URL` to proxy session reads to a real live-session endpoint when available
- when `ENABLE_AIRTABLE_SYNC=false`, sync and line-intake writes return mock results
- when `CREATE_LINKS_URL` points to `payments-worker /v1/confirm/link`, `POST /internal/jobs/create-links` supports a simplified booking payload without `opt1/opt2/opt3`

Client field override env vars:
- `AIRTABLE_CLIENT_FIELD_CLIENT_NAME`
- `AIRTABLE_CLIENT_FIELD_NICKNAME`
- `AIRTABLE_CLIENT_FIELD_MMD_CLIENT_NAME`
- `AIRTABLE_CLIENT_FIELD_LINE_USER_ID`
- `AIRTABLE_CLIENT_FIELD_LINE_DISPLAY_NAME`
- `AIRTABLE_CLIENT_FIELD_EMAIL`
- `AIRTABLE_CLIENT_FIELD_PHONE_NUMBER`
- `AIRTABLE_CLIENT_FIELD_SOURCE`
- `AIRTABLE_CLIENT_FIELD_PRIMARY_CHANNEL`
- `AIRTABLE_CLIENT_FIELD_NOTES_RAW`
- `AIRTABLE_CLIENT_FIELD_STATUS`
- `AIRTABLE_CLIENT_FIELD_LINE_ID`

Lookup override env vars:
- `AIRTABLE_CLIENT_LOOKUP_FIELD_LINE_USER_ID`
- `AIRTABLE_CLIENT_LOOKUP_FIELD_EMAIL`
- `AIRTABLE_CLIENT_LOOKUP_FIELD_PHONE_NUMBER`
- `AIRTABLE_CLIENT_LOOKUP_FIELD_LINE_ID`

Simplified booking payload for `POST /internal/jobs/create-links`:
- required: `client_name`, `model_name`, `job_type`, `job_date`, `start_time`, `end_time`, `location_name`, `amount_thb`
- optional: `google_map_url`, `payment_type` (defaults to `deposit`), `payment_method` (defaults to `promptpay`), `note`, `confirm_page`, `model_confirm_page`
- recommended `job_type` for this flow: `private_vip`

Canonical create-job payload for `POST /v1/admin/create-job` or `POST /internal/jobs/create-job`:
- required: `manual_note_raw`
- recommended: `display_name`, `line_user_id`, `email`, `phone`, `model_name`, `model_record_id`
- response contract: `create_job_v1`
- key response fields: `data.promotion`, `data.links`, `data.telegram`, `data.airtable`, `data.artifacts`

Production checklist:
- set secret `INTERNAL_TOKEN`
- set secret `AIRTABLE_API_KEY`
- change `ENABLE_AIRTABLE_SYNC` to `"true"` in `wrangler.toml` or via environment-specific vars
- verify `AIRTABLE_TABLE_CLIENTS` points to `Clients` unless you intentionally override the canonical target
- set `AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES` if you want sensitive immigrate notes stored separately from `Clients`
- verify `AIRTABLE_TABLE_MODELS` points to `Models` if you want automatic model note linking
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
