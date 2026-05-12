# Ad Context Ledger

## Purpose

The Ad Context Ledger captures safe context around LINE OA pricing inquiries so Per/Ewvon can price from the most likely ad, catalogue, member history, and request details without asking the customer to identify the model first.

This is not a model immigration pipeline. It does not create Airtable `Models` records, does not confirm availability, and does not send final prices automatically.

## Current Flow

1. LINE OA receives a pricing, rate, or image inquiry.
2. Kenji sends a short acknowledgement only.
3. The webhook writes the event to `MMD — Console Inbox`.
4. The webhook calls `POST /v1/admin/pricing/reviews/create`.
5. `admin-worker` builds safe member context and ad context.
6. `admin-worker` sends `[Pricing Review: Ad/Member Context]` to Per/Ewvon through Telegram.
7. Per/Ewvon approves or edits the final price.
8. Only the approval endpoint may send a final customer price, and it still must not confirm booking or model availability.

## Ledger Fields

- `line_user_id`
- `first_message_at`
- `last_message_at`
- `ad_platform`
- `campaign_id`
- `ad_set_id`
- `creative_id`
- `creative_code`
- `creative_code_type`: `GWs`, `EMs`, or `unknown`
- `card_set_id`
- `card_order`
- `catalogue_ref`
- `landing_ref`
- `utm_source`
- `utm_campaign`
- `utm_content`
- `model_candidates`
- `ad_copy_snapshot_safe`
- `image_or_card_ref_safe`
- `confidence`
- `source`: `line_payload`, `catalogue_link`, `manual_tag`, `telegram`, or `unknown`

For now these fields live in `payload_json` on Console Inbox / pricing review records. A dedicated Airtable table can be added later if volume or reporting needs it.

## Member Context

`buildMemberContextForLineUser(line_user_id, line_display_name)` returns safe aggregate metadata only:

- whether a Client or Member record was found
- safe tags and membership hints
- last catalogue or model card ref, if known
- previous price amounts as aggregates
- 30d/90d completed counts
- average spend
- risk hints
- recommended reply strategy

Raw private notes, full LINE notes, signed URLs, and private media are not returned to the customer or debug logs.

## Reply Strategy

Kenji must not ask `สนใจนายแบบคนไหนครับ` as the first response when ad context may exist.

If ad context exists, the acknowledgement says Kenji will check the item the customer is interested in.

If catalogue context exists, the acknowledgement references the catalogue.

If no context exists, the acknowledgement says Kenji will send the pricing request to Per/Ewvon and asks for date, time, zone, and duration.

None of these replies quote a final price.

## Timeout Guard

`PRICING_TIMEOUT_MINUTES=10` controls the timeout window.

`PRICING_TIMEOUT_SEND_TO_CUSTOMER=false` is the required default. On timeout, the system may calculate an internal provisional range and notify Per/Ewvon again. It must not send that range to the customer unless this flag is explicitly set to true and the guardrails pass.

Auto-send is blocked when:

- ad/model context is unknown
- customer risk flags exist
- sensitive behavior or ability is unclear
- model identity is uncertain

## Environment

- `PRICING_TIMEOUT_MINUTES=10`
- `PRICING_TIMEOUT_SEND_TO_CUSTOMER=false`
- `LINE_WEBHOOK_DEBUG=false`
- `PRICING_REVIEW_TELEGRAM_PER_ID`
- `PRICING_REVIEW_TELEGRAM_EWVON_ID`
- `TG_THREAD_PRICING_REVIEW`

If direct Per/Ewvon chat IDs are not configured, the worker falls back to the internal Telegram thread.

## Non-Goals

- Do not touch model immigration.
- Do not write Airtable `Models`.
- Do not confirm availability.
- Do not expose private notes, raw image contents, private media, signed URLs, or internal scoring.
- Do not deploy automatically from this documentation.
