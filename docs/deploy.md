# Deployment Guide

## Cloudflare Workers

### Prerequisites

1. Register [Cloudflare](https://cloudflare.com) account
2. Login: `npx wrangler login`

### Deployment Steps

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
# Copy the returned database_id into wrangler.toml

# 5. Run migrations
pnpm cf:d1:migrate

# 6. Set secrets
npx wrangler secret put SESSION_SECRET

# 7. Deploy
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
| `DATABASE_URL` | SQLite database path (Node.js only) | No |
