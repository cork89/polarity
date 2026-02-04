// Helper to get required DOM elements - fails fast if element is missing
function getRequiredElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Required element #${id} not found`);
  return el;
}

// Get critical DOM elements
const gameCanvas = getRequiredElement<HTMLCanvasElement>("gameCanvas");
const gameCtxRaw = gameCanvas.getContext("2d");
if (!gameCtxRaw) {
  throw new Error("Failed to get 2D canvas context");
}
const gameCtx = gameCtxRaw;

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

// Critical game over UI elements - fail fast if missing
const gameOverOverlay = getRequiredElement<HTMLDivElement>("gameOverOverlay");
const gameOverTitle = getRequiredElement<HTMLDivElement>("gameOverTitle");
const gameOverScore = getRequiredElement<HTMLDivElement>("gameOverScore");
const gameOverButton = getRequiredElement<HTMLButtonElement>("gameOverButton");

// Mute button
const muteButton = document.getElementById("muteButton");
const audioPlayingIcon = document.getElementById("audioPlayingIcon");
const audioMutedIcon = document.getElementById("audioMutedIcon");
let isMuted = false;

// Game settings
const PLAY_GRID_SIZE = 6;
const PLAY_CELL_SIZE = gameCanvas.width / PLAY_GRID_SIZE;
const PLAYER_SIZE = 25;
const TARGET_SIZE = 22;
const ATTRACTOR_SIZE = 22;
const GRAVITY = 0.0625;

// Physics speed multiplier - INCREASE this if game is too slow, DECREASE if too fast
// 1.0 = original speed, 2.0 = twice as fast, 0.5 = half speed
const PHYSICS_SPEED = 2.0;

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

// Gameplay constants
const TRAIL_FADE_RATE = 0.95;
const TRAIL_MAX_LENGTH = 20;
const TRAIL_WIDTH_RATIO = 0.6;
const MIN_ATTRACTION_DISTANCE = 10;
const ATTRACTION_FORCE_NUMERATOR = 400;
const ATTRACTION_FORCE_DAMPENING = 200;
const PARTICLE_LIFE_DECAY = 0.02;
const PARTICLE_COUNT_ON_COLLECT = 10;
const WALL_DETAIL_INSET = 5;
const ATTRACTOR_DETAIL_INSET = 5;
const TARGET_SWIM_SPEED = 0.003;
const MAX_TARGET_ROTATION = Math.PI / 8;
const PLAYER_TILT_FACTOR = 0.05;
const MAX_PLAYER_TILT = Math.PI / 6;

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
  // Previous position for interpolation (smooths high refresh rate displays)
  prevX: number;
  prevY: number;
}

class TrailPointPool {
  private pool: TrailPoint[] = [];
  private index = 0;

  acquire(x: number, y: number, alpha: number): TrailPoint {
    if (this.index < this.pool.length) {
      const point = this.pool[this.index]!;
      point.x = x;
      point.y = y;
      point.alpha = alpha;
      this.index++;
      return point;
    }
    const newPoint: TrailPoint = { x, y, alpha };
    this.pool.push(newPoint);
    this.index++;
    return newPoint;
  }

  reset(): void {
    this.index = 0;
  }

  getActiveCount(): number {
    return this.index;
  }

  getAll(): TrailPoint[] {
    return this.pool;
  }
}

class ParticlePool {
  private pool: Particle[] = [];
  private index = 0;

  acquire(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: string,
  ): Particle {
    if (this.index < this.pool.length) {
      const p = this.pool[this.index]!;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.color = color;
      this.index++;
      return p;
    }
    const newParticle: Particle = { x, y, vx, vy, life, color };
    this.pool.push(newParticle);
    this.index++;
    return newParticle;
  }

  reset(): void {
    this.index = 0;
  }

  getActiveCount(): number {
    return this.index;
  }

  getAll(): Particle[] {
    return this.pool;
  }
}

const trailPool = new TrailPointPool();
const particlePool = new ParticlePool();

// Game state
let score = 0;
let particles: Particle[] = [];
let timeRemaining = 30;
let isGameOver = false;
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
  prevX: gameCanvas.width / 2 - PLAYER_SIZE / 2,
  prevY: gameCanvas.height / 2 - PLAYER_SIZE / 2,
};

