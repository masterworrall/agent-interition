#!/usr/bin/env bash
set -euo pipefail

# Smoke test for a Community Solid Server
#
# Tests the full lifecycle: create account → get token → write → read → delete → teardown

usage() {
  echo "Usage: $0 <server-url> [options]"
  echo ""
  echo "Arguments:"
  echo "  <server-url>            Solid server URL (e.g. https://crawlout.io, http://localhost:3000)"
  echo ""
  echo "Options:"
  echo "  --dont-delete-account   Leave the test account on the server after the test"
  echo "  --quota-test            Run quota enforcement test (~10MB of writes)"
  echo "  --help                  Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 http://localhost:3000"
  echo "  $0 https://crawlout.io"
  echo "  $0 http://localhost:3000 --dont-delete-account"
  exit 0
}

if [ $# -eq 0 ]; then
  usage
fi

DELETE_ACCOUNT=true
QUOTA_TEST=false
SERVER=""

for arg in "$@"; do
  case "$arg" in
    --help|-h) usage ;;
    --dont-delete-account) DELETE_ACCOUNT=false ;;
    --quota-test) QUOTA_TEST=true ;;
    -*) echo "Unknown option: $arg" >&2; echo "Run '$0 --help' for usage." >&2; exit 1 ;;
    *) SERVER="$arg" ;;
  esac
done

if [ -z "$SERVER" ]; then
  echo "Error: server URL is required." >&2
  echo "Run '$0 --help' for usage." >&2
  exit 1
fi

AGENT_NAME="smoketest-$(date +%s)"
EMAIL="${AGENT_NAME}@test.invalid"
PASSWORD="smoke-test-pass-$(openssl rand -hex 8)"

echo "=== Smoke Test ==="
echo "Server:  $SERVER"
echo "Agent:   $AGENT_NAME"
if [ "$DELETE_ACCOUNT" = false ]; then
  echo "Mode:    account will be kept after test"
fi
if [ "$QUOTA_TEST" = true ]; then
  echo "Quota:   quota enforcement test enabled"
fi
echo ""

cleanup() {
  echo ""
  if [ "$DELETE_ACCOUNT" = false ]; then
    echo "--- Cleanup: skipped (--dont-delete-account) ---"
    echo "  Account:  $AGENT_NAME"
    echo "  Email:    $EMAIL"
    echo "  Password: $PASSWORD"
    echo "  Server:   $SERVER"
    return
  fi

  echo "--- Cleanup: deleting account ---"
  if [ -n "${COOKIE:-}" ]; then
    # Re-login in case cookie expired
    LOGIN_RES=$(curl -s -D - -o /dev/null \
      -X POST "${SERVER}/.account/login/password/" \
      -H "content-type: application/json" \
      -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}" 2>/dev/null) || true
    COOKIE=$(echo "$LOGIN_RES" | grep -i '^set-cookie:' | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1) || true

    if [ -n "$COOKIE" ]; then
      CONTROLS=$(curl -s -H "cookie: ${COOKIE}" "${SERVER}/.account/" 2>/dev/null) || true

      # Delete client credentials
      CRED_URL=$(echo "$CONTROLS" | jq -r '.controls.account.clientCredentials // empty' 2>/dev/null) || true
      if [ -n "$CRED_URL" ]; then
        CREDS=$(curl -s -H "cookie: ${COOKIE}" "$CRED_URL" 2>/dev/null) || true
        for url in $(echo "$CREDS" | jq -r 'to_entries[] | .value | select(startswith("http"))' 2>/dev/null); do
          curl -s -X DELETE -H "cookie: ${COOKIE}" "$url" >/dev/null 2>&1 || true
        done
      fi

      # Delete pods
      POD_CTRL=$(echo "$CONTROLS" | jq -r '.controls.account.pod // empty' 2>/dev/null) || true
      if [ -n "$POD_CTRL" ]; then
        PODS=$(curl -s -H "cookie: ${COOKIE}" "$POD_CTRL" 2>/dev/null) || true
        for url in $(echo "$PODS" | jq -r 'to_entries[] | .value | select(startswith("http"))' 2>/dev/null); do
          curl -s -X DELETE -H "cookie: ${COOKIE}" "$url" >/dev/null 2>&1 || true
        done
      fi

      # Unlink WebIDs
      WEBID_CTRL=$(echo "$CONTROLS" | jq -r '.controls.account.webId // empty' 2>/dev/null) || true
      if [ -n "$WEBID_CTRL" ]; then
        WEBIDS=$(curl -s -H "cookie: ${COOKIE}" "$WEBID_CTRL" 2>/dev/null) || true
        for url in $(echo "$WEBIDS" | jq -r 'to_entries[] | .value | select(startswith("http"))' 2>/dev/null); do
          curl -s -X DELETE -H "cookie: ${COOKIE}" "$url" >/dev/null 2>&1 || true
        done
      fi

      # Delete password logins
      PASS_CTRL=$(echo "$CONTROLS" | jq -r '.controls.password.create // empty' 2>/dev/null) || true
      if [ -n "$PASS_CTRL" ]; then
        LOGINS=$(curl -s -H "cookie: ${COOKIE}" "$PASS_CTRL" 2>/dev/null) || true
        for url in $(echo "$LOGINS" | jq -r 'to_entries[] | .value | select(startswith("http"))' 2>/dev/null); do
          curl -s -X DELETE -H "cookie: ${COOKIE}" "$url" >/dev/null 2>&1 || true
        done
      fi

      # Delete the account itself
      ACCOUNT_URL=$(echo "$CONTROLS" | jq -r '.controls.account.account // empty' 2>/dev/null) || true
      if [ -n "$ACCOUNT_URL" ]; then
        curl -s -X DELETE -H "cookie: ${COOKIE}" "$ACCOUNT_URL" >/dev/null 2>&1 || true
      fi

      echo "PASS  Account cleaned up"
    else
      echo "WARN  Could not re-login for cleanup (account may remain)"
    fi
  else
    echo "SKIP  No cookie — nothing to clean up"
  fi
}

