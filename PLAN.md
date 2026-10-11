# PLAN: Empty the Chamber (browser prototype)

Handoff for the next agent. Repo state: an empty public GitHub repo (`craigrusselltiu/empty-the-chamber`, nothing pushed yet), plus the local files listed under "Already done". Read this whole file, then start at Step 1.

## Already done

- `scripts/stitch_sprites.py` stitches the pseudo-pixel per-direction strips into one sheet per animation. Re-run it with `python scripts/stitch_sprites.py` if the source sprites change. It reads from `E:/GitHub/pseudo-pixel/characters` and needs Pillow.
- `public/sprites/rust/` (red panda, from `pseudo-pixel/characters/red_panda_ps1_v2/out`): `idle`, `run`, `shoot`, `hit`, `stop` + `rust.json`
- `public/sprites/reno/` (raccoon, from `pseudo-pixel/characters/raccoon/out`): `idle`, `run`, `attack` + `reno.json`

### Sprite sheet format

- Each `<anim>.png` is a grid: **8 rows (directions) x N columns (frames)**, with 64x64 frames.
- Row order is `E, NE, N, NW, W, SW, S, SE`: counter-clockwise from screen-right, so `row = round(screenAngle / 45deg) mod 8` with the angle measured CCW from screen +x and "N" meaning up the screen. I checked it visually: row 0 faces right, row 2 shows the back, row 4 faces left and row 6 faces the camera.
- `<char>.json` gives `frameWidth`, `frameHeight`, `directions`, and per animation `{ image, frames, durations[] }`. Durations are in ms (83 ms, so 12 fps).
- Frame counts: Rust has idle 24, run 8, shoot 17, hit 10 and stop 11. Reno has idle 24, run 16 and attack 14.
- pseudo-pixel render settings: camera **elevation 30 deg** and **anchor (32, 52)**, the feet pixel inside the 64x64 frame. Use the anchor as the billboard pivot and the blob-shadow position.
- Directions are relative to the screen/camera, not the world. Because the game camera has a fixed yaw, pick the row from the movement or aim vector **projected to screen space**.

## Amendments to the original brief (these override it)

