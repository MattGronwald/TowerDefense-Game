const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const DESIGN_SIZE = { width: 960, height: 540 };
const ASPECT_RATIO = DESIGN_SIZE.width / DESIGN_SIZE.height;
const view = { width: DESIGN_SIZE.width, height: DESIGN_SIZE.height };
const ACTOR_SCALE = 0.5;

const ui = {
  wave: document.getElementById("wave"),
  coins: document.getElementById("coins"),
  health: document.getElementById("health"),
  nextWave: document.getElementById("nextWave"),
  upgradeDamage: document.getElementById("upgradeDamage"),
  upgradeFireRate: document.getElementById("upgradeFireRate"),
  upgradeRange: document.getElementById("upgradeRange"),
  log: document.getElementById("eventLog"),
};

const base = {
  x: view.width / 2,
  y: view.height / 2,
  radius: 54,
};

const state = {
  coins: 120,
  wave: 1,
  health: 20,
  enemies: [],
  projectiles: [],
  shockwaves: [],
  spawnQueue: [],
  waveActive: false,
  gameOver: false,
  passiveIncome: 5,
  tower: {
    fireCooldown: 0,
    damage: 12,
    fireRate: 1.3,
    range: 160,
    laserAngle: 0,
    shockwaveTimer: 4,
  },
  waveCooldown: 2,
};

const towerUpgrades = {
  damage: 0,
  fireRate: 0,
  range: 0,
};

const upgradeDefs = {
  damage: {
    baseCost: 35,
    growth: 1.45,
    description: "Increase all attack damage by 4.",
  },
  fireRate: {
    baseCost: 40,
    growth: 1.4,
    description: "Boost cadence (+15% fire rate & beam speed).",
  },
  range: {
    baseCost: 30,
    growth: 1.35,
    description: "Extend tower attack radius by 6px.",
  },
};

let logEntries = [];
let enemyIdSeed = 0;
let lastTime = performance.now();
let resizeTimer;

function currentScale() {
  return view.width / DESIGN_SIZE.width;
}

function scaleMetric(value) {
  return value * currentScale();
}

function actorMetric(value) {
  return scaleMetric(value * ACTOR_SCALE);
}

function updateBaseMetrics() {
  base.x = view.width / 2;
  base.y = view.height / 2;
  base.radius = actorMetric(54);
}

function normalizeAngle(angle) {
  let theta = angle;
  while (theta > Math.PI) theta -= Math.PI * 2;
  while (theta < -Math.PI) theta += Math.PI * 2;
  return theta;
}

function handleEnemyKill(enemy, { source = "Tower", log = true } = {}) {
  state.coins += enemy.reward;
  if (log) {
    logEvent(
      `${source} destroyed tier ${enemy.tier} enemy (+${enemy.reward}).`,
    );
  }
  const idx = state.enemies.indexOf(enemy);
  if (idx >= 0) state.enemies.splice(idx, 1);
}

function recalcTowerStats() {
  state.tower.damage = 12 + towerUpgrades.damage * 4;
  state.tower.fireRate = 1.3 * (1 + towerUpgrades.fireRate * 0.15);
  const rangeBase = 250 + towerUpgrades.range * 10;
  state.tower.range = actorMetric(rangeBase);
  const shockwaveInterval = getShockwaveInterval();
  if (!Number.isFinite(state.tower.shockwaveTimer)) {
    state.tower.shockwaveTimer = shockwaveInterval;
  } else {
    state.tower.shockwaveTimer = Math.min(
      state.tower.shockwaveTimer,
      shockwaveInterval,
    );
  }
}

function getLaserRotationSpeed() {
  return state.tower.fireRate * 0.08;
}

function getLaserDamagePerSecond() {
  return state.tower.damage * 1.1;
}

function getShockwaveInterval() {
  return Math.max(2.5, 6 - towerUpgrades.fireRate * 0.4);
}

