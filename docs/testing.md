# Testing

## Unit Tests (`just test`)

Vitest workspace: server (node) + web (jsdom). 14 test files, 98 tests.

```bash
just test          # run all unit tests
just test-watch    # watch mode
```

### Server tests (node environment)

| File | Tests | Coverage |
|------|-------|----------|
| `ics-parser.test.ts` | 6 | ICS parsing basics |
| `ics-serializer.test.ts` | 7 | ICS serialization |
| `ics-edge.test.ts` | 9 | RFC 5545 line folding, VALARM, SSRF |
| `sync.test.ts` | 8 | LWW conflict, pull/push protocol |
| `auth.test.ts` | 8 | scrypt hash, password verification |
| `calendar-reorder.test.ts` | 6 | splice index correction |
| `xml.test.ts` | 8 | CalDAV XML parsing (PROPFIND/REPORT/esc) |

### Web tests (jsdom environment)

| File | Tests | Coverage |
|------|-------|----------|
| `modal.test.tsx` | 8 | ESC/backdrop/close, INPUT guard |
| `EventEditor.component.test.tsx` | 9 | create/edit mode, allDay, defaultStart |
| `EventEditor.test.ts` | 9 | toLocalInput, roundToNextHour, split-merge |
| `LoginPage.test.tsx` | 7 | register/login form, loading state |
| `ColorSwatchPicker.test.tsx` | 3 | color buttons, onChange |
| `CalendarManagement.test.ts` | 4 | common calendar import detection |
| `date-format.test.ts` | 5 | zh/en/custom date formatting |

### Mobile

React Native app with Expo + WatermelonDB. Component tests require Android/iOS runtime.

| File | Coverage |
|------|----------|
| `App.tsx` | auth flow, sync trigger, CRUD dispatch |
| `CalendarScreen.tsx` | month view, calendar visibility pills |
| `EventEditorScreen.tsx` | date/time split, allDay toggle |
| `LoginScreen.tsx` | register/login form |
| `hooks/use-sync.ts` | 60s pull timer, AppState wake |

### Test infrastructure

- `vitest.workspace.ts` — workspace config referencing server/web
- `packages/server/vitest.config.ts` — node environment
- `packages/web/vitest.config.ts` — jsdom + `@testing-library/jest-dom`
- `packages/web/src/test-setup.ts` — jsdom matchers

## API Integration Tests (`just test-*` recipes)

Shell-based `curl` + `jq` tests. Requires test server:

```bash
# Terminal 1: start test server
just test-run

# Terminal 2: run tests
just test-all        # all tests
just test-full       # full integration test
just test-it login   # individual test
```

## Test Plan

### Authentication
- [ ] First visit → `auth/status` returns `registered: false`
- [ ] Register → returns 201, sets session cookie
- [ ] Register duplicate → returns 403
- [ ] Login correct/wrong → 200 / 401
- [ ] Protected endpoint without cookie → error

### Calendars
- [ ] CRUD: GET/POST/GET/:id/PATCH/DELETE
- [ ] Reorder via PATCH /calendars/reorder
- [ ] Default calendar auto-created on registration

### Events
- [ ] CRUD + soft-delete
- [ ] Date range queries + recurring events (RRULE)

### ICS
- [ ] Preview / fetch-url / import / export
- [ ] Export preserves raw_ics extensions
- [ ] Overwrite mode

### Sync
- [ ] GET /sync/pull returns incremental changes
- [ ] POST /sync/push with LWW conflict detection

### UI
- [ ] Calendar month view + date click highlight
- [ ] Event create/edit via modal
- [ ] Search with keyboard navigation (arrows + esc)
- [ ] Dark mode toggle + persistence
- [ ] Calendar drag reorder (top bar + settings)
- [ ] Common calendar import with duplicate detection
- [ ] Login/register flow
- [ ] Settings persistence

### Platform
- [ ] Cloudflare Workers: deploy + verify
- [ ] Node.js: `just start` + test
- [ ] Docker: build + test
