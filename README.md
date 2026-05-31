<p align="right">
  <a href="README.md">English</a> |
  <a href="README_zh-CN.md">简体中文</a>
</p>

# Calendar

A lightweight, self-hosted calendar application with ICS import/export and lunar calendar support.

---

## Features

- **Multi-platform** — Cloudflare Workers, Node.js / Docker
- **Web UI** — FullCalendar month view, light/dark mode, mobile responsive
- **Single-user auth** — Password-based login with session cookies
- **ICS import/export** — File upload, remote URL, calendar management
- **Lunar calendar** — Built-in Chinese lunar date display
- **Event search** — Global search with calendar filter
- **Common calendars** — One-click subscribe to Chinese holidays, festivals, solar terms
- **Date format** — Customizable date/time display
- **i18n** — Chinese and English support

---

## Quick Start

### Cloudflare Workers (recommended, free)

```bash
# 1. Clone and enter the project
git clone https://github.com/Dichgrem/calendar.git
cd calendar

# 2. Install dependencies
pnpm install

# 3. Copy and edit config
cd packages/server
cp wrangler.toml.example wrangler.toml

# 4. Create D1 database, fill database_id into wrangler.toml
pnpm cf:d1:create

# 5. Run migrations and set session secret
pnpm cf:d1:migrate
npx wrangler secret put SESSION_SECRET

# 6. Deploy
pnpm cf:deploy
```

### Node.js / Docker

**Direct Node.js:**
```bash
cd calendar
pnpm install
pnpm dev
# Server: http://localhost:3000
# Web: http://localhost:5173
```

**Docker:**
```bash
docker build -t calendar .
docker run -d -p 3000:3000 -v calendar-data:/data --name calendar calendar
```

---

## Documentation

| Doc | EN | 中文 |
|---|---|---|
| Usage Guide | [usage.md](docs/usage.md) | [usage_zh-CN.md](docs/usage_zh-CN.md) |
| Deployment | [deploy.md](docs/deploy.md) | [deploy_zh-CN.md](docs/deploy_zh-CN.md) |
| API Reference | [api.md](docs/api.md) | [api_zh-CN.md](docs/api_zh-CN.md) |
| Development Guide | [dev-guide.md](docs/dev-guide.md) | [dev-guide_zh-CN.md](docs/dev-guide_zh-CN.md) |
| Architecture & Structure | [structure.md](docs/structure.md) | [structure_zh-CN.md](docs/structure_zh-CN.md) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 6, FullCalendar v6, TanStack Query v5 |
| Styling | Tailwind CSS 3, CVA, Radix UI, Lucide React |
| Backend | Hono v4, Drizzle ORM |
| Database | SQLite (better-sqlite3), Cloudflare D1 |
| Auth | scrypt password hashing, httpOnly cookie sessions |
| Tooling | pnpm, Turborepo, Biome, Nix Flake |

---

## License

[GNU AGPL v3.0](LICENSE)