function getShockwaveStunDuration() {
  return 1.2 + towerUpgrades.damage * 0.1;
}

function logEvent(message) {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  logEntries.unshift(`[${timestamp}] ${message}`);
  logEntries = logEntries.slice(0, 10);
  ui.log.innerHTML = logEntries.map((entry) => `<p>${entry}</p>`).join("");
}

class Enemy {
  constructor(tier) {
    this.id = ++enemyIdSeed;
    this.radius = actorMetric(18 + tier * 2);
    this.stun = 0;
    this.spawn(tier);
  }

  spawn(tier) {
    const stats = enemyStats(tier);
    this.health = stats.health;
    this.maxHealth = stats.health;
    this.speed = stats.speed * currentScale();
    this.reward = stats.reward;
    this.damage = stats.damage;
    this.color = stats.color;
    this.tier = tier;
    const { x, y } = spawnEdgePosition(this.radius);
    this.x = x;
    this.y = y;
  }

  update(delta) {
    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - delta);
      return false;
    }
    const dx = base.x - this.x;
    const dy = base.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = this.speed * delta;
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return dist <= base.radius + this.radius;
  }

  takeDamage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }

  applyStun(duration) {
    this.stun = Math.max(this.stun, duration);
  }
}

function spawnEdgePosition(radius) {
  const side = Math.floor(Math.random() * 4);
  switch (side) {
    case 0: // top
      return { x: Math.random() * view.width, y: -radius };
    case 1: // right
      return { x: view.width + radius, y: Math.random() * view.height };
    case 2: // bottom
      return { x: Math.random() * view.width, y: view.height + radius };
    default: // left
      return { x: -radius, y: Math.random() * view.height };
  }
}

function enemyStats(tier) {
  const healthFactor = 1 + (state.wave - 1) * 0.08;
  const speedFactor = 1 + (state.wave - 1) * 0.02;
  const tiers = {
    1: {
      health: 35 * healthFactor,
      speed: 32 * speedFactor,
      reward: 6,
      damage: 1,
      color: "#72f1b8",
    },
    2: {
      health: 110 * healthFactor,
      speed: 24 * speedFactor,
      reward: 15,
      damage: 2,
      color: "#42c3ff",
    },
    3: {
      health: 280 * healthFactor,
      speed: 18 * speedFactor,
      reward: 35,
      damage: 5,
      color: "#f39b45",
    },
  };
  return tiers[tier] || tiers[1];
}

function queueWave(wave) {
  const enemyTotal = Math.min(42, 8 + wave * 3);
  const cadence = Math.max(0.2, 1.1 - wave * 0.03);
  const queue = [];
  for (let i = 0; i < enemyTotal; i += 1) {
    let tier = 1;
    if (wave > 4 && i % 5 === 0) tier = 2;
    if (wave % 6 === 0 && i >= enemyTotal - 2) tier = 3;
    queue.push({ delay: i * cadence, tier });
  }
  state.spawnQueue = queue;
  state.waveActive = true;
  logEvent(`Wave ${wave} incoming from every direction (${enemyTotal} units).`);
}

function spawnReady(delta) {
  if (!state.waveActive) return;
  state.spawnQueue.forEach((slot) => {
    slot.delay -= delta;
  });
  const ready = state.spawnQueue.filter((slot) => slot.delay <= 0);
  state.spawnQueue = state.spawnQueue.filter((slot) => slot.delay > 0);
  ready.forEach((slot) => {
    state.enemies.push(new Enemy(slot.tier));
  });
}

function tryEndWave() {
  if (!state.waveActive) return;
  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    const bonus = Math.round(25 + state.wave * 8 + towerUpgrades.damage * 2);
    state.coins += bonus;
    logEvent(`Wave ${state.wave} cleared. Bonus +${bonus} coins.`);
    state.wave += 1;
    state.coins += state.passiveIncome;
    state.waveCooldown = 3.5;
    logEvent("Charging the next wave...");
  }
}