// Attractors
let redAttractors: Attractor[] = [];
let blueAttractors: Attractor[] = [];

// Targets (fish)
let targets: Target[] = [];

// Walls (impassable barriers)
let walls: Wall[] = [];

// Current level info
let currentLevelName: string | null = null;
let currentLevelData: LevelData | null = null;
let currentPlayStageIndex = 0;
let totalStages = 0;

// Sound effects
const blueSound = new Audio("electric1.ogg");
const redSound = new Audio("electric2.ogg");
const collectSound = new Audio("eat.ogg");
blueSound.loop = true;
redSound.loop = true;
blueSound.volume = 0.3;
redSound.volume = 0.3;
collectSound.volume = 0.3;

// Preload audio files to ensure they're ready
blueSound.preload = "auto";
redSound.preload = "auto";
collectSound.preload = "auto";

// Background ambiance - plays synth1.ogg and synth2.ogg serially
const bgSynth1 = new Audio("synth1.ogg");
const bgSynth2 = new Audio("synth2.ogg");
bgSynth1.volume = 0.2;
bgSynth2.volume = 0.2;
let currentBgTrack: 1 | 2 = 1;
let bgMusicStarted = false;

// Mute toggle functionality
const allSounds = [blueSound, redSound, collectSound, bgSynth1, bgSynth2];

function toggleMute(): void {
  isMuted = !isMuted;

  // Update all sound volumes
  for (const sound of allSounds) {
    sound.muted = isMuted;
  }

  // Update button appearance
  if (muteButton) {
    if (isMuted) {
      muteButton.classList.add("muted");
      if (audioPlayingIcon) audioPlayingIcon.style.display = "none";
      if (audioMutedIcon) audioMutedIcon.style.display = "block";
    } else {
      muteButton.classList.remove("muted");
      if (audioPlayingIcon) audioPlayingIcon.style.display = "block";
      if (audioMutedIcon) audioMutedIcon.style.display = "none";
    }
  }
}

if (muteButton) {
  muteButton.addEventListener("click", toggleMute);
}

function playNextBgTrack(): void {
  if (currentBgTrack === 1) {
    bgSynth1.currentTime = 0;
    bgSynth1.play().catch((err) => {
      console.log("BG music autoplay blocked, will try on user interaction");
    });
  } else {
    bgSynth2.currentTime = 0;
    bgSynth2.play().catch((err) => {
      console.log("BG music autoplay blocked, will try on user interaction");
    });
  }
}

function startBackgroundMusic(): void {
  if (!bgMusicStarted) {
    bgMusicStarted = true;
    playNextBgTrack();
  }
}

bgSynth1.addEventListener("ended", () => {
  currentBgTrack = 2;
  playNextBgTrack();
});

