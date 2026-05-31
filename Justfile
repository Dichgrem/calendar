default:
    @just --list

# install dependencies
install:
    pnpm install

# start dev servers
start: install
    @echo "Starting server + web..."
    @pnpm --filter @calendar/server dev & pnpm --filter @calendar/web dev & wait

# stop dev servers
stop:
    @kill $(lsof -ti:3000) 2>/dev/null; kill $(lsof -ti:5173) 2>/dev/null; true
    @echo "Stopped"

# clean build artifacts
clean:
    rm -rf packages/*/dist .turbo node_modules/.cache

# format source files with Biome
format:
    biome format --write packages/

# typecheck all packages
typecheck:
    pnpm run typecheck

# ─────────────────────────────────────────────
#  API tests (requires "just test-run" in another tab)
#  Test credentials: admin / admin123
# ─────────────────────────────────────────────

BASE := "http://localhost:3000"
COOKIE := "/tmp/calendar_test_cookies"
USER := "admin"
PW := "admin123"

# start test server (kill old server, start fresh with clean DB)
test-run:
    @kill $(lsof -ti:3000) 2>/dev/null; true
    @rm -f packages/server/data/test.db
    @echo "Running migrations..."
    @cd packages/server && DATABASE_URL="data/test.db" npx drizzle-kit migrate
    @echo "Starting test server on {{ BASE }}"
    @cd packages/server && DATABASE_URL="data/test.db" SESSION_SECRET="test-secret-key-123" npx tsx src/index.ts

# run all test recipes
test-all: test-health test-status test-register test-register-dup test-login test-login-wrong test-me test-settings-get test-settings-update test-calendar-list test-calendar-create test-calendar-get test-calendar-update test-calendar-delete test-event-create test-event-get test-event-list test-event-update test-event-delete test-ics-preview test-ics-export test-backup-create test-backup-list test-sync-pull test-change-password test-logout test-auth-guard

# ─── Auth ───

# GET /api/health — health check
test-health:
    #!/usr/bin/env bash
    curl -s {{ BASE }}/api/health | jq

# GET /api/auth/status — check registration status
test-status:
    #!/usr/bin/env bash
    curl -s {{ BASE }}/api/auth/status | jq

# POST /api/auth/register — first user registration
test-register:
    #!/usr/bin/env bash
    curl -s -X POST {{ BASE }}/api/auth/register \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} | jq

# POST /api/auth/register — duplicate registration (expect 403)
test-register-dup:
    #!/usr/bin/env bash
    curl -s -X POST {{ BASE }}/api/auth/register \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' | jq '{status: .error.code}'

# POST /api/auth/login — correct password
test-login:
    #!/usr/bin/env bash
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} | jq

# POST /api/auth/login — wrong password (expect 401)
test-login-wrong:
    #!/usr/bin/env bash
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"wrong"}' | jq

# GET /api/auth/me — current user info
test-me:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s {{ BASE }}/api/auth/me -b {{ COOKIE }} | jq

# POST /api/auth/change-password — change password
test-change-password:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/auth/change-password \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"oldPassword":"{{ PW }}","newPassword":"newpass456"}' | jq

# POST /api/auth/logout — end session
test-logout:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"admin123"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/auth/logout -b {{ COOKIE }} | jq

# Auth guard — protected endpoint without cookie (expect error)
test-auth-guard:
    #!/usr/bin/env bash
    curl -s {{ BASE }}/api/calendars | jq

# ─── Settings ───

# GET /api/settings — get user settings
test-settings-get:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s {{ BASE }}/api/settings -b {{ COOKIE }} | jq

# PATCH /api/settings — update settings
test-settings-update:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X PATCH {{ BASE }}/api/settings \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"language":"en","showLunarCalendar":true,"firstDayOfWeek":1}' | jq

# ─── Calendars ───

# GET /api/calendars — list calendars
test-calendar-list:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq '{count: (.data | length), names: [.data[].name]}'

# POST /api/calendars — create calendar
test-calendar-create:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/calendars \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"name":"Test Calendar","color":"#ef4444"}' | jq '{name: .data.name, color: .data.color}'

# GET /api/calendars/:id — get calendar detail
test-calendar-get:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    ID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    curl -s "{{ BASE }}/api/calendars/$ID" -b {{ COOKIE }} | jq '{name: .data.name, color: .data.color}'

# PATCH /api/calendars/:id — update calendar
test-calendar-update:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    ID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    curl -s -X PATCH "{{ BASE }}/api/calendars/$ID" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"name":"Renamed Calendar"}' | jq '{name: .data.name}'

# DELETE /api/calendars/:id — delete calendar
test-calendar-delete:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/calendars \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"name":"To Delete","color":"#22c55e"}' > /dev/null
    ID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[1].id')
    curl -s -X DELETE "{{ BASE }}/api/calendars/$ID" -b {{ COOKIE }} | jq

# ─── Events ───

# POST /api/calendars/:cid/events — create event
test-event-create:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    curl -s -X POST "{{ BASE }}/api/calendars/$CID/events" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"title":"Test Event","startAt":"2025-06-15T09:00:00.000Z","endAt":"2025-06-15T10:00:00.000Z","allDay":false,"description":"Test description"}' | jq '{title: .data.title, id: .data.id}'

# GET /api/events/:id — get event detail
test-event-get:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    EID=$(curl -s -X POST "{{ BASE }}/api/calendars/$CID/events" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"title":"Detail Test","startAt":"2025-07-01T00:00:00.000Z","endAt":"2025-07-01T23:59:59.000Z","allDay":true}' | jq -r .data.id)
    curl -s "{{ BASE }}/api/events/$EID" -b {{ COOKIE }} | jq '{title: .data.title, allDay: .data.allDay}'

# GET /api/calendars/:cid/events — list events by range
test-event-list:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    curl -s "{{ BASE }}/api/calendars/$CID/events?start=2025-06-01T00:00:00.000Z&end=2025-06-30T23:59:59.000Z" -b {{ COOKIE }} | jq '{count: (.data | length), titles: [.data[].title]}'

# PATCH /api/events/:id — update event
test-event-update:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    EID=$(curl -s -X POST "{{ BASE }}/api/calendars/$CID/events" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"title":"Old Title","startAt":"2025-08-01T00:00:00.000Z","endAt":"2025-08-01T23:59:59.000Z"}' | jq -r .data.id)
    curl -s -X PATCH "{{ BASE }}/api/events/$EID" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"title":"Updated Title","location":"Home"}' | jq '{title: .data.title, location: .data.location}'

# DELETE /api/events/:id — soft-delete event
test-event-delete:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    EID=$(curl -s -X POST "{{ BASE }}/api/calendars/$CID/events" \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d '{"title":"To Delete","startAt":"2025-09-01T00:00:00.000Z","endAt":"2025-09-01T23:59:59.000Z"}' | jq -r .data.id)
    curl -s -X DELETE "{{ BASE }}/api/events/$EID" -b {{ COOKIE }} | jq

# ─── ICS ───

# POST /api/ics/preview — preview ICS content
test-ics-preview:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/ics/preview \
    	-H "Content-Type: application/json" \
    	-b {{ COOKIE }} \
    	-d "{\"content\":\"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Test//EN\nBEGIN:VEVENT\nUID:test-1@example.com\nDTSTART:20250615T090000Z\nDTEND:20250615T100000Z\nSUMMARY:ICS Test Event\nEND:VEVENT\nEND:VCALENDAR\"}" | jq '{count: (.data.count), titles: [.data.items[].summary]}'

# GET /api/calendars/:cid/ics/export — export ICS
test-ics-export:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    CID=$(curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq -r '.data[0].id')
    echo "Calendar: $CID"
    curl -s "{{ BASE }}/api/calendars/$CID/ics/export" -b {{ COOKIE }} | head -5

# ─── Backup ───

# POST /api/backup — create backup
test-backup-create:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s -X POST {{ BASE }}/api/backup -b {{ COOKIE }} | jq

# GET /api/backups — list backups
test-backup-list:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s {{ BASE }}/api/backups -b {{ COOKIE }} | jq

# ─── Sync ───

# GET /api/sync/pull — pull changes
test-sync-pull:
    #!/usr/bin/env bash
    rm -f {{ COOKIE }}
    curl -s -X POST {{ BASE }}/api/auth/login \
    	-H "Content-Type: application/json" \
    	-d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
    	-c {{ COOKIE }} > /dev/null
    curl -s "{{ BASE }}/api/sync/pull?last_pulled_seq=0" -b {{ COOKIE }} | jq

# ─────────────────────────────────────────────
#  Full integration test (single script)
# ─────────────────────────────────────────────

# run all tests in a single session
test-full:
    #!/usr/bin/env bash
    set -e
    echo "=== Health Check ==="
    curl -s {{ BASE }}/api/health | jq
    echo ""

    echo "=== Auth Status ==="
    STATUS=$(curl -s {{ BASE }}/api/auth/status | jq -r .data.registered)
    echo "Registered: $STATUS"
    echo ""

    if [ "$STATUS" = "false" ]; then
        echo "=== Register ==="
        curl -s -X POST {{ BASE }}/api/auth/register \
            -H "Content-Type: application/json" \
            -d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
            -c {{ COOKIE }} | jq
        echo ""
    fi

    echo "=== Login ==="
    curl -s -X POST {{ BASE }}/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"{{ USER }}","password":"{{ PW }}"}' \
        -c {{ COOKIE }} | jq
    echo ""

    echo "=== Current User ==="
    curl -s {{ BASE }}/api/auth/me -b {{ COOKIE }} | jq
    echo ""

    echo "=== List Calendars ==="
    curl -s {{ BASE }}/api/calendars -b {{ COOKIE }} | jq '{count: (.data | length), names: [.data[].name]}'
    echo ""

    echo "=== Create Calendar ==="
    CID=$(curl -s -X POST {{ BASE }}/api/calendars \
        -H "Content-Type: application/json" \
        -b {{ COOKIE }} \
        -d '{"name":"Integration Test","color":"#8b5cf6"}' | jq -r .data.id)
    echo "Created: $CID"
    echo ""

    echo "=== Update Calendar ==="
    curl -s -X PATCH "{{ BASE }}/api/calendars/$CID" \
        -H "Content-Type: application/json" \
        -b {{ COOKIE }} \
        -d '{"name":"Integration Test v2"}' | jq '{name: .data.name}'
    echo ""

    echo "=== Create Event ==="
    EID=$(curl -s -X POST "{{ BASE }}/api/calendars/$CID/events" \
        -H "Content-Type: application/json" \
        -b {{ COOKIE }} \
        -d '{"title":"Integration Event","startAt":"2025-12-25T00:00:00.000Z","endAt":"2025-12-25T23:59:59.000Z","allDay":true,"location":"Home"}' | jq -r .data.id)
    echo "Event: $EID"
    echo ""

    echo "=== List Events ==="
    curl -s "{{ BASE }}/api/calendars/$CID/events?start=2025-01-01T00:00:00.000Z&end=2026-01-01T00:00:00.000Z" -b {{ COOKIE }} | jq '{count: (.data | length), titles: [.data[].title]}'
    echo ""

    echo "=== Update Event ==="
    curl -s -X PATCH "{{ BASE }}/api/events/$EID" \
        -H "Content-Type: application/json" \
        -b {{ COOKIE }} \
        -d '{"title":"Updated Integration Event"}' | jq '{title: .data.title}'
    echo ""

    echo "=== Get Settings ==="
    curl -s {{ BASE }}/api/settings -b {{ COOKIE }} | jq
    echo ""

    echo "=== Update Settings ==="
    curl -s -X PATCH {{ BASE }}/api/settings \
        -H "Content-Type: application/json" \
        -b {{ COOKIE }} \
        -d '{"language":"en","showLunarCalendar":true}' | jq
    echo ""

    echo "=== ICS Export ==="
    curl -s "{{ BASE }}/api/calendars/$CID/ics/export" -b {{ COOKIE }} | head -5
    echo ""

    echo "=== Sync Pull ==="
    curl -s "{{ BASE }}/api/sync/pull?last_pulled_seq=0" -b {{ COOKIE }} | jq '{tables: (.data.changes | keys)}'
    echo ""

    echo "=== Delete Event ==="
    curl -s -X DELETE "{{ BASE }}/api/events/$EID" -b {{ COOKIE }} | jq
    echo ""

    echo "=== Delete Calendar ==="
    curl -s -X DELETE "{{ BASE }}/api/calendars/$CID" -b {{ COOKIE }} | jq
    echo ""

    echo "=== Logout ==="
    curl -s -X POST {{ BASE }}/api/auth/logout -b {{ COOKIE }} | jq
    echo ""

    echo "Done."
