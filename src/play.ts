// Helper to get required DOM elements - fails fast if element is missing
import type { GameMode, GridCell, Level, Stage } from "./types.js";

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
const controls = document.getElementById("controls") as HTMLDivElement | null;

// Critical game over UI elements - fail fast if missing
const gameOverOverlay = getRequiredElement<HTMLDivElement>("gameOverOverlay");
const gameOverTitle = getRequiredElement<HTMLDivElement>("gameOverTitle");
const gameOverScore = getRequiredElement<HTMLDivElement>("gameOverScore");
const gameOverButton = getRequiredElement<HTMLButtonElement>("gameOverButton");
const gameOverTarget = getRequiredElement<HTMLDivElement>("gameOverTarget");
const gameOverAttempts = getRequiredElement<HTMLDivElement>("gameOverAttempts");

// Mute button
const muteButton = document.getElementById("muteButton");
const audioPlayingIcon = document.getElementById("audioPlayingIcon");
const audioMutedIcon = document.getElementById("audioMutedIcon");
let isMuted = sessionStorage.getItem("polarity_mute_state") === "true";

// Game settings
const PLAY_GRID_SIZE = 6;
const PLAY_CELL_SIZE = gameCanvas.width / PLAY_GRID_SIZE;
const PLAYER_SIZE = 25;
const TARGET_SIZE = 22;
const ATTRACTOR_SIZE = 22;
const GRAVITY = 0.0625;

// Physics speed multiplier
const PHYSICS_SPEED = 2.0;

// Game mode constants
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
const ATTRACTION_FORCE_NUMERATOR = 500;
const ATTRACTION_FORCE_DAMPENING = 200;
const PARTICLE_LIFE_DECAY = 0.02;
const PARTICLE_COUNT_ON_COLLECT = 10;
const WALL_DETAIL_INSET = 5;
const ATTRACTOR_DETAIL_INSET = 5;
const TARGET_SWIM_SPEED = 0.003;
const MAX_TARGET_ROTATION = Math.PI / 8;
const PLAYER_TILT_FACTOR = 0.05;
const MAX_PLAYER_TILT = Math.PI / 6;

// Storage keys
const POLARITY_TARGET_ACHIEVED = "polarity_target_acheived";
const POLARITY_ATTEMPS = "polarity_attempts";

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
let gameOverProcessed = false;
let lastTimerUpdate = Date.now();
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
let currentLevelData: Level | null = null;
let currentPlayStageIndex = 0;
let totalStages = 0;

// ── Web Audio API sound system (fixes iOS latency) ──────────────
const audioCtx = new (window.AudioContext ||
  (window as any).webkitAudioContext)();
const audioBuffers: Map<string, AudioBuffer> = new Map();

// Master gain node for muting
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);

async function loadAudioBuffer(url: string): Promise<AudioBuffer> {
  // Try original format, fall back to mp3
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    const mp3Url = url.replace(/\.ogg$/, ".mp3");
    const response = await fetch(mp3Url);
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  }
}
async function preloadSounds(): Promise<void> {
  const soundFiles = ["electric1.ogg", "electric2.ogg", "eat.ogg"];

  await Promise.all(
    soundFiles.map(async (file) => {
      try {
        const buffer = await loadAudioBuffer(file);
        audioBuffers.set(file, buffer);
      } catch (err) {
        console.warn(`Failed to preload ${file}:`, err);
      }
    }),
  );
}

// Play a one-shot sound effect
function playSfx(
  fileName: string,
  volume: number = 0.3,
): AudioBufferSourceNode | null {
  const buffer = audioBuffers.get(fileName);
  if (!buffer) return null;

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;

  source.buffer = buffer;
  source.connect(gainNode);
  gainNode.connect(masterGain);
  source.start(0);

  return source;
}

// Looping sound management for magnet effects
interface LoopingSound {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  playing: boolean;
}

function createLoopingSound(): LoopingSound {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  return { source: null, gain, playing: false };
}

const blueLoop = createLoopingSound();
const redLoop = createLoopingSound();

const FADE_DURATION = 150;
const MAX_VOLUME = 0.2;

function startLoop(loop: LoopingSound, fileName: string, volume: number): void {
  if (loop.playing) return;

  const buffer = audioBuffers.get(fileName);
  if (!buffer) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(loop.gain);
  loop.gain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.01);
  source.start(0);

  loop.source = source;
  loop.playing = true;
}

