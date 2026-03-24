#!/usr/bin/env bash
# run-checks.sh — Payments worker quick acceptance tests
# Usage:
#   BASE_URL="https://payments-worker.malemodel-bkk.workers.dev" \
#   TELEGRAM_URL="https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send" \
#   WEBFLOW_URL="https://mmdprive.webflow.io" \
#   JOB_ID="demo-job-123" \
#   ./run-checks.sh

set -u

# --------- Config (override with env) ----------
BASE_URL="${BASE_URL:-https://payments-worker.malemodel-bkk.workers.dev}"
TELEGRAM_URL="${TELEGRAM_URL:-https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send}"
WEBFLOW_URL="${WEBFLOW_URL:-https://mmdprive.webflow.io}"
JOB_ID="${JOB_ID:-test-job-000}"
TIMEOUT_CURL=10

# Origins allowed check (a sample of origins we expect)
EXPECTED_ORIGINS=("https://www.mmdbkk.com" "https://mmdprive.webflow.io" "https://mmdbkk.com")

# helper for pretty printing
ok() { printf "\033[32m[PASS]\033[0m %s\n" "$1"; }
fail() { printf "\033[31m[FAIL]\033[0m %s\n" "$1"; ERROR_COUNT=$((ERROR_COUNT+1)); }
info() { printf "\033[36m[INFO]\033[0m %s\n" "$1"; }

ERROR_COUNT=0

# check dependencies
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required. Install curl and try again."
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install jq and try again."
  exit 2
fi

# ---------- Test 1: GET mode=waiting_transfer ------------
info "GET /api/payment-confirmation?job_id=${JOB_ID}&mode=waiting_transfer"
resp=$(curl -sS -m $TIMEOUT_CURL "${BASE_URL}/api/payment-confirmation?job_id=${JOB_ID}&mode=waiting_transfer" || true)
if [ -z "$resp" ]; then
  fail "No response from ${BASE_URL}/api/payment-confirmation?mode=waiting_transfer"
else
  # attempt to parse
  status=$(echo "$resp" | jq -r '.payment.status // empty' 2>/dev/null || true)
  confirmed_by_mmd=$(echo "$resp" | jq -r '.payment.confirmed_by_mmd // empty' 2>/dev/null || true)

  if [ "$status" = "waiting_transfer" ] && [ "$confirmed_by_mmd" = "false" ]; then
    ok "waiting_transfer response looks correct (status=${status}, confirmed_by_mmd=${confirmed_by_mmd})"
  else
    fail "Unexpected waiting_transfer payload. status='${status}', confirmed_by_mmd='${confirmed_by_mmd}'. Raw: ${resp}"
  fi
fi

# ---------- Test 2: GET mode=confirmed ------------
info "GET /api/payment-confirmation?job_id=${JOB_ID}&mode=confirmed"
resp2=$(curl -sS -m $TIMEOUT_CURL "${BASE_URL}/api/payment-confirmation?job_id=${JOB_ID}&mode=confirmed" || true)
if [ -z "$resp2" ]; then
  fail "No response from confirmed endpoint"
else
  confirmed_by_mmd2=$(echo "$resp2" | jq -r '.payment.confirmed_by_mmd // empty' 2>/dev/null || true)
  if [ "$confirmed_by_mmd2" = "true" ]; then
    ok "confirmed response: confirmed_by_mmd=true"
  else
    fail "confirmed response missing confirmed_by_mmd=true. Raw: ${resp2}"
  fi
fi

# ---------- Test 3: POST /api/mark-arrived ------------
info "POST /api/mark-arrived { job_id, note }"
post_mark=$(curl -sS -m $TIMEOUT_CURL -X POST "${BASE_URL}/api/mark-arrived" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"${JOB_ID}\",\"note\":\"arrival test\"}" || true)

if [ -z "$post_mark" ]; then
  fail "No response from /api/mark-arrived"
