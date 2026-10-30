import { ICONS, KEYWORDS } from './config.js';
import { load, save, slug, fix, uid, tomb, importJSON } from './storage.js';
import { initSync, exportLote, mergeFile, mergeData, pickDir, saveBackup, readDirBackup, safetyCopy } from './sync.js';
import { render, renderResults, renderList, updateTotals, renderSaved, renderDocs, stockState, itemLine } from './render.js';
import { exportXlsx, exportDocs, snapshot } from './export.js';
import { scanCode, resizeImage, codeFromImage } from './media.js';
import { lookupProduct, fetchImage, lookupCnpj, parseNF, parseNFText, fetchNFPage, parseBill, cnpjFmt } from './docs.js';

let st = await load(); let editing = null; let editingDoc = null; let docItems = []; let listMode = false; let searches = []; let auto = false; let image = '';
const $ = id => document.getElementById(id);
const NEW = '__new__';
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const xlsxErr = () => alert('Não foi possível gerar o .xlsx. Verifique a conexão com a internet.');

// ---------- Diálogo para criar/editar setor, unidade ou cor ----------
function ask(kind, init = {}) {
  return new Promise(res => {
    const dlg = $('dlg');
    $('dlgTitle').textContent = { sector: init.name ? 'Editar setor' : 'Novo setor', unit: 'Nova unidade', color: 'Nova cor' }[kind];
    $('dlgName').value = init.name || ''; $('dlgColor').value = init.color || '#4f46e5';
    $('dlgIcons').hidden = kind !== 'sector';
    $('dlgColorLabel').hidden = kind === 'unit';
    if (kind === 'sector') {
      $('dlgIcons').replaceChildren(...ICONS.map((ic, i) => {
        const l = document.createElement('label'), r = document.createElement('input'), s = document.createElement('span');
        r.type = 'radio'; r.name = 'ic'; r.value = ic; r.checked = init.icon ? ic === init.icon : i === 0; s.textContent = ic; l.append(r, s); return l;
      }));
    }
    dlg.returnValue = '';
    dlg.onclose = () => res(dlg.returnValue === 'ok' && $('dlgName').value.trim()
      ? { name: $('dlgName').value.trim(), icon: ($('dlgIcons').querySelector('input:checked') || {}).value || init.icon, color: $('dlgColor').value } : null);
    dlg.showModal(); $('dlgName').focus();
  });
}


// ---------- Setor: escolhido na hora de cadastrar NF, Conta ou Produto ----------
function fillSectors(value = $('regSector').value) {
  const s = $('regSector'); s.replaceChildren();
  const add = (v, t, dis) => { const o = new Option(t, v); o.disabled = !!dis; s.append(o); };
  add('', 'Selecione o setor...', true);
  [...st.sectors].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(x => add(x.id, `${x.icon} ${x.name}`));
  add(NEW, '+ Adicionar...'); s.value = value || '';
}
$('regSector').onchange = async e => {
  auto = false;
  if (e.target.value !== NEW) return;
  const n = await ask('sector'), name = n && n.name.toUpperCase();
  if (name && !st.sectors.some(s => s.name === name)) {
    st.sectors.push({ id: slug(name) + '-' + Date.now().toString(36), name, icon: n.icon, color: n.color }); save(st); fillSectors(st.sectors.at(-1).id); refresh();
  } else fillSectors('');
};
// Sugere o setor pelo nome do produto (primeiro o que já foi cadastrado, depois palavras-chave). Nunca troca um setor escolhido por você.
$('pName').oninput = e => {
  if ($('regSector').value && !auto) return;
  const v = norm(e.target.value.trim()); if (!v) return;
  let id = st.learn[v];
  if (!id) for (const [k, words] of Object.entries(KEYWORDS)) if (words.some(w => v.includes(norm(w)))) { id = k; break; }
  if (id && st.sectors.some(s => s.id === id)) { $('regSector').value = id; auto = true; }
};

