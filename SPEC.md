# Empty the Chamber - SPEC

A horde-survival spin-off of One More In The Chamber (OMITC). Same Frontier, same animals, same grudges: Iron Eye Isabella still wants Rust dead, Reno still owes the wrong people. Fixed isometric camera, PS1-era geometry, modern dusk lighting. Browser prototype.

## 1. Genre notes (what makes survivors-likes work)

- **Vampire Survivors:** movement is the only input; weapons auto-fire. The level-up "pick 1 of 3/4" loop is a constant stream of small decisions. Evolutions (max weapon + a specific passive, claimed from a chest) give players a goal to plan around, so builds become recipes. XP gems plus a magnet, floor pickups (chicken, vacuum, bomb) and chests from elites. The Reaper at 30:00 ends the run with an unkillable threat. Persistent gold buys permanent stat bumps, and odd achievement conditions unlock characters and items, which makes every run feel useful.
- **Brotato:** short timed waves with a shop between them. Characters have strong rule-bending quirks, and stats that interact (luck, harvesting) let players build expressively. Economy is a weapon.
- **Halls of Torment:** traits and stat "blessings" make weapons feel distinct. Pacing is slower and more readable, enemies are dense, and bosses have clear patterns. Equipment found mid-run adds a second build layer.
- **20 Minutes Till Dawn:** you aim manually and a gun has a magazine and a reload. Reload synergies (on-reload effects, final-shot bonuses) are a whole build archetype. That is the template for our cylinder.
- **Deep Rock Galactic: Survivor:** weapons with clips, overclocks as mid-run "evolutions", and stages with hazards and terrain. It shows that reload rhythm plus horde pressure feels great.
- **Why runs vary:** a random offer order, synergy tags (we use OMITC traits), evolutions that redirect a build, reroll/skip/banish so players can steer, characters that change the rules rather than the stats, and difficulty spikes (elite waves, bosses, the final wave) that check whether the build works.
- **Pacing:** spawn density rises roughly linearly with sharp waves on a schedule, enemy HP scales with time, elites roughly every few minutes, and a boss as the mid-run check. The screen should feel full but readable: swarmers fill it, and tanks and ranged enemies create shapes.

## 2. Core loop

- Runs last 15:00 (`RUN_LENGTH` in `src/data/waves.ts`). Move with WASD, the arrow keys, a gamepad left stick or a touch joystick (left half of the screen). Weapons auto-fire at the nearest enemy, or in the facing direction when nothing is in range.
- Ultimate: Space, gamepad A/RT, or tap the ULT button. It charges from kills (0.6 per XP value, at least 0.5) and from damage taken (0.25 per HP). Kill charge is scaled by the opening spawn rate over the current one (its trend, without the swells), so the ult charges at about the same pace all run instead of speeding up as the horde grows.
- Kills drop **brass casings** (XP: small 1, medium 5, large 25) and rarely **gold coins** (1.5%). Mules, elites and the boss always drop gold. Pickups inside the magnet radius fly to the player. Pickups are pooled (1500); when the pool is full, the casing or coin furthest from a new drop is recycled, and its XP rides along with a new casing, so drops never stop however far the player travels.
- **Level up:** pick 1 of 3. An offer can be a new weapon, a weapon level-up, a new artifact or an artifact level-up. Each run gives 3 rerolls, 3 skips and 3 banishes (meta upgrades add more). Skipping grants a little gold. Banishing removes that option for the rest of the run. When nothing is left to offer, the choices are "Whiskey" (heal 30) and "Gold Pouch" (+25 gold).
- **Slots:** 4 weapons and 6 artifacts. Weapons reach level 5 and artifacts level 3.
- **Evolutions:** a level 5 weapon plus its paired artifact (any level). The next chest evolves the weapon instead of granting random level-ups.
- **Chests** drop from elites and bosses. A chest gives 1 evolution if one is ready, otherwise 1-3 random level-ups.
- **Floor pickups** come from breakable barrels and crates around town (about 1 in 6 breakables): Jerky (heal 25), Lasso (pull all casings on the map), Dynamite Stick (damages everything on screen) and Gold Sack (+20 gold).
- **Dusk to midnight:** the sun sets over the run. At 0:00 it is golden hour (warm, bright), at 7:30 it is dusk, and at 15:00 it is moonlit midnight (cool, dark, lanterns carry the scene). Spawn density rises with time.
- **The Posse (reaper equivalent):** at 15:00 Iron Eye Isabella's Posse rides in. Reaching 15:00 counts as a win (bonus gold, "SURVIVED" on the results screen). Posse riders are unkillable, fast and hit for 999. The run continues until you die.

