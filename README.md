# TowerDefense-Game

A lightweight browser tower defense prototype inspired by *The Tower – Idle Tower Defense*. Fight endless waves, upgrade your tower, and defend the base from incoming creeps.

## Quick Start

```bash
# from repo root
npx serve .
# or any static file server of your choice
```

Then browse to the URL that `serve` prints (default `http://localhost:3000`). The app also works when double-clicking `index.html`, but a server avoids asset/canvas security warnings and keeps the responsive sizing logic consistent across browsers.

## Gameplay

- **Start Wave:** Launch waves manually; enemies stream toward the base from the top of the map.
- **Auto Fire:** The tower auto-targets the closest creep in range and shoots energy bolts.
- **Upgrades:** Spend coins to raise damage, fire rate, or range. Costs scale per level.
- **Coins:** Earned from kills plus end-of-wave bonuses and passive income.
- **Health:** Twenty base HP; breaching enemies deal tier-based damage. Game ends at 0.

## Controls & Tips

- Queue upgrades between waves so you start strong.
- When a wave is active the start button is disabled until all enemies are cleared.
- Boss-tier units (orange) appear every 6th wave—save coins for them.
- If things go wrong, refresh the page to reset the run.
- The canvas auto-resizes; keep the browser maximized on MacBook displays for the intended view ratio.
