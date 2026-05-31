# Development Guide

## Requirements

- Node.js ≥ 24
- pnpm ≥ 8

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev servers
just start

# Or start separately
pnpm --filter @calendar/server dev
pnpm --filter @calendar/web dev
```

Visit http://localhost:5173 (proxies `/api` → http://localhost:3000)

## Nix Development Environment

A Nix Flake provides a reproducible environment with Node.js, pnpm, and Biome.

```bash
# With direnv (auto-activates on `cd`)
echo "use flake" > .envrc
direnv allow

# Or activate manually
nix develop
```

## Common Commands

| Command | Description |
|---------|-------------|
| `just start` | Start dev environment |
| `just stop` | Stop services |
| `just format` | Format code with Biome |
| `just typecheck` | Type check |
| `just clean` | Clean build artifacts |
| `just cf-deploy` | Deploy to Cloudflare Workers |
| `just docker-up` | Build and start Docker container |
| `just docker-down` | Stop Docker container |
| `just docker-logs` | View Docker logs |

## Project Structure

```
calendar/
├── packages/
│   ├── server/          # Hono backend
│   │   ├── src/
│   │   │   ├── auth/    # Authentication
│   │   │   ├── db/      # Database
│   │   │   ├── routes/  # API routes
│   │   │   ├── services/# Business logic
│   │   │   └── sync/    # Sync protocol
│   │   └── wrangler.toml
│   └── web/             # React frontend
│       ├── src/
│       │   ├── components/
│       │   │   └── ui/  # CVA button, modal
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── pages/
│       └── index.html
├── docs/                # Documentation
├── biome.json           # Code formatter config
├── flake.nix            # Nix environment
├── Justfile             # Task commands
└── turbo.json           # Turborepo config
```

## Database

### Generate Migration

```bash
cd packages/server
pnpm db:generate
```

### Run Migration

```bash
pnpm db:migrate
```

## Code Standards

- TypeScript strict mode
- Biome for formatting (2 spaces, 100 char line width)
- Conventional Commits

## Key Technology Details

| Tech | Purpose |
|------|---------|
| React 19 + Vite 6 | SPA frontend |
| FullCalendar v6 | Month view rendering |
| TanStack Query v5 | Server state + caching |
| React Router v7 | Client-side routing |
| Tailwind CSS 3 + CVA | Atomic CSS + component variants |
| Radix UI | Headless component primitives (Dialog, Select, Popover, Slot) |
| Lucide React | SVG icon library |
| Hono v4 | Lightweight web framework |
| Drizzle ORM | Type-safe SQL query builder |
| SQLite (better-sqlite3) | Embedded database |
| Cloudflare D1 | Production database |
| scrypt-js | Password hashing (sync, compatible with Node.js and Workers) |
| Biome | Code formatting |
