// ========== Canvas Setup ==========
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const miniMapCanvas = document.getElementById("miniMap");
const miniMapCtx = miniMapCanvas.getContext("2d");
const box = 20;
const canvasSize = 600;
const miniMapScale = 0.25; // 150px canvas for 600px game area

// ========== Sound Setup ==========
const sounds = {
  bgm: new Audio('sounds/bgm.mp3'),
  levelup: new Audio('sounds/levelup.mp3'),
  gameover: new Audio('sounds/gameover.mp3'),
  portal: new Audio('sounds/portal.mp3'),
  powerup: new Audio('sounds/powerup.mp3'),
  powerupeaten: new Audio('sounds/powerupeaten.mp3'),
  foodeaten: new Audio('sounds/foodeaten.mp3'),
  bonus: new Audio('sounds/bonus.mp3'),
  button: new Audio('sounds/button.mp3')
};

// Configure background music
sounds.bgm.loop = true;
sounds.bgm.volume = 0.3; // Adjust volume as needed

// Set volumes for sound effects
Object.keys(sounds).forEach(key => {
  if (key !== 'bgm') {
    sounds[key].volume = 0.5; // Adjust volume as needed
  }
});

// ========== Game State ==========
let snake = [{ x: 9 * box, y: 10 * box }];
let direction = null;
let food = {};
let bonusFood = null;
let powerFood = null;
let score = 0;
let level = 1;
let speed = 150;
let gameInterval = null;
let isPaused = false;
let gameStarted = false;
let allowWrap = true;
let comboCount = 0;
let lastEatTime = 0;
let obstacles = [];
let portals = [];
let comboDisplayTimer = 0;
let performanceTimer = 0;
let particles = [];
let growthEffect = { active: false, timer: 0, scale: 1 };
let activePowerUps = {
  speed: 0,
  freeze: 0,
  ghost: 0
};
let baseSpeed = 150; // Store the base speed before power-up modifications
let powerUpHistory = [];

// ========== DOM Elements ==========
const scoreElement = document.getElementById("score");
const levelElement = document.getElementById("level");
const pauseOverlay = document.getElementById("pauseOverlay");
const countdownText = document.getElementById("countdownText");
const gameOverScreen = document.getElementById("gameOverScreen");
const levelUpPopup = document.getElementById("levelUpPopup");
const performanceSummary = document.getElementById("performanceSummary");

// ========== Start Loader ==========
const titleScreen = document.getElementById("titleScreen");
const mainGame = document.getElementById("mainGame");
const loadingBar = document.getElementById("loadingBar");

let loadingProgress = 0;
const loadingInterval = setInterval(() => {
  loadingProgress += 2;
  loadingBar.style.width = loadingProgress + "%";
  if (loadingProgress >= 100) {
    clearInterval(loadingInterval);
    titleScreen.style.opacity = 0;
    setTimeout(() => {
      titleScreen.style.display = "none";
      mainGame.style.display = "flex";
      // FIX: Initialize game state properly when main game becomes visible
      initializeGame();
    }, 1000);
  }
}, 50);

// ========== Utility Functions ==========
function randomPosition() {
  let position;
  do {
    position = {
      x: Math.floor(Math.random() * (canvasSize / box)) * box,
      y: Math.floor(Math.random() * (canvasSize / box)) * box,
    };
  } while (
    snake.some(seg => seg.x === position.x && seg.y === position.y) ||
    obstacles.some(obs => obs.x === position.x && obs.y === position.y) ||
    portals.some(portal => portal.x === position.x && portal.y === position.y)
  );
  return position;
}

function randomBonusFood() {
  if (!gameStarted) return;
  bonusFood = { ...randomPosition(), timer: 8000 };
  sounds.bonus.play().catch(e => console.log('Sound play failed:', e));
}


function randomPowerFood() {
  if (!gameStarted) return;
  const types = ["speed", "freeze", "ghost"];
  
  // Simple, fair random selection
  let selectedType;
  
  // If we haven't used all types recently, avoid repeating the last one
  if (powerUpHistory.length > 0) {
    const availableTypes = types.filter(type => type !== powerUpHistory[powerUpHistory.length - 1]);
    selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
  } else {
    selectedType = types[Math.floor(Math.random() * types.length)];
  }
  
  // Track the last few power-ups to ensure variety
  powerUpHistory.push(selectedType);
  if (powerUpHistory.length > 2) {
    powerUpHistory.shift(); // Keep only the last 2
  }
  
  powerFood = { ...randomPosition(), type: selectedType, timer: 10000 };
  sounds.powerup.play().catch(e => console.log('Sound play failed:', e));
}

