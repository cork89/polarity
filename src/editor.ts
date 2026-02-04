// Level Editor for Polarity Game

const editorCanvas = document.getElementById(
  "editorCanvas",
) as HTMLCanvasElement;
const editorCtx = editorCanvas.getContext("2d")!;

// Grid settings
const GRID_SIZE = 6;
const CELL_SIZE = editorCanvas.width / GRID_SIZE;

// Tool types
type Tool = "player" | "red" | "blue" | "target" | "wall" | "eraser";
let currentTool: Tool = "player";

// Letter mapping for grid cells
type GridCell = " " | "P" | "R" | "B" | "T" | "W";
const TOOL_TO_LETTER: Record<Tool, GridCell> = {
  player: "P",
  red: "R",
  blue: "B",
  target: "T",
  wall: "W",
  eraser: " ",
};
const LETTER_TO_TOOL: Record<GridCell, Tool | null> = {
  " ": null,
  P: "player",
  R: "red",
  B: "blue",
  T: "target",
  W: "wall",
};

// Stage data structure - only targets vary per stage
interface Stage {
  targets: { x: number; y: number }[];
}

// Level data structure with multi-stage support
interface Level {
  name: string;
  gameMode: "timeAttack" | "sprint" | "staged";
  baseGrid: GridCell[][]; // Contains P, R, B, W (no T)
  stages: Stage[]; // Array of stages, each with target positions
}

// Must define constants before they are used
const DEFAULT_STAGE_COUNT = 3;

// Current level being edited
let currentLevel: Level;
let currentStageIndex: number = 0;

// Create a new empty level with default stages
function createEmptyLevel(
  name: string = "Untitled",
  gameMode: "timeAttack" | "sprint" | "staged" = "staged",
): Level {
  // Create empty 6x6 base grid filled with spaces
  const baseGrid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(" ");
    }
    baseGrid.push(row);
  }

  // Place player in center
  if (baseGrid[2] && baseGrid[2][2]) {
    baseGrid[2][2] = "P";
  }

  // Create default stages (3 stages with no targets initially)
  const stages: Stage[] = [];
  for (let i = 0; i < DEFAULT_STAGE_COUNT; i++) {
    stages.push({ targets: [] });
  }

  return {
    name: name,
    gameMode: gameMode,
    baseGrid: baseGrid,
    stages: stages,
  };
}

// Initialize current level after createEmptyLevel is defined
currentLevel = createEmptyLevel();

// Convert grid coordinates to pixel coordinates
function editorGridToPixel(
  gridX: number,
  gridY: number,
): { x: number; y: number } {
  const padding = (CELL_SIZE - 22) / 2; // 22 is the target/attractor size
  return {
    x: gridX * CELL_SIZE + padding,
    y: gridY * CELL_SIZE + padding,
  };
}

// Convert pixel coordinates to grid coordinates
function pixelToGrid(x: number, y: number): { gridX: number; gridY: number } {
  return {
    gridX: Math.floor(x / CELL_SIZE),
    gridY: Math.floor(y / CELL_SIZE),
  };
}

// Check if grid position is valid
function isValidGridPos(gridX: number, gridY: number): boolean {
  return gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE;
}

// Find player position in base grid
function findPlayerPosition(): { x: number; y: number } | null {
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (row[x] === "P") {
        return { x, y };
      }
    }
  }
  return null;
}

// Find all target positions in current stage
function findTargetPositions(): { x: number; y: number }[] {
  const stage = currentLevel.stages[currentStageIndex];
  if (!stage) return [];
  return [...stage.targets];
}