## 3. Title mechanic: empty the chamber

Every chambered weapon has a chamber size and a reload time. The HUD shows the current weapon's chamber as a revolver cylinder: a filled round for each bullet left, and a spinning cylinder while it reloads. The rest of the HUD: the XP bar along the top edge, a small run timer just below it with the dusk-to-midnight progress under it, gold at the top right, HP under the player's feet, the boss bar, and the ultimate meter. Damage numbers are 1x, and 1.5x for Final Shots of 2 or more; they show whole numbers (at least 1) even though damage is fractional, and crits end in "!" (e.g. "12!"). Damage the player takes shows no number. The main menu shows the version ("Alpha v" plus the package version) in its bottom-right corner. The HUD is drawn in 270 px units on a canvas at twice that resolution, so text scales are whole or half numbers and always land on whole pixels.

- **Final shot:** the last round in a chamber is a Final Shot. Base effect: 2x damage, +1 pierce, a big muzzle flash, a light pulse, screen shake and a louder report.
- **Reload gap:** while a weapon reloads it cannot fire. That is the danger window.
- **Chamber artifacts** (players build around these):
  - **Last Call Bell** (Saloon Keeper): a Final Shot also rings a shockwave around you (damage and knockback).
  - **Dead Man's Hand** (Gunslinger, Dead Man Walking): a Final Shot always crits and marks the target Vulnerable (+50% damage taken for 3s).
  - **Silver Bullet** (Gunslinger, Sheriff): a Final Shot deals +100% damage per level to elites and bosses.
  - **Heliograph Shard** (Sniper): reloading flashes a mirror, which stuns enemies near you for 0.6s.
  - **Detonator** (Sapper): reloading drops a lit dynamite stick at your feet.
  - **Kill Confirmed** (Undertaker): a Final Shot kill instantly reloads that weapon (chain reload).
  - **Death's Pocket Watch** (Dead Man Walking): -12% reload time per level.
  - **Twin Revolvers** (Outlaw, Gunslinger): +1 chamber size per level, +10% fire rate.

## 4. Characters

All characters have 100 HP unless noted. Character stats live in `src/data/characters.ts`.

**Damage scale:** a starting weapon hit deals 1 damage (Rust's Six-Shooter and Reno's Poker Chips), and every other damage value and enemy HP is on that scale (a Coyote has 0.47 HP, a Bandit 1.05, the Golem 47, Dusty Dan 316). Damage is fractional; only the numbers on screen are rounded. The player's HP and the damage enemies deal stay on their own scale (100 HP).

### Rust (red panda gunslinger). Unlocked from the start.

- **Weapon: Six-Shooter.** Chamber 6, reload 1.1s. A slow, heavy single shot (0.44s between shots) at the nearest enemy.
- **Passive:** none.
- **Starting artifact:** Bamboo Canteen (Saloon Keeper): regenerate HP over time.
- **Ultimate: Deadeye** (charge 60). Time slows to 12% for about 1.75s. Crosshairs lock onto the 6 toughest enemies within 15 units (by current HP, bosses first; with fewer than 6 it cycles through them), and 6 piercing shots fire 0.2s apart, one per chamber. A shot whose target already died goes to the toughest enemy still standing nearby. Each shot draws a thin line that starts fading at once, on real time (the slow motion does not stretch it). The ult ends with a full-screen white flash.
- Sprite anims: `idle`, `run`, `stop` (settle when movement ends), `shoot` (plays as a short interrupt on Final Shots and on each Deadeye shot), `hit`.
- **3D view (V):** the player is drawn by default as the rigged PS1 model the sheets were rendered from (`public/models/<id>.glb`, exported from the pseudo-pixel `.blend`); V swaps to the sprite and back. It plays the same actions, follows the sprite's animation clock, turns smoothly to face its movement (shooting, Deadeye included, never turns the player), and is rendered in the pixel layer like the sprites.

### "Slick" Reno (raccoon card sharp). Unlocked by holding 500 gold at once during a run.

Drawn at 1.25x size (sprite and model).

