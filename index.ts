const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
    throw new Error("failed")
}
const ctx = canvas.getContext("2d")!;
const scoreCanvas = document.getElementById("scoreCanvas") as HTMLCanvasElement;
const scoreCtx = scoreCanvas?.getContext("2d");
const timerCanvas = document.getElementById("timerCanvas") as HTMLCanvasElement;
const timerCtx = timerCanvas?.getContext("2d");
const levelSelect = document.getElementById("levelSelect") as HTMLSelectElement | null;
const gameOverOverlay = document.getElementById("gameOverOverlay") as HTMLDivElement | null;
const gameOverScore = document.getElementById("gameOverScore") as HTMLDivElement | null;

// Game settings
const GRID_SIZE = 6;
const CELL_SIZE = canvas.width / GRID_SIZE;
const PLAYER_SIZE = 40;
const TARGET_SIZE = 35;
const ATTRACTOR_SIZE = 35;
const GRAVITY = 0.1;

// Colors
const COLOR_BACKGROUND = "#5a4a3a";
const COLOR_GRID = "#6a5a4a";
const COLOR_PLAYER_OUTER = "#666";
const COLOR_PLAYER_INNER = "#7d7d7dff";
const COLOR_PLAYER_TRAIL = "rgba(150, 150, 150, 0.3)";
const COLOR_RED_ATTRACTOR_OUTER = "#c44444";
const COLOR_RED_ATTRACTOR_INNER = "#ff6666";
const COLOR_BLUE_ATTRACTOR_OUTER = "#4444c4";
const COLOR_BLUE_ATTRACTOR_INNER = "#6666ff";
const COLOR_TARGET_OUTER = "#4CAF50";
const COLOR_TARGET_INNER = "#66ff66";
const COLOR_TARGET_PARTICLE = "#4CAF50";
const COLOR_WALL_OUTER = "#aaaaaa";
const COLOR_WALL_INNER = "#cccccc";
const COLOR_ATTRACTION_LINE_RED = "rgba(255, 100, 100, 0.3)";
const COLOR_ATTRACTION_LINE_BLUE = "rgba(100, 100, 255, 0.3)";

// 7-segment display constants
const SEGMENT_COLOR = "#ffdd00";
const SEGMENT_OFF_COLOR = "#332200";
const DIGIT_SPACING = 4;

// 7-segment digit patterns (segments: a,b,c,d,e,f,g)
const DIGIT_PATTERNS: boolean[][] = [
  [true, true, true, true, true, true, false],   // 0
  [false, true, true, false, false, false, false], // 1
  [true, true, false, true, true, false, true],  // 2
  [true, true, true, true, false, false, true],  // 3
  [false, true, true, false, false, true, true], // 4
  [true, false, true, true, false, true, true],  // 5
  [true, false, true, true, true, true, true],   // 6
  [true, true, true, false, false, false, false], // 7
  [true, true, true, true, true, true, true],    // 8
  [true, true, true, true, false, true, true],   // 9
];