// Check if a target is reachable from the player using BFS
// A target is reachable if there's a path that doesn't go through walls
function isTargetReachable(
  targetX: number,
  targetY: number,
  playerPos: { x: number; y: number },
): boolean {
  const visited: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    visited.push(new Array(GRID_SIZE).fill(false));
  }

  const queue: { x: number; y: number }[] = [playerPos];
  visited[playerPos.y]![playerPos.x] = true;

  const directions = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 }, // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 }, // right
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if we reached the target
    if (current.x === targetX && current.y === targetY) {
      return true;
    }

    // Explore neighbors
    for (const dir of directions) {
      const newX = current.x + dir.dx;
      const newY = current.y + dir.dy;

      if (isValidGridPos(newX, newY)) {
        const visitedRow = visited[newY];
        const gridRow = currentLevel.baseGrid[newY];

        if (visitedRow && !visitedRow[newX] && gridRow) {
          const cell = gridRow[newX];
          // Can move through empty spaces, attractors, and the player start
          // Cannot move through walls
          if (cell !== "W") {
            visitedRow[newX] = true;
            queue.push({ x: newX, y: newY });
          }
        }
      }
    }
  }

  return false;
}

// Find all reachable empty squares from player position
// Returns an array of coordinates for all reachable empty spaces
function findAllReachableEmptySquares(playerPos: {
  x: number;
  y: number;
}): { x: number; y: number }[] {
  const visited: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    visited.push(new Array(GRID_SIZE).fill(false));
  }

  const queue: { x: number; y: number }[] = [playerPos];
  visited[playerPos.y]![playerPos.x] = true;

  const reachableEmpties: { x: number; y: number }[] = [];

  const directions = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 }, // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 }, // right
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if current position is empty (valid spawn point)
    const gridRow = currentLevel.baseGrid[current.y];
    if (gridRow) {
      const cell = gridRow[current.x];
      // Empty space is reachable for spawning
      if (cell === " ") {
        reachableEmpties.push({ x: current.x, y: current.y });
      }
    }

    // Explore neighbors
    for (const dir of directions) {
      const newX = current.x + dir.dx;
      const newY = current.y + dir.dy;

      if (isValidGridPos(newX, newY)) {
        const visitedRow = visited[newY];
        const gridRow = currentLevel.baseGrid[newY];

        if (visitedRow && !visitedRow[newX] && gridRow) {
          const cell = gridRow[newX];
          // Can move through empty spaces, attractors, and the player start
          // Cannot move through walls
          if (cell !== "W") {
            visitedRow[newX] = true;
            queue.push({ x: newX, y: newY });
          }
        }
      }
    }
  }

  return reachableEmpties;
}

// Validate level: check if player exists and all stages have reachable targets
function validateLevel(): { valid: boolean; error: string | null } {
  const playerPos = findPlayerPosition();

  if (!playerPos) {
    return { valid: false, error: "No player placed" };
  }

  // Check for at least one red and one blue magnet
  let hasRed = false;
  let hasBlue = false;
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (row[x] === "R") hasRed = true;
      if (row[x] === "B") hasBlue = true;
    }
  }
  if (!hasRed) {
    return { valid: false, error: "At least one red magnet required" };
  }
  if (!hasBlue) {
    return { valid: false, error: "At least one blue magnet required" };
  }

  // Time Attack and Sprint need at least one reachable empty square
  // (for auto-spawned targets)
  if (
    currentLevel.gameMode === "timeAttack" ||
    currentLevel.gameMode === "sprint"
  ) {
    if (
      findAllReachableEmptySquares(playerPos).length !==
      currentLevel.baseGrid.flat().filter((cell) => cell === " ").length
    ) {
      return { valid: false, error: "Level can have unreachable target" };
    }
    return { valid: true, error: null };
  }

  // Staged mode requires targets in all stages
  for (let stageIdx = 0; stageIdx < currentLevel.stages.length; stageIdx++) {
    const stage = currentLevel.stages[stageIdx];
    if (!stage) continue;

    if (stage.targets.length === 0) {
      return { valid: false, error: `Stage ${stageIdx + 1} has no targets` };
    }

    for (const target of stage.targets) {
      if (!isTargetReachable(target.x, target.y, playerPos)) {
        return {
          valid: false,
          error: `Stage ${stageIdx + 1} has unreachable target`,
        };
      }
    }
  }

  return { valid: true, error: null };
}