trap cleanup EXIT

PASS=0
FAIL=0

pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }

refresh_token() {
  local auth_string
  auth_string=$(echo -n "${CLIENT_ID}:${CLIENT_SECRET}" | base64)
  local token_res
  token_res=$(curl -s -X POST "${SERVER}/.oidc/token" \
    -H "authorization: Basic ${auth_string}" \
    -H "content-type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&scope=webid")
  TOKEN=$(echo "$token_res" | jq -r '.access_token // empty')
  if [ -z "$TOKEN" ]; then
    echo "WARN  Token refresh failed — response: $token_res"
    return 1
  fi
}

# --- 1. Create account ---
echo "--- 1. Create account ---"
ACCOUNT_RES=$(curl -s -D /dev/stderr -X POST \
  "${SERVER}/.account/account/" \
  -H "content-type: application/json" \
  -d '{}' 2>&1)

COOKIE=$(echo "$ACCOUNT_RES" | grep -i '^set-cookie:' | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)

if [ -n "$COOKIE" ]; then
  pass "Account created (got cookie)"
else
  fail "Account creation — no cookie returned"
  echo "$ACCOUNT_RES"
  exit 1
fi

# --- 2. Add password login ---
echo "--- 2. Add password login ---"
CONTROLS=$(curl -s -H "cookie: ${COOKIE}" "${SERVER}/.account/")
PASS_URL=$(echo "$CONTROLS" | jq -r '.controls.password.create')

PASS_RES=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$PASS_URL" \
  -H "content-type: application/json" \
  -H "cookie: ${COOKIE}" \
  -d "{\"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\"}")

if [ "$PASS_RES" = "200" ]; then
  pass "Password login added"
else
  fail "Password login — HTTP $PASS_RES"
fi

# --- 3. Create pod ---
echo "--- 3. Create pod ---"
CONTROLS=$(curl -s -H "cookie: ${COOKIE}" "${SERVER}/.account/")
POD_URL=$(echo "$CONTROLS" | jq -r '.controls.account.pod')

POD_RES=$(curl -s -X POST "$POD_URL" \
  -H "content-type: application/json" \
  -H "cookie: ${COOKIE}" \
  -d "{\"name\": \"${AGENT_NAME}\"}")

WEBID=$(echo "$POD_RES" | jq -r '.webId // empty')
POD=$(echo "$POD_RES" | jq -r '.pod // empty')

if [ -n "$WEBID" ] && [ -n "$POD" ]; then
  pass "Pod created — WebID: $WEBID"
else
  fail "Pod creation — response: $POD_RES"
  exit 1
fi

# --- 4. Create client credentials ---
echo "--- 4. Create client credentials ---"
CONTROLS=$(curl -s -H "cookie: ${COOKIE}" "${SERVER}/.account/")
CRED_URL=$(echo "$CONTROLS" | jq -r '.controls.account.clientCredentials')

CRED_RES=$(curl -s -X POST "$CRED_URL" \
  -H "content-type: application/json" \
  -H "cookie: ${COOKIE}" \
  -d "{\"name\": \"${AGENT_NAME}-cred\", \"webId\": \"${WEBID}\"}")

CLIENT_ID=$(echo "$CRED_RES" | jq -r '.id // empty')
CLIENT_SECRET=$(echo "$CRED_RES" | jq -r '.secret // empty')

if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
  pass "Client credentials created"
else
  fail "Client credentials — response: $CRED_RES"
  exit 1
fi

