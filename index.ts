const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
    throw new Error("failed")
}
const ctx = canvas.getContext("2d")!;
const scoreElement = document.getElementById("score");
const levelSelect = document.getElementById("levelSelect") as HTMLSelectElement | null;

// Game settings
const GRID_SIZE = 6;
const CELL_SIZE = canvas.width / GRID_SIZE;
const PLAYER_SIZE = 40;
const TARGET_SIZE = 35;
const ATTRACTOR_SIZE = 35;
const GRAVITY = 0.3;

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
      }
    }
  }
  
  return { playerX, playerY, reds, blues, targs };
}

// Load level from data
function loadLevel(levelData: LevelData) {
  // Reset game state
  score = 0;
  if (scoreElement) {
    scoreElement.textContent = "0";
  }
  particles = [];
  player.vx = 0;
  player.vy = 0;
  player.trail = [];
  player.hasAttracted = false;

  // Parse the grid
  const { playerX, playerY, reds, blues, targs } = parseGrid(levelData.grid);

  // Set player position
  const playerOffset = (CELL_SIZE - PLAYER_SIZE) / 2;
  player.x = playerX * CELL_SIZE + playerOffset;
  player.y = playerY * CELL_SIZE + playerOffset;

  // Load attractors and targets
  redAttractors = reds;
  blueAttractors = blues;
  targets = targs;

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
      if (scoreElement) {
        scoreElement.textContent = "0";
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
  if (e.key.toLowerCase() === "x") keys.x = true;
  if (e.key.toLowerCase() === "z") keys.z = true;
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "x") keys.x = false;
  if (e.key.toLowerCase() === "z") keys.z = false;
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
        if (scoreElement) {
            scoreElement.textContent = `${score}`;
        }

        // Create particles
        for (let i = 0; i < 10; i++) {
          particles.push({
            x: target.x + TARGET_SIZE / 2,
            y: target.y + TARGET_SIZE / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1,
            color: "#4CAF50",
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
  ctx.strokeStyle = "#6a5a4a";
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
  ctx.fillStyle = "#c44444";
  redAttractors.forEach((a) => {
    ctx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
    // Inner detail
    ctx.fillStyle = "#ff6666";
    ctx.fillRect(a.x + 5, a.y + 5, ATTRACTOR_SIZE - 10, ATTRACTOR_SIZE - 10);
    ctx.fillStyle = "#c44444";
  });

  // Blue attractors
  ctx.fillStyle = "#4444c4";
  blueAttractors.forEach((a) => {
    ctx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
    // Inner detail
    ctx.fillStyle = "#6666ff";
    ctx.fillRect(a.x + 5, a.y + 5, ATTRACTOR_SIZE - 10, ATTRACTOR_SIZE - 10);
    ctx.fillStyle = "#4444c4";
  });
}

function drawTargets() {
  targets.forEach((t) => {
    if (!t.collected) {
      ctx.fillStyle = "#4CAF50";
      ctx.fillRect(t.x, t.y, TARGET_SIZE, TARGET_SIZE);
      // Inner detail
      ctx.fillStyle = "#66ff66";
      ctx.fillRect(t.x + 5, t.y + 5, TARGET_SIZE - 10, TARGET_SIZE - 10);
    }
  });
}

function drawPlayer() {
  // Draw trail
  player.trail.forEach((t, i) => {
    ctx.fillStyle = `rgba(150, 150, 150, ${t.alpha * 0.3})`;
    ctx.fillRect(t.x, t.y, player.size, player.size);
  });

  // Draw player
  ctx.fillStyle = "#4444c4";
  ctx.fillRect(player.x, player.y, player.size, player.size);

  // Player inner detail
  ctx.fillStyle = "#6666ff";
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
      ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      ctx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      ctx.stroke();
    });
  }
  if (keys.z) {
    blueAttractors.forEach((a) => {
      ctx.strokeStyle = "rgba(100, 100, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.x + player.size / 2, player.y + player.size / 2);
      ctx.lineTo(a.x + ATTRACTOR_SIZE / 2, a.y + ATTRACTOR_SIZE / 2);
      ctx.stroke();
    });
  }
}

// Main game loop
function gameLoop() {
  // Clear canvas
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  drawGrid();

  // Update physics
  applyAttraction();
  updatePlayer();
  checkCollisions();
  updateParticles();

  // Draw everything
  drawAttractionLines();
  drawAttractors();
  drawTargets();
  drawParticles();
  drawPlayer();

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
