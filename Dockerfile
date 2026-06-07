# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/web/ packages/web/
COPY packages/shared/ packages/shared/

RUN pnpm --filter @calendar/web build

# Stage 2: Build Go binary
FROM golang:1.25-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/packages/web/dist ./cmd/server/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /server ./cmd/server/

# Stage 3: Runtime
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=go-builder /server .
EXPOSE 3000
ENV PORT=3000
ENV DATABASE_URL=/app/data/calendar.db
ENV SECURE_COOKIES=true
VOLUME ["/app/data"]
ENTRYPOINT ["./server"]
