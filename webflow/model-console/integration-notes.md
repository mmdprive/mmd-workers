# Model Console Integration Notes

## Purpose

These files are experience-layer assets for Webflow on `/model/console`.

They do not redefine worker contracts.
They assume the browser receives a signed short-lived reference in `?t=...` and talks only to controlled facade routes.

## Runtime boundaries

This bundle is UI documentation plus experience-layer page code only.

- Webflow renders the interface and sends controlled actions
- Airtable remains the source of truth through workers
- worker contracts stay authoritative
- browser code must stay outside truth-worker internals
- production logic must not move into Webflow

## Asset bundle

- `model-console.html`: Webflow embed markup that links the published `/ui/model-console` runtime assets
- `model-console.css`: Source stylesheet published at `/ui/model-console/model-console.css`
- `model-console.js`: Source controller published at `/ui/model-console/model-console.js`

Keep the runtime paths stable in Webflow:

- `/ui/model-console/model-console.css`
- `/ui/model-console/model-console.js`

Suggested location in this repo:

- [webflow/model-console/model-console.html](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/webflow/model-console/model-console.html)
- [webflow/model-console/model-console.css](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/webflow/model-console/model-console.css)
- [webflow/model-console/model-console.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/webflow/model-console/model-console.js)

## Core rule

Keep browser code on the experience side.

- Do not send `X-Confirm-Key` from Webflow
- Do not call truth workers directly from the browser
- Do not use `token` as the signed reference field in the page flow
- Use `t` as the canonical signed reference on all frontend-facing routes
- Keep Airtable as the truth source through worker-owned reads and writes

This matches the current boundary doctrine in [shared/src/contracts/worker-boundaries.md](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/shared/src/contracts/worker-boundaries.md).

## Current repo reality

The existing worker contracts in this repo matter more than UI labels.

- `events-worker` already exposes `POST /v1/model/console/event`, but it requires `X-Confirm-Key`
- `events-worker` hard-gates `work_started` until `final_payment_confirmed` exists in the event history
- `realtime-worker` already exposes `POST /v1/rt/room/open` and `GET /v1/rt/ws`
- `core/api-worker` exists only as a proxy scaffold today and is not wired yet

Relevant files:

- [events-worker/src/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/events-worker/src/index.js)
- [core/realtime-worker/src/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/core/realtime-worker/src/index.js)
- [core/api-worker/src/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/core/api-worker/src/index.js)

Because of that, the Webflow UI should call facade routes such as `/api/model/console/*`, not the truth routes above.

## Worker mapping

Use these responsibilities when composing the facade:

### `events-worker`

Owns lifecycle truth and state progression.

- update session state
- record model acknowledgement
- receive finish-job related state transitions only if that concept is part of the backend truth model
- move sessions into canonical review flow

### `realtime-worker`

Owns live operational state.

- GPS and ETA fanout
- last location ping
- room state
- websocket state

### `admin-worker`

Owns profile/read-model truth for model-facing summary.

- model profile
- work categories
- visibility
- rates
- client budget levels
- console summary composition if you choose to wire it here

### `payments-worker`

Owns payment and payout truth.

- final payment confirmation
- payout pending
- review-before-payout signals
- gate before `work_started`

## Experience label mapping

The UI deliberately separates experience labels from truth names where needed.

| Experience label | Current truth mapping in repo | Notes |
| --- | --- | --- |
| `assigned` | `confirmed` or assigned summary state | Summary/facade concern |
| `on_the_way` | `en_route` | `events-worker` already normalizes this alias |
| `arrived` | `arrived` | direct |
| `met` | `met` | direct |
| `final_payment_pending` | `final_payment_pending` | direct |
| `final_payment_confirmed` | `final_payment_confirmed` | reflect from payments truth, not browser guesswork |
| `work_started` | `work_started` | must stay gated |
| `work_finished` | `work_finished` | direct |
| `separated` | `separated` | direct |
| `finish_job_submitted` | experience-only facade action unless backend adds truth support | do not pretend this is canonical if it is not |
| `review_pending` | `review` | experience label for the current canonical review stage |

## Recommended facade routes

These are frontend-safe routes. They are not new truth contracts.
They are the proxy layer that Webflow should call with `?t=...`.

### `GET /api/model/console/summary?t=...`

Returns the composed view model for the page.

Suggested shape:

