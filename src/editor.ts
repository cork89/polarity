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
let levels: Level[] = [];
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
function gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
  const padding = (CELL_SIZE - 35) / 2; // 35 is the target/attractor size
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

// Validate level: check if player exists and all stages have reachable targets
function validateLevel(): { valid: boolean; error: string | null } {
  const playerPos = findPlayerPosition();

  if (!playerPos) {
    return { valid: false, error: "No player placed" };
  }

  // Time Attack and Sprint only need a player
  if (
    currentLevel.gameMode === "timeAttack" ||
    currentLevel.gameMode === "sprint"
  ) {
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
}

// Update UI based on validation state
function updateValidationUI() {
  const validation = validateLevel();
  const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
  const canvas = document.getElementById("editorCanvas") as HTMLCanvasElement;
  const validationMessage = document.getElementById(
    "validationMessage",
  ) as HTMLDivElement;

  if (!validation.valid) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = "0.5";
    saveBtn.style.cursor = "not-allowed";
    canvas.style.border = "4px solid #c44444";
    canvas.style.borderRadius = "4px";
    validationMessage.classList.add("visible");
    validationMessage.textContent = validation.error || "Invalid level";
  } else {
    saveBtn.disabled = false;
    saveBtn.style.opacity = "1";
    saveBtn.style.cursor = "pointer";
    canvas.style.border = "2px solid #555";
    canvas.style.borderRadius = "0";
    validationMessage.classList.remove("visible");
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
    const baseRow = currentLevel.baseGrid[gridY];
    if (baseRow) {
      baseRow[gridX] = letter;
    }
  }

  updateStats();
  updateValidationUI();
  draw();
}

// Drawing functions
function drawGrid() {
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

function drawPlayer(gridX: number, gridY: number) {
  const size = 40;
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
  const pos = gridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#c44444";
  editorCtx.fillRect(pos.x, pos.y, 35, 35);
  editorCtx.fillStyle = "#ff6666";
  editorCtx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
}

function drawBlueAttractor(gridX: number, gridY: number) {
  const pos = gridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#4444c4";
  editorCtx.fillRect(pos.x, pos.y, 35, 35);
  editorCtx.fillStyle = "#6666ff";
  editorCtx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
}

function drawTarget(gridX: number, gridY: number) {
  const pos = gridToPixel(gridX, gridY);
  editorCtx.fillStyle = "#4CAF50";
  editorCtx.fillRect(pos.x, pos.y, 35, 35);
  editorCtx.fillStyle = "#66ff66";
  editorCtx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
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
          drawPlayer(x, y);
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
  drawGrid();

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

// Game mode selection
document.getElementById("gameModeSelect")?.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  const newMode = select.value as "timeAttack" | "sprint" | "staged";
  currentLevel.gameMode = newMode;
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
  document.getElementById("currentLevelName")!.textContent = currentLevel.name;
  const counts = countObjects();
  document.getElementById("redCount")!.textContent = String(counts.red);
  document.getElementById("blueCount")!.textContent = String(counts.blue);
  document.getElementById("targetCount")!.textContent = String(counts.targets);
  document.getElementById("wallCount")!.textContent = String(counts.walls);
}

// Level list management
function renderLevelList() {
  const listEl = document.getElementById("levelList")!;
  listEl.innerHTML = "";

  levels.forEach((level, index) => {
    const item = document.createElement("div");
    item.className =
      "level-item" + (level.name === currentLevel.name ? " active" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "level-item-name";
    nameSpan.textContent = level.name;

    const actions = document.createElement("div");
    actions.className = "level-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.innerHTML = "✎";
    renameBtn.title = "Rename";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      const newName = prompt("Enter new level name:", level.name);
      if (newName && newName.trim()) {
        level.name = newName.trim();
        if (level.name === currentLevel.name) {
          currentLevel.name = level.name;
        }
        saveLevelsToStorage();
        renderLevelList();
        updateStats();
      }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.innerHTML = "🗑";
    deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${level.name}"?`)) {
        levels = levels.filter((_, i) => i !== index);
        if (level.name === currentLevel.name) {
          currentLevel = createEmptyLevel();
          if (levels.length > 0 && levels[0]) {
            loadLevel(levels[0]);
          }
        }
        saveLevelsToStorage();
        renderLevelList();
        draw();
        updateStats();
      }
    };

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(nameSpan);
    item.appendChild(actions);

    item.onclick = () => {
      loadLevel(level);
    };

    listEl.appendChild(item);
  });
}

