# Model Console Production Slice: Lock Flow + Telegram Auto Notify + Client View

Status: proposed production slice
Branch: ui/model-console-live-polish

## Scope

This slice connects the Webflow model console to the canonical events-worker flow. The model console may request state changes, send live location updates, and send ETA/delay events. The events-worker remains the source of truth and must validate the flow before writing to Airtable or notifying any channel.

## Core route

`POST /v1/model/console/event`

Required body fields:

- `t` canonical token parameter, when available
- `session_id` or `job_id`
- `event`
- `source=model_console`
- optional `lat`, `lng`, `accuracy`, `live_map_url`, `eta_text`, `note`
- optional `idempotency_key`

## Locked state flow

Canonical main timeline:

`confirmed -> en_route -> arrived -> met -> final_payment_pending -> final_payment_confirmed -> work_started -> work_finished -> separated -> review -> payout`

Hard rules:

- `arrived` requires `en_route`
- `met` requires `arrived`
- `work_started` requires `final_payment_confirmed`
- `work_finished` requires `work_started`
- `separated` requires `work_finished`

Side events do not mutate the primary status unless explicitly mapped later:

- `live_location_update`
- `eta_sent`
- `delay_reported`
- `live_location_stopped`

## Telegram notify rules

Use existing events-worker optional Telegram dispatch environment:

- `TELEGRAM_WORKER_BASE_URL`
- `INTERNAL_TOKEN`

Notify audiences:

- Client-facing: clean, non-internal wording. No raw debug, no client intel, no private model notes.
- Admin-facing: include job/session ids and raw operational details where useful.

Recommended messages:

- `en_route`: model has started traveling, ETA if available, map link if available.
- `eta_sent`: latest ETA update.
- `delay_reported`: polite delay notice with last update time.
- `arrived`: model has arrived near the meeting point.
- `met`: model and client have met; proceed with confirmation checks.

## Client view contract

Suggested route:

`/sigil/client/session?t=...`

Client-safe states:

- Preparing
- On the way
- ETA updated
- Arrived
- Met
- Session started
- Session finished

Never expose:

- internal notes
- TarT/model private brief
- client intel
- raw payment debug
- raw precise lat/lng unless explicitly approved

## Source-of-truth rule

Frontend asks. Backend validates. Airtable records. Telegram notifies. Client view reads safe state.

Frontend must never be treated as the source of truth.