// Draw a single digit on a canvas context
function drawDigit(ctx: CanvasRenderingContext2D, digit: number, x: number, y: number, width: number, height: number) {
  const pattern = DIGIT_PATTERNS[digit] ?? DIGIT_PATTERNS[0];
  if (!pattern) return;
  const segWidth = width * 0.2;
  const segLength = height * 0.4;
  const gap = segWidth * 0.2;

  // Segment positions (relative to digit top-left)
  // a: top, b: top-right, c: bottom-right, d: bottom, e: bottom-left, f: top-left, g: middle
  const segments = [
    { x: segWidth + gap, y: 0, w: segLength, h: segWidth, horiz: true },           // a
    { x: segWidth + segLength + gap, y: gap, w: segWidth, h: segLength, horiz: false }, // b
    { x: segWidth + segLength + gap, y: segLength + gap * 2, w: segWidth, h: segLength, horiz: false }, // c
    { x: segWidth + gap, y: segLength * 2 + gap * 2, w: segLength, h: segWidth, horiz: true }, // d
    { x: 0, y: segLength + gap * 2, w: segWidth, h: segLength, horiz: false },     // e
    { x: 0, y: gap, w: segWidth, h: segLength, horiz: false },                     // f
    { x: segWidth + gap, y: segLength + gap, w: segLength, h: segWidth, horiz: true }, // g
  ];

  segments.forEach((seg, i) => {
    ctx.fillStyle = pattern[i] ? SEGMENT_COLOR : SEGMENT_OFF_COLOR;
    ctx.beginPath();
    if (seg.horiz) {
      // Horizontal segment with pointed ends
      const halfHeight = seg.h / 2;
      ctx.moveTo(x + seg.x + halfHeight, y + seg.y);
      ctx.lineTo(x + seg.x + seg.w - halfHeight, y + seg.y);
      ctx.lineTo(x + seg.x + seg.w, y + seg.y + halfHeight);
      ctx.lineTo(x + seg.x + seg.w - halfHeight, y + seg.y + seg.h);
      ctx.lineTo(x + seg.x + halfHeight, y + seg.y + seg.h);
      ctx.lineTo(x + seg.x, y + seg.y + halfHeight);
    } else {
      // Vertical segment with pointed ends
      const halfWidth = seg.w / 2;
      ctx.moveTo(x + seg.x, y + seg.y + halfWidth);
      ctx.lineTo(x + seg.x + halfWidth, y + seg.y);
      ctx.lineTo(x + seg.x + seg.w, y + seg.y + halfWidth);
      ctx.lineTo(x + seg.x + seg.w, y + seg.y + seg.h - halfWidth);
      ctx.lineTo(x + seg.x + halfWidth, y + seg.y + seg.h);
      ctx.lineTo(x + seg.x, y + seg.y + seg.h - halfWidth);
    }
    ctx.closePath();
    ctx.fill();
  });
}

// Draw a number on a 7-segment display canvas
function drawSevenSegmentNumber(ctx: CanvasRenderingContext2D, value: number, maxDigits: number) {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const strValue = Math.floor(value).toString().padStart(maxDigits, " ");
  const digitWidth = (canvas.width - 20) / maxDigits;
  const digitHeight = canvas.height - 10;

  for (let i = 0; i < maxDigits; i++) {
    const char = strValue[i] ?? " ";
    if (char === " ") continue;
    const digit = parseInt(char, 10);
    const x = 10 + i * digitWidth;
    const y = 5;
    drawDigit(ctx, digit, x, y, digitWidth - DIGIT_SPACING, digitHeight);
  }
}

// Level data interface (new compact grid format)
interface LevelData {
  name: string;
  grid: string[][];
}

// Type definitions
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

interface Attractor {
  x: number;
  y: number;
}

interface Target {
  x: number;
  y: number;
  collected: boolean;
}

interface Wall {
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  trail: TrailPoint[];
  hasAttracted: boolean;
}

// Game state
let score = 0;
let particles: Particle[] = [];
let timeRemaining = 30;
let isGameOver = false;
let gameStartTime = Date.now();
let lastTimerUpdate = Date.now();

// Player object
const player: Player = {
  x: canvas.width / 2 - PLAYER_SIZE / 2,
  y: canvas.height / 2 - PLAYER_SIZE / 2,
  vx: 0,
  vy: 0,
  size: PLAYER_SIZE,
  trail: [],
  hasAttracted: false,
};

// Attractors
let redAttractors: Attractor[] = [];
let blueAttractors: Attractor[] = [];

// Targets (green squares)
let targets: Target[] = [];

// Walls (impassable barriers)
let walls: Wall[] = [];

// Current level info
let currentLevelName: string | null = null;

// Convert grid coordinates to pixel coordinates
function gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
  const padding = (CELL_SIZE - TARGET_SIZE) / 2;
  return {
    x: gridX * CELL_SIZE + padding,
    y: gridY * CELL_SIZE + padding,
  };
}

