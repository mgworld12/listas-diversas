// Remove o fundo liso ou claro de uma foto de produto (sem internet e sem bibliotecas).
// Regra: tudo o que está ligado à borda da foto e tem cor parecida com a do fundo vira transparente; a borda do produto fica suave.
// Funciona bem com fundo branco ou liso (fotos de catálogo, folha branca, mesa lisa); fundos cheios de detalhes não são separados.
const med = a => { const s = Uint8Array.from(a).sort(); return s[s.length >> 1]; };

// px: pixels RGBA (Uint8ClampedArray), alterado no lugar. Devolve a caixa do produto {x0, y0, x1, y1} ou null se não achou fundo.
export function cutout(px, w, h, tol = 40) {
  const R = [], G = [], B = [], m = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) / 50)));
  const take = (x, y) => { const i = (y * w + x) * 4; R.push(px[i]); G.push(px[i + 1]); B.push(px[i + 2]); };
  for (let k = 0; k < m; k++) { for (let x = 0; x < w; x++) { take(x, k); take(x, h - 1 - k); } for (let y = 0; y < h; y++) { take(k, y); take(w - 1 - k, y); } }
  const br = med(R), bg = med(G), bb = med(B);   // cor do fundo = mediana das bordas
  const dist = i => { const dr = px[i] - br, dg = px[i + 1] - bg, db = px[i + 2] - bb; return Math.sqrt(dr * dr + dg * dg + db * db); };
  const N = w * h, isBg = new Uint8Array(N), stack = new Int32Array(N); let sp = 0, count = 0;
  const push = p => { if (!isBg[p] && dist(p * 4) <= tol) { isBg[p] = 1; stack[sp++] = p; count++; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp) { const p = stack[--sp], x = p % w, y = (p / w) | 0; if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w); }
  if (count < N * 0.02 || count > N * 0.97) return null;   // quase nada de fundo, ou o "fundo" engoliu a foto: não mexe
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (isBg[p]) { px[i + 3] = 0; continue; }
    const x = p % w, y = (p / w) | 0;
    if ((x > 0 && isBg[p - 1]) || (x < w - 1 && isBg[p + 1]) || (y > 0 && isBg[p - w]) || (y < h - 1 && isBg[p + w])) {   // pixel de borda: mistura com o fundo
      const d = dist(i); if (d < tol * 2) px[i + 3] = Math.max(0, Math.min(255, Math.round(255 * (d - tol) / tol)));
    }
    if (px[i + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
