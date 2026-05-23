# Mili DB Explorer

A great Postgres explorer in Electron — TablePlus-class, monetizable on day one.

## Features

**Connections**
- Multiple saved connections with encrypted password storage (`safeStorage`)
- Test, edit, duplicate, color-tag, SSL modes (disable / require / verify-full)

**Schema browser**
- Schemas → tables, views, materialized views, functions, sequences
- Searchable tree, right-click context menus (truncate, drop, copy DDL, select 100 rows)
- Live row counts and on-disk sizes

**Table data**
- Paginated grid with sortable, resizable, JSON-inspectable cells
- WHERE-filter, virtualized scrolling, column auto-sizing
- Insert / update / delete via transactional buffer (commit / revert)
- Export to CSV / JSON

**Table structure**
- Columns, types, defaults, identity, primary key, comments
- Indexes (with definition + size), foreign keys, constraints, triggers
- View definitions for views and matviews

**SQL editor**
- Monaco editor with Postgres language
- Multi-tab, persistent across sessions
- Run all / Run selection (⌘↵ / ⌘⇧↵)
- Multi-result tabs, query history, snippets
- SQL formatter (⌘⇧F)

**App**
- Light / dark / system theme
- Command palette (⌘K)
- Settings (page size, font, theme, confirm destructive)
- Keyboard shortcuts everywhere

**Monetization (Day 1)**
- Free: 2 connections, 1 SQL tab, no editing, no export
- Pro: unlimited everything, table editing, exports, SSH tunnel — $49/yr or $99 lifetime
- License keys validated entirely offline via HMAC

## Develop

```bash
npm install
# Terminal 1
npm run dev:renderer
# Terminal 2
npm run dev:electron
```

## Build & run

```bash
npm start            # builds main + renderer, then launches Electron
```

## Distribution

```bash
npm run dist         # builds and runs electron-builder
```

Outputs:
- macOS: `release/*.dmg`, `release/*.zip`
- Windows: `release/*.exe` (NSIS)
- Linux: `release/*.AppImage`, `release/*.deb`

## Architecture

```
src/
  main/        Electron main: pg pool, IPC handlers, settings, license
  preload/     Context-bridge exposing the IPC API to the renderer
  renderer/    React 18 + Zustand + Monaco + Tailwind
  shared/      Types shared between processes
```
