export interface CharDef {
  id: string;
  name: string;
  title: string;
  playable: boolean;
  hp: number;
  speed: number;
  weapon: string;
  artifact: string;
  ult: string;
  ultName: string;
  ultCharge: number;
  outline: [number, number, number];
  passive: string;
  desc: string;
  unlock: string; // hint shown while locked; empty = unlocked from the start
  quote: string;
}

export const CHARACTERS: CharDef[] = [
  {
    id: 'rust',
    name: 'Rust',
    title: 'Red Panda Gunslinger',
    playable: true,
    hp: 100,
    speed: 5,
    weapon: 'six_shooter',
    artifact: 'bamboo_canteen',
    ult: 'deadeye',
    ultName: 'DEADEYE',
    ultCharge: 60,
    outline: [1.0, 0.55, 0.2],
    passive: 'Bounty: Six-Shooter hits add Bounty. Enemies at or below 4 HP per stack are executed and pay out gold.',
    desc: 'Ultimate, Deadeye: time crawls, three piercing shots find the toughest targets, and Bounty detonates.',
    unlock: '',
    quote: '"It was one shot. One stupid, lucky, terrible shot."',
  },
  {
    id: 'reno',
    name: '"Slick" Reno',
    title: 'Raccoon Card Sharp',
    playable: true,
    hp: 100,
    speed: 5,
    weapon: 'poker_chips',
    artifact: 'rigged_deck',
    ult: 'shuffle',
    ultName: 'FALSE SHUFFLE',
    ultCharge: 60,
    outline: [0.75, 0.45, 1.0],
    passive: 'House Edge: every level-up shows a face-down Wild Card, a random pick applied twice.',
    desc: 'Ultimate, False Shuffle: deals a five-card hand around him. The better the hand, the bigger the payoff.',
    unlock: 'Hold 500 gold in a single run.',
    quote: '"I don\'t cheat. I just play a different game."',
  },
  {
    id: 'rudy',
    name: 'Rudy',
    title: 'Armadillo Sheriff',
    playable: false,
    hp: 120,
    speed: 4.5,
    weapon: '',
    artifact: '',
    ult: 'hunker',
    ultName: 'HUNKER DOWN',
    ultCharge: 60,
    outline: [1, 1, 1],
    passive: 'Hard Exterior: stacking Armour that carries over.',
    desc: 'Ultimate, Hunker Down: curl into an invulnerable ball, roll through the horde, release a shockwave.',
    unlock: 'Stand your ground: survive 60 seconds in a row without moving.',
    quote: '"I can do this all day."',
  },
  {
    id: 'reap',
    name: 'Reap',
    title: 'Shadow Coyote Outlaw',
    playable: false,
    hp: 100,
    speed: 5.2,
    weapon: '',
    artifact: '',
    ult: 'veil',
    ultName: 'SHADOW VEIL',
    ultCharge: 60,
    outline: [1, 1, 1],
    passive: 'Shadow Step: moving through enemies makes you briefly untouchable.',
    desc: 'Ultimate, Shadow Veil: become smoke that cuts through the horde while your shadow fights alone.',
    unlock: 'Kill 1,000 enemies after nightfall (10:00) in one run.',
    quote: '"The dark doesn\'t hide you. It just gives you teeth."',
  },
  {
    id: 'rita',
    name: 'Rita',
    title: 'Viper Assassin',
    playable: false,
    hp: 90,
    speed: 5.6,
    weapon: '',
    artifact: '',
    ult: 'blade_dance',
    ultName: 'BLADE DANCE',
    ultCharge: 60,
    outline: [1, 1, 1],
    passive: 'Shed Skin: once per run, survive lethal damage and leave a decoy.',
    desc: 'Ultimate, Blade Dance: a zig-zag dash chain where poisoned enemies burst.',
    unlock: 'Evolve Sidewinder Fangs.',
    quote: '"A silent blade tells them nothing."',
  },
  {
    id: 'riff',
    name: 'Riff',
    title: 'Frog Bard',
    playable: false,
    hp: 110,
    speed: 4.8,
    weapon: '',
    artifact: '',
    ult: 'jazz_solo',
    ultName: 'JAZZ SOLO',
    ultCharge: 60,
    outline: [1, 1, 1],
    passive: 'Long Tongue: snatch far-off pickups every few seconds.',
    desc: 'Ultimate, Jazz Solo: glowing staves swirl across the screen. Hit the beat to amplify.',
    unlock: 'Pick up 2,000 brass casings in one run.',
    quote: '"Depends on the tempo."',
  },
];

export const charById = (id: string) => CHARACTERS.find((c) => c.id === id)!;
