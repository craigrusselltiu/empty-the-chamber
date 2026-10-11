const KEY = 'etc-save-v1';

export interface Save {
  gold: number;
  upgrades: Record<string, number>;
  unlocked: string[];
  stats: { runs: number; kills: number; bestTime: number; totalGold: number; wins: number };
  mute: boolean;
}

function fresh(): Save {
  return { gold: 0, upgrades: {}, unlocked: ['rust'], stats: { runs: 0, kills: 0, bestTime: 0, totalGold: 0, wins: 0 }, mute: false };
}

export function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    // storage blocked or corrupt; start fresh
  }
  return fresh();
}

export function store(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export const save = load();
export const rank = (id: string) => save.upgrades[id] ?? 0;
