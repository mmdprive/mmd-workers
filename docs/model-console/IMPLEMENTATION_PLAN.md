# Model Console End-to-End Implementation Plan

Requested scope: build all remaining production pieces.

## Deliverables in this branch

1. `events-worker/src/model-console-contract.js`
   - canonical event names
   - locked flow validation
   - side-event classification
   - safe client view projection
   - telegram message builders

2. `client-view/sigil-client-session.html`
   - lightweight client-facing session status page
   - reads `/v1/client/session/status?t=...`
   - hides internal model/client-intel data

3. `docs/model-console/LOCK_FLOW_TELEGRAM_CLIENT_VIEW.md`
   - production contract

## Integration notes

The existing `events-worker/src/index.js` currently needs a cleanup pass before direct patching because the file contains duplicate payment routes and an apparent merge marker near the bottom. To avoid breaking the production worker, this branch adds a clean contract module and client page first. The next safe backend step is to import the contract module into events-worker and add:

- `POST /v1/model/console/event`
- `GET /v1/client/session/status?t=...`

## Required backend route behavior

`POST /v1/model/console/event`:

- require auth by confirm key or validated `t`
- find job/session
- parse existing `events_json`
- validate locked flow
- append event
- patch Airtable `events_json`, `status`, `last_update_at`
- send Telegram notify via existing `tgInternalSend`

`GET /v1/client/session/status?t=...`:

- validate `t`
- find job/session
- project only safe client fields
- return current public state, ETA, map link if approved, and last update

## Production warning

Do not treat frontend state as source of truth. The model console only requests transitions. The events-worker decides whether the transition is allowed.
