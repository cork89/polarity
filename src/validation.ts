import type { Level, GridCell } from "./types.js";

const GRID_SIZE = 6;

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

function isValidGridPos(gridX: number, gridY: number): boolean {
  return gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE;
}

function findPlayerPosition(level: Level): { x: number; y: number } | null {
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = level.baseGrid[y];
    if (!row) continue;
    for (let x = 0; x < GRID_SIZE; x++) {
      if (row[x] === "P") {
        return { x, y };
      }
    }
  }
  return null;
}

function isTargetReachable(
  level: Level,
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
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === targetX && current.y === targetY) {
      return true;
    }

    for (const dir of directions) {
      const newX = current.x + dir.dx;
      const newY = current.y + dir.dy;

      if (isValidGridPos(newX, newY)) {
        const visitedRow = visited[newY];
        const gridRow = level.baseGrid[newY];

        if (visitedRow && !visitedRow[newX] && gridRow) {
          const cell = gridRow[newX];
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

function findAllReachableEmptySquares(
  level: Level,
  playerPos: { x: number; y: number },
): { x: number; y: number }[] {
  const visited: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    visited.push(new Array(GRID_SIZE).fill(false));
  }

  const queue: { x: number; y: number }[] = [playerPos];
  visited[playerPos.y]![playerPos.x] = true;

  const reachableEmpties: { x: number; y: number }[] = [];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    const gridRow = level.baseGrid[current.y];
    if (gridRow) {
      const cell = gridRow[current.x];
      if (cell === " ") {
        reachableEmpties.push({ x: current.x, y: current.y });
      }
    }

    for (const dir of directions) {
      const newX = current.x + dir.dx;
      const newY = current.y + dir.dy;

      if (isValidGridPos(newX, newY)) {
        const visitedRow = visited[newY];
        const gridRow = level.baseGrid[newY];

        if (visitedRow && !visitedRow[newX] && gridRow) {
          const cell = gridRow[newX];
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

export function validateLevel(level: Level): ValidationResult {
  const playerPos = findPlayerPosition(level);

  if (!playerPos) {
    return { valid: false, error: "No player placed" };
  }

  let hasRed = false;
  let hasBlue = false;
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = level.baseGrid[y];
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

  if (
    level.gameMode === "timeAttack" ||
    level.gameMode === "sprint"
  ) {
    if (
      findAllReachableEmptySquares(level, playerPos).length !==
      level.baseGrid.flat().filter((cell) => cell === " ").length
    ) {
      return { valid: false, error: "Level can have unreachable target" };
    }
    return { valid: true, error: null };
  }

  for (let stageIdx = 0; stageIdx < level.stages.length; stageIdx++) {
    const stage = level.stages[stageIdx];
    if (!stage) continue;

    if (stage.targets.length === 0) {
      return { valid: false, error: `Stage ${stageIdx + 1} has no targets` };
    }

    for (const target of stage.targets) {
      if (!isTargetReachable(level, target.x, target.y, playerPos)) {
        return {
          valid: false,
          error: `Stage ${stageIdx + 1} has unreachable target`,
        };
      }
    }
  }

  return { valid: true, error: null };
}
