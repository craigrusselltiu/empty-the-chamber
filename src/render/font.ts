// 5x7 bitmap font drawn with a 1px black outline. Atlases are cached per colour.
const GLYPHS: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '%': '11000 11001 00010 00100 01000 10011 00011',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  $: '00100 01111 10100 01110 00101 11110 00100',
  '"': '01010 01010 00000 00000 00000 00000 00000',
  '♥': '01010 11111 11111 11111 01110 00100 00000',
  '♦': '00100 01110 11111 11111 01110 00100 00000',
  '♣': '01110 01110 11111 11111 00100 01110 00000',
  '♠': '00100 01110 11111 11111 00100 01110 00000',
};
const ORDER = Object.keys(GLYPHS);
const INDEX: Record<string, number> = {};
ORDER.forEach((k, i) => (INDEX[k] = i));
const CW = 7; // cell incl. outline
const CH = 9;
const STRIDE = CW + 1; // transparent gap between cells so scaled glyphs never pick up a neighbour's outline

const atlases = new Map<string, HTMLCanvasElement>();

function atlas(color: string) {
  let a = atlases.get(color);
  if (a) return a;
  a = document.createElement('canvas');
  a.width = ORDER.length * STRIDE;
  a.height = CH;
  const g = a.getContext('2d')!;
  for (let pass = 0; pass < 2; pass++) {
    g.fillStyle = pass === 0 ? '#120a08' : color;
    ORDER.forEach((k, i) => {
      const rows = GLYPHS[k].split(' ');
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++) {
          if (rows[y][x] !== '1') continue;
          if (pass === 0) g.fillRect(i * STRIDE + x, y, 3, 3);
          else g.fillRect(i * STRIDE + x + 1, y + 1, 1, 1);
        }
    });
  }
  atlases.set(color, a);
  return a;
}

export function textWidth(s: string, scale = 1) {
  return s.length * 6 * scale;
}

export function drawText(g: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#fff', scale = 1, align: 'left' | 'center' | 'right' = 'left') {
  const a = atlas(color);
  if (align === 'center') x -= textWidth(s, scale) / 2;
  else if (align === 'right') x -= textWidth(s, scale);
  x = Math.round(x);
  y = Math.round(y);
  // Scales are whole or half numbers; the HUD canvas is 2x, so both land on whole canvas pixels.
  for (let i = 0; i < s.length; i++) {
    const ch = s[i].toUpperCase();
    const idx = INDEX[ch];
    if (idx !== undefined) g.drawImage(a, idx * STRIDE, 0, CW, CH, x + i * 6 * scale - scale, y - scale, CW * scale, CH * scale);
  }
}
