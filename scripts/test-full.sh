#!/usr/bin/env bash
# Full integration test — single session, tests CRUD flow end-to-end.
# Usage: ./scripts/test-full.sh
set -euo pipefail

BASE="http://localhost:3000"
COOKIE="/tmp/calendar_test_cookies"
USER="admin"
PW="admin123"
rm -f "$COOKIE"

echo "=== Health Check ==="
curl -s "$BASE/api/health" | jq
echo ""

echo "=== Auth Status ==="
STATUS=$(curl -s "$BASE/api/auth/status" | jq -r .data.registered)
echo "Registered: $STATUS"
echo ""

if [ "$STATUS" = "false" ]; then
    echo "=== Register ==="
    curl -s -X POST "$BASE/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" \
        -c "$COOKIE" | jq
    echo ""
fi

echo "=== Login ==="
curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" \
    -c "$COOKIE" | jq
echo ""

echo "=== Current User ==="
curl -s "$BASE/api/auth/me" -b "$COOKIE" | jq
echo ""

echo "=== List Calendars ==="
curl -s "$BASE/api/calendars" -b "$COOKIE" | jq '{count: (.data | length), names: [.data[].name]}'
echo ""

echo "=== Create Calendar ==="
CID=$(curl -s -X POST "$BASE/api/calendars" \
    -H "Content-Type: application/json" \
    -b "$COOKIE" \
    -d '{"name":"Integration Test","color":"#8b5cf6"}' | jq -r .data.id)
echo "Created: $CID"
echo ""

echo "=== Update Calendar ==="
curl -s -X PATCH "$BASE/api/calendars/$CID" \
    -H "Content-Type: application/json" \
    -b "$COOKIE" \
    -d '{"name":"Integration Test v2"}' | jq '{name: .data.name}'
echo ""

echo "=== Create Event ==="
EID=$(curl -s -X POST "$BASE/api/calendars/$CID/events" \
    -H "Content-Type: application/json" \
    -b "$COOKIE" \
    -d '{"title":"Integration Event","startAt":"2025-12-25T00:00:00.000Z","endAt":"2025-12-25T23:59:59.000Z","allDay":true,"location":"Home"}' | jq -r .data.id)
echo "Event: $EID"
echo ""

echo "=== List Events ==="
curl -s "$BASE/api/calendars/$CID/events?start=2025-01-01T00:00:00.000Z&end=2026-01-01T00:00:00.000Z" -b "$COOKIE" \
    | jq '{count: (.data | length), titles: [.data[].title]}'
echo ""

echo "=== Update Event ==="
curl -s -X PATCH "$BASE/api/events/$EID" \
    -H "Content-Type: application/json" \
    -b "$COOKIE" \
    -d '{"title":"Updated Integration Event"}' | jq '{title: .data.title}'
echo ""

echo "=== Get Settings ==="
curl -s "$BASE/api/settings" -b "$COOKIE" | jq
echo ""

echo "=== Update Settings ==="
curl -s -X PATCH "$BASE/api/settings" \
    -H "Content-Type: application/json" \
    -b "$COOKIE" \
    -d '{"language":"en","showLunarCalendar":true}' | jq
echo ""

echo "=== ICS Export ==="
curl -s "$BASE/api/calendars/$CID/ics/export" -b "$COOKIE" | head -5
echo ""

echo "=== Sync Pull ==="
curl -s "$BASE/api/sync/pull?last_pulled_seq=0" -b "$COOKIE" | jq '{tables: (.data | keys)}'
echo ""

echo "=== Delete Event ==="
curl -s -X DELETE "$BASE/api/events/$EID" -b "$COOKIE" | jq
echo ""

echo "=== Delete Calendar ==="
curl -s -X DELETE "$BASE/api/calendars/$CID" -b "$COOKIE" | jq
echo ""

echo "=== Logout ==="
curl -s -X POST "$BASE/api/auth/logout" -b "$COOKIE" | jq
echo ""

echo "Done."
