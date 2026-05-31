default:
    @just --list

# install dependencies
install:
    pnpm install

# start dev servers
start: install
    @pnpm --filter @calendar/server dev & pnpm --filter @calendar/web dev & wait

# stop dev servers
stop:
    @kill $(lsof -ti:3000) 2>/dev/null; kill $(lsof -ti:5173) 2>/dev/null; true

# clean build artifacts
clean:
    rm -rf packages/*/dist .turbo node_modules/.cache

# format source files with Biome
format:
    biome format --write packages/

# typecheck all packages
typecheck:
    pnpm run typecheck

# one-click Cloudflare Workers deployment
cf-deploy: install
    ./scripts/cf-deploy.sh

# start test server with clean DB
test-run:
    ./scripts/test-run.sh

# run all API tests (requires test-run in another tab)
test-all:
    ./scripts/test-api.sh all

# run full integration test (requires test-run in another tab)
test-full:
    ./scripts/test-full.sh

# run a single API test, e.g. just test login
test name:
    ./scripts/test-api.sh {{ name }}

# build and start Docker container
docker-up:
    docker compose up --build -d

# stop Docker container
docker-down:
    docker compose down

# view Docker logs
docker-logs:
    docker compose logs -f

# rebuild and restart Docker container
docker-rebuild:
    docker compose up --build -d --force-recreate