// Parse grid and extract objects
function parseGrid(grid: string[][]) {
  let playerX = 2, playerY = 2;
  const reds: Attractor[] = [];
  const blues: Attractor[] = [];
  const targs: Target[] = [];
  const wallList: Wall[] = [];
  
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = row[x];
      switch (cell) {
        case "P":
          playerX = x;
          playerY = y;
          break;
        case "R":
          reds.push(gridToPixel(x, y));
          break;
        case "B":
          blues.push(gridToPixel(x, y));
          break;
        case "T":
          targs.push({ ...gridToPixel(x, y), collected: false });
          break;
        case "W":
          wallList.push({ x: x * CELL_SIZE, y: y * CELL_SIZE });
          break;
      }
    }
  }
  
  return { playerX, playerY, reds, blues, targs, wallList };
}

// Load level from data
function loadLevel(levelData: LevelData) {
  // Reset game state
  score = 0;
  if (scoreCtx) {
    drawSevenSegmentNumber(scoreCtx, 0, 5);
  }
  timeRemaining = 30;
  isGameOver = false;
  lastTimerUpdate = Date.now();
  if (timerCtx) {
    drawSevenSegmentNumber(timerCtx, 30, 5);
  }
  particles = [];
  player.vx = 0;
  player.vy = 0;
  player.trail = [];
  player.hasAttracted = false;

  // Parse the grid
  const { playerX, playerY, reds, blues, targs, wallList } = parseGrid(levelData.grid);

  // Set player position
  const playerOffset = (CELL_SIZE - PLAYER_SIZE) / 2;
  player.x = playerX * CELL_SIZE + playerOffset;
  player.y = playerY * CELL_SIZE + playerOffset;

  // Load attractors, targets, and walls
  redAttractors = reds;
  blueAttractors = blues;
  targets = targs;
  walls = wallList;

  currentLevelName = levelData.name;
}

// Spawn random targets (fallback for no level)
function spawnRandomTargets() {
  targets = [];
  // Spawn green squares along the right edge
  for (let i = 0; i < GRID_SIZE; i++) {
    if (Math.random() > 0.5) {
      targets.push({
        x: CELL_SIZE * 5 + (CELL_SIZE - TARGET_SIZE) / 2,
        y: CELL_SIZE * i + (CELL_SIZE - TARGET_SIZE) / 2,
        collected: false,
      });
    }
  }
  // Also spawn some elsewhere
  for (let i = 0; i < 3; i++) {
    const gridX = Math.floor(Math.random() * 4);
    const gridY = Math.floor(Math.random() * GRID_SIZE);
    targets.push({
      x: CELL_SIZE * gridX + (CELL_SIZE - TARGET_SIZE) / 2,
      y: CELL_SIZE * gridY + (CELL_SIZE - TARGET_SIZE) / 2,
      collected: false,
    });
  }
}

// Default level (original game setup)
function loadDefaultLevel() {
  redAttractors = [
    {
      x: CELL_SIZE * 5 + (CELL_SIZE - ATTRACTOR_SIZE) / 2,
      y: (CELL_SIZE - ATTRACTOR_SIZE) / 2,
    },
  ];

  blueAttractors = [
    {
      x: CELL_SIZE * 2 + (CELL_SIZE - ATTRACTOR_SIZE) / 2,
      y: CELL_SIZE * 3 + (CELL_SIZE - ATTRACTOR_SIZE) / 2,
    },
  ];

  player.x = canvas.width / 2 - PLAYER_SIZE / 2;
  player.y = canvas.height / 2 - PLAYER_SIZE / 2;
  player.vx = 0;
  player.vy = 0;
  player.trail = [];
  player.hasAttracted = false;

  // Reset timer and game state
  timeRemaining = 30;
  isGameOver = false;
  lastTimerUpdate = Date.now();
  if (timerCtx) {
    drawSevenSegmentNumber(timerCtx, 30, 5);
  }

  spawnRandomTargets();
}

// Load levels from localStorage
function getStoredLevels(): LevelData[] {
  // Try new format first
  const stored = localStorage.getItem("polarity_levels_v2");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  return [];
}

