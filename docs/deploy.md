# Deployment Guide

## Cloudflare Workers

### One-Click Deploy

```bash
just cf-deploy
```

This script handles: copying `wrangler.toml` → creating D1 database → running migrations → setting `SESSION_SECRET` → deploying.

### Manual Steps

```bash
# 1. Clone project
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. Install dependencies
pnpm install

# 3. Copy example config
cd packages/server
cp wrangler.toml.example wrangler.toml

# 4. Create D1 database
pnpm cf:d1:create
# The --update-config flag auto-fills database_id in wrangler.toml

# 5. Run migrations
pnpm cf:d1:migrate

# 6. Set secrets
npx wrangler secret put SESSION_SECRET

# 7. Deploy (includes frontend build)
cd ../..
pnpm --filter @calendar/web build
cd packages/server
pnpm cf:deploy
```

### Update Deployment

```bash
cd calendar
git pull
pnpm install
cd packages/server
pnpm cf:d1:migrate
pnpm cf:deploy
```

## Docker

### Using Justfile (recommended)

```bash
just docker-up       # build & start
just docker-logs     # view logs
just docker-down     # stop
```

### Using Docker Compose

```bash
docker compose up -d
```

Migrations auto-run on startup (no manual step needed). Access at http://localhost:3000.

### Using Dockerfile

```bash
docker build -t calendar .
docker run -d -p 3000:3000 \
  -v calendar-data:/app/data \
  -e DATABASE_URL=/app/data/calendar.db \
  -e SESSION_SECRET=your-secret \
  --name calendar calendar
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_SECRET` | Session signing secret | Yes |
| `CORS_ORIGIN` | Allowed CORS origin | No |
| `DATABASE_URL` | SQLite database path (Node.js only) | No |
| `PORT` | Server port (default 3000) | No |