- **Weapon: Poker Chips.** Chamber 5 (a stack), reload 1.0s. Flicks a heavy chip at the nearest enemy every 0.57s; every chip hits (1-1.8 damage). From level 4 each chip ricochets once.
- **Passive: House Edge.** Reno's level-ups show a 4th face-down "Wild Card": a random offer applied twice.
- **Starting artifact:** Rigged Deck (Prospector): chips have a 25% chance per level to ricochet to another enemy.
- **Ultimate: False Shuffle** (charge 60). Reno deals 5 cards from a fresh deck into a ring around him (rigged: he sees 7 cards and keeps the best 5). The hand rank sets the payoff, and it detonates from each card:
  - High Card: a small burst. Pair: a bigger burst. Two Pair: two bursts.
  - Three of a Kind: three bursts plus a slow. Straight: a line volley through the ring.
  - Flush: a large burst plus gold rain. Full House: a large burst plus healing.
  - Four of a Kind: a huge burst. Straight Flush: a huge burst plus a screen-wide stun.
  - Royal Flush: kills every non-boss enemy on screen.
- Sprite anims: `idle`, `run`, `attack` (on chip throws, as an interrupt, and on False Shuffle). Reno has no hit anim, so he gets a white hit flash and knockback.

### Locked (on character select as silhouettes; kits designed but not built)

- **Rudy** (armadillo sheriff). Weapon: Badge Toss, a boomerang badge that grants a stack of Armour on each hit (stacks decay). Passive: Hard Exterior, where Armour carries over and caps at 20. Ultimate: Hunker Down, where he curls into an invulnerable ball, rolls at high speed through the horde, then uncurls and releases all stored Armour as a shockwave. **Unlock: "Stand your ground": survive 60 seconds in a row without moving.**
- **Reap** (shadow coyote outlaw). Weapon: Shadow Claws, a wide melee rake in the facing direction that ignores armour. Passive: Shadow Step, where dashing (moving) through enemies briefly makes you untouchable. Ultimate: Shadow Veil, where he becomes intangible smoke that damages everything it passes through, and his shadow detaches to fight on its own for 8s. **Unlock: kill 1,000 enemies after 10:00 (night) in one run.**
- **Rita** (viper assassin, 90 HP). Weapon: Viper Knives, fast poison throwing knives. Passive: Shed Skin, which avoids lethal damage once per run and leaves a decoy. Ultimate: Blade Dance, a 6-hop zig-zag dash chain through the horde, where poisoned enemies she passes through burst. **Unlock: evolve Sidewinder Fangs.**
- **Riff** (frog bard, 110 HP). Weapon: Sax Blast, a soundwave cone that knocks back. Passive: Long Tongue, which grabs the furthest pickup in range every few seconds. Ultimate: Jazz Solo, glowing staves that swirl across the screen, where pressing on the beat amplifies damage. **Unlock: pick up 2,000 brass casings in one run.**

## 5. Weapons (`src/data/weapons.ts`)

| Weapon | Behaviour | Chamber / reload | Evolves with | Evolution |
|---|---|---|---|---|
| Six-Shooter | Slow heavy shot at nearest (0.44s) | 6 / 1.1s | Kill Confirmed | **Peacemaker**: every shot is a Final Shot |
| Poker Chips | Heavy chips at nearest, ricochet | 5 / 1.0s | Loaded Dice | **House Always Wins**: every chip bursts on impact |
| Scattergun | 5-pellet cone | 2 / 1.6s | Black Powder Cache | **Dragon's Breath**: pellets leave fire on the ground |
| Buffalo Rifle | Long piercing shot. With a chamber of 1, every shot is a Final Shot | 1 / 1.8s | Scope Lens | **Heliograph Lance**: infinite pierce, a beam across the screen |
| Dynamite | Lobbed at a random nearby enemy, area blast | - / 2.4s | Tinker's Wrench | **Powder Keg**: cluster blasts |
| Bowie Knives | Knives thrown in the facing direction | - / 1.1s | Rattlesnake Fang Necklace | **Sidewinder Fangs**: poison that spreads on death |
| Lasso | Spinning lasso ring around you, knockback | - / 2.6s | Outlaw's Spurs | **Hangman's Noose**: permanent ring, pulls and chokes |

Weapon levels 2-5 add damage, projectile count, chamber size or area (per-weapon tables in the data file).

## 6. Artifacts and traits (`src/data/artifacts.ts`, `src/data/traits.ts`)

Artifacts are passives with OMITC trait tags. **Trait level = the number of distinct artifacts held with that tag.** Breakpoints switch on bonuses.

