// Stage 1 (The Dusty Trail) pacing.
export const RUN_LENGTH = 900; // seconds

// Enemies spawned per second at time t (seconds), before the live cap.
export function spawnRate(t: number) {
  const k = Math.min(1, t / RUN_LENGTH);
  return (1.5 + 30 * Math.pow(k, 1.5)) * (1 + 0.3 * Math.sin(t / 22));
}

// HP multiplier at time t.
export const hpScale = (t: number) => 1 + t / 240 + (t / 420) ** 2;

// Contact and bullet damage multiplier at time t.
export const dmgScale = (t: number) => 1 + t / 900;

// Spawn weights by minute bracket: [fromSeconds, {enemy: weight}]
export const MIX: [number, Record<string, number>][] = [
  [0, { coyote: 6, bandit: 4 }],
  [90, { coyote: 5, bandit: 5, vulture: 2 }],
  [180, { coyote: 4, bandit: 4, vulture: 2, gunman: 2, rattlesnake: 2 }],
  [300, { coyote: 4, bandit: 3, vulture: 2, gunman: 3, rattlesnake: 3, tumbleweed: 3, mule: 0.3 }],
  [480, { coyote: 4, bandit: 3, vulture: 3, gunman: 3, rattlesnake: 3, tumbleweed: 4, mule: 0.5 }],
  [660, { coyote: 5, bandit: 3, vulture: 3, gunman: 4, rattlesnake: 3, tumbleweed: 4, mule: 0.8 }],
];

export type WaveEvent =
  | { t: number; kind: 'rush'; enemy: string; n: number }
  | { t: number; kind: 'elite'; enemy: string }
  | { t: number; kind: 'boss'; enemy: string }
  | { t: number; kind: 'posse' };

export const EVENTS: WaveEvent[] = [
  { t: 120, kind: 'rush', enemy: 'coyote', n: 24 },
  { t: 180, kind: 'elite', enemy: 'golem' },
  { t: 300, kind: 'rush', enemy: 'coyote', n: 40 },
  { t: 360, kind: 'elite', enemy: 'dust_devil' },
  { t: 480, kind: 'rush', enemy: 'tumbleweed', n: 40 },
  { t: 540, kind: 'elite', enemy: 'golem' },
  { t: 600, kind: 'boss', enemy: 'dusty_dan' },
  { t: 720, kind: 'rush', enemy: 'coyote', n: 70 },
  { t: 720, kind: 'elite', enemy: 'dust_devil' },
  { t: 810, kind: 'elite', enemy: 'golem' },
  { t: 810, kind: 'elite', enemy: 'dust_devil' },
  { t: 900, kind: 'posse' },
];

export const MAX_ENEMIES = 600;