function addObstacle() {
  const pos = randomPosition();
  obstacles.push({
    x: pos.x,
    y: pos.y,
    dx: level >= 5 ? (Math.random() < 0.5 ? box : -box) : 0,
    dy: level >= 5 ? (Math.random() < 0.5 ? box : -box) : 0,
    moveTimer: 0
  });
}

function addPortalPair() {
  portals = [randomPosition(), randomPosition()];
}

function updateObstacles() {
  if (level >= 5) {
    obstacles.forEach(obstacle => {
      obstacle.moveTimer++;
      if (obstacle.moveTimer >= 60) { // Move every 60 frames
        obstacle.moveTimer = 0;

        let newX = obstacle.x + obstacle.dx;
        let newY = obstacle.y + obstacle.dy;

        // Bounce off walls
        if (newX < 0 || newX >= canvasSize) {
          obstacle.dx = -obstacle.dx;
        } else {
          obstacle.x = newX;
        }

        if (newY < 0 || newY >= canvasSize) {
          obstacle.dy = -obstacle.dy;
        } else {
          obstacle.y = newY;
        }
      }
    });
  }
}

function drawParticle(x, y, color) {
  particles.push({
    x: x + Math.random() * box - box / 2,
    y: y + Math.random() * box - box / 2,
    color,
    life: 30,
    dx: (Math.random() - 0.5) * 2,
    dy: (Math.random() - 0.5) * 2
  });
}

function updateParticles() {
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / 30;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, p.life / 10), 0, 2 * Math.PI);
    ctx.fill();
    p.x += p.dx;
    p.y += p.dy;
    p.life--;
  });
  particles = particles.filter(p => p.life > 0);
  ctx.globalAlpha = 1;
}

function triggerGrowthEffect() {
  growthEffect.active = true;
  growthEffect.timer = 20;
  growthEffect.scale = 1.5;
}

function updateGrowthEffect() {
  if (growthEffect.active) {
    growthEffect.scale = Math.max(1, growthEffect.scale - 0.025);
    growthEffect.timer--;
    if (growthEffect.timer <= 0) {
      growthEffect.active = false;
      growthEffect.scale = 1;
    }
  }
}

function drawCircle(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + box / 2, y + box / 2, box / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGlowCircle(x, y, color, glowColor) {
  // Draw glow effect
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 15;
  drawCircle(x, y, color);
  ctx.shadowBlur = 0;
}

function drawPowerUpIndicators() {
  let yOffset = 20;
  const currentTime = Date.now();
  ctx.font = "16px Arial";
  ctx.textAlign = "left";

  // Speed power-up indicator
  if (activePowerUps.speed > 0) {
    const timeLeft = Math.ceil((activePowerUps.speed - currentTime) / 1000);
    if (timeLeft > 0) {
      ctx.fillStyle = "#00ff00";
      ctx.fillText(`⚡ Speed: ${timeLeft}s`, 10, yOffset);
      yOffset += 25;
    }
  }

  // Freeze power-up indicator
  if (activePowerUps.freeze > 0) {
    const timeLeft = Math.ceil((activePowerUps.freeze - currentTime) / 1000);
    if (timeLeft > 0) {
      ctx.fillStyle = "#ff00ff";
      ctx.fillText(`❄️ Freeze: ${timeLeft}s`, 10, yOffset);
      yOffset += 25;
    }
  }

  // Ghost power-up indicator
  if (activePowerUps.ghost > 0) {
    const timeLeft = Math.ceil((activePowerUps.ghost - currentTime) / 1000);
    if (timeLeft > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`👻 Ghost: ${timeLeft}s`, 10, yOffset);
      yOffset += 25;
    }
  }
}

function updatePowerUps() {
  const currentTime = Date.now();

  // Check each power-up and update timers
  Object.keys(activePowerUps).forEach(key => {
    if (activePowerUps[key] > 0) {
      // Check if power-up has expired
      if (currentTime >= activePowerUps[key]) {
        activePowerUps[key] = 0;

        // Reset power-up effects when they expire
        if (key === "speed") {
          // Restore original speed
          speed = baseSpeed;
          if (gameStarted && !isPaused) {
            clearInterval(gameInterval);
            gameInterval = setInterval(draw, speed);
          }
        }
        // Freeze and ghost effects are automatically handled in the draw function
        // by checking the activePowerUps values
      }
    }
  });
}