// Update editor UI based on game mode
function updateEditorForGameMode() {
  const targetToolBtn = document.querySelector(
    '[data-tool="target"]',
  ) as HTMLElement;
  const stageSelector = document.querySelector(
    ".stage-selector",
  ) as HTMLElement;
  const targetCountEl = document.getElementById("targetCount")?.parentElement;
  const gameModeSelect = document.getElementById(
    "gameModeSelect",
  ) as HTMLSelectElement;

  // Update the game mode selector to match current level
  if (gameModeSelect) {
    gameModeSelect.value = currentLevel.gameMode;
  }

  if (
    currentLevel.gameMode === "timeAttack" ||
    currentLevel.gameMode === "sprint"
  ) {
    // Hide target-related UI
    if (targetToolBtn) targetToolBtn.style.display = "none";
    if (stageSelector) stageSelector.style.display = "none";
    if (targetCountEl) targetCountEl.style.display = "none";

    // Clear any existing targets from stages
    currentLevel.stages.forEach((stage) => (stage.targets = []));
  } else {
    // Show all UI for staged mode
    if (targetToolBtn) targetToolBtn.style.display = "flex";
    if (stageSelector) stageSelector.style.display = "flex";
    if (targetCountEl) targetCountEl.style.display = "flex";
  }

  draw();
  updateStats();
  updateValidationUI();
  updateGameModeDescription();
}

// Update UI based on validation state
function updateValidationUI() {
  const validation = validateLevel();
  const canvas = document.getElementById("editorCanvas") as HTMLCanvasElement;
  const validationMessage = document.getElementById(
    "validationMessage",
  ) as HTMLDivElement;
  const publishBtn = document.getElementById("publishBtn") as HTMLButtonElement;

  if (!validation.valid) {
    canvas.classList.add("invalid");
    validationMessage.classList.add("visible");
    validationMessage.textContent = validation.error || "Invalid level";
    publishBtn.disabled = true;
  } else {
    canvas.classList.remove("invalid");
    validationMessage.classList.remove("visible");
    publishBtn.disabled = false;
  }
}

// Get object at grid position (merged view of base + current stage)
function getObjectAt(gridX: number, gridY: number): GridCell {
  if (!isValidGridPos(gridX, gridY)) return " ";
  if (!currentLevel || !currentLevel.baseGrid || !currentLevel.stages)
    return " ";

  // Check base grid first (P, R, B, W)
  const baseRow = currentLevel.baseGrid[gridY];
  const baseCell = baseRow ? baseRow[gridX] : " ";
  if (baseCell && baseCell !== " ") {
    return baseCell;
  }

  // Check current stage for targets
  const stage = currentLevel.stages[currentStageIndex];
  if (stage) {
    const target = stage.targets.find((t) => t.x === gridX && t.y === gridY);
    if (target) return "T";
  }

  return " ";
}