Stat artifacts (3 levels each):
- Bamboo Canteen (Saloon Keeper): +0.25 HP/s regen per level. Rust's starter.
- Rigged Deck (Prospector): chip ricochet chance. Reno's starter.
- Rusty Deputy Badge (Sheriff): +20 max HP per level.
- Reinforced Duster (Sheriff): +1 armour per level.
- Outlaw's Spurs (Outlaw, Mustang): +10% move speed per level.
- Saddlebag (Mustang): +30% pickup radius per level.
- Lucky Bullet (Gunslinger): +8% crit chance per level (crit = 2x).
- Gold Tooth (Prospector): +20% gold per level.
- Scope Lens (Sniper): +15% projectile speed and range, +10% damage per level.
- Black Powder Cache (Sapper): +15% area per level.
- Loaded Dice (Desperado): +10% luck per level (better offers, chip hit chance +5%).
- Rattlesnake Fang Necklace (Rattlesnake): hits poison for 0.1 dmg/s per level for 3s.
- Tinker's Wrench (Sapper): -8% non-chamber weapon cooldown per level.
- Gravedigger's Shovel (Undertaker): +1 ultimate charge per kill per level.
- Plus the chamber artifacts in section 3.

Traits (real-time rewrites):
- **Sheriff** ("The law is heavier than it looks."): 2: +2 armour. 3: reflect 50% of contact damage.
- **Outlaw** ("Wanted: Alive. Preferably not."): 2: kills give +2% damage for 4s (stacks to 20). 4: +1 projectile on all weapons.
- **Prospector** ("There's gold in them hills."): 2: +25% gold. 3: picking up gold zaps a nearby enemy.
- **Gunslinger** ("Fastest hand in the west. And the luckiest."): 2: +1 chamber size. 4: +15% crit chance.
- **Sniper** ("Sniper? I barely know her!"): 2: +1 pierce. 3: Final Shots instantly kill non-elites.
- **Dead Man Walking** ("I didn't hear no bell."): 2: -1 damage taken. 3: below 30% HP, deal double damage.
- **Undertaker** ("Business is booming."): 2: +1 max HP per 50 kills (cap +50).
- **Sapper** ("Fire in the hole."): 2: +20% area. 3: explosions leave fire.
- **Mustang** ("Can't fence what won't be fenced."): 2: +10% speed, +20% magnet.
- **Saloon Keeper** ("On the house."): 2: Jerky heals double, +0.5 HP regen.
- **Desperado** ("Go big or go home."): 2: +10% crit chance, crits deal 2.5x.

Every breakpoint is reachable with 6 artifact slots. Tags: Lucky Bullet (Gunslinger, Sniper), Loaded Dice (Desperado, Prospector), Fang Necklace (Outlaw), Gravedigger's Shovel (Undertaker, Dead Man Walking), Detonator (Sapper, Outlaw), Kill Confirmed (Undertaker, Desperado); the rest as listed above.

## 7. Enemies and stages (`src/data/enemies.ts`, `src/data/waves.ts`)

Enemies are procedural low-poly meshes (instanced per type). Each type is described by a builder function and a colour, so a sprite sheet in the player sheet format can replace it later.

**Stage 1: The Dusty Trail** is an endless desert of trail towns, generated from the run's seed and streamed in around the player. The world is a grid of 128-unit cells. Each cell has a junction near its centre (jittered up to 14 units), and curved roads (cubic curves bowing up to 18 units) join neighbouring junctions by seeded chance; main street (the row through the start) always runs, and the start junction always has a cross street. A junction on two or more roads usually grows a town: the 13 buildings (saloon, sheriff's office with WANTED posters of Rust, bank, hotel, livery, general store, assay office, undertaker, jail, telegraph, chapel, blacksmith, barber) are shuffled and set along the roads leading out of it, facing the road at whatever angle it runs with a slight random skew, 3-7 units apart and 10 units from the road's centre. The side whose facades face the camera fills first. Lamp posts line the camera-side kerb; hitching rails, troughs, barrels and crates go in front of buildings; a well, wagons, a water tower, a corral and loose clutter fill the gaps. A junction on one road gets an outpost (trading post, way station, cantina or stables), and cells without roads are open desert with cacti, rocks, dead trees, stone walls and mesas (tiered, uneven, turned rock formations with a flat cap). Everything a cell places stays inside it, so cells never conflict. The well and troughs are open, with water inside. Roads are packed dirt with one pair of wagon ruts that wander and fade in and out. The ground is tinted by a smooth vegetation field (shared by the ground shader and plant placement): olive, darker earth where it is high, pale sand where it is low. Plants cluster where it is high: sagebrush and creosote clumps, grass tufts (dry tan to green), wildflowers, prickly pear, yucca (some in flower), agave and barrel cacti; bare sand gets sparse grass, pebbles, agave, barrel cacti and the odd cow skull. Plants are thinner in settlements, never on roads, and do not block movement.

