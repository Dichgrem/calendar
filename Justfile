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
