// Level Editor for Polarity Game

const canvas = document.getElementById("editorCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// Grid settings
const GRID_SIZE = 6;
const CELL_SIZE = canvas.width / GRID_SIZE;

// Tool types
type Tool = "player" | "red" | "blue" | "target" | "eraser";
let currentTool: Tool = "player";

// Letter mapping for grid cells
type GridCell = " " | "P" | "R" | "B" | "T";
const TOOL_TO_LETTER: Record<Tool, GridCell> = {
  player: "P",
  red: "R",
  blue: "B",
  target: "T",
  eraser: " ",
};
const LETTER_TO_TOOL: Record<GridCell, Tool | null> = {
  " ": null,
  "P": "player",
  "R": "red",
  "B": "blue",
  "T": "target",
};

// Level data structure (new compact format)
interface Level {
  name: string;
  grid: GridCell[][];
}

// Current level being edited
let currentLevel: Level = createEmptyLevel();
let levels: Level[] = [];

// Create a new empty level
function createEmptyLevel(name: string = "Untitled"): Level {
  // Create empty 6x6 grid filled with spaces
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(" ");
    }
    grid.push(row);
  }
  
  // Place player in center
  if (grid[2] && grid[2][2]) {
    grid[2][2] = "P";
  }
  
  return {
    name: name,
    grid: grid,
  };
}

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

// Get object at grid position
function getObjectAt(gridX: number, gridY: number): GridCell {
  if (!isValidGridPos(gridX, gridY)) return " ";
  const row = currentLevel.grid[gridY];
  return row ? row[gridX] ?? " " : " ";
}

// Place or remove object at grid position
function placeObject(gridX: number, gridY: number) {
  if (!isValidGridPos(gridX, gridY)) return;
  
  const letter = TOOL_TO_LETTER[currentTool];
  const row = currentLevel.grid[gridY];
  if (row) {
    row[gridX] = letter;
  }
  
  updateStats();
  draw();
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

function drawCellHighlight(gridX: number, gridY: number) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(gridX * CELL_SIZE, gridY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
}

function drawPlayer(gridX: number, gridY: number) {
  const size = 40;
  const offset = (CELL_SIZE - size) / 2;
  
  ctx.fillStyle = "#666";
  ctx.fillRect(
    gridX * CELL_SIZE + offset,
    gridY * CELL_SIZE + offset,
    size, size
  );
  
  ctx.fillStyle = "#888";
  ctx.fillRect(
    gridX * CELL_SIZE + offset + 5,
    gridY * CELL_SIZE + offset + 5,
    size - 10, size - 10
  );
}

function drawRedAttractor(gridX: number, gridY: number) {
  const pos = gridToPixel(gridX, gridY);
  ctx.fillStyle = "#c44444";
  ctx.fillRect(pos.x, pos.y, 35, 35);
  ctx.fillStyle = "#ff6666";
  ctx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
}

function drawBlueAttractor(gridX: number, gridY: number) {
  const pos = gridToPixel(gridX, gridY);
  ctx.fillStyle = "#4444c4";
  ctx.fillRect(pos.x, pos.y, 35, 35);
  ctx.fillStyle = "#6666ff";
  ctx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
}

function drawTarget(gridX: number, gridY: number) {
  const pos = gridToPixel(gridX, gridY);
  ctx.fillStyle = "#4CAF50";
  ctx.fillRect(pos.x, pos.y, 35, 35);
  ctx.fillStyle = "#66ff66";
  ctx.fillRect(pos.x + 5, pos.y + 5, 25, 25);
}

function drawGridContents() {
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.grid[y];
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
        case "T":
          drawTarget(x, y);
          break;
      }
    }
  }
}

let hoveredCell: { gridX: number; gridY: number } | null = null;

function draw() {
  // Clear canvas
  ctx.fillStyle = "#5a4a3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  hoveredCell = pixelToGrid(x, y);
  draw();
});

canvas.addEventListener("mouseleave", () => {
  hoveredCell = null;
  draw();
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const gridPos = pixelToGrid(x, y);
  placeObject(gridPos.gridX, gridPos.gridY);
});

// Tool selection
document.querySelectorAll(".tool-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.getAttribute("data-tool") as Tool;
  });
});

