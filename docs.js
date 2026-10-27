// Consulta de produtos e leitura de NF, boletos, contas de consumo e Pix
const dig = s => (s || '').replace(/\D/g, '');
const get = (url, ms = 8000) => fetch(url, { signal: AbortSignal.timeout(ms) });
export const cnpjFmt = c => c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;

// ---- Produto pelo código de barras (Open Food Facts, base aberta) ----
export async function lookupProduct(code) {
  const r = await get(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,categories_tags,image_front_small_url`);
  const j = await r.json(); const p = j.product;
  if (j.status !== 1 || !p) return null;
  return { name: (p.product_name || '').trim(), brand: (p.brands || '').split(',')[0].trim(), quantity: (p.quantity || '').trim(),
    food: /food|beverage|snack|drink/.test((p.categories_tags || []).join(' ')), image: p.image_front_small_url || '' };
}
export async function fetchImage(url) { const r = await get(url); if (!r.ok) throw new Error('img'); return r.blob(); }
export async function lookupCnpj(cnpj) {
  const r = await get('https://brasilapi.com.br/api/cnpj/v1/' + cnpj); if (!r.ok) throw new Error('cnpj');
  const j = await r.json(); return j.nome_fantasia || j.razao_social || '';
}

// ---- NF / NFC-e: a chave de acesso (44 dígitos) vem no QR Code ou no código de barras ----
export function parseNF(text) {
  const t = (text || '').trim(), key = (t.replace(/\s/g, '').match(/\d{44}/) || [])[0];
  if (!key) return null;
  const out = { key, cnpj: key.slice(6, 20), link: /^https?:\/\//i.test(t) ? t : '', date: '', value: '' };
  // NFC-e emitida em contingência traz dia e valor no próprio QR Code
  const p = t.split('p=').pop().split('|');
  if (key[34] === '9' && p.length >= 8 && /^\d{1,2}$/.test(p[3]) && /^\d+(\.\d+)?$/.test(p[4]))
    out.date = `20${key.slice(2, 4)}-${key.slice(4, 6)}-${p[3].padStart(2, '0')}`, out.value = Number(p[4]);
  return out;
}

// ---- Boleto, conta de consumo e Pix ----
const BANKS = { '001': 'Banco do Brasil', '033': 'Santander', '104': 'Caixa', '237': 'Bradesco', '341': 'Itaú', '260': 'Nubank', '077': 'Inter', '336': 'C6 Bank', '422': 'Safra', '748': 'Sicredi', '756': 'Sicoob', '041': 'Banrisul', '070': 'BRB', '212': 'Original', '380': 'PicPay', '290': 'PagBank' };
const SEG = { 1: 'Prefeitura', 2: 'Água/saneamento', 3: 'Energia/gás', 4: 'Telecomunicações', 5: 'Órgão governamental', 6: 'Carnê', 7: 'Multa de trânsito', 9: 'Uso do banco' };
const iso = d => d.toISOString().slice(0, 10);
const tlv = s => { const o = {}; for (let i = 0; i + 4 <= s.length;) { const n = +s.slice(i + 2, i + 4); o[s.slice(i, i + 2)] = s.slice(i + 4, i + 4 + n); i += 4 + n; } return o; };

// Vencimento pelo "fator": conta dias desde 07/10/1997; em 22/02/2025 o fator voltou a 1000
function dueDate(f) {
  if (!f) return '';
  const a = new Date(Date.UTC(1997, 9, 7) + f * 864e5), b = new Date(a.getTime() + 9000 * 864e5), now = Date.now();
  return iso(Math.abs(a - now) <= Math.abs(b - now) ? a : b);
}
export function parseBill(text) {
  const t = (text || '').trim();
  if (t.startsWith('000201')) {   // Pix (QR Code)
    const o = tlv(t), x = o['62'] ? tlv(o['62']) : {};
    return { type: 'pix', key: '', store: o['59'] || '', desc: x['05'] && x['05'] !== '***' ? x['05'] : 'Pix', value: o['54'] ? Number(o['54']) : '', date: '' };
  }
  let d = dig(t);
  if (d.length === 47) d = d.slice(0, 4) + d[32] + d.slice(33) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  else if (d.length === 48 && d[0] === '8') d = d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  if (d.length !== 44) return null;
  if (d[0] === '8') {   // conta de consumo (água, luz, telefone...)
    const seg = SEG[d[1]] || 'Conta de consumo';
    return { type: 'consumo', key: d, store: '', desc: seg, value: '67'.includes(d[2]) ? Number(d.slice(4, 15)) / 100 : '', date: '' };
  }
  const v = Number(d.slice(9, 19)) / 100;
  return { type: 'boleto', key: d, store: BANKS[d.slice(0, 3)] || 'Banco ' + d.slice(0, 3), desc: 'Boleto', value: v || '', date: dueDate(Number(d.slice(5, 9))) };
}