bgSynth2.addEventListener("ended", () => {
  currentBgTrack = 1;
  playNextBgTrack();
});

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
function playGridToPixel(
  gridX: number,
  gridY: number,
): { x: number; y: number } {
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
          reds.push(playGridToPixel(x, y));
          break;
        case "B":
          blues.push(playGridToPixel(x, y));
          break;
        case "T":
          targs.push({
            ...playGridToPixel(x, y),
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
  startBackgroundMusic();
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
    startBackgroundMusic();
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
// Track previous button states to avoid unnecessary DOM updates
let lastZActive = false;
let lastXActive = false;

function syncButtonVisuals() {
  // Only update DOM if state actually changed (reduces iOS jitter)
  if (btnZ && keys.z !== lastZActive) {
    lastZActive = keys.z;
    if (keys.z) {
      btnZ.classList.add("active");
    } else {
      btnZ.classList.remove("active");
    }
  }
  if (btnX && keys.x !== lastXActive) {
    lastXActive = keys.x;
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
gameOverButton.addEventListener("click", () => {
  if (isGameOver) {
    restartGame();
  }
});

// Physics
function getClosestAttractor(attractors: Attractor[]): Attractor | null {
  if (attractors.length === 0) return null;

  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;

  let closest: Attractor | null = null;
  let closestDist = Infinity;

  for (const attractor of attractors) {
    const dx = attractor.x + ATTRACTOR_SIZE / 2 - playerCenterX;
    const dy = attractor.y + ATTRACTOR_SIZE / 2 - playerCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist) {
      closestDist = dist;
      closest = attractor;
    }
  }

  return closest;
}

function applyAttraction() {
  const playerCenterX = player.x + player.size / 2;
  const playerCenterY = player.y + player.size / 2;

  // Only attract to closest red attractor
  if (keys.x) {
    const closestRed = getClosestAttractor(redAttractors);
    if (closestRed) {
      const dx = closestRed.x + ATTRACTOR_SIZE / 2 - playerCenterX;
      const dy = closestRed.y + ATTRACTOR_SIZE / 2 - playerCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > MIN_ATTRACTION_DISTANCE) {
        const force =
          (ATTRACTION_FORCE_NUMERATOR /
            (dist * dist + ATTRACTION_FORCE_DAMPENING)) *
          PHYSICS_SPEED;
        player.vx += (dx / dist) * force;
        player.vy += (dy / dist) * force;
      }
    }
  }

  // Only attract to closest blue attractor
  if (keys.z) {
    const closestBlue = getClosestAttractor(blueAttractors);
    if (closestBlue) {
      const dx = closestBlue.x + ATTRACTOR_SIZE / 2 - playerCenterX;
      const dy = closestBlue.y + ATTRACTOR_SIZE / 2 - playerCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > MIN_ATTRACTION_DISTANCE) {
        const force =
          (ATTRACTION_FORCE_NUMERATOR /
            (dist * dist + ATTRACTION_FORCE_DAMPENING)) *
          PHYSICS_SPEED;
        player.vx += (dx / dist) * force;
        player.vy += (dy / dist) * force;
      }
    }
  }
}

function updatePlayer() {
  // Store previous position for interpolation (smooths high refresh rate displays)
  player.prevX = player.x;
  player.prevY = player.y;

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
    // Cache wall properties to avoid repeated property access
    const wallX = wall.x;
    const wallY = wall.y;

    // Check if player intersects with wall
    if (
      player.x < wallX + PLAY_CELL_SIZE &&
      player.x + player.size > wallX &&
      player.y < wallY + PLAY_CELL_SIZE &&
      player.y + player.size > wallY
    ) {
      // Determine which side of the wall the player hit
      const overlapLeft = player.x + player.size - wallX;
      const overlapRight = wallX + PLAY_CELL_SIZE - player.x;
      const overlapTop = player.y + player.size - wallY;
      const overlapBottom = wallY + PLAY_CELL_SIZE - player.y;

      // Find the smallest overlap
      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom,
      );

      // Push player out based on smallest overlap
      if (minOverlap === overlapLeft) {
        player.x = wallX - player.size;
        player.vx = 0;
      } else if (minOverlap === overlapRight) {
        player.x = wallX + PLAY_CELL_SIZE;
        player.vx = 0;
      } else if (minOverlap === overlapTop) {
        player.y = wallY - player.size;
        player.vy = 0;
      } else if (minOverlap === overlapBottom) {
        player.y = wallY + PLAY_CELL_SIZE;
        player.vy = 0;
      }
    }
  });

  // Trail effect using pool
  player.trail.push(trailPool.acquire(player.x, player.y, 1));
  if (player.trail.length > TRAIL_MAX_LENGTH) player.trail.shift();
  player.trail.forEach((t) => (t.alpha *= TRAIL_FADE_RATE));
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
        collectSound
          .play()
          .catch((err) => console.error("Failed to play collect sound:", err));

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

        // Create particles using pool
        for (let i = 0; i < PARTICLE_COUNT_ON_COLLECT; i++) {
          particles.push(
            particlePool.acquire(
              target.x + TARGET_SIZE / 2,
              target.y + TARGET_SIZE / 2,
              (Math.random() - 0.5) * 5,
              (Math.random() - 0.5) * 5,
              1,
              COLOR_TARGET_PARTICLE,
            ),
          );
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
    } else if (currentGameMode === "staged") {
      // Staged mode: all targets collected in final stage (or single-stage level)
      isGameOver = true;
    }
  }
}