// Count objects in grid
function countObjects(): { red: number; blue: number; targets: number } {
  let red = 0, blue = 0, targets = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = row[x];
      if (cell === "R") red++;
      if (cell === "B") blue++;
      if (cell === "T") targets++;
    }
  }
  return { red, blue, targets };
}

// Update statistics display
function updateStats() {
  document.getElementById("currentLevelName")!.textContent = currentLevel.name;
  const counts = countObjects();
  document.getElementById("redCount")!.textContent = String(counts.red);
  document.getElementById("blueCount")!.textContent = String(counts.blue);
  document.getElementById("targetCount")!.textContent = String(counts.targets);
}

// Level list management
function renderLevelList() {
  const listEl = document.getElementById("levelList")!;
  listEl.innerHTML = "";

  levels.forEach((level, index) => {
    const item = document.createElement("div");
    item.className = "level-item" + (level.name === currentLevel.name ? " active" : "");
    
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
  renderLevelList();
  draw();
  updateStats();
}

// New level button
document.getElementById("newLevelBtn")!.addEventListener("click", () => {
  const name = prompt("Enter level name:", "New Level");
  if (name) {
    currentLevel = createEmptyLevel(name.trim() || "New Level");
    draw();
    updateStats();
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
  const existingIndex = levels.findIndex(l => l.name === currentLevel.name);
  if (existingIndex !== -1) {
    levels[existingIndex] = JSON.parse(JSON.stringify(currentLevel));
  } else {
    levels.push(JSON.parse(JSON.stringify(currentLevel)));
  }
  saveLevelsToStorage();
  renderLevelList();
  
  // Increment the name for the next level
  currentLevel.name = incrementLevelName(currentLevel.name);
  // Clear the grid for the new level (keep player)
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = currentLevel.grid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (row[x] !== "P") {
        row[x] = " ";
      }
    }
  }
  
  updateStats();
  draw();
  alert("Level saved! Ready to create the next level.");
});

// Export to JSON (new compact format)
document.getElementById("exportBtn")!.addEventListener("click", () => {
  const data = {
    levels: [currentLevel]
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentLevel.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Import from JSON (handles both old and new formats)
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
          
          // Check if it's the new compact format (has 'grid' property)
          if (levelData.grid && Array.isArray(levelData.grid)) {
            level = {
              name: levelData.name || "Imported Level",
              grid: levelData.grid as GridCell[][],
            };
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
          importedLevels.forEach(level => levels.push(level));
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

// Convert old level format to new grid format
function convertOldFormatToNew(oldLevel: any): Level {
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push(" ");
    }
    grid.push(row);
  }
  
  // Place player
  if (oldLevel.playerGridX !== undefined && oldLevel.playerGridY !== undefined) {
    const playerRow = grid[oldLevel.playerGridY];
    if (playerRow) {
      playerRow[oldLevel.playerGridX] = "P";
    }
  }
  
  // Place red attractors
  if (oldLevel.redAttractors && Array.isArray(oldLevel.redAttractors)) {
    oldLevel.redAttractors.forEach((a: any) => {
      if (isValidGridPos(a.gridX, a.gridY)) {
        const row = grid[a.gridY];
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
        const row = grid[a.gridY];
        if (row) {
          row[a.gridX] = "B";
        }
      }
    });
  }
  
  // Place targets
  if (oldLevel.targets && Array.isArray(oldLevel.targets)) {
    oldLevel.targets.forEach((t: any) => {
      if (isValidGridPos(t.gridX, t.gridY)) {
        const row = grid[t.gridY];
        if (row) {
          row[t.gridX] = "T";
        }
      }
    });
  }
  
  return {
    name: oldLevel.name || "Imported Level",
    grid: grid,
  };
}

// Test in game
document.getElementById("testBtn")!.addEventListener("click", () => {
  const data = {
    level: currentLevel
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
    const row0 = defaultLevel.grid[0];
    const row3 = defaultLevel.grid[3];
    const row2 = defaultLevel.grid[2];
    const row1 = defaultLevel.grid[1];
    if (row0) row0[5] = "R"; // Red at top right
    if (row3) row3[2] = "B"; // Blue at middle left
    if (row2) row2[5] = "T"; // Target
    if (row1) row1[1] = "T"; // Target
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
