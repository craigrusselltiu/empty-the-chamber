// Enemy roster. `mesh` names a builder in src/game/enemyMeshes.ts; a sprite sheet can replace it later.
export type Behaviour = 'chase' | 'swarm' | 'ranged' | 'charge' | 'fly' | 'split' | 'tank' | 'devil' | 'boss' | 'posse';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number; // collision radius
  xp: number;
  mass: number; // knockback resistance
  behaviour: Behaviour;
  mesh: string;
  scale: number;
  elite?: boolean;
  boss?: boolean;
  gold?: number; // guaranteed gold on death
}

export const ENEMIES: EnemyDef[] = [
  { id: 'coyote', name: 'Coyote', hp: 0.47, speed: 3.9, dmg: 4, r: 0.4, xp: 1, mass: 1, behaviour: 'swarm', mesh: 'coyote', scale: 1 },
  { id: 'bandit', name: 'Bandit', hp: 1.05, speed: 2.9, dmg: 6, r: 0.55, xp: 2, mass: 1.5, behaviour: 'chase', mesh: 'bandit', scale: 1.25 },
  { id: 'gunman', name: 'Bandit Gunman', hp: 1.26, speed: 2.7, dmg: 6, r: 0.55, xp: 3, mass: 1.5, behaviour: 'ranged', mesh: 'gunman', scale: 1.25 },
  { id: 'rattlesnake', name: 'Rattlesnake', hp: 0.95, speed: 2.4, dmg: 9, r: 0.4, xp: 3, mass: 1, behaviour: 'charge', mesh: 'snake', scale: 1 },
  { id: 'vulture', name: 'Vulture', hp: 0.74, speed: 3.6, dmg: 5, r: 0.45, xp: 2, mass: 0.8, behaviour: 'fly', mesh: 'vulture', scale: 1 },
  { id: 'tumbleweed', name: 'Tumbleweed', hp: 1.37, speed: 3.2, dmg: 5, r: 0.5, xp: 2, mass: 0.7, behaviour: 'split', mesh: 'tumbleweed', scale: 1 },
  { id: 'mule', name: 'Pack Mule', hp: 7.37, speed: 1.9, dmg: 12, r: 0.8, xp: 12, mass: 6, behaviour: 'tank', mesh: 'mule', scale: 1, gold: 6 },
  // elites
  { id: 'golem', name: 'Tumbleweed Golem', hp: 47.37, speed: 1.8, dmg: 12, r: 1.75, xp: 60, mass: 30, behaviour: 'tank', mesh: 'golem', scale: 1.25, elite: true, gold: 15 },
  { id: 'dust_devil', name: 'Dust Devil', hp: 36.84, speed: 3.0, dmg: 10, r: 1.1, xp: 60, mass: 30, behaviour: 'devil', mesh: 'devil', scale: 1, elite: true, gold: 15 },
  // boss
  { id: 'dusty_dan', name: '"DUSTY" DAN MCGRAW', hp: 315.79, speed: 2.3, dmg: 18, r: 1.5, xp: 300, mass: 200, behaviour: 'boss', mesh: 'dan', scale: 1.25, boss: true, gold: 80 },
  // the reaper equivalent
  { id: 'posse', name: "Iron Eye's Posse", hp: 1e9, speed: 7.5, dmg: 999, r: 0.9, xp: 0, mass: 1e6, behaviour: 'posse', mesh: 'rider', scale: 1 },
];

export const enemyIndex: Record<string, number> = {};
ENEMIES.forEach((e, i) => (enemyIndex[e.id] = i));
