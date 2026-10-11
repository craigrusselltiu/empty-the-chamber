# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## v0.2.1 - 2026-10-12

### Fixed

- Drops no longer stop after travelling far: when the pickup pool is full, the casing or coin left furthest behind is recycled (its XP carried into the new casing) instead of new XP being folded into a casing far away.
- The ultimate no longer charges faster and faster as the run goes on: kill charge scales down as the spawn rate climbs.
- One poison value (Sidewinder Fangs' spread) missed by the damage rescale.

### Changed

- Shooting no longer turns the player toward the target (Deadeye included); the character keeps facing the way it moves.
- Deadeye's shots are thinner lines that start fading the moment they fire, in real time, so the slow motion no longer stretches them.

## v0.2.0 - 2026-10-12

### Added

- The version (Alpha v0.2.0, read from package.json) in the bottom-right corner of the main menu.
- Critical hits show "!" after their damage number (e.g. "12!").
- A 3D view of the player, now the default: the rigged PS1 model the sprite sheets were rendered from (Rust and Reno), with the same animations. Press V to swap to the sprite.
- A cinematic run intro: a letterboxed close-up of your character that pulls back to the gameplay camera as the bars slide away. The close-up is nearly level with the sky showing above the character, who faces the camera; it orbits to a side with a clear view and open sky behind, and buildings in the way dissolve during the pull-back. Any key skips it.
- Plants and ground variety: the sand is tinted by a slow vegetation pattern (olive, darker earth where it is lush, pale sand between), and sagebrush, creosote, grass tufts, wildflowers, prickly pear, yucca, agave, barrel cacti, pebbles and the odd cow skull cluster in the lush patches. Thinner in towns, never on roads, and decoration only.
- Buildings and mesas between the player and the camera dissolve above knee height, leaving their floor plan (or a low rocky outline) on the ground, and fade back when you step out (like Project Zomboid).
- An endless world, generated from the run's seed and streamed in around you: curved roads between junctions, towns where roads meet (buildings set along the roads at their angle, not on a grid), outposts on lone roads and open desert with mesas in between.

### Changed

- Pixel-art textures across the world: lap siding in natural, silvered and chipped-whitewash wood, red board-and-batten, dressed stone, rusty tin roofs, cedar shingles, vertical boards, timbers with the grain along them, dark trim, rusty iron lamps and lanterns, hay, water, and dedicated barrel and crate textures. Plants, cacti, bones and wagon canvas get textures too. Buildings no longer share one wood texture, and each varies a little in shade.
- Reno is drawn at 1.25x size; bandits, gunmen, the Tumbleweed Golem and Dusty Dan at 1.25x (with larger hit radii).
- Damage rescaled so a starting weapon hit deals 1: all weapon, ultimate, explosion and poison damage and all enemy HP are divided by 19 (damage is fractional; numbers on screen are rounded to whole, at least 1). Upgrade texts give damage as percentages. Player HP and enemy damage are unchanged.
- Poker Chips always hit (1-1.8 damage, one chip per 0.57s so damage per second is unchanged, no more whiffs); House Always Wins makes every chip burst on impact. Rigged Deck is ricochet chance only; Loaded Dice no longer mentions hit chance.
- Only characters, enemies, projectiles, pickups and effects are pixel art now. The map renders at full resolution, keeping its PS1 look (vertex wobble, nearest-filtered textures, dithering).
- Buildings sit further apart and further back from the streets.
- Tighter sun-shadow bias, so shadows (barrels and crates included) stay attached to what casts them.
- Lamps, windows, doors, signs and posters are built from parts that touch: lanterns hang from the lamp post's arm, the porch beam or a wall bracket; windows and doors are a pane in a four-bar frame; the chapel's door, windows and sign sit on its wall.
- Softer, sharper shadows: filtered (PCF) shadow map at 2048 px instead of an unfiltered 1024.
- Doors have no bottom frame bar (it sat on the ground and flickered).
- Mesas are tiered and irregular: an eroded talus, steep banded walls and a flat cap, each tier a tapered, uneven nine-sided prism turned a little, sometimes with a lower butte leaning on one side.
- Lamp posts have a footing, a tapered shaft, a braced arm and a lantern with corner bars, a base plate, a pyramid cap and a ring; porch and wall lanterns use the same lantern.
- A clipping audit of everything the world builds, checked by `scripts/zfight.js` (no coplanar overlaps across 10 seeds): roof halves, window bars, corner posts, flat-roof trim, porch roofs and decks, balconies, the chapel's cross and sign, lamp arms, the well roof, corral corners, roads at junctions, buildings (porches included) overlapping each other, and barrels and crates overlapping each other, buildings or props. Plants no longer grow through barrels, rocks, cacti or fences; hitching rails are solid.
- Gable roofs stop at the false front instead of poking through it (the chapel, which has no false front, keeps its overhang).
- Signs and posters no longer flicker against their walls: they stand clear of the surface behind them, and the camera's depth range is tighter.
- Roads have one pair of wagon ruts that comes and goes along the way, instead of a dozen stripes; junctions are plain packed dirt.
- The well and troughs are open, with water inside.
- Deadeye fires 6 shots (one per chamber) at the 6 toughest enemies nearby, instead of 3.
- Rust's Six-Shooter fires half as often (0.44s) and hits harder, keeping the same damage per second.
- HUD: removed the top-left HP bar, level and kill count; the timer is smaller and no longer touches the top edge.
- New areas are built a few milliseconds at a time over several frames, so walking into them doesn't stutter.
- Fixed the 2x2 dither used by the x-ray cutout and the invulnerability blink (it was skewed by pixel-centre coordinates).
- Damage the player takes no longer shows a number.
- Big damage numbers are 1.5x instead of 2x. The HUD canvas is now 2x the pixel layer's resolution so 1.5x text stays on whole pixels.

### Removed

- Rust's Bounty passive (stacks, executions and Deadeye's Bounty detonation): it was hard to read in play.

