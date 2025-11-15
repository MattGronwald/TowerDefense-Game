# TowerDefense-Game

A lightweight browser tower defense prototype inspired by *The Tower – Idle Tower Defense*. Fight endless waves, upgrade your tower, and defend the base from incoming creeps.

## Quick Start

```bash
# from repo root
npx serve .
# or any static file server of your choice
```

Then browse to the URL that `serve` prints (default `http://localhost:3000`). The app also works when double-clicking `index.html`, but a server avoids asset/canvas security warnings and keeps the responsive sizing logic consistent across browsers. For the best experience keep the browser window wide so the 16:9 arena fills the screen.

## Gameplay

- **Waves:** Assaults trigger automatically—survive each 360° onslaught until the timer fills and the next wave spawns.
- **Auto Fire:** The tower auto-targets the closest creep in range and shoots energy bolts.
- **Upgrades:** Spend coins to raise damage, fire rate, or range. Costs scale per level.
- **Coins:** Earned from kills plus end-of-wave bonuses and passive income.
- **Health:** Twenty base HP; breaching enemies deal tier-based damage. Game ends at 0.
- **Arena:** The tower now sits mid-field inside a wide landscape arena, so watch every direction.
- **Rotating Laser:** A continuous beam sweeps the arena and pierces anything in its path—damage, reach, and spin rate scale with the same upgrades.
- **Shockwave:** At intervals the tower emits a concussive ring that stuns and chips every enemy within range—effects are strongest close to the tower and taper toward the edge; fire-rate upgrades shorten the cooldown.

## Controls & Tips

- Queue upgrades between waves so you start strong.
- Between waves there's a short recharge timer; use the downtime to buy upgrades.
- Boss-tier units (orange) appear every 6th wave—save coins for them.
- If things go wrong, refresh the page to reset the run.
- Whispering alarms appear in the event log, so keep an eye there between bursts.
- The canvas auto-resizes; on laptops maximize the window to see the full perimeter.
- Upgrade buttons boost all attack types, so balancing damage vs. control depends on your preferred strategy.
