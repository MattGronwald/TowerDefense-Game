const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const DESIGN_SIZE = { width: 960, height: 540 };
const ASPECT_RATIO = DESIGN_SIZE.width / DESIGN_SIZE.height;
const view = { width: DESIGN_SIZE.width, height: DESIGN_SIZE.height };
const ACTOR_SCALE = 0.5;

const STARTING_STATE = {
  coins: 120,
  wave: 1,
  health: 20,
  passiveIncome: 5,
  waveCooldown: 2,
  initialShockwaveTimer: 4,
};

const BASE_CONFIG = {
  radius: 54,
};

const TOWER_STATS = {
  baseDamage: 12,
  damagePerUpgrade: 4,
  baseFireRate: 1.3,
  fireRatePerUpgrade: 0.15,
  baseRange: 250,
  rangePerUpgrade: 10,
  projectileSpeed: 560,
  projectileRadius: 5,
  laserRotationSpeedFactor: 0.08,
  laserDamageMultiplier: 1.1,
  laserBeamHalfWidth: 0.25,
  laserMaxRangeMultiplier: 1.5,
};

const SHOCKWAVE_CONFIG = {
  duration: 0.65,
  minInterval: 2.5,
  baseInterval: 6,
  fireRateIntervalReduction: 0.4,
  stunBaseRatio: 0.45,
  stunBonusRatio: 0.55,
  damageBaseRatio: 0.8,
  damageBonusRatio: 0.6,
  stunDurationBase: 1.2,
  stunDurationPerDamageUpgrade: 0.1,
};

const ENEMY_SCALING = {
  radiusBase: 18,
  radiusPerTier: 2,
  healthPerWave: 0.08,
  speedPerWave: 0.02,
};

const ENEMY_BASE_STATS = {
  1: {
    health: 35,
    speed: 32,
    reward: 6,
    damage: 1,
    color: '#72f1b8',
  },
  2: {
    health: 110,
    speed: 24,
    reward: 15,
    damage: 2,
    color: '#42c3ff',
  },
  3: {
    health: 280,
    speed: 18,
    reward: 35,
    damage: 5,
    color: '#f39b45',
  },
};

const WAVE_QUEUE_CONFIG = {
  baseEnemies: 8,
  enemiesPerWave: 3,
  maxEnemies: 42,
  cadenceBase: 1.1,
  cadenceReductionPerWave: 0.03,
  minCadence: 0.2,
  tierTwoWaveThreshold: 4,
  tierTwoSpacing: 5,
  tierThreeInterval: 6,
  tierThreeTailCount: 2,
};

const WAVE_REWARD_CONFIG = {
  baseBonus: 25,
  perWave: 8,
  perDamageUpgrade: 2,
  cooldown: 3.5,
};

const SPAWN_SIDE_COUNT = 4;
const PROJECTILE_HIT_FUDGE = 1;
const MAX_LOG_ENTRIES = 10;
const MAX_FRAME_TIME = 0.1;
const RESIZE_DEBOUNCE_MS = 100;
const CANVAS_LIMITS = {
  minWidth: 420,
  widthPadding: 80,
  maxWidth: 1100,
  minHeight: 320,
  heightPadding: 220,
};

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
  radius: actorMetric(BASE_CONFIG.radius),
};

const state = {
  coins: STARTING_STATE.coins,
  wave: STARTING_STATE.wave,
  health: STARTING_STATE.health,
  enemies: [],
  projectiles: [],
  shockwaves: [],
  spawnQueue: [],
  waveActive: false,
  gameOver: false,
  passiveIncome: STARTING_STATE.passiveIncome,
  tower: {
    fireCooldown: 0,
    damage: TOWER_STATS.baseDamage,
    fireRate: TOWER_STATS.baseFireRate,
    range: actorMetric(TOWER_STATS.baseRange),
    laserAngle: 0,
    shockwaveTimer: STARTING_STATE.initialShockwaveTimer,
  },
  waveCooldown: STARTING_STATE.waveCooldown,
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
  base.radius = actorMetric(BASE_CONFIG.radius);
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
  state.tower.damage =
    TOWER_STATS.baseDamage + towerUpgrades.damage * TOWER_STATS.damagePerUpgrade;
  state.tower.fireRate =
    TOWER_STATS.baseFireRate *
    (1 + towerUpgrades.fireRate * TOWER_STATS.fireRatePerUpgrade);
  const rangeBase =
    TOWER_STATS.baseRange + towerUpgrades.range * TOWER_STATS.rangePerUpgrade;
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
  return state.tower.fireRate * TOWER_STATS.laserRotationSpeedFactor;
}

function getLaserDamagePerSecond() {
  return state.tower.damage * TOWER_STATS.laserDamageMultiplier;
}

function getShockwaveInterval() {
  return Math.max(
    SHOCKWAVE_CONFIG.minInterval,
    SHOCKWAVE_CONFIG.baseInterval -
      towerUpgrades.fireRate * SHOCKWAVE_CONFIG.fireRateIntervalReduction,
  );
}

function getShockwaveStunDuration() {
  return (
    SHOCKWAVE_CONFIG.stunDurationBase +
    towerUpgrades.damage * SHOCKWAVE_CONFIG.stunDurationPerDamageUpgrade
  );
}