## v0.1.0 - 2026-10-11

### Added

- Rendering: an orthographic isometric camera (45 deg yaw, 30 deg pitch) and a 270 px-tall render target whose width follows the window aspect, so it fills the window with no black bars. PS1 vertex snapping, bloom, an ordered-dither colour quantisation post pass, distance fog and a dithered x-ray cutout so buildings never hide the player.
- Stage 1, The Dusty Trail: a procedural boomtown with a saloon, sheriff's office, bank, hotel, livery, general store, chapel, jail and more. False fronts, porches, balconies, lit windows, lanterns, wanted posters, wagons, a well, a water tower, stone walls, cacti, rocks and mesa cliffs.
- A dusk-to-midnight lighting cycle over the 15-minute run, with a pooled set of point lights for lanterns, muzzle flashes and explosions.
- Rust and Reno as lit, outlined sprite-sheet billboards with 8-direction animation.
- The empty-the-chamber mechanic: chambered weapons, Final Shots, a reload gap, a cylinder HUD, and chamber artifacts (Last Call Bell, Dead Man's Hand, Silver Bullet, Heliograph Shard, Detonator, Kill Confirmed, Death's Pocket Watch, Twin Revolvers).
- 7 weapons, each with an evolution; 22 artifacts; 11 OMITC traits with breakpoints.
- Level-up picks with reroll, skip and banish; chests; floor pickups from breakable barrels and crates.
- Ultimates: Deadeye (Rust) and False Shuffle (Reno, with real poker hand ranking).
- 7 enemy types with swarm, chase, ranged, charge, flying, splitter and tank behaviours; flow-field pathing around buildings.
- 2 elites (Tumbleweed Golem, Dust Devil), the boss "Dusty" Dan McGraw with Gravity Shift, and Iron Eye's Posse at 15:00.
- Meta progression: banked gold, a General Store with permanent upgrades, Reno's unlock and locked character cards.
- Synthesized sound effects, keyboard, gamepad and touch controls, seeded runs, and a GitHub Pages workflow.
