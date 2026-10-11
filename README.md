# Empty the Chamber

A Vampire Survivors-style horde survival game set in the world of [One More In The Chamber](https://github.com/craigrusselltiu/one-more-in-the-chamber). Fixed isometric camera, PS1-era low-poly geometry, modern dusk lighting. Survive the Dusty Trail from golden hour to midnight.

Version: v0.1.0 (browser prototype)

## Play

```
npm install
npm run dev
```

Then open the URL Vite prints (`http://localhost:5173/empty-the-chamber/`).

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | Drag on the left side |
| Ultimate | Space | A / RT | ULT button |
| Pause | Esc / P | Start | - |
| Level-up pick | 1-4, arrows + Enter, or click | d-pad + A | Tap |

Weapons fire on their own. Your guns have a chamber: the last round in the cylinder is a **Final Shot** that hits twice as hard, and the reload gap after it is when you are most exposed. Build around it.

## Characters

- **Rust** (red panda gunslinger): Six-Shooter, Bounty executions, Deadeye ultimate. Unlocked from the start.
- **"Slick" Reno** (raccoon card sharp): Poker Chips with 50/50 hits, Wild Card level-ups, False Shuffle ultimate. Unlock by holding 500 gold in a single run.
- Rudy, Reap, Rita and Riff appear on the select screen, locked, with their unlock hints.

## Build and deploy

```
npm run build     # type-check and build to dist/
npm run preview   # serve the build locally
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml` (enable Pages with "GitHub Actions" as the source in the repo settings).

## Debug

- `?seed=123` starts every run with a fixed seed.
- `?debug` exposes `run`, `world` and `input` on `window`.
- `?debug&speed=8` runs the simulation 8x faster.

See [SPEC.md](SPEC.md) for the full design.
