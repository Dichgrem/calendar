default:
    @just --list

# install JS dependencies (for frontend)
install:
    pnpm install

# build frontend into web/dist
build-web: install
    pnpm --filter @calendar/web build

# build Go binary (require pnpm build first)
build-go:
    go build -o ./bin/server ./cmd/server/

# build everything
build: build-web build-go

# start dev server with auto-reload
dev:
    go run ./cmd/server/

# run all Go unit tests
test:
    go test ./... -count=1

# run tests with verbose output
test-verbose:
    go test ./... -v -count=1

# run benchmarks (if any)
bench:
    go test ./... -bench=. -benchmem

# vet + staticcheck
lint:
    go vet ./...

# format all Go code
format:
    go fmt ./...

# clean build artifacts
clean:
    rm -rf bin/ data/calendar.db

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