const cbs = { toggle, edit, remove, select, secMove, secEdit, secDel, stock, addLow, docEdit: editDoc, docDel: delDoc, refresh: () => refresh(), secManage: openSectors };
const refresh = () => {
  render(st, listMode, cbs);
  renderResults(st, searches, norm, { edit, drop: t => { searches = searches.filter(x => x !== t); refresh(); } });
  renderSaved(st, {
    xlsx: i => exportXlsx(st.saved[i].rows, st.saved[i].total, new Date(st.saved[i].date)).catch(xlsxErr),
    del: i => { if (confirm('Excluir esta lista salva?')) { tomb(st, st.saved[i].id); st.saved.splice(i, 1); save(st); refresh(); } }
  });
  renderDocs(st, {
    del: delDoc, edit: editDoc, xlsx: list => exportDocs(list, st.sectors).catch(xlsxErr)
  });
  if (listMode) renderList(st, { price, store, qty, buyUnit });
  if ($('secDlg').open) renderSecList();
};

// ---------- Imagem do produto ----------
function setImage(v) { image = v; $('imgPrev').hidden = $('imgDel').hidden = !v; if (v) $('imgPrev').src = v; else $('imgPrev').removeAttribute('src'); }
$('imgBtn').onclick = () => $('imgFile').click();
$('imgDel').onclick = () => setImage('');
$('imgFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { setImage(await resizeImage(f)); } catch { return alert('Não foi possível usar essa imagem.'); }
  if ($('regCode').value.trim()) return;
  const c = await codeFromImage(f);   // se a foto mostrar o código de barras, os dados são buscados sozinhos
  if (c) { $('regCode').value = c; rmsg('Código lido da foto.'); readProduct(c); }
  else rmsg('A foto foi usada como imagem do produto. Não achei um código de barras nela; preencha os dados.');
};
$('regPhoto').onclick = () => { showBody(); $('imgFile').click(); };

// ---------- Janela única de cadastro: NF, Conta e Produto ----------
const TITLES = { nf: 'Cadastrar NF', conta: 'Cadastrar Conta', produto: 'Cadastrar Produto' };
let regType = 'nf', docKey = '', docLink = '';
const rmsg = t => { $('regMsg').textContent = t; };
const showBody = () => { $('regChoice').hidden = true; $('regBody').hidden = false; $('regSave').hidden = false; };

