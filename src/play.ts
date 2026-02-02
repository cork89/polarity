const gameCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!gameCanvas) {
  throw new Error("failed");
}
const gameCtx = gameCanvas.getContext("2d")!;

// Load player image
const playerImage = new Image();
playerImage.src = "penguin.png";
let playerImageLoaded = false;
playerImage.onload = () => {
  playerImageLoaded = true;
};

// Load target image
const targetImage = new Image();
targetImage.src = "fish.png";
let targetImageLoaded = false;
targetImage.onload = () => {
  targetImageLoaded = true;
};

// Load attractor images
const blueAttractorImage = new Image();
blueAttractorImage.src = "iceBlockAlt.png";
let blueAttractorImageLoaded = false;
blueAttractorImage.onload = () => {
  blueAttractorImageLoaded = true;
};

const redAttractorImage = new Image();
redAttractorImage.src = "iceBlockAltRed.png";
let redAttractorImageLoaded = false;
redAttractorImage.onload = () => {
  redAttractorImageLoaded = true;
};
const scoreFont = document.getElementById(
  "scoreFont",
) as HTMLSpanElement | null;
const timerFont = document.getElementById(
  "timerFont",
) as HTMLSpanElement | null;
const levelSelect = document.getElementById(
  "levelSelect",
) as HTMLSelectElement | null;
const gameOverOverlay = document.getElementById(
  "gameOverOverlay",
) as HTMLDivElement | null;
const gameOverTitle = document.getElementById(
  "gameOverTitle",
) as HTMLDivElement | null;
const gameOverScore = document.getElementById(
  "gameOverScore",
) as HTMLDivElement | null;
const gameOverButton = document.getElementById(
  "gameOverButton",
) as HTMLButtonElement | null;

// Game settings
const PLAY_GRID_SIZE = 6;
const PLAY_CELL_SIZE = gameCanvas.width / PLAY_GRID_SIZE;
const PLAYER_SIZE = 25;
const TARGET_SIZE = 22;
const ATTRACTOR_SIZE = 22;
const GRAVITY = 0.0625;

// Physics speed multiplier - INCREASE this if game is too slow, DECREASE if too fast
// 1.0 = original speed, 2.0 = twice as fast, 0.5 = half speed
const PHYSICS_SPEED = 1.0;

// Game modes
type GameMode = "timeAttack" | "sprint" | "staged";
const SPRINT_TARGET_SCORE = 250;
const TIME_ATTACK_DURATION = 30;

// Colors - Underwater Tron Theme
const COLOR_BACKGROUND = "#0a1628";
const COLOR_GRID = "#00d4ff";
const COLOR_PLAYER_OUTER = "#666";
const COLOR_PLAYER_INNER = "#7d7d7dff";
const COLOR_PLAYER_TRAIL = "rgba(150, 150, 150, 0.3)";
const COLOR_RED_ATTRACTOR_OUTER = "#ff2a6d";
const COLOR_RED_ATTRACTOR_INNER = "#ff5c8d";
const COLOR_BLUE_ATTRACTOR_OUTER = "#05d9e8";
const COLOR_BLUE_ATTRACTOR_INNER = "#39eaff";
const COLOR_TARGET_OUTER = "#ffd700";
const COLOR_TARGET_INNER = "#ffec8b";
const COLOR_TARGET_PARTICLE = "#ffd700";
const COLOR_WALL_OUTER = "#2d4a5c";
const COLOR_WALL_INNER = "#3d6a7c";
const COLOR_ATTRACTION_LINE_RED = "rgba(255, 42, 109, 0.5)";
const COLOR_ATTRACTION_LINE_BLUE = "rgba(5, 217, 232, 0.5)";

