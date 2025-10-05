# Repository Guidelines

## Project Structure & Module Organization
- `app/` – Next.js App Router UI. API routes live under `app/api/**/route.ts` and read from `data/downloads.db`.
- `components/` – Reusable React UI components.
- `lib/` – Shared utilities (helpers, DB access helpers).
- `scripts/fetch-data.mjs` – Node ESM script that fetches GitHub Releases and upserts into SQLite.
- `data/` – Committed SQLite snapshots (`downloads.db`). Do not edit manually.
- `public/` – Static assets.

## Build, Test, and Development Commands
- `npm run dev` – Start the Next.js dev server (Turbopack).
- `npm run build` – Production build.
- `npm start` – Serve the production build.
- `npm run lint` – ESLint (fix issues locally before PRs).
- `npm run getdata` – Run `scripts/fetch-data.mjs` to refresh `data/downloads.db`.
- Typecheck: `npx tsc --noEmit`.
- E2E (if added): `npx playwright test --reporter=line`.

## Coding Style & Naming Conventions
- Language: TypeScript for app/API; Node ESM for scripts. Avoid type assertions; narrow via guards.
- Styling: Tailwind CSS utilities; keep components small and composable.
- API + SQLite: export `export const runtime = 'nodejs'` in any route that touches SQLite.
- Names: files `kebab-case.ts[x]`, components `PascalCase`, tests `*.test.ts[x]`.
- Migrations: additive only (e.g., `ALTER TABLE` with defaults). Never drop or rewrite data.

## Testing Guidelines
- Prefer Vitest for unit tests and Playwright for E2E when introduced.
- Co-locate tests or use a `tests/` folder. Name as `*.test.ts[x]`.
- Mock network I/O. For DB, use a temp copy of `data/downloads.db` or an in-memory SQLite instance.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`. Example: `chore: update download data`.
- PRs include: clear description, linked issues, screenshots for UI changes, and notes for any schema/migration updates.
- Before opening a PR: `npm run lint`, `npx tsc --noEmit`, and (if relevant) `npm run getdata` to validate the fetcher locally.

## Security & Configuration Tips
- Keep secrets out of the repo. CI uses `secrets.PAT` for scheduled fetches.
- Fetcher env filters: `ASSET_NAME_INCLUDE` (regex), `EXCLUDE_DRAFTS=true`, `EXCLUDE_PRERELEASES=true`.
- Validate API inputs and avoid exposing any write endpoints.

