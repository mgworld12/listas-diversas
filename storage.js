import { DEFAULTS } from './config.js';
const KEY = 'listasSetores.v2';   // chave antiga do localStorage (só lida na migração)
export const slug = n => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'setor';
// Identificador único (não repete entre celular e computador)
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Registra que o item/registro foi excluído, para a exclusão também valer ao juntar arquivos
export const tomb = (st, id) => { st.deleted[String(id)] = Date.now(); };
// Data da última alteração (itens antigos usam o momento em que foram criados)
export const ts = x => x.u || (Number(x.id) > 1e12 ? Number(x.id) : Date.parse(x.date) || 0);

// Garante a estrutura dos dados e remove restos de itens já excluídos
export function fix(st) {
  const l = st.list = st.list || {};
  ['prices', 'qtys', 'stores', 'buyUnits'].forEach(k => l[k] = l[k] || {});
  const has = id => st.items.some(i => String(i.id) === String(id));
  l.ids = (l.ids || []).filter(has);
  ['prices', 'qtys', 'stores', 'buyUnits'].forEach(k => Object.keys(l[k]).forEach(id => { if (!has(id)) delete l[k][id]; }));
  st.saved = st.saved || []; st.codes = st.codes || {}; st.docs = st.docs || []; st.learn = st.learn || {};
  st.deleted = st.deleted || {};
  st.meta = st.meta || {}; st.meta.device = st.meta.device || uid(); st.meta.lastExport = st.meta.lastExport || 0;
  st.saved.forEach(s => { s.id = s.id || 'l' + (Date.parse(s.date) || uid()); });
  [...st.items, ...st.docs, ...st.saved].forEach(x => { x.u = x.u || ts(x); });
  return st;
}
const old = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

// ---------- IndexedDB: guarda o estado inteiro numa única chave ----------
let dbp;
const db = () => dbp || (dbp = new Promise((ok, err) => {
  const r = indexedDB.open('listasDB', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
}));
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((ok, err) => {
    const t = d.transaction('kv', mode), r = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(r && r.result); t.onerror = t.onabort = () => err(t.error);
  });
};
export const kvGet = k => tx('readonly', s => s.get(k));
export const kvSet = (k, v) => tx('readwrite', s => s.put(v, k));

export async function load() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  let s = null;
  try { s = await kvGet('state'); } catch {}
  if (s && Array.isArray(s.items)) return fix(s);
  // Primeira vez com o banco novo: traz o que estava no localStorage (ele não é apagado)
  const o = old(KEY);
  s = o && Array.isArray(o.items) ? o : migrate();
  if (!s.unitsCleaned) { s.units = ['mg']; s.unitsCleaned = true; }
  fix(s);
  try { await kvSet('state', s); } catch {}
  return s;
}

const hooks = []; let timer = 0, last = null, warned = false;
export const afterSave = f => hooks.push(f);
async function flush() {
  if (!last) return; const st = last;
  try { await kvSet('state', st); hooks.forEach(f => f(st)); }
  catch { if (!warned) { warned = true; alert('Não foi possível salvar neste aparelho. Exporte um backup.'); } }
}
// Mesma chamada de antes (save(st)); agora grava no IndexedDB logo em seguida
export function save(st) { last = st; clearTimeout(timer); timer = setTimeout(flush, 300); }
addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); flush(); } });

// Converte os dados da versão antiga (itemsList, sectorsList...) para o formato novo
function migrate() {
  const st = structuredClone(DEFAULTS); st.items = []; st.unitsCleaned = true;
  const addSector = n => {
    let s = st.sectors.find(x => x.name === n);
    if (!s) { s = { id: slug(n), name: n, icon: '📁', color: '#6b7280' }; st.sectors.push(s); }
    return s;
  };
  (old('sectorsList') || []).forEach(addSector);
  (old('unidadesList') || []).forEach(u => { if (!st.units.includes(u)) st.units.push(u); });
  (old('itemsList') || []).forEach(o => st.items.push({
    id: o.id, name: o.name, sectorId: addSector(o.sector).id, qty: '', unit: '', color: null,
    notes: o.characteristics || '', done: false
  }));
  return st;
}
export function exportJSON(st) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' }));
  a.download = 'listas-setores-backup.json'; a.click(); URL.revokeObjectURL(a.href);
}
export async function importJSON(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data.items) || !Array.isArray(data.sectors)) throw new Error('Arquivo inválido');
  return data;
}