// Valor no formato brasileiro (R$ 1.234,56) com opção de outras moedas. Digite só os números: 12345 vira R$ 123,45.
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'PYG', 'UYU', 'CAD', 'CHF', 'JPY', 'CNY'], OTHER = '__outra__';
const curFmt = c => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c });
const curDec = c => curFmt(c).resolvedOptions().maximumFractionDigits;
let docVal = 0, curNow = 'BRL';
function fillCur(value = 'BRL') {
  const codes = [...new Set([...CURRENCIES, ...st.docs.map(d => d.currency).filter(Boolean), value])];
  const s = $('docCur'); s.replaceChildren(...codes.map(c => new Option(c, c)), new Option('Outra...', OTHER)); s.value = curNow = value;
}
function setValue(n) {
  const c = $('docCur').value, k = 10 ** curDec(c);
  docVal = Math.round((Number(n) || 0) * k) / k;
  $('docValue').value = docVal ? curFmt(c).format(docVal) : '';
}
$('docValue').oninput = e => setValue(Number(e.target.value.replace(/\D/g, '').slice(0, 13)) / 10 ** curDec($('docCur').value));
$('docCur').onchange = e => {
  if (e.target.value === OTHER) {
    const c = (prompt('Código da moeda com 3 letras (ex.: USD, EUR, GBP):') || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(c)) fillCur(c); else { fillCur(curNow); if (c) alert('Código de moeda inválido.'); }
  } else curNow = e.target.value;
  setValue(docVal);
};
function openReg(type, it = null, doc = null) {
  regType = type; editing = it ? it.id : null; editingDoc = doc ? doc.id : null; docKey = ''; docLink = ''; docItems = []; auto = false;
  const prod = type === 'produto';
  $('regTitle').textContent = it ? 'Editar produto' : doc ? 'Editar registro' : TITLES[type];
  $('docFields').hidden = prod; $('prodFields').hidden = !prod; $('regPhoto').hidden = !prod;
  $('docStoreL').textContent = type === 'nf' ? 'Estabelecimento:' : 'Instituição:';
  $('docDescWrap').hidden = type !== 'conta'; $('nfExtra').hidden = type !== 'nf';
  $('docDate').required = !prod; $('pName').required = prod; $('docDate').classList.remove('warn');
  ['regCode', 'docStore', 'docCnpj', 'docValue', 'docDesc', 'nfPaste', 'pName', 'pMaker', 'pBrand', 'pComp', 'pQty', 'pPortion', 'pVol', 'pStock', 'pMin', 'pExp', 'pSpecs'].forEach(i => $(i).value = '');
  fillCur('BRL'); docVal = 0; setImage(''); fillSectors(''); rmsg(''); renderItemsBox(); showNfExtra();
  $('docDate').value = type === 'nf' ? new Date().toLocaleDateString('sv-SE') : '';
  if (it) {
    const set = (id, v) => { $(id).value = v ?? ''; };
    set('regCode', it.code); set('pName', it.name); set('pMaker', it.maker); set('pBrand', it.brand); set('pComp', it.comp);
    set('pQty', it.content); set('pPortion', it.portion); set('pVol', it.volume); set('pSpecs', it.notes);
    set('pStock', it.stock); set('pMin', it.min); set('pExp', it.expiry);
    fillSectors(it.sectorId); setImage(it.image || '');
  }
  if (doc) {
    docKey = doc.key || ''; docLink = doc.link || ''; docItems = (doc.items || []).map(i => ({ ...i }));
    $('regCode').value = doc.key || ''; $('docStore').value = doc.store || ''; $('docCnpj').value = doc.cnpj ? maskCnpj(doc.cnpj) : ''; $('docDesc').value = doc.desc || '';
    fillCur(doc.currency || 'BRL'); setValue(doc.value || 0); $('docDate').value = doc.date || ''; fillSectors(doc.sectorId || '');
    renderItemsBox(); showNfExtra();
  }
  const ready = !!(it || doc);   // edição abre direto nos campos
  $('regChoice').hidden = ready; $('regBody').hidden = !ready; $('regSave').hidden = !ready;
  $('regDlg').returnValue = ''; $('regDlg').showModal();
}
// Itens da compra: recolhidos, abrem e fecham na setinha
function renderItemsBox() {
  const b = $('docItems'); b.replaceChildren(); b.hidden = !docItems.length; if (!docItems.length) return;
  const det = document.createElement('details'), sum = document.createElement('summary'); det.className = 'items'; sum.textContent = `Itens da compra (${docItems.length})`; det.append(sum);
  docItems.forEach(i => { const p = document.createElement('div'); p.className = 'notes'; p.textContent = itemLine(i, $('docCur').value || 'BRL'); det.append(p); });
  b.append(det);
}
function showNfExtra() { $('nfOpen').hidden = !docLink; $('nfOpen').href = docLink || '#'; }
function setDocDate(iso, approx) { $('docDate').value = iso; $('docDate').classList.toggle('warn', !!approx); }
$('docDate').oninput = $('docDate').onchange = () => $('docDate').classList.remove('warn');
function delDoc(id) { if (confirm('Excluir este registro?')) { tomb(st, id); st.docs = st.docs.filter(d => d.id !== id); save(st); refresh(); } }
function editDoc(id) { const d = st.docs.find(x => x.id === id); if (d) openReg(d.type, null, d); }
// Nome do estabelecimento pelo CNPJ: fica guardado depois da primeira consulta (e vale também sem internet)
async function storeName(cnpj) {
  if (st.cnpjs[cnpj]) return st.cnpjs[cnpj];
  const n = await lookupCnpj(cnpj); if (n) { st.cnpjs[cnpj] = n; save(st); } return n;
}
$('nfBtn').onclick = () => openReg('nf');
$('billBtn').onclick = () => openReg('conta');
$('prodBtn').onclick = () => openReg('produto');
$('regType').onclick = () => { showBody(); $('regCode').focus(); };
$('regScan').onclick = async () => { const c = await scanCode(); if (c) { showBody(); $('regCode').value = c; readCode(c); } };

