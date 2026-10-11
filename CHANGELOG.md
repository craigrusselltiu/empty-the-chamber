# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
