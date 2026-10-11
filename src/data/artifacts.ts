// Passive artifacts with OMITC trait tags. Effects are applied in src/game/stats.ts and by id checks in the run.
export interface ArtifactDef {
  id: string;
  name: string;
  tags: string[];
  desc: string; // per level
  flavor: string;
  starter?: boolean; // only from a character's kit
}

export const MAX_ARTIFACT_LEVEL = 3;

export const ARTIFACTS: ArtifactDef[] = [
  { id: 'bamboo_canteen', name: 'Bamboo Canteen', tags: ['Saloon Keeper'], desc: '+0.25 HP regen per second per level.', flavor: '"Bamboo doesn\'t rust."' },
  { id: 'rigged_deck', name: 'Rigged Deck', tags: ['Prospector'], desc: 'Chips may ricochet (+25% chance per level).', flavor: '"Bad luck is still luck."', starter: true },
  { id: 'deputy_badge', name: 'Rusty Deputy Badge', tags: ['Sheriff'], desc: '+20 max HP per level.', flavor: '"Tarnished but still standing."' },
  { id: 'duster', name: 'Reinforced Duster', tags: ['Sheriff'], desc: '+1 armour per level.', flavor: '"Lined with steel plates."' },
  { id: 'outlaws_spurs', name: "Outlaw's Spurs", tags: ['Outlaw', 'Mustang'], desc: '+10% move speed per level.', flavor: '"Kick the door in. Ask questions later."' },
  { id: 'saddlebag', name: 'Saddlebag', tags: ['Mustang'], desc: '+30% pickup radius per level.', flavor: '"Room for two more."' },
  { id: 'lucky_bullet', name: 'Lucky Bullet', tags: ['Gunslinger', 'Sniper'], desc: '+8% crit chance per level. Crits deal 2x.', flavor: '"One lucky round. Make it count."' },
  { id: 'gold_tooth', name: 'Gold Tooth', tags: ['Prospector'], desc: '+20% gold per level.', flavor: '"Smiles and profits."' },
  { id: 'scope_lens', name: 'Scope Lens', tags: ['Sniper'], desc: '+15% projectile speed and range, +10% damage per level.', flavor: '"See it before it sees you."' },
  { id: 'black_powder', name: 'Black Powder Cache', tags: ['Sapper'], desc: '+15% area per level.', flavor: '"Surplus inventory."' },
  { id: 'loaded_dice', name: 'Loaded Dice', tags: ['Desperado', 'Prospector'], desc: '+10% luck per level: better offers and more gold.', flavor: '"Snake eyes? Never heard of her."' },
  { id: 'fang_necklace', name: 'Rattlesnake Fang Necklace', tags: ['Outlaw'], desc: 'Hits poison enemies; more poison per level.', flavor: '"Trophy from the first one that bit you."' },
  { id: 'tinkers_wrench', name: "Tinker's Wrench", tags: ['Sapper'], desc: '-8% cooldown on weapons without a chamber per level.', flavor: '"Every match is an explosion waiting to happen."' },
  { id: 'gravedigger', name: "Gravedigger's Shovel", tags: ['Undertaker', 'Dead Man Walking'], desc: '+1 ultimate charge per kill per level.', flavor: '"Business is booming."' },
  // empty the chamber
  { id: 'last_call', name: 'Last Call Bell', tags: ['Saloon Keeper'], desc: 'Final Shots ring a shockwave around you. Bigger per level.', flavor: '"Last call. Everybody out."' },
  { id: 'dead_mans_hand', name: "Dead Man's Hand", tags: ['Gunslinger', 'Dead Man Walking'], desc: 'Final Shots always crit and make the target Vulnerable (+50% damage taken) for 1.5s per level.', flavor: '"Aces and eights. Bad luck for them."' },
  { id: 'silver_bullet', name: 'Silver Bullet', tags: ['Gunslinger', 'Sheriff'], desc: 'Final Shots deal +100% damage per level to elites and bosses.', flavor: '"Saved for the big one."' },
  { id: 'heliograph', name: 'Heliograph Shard', tags: ['Sniper'], desc: 'Reloading flashes a mirror that stuns nearby enemies. Wider per level.', flavor: '"Catch the light. Blind the fight."' },
  { id: 'detonator', name: 'Detonator', tags: ['Sapper', 'Outlaw'], desc: 'Reloading drops a lit dynamite stick at your feet. More damage per level.', flavor: '"Click."' },
  { id: 'kill_confirmed', name: 'Kill Confirmed', tags: ['Undertaker', 'Desperado'], desc: 'A Final Shot kill instantly reloads that weapon (33% chance per level).', flavor: '"Another one for the ledger."' },
  { id: 'pocket_watch', name: "Death's Pocket Watch", tags: ['Dead Man Walking'], desc: '-12% reload time per level.', flavor: '"Time\'s up. Always was."' },
  { id: 'twin_revolvers', name: 'Twin Revolvers', tags: ['Outlaw', 'Gunslinger'], desc: '+1 chamber size and +10% fire rate per level.', flavor: '"Two guns. Twice the fun."' },
];

export const artifactById = (id: string) => ARTIFACTS.find((a) => a.id === id)!;

export interface TraitDef {
  id: string;
  flavor: string;
  breaks: { n: number; desc: string }[];
}

// Trait level = number of distinct held artifacts carrying the tag.
export const TRAITS: TraitDef[] = [
  { id: 'Sheriff', flavor: 'The law is heavier than it looks.', breaks: [{ n: 2, desc: '+2 armour' }, { n: 3, desc: 'Reflect 50% of contact damage' }] },
  { id: 'Outlaw', flavor: 'Wanted: Alive. Preferably not.', breaks: [{ n: 2, desc: 'Kills give +2% damage for 4s (max 20%)' }, { n: 4, desc: '+1 projectile on all weapons' }] },
  { id: 'Prospector', flavor: "There's gold in them hills.", breaks: [{ n: 2, desc: '+25% gold' }, { n: 3, desc: 'Picking up gold zaps a nearby enemy' }] },
  { id: 'Gunslinger', flavor: 'Fastest hand in the west. And the luckiest.', breaks: [{ n: 2, desc: '+1 chamber size' }, { n: 4, desc: '+15% crit chance' }] },
  { id: 'Sniper', flavor: 'Sniper? I barely know her!', breaks: [{ n: 2, desc: '+1 pierce' }, { n: 3, desc: 'Final Shots execute non-elites' }] },
  { id: 'Dead Man Walking', flavor: "I didn't hear no bell.", breaks: [{ n: 2, desc: '-1 damage taken' }, { n: 3, desc: 'Below 30% HP, deal double damage' }] },
  { id: 'Undertaker', flavor: 'Business is booming.', breaks: [{ n: 2, desc: '+1 max HP per 50 kills (max +50)' }] },
  { id: 'Sapper', flavor: 'Fire in the hole.', breaks: [{ n: 2, desc: '+20% area' }, { n: 3, desc: 'Explosions leave fire' }] },
  { id: 'Mustang', flavor: "Can't fence what won't be fenced.", breaks: [{ n: 2, desc: '+10% speed, +20% pickup radius' }] },
  { id: 'Saloon Keeper', flavor: 'On the house.', breaks: [{ n: 2, desc: 'Jerky heals double, +0.5 HP regen' }] },
  { id: 'Desperado', flavor: 'Go big or go home.', breaks: [{ n: 2, desc: '+10% crit chance, crits deal 2.5x' }] },
];