function updateParticles(): void {
  let writeIndex = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= PARTICLE_LIFE_DECAY;
    if (p.life > 0) {
      particles[writeIndex++] = p;
    }
  }
  particles.length = writeIndex;
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
        a.x + ATTRACTOR_DETAIL_INSET,
        a.y + ATTRACTOR_DETAIL_INSET,
        ATTRACTOR_SIZE - ATTRACTOR_DETAIL_INSET * 2,
        ATTRACTOR_SIZE - ATTRACTOR_DETAIL_INSET * 2,
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
        a.x + ATTRACTOR_DETAIL_INSET,
        a.y + ATTRACTOR_DETAIL_INSET,
        ATTRACTOR_SIZE - ATTRACTOR_DETAIL_INSET * 2,
        ATTRACTOR_SIZE - ATTRACTOR_DETAIL_INSET * 2,
      );
    }
  });
}

function drawTargets(time: number) {
  targets.forEach((t) => {
    if (!t.collected) {
      // Calculate rotation - gentle wiggle like swimming
      const rotation =
        Math.sin(time * TARGET_SWIM_SPEED + t.rotationOffset) *
        MAX_TARGET_ROTATION;

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
          -TARGET_SIZE / 2 + WALL_DETAIL_INSET,
          -TARGET_SIZE / 2 + WALL_DETAIL_INSET,
          TARGET_SIZE - WALL_DETAIL_INSET * 2,
          TARGET_SIZE - WALL_DETAIL_INSET * 2,
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
    gameCtx.fillRect(
      w.x + WALL_DETAIL_INSET,
      w.y + WALL_DETAIL_INSET,
      PLAY_CELL_SIZE - WALL_DETAIL_INSET * 2,
      PLAY_CELL_SIZE - WALL_DETAIL_INSET * 2,
    );
  });
}

function drawPlayer(interpolationFactor: number = 0) {
  // Calculate interpolated position for smooth rendering at high refresh rates
  // interpolationFactor is 0.0 to 1.0 representing how far between physics steps
  const renderX =
    player.prevX + (player.x - player.prevX) * interpolationFactor;
  const renderY =
    player.prevY + (player.y - player.prevY) * interpolationFactor;

  // Draw trail - narrower to avoid showing through transparent sides of penguin image
  const trailWidth = player.size * TRAIL_WIDTH_RATIO;
  const trailOffsetX = (player.size - trailWidth) / 2;
  player.trail.forEach((t) => {
    gameCtx.fillStyle = `rgba(150, 150, 150, ${t.alpha * 0.3})`;
    gameCtx.fillRect(t.x + trailOffsetX, t.y, trailWidth, player.size);
  });

  // Draw player image (or fallback to rectangle if not loaded)
  if (playerImageLoaded) {
    // Calculate rotation based on horizontal velocity (tilt left/right)
    const tilt = Math.max(
      -MAX_PLAYER_TILT,
      Math.min(MAX_PLAYER_TILT, player.vx * PLAYER_TILT_FACTOR),
    );

    // Save context, translate to center, rotate, draw, restore
    // Hitbox remains unchanged - only visual rotation
    gameCtx.save();
    gameCtx.translate(renderX + player.size / 2, renderY + player.size / 2);
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
    gameCtx.fillRect(renderX, renderY, player.size, player.size);
    gameCtx.fillStyle = COLOR_PLAYER_INNER;
    gameCtx.fillRect(
      renderX + ATTRACTOR_DETAIL_INSET,
      renderY + ATTRACTOR_DETAIL_INSET,
      player.size - ATTRACTOR_DETAIL_INSET * 2,
      player.size - ATTRACTOR_DETAIL_INSET * 2,
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
    const closestRed = getClosestAttractor(redAttractors);
    if (closestRed) {
      gameCtx.strokeStyle = COLOR_ATTRACTION_LINE_RED;
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      gameCtx.lineTo(
        closestRed.x + ATTRACTOR_SIZE / 2,
        closestRed.y + ATTRACTOR_SIZE / 2,
      );
      gameCtx.stroke();
    }
  }
  if (keys.z) {
    const closestBlue = getClosestAttractor(blueAttractors);
    if (closestBlue) {
      gameCtx.strokeStyle = COLOR_ATTRACTION_LINE_BLUE;
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      gameCtx.lineTo(
        closestBlue.x + ATTRACTOR_SIZE / 2,
        closestBlue.y + ATTRACTOR_SIZE / 2,
      );
      gameCtx.stroke();
    }
  }
}

// Update timer display and check for game over
function updateTimer() {
  if (isGameOver) return;

  const now = Date.now();
  if (now - lastTimerUpdate >= 1000) {
    lastTimerUpdate += 1000;

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
  gameOverOverlay.classList.add("visible");
  if (currentGameMode === "sprint" || currentGameMode === "staged") {
    gameOverTitle.textContent = "COMPLETE!";
  } else {
    gameOverTitle.textContent = "GAME OVER";
  }
  if (currentGameMode === "sprint" || currentGameMode === "staged") {
    gameOverScore.textContent = `Time: ${sprintTimeElapsed} seconds`;
  } else {
    gameOverScore.textContent = `Points earned: ${score}`;
  }
}

// Hide game over overlay
function hideGameOver() {
  gameOverOverlay.classList.remove("visible");
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

// Frame-rate independent physics tracking
let lastFrameTime = performance.now();
let physicsAccumulatedTime = 0;
const PHYSICS_DT = 1000 / 60; // Physics runs at 60Hz = 16.67ms per step
const MAX_PHYSICS_STEPS = 5; // Prevent spiral of death if tab was inactive

// Debug counter for logging
let debugFrameCounter = 0;

// Main game loop
function gameLoop() {
  // Calculate how many physics steps to run based on elapsed time
  const currentTime = performance.now();
  const elapsed = currentTime - lastFrameTime;
  lastFrameTime = currentTime;

  // Accumulate time and calculate physics steps
  // At 60fps: 1 step/frame, At 30fps: 2 steps every 2nd frame, At 165fps: 1 step every ~2.75 frames
  physicsAccumulatedTime += elapsed;
  let physicsSteps = 0;

  while (
    physicsAccumulatedTime >= PHYSICS_DT &&
    physicsSteps < MAX_PHYSICS_STEPS
  ) {
    physicsSteps++;
    physicsAccumulatedTime -= PHYSICS_DT;
  }

  // DEBUG: Log physics timing every 60 frames
  debugFrameCounter++;
  if (debugFrameCounter % 60 === 0) {
    console.log(
      `FPS: ${(1000 / elapsed).toFixed(
        0,
      )}, steps: ${physicsSteps}, accum: ${physicsAccumulatedTime.toFixed(
        2,
      )}ms`,
    );
  }

  // Sync button visuals with key state (handles iOS touch desync issues)
  syncButtonVisuals();

  // Update sound effects based on connection state
  const now = Date.now();

  if (!isGameOver) {
    if (keys.z) {
      if (blueSound.paused) {
        blueSound.volume = MAX_VOLUME;
        blueSound
          .play()
          .catch((err) => console.error("Failed to play blue sound:", err));
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
        redSound
          .play()
          .catch((err) => console.error("Failed to play red sound:", err));
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
    drawPlayer(0); // No interpolation needed when game is over
    // Show game over overlay
    drawGameOver();
  } else {
    // Hide game over overlay when not in game over state
    hideGameOver();
    // Update timer
    updateTimer();

    // Run physics multiple times to maintain consistent speed across frame rates
    // At 60fps: 1 step per frame, At 30fps: 2 steps per frame
    for (let i = 0; i < physicsSteps; i++) {
      applyAttraction();
      updatePlayer();
      checkCollisions();
    }
    // Particles don't affect gameplay, update once per render frame
    updateParticles();

    // Calculate interpolation factor for smooth rendering (0.0 to 1.0)
    // Shows how far we are between physics steps
    const interpolationFactor = physicsAccumulatedTime / PHYSICS_DT;

    // Draw everything
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets(Date.now());
    drawParticles();
    drawPlayer(interpolationFactor);
  }

  requestAnimationFrame(gameLoop);
}

// Initialize game
async function initializeGame(): Promise<void> {
  // Check for level from editor first
  if (!checkForEditorLevel()) {
    loadDefaultLevel();
  }

  // Populate level selector
  populateLevelSelector();

  // Start background ambiance
  playNextBgTrack();

  // Start the game loop
  gameLoop();
}

// Start initialization
initializeGame();
