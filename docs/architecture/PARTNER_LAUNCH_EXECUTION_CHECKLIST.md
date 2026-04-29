# Partner Launch Execution Checklist

Date: 2026-04-24

Status:
- launch gate passed on test lane
- schema blocker closed for current partner commission contract

This document is the execution sheet for closing the Airtable launch gate for the partner commission system.

## Current truth

What is already in repo:
- shared commission logic exists in `shared/src/lib/partner-commissions/index.js`
- `events-worker` creates partner commission rows and job mirrors
- `payments-worker` updates eligibility and session/job mirrors
- `admin-worker` performs approval, hold, void, and paid transitions
- `scripts/check-partner-launch-gate.mjs` verifies required Airtable schema
- `scripts/partner-commission-smoke.mjs` provides a real smoke flow

What is still blocking launch:
- production rollout still needs normal release control and operator sign-off
- field alias discipline should still be preserved for future additions

## Launch gate order

1. Patch Airtable schema.
2. Sync env contract and field aliases with the live base.
3. Run schema gate script until P0 and P1 are clean.
4. Run smoke flow with real test IDs.
5. Record pass/fail evidence before enabling production launch.

## P0 blockers

Table: `Partner Commissions`

Required before launch:
- `commission_key`
- `eligibility_status`
- `approval_status`
- `payout_status`
- `split_index`
- `split_percent`
- `commission_group_key`
- `audit_json`

Recommended in the same patch wave:
- `eligibility_payment_ref`
- `eligible_at`
- `approved_by`
- `partner_snapshot_json`
- `referral_snapshot_json`
- `commission_snapshot_json`
- `commission_snapshot_locked`
- `job_id`
- `partner_id`
- `referral_id`
- `model_id`
- `session_id`
- `payment_ref`
- `earned_at`

## P1 blockers

Table: `Jobs`

Required before launch:
- `commission_state`
- `commission_snapshot_locked`
- `commission_snapshot_locked_at`
- `partner_id_snapshot`
- `partner_referral_id_snapshot`
- `commission_eligible`
- `partner_commission_id`

Recommended in the same patch wave:
- `partner_snapshot_json`
- `referral_snapshot_json`
- `commission_snapshot_json`
- `commission_group_key`
- `commission_eligibility_status`
- `commission_last_payment_ref`
- `commission_eligible_at`

Table: `Sessions`

Required before launch:
- `partner_id_snapshot`
- `partner_referral_id_snapshot`
- `partner_commission_state`
- `commission_eligible`
- `commission_eligible_at`

Recommended in the same patch wave:
- `partner_snapshot_json`
- `referral_snapshot_json`
- `commission_snapshot_json`
- `commission_snapshot_locked`
- `commission_group_key`
- `commission_eligibility_status`
- `commission_last_payment_ref`

## P2 before scale

Table: `Payments`
- `session_id`
- `payment_type`
- `commission_unlocks`
- `commission_unlock_checked_at`
- `commission_unlock_notes`

Table: `Model Referrals`
- `Referral ID`
- `Partner`
- `Model`
- `Ownership Status`
- `Commission Type`
- `Commission Rate`
- `Basis Rule`
- `Approved At`
- `Approved By`
- `Notes`
- `Flat Amount THB`
- `Ownership Reason`
- `Transfer Reason`
- `Revoke Reason`
- `Previous Referral ID`
- `Transferred To Referral ID`
- `Created By Worker`

## Enum contract

Use these exact values unless the live base already has an approved locked variant.

`eligibility_status`
- `pending_payment`
- `eligible`
- `ineligible`
- `held`

`approval_status`
- `pending`
- `approved`
- `held`
- `void`

`payout_status`
- `unpaid`
- `queued`
- `paid`
- `void`

`commission_state`
- `pending_payment`
- `eligible`
- `approved`
- `held`
- `paid`
- `void`

`partner_commission_state`
- `pending_payment`
- `eligible`
- `approved`
- `held`
- `paid`
- `void`

## Env contract sync

After fields exist in Airtable:

1. Confirm table names or table IDs used by each worker are still correct.
2. Confirm field labels match the aliases in `shared/src/lib/partner-commissions/index.js`.
3. If labels differ, add env overrides before smoke testing.
4. Confirm worker env for all touched tables is pointed at the production base intended for launch.

Common override pattern:
- `AT_PARTNERCOMMISSIONS__COMMISSION_KEY`
- `AT_PARTNERCOMMISSIONS__ELIGIBILITY_STATUS`
- `AT_PARTNERCOMMISSIONS__APPROVAL_STATUS`
- `AT_PARTNERCOMMISSIONS__PAYOUT_STATUS`
- `AT_PARTNERCOMMISSIONS__SPLIT_INDEX`
- `AT_PARTNERCOMMISSIONS__SPLIT_PERCENT`
- `AT_PARTNERCOMMISSIONS__COMMISSION_GROUP_KEY`
- `AT_PARTNERCOMMISSIONS__AUDIT_JSON`
- `AT_JOBS__COMMISSION_STATE`
- `AT_JOBS__PARTNER_ID_SNAPSHOT`
- `AT_JOBS__PARTNER_REFERRAL_ID_SNAPSHOT`
- `AT_SESSIONS__PARTNER_COMMISSION_STATE`
- `AT_SESSIONS__PARTNER_ID_SNAPSHOT`
- `AT_SESSIONS__PARTNER_REFERRAL_ID_SNAPSHOT`

## Validation commands

Schema gate:

```bash
cd /Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers
AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... npm run check:partner-launch-gate
```

Expected result:
- zero missing fields for every P0 table
- zero missing fields for every P1 table
- `launch_ready: true`

Smoke flow:

```bash
cd /Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers
AIRTABLE_API_KEY=... \
AIRTABLE_BASE_ID=... \
AIRTABLE_TABLE_PARTNER_COMMISSIONS=... \
AIRTABLE_TABLE_JOBS=... \
AIRTABLE_TABLE_SESSIONS=... \
TEST_SESSION_ID=... \
TEST_JOB_ID=... \
TEST_REFERRAL_ID=... \
TEST_PARTNER_ID=... \
node scripts/partner-commission-smoke.mjs
```

Expected result:
- commission rows are materialized
- eligibility transition writes successfully
- session/job mirrors update successfully
- admin transition path can be exercised without schema errors

## Exit criteria

Current result on 2026-04-24:

- P0 fields exist in the live base
- P1 fields exist in the live base
- `npm run check:partner-launch-gate` passed with `launch_ready: true`
- `npm run smoke:partner-commission` passed on the isolated smoke lane
- one test commission lifecycle was written end-to-end in Airtable

Keep using the checklist below as the standing ready-state definition:

- P0 fields exist in the live base
- P1 fields exist in the live base
- env aliases or field IDs match the live base
- `npm run check:partner-launch-gate` passes
- `node scripts/partner-commission-smoke.mjs` passes against the intended Airtable base
- one test commission lifecycle is manually inspected in Airtable end-to-end

## Evidence links

- [Partner schema patch plan](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/architecture/PARTNER_SCHEMA_PATCH_PLAN.md)
- [Field creation checklist](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/architecture/PARTNER_AIRTABLE_FIELD_CREATION_CHECKLIST.md)
- [Smoke test IDs](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/docs/architecture/PARTNER_SMOKE_TEST_IDS_2026-04-24.md)
- [Launch gate script](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/scripts/check-partner-launch-gate.mjs)
- [Smoke script](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/scripts/partner-commission-smoke.mjs)
- [Shared commission layer](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/shared/src/lib/partner-commissions/index.js)
