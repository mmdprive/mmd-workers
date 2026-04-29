# shared/src/lib

Common library surface for worker-safe shared code.

Initial focus:
- `field-mapping/`
- `http/`
- `response/`
- `auth/`
- `cors/`
- `session/`
- `tokens/`
- `airtable/`
- `telegram/`

Extract only stable helpers first. Do not move worker-specific business logic here prematurely.