# --- 5. Get Bearer token ---
echo "--- 5. Get Bearer token ---"
AUTH_STRING=$(echo -n "${CLIENT_ID}:${CLIENT_SECRET}" | base64)

TOKEN_RES=$(curl -s -X POST "${SERVER}/.oidc/token" \
  -H "authorization: Basic ${AUTH_STRING}" \
  -H "content-type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=webid")

TOKEN=$(echo "$TOKEN_RES" | jq -r '.access_token // empty')

if [ -n "$TOKEN" ]; then
  pass "Bearer token obtained"
else
  fail "Token request — response: $TOKEN_RES"
  exit 1
fi

# --- 6. Write triples ---
echo "--- 6. Write triples ---"
WRITE_RES=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: text/turtle" \
  --data-raw '@prefix schema: <http://schema.org/>.
<#smoke-test> a schema:Note;
  schema:text "Smoke test at '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'";
  schema:dateCreated "'"$(date -u +%Y-%m-%d)"'".' \
  "${POD}memory/smoke-test.ttl")

if [ "$WRITE_RES" = "201" ] || [ "$WRITE_RES" = "205" ]; then
  pass "Triples written (HTTP $WRITE_RES)"
else
  fail "Write — HTTP $WRITE_RES"
fi

# --- 7. Read triples ---
echo "--- 7. Read triples ---"
READ_RES=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${POD}memory/smoke-test.ttl")

if echo "$READ_RES" | grep -q "smoke-test"; then
  pass "Triples read back"
else
  fail "Read — content: $READ_RES"
fi

# --- 8. Delete resource ---
echo "--- 8. Delete resource ---"
DEL_RES=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer ${TOKEN}" \
  "${POD}memory/smoke-test.ttl")

if [ "$DEL_RES" = "200" ] || [ "$DEL_RES" = "204" ] || [ "$DEL_RES" = "205" ]; then
  pass "Resource deleted (HTTP $DEL_RES)"
else
  fail "Delete — HTTP $DEL_RES"
fi

# --- 9. Confirm deletion ---
echo "--- 9. Confirm deletion ---"
CONFIRM_RES=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${POD}memory/smoke-test.ttl")

if [ "$CONFIRM_RES" = "404" ]; then
  pass "Resource confirmed gone (404)"
else
  fail "Resource still exists — HTTP $CONFIRM_RES"
fi

# --- Quota test (optional) ---

if [ "$QUOTA_TEST" = true ]; then
  echo ""
  echo "--- 10. Fill pod with 1MB chunks ---"
  refresh_token || { fail "Token refresh before quota test"; }

  QUOTA_FILES_WRITTEN=0
  QUOTA_HIT=false

  for i in $(seq 1 15); do
    WRITE_CODE=$(dd if=/dev/urandom bs=1024 count=1024 2>/dev/null | \
      curl -s -o /dev/null -w "%{http_code}" \
        -X PUT \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/octet-stream" \
        --data-binary @- \
        "${POD}memory/quota-${i}.bin")

    if [ "$WRITE_CODE" = "413" ]; then
      echo "      Chunk $i → HTTP 413 (quota exceeded)"
      QUOTA_HIT=true
      break
    elif [ "$WRITE_CODE" = "201" ] || [ "$WRITE_CODE" = "205" ]; then
      echo "      Chunk $i → HTTP $WRITE_CODE (written)"
      QUOTA_FILES_WRITTEN=$((QUOTA_FILES_WRITTEN + 1))
    else
      echo "      Chunk $i → HTTP $WRITE_CODE (unexpected)"
      fail "Quota write chunk $i — HTTP $WRITE_CODE"
      break
    fi
  done

  echo "--- 11. Verify quota rejection ---"
  if [ "$QUOTA_HIT" = true ] && [ "$QUOTA_FILES_WRITTEN" -gt 0 ]; then
    pass "Quota enforced after ${QUOTA_FILES_WRITTEN}MB written"
  elif [ "$QUOTA_HIT" = true ] && [ "$QUOTA_FILES_WRITTEN" -eq 0 ]; then
    fail "Quota rejected first write — quota too small or broken"
  else
    fail "Wrote ${QUOTA_FILES_WRITTEN} chunks without hitting quota — not enforced"
  fi

  echo "--- 12. Clean up quota files ---"
  refresh_token || echo "WARN  Token refresh before cleanup failed"

  for i in $(seq 1 "$QUOTA_FILES_WRITTEN"); do
    DEL_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X DELETE \
      -H "Authorization: Bearer ${TOKEN}" \
      "${POD}memory/quota-${i}.bin")
    echo "      quota-${i}.bin → HTTP $DEL_CODE"
  done
  pass "Quota files cleaned up ($QUOTA_FILES_WRITTEN files)"
fi

# --- Account cleanup happens in EXIT trap ---

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