// ========== Mini-Map Functions ==========
function drawMiniMap() {
  // Clear mini-map
  miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  // Draw mini-map border
  miniMapCtx.strokeStyle = "#00ffff";
  miniMapCtx.lineWidth = 1;
  miniMapCtx.strokeRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  // Draw snake on mini-map
  snake.forEach((segment, index) => {
    const x = segment.x * miniMapScale;
    const y = segment.y * miniMapScale;
    miniMapCtx.fillStyle = index === 0 ? "#00ffff" : "#0099cc";
    miniMapCtx.fillRect(x, y, box * miniMapScale, box * miniMapScale);
  });

  // Draw food on mini-map
  if (food.x !== undefined && food.y !== undefined) {
    miniMapCtx.fillStyle = "#ff4081";
    miniMapCtx.fillRect(food.x * miniMapScale, food.y * miniMapScale, box * miniMapScale, box * miniMapScale);
  }

  // Draw bonus food on mini-map
  if (bonusFood) {
    miniMapCtx.fillStyle = "#ffff00";
    miniMapCtx.fillRect(bonusFood.x * miniMapScale, bonusFood.y * miniMapScale, box * miniMapScale, box * miniMapScale);
  }

  // Draw power food on mini-map
  if (powerFood) {
    let color = powerFood.type === "speed" ? "#00ff00" :
      powerFood.type === "freeze" ? "#ff00ff" : "#ffffff";
    miniMapCtx.fillStyle = color;
    miniMapCtx.fillRect(powerFood.x * miniMapScale, powerFood.y * miniMapScale, box * miniMapScale, box * miniMapScale);
  }

  // Draw obstacles on mini-map
  obstacles.forEach(obstacle => {
    miniMapCtx.fillStyle = activePowerUps.freeze > 0 ? "#666666" : "#ff0000";
    miniMapCtx.fillRect(obstacle.x * miniMapScale, obstacle.y * miniMapScale, box * miniMapScale, box * miniMapScale);
  });

  // Draw portals on mini-map
  if (portals.length === 2) {
    portals.forEach(portal => {
      miniMapCtx.fillStyle = "#00ffcc";
      miniMapCtx.fillRect(portal.x * miniMapScale, portal.y * miniMapScale, box * miniMapScale, box * miniMapScale);
    });
  }
}

// ========== Power-Up loading Bar ==========
function updatePowerUpTracker() {
  const currentTime = Date.now();

  const trackers = [
    { key: 'speed', itemId: 'speedPowerup', barId: 'speedBar' },
    { key: 'freeze', itemId: 'freezePowerup', barId: 'freezeBar' },
    { key: 'ghost', itemId: 'ghostPowerup', barId: 'ghostBar' },
  ];

  trackers.forEach(({ key, itemId, barId }) => {
    const item = document.getElementById(itemId);
    const fill = document.getElementById(barId);

    if (!item || !fill) return;

    if (activePowerUps[key] > 0) {
      const timeLeft = Math.max(0, (activePowerUps[key] - currentTime) / 1000);
      const percent = Math.min(100, (timeLeft / getPowerUpDuration(key)) * 100);

      item.classList.add('active');
      fill.style.width = `${percent}%`;
    } else {
      item.classList.remove('active');
      fill.style.width = '0%';
    }
  });
}

// Helper to return each power-up’s total duration in seconds
function getPowerUpDuration(type) {
  if (type === 'speed') return 5;
  if (type === 'freeze') return 10;
  if (type === 'ghost') return 7.5;
  return 0;
}


// FIX: Add proper initialization function
function initializeGame() {
  // Clear canvases
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  // Reset game state to initial values
  snake = [{ x: 9 * box, y: 10 * box }];
  direction = null;
  score = 0;
  level = 1;
  speed = 150;
  baseSpeed = 150;
  gameStarted = false;
  isPaused = false;
  obstacles = [];
  portals = [];
  particles = [];
  comboCount = 0;
  lastEatTime = 0;
  activePowerUps = { speed: 0, freeze: 0, ghost: 0 };
  bonusFood = null;
  powerFood = null;

  // Initialize food position
  food = {};

  // Update display elements
  scoreElement.textContent = score;
  levelElement.textContent = level;

  // Hide all overlays
  gameOverScreen.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  levelUpPopup.classList.add("hidden");

}

