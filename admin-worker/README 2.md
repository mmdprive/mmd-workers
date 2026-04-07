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

## Example

```bash
curl -X GET http://127.0.0.1:8787/v1/admin/models/list-lite \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN"
```
