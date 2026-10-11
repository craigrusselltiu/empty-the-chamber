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
- `src/world/`: the endless streamed world (`town.ts`: `Town` streams `Chunk`s; roads, towns, outposts, desert), collision, flow field (moves with the player) and the lighting cycle.
- `src/render/`: the pipeline (the map at full resolution, the pixel layer at a fixed 270 px height with width from the window aspect), the PS1 material patch (`ps1.ts`), the sprite billboards, the player's 3D model (`model.ts`) and the bitmap font.
- `public/models/`: the players' rigged models, exported from the pseudo-pixel `.blend` files (Rust: `red_panda_ps1_v2`, Reno: `raccoon`) as GLB with all actions and all bones.

## Conventions

- Gameplay randomness uses the run's seeded `Rng` (`run.rng`), never `Math.random`.
- The point light count is fixed (lights are pooled), so shaders never recompile. Do not add lights. Lights are enabled on both layers so both passes compile the same programs.
- Everything a building is made of carries its building id (`Builder.bid`, the `aBld` attribute; `stamp()` for separate meshes) so it can dissolve when it hides the player; register what can hide the player with `occluder()` under the same id (buildings and mesas do). Ground cover goes through `Builder.plantTri`/`plantShape` (one vertex list per chunk), not `box()`, to keep chunk builds cheap. Chunk generation is a generator (`Chunk.build`): add a `yield` around any new step that costs more than a few milliseconds.
- Everything the world builds is textured (`src/render/textures.ts`, pixel art painted at startup, 20 texels per unit; bigger tiles go through `tile()`). Each material is a `Key` in the `Kit`: pick the one that fits (wall types, `boards`, `post` for timbers with the grain along y, `trim`, `iron`, ...) rather than reusing one texture with a tint. Coloured textures take a white-ish vertex colour; plants and cacti use neutral textures tinted by vertex colour.
- Anything that should be pixel art (characters, enemies, projectiles, pickups, effects) goes on `CHAR_LAYER`; the map stays on layer 0. Blob shadows stay on layer 0.
- The world is generated per run (`world.newTown(seed)`) and streamed by `town.update()`; never hard-code map positions or bounds. Anything a chunk places must stay inside its cell: place props through `fits()`/`free()`. Colliders are oriented boxes (`solid()` in the builder's frame); query them with `town.at(x, z)`, which covers 2 units around the point.
- No two same-facing faces may share a plane where they overlap (that flickers), and no part may poke through another or float. Flat decals (window panes, signs, posters, water) stand 0.04+ clear of the surface behind them but still touch what holds them; boxes that meet should differ in size by a few cm rather than end flush (see the roof halves, the window bars, the lamp arm). Placement goes through `fits()`/`free()`/`roomFor()`, which test building footprints (porches included). Ground layers use plain materials without snapping.
- After changing anything the world builds, run `scripts/zfight.js` in the console on a `?debug` page; it must report no coplanar overlaps.
- Playtest with `?debug&speed=8`: `run`, `world` and `input` are on `window`.