// Populate level selector
function populateLevelSelector() {
  if (!levelSelect) return;

  const levels = getStoredLevels();

  // Clear existing options
  levelSelect.innerHTML = '<option value="">-- Random Level --</option>';

  // Add stored levels
  levels.forEach((level, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = level.name;
    levelSelect.appendChild(option);
  });

  // Select current level if loaded from hash
  if (currentLevelName) {
    const index = levels.findIndex(l => l.name === currentLevelName);
    if (index !== -1) {
      levelSelect.value = String(index);
    }
  }
}

// Handle level selection
if (levelSelect) {
  levelSelect.addEventListener("change", () => {
    const selectedIndex = parseInt(levelSelect.value);
    if (!isNaN(selectedIndex)) {
      const levels = getStoredLevels();
      const level = levels[selectedIndex];
      if (level) {
        loadLevel(level);
      }
    } else {
      // Random level selected
      loadDefaultLevel();
      score = 0;
      if (scoreCtx) {
        drawSevenSegmentNumber(scoreCtx, 0, 5);
      }
    }
  });
}

// Check for level in URL hash (from editor "Test in Game")
function checkForEditorLevel() {
  const hash = window.location.hash.slice(1); // Remove #
  if (hash) {
    try {
      const decoded = decodeURIComponent(hash);
      const data = JSON.parse(decoded);
      if (data.level && data.level.grid) {
        loadLevel(data.level);
        // Remove hash to prevent reloading on refresh
        history.replaceState(null, "", window.location.pathname);
        return true;
      }
    } catch (e) {
      console.error("Failed to parse level from URL:", e);
    }
  }
  return false;
}

// Input handling
const keys = { x: false, z: false };

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "x") {
    keys.x = true;
    btnX?.classList.add("active");
  }
  if (e.key.toLowerCase() === "z") {
    keys.z = true;
    btnZ?.classList.add("active");
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "x") {
    keys.x = false;
    btnX?.classList.remove("active");
  }
  if (e.key.toLowerCase() === "z") {
    keys.z = false;
    btnZ?.classList.remove("active");
  }
});

// Arcade button handling
const btnZ = document.getElementById("btnZ");
const btnX = document.getElementById("btnX");

function setupArcadeButton(
  button: HTMLElement | null,
  key: "z" | "x"
) {
  if (!button) return;

  const startHandler = (e: Event) => {
    e.preventDefault();
    keys[key] = true;
  };

  const endHandler = (e: Event) => {
    e.preventDefault();
    keys[key] = false;
  };

  // Mouse events
  button.addEventListener("mousedown", startHandler);
  button.addEventListener("mouseup", endHandler);
  button.addEventListener("mouseleave", endHandler);

  // Touch events
  button.addEventListener("touchstart", startHandler, { passive: false });
  button.addEventListener("touchend", endHandler, { passive: false });
  button.addEventListener("touchcancel", endHandler, { passive: false });
}

setupArcadeButton(btnZ, "z");
setupArcadeButton(btnX, "x");

// Restart game on key press when game over
document.addEventListener("keydown", (e) => {
  
  if (isGameOver && e.key.toLowerCase() === " ") {
    restartGame();
  }
});

// Physics
function applyAttraction() {
  let attractors: Attractor[] = [];

  if (keys.x) {
    attractors = attractors.concat(redAttractors);
  }
  if (keys.z) {
    attractors = attractors.concat(blueAttractors);
  }

  attractors.forEach((attractor) => {
    const dx = attractor.x + ATTRACTOR_SIZE / 2 - (player.x + player.size / 2);
    const dy = attractor.y + ATTRACTOR_SIZE / 2 - (player.y + player.size / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10) {
      const force = 800 / (dist * dist + 100);
      // Accumulate velocity towards magnets without any damping
      player.vx += (dx / dist) * force;
      player.vy += (dy / dist) * force;
    }
  });
}

