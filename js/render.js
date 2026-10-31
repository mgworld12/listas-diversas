import { BUY_UNITS, CONTA_TIPOS } from './config.js';
import { cnpjFmt } from './docs.js';
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

// ---------- Barra de setores (filtro) e tabela de produtos ----------
const SEC = { id: '' };   // setor escolhido na barra: filtra a tabela de produtos e a de compras e contas
// Tipo da conta: ícone + nome (+ 4 últimos números do cartão) + descrição
export const contaTxt = d => {
  if (d.type === 'nf') return '';
  const k = CONTA_TIPOS[d.kind];
  return [k ? `${k.icon} ${k.label}${d.kind === 'cartao' && d.card ? ' •••• ' + d.card : ''}` : '', d.desc].filter(Boolean).join(' • ');
};
const qtyInfo = it => [[it.qty, it.unit].filter(Boolean).join(' '), it.content, it.volume].filter(Boolean).join(' • ');
function renderSecBar(st, cb) {
  const bar = document.getElementById('secbar'); bar.replaceChildren();
  if (SEC.id && !st.sectors.some(s => s.id === SEC.id)) SEC.id = '';
  const mk = (id, label, n, color) => { const b = btn(label, 'Mostrar: ' + label, () => { SEC.id = id; cb.refresh(); }, 'secbtn' + (SEC.id === id ? ' on' : '')); b.style.setProperty('--sc', color); b.append(' ', el('span', 'n', n)); return b; };
  bar.append(mk('', '📋 Todos', st.items.length + st.docs.length, 'var(--primary)'));
  st.sectors.forEach(s => bar.append(mk(s.id, `${s.icon} ${s.name}`, st.items.filter(i => i.sectorId === s.id).length + st.docs.filter(d => d.sectorId === s.id).length, s.color)));
  bar.append(btn('⚙️ Setores', 'Criar, editar, ordenar e excluir setores', cb.secManage, 'secbtn'));
}
function renderProducts(st, listMode, cb) {
  const box = document.getElementById('prodPanel'); box.replaceChildren();
  const idx = new Map(st.sectors.map((s, i) => [s.id, i]));
  const items = st.items.filter(i => !SEC.id || i.sectorId === SEC.id)
    .sort((a, b) => (a.done - b.done) || ((idx.get(a.sectorId) ?? 99) - (idx.get(b.sectorId) ?? 99)) || a.name.localeCompare(b.name, 'pt-BR'));
  box.append(el('h2', '', `Produtos (${items.length})`));
  if (!items.length) return box.append(el('p', 'empty', SEC.id ? 'Nenhum produto neste setor.' : 'Nenhum produto cadastrado. Use "Cadastrar Produto".'));
  const secOf = it => st.sectors.find(s => s.id === it.sectorId);
  const all = [
    { h: '', c: 'chk', always: 1, chk: 1 },
    { h: 'Setor', c: 'ic', always: 1, sec: 1 },
    { h: 'Produto', always: 1, name: 1 },
    { h: 'Marca / fabricante', get: i => [i.brand, i.maker].filter(Boolean).join(' / ') },
    { h: 'Quantidade', c: 'nw', get: qtyInfo },
    { h: 'Estoque', c: 'nw', stock: 1, any: items.some(i => stockState(i).n !== null) },
    { h: 'Validade', c: 'nw', exp: 1, any: items.some(i => i.expiry) },
    { h: '', c: 'nw', always: 1, acts: 1 }
  ];
  const cols = all.filter(c => c.always || (c.any !== undefined ? c.any : items.some(i => c.get(i))));
  const t = el('table', 'dtable'), thead = el('thead'), hr = el('tr'), tb = el('tbody');
  cols.forEach(c => hr.append(el('th', c.c || '', c.h))); thead.append(hr);
  items.forEach(it => {
    const tr = el('tr', it.done && !listMode ? 'done' : ''), S = stockState(it), sc = secOf(it); if (sc) tr.style.setProperty('--sc', sc.color);   // marca na cor do setor
    cols.forEach(c => {
      const td = el('td', c.c || ''); if (c.h) td.dataset.l = c.h;
      if (c.chk) {
        const k = el('input'); k.type = 'checkbox'; k.style.width = 'auto';
        if (listMode) { k.checked = st.list.ids.includes(it.id); k.setAttribute('aria-label', 'Incluir na lista'); k.onchange = () => cb.select(it.id); }
        else { k.checked = it.done; k.setAttribute('aria-label', 'Concluído'); k.onchange = () => cb.toggle(it.id); }
        td.append(k);
      } else if (c.sec) { const s = secOf(it); td.textContent = s ? s.icon : '—'; td.title = s ? s.name : 'Sem setor'; }
      else if (c.name) {
        const th = thumb(it); if (th) td.append(th);
        td.append(el('strong', 'pname', it.name)); if (it.color) td.append(dot(it.color));
        if (it.notes) td.append(el('div', 'notes', it.notes));
      } else if (c.stock) {
        if (S.n !== null) { const w = el('span', 'stockc' + (S.low ? ' bad' : '')); w.append(btn('−', 'Tirar 1 do estoque', () => cb.stock(it.id, -1), 'mv'), el('span', 'nn', S.n), btn('+', 'Somar 1 ao estoque', () => cb.stock(it.id, 1), 'mv')); td.append(w); }
      } else if (c.exp) { if (it.expiry) { const s = el('span', S.expired ? 'bad' : S.soon ? 'soon' : '', it.expiry.split('-').reverse().join('/')); td.append(s); } }
      else if (c.acts) {
        const a = el('a', '', '🔍'); a.href = 'https://www.google.com/search?q=' + encodeURIComponent('"' + it.name + '"'); a.target = '_blank'; a.rel = 'noopener'; a.title = 'Buscar no Google';
        td.append(a, btn('✏️', 'Editar', () => cb.edit(it.id)), btn('🗑️', 'Excluir', () => cb.remove(it.id)));
      } else td.textContent = c.get(it);
      tr.append(td);
    });
    tb.append(tr);
  });
  t.append(thead, tb); const wrap = el('div', 'tscroll'); wrap.append(t); box.append(wrap);
}
export function render(st, listMode, cb) { renderAlerts(st, cb); renderSecBar(st, cb); renderProducts(st, listMode, cb); }

