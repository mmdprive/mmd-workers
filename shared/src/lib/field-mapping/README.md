# field-mapping

Canonical place for field-name and field-id mapping helpers shared across workers.

Primary use cases:
- Airtable field alias resolution
- canonical key mapping around `session_id`
- read/write compatibility during migration

This folder exists to reduce duplicated field mapping logic across `admin-worker`, `payments-worker`, `events-worker`, and `immigrate-worker`.
