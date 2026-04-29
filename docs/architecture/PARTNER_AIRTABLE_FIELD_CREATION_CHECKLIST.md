# Partner Airtable Field Creation Checklist

Use this as the literal build sheet while creating fields in Airtable.

Rule:
- create P0 first
- do not deploy partner commission workers until all P0 and P1 are done
- if you use different field labels, set matching env overrides for the shared layer

## Env Override Pattern

If Airtable label differs from default aliases, set env like:

- `AT_PARTNERCOMMISSIONS__COMMISSION_KEY`
- `AT_PARTNERCOMMISSIONS__ELIGIBILITY_STATUS`
- `AT_SESSIONS__PARTNER_COMMISSION_STATE`
- `AT_JOBS__COMMISSION_STATE`
- `AT_MODELREFERRALS__OWNERSHIP_STATUS`

## P0: Partner Commissions

Table: `Partner Commissions`

- [ ] `commission_key`
  - type: single line text
  - example: `sess_123:ref_456:0`
- [ ] `eligibility_status`
  - type: single select
  - options: `pending_payment`, `eligible`, `ineligible`, `held`
- [ ] `approval_status`
  - type: single select
  - options: `pending`, `approved`, `held`, `void`
- [ ] `payout_status`
  - type: single select
  - options: `unpaid`, `queued`, `paid`, `void`
- [ ] `split_index`
  - type: number
  - precision: integer
- [ ] `split_percent`
  - type: number
  - precision: 0 or 2 decimals
- [ ] `commission_group_key`
  - type: single line text
- [ ] `audit_json`
  - type: long text

Recommended same wave:

- [ ] `eligibility_payment_ref`
  - type: single line text
- [ ] `eligible_at`
  - type: date with time
- [ ] `approved_by`
  - type: single line text
- [ ] `partner_snapshot_json`
  - type: long text
- [ ] `referral_snapshot_json`
  - type: long text
- [ ] `commission_snapshot_json`
  - type: long text
- [ ] `commission_snapshot_locked`
  - type: checkbox
- [ ] `session_id`
  - type: single line text
- [ ] `job_id`
  - type: single line text
- [ ] `partner_id`
  - type: single line text
- [ ] `referral_id`
  - type: single line text
- [ ] `model_id`
  - type: single line text
- [ ] `payment_ref`
  - type: single line text
- [ ] `earned_at`
  - type: date with time

## P1: Jobs

Table: `Jobs`

- [ ] `commission_state`
  - type: single select
  - options: `pending_payment`, `eligible`, `approved`, `held`, `paid`, `void`
- [ ] `commission_snapshot_locked`
  - type: checkbox
- [ ] `commission_snapshot_locked_at`
  - type: date with time
- [ ] `partner_id_snapshot`
  - type: single line text
- [ ] `partner_referral_id_snapshot`
  - type: single line text

Recommended:

- [ ] `partner_snapshot_json`
  - type: long text
- [ ] `referral_snapshot_json`
  - type: long text
- [ ] `commission_snapshot_json`
  - type: long text
- [ ] `commission_group_key`
  - type: single line text
- [ ] `commission_eligible`
  - type: checkbox
- [ ] `partner_commission_id`
  - type: single line text
- [ ] `commission_eligibility_status`
  - type: single select
  - options: `pending_payment`, `eligible`, `ineligible`, `held`
- [ ] `commission_last_payment_ref`
  - type: single line text
- [ ] `commission_eligible_at`
  - type: date with time

## P1: Sessions

Table: `Sessions`

- [ ] `partner_commission_state`
  - type: single select
  - options: `pending_payment`, `eligible`, `approved`, `held`, `paid`, `void`
- [ ] `commission_eligible`
  - type: checkbox
- [ ] `partner_id_snapshot`
  - type: single line text
- [ ] `partner_referral_id_snapshot`
  - type: single line text
- [ ] `commission_eligible_at`
  - type: date with time

Recommended:

- [ ] `partner_snapshot_json`
  - type: long text
- [ ] `referral_snapshot_json`
  - type: long text
- [ ] `commission_snapshot_json`
  - type: long text
- [ ] `commission_snapshot_locked`
  - type: checkbox
- [ ] `commission_group_key`
  - type: single line text
- [ ] `commission_eligibility_status`
  - type: single select
  - options: `pending_payment`, `eligible`, `ineligible`, `held`
- [ ] `commission_last_payment_ref`
  - type: single line text

## P2: Payments

Table: `Payments`

- [ ] `commission_unlocks`
  - type: long text
- [ ] `commission_unlock_checked_at`
  - type: date with time
- [ ] `commission_unlock_notes`
  - type: long text

## P2: Model Referrals

Table: `Model Referrals`

- [ ] `Flat Amount THB`
  - type: currency or number
- [ ] `Ownership Reason`
  - type: long text
- [ ] `Transfer Reason`
  - type: long text
- [ ] `Revoke Reason`
  - type: long text
- [ ] `Previous Referral ID`
  - type: single line text
- [ ] `Transferred To Referral ID`
  - type: single line text
- [ ] `Created By Worker`
  - type: single line text

## Post-Create Checks

- [ ] run `cd /Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers && AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... npm run check:partner-launch-gate`
- [ ] confirm zero P0 blockers
- [ ] confirm zero P1 blockers
- [ ] run smoke flow with test IDs
