// Weapon stats per level (index 0 = level 1). Behaviour lives in src/game/weapons.ts, keyed by id.
export interface WeaponDef {
  id: string;
  name: string;
  desc: string;
  flavor: string;
  chamber: number; // 0 = no chamber, fires on cooldown
  reload: number; // seconds (chambered weapons)
  interval: number; // seconds between shots / casts
  dmg: number[];
  count: number[];
  pierce: number[];
  area: number[];
  speed: number; // projectile speed
  range: number; // targeting range
  levels: string[]; // descriptions for levels 2..5
  evolveWith: string;
  evoName: string;
  evoDesc: string;
  starter?: boolean; // only offered as a character's starting weapon
}

export const MAX_WEAPON_LEVEL = 5;

export const WEAPONS: WeaponDef[] = [
  {
    id: 'six_shooter',
    name: 'Six-Shooter',
    desc: 'Fires at the nearest enemy. Six in the chamber, then reload.',
    flavor: '"Six in the chamber. No reloads."',
    chamber: 6,
    reload: 1.1,
    interval: 0.22,
    dmg: [12, 15, 15, 18, 22],
    count: [1, 1, 2, 2, 3],
    pierce: [0, 0, 0, 1, 1],
    area: [1, 1, 1, 1, 1],
    speed: 30,
    range: 12,
    levels: ['+3 damage', 'Fires 2 bullets', '+1 pierce, +3 damage', 'Fires 3 bullets, +4 damage'],
    evolveWith: 'kill_confirmed',
    evoName: 'Peacemaker',
    evoDesc: 'Every shot is a Final Shot.',
    starter: true,
  },
  {
    id: 'poker_chips',
    name: 'Poker Chips',
    desc: 'Flips a coin per chip: a HIT deals 2.2x and can ricochet, a WHIFF drops gold.',
    flavor: '"What\'s the most you ever lost on a coin toss?"',
    chamber: 5,
    reload: 1.0,
    interval: 0.3,
    dmg: [9, 11, 11, 13, 16],
    count: [1, 1, 2, 2, 3],
    pierce: [0, 0, 0, 0, 0],
    area: [1, 1, 1, 1, 1],
    speed: 20,
    range: 11,
    levels: ['+2 damage', 'Throws 2 chips', '+2 damage, +1 ricochet', 'Throws 3 chips, +3 damage'],
    evolveWith: 'loaded_dice',
    evoName: 'House Always Wins',
    evoDesc: '80% hit chance. Whiffs explode.',
    starter: true,
  },
  {
    id: 'scattergun',
    name: 'Scattergun',
    desc: 'Two shells of buckshot in a wide cone. Short range, big punch.',
    flavor: '"And stay out."',
    chamber: 2,
    reload: 1.6,
    interval: 0.45,
    dmg: [7, 8, 9, 10, 12],
    count: [5, 6, 7, 8, 9],
    pierce: [0, 0, 1, 1, 1],
    area: [1, 1, 1, 1.15, 1.3],
    speed: 22,
    range: 7,
    levels: ['+1 pellet, +1 damage', '+1 pellet, +1 pierce', '+1 pellet, wider spread', '+1 pellet, +2 damage'],
    evolveWith: 'black_powder',
    evoName: "Dragon's Breath",
    evoDesc: 'Pellets set the ground on fire.',
  },
  {
    id: 'buffalo_rifle',
    name: 'Buffalo Rifle',
    desc: 'One round in the chamber, so every shot is a Final Shot. Hits the toughest enemy in range.',
    flavor: '"Sniper? I barely know her!"',
    chamber: 1,
    reload: 1.8,
    interval: 0.1,
    dmg: [26, 32, 38, 46, 58],
    count: [1, 1, 1, 1, 1],
    pierce: [2, 3, 3, 4, 5],
    area: [1, 1, 1, 1, 1],
    speed: 45,
    range: 16,
    levels: ['+6 damage, +1 pierce', '+6 damage, -15% reload', '+8 damage, +1 pierce', '+12 damage, +1 pierce'],
    evolveWith: 'scope_lens',
    evoName: 'Heliograph Lance',
    evoDesc: 'A beam of sunlight that pierces everything in a line.',
  },
  {
    id: 'dynamite',
    name: 'Dynamite',
    desc: 'Lobs a lit stick at a nearby enemy. Area blast.',
    flavor: '"Fire in the hole."',
    chamber: 0,
    reload: 0,
    interval: 2.4,
    dmg: [24, 30, 30, 38, 46],
    count: [1, 1, 2, 2, 3],
    pierce: [0, 0, 0, 0, 0],
    area: [2.2, 2.4, 2.4, 2.8, 3.0],
    speed: 9,
    range: 9,
    levels: ['+6 damage, bigger blast', 'Throws 2 sticks', '+8 damage, bigger blast', 'Throws 3 sticks, +8 damage'],
    evolveWith: 'tinkers_wrench',
    evoName: 'Powder Keg',
    evoDesc: 'Every blast scatters three more.',
  },
  {
    id: 'bowie_knives',
    name: 'Bowie Knives',
    desc: 'Throws knives the way you are facing.',
    flavor: '"That\'s not a knife."',
    chamber: 0,
    reload: 0,
    interval: 1.0,
    dmg: [9, 9, 11, 11, 14],
    count: [1, 2, 2, 3, 4],
    pierce: [1, 1, 2, 2, 2],
    area: [1, 1, 1, 1, 1],
    speed: 24,
    range: 10,
    levels: ['+1 knife', '+2 damage, +1 pierce', '+1 knife', '+1 knife, +3 damage'],
    evolveWith: 'fang_necklace',
    evoName: 'Sidewinder Fangs',
    evoDesc: 'Knives inject venom that spreads when the victim dies.',
  },
  {
    id: 'lasso',
    name: 'Lasso',
    desc: 'Whirls a lasso around you, hitting and shoving everything it touches.',
    flavor: '"Kick the door in. Ask questions later."',
    chamber: 0,
    reload: 0,
    interval: 2.6,
    dmg: [12, 15, 18, 22, 28],
    count: [1, 1, 1, 1, 1],
    pierce: [0, 0, 0, 0, 0],
    area: [2.6, 2.8, 3.1, 3.4, 3.8],
    speed: 0,
    range: 0,
    levels: ['+3 damage, wider', '+3 damage, wider', '+4 damage, wider', '+6 damage, much wider'],
    evolveWith: 'outlaws_spurs',
    evoName: "Hangman's Noose",
    evoDesc: 'The lasso never stops spinning and drags enemies in.',
  },
];

export const weaponById = (id: string) => WEAPONS.find((w) => w.id === id)!;
