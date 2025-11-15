const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const DESIGN_SIZE = { width: 600, height: 800 };
const ASPECT_RATIO = DESIGN_SIZE.width / DESIGN_SIZE.height;
const view = { width: DESIGN_SIZE.width, height: DESIGN_SIZE.height };

const ui = {
  wave: document.getElementById('wave'),
  coins: document.getElementById('coins'),
  health: document.getElementById('health'),
  startWave: document.getElementById('startWave'),
  upgradeDamage: document.getElementById('upgradeDamage'),
  upgradeFireRate: document.getElementById('upgradeFireRate'),
  upgradeRange: document.getElementById('upgradeRange'),
  log: document.getElementById('eventLog')
};

const base = {
  x: view.width / 2,
  y: view.height - 90,
  radius: 48
};

const state = {
  coins: 120,
  wave: 1,
  health: 20,
  enemies: [],
  projectiles: [],
  spawnQueue: [],
  waveActive: false,
  gameOver: false,
  passiveIncome: 4,
  tower: {
    fireCooldown: 0,
    damage: 12,
    fireRate: 1.25,
    range: 220
  }
};

const towerUpgrades = {
  damage: 0,
  fireRate: 0,
  range: 0
};

const upgradeDefs = {
  damage: { baseCost: 35, growth: 1.45, description: 'Increase projectile damage by 4.' },
  fireRate: { baseCost: 40, growth: 1.4, description: 'Shoot faster by +15% fire rate.' },
  range: { baseCost: 30, growth: 1.35, description: 'Extend tower targeting radius by 12px.' }
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

function updateBaseMetrics() {
  base.x = view.width / 2;
  base.y = view.height - scaleMetric(90);
  base.radius = scaleMetric(48);
}

function recalcTowerStats() {
  state.tower.damage = 12 + towerUpgrades.damage * 4;
  state.tower.fireRate = 1.25 * (1 + towerUpgrades.fireRate * 0.15);
  const rangeBase = 220 + towerUpgrades.range * 12;
  state.tower.range = scaleMetric(rangeBase);
}

function logEvent(message) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEntries.unshift(`[${timestamp}] ${message}`);
  logEntries = logEntries.slice(0, 10);
  ui.log.innerHTML = logEntries.map((entry) => `<p>${entry}</p>`).join('');
}

class Enemy {
  constructor(tier) {
    this.id = ++enemyIdSeed;
    this.radius = scaleMetric(18);
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
    this.x = scaleMetric(80) + Math.random() * (view.width - scaleMetric(160));
    this.y = -this.radius;
  }

  update(delta) {
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
}

function enemyStats(tier) {
  const factor = 1 + (state.wave - 1) * 0.08;
  const tiers = {
    1: { health: 35 * factor, speed: 42, reward: 6, damage: 1, color: '#72f1b8' },
    2: { health: 80 * factor, speed: 32, reward: 12, damage: 2, color: '#42c3ff' },
    3: { health: 220 * factor, speed: 24, reward: 30, damage: 5, color: '#f39b45' }
  };
  return tiers[tier] || tiers[1];
}

function queueWave(wave) {
  const enemyTotal = Math.min(38, 6 + wave * 3);
  const cadence = Math.max(0.25, 1.1 - wave * 0.03);
  const queue = [];
  for (let i = 0; i < enemyTotal; i += 1) {
    let tier = 1;
    if (wave > 4 && i % 5 === 0) tier = 2;
    if (wave % 6 === 0 && i === enemyTotal - 1) tier = 3;
    queue.push({ delay: i * cadence, tier });
  }
  state.spawnQueue = queue;
  state.waveActive = true;
  logEvent(`Wave ${wave} inbound with ${enemyTotal} enemies.`);
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
    const bonus = Math.round(25 + state.wave * 6 + towerUpgrades.damage * 2);
    state.coins += bonus;
    logEvent(`Wave ${state.wave} cleared. Bonus +${bonus} coins.`);
    state.wave += 1;
    state.coins += state.passiveIncome;
  }
}

function startWave() {
  if (state.waveActive || state.gameOver) return;
  queueWave(state.wave);
  updateUI();
}

