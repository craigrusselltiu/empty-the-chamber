# CLAUDE.md

Browser horde-survival prototype: TypeScript + Vite + Three.js, no other runtime dependencies. Design lives in SPEC.md; keep it in sync.

## Commands

- `npm run dev`: dev server (base path `/empty-the-chamber/`)
- `npm run check`: type-check
- `npm run build`: type-check and build to `dist/`

## Layout

- `src/data/`: all content (characters, weapons, artifacts and traits, enemies, waves, meta upgrades). Tune numbers here first.
- `src/game/run.ts`: the per-run simulation (damage, kills, spawning, events, boss AI, pickups). `weapons.ts`, `ult.ts` and `levelup.ts` hold weapon behaviour, ultimates and level-up offers.
- `src/game/enemies.ts`, `projectiles.ts`, `fx.ts`: fixed-size struct-of-arrays pools with instanced rendering. Avoid allocations in their hot loops.
- `src/world/`: the procedural town (`town.ts`), collision, flow field and the lighting cycle.
- `src/render/`: the pipeline (fixed 270 px height, width from the window aspect), the PS1 material patch (`ps1.ts`), the sprite billboards and the bitmap font.

## Conventions

- Gameplay randomness uses the run's seeded `Rng` (`run.rng`), never `Math.random`.
- The point light count is fixed (lights are pooled), so shaders never recompile. Do not add lights.
- Flat decals (roads, window panes, signs, water) need real separation from the surface behind them; vertex snapping makes small offsets z-fight. Ground layers use plain materials without snapping.
- Playtest with `?debug&speed=8`: `run`, `world` and `input` are on `window`.