function updatePlayer() {
  // Apply gravity only after first attraction and when not currently attracting
  const isAttracting = keys.x || keys.z;
  if (isAttracting) {
    player.hasAttracted = true;
  }
  if (player.hasAttracted && !isAttracting) {
    player.vy += GRAVITY;
  }

  // Update position
  player.x += player.vx;
  player.y += player.vy;

  // Boundary collision - stop at boundaries without bouncing
  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }
  if (player.x + player.size > canvas.width) {
    player.x = canvas.width - player.size;
    player.vx = 0;
  }
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
  }
  if (player.y + player.size > canvas.height) {
    player.y = canvas.height - player.size;
    player.vy = 0;
  }

  // Wall collision - stop player from passing through walls
  walls.forEach((wall) => {
    // Check if player intersects with wall
    if (
      player.x < wall.x + CELL_SIZE &&
      player.x + player.size > wall.x &&
      player.y < wall.y + CELL_SIZE &&
      player.y + player.size > wall.y
    ) {
      // Determine which side of the wall the player hit
      const overlapLeft = (player.x + player.size) - wall.x;
      const overlapRight = (wall.x + CELL_SIZE) - player.x;
      const overlapTop = (player.y + player.size) - wall.y;
      const overlapBottom = (wall.y + CELL_SIZE) - player.y;

      // Find the smallest overlap
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      // Push player out based on smallest overlap
      if (minOverlap === overlapLeft) {
        player.x = wall.x - player.size;
        player.vx = 0;
      } else if (minOverlap === overlapRight) {
        player.x = wall.x + CELL_SIZE;
        player.vx = 0;
      } else if (minOverlap === overlapTop) {
        player.y = wall.y - player.size;
        player.vy = 0;
      } else if (minOverlap === overlapBottom) {
        player.y = wall.y + CELL_SIZE;
        player.vy = 0;
      }
    }
  });

  // Trail effect
  player.trail.push({ x: player.x, y: player.y, alpha: 1 });
  if (player.trail.length > 20) player.trail.shift();
  player.trail.forEach((t) => (t.alpha *= 0.95));
}

function checkCollisions() {
  targets.forEach((target) => {
    if (!target.collected) {
      if (
        player.x < target.x + TARGET_SIZE &&
        player.x + player.size > target.x &&
        player.y < target.y + TARGET_SIZE &&
        player.y + player.size > target.y
      ) {
        target.collected = true;
        score += 10;
        if (scoreCtx) {
            drawSevenSegmentNumber(scoreCtx, score, 5);
        }

        // Create particles
        for (let i = 0; i < 10; i++) {
          particles.push({
            x: target.x + TARGET_SIZE / 2,
            y: target.y + TARGET_SIZE / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1,
            color: COLOR_TARGET_PARTICLE,
          });
        }
      }
    }
  });

  // Check if all targets collected
  if (targets.every((t) => t.collected)) {
    // Respawn random targets if in default/random mode
    if (!currentLevelName) {
      spawnRandomTargets();
    }
  }
}

function updateParticles() {
  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    return p.life > 0;
  });
}

// Drawing functions
function drawGrid() {
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 2;

  for (let i = 0; i <= GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(canvas.width, i * CELL_SIZE);
    ctx.stroke();
  }
}

function drawAttractors() {
  // Red attractors
  ctx.fillStyle = COLOR_RED_ATTRACTOR_OUTER;
  redAttractors.forEach((a) => {
    ctx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
    // Inner detail
    ctx.fillStyle = COLOR_RED_ATTRACTOR_INNER;
    ctx.fillRect(a.x + 5, a.y + 5, ATTRACTOR_SIZE - 10, ATTRACTOR_SIZE - 10);
    ctx.fillStyle = COLOR_RED_ATTRACTOR_OUTER;
  });

  // Blue attractors
  ctx.fillStyle = COLOR_BLUE_ATTRACTOR_OUTER;
  blueAttractors.forEach((a) => {
    ctx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
    // Inner detail
    ctx.fillStyle = COLOR_BLUE_ATTRACTOR_INNER;
    ctx.fillRect(a.x + 5, a.y + 5, ATTRACTOR_SIZE - 10, ATTRACTOR_SIZE - 10);
    ctx.fillStyle = COLOR_BLUE_ATTRACTOR_OUTER;
  });
}