// Update font-based displays
function updateFontDisplay(
  element: HTMLSpanElement | null,
  value: number,
  maxDigits: number,
) {
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
  gameMode?: "timeAttack" | "sprint" | "staged";
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
  rotationOffset: number;
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
  x: gameCanvas.width / 2 - PLAYER_SIZE / 2,
  y: gameCanvas.height / 2 - PLAYER_SIZE / 2,
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
let currentPlayStageIndex = 0;
let totalStages = 0;

// Sound effects
const blueSound = new Audio("synth1.ogg");
const redSound = new Audio("synth2.ogg");
const collectSound = new Audio("coingather.ogg");
blueSound.loop = true;
redSound.loop = true;
blueSound.volume = 0.2;
redSound.volume = 0.2;
collectSound.volume = 0.3;

// Sound fade out tracking
const FADE_DURATION = 150; // milliseconds to fade out
const MAX_VOLUME = 0.2;
let blueFadeStartTime: number | null = null;
let redFadeStartTime: number | null = null;

function fadeAudio(
  sound: HTMLAudioElement,
  fadeStartTime: number | null,
  currentTime: number,
): number | null {
  if (fadeStartTime === null) return null;

  const elapsed = currentTime - fadeStartTime;
  const progress = Math.min(elapsed / FADE_DURATION, 1);

  sound.volume = MAX_VOLUME * (1 - progress);

  if (progress >= 1) {
    sound.pause();
    sound.volume = MAX_VOLUME;
    return null;
  }

  return fadeStartTime;
}

// Convert grid coordinates to pixel coordinates
function gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
  const padding = (PLAY_CELL_SIZE - TARGET_SIZE) / 2;
  return {
    x: gridX * PLAY_CELL_SIZE + padding,
    y: gridY * PLAY_CELL_SIZE + padding,
  };
}

// Parse grid and extract objects
function parseGrid(grid: string[][]) {
  let playerX = 2,
    playerY = 2;
  const reds: Attractor[] = [];
  const blues: Attractor[] = [];
  const targs: Target[] = [];
  const wallList: Wall[] = [];

  for (let y = 0; y < PLAY_GRID_SIZE; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < PLAY_GRID_SIZE; x++) {
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
          targs.push({
            ...gridToPixel(x, y),
            collected: false,
            rotationOffset: Math.random() * Math.PI * 2,
          });
          break;
        case "W":
          wallList.push({ x: x * PLAY_CELL_SIZE, y: y * PLAY_CELL_SIZE });
          break;
      }
    }
  }

  return { playerX, playerY, reds, blues, targs, wallList };
}

