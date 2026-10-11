import type { Run } from './run';
import { WEAPONS, weaponById, MAX_WEAPON_LEVEL } from '../data/weapons';
import { ARTIFACTS, artifactById, MAX_ARTIFACT_LEVEL } from '../data/artifacts';

export interface Offer {
  kind: 'weapon' | 'artifact' | 'heal' | 'gold';
  id: string;
  level: number; // level after taking it
  name: string;
  desc: string;
  flavor: string;
  tags: string[];
  evoHint: string;
  wild?: boolean;
}

const MAX_WEAPONS = 4;
const MAX_ARTIFACTS = 6;

function weaponOffer(run: Run, id: string): Offer {
  const d = weaponById(id);
  const owned = run.weapons.find((w) => w.def.id === id);
  const level = owned ? owned.level + 1 : 1;
  return {
    kind: 'weapon',
    id,
    level,
    name: d.name,
    desc: level === 1 ? d.desc : d.levels[level - 2],
    flavor: d.flavor,
    tags: [],
    evoHint: `Evolves with ${artifactById(d.evolveWith).name}`,
  };
}

function artifactOffer(run: Run, id: string): Offer {
  const a = artifactById(id);
  const level = run.art(id) + 1;
  const evo = WEAPONS.find((w) => w.evolveWith === id);
  return { kind: 'artifact', id, level, name: a.name, desc: a.desc, flavor: a.flavor, tags: a.tags, evoHint: evo ? `Evolves ${evo.name}` : '' };
}

function pool(run: Run) {
  const out: { o: Offer; w: number }[] = [];
  for (const w of run.weapons) if (w.level < MAX_WEAPON_LEVEL) out.push({ o: weaponOffer(run, w.def.id), w: 1.2 });
  if (run.weapons.length < MAX_WEAPONS)
    for (const d of WEAPONS)
      if (!d.starter && !run.banished.has(d.id) && !run.weapons.some((w) => w.def.id === d.id)) out.push({ o: weaponOffer(run, d.id), w: 0.9 });
  for (const [id, lv] of run.artifacts) if (lv < MAX_ARTIFACT_LEVEL && !run.banished.has(id)) out.push({ o: artifactOffer(run, id), w: 1 });
  if (run.artifacts.size < MAX_ARTIFACTS)
    for (const a of ARTIFACTS) {
      if (a.starter || run.banished.has(a.id) || run.artifacts.has(a.id)) continue;
      // nudge toward evolution partners of weapons you hold
      const partner = run.weapons.some((w) => w.def.evolveWith === a.id);
      out.push({ o: artifactOffer(run, a.id), w: partner ? 1.4 : 0.7 });
    }
  return out;
}

export function makeOffers(run: Run): Offer[] {
  const p = pool(run);
  const n = run.rng.chance(0.1 + run.stats.luck) ? 4 : 3;
  const res: Offer[] = [];
  while (res.length < n && p.length) {
    let total = 0;
    for (const x of p) total += x.w;
    let r = run.rng.next() * total;
    let k = 0;
    for (; k < p.length - 1; k++) {
      r -= p[k].w;
      if (r <= 0) break;
    }
    res.push(p[k].o);
    p.splice(k, 1);
  }
  if (!res.length) {
    res.push({ kind: 'heal', id: 'whiskey', level: 0, name: 'Whiskey', desc: 'Heal 30 HP.', flavor: '"Dutch courage in a glass."', tags: [], evoHint: '' });
    res.push({ kind: 'gold', id: 'pouch', level: 0, name: 'Gold Pouch', desc: '+25 gold.', flavor: '"Smiles and profits."', tags: [], evoHint: '' });
  }
  // Reno's House Edge: a face-down Wild Card applied twice
  if (run.ch.id === 'reno') {
    const all = pool(run).filter((x) => x.o.kind !== 'weapon' || x.o.level < MAX_WEAPON_LEVEL);
    if (all.length) res.push({ ...run.rng.pick(all).o, wild: true });
  }
  return res;
}

export function applyOffer(run: Run, o: Offer) {
  const times = o.wild ? 2 : 1;
  for (let t = 0; t < times; t++) {
    if (o.kind === 'weapon') {
      const w = run.weapons.find((x) => x.def.id === o.id);
      if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
      else run.addWeapon(o.id);
    } else if (o.kind === 'artifact') {
      run.artifacts.set(o.id, Math.min(MAX_ARTIFACT_LEVEL, run.art(o.id) + 1));
      run.recompute();
    } else if (o.kind === 'heal') {
      run.hp = Math.min(run.stats.maxHp, run.hp + 30);
    } else {
      run.gold += 25;
    }
  }
}