function drawTargets() {
  targets.forEach((t) => {
    if (!t.collected) {
      ctx.fillStyle = COLOR_TARGET_OUTER;
      ctx.fillRect(t.x, t.y, TARGET_SIZE, TARGET_SIZE);
      // Inner detail
      ctx.fillStyle = COLOR_TARGET_INNER;
      ctx.fillRect(t.x + 5, t.y + 5, TARGET_SIZE - 10, TARGET_SIZE - 10);
    }
  });
}

function drawWalls() {
  walls.forEach((w) => {
    ctx.fillStyle = COLOR_WALL_OUTER;
    ctx.fillRect(w.x, w.y, CELL_SIZE, CELL_SIZE);
    // Inner detail
    ctx.fillStyle = COLOR_WALL_INNER;
    ctx.fillRect(w.x + 2, w.y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  });
}

function drawPlayer() {
  // Draw trail
  player.trail.forEach((t, i) => {
    ctx.fillStyle = `rgba(150, 150, 150, ${t.alpha * 0.3})`;
    ctx.fillRect(t.x, t.y, player.size, player.size);
  });

  // Draw player
  ctx.fillStyle = COLOR_PLAYER_OUTER;
  ctx.fillRect(player.x, player.y, player.size, player.size);

  // Player inner detail
  ctx.fillStyle = COLOR_PLAYER_INNER;
  ctx.fillRect(player.x + 5, player.y + 5, player.size - 10, player.size - 10);
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.globalAlpha = 1;
  });
}

function drawAttractionLines() {
  if (keys.x) {
    redAttractors.forEach((a) => {
      ctx.strokeStyle = COLOR_ATTRACTION_LINE_RED;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      ctx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      ctx.stroke();
    });
  }
  if (keys.z) {
    blueAttractors.forEach((a) => {
      ctx.strokeStyle = COLOR_ATTRACTION_LINE_BLUE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      ctx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      ctx.stroke();
    });
  }
}

// Update timer display and check for game over
function updateTimer() {
  if (isGameOver) return;

  const now = Date.now();
  if (now - lastTimerUpdate >= 1000) {
    timeRemaining--;
    lastTimerUpdate = now;

    if (timerCtx) {
      drawSevenSegmentNumber(timerCtx, timeRemaining, 5);
    }

    if (timeRemaining <= 0) {
      isGameOver = true;
    }
  }
}

// Show/hide game over overlay
function drawGameOver() {
  if (gameOverOverlay) {
    gameOverOverlay.classList.add("visible");
  }
  if (gameOverScore) {
    gameOverScore.textContent = `Points earned: ${score}`;
  }
}

// Hide game over overlay
function hideGameOver() {
  if (gameOverOverlay) {
    gameOverOverlay.classList.remove("visible");
  }
}

// Restart the game
function restartGame() {
  isGameOver = false;
  timeRemaining = 30;
  lastTimerUpdate = Date.now();

  if (timerCtx) {
    drawSevenSegmentNumber(timerCtx, 30, 5);
  }

  if (currentLevelName) {
    const levels = getStoredLevels();
    const level = levels.find(l => l.name === currentLevelName);
    if (level) {
      loadLevel(level);
    } else {
      loadDefaultLevel();
    }
  } else {
    loadDefaultLevel();
  }

  score = 0;
  if (scoreCtx) {
    drawSevenSegmentNumber(scoreCtx, 0, 5);
  }
}

// Main game loop
function gameLoop() {
  // Clear canvas
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  drawGrid();

  if (isGameOver) {
    // Draw game state (frozen)
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets();
    drawParticles();
    drawPlayer();
    // Show game over overlay
    drawGameOver();
  } else {
    // Hide game over overlay when not in game over state
    hideGameOver();
    // Update timer
    updateTimer();

    // Update physics
    applyAttraction();
    updatePlayer();
    checkCollisions();
    updateParticles();

    // Draw everything
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets();
    drawParticles();
    drawPlayer();
  }

  requestAnimationFrame(gameLoop);
}

// Initialize
// Check for level from editor first
if (!checkForEditorLevel()) {
  loadDefaultLevel();
}

// Populate level selector
populateLevelSelector();

gameLoop();
