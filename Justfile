default:
    @just --list

# install JS dependencies
install:
    pnpm install

# run all Go unit tests
test:
    go test ./... -count=1
    @pnpm test

# run tests with verbose output
test-verbose:
    go test ./... -v -count=1

# format Go + web
format:
    go fmt ./...
    @pnpm exec biome format --write web

# vet
lint:
    go vet ./...
    golangci-lint run
    @pnpm exec biome check web
    @pnpm --filter @calendar/web exec tsc --noEmit
    @pnpm exec madge --circular --extensions ts,tsx web/src/main.tsx

# run benchmarks
bench:
    go test ./... -bench=. -benchmem

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

# start dev server (builds frontend first if dist missing)
dev:
    @if [ ! -d cmd/server/dist ]; then echo "Building frontend..."; just build-web; fi
    go run ./cmd/server/

dev-debug:
    cd web && npx vite &
    go run ./cmd/server/

# clean build artifacts
clean:
    rm -rf bin/ cmd/server/dist/ data/calendar.db
