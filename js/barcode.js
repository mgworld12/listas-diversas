// Código de barras EAN-13 / UPC-A / EAN-8 desenhado em SVG (sem bibliotecas, funciona offline).
// Outros códigos (QR Code, 14 dígitos, texto) ou com dígito verificador errado: devolve null e só o número é mostrado.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const valido = d => {   // dígito verificador
  const n = d.split('').map(Number), c = n.pop();
  return (10 - n.reverse().reduce((a, v, i) => a + v * (i % 2 ? 1 : 3), 0) % 10) % 10 === c;
};
export function ean(code) {   // sequência de barras (1 = preto, 0 = branco) ou null
  let d = String(code || '').replace(/\s/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 12) d = '0' + d;   // UPC-A é um EAN-13 com 0 na frente
  if (!/^(\d{8}|\d{13})$/.test(d) || !valido(d)) return null;
  const dig = [...d].map(Number);
  if (d.length === 8) return '101' + dig.slice(0, 4).map(x => L[x]).join('') + '01010' + dig.slice(4).map(x => R[x]).join('') + '101';
  const p = PAR[dig[0]];
  return '101' + dig.slice(1, 7).map((x, i) => (p[i] === 'L' ? L : G)[x]).join('') + '01010' + dig.slice(7).map(x => R[x]).join('') + '101';
}
export function barcodeSvg(code, altura = 34, modulo = 1.4) {
  const bits = ean(code); if (!bits) return null;
  const ns = 'http://www.w3.org/2000/svg', q = 9, w = bits.length + 2 * q, svg = document.createElementNS(ns, 'svg');
  const rect = (x, wd, fill) => { const r = document.createElementNS(ns, 'rect'); r.setAttribute('x', x); r.setAttribute('y', 0); r.setAttribute('width', wd); r.setAttribute('height', altura); r.setAttribute('fill', fill); return r; };
  svg.setAttribute('viewBox', `0 0 ${w} ${altura}`); svg.setAttribute('width', Math.round(w * modulo)); svg.setAttribute('height', altura);
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Código de barras ' + code);
  svg.append(rect(0, w, '#fff'));
  for (let i = 0; i < bits.length;) { let j = i; while (bits[j] === bits[i]) j++; if (bits[i] === '1') svg.append(rect(q + i, j - i, '#000')); i = j; }
  return svg;
}
