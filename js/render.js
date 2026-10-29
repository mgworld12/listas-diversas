import { BUY_UNITS } from './config.js';
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
export const info = it => [[it.qty, it.unit].filter(Boolean).join(' '), it.brand, it.content, it.volume].filter(Boolean).join(' • ');

export function render(st, listMode, cb) {
  const box = document.getElementById('sectors'); box.replaceChildren();
  st.sectors.forEach(sec => {
    const items = st.items.filter(i => i.sectorId === sec.id).sort((a, b) => a.done - b.done);
    const card = el('section', 'sector'); card.style.setProperty('--sc', sec.color);
    const head = el('header', 'sector-head'), acts = el('div', 'acts');
    acts.append(btn('◀', 'Mover para trás', () => cb.secMove(sec.id, -1), 'mv'), btn('▶', 'Mover para frente', () => cb.secMove(sec.id, 1), 'mv'),
      btn('✏️', 'Editar setor', () => cb.secEdit(sec.id)), btn('🗑️', 'Excluir setor', () => cb.secDel(sec.id)));
    head.append(el('span', 'logo', sec.icon), el('h2', '', sec.name), acts, el('span', 'count', items.length));
    card.append(head);
    if (!items.length) card.append(el('p', 'empty', 'Nenhum item neste setor.'));
    items.forEach(it => card.append(itemCard(it, st, listMode, cb)));
    box.append(card);
  });
}

function itemCard(it, st, listMode, cb) {
  const row = el('div', 'item' + (it.done && !listMode ? ' done' : ''));
  const chk = el('input'); chk.type = 'checkbox'; chk.style.width = 'auto';
  if (listMode) { chk.checked = st.list.ids.includes(it.id); chk.setAttribute('aria-label', 'Incluir na lista'); chk.onchange = () => cb.select(it.id); }
  else { chk.checked = it.done; chk.setAttribute('aria-label', 'Concluído'); chk.onchange = () => cb.toggle(it.id); }
  const body = el('div', 'body');
  body.append(nameEl(it));
  if (info(it)) body.append(el('div', 'meta', info(it)));
  if (it.notes) body.append(el('div', 'notes', it.notes));
  const acts = el('div', 'acts');
  const a = el('a', '', '🔍'); a.href = 'https://www.google.com/search?q=' + encodeURIComponent('"' + it.name + '"');
  a.target = '_blank'; a.rel = 'noopener'; a.title = 'Buscar no Google';
  acts.append(a, btn('✏️', 'Editar', () => cb.edit(it.id)), btn('🗑️', 'Excluir', () => cb.remove(it.id)));
  const t = thumb(it); row.append(chk, ...(t ? [t] : []), body, acts);
  return row;
}

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

// Compras (NF) e contas cadastradas, em tabela: colunas alinhadas e largura conforme o maior texto
export function renderDocs(st, cb) {
  const box = document.getElementById('docsPanel'); box.replaceChildren(); box.hidden = !st.docs.length;
  if (!st.docs.length) return;
  box.append(el('h2', '', 'Compras e contas'));
  const docs = [...st.docs].sort((a, b) => (b.date || '').localeCompare(a.date || '')), cur = d => d.currency || 'BRL';
  const secOf = d => { const s = st.sectors.find(x => x.id === d.sectorId); return s ? `${s.icon} ${s.name}` : ''; };
  const all = [
    { h: 'Data', c: 'nw', always: 1, get: d => (d.type === 'nf' ? '🧾 ' : '💡 ') + (d.date ? d.date.split('-').reverse().join('/') : '') },
    { h: 'Estabelecimento', always: 1, name: 1 },
    { h: 'CNPJ', c: 'nw num', get: d => d.cnpj ? cnpjFmt(d.cnpj) : '' },
    { h: 'Setor', c: 'nw', get: secOf },
    { h: 'Referente a', get: d => d.type === 'nf' ? '' : d.desc || '' },
    { h: 'Valor', c: 'nw num val', always: 1, value: 1 },
    { h: 'Nota', c: 'nw', link: 1 }
  ];
  const cols = all.filter(c => c.always || docs.some(d => c.link ? d.link : c.get(d)));   // colunas sem nenhum dado ficam ocultas
  const t = el('table', 'dtable'), thead = el('thead'), hr = el('tr'), tb = el('tbody'), tot = {};
  cols.forEach(c => hr.append(el('th', c.c || '', c.h))); thead.append(hr);
  docs.forEach(d => {
    tot[cur(d)] = (tot[cur(d)] || 0) + (d.value || 0);
    const tr = el('tr');
    cols.forEach(c => {
      const td = el('td', c.c || ''); td.dataset.l = c.h;
      if (c.name) {   // a lixeira fica ao lado do nome do estabelecimento
        td.append(el('strong', '', d.store || d.desc || '—'), ' ', btn('🗑️', 'Excluir', () => cb.del(d.id)));
        if (d.items && d.items.length) {   // itens da compra: recolhidos, abrem na setinha
          const det = el('details', 'items'); det.append(el('summary', '', `Itens (${d.items.length})`));
          d.items.forEach(i => det.append(el('div', 'notes', [i.name, i.qty && 'x' + i.qty, i.total != null && money(i.total, cur(d))].filter(Boolean).join(' • '))));
          td.append(det);
        }
      } else if (c.value) td.textContent = money(d.value || 0, cur(d));
      else if (c.link) { if (d.link) { const a = el('a', '', 'Abrir nota'); a.href = d.link; a.target = '_blank'; a.rel = 'noopener'; td.append(a); } }
      else td.textContent = c.get(d);
      tr.append(td);
    });
    tb.append(tr);
  });
  // Rodapé: um total por moeda, alinhado sob a coluna Valor
  const vi = cols.findIndex(c => c.value), after = cols.length - vi - 1;
  const parts = Object.entries(tot).sort(([a], [b]) => a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b));
  const tf = el('tfoot'), fr = el('tr'), lab = el('td', '', parts.length > 1 ? 'Totais' : 'Total'), sum = el('td', 'nw num val');
  if (vi > 0) lab.colSpan = vi;
  parts.forEach(([c, v]) => sum.append(el('div', '', money(v, c))));
  fr.append(lab, sum); if (after > 0) { const e = el('td'); e.colSpan = after; fr.append(e); }
  tf.append(fr); t.append(thead, tb, tf);
  const wrap = el('div', 'tscroll'); wrap.append(t); box.append(wrap);
}