function loadLevel(level: Level) {
  currentLevel = JSON.parse(JSON.stringify(level)); // Deep copy
  currentStageIndex = 0; // Reset to first stage
  renderLevelList();
  updateStageSelector();
  updateEditorForGameMode();
  draw();
  updateStats();
  updateValidationUI();
}

// New level button
document.getElementById("newLevelBtn")!.addEventListener("click", () => {
  const name = prompt("Enter level name:", "New Level");
  if (name) {
    currentLevel = createEmptyLevel(name.trim() || "New Level");
    updateEditorForGameMode();
    draw();
    updateStats();
    updateValidationUI();
  }
});

// Increment level name (e.g., "Level 1" -> "Level 2")
function incrementLevelName(name: string): string {
  const match = name.match(/^(.*?)(\d+)$/);
  if (match && match[1] !== undefined && match[2] !== undefined) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}${num + 1}`;
  }
  // If no number at the end, just append " 2"
  return `${name} 2`;
}

// Save button
document.getElementById("saveBtn")!.addEventListener("click", () => {
  const validation = validateLevel();
  if (!validation.valid) {
    alert("Cannot save: " + validation.error);
    return;
  }

  const existingIndex = levels.findIndex((l) => l.name === currentLevel.name);
  if (existingIndex !== -1) {
    levels[existingIndex] = JSON.parse(JSON.stringify(currentLevel));
  } else {
    levels.push(JSON.parse(JSON.stringify(currentLevel)));
  }
  saveLevelsToStorage();
  renderLevelList();

  // Increment the name for the next level
  currentLevel.name = incrementLevelName(currentLevel.name);
  // Clear the base grid for the new level (keep player)
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (row[x] !== "P") {
        row[x] = " ";
      }
    }
  }
  // Reset stages for the new level
  currentLevel.stages = [];
  for (let i = 0; i < DEFAULT_STAGE_COUNT; i++) {
    currentLevel.stages.push({ targets: [] });
  }
  currentStageIndex = 0;

  updateStats();
  updateValidationUI();
  draw();
  alert("Level saved! Ready to create the next level.");
});

// Export to JSON (new compact format)
document.getElementById("exportBtn")!.addEventListener("click", () => {
  const data = {
    levels: [currentLevel],
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentLevel.name
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Import from JSON (handles both old and new multi-stage formats)
document.getElementById("importBtn")!.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string);

      if (data.levels && Array.isArray(data.levels) && data.levels.length > 0) {
        // Import all levels
        const importedLevels: Level[] = [];

        data.levels.forEach((levelData: any) => {
          let level: Level;

          // Check if it's the new multi-stage format (has 'baseGrid' property)
          if (levelData.baseGrid && Array.isArray(levelData.baseGrid)) {
            level = {
              name: levelData.name || "Imported Level",
              gameMode: levelData.gameMode || "staged",
              baseGrid: levelData.baseGrid as GridCell[][],
              stages: levelData.stages || [{ targets: [] }],
            };
          } else if (levelData.grid && Array.isArray(levelData.grid)) {
            // Convert old single-grid format to multi-stage format
            level = convertSingleGridToMultiStage(levelData);
          } else if (levelData.playerGridX !== undefined) {
            // Convert old format to new format
            level = convertOldFormatToNew(levelData);
          } else {
            // Unknown format, skip
            console.warn("Unknown level format:", levelData);
            return;
          }

          importedLevels.push(level);
        });

        if (importedLevels.length > 0 && importedLevels[0]) {
          // Add all imported levels
          importedLevels.forEach((level) => levels.push(level));
          saveLevelsToStorage();
          loadLevel(importedLevels[0]);
          alert(`Imported ${importedLevels.length} level(s)!`);
        } else {
          alert("No valid levels found in file");
        }
      } else {
        alert("Invalid level file format");
      }
    } catch (err) {
      alert("Error reading file: " + err);
    }
    input.value = ""; // Reset input
  };
  reader.readAsText(file);
});

// Convert single-grid format to multi-stage format
function convertSingleGridToMultiStage(levelData: any): Level {
  const baseGrid: GridCell[][] = [];
  const targets: { x: number; y: number }[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    const sourceRow = levelData.grid[y];
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = sourceRow ? sourceRow[x] : " ";
      if (cell === "T") {
        // Collect targets separately
        targets.push({ x, y });
        row.push(" ");
      } else {
        row.push(cell);
      }
    }
    baseGrid.push(row);
  }

  // Create single stage with all targets
  const stages: Stage[] = [{ targets }];
  // Add empty stages to reach default count
  while (stages.length < DEFAULT_STAGE_COUNT) {
    stages.push({ targets: [] });
  }

  return {
    name: levelData.name || "Imported Level",
    gameMode: levelData.gameMode || "staged",
    baseGrid: baseGrid,
    stages: stages,
  };
}

// Convert old level format to new multi-stage format
function convertOldFormatToNew(oldLevel: any): Level {
  const baseGrid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(" ");
    }
    baseGrid.push(row);
  }

  // Place player
  if (
    oldLevel.playerGridX !== undefined &&
    oldLevel.playerGridY !== undefined
  ) {
    const playerRow = baseGrid[oldLevel.playerGridY];
    if (playerRow) {
      playerRow[oldLevel.playerGridX] = "P";
    }
  }

  // Place red attractors
  if (oldLevel.redAttractors && Array.isArray(oldLevel.redAttractors)) {
    oldLevel.redAttractors.forEach((a: any) => {
      if (isValidGridPos(a.gridX, a.gridY)) {
        const row = baseGrid[a.gridY];
        if (row) {
          row[a.gridX] = "R";
        }
      }
    });
  }

  // Place blue attractors
  if (oldLevel.blueAttractors && Array.isArray(oldLevel.blueAttractors)) {
    oldLevel.blueAttractors.forEach((a: any) => {
      if (isValidGridPos(a.gridX, a.gridY)) {
        const row = baseGrid[a.gridY];
        if (row) {
          row[a.gridX] = "B";
        }
      }
    });
  }

  // Place walls
  if (oldLevel.walls && Array.isArray(oldLevel.walls)) {
    oldLevel.walls.forEach((w: any) => {
      if (isValidGridPos(w.gridX, w.gridY)) {
        const row = baseGrid[w.gridY];
        if (row) {
          row[w.gridX] = "W";
        }
      }
    });
  }

  // Create stages from targets
  const stages: Stage[] = [];
  if (oldLevel.targets && Array.isArray(oldLevel.targets)) {
    const targets = oldLevel.targets.map((t: any) => ({
      x: t.gridX,
      y: t.gridY,
    }));
    stages.push({ targets });
  } else {
    stages.push({ targets: [] });
  }

  // Add empty stages to reach default count
  while (stages.length < DEFAULT_STAGE_COUNT) {
    stages.push({ targets: [] });
  }

  return {
    name: oldLevel.name || "Imported Level",
    gameMode: oldLevel.gameMode || "staged",
    baseGrid: baseGrid,
    stages: stages,
  };
}

// Test in game
document.getElementById("testBtn")!.addEventListener("click", () => {
  const data = {
    level: currentLevel,
  };
  const json = JSON.stringify(data);
  const encoded = encodeURIComponent(json);
  window.open(`index.html#${encoded}`, "_blank");
});

// LocalStorage management
const STORAGE_KEY = "polarity_levels_v2";

function saveLevelsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}

function loadLevelsFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      levels = JSON.parse(stored);
    } catch (e) {
      levels = [];
    }
  }

  if (levels.length === 0) {
    // Create a default level
    const defaultLevel = createEmptyLevel("Level 1");
    const row0 = defaultLevel.baseGrid[0];
    const row3 = defaultLevel.baseGrid[3];
    if (row0) row0[5] = "R"; // Red at top right
    if (row3) row3[2] = "B"; // Blue at middle left
    // Add targets to stage 1
    if (defaultLevel.stages[0]) {
      defaultLevel.stages[0].targets.push({ x: 5, y: 2 }); // Target
      defaultLevel.stages[0].targets.push({ x: 1, y: 1 }); // Target
    }
    levels.push(defaultLevel);
    saveLevelsToStorage();
  }

  if (levels.length > 0 && levels[0]) {
    loadLevel(levels[0]);
  }
}

// Initialize
draw();
updateStats();
loadLevelsFromStorage();
updateValidationUI();
