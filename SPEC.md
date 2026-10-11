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
- Ultimate: Space, gamepad A/RT, or tap the ULT button. It charges from kills (+1 per XP value) and from damage taken (+2 per HP).
- Kills drop **brass casings** (XP: small 1, medium 5, large 25) and rarely **gold coins** (1.5%). Mules, elites and the boss always drop gold. Pickups inside the magnet radius fly to the player.
- **Level up:** pick 1 of 3. An offer can be a new weapon, a weapon level-up, a new artifact or an artifact level-up. Each run gives 3 rerolls, 3 skips and 3 banishes (meta upgrades add more). Skipping grants a little gold. Banishing removes that option for the rest of the run. When nothing is left to offer, the choices are "Whiskey" (heal 30) and "Gold Pouch" (+25 gold).
- **Slots:** 4 weapons and 6 artifacts. Weapons reach level 5 and artifacts level 3.
- **Evolutions:** a level 5 weapon plus its paired artifact (any level). The next chest evolves the weapon instead of granting random level-ups.
- **Chests** drop from elites and bosses. A chest gives 1 evolution if one is ready, otherwise 1-3 random level-ups.
- **Floor pickups** come from breakable barrels and crates around town (about 1 in 6 breakables): Jerky (heal 25), Lasso (pull all casings on the map), Dynamite Stick (damages everything on screen) and Gold Sack (+20 gold).
- **Dusk to midnight:** the sun sets over the run. At 0:00 it is golden hour (warm, bright), at 7:30 it is dusk, and at 15:00 it is moonlit midnight (cool, dark, lanterns carry the scene). Spawn density rises with time.
- **The Posse (reaper equivalent):** at 15:00 Iron Eye Isabella's Posse rides in. Reaching 15:00 counts as a win (bonus gold, "SURVIVED" on the results screen). Posse riders are unkillable, fast and hit for 999. The run continues until you die.

## 3. Title mechanic: empty the chamber

Every chambered weapon has a chamber size and a reload time. The HUD shows the current weapon's chamber as a revolver cylinder: a filled round for each bullet left, and a spinning cylinder while it reloads.

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

### Rust (red panda gunslinger). Unlocked from the start.

- **Weapon: Six-Shooter.** Chamber 6, reload 1.1s. A fast single shot at the nearest enemy. Each hit adds 1 **Bounty** stack.
- **Passive: Bounty.** If an enemy's HP drops to its Bounty stacks x 4 or lower, it is executed on the spot (5% chance to drop a gold coin). Flavour: "The S is silent."
- **Starting artifact:** Bamboo Canteen (Saloon Keeper): regenerate HP over time.
- **Ultimate: Deadeye** (charge 60). Time slows to 15% for about 1.2s. Crosshairs lock onto the 3 toughest enemies on screen (by current HP, bosses first), and 3 piercing shots fire in sequence. A target killed by a Deadeye shot **detonates its Bounty**: an explosion that deals stacks x 6 damage in a radius. The ult ends with a full-screen white flash.
- Sprite anims: `idle`, `run`, `stop` (settle when movement ends), `shoot` (plays as a short interrupt on Final Shots and on each Deadeye shot), `hit`.

### "Slick" Reno (raccoon card sharp). Unlocked by holding 500 gold at once during a run.

- **Weapon: Poker Chips.** Chamber 5 (a stack), reload 1.0s. Each chip flips a coin: on a HIT it deals 2.2x damage and can ricochet once; on a WHIFF it deals no damage and sometimes drops a gold coin where it lands.
- **Passive: House Edge.** Reno's level-ups show a 4th face-down "Wild Card": a random offer applied twice.
- **Starting artifact:** Rigged Deck (Prospector): chip hits have a 50% chance to ricochet to another enemy, and whiffs always drop gold.
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
| Six-Shooter | Single shot at nearest, adds Bounty | 6 / 1.1s | Kill Confirmed | **Peacemaker**: every shot is a Final Shot |
| Poker Chips | 50/50 hit or whiff, ricochet | 5 / 1.0s | Loaded Dice | **House Always Wins**: 80% hit chance, whiffs explode |
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
- Rigged Deck (Prospector): chip ricochet chance, and whiffs drop gold more often (12% instead of 4%). Reno's starter.
- Rusty Deputy Badge (Sheriff): +20 max HP per level.
- Reinforced Duster (Sheriff): +1 armour per level.
- Outlaw's Spurs (Outlaw, Mustang): +10% move speed per level.
- Saddlebag (Mustang): +30% pickup radius per level.
- Lucky Bullet (Gunslinger): +8% crit chance per level (crit = 2x).
- Gold Tooth (Prospector): +20% gold per level.
- Scope Lens (Sniper): +15% projectile speed and range, +10% damage per level.
- Black Powder Cache (Sapper): +15% area per level.
- Loaded Dice (Desperado): +10% luck per level (better offers, chip hit chance +5%).
- Rattlesnake Fang Necklace (Rattlesnake): hits poison for 2 dmg/s per level for 3s.
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

