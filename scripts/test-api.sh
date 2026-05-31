#!/usr/bin/env bash
# API test recipes for calendar app.
# Requires test server: ./scripts/test-run.sh
# Usage: ./scripts/test-api.sh [test-name|all]
#   ./scripts/test-api.sh all        # run all tests
#   ./scripts/test-api.sh login      # run single test
#   ./scripts/test-api.sh            # list available tests
set -euo pipefail

BASE="http://localhost:3000"
COOKIE="/tmp/calendar_test_cookies"
USER="admin"
PW="admin123"

login() {
    rm -f "$COOKIE"
    curl -s -X POST "$BASE/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" \
        -c "$COOKIE" > /dev/null
}

# ─── Auth ───

test-health() {
    echo "=== health ==="
    curl -s "$BASE/api/health" | jq
}

test-status() {
    echo "=== auth/status ==="
    curl -s "$BASE/api/auth/status" | jq
}

test-register() {
    echo "=== register ==="
    curl -s -X POST "$BASE/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" \
        -c "$COOKIE" | jq
}

test-register-dup() {
    echo "=== register duplicate (expect 403) ==="
    curl -s -X POST "$BASE/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" | jq '{status: .error.code}'
}

test-login() {
    echo "=== login ==="
    curl -s -X POST "$BASE/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"$PW\"}" \
        -c "$COOKIE" | jq
}

test-login-wrong() {
    echo "=== login wrong (expect 401) ==="
    curl -s -X POST "$BASE/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$USER\",\"password\":\"wrong\"}" | jq
}

test-me() {
    echo "=== auth/me ==="
    login
    curl -s "$BASE/api/auth/me" -b "$COOKIE" | jq
}

test-change-password() {
    echo "=== change-password ==="
    login
    curl -s -X POST "$BASE/api/auth/change-password" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d "{\"oldPassword\":\"$PW\",\"newPassword\":\"newpass456\"}" | jq
}

test-logout() {
    echo "=== logout ==="
    login
    curl -s -X POST "$BASE/api/auth/logout" -b "$COOKIE" | jq
}

test-auth-guard() {
    echo "=== no auth (expect error) ==="
    curl -s "$BASE/api/calendars" | jq
}

# ─── Settings ───

test-settings-get() {
    echo "=== settings get ==="
    login
    curl -s "$BASE/api/settings" -b "$COOKIE" | jq
}

test-settings-update() {
    echo "=== settings update ==="
    login
    curl -s -X PATCH "$BASE/api/settings" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"language":"en","showLunarCalendar":true,"firstDayOfWeek":1}' | jq
}

# ─── Calendars ───

test-calendar-list() {
    echo "=== calendar list ==="
    login
    curl -s "$BASE/api/calendars" -b "$COOKIE" | jq '{count: (.data | length), names: [.data[].name]}'
}

test-calendar-create() {
    echo "=== calendar create ==="
    login
    curl -s -X POST "$BASE/api/calendars" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"name":"Test Calendar","color":"#ef4444"}' | jq '{name: .data.name, color: .data.color}'
}

test-calendar-get() {
    echo "=== calendar get ==="
    login
    ID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    curl -s "$BASE/api/calendars/$ID" -b "$COOKIE" | jq '{name: .data.name, color: .data.color}'
}

test-calendar-update() {
    echo "=== calendar update ==="
    login
    ID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    curl -s -X PATCH "$BASE/api/calendars/$ID" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"name":"Renamed Calendar"}' | jq '{name: .data.name}'
}

test-calendar-delete() {
    echo "=== calendar delete ==="
    login
    curl -s -X POST "$BASE/api/calendars" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"name":"To Delete","color":"#22c55e"}' > /dev/null
    ID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[1].id')
    curl -s -X DELETE "$BASE/api/calendars/$ID" -b "$COOKIE" | jq
}

# ─── Events ───

test-event-create() {
    echo "=== event create ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    curl -s -X POST "$BASE/api/calendars/$CID/events" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"title":"Test Event","startAt":"2025-06-15T09:00:00.000Z","endAt":"2025-06-15T10:00:00.000Z","allDay":false,"description":"Test desc"}' \
        | jq '{title: .data.title, id: .data.id}'
}

