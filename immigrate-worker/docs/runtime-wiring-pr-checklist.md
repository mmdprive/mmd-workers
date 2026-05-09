# Runtime Wiring PR Checklist

Issue: #32

Target endpoint:

```http
POST /sigil/admin/models/promote-immigration
```

## Patch target

```txt
immigrate-worker/src/index.ts
```

## Checklist

- [ ] Add import:

```ts
import {
  maybeHandleModelPromoteImmigrationRoute,
} from "./lib/model-promote-immigration-route";
```

- [ ] Add route block after `pathname` exists and before generic fallback handlers:

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

- [ ] Run build/typecheck for `immigrate-worker`.
- [ ] Deploy `immigrate-worker`.
- [ ] Smoke test endpoint.
- [ ] Close #32 after successful smoke test.

## Smoke test

```bash
curl -X POST "https://sigil.mmdbkk.com/sigil/admin/models/promote-immigration" \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_id": "recXXXXXXXXXXXXXX",
    "promoted_by": "per"
  }'
```
