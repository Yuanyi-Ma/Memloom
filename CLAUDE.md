# CLAUDE.md - Memloom Development Guide

## Project Overview

Memloom is a personal knowledge management and spaced-repetition system built as an **OpenClaw plugin**. It extracts knowledge from AI conversations, organizes them into structured cards, and uses SM-2 spaced repetition + Feynman technique for review.

- **Backend**: TypeScript OpenClaw plugin (`server/`) with SQLite storage
- **Frontend**: React 19 SPA (`web/`) with Vite, Tailwind CSS 4, shadcn/ui
- **Skills**: OpenClaw agent skills (`skills/`) for knowledge capture and review

## Repository Structure

```
server/              # Backend plugin (TypeScript + SQLite)
  index.ts           # Plugin entry point (routes, tools, hooks, static serving)
  db/                # Database schema + queries (SQLite via better-sqlite3)
  routes/            # REST API endpoints (cards, review, import, config, stats, skills)
  services/          # Business logic (extractor, scheduler, aggregator, gatewayClient)
  types/             # TypeScript interfaces
  utils/             # Helpers (config, id generation, similarity)
  __tests__/         # Vitest unit + integration tests

web/                 # Frontend SPA (React 19 + Vite)
  src/
    routes/          # Page components (Home, Review, Inbox, CardList, Settings)
    components/      # UI components (shadcn/ui + domain-specific)
    hooks/           # Custom hooks (useCards, useReview, useConfig, useStats, useGatewayWS)
    services/api.ts  # Typed HTTP client for all backend endpoints
    stores/          # Zustand state (reviewStore)
    types/           # Shared TypeScript interfaces
    lib/             # Utility functions (cn)

skills/              # OpenClaw Agent Skills (YAML manifests + instruction docs)
  kb-active-capture/    # Extract knowledge from conversations
  kb-file-import/       # Bulk import from Markdown files
  kb-feynman-review/    # AI-guided Feynman-style review

scripts/             # Shell scripts (install.sh, uninstall.sh, build.sh)
.github/workflows/   # CI: release.yml (macOS ARM64 + Linux x64 builds on tag push)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js (>=18), TypeScript 5.9 |
| Database | SQLite via better-sqlite3 |
| WebSocket | ws |
| Frontend | React 19, React Router DOM 7 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4, shadcn/ui, Framer Motion |
| State | Zustand |
| Charts | Recharts |
| Testing | Vitest (both backend and frontend) |
| Linting | ESLint 9 (frontend only) |

## Common Commands

### Server (`cd server/`)

```bash
npm test              # Run backend tests (vitest)
npm run test:watch    # Watch mode
npm run build         # TypeScript → dist/
npm run dev:link      # Build + symlink to ~/.openclaw/extensions/memloom
```

### Web (`cd web/`)

```bash
npm run dev           # Vite dev server on port 3000 (proxies /api → localhost:18789)
npm run build         # Production build → dist/
npm run lint          # ESLint check
npm run preview       # Preview production build
```

### Full Build

```bash
bash scripts/build.sh     # Builds both server and web
bash scripts/install.sh   # Build + register plugin + link skills + restart gateway
```

## Architecture

### Backend Flow

```
HTTP Request → index.ts (route matching) → routes/*.ts → services/*.ts → db/queries.ts → SQLite
```

- Plugin registers with OpenClaw via `openclaw.plugin.json`
- Exposes AI tools: `kb_save_card`, `kb_check_duplicate`, `kb_validate_card`
- Serves frontend static files from `web/dist/`
- WebSocket client connects to OpenClaw Gateway for Feynman chat

### Frontend Flow

```
App.tsx (React Router) → Route components → Custom hooks → api.ts → HTTP /api/*
```

- **State**: Zustand for review session (`reviewStore.ts`), React hooks for server data
- **Theming**: next-themes (dark/light) with CSS variables
- **Path alias**: `@` maps to `web/src/`

### Data Storage

- Database: `~/.memloom/db/memloom.sqlite`
- Config: `~/.memloom/config.json`
- Feedback: `~/.memloom/feedback/rejected.md`

## Key Conventions

### Code Style

- TypeScript strict mode in both server and web
- ES modules throughout (`"type": "module"` in both package.json files)
- Server uses ES2022 target; web uses ES2020 target
- Frontend uses shadcn/ui components (in `web/src/components/ui/`)
- Tailwind utility classes for styling; CSS variables for theming
- API functions in `web/src/services/api.ts` are typed with request/response interfaces

### Testing

- Backend tests in `server/__tests__/`, mirroring source structure
- Frontend tests use jsdom environment + @testing-library/react
- Test setup in `web/test-setup.ts` (jest-dom matchers)
- Run `npm test` from respective directories

### SM-2 Algorithm (Spaced Repetition)

- Easiness Factor (ef): 1.3–3.0, initialized at 2.5
- Mastery threshold: 3 consecutive correct reviews
- Three ratings: Got it (+0.1 ef), Fuzzy (-0.15 ef), Forgot (-0.3 ef)
- Implementation in `server/services/scheduler.ts`

### API Routes

All backend routes are prefixed and matched in `server/index.ts`:
- `/api/cards` - CRUD, search, filter, duplicate check, validation
- `/api/review` - Review queue and rating submission
- `/api/import` - File import
- `/api/config` - Categories, colors, extraction settings
- `/api/stats` - Dashboard statistics
- `/api/skills` - Skill metadata

### Commit Messages

Commit messages follow conventional format in Chinese:
- `feat:` new features
- `fix:` bug fixes
- `chore:` maintenance/tooling
- `revert:` rollbacks

## CI/CD

Release workflow (`.github/workflows/release.yml`) triggers on `v*` tags:
- Builds for macOS ARM64 and Linux x64
- Packages compiled artifacts into `.tar.gz` releases
- Includes server/dist, web/dist, skills, scripts, and docs