**Stage 1: The Dusty Trail** (a trail-stop boomtown: saloon, sheriff's office, general store, bank, stables, a stone wall and WANTED posters with Rust's face).

| Enemy | Role | Behaviour |
|---|---|---|
| Coyote | swarm | Fast, low HP, comes in packs |
| Bandit | basic | Walks at you |
| Bandit Gunman | ranged | Keeps distance and fires slow bullets |
| Rattlesnake | charge | Stops, rattles, then lunges |
| Vulture | flyer | Ignores buildings and swoops |
| Tumbleweed | splitter | Rolls in, splits in two on death |
| Pack Mule | tank | Slow, heavy, drops a gold sack |

Elites (glowing, larger, drop a chest): **Tumbleweed Golem** (tank, bursts into 6 tumbleweeds) and **Dust Devil** (erratic whirlwind that pulls pickups and the player).

**Boss at 10:00: "Dusty" Dan McGraw.** A large bandit king that walks at you. It fires 8-way bullet rings, summons 2 vultures, and casts **Gravity Shift**: for 2.5s, a strong wind pushes you and every pickup in one direction (telegraphed with dust streaks). It drops a big chest and lots of gold.

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
- `src/render/`: `pipeline.ts` (render target 270 px tall with the width following the window aspect, so there are no black bars; post pass with bloom, ACES tonemap, purple shadow tint, a 4x4 Bayer dither, quantisation to 32 levels per channel and a vignette; nearest-neighbour upscale), `ps1.ts` (2-pixel vertex snapping on world and enemy materials, plus a dithered x-ray cutout so buildings never hide the player; flat ground layers are not snapped, to avoid z-fighting; the camera is orthographic, so affine texture warping would look no different and is skipped), `sprite.ts` (lit, outlined sprite-sheet billboards), `font.ts` (5x7 bitmap font for the HUD and damage numbers).
- `src/world/`: `town.ts` (procedural map, colliders, lantern positions), `flowfield.ts` (a BFS flow field over a 1-unit grid, rebuilt 4x per second, so enemies route around buildings).
- `src/game/`: `run.ts` (simulation), `enemies.ts` (struct-of-arrays pool, instanced meshes, spatial hash), `weapons.ts`, `projectiles.ts`, `pickups.ts`, `hud.ts`, `levelup.ts`.
- Camera: orthographic, 45 deg yaw, 30 deg pitch. 20 px per world unit. The sprites' characters are about 36 px tall inside the 64 px frame, so at a 270 px render height (1 texel = 1 pixel) a character is about 1/7.5 of the screen. Camera and sprite positions are snapped to whole render pixels.
- Lighting: hemisphere + directional sun/moon (a 1024 shadow map that follows the player, cast by buildings and props), and a fixed pool of 12 point lights reassigned each frame to the nearest lanterns, muzzle flashes and explosions. The light count never changes, so shaders never recompile.
- Determinism: a seeded `mulberry32` RNG per run (the seed is shown on the results screen; set one with `?seed=123`). Gameplay randomness never uses `Math.random`.
- Debug: `?debug` exposes `run`, `input` and `world` on `window`; `?debug&speed=6` runs the simulation 6x faster for playtests.
- Performance: 600 enemies, 1,000 projectiles and 1,500 pickups in fixed pools, a fixed 60 Hz simulation step, and no per-frame allocations in hot loops.
- Deploy: `vite build` with `base: '/empty-the-chamber/'`, via the GitHub Actions Pages workflow.

## 10. Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | Drag on the left half |
| Ultimate | Space | A / RT | ULT button |
| Pause | Esc / P | Start | - |
| Level-up pick | 1-4 / click | d-pad + A | Tap |

## 11. Milestones

1. Movement, camera, PS1 pipeline and lighting, the town, Rust's billboard with 8-direction idle/run/stop.
2. Six-Shooter with cylinder and reload, enemy spawning and flow-field pathing, XP and level-up.
3. Weapons, artifacts, traits, evolutions, chests and the ultimate.
4. Reno, the stage 1 waves, elites and Dusty Dan.
5. Meta progression, the shop, Reno's unlock and the locked character select.
6. Polish and juice.