// FIX: Improved function to draw initial game state
function drawInitialGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw initial snake
  snake.forEach((s, i) => {
    if (i === 0) {
      drawGlowCircle(s.x, s.y, "#00ffff", "#00ffff");
    } else {
      drawCircle(s.x, s.y, "#0099cc");
    }
  });

  // Draw initial food
  if (food.x !== undefined && food.y !== undefined) {
    drawGlowCircle(food.x, food.y, "#ff4081", "#ff4081");
  }

  // Draw mini-map
  drawMiniMap();
  updatePowerUpTracker();
  // Clear canvases to show empty game area
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  miniMapCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

}

function draw() {
  // FIX: Add check to prevent drawing when game is not started
  if (!gameStarted || isPaused) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw snake with enhanced effects
  updateGrowthEffect();
  snake.forEach((s, i) => {
    if (i === 0) {
      drawGlowCircle(s.x, s.y, "#00ffff", "#00ffff");
      // Add extra glow effect when growing
      if (growthEffect.active) {
        ctx.shadowBlur = 20 * growthEffect.scale;
        drawGlowCircle(s.x, s.y, "#00ffff", "#00ffff");
        ctx.shadowBlur = 0;
      }
    } else {
      drawCircle(s.x, s.y, activePowerUps.ghost > 0 ? "#4d99cc" : "#0099cc");
    }
  });

  // Draw food with sparkle particles
  drawGlowCircle(food.x, food.y, "#ff4081", "#ff4081");
  for (let i = 0; i < 3; i++) {
    drawParticle(food.x, food.y, "#ff4081");
  }

  // Draw bonus food
  if (bonusFood) {
    drawGlowCircle(bonusFood.x, bonusFood.y, "#ffff00", "#ffff00");
    drawParticle(bonusFood.x, bonusFood.y, "#ffff00");
  }

  // Draw power food
  if (powerFood) {
    let color = powerFood.type === "speed" ? "#00ff00" :
      powerFood.type === "freeze" ? "#ff00ff" : "#ffffff";
    drawGlowCircle(powerFood.x, powerFood.y, color, color);
    drawParticle(powerFood.x, powerFood.y, color);
  }

  // Draw obstacles
  obstacles.forEach(o => {
    if (activePowerUps.freeze === 0) {
      drawGlowCircle(o.x, o.y, "#ff0000", "#ff0000");
    } else {
      drawCircle(o.x, o.y, "#666666"); // Frozen obstacles
    }
  });

  // Draw portals
  if (portals.length === 2) {
    drawGlowCircle(portals[0].x, portals[0].y, "#00ffcc", "#00ffcc");
    drawGlowCircle(portals[1].x, portals[1].y, "#00ffcc", "#00ffcc");
    drawParticle(portals[0].x, portals[0].y, "#00ffcc");
    drawParticle(portals[1].x, portals[1].y, "#00ffcc");
  }

  // Update particles and power-ups
  updateParticles();
  updatePowerUps();
  updateObstacles();

  // Update mini-map and power-up tracker
  drawMiniMap();
  updatePowerUpTracker();

  // Move snake
  let head = { ...snake[0] };
  if (direction === "LEFT") head.x -= box;
  if (direction === "RIGHT") head.x += box;
  if (direction === "UP") head.y -= box;
  if (direction === "DOWN") head.y += box;

  // Handle wrapping
  if (allowWrap) {
    head.x = (head.x + canvasSize) % canvasSize;
    head.y = (head.y + canvasSize) % canvasSize;
  }

  // Check food collision
  if (head.x === food.x && head.y === food.y) {
    sounds.foodeaten.play().catch(e => console.log('Sound play failed:', e));

    const previousScore = score;
    score++;
    triggerGrowthEffect();
    scoreElement.textContent = score;
    food = randomPosition();

    // Combo system
    let now = Date.now();
    if (now - lastEatTime < 2000) {
      comboCount++;
      score += Math.min(comboCount, 5); // Cap combo bonus
      scoreElement.textContent = score;
    } else {
      comboCount = 1;
    }
    lastEatTime = now;

    // Level up every 10 points - check if we crossed a level boundary
    const previousLevel = Math.floor(previousScore / 10) + 1;
    const currentLevel = Math.floor(score / 10) + 1;

    if (currentLevel > previousLevel) {
      level = currentLevel;
      levelElement.textContent = level;
      showLevelUp();

      // Increase speed
      speed = Math.max(50, speed - 5);
      baseSpeed = speed; // Update base speed for power-up calculations
      clearInterval(gameInterval);
      gameInterval = setInterval(draw, speed);

      // Add obstacles starting from level 3, on odd levels
      if (level >= 3 && level % 2 === 1) {
        addObstacle();
      }

      // Add portals every few levels
      if (level % 3 === 0) {
        addPortalPair();
      }

      // Spawn bonus food and power food more frequently at higher levels
      if (level >= 2 && Math.random() < 0.5) {
        setTimeout(() => {
          if (gameStarted) randomBonusFood();
        }, 2000);
      }
      if (level >= 2 && Math.random() < 0.6) {
        setTimeout(() => {
          if (gameStarted) randomPowerFood();
        }, 2500);
      }
    }
  } else {
    snake.pop();
  }

  // Check bonus food collision
  if (bonusFood && head.x === bonusFood.x && head.y === bonusFood.y) {
    sounds.foodeaten.play().catch(e => console.log('Sound play failed:', e));

    score += 5;
    scoreElement.textContent = score;
    bonusFood = null; // FIX 3: Immediately remove bonus food when eaten
    for (let i = 0; i < 8; i++) {
      drawParticle(head.x, head.y, "#ffff00");
    }
  }

  // Check power food collision
  if (powerFood && head.x === powerFood.x && head.y === powerFood.y) {
    sounds.powerupeaten.play().catch(e => console.log('Sound play failed:', e));

    score += 3;
    scoreElement.textContent = score;

    // Apply power-up effects with time-based duration
    const currentTime = Date.now();
    if (powerFood.type === "speed") {
      activePowerUps.speed = currentTime + 5000; // 5 seconds
      speed = Math.max(30, baseSpeed - 40); // Significantly faster
      clearInterval(gameInterval);
      gameInterval = setInterval(draw, speed);
    } else if (powerFood.type === "freeze") {
      activePowerUps.freeze = currentTime + 10000; // 10 seconds
    } else if (powerFood.type === "ghost") {
      activePowerUps.ghost = currentTime + 7500; // 7.5 seconds
    }

    powerFood = null; // FIX 3: Immediately remove power food when eaten
    for (let i = 0; i < 10; i++) {
      drawParticle(head.x, head.y, "#ffffff");
    }
  }

  // Check portal collision
  if (portals.length === 2) {
    if (head.x === portals[0].x && head.y === portals[0].y) {
      sounds.portal.play().catch(e => console.log('Sound play failed:', e));
      head = { ...portals[1] };
      for (let i = 0; i < 6; i++) {
        drawParticle(head.x, head.y, "#00ffcc");
      }
    } else if (head.x === portals[1].x && head.y === portals[1].y) {
      sounds.portal.play().catch(e => console.log('Sound play failed:', e));
      head = { ...portals[0] };
      for (let i = 0; i < 6; i++) {
        drawParticle(head.x, head.y, "#00ffcc");
      }
    }
  }

  // Check collisions
  const hitWall = !allowWrap && (head.x < 0 || head.x >= canvasSize || head.y < 0 || head.y >= canvasSize);
  const hitSelf = activePowerUps.ghost === 0 && snake.some(seg => seg.x === head.x && seg.y === head.y);
  // FIX 2: Fixed ghost power-up logic - check if ghost is NOT active AND freeze is NOT active
  const hitObstacle = activePowerUps.ghost === 0 && activePowerUps.freeze === 0 && obstacles.some(o => o.x === head.x && o.y === head.y);
  if (hitWall || hitSelf || hitObstacle) {

    clearInterval(gameInterval);
    showGameOver();
    return;
  }

  // Update timers for bonus and power foods (only if they still exist)
  if (bonusFood) {
    bonusFood.timer -= speed;
    if (bonusFood.timer <= 0) {
      bonusFood = null;
    }
  }

  if (powerFood) {
    powerFood.timer -= speed;
    if (powerFood.timer <= 0) {
      powerFood = null;
    }
  }

  snake.unshift(head);
}