function purchaseUpgrade(name) {
  const def = upgradeDefs[name];
  const level = towerUpgrades[name];
  const cost = Math.round(def.baseCost * Math.pow(def.growth, level));
  if (state.coins < cost) return;
  state.coins -= cost;
  towerUpgrades[name] += 1;
  recalcTowerStats();
  logEvent(`${capitalize(name)} upgraded to level ${towerUpgrades[name]}.`);
  updateUI();
}

function updateTower(delta) {
  if (state.gameOver) return;
  state.tower.fireCooldown -= delta;
  if (state.tower.fireCooldown > 0) return;
  const target = acquireTarget();
  if (target) {
    shoot(target);
    state.tower.fireCooldown = 1 / state.tower.fireRate;
  }
}

function acquireTarget() {
  let closest = null;
  let minDistance = Infinity;
  state.enemies.forEach((enemy) => {
    const dist = Math.hypot(enemy.x - base.x, enemy.y - base.y);
    if (dist < state.tower.range && dist < minDistance) {
      minDistance = dist;
      closest = enemy;
    }
  });
  return closest;
}

function shoot(target) {
  state.projectiles.push({
    x: base.x,
    y: base.y,
    target,
    speed: 560 * currentScale(),
    damage: state.tower.damage,
    radius: actorMetric(5),
  });
}

function updateLaser(delta) {
  state.tower.laserAngle =
    (state.tower.laserAngle + getLaserRotationSpeed() * delta * Math.PI * 2) %
    (Math.PI * 2);
  const beamHalfWidth = 0.25;
  const damagePerSecond = getLaserDamagePerSecond();
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const dx = enemy.x - base.x;
    const dy = enemy.y - base.y;
    const dist = Math.hypot(dx, dy);
    if (dist > Math.max(view.width, view.height) * 1.5 + enemy.radius) continue;
    const angleToEnemy = Math.atan2(dy, dx);
    const diff = Math.abs(
      normalizeAngle(angleToEnemy - state.tower.laserAngle),
    );
    if (diff <= beamHalfWidth) {
      const killed = enemy.takeDamage(damagePerSecond * delta);
      if (killed) {
        handleEnemyKill(enemy, { source: "Laser", log: false });
      }
    }
  }
}

function emitShockwave() {
  const wave = {
    life: 0,
    duration: 0.65,
    maxRadius: state.tower.range,
  };
  state.shockwaves.push(wave);
  const stunDuration = getShockwaveStunDuration();
  let stunned = 0;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const dist = Math.hypot(enemy.x - base.x, enemy.y - base.y);
    if (dist <= state.tower.range + enemy.radius) {
      stunned += 1;
      const falloff = 1 - Math.min(1, dist / state.tower.range);
      const effectiveStun = stunDuration * (0.45 + falloff * 0.55);
      enemy.applyStun(effectiveStun);
      const damage = state.tower.damage * (0.8 + falloff * 0.6);
      const killed = enemy.takeDamage(damage);
      if (killed) {
        handleEnemyKill(enemy, { source: "Shockwave", log: false });
      }
    }
  }
  if (stunned > 0) {
    logEvent("Shockwave released! Nearby enemies are stunned.");
  }
}

function updateShockwave(delta) {
  if (state.gameOver) {
    state.shockwaves.length = 0;
    return;
  }
  state.tower.shockwaveTimer -= delta;
  if (state.tower.shockwaveTimer <= 0) {
    state.tower.shockwaveTimer += getShockwaveInterval();
    emitShockwave();
  }
  state.shockwaves = state.shockwaves.filter((wave) => {
    wave.life += delta;
    return wave.life < wave.duration;
  });
}

