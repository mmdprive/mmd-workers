# Partner System Schema Patch Plan

Status: required before production launch

Scope:
- Airtable base for MMD partner commission system
- Align real schema with current worker contract
- Close launch blockers for `events-worker`, `payments-worker`, `admin-worker`

## Launch Decision

Current status: do not launch yet.

Reason:
- code now expects strict partner commission lifecycle fields
- Airtable base still lacks several P0/P1 fields
- strict workers should fail fast rather than silently degrade

## Patch Order

1. P0: `Partner Commissions`
2. P1: `Jobs`
3. P1: `Sessions`
4. P2: `Payments`
5. P2: `Model Referrals`

## P0: Partner Commissions

Table:
- `Partner Commissions`

Why this is blocking:
- write-back layer now uses unique commission identity
- eligibility / approval / payout are modeled as separate states
- split payouts need row-level tracking
- audit trail must persist forเงินจริง control flow

Add these fields:

| Field name | Airtable type | Required | Allowed values / format | Used by |
| --- | --- | --- | --- | --- |
| `commission_key` | single line text | yes | format `session_id:referral_id:split_index` | shared commission layer, admin state updates |
| `eligibility_status` | single select | yes | `pending_payment`, `eligible`, `ineligible`, `held` | payments-worker |
| `approval_status` | single select | yes | `pending`, `approved`, `held`, `void` | admin-worker |
| `payout_status` | single select | yes | `unpaid`, `queued`, `paid`, `void` | admin-worker |
| `split_index` | number, integer | yes | `0,1,2...` unique per `session_id + referral_id` | events/payments worker |
| `split_percent` | number | yes | percent-like numeric value, sum per group must equal `100` | events/payments worker |
| `commission_group_key` | single line text | yes | default `session_id` unless custom grouping used | shared commission layer |
| `audit_json` | long text | yes | JSON array string | all workers |

Recommended strongly, same patch wave:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `eligibility_payment_ref` | single line text | no | payment ref that unlocked eligibility |
| `eligible_at` | date+time | no | set when row becomes eligible |
| `approved_by` | single line text | no | actor id / admin id / email |
| `partner_snapshot_json` | long text | no | immutable JSON snapshot |
| `referral_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_snapshot_locked` | checkbox | no | default checked once materialized |
| `job_id` | single line text | no | worker writes plain job id when available |
| `partner_id` | single line text | no | normalized partner id snapshot |
| `referral_id` | single line text | no | normalized referral id snapshot |
| `model_id` | single line text | no | normalized model id snapshot |
| `session_id` | single line text | no | normalized session id field for fast lookup |
| `payment_ref` | single line text | no | normalized payment ref mirror |
| `earned_at` | date+time | no | earned timestamp |

Operational rules:
- `commission_key` must be unique in practice
- Airtable cannot enforce unique directly, so create a filtered/grid view sorted by `commission_key` and add pre-launch duplicate scan
- `split_index` must be unique inside one commission group
- `split_percent` across one `commission_group_key` must total `100`

## P1: Jobs

Table:
- `Jobs`

Why this matters:
- `events-worker` now tries to mirror immutable snapshot state into `Jobs`
- launch contract expects job-level commission traceability

Add these fields:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `commission_state` | single select | yes | `pending_payment`, `eligible`, `approved`, `held`, `paid`, `void` |
| `commission_snapshot_locked` | checkbox | yes | default unchecked, worker sets true |
| `commission_snapshot_locked_at` | date+time | no | optional but recommended |
| `partner_id_snapshot` | single line text | yes | immutable partner id |
| `partner_referral_id_snapshot` | single line text | yes | immutable referral id |

Recommended strongly:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `partner_snapshot_json` | long text | no | immutable JSON snapshot |
| `referral_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_group_key` | single line text | no | grouping key |
| `commission_eligible` | checkbox | no | easy operational filter |
| `partner_commission_id` | single line text | no | plain commission id or key |

## P1: Sessions

Table:
- `Sessions`

Why this matters:
- `payments-worker` mirrors eligibility state back into `Sessions`
- session-level admin/support screens need one clear summary of commission state

Add these fields:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `partner_commission_state` | single select | yes | `pending_payment`, `eligible`, `approved`, `held`, `paid`, `void` |
| `commission_eligible` | checkbox | yes | simple yes/no mirror |
| `partner_id_snapshot` | single line text | yes | immutable partner id |
| `partner_referral_id_snapshot` | single line text | yes | immutable referral id |
| `commission_eligible_at` | date+time | no | set when final/full payment unlocks |

