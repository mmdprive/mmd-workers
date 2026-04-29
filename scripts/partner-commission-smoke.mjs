import {
  ensureCommissionRowsForSession,
  mirrorCommissionSnapshot,
  updateCommissionEligibilityForSession,
  updateCommissionState,
} from "../shared/src/lib/partner-commissions/index.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

async function main() {
  const env = {
    ...process.env,
    AIRTABLE_API_KEY: requiredEnv("AIRTABLE_API_KEY"),
    AIRTABLE_BASE_ID: requiredEnv("AIRTABLE_BASE_ID"),
    AIRTABLE_TABLE_SESSIONS: process.env.AIRTABLE_TABLE_SESSIONS,
    AIRTABLE_TABLE_JOBS: process.env.AIRTABLE_TABLE_JOBS,
    AIRTABLE_TABLE_MODEL_REFERRALS: process.env.AIRTABLE_TABLE_MODEL_REFERRALS,
    AIRTABLE_TABLE_PARTNER_COMMISSIONS: process.env.AIRTABLE_TABLE_PARTNER_COMMISSIONS,
  };

  const sessionId = requiredEnv("TEST_SESSION_ID");
  const jobId = process.env.TEST_JOB_ID || "";
  const modelId = requiredEnv("TEST_MODEL_ID");
  const paymentRef = process.env.TEST_PAYMENT_REF || `smoke_pay_${Date.now()}`;

  const splits = [
    {
      partner_id: requiredEnv("TEST_PARTNER_ID"),
      referral_id: requiredEnv("TEST_REFERRAL_ID"),
      model_id: modelId,
      split_index: 0,
      split_percent: 100,
      commission_rate: 10,
      commission_type: "lifetime",
      commission_basis_amount: Number(process.env.TEST_BASIS_AMOUNT || "10000"),
      commission_amount: Number(process.env.TEST_COMMISSION_AMOUNT || "1000"),
      currency: process.env.TEST_CURRENCY || "THB",
    },
  ];

  const partnerSnapshot = {
    partner_id: splits[0].partner_id,
    source: "smoke",
  };
  const referralSnapshot = {
    referral_id: splits[0].referral_id,
    source: "smoke",
  };
  const commissionSnapshot = {
    source: "smoke",
    session_id: sessionId,
    splits,
  };

  console.log("1. assign -> snapshot");
  const snapshotResult = await mirrorCommissionSnapshot(env, {
    session_id: sessionId,
    job_id: jobId,
    partner_snapshot: partnerSnapshot,
    referral_snapshot: referralSnapshot,
    commission_snapshot: commissionSnapshot,
    commission_group_key: sessionId,
    commission_snapshot_locked: true,
  });
  console.log(JSON.stringify(snapshotResult, null, 2));

  console.log("2. complete -> commission rows");
  const commissionRows = await ensureCommissionRowsForSession(env, {
    session_id: sessionId,
    job_id: jobId,
    payment_ref: paymentRef,
    model_id: modelId,
    commission_splits: splits,
    partner_snapshot: partnerSnapshot,
    referral_snapshot: referralSnapshot,
    commission_snapshot: commissionSnapshot,
    commission_group_key: sessionId,
    commission_snapshot_locked: true,
    actor: "smoke-test",
    source: "smoke.complete",
  });
  console.log(JSON.stringify(commissionRows, null, 2));

  console.log("3. payment clear -> eligibility unlock");
  const eligibility = await updateCommissionEligibilityForSession(env, {
    session_id: sessionId,
    payment_ref: paymentRef,
    eligibility_status: "eligible",
    actor: "smoke-test",
  });
  console.log(JSON.stringify(eligibility, null, 2));

  console.log("4. admin approve -> paid");
  const commissionKey = `${sessionId}:${splits[0].referral_id}:0`;
  const approved = await updateCommissionState(env, {
    commission_key: commissionKey,
    action: "approve",
    actor: "smoke-test",
  });
  console.log(JSON.stringify(approved, null, 2));

  const paid = await updateCommissionState(env, {
    commission_key: commissionKey,
    action: "paid",
    actor: "smoke-test",
    payout_reference: process.env.TEST_PAYOUT_REFERENCE || `smoke_payout_${Date.now()}`,
  });
  console.log(JSON.stringify(paid, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
