import { BUY_UNITS, CONTA_TIPOS } from './config.js';
import { cnpjFmt } from './docs.js';
import { barcodeSvg } from './barcode.js';
// Usa textContent (nunca innerHTML) para evitar injeção de código.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const btn = (txt, title, fn, cls = '') => { const b = el('button', cls, txt); b.type = 'button'; b.title = title; b.onclick = fn; return b; };
const money = (v, cur = 'BRL') => {
  try { return v.toLocaleString('pt-BR', { style: 'currency', currency: cur || 'BRL' }); }
  catch { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
};
const dot = c => { const d = el('span', 'dot sm'); d.style.setProperty('--c', c.hex); d.title = c.name; return d; };
const thumb = it => { if (!it.image) return null; const i = el('img', 'thumb'); i.src = it.image; i.alt = ''; return i; };
const nameEl = it => { const n = el('div', 'name', it.name); if (it.color) n.append(dot(it.color)); return n; };
// Medida (10 mg) + conteúdo da embalagem (30 comprimidos)
// Estoque e validade: sinalizadores usados no cartão do produto e no quadro de atenção
const DAY = 864e5, num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
export function stockState(it) {
  const n = num(it.stock), min = num(it.min), days = it.expiry ? Math.floor((new Date(it.expiry + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / DAY) : null;
  return { n, low: n !== null && min !== null && n <= min, expired: days !== null && days < 0, soon: days !== null && days >= 0 && days <= 30 };
}
export const itemLine = (i, cur = 'BRL') => [i.name, i.qty != null && i.qty !== '' ? `${Number(i.qty).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${i.unit || ''}`.trim() : '', i.total != null && i.total !== '' ? money(Number(i.total), cur) : ''].filter(Boolean).join(' • ');
export const info = it => [[it.qty, it.unit].filter(Boolean).join(' '), it.brand, it.content, it.volume].filter(Boolean).join(' • ');

// ---------- Abas (Nfs, Contas, Produtos) e produtos em cartões ----------
// Tipo da conta: ícone + nome (+ 4 últimos números do cartão) + descrição
export const contaTxt = d => {
  if (d.type === 'nf') return d.store || '';
  const k = CONTA_TIPOS[d.kind];
  return [k ? `${k.icon} ${k.label}${d.kind === 'cartao' && d.card ? ' •••• ' + d.card : ''}` : '', d.desc].filter(Boolean).join(' • ');
};
const qtyInfo = it => [[it.qty, it.unit].filter(Boolean).join(' '), it.content, it.volume].filter(Boolean).join(' • ');
const TABS = [['nf', 'Nfs', '#16a34a'], ['conta', 'Contas', '#0ea5e9'], ['produto', 'Produtos', '#f97316']];
function renderTabs(st, view, cb) {
  const bar = document.getElementById('tabs'); if (!bar) return; bar.replaceChildren();
  const n = { nf: st.docs.filter(d => d.type === 'nf').length, conta: st.docs.filter(d => d.type === 'conta').length, produto: st.items.length };
  TABS.forEach(([k, t, c]) => {
    const b = btn(t, view === k ? 'Ocultar ' + t : 'Mostrar ' + t, () => cb.view(view === k ? '' : k), 'tabbtn' + (view === k ? ' on' : ''));
    b.style.setProperty('--tc', c); b.setAttribute('aria-pressed', view === k); b.append(' ', el('span', 'n', n[k])); bar.append(b);
  });
}
function renderProducts(st, listMode, cb, view) {
  const box = document.getElementById('prodPanel'); box.replaceChildren(); box.hidden = view !== 'produto'; if (box.hidden) return;
  const idx = new Map(st.sectors.map((s, i) => [s.id, i]));
  const items = [...st.items].sort((a, b) => ((idx.get(a.sectorId) ?? 99) - (idx.get(b.sectorId) ?? 99)) || a.name.localeCompare(b.name, 'pt-BR'));
  box.append(el('h2', '', `Produtos (${items.length})`));
  if (!items.length) return box.append(el('p', 'empty', 'Nenhum produto cadastrado. Use "Cadastrar Produto".'));
  const grid = el('div', 'pgrid');
  items.forEach(it => {
    const sc = st.sectors.find(s => s.id === it.sectorId), S = stockState(it), card = el('div', 'pcard'), main = el('div', 'pmain');
    if (sc) card.style.setProperty('--sc', sc.color);   // só ao passar o mouse: fundo clarinho na cor do setor
    const head = el('label', 'phead'), k = el('input'); k.type = 'checkbox'; k.checked = st.list.ids.includes(it.id); k.setAttribute('aria-label', 'Selecionar para a lista'); k.onchange = () => cb.select(it.id);
    head.append(k, el('strong', 'pname', it.name)); if (it.color) head.append(dot(it.color));
    const dl = el('dl', 'pinfo');
    [['Setor:', sc ? sc.name : '—'], ['Marca:', it.brand || ''], ['Quantidade:', qtyInfo(it)]].forEach(([l, v]) => dl.append(el('dt', '', l), el('dd', '', v)));
    main.append(head, dl);
    if (it.code) { const bc = el('div', 'pbc'), svg = barcodeSvg(it.code); if (svg) bc.append(svg); bc.append(el('div', 'pcode', it.code)); main.append(bc); }   // código de barras + número
    if (S.n !== null || it.expiry) {   // estoque (com − e +) e validade, só quando informados
      const tags = el('div', 'tags');
      if (S.n !== null) { const w = el('span', 'stockc tag' + (S.low ? ' bad' : '')); w.append('Estoque: ', btn('−', 'Tirar 1 do estoque', () => cb.stock(it.id, -1), 'mv'), el('span', 'nn', S.n), btn('+', 'Somar 1 ao estoque', () => cb.stock(it.id, 1), 'mv')); tags.append(w); }
      if (it.expiry) tags.append(el('span', 'tag' + (S.expired ? ' bad' : S.soon ? ' warn' : ''), 'Validade: ' + it.expiry.split('-').reverse().join('/')));
      main.append(tags);
    }
    const acts = el('div', 'pacts'), a = el('a', '', '🔍');   // pesquisar na internet com o nome entre aspas
    a.href = 'https://www.google.com/search?q=' + encodeURIComponent('"' + it.name + '"'); a.target = '_blank'; a.rel = 'noopener'; a.title = 'Pesquisar na internet';
    acts.append(a, btn('✏️', 'Editar', () => cb.edit(it.id)), btn('🗑️', 'Excluir', () => cb.remove(it.id)));
    main.append(acts); card.append(main);
    const th = thumb(it); if (th) { th.className = 'pimg'; card.append(th); }
    grid.append(card);
  });
  box.append(grid);
}
export function render(st, listMode, cb, view) { renderAlerts(st, cb); renderTabs(st, view, cb); renderProducts(st, listMode, cb, view); }

// Resultados das buscas: um grupo por termo; "×" remove o termo; clicar num resultado abre a edição
export function renderResults(st, terms, norm, cb) {
  const box = document.getElementById('results'); box.replaceChildren(); box.hidden = !terms.length;
  terms.forEach(t => {
    const found = st.items.filter(i => norm([i.name, i.code, i.brand, i.maker, i.content, i.notes, (st.sectors.find(x => x.id === i.sectorId) || {}).name].filter(Boolean).join(' ')).includes(norm(t)));
    const g = el('div', 'rgroup'), h = el('h3', '', `“${t}” — ${found.length} resultado(s)`);
    h.append(btn('×', 'Remover esta busca', () => cb.drop(t), 'x')); g.append(h);
    if (!found.length) g.append(el('p', 'empty', 'Nenhum item encontrado.'));
    found.forEach(it => {
      const sec = st.sectors.find(s => s.id === it.sectorId) || { icon: '📁', name: '' };
      const r = el('div', 'rrow link'); r.title = 'Clique para editar'; r.onclick = () => cb.edit(it.id);
      r.append(el('span', 'rs', `${sec.icon} ${sec.name}`), nameEl(it));
      if (info(it)) r.append(el('span', 'notes', info(it)));
      g.append(r);
    });
    box.append(g);
  });
}

// Quadro da lista: itens marcados, agrupados por setor, com quantidade a comprar e preço
export function renderList(st, cb) {
  const body = document.getElementById('listBody'); body.replaceChildren();
  document.getElementById('listDate').textContent = new Date().toLocaleDateString('pt-BR');
  const heads = ['Item', 'Qtd. a comprar', 'Preço unit. (R$)', 'Subtotal', 'Loja / Mercado', 'Observações'];
  const field = (type, val, ph, label, fn, extra = {}) => {
    const i = el('input'); i.type = type; i.value = val; i.placeholder = ph; i.setAttribute('aria-label', label);
    Object.assign(i, extra); i.oninput = () => fn(i.value); return i;
  };
  let n = 0;
  st.sectors.forEach(sec => {
    const items = st.items.filter(i => i.sectorId === sec.id && st.list.ids.includes(i.id));
    if (!items.length) return;
    body.append(el('h3', 'list-sec', `${sec.icon} ${sec.name}`));
    const wrap = el('div', 'tscroll'), t = el('table', 'ltable'), head = el('tr');
    heads.forEach((x, i) => head.append(el('th', 'c' + (i + 1), x)));
    t.append(head);
    items.forEach(it => {
      n++; const tr = el('tr'), td = (c, text) => { const d = el('td', c, text); return d; };
      const c = [td(), td(), td(), td('sub'), td(), td('notes', it.notes || '')];
      const t = thumb(it), nm = el('div'); nm.append(nameEl(it)); if (info(it)) nm.append(el('div', 'notes', info(it)));
      if (t) { const h = el('div', 'withimg'); h.append(t, nm); c[0].append(h); } else c[0].append(nm);
      const sel = el('select'); BUY_UNITS.forEach(u => sel.append(new Option(u, u)));
      sel.value = st.list.buyUnits[it.id] || BUY_UNITS[0]; sel.setAttribute('aria-label', 'Tipo de ' + it.name); sel.onchange = () => cb.buyUnit(it.id, sel.value);
      const w = el('div', 'buy'); w.append(field('number', st.list.qtys[it.id] || '', '1', 'Quantidade a comprar de ' + it.name, v => cb.qty(it.id, v), { min: '1', step: '1' }), sel); c[1].append(w);
      c[2].append(field('number', st.list.prices[it.id] || '', '0,00', 'Preço de ' + it.name, v => cb.price(it.id, v), { min: '0', step: '0.01' }));
      c[3].dataset.id = it.id;
      c[4].append(field('text', st.list.stores[it.id] || '', 'Loja ou mercado', 'Loja de ' + it.name, v => cb.store(it.id, v), { maxLength: 60 }));
      c.forEach((d, i) => { if (i) d.dataset.l = heads[i]; tr.append(d); }); t.append(tr);
    });
    wrap.append(t); body.append(wrap);
  });
  if (!n) body.append(el('p', 'empty', 'Marque os itens nos setores para montar a lista.'));
  updateTotals(st);
}

// Subtotal = preço unitário × quantidade a comprar (1 se vazia)
export function updateTotals(st) {
  let total = 0;
  document.querySelectorAll('#listBody .sub').forEach(td => {
    const id = td.dataset.id, v = (Number(st.list.prices[id]) || 0) * (Number(st.list.qtys[id]) || 1);
    total += v; td.textContent = money(v);
  });
  document.getElementById('listTotal').textContent = 'Total: ' + money(total);
}

// Listas salvas com nome e data
export function renderSaved(st, cb) {
  const box = document.getElementById('savedPanel'); box.replaceChildren(); box.hidden = !st.saved.length;
  if (!st.saved.length) return;
  box.append(el('h2', '', 'Listas salvas'));
  st.saved.forEach((s, i) => {
    const r = el('div', 'rrow');
    r.append(el('strong', '', s.name), el('span', 'rs', new Date(s.date).toLocaleDateString('pt-BR')),
      el('span', 'notes', `${s.rows.length} item(ns) • ${money(s.total)}`), btn('Excel', 'Salvar como .xlsx', () => cb.xlsx(i), 'btn'), btn('Excluir', 'Excluir lista salva', () => cb.del(i), 'btn'));
    box.append(r);
  });
}

// Quadro de atenção: vencidos, a vencer em 30 dias e estoque baixo
function renderAlerts(st, cb) {
  const box = document.getElementById('alerts'); if (!box) return; box.replaceChildren();
  const exp = [], soon = [], low = [];
  st.items.forEach(it => { const s = stockState(it); if (s.expired) exp.push(it); else if (s.soon) soon.push(it); if (s.low) low.push(it); });
  const today = new Date().toLocaleDateString('sv-SE'), in7 = new Date(Date.now() + 7 * DAY).toLocaleDateString('sv-SE'), month = today.slice(0, 7);
  const pend = st.docs.filter(d => d.type === 'conta' && d.status === 'pendente' && d.date);
  const late = pend.filter(d => d.date < today), next = pend.filter(d => d.date >= today && d.date <= in7);
  const over = [], near = [];   // orçamento mensal por setor (só em reais)
  st.sectors.forEach(s => {
    const lim = Number((st.budget || {})[s.id]) || 0; if (!lim) return;
    const used = st.docs.filter(d => d.sectorId === s.id && (d.currency || 'BRL') === 'BRL' && (d.date || '').startsWith(month)).reduce((a, d) => a + (d.value || 0), 0), o = { s, used, lim, pct: used / lim };
    if (o.pct >= 1) over.push(o); else if (o.pct >= .8) near.push(o);
  });
  box.hidden = !(exp.length || soon.length || low.length || late.length || next.length || over.length || near.length); if (box.hidden) return;
  box.append(el('h2', '', '⚠️ Atenção'));
  const dd = d => d.date.split('-').reverse().slice(0, 2).join('/');
  const docLine = (t, arr) => { if (arr.length) box.append(el('p', 'notes', `${t}: ${arr.slice(0, 8).map(d => `${d.store || d.desc || 'conta'} (${dd(d)}, ${money(d.value || 0, d.currency)})`).join('; ')}${arr.length > 8 ? '…' : ''}`)); };
  docLine('🔴 Contas vencidas', late); docLine('🟠 Contas a vencer em até 7 dias', next);
  const bud = (t, arr) => arr.forEach(o => box.append(el('p', 'notes', `${t}: ${o.s.icon} ${o.s.name} — ${money(o.used)} de ${money(o.lim)} (${Math.round(o.pct * 100)}%) neste mês`)));
  bud('🔴 Orçamento estourado', over); bud('🟠 Perto do limite', near);
  const line = (t, arr) => { if (arr.length) box.append(el('p', 'notes', `${t}: ${arr.slice(0, 8).map(i => i.name).join(', ')}${arr.length > 8 ? '…' : ''}`)); };
  line('Vencidos', exp); line('Vencem em até 30 dias', soon); line('Estoque baixo', low);
  if (low.length && cb.addLow) box.append(btn('Adicionar o estoque baixo à lista de compras', 'Marca esses itens na lista', cb.addLow, 'btn'));
}

// Compras (NF) e contas cadastradas, em tabela: colunas alinhadas, filtros, resumo e exportação
const F = { m: '', t: '', s: '', q: '' }; let cur = null, shown = [];
const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const curSort = ([a], [b]) => a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b);
const fillSel = (sel, opts, val) => { sel.replaceChildren(...opts.map(([v, t]) => new Option(t, v))); sel.value = opts.some(o => o[0] === val) ? val : ''; return sel.value; };
function totalsCell(tot) { const td = el('td', 'nw num val'); Object.entries(tot).sort(curSort).forEach(([c, v]) => td.append(el('div', '', money(v, c)))); return td; }
// Gráficos simples (só em reais): gasto por mês (últimos 12) e por setor, na cor do setor
function charts(st) {
  const wrap = el('div', 'charts'), docs = st.docs.filter(d => (d.currency || 'BRL') === 'BRL' && d.value > 0);
  if (!docs.length) return wrap;
  const sum = keyOf => { const m = new Map(); docs.forEach(d => { const k = keyOf(d); if (k) m.set(k, (m.get(k) || 0) + d.value); }); return m; };
  const bm = sum(d => (d.date || '').slice(0, 7)), months = [...bm.keys()].sort().slice(-12), mx = Math.max(...months.map(k => bm.get(k)), 1);
  const c1 = el('div', 'chart'), cols = el('div', 'cols'); c1.append(el('h3', '', 'Gasto por mês (R$)'));
  months.forEach(k => {
    const v = bm.get(k), c = el('div', 'col'), b = el('div', 'bar'); b.style.height = Math.max(4, Math.round(v / mx * 110)) + 'px'; b.title = money(v);
    c.append(el('span', 'v', Math.round(v).toLocaleString('pt-BR')), b, el('span', 'l', k.slice(5) + '/' + k.slice(2, 4))); cols.append(c);
  });
  c1.append(cols);
  const bs = sum(d => d.sectorId), secs = [...bs.keys()].sort((a, b) => bs.get(b) - bs.get(a)), mx2 = Math.max(...secs.map(k => bs.get(k)), 1), c2 = el('div', 'chart');
  c2.append(el('h3', '', 'Gasto por setor (R$)'));
  secs.forEach(k => {
    const s = st.sectors.find(x => x.id === k), v = bs.get(k), r = el('div', 'srow'), w = el('div', 'sw'), bar = el('div', 'sbar');
    bar.style.width = Math.max(3, Math.round(v / mx2 * 100)) + '%'; bar.style.background = s ? s.color : '#9ca3af'; w.append(bar);
    r.append(el('span', 'sl', s ? `${s.icon} ${s.name}` : 'Sem setor'), w, el('span', 'sv', money(v))); c2.append(r);
  });
  wrap.append(c1, c2); return wrap;
}
// Histórico de preços dos itens das NFs (preço por unidade; só compara itens com o mesmo nome)
const P = { q: '' }; let pst = null, pview = '';
export function renderPrices(st, view) {
  pst = st; pview = view;
  const box = document.getElementById('pricePanel'); if (!box) return;
  const rows = new Map();
  st.docs.forEach(d => (d.items || []).forEach(i => {
    if ((d.currency || 'BRL') !== 'BRL' || !i.name || !(Number(i.total) > 0)) return;
    const qty = Number(i.qty) > 0 ? Number(i.qty) : 1, k = nz(i.name), r = rows.get(k) || { name: i.name, list: [] };
    r.list.push({ price: Number(i.total) / qty, date: d.date || '', store: d.store || '' }); rows.set(k, r);
  }));
  box.hidden = !rows.size || view !== 'nf'; if (box.hidden) return;
  let bar = box.querySelector('.pbar'), body = box.querySelector('.pbody');
  if (!bar) {
    bar = el('div', 'pbar noprint'); body = el('div', 'pbody');
    const q = el('input'); q.type = 'search'; q.placeholder = 'Buscar item'; q.setAttribute('aria-label', 'Buscar item'); q.oninput = () => { P.q = q.value; renderPrices(pst, pview); }; bar.append(q);
    box.replaceChildren(el('h2', '', 'Histórico de preços'), el('p', 'empty', 'Preço por unidade dos itens das NFs. Só compara itens com o mesmo nome.'), bar, body);
  }
  const f = nz(P.q), fmt = d => d.split('-').reverse().slice(0, 2).join('/');
  const list = [...rows.values()].filter(r => !f || nz(r.name).includes(f)).sort((a, b) => b.list.length - a.list.length || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 60);
  body.replaceChildren(); if (!list.length) return body.append(el('p', 'empty', 'Nenhum item encontrado.'));
  const t = el('table', 'dtable'), thead = el('thead'), hr = el('tr'), tb = el('tbody');
  ['Item', 'Compras', 'Última', 'Menor preço', 'Maior preço', 'Média'].forEach(h => hr.append(el('th', '', h))); thead.append(hr);
  list.forEach(r => {
    const L = [...r.list].sort((a, b) => a.date.localeCompare(b.date)), last = L[L.length - 1], lo = L.reduce((a, b) => b.price < a.price ? b : a), hi = L.reduce((a, b) => b.price > a.price ? b : a);
    const at = x => `${money(x.price)}${x.store ? ' • ' + x.store : ''}${x.date ? ' • ' + fmt(x.date) : ''}`, tr = el('tr'), cells = [r.name, String(L.length), at(last), at(lo), at(hi), money(L.reduce((a, b) => a + b.price, 0) / L.length)];
    cells.forEach((c, i) => { const td = el('td', i === 1 ? 'nw' : '', c); td.dataset.l = ['Item', 'Compras', 'Última', 'Menor preço', 'Maior preço', 'Média'][i]; tr.append(td); });
    tb.append(tr);
  });
  t.append(thead, tb); const w = el('div', 'tscroll'); w.append(t); body.append(w);
}
function resumo(st) {
  const det = el('details', 'resumo noprint'); det.append(el('summary', '', 'Resumo por mês e por setor'));
  const group = keyOf => { const g = new Map(); st.docs.forEach(d => { const k = keyOf(d), c = d.currency || 'BRL', o = g.get(k) || {}; o[c] = (o[c] || 0) + (d.value || 0); g.set(k, o); }); return g; };
  const table = (title, g, labelOf, sort) => {
    const t = el('table', 'stable'), h = el('tr'); h.append(el('th', '', title), el('th', 'val', 'Total')); t.append(h);
    [...g.keys()].sort(sort).forEach(k => { const tr = el('tr'); tr.append(el('td', '', labelOf(k)), totalsCell(g.get(k))); t.append(tr); });
    const w = el('div', 'tscroll'); w.append(t); return w;
  };
  det.append(
    table('Mês', group(d => (d.date || '').slice(0, 7) || '-'), k => k === '-' ? 'Sem data' : k.slice(5) + '/' + k.slice(0, 4), (a, b) => b.localeCompare(a)),
    table('Setor', group(d => d.sectorId || '-'), k => { const s = st.sectors.find(x => x.id === k); return s ? `${s.icon} ${s.name}` : 'Sem setor'; }, (a, b) => String(a).localeCompare(String(b))),
    charts(st));
  return det;
}
export function renderDocs(st, cb, view) {
  cur = { st, cb, view };
  const box = document.getElementById('docsPanel');
  box.hidden = !(view === 'nf' || view === 'conta'); if (box.hidden) return;
  const mine = st.docs.filter(d => d.type === view), title = view === 'nf' ? 'Notas fiscais' : 'Contas';
  if (!mine.length) { box.replaceChildren(el('h2', '', title), el('p', 'empty', view === 'nf' ? 'Nenhuma NF cadastrada. Use "Cadastrar NF".' : 'Nenhuma conta cadastrada. Use "Cadastrar Conta".')); return; }
  let bar = box.querySelector('.docbar'), body = box.querySelector('.docbody');
  if (!bar) {   // filtros: criados uma vez; só a tabela é redesenhada (o campo de busca não perde o foco)
    bar = el('div', 'docbar noprint'); body = el('div', 'docbody');
    const m = el('select'), t = el('select'), q = el('input'), x = btn('Exportar Excel', 'Salvar a lista filtrada em .xlsx', () => cur.cb.xlsx(shown), 'btn');
    m.setAttribute('aria-label', 'Mês'); q.type = 'search'; q.placeholder = 'Buscar estabelecimento ou CNPJ'; q.setAttribute('aria-label', 'Buscar');
    t.setAttribute('aria-label', 'Situação'); t.append(new Option('Todas as situações', ''), new Option('A pagar', 'pendente'), new Option('Pagas', 'paga'));
    t.onchange = () => { F.t = t.value; renderDocs(cur.st, cur.cb, cur.view); };
    m.onchange = () => { F.m = m.value; renderDocs(cur.st, cur.cb, cur.view); };
    q.oninput = () => { F.q = q.value; renderDocs(cur.st, cur.cb, cur.view); };
    bar.append(m, t, q, x); box.replaceChildren(el('h2', '', title), bar, body);
  }
  box.querySelector('h2').textContent = title;
  const [m, t] = bar.querySelectorAll('select'); t.hidden = view !== 'conta'; if (view !== 'conta') F.t = '';
  const months = [...new Set(mine.map(d => (d.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  F.m = fillSel(m, [['', 'Todos os meses'], ...months.map(x => [x, x.slice(5) + '/' + x.slice(0, 4)])], F.m);
  t.value = F.t;

  const cur_ = d => d.currency || 'BRL', q = nz(F.q), secOf = d => st.sectors.find(y => y.id === d.sectorId);
  const docs = [...mine].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  shown = docs.filter(d => (!F.m || (d.date || '').startsWith(F.m)) && (!F.t || d.status === F.t) &&
    (!q || nz([d.store, d.cnpj, d.cnpj ? cnpjFmt(d.cnpj) : '', d.desc, (secOf(d) || {}).name].join(' ')).includes(q)));
  body.replaceChildren(resumo({ ...st, docs: mine }));
  if (!shown.length) return body.append(el('p', 'empty', 'Nenhum registro neste filtro.'));
  // Colunas: Setor (ícone), Estabelecimento, CNPJ, lápis, lixeira, Valor, Data, Situação, DANFE/Comprovante
  const all = [
    { h: 'Setor', c: 'ic', always: 1, get: d => { const x = secOf(d); return x ? x.icon : '—'; }, tip: d => { const x = secOf(d); return x ? x.name : 'Sem setor'; } },
    { h: 'Estabelecimento', always: 1, name: 1 },
    { h: 'CNPJ', c: 'nw num', get: d => d.cnpj ? cnpjFmt(d.cnpj) : '' },
    { h: '', c: 'ic2', always: 1, edit: 1 },
    { h: '', c: 'ic2', always: 1, del: 1 },
    { h: 'Valor', c: 'nw num val', always: 1, value: 1 },
    { h: 'Data', c: 'nw', always: 1, get: d => d.date ? d.date.split('-').reverse().join('/') : '' },
    { h: 'Situação', c: 'nw', pay: 1, get: d => d.status || '' },
    { h: view === 'conta' ? 'Comprovante' : 'DANFE', c: 'nw', link: 1 }
  ];
  const cols = all.filter(c => c.always || shown.some(d => c.link ? d.link : c.get(d)));   // colunas sem nenhum dado ficam ocultas
  const t2 = el('table', 'dtable'), thead = el('thead'), hr = el('tr'), tb = el('tbody'), tot = {};
  cols.forEach(c => hr.append(el('th', c.c || '', c.h))); thead.append(hr);
  shown.forEach(d => {
    tot[cur_(d)] = (tot[cur_(d)] || 0) + (d.value || 0);
    const tr = el('tr'), sc = secOf(d); if (sc) tr.style.setProperty('--sc', sc.color);   // fundo clarinho na cor do setor ao passar o mouse
    cols.forEach(c => {
      const td = el('td', c.c || ''); if (c.h) td.dataset.l = c.h;
      if (c.name) {
        const k = CONTA_TIPOS[d.kind];   // conta: ícone do tipo (gás, energia...) antes do nome
        if (d.type === 'conta' && k) { const ik = el('span', 'kind', `${k.icon}${d.kind === 'cartao' && d.card ? ' ••' + d.card : ''} `); ik.title = k.label; td.append(ik); }
        td.append(el('strong', '', d.store || d.desc || '—'));
        if (d.items && d.items.length) {   // itens da compra: recolhidos, abrem na setinha
          const det = el('details', 'items'); det.append(el('summary', '', `Itens (${d.items.length})`));
          d.items.forEach(i => det.append(el('div', 'notes', itemLine(i, cur_(d)))));
          td.append(det);
        }
      } else if (c.edit) td.append(btn('✏️', 'Editar', () => cb.edit(d.id)));
      else if (c.del) td.append(btn('🗑️', 'Excluir', () => cb.del(d.id)));
      else if (c.value) { td.textContent = money(d.value || 0, cur_(d)); if (!d.value) { td.classList.add('zero'); td.title = 'Sem valor: use ✏️ para informar'; } }
      else if (c.pay) {   // contas: paga / a pagar (vencida em destaque) e botão para marcar como paga
        if (d.status === 'pendente') { const late = d.date && d.date < new Date().toLocaleDateString('sv-SE'); td.append(el('span', late ? 'bad' : 'soon', late ? '⚠️ Vencida ' : '⏳ A pagar '), btn('✔ Pagar', 'Marcar como paga', () => cb.pay(d.id), 'btn')); }
        else if (d.status === 'paga') { td.textContent = '✔ Paga'; if (d.paidOn) td.title = 'Paga em ' + d.paidOn.split('-').reverse().join('/'); }
      }
      else if (c.link) { if (d.link) { const a = el('a', '', d.type === 'conta' ? 'Comprovante' : 'DANFE'); a.href = d.link; a.target = '_blank'; a.rel = 'noopener'; td.append(a); } }
      else { td.textContent = c.get(d); if (c.tip) td.title = c.tip(d); }
      tr.append(td);
    });
    tb.append(tr);
  });
  const vi = cols.findIndex(c => c.value), after = cols.length - vi - 1;   // rodapé: um total por moeda, sob a coluna Valor
  const tf = el('tfoot'), fr = el('tr'), lab = el('td', '', Object.keys(tot).length > 1 ? 'Totais' : 'Total');
  if (vi > 0) lab.colSpan = vi;
  fr.append(lab, totalsCell(tot)); if (after > 0) { const e = el('td'); e.colSpan = after; fr.append(e); }
  tf.append(fr); t2.append(thead, tb, tf);
  const wrap = el('div', 'tscroll'); wrap.append(t2); body.append(wrap);
}