```json
{
  "ok": true,
  "summary": {
    "model": {
      "display_name": "TarT Select",
      "visibility": "Visible",
      "categories": ["Dinner", "Host"],
      "rate_label": "THB 12,000 base",
      "budget_levels": ["Premium"]
    },
    "session": {
      "job_id": "JOB-123",
      "session_id": "SES-123",
      "client_name": "Private Client",
      "schedule_label": "Tonight · 20:30",
      "venue_label": "Sukhumvit / Private Lounge",
      "state": "on_the_way",
      "truth_state": "en_route",
      "note": "Proceed to lobby and keep ETA live."
    },
    "payment": {
      "label": "Final payment pending",
      "detail": "Start Work remains locked until payments truth confirms clearance.",
      "final_payment_confirmed": false,
      "payout_status": "Awaiting review"
    },
    "live": {
      "eta_text": "18 min",
      "last_ping_label": "1 min ago",
      "room_state": "open",
      "websocket_state": "connected",
      "ws_url": "wss://..."
    },
    "finish_job": {
      "submitted": false,
      "checklist": [
        "Client separated safely",
        "Room state checked"
      ]
    }
  }
}
```

### `POST /api/model/console/action?t=...`

Receives a controlled model-side action and forwards server-side as needed.

Suggested body:

```json
{
  "action": "arrived",
  "event": "arrived",
  "job_id": "JOB-123",
  "session_id": "SES-123",
  "eta_text": "At the lobby",
  "source_surface": "webflow_model_console"
}
```

Server-side behavior:

- validate the signed `t`
- validate the session/model binding
- enforce allowed next actions
- if appropriate, forward to `events-worker` with `X-Confirm-Key`
- never trust the browser to confirm payment truth

### `POST /api/model/console/location?t=...`

Receives browser geolocation and bridges it into `realtime-worker` or a signed live room flow.

Suggested body:

```json
{
  "lat": 13.736,
  "lng": 100.56,
  "accuracy": 18,
  "eta_text": "12 min",
  "source_surface": "webflow_model_console"
}
```

### `POST /api/model/console/finish-job?t=...`

Receives closeout notes and checklist data.

Suggested body:

```json
{
  "action": "finish_job_submitted",
  "job_id": "JOB-123",
  "session_id": "SES-123",
  "notes": "Client separated safely. No payout blockers.",
  "checklist": [
    { "label": "Client separated safely", "checked": true }
  ],
  "source_surface": "webflow_model_console"
}
```

Important:

- if backend truth does not currently model `finish_job_submitted`, keep this as a facade concern
- the facade may then move the session into canonical `review` when business rules are satisfied

## Why the UI does not call workers directly

`events-worker/src/index.js` currently requires `X-Confirm-Key` for `POST /v1/model/console/event`.
That is an internal/trusted write path, not a browser path.

The Webflow page should never embed that secret.

The same applies to any internal room-open route or payment-truth write.

## Using `t`

Frontend-safe rule:

- page URL: `/model/console?t=...`
- summary fetch: `/api/model/console/summary?t=...`
- action write: `/api/model/console/action?t=...`
- location share: `/api/model/console/location?t=...`

Do not rename this to `token` in the Webflow page flow.

If a lower-level worker still uses another field internally, translate that server-side in the facade.

## Webflow wiring

### CSS

Paste `model-console.css` into Page Settings -> `Inside Head`.

### HTML

Paste `model-console.html` into a Webflow `Embed` element on `/model/console`.

### JS

Paste `model-console.js` before `</body>` or in a final Embed near the bottom of the page.

## Embedded config

The HTML file includes a JSON config block.
Update those URLs to the facade routes you actually deploy.

Fields:

- `summary_url`
- `action_url`
- `location_url`
- `finish_url`
- `poll_ms`
- `seed`

The `seed` object is safe for editor preview and fallback mode.

## Suggested next backend step

If you want this UI live against production workers, the safest next move is:

1. Wire frontend-safe `/api/model/console/*` routes in `core/api-worker` or another facade layer.
2. Validate signed `t` there.
3. Fan out server-side to `admin-worker`, `payments-worker`, `events-worker`, and `realtime-worker`.
4. Keep `events-worker` and `payments-worker` as truth, not as direct browser targets.

That preserves the repo's current architecture and keeps Webflow in the rendering/orchestration role only.
