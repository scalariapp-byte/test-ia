(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const screen = document.getElementById('gameScreen');
  const overlay = document.getElementById('gameOverlay');
  const countdownDisplay = document.getElementById('countdown');
  const startButton = document.getElementById('startButton');
  const pauseButton = document.getElementById('pauseButton');
  const touchDashButton = document.getElementById('touchDashButton');
  const soundButton = document.getElementById('soundButton');
  const scoreValue = document.getElementById('scoreValue');
  const timerValue = document.getElementById('timerValue');
  const fragmentValue = document.getElementById('fragmentValue');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const bestScore = document.getElementById('bestScore');
  const heartElements = [...document.querySelectorAll('.heart')];
  const pauseLabel = document.getElementById('pauseLabel');
  const pauseGlyph = document.querySelector('.pause-glyph');
  const soundLabel = document.getElementById('soundLabel');
  const gameStatus = document.getElementById('gameStatus');
  const overlayKicker = document.getElementById('overlayKicker');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayCopy = document.getElementById('overlayCopy');
  const startLabel = document.getElementById('startLabel');
  const overlayHint = document.getElementById('overlayHint');

  const DURATION = 60;
  const GOAL = 12;
  const PLAYER_RADIUS = 11;
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let lastFrame = 0;
  let ambientTime = 0;
  let stars = [];
  let audioContext = null;
  let soundEnabled = true;
  let pointerDown = false;
  let pointerTarget = { x: 0, y: 0 };
  const keys = new Set();

  const game = {
    phase: 'menu',
    timeLeft: DURATION,
    countdownLeft: 0,
    elapsed: 0,
    score: 0,
    fragments: 0,
    lives: 3,
    highScore: readHighScore(),
    combo: 0,
    comboTimer: 0,
    nextShard: 0,
    nextMeteor: 0,
    screenShake: 0,
    endReason: '',
    player: {
      x: 0, y: 0, angle: -Math.PI / 2,
      vx: 0, vy: 0,
      dashX: 0, dashY: -1,
      dashTimer: 0, dashCooldown: 0,
      invulnerable: 0,
      trailTimer: 0
    },
    shards: [],
    meteors: [],
    particles: []
  };

  function readHighScore() {
    try {
      const value = Number(window.localStorage.getItem('vesper-best-score'));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveHighScore() {
    try { window.localStorage.setItem('vesper-best-score', String(game.highScore)); } catch (_) { /* Storage can be disabled. */ }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function updateHud() {
    scoreValue.textContent = String(game.score).padStart(4, '0');
    timerValue.textContent = formatTime(game.timeLeft);
    timerValue.classList.toggle('is-urgent', game.timeLeft <= 10 && game.phase === 'playing');
    fragmentValue.textContent = String(game.fragments);
    progressText.innerHTML = `${game.fragments} <span>/ ${GOAL}</span>`;
    progressFill.style.width = `${Math.min(100, (game.fragments / GOAL) * 100)}%`;
    progressBar.setAttribute('aria-valuenow', String(game.fragments));
    bestScore.textContent = String(game.highScore).padStart(4, '0');
    heartElements.forEach((heart, index) => heart.classList.toggle('is-lost', index >= game.lives));
    const heartsLeft = Math.max(0, game.lives);
    document.querySelector('.hud-lives').setAttribute('aria-label', `${heartsLeft} ${heartsLeft > 1 ? 'vies restantes' : 'vie restante'}`);
  }

  function updateScreenState() {
    const showOverlay = ['menu', 'paused', 'won', 'lost'].includes(game.phase);
    overlay.classList.toggle('is-hidden', !showOverlay);
    overlay.setAttribute('aria-hidden', String(!showOverlay));
    countdownDisplay.setAttribute('aria-hidden', String(game.phase !== 'countdown'));

    if (game.phase === 'menu') {
      overlayKicker.textContent = 'PRÊT·E À DÉCOLLER';
      overlayTitle.textContent = 'La nuit t’attend.';
      overlayCopy.textContent = 'Récupère 12 éclats avant la fin du cycle. Trois impacts, et la mission s’arrête.';
      startLabel.textContent = 'Lancer une partie';
      overlayHint.innerHTML = 'ou appuie sur <kbd>Entrée</kbd>';
      gameStatus.textContent = 'EN ATTENTE DU PILOTE';
    } else if (game.phase === 'paused') {
      overlayKicker.textContent = 'PAUSE · SECTEUR STABILISÉ';
      overlayTitle.textContent = 'Le cosmos attend.';
      overlayCopy.textContent = `Tu as récupéré ${game.fragments} éclat${game.fragments === 1 ? '' : 's'}. Reprends ton souffle, puis retourne chercher la lumière.`;
      startLabel.textContent = 'Reprendre la mission';
      overlayHint.innerHTML = 'ou appuie sur <kbd>Échap</kbd>';
      gameStatus.textContent = 'MISSION EN PAUSE';
    } else if (game.phase === 'won') {
      overlayKicker.textContent = 'MISSION ACCOMPLIE';
      overlayTitle.textContent = 'L’aube est à toi.';
      overlayCopy.textContent = `Les 12 éclats sont réunis. Score final : ${game.score} points. La nuit peut attendre.`;
      startLabel.textContent = 'Rejouer';
      overlayHint.innerHTML = 'un autre voyage ? <kbd>Entrée</kbd>';
      gameStatus.textContent = 'SIGNAL : VICTOIRE';
    } else if (game.phase === 'lost') {
      overlayKicker.textContent = 'SIGNAL PERDU';
      overlayTitle.textContent = 'La nuit reprend.';
      overlayCopy.textContent = game.endReason === 'time'
        ? `Le cycle est terminé. Tu as récupéré ${game.fragments} éclat${game.fragments === 1 ? '' : 's'} et marqué ${game.score} points.`
        : `Ta coque a cédé après ${game.fragments} éclat${game.fragments === 1 ? '' : 's'}. Le prochain pilote fera mieux.`;
      startLabel.textContent = 'Recommencer';
      overlayHint.innerHTML = 'une revanche ? <kbd>Entrée</kbd>';
      gameStatus.textContent = 'SIGNAL : MISSION TERMINÉE';
    } else if (game.phase === 'countdown') {
      gameStatus.textContent = 'INITIALISATION DU SECTEUR';
    } else if (game.phase === 'playing') {
      gameStatus.textContent = game.player.dashCooldown > 0 ? 'EN ORBITE · IMPULSION EN RECHARGE' : 'EN ORBITE · SECTEUR ACTIF';
    }

    const pauseAvailable = game.phase === 'playing' || game.phase === 'paused';
    pauseButton.disabled = !pauseAvailable;
    pauseLabel.textContent = game.phase === 'paused' ? 'REPRENDRE' : 'PAUSE';
    pauseButton.setAttribute('aria-label', game.phase === 'paused' ? 'Reprendre le jeu' : 'Mettre le jeu en pause');
    pauseButton.setAttribute('aria-pressed', String(game.phase === 'paused'));
    pauseGlyph.textContent = game.phase === 'paused' ? '▶' : 'Ⅱ';
    touchDashButton.disabled = game.phase !== 'playing';
  }

  function resizeCanvas() {
    const rect = screen.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    stars = Array.from({ length: Math.max(65, Math.floor((width * height) / 4200)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: rand(.35, 1.35),
      alpha: rand(.18, .78),
      phase: rand(0, Math.PI * 2),
      speed: rand(.3, 1.2),
      drift: rand(1, 8)
    }));
    if (game.player.x === 0 && game.player.y === 0) {
      game.player.x = width * .5;
      game.player.y = height * .53;
    } else {
      game.player.x = clamp(game.player.x, PLAYER_RADIUS + 3, width - PLAYER_RADIUS - 3);
      game.player.y = clamp(game.player.y, PLAYER_RADIUS + 3, height - PLAYER_RADIUS - 3);
    }
    if (game.shards.length) {
      game.shards.forEach(shard => {
        shard.x = clamp(shard.x, 32, width - 32);
        shard.y = clamp(shard.y, 44, height - 32);
      });
    }
  }

  function spawnShard() {
    const marginX = Math.min(42, width * .12);
    const marginTop = Math.min(78, height * .2);
    let x = width * .5;
    let y = height * .5;
    for (let attempt = 0; attempt < 10; attempt++) {
      x = rand(marginX, Math.max(marginX + 1, width - marginX));
      y = rand(marginTop, Math.max(marginTop + 1, height - 35));
      if (Math.hypot(x - game.player.x, y - game.player.y) > 105) break;
    }
    game.shards.push({ x, y, radius: rand(8, 11), rotation: rand(0, Math.PI * 2), phase: rand(0, Math.PI * 2), value: 1 });
  }

  function spawnMeteor() {
    if (game.meteors.length >= 8) return;
    const radius = rand(14, 24);
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (side === 0) { x = rand(0, width); y = -radius - 5; }
    else if (side === 1) { x = width + radius + 5; y = rand(0, height); }
    else if (side === 2) { x = rand(0, width); y = height + radius + 5; }
    else { x = -radius - 5; y = rand(0, height); }

    const aimX = game.player.x + rand(-65, 65);
    const aimY = game.player.y + rand(-65, 65);
    const angle = Math.atan2(aimY - y, aimX - x);
    const speed = rand(102, 144) + Math.min(game.elapsed * 1.45, 92);
    const points = Array.from({ length: Math.floor(rand(8, 12)) }, () => rand(.72, 1.12));
    game.meteors.push({
      x, y, radius, angle,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      warning: .68,
      rotation: rand(0, Math.PI * 2),
      spin: rand(-1.05, 1.05),
      points
    });
  }

  function addBurst(x, y, color, count, power = 100) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(power * .24, power);
      const life = rand(.35, .85);
      game.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: rand(1, 3.2),
        color,
        life,
        maxLife: life,
        drag: rand(.89, .97)
      });
    }
  }

  function playSound(kind) {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      const notes = {
        collect: [[760, 1180, .12, 'sine', .055]],
        dash: [[290, 82, .19, 'triangle', .048]],
        hit: [[190, 58, .25, 'sawtooth', .055]],
        start: [[460, 760, .22, 'sine', .045]],
        win: [[520, 1040, .5, 'sine', .045]]
      }[kind] || [];
      notes.forEach(([from, to, duration, type, volume], index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const startAt = now + index * .075;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, startAt);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to), startAt + duration);
        gain.gain.setValueAtTime(.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(volume, startAt + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + .02);
      });
      if (kind === 'win') {
        [.08, .17, .27].forEach((offset, index) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const at = now + offset;
          osc.type = 'sine';
          osc.frequency.setValueAtTime([660, 790, 1040][index], at);
          gain.gain.setValueAtTime(.0001, at);
          gain.gain.exponentialRampToValueAtTime(.035, at + .025);
          gain.gain.exponentialRampToValueAtTime(.0001, at + .34);
          osc.connect(gain);
          gain.connect(audioContext.destination);
          osc.start(at);
          osc.stop(at + .36);
        });
      }
    } catch (_) {
      // Audio is an enhancement; gameplay should work even when the browser blocks it.
    }
  }

  function startGame() {
    game.phase = 'countdown';
    game.timeLeft = DURATION;
    game.countdownLeft = 3.05;
    game.elapsed = 0;
    game.score = 0;
    game.fragments = 0;
    game.lives = 3;
    game.combo = 0;
    game.comboTimer = 0;
    game.nextShard = 1.35;
    game.nextMeteor = 1.1;
    game.screenShake = 0;
    game.endReason = '';
    game.shards = [];
    game.meteors = [];
    game.particles = [];
    game.player.x = width * .5;
    game.player.y = height * .55;
    game.player.angle = -Math.PI / 2;
    game.player.vx = 0;
    game.player.vy = 0;
    game.player.dashX = 0;
    game.player.dashY = -1;
    game.player.dashTimer = 0;
    game.player.dashCooldown = 0;
    game.player.invulnerable = .65;
    game.player.trailTimer = 0;
    pointerDown = false;
    spawnShard();
    spawnShard();
    spawnShard();
    countdownDisplay.textContent = '3';
    updateHud();
    updateScreenState();
    playSound('start');
  }

  function finishGame(won, reason = '') {
    if (!['playing', 'countdown'].includes(game.phase)) return;
    game.phase = won ? 'won' : 'lost';
    game.endReason = reason;
    countdownDisplay.textContent = '';
    if (game.score > game.highScore) {
      game.highScore = game.score;
      saveHighScore();
    }
    updateHud();
    updateScreenState();
    playSound(won ? 'win' : 'hit');
  }

  function togglePause() {
    if (game.phase === 'playing') {
      game.phase = 'paused';
      pointerDown = false;
      keys.clear();
      updateScreenState();
    } else if (game.phase === 'paused') {
      game.phase = 'playing';
      updateScreenState();
      playSound('start');
    }
  }

  function desiredDirection() {
    let dx = 0;
    let dy = 0;
    if (keys.has('arrowleft') || keys.has('a') || keys.has('q')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w') || keys.has('z')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      return { x: dx / length, y: dy / length };
    }
    return { x: 0, y: 0 };
  }

  function dash() {
    if (game.phase !== 'playing' || game.player.dashCooldown > 0) return;
    let direction = desiredDirection();
    if (!direction.x && !direction.y && pointerDown) {
      const dx = pointerTarget.x - game.player.x;
      const dy = pointerTarget.y - game.player.y;
      const length = Math.hypot(dx, dy) || 1;
      direction = { x: dx / length, y: dy / length };
    }
    if (!direction.x && !direction.y) direction = { x: game.player.dashX, y: game.player.dashY };
    game.player.dashX = direction.x;
    game.player.dashY = direction.y;
    game.player.dashTimer = .18;
    game.player.dashCooldown = 2.1;
    game.player.invulnerable = Math.max(game.player.invulnerable, .25);
    game.player.angle = Math.atan2(direction.y, direction.x);
    addBurst(game.player.x, game.player.y, '#91fff0', 11, 135);
    playSound('dash');
    updateScreenState();
  }

  function updatePlayer(dt) {
    const player = game.player;
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.dashTimer = Math.max(0, player.dashTimer - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.trailTimer -= dt;

    let dx = 0;
    let dy = 0;
    if (pointerDown) {
      dx = pointerTarget.x - player.x;
      dy = pointerTarget.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 9) {
        dx /= distance;
        dy /= distance;
      } else {
        dx = 0;
        dy = 0;
      }
    } else {
      const direction = desiredDirection();
      dx = direction.x;
      dy = direction.y;
    }

    if (player.dashTimer > 0) {
      player.vx = player.dashX * 720;
      player.vy = player.dashY * 720;
    } else {
      player.vx = dx * 255;
      player.vy = dy * 255;
    }

    if (dx || dy) {
      player.angle = Math.atan2(dy, dx);
      player.dashX = dx;
      player.dashY = dy;
    }
    player.x = clamp(player.x + player.vx * dt, PLAYER_RADIUS + 5, width - PLAYER_RADIUS - 5);
    player.y = clamp(player.y + player.vy * dt, PLAYER_RADIUS + 5, height - PLAYER_RADIUS - 5);

    if ((dx || dy || player.dashTimer > 0) && player.trailTimer <= 0) {
      addBurst(player.x - Math.cos(player.angle) * 9, player.y - Math.sin(player.angle) * 9, '#83e9ef', 1, 22);
      game.particles[game.particles.length - 1].life = .32;
      game.particles[game.particles.length - 1].maxLife = .32;
      player.trailTimer = player.dashTimer > 0 ? .018 : .055;
    }
  }

  function updateGame(dt) {
    if (game.phase === 'countdown') {
      game.countdownLeft -= dt;
      if (game.countdownLeft > .25) {
        countdownDisplay.textContent = String(Math.ceil(game.countdownLeft));
      } else if (game.countdownLeft > 0) {
        countdownDisplay.textContent = 'GO';
      } else {
        game.phase = 'playing';
        countdownDisplay.textContent = '';
        game.player.invulnerable = .55;
        updateScreenState();
      }
      return;
    }
    if (game.phase !== 'playing') return;

    game.elapsed += dt;
    game.timeLeft = Math.max(0, game.timeLeft - dt);
    game.screenShake = Math.max(0, game.screenShake - dt);
    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) game.combo = 0;
    }

    updatePlayer(dt);
    const activeStatus = game.player.dashCooldown > 0 ? 'EN ORBITE · IMPULSION EN RECHARGE' : 'EN ORBITE · SECTEUR ACTIF';
    if (gameStatus.textContent !== activeStatus) gameStatus.textContent = activeStatus;

    game.nextShard -= dt;
    if (game.nextShard <= 0) {
      if (game.shards.length < 4) spawnShard();
      game.nextShard = rand(1.1, 1.75);
    }

    game.nextMeteor -= dt;
    if (game.nextMeteor <= 0) {
      spawnMeteor();
      game.nextMeteor = Math.max(.78, 1.62 - game.elapsed * .011) + rand(-.16, .18);
    }

    game.meteors = game.meteors.filter(meteor => {
      if (meteor.warning > 0) {
        meteor.warning -= dt;
        return true;
      }
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.rotation += meteor.spin * dt;
      return meteor.x > -85 && meteor.x < width + 85 && meteor.y > -85 && meteor.y < height + 85;
    });

    game.shards.forEach(shard => { shard.rotation += dt * .72; shard.phase += dt * 2; });
    updateParticles(dt);
    collectShards();
    if (game.fragments >= GOAL) {
      finishGame(true);
      return;
    }
    hitByMeteor();

    if (game.phase !== 'playing') return;
    if (game.score > game.highScore) {
      game.highScore = game.score;
      saveHighScore();
    }
    if (game.timeLeft <= 0) {
      finishGame(false, 'time');
      return;
    }
    updateHud();
  }

  function collectShards() {
    const player = game.player;
    game.shards = game.shards.filter(shard => {
      if (Math.hypot(shard.x - player.x, shard.y - player.y) < PLAYER_RADIUS + shard.radius + 4) {
        game.fragments += shard.value;
        game.combo += 1;
        game.comboTimer = 3.7;
        game.score += 100 + Math.min(game.combo - 1, 5) * 20;
        addBurst(shard.x, shard.y, '#9ffff0', 17, 125);
        playSound('collect');
        updateHud();
        return false;
      }
      return true;
    });
  }

  function hitByMeteor() {
    if (game.player.invulnerable > 0) return;
    const player = game.player;
    for (const meteor of game.meteors) {
      if (meteor.warning > 0) continue;
      if (Math.hypot(meteor.x - player.x, meteor.y - player.y) < meteor.radius + PLAYER_RADIUS * .68) {
        game.lives -= 1;
        player.invulnerable = 1.2;
        game.screenShake = .28;
        game.combo = 0;
        game.comboTimer = 0;
        addBurst(player.x, player.y, '#ff8796', 22, 160);
        updateHud();
        playSound('hit');
        if (game.lives <= 0) finishGame(false, 'hull');
        break;
      }
    }
  }

  function updateParticles(dt) {
    game.particles = game.particles.filter(particle => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.drag;
      particle.vy *= particle.drag;
      return particle.life > 0;
    });
  }

  function drawBackground(dt) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    const glowA = ctx.createRadialGradient(width * .23, height * .3, 2, width * .23, height * .3, Math.max(width, height) * .66);
    glowA.addColorStop(0, 'rgba(80, 62, 145, .20)');
    glowA.addColorStop(1, 'rgba(23, 26, 59, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);
    const glowB = ctx.createRadialGradient(width * .8, height * .73, 0, width * .8, height * .73, Math.max(width, height) * .55);
    glowB.addColorStop(0, 'rgba(31, 116, 137, .13)');
    glowB.addColorStop(1, 'rgba(9, 25, 48, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width * .52, height * .54);
    ctx.rotate(-.19);
    ctx.strokeStyle = 'rgba(155, 175, 231, .045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, width * .36, height * .27, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(130, 244, 227, .035)';
    ctx.beginPath();
    ctx.ellipse(0, 0, width * .47, height * .37, .13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    stars.forEach(star => {
      star.y += star.drift * dt * .4;
      if (star.y > height + 2) { star.y = -2; star.x = Math.random() * width; }
      const shimmer = .5 + .5 * Math.sin(ambientTime * star.speed + star.phase);
      ctx.globalAlpha = star.alpha * (.55 + shimmer * .45);
      ctx.fillStyle = star.radius > 1.05 ? '#d9e8ff' : '#afbedf';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
      if (star.radius > 1.12 && shimmer > .86) {
        ctx.globalAlpha = .2;
        ctx.fillRect(star.x - 4, star.y - .5, 8, 1);
        ctx.fillRect(star.x - .5, star.y - 4, 1, 8);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawShard(shard) {
    const bob = Math.sin(shard.phase) * 3;
    ctx.save();
    ctx.translate(shard.x, shard.y + bob);
    ctx.rotate(shard.rotation);
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 28);
    glow.addColorStop(0, 'rgba(145, 255, 239, .31)');
    glow.addColorStop(1, 'rgba(106, 229, 237, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = '#8df6e6';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, -shard.radius * 1.35);
    ctx.lineTo(shard.radius * .76, 0);
    ctx.lineTo(0, shard.radius * 1.35);
    ctx.lineTo(-shard.radius * .76, 0);
    ctx.closePath();
    const gem = ctx.createLinearGradient(-shard.radius, -shard.radius, shard.radius, shard.radius);
    gem.addColorStop(0, '#f4fff9');
    gem.addColorStop(.46, '#8effe5');
    gem.addColorStop(1, '#55afdc');
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(228, 255, 250, .86)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawMeteor(meteor) {
    if (meteor.warning > 0) {
      const px = clamp(meteor.x, 12, width - 12);
      const py = clamp(meteor.y, 12, height - 12);
      const pulse = .5 + .5 * Math.sin(ambientTime * 11);
      ctx.save();
      ctx.globalAlpha = .3 + pulse * .4;
      ctx.strokeStyle = '#ff8294';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(px, py, 6 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff8294';
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(meteor.x, meteor.y);
    ctx.rotate(meteor.rotation);
    ctx.shadowColor = 'rgba(255, 110, 121, .36)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    meteor.points.forEach((scale, index) => {
      const angle = (index / meteor.points.length) * Math.PI * 2;
      const x = Math.cos(angle) * meteor.radius * scale;
      const y = Math.sin(angle) * meteor.radius * scale;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const rock = ctx.createLinearGradient(-meteor.radius, -meteor.radius, meteor.radius, meteor.radius);
    rock.addColorStop(0, '#e3a08f');
    rock.addColorStop(.42, '#9a6273');
    rock.addColorStop(1, '#453c58');
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 185, 166, .43)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(43, 35, 55, .36)';
    ctx.beginPath();
    ctx.arc(-meteor.radius * .23, -meteor.radius * .15, meteor.radius * .22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(meteor.radius * .36, meteor.radius * .27, meteor.radius * .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const player = game.player;
    const flicker = player.invulnerable > 0 && Math.floor(ambientTime * 19) % 2 === 0;
    if (flicker) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle + Math.PI / 2);

    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    halo.addColorStop(0, 'rgba(138, 255, 237, .27)');
    halo.addColorStop(1, 'rgba(120, 224, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();

    if (game.phase === 'playing' && (Math.abs(player.vx) + Math.abs(player.vy) > 0)) {
      const flameLength = player.dashTimer > 0 ? 21 : 10 + Math.sin(ambientTime * 25) * 3;
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.quadraticCurveTo(0, 8 + flameLength, 4, 8);
      ctx.closePath();
      const flame = ctx.createLinearGradient(0, 7, 0, 8 + flameLength);
      flame.addColorStop(0, 'rgba(255, 232, 165, .95)');
      flame.addColorStop(.4, 'rgba(112, 255, 230, .88)');
      flame.addColorStop(1, 'rgba(103, 157, 255, 0)');
      ctx.fillStyle = flame;
      ctx.fill();
    }

    ctx.shadowColor = '#86fff0';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.quadraticCurveTo(3, -9, 8, 9);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, 9);
    ctx.quadraticCurveTo(-3, -9, 0, -15);
    ctx.closePath();
    const hull = ctx.createLinearGradient(-7, -12, 8, 10);
    hull.addColorStop(0, '#ffffff');
    hull.addColorStop(.48, '#a5fff0');
    hull.addColorStop(1, '#66aeda');
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(245, 255, 255, .9)';
    ctx.lineWidth = .8;
    ctx.stroke();
    ctx.fillStyle = '#ecffff';
    ctx.beginPath();
    ctx.arc(0, -3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (player.dashCooldown > 0 && game.phase === 'playing') {
      const ratio = 1 - player.dashCooldown / 2.1;
      ctx.save();
      ctx.strokeStyle = `rgba(130, 244, 227, ${.12 + ratio * .25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 19 + ratio * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    game.particles.forEach(particle => {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius * (.45 + alpha * .7), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawPointer() {
    if (!pointerDown || game.phase !== 'playing') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(143, 255, 237, .42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pointerTarget.x, pointerTarget.y, 15 + Math.sin(ambientTime * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pointerTarget.x, pointerTarget.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(196, 255, 248, .78)';
    ctx.fill();
    ctx.restore();
  }

  function drawFrame(dt) {
    drawBackground(dt);
    const shake = game.screenShake > 0 ? game.screenShake / .28 : 0;
    ctx.save();
    if (shake) ctx.translate(rand(-1, 1) * shake * 6, rand(-1, 1) * shake * 5);
    game.shards.forEach(drawShard);
    game.meteors.forEach(drawMeteor);
    drawParticles();
    drawPlayer();
    drawPointer();
    ctx.restore();
  }

  function loop(timestamp) {
    const dt = Math.min(.034, lastFrame ? (timestamp - lastFrame) / 1000 : 0);
    lastFrame = timestamp;
    ambientTime += dt;
    updateGame(dt);
    drawFrame(dt);
    requestAnimationFrame(loop);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, width),
      y: clamp(event.clientY - rect.top, 0, height)
    };
  }

  canvas.addEventListener('pointerdown', event => {
    if (game.phase !== 'playing') return;
    event.preventDefault();
    pointerDown = true;
    pointerTarget = canvasPoint(event);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Older browsers. */ }
  });
  canvas.addEventListener('pointermove', event => {
    if (pointerDown) pointerTarget = canvasPoint(event);
  });
  const releasePointer = () => { pointerDown = false; };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', releasePointer);

  startButton.addEventListener('click', () => {
    if (game.phase === 'paused') {
      togglePause();
    } else {
      startGame();
    }
  });
  pauseButton.addEventListener('click', togglePause);
  touchDashButton.addEventListener('click', dash);
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundButton.classList.toggle('is-muted', !soundEnabled);
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.setAttribute('aria-label', soundEnabled ? 'Désactiver les sons' : 'Activer les sons');
    soundLabel.textContent = soundEnabled ? 'SON : ON' : 'SON : OFF';
    if (soundEnabled) playSound('collect');
  });

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    const isMovement = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
    if (isMovement && game.phase === 'playing') event.preventDefault();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'a', 'z', 'q', 'w', 's', 'd'].includes(key)) keys.add(key);

    if (event.key === 'Escape') {
      if (game.phase === 'playing' || game.phase === 'paused') {
        event.preventDefault();
        togglePause();
      }
      return;
    }
    if (event.code === 'Space' || key === 'shift') {
      if (game.phase === 'playing') {
        event.preventDefault();
        if (!event.repeat) dash();
      }
      return;
    }
    const activatedControl = event.target instanceof Element && event.target.closest('button, a, input, textarea, select');
    if (key === 'enter' && !activatedControl && ['menu', 'won', 'lost'].includes(game.phase)) {
      event.preventDefault();
      startGame();
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); pointerDown = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.phase === 'playing') togglePause();
  });
  window.addEventListener('resize', resizeCanvas);

  resizeCanvas();
  updateHud();
  updateScreenState();
  requestAnimationFrame(loop);
})();
