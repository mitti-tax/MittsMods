#!/usr/bin/env bash
#
# End-to-end smoke test for the games API against a real Postgres.
#
# Exercises every endpoint, including each sort order and filter, because an
# untranslatable LINQ query compiles fine and only fails when it is run.
#
# Usage: API=http://127.0.0.1:5080 ADMIN_PASSWORD=... games/scripts/smoke-test.sh

set -uo pipefail

API="${API:-http://127.0.0.1:5080}"
PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set}"
BODY="$(mktemp)"
failures=0

pass() { printf '  PASS  %s\n' "$1"; }
fail() {
  printf '  FAIL  %s\n' "$1"
  printf '        %s\n' "$2"
  printf '        body: %s\n' "$(head -c 400 "$BODY")"
  failures=$((failures + 1))
}

# request METHOD PATH [JSON_BODY] [TOKEN] -> prints the status code
request() {
  local method=$1 path=$2 data=${3:-} token=${4:-}
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}

# expect NAME EXPECTED_STATUS METHOD PATH [JSON_BODY] [TOKEN]
expect() {
  local name=$1 expected=$2
  shift 2
  local status
  status=$(request "$@")
  if [ "$status" = "$expected" ]; then pass "$name"; else fail "$name" "expected $expected, got $status"; fi
}

