// Permanent upgrades bought with banked gold.
export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  base: number; // cost of rank 1
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'grit', name: 'Grit', desc: '+10 max HP', max: 5, base: 60 },
  { id: 'steady', name: 'Steady Hand', desc: '+5% damage', max: 5, base: 80 },
  { id: 'quickdraw', name: 'Quick Draw', desc: '-5% reload time', max: 5, base: 80 },
  { id: 'fleet', name: 'Fleet Foot', desc: '+5% move speed', max: 5, base: 60 },
  { id: 'longarm', name: 'Long Arm', desc: '+10% pickup radius', max: 5, base: 50 },
  { id: 'greed', name: 'Greed', desc: '+10% gold', max: 5, base: 70 },
  { id: 'fortune', name: 'Fortune', desc: '+1 reroll per run', max: 5, base: 90 },
  { id: 'slate', name: 'Clean Slate', desc: '+1 banish per run', max: 5, base: 90 },
  { id: 'second_wind', name: 'Second Wind', desc: 'Revive once at 50% HP', max: 1, base: 600 },
];

export const upgradeCost = (u: UpgradeDef, rank: number) => Math.round(u.base * Math.pow(rank + 1, 1.5));

export const RENO_GOLD = 500;
export const SURVIVE_BONUS = 100;
