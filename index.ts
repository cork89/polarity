const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
    throw new Error("failed")
}
const ctx = canvas.getContext("2d")!;
const scoreFont = document.getElementById("scoreFont") as HTMLSpanElement | null;
const timerFont = document.getElementById("timerFont") as HTMLSpanElement | null;
const levelSelect = document.getElementById("levelSelect") as HTMLSelectElement | null;
const gameModeSelect = document.getElementById("gameModeSelect") as HTMLSelectElement | null;
const gameOverOverlay = document.getElementById("gameOverOverlay") as HTMLDivElement | null;
const gameOverTitle = document.getElementById("gameOverTitle") as HTMLDivElement | null;
const gameOverScore = document.getElementById("gameOverScore") as HTMLDivElement | null;

// Game settings
const GRID_SIZE = 6;
const CELL_SIZE = canvas.width / GRID_SIZE;
const PLAYER_SIZE = 40;
const TARGET_SIZE = 35;
const ATTRACTOR_SIZE = 35;
const GRAVITY = 0.1;

// Game modes
type GameMode = "timeAttack" | "sprint";
const SPRINT_TARGET_SCORE = 250;
const TIME_ATTACK_DURATION = 30;

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

// Update font-based displays
function updateFontDisplay(element: HTMLSpanElement | null, value: number, maxDigits: number) {
  if (!element) return;
  element.textContent = Math.floor(value).toString().padStart(maxDigits, " ");
}

function updateScoreFont(value: number) {
  updateFontDisplay(scoreFont, value, 5);
}

function updateTimerFont(value: number) {
  updateFontDisplay(timerFont, value, 2);
}

// Stage data structure
interface StageData {
  targets: { x: number; y: number }[];
}

// Level data interface (supports both old single-grid and new multi-stage formats)
interface LevelData {
  name: string;
  grid?: string[][]; // Old format
  baseGrid?: string[][]; // New format - base layout (player, magnets, walls)
  stages?: StageData[]; // New format - array of stages with targets
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
let currentGameMode: GameMode = "timeAttack";
let sprintTimeElapsed = 0;

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
let currentLevelData: LevelData | null = null;
let currentStageIndex = 0;
let totalStages = 0;

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

// Normalize level data - convert both old and new formats to a usable grid
// For multi-stage levels, merges baseGrid with current stage targets
function normalizeLevelData(levelData: LevelData, stageIndex: number = 0): string[][] | null {
  // Old format: just return the grid
  if (levelData.grid) {
    return levelData.grid;
  }

  // New format: merge baseGrid with stage targets
  if (levelData.baseGrid && levelData.stages && levelData.stages.length > 0) {
    const baseGrid = levelData.baseGrid;
    const stage = levelData.stages[stageIndex];
    if (!stage) return null;

    // Create a copy of baseGrid
    const mergedGrid: string[][] = baseGrid.map(row => [...row]);

    // Add targets from this stage
    for (const target of stage.targets) {
      const y = target.y;
      const x = target.x;
      if (y !== undefined && x !== undefined && y >= 0 && y < GRID_SIZE && x >= 0 && x < GRID_SIZE) {
        const row = mergedGrid[y];
        if (row) {
          row[x] = "T";
        }
      }
    }

    return mergedGrid;
  }

  return null;
}

// Load level from data
function loadLevel(levelData: LevelData, stageIndex: number = 0, resetState: boolean = true) {
  // Store level data for stage progression
  currentLevelData = levelData;
  currentStageIndex = stageIndex;
  totalStages = levelData.stages?.length || 1;

  // Normalize level data to a grid
  const grid = normalizeLevelData(levelData, stageIndex);
  if (!grid) {
    console.error("Failed to load level: invalid level data");
    return;
  }

  // Reset game state on initial load, preserve on stage progression
  if (resetState) {
    score = 0;
    updateScoreFont(0);
    if (currentGameMode === "sprint") {
      sprintTimeElapsed = 0;
      updateTimerFont(0);
    } else {
      timeRemaining = TIME_ATTACK_DURATION;
      updateTimerFont(TIME_ATTACK_DURATION);
    }
    player.vx = 0;
    player.vy = 0;
    player.trail = [];
  }

  isGameOver = false;
  lastTimerUpdate = Date.now();
  particles = [];
  player.hasAttracted = false;

  // Parse the grid
  const { playerX, playerY, reds, blues, targs, wallList } = parseGrid(grid);

  // Only set player position on initial load, not stage progression
  if (resetState) {
    const playerOffset = (CELL_SIZE - PLAYER_SIZE) / 2;
    player.x = playerX * CELL_SIZE + playerOffset;
    player.y = playerY * CELL_SIZE + playerOffset;
  }

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

  // Reset timer and game state based on current mode
  if (currentGameMode === "sprint") {
    sprintTimeElapsed = 0;
    updateTimerFont(0);
  } else {
    timeRemaining = TIME_ATTACK_DURATION;
    updateTimerFont(TIME_ATTACK_DURATION);
  }
  isGameOver = false;
  lastTimerUpdate = Date.now();

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
      updateScoreFont(0);
    }
  });
}

// Handle game mode selection
if (gameModeSelect) {
  gameModeSelect.addEventListener("change", () => {
    const mode = gameModeSelect.value as GameMode;
    if (mode === "timeAttack" || mode === "sprint") {
      currentGameMode = mode;
      restartGame();
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
      // Support both old format (level.grid) and new multi-stage format (level.baseGrid + level.stages)
      if (data.level && (data.level.grid || (data.level.baseGrid && data.level.stages))) {
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
        updateScoreFont(score);

        // Check for Sprint mode win condition
        if (currentGameMode === "sprint" && score >= SPRINT_TARGET_SCORE) {
          isGameOver = true;
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
    } else if (currentLevelData && currentLevelData.stages && currentStageIndex < totalStages - 1) {
      // Multi-stage level: advance to next stage (keep player position)
      currentStageIndex++;
      loadLevel(currentLevelData, currentStageIndex, false);
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
    lastTimerUpdate = now;

    if (currentGameMode === "timeAttack") {
      timeRemaining--;
      updateTimerFont(timeRemaining);

      if (timeRemaining <= 0) {
        isGameOver = true;
      }
    } else if (currentGameMode === "sprint") {
      sprintTimeElapsed++;
      updateTimerFont(sprintTimeElapsed);
    }
  }
}

// Show/hide game over overlay
function drawGameOver() {
  if (gameOverOverlay) {
    gameOverOverlay.classList.add("visible");
  }
  if (gameOverTitle) {
    if (currentGameMode === "sprint") {
      gameOverTitle.textContent = "COMPLETE!";
    } else {
      gameOverTitle.textContent = "GAME OVER";
    }
  }
  if (gameOverScore) {
    if (currentGameMode === "sprint") {
      gameOverScore.textContent = `Time: ${sprintTimeElapsed} seconds`;
    } else {
      gameOverScore.textContent = `Points earned: ${score}`;
    }
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
  lastTimerUpdate = Date.now();

  if (currentGameMode === "sprint") {
    sprintTimeElapsed = 0;
    updateTimerFont(0);
  } else {
    timeRemaining = TIME_ATTACK_DURATION;
    updateTimerFont(TIME_ATTACK_DURATION);
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
  updateScoreFont(0);
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
