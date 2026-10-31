// Consulta de produtos e leitura de NF, boletos, contas de consumo e Pix
const dig = s => (s || '').replace(/\D/g, '');
const get = (url, ms = 8000) => fetch(url, { signal: AbortSignal.timeout(ms) });
export const cnpjFmt = c => c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;

// ---- Produto pelo código de barras (bases abertas: alimentos, cosméticos e produtos em geral) ----
const BASES = ['world.openfoodfacts.org', 'world.openbeautyfacts.org', 'world.openproductsfacts.org'];
export async function lookupProduct(code) {
  let fail = 0;
  for (const h of BASES) {
    try {
      const r = await get(`https://${h}/api/v2/product/${code}.json?fields=product_name,generic_name,brands,brand_owner,manufacturing_places,quantity,ingredients_text,serving_size,categories_tags,image_front_small_url`);
      const j = await r.json(), p = j.product;
      if (j.status !== 1 || !p || !(p.product_name || '').trim()) continue;
      const q = (p.quantity || '').trim(), vol = /\d\s*(ml|cl|l|lt|litros?)\b/i.test(q);
      return { name: p.product_name.trim(), brand: (p.brands || '').split(',')[0].trim(), maker: (p.brand_owner || p.manufacturing_places || '').trim(),
        quantity: vol ? '' : q, volume: vol ? q : '', comp: (p.ingredients_text || '').trim(), portion: (p.serving_size || '').trim(), specs: (p.generic_name || '').trim(),
        food: /food|beverage|snack|drink/.test((p.categories_tags || []).join(' ')), image: p.image_front_small_url || '' };
    } catch { fail++; }
  }
  if (fail === BASES.length) throw new Error('offline');
  return null;
}
export async function fetchImage(url) { const r = await get(url); if (!r.ok) throw new Error('img'); return r.blob(); }
export async function lookupCnpj(cnpj) {
  const r = await get('https://brasilapi.com.br/api/cnpj/v1/' + cnpj); if (!r.ok) throw new Error('cnpj');
  const j = await r.json(); return j.razao_social || j.nome_fantasia || '';
}

// ---- NF / NFC-e: a chave de acesso (44 dígitos) vem no QR Code ou no código de barras ----
export function parseNF(text) {
  const t = (text || '').trim(), key = (t.replace(/\s/g, '').match(/\d{44}/) || [])[0];
  if (!key) return null;
  const out = { key, cnpj: key.slice(6, 20), link: /^https?:\/\//i.test(t) ? t : '', date: '', value: '', ym: `20${key.slice(2, 4)}-${key.slice(4, 6)}` };
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
    return { type: 'pix', kind: 'pix', key: '', store: o['59'] || '', desc: x['05'] && x['05'] !== '***' ? x['05'] : '', value: o['54'] ? Number(o['54']) : '', date: '' };
  }
  let d = dig(t);
  if (d.length === 47) d = d.slice(0, 4) + d[32] + d.slice(33) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  else if (d.length === 48 && d[0] === '8') d = d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  if (d.length !== 44) return null;
  if (d[0] === '8') {   // conta de consumo (água, luz, telefone...)
    const seg = SEG[d[1]] || 'Conta de consumo';
    return { type: 'consumo', kind: d[1] === '2' ? 'agua' : d[1] === '3' ? 'energia' : '', key: d, store: '', desc: seg, value: '67'.includes(d[2]) ? Number(d.slice(4, 15)) / 100 : '', date: '' };
  }
  const v = Number(d.slice(9, 19)) / 100;
  return { type: 'boleto', kind: '', key: d, store: BANKS[d.slice(0, 3)] || 'Banco ' + d.slice(0, 3), desc: 'Boleto', value: v || '', date: dueDate(Number(d.slice(5, 9))) };
}

