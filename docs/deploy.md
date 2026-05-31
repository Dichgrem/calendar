# Deployment Guide

## Cloudflare Workers

### Prerequisites

1. Register [Cloudflare](https://cloudflare.com) account
2. Install wrangler: `npm install -g wrangler`
3. Login: `wrangler login`

### Deployment Steps

```bash
# 1. Clone project
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. Install dependencies
pnpm install

# 3. Create D1 database
cd packages/server
pnpm cf:d1:create
# Record the returned database_id

# 4. Update config
# Edit packages/server/wrangler.toml
# Replace database_id

# 5. Run migrations
pnpm cf:d1:migrate

# 6. Set secrets
wrangler secret put SESSION_SECRET

# 7. Deploy
pnpm cf:deploy
```

### Update Deployment

```bash
cd calendar
git pull
pnpm install
cd packages/server
pnpm cf:deploy
```

## Docker

### Using Dockerfile

```bash
# Build
docker build -t calendar .

# Run
docker run -d -p 3000:3000 \
  -v calendar-data:/app/packages/server/data \
  -e SESSION_SECRET=your-secret \
  --name calendar calendar
```

### Using Docker Compose

```bash
docker compose up -d
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_SECRET` | Session signing secret | Yes |
| `CORS_ORIGIN` | Allowed CORS origin | No |
| `DATABASE_URL` | SQLite database path | No |