// Os dados aparecem sozinhos: ao ler com a câmera, ao colar/digitar (após uma pausa) ou ao apertar Enter
let readTimer = 0;
$('regCode').oninput = e => { clearTimeout(readTimer); readTimer = setTimeout(() => readCode(e.target.value), 600); };
$('regCode').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(readTimer); readCode(e.target.value); } };
function readCode(text) {
  text = text.trim(); if (!text) return;
  return regType === 'nf' ? readNF(text) : regType === 'conta' ? readBill(text) : readProduct(text);
}
async function readNF(text) {
  if (text.length > 300 && /Dados dos Produtos|Chave de Acesso|Valor Total/i.test(text)) { $('regCode').value = ''; return applyNFText(text); }   // página inteira colada no campo do código
  const r = parseNF(text);
  if (!r) { const n = text.replace(/\D/g, '').length; return rmsg(n && n < 44 && !/^https?:/i.test(text) ? `A chave da nota tem 44 números; faltam ${44 - n}.` : 'Não encontrei a chave de acesso (44 dígitos) neste código.'); }
  const dup = st.docs.find(d => d.key === r.key && d.id !== editingDoc); if (dup) return openDup(dup, r.link);
  docKey = r.key; docLink = r.link; $('docCnpj').value = maskCnpj(r.cnpj); showNfExtra();
  if (r.date) setDocDate(r.date, false);
  else {   // a chave só informa o mês e o ano da emissão: o dia precisa ser conferido
    const [y, m] = r.ym.split('-').map(Number), now = new Date(), same = now.getFullYear() === y && now.getMonth() + 1 === m;
    setDocDate(same ? now.toLocaleDateString('sv-SE') : `${y}-${String(m).padStart(2, '0')}-01`, true);
  }
  if (r.value) { fillCur('BRL'); setValue(r.value); }
  rmsg('Nota lida. Buscando o estabelecimento pelo CNPJ...');
  let tip = r.value ? 'Nota lida. Confira os dados.' : 'Nota lida. Informe o valor.';
  try { const n = await storeName(r.cnpj); if (n && !$('docStore').value) $('docStore').value = autoStore = n; }
  catch { tip = 'Nota lida, mas não achei o estabelecimento na internet. Digite o nome.'; }
  rmsg(tip + (r.date ? '' : ' A nota só informa o mês: confira o dia (campo destacado).') + ' Para trazer itens e valor, use "colar o texto da página".');
  if (r.link) fetchNFPage(r.link).then(tx => { if (tx && docKey === r.key) applyNFText(tx, true); }).catch(() => {});   // quase sempre o site da Fazenda bloqueia; então o texto é colado
}
// Documento já cadastrado: abre o registro existente para completar ou corrigir (valor, itens, setor...), em vez de recusar
function openDup(dup, link, text) {
  $('regDlg').close(); openReg(dup.type, null, dup);
  if (!docLink && link) { docLink = link; showNfExtra(); }
  rmsg(`Este documento já estava cadastrado (${dup.store || 'sem nome'}${dup.date ? ', ' + dup.date.split('-').reverse().join('/') : ''}). Abri o registro para você completar ou corrigir.` +
    (dup.type === 'nf' ? ' Para trazer data, valor e itens, copie a página da DANFE e use "Colar da área de transferência".' : ''));
  if (text) applyNFText(text);
}
// Preenche tudo o que a página da nota traz: estabelecimento, CNPJ, data, valor e itens
function applyNFText(text, quiet = false) {
  const r = parseNFText(text);
  if (!r.items.length && !r.value && !r.store) { if (!quiet) rmsg('Não reconheci os dados da nota nesse texto. Copie a página inteira da nota e cole de novo.'); return false; }
  if (docKey && r.key && r.key !== docKey) { rmsg('O texto copiado é de outra nota (a chave não confere com a que foi lida). Copie a nota certa ou feche e refaça o cadastro.'); return false; }
  if (r.key) {
    const dup = st.docs.find(d => d.key === r.key && d.id !== editingDoc); if (dup) { openDup(dup, '', text); return false; }
    docKey = r.key; $('regCode').value = r.key;
  }
  if (r.cnpj) { $('docCnpj').value = maskCnpj(r.cnpj); if (r.store) st.cnpjs[r.cnpj] = r.store; }
  const cur = () => $('docStore').value.trim();
  if (r.store && (!cur() || cur() === autoStore)) $('docStore').value = autoStore = r.store;
  if (r.date) setDocDate(r.date, false);
  if (r.value) { fillCur('BRL'); setValue(r.value); }
  docItems = r.items; renderItemsBox(); showNfExtra();
  rmsg(`Nota lida: ${r.items.length} item(ns)${r.value ? '' : '. Informe o valor'}. Confira os dados.`);
  return true;
}
// Colar da área de transferência: pelo botão, ou sozinho ao voltar da página da nota (o navegador pede permissão na primeira vez)
let lastClip = '', clipBusy = false;
const looksNF = t => !!t && t.length > 300 && /Dados dos Produtos|Chave de Acesso|Valor Total/i.test(t);
async function clipNF(auto) {
  if (clipBusy) return false; clipBusy = true;
  try {
    const t = await navigator.clipboard.readText();
    if (!looksNF(t)) { if (!auto) rmsg('A área de transferência não tem o texto de uma nota. Na página da nota, selecione tudo, copie e tente de novo.'); return false; }
    if (auto && t === lastClip) return false;
    lastClip = t; return applyNFText(t);
  } catch {
    if (!auto) { rmsg('Não consegui ler a área de transferência (permissão negada ou indisponível). Cole o texto no campo abaixo.'); $('nfExtra').querySelector('details').open = true; }
    return false;
  } finally { clipBusy = false; }
}
$('nfClip').onclick = () => clipNF(false);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('regDlg').open && regType === 'nf') clipNF(true); });
addEventListener('focus', () => { if ($('regDlg').open && regType === 'nf') clipNF(true); });
let pasteTimer = 0;
$('nfPaste').oninput = e => { clearTimeout(pasteTimer); pasteTimer = setTimeout(() => { if (e.target.value.trim()) applyNFText(e.target.value); }, 400); };
function readBill(text) {
  const r = parseBill(text);
  if (!r) { const n = text.replace(/\D/g, '').length; return rmsg(n && n < 44 && !text.startsWith('000201') ? '' : 'Código não reconhecido. Use o código de barras do boleto ou da conta (44 a 48 dígitos) ou o QR Code do Pix.'); }
  const dup = r.key && st.docs.find(d => d.key === r.key && d.id !== editingDoc); if (dup) return openDup(dup, '');
  docKey = r.key; $('docStore').value = r.store; $('docDesc').value = r.desc;
  if (r.value) { fillCur('BRL'); setValue(r.value); } if (r.date) $('docDate').value = r.date;
  rmsg(r.date ? 'Lido. O dia é o vencimento; confira os dados e o CNPJ.' : 'Lido. Informe o dia e confira os dados.');
}
async function readProduct(code) {
  code = code.trim(); rmsg('');
  const dup = st.items.find(i => i.code === code && i.id !== editing);
  if (dup) { $('regDlg').close(); alert(`Produto já cadastrado: "${dup.name}". Abrindo para edição.`); return openReg('produto', dup); }
  const fill = (id, v) => { if (v && !$(id).value) $(id).value = v; };
  const p = st.codes[code];
  if (p) {
    fill('pName', p.name); fill('pMaker', p.maker); fill('pBrand', p.brand); fill('pComp', p.comp); fill('pQty', p.content); fill('pPortion', p.portion); fill('pVol', p.volume); fill('pSpecs', p.notes);
    if (!$('regSector').value && p.sectorId && st.sectors.some(s => s.id === p.sectorId)) fillSectors(p.sectorId);
    if (p.image && !image) setImage(p.image);
    return rmsg('Produto conhecido: dados preenchidos. Confira e salve.');
  }
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return;
  rmsg('Procurando nas bases públicas...');
  try {
    const f = await lookupProduct(code);
    if ($('regCode').value.trim() !== code) return;
    if (!f) return rmsg('Não encontrado nas bases públicas. Preencha os dados; o app lembrará este código.');
    fill('pName', f.name); fill('pMaker', f.maker); fill('pBrand', f.brand); fill('pComp', f.comp); fill('pQty', f.quantity); fill('pPortion', f.portion); fill('pVol', f.volume); fill('pSpecs', f.specs);
    $('pName').oninput({ target: $('pName') });
    if (!$('regSector').value && f.food && st.sectors.some(s => s.id === 'mercado')) { $('regSector').value = 'mercado'; auto = true; }
    rmsg('Dados encontrados nas bases públicas. Confira e salve.');
    if (f.image && !image) try { setImage(await resizeImage(await fetchImage(f.image))); } catch {}
  } catch { rmsg('Sem conexão com as bases públicas. Preencha manualmente.'); }
}

