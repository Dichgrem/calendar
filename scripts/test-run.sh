#!/usr/bin/env bash
# Start test server with clean DB.
# Usage: ./scripts/test-run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

kill $(lsof -ti:3000) 2>/dev/null || true
rm -f packages/server/data/test.db

echo "Running migrations..."
(cd packages/server && DATABASE_URL="data/test.db" npx drizzle-kit migrate)

echo "Starting test server on http://localhost:3000"
(cd packages/server && DATABASE_URL="data/test.db" SESSION_SECRET="test-secret-key-123" npx tsx src/index.ts)
