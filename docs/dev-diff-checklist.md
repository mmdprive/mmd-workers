# Dev Diff Checklist — From Old Payments Spec to New Core-Aligned Spec

This checklist tracks the migration from the old payments-worker contract to the new core-aligned API contract.

---

## P0 — Must Fix First

### 1. Split endpoint semantics correctly
Confirm implementation uses:

- `POST /v1/pay/create` = create payment intent
- `POST /v1/pay/verify` = verify actual payment result
- `POST /v1/payments/notify` = provider/admin notify update path
- `POST /v1/admin/payments/override` = internal manual override

If payment intent creation still lives inside `/v1/pay/verify`,
move that logic to `/v1/pay/create` immediately.

---

### 2. Canonicalize `payment_ref`
Search the codebase and replace public/internal contract usage of:

- `transaction_ref` → `payment_ref`

Check:
- request body
- response body
- service layer
- Airtable write/read
- logs
- Telegram notifications

Goal:
- `payment_ref` = canonical everywhere
- `transaction_ref` = transitional alias only if unavoidable

If backward compatibility is still required:
- accept `transaction_ref` temporarily
- map it to `payment_ref` immediately
- do not use it as the main field any further

---

### 3. Canonicalize `amount_thb`
Search the codebase and replace:

- `amount` → `amount_thb`

Check:
- schema
- validation
- Airtable mapping
- service logic
- notifications
- tests

Goal:
- `amount_thb` = canonical field
- `amount` should not remain in the new public contract

---

## P1 — Align Payload Naming

### 4. Replace `status` with `payment_status` in payment context
Only for fields that refer to payment state.

Check:
- request/response payloads
- provider notify handler
- override handler
- DB/Airtable mapping
- logs

Note:
- package status and membership status can still use different fields
- payment layer must use `payment_status`

---

### 5. Replace `method` with `payment_method`
Check:
- create payment request
- internal objects
- Airtable mapping
- analytics/logging

Canonical field:
- `payment_method`

Supported values:
- `promptpay`
- `bank_transfer`
- `paypal_card`

---

### 6. Ensure `verification_status` exists through the full flow
Verify and notify paths must support:

- `pending`
- `verified`
- `rejected`

---

## P1 — Schema / Validation

### 7. Align `package_code` with core
Canonical values:
- `guest7`
- `standard`
- `premium`
- `blackcard`

If legacy codes still exist internally, map them internally only.
Do not expose legacy package codes in the new public contract unless explicitly intended.

---

### 8. Keep `payment_stage` transitional only
Check that new business logic does not depend on `payment_stage` as a primary field.

Allowed:
- internal routing
- backward compatibility

Not allowed:
- using it instead of `payment_type`
- using it instead of `package_code`
- building new features around it

---

### 9. Separate `payment_type` from `payment_stage`
Canonical `payment_type`:
- `deposit`
- `final`
- `full`
- `tips`

Do not use `membership` as a payment type.
Use `package_code` and routing logic for membership purchase flows.

---

## P1 — Airtable Mapping

### 10. Validate Payments table mapping
Implementation must write/read the correct Airtable fields:

- `Payment Reference`
- `Payment Date`
- `Amount`
- `Payment Status`
- `Payment Method`
- `Verification Status`
- `Package Code`
- `session_id`
- `payment_type`
- `provider`
- `provider_txn_id`

Important:
- Airtable display names may differ from payload keys
- code must have a clear mapping layer

---

### 11. Validate `member_packages` mapping
Use `payment_ref` as the main idempotency key.

Check:
- `member_email`
- `memberstack_id`
- `package_code`
- `status`
- `start_date`
- `end_date`
- `payment_ref`
- `source`

---

### 12. Validate Sessions mapping
Session bridge must keep contract integrity.

Check:
- `session_id`
- `memberstack_id`
- `package_code`
- `membership_action`
- `payment_ref`

---

## P2 — Idempotency / State Safety

### 13. Payment intent creation must be idempotent
Rules:
- repeated create intent must not create duplicate payments
- replay must return the same `payment_ref`

At minimum check by:
- `session_id`
- current routing context
- transitional `payment_stage` if still present

---

### 14. Payment verification must be idempotent by `payment_ref`
Rules:
- repeated verify must return safe success or predictable conflict
- do not write duplicate ledger
- do not repeat side effects

---

### 15. Membership apply must be idempotent by `payment_ref`
Rules:
- same payment must not apply package twice
- replay must return safe result
- mismatch between member/package must return `409`

---

### 16. Admin override must be idempotent and audited
Check:
- uses `payment_ref`
- requires `admin_reason`
- writes audit/activity log
- does not create duplicate ledger

---

## P2 — Response / Error Normalization

### 17. Use a consistent `ErrorResponse`
Minimum shape:
- `ok`
- `error`
- `message`
- `code`
- optional `details`

---

### 18. Use correct HTTP status codes
Check at minimum:
- `400` malformed request
- `401` unauthorized
- `404` payment/member not found
- `409` duplicate/conflict
- `422` validation/provider mismatch

---

## P2 — Backward Compatibility

### 19. Transitional alias plan
If old fields still exist:
- `transaction_ref`
- `amount`
- `status`
- `method`

Then:
- accept them only at adapter layer
- map immediately to canonical fields
- log warning
- do not let them pass deeper into the system

---

### 20. Transitional field deprecation note
Ensure docs/spec/comments clearly state:
- `payment_stage` is deprecated/transitional
- new integrations must use canonical fields

---

## P3 — Tests

### 21. Add the following minimum test cases
- create payment success
- create payment replay returns same `payment_ref`
- verify payment success
- verify payment duplicate
- verify payment not found
- membership apply success
- membership apply duplicate by `payment_ref`
- admin override success
- admin override duplicate
- notify with invalid `payment_ref`

---

### 22. Add contract tests between core spec and payments spec
Confirm these fields match across both:
- `session_id`
- `payment_ref`
- `package_code`
- `payment_type`
- `payment_status`
- `verification_status`
- `amount_thb`

---

## Definition of Done

Migration is complete when:

- no endpoint ambiguity remains between create vs verify
- no public contract uses `transaction_ref` as canonical
- no public contract uses `amount` instead of `amount_thb`
- all payment flow workers use `payment_ref` consistently
- `payment_stage` exists only as transitional/internal
- tests pass for happy path and replay/conflict paths

---

## PR Description Snippet

Use this in PRs if helpful:

```txt
This PR aligns payments-worker with the new core API contract.

Scope:
- Split payment intent creation from payment verification
- Canonicalize payment_ref over transaction_ref
- Canonicalize amount_thb over amount
- Canonicalize payment_status / payment_method naming
- Keep payment_stage as transitional only
- Preserve idempotency and audit behavior
