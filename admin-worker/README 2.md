# admin-worker-models-list-lite-example

Example Cloudflare Worker project exposing:

- `GET /v1/admin/health`
- `GET /v1/admin/models/list-lite`

This worker reads the `Models` Airtable table and returns only the lean fields needed by `ai-worker` and `chat-worker`.

## Required Airtable fields in `Models`

- working_name
- model_tier
- orientation_label
- height_cm
- body_type
- base_area
- vibe_tags
- best_for
- languages
- available_now
- availability_status
- minimum_rate_90m
- ai_match_summary
- requires_per_approval

## Secrets / Vars

```bash
wrangler secret put INTERNAL_TOKEN
wrangler secret put AIRTABLE_API_KEY
```

Set these in `wrangler.toml` or dashboard:
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_MODELS`

## Phase 1B Create Job

`POST /v1/admin/jobs/create-job` and `POST /internal/admin/jobs/create-job`
orchestrate the LINE Inbox create-job path:

1. Normalize LINE Inbox payload.
2. Build public/private job metadata.
3. Create the canonical session through the existing create-session flow.
4. Return customer/model confirmation links containing `?t=`.
5. Return LINE copy text and optionally push LINE when `push_line=true` and LINE push env is configured.
6. Notify `telegram-worker` through internal send only.

Optional LINE push configuration:

- `LINE_PUSH_URL` / `LINE_INTERNAL_PUSH_URL` for an internal push service
- or `LINE_CHANNEL_ACCESS_TOKEN` as a Worker secret for direct LINE push

## Example

```bash
curl -X GET http://127.0.0.1:8787/v1/admin/models/list-lite \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN"
```
