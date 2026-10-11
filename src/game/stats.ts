import { CharDef } from '../data/characters';
import { artifactById } from '../data/artifacts';
import { rank } from '../save';

export interface Stats {
  maxHp: number;
  regen: number;
  armor: number;
  speed: number;
  magnet: number;
  dmg: number;
  crit: number;
  critMul: number;
  area: number;
  projSpeed: number;
  range: number;
  cdMul: number;
  reloadMul: number;
  fireRate: number;
  chamberAdd: number;
  pierceAdd: number;
  projAdd: number;
  gold: number;
  luck: number;
  ultPerKill: number;
  poisonDps: number;
  traits: Record<string, number>;
}

export function computeStats(ch: CharDef, arts: Map<string, number>, bonusHp: number): Stats {
  const lv = (id: string) => arts.get(id) ?? 0;
  const traits: Record<string, number> = {};
  for (const id of arts.keys()) for (const t of artifactById(id).tags) traits[t] = (traits[t] ?? 0) + 1;
  const tr = (t: string) => traits[t] ?? 0;

  const s: Stats = {
    maxHp: ch.hp + rank('grit') * 10 + lv('deputy_badge') * 20 + bonusHp,
    regen: lv('bamboo_canteen') * 0.25 + (tr('Saloon Keeper') >= 2 ? 0.5 : 0),
    armor: lv('duster') + (tr('Sheriff') >= 2 ? 2 : 0),
    speed: ch.speed * (1 + rank('fleet') * 0.05 + lv('outlaws_spurs') * 0.1 + (tr('Mustang') >= 2 ? 0.1 : 0)),
    magnet: 2.2 * (1 + rank('longarm') * 0.1 + lv('saddlebag') * 0.3 + (tr('Mustang') >= 2 ? 0.2 : 0)),
    dmg: 1 + rank('steady') * 0.05 + lv('scope_lens') * 0.1,
    crit: 0.03 + lv('lucky_bullet') * 0.08 + (tr('Gunslinger') >= 4 ? 0.15 : 0) + (tr('Desperado') >= 2 ? 0.1 : 0),
    critMul: tr('Desperado') >= 2 ? 2.5 : 2,
    area: 1 + lv('black_powder') * 0.15 + (tr('Sapper') >= 2 ? 0.2 : 0),
    projSpeed: 1 + lv('scope_lens') * 0.15,
    range: 1 + lv('scope_lens') * 0.15,
    cdMul: 1 - lv('tinkers_wrench') * 0.08,
    reloadMul: (1 - rank('quickdraw') * 0.05) * (1 - lv('pocket_watch') * 0.12),
    fireRate: 1 + lv('twin_revolvers') * 0.1,
    chamberAdd: lv('twin_revolvers') + (tr('Gunslinger') >= 2 ? 1 : 0),
    pierceAdd: tr('Sniper') >= 2 ? 1 : 0,
    projAdd: tr('Outlaw') >= 4 ? 1 : 0,
    gold: 1 + rank('greed') * 0.1 + lv('gold_tooth') * 0.2 + (tr('Prospector') >= 2 ? 0.25 : 0),
    luck: lv('loaded_dice') * 0.1,
    ultPerKill: lv('gravedigger'),
    poisonDps: lv('fang_necklace') * 0.1,
    traits,
  };
  return s;
}
