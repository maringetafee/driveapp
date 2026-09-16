// Genera assets/nav-arrow@3x.png: la flecha del coche en modo navegación.
// Uso: node scripts/build-nav-arrow.mjs
import fs from 'node:fs';
import { PNG } from 'pngjs';

const SIZE = 168; // 56 dp a 3x
const SS = 4; // supermuestreo por eje para el antialiasing

// Flecha de navegador: punta arriba y muesca abajo (coordenadas 0..1).
const poly = [
  [0.5, 0.14],
  [0.8, 0.82],
  [0.5, 0.67],
  [0.2, 0.82],
];
const FILL = [255, 122, 41];
const BORDER = [255, 255, 255];
const BORDER_W = 0.045;
const SHADOW_R = 0.09;
const SHADOW_DY = 0.03;

function inside(x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function edgeDistance(x, y) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

const png = new PNG({ width: SIZE, height: SIZE });
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE;
        const y = (py + (sy + 0.5) / SS) / SIZE;
        if (inside(x, y)) {
          const col = edgeDistance(x, y) < BORDER_W ? BORDER : FILL;
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        } else {
          const ys = y - SHADOW_DY;
          const d = inside(x, ys) ? 0 : edgeDistance(x, ys);
          if (d < SHADOW_R) a += 110 * (1 - d / SHADOW_R) ** 2; // sombra negra
        }
      }
    }
    const n = SS * SS;
    const i = (py * SIZE + px) * 4;
    const alpha = a / n;
    // Color premezclado sobre la sombra negra: se desmultiplica para el PNG.
    png.data[i] = alpha ? Math.min(255, Math.round(r / n / (alpha / 255))) : 0;
    png.data[i + 1] = alpha ? Math.min(255, Math.round(g / n / (alpha / 255))) : 0;
    png.data[i + 2] = alpha ? Math.min(255, Math.round(b / n / (alpha / 255))) : 0;
    png.data[i + 3] = Math.round(alpha);
  }
}
fs.writeFileSync(new URL('../assets/nav-arrow@3x.png', import.meta.url), PNG.sync.write(png));
console.log('assets/nav-arrow@3x.png');

// Imagen vacía para las capas del indicador de posición que no se usan.
const empty = new PNG({ width: 3, height: 3 });
empty.data.fill(0);
fs.writeFileSync(new URL('../assets/nav-empty@3x.png', import.meta.url), PNG.sync.write(empty));
console.log('assets/nav-empty@3x.png');
