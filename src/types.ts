// Shared types for Polarity Game

export type Tool = "player" | "red" | "blue" | "target" | "wall" | "eraser";

export type GridCell = " " | "P" | "R" | "B" | "T" | "W";

export type GameMode = "timeAttack" | "sprint" | "staged";

export interface Stage {
  targets: { x: number; y: number }[];
}

export interface Level {
  name: string;
  gameMode: GameMode;
  baseGrid: GridCell[][];
  stages: Stage[];
  target: number; // Points for timeAttack, seconds for sprint/staged
}