function showLevelUp() {
  sounds.levelup.play().catch(e => console.log('Sound play failed:', e));

  levelUpPopup.textContent = `LEVEL ${level}`;
  levelUpPopup.classList.remove("hidden");
  setTimeout(() => levelUpPopup.classList.add("hidden"), 2000);
}

function showGameOver() {
  sounds.bgm.pause();
  sounds.gameover.play().catch(e => console.log('Sound play failed:', e));

  gameStarted = false; // FIX: Set gameStarted to false when game is over

  const accuracy = score > 0 ? Math.round((score / (score + obstacles.length)) * 100) : 0;
  performanceSummary.innerHTML = `
    <div>GAME OVER</div>
    <div>Final Score: ${score}</div>
    <div>Level Reached: ${level}</div>
    <div>Accuracy: ${accuracy}%</div>
  `;
  gameOverScreen.classList.remove("hidden");
}

function startGame() {
  sounds.button.play().catch(e => console.log('Sound play failed:', e));

  // Clear all existing timeouts and intervals
  clearInterval(gameInterval);

  // Reset all game state
  snake = [{ x: 9 * box, y: 10 * box }];
  direction = null;
  score = 0;
  level = 1;
  speed = 150;
  baseSpeed = 150;
  gameStarted = true; // FIX: Set this to true immediately
  isPaused = false;
  obstacles = [];
  portals = [];
  particles = [];
  comboCount = 0;
  lastEatTime = 0;
  activePowerUps = { speed: 0, freeze: 0, ghost: 0 };
  powerUpHistory = [];

  // Reset display elements
  scoreElement.textContent = score;
  levelElement.textContent = level;

  // Generate initial game objects
  food = randomPosition();
  bonusFood = null;
  powerFood = null;

  // Add initial portals (level 1)
  portals = [randomPosition(), randomPosition()];

  // Hide all overlays
  gameOverScreen.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  levelUpPopup.classList.add("hidden");

  // Initialize mini-map and power-up tracker
  drawMiniMap();
  updatePowerUpTracker();

  // Start background music
  sounds.bgm.currentTime = 0;
  sounds.bgm.play().catch(e => console.log('Sound play failed:', e));

  // Start game loop
  gameInterval = setInterval(draw, speed);
}