function purchaseUpgrade(name) {
  const def = upgradeDefs[name];
  const level = towerUpgrades[name];
  const cost = Math.round(def.baseCost * Math.pow(def.growth, level));
  if (state.coins < cost) return;
  state.coins -= cost;
  towerUpgrades[name] += 1;
  recalcTowerStats();
  logEvent(`${name} upgraded to level ${towerUpgrades[name]}.`);
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
    y: base.y - scaleMetric(20),
    target,
    speed: 520 * currentScale(),
    damage: state.tower.damage,
    radius: scaleMetric(5)
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
        const reward = projectile.target.reward;
        state.coins += reward;
        logEvent(`Destroyed tier ${projectile.target.tier} enemy (+${reward}).`);
        const idx = state.enemies.indexOf(projectile.target);
        if (idx >= 0) state.enemies.splice(idx, 1);
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
        logEvent('The tower has fallen. Refresh to try again.');
        state.waveActive = false;
        state.spawnQueue = [];
        break;
      }
    }
  }
}

function updateUI() {
  ui.wave.textContent = state.wave;
  ui.coins.textContent = Math.floor(state.coins);
  ui.health.textContent = state.health;
  ui.startWave.disabled = state.waveActive || state.gameOver;
  const buttonMap = [
    ['damage', ui.upgradeDamage],
    ['fireRate', ui.upgradeFireRate],
    ['range', ui.upgradeRange]
  ];
  buttonMap.forEach(([name, element]) => {
    const level = towerUpgrades[name];
    const cost = Math.round(upgradeDefs[name].baseCost * Math.pow(upgradeDefs[name].growth, level));
    element.textContent = `${capitalize(name)} (Lv.${level}) - ${cost}c`;
    element.disabled = state.coins < cost || state.gameOver;
  });
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, '#091224');
  gradient.addColorStop(1, '#02040a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  const step = Math.max(30, scaleMetric(40));
  for (let y = 0; y < view.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
  }
}

function drawBase() {
  ctx.save();
  ctx.shadowColor = '#00d5ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#0f6a8f';
  ctx.beginPath();
  ctx.arc(base.x, base.y, base.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(17, 210, 255, 0.3)';
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
    const barHeight = Math.max(4, scaleMetric(4));
    ctx.fillStyle = '#111523';
    ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - scaleMetric(8), barWidth, barHeight);
    ctx.fillStyle = '#4dfcb8';
    ctx.fillRect(
      enemy.x - enemy.radius,
      enemy.y - enemy.radius - scaleMetric(8),
      barWidth * (enemy.health / enemy.maxHealth),
      barHeight
    );
  });
}

function drawProjectiles() {
  ctx.fillStyle = '#f8e45c';
  state.projectiles.forEach((projectile) => {
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHUD() {
  const scale = currentScale();
  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.fillStyle = '#f9fafc';
    ctx.font = `bold ${Math.max(28, 36 * scale)}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Tower Destroyed', view.width / 2, view.height / 2 - scaleMetric(20));
    ctx.font = `${Math.max(16, 20 * scale)}px "Inter", sans-serif`;
    ctx.fillText('Refresh to restart your defense.', view.width / 2, view.height / 2 + scaleMetric(20));
  } else if (!state.waveActive) {
    const pad = scaleMetric(50);
    const hudHeight = scaleMetric(80);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(pad, view.height - hudHeight - pad, view.width - pad * 2, hudHeight);
    ctx.fillStyle = '#dce8ff';
    ctx.font = `${Math.max(16, 20 * scale)}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Press Start Wave to send the next assault.', view.width / 2, view.height - pad - hudHeight / 2);
  }
}

function render() {
  drawBackground();
  drawBase();
  drawEnemies();
  drawProjectiles();
  drawHUD();
}

function update(delta) {
  if (state.gameOver) return;
  spawnReady(delta);
  updateEnemies(delta);
  updateProjectiles(delta);
  updateTower(delta);
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
  const hud = document.querySelector('.hud');
  const hudWidth = hud ? hud.offsetWidth : 320;
  const availableWidth = Math.max(340, window.innerWidth - hudWidth - 80);
  const availableHeight = Math.max(520, window.innerHeight - 120);
  let width = Math.min(availableWidth, 900);
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

ui.startWave.addEventListener('click', startWave);
ui.upgradeDamage.addEventListener('click', () => purchaseUpgrade('damage'));
ui.upgradeFireRate.addEventListener('click', () => purchaseUpgrade('fireRate'));
ui.upgradeRange.addEventListener('click', () => purchaseUpgrade('range'));

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 100);
});

resizeCanvas();
recalcTowerStats();
updateUI();
logEvent('Welcome, Defender! Upgrade your tower and start the first wave.');
requestAnimationFrame(loop);