# expect_json NAME JQ_FILTER EXPECTED  (reads the last response body)
expect_json() {
  local name=$1 filter=$2 expected=$3 actual
  actual=$(jq -r "$filter" < "$BODY" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then pass "$name"; else fail "$name" "jq $filter: expected '$expected', got '$actual'"; fi
}

echo "== Waiting for the API =="
for _ in $(seq 1 60); do
  if [ "$(request GET /health)" = "200" ]; then break; fi
  sleep 1
done

echo
echo "== Health and seed data =="
expect "health responds" 200 GET /health
expect_json "database reachable" .database up
expect "platforms list" 200 GET /api/platforms
expect_json "27 platforms seeded" 'length' 27

echo
echo "== Writes are refused without a token =="
expect "POST /api/games rejected" 401 POST /api/games '{"title":"Nope","entry":{"platformId":1,"status":"Backlog"}}'
expect "DELETE /api/games rejected" 401 DELETE /api/games/1
expect "PATCH favourite rejected" 401 PATCH /api/games/1/favourite
expect "POST steam sync rejected" 401 POST /api/steam/sync
expect "IGDB search rejected" 401 GET '/api/search?q=zelda'

echo
echo "== Login =="
expect "wrong password rejected" 401 POST /api/auth/login '{"password":"definitely-not-it"}'
expect "correct password accepted" 200 POST /api/auth/login "{\"password\":\"$PASSWORD\"}"
TOKEN=$(jq -r .token < "$BODY")
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && pass "token issued" || fail "token issued" "no token in the response"
expect_json "expiry returned" 'has("expiresAt")' true

expect "valid token verifies" 200 POST /api/auth/verify '{}' "$TOKEN"
expect "tampered token rejected" 401 POST /api/auth/verify '{}' "${TOKEN%?}X"
expect "forged legacy token rejected" 401 POST /api/auth/verify \
  "{\"token\":\"$(printf 'mittsmods-admin:%s' "$(date -u +%Y%m%d)" | base64 -w0)\"}"

echo
echo "== Create =="
expect "create game" 201 POST /api/games \
  '{"title":"Smoke Test Game","genre":"Action","releaseYear":2011,"developer":"QA Studio","summary":"A summary.","igdbId":424242,"entry":{"platformId":1,"status":"Playing","hoursPlayed":12.5,"rating":8,"notes":"first pass","hardware":"Original","mode":"TV"}}' \
  "$TOKEN"
GAME_ID=$(jq -r .id < "$BODY")
ENTRY_ID=$(jq -r '.userEntries[0].id' < "$BODY")
expect_json "status stored as a string" '.userEntries[0].status' Playing
expect_json "platform name resolved" '.userEntries[0].platformName' PC
expect_json "source defaults to Manual" '.userEntries[0].source' Manual

expect "duplicate igdbId rejected" 409 POST /api/games \
  '{"title":"Smoke Test Game","igdbId":424242,"entry":{"platformId":1,"status":"Backlog"}}' "$TOKEN"
expect_json "conflict points at the existing game" '.gameId' "$GAME_ID"

expect "out-of-range rating rejected" 400 POST /api/games \
  '{"title":"Bad Rating","entry":{"platformId":1,"status":"Backlog","rating":99}}' "$TOKEN"
expect "unknown status rejected" 400 POST /api/games \
  '{"title":"Bad Status","entry":{"platformId":1,"status":"Winning"}}' "$TOKEN"
expect "unknown platform rejected" 400 POST /api/games \
  '{"title":"Bad Platform","entry":{"platformId":9999,"status":"Backlog"}}' "$TOKEN"
expect "empty title rejected" 400 POST /api/games \
  '{"title":"","entry":{"platformId":1,"status":"Backlog"}}' "$TOKEN"

echo
echo "== Reads =="
expect "get by id" 200 GET "/api/games/$GAME_ID"
expect_json "detail carries the summary" '.summary' "A summary."
expect "unknown id is 404" 404 GET /api/games/99999999

expect "list games" 200 GET /api/games
expect_json "list is paged" 'has("totalCount")' true
expect_json "list omits the summary" '.items[0] | has("summary")' false

for sort in title -title added played hours rating year; do
  expect "sort=$sort translates" 200 GET "/api/games?sort=$sort"
done

expect "text search" 200 GET '/api/games?q=smoke'
expect_json "search finds the game" '.totalCount >= 1' true
expect "search escapes wildcards" 200 GET '/api/games?q=100%25'
expect_json "wildcard search is literal" '.totalCount' 0
expect "developer search" 200 GET '/api/games?q=QA%20Studio'
expect_json "developer matched" '.totalCount >= 1' true

expect "status filter" 200 GET '/api/games?status=Playing'
expect_json "status filter matched" '.totalCount >= 1' true
expect "platform filter" 200 GET '/api/games?platformId=1'
expect "favourite filter" 200 GET '/api/games?favourite=true'
expect "minHours filter" 200 GET '/api/games?minHours=0.1'
expect_json "minHours matched" '.totalCount >= 1' true
expect "combined filters and paging" 200 GET '/api/games?status=Playing&platformId=1&sort=hours&page=1&pageSize=5'
expect "bad status is a 400" 400 GET '/api/games?status=Nonsense'
expect "oversized pageSize is a 400" 400 GET '/api/games?pageSize=5000'

expect "stats" 200 GET /api/games/stats
expect_json "stats count games" '.totalGames >= 1' true
expect_json "stats bucket by status" '.gamesByStatus.Playing >= 1' true
expect_json "stats total hours" '.totalHours >= 12.5' true
expect_json "stats average rating" '.averageRating' 8
expect_json "stats top platforms" '.topPlatforms | length >= 1' true

echo
echo "== Update =="
expect "update entry" 200 PUT "/api/games/$GAME_ID/entries/$ENTRY_ID" \
  '{"platformId":1,"status":"Completed","hoursPlayed":20,"rating":null,"notes":null,"mode":null,"hardware":"Modded","startedAt":"2026-01-02T00:00:00Z","completedAt":"2026-02-03T00:00:00Z"}' \
  "$TOKEN"
expect_json "status replaced" '.userEntries[0].status' Completed
expect_json "rating cleared by a null" '.userEntries[0].rating' null
expect_json "notes cleared by a null" '.userEntries[0].notes' null
expect_json "hardware replaced" '.userEntries[0].hardware' Modded
expect_json "dates stored" '.userEntries[0].startedAt != null' true

expect "update rejects a bad rating" 400 PUT "/api/games/$GAME_ID/entries/$ENTRY_ID" \
  '{"platformId":1,"status":"Completed","rating":0}' "$TOKEN"
expect "update rejects an unknown entry" 404 PUT "/api/games/$GAME_ID/entries/99999999" \
  '{"platformId":1,"status":"Completed"}' "$TOKEN"

echo
echo "== Multiple platforms per game =="
expect "add a second entry" 200 POST "/api/games/$GAME_ID/entries" \
  '{"platformId":3,"status":"Backlog","hardware":"Modded"}' "$TOKEN"
expect_json "game now has two entries" '.userEntries | length' 2
SECOND_ENTRY=$(jq -r '.userEntries[1].id' < "$BODY")
expect "same platform twice is a 409" 409 POST "/api/games/$GAME_ID/entries" \
  '{"platformId":3,"status":"Backlog"}' "$TOKEN"
expect "remove the second entry" 200 DELETE "/api/games/$GAME_ID/entries/$SECOND_ENTRY" '' "$TOKEN"
expect_json "one entry left" '.userEntries | length' 1
expect "removing the last entry is a 409" 409 DELETE "/api/games/$GAME_ID/entries/$ENTRY_ID" '' "$TOKEN"

echo
echo "== Favourites =="
expect "favourite on" 200 PATCH "/api/games/$GAME_ID/favourite" '' "$TOKEN"
expect_json "marked favourite" '.isFavourite' true
expect "favourite off" 200 PATCH "/api/games/$GAME_ID/favourite" '' "$TOKEN"
expect_json "unmarked" '.isFavourite' false

echo
echo "== Third-party endpoints report configuration =="
expect "search reports missing credentials" 502 GET '/api/search?q=zelda' '' "$TOKEN"
expect "steam reports missing credentials" 502 GET /api/steam/library '' "$TOKEN"
expect "short search query is a 400" 400 GET '/api/search?q=a' '' "$TOKEN"

echo
echo "== Delete =="
expect "delete game" 204 DELETE "/api/games/$GAME_ID" '' "$TOKEN"
expect "deleted game is gone" 404 GET "/api/games/$GAME_ID"
expect "deleting it again is a 404" 404 DELETE "/api/games/$GAME_ID" '' "$TOKEN"

echo
echo "== Rate limiting (last: it spends the login budget) =="
saw_429=no
for _ in $(seq 1 12); do
  if [ "$(request POST /api/auth/login '{"password":"wrong"}')" = "429" ]; then saw_429=yes; break; fi
done
[ "$saw_429" = "yes" ] && pass "login is rate limited" || fail "login is rate limited" "no 429 in 12 attempts"

echo
if [ "$failures" -eq 0 ]; then
  echo "ALL API CHECKS PASSED"
else
  echo "$failures API CHECK(S) FAILED"
fi
exit "$failures"