// CNPJ digitado: máscara 00.000.000/0000-00 e, ao completar os 14 dígitos, busca o nome do estabelecimento na internet
const maskCnpj = v => String(v).replace(/\D/g, '').slice(0, 14)
  .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
let autoStore = '';   // último nome preenchido pela busca; um nome digitado por você nunca é trocado
$('docCnpj').oninput = async e => {
  e.target.value = maskCnpj(e.target.value);
  const d = e.target.value.replace(/\D/g, ''), cur = () => $('docStore').value.trim();
  if (d.length !== 14 || (cur() && cur() !== autoStore)) return;
  rmsg('Buscando o estabelecimento pelo CNPJ...');
  try {
    const n = await storeName(d);
    if ($('docCnpj').value.replace(/\D/g, '') !== d || (cur() && cur() !== autoStore)) return;
    if (n) { $('docStore').value = autoStore = n; rmsg('Estabelecimento encontrado pelo CNPJ. Confira o nome.'); }
    else rmsg('CNPJ não encontrado. Digite o nome.');
  } catch { rmsg('Sem conexão para buscar o CNPJ. Digite o nome.'); }
};

// ---------- Salvar o cadastro ----------
$('regForm').onsubmit = e => {
  if (e.submitter && e.submitter.value === 'cancel') return;   // "Cancelar" fecha a janela normalmente
  e.preventDefault();
  const sectorId = $('regSector').value;
  if (!sectorId || sectorId === NEW) return alert('Selecione um setor.');
  if (!(regType === 'produto' ? saveProduct(sectorId) : saveDoc(sectorId))) return;
  save(st); refresh(); $('regDlg').close('ok');
};
function saveDoc(sectorId) {
  const cnpj = $('docCnpj').value.replace(/\D/g, ''), store = $('docStore').value.trim();
  if (!docVal && !confirm('O valor está zerado. Salvar assim mesmo?\n\nVocê pode editar o registro depois (✏️).')) return false;
  const data = { type: regType, sectorId, store, cnpj, date: $('docDate').value, value: docVal || 0, currency: $('docCur').value, desc: $('docDesc').value.trim(), key: docKey, link: docLink, items: docItems };
  if (data.key && st.docs.some(x => x.key === data.key && x.id !== editingDoc)) { alert('Este documento já foi cadastrado.'); return false; }
  if (cnpj.length === 14 && store) st.cnpjs[cnpj] = store;
  const old = editingDoc && st.docs.find(x => x.id === editingDoc);
  if (old) Object.assign(old, data, { u: Date.now() }); else st.docs.push({ id: uid(), u: Date.now(), ...data });
  return true;
}
function saveProduct(sectorId) {
  const g = id => $(id).value.trim(), n = id => $(id).value === '' ? '' : Number($(id).value);
  const data = { name: g('pName'), sectorId, code: g('regCode'), maker: g('pMaker'), brand: g('pBrand'), comp: g('pComp'), content: g('pQty'), portion: g('pPortion'), volume: g('pVol'),
    stock: n('pStock'), min: n('pMin'), expiry: $('pExp').value, notes: g('pSpecs'), image };
  if (!editing && st.items.some(i => i.sectorId === sectorId && norm(i.name) === norm(data.name)) &&
      !confirm('Já existe um item com esse nome neste setor. Adicionar mesmo assim?')) return false;
  if (data.code && st.items.some(i => i.code === data.code && i.id !== editing)) { alert('Já existe um produto com esse código.'); return false; }
  st.learn[norm(data.name)] = sectorId;
  if (data.code) st.codes[data.code] = { ...data };
  if (editing) Object.assign(st.items.find(i => i.id === editing), data, { u: Date.now() });
  else st.items.push({ id: uid(), u: Date.now(), done: false, qty: '', unit: '', color: null, ...data });
  return true;
}
// Estoque: botões − e + no cartão; "estoque baixo" vai direto para a lista de compras
function stock(id, d) { const it = st.items.find(i => i.id === id); if (!it) return; it.stock = Math.max(0, (Number(it.stock) || 0) + d); it.u = Date.now(); save(st); refresh(); }
function addLow() {
  const ids = st.items.filter(i => stockState(i).low).map(i => i.id); if (!ids.length) return;
  if (!listMode) $('listMode').click();
  ids.forEach(id => { if (!st.list.ids.includes(id)) st.list.ids.push(id); }); save(st); refresh();
}
function edit(id) { const it = st.items.find(i => i.id === id); if (it) openReg('produto', it); }