// Place or remove object at grid position
function placeObject(gridX: number, gridY: number) {
  if (!isValidGridPos(gridX, gridY)) return;
  if (!currentLevel || !currentLevel.baseGrid || !currentLevel.stages) return;

  // Prevent placing targets in Time Attack or Sprint modes
  if (
    currentTool === "target" &&
    (currentLevel.gameMode === "timeAttack" ||
      currentLevel.gameMode === "sprint")
  ) {
    return;
  }

  const letter = TOOL_TO_LETTER[currentTool];

  if (letter === "T") {
    // Targets go into current stage
    const stage = currentLevel.stages[currentStageIndex];
    if (!stage) return;

    // Check if target already exists at this position
    const existingIndex = stage.targets.findIndex(
      (t) => t.x === gridX && t.y === gridY,
    );

    if (existingIndex >= 0) {
      // Remove target
      stage.targets.splice(existingIndex, 1);
    } else {
      // Add target
      stage.targets.push({ x: gridX, y: gridY });
    }
  } else if (letter === " ") {
    // Eraser - try to remove from both base and current stage
    const baseRow = currentLevel.baseGrid[gridY];
    if (baseRow) {
      baseRow[gridX] = " ";
    }

    // Also remove from current stage if it's a target
    const stage = currentLevel.stages[currentStageIndex];
    if (stage) {
      const existingIndex = stage.targets.findIndex(
        (t) => t.x === gridX && t.y === gridY,
      );
      if (existingIndex >= 0) {
        stage.targets.splice(existingIndex, 1);
      }
    }
  } else {
    // Player, magnets, walls go into base grid

    // If placing a player, remove any existing player first
    if (letter === "P") {
      for (let y = 0; y < GRID_SIZE; y++) {
        const row = currentLevel.baseGrid[y];
        if (!row) continue;
        for (let x = 0; x < GRID_SIZE; x++) {
          if (row[x] === "P") {
            row[x] = " ";
          }
        }
      }
    }

    const baseRow = currentLevel.baseGrid[gridY];
    if (baseRow) {
      baseRow[gridX] = letter;
    }
  }

  updateStats();
  updateValidationUI();
  saveLevelToStorage();
  draw();
}

// Drawing functions
function editorDrawGrid() {
  editorCtx.strokeStyle = "#6a5a4a";
  editorCtx.lineWidth = 2;

  for (let i = 0; i <= GRID_SIZE; i++) {
    editorCtx.beginPath();
    editorCtx.moveTo(i * CELL_SIZE, 0);
    editorCtx.lineTo(i * CELL_SIZE, editorCanvas.height);
    editorCtx.stroke();

    editorCtx.beginPath();
    editorCtx.moveTo(0, i * CELL_SIZE);
    editorCtx.lineTo(editorCanvas.width, i * CELL_SIZE);
    editorCtx.stroke();
  }
}

function drawCellHighlight(gridX: number, gridY: number) {
  editorCtx.fillStyle = "rgba(255, 255, 255, 0.1)";
  editorCtx.fillRect(
    gridX * CELL_SIZE,
    gridY * CELL_SIZE,
    CELL_SIZE,
    CELL_SIZE,
  );
}

function editorDrawPlayer(gridX: number, gridY: number) {
  const size = 25;
  const offset = (CELL_SIZE - size) / 2;

  editorCtx.fillStyle = "#666";
  editorCtx.fillRect(
    gridX * CELL_SIZE + offset,
    gridY * CELL_SIZE + offset,
    size,
    size,
  );

  editorCtx.fillStyle = "#888";
  editorCtx.fillRect(
    gridX * CELL_SIZE + offset + 5,
    gridY * CELL_SIZE + offset + 5,
    size - 10,
    size - 10,
  );
}

function drawRedAttractor(gridX: number, gridY: number) {
  const pos = editorGridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#c44444";
  editorCtx.fillRect(pos.x, pos.y, 22, 22);
  editorCtx.fillStyle = "#ff6666";
  editorCtx.fillRect(pos.x + 4, pos.y + 4, 14, 14);
}

function drawBlueAttractor(gridX: number, gridY: number) {
  const pos = editorGridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#4444c4";
  editorCtx.fillRect(pos.x, pos.y, 22, 22);
  editorCtx.fillStyle = "#6666ff";
  editorCtx.fillRect(pos.x + 4, pos.y + 4, 14, 14);
}

function drawTarget(gridX: number, gridY: number) {
  const pos = editorGridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#4CAF50";
  editorCtx.fillRect(pos.x, pos.y, 22, 22);
  editorCtx.fillStyle = "#66ff66";
  editorCtx.fillRect(pos.x + 4, pos.y + 4, 14, 14);
}