1. **Characters are sprites, not procedural meshes.** Rust and Reno use the pre-rendered pseudo-pixel sheets, drawn as camera-facing billboards (a quad with `alphaTest`, nearest filtering and no mipmaps) inside the 3D scene. Pivot each one at the anchor. Keep the sprites lit: either a simple lit sprite shader that takes the dusk tint and nearby point lights, or at least tint them by the ambient and day-night colour, and add the warm rim/outline so the player reads in the crowd. Enemies, props and terrain stay procedural low-poly 3D, as in the brief. Structure enemies so pseudo-pixel sheets can replace them later with the same sheet format.
2. **Camera pitch: use 30 deg** (not about 35) so the world matches the sprite render elevation, with a 45 deg yaw orthographic camera.
3. **Low-res target:** a 64 px sprite is large at 480x270. Start at **640x360** and keep 1 sprite texel = 1 render-target pixel so the pixel art stays crisp. Adjust the ortho zoom so the character is roughly 1/7 of screen height. Tune this in M1.
4. **Only Rust and Reno are in the game.** Rust is unlocked from the start. Reno is unlocked by a condition, e.g. holding X gold at once in a single run. Rudy, Reap, Rita and Riff appear on the character-select screen as **locked silhouettes** showing their unlock hint. Design them fully in SPEC.md but do not implement their kits.
5. **Animation mapping:**
   - Rust: `idle`, `run`, `stop` (brief settle when movement ends), `shoot` (play an upper-body-style overlay or a short interrupt on each shot; if that looks bad, play it only for the cylinder's final shot and the ultimate), `hit` (on taking damage).
   - Reno: `idle`, `run`, and `attack` for chip throws and False Shuffle. Reno has no hit animation, so use a white hit-flash and knockback instead.

## User preferences (from global CLAUDE.md)

- Never use axios. No emojis anywhere. No "Generated with Claude Code" in PR descriptions.
- Prefer simplicity and performance. Write less code and avoid speculative abstractions. Don't build features beyond SPEC.md.
- Keep SPEC.md, README.md and CHANGELOG.md updated. CHANGELOG uses Keep a Changelog format with versions written like `v0.1.0` and **no "Unreleased" header**.
- Commit only when asked, and branch first if on the default branch. The repo is currently empty, so making the initial commit on `main` is fine once the user approves.

---

# Original brief (with the amendments above applied on top)

Empty the Chamber is a spin-off of One More In The Chamber (OMITC): https://github.com/craigrusselltiu/one-more-in-the-chamber

It is a Vampire Survivors-style horde survival game in a spaghetti western world, with a fixed isometric camera and PS1-era 3D graphics but modern, moody lighting. This is a prototype: aim for something fun and playable, not production-complete.

## Step 1 - Research and spec

1. Clone the OMITC repo (if it isn't already at `E:\GitHub\one-more-in-the-chamber`) and read:
   - docs/characters/*.md (all six characters: lore, species, abilities)
   - docs/ENEMIES.md (enemy roster per act, elites, bosses)
   - docs/TRAITS.md, docs/ARTIFACTS.md, src/data/tiles.ts (traits, artifacts, exclusive tiles)
   Reuse names, flavour text, enemies and bosses wherever they fit. This should feel like the same world.

2. Research the survivors-like genre and summarise what makes it work. At minimum cover Vampire Survivors, Brotato, Halls of Torment, 20 Minutes Till Dawn and Deep Rock Galactic: Survivor. Cover:
   - auto-firing weapons and the level-up "pick 1 of 3/4" loop
   - weapon evolutions (max weapon + specific passive)
   - XP gems, magnet, chests, floor pickups
   - spawn pacing, density curves, elite waves, the end-of-run "reaper" pressure
   - meta progression: persistent gold, permanent upgrades, unlock conditions for characters and items
   - what keeps runs varied and builds expressive

3. Write a concise SPEC.md covering design, systems, content lists, tech architecture and the milestone plan below, then go straight into building.

## Core loop

- 15-minute runs (configurable). Movement only (WASD, arrows, gamepad, touch joystick); weapons auto-fire.
- Kills drop XP (brass casings and gold coins instead of gems). Level up: pick 1 of 3 (weapon, passive artifact, or upgrade), with reroll, skip and banish.
- The run goes from dusk to midnight. The world gets darker, enemy density rises, and elites and boss waves come on a schedule. At the end, a final unkillable pressure wave (our reaper equivalent: fits the lore, e.g. Iron Eye Isabella's posse).
- Weapon evolutions: a max-level weapon plus a specific artifact evolves at a chest.
- Port OMITC traits as a synergy layer: artifacts carry trait tags (Sheriff, Outlaw, Prospector, Gunslinger, Sniper, Dead Man Walking, Undertaker, etc.) with breakpoint bonuses, rewritten for real-time combat.
- Each character has a charged ultimate on Space or a button. It fills from kills and damage.
- Meta: gold persists in localStorage, buys permanent upgrades, and unlocks characters via achievement-style conditions.

## Title mechanic: empty the chamber

Lean into the name. Guns have a cylinder that fires out and reloads, and the HUD shows it clearly. Emptying the cylinder should feel like a payoff: the last bullet in the chamber hits harder or triggers something, and upgrades and artifacts build on that (bonus effects on the final shot, effects that trigger on reload, faster unloading, chain-reloads on kills). The reload gap is the brief danger window that makes the payoff matter. Design a handful of these so "empty the chamber" becomes something players build around.

## Characters

Translate each OMITC character's identity and ability into a real-time kit with real personality: a signature starting weapon, a passive and an ultimate. Below are the starting points. Push them further and keep the flavour.

**Playable now (sprites provided):**

- Rust (red panda gunslinger; OMITC: Deadeye, Bounty tile, Bamboo Canteen). Six-shooter with a reload. Shots apply Bounty stacks, and an enemy whose HP drops below its Bounty stacks is executed and pays out bonus gold. Ultimate, Deadeye: time slows to a crawl, crosshairs snap onto the 3 toughest enemies on screen, and three piercing shots go off in sequence with a big screen-wide flash. Each target killed detonates its Bounty.
- Reno (raccoon card sharp; OMITC: False Shuffle, Chip tile, Rigged Deck, Ace, gold economy). Throws poker chips: 50% chance of a big hit, 50% chance of a whiff. Whiffs drop gold, and hits can ricochet. Ultimate, False Shuffle: deals a 5-card hand in a ring around him, and the poker hand rank sets the effect (pair is small, flush and full house are big, royal flush wipes the screen). Gamble-flavoured level-ups would suit him.

**Locked (design in SPEC.md only; shown as locked on character select):**

- Rudy (armadillo sheriff; OMITC: Hunker Down, block scaling). Tanky. Builds stacking armour. Ultimate, Hunker Down: curls into an armoured ball, invulnerable, and can roll through the horde. When he uncurls, the stored block releases as a shockwave.
- Reap (coyote shadow outlaw; OMITC: Shadow Veil). Shadow claws. Ultimate, Shadow Veil: becomes intangible smoke that damages everything it passes through, and his shadow detaches to fight on its own for a while.
- Rita (viper assassin; OMITC: Blade Dance, poison, knives). Poison throwing knives at high speed. Ultimate, Blade Dance: a zig-zag dash chain through the horde. Poisoned enemies she hits burst. Consider a once-per-run shed-skin decoy on lethal damage.
- Riff (frog bard; OMITC: Jazz Solo, sax and banjo). Sax soundwave cones that knock back. Ultimate, Jazz Solo: glowing music staves swirl across the screen, and pressing on the beat amplifies damage. Tongue-grab for pickups.

Each locked character needs a fun unlock condition tied to their kit.

## Enemies and stages

Use the OMITC acts as stages:
- Dusty Trail: bandits, coyotes, rattlesnakes, vultures, pack mules. Elites: Tumbleweed Golem, Dust Devil. Boss: "Dusty" Dan McGraw.
- The Canyon and mines: powder monkeys, tunnel rats, Prospector Gone Mad. Elites: Ore Golem, Mine Cart. Boss: "Copperhead" Cassidy.
- The Town: train guards, guard dogs, Hellfire Preacher, Hangman, corrupt deputies. Elite: Sheriff's Shadow. Boss: "Iron Eye" Isabella.

Enemies need readable silhouettes and a few distinct behaviours (swarm, charge, ranged, splitter, tank). Stage 1 must be complete; the other two are stretch goals.

## Visual direction: PS1 bones, modern light

- Three.js with a fixed isometric orthographic camera (45 degree yaw, **30 degree pitch** to match the sprites) following the player.
- Render to a low-res target (**start at 640x360**, see amendment 3) and upscale with nearest-neighbour.
- PS1 artefacts in shaders: vertex snapping and jitter, affine texture warping, low-res textures, ordered dithering and colour quantisation in a post pass, distance fog. Don't vertex-snap the character billboards in a way that makes them wobble; snapping them to whole render pixels is fine.
- Modern lighting on top: dynamic point lights from muzzle flashes, explosions, lanterns and campfires; a dusk-to-night cycle tied to the run timer; subtle bloom on bright sources; warm rim light on the player so they always read in the crowd; low-res shadows or blob shadows.
- Palette: burnt orange, sand, rust red, faded teal and deep purple shadows, getting cooler as night falls.
- Art: player characters use the provided sprite sheets. Enemies and props are procedural low-poly meshes built in code (no external assets), each distinct by shape and colour, and structured so real models or sprite sheets can be swapped in later.
- Juice: hit flash, knockback, screen shake, damage numbers in a chunky bitmap font, satisfying pickup magnet, and level-up fanfare. Make the final shot of a cylinder feel loud.

## Tech

- TypeScript + Vite + Three.js. Minimal dependencies; justify anything beyond those.
- Must handle 500+ enemies at 60fps: instanced meshes, object pools and a spatial hash for collisions.
- Data-driven content: characters, weapons, artifacts, enemies and waves live in data files.
- Deterministic seeded runs.
- Static build deployable to GitHub Pages (free tier only). Set the Vite `base` to `/empty-the-chamber/` and add a GitHub Actions Pages workflow.

## Milestones

1. Movement, camera, PS1 render pipeline and lighting, a ground plane and props, **and Rust's sprite billboard with 8-direction idle/run/stop animation**.
2. Rust's six-shooter with cylinder and reload (`shoot` anim), enemy spawning and pathing, XP and level-up.
3. Weapons, artifacts, traits, evolutions, chests and the ultimate.
4. Reno, plus stage 1 waves, elites and the Dusty Dan boss.
5. Meta progression, the unlock shop, Reno's unlock condition and the locked-character select screen.
6. Polish and juice.

After each milestone, run it in a browser, play it, and fix what feels bad before moving on. Keep a short CHANGELOG.md.
