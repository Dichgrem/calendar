default:
    @just --list

# install JS dependencies
install:
    pnpm install

# build frontend and copy to embed directory
build-web: install
    pnpm --filter @calendar/web build
    rm -rf cmd/server/dist
    cp -r web/dist cmd/server/dist

# build Go binary
build-go:
    go build -ldflags="-s -w" -o bin/server ./cmd/server/

# build everything (frontend + go)
build: build-web build-go
	git add cmd/server/dist/

# start dev server (builds frontend first if dist missing)
dev:
    @if [ ! -d cmd/server/dist ]; then echo "Building frontend..."; just build-web; fi
    go run ./cmd/server/

dev-debug:
    cd web && npx vite &
    go run ./cmd/server/

# run all Go unit tests
test:
    go test ./... -count=1

# run tests with verbose output
test-verbose:
    go test ./... -v -count=1

# run benchmarks
bench:
    go test ./... -bench=. -benchmem

# vet
lint:
    go vet ./...
    @pnpm exec biome check web
    @pnpm --filter @calendar/web exec tsc --noEmit

# format Go + web
format:
    go fmt ./...
    @pnpm exec biome format --write web

# clean build artifacts
clean:
    rm -rf bin/ cmd/server/dist/ data/calendar.db

# build Docker image
docker-build:
    docker build -t calendar:latest .

# run Docker container
docker-run:
    docker run -p 3000:3000 -v $(pwd)/data:/app/data calendar:latest

# build and start Docker
docker-up:
    docker compose up --build -d

# stop Docker
docker-down:
    docker compose down

# view Docker logs
docker-logs:
    docker compose logs -f

# smoke test before tagging a release
pre-release:
    go test ./... -count=1
    pnpm --filter @calendar/web build
    go build -o /dev/null ./cmd/server/
    @echo "All checks passed — ready to publish"