function updateProjectiles(delta) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i];
    if (!projectile.target || !state.enemies.includes(projectile.target)) {
      state.projectiles.splice(i, 1);
      continue;
    }
    const dx = projectile.target.x - projectile.x;
    const dy = projectile.target.y - projectile.y;
    const dist = Math.hypot(dx, dy) || 1;
    projectile.x += (dx / dist) * projectile.speed * delta;
    projectile.y += (dy / dist) * projectile.speed * delta;
    if (dist < projectile.target.radius) {
      const kill = projectile.target.takeDamage(projectile.damage);
      state.projectiles.splice(i, 1);
      if (kill) {
        handleEnemyKill(projectile.target, { source: "Projectile" });
      }
    }
  }
}

function updateEnemies(delta) {
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const reached = enemy.update(delta);
    if (reached) {
      state.health -= enemy.damage;
      state.enemies.splice(i, 1);
      logEvent(`Enemy breached the tower (-${enemy.damage} health).`);
      if (state.health <= 0) {
        state.health = 0;
        state.gameOver = true;
        logEvent("The tower has fallen. Refresh to try again.");
        state.waveActive = false;
        state.spawnQueue = [];
        break;
      }
    }
  }
}

function updateWaveTimer(delta) {
  if (state.gameOver || state.waveActive) return;
  state.waveCooldown -= delta;
  if (state.waveCooldown <= 0) {
    state.waveCooldown = 0;
    queueWave(state.wave);
  }
}