function drawWall(gridX: number, gridY: number) {
  editorCtx.fillStyle = "#aaaaaa";
  editorCtx.fillRect(
    gridX * CELL_SIZE,
    gridY * CELL_SIZE,
    CELL_SIZE,
    CELL_SIZE,
  );
  editorCtx.fillStyle = "#cccccc";
  editorCtx.fillRect(
    gridX * CELL_SIZE + 2,
    gridY * CELL_SIZE + 2,
    CELL_SIZE - 4,
    CELL_SIZE - 4,
  );
}

function drawGridContents() {
  // Safety check
  if (!currentLevel || !currentLevel.baseGrid || !currentLevel.stages) {
    return;
  }

  // Draw base grid contents (P, R, B, W)
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = row[x];
      switch (cell) {
        case "P":
          editorDrawPlayer(x, y);
          break;
        case "R":
          drawRedAttractor(x, y);
          break;
        case "B":
          drawBlueAttractor(x, y);
          break;
        case "W":
          drawWall(x, y);
          break;
      }
    }
  }

  // Draw current stage targets
  const stage = currentLevel.stages[currentStageIndex];
  if (stage) {
    for (const target of stage.targets) {
      drawTarget(target.x, target.y);
    }
  }
}

let hoveredCell: { gridX: number; gridY: number } | null = null;

function draw() {
  // Clear canvas
  editorCtx.fillStyle = "#5a4a3a";
  editorCtx.fillRect(0, 0, editorCanvas.width, editorCanvas.height);

  // Draw grid
  editorDrawGrid();

  // Draw hover highlight
  if (hoveredCell) {
    drawCellHighlight(hoveredCell.gridX, hoveredCell.gridY);
  }

  // Draw all objects
  drawGridContents();
}

// Mouse handling
editorCanvas.addEventListener("mousemove", (e) => {
  const rect = editorCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  hoveredCell = pixelToGrid(x, y);
  draw();
});

editorCanvas.addEventListener("mouseleave", () => {
  hoveredCell = null;
  draw();
});

editorCanvas.addEventListener("click", (e) => {
  const rect = editorCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const gridPos = pixelToGrid(x, y);
  placeObject(gridPos.gridX, gridPos.gridY);
});

// Touch handling for mobile
editorCanvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = editorCanvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    hoveredCell = pixelToGrid(x, y);
    draw();
  },
  { passive: false },
);

editorCanvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = editorCanvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    hoveredCell = pixelToGrid(x, y);
    draw();
  },
  { passive: false },
);

editorCanvas.addEventListener("touchend", (e) => {
  if (hoveredCell) {
    placeObject(hoveredCell.gridX, hoveredCell.gridY);
  }
  hoveredCell = null;
  draw();
});

// Tool selection
document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tool-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.getAttribute("data-tool") as Tool;
  });
});

// Stage selection
document.querySelectorAll(".stage-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".stage-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const stageIndex = parseInt(btn.getAttribute("data-stage") || "0", 10);
    currentStageIndex = stageIndex;
    updateStats();
    updateValidationUI();
    draw();
  });
});

// Game mode descriptions
const GAME_MODE_DESCRIPTIONS: Record<string, string> = {
  staged: "Complete 3 stages by collecting all targets in each stage",
  timeAttack: "Collect as many auto-spawned targets as you can in 30 seconds",
  sprint: "Race to collect 250 points worth of auto-spawned targets",
};

// Update game mode description
function updateGameModeDescription() {
  const descriptionEl = document.getElementById("gameModeDescription");
  if (descriptionEl) {
    descriptionEl.textContent =
      GAME_MODE_DESCRIPTIONS[currentLevel.gameMode] || "";
  }
}

// Game mode selection
document.getElementById("gameModeSelect")?.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  const newMode = select.value as "timeAttack" | "sprint" | "staged";
  currentLevel.gameMode = newMode;
  updateGameModeDescription();
  updateEditorForGameMode();
});

