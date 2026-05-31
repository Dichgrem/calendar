#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1/4 Config ==="
NEED_UPDATE=false
if [ ! -f packages/server/wrangler.toml ]; then
    NEED_UPDATE=true
elif grep -q "\[build\]" packages/server/wrangler.toml 2>/dev/null; then
    NEED_UPDATE=true
elif ! grep -q '\[assets\]' packages/server/wrangler.toml 2>/dev/null; then
    NEED_UPDATE=true
elif ! grep -q 'compatibility_date = "2024-09-23"' packages/server/wrangler.toml 2>/dev/null; then
    NEED_UPDATE=true
elif ! grep -qE '^database_id = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' packages/server/wrangler.toml 2>/dev/null; then
    NEED_UPDATE=true
fi
if [ "$NEED_UPDATE" = true ]; then
    if [ -f packages/server/wrangler.toml ]; then
        OLD_ID=$(grep '^database_id' packages/server/wrangler.toml | sed 's/.*= *"//' | sed 's/"//')
    fi
    cp packages/server/wrangler.toml.example packages/server/wrangler.toml
    if echo "${OLD_ID:-}" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 2>/dev/null; then
        sed -i "s~REPLACE_WITH_YOUR_D1_DATABASE_ID~$OLD_ID~" packages/server/wrangler.toml
    fi
    echo "Updated wrangler.toml"
fi

echo "=== 2/4 D1 Create + Migrate ==="
if grep -q "REPLACE_WITH" packages/server/wrangler.toml 2>/dev/null; then
    echo "Creating D1 database..."
    if (cd packages/server && pnpm cf:d1:create) 2>/dev/null; then
        echo "D1 created"
    else
        ID=$(cd packages/server && npx wrangler d1 list --json 2>/dev/null | jq -r '.[] | select(.name=="calendar-db") | .uuid')
        if [ -n "$ID" ] && [ "$ID" != "null" ]; then
            sed -i "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$ID/" packages/server/wrangler.toml
            echo "Found existing D1: $ID"
        else
            echo "ERROR: cannot create or find D1 database"
            exit 1
        fi
    fi
else
    echo "D1 already configured, skip create"
fi
echo "Running migrations..."
(cd packages/server && pnpm cf:d1:migrate)

echo "=== 3/4 SESSION_SECRET ==="
if ! (cd packages/server && npx wrangler secret list 2>/dev/null | grep -q SESSION_SECRET); then
    (cd packages/server && npx wrangler secret put SESSION_SECRET)
else
    echo "SESSION_SECRET already set, skip"
fi

echo "=== 4/4 Build Frontend + Deploy ==="
pnpm --filter @calendar/web build
(cd packages/server && pnpm cf:deploy)
echo "Done."