// Normalize level data - convert both old and new formats to a usable grid
// For multi-stage levels, merges baseGrid with current stage targets
function normalizeLevelData(
  levelData: LevelData,
  stageIndex: number = 0,
): string[][] | null {
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
    const mergedGrid: string[][] = baseGrid.map((row) => [...row]);

    // Add targets from this stage
    for (const target of stage.targets) {
      const y = target.y;
      const x = target.x;
      if (
        y !== undefined &&
        x !== undefined &&
        y >= 0 &&
        y < PLAY_GRID_SIZE &&
        x >= 0 &&
        x < PLAY_GRID_SIZE
      ) {
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
function loadLevel(
  levelData: LevelData,
  stageIndex: number = 0,
  resetState: boolean = true,
) {
  // Store level data for stage progression
  currentLevelData = levelData;
  currentPlayStageIndex = stageIndex;
  totalStages = levelData.stages?.length || 1;

  // Set game mode from level (default to staged for backward compatibility)
  currentGameMode = levelData.gameMode || "staged";

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
    if (currentGameMode === "sprint" || currentGameMode === "staged") {
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
    const playerOffset = (PLAY_CELL_SIZE - PLAYER_SIZE) / 2;
    player.x = playerX * PLAY_CELL_SIZE + playerOffset;
    player.y = playerY * PLAY_CELL_SIZE + playerOffset;
  }

  // Load attractors, targets, and walls
  redAttractors = reds;
  blueAttractors = blues;
  walls = wallList;

  // For timeAttack and sprint, auto-generate targets instead of using level targets
  if (currentGameMode === "timeAttack" || currentGameMode === "sprint") {
    spawnRandomTargets();
  } else {
    targets = targs;
  }

  currentLevelName = levelData.name;
}

// Check if target position overlaps with a wall or magnet
function isValidTargetPosition(x: number, y: number): boolean {
  // Check walls
  for (const wall of walls) {
    if (
      x < wall.x + PLAY_CELL_SIZE &&
      x + TARGET_SIZE > wall.x &&
      y < wall.y + PLAY_CELL_SIZE &&
      y + TARGET_SIZE > wall.y
    ) {
      return false;
    }
  }

  // Check red attractors
  for (const attractor of redAttractors) {
    if (
      x < attractor.x + ATTRACTOR_SIZE &&
      x + TARGET_SIZE > attractor.x &&
      y < attractor.y + ATTRACTOR_SIZE &&
      y + TARGET_SIZE > attractor.y
    ) {
      return false;
    }
  }

  // Check blue attractors
  for (const attractor of blueAttractors) {
    if (
      x < attractor.x + ATTRACTOR_SIZE &&
      x + TARGET_SIZE > attractor.x &&
      y < attractor.y + ATTRACTOR_SIZE &&
      y + TARGET_SIZE > attractor.y
    ) {
      return false;
    }
  }

  return true;
}

// Spawn random targets (fallback for no level)
function spawnRandomTargets() {
  targets = [];
  // Spawn green squares along the right edge
  for (let i = 0; i < PLAY_GRID_SIZE; i++) {
    if (Math.random() > 0.5) {
      const targetX = PLAY_CELL_SIZE * 5 + (PLAY_CELL_SIZE - TARGET_SIZE) / 2;
      const targetY = PLAY_CELL_SIZE * i + (PLAY_CELL_SIZE - TARGET_SIZE) / 2;
      if (isValidTargetPosition(targetX, targetY)) {
        targets.push({
          x: targetX,
          y: targetY,
          collected: false,
          rotationOffset: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  // Also spawn some elsewhere
  for (let i = 0; i < 3; i++) {
    const gridX = Math.floor(Math.random() * 4);
    const gridY = Math.floor(Math.random() * PLAY_GRID_SIZE);
    const targetX = PLAY_CELL_SIZE * gridX + (PLAY_CELL_SIZE - TARGET_SIZE) / 2;
    const targetY = PLAY_CELL_SIZE * gridY + (PLAY_CELL_SIZE - TARGET_SIZE) / 2;
    if (isValidTargetPosition(targetX, targetY)) {
      targets.push({
        x: targetX,
        y: targetY,
        collected: false,
        rotationOffset: Math.random() * Math.PI * 2,
      });
    }
  }
}

// Default level (original game setup)
function loadDefaultLevel() {
  redAttractors = [
    {
      x: PLAY_CELL_SIZE * 5 + (PLAY_CELL_SIZE - ATTRACTOR_SIZE) / 2,
      y: (PLAY_CELL_SIZE - ATTRACTOR_SIZE) / 2,
    },
  ];

  blueAttractors = [
    {
      x: PLAY_CELL_SIZE * 2 + (PLAY_CELL_SIZE - ATTRACTOR_SIZE) / 2,
      y: PLAY_CELL_SIZE * 3 + (PLAY_CELL_SIZE - ATTRACTOR_SIZE) / 2,
    },
  ];

  player.x = gameCanvas.width / 2 - PLAYER_SIZE / 2;
  player.y = gameCanvas.height / 2 - PLAYER_SIZE / 2;
  player.vx = 0;
  player.vy = 0;
  player.trail = [];
  player.hasAttracted = false;

  // Reset timer and game state based on current mode
  if (currentGameMode === "sprint" || currentGameMode === "staged") {
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

// Get display name with game mode tag
function getLevelDisplayName(level: LevelData): string {
  const modeTag = level.gameMode ? `[${level.gameMode}]` : "[staged]";
  return `${level.name} ${modeTag}`;
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
    option.textContent = getLevelDisplayName(level);
    levelSelect.appendChild(option);
  });

  // Select current level if loaded from hash
  if (currentLevelName) {
    const index = levels.findIndex((l) => l.name === currentLevelName);
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

// Check for level in URL hash (from editor "Test in Game")
function checkForEditorLevel() {
  const hash = window.location.hash.slice(1); // Remove #
  if (hash) {
    try {
      const decoded = decodeURIComponent(hash);
      const data = JSON.parse(decoded);
      // Support both old format (level.grid) and new multi-stage format (level.baseGrid + level.stages)
      if (
        data.level &&
        (data.level.grid || (data.level.baseGrid && data.level.stages))
      ) {
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

function setupArcadeButton(button: HTMLElement | null, key: "z" | "x") {
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

// Sync button visual state with keys object (called every frame)
function syncButtonVisuals() {
  if (btnZ) {
    if (keys.z) {
      btnZ.classList.add("active");
    } else {
      btnZ.classList.remove("active");
    }
  }
  if (btnX) {
    if (keys.x) {
      btnX.classList.add("active");
    } else {
      btnX.classList.remove("active");
    }
  }
}

// Restart game on key press when game over
document.addEventListener("keydown", (e) => {
  if (isGameOver && e.key.toLowerCase() === " ") {
    restartGame();
  }
});

// Restart game on button click when game over
if (gameOverButton) {
  gameOverButton.addEventListener("click", () => {
    if (isGameOver) {
      restartGame();
    }
  });
}

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
      const force = (400 / (dist * dist + 200)) * PHYSICS_SPEED;
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
    player.vy += GRAVITY * PHYSICS_SPEED;
  }

  // Update position
  player.x += player.vx * PHYSICS_SPEED;
  player.y += player.vy * PHYSICS_SPEED;

  // Boundary collision - stop at boundaries without bouncing
  if (player.x < 0) {
    player.x = 0;
    player.vx = 0;
  }
  if (player.x + player.size > gameCanvas.width) {
    player.x = gameCanvas.width - player.size;
    player.vx = 0;
  }
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
  }
  if (player.y + player.size > gameCanvas.height) {
    player.y = gameCanvas.height - player.size;
    player.vy = 0;
  }

  // Wall collision - stop player from passing through walls
  walls.forEach((wall) => {
    // Check if player intersects with wall
    if (
      player.x < wall.x + PLAY_CELL_SIZE &&
      player.x + player.size > wall.x &&
      player.y < wall.y + PLAY_CELL_SIZE &&
      player.y + player.size > wall.y
    ) {
      // Determine which side of the wall the player hit
      const overlapLeft = player.x + player.size - wall.x;
      const overlapRight = wall.x + PLAY_CELL_SIZE - player.x;
      const overlapTop = player.y + player.size - wall.y;
      const overlapBottom = wall.y + PLAY_CELL_SIZE - player.y;

      // Find the smallest overlap
      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom,
      );

      // Push player out based on smallest overlap
      if (minOverlap === overlapLeft) {
        player.x = wall.x - player.size;
        player.vx = 0;
      } else if (minOverlap === overlapRight) {
        player.x = wall.x + PLAY_CELL_SIZE;
        player.vx = 0;
      } else if (minOverlap === overlapTop) {
        player.y = wall.y - player.size;
        player.vy = 0;
      } else if (minOverlap === overlapBottom) {
        player.y = wall.y + PLAY_CELL_SIZE;
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

        // Play collection sound
        collectSound.currentTime = 0;
        collectSound.play().catch(() => {});

        // Check for Sprint mode win condition
        if (currentGameMode === "sprint" && score >= SPRINT_TARGET_SCORE) {
          isGameOver = true;
        }

        // Check for Staged mode - all targets collected in all stages
        if (currentGameMode === "staged") {
          const allTargetsInCurrentStageCollected = targets.every(
            (t) => t.collected,
          );
          if (
            allTargetsInCurrentStageCollected &&
            currentPlayStageIndex >= totalStages - 1
          ) {
            isGameOver = true;
          }
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
    // Respawn random targets for timeAttack/sprint modes or default/random mode
    if (
      !currentLevelName ||
      currentGameMode === "timeAttack" ||
      currentGameMode === "sprint"
    ) {
      spawnRandomTargets();
    } else if (
      currentLevelData &&
      currentLevelData.stages &&
      currentPlayStageIndex < totalStages - 1
    ) {
      // Multi-stage level: advance to next stage (keep player position)
      currentPlayStageIndex++;
      loadLevel(currentLevelData, currentPlayStageIndex, false);
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
  // Add glow effect for tron aesthetic
  gameCtx.shadowColor = COLOR_GRID;
  gameCtx.shadowBlur = 8;
  gameCtx.strokeStyle = COLOR_GRID;
  gameCtx.lineWidth = 1.5;

  for (let i = 0; i <= PLAY_GRID_SIZE; i++) {
    gameCtx.beginPath();
    gameCtx.moveTo(i * PLAY_CELL_SIZE, 0);
    gameCtx.lineTo(i * PLAY_CELL_SIZE, gameCanvas.height);
    gameCtx.stroke();

    gameCtx.beginPath();
    gameCtx.moveTo(0, i * PLAY_CELL_SIZE);
    gameCtx.lineTo(gameCanvas.width, i * PLAY_CELL_SIZE);
    gameCtx.stroke();
  }

  // Reset shadow for other elements
  gameCtx.shadowBlur = 0;
}

function drawAttractors() {
  // Red attractors
  redAttractors.forEach((a) => {
    if (redAttractorImageLoaded) {
      // Add glow behind the image
      gameCtx.shadowColor = COLOR_RED_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.drawImage(
        redAttractorImage,
        a.x,
        a.y,
        ATTRACTOR_SIZE,
        ATTRACTOR_SIZE,
      );
      gameCtx.shadowBlur = 0;
    } else {
      // Fallback to rectangle drawing with glow
      gameCtx.shadowColor = COLOR_RED_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.fillStyle = COLOR_RED_ATTRACTOR_OUTER;
      gameCtx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
      // Inner detail
      gameCtx.shadowBlur = 0;
      gameCtx.fillStyle = COLOR_RED_ATTRACTOR_INNER;
      gameCtx.fillRect(
        a.x + 5,
        a.y + 5,
        ATTRACTOR_SIZE - 10,
        ATTRACTOR_SIZE - 10,
      );
    }
  });

  // Blue attractors
  blueAttractors.forEach((a) => {
    if (blueAttractorImageLoaded) {
      // Add glow behind the image
      gameCtx.shadowColor = COLOR_BLUE_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.drawImage(
        blueAttractorImage,
        a.x,
        a.y,
        ATTRACTOR_SIZE,
        ATTRACTOR_SIZE,
      );
      gameCtx.shadowBlur = 0;
    } else {
      // Fallback to rectangle drawing with glow
      gameCtx.shadowColor = COLOR_BLUE_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.fillStyle = COLOR_BLUE_ATTRACTOR_OUTER;
      gameCtx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
      // Inner detail
      gameCtx.shadowBlur = 0;
      gameCtx.fillStyle = COLOR_BLUE_ATTRACTOR_INNER;
      gameCtx.fillRect(
        a.x + 5,
        a.y + 5,
        ATTRACTOR_SIZE - 10,
        ATTRACTOR_SIZE - 10,
      );
    }
  });
}

function drawTargets(time: number) {
  targets.forEach((t) => {
    if (!t.collected) {
      // Calculate rotation - gentle wiggle like swimming
      const swimSpeed = 0.003;
      const maxRotation = Math.PI / 8; // 22.5 degrees
      const rotation =
        Math.sin(time * swimSpeed + t.rotationOffset) * maxRotation;

      // Save context and translate to center of target
      gameCtx.save();
      gameCtx.translate(t.x + TARGET_SIZE / 2, t.y + TARGET_SIZE / 2);
      gameCtx.rotate(rotation);

      if (targetImageLoaded) {
        // Add glow behind the image
        gameCtx.shadowColor = COLOR_TARGET_OUTER;
        gameCtx.shadowBlur = 10;
        gameCtx.drawImage(
          targetImage,
          -TARGET_SIZE / 2,
          -TARGET_SIZE / 2,
          TARGET_SIZE,
          TARGET_SIZE,
        );
        gameCtx.shadowBlur = 0;
      } else {
        // Fallback to rectangle drawing with glow
        gameCtx.shadowColor = COLOR_TARGET_OUTER;
        gameCtx.shadowBlur = 10;
        gameCtx.fillStyle = COLOR_TARGET_OUTER;
        gameCtx.fillRect(
          -TARGET_SIZE / 2,
          -TARGET_SIZE / 2,
          TARGET_SIZE,
          TARGET_SIZE,
        );
        // Inner detail
        gameCtx.shadowBlur = 0;
        gameCtx.fillStyle = COLOR_TARGET_INNER;
        gameCtx.fillRect(
          -TARGET_SIZE / 2 + 5,
          -TARGET_SIZE / 2 + 5,
          TARGET_SIZE - 10,
          TARGET_SIZE - 10,
        );
      }

      gameCtx.restore();
    }
  });
}

function drawWalls() {
  walls.forEach((w) => {
    gameCtx.fillStyle = COLOR_WALL_OUTER;
    gameCtx.fillRect(w.x, w.y, PLAY_CELL_SIZE, PLAY_CELL_SIZE);
    // Inner detail
    gameCtx.fillStyle = COLOR_WALL_INNER;
    gameCtx.fillRect(w.x + 2, w.y + 2, PLAY_CELL_SIZE - 4, PLAY_CELL_SIZE - 4);
  });
}

function drawPlayer() {
  // Draw trail - narrower to avoid showing through transparent sides of penguin image
  const trailWidth = player.size * 0.6;
  const trailOffsetX = (player.size - trailWidth) / 2;
  player.trail.forEach((t, i) => {
    gameCtx.fillStyle = `rgba(150, 150, 150, ${t.alpha * 0.3})`;
    gameCtx.fillRect(t.x + trailOffsetX, t.y, trailWidth, player.size);
  });

  // Draw player image (or fallback to rectangle if not loaded)
  if (playerImageLoaded) {
    // Calculate rotation based on horizontal velocity (tilt left/right)
    const maxTilt = Math.PI / 6; // 30 degrees max rotation
    const tilt = Math.max(-maxTilt, Math.min(maxTilt, player.vx * 0.05));

    // Save context, translate to center, rotate, draw, restore
    // Hitbox remains unchanged - only visual rotation
    gameCtx.save();
    gameCtx.translate(player.x + player.size / 2, player.y + player.size / 2);
    gameCtx.rotate(tilt);
    gameCtx.drawImage(
      playerImage,
      -player.size / 2,
      -player.size / 2,
      player.size,
      player.size,
    );
    gameCtx.restore();
  } else {
    // Fallback to rectangle drawing
    gameCtx.fillStyle = COLOR_PLAYER_OUTER;
    gameCtx.fillRect(player.x, player.y, player.size, player.size);
    gameCtx.fillStyle = COLOR_PLAYER_INNER;
    gameCtx.fillRect(
      player.x + 5,
      player.y + 5,
      player.size - 10,
      player.size - 10,
    );
  }
}

function drawParticles() {
  particles.forEach((p) => {
    gameCtx.fillStyle = p.color;
    gameCtx.globalAlpha = p.life;
    gameCtx.fillRect(p.x - 3, p.y - 3, 6, 6);
    gameCtx.globalAlpha = 1;
  });
}

function drawAttractionLines() {
  if (keys.x) {
    redAttractors.forEach((a) => {
      gameCtx.strokeStyle = COLOR_ATTRACTION_LINE_RED;
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      gameCtx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      gameCtx.stroke();
    });
  }
  if (keys.z) {
    blueAttractors.forEach((a) => {
      gameCtx.strokeStyle = COLOR_ATTRACTION_LINE_BLUE;
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      gameCtx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      gameCtx.stroke();
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
    } else if (currentGameMode === "sprint" || currentGameMode === "staged") {
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
    if (currentGameMode === "sprint" || currentGameMode === "staged") {
      gameOverTitle.textContent = "COMPLETE!";
    } else {
      gameOverTitle.textContent = "GAME OVER";
    }
  }
  if (gameOverScore) {
    if (currentGameMode === "sprint" || currentGameMode === "staged") {
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

  if (currentGameMode === "sprint" || currentGameMode === "staged") {
    sprintTimeElapsed = 0;
    updateTimerFont(0);
  } else {
    timeRemaining = TIME_ATTACK_DURATION;
    updateTimerFont(TIME_ATTACK_DURATION);
  }

  if (currentLevelName) {
    const levels = getStoredLevels();
    const level = levels.find((l) => l.name === currentLevelName);
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
  // Sync button visuals with key state (handles iOS touch desync issues)
  syncButtonVisuals();

  // Update sound effects based on connection state
  const now = Date.now();

  if (!isGameOver) {
    if (keys.z) {
      if (blueSound.paused) {
        blueSound.volume = MAX_VOLUME;
        blueSound.play().catch(() => {});
      }
      blueFadeStartTime = null;
    } else {
      if (!blueSound.paused && blueFadeStartTime === null) {
        blueFadeStartTime = now;
      }
    }

    if (keys.x) {
      if (redSound.paused) {
        redSound.volume = MAX_VOLUME;
        redSound.play().catch(() => {});
      }
      redFadeStartTime = null;
    } else {
      if (!redSound.paused && redFadeStartTime === null) {
        redFadeStartTime = now;
      }
    }
  } else {
    // Start fade out when game is over
    if (!blueSound.paused && blueFadeStartTime === null) {
      blueFadeStartTime = now;
    }
    if (!redSound.paused && redFadeStartTime === null) {
      redFadeStartTime = now;
    }
  }

  // Apply fade out
  blueFadeStartTime = fadeAudio(blueSound, blueFadeStartTime, now);
  redFadeStartTime = fadeAudio(redSound, redFadeStartTime, now);

  // Clear canvas with underwater background
  gameCtx.fillStyle = COLOR_BACKGROUND;
  gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Add underwater depth gradient overlay
  const gradient = gameCtx.createRadialGradient(
    gameCanvas.width / 2,
    gameCanvas.height / 2,
    0,
    gameCanvas.width / 2,
    gameCanvas.height / 2,
    gameCanvas.width * 0.8,
  );
  gradient.addColorStop(0, "rgba(5, 30, 60, 0)");
  gradient.addColorStop(1, "rgba(0, 10, 25, 0.4)");
  gameCtx.fillStyle = gradient;
  gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Draw grid
  drawGrid();

  if (isGameOver) {
    // Draw game state (frozen)
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets(Date.now());
    drawParticles();
    drawPlayer();
    // Show game over overlay
    drawGameOver();
  } else {
    // Hide game over overlay when not in game over state
    hideGameOver();
    // Update timer
    updateTimer();

    // Run physics once per frame (speed controlled by PHYSICS_SPEED constant)
    applyAttraction();
    updatePlayer();
    checkCollisions();
    updateParticles();

    // Draw everything
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets(Date.now());
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