else
  ttype=$(echo "$post_mark" | jq -r '.travel_update.type // empty' 2>/dev/null || true)
  if [ "$ttype" = "arrived" ]; then
    ok "/api/mark-arrived returned travel_update.type=arrived"
  else
    fail "/api/mark-arrived unexpected travel_update.type='${ttype}'. Raw: ${post_mark}"
  fi
fi

# ---------- Test 4: POST /api/verify-payment ------------
info "POST /api/verify-payment { job_id }"
post_verify=$(curl -sS -m $TIMEOUT_CURL -X POST "${BASE_URL}/api/verify-payment" \
  -H "Content-Type: application/json" \
  -d "{\"job_id\":\"${JOB_ID}\"}" || true)

if [ -z "$post_verify" ]; then
  fail "No response from /api/verify-payment"
else
  cbm=$(echo "$post_verify" | jq -r '.payment.confirmed_by_mmd // empty' 2>/dev/null || true)
  if [ "$cbm" = "true" ]; then
    ok "/api/verify-payment set payment.confirmed_by_mmd=true"
  else
    fail "/api/verify-payment did not set confirmed_by_mmd=true. Raw: ${post_verify}"
  fi
fi

# ---------- Test 5: CORS (OPTIONS) ----------
info "OPTIONS (CORS) check for /api/payment-confirmation"
cors_headers=$(curl -sS -m $TIMEOUT_CURL -i -X OPTIONS "${BASE_URL}/api/payment-confirmation?job_id=${JOB_ID}&mode=waiting_transfer" -H "Origin: https://mmdprive.webflow.io" || true)
if echo "$cors_headers" | grep -i "Access-Control-Allow-Origin" >/dev/null 2>&1; then
  header=$(echo "$cors_headers" | grep -i "Access-Control-Allow-Origin" | head -n1 | tr -d '\r')
  ok "CORS header found: ${header}"
else
  fail "CORS header Access-Control-Allow-Origin not present. Full headers:\n${cors_headers}"
fi

# ---------- Test 6: Webflow embed presence ----------
info "Check Webflow embed page for worker URL snippet"
# check the embed file that should point to worker (adjust path if you put embed elsewhere)
embed_url="${WEBFLOW_URL}/payment-confirmation-embed.html"
embed_resp=$(curl -sS -m $TIMEOUT_CURL "${embed_url}" || true)
if [ -z "$embed_resp" ]; then
  # fallback: check /webflow-embed/payment-confirmation-embed.html path
  embed_url2="${WEBFLOW_URL}/webflow-embed/payment-confirmation-embed.html"
  embed_resp=$(curl -sS -m $TIMEOUT_CURL "${embed_url2}" || true)
  embed_url="$embed_url2"
fi

if echo "$embed_resp" | grep -E "$(echo ${BASE_URL} | sed 's/[:/]/\\&/g')" >/dev/null 2>&1; then
  ok "Embed page ${embed_url} references worker base URL"
else
  fail "Embed page ${embed_url} does not reference worker URL (${BASE_URL}). Please verify embed file. (Fetched length=${#embed_resp})"
fi

# ---------- Optional: Telegram internal send smoke (without expecting state changes) ----------
if [ -n "${TELEGRAM_URL}" ]; then
  info "Optional: telegram internal send smoke test (POST)"
  tel_resp=$(curl -sS -m $TIMEOUT_CURL -X POST "$TELEGRAM_URL" -H "Content-Type: application/json" -d '{"test":"ping"}' || true)
  if [ -z "$tel_resp" ]; then
    info "No response from telegram internal (might be restricted) — skip"
  else
    ok "telegram internal returned something (length ${#tel_resp})"
  fi
fi

# ---------- Summary ----------
echo
if [ "$ERROR_COUNT" -eq 0 ]; then
  echo "All checks \033[32mPASSED\033[0m ✅"
  exit 0
else
  echo "Checks completed with \033[31m${ERROR_COUNT} failures\033[0m"
  exit 2
fi
