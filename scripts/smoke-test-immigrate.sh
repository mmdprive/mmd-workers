#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://mmdbkk.com}"
INTERNAL_TOKEN="${INTERNAL_TOKEN:-}"

if [[ -z "${INTERNAL_TOKEN}" ]]; then
  echo "INTERNAL_TOKEN is required"
  exit 1
fi

auth_header=("Authorization: Bearer ${INTERNAL_TOKEN}")

echo
echo "[1/4] health"
curl -L -s "${BASE_URL}/v1/immigrate/health"

echo
echo
echo "[2/4] immigration intake"
intake_payload='{"source_channel":"line","intent":"renewal","identity":{"line_user_id":"u_smoke_001","full_name":"Smoke Test Client","phone":"0812345678"},"membership":{"current_tier":"standard","target_tier":"premium"},"notes":{"manual_note_raw":"Repeat client from LINE migration. Prefers calm and discreet handling.","operator_summary":"high trust repeat client"},"payload_json":{"source_message_id":"msg_smoke_001","import_source":"smoke-test"}}'
intake_response="$(curl -L -s -X POST \
  -H "${auth_header[0]}" \
  -H "Content-Type: application/json" \
  "${BASE_URL}/v1/immigration/intake" \
  -d "${intake_payload}")"
printf '%s\n' "${intake_response}"

immigration_id="$(printf '%s' "${intake_response}" | tr -d '\n' | sed -n 's/.*"immigration_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [[ -z "${immigration_id}" ]]; then
  echo
  echo "Failed to extract immigration_id from intake response"
  exit 1
fi

echo
echo
echo "[3/4] immigration promote"
promote_payload="{\"immigration_id\":\"${immigration_id}\",\"source_channel\":\"line\",\"intent\":\"renewal\",\"identity\":{\"line_user_id\":\"u_smoke_001\",\"full_name\":\"Smoke Test Client\",\"phone\":\"0812345678\"},\"membership\":{\"current_tier\":\"standard\",\"target_tier\":\"premium\"},\"notes\":{\"manual_note_raw\":\"Repeat client from LINE migration. Prefers calm and discreet handling.\",\"operator_summary\":\"high trust repeat client\"},\"payload_json\":{\"source_message_id\":\"msg_smoke_001\",\"import_source\":\"smoke-test\"}}"
curl -L -s -X POST \
  -H "${auth_header[0]}" \
  -H "Content-Type: application/json" \
  "${BASE_URL}/v1/immigration/promote" \
  -d "${promote_payload}"

echo
echo
echo "[4/4] immigration get"
curl -L -s -H "${auth_header[0]}" \
  "${BASE_URL}/v1/immigration/${immigration_id}"

echo
