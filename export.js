// A biblioteca SheetJS é carregada só quando você clica em "Salvar .xlsx"
const loadLib = () => window.XLSX ? Promise.resolve() : new Promise((ok, err) => {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = ok; s.onerror = err; document.head.append(s);
});
// Linhas da lista atual: subtotal = preço × quantidade a comprar (1 se vazia)
export function snapshot(st) {
  const rows = []; let total = 0;
  st.sectors.forEach(sec => st.items.filter(i => i.sectorId === sec.id && st.list.ids.includes(i.id)).forEach(it => {
    const p = Number(st.list.prices[it.id]) || 0, b = Number(st.list.qtys[it.id]) || 0, sub = p * (b || 1); total += sub;
    rows.push([sec.name, it.name, it.color ? it.color.name : '', [it.qty, it.unit].filter(Boolean).join(' '), it.content || '', b || '', b ? (st.list.buyUnits[it.id] || 'unidade(s)') : '', p || '', sub || '', st.list.stores[it.id] || '', it.notes || '']);
  }));
  return { rows, total };
}
export async function exportXlsx(rows, total, date = new Date()) {
  if (!rows.length) return alert('Marque ao menos um item para a lista.');
  await loadLib();
  // Listas salvas antes desta versão têm 9 colunas; as novas têm 11
  const H = rows[0].length === 11
    ? ['Setor', 'Item', 'Cor', 'Medida', 'Conteúdo', 'Qtd. a comprar', 'Tipo', 'Preço unit. (R$)', 'Subtotal (R$)', 'Loja / Mercado', 'Observações']
    : ['Setor', 'Item', 'Cor', 'Qtd. a comprar', 'Medida', 'Preço unit. (R$)', 'Subtotal (R$)', 'Loja / Mercado', 'Observações'];
  const W = rows[0].length === 11 ? [16, 28, 12, 14, 18, 14, 12, 16, 14, 22, 32] : [16, 28, 12, 14, 16, 16, 14, 22, 32];
  const data = [['Data', date.toLocaleDateString('pt-BR')], [], H, ...rows, [], [...Array(H.length - 4).fill(''), 'Total (R$)', total]];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = W.map(wch => ({ wch }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Lista');
  XLSX.writeFile(wb, `lista-${date.toISOString().slice(0, 10)}.xlsx`);
}
