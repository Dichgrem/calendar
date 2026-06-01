# Usage Guide

## Getting Started

1. Visit the app, first-time use shows registration page
2. Set username and password
3. After login, enter calendar view

## Dark Mode

Hover the + button (bottom-right) to reveal the dark mode toggle. Click the moon icon to switch to dark mode, sun icon to return to light mode. Preference is saved in your browser.

## Calendar View

- **Month navigation**: Click top-left date, use year picker
- **Today**: Click circle button to return to today
- **Create event**: Click + button (bottom-right)
- **Edit event**: Click existing event
- **Search**: Hover the search icon in the top-right to expand, supports global search with calendar filter

## Lunar Calendar

Enable "Show Lunar Calendar" in settings. Lunar dates appear left of day numbers.

## ICS Import

1. Click "Import ICS Calendar" in settings
2. Choose file upload or enter remote URL
3. Preview and select events to import

## ICS Export

1. Click "Export ICS Calendar" in settings
2. Select calendars to export
3. Download ICS file

## Common Calendar Subscriptions

Click "Import Common Calendars" in settings for one-click subscriptions:
- Chinese Holidays
- Festivals & Memorial Days
- 24 Solar Terms

## Backup & Restore

- **Backup DB**: Click "Backup Database" in settings. After completion, click the filename to download the SQLite file.
- **Export Config**: Click "Export Config" to download `config.json` with your settings defaults.

> Note: Backup is only available in Docker/Node.js runtime, not Cloudflare Workers.
