# Repository Guidelines

## Project Structure & Module Organization
The game is a static browser build—no framework. Root files are `index.html` (HUD + canvas shell) and `README.md`. All gameplay logic and rendering live in `src/main.js`; styling sits in `src/styles.css`. Drop art or audio into `assets/` and import via relative paths when needed. Keep helper modules inside `src/` (e.g., `src/systems/`, `src/entities/`) once the project grows; mirror that structure with matching barrels/tests. Use `docs/` for supplemental design notes or balance sheets if they appear later.

## Build, Test, and Development Commands
No bundler is required; serve the repo root with any static server so Canvas assets load correctly.
```bash
npx serve .
# or python3 -m http.server 3000
```
Open the printed URL (defaults to `http://localhost:3000`) and reload after code edits. Use your editor/ESLint for linting; no automated tests exist yet.

## Coding Style & Naming Conventions
Author in vanilla ES modules (bundle-free; wire logic via `type="module"` or deferred scripts as needed). Prefer 2-space indentation, single quotes, and descriptive filenames (`pathfinding.js`, `ui/hud.js`). Classes/interfaces are PascalCase, instances camelCase, constants SCREAMING_SNAKE_CASE. Keep rendering + game-state logic in separate modules once things expand, and document any magic numbers via inline comments.

## Testing Guidelines
Manual verification is the norm: run the app in a browser, let multiple auto-triggered waves cycle, confirm enemies spawn from every edge, and resize the window to ensure the 16:9 canvas centers correctly. Verify the rotating laser and periodic shockwave behave as expected (damage, stun, and upgrade scaling). When automated tests are added, keep them under `tests/` and mirror module names (`main.test.js`). For now, include reproduction steps in PR descriptions if you fix gameplay bugs.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `style:`, `docs:`) so history stays scannable. Every PR should describe gameplay impact, list test steps (even if manual), and include screenshots/GIFs for visual/UI tweaks. Ensure the game runs in Chrome + Safari at common laptop resolutions before requesting review, and mention if the laser/shockwave tuning changed.

## Security & Configuration Tips
There are no secrets today, but if you add analytics/leaderboards, keep keys in `.env` and consume them via `import.meta.env`. Validate any player-provided content (e.g., custom wave JSON) before injecting it into the simulation. Prefer deterministic seeds while debugging to reproduce user reports.
