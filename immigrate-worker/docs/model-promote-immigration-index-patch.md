# Model Promote Immigration: index.ts wiring patch

This patch wires the model immigration promotion route into `immigrate-worker/src/index.ts` without changing existing route semantics.

## 1) Add import near other local lib imports

```ts
import {
  maybeHandleModelPromoteImmigrationRoute,
} from "./lib/model-promote-immigration-route";
```

Recommended placement: after existing imports from `./lib/invite` or before `./lib/response`.

## 2) Add route check inside the main fetch handler

Place this after `const pathname = url.pathname;` is available and before broader fallback/404 handlers.

```ts
const modelPromotionResponse = await maybeHandleModelPromoteImmigrationRoute(
  request,
  env,
  pathname,
);

if (modelPromotionResponse) {
  return modelPromotionResponse;
}
```

## 3) Endpoint contract

```http
POST /sigil/admin/models/promote-immigration
Authorization: Bearer <INTERNAL_TOKEN>
Content-Type: application/json
```

Minimum body:

```json
{
  "draft_id": "recXXXXXXXXXXXXXX",
  "promoted_by": "per"
}
```

Alternative body:

```json
{
  "source_record_id": "line_or_form_source_id",
  "model_name": "Model Name",
  "promoted_by": "per"
}
```

## 4) Expected response

```json
{
  "ok": true,
  "data": {
    "contract_version": "model_promote_immigration_v1",
    "draft_id": "recXXXXXXXXXXXXXX",
    "model_record_id": "recYYYYYYYYYYYYYY",
    "model_name": "Model Name",
    "promotion_status": "promoted",
    "promoted_at": "2026-05-09T00:00:00.000Z",
    "promoted_by": "per",
    "mode": "airtable",
    "activity_log_record_id": "recZZZZZZZZZZZZZZ"
  }
}
```

## 5) Required env vars

Existing locked vars:

```txt
AIRTABLE_API_KEY
AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg
AIRTABLE_TABLE_MODELS=tblcatsmzAT5nKqIn
AIRTABLE_TABLE_ACTIVITY_LOGS=tblbUWRoFL6OI6QMJ
INTERNAL_TOKEN
CONFIRM_KEY optional
```

New optional vars:

```txt
AIRTABLE_TABLE_MODEL_DRAFTS=models/draft
AIRTABLE_MODEL_DRAFT_FIELD_SOURCE_RECORD_ID=source_record_id
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTION_STATUS=promotion_status
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_MODEL_ID=promoted_model_id
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_AT=promoted_at
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_BY=promoted_by
```

Optional Models field overrides:

```txt
AIRTABLE_MODEL_FIELD_MODEL_NAME=Model Name
AIRTABLE_MODEL_FIELD_PHONE=Phone Number
AIRTABLE_MODEL_FIELD_LINE_USER_ID=line_user_id
AIRTABLE_MODEL_FIELD_LINE_ID=line_id
AIRTABLE_MODEL_FIELD_TELEGRAM_USERNAME=telegram_username
AIRTABLE_MODEL_FIELD_AGE=Age
AIRTABLE_MODEL_FIELD_CONSENT_STATUS=consent_status
AIRTABLE_MODEL_FIELD_VERIFICATION_STATUS=verification_status
AIRTABLE_MODEL_FIELD_SOURCE=source
AIRTABLE_MODEL_FIELD_NOTES_RAW=notes_raw
```

## 6) Smoke test

```bash
curl -X POST "https://sigil.mmdbkk.com/sigil/admin/models/promote-immigration" \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_id": "recXXXXXXXXXXXXXX",
    "promoted_by": "per"
  }'
```

## 7) Rollback

Remove the import and the `maybeHandleModelPromoteImmigrationRoute` block from `index.ts`. The standalone logic files can remain safely unused.
