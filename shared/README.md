# Shared

This folder is reserved for code shared across workers without redefining worker authority.

Allowed contents:
- transport helpers
- auth primitives
- response helpers
- token utilities
- session helpers
- Airtable field mapping helpers
- shared contracts and constants

Not allowed:
- business truth that belongs to a specific worker
- migration-only adapters
- public UI code