// Resultados das buscas: um grupo por termo; "×" remove o termo; clicar num resultado abre a edição
export function renderResults(st, terms, norm, cb) {
  const box = document.getElementById('results'); box.replaceChildren(); box.hidden = !terms.length;
  terms.forEach(t => {
    const found = st.items.filter(i => norm([i.name, i.code, i.brand, i.maker, i.content, i.notes].filter(Boolean).join(' ')).includes(norm(t)));
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
  box.hidden = !(exp.length || soon.length || low.length); if (box.hidden) return;
  box.append(el('h2', '', '⚠️ Atenção'));
  const line = (t, arr) => { if (arr.length) box.append(el('p', 'notes', `${t}: ${arr.slice(0, 8).map(i => i.name).join(', ')}${arr.length > 8 ? '…' : ''}`)); };
  line('Vencidos', exp); line('Vencem em até 30 dias', soon); line('Estoque baixo', low);
  if (low.length && cb.addLow) box.append(btn('Adicionar o estoque baixo à lista de compras', 'Marca esses itens na lista', cb.addLow, 'btn'));
}

// Compras (NF) e contas cadastradas, em tabela: colunas alinhadas, filtros, resumo e exportação
const F = { m: '', s: '', q: '' }; let cur = null, shown = [];
const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const curSort = ([a], [b]) => a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b);
const fillSel = (sel, opts, val) => { sel.replaceChildren(...opts.map(([v, t]) => new Option(t, v))); sel.value = opts.some(o => o[0] === val) ? val : ''; return sel.value; };
function totalsCell(tot) { const td = el('td', 'nw num val'); Object.entries(tot).sort(curSort).forEach(([c, v]) => td.append(el('div', '', money(v, c)))); return td; }
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
    table('Setor', group(d => d.sectorId || '-'), k => { const s = st.sectors.find(x => x.id === k); return s ? `${s.icon} ${s.name}` : 'Sem setor'; }, (a, b) => String(a).localeCompare(String(b))));
  return det;
}
export function renderDocs(st, cb) {
  cur = { st, cb };
  const box = document.getElementById('docsPanel'); box.hidden = !st.docs.length;
  if (!st.docs.length) return;
  let bar = box.querySelector('.docbar'), body = box.querySelector('.docbody');
  if (!bar) {   // filtros: criados uma vez; só a tabela é redesenhada (o campo de busca não perde o foco)
    bar = el('div', 'docbar noprint'); body = el('div', 'docbody');
    const m = el('select'), q = el('input'), x = btn('Exportar Excel', 'Salvar a lista filtrada em .xlsx', () => cur.cb.xlsx(shown), 'btn');
    m.setAttribute('aria-label', 'Mês'); q.type = 'search'; q.placeholder = 'Buscar estabelecimento ou CNPJ'; q.setAttribute('aria-label', 'Buscar');
    m.onchange = () => { F.m = m.value; renderDocs(cur.st, cur.cb); };
    q.oninput = () => { F.q = q.value; renderDocs(cur.st, cur.cb); };
    bar.append(m, q, x); box.replaceChildren(el('h2', '', 'Compras e contas'), bar, body);
  }
  const m = bar.querySelector('select');
  const months = [...new Set(st.docs.map(d => (d.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  F.m = fillSel(m, [['', 'Todos os meses'], ...months.map(x => [x, x.slice(5) + '/' + x.slice(0, 4)])], F.m);

  const cur_ = d => d.currency || 'BRL', q = nz(F.q);
  const docs = [...st.docs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  shown = docs.filter(d => (!F.m || (d.date || '').startsWith(F.m)) && (!SEC.id || d.sectorId === SEC.id) &&
    (!q || nz([d.store, d.cnpj, d.cnpj ? cnpjFmt(d.cnpj) : '', d.desc].join(' ')).includes(q)));
  body.replaceChildren(resumo(st));
  if (!shown.length) return body.append(el('p', 'empty', 'Nenhum registro neste filtro.'));
  const secOf = d => st.sectors.find(y => y.id === d.sectorId);
  const all = [
    { h: 'Estabelecimento', always: 1, name: 1 },
    { h: 'CNPJ', c: 'nw num', get: d => d.cnpj ? cnpjFmt(d.cnpj) : '' },
    { h: 'Setor', c: 'ic', always: 1, get: d => { const x = secOf(d); return x ? x.icon : '—'; }, tip: d => { const x = secOf(d); return x ? x.name : 'Sem setor'; } },
    { h: 'Referente a', get: d => contaTxt(d) },
    { h: 'Valor', c: 'nw num val', always: 1, value: 1 },
    { h: 'Data', c: 'nw', always: 1, get: d => d.date ? d.date.split('-').reverse().join('/') : '' },
    { h: 'DANFE', c: 'nw', link: 1 }
  ];
  const cols = all.filter(c => c.always || shown.some(d => c.link ? d.link : c.get(d)));   // colunas sem nenhum dado ficam ocultas
  const t = el('table', 'dtable'), thead = el('thead'), hr = el('tr'), tb = el('tbody'), tot = {};
  cols.forEach(c => hr.append(el('th', c.c || '', c.h))); thead.append(hr);
  shown.forEach(d => {
    tot[cur_(d)] = (tot[cur_(d)] || 0) + (d.value || 0);
    const tr = el('tr'), sc = secOf(d); if (sc) tr.style.setProperty('--sc', sc.color);   // marca na cor do setor
    cols.forEach(c => {
      const td = el('td', c.c || ''); td.dataset.l = c.h;
      if (c.name) {   // lápis e lixeira ficam ao lado do nome do estabelecimento
        td.append(el('strong', '', d.store || d.desc || '—'), ' ', btn('✏️', 'Editar', () => cb.edit(d.id)), btn('🗑️', 'Excluir', () => cb.del(d.id)));
        if (d.items && d.items.length) {   // itens da compra: recolhidos, abrem na setinha
          const det = el('details', 'items'); det.append(el('summary', '', `Itens (${d.items.length})`));
          d.items.forEach(i => det.append(el('div', 'notes', itemLine(i, cur_(d)))));
          td.append(det);
        }
      } else if (c.value) { td.textContent = money(d.value || 0, cur_(d)); if (!d.value) { td.classList.add('zero'); td.title = 'Sem valor: use ✏️ para informar'; } }
      else if (c.link) { if (d.link) { const a = el('a', '', 'DANFE'); a.href = d.link; a.target = '_blank'; a.rel = 'noopener'; td.append(a); } }
      else { td.textContent = c.get(d); if (c.tip) td.title = c.tip(d); }
      tr.append(td);
    });
    tb.append(tr);
  });
  const vi = cols.findIndex(c => c.value), after = cols.length - vi - 1;   // rodapé: um total por moeda, sob a coluna Valor
  const tf = el('tfoot'), fr = el('tr'), lab = el('td', '', Object.keys(tot).length > 1 ? 'Totais' : 'Total');
  if (vi > 0) lab.colSpan = vi;
  fr.append(lab, totalsCell(tot)); if (after > 0) { const e = el('td'); e.colSpan = after; fr.append(e); }
  tf.append(fr); t.append(thead, tb, tf);
  const wrap = el('div', 'tscroll'); wrap.append(t); body.append(wrap);
}
