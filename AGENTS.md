# Repository Guidelines

## Project Structure & Module Organization
This repository hosts a browser-based tower-defense prototype. Keep framework-independent logic under `src/`, splitting files into folders such as `engine/` (tick loop, pathfinding), `entities/` (towers, enemies, projectiles), and `ui/` (HUD, menus). Store renderable assets in `assets/graphics` and audio in `assets/audio`, pairing each sprite with a JSON metadata file describing frame sizes. Static bootstrapping files (`index.html`, `styles.css`, manifest files) live in `public/`. Tests sit under `tests/`, mirroring the `src/` tree (e.g., `tests/entities/tower.test.ts`), and any throwaway prototypes or balancing spreadsheets stay inside `sandbox/` to keep the main tree clean.

## Build, Test, and Development Commands
After running `npm install`, use `npm run dev` to start the Vite-powered dev server with hot reload. `npm run build` emits the optimized bundle to `dist/` and should stay warning-free before every push. Run `npm test` to execute the Vitest/Jest suite in watch mode, and `npm run lint` to apply ESLint plus Prettier. Example workflow:
```bash
npm install
npm run dev
npm test
npm run build && npm run lint
```

## Coding Style & Naming Conventions
Stick to modern TypeScript/ESM with 2-space indentation, semicolons, and single quotes. Name classes and components with PascalCase (`LaserTower`), instances with camelCase (`laserTower`), and constants with SCREAMING_SNAKE_CASE. Modules exporting React-style hooks or utilities should follow `useThing.ts` / `thing-utils.ts`. Keep functions pure where possible and prefer descriptive file names such as `pathfinding/dijkstra.ts` over generic `utils.ts`. Run `npm run lint -- --fix` before committing to enforce ESLint + Prettier rules.

## Testing Guidelines
Use Vitest/Jest with `@testing-library` for UI-bound code. Every exported module in `src/` should have a sibling test under `tests/` using the `<module>.test.ts` naming pattern. Aim for >80% branch coverage; guard against regresions like targeting logic or resource leaks with table-driven tests. Snapshot tests are acceptable for HUD components but avoid for gameplay logic. When debugging flaky tests, add repro fixtures under `tests/fixtures/` rather than mutating production JSON.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`) so changelog generation remains automated. Start each PR with a short summary plus bullet list of notable changes, link the tracking issue (`Closes #123`), and attach screenshots or GIFs when visuals change. Include reproduction steps for bug fixes and mention any new npm scripts or config files. Keep PRs under ~400 lines to simplify review, and ensure `npm run build`, `npm test`, and `npm run lint` pass locally before requesting review.

## Security & Configuration Tips
Store API keys (e.g., analytics or leaderboard endpoints) in `.env.local` and never commit secrets—reference them through `import.meta.env`. Validate any user-generated wave data before loading it into the engine to avoid injection vectors. Prefer deterministic RNG seeds in development builds to ease reproducing reports. When introducing third-party packages, document their purpose in `docs/dependencies.md` and verify licenses are MIT-compatible.
