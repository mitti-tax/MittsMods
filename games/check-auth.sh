#!/bin/sh
# Checks the API rejects unauthenticated writes. Run on the server after deploying.
# Usage: ADMIN_PASSWORD='...' ./check-auth.sh [base url]
B=${1:-http://localhost:8081}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
fail() { echo "FAIL: $1"; exit 1; }

[ "$(code "$B/api/platforms")" = 200 ] || fail "reads should be open"
[ "$(code -X DELETE "$B/api/games/0")" = 401 ] || fail "write without a token was not rejected"
[ "$(code -X DELETE -H 'Authorization: Bearer 9999999999.forged' "$B/api/games/0")" = 401 ] || fail "forged token was accepted"

T=$(curl -s -X POST -H 'Content-Type: application/json' -d "{\"password\":\"$ADMIN_PASSWORD\"}" "$B/api/auth/login" \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
# Game 0 doesn't exist, so a valid token gets past auth and hits a 404
[ "$(code -X DELETE -H "Authorization: Bearer $T" "$B/api/games/0")" = 404 ] || fail "valid token was rejected"
echo "OK: auth checks passed"