// ---------- Janela "Setores": criar, ordenar, editar e excluir ----------
function openSectors() { renderSecList(); $('secDlg').showModal(); }
$('secClose').onclick = () => $('secDlg').close();
$('secAdd').onclick = async () => {
  const n = await ask('sector'); if (!n) return;
  const name = n.name.toUpperCase();
  if (st.sectors.some(s => s.name === name)) return alert('Já existe um setor com esse nome.');
  st.sectors.push({ id: slug(name) + '-' + Date.now().toString(36), name, icon: n.icon, color: n.color }); save(st); fillSectors(); refresh();
};
function renderSecList() {
  const box = $('secList'); box.replaceChildren();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const b = (txt, title, fn) => { const e = mk('button', '', txt); e.type = 'button'; e.title = title; e.onclick = fn; return e; };
  st.sectors.forEach(s => {
    const n = st.items.filter(x => x.sectorId === s.id).length + st.docs.filter(d => d.sectorId === s.id).length, r = mk('div', 'rrow');
    r.append(mk('span', '', s.icon), mk('strong', '', s.name), mk('span', 'notes', `${n} registro(s)`),
      b('↑', 'Subir', () => secMove(s.id, -1)), b('↓', 'Descer', () => secMove(s.id, 1)), b('✏️', 'Editar', () => secEdit(s.id)), b('🗑️', 'Excluir', () => secDel(s.id)));
    box.append(r);
  });
  if (!st.sectors.length) box.append(mk('p', 'empty', 'Nenhum setor. Crie o primeiro.'));
}