test-event-get() {
    echo "=== event get ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    EID=$(curl -s -X POST "$BASE/api/calendars/$CID/events" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"title":"Detail Test","startAt":"2025-07-01T00:00:00.000Z","endAt":"2025-07-01T23:59:59.000Z","allDay":true}' | jq -r .data.id)
    curl -s "$BASE/api/events/$EID" -b "$COOKIE" | jq '{title: .data.title, allDay: .data.allDay}'
}

test-event-list() {
    echo "=== event list ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    curl -s "$BASE/api/calendars/$CID/events?start=2025-06-01T00:00:00.000Z&end=2025-06-30T23:59:59.000Z" -b "$COOKIE" \
        | jq '{count: (.data | length), titles: [.data[].title]}'
}

test-event-update() {
    echo "=== event update ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    EID=$(curl -s -X POST "$BASE/api/calendars/$CID/events" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"title":"Old","startAt":"2025-08-01T00:00:00.000Z","endAt":"2025-08-01T23:59:59.000Z"}' | jq -r .data.id)
    curl -s -X PATCH "$BASE/api/events/$EID" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"title":"Updated","location":"Home"}' | jq '{title: .data.title, location: .data.location}'
}

test-event-delete() {
    echo "=== event delete ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    EID=$(curl -s -X POST "$BASE/api/calendars/$CID/events" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d '{"title":"Del","startAt":"2025-09-01T00:00:00.000Z","endAt":"2025-09-01T23:59:59.000Z"}' | jq -r .data.id)
    curl -s -X DELETE "$BASE/api/events/$EID" -b "$COOKIE" | jq
}

# ─── ICS ───

test-ics-preview() {
    echo "=== ics preview ==="
    login
    curl -s -X POST "$BASE/api/ics/preview" \
        -H "Content-Type: application/json" \
        -b "$COOKIE" \
        -d "{\"content\":\"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test//EN\nBEGIN:VEVENT\nUID:t1@x.com\nDTSTART:20250615T090000Z\nDTEND:20250615T100000Z\nSUMMARY:ICS Event\nEND:VEVENT\nEND:VCALENDAR\"}" \
        | jq '{count: (.data.count), titles: [.data.items[].summary]}'
}

test-ics-export() {
    echo "=== ics export ==="
    login
    CID=$(curl -s "$BASE/api/calendars" -b "$COOKIE" | jq -r '.data[0].id')
    echo "Calendar: $CID"
    curl -s "$BASE/api/calendars/$CID/ics/export" -b "$COOKIE" | head -5
}

# ─── Backup ───

test-backup-create() {
    echo "=== backup create ==="
    login
    curl -s -X POST "$BASE/api/backup" -b "$COOKIE" | jq
}

test-backup-list() {
    echo "=== backup list ==="
    login
    curl -s "$BASE/api/backups" -b "$COOKIE" | jq
}

# ─── Sync ───

test-sync-pull() {
    echo "=== sync pull ==="
    login
    curl -s "$BASE/api/sync/pull?last_pulled_seq=0" -b "$COOKIE" | jq
}

# ────────────────────────────────────────

ALL_TESTS=(
    test-health test-status test-register test-register-dup test-login test-login-wrong
    test-me test-settings-get test-settings-update
    test-calendar-list test-calendar-create test-calendar-get test-calendar-update test-calendar-delete
    test-event-create test-event-get test-event-list test-event-update test-event-delete
    test-ics-preview test-ics-export
    test-backup-create test-backup-list
    test-sync-pull test-change-password test-logout test-auth-guard
)

list_tests() {
    echo "Available tests:"
    for t in "${ALL_TESTS[@]}"; do
        echo "  $t"
    done
}

run_all() {
    for t in "${ALL_TESTS[@]}"; do
        echo ""
        $t
    done
}

case "${1:-}" in
    ""|list)  list_tests ;;
    all)      run_all ;;
    *)        if declare -f "test-$1" > /dev/null 2>&1; then "test-$1"; else echo "Unknown test: $1"; list_tests; exit 1; fi ;;
esac