function stopLoop(loop: LoopingSound): void {
  if (!loop.playing) return;

  // Quick fade out to avoid click
  loop.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);

  const source = loop.source;
  setTimeout(() => {
    try {
      source?.stop();
    } catch (_) {
      // Already stopped
    }
  }, FADE_DURATION);

  loop.source = null;
  loop.playing = false;
}

// iOS requires AudioContext resume on user gesture
function unlockAudioContext(): void {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

document.addEventListener("touchstart", unlockAudioContext, { once: false });
document.addEventListener("touchend", unlockAudioContext, { once: false });
document.addEventListener("mousedown", unlockAudioContext, { once: false });
document.addEventListener("keydown", unlockAudioContext, { once: false });

// Background ambiance - plays synth1.ogg and synth2.ogg serially
const bgSynth1 = new Audio("synth1.ogg");
const bgSynth2 = new Audio("synth2.ogg");
bgSynth1.volume = 0.2;
bgSynth2.volume = 0.2;
let currentBgTrack: 1 | 2 = 1;
let bgMusicStarted = false;

// Mute toggle functionality
function toggleMute(): void {
  isMuted = !isMuted;
  sessionStorage.setItem("polarity_mute_state", String(isMuted));

  // Mute/unmute via Web Audio master gain
  masterGain.gain.value = isMuted ? 0 : 1;

  // Also mute background music (still using HTML Audio)
  bgSynth1.muted = isMuted;
  bgSynth2.muted = isMuted;

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

// Initialize mute button appearance from sessionStorage
function initializeMuteState(): void {
  // Apply mute state to Web Audio master gain
  masterGain.gain.value = isMuted ? 0 : 1;

  // Apply mute state to background music
  bgSynth1.muted = isMuted;
  bgSynth2.muted = isMuted;

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

initializeMuteState();

function playNextBgTrack(): void {
  if (currentBgTrack === 1) {
    bgSynth1.currentTime = 0;
    bgSynth1.play().catch(() => {
      console.log("BG music autoplay blocked, will try on user interaction");
    });
  } else {
    bgSynth2.currentTime = 0;
    bgSynth2.play().catch(() => {
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

// Visibility change handler - pause audio when screen off / tab hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audioCtx.suspend();

    bgSynth1.pause();
    bgSynth2.pause();

    if (blueLoop.playing) {
      blueLoop.playing = false;
      try {
        blueLoop.source?.stop();
      } catch (_) {}
      blueLoop.source = null;
    }
    if (redLoop.playing) {
      redLoop.playing = false;
      try {
        redLoop.source?.stop();
      } catch (_) {}
      redLoop.source = null;
    }
    lastFrameTime = performance.now();
    physicsAccumulatedTime = 0;
    lastTimerUpdate = Date.now();
  } else {
    audioCtx.resume();

    if (bgMusicStarted) {
      playNextBgTrack();
    }

    lastFrameTime = performance.now();
    physicsAccumulatedTime = 0;
    lastTimerUpdate = Date.now();
  }
});

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

// Normalize level data - merges baseGrid with stage targets
function normalizeLevelData(
  levelData: Level,
  stageIndex: number = 0,
): string[][] | null {
  const baseGrid = levelData.baseGrid;

  // For timeAttack and sprint modes, just return baseGrid (no targets to merge)
  if (levelData.gameMode === "timeAttack" || levelData.gameMode === "sprint") {
    return baseGrid.map((row) => [...row]);
  }

  // For staged mode, merge with targets from the specified stage
  const stage = levelData.stages[stageIndex];
  if (!stage) return null;

  const mergedGrid: string[][] = baseGrid.map((row) => [...row]);

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

// Load attempt count from sessionStorage
function loadAttemptCount(): number {
  const stored = sessionStorage.getItem(POLARITY_ATTEMPS);
  if (stored) {
    const parsed = parseInt(stored, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Save attempt count to sessionStorage
function saveAttemptCount(count: number): void {
  sessionStorage.setItem(POLARITY_ATTEMPS, count.toString());
}

// Load target achieved status from sessionStorage
function loadTargetAchieved(): boolean {
  const stored = sessionStorage.getItem(POLARITY_TARGET_ACHIEVED);
  return stored === "true";
}

// Save target achieved status to sessionStorage
function saveTargetAchieved(achieved: boolean): void {
  sessionStorage.setItem(POLARITY_TARGET_ACHIEVED, achieved.toString());
}

// Load level from data
function loadLevel(
  levelData: Level,
  stageIndex: number = 0,
  resetState: boolean = true,
) {
  currentLevelData = levelData;
  currentPlayStageIndex = stageIndex;
  totalStages = levelData.stages?.length || 1;

  const grid = normalizeLevelData(levelData, stageIndex);
  if (!grid) {
    console.error("Failed to load level: invalid level data");
    return;
  }

  if (resetState) {
    score = 0;
    updateScoreFont(0);
    if (levelData.gameMode === "sprint" || levelData.gameMode === "staged") {
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
  gameOverProcessed = false;
  lastTimerUpdate = Date.now();
  particles = [];
  player.hasAttracted = false;

  const { playerX, playerY, reds, blues, targs, wallList } = parseGrid(grid);

  if (resetState) {
    const playerOffset = (PLAY_CELL_SIZE - PLAYER_SIZE) / 2;
    player.x = playerX * PLAY_CELL_SIZE + playerOffset;
    player.y = playerY * PLAY_CELL_SIZE + playerOffset;
  }

  redAttractors = reds;
  blueAttractors = blues;
  walls = wallList;

  if (levelData.gameMode === "timeAttack" || levelData.gameMode === "sprint") {
    spawnRandomTargets();
  } else {
    targets = targs;
  }
}

// Check if target position overlaps with a wall or magnet
function isValidTargetPosition(x: number, y: number): boolean {
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

// Spawn random targets
function spawnRandomTargets() {
  targets = [];
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

// Default level data - using new format with baseGrid and stages
const defaultLevelData: Level = {
  name: "Default",
  gameMode: "timeAttack",
  baseGrid: [
    [" ", " ", " ", " ", " ", "R"],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", "B", "P", " ", " "],
    [" ", " ", " ", " ", " ", " "],
    [" ", " ", " ", " ", " ", " "],
  ],
  stages: [], // Time attack mode doesn't need stages
  target: 200,
};

// Default level
function loadDefaultLevel() {
  loadLevel(defaultLevelData, 0, true);
}

// Load levels from localStorage
function getStoredLevels(): Level[] {
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
function getLevelDisplayName(level: Level): string {
  const modeTag = level.gameMode ? `[${level.gameMode}]` : "[staged]";
  return `${level.name} ${modeTag}`;
}

// Check for level in URL hash
function checkForEditorLevel() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    try {
      const decoded = decodeURIComponent(hash);
      const data = JSON.parse(decoded);
      if (
        data.level &&
        // data.level.baseGrid &&
        data.level.stages
      ) {
        loadLevel(data.level);
        history.replaceState(null, "", window.location.pathname);
        return true;
      }
    } catch (e) {
      console.error("Failed to parse level from URL:", e);
    }
  }
  const sessionStorageData = sessionStorage.getItem("polarity_editor_level");
  if (sessionStorageData) {
    try {
      const level = JSON.parse(sessionStorageData) as Level;
      if (level.stages) {
        loadLevel(level);
        score = 0;
        updateScoreFont(0);
        return true;
      }
    } catch (e) {
      console.error("Failed to parse editor level from sessionStorage:", e);
    }
  }
  return false;
}

// Input handling
const keys = { x: false, z: false };

document.addEventListener("keydown", (e) => {
  startBackgroundMusic();
  if (e.key.toLowerCase() === "x" || e.key === "ArrowRight") {
    keys.x = true;
    btnX?.classList.add("active");
  }
  if (e.key.toLowerCase() === "z" || e.key === "ArrowLeft") {
    keys.z = true;
    btnZ?.classList.add("active");
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "x" || e.key === "ArrowRight") {
    keys.x = false;
    btnX?.classList.remove("active");
  }
  if (e.key.toLowerCase() === "z" || e.key === "ArrowLeft") {
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

  button.addEventListener("mousedown", startHandler);
  button.addEventListener("mouseup", endHandler);
  button.addEventListener("mouseleave", endHandler);

  button.addEventListener("touchstart", startHandler, { passive: false });
  button.addEventListener("touchend", endHandler, { passive: false });
  button.addEventListener("touchcancel", endHandler, { passive: false });
}

setupArcadeButton(btnZ, "z");
setupArcadeButton(btnX, "x");

// Sync button visual state with keys object
let lastZActive = false;
let lastXActive = false;

function syncButtonVisuals() {
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
    e.preventDefault();
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
  player.prevX = player.x;
  player.prevY = player.y;

  const isAttracting = keys.x || keys.z;
  if (isAttracting) {
    player.hasAttracted = true;
  }
  if (player.hasAttracted && !isAttracting) {
    player.vy += GRAVITY * PHYSICS_SPEED;
  }

  player.x += player.vx * PHYSICS_SPEED;
  player.y += player.vy * PHYSICS_SPEED;

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

  walls.forEach((wall) => {
    const wallX = wall.x;
    const wallY = wall.y;

    if (
      player.x < wallX + PLAY_CELL_SIZE &&
      player.x + player.size > wallX &&
      player.y < wallY + PLAY_CELL_SIZE &&
      player.y + player.size > wallY
    ) {
      const overlapLeft = player.x + player.size - wallX;
      const overlapRight = wallX + PLAY_CELL_SIZE - player.x;
      const overlapTop = player.y + player.size - wallY;
      const overlapBottom = wallY + PLAY_CELL_SIZE - player.y;

      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom,
      );

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

        // Play collection sound via Web Audio API
        playSfx("eat.ogg", 0.3);

        if (
          currentLevelData.gameMode === "sprint" &&
          score >= SPRINT_TARGET_SCORE
        ) {
          isGameOver = true;
        }

        if (currentLevelData.gameMode === "staged") {
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

  if (targets.every((t) => t.collected)) {
    if (
      currentLevelData.gameMode === "timeAttack" ||
      currentLevelData.gameMode === "sprint"
    ) {
      spawnRandomTargets();
    } else if (
      currentLevelData &&
      currentLevelData.stages &&
      currentPlayStageIndex < totalStages - 1
    ) {
      currentPlayStageIndex++;
      loadLevel(currentLevelData, currentPlayStageIndex, false);
    } else if (currentLevelData.gameMode === "staged") {
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

  gameCtx.shadowBlur = 0;
}

function drawAttractors() {
  redAttractors.forEach((a) => {
    if (redAttractorImageLoaded) {
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
      gameCtx.shadowColor = COLOR_RED_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.fillStyle = COLOR_RED_ATTRACTOR_OUTER;
      gameCtx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
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

  blueAttractors.forEach((a) => {
    if (blueAttractorImageLoaded) {
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
      gameCtx.shadowColor = COLOR_BLUE_ATTRACTOR_OUTER;
      gameCtx.shadowBlur = 12;
      gameCtx.fillStyle = COLOR_BLUE_ATTRACTOR_OUTER;
      gameCtx.fillRect(a.x, a.y, ATTRACTOR_SIZE, ATTRACTOR_SIZE);
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
      const rotation =
        Math.sin(time * TARGET_SWIM_SPEED + t.rotationOffset) *
        MAX_TARGET_ROTATION;

      gameCtx.save();
      gameCtx.translate(t.x + TARGET_SIZE / 2, t.y + TARGET_SIZE / 2);
      gameCtx.rotate(rotation);

      if (targetImageLoaded) {
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
        gameCtx.shadowColor = COLOR_TARGET_OUTER;
        gameCtx.shadowBlur = 10;
        gameCtx.fillStyle = COLOR_TARGET_OUTER;
        gameCtx.fillRect(
          -TARGET_SIZE / 2,
          -TARGET_SIZE / 2,
          TARGET_SIZE,
          TARGET_SIZE,
        );
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
  const renderX =
    player.prevX + (player.x - player.prevX) * interpolationFactor;
  const renderY =
    player.prevY + (player.y - player.prevY) * interpolationFactor;

  const trailWidth = player.size * TRAIL_WIDTH_RATIO;
  const trailOffsetX = (player.size - trailWidth) / 2;
  player.trail.forEach((t) => {
    gameCtx.fillStyle = `rgba(150, 150, 150, ${t.alpha * 0.3})`;
    gameCtx.fillRect(t.x + trailOffsetX, t.y, trailWidth, player.size);
  });

  if (playerImageLoaded) {
    const tilt = Math.max(
      -MAX_PLAYER_TILT,
      Math.min(MAX_PLAYER_TILT, player.vx * PLAYER_TILT_FACTOR),
    );

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

    if (currentLevelData.gameMode === "timeAttack") {
      timeRemaining--;
      updateTimerFont(timeRemaining);

      if (timeRemaining <= 0) {
        isGameOver = true;
      }
    } else if (
      currentLevelData.gameMode === "sprint" ||
      currentLevelData.gameMode === "staged"
    ) {
      sprintTimeElapsed++;
      updateTimerFont(sprintTimeElapsed);
    }
  }
}

// Show/hide game over overlay
function drawGameOver() {
  if (!gameOverProcessed) {
    gameOverProcessed = true;
    gameOverOverlay.classList.add("visible");

    const target = currentLevelData?.target;
    let targetAchieved = false;
    let attemptCount = loadAttemptCount();
    const wasPreviouslyAchieved = loadTargetAchieved();

    if (
      currentLevelData.gameMode === "sprint" ||
      currentLevelData.gameMode === "staged"
    ) {
      if (target !== undefined) {
        targetAchieved = sprintTimeElapsed <= target;
      }
      gameOverTitle.textContent = "COMPLETE!";
      gameOverScore.textContent = `Time: ${sprintTimeElapsed} seconds`;
      if (target !== undefined) {
        gameOverTarget.textContent = `Target: ${target} seconds`;
        gameOverTarget.style.color =
          targetAchieved || wasPreviouslyAchieved
            ? "var(--neon-cyan)"
            : "var(--neon-orange)";
      } else {
        gameOverTarget.textContent = "";
      }
    } else {
      if (target !== undefined) {
        targetAchieved = score >= target;
      }
      gameOverTitle.textContent = "COMPLETE";
      gameOverScore.textContent = `Points earned: ${score}`;
      if (target !== undefined) {
        gameOverTarget.textContent = `Target: ${target} points`;
        gameOverTarget.style.color =
          targetAchieved || wasPreviouslyAchieved
            ? "var(--neon-cyan)"
            : "var(--neon-orange)";
      } else {
        gameOverTarget.textContent = "";
      }
    }

    // Handle attempt count and achievement tracking
    if (targetAchieved) {
      // Target achieved: save status and set flag
      saveTargetAchieved(true);
    }
    if (!wasPreviouslyAchieved) {
      attemptCount++;
      saveAttemptCount(attemptCount);
    }

    // Show attempt count
    gameOverAttempts.textContent = `Attempts: ${attemptCount}`;
  }
}

function hideGameOver() {
  gameOverOverlay.classList.remove("visible");
}

// Restart the game
function restartGame() {
  isGameOver = false;
  gameOverProcessed = false;
  lastTimerUpdate = Date.now();

  if (checkForEditorLevel()) {
    if (controls && window.getComputedStyle(controls).display === "none") {
      controls.style.display = "flex";
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
const PHYSICS_DT = 1000 / 60;
const MAX_PHYSICS_STEPS = 2;

const isDebugMode =
  new URLSearchParams(window.location.search).get("debug") === "1";

let debugFrameCounter = 0;

// Main game loop
function gameLoop() {
  const currentTime = performance.now();
  const elapsed = currentTime - lastFrameTime;
  lastFrameTime = currentTime;

  physicsAccumulatedTime += elapsed;
  let physicsSteps = 0;

  if (physicsAccumulatedTime > 2000) {
    physicsAccumulatedTime = 2000;
  }

  while (
    physicsAccumulatedTime >= PHYSICS_DT &&
    physicsSteps < MAX_PHYSICS_STEPS
  ) {
    physicsSteps++;
    physicsAccumulatedTime -= PHYSICS_DT;
  }

  if (isDebugMode) {
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
  }

  syncButtonVisuals();

  // Update looping magnet sounds via Web Audio API
  if (!isGameOver) {
    if (keys.z) {
      startLoop(blueLoop, "electric1.ogg", MAX_VOLUME);
    } else {
      stopLoop(blueLoop);
    }

    if (keys.x) {
      startLoop(redLoop, "electric2.ogg", MAX_VOLUME);
    } else {
      stopLoop(redLoop);
    }
  } else {
    stopLoop(blueLoop);
    stopLoop(redLoop);
  }

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

  drawGrid();

  if (isGameOver) {
    drawWalls();
    drawAttractionLines();
    drawAttractors();
    drawTargets(Date.now());
    drawParticles();
    drawPlayer(0);
    drawGameOver();
  } else {
    hideGameOver();
    updateTimer();

    for (let i = 0; i < physicsSteps; i++) {
      applyAttraction();
      updatePlayer();
      checkCollisions();
    }
    updateParticles();

    const interpolationFactor = physicsAccumulatedTime / PHYSICS_DT;

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
  // Preload sound effects into Web Audio buffers
  await preloadSounds();

  if (!checkForEditorLevel()) {
    loadDefaultLevel();
  } else {
    if (controls && window.getComputedStyle(controls).display === "none") {
      controls.style.display = "flex";
    }
  }

  playNextBgTrack();
  gameLoop();
}

// Start initialization
initializeGame();