Recommended strongly:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `partner_snapshot_json` | long text | no | immutable JSON snapshot |
| `referral_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_snapshot_json` | long text | no | immutable JSON snapshot |
| `commission_snapshot_locked` | checkbox | no | strict immutable contract |
| `commission_group_key` | single line text | no | grouping key |
| `commission_last_payment_ref` | single line text | no | last payment ref that touched eligibility |
| `commission_eligibility_status` | single select | no | `pending_payment`, `eligible`, `ineligible`, `held` |

## P2: Payments

Table:
- `Payments`

Why this matters:
- not a first blocker if unused today
- useful for operational trace and reconciliations

Add these fields:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `commission_unlocks` | long text | no | JSON or note of unlocked commission keys |
| `commission_unlock_checked_at` | date+time | no | when eligibility logic ran |
| `commission_unlock_notes` | long text | no | reconciliation notes |

## P2: Model Referrals

Table:
- `Model Referrals`

Why this matters:
- needed for strict transfer / revoke auditability
- not the first schema blocker, but should be added before scale

Add these fields:

| Field name | Airtable type | Required | Notes |
| --- | --- | --- | --- |
| `Flat Amount THB` | currency or number | no | for flat commission contracts |
| `Ownership Reason` | long text | no | why record became active/pending |
| `Transfer Reason` | long text | no | why ownership moved |
| `Revoke Reason` | long text | no | why ownership was revoked |
| `Previous Referral ID` | single line text | no | chain back pointer |
| `Transferred To Referral ID` | single line text | no | chain forward pointer |
| `Created By Worker` | single line text | no | provenance for automation |

## Enum Contract

Use these exact values unless there is already locked production usage:

### `eligibility_status`
- `pending_payment`
- `eligible`
- `ineligible`
- `held`

### `approval_status`
- `pending`
- `approved`
- `held`
- `void`

### `payout_status`
- `unpaid`
- `queued`
- `paid`
- `void`

### `commission_state`
- `pending_payment`
- `eligible`
- `approved`
- `held`
- `paid`
- `void`

### `partner_commission_state`
- `pending_payment`
- `eligible`
- `approved`
- `held`
- `paid`
- `void`

## Field Mapping To Current Code

### Shared commission layer

File:
- [shared/src/lib/partner-commissions/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/shared/src/lib/partner-commissions/index.js:235)

Depends directly on:
- `commission_key`
- `eligibility_status`
- `approval_status`
- `payout_status`
- `split_index`
- `split_percent`
- `commission_group_key`
- `audit_json`
- snapshot JSON fields

### Events worker

File:
- [events-worker/src/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/events-worker/src/index.js:312)

Writes:
- job snapshot fields
- commission group key
- commission snapshot lock
- partner commission rows on `job/create`

### Payments worker

File:
- [payments-worker/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/payments-worker/index.js:681)

Writes:
- eligibility updates to `Partner Commissions`
- summary mirror to `Sessions`
- summary mirror to `Jobs`

### Admin worker

File:
- [admin-worker/src/index.js](/Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers/admin-worker/src/index.js:314)

Writes:
- referral activation with single-active enforcement
- commission state transitions: `approve`, `hold`, `void`, `paid`
- audit trail updates

## Rollout Checklist

1. Add all P0 fields in `Partner Commissions`
2. Add all P1 fields in `Jobs`
3. Add all P1 fields in `Sessions`
4. Add P2 fields in `Payments` and `Model Referrals`
5. Run schema gate:
   - `cd /Users/Hiright_1/Desktop/MMDMaleModel/MMDPrive/mmd-workers`
   - `AIRTABLE_API_KEY=... AIRTABLE_BASE_ID=... npm run check:partner-launch-gate`
6. Fix any remaining missing-field failures
7. Run smoke flow:
   - `node scripts/partner-commission-smoke.mjs`
8. Only then allow deploy / launch

## Recommended Airtable Views

Create these views to support launch ops:

### Partner Commissions
- `Launch Gate - Missing Keys`
  - filter `commission_key` is empty
- `Launch Gate - Pending Eligibility`
  - filter `eligibility_status = pending_payment`
- `Launch Gate - Ready For Approval`
  - filter `eligibility_status = eligible` and `approval_status = pending`
- `Launch Gate - Ready For Payout`
  - filter `approval_status = approved` and `payout_status = unpaid`
- `Launch Gate - Potential Duplicate Keys`
  - grouped by `commission_key`

### Model Referrals
- `Active Owners`
  - filter `Ownership Status = active`
  - group by `Model`

### Sessions
- `Commission Eligible`
  - filter `commission_eligible = checked`

## Final Note

Do not loosen worker strictness to compensate for schema gaps.

The safer path is:
- make schema match contract
- keep fail-fast behavior
- then run real E2E validation
