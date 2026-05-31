default:
    @just --list

# install dependencies
install:
    pnpm install

# start dev server
start:
    @echo "Starting dev server..."
    pnpm --filter @calendar/server dev &
    echo $! > /tmp/calendar-server.pid
    @echo "Server running (PID: $(cat /tmp/calendar-server.pid))"

# stop dev server
stop:
    @[ -f /tmp/calendar-server.pid ] && kill $(cat /tmp/calendar-server.pid) 2>/dev/null && rm -f /tmp/calendar-server.pid && echo "Server stopped" || echo "No server running"

# format source code
format:
    biome format --write packages/ 2>/dev/null || echo "biome not installed, run: nix develop"

# run tests (to be added before release)
test:
    @echo "Tests will be added at demo stage. Skipping."

# typecheck all packages
typecheck:
    pnpm --filter @calendar/server typecheck 2>/dev/null || pnpm typecheck

# clean build artifacts
clean:
    rm -rf packages/*/dist .turbo node_modules/.cache
    rm -f /tmp/calendar-server.pid
