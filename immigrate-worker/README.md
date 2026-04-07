# immigrate-worker

Migration-layer worker for bringing legacy LINE Official data into the canonical MMD system.

## What this worker does

- accepts LINE legacy intake payloads
- infers membership hints from nickname + legacy tags
- preserves raw migration trace through `admin-worker` inbox writer
- links to an existing canonical member when found
- creates a canonical member only when no match exists

## Important boundary

This worker belongs to the **Migration Layer**.
It must not become a hidden replacement for core production logic.

## Current endpoints

### `GET /ping`
Health check.

### `POST /v1/immigrate/line/preview`
Preview normalized inference without writing to Airtable.

### `POST /v1/immigrate/line/intake`
Run the full intake flow:
1. normalize legacy tags and nickname signals
2. write inbox trace to `admin-worker`
3. lookup canonical member by line/email/phone
4. create canonical member if absent

## Legacy inference rules

### Base membership
- nickname contains `lite` -> `standard`
- otherwise, if legacy member-like signals exist (`#client`, `#purchased`, `#mem...`) -> `premium`

### Badge tier
- `-vip-` -> `vip`
- `-svip-` -> `svip`

### Relationship flags
- `#client` -> prior membership/client relationship
- `#purchased` -> prior purchase/service history

### Membership start inference
Reads markers like:
- `#mem2025`
- `#memFeb26`
- `#mem25`

## Required env

```txt
ADMIN_WORKER_BASE_URL
CONFIRM_KEY
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
```

## Optional env overrides

```txt
ALLOWED_ORIGINS
CANONICAL_MEMBER_TABLE
CANONICAL_NAME_FIELD
CANONICAL_NICKNAME_FIELD
CANONICAL_CLIENT_NAME_FIELD
CANONICAL_LINE_ID_FIELD
CANONICAL_LINE_USER_ID_FIELD
CANONICAL_EMAIL_FIELD
CANONICAL_PHONE_FIELD
CANONICAL_LEGACY_TAGS_FIELD
CANONICAL_NOTES_FIELD
CANONICAL_STATUS_FIELD
CANONICAL_DEFAULT_STATUS
CANONICAL_BASE_MEMBERSHIP_FIELD
CANONICAL_BADGE_TIER_FIELD
CANONICAL_MEMBER_SINCE_FIELD
AIRTABLE_TABLE_MEMBERS
```

## Example payload

```json
{
  "display_name": "Jay -vip- #memFeb26",
  "nickname": "Jay lite 12/02/26 -vip- #memFeb26",
  "line_user_id": "Uxxxxxxxx",
  "line_id": "jay_line",
  "member_email": "jay@example.com",
  "member_phone": "0812345678",
  "legacy_tags": "#client,#purchased",
  "manual_note": "ลูกค้าเก่าจาก LINE OA"
}
```

## Response shape

```json
{
  "ok": true,
  "layer": "migration",
  "action": "linked_to_existing_member",
  "inbox_record_id": "rec...",
  "member": {
    "id": "rec...",
    "fields": {}
  },
  "inferred": {
    "base_membership": "standard",
    "badge_tier": "vip"
  }
}
```

## Recommended next steps

1. wire a worker route / deployment config for this folder
2. verify lookup field names against the current Airtable schema
3. test preview first
4. test intake against a known LINE legacy record
5. verify the inbox trace and canonical member result
