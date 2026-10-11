// Keyboard, gamepad and touch joystick. Movement is in screen space: x right, y up.
export const input = {
  mx: 0,
  my: 0,
  ult: false, // edge-triggered, cleared by consumer
  pause: false, // edge-triggered
  touchActive: false,
  touchOrigin: { x: 0, y: 0 },
  touchPos: { x: 0, y: 0 },
  keys: new Set<string>(),
  pressed: [] as string[], // key presses this frame for menus
};

const ULT_KEYS = new Set(['Space']);
const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

let touchId: number | null = null;
let padUltWas = false;
let padPauseWas = false;
const padDirWas = [false, false, false, false];
const PAD_DIR = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function initInput(el: HTMLElement) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.push(e.code);
    if (ULT_KEYS.has(e.code)) input.ult = true;
    if (PAUSE_KEYS.has(e.code)) input.pause = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());

  const inMenu = (e: TouchEvent) => !!(e.target as HTMLElement).closest('#ui .screen');
  el.addEventListener('touchstart', (e) => {
    if (inMenu(e)) return;
    for (const t of Array.from(e.changedTouches)) {
      if (touchId === null && t.clientX < innerWidth * 0.6) {
        touchId = t.identifier;
        input.touchActive = true;
        input.touchOrigin.x = input.touchPos.x = t.clientX;
        input.touchOrigin.y = input.touchPos.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (inMenu(e)) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touchId) {
        input.touchPos.x = t.clientX;
        input.touchPos.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touchId) {
        touchId = null;
        input.touchActive = false;
      }
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

export function pollInput() {
  const k = input.keys;
  let x = 0;
  let y = 0;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    if (Math.hypot(ax, ay) > 0.2) {
      x += ax;
      y -= ay;
    }
    for (let b = 0; b < 4; b++) {
      const on = !!p.buttons[12 + b]?.pressed;
      if (on && !padDirWas[b]) input.pressed.push(PAD_DIR[b]);
      padDirWas[b] = on;
    }
    if (p.buttons[14]?.pressed) x -= 1;
    if (p.buttons[15]?.pressed) x += 1;
    if (p.buttons[12]?.pressed) y += 1;
    if (p.buttons[13]?.pressed) y -= 1;
    const u = !!(p.buttons[0]?.pressed || p.buttons[7]?.pressed);
    if (u && !padUltWas) {
      input.ult = true;
      input.pressed.push('PadA');
    }
    padUltWas = u;
    const pz = !!p.buttons[9]?.pressed;
    if (pz && !padPauseWas) input.pause = true;
    padPauseWas = pz;
    break;
  }

  if (input.touchActive) {
    const dx = input.touchPos.x - input.touchOrigin.x;
    const dy = input.touchPos.y - input.touchOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > 6) {
      const m = Math.min(1, d / 50);
      x += (dx / d) * m;
      y -= (dy / d) * m;
    }
  }

  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  input.mx = x;
  input.my = y;
}