// Update stage selector UI
function updateStageSelector() {
  document.querySelectorAll(".stage-btn").forEach((btn) => {
    const stageIndex = parseInt(btn.getAttribute("data-stage") || "0", 10);
    if (stageIndex === currentStageIndex) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// Count objects in base grid and current stage
function countObjects(): {
  red: number;
  blue: number;
  targets: number;
  walls: number;
} {
  let red = 0,
    blue = 0,
    targets = 0,
    walls = 0;

  // Count from base grid (P, R, B, W)
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = row[x];
      if (cell === "R") red++;
      if (cell === "B") blue++;
      if (cell === "W") walls++;
    }
  }

  // Count targets from current stage
  const stage = currentLevel.stages[currentStageIndex];
  if (stage) {
    targets = stage.targets.length;
  }

  return { red, blue, targets, walls };
}

// Update statistics display
function updateStats() {
  const currentLevelName = document.getElementById("currentLevelName");
  const redCount = document.getElementById("redCount");
  const blueCount = document.getElementById("blueCount");
  const targetCount = document.getElementById("targetCount");
  const wallCount = document.getElementById("wallCount");

  if (currentLevelName) currentLevelName.textContent = currentLevel.name;
  const counts = countObjects();
  if (redCount) redCount.textContent = String(counts.red);
  if (blueCount) blueCount.textContent = String(counts.blue);
  if (targetCount) targetCount.textContent = String(counts.targets);
  if (wallCount) wallCount.textContent = String(counts.walls);
}

// New level button
document.getElementById("newLevelBtn")!.addEventListener("click", () => {
  const name = prompt("Enter level name:", "New Level");
  if (name) {
    currentLevel = createEmptyLevel(name.trim() || "New Level");
    sessionStorage.removeItem(STORAGE_KEY);
    updateTestGameButtonState();
    updateEditorForGameMode();
    draw();
    updateStats();
    updateValidationUI();
  }
});

// Test Game button
document.getElementById("testGameBtn")!.addEventListener("click", () => {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    const data = {
      level: JSON.parse(stored),
    };
    const json = JSON.stringify(data);
    const encoded = encodeURIComponent(json);
    window.location.href = `play.html#${encoded}`;
    // window.open(`play.html#${encoded}`);
  }
});

// Publish button
document.getElementById("publishBtn")!.addEventListener("click", () => {
  console.log("published");
});

// SessionStorage management
const STORAGE_KEY = "polarity_editor_level";

function saveLevelToStorage() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentLevel));
  updateTestGameButtonState();
}

function loadLevelFromStorage() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const savedLevel = JSON.parse(stored) as Level;
      currentLevel = savedLevel;
      currentStageIndex = 0;
      updateEditorForGameMode();
      updateStageSelector();
      draw();
      updateStats();
      updateValidationUI();
    } catch (e) {
      // If parsing fails, keep the default level
      console.error("Failed to load level from sessionStorage:", e);
    }
  }
}

function updateTestGameButtonState() {
  const testGameBtn = document.getElementById(
    "testGameBtn",
  ) as HTMLButtonElement;
  if (testGameBtn) {
    const hasSavedLevel = sessionStorage.getItem(STORAGE_KEY) !== null;
    testGameBtn.disabled = !hasSavedLevel;
  }
}

// Initialize
// Toolbar overflow detection
function updateToolbarOverflow() {
  const toolbarContainer = document.querySelector(
    ".toolbar-container",
  ) as HTMLElement;
  const toolbar = document.querySelector(".toolbar") as HTMLElement;
  if (toolbarContainer && toolbar) {
    const hasOverflow = toolbar.scrollWidth > toolbar.clientWidth;
    toolbarContainer.classList.toggle("has-overflow", hasOverflow);
  }
}

// Check overflow on load and resize
window.addEventListener("load", updateToolbarOverflow);
window.addEventListener("resize", updateToolbarOverflow);

// Initialize
draw();
updateStats();
loadLevelFromStorage();
updateTestGameButtonState();
updateValidationUI();
updateToolbarOverflow();