// ---------- Setores: reordenar, editar, excluir ----------
function secMove(id, d) {
  const a = st.sectors, i = a.findIndex(s => s.id === id), j = i + d;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; save(st); refresh();
}
async function secEdit(id) {
  const s = st.sectors.find(x => x.id === id), n = await ask('sector', s); if (!n) return;
  const name = n.name.toUpperCase();
  if (st.sectors.some(x => x.id !== id && x.name === name)) return alert('Já existe um setor com esse nome.');
  Object.assign(s, { name, icon: n.icon, color: n.color }); save(st); fillSectors(); refresh();
}
function secDel(id) {
  if (st.items.some(i => i.sectorId === id) || st.docs.some(d => d.sectorId === id)) return alert('Mova ou exclua os itens e registros deste setor antes de excluí-lo.');
  if (!confirm('Excluir este setor?')) return;
  st.sectors = st.sectors.filter(s => s.id !== id); save(st); fillSectors(''); refresh();
}

function toggle(id) { const it = st.items.find(i => i.id === id); it.done = !it.done; it.u = Date.now(); save(st); refresh(); }
function remove(id) { if (confirm('Excluir este item?')) { tomb(st, id); st.items = st.items.filter(i => i.id !== id); fix(st); save(st); refresh(); } }
$('clearDone').onclick = () => {
  const n = st.items.filter(i => i.done).length;
  if (!n) return alert('Nenhum item concluído.');
  if (confirm(`Remover ${n} item(ns) concluído(s)?`)) { st.items.filter(i => i.done).forEach(i => tomb(st, i.id)); st.items = st.items.filter(i => !i.done); fix(st); save(st); refresh(); }
};