// ---- Texto da página da nota (consulta da Fazenda): estabelecimento, CNPJ, data, valor e itens ----
// Feito para o formato do Rio de Janeiro ("Dados dos Produtos e Serviços") e, de reserva, o formato "Qtde.: / UN: / Vl. Unit." de outros estados.
export function parseNFText(raw) {
  const flat = String(raw || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const money = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
  const qtyN = s => /,/.test(s) ? money(s) : Number(s);
  const unitOf = u => (String(u).replace(/\d+$/, '') || String(u)).toUpperCase();   // "un9" -> "UN"
  const out = { key: '', cnpj: '', store: '', date: '', value: '', items: [] };
  const k = (flat.match(/Chave de Acesso:? ((?:\d{4} ?){11})/i) || [])[1]; if (k) out.key = k.replace(/\s/g, '');
  const d = flat.match(/Emiss[ãa]o:? (\d{2})\/(\d{2})\/(\d{4})/i); if (d) out.date = `${d[3]}-${d[2]}-${d[1]}`;
  const v = flat.match(/Valor a pagar R\$:? ?(\d{1,3}(?:\.\d{3})*,\d{2})/i) || flat.match(/Valor Total da NF-?e:? (\d{1,3}(?:\.\d{3})*,\d{2})/i) || flat.match(/Valor Total dos Produtos:? (\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (v) out.value = money(v[1]);

  // Formato "NFC-e" (consulta pelo QR Code, RJ e outros estados): "NOME (Código: SS025446 ) Qtde.:1 UN: un9 Vl. Unit.: 30,99 Vl. Total 30,99"
  const rows = [...flat.matchAll(/\(C[óo]digo:?\s*([^)]*?)\s*\)\s*Qtde\.?:?\s*([\d.,]+)\s*UN:?\s*(\S+)\s*Vl\.?\s*Unit\.?:?\s*([\d.,]+)\s*Vl\.?\s*Total:?\s*([\d.,]+)/gi)];
  if (rows.length) {
    let prev = 0;
    rows.forEach((m, i) => {
      let name = flat.slice(prev, m.index).trim();
      if (i === 0) name = name.replace(/^.*(?:Filtrar itens\.{0,3}|,\s*[A-Z]{2})\s+/i, '');   // o nome do 1º item vem depois do endereço
      out.items.push({ name, code: m[1].trim(), qty: qtyN(m[2]), unit: unitOf(m[3]), total: money(m[5]) });
      prev = m.index + m[0].length;
    });
    const ci = flat.search(/CNPJ:? ?\d{2}\.\d{3}\.\d{3}\//i);   // cabeçalho: "RAZÃO SOCIAL  CNPJ: 00.000.000/0000-00  endereço"
    if (ci > -1) {
      const cm = flat.slice(ci).match(/CNPJ:? ?(\d{2}\.\d{3}\.\d{3}\/ ?\d{4}- ?\d{2})/i); if (cm) out.cnpj = cm[1].replace(/\D/g, '');
      out.store = flat.slice(0, ci).replace(/^.*CONSUMIDOR ELETR[ÔO]NICA\s*/i, '').trim().slice(-100).trim();
    }
    return out;
  }

  // Formato "Dados dos Produtos e Serviços" (consulta completa da NF-e): "1 GASOLINA 17,8890 LT 100,00 2 AGUA 1,0000 UN 3,50 ..."
  const emit = flat.split(/Dados do Emitente/i)[1] || flat.split(/Emitente/i)[1] || '', sec = emit.split(/Dados do Destinat/i)[0];
  const c = sec.match(/CNPJ:? (\d{2}\.\d{3}\.\d{3}\/ ?\d{4}- ?\d{2})/i); if (c) out.cnpj = c[1].replace(/\D/g, '');
  const nf = sec.match(/Nome Fantasia (.*?) CNPJ/i), rs = sec.match(/Nome ?\/ ?Raz[ãa]o Social (.*?) (?:Nome Fantasia|CNPJ)/i);
  out.store = ((rs && rs[1]) || (nf && nf[1]) || '').trim();
  let rest = (flat.split(/Dados dos Produtos e Servi[çc]os/i)[1] || '').split(/\bTotais\b/)[0].split(/Valor ?\(R\$\)/i).pop() || '';
  for (let n = 1; n < 500; n++) {
    const m = rest.match(new RegExp(`(?:^| )${n} (.+?) (\\d+(?:[.,]\\d+)?) ([A-Za-z]{1,4}) (\\d{1,3}(?:\\.\\d{3})*,\\d{2})(?= |$)`));
    if (!m) break;
    out.items.push({ name: m[1].trim(), qty: qtyN(m[2]), unit: m[3].toUpperCase(), total: money(m[4]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
// Tenta buscar a página da nota (quase sempre o site da Fazenda bloqueia; nesse caso o texto é colado no campo próprio)
export async function fetchNFPage(url) {
  const r = await get(url, 7000); if (!r.ok) throw new Error('nf');
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  doc.querySelectorAll('script,style').forEach(e => e.remove());
  doc.querySelectorAll('td,th,tr,div,p,br,li,h1,h2,h3,label').forEach(e => e.insertAdjacentText('afterend', ' '));
  return doc.body ? doc.body.textContent : '';
}
