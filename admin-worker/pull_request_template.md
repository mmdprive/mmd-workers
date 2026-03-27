## Spec Alignment
- [ ] Updated `/openapi/mmd-core-api.v1.yaml` if needed
- [ ] Updated `/spec/openapi.payments.v2.yaml` if needed
- [ ] Endpoint semantics aligned (`/v1/pay/create` vs `/v1/pay/verify`)
- [ ] `payment_ref` used canonically
- [ ] `amount_thb` used canonically
- [ ] `payment_status` used canonically
- [ ] `payment_method` used canonically
- [ ] `payment_stage` treated as transitional only

---

## Airtable Mapping
- [ ] Payments mapping checked
- [ ] Sessions mapping checked
- [ ] member_packages mapping checked
- [ ] No frontend exposure of Airtable or secrets

---

## Idempotency
- [ ] Payment intent idempotency checked
- [ ] Verify idempotency checked
- [ ] Membership apply idempotency checked
- [ ] Override idempotency checked

---

## Testing
- [ ] Happy path tested
- [ ] Replay / duplicate path tested
- [ ] Conflict path tested
- [ ] Not found path tested
- [ ] Provider mismatch path tested (if applicable)

---

## Notes
Anything reviewers should know:
- backward compatibility notes
- migration flags
- temporary adapters / aliases
- rollout risks