// ---------- Busca entre setores ----------
$('searchForm').onsubmit = e => {
  e.preventDefault();
  $('q').value.split(/[,;]/).map(t => t.trim()).filter(Boolean)
    .forEach(t => { if (!searches.some(x => norm(x) === norm(t))) searches.push(t); });
  $('q').value = ''; refresh();
};

// ---------- Criar lista ----------
$('listMode').onclick = () => {
  listMode = !listMode;
  $('listMode').setAttribute('aria-pressed', listMode); $('listMode').classList.toggle('active', listMode);
  $('listPanel').hidden = !listMode; refresh();
};
function select(id) { const a = st.list.ids, i = a.indexOf(id); if (i < 0) a.push(id); else a.splice(i, 1); save(st); refresh(); }
function store(id, v) { st.list.stores[id] = v; save(st); }
function price(id, v) { st.list.prices[id] = v; save(st); updateTotals(st); }
function buyUnit(id, v) { st.list.buyUnits[id] = v; save(st); }
function qty(id, v) { st.list.qtys[id] = v; save(st); updateTotals(st); }
$('clearList').onclick = () => { if (confirm('Limpar a lista?')) { st.list = { ids: [], prices: {}, qtys: {}, stores: {}, buyUnits: {} }; save(st); refresh(); } };
$('saveList').onclick = () => {
  const s = snapshot(st); if (!s.rows.length) return alert('Marque ao menos um item para a lista.');
  const name = prompt('Nome da lista:', 'Lista de ' + new Date().toLocaleDateString('pt-BR')); if (!name) return;
  st.saved.push({ id: uid(), u: Date.now(), name: name.trim().slice(0, 60), date: new Date().toISOString(), rows: s.rows, total: s.total }); save(st); refresh();
};
$('printBtn').onclick = () => window.print();
$('xlsxBtn').onclick = () => { const s = snapshot(st); exportXlsx(s.rows, s.total).catch(xlsxErr); };

// ---------- Backup ----------
$('backupBtn').onclick = () => saveBackup();
$('restoreBtn').onclick = () => $('restoreFile').click();
// Por padrão JUNTA (não apaga nada); substituir tudo é a segunda opção e guarda uma cópia antes
async function applyBackup(d) {
  if (confirm('Juntar este backup aos dados atuais?\n\nOK = juntar (recomendado: não apaga nada)\nCancelar = ver a opção de substituir tudo')) {
    const n = mergeData(d); return alert(`Juntado: ${n.add} novo(s), ${n.upd} atualizado(s), ${n.del} excluído(s).`);
  }
  if (!confirm('Substituir TODOS os dados atuais pelo backup?\n\nUma cópia dos dados atuais será guardada antes.')) return;
  await safetyCopy(); st = fix(d); st.unitsCleaned = true; save(st); refresh();
}
$('restoreFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let d; try { d = await importJSON(f); } catch { return alert('Arquivo de backup inválido.'); }
  await applyBackup(d);
};
$('dirRestoreBtn').onclick = async () => { const d = await readDirBackup(); if (d) await applyBackup(d); };

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
fillSectors(''); refresh();

// ---------- Celular <-> computador e pasta do HD ----------
initSync(() => st, () => { fillSectors(); refresh(); });
$('loteBtn').onclick = () => exportLote(false);
$('shareBtn').onclick = () => exportLote(true);
$('mergeBtn').onclick = () => $('mergeFile').click();
$('mergeFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const n = await mergeFile(f); alert(`Juntado: ${n.add} novo(s), ${n.upd} atualizado(s), ${n.del} excluído(s).`); }
  catch { alert('Arquivo inválido.'); }
};
$('dirBtn').onclick = pickDir;
$('ver').textContent = 'Versão 14 carregada';