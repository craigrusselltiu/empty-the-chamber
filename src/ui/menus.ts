import { CHARACTERS } from '../data/characters';
import { UPGRADES, upgradeCost } from '../data/meta';
import { TRAITS, artifactById } from '../data/artifacts';
import { save, store, rank } from '../save';
import type { Run } from '../game/run';
import type { Offer } from '../game/levelup';
import { sfx, setMuted } from '../audio';

const ui = document.getElementById('ui')!;
let navSel = 0;

function el(html: string) {
  ui.innerHTML = html;
  navSel = 0;
  const first = ui.querySelector<HTMLElement>('.nav.sel') ?? ui.querySelector<HTMLElement>('.nav');
  if (first) {
    first.classList.add('sel');
    navSel = navItems().indexOf(first);
  }
  return ui;
}

function navItems() {
  return Array.from(ui.querySelectorAll<HTMLElement>('.nav')).filter((b) => !(b as HTMLButtonElement).disabled);
}

function on(sel: string, fn: (e: HTMLElement) => void) {
  ui.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
}

export function clearUi() {
  ui.innerHTML = '';
}

// Keyboard / gamepad navigation over `.nav` elements. Returns true if a key was consumed.
export function menuKey(code: string) {
  const items = navItems();
  if (!items.length) return false;
  const digit = code.startsWith('Digit') ? parseInt(code.slice(5)) : NaN;
  const cards = items.filter((b) => b.classList.contains('card'));
  if (!isNaN(digit) && cards[digit - 1]) {
    cards[digit - 1].click();
    return true;
  }
  let d = 0;
  if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') d = 1;
  if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') d = -1;
  if (d) {
    items[navSel]?.classList.remove('sel');
    navSel = (navSel + d + items.length) % items.length;
    items[navSel].classList.add('sel');
    return true;
  }
  if (code === 'Enter' || code === 'Space' || code === 'PadA') {
    items[navSel]?.click();
    return true;
  }
  return false;
}

function portrait(id: string) {
  const base = `${import.meta.env.BASE_URL}sprites/${id}/idle.png`;
  // idle sheet, row 6 (facing the camera), frame 0, at 1.5x
  return `<div class="portrait" style="background-image:url(${base});background-position:0 -576px;background-size:2304px 768px"></div>`;
}

export function titleScreen(onPlay: () => void, onShop: () => void) {
  el(`<div class="screen clear">
    <div class="title">EMPTY<br>THE CHAMBER</div>
    <div class="sub">Survive the Dusty Trail from dusk till midnight.</div>
    <div class="row">
      <button class="nav sel" id="play">RIDE OUT</button>
      <button class="nav" id="shop">GENERAL STORE</button>
      <button class="nav" id="mute">${save.mute ? 'SOUND: OFF' : 'SOUND: ON'}</button>
    </div>
    <div class="small">WASD / ARROWS / STICK TO MOVE - WEAPONS FIRE THEMSELVES - SPACE FOR YOUR ULTIMATE - ESC TO PAUSE</div>
    <div class="small gold">BANKED GOLD: ${save.gold}</div>
  </div>`);
  on('#play', onPlay);
  on('#shop', onShop);
  on('#mute', (b) => {
    save.mute = !save.mute;
    setMuted(save.mute);
    store(save);
    b.textContent = save.mute ? 'SOUND: OFF' : 'SOUND: ON';
  });
}

export function selectScreen(onPick: (id: string) => void, onBack: () => void) {
  const cards = CHARACTERS.map((c) => {
    const unlocked = c.playable && save.unlocked.includes(c.id);
    if (unlocked)
      return `<div class="card nav" data-id="${c.id}">
        ${portrait(c.id)}
        <div class="name">${c.name}</div>
        <div class="kind">${c.title}</div>
        <div class="desc">${c.passive}</div>
        <div class="desc">${c.desc}</div>
        <div class="flavor">${c.quote}</div>
      </div>`;
    return `<div class="card locked">
      <div class="portrait locked">?</div>
      <div class="name">${c.playable ? c.name : '???'}</div>
      <div class="kind">${c.title}</div>
      <div class="desc">LOCKED: ${c.unlock}</div>
      ${c.playable ? '' : '<div class="flavor">Coming soon to the Frontier.</div>'}
    </div>`;
  }).join('');
  el(`<div class="screen">
    <div class="title" style="font-size:2em">CHOOSE YOUR OUTLAW</div>
    <div class="row chars">${cards}</div>
    <button class="nav" id="back">BACK</button>
  </div>`);
  on('.card.nav', (b) => onPick(b.dataset.id!));
  on('#back', onBack);
}

export function shopScreen(onBack: () => void) {
  const render = () => {
    const items = UPGRADES.map((u) => {
      const r = rank(u.id);
      const max = r >= u.max;
      const cost = upgradeCost(u, r);
      const pips = Array.from({ length: u.max }, (_, i) => (i < r ? '#' : '-')).join('');
      return `<button class="nav" data-id="${u.id}" ${max || save.gold < cost ? 'disabled' : ''}>
        ${u.name} [${pips}]<br><span class="small">${u.desc}</span><br><span class="gold">${max ? 'MAXED' : `$${cost}`}</span>
      </button>`;
    }).join('');
    el(`<div class="screen">
      <div class="title" style="font-size:2em">GENERAL STORE</div>
      <div class="gold">GOLD: ${save.gold}</div>
      <div class="shop">${items}</div>
      <button class="nav" id="back">BACK</button>
    </div>`);
    on('.shop button', (b) => {
      const u = UPGRADES.find((x) => x.id === b.dataset.id)!;
      const r = rank(u.id);
      const cost = upgradeCost(u, r);
      if (r >= u.max || save.gold < cost) return;
      save.gold -= cost;
      save.upgrades[u.id] = r + 1;
      store(save);
      sfx.coin();
      render();
    });
    on('#back', onBack);
  };
  render();
}

function offerCard(o: Offer, i: number) {
  if (o.wild)
    return `<div class="card nav wild" data-i="${i}">
      <div class="kind">HOUSE EDGE</div>
      <div class="name">WILD CARD</div>
      <div class="desc">A face-down pick from the deck. Whatever it is, you get it twice.</div>
      <div class="flavor">"Never bet against the house."</div>
    </div>`;
  const evo = o.kind === 'weapon' && o.level === 5;
  return `<div class="card nav ${evo ? 'evo' : ''}" data-i="${i}">
    <div class="kind">${i + 1}. ${o.kind.toUpperCase()}${o.level === 1 ? ' - NEW' : ''}</div>
    <div class="name">${o.name}</div>
    ${o.level > 0 ? `<div class="lvl">LEVEL ${o.level}</div>` : ''}
    <div class="desc">${o.desc}</div>
    ${o.evoHint ? `<div class="small">${o.evoHint}</div>` : ''}
    <div class="flavor">${o.flavor}</div>
    ${o.tags.length ? `<div class="tags">${o.tags.join(' / ')}</div>` : ''}
  </div>`;
}

export function levelUpScreen(run: Run, offers: Offer[], h: { pick: (o: Offer) => void; reroll: () => void; skip: () => void; banish: (o: Offer) => void }) {
  let banishing = false;
  el(`<div class="screen">
    <div class="title" style="font-size:2em">LEVEL ${run.level}</div>
    <div class="row">${offers.map(offerCard).join('')}</div>
    <div class="row">
      <button class="nav" id="reroll" ${run.rerolls ? '' : 'disabled'}>REROLL (${run.rerolls})</button>
      <button class="nav" id="skip" ${run.skips ? '' : 'disabled'}>SKIP (${run.skips})</button>
      <button class="nav" id="banish" ${run.banishes ? '' : 'disabled'}>BANISH (${run.banishes})</button>
    </div>
    <div class="small" id="hint">PICK ONE - KEYS 1-${offers.length}</div>
  </div>`);
  on('.card.nav', (b) => {
    const o = offers[+b.dataset.i!];
    if (banishing && !o.wild && o.kind !== 'heal' && o.kind !== 'gold') h.banish(o);
    else h.pick(o);
  });
  on('#reroll', h.reroll);
  on('#skip', h.skip);
  on('#banish', (b) => {
    banishing = !banishing;
    b.classList.toggle('sel', banishing);
    document.getElementById('hint')!.textContent = banishing ? 'CHOOSE A CARD TO BANISH FOR THIS RUN' : `PICK ONE - KEYS 1-${offers.length}`;
  });
}

export function chestScreen(lines: string[], onDone: () => void) {
  el(`<div class="screen">
    <div class="title" style="font-size:2em">STRONGBOX</div>
    <div class="stats">${lines.map((l) => `<div>${l}</div>`).join('')}</div>
    <button class="nav sel" id="ok">TAKE IT</button>
  </div>`);
  on('#ok', onDone);
}

function buildSummary(run: Run) {
  const weapons = run.weapons.map((w) => `${w.evolved ? w.def.evoName : w.def.name} LV${w.level}`).join(', ');
  const arts = [...run.artifacts].map(([id, lv]) => `${artifactById(id).name} LV${lv}`).join(', ');
  const traits = TRAITS.filter((t) => run.trait(t.id) > 0)
    .map((t) => {
      const n = run.trait(t.id);
      const on = t.breaks.filter((b) => n >= b.n).map((b) => b.desc);
      return `${t.id} ${n}${on.length ? ': ' + on.join('; ') : ` (next at ${t.breaks[0].n})`}`;
    })
    .join('<br>');
  return `<div class="stats small" style="max-width:40em">WEAPONS: ${weapons}<br>ARTIFACTS: ${arts}<br><br>${traits || 'NO TRAITS YET'}</div>`;
}

export function pauseScreen(run: Run, onResume: () => void, onQuit: () => void) {
  el(`<div class="screen">
    <div class="title" style="font-size:2em">PAUSED</div>
    ${buildSummary(run)}
    <div class="row">
      <button class="nav sel" id="resume">RESUME</button>
      <button class="nav" id="quit">GIVE UP</button>
    </div>
  </div>`);
  on('#resume', onResume);
  on('#quit', onQuit);
}

export function resultsScreen(run: Run, earned: number, unlocks: string[], onDone: () => void) {
  const m = Math.floor(run.time / 60);
  const s = Math.floor(run.time % 60).toString().padStart(2, '0');
  el(`<div class="screen">
    <div class="title" style="font-size:2.2em">${run.survived ? 'SURVIVED' : 'SIX FEET UNDER'}</div>
    <div class="stats">
      TIME ${m}:${s} - LEVEL ${run.level} - ${run.kills} KILLS<br>
      <span class="gold">+${earned} GOLD BANKED${run.survived ? ' (INCLUDES SURVIVAL BONUS)' : ''}</span><br>
      ${unlocks.map((u) => `<span style="color:#9ad0c0">${u}</span>`).join('<br>')}
    </div>
    ${buildSummary(run)}
    <div class="small">SEED ${run.seed}</div>
    <button class="nav sel" id="ok">BACK TO TOWN</button>
  </div>`);
  on('#ok', onDone);
}
