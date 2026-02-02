# AGENTS.md - Polarity Game

## Build Commands

```bash
# Install dependencies
bun install

# Run the game server (properly serves fonts and static files)
bun run dev
# or
bun run start

# Type check TypeScript
bun tsc --noEmit
```

## Testing

**No test framework configured.** To add tests:
```bash
bun add -d bun:test
```

Run single test (when configured):
```bash
bun test <test-file-pattern>
```

## Code Style Guidelines

### TypeScript Configuration
- Target: ESNext with DOM lib
- Strict mode enabled
- Module: Preserve (Bun handles bundling)
- No unchecked indexed access
- No implicit override required

### Formatting
- Indent: 2 spaces
- Semicolons: required
- Quotes: double
- Line endings: LF

### Naming Conventions
- Variables/functions: camelCase (`playerX`, `drawGrid`)
- Types/interfaces: PascalCase (`LevelData`, `Particle`)
- Constants: UPPER_SNAKE_CASE (`GRID_SIZE`, `CELL_SIZE`)
- DOM elements: descriptive with Element suffix (`scoreElement`)

### Code Patterns

**Type Definitions:**
```typescript
interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
```

**Null Checks:**
```typescript
const row = grid[y];
if (!row) continue;
const cell = row[x];
```

**Error Handling:**
- Use `throw new Error("message")` for fatal errors
- Use `console.error()` for logging
- Return early with null checks

**Canvas Operations:**
- Always check canvas context with `!` assertion after getContext
- Use constants for sizes (`PLAYER_SIZE`, `ATTRACTOR_SIZE`)

### Project Structure

```
/Users/sean/code/reddit/polarity/
├── src/game.ts        # Main game logic
├── src/game.html      # Game HTML
├── src/editor.ts       # Level editor logic
├── src/editor.html     # Editor HTML
├── src/server.ts       # Bun dev server (serves fonts correctly)
├── package.json    # Bun dependencies
└── tsconfig.json   # TypeScript config
```

### Key Implementation Notes

- **Game**: Canvas-based physics game with magnetic attractors
- **Editor**: Grid-based level editor with localStorage persistence
- **Level Format**: Compact 6x6 grid using letters (P=player, R=red, B=blue, T=target)
- **Storage Key**: `polarity_levels_v2` for localStorage

### Dependencies
- Runtime: Bun v1.2.19
- Types: `@types/bun`
- TypeScript: ^5 (peer dependency)

### Linting

**No linter configured.** Consider adding:
```bash
bun add -d @biomejs/biome
# or
bun add -d eslint
```