function updateUI() {
  ui.wave.textContent = state.wave;
  ui.coins.textContent = Math.floor(state.coins);
  ui.health.textContent = state.health;
  if (ui.nextWave) {
    if (state.gameOver) {
      ui.nextWave.textContent = "Tower destroyed";
    } else if (state.waveActive) {
      ui.nextWave.textContent = `Wave ${state.wave} in progress`;
    } else if (state.waveCooldown > 0) {
      ui.nextWave.textContent = `Next wave in ${state.waveCooldown.toFixed(1)}s`;
    } else {
      ui.nextWave.textContent = "Wave arriving...";
    }
  }
  const buttonMap = [
    ["damage", ui.upgradeDamage],
    ["fireRate", ui.upgradeFireRate],
    ["range", ui.upgradeRange],
  ];
  buttonMap.forEach(([name, element]) => {
    const level = towerUpgrades[name];
    const cost = Math.round(
      upgradeDefs[name].baseCost * Math.pow(upgradeDefs[name].growth, level),
    );
    element.textContent = `${capitalize(name)} (Lv.${level}) - ${cost}c`;
    element.disabled = state.coins < cost || state.gameOver;
  });
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#050c18");
  gradient.addColorStop(1, "#01030a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
  const spacing = Math.max(40, scaleMetric(48));
  for (let x = 0; x < view.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
  }
  for (let y = 0; y < view.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
  }
}

function drawShockwaves() {
  state.shockwaves.forEach((wave) => {
    const progress = Math.min(1, wave.life / wave.duration);
    const radius = base.radius + wave.maxRadius * progress;
    const alpha = 0.5 * (1 - progress);
    ctx.strokeStyle = `rgba(120, 220, 255, ${alpha})`;
    ctx.lineWidth = Math.max(1, actorMetric(6) * (1 - progress));
    ctx.beginPath();
    ctx.arc(base.x, base.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawBase() {
  ctx.save();
  ctx.shadowColor = "#02e0ff";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#128fb3";
  ctx.beginPath();
  ctx.arc(base.x, base.y, base.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(2, 224, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(base.x, base.y, state.tower.range, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEnemies() {
  state.enemies.forEach((enemy) => {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    const barWidth = enemy.radius * 2;
    const barHeight = Math.max(3, actorMetric(4));
    ctx.fillStyle = "#111523";
    ctx.fillRect(
      enemy.x - enemy.radius,
      enemy.y - enemy.radius - actorMetric(10),
      barWidth,
      barHeight,
    );
    ctx.fillStyle = "#4dfcb8";
    ctx.fillRect(
      enemy.x - enemy.radius,
      enemy.y - enemy.radius - actorMetric(10),
      barWidth * (enemy.health / enemy.maxHealth),
      barHeight,
    );
    if (enemy.stun > 0) {
      ctx.strokeStyle = "rgba(193, 172, 255, 0.85)";
      ctx.lineWidth = Math.max(1, actorMetric(4));
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + actorMetric(5), 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawProjectiles() {
  ctx.fillStyle = "#f8e45c";
  state.projectiles.forEach((projectile) => {
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLaser() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 99, 133, 0.85)";
  ctx.lineWidth = Math.max(1.5, actorMetric(4));
  ctx.shadowColor = "#ff6391";
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(
    base.x + Math.cos(state.tower.laserAngle) * view.width * 2,
    base.y + Math.sin(state.tower.laserAngle) * view.width * 2,
  );
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  const scale = currentScale();
  if (state.gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.fillStyle = "#f9fafc";
    ctx.font = `bold ${Math.max(28, 36 * scale)}px "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "Tower Destroyed",
      view.width / 2,
      view.height / 2 - scaleMetric(20),
    );
    ctx.font = `${Math.max(16, 20 * scale)}px "Inter", sans-serif`;
    ctx.fillText(
      "Refresh to restart your defense.",
      view.width / 2,
      view.height / 2 + scaleMetric(20),
    );
  } else if (!state.waveActive) {
    const pad = scaleMetric(36);
    const msgWidth = Math.min(view.width - pad * 2, scaleMetric(620));
    const msgHeight = scaleMetric(60);
    const msgX = (view.width - msgWidth) / 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(msgX, pad, msgWidth, msgHeight);
    ctx.fillStyle = "#dce8ff";
    ctx.font = `${Math.max(16, 20 * scale)}px "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "Hold position—next 360° assault arrives automatically.",
      view.width / 2,
      pad + msgHeight / 2 + 6,
    );
  }
}

function render() {
  drawBackground();
  drawShockwaves();
  drawBase();
  drawEnemies();
  drawLaser();
  drawProjectiles();
  drawHUD();
}

function update(delta) {
  if (state.gameOver) return;
  spawnReady(delta);
  updateEnemies(delta);
  updateProjectiles(delta);
  updateTower(delta);
  updateLaser(delta);
  updateShockwave(delta);
  updateWaveTimer(delta);
  tryEndWave();
}

function loop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  update(delta);
  render();
  updateUI();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const availableWidth = Math.max(420, window.innerWidth - 80);
  const availableHeight = Math.max(320, window.innerHeight - 220);
  let width = Math.min(availableWidth, 1100);
  let height = width / ASPECT_RATIO;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ASPECT_RATIO;
  }
  const prevWidth = view.width;
  const prevHeight = view.height;
  view.width = width;
  view.height = height;

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const xScale = width / prevWidth;
  const yScale = height / prevHeight;
  const scaleChanged = prevWidth !== width || prevHeight !== height;
  if (scaleChanged) {
    state.enemies.forEach((enemy) => {
      enemy.x *= xScale;
      enemy.y *= yScale;
      enemy.radius *= xScale;
      enemy.speed *= xScale;
    });
    state.projectiles.forEach((projectile) => {
      projectile.x *= xScale;
      projectile.y *= yScale;
      projectile.radius *= xScale;
      projectile.speed *= xScale;
    });
  }

  updateBaseMetrics();
  recalcTowerStats();
}

ui.upgradeDamage.addEventListener("click", () => purchaseUpgrade("damage"));
ui.upgradeFireRate.addEventListener("click", () => purchaseUpgrade("fireRate"));
ui.upgradeRange.addEventListener("click", () => purchaseUpgrade("range"));

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 100);
});

resizeCanvas();
recalcTowerStats();
updateUI();
logEvent(
  "Welcome! Auto-waves, rotating lasers, and shockwaves are online—upgrade wisely.",
);
requestAnimationFrame(loop);