function logEvent(message) {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  logEntries.unshift(`[${timestamp}] ${message}`);
  logEntries = logEntries.slice(0, MAX_LOG_ENTRIES);
  ui.log.innerHTML = logEntries.map((entry) => `<p>${entry}</p>`).join("");
}

class Enemy {
  constructor(tier) {
    this.id = ++enemyIdSeed;
    this.radius = actorMetric(
      ENEMY_SCALING.radiusBase + tier * ENEMY_SCALING.radiusPerTier,
    );
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
  const side = Math.floor(Math.random() * SPAWN_SIDE_COUNT);
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
  const healthFactor = 1 + (state.wave - 1) * ENEMY_SCALING.healthPerWave;
  const speedFactor = 1 + (state.wave - 1) * ENEMY_SCALING.speedPerWave;
  const baseStats = ENEMY_BASE_STATS[tier] || ENEMY_BASE_STATS[1];
  return {
    health: baseStats.health * healthFactor,
    speed: baseStats.speed * speedFactor,
    reward: baseStats.reward,
    damage: baseStats.damage,
    color: baseStats.color,
  };
}

function queueWave(wave) {
  const enemyTotal = Math.min(
    WAVE_QUEUE_CONFIG.maxEnemies,
    WAVE_QUEUE_CONFIG.baseEnemies + wave * WAVE_QUEUE_CONFIG.enemiesPerWave,
  );
  const cadence = Math.max(
    WAVE_QUEUE_CONFIG.minCadence,
    WAVE_QUEUE_CONFIG.cadenceBase - wave * WAVE_QUEUE_CONFIG.cadenceReductionPerWave,
  );
  const queue = [];
  for (let i = 0; i < enemyTotal; i += 1) {
    let tier = 1;
    if (
      wave > WAVE_QUEUE_CONFIG.tierTwoWaveThreshold &&
      i % WAVE_QUEUE_CONFIG.tierTwoSpacing === 0
    ) {
      tier = 2;
    }
    if (
      wave % WAVE_QUEUE_CONFIG.tierThreeInterval === 0 &&
      i >= enemyTotal - WAVE_QUEUE_CONFIG.tierThreeTailCount
    ) {
      tier = 3;
    }
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
    const bonus = Math.round(
      WAVE_REWARD_CONFIG.baseBonus +
        state.wave * WAVE_REWARD_CONFIG.perWave +
        towerUpgrades.damage * WAVE_REWARD_CONFIG.perDamageUpgrade,
    );
    state.coins += bonus;
    logEvent(`Wave ${state.wave} cleared. Bonus +${bonus} coins.`);
    state.wave += 1;
    state.coins += state.passiveIncome;
    state.waveCooldown = WAVE_REWARD_CONFIG.cooldown;
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
    speed: TOWER_STATS.projectileSpeed * currentScale(),
    damage: state.tower.damage,
    radius: actorMetric(TOWER_STATS.projectileRadius),
  });
}

function updateLaser(delta) {
  state.tower.laserAngle =
    (state.tower.laserAngle + getLaserRotationSpeed() * delta * Math.PI * 2) %
    (Math.PI * 2);
  const beamHalfWidth = TOWER_STATS.laserBeamHalfWidth;
  const damagePerSecond = getLaserDamagePerSecond();
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = state.enemies[i];
    const dx = enemy.x - base.x;
    const dy = enemy.y - base.y;
    const dist = Math.hypot(dx, dy);
    if (
      dist >
      Math.max(view.width, view.height) * TOWER_STATS.laserMaxRangeMultiplier +
        enemy.radius
    ) {
      continue;
    }
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
    duration: SHOCKWAVE_CONFIG.duration,
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
      const effectiveStun =
        stunDuration *
        (SHOCKWAVE_CONFIG.stunBaseRatio + falloff * SHOCKWAVE_CONFIG.stunBonusRatio);
      enemy.applyStun(effectiveStun);
      const damage =
        state.tower.damage *
        (SHOCKWAVE_CONFIG.damageBaseRatio + falloff * SHOCKWAVE_CONFIG.damageBonusRatio);
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
    const dist = Math.max(Math.hypot(dx, dy), PROJECTILE_HIT_FUDGE);
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
  const delta = Math.min((now - lastTime) / 1000, MAX_FRAME_TIME);
  lastTime = now;
  update(delta);
  render();
  updateUI();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const availableWidth = Math.max(
    CANVAS_LIMITS.minWidth,
    window.innerWidth - CANVAS_LIMITS.widthPadding,
  );
  const availableHeight = Math.max(
    CANVAS_LIMITS.minHeight,
    window.innerHeight - CANVAS_LIMITS.heightPadding,
  );
  let width = Math.min(availableWidth, CANVAS_LIMITS.maxWidth);
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
  resizeTimer = setTimeout(resizeCanvas, RESIZE_DEBOUNCE_MS);
});

resizeCanvas();
recalcTowerStats();
updateUI();
logEvent(
  "Welcome! Auto-waves, rotating lasers, and shockwaves are online—upgrade wisely.",
);
requestAnimationFrame(loop);
