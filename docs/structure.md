# Project Structure

## Overview

```
calendar/
├── packages/
│   ├── server/              # Backend (Hono + Drizzle + SQLite)
│   └── web/                 # Frontend (React 19 + Vite + FullCalendar)
├── docs/                    # Documentation
├── biome.json               # Code formatting
├── flake.nix                # Nix dev environment
├── Justfile                 # Task commands
└── turbo.json               # Turborepo config
```

## Server (`packages/server/`)

```
server/
├── src/
│   ├── auth/
│   │   ├── auth.routes.ts   # Login/register/logout/change-password endpoints
│   │   ├── auth.service.ts  # scrypt password hashing, session management
│   │   ├── middleware.ts     # Session validation (httpOnly cookie, 30-day expiry)
│   │   └── permissions.query.ts  # RBAC query-level permission injection
│   ├── db/
│   │   ├── client.ts        # SQLite (better-sqlite3, WAL mode) / D1 connection
│   │   └── schema.ts        # Drizzle table definitions (9 tables)
│   ├── routes/
│   │   ├── calendars.ts     # Calendar CRUD
│   │   ├── events.ts        # Event CRUD + overrides
│   │   ├── ics.ts           # ICS import/export/preview
│   │   └── settings.ts      # User settings + backup/restore
│   ├── services/
│   │   ├── calendar.service.ts
│   │   ├── event.service.ts
│   │   ├── ics.service.ts   # Custom ICS parser + serializer (RFC 5545)
│   │   └── settings.service.ts
│   ├── sync/
│   │   ├── routes.ts        # /sync/pull + /sync/push
│   │   └── sync.service.ts  # WatermelonDB-style pull/push sync protocol
│   ├── index.ts             # Node.js entry point
│   ├── worker.ts            # Cloudflare Workers entry point
│   └── types.ts             # Shared types
├── drizzle/                 # Database migrations
├── wrangler.toml            # Cloudflare config
└── package.json
```

### Key Design

- **Single-user auth**: First visit auto-registers. scrypt password hashing, 30-day httpOnly cookie session.
- **RBAC permissions**: Calendar-level viewer/editor/admin roles. Queries auto-filter via LEFT JOIN.
- **Soft delete**: Events marked `deleted=true`, never physically removed.
- **Sync protocol**: `sync_sequence`-based pull/push, LWW conflict resolution (based on `last_modified` timestamp), transactional writes.
- **ICS parser**: Custom-built (no third-party ICS library). Stores `raw_ics` to preserve extra VEVENT properties (VALARM, CATEGORIES, STATUS) for round-trip fidelity.
- **Dual database**: SQLite via `better-sqlite3` for local dev / Docker; Cloudflare D1 via `initD1Db()` for Workers production.
- **Auto-migration**: `node-init.ts` runs `migrate()` on startup to ensure schema is up to date. D1 migrations are applied via `wrangler d1 migrations apply` during deployment.

## Web (`packages/web/`)

```
web/
├── src/
│   ├── components/
│   │   ├── CalendarView.tsx  # FullCalendar month view + lunar + search + FAB
│   │   ├── EventEditor.tsx   # Dual-mode event create/edit modal
│   │   ├── Layout.tsx        # Top nav bar + Portal slot system
│   │   ├── ColorSwatchPicker.tsx
│   │   ├── RequireAuth.tsx   # Route guard
│   │   └── ui/
│   │       ├── button.tsx    # CVA button component (default/outline/ghost × default/sm/icon)
│   │       └── modal.tsx     # Modal component
│   ├── hooks/
│   │   ├── use-auth.ts       # Auth state
│   │   ├── use-calendars.ts  # Calendar list queries
│   │   ├── use-events.ts     # Parallel multi-calendar event queries
│   │   ├── use-i18n.ts       # Chinese + English translations
│   │   └── use-settings.ts   # User preferences
│   ├── lib/
│   │   ├── api.ts            # Type-safe fetch wrapper
│   │   ├── colors.ts         # Calendar color palette (12 colors)
│   │   ├── date-format.ts    # Java-style date format patterns
│   │   ├── lunar.ts          # Lunar date conversion (chinese-days)
│   │   └── utils.ts          # cn() utility
│   ├── pages/
│   │   ├── CalendarPage.tsx
│   │   ├── ImportPage.tsx    # ICS import preview (file + URL tabs)
│   │   ├── LoginPage.tsx     # Auth (register on first visit, login after)
│   │   └── SettingsPage.tsx  # Settings + calendar management
│   ├── types.ts
│   ├── main.tsx              # Entry: BrowserRouter + QueryClient
│   └── index.css
└── package.json
```

### Key Design

- **Portal slot system**: `Layout` provides `TopBarCtx`. `CalendarView` injects date navigation and calendar switcher into the nav bar via `createPortal`.
- **Parallel multi-calendar queries**: `useEvents` fires independent queries per calendar, merges results via TanStack Query `combine`.
- **Dual-mode EventEditor**: Union type `EditMode | CreateMode` for type-safe create/edit in a single component.
- **Vite proxy**: Dev server proxies `/api` to `localhost:3000`.

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (single-user) |
| `sessions` | Auth session tokens + expiry |
| `calendars` | Calendar container (name, color, source type, owner) |
| `calendar_members` | User-calendar membership + role (viewer/editor/admin) |
| `events` | Event data with RRULE support, soft delete, `raw_ics` column |
| `event_overrides` | Single-instance overrides for recurring events |
| `deleted_log` | Deletion tombstone table (sync) |
| `sync_sequence` | Change sequence numbers (sync) |
| `user_settings` | User preferences (language, firstDayOfWeek, showEventTime, dateFormat, showLunarCalendar) |

### Key Columns

**events**
- `raw_ics` — Preserves original ICS VEVENT for round-trip fidelity
- `calendar_id` — Links to calendars table
- `deleted` — Soft delete flag

**user_settings**
- `show_lunar_calendar` — Lunar display toggle
- `date_format` — Customizable date format
- `show_event_time` — Time display toggle

## Sync Protocol

WatermelonDB-style pull/push sync:

1. Client sends `last_pulled_seq` (last known sequence number)
2. Server returns all changes since that sequence (created/updated/deleted)
3. Client merges and pushes local changes
4. Conflict resolution: Last-Writer-Wins (based on `last_modified` timestamp)
5. Atomicity: push operations run in a database transaction

## ICS Processing

Custom parser (no third-party ICS library), supports:
- VEVENT parsing (SUMMARY, DTSTART, DTEND, DESCRIPTION, LOCATION, RRULE)
- Serialization: RFC 5545 compliant (75-char line folding, `Z` suffix UTC time, `CALSCALE:GREGORIAN`)
- Import modes: append / overwrite (clear calendar first then import)
- Preview: parsed events list with per-item selection
- Remote fetch: SSRF protection via `isPrivateHost()`
- Date clamping: dates before 1970-01-01 clamped for compatibility

## Deployment Targets

- **Docker**: Node.js container + SQLite file volume mount
- **Cloudflare Workers**: Hono native support, D1 database via `initD1Db()`