**Textures:** everything the world builds is textured with small nearest-filtered pixel-art textures painted at startup (`src/render/textures.ts`), at a constant 20 texels per unit. Walls come in lap siding (natural, silvered grey, whitewash chipped to the wood), red board-and-batten and dressed stone, and each building's shade varies a little. Decks, false fronts of stone buildings and benches are vertical boards; posts, rails, legs and dead trees are single timbers with the grain along their length; frames and trim are dark wood; flat roofs are rusty corrugated tin, gables cedar shingles. Lamp posts and lanterns are rusty iron; hay bales, water, mesas and rocks have their own textures; barrels and crates have a texture across each face. Plants, cacti, bones and the wagon canvas use neutral textures (a leafy speckle, ribs with spines) tinted by their vertex colour.

**Seeing behind buildings and mesas:** when a building or a mesa stands between the player and the camera (a ray from the player's feet and head toward the camera hits its footprint below its top), everything of it above knee height dissolves with an ordered dither over 0.2s, leaving its base, floor and porch deck on the ground as a floor plan; it fades back when the player steps out. Mesas leave a low rocky outline. Other occluders (water towers, lamp posts, cacti) still use the small x-ray cutout around the player. Runs start on the first junction.

| Enemy | Role | Behaviour |
|---|---|---|
| Coyote | swarm | Fast, low HP, comes in packs |
| Bandit | basic | Walks at you (1.25x size) |
| Bandit Gunman | ranged | Keeps distance and fires slow bullets (1.25x size) |
| Rattlesnake | charge | Stops, rattles, then lunges |
| Vulture | flyer | Ignores buildings and swoops |
| Tumbleweed | splitter | Rolls in, splits in two on death |
| Pack Mule | tank | Slow, heavy, drops a gold sack |

Elites (glowing, larger, drop a chest): **Tumbleweed Golem** (tank at 1.25x size, bursts into 6 tumbleweeds) and **Dust Devil** (erratic whirlwind that pulls pickups and the player).

**Boss at 10:00: "Dusty" Dan McGraw.** A large bandit king (1.25x size) that walks at you. It fires 8-way bullet rings, summons 2 vultures, and casts **Gravity Shift**: for 2.5s, a strong wind pushes you and every pickup in one direction (telegraphed with dust streaks). It drops a big chest and lots of gold.

**Wave schedule:** spawn rate (enemies, counting pack members) rises from about 1.5/s to 31/s over 15:00. Enemy HP scales by 1 + t/240 + (t/420)^2 and contact damage by 1 + t/900 (t in seconds). Stampedes arrive from one side in a 120 degree arc. The mix shifts from coyotes and bandits to gunmen, snakes and tumbleweeds, then mules. Stampedes come at 2:00 and 5:00 (coyotes), 8:00 (tumbleweeds) and 12:00 (coyotes). Elites at 3:00, 6:00, 9:00, 12:00 and 13:30. The boss at 10:00. The Posse at 15:00. Hard cap of 600 live enemies.

**Stretch (not built): Stage 2, The Canyon** (powder monkeys, tunnel rats, Prospector Gone Mad; elites Ore Golem and Mine Cart; boss "Copperhead" Cassidy). **Stage 3, The Town** (train guards, guard dogs, Hellfire Preacher, Hangman, corrupt deputies; elite Sheriff's Shadow; boss "Iron Eye" Isabella).

## 8. Meta progression (`src/data/meta.ts`, saved in localStorage key `etc-save-v1`)

- Gold collected in a run is banked when the run ends. Surviving to 15:00 adds a +100 bonus.
- **Shop (permanent upgrades, 5 ranks each, cost rises per rank):** Grit (+10 max HP), Steady Hand (+5% damage), Quick Draw (-5% reload), Fleet Foot (+5% speed), Long Arm (+10% magnet), Greed (+10% gold), Fortune (+1 reroll), Clean Slate (+1 banish), Second Wind (+1 revive, max 1 rank).
- **Character unlocks:** Reno for holding 500 gold at once in a run. The other four are shown locked with their hints.
- Stats recorded: best time, total kills, total gold and runs.

## 9. Tech architecture

- TypeScript + Vite + Three.js. No other runtime dependencies.
- `src/main.ts`: app state (title, character select, shop, run, results).
- `src/render/`: `pipeline.ts` (two layers. The map renders at the full window resolution with PS1 vertex wobble and nearest-filtered textures, but is not pixelated. The pixel layer (characters, enemies, projectiles, pickups and effects, on layer 1) renders at 270 px tall with the width following the window aspect, after a depth-only pass of the map so the map still hides what is behind it; it is upscaled nearest-neighbour and composited over the map by alpha, with additive effects added. Then a post pass with bloom, ACES tonemap, purple shadow tint, a 4x4 Bayer dither, quantisation to 32 levels per channel and a vignette. No black bars at any aspect), `ps1.ts` (vertex snapping: half a pixel-layer pixel on the map, one pixel on the pixel layer; plus a dithered x-ray cutout so buildings never hide the player; flat ground layers are not snapped, to avoid z-fighting; the camera is orthographic, so affine texture warping would look no different and is skipped), `sprite.ts` (lit, outlined sprite-sheet billboards), `model.ts` (the player's 3D model), `font.ts` (5x7 bitmap font for the HUD and damage numbers).
- `src/world/`: `town.ts` (the streaming world: the 3x3 cells around the player are kept built, a new cell is built a few milliseconds at a time over several frames, and cells more than two away are dropped; colliders are oriented boxes and circles in a 16-unit bucket grid; a dirt plane follows the player), `flowfield.ts` (a BFS flow field over a 96 x 96, 1-unit grid centred on the player, rebuilt 4x per second, so enemies route around buildings). The enemy spatial hash wraps, so it works anywhere.
- `src/game/`: `run.ts` (simulation), `enemies.ts` (struct-of-arrays pool, instanced meshes, spatial hash), `weapons.ts`, `projectiles.ts`, `pickups.ts`, `hud.ts`, `levelup.ts`.
- Camera: orthographic, 45 deg yaw, 30 deg pitch. 20 px per world unit. The sprites' characters are about 36 px tall inside the 64 px frame, so at a 270 px render height (1 texel = 1 pixel) a character is about 1/7.5 of the screen. The camera is snapped to whole screen pixels; sprites and the 3D model are snapped to whole pixel-layer pixels relative to it.
- Lighting: hemisphere + directional sun/moon (a 1024 shadow map that follows the player, cast by buildings and props), and a fixed pool of 12 point lights reassigned each frame to the nearest lanterns, muzzle flashes and explosions. The light count never changes, so shaders never recompile.
- Determinism: a seeded `mulberry32` RNG per run (the seed is shown on the results screen; set one with `?seed=123`). Gameplay randomness never uses `Math.random`.
- Debug: `?debug` exposes `run`, `input` and `world` on `window`; `?debug&speed=6` runs the simulation 6x faster for playtests.
- Performance: 600 enemies, 1,000 projectiles and 1,500 pickups in fixed pools, a fixed 60 Hz simulation step, and no per-frame allocations in hot loops.
- Deploy: `vite build` with `base: '/empty-the-chamber/'`, via the GitHub Actions Pages workflow.

**Run intro:** a run opens on a close-up of the player (3x zoom, a nearly level camera about 3 degrees up so the sky shows above them, orbited to a side with nothing in front of the character and nothing tall behind them within the haze) in letterbox, with the character turned to face the camera. The building-hiding and the x-ray cutout follow the camera in use, so nothing blocks the shot as it pulls back. After a short hold the camera eases out to the gameplay angle over about 2.2s while the black bars slide off the top and bottom; the simulation and the HUD start when it lands. Any key skips it.

## 10. Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | Drag on the left half |
| Ultimate | Space | A / RT | ULT button |
| Pause | Esc / P | Start | - |
| Level-up pick | 1-4 / click | d-pad + A | Tap |
| Toggle sprite / 3D player | V | - | - |

## 11. Milestones

1. Movement, camera, PS1 pipeline and lighting, the town, Rust's billboard with 8-direction idle/run/stop.
2. Six-Shooter with cylinder and reload, enemy spawning and flow-field pathing, XP and level-up.
3. Weapons, artifacts, traits, evolutions, chests and the ultimate.
4. Reno, the stage 1 waves, elites and Dusty Dan.
5. Meta progression, the shop, Reno's unlock and the locked character select.
6. Polish and juice.