function pauseGame() {
  if (!gameStarted) return;
  if (!isPaused) {
    clearInterval(gameInterval);
    sounds.bgm.pause();
    pauseOverlay.classList.remove("hidden");
    countdownText.textContent = "PAUSED - Press P to Resume";
    isPaused = true;
  } else {
    startResumeCountdown();
  }
}

function startResumeCountdown() {
  let count = 3;
  countdownText.textContent = `Resuming in ${count}...`;
  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownText.textContent = `Resuming in ${count}...`;
    } else {
      clearInterval(interval);
      pauseOverlay.classList.add("hidden");
      isPaused = false;
      sounds.bgm.play().catch(e => console.log('Sound play failed:', e));
      gameInterval = setInterval(draw, speed);
      countdownText.textContent = "";
    }
  }, 1000);
}

function exitGame() {
  sounds.button.play().catch(e => console.log('Sound play failed:', e));
  sounds.bgm.pause();

  clearInterval(gameInterval);
  gameStarted = false; // FIX: Set gameStarted to false when exiting

  // Reset game state
  snake = [{ x: 9 * box, y: 10 * box }];
  direction = null;
  score = 0;
  level = 1;
  speed = 150;
  baseSpeed = 150;
  isPaused = false;
  obstacles = [];
  portals = [];
  particles = [];
  activePowerUps = { speed: 0, freeze: 0, ghost: 0 };
  powerUpHistory = [];
  bonusFood = null;
  powerFood = null;

  // Generate initial food
  food = randomPosition();

  // Update display
  scoreElement.textContent = "0";
  levelElement.textContent = "1";

  // Hide overlays
  gameOverScreen.classList.add("hidden");
  pauseOverlay.classList.add("hidden");

  // Draw initial state
  drawInitialGame();
}

// ========== Event Listeners ==========
document.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P") {
    pauseGame();
    return;
  }

  if (!gameStarted || isPaused) return;

  if (e.key === "ArrowLeft" && direction !== "RIGHT") direction = "LEFT";
  if (e.key === "ArrowRight" && direction !== "LEFT") direction = "RIGHT";
  if (e.key === "ArrowUp" && direction !== "DOWN") direction = "UP";
  if (e.key === "ArrowDown" && direction !== "UP") direction = "DOWN";
});

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("exitBtn").addEventListener("click", exitGame);
document.getElementById("playAgainBtn").addEventListener("click", startGame);
document.getElementById("wrapToggle").addEventListener("change", (e) => allowWrap = e.target.checked);

// Initialize
food = randomPosition();