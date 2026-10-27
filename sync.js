// Levar os dados entre celular e computador (arquivo de lote) e gravar na pasta do HD (só no computador)
import { fix, save, afterSave, kvGet, kvSet, ts, uid } from './storage.js';
const $ = id => document.getElementById(id);
export const hasDir = 'showDirectoryPicker' in window && !/Android|iPhone|iPad/i.test(navigator.userAgent);
let getSt, onChange, dir = null, wait = null, err = '', timer = 0, bakDone = false;

// ---------- Juntar os dados de outro arquivo aos atuais ----------
// Regra: vale a alteração mais recente; o que foi excluído (e não alterado depois) continua excluído.
export function merge(st, inc) {
  const n = { add: 0, upd: 0, del: 0 }, dead = st.deleted;
  for (const [k, t] of Object.entries(inc.deleted || {})) dead[k] = Math.max(dead[k] || 0, t);
  for (const key of ['items', 'docs', 'saved']) {
    const list = st[key], pos = new Map(list.map((x, i) => [String(x.id), i]));
    (inc[key] || []).forEach(x => {
      if (!x.id) x.id = 'l' + (Date.parse(x.date) || uid());
      x.u = x.u || ts(x);
      const id = String(x.id);
      if ((dead[id] || 0) >= x.u) return;
      if (!pos.has(id)) { pos.set(id, list.push(x) - 1); n.add++; }
      else if (x.u > list[pos.get(id)].u) { list[pos.get(id)] = x; n.upd++; }
    });
    st[key] = list.filter(x => { if ((dead[String(x.id)] || 0) >= x.u) { n.del++; return false; } return true; });
  }
  const sec = new Set(st.sectors.map(s => s.id)); (inc.sectors || []).forEach(s => { if (!sec.has(s.id)) st.sectors.push(s); });
  (inc.units || []).forEach(u => { if (!st.units.includes(u)) st.units.push(u); });
  const col = new Set(st.colors.map(c => c.name)); (inc.colors || []).forEach(c => { if (!col.has(c.name)) st.colors.push(c); });
  Object.assign(st.learn, { ...(inc.learn || {}), ...st.learn });
  Object.assign(st.codes, { ...(inc.codes || {}), ...st.codes });
  fix(st); return n;
}
export async function mergeFile(file) {
  const d = JSON.parse(await file.text());
  if (!Array.isArray(d.items) || !Array.isArray(d.sectors)) throw new Error('Arquivo inválido');
  const st = getSt(), n = merge(st, d); save(st); onChange(); return n;
}

// ---------- Arquivo de lote: só o que mudou desde a última exportação ----------
function build(st) {
  const since = st.meta.lastExport, ch = a => a.filter(x => x.u > since), items = ch(st.items), codes = {};
  items.forEach(i => { if (i.code && st.codes[i.code]) codes[i.code] = st.codes[i.code]; });
  const deleted = Object.fromEntries(Object.entries(st.deleted).filter(([, t]) => t > since));
  return { kind: 'lote', v: 1, device: st.meta.device, created: Date.now(), sectors: st.sectors, units: st.units, colors: st.colors,
    learn: st.learn, codes, items, docs: ch(st.docs), saved: ch(st.saved), deleted };
}
const count = L => L.items.length + L.docs.length + L.saved.length + Object.keys(L.deleted).length;

export async function exportLote(share) {
  const st = getSt(), L = build(st);
  if (!count(L)) return alert('Nada novo desde a última exportação. Para levar tudo, use "Salvar backup".');
  const d = new Date(), name = `lote-${d.toLocaleDateString('sv-SE')}-${d.toTimeString().slice(0, 5).replace(':', '')}.json`;
  const file = new File([JSON.stringify(L)], name, { type: 'application/json' });
  if (share) {
    try { await navigator.share({ files: [file], title: 'Listas Diversas' }); }
    catch (e) { if (e.name !== 'AbortError') alert('Não foi possível compartilhar. Use "Exportar alterações".'); return; }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    alert(`${count(L)} alteração(ões) salva(s) em ${name} (pasta Downloads). Leve o arquivo ao computador e use "Juntar arquivo".`);
  }
  st.meta.lastExport = L.created; save(st);
}

// ---------- Pasta do HD (computador) ----------
const perm = async (h, ask) => { const o = { mode: 'readwrite' }; return (await h.queryPermission(o)) === 'granted' || (ask && (await h.requestPermission(o)) === 'granted'); };
const put = async (name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
async function readFile(h) {
  let f; try { f = await (await h.getFileHandle('casa.json')).getFile(); } catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  const d = JSON.parse(await f.text());
  if (!Array.isArray(d.items) || !Array.isArray(d.sectors)) throw new Error('casa.json inválido');
  return d;
}
async function attach(h) {
  for await (const _ of h.values()) break;   // falha se o HD não estiver conectado
  const st = getSt(), data = await readFile(h);
  if (data) merge(st, data);
  dir = h; wait = null; err = ''; bakDone = false;
  await kvSet('dir', h); save(st); onChange();
}
async function push() {
  if (!dir) return;
  try {
    if (!bakDone) {   // antes da 1ª gravação, guarda uma cópia do casa.json anterior
      try { const f = await (await dir.getFileHandle('casa.json')).getFile(); await put('casa.bak.json', await f.text()); bakDone = true; }
      catch (e) { if (e.name === 'NotFoundError') bakDone = true; else throw e; }
    }
    await put('casa.json', JSON.stringify(getSt())); err = '';
  } catch { err = 'Não consegui gravar na pasta do HD (ele está conectado?). Os dados continuam salvos neste navegador.'; }
  status();
}
export async function pickDir() {
  try {
    if (wait) {
      if (await perm(wait, true)) return await attach(wait);
      if (!confirm('Sem permissão para a pasta anterior. Escolher outra pasta?')) return;
    }
    await attach(await showDirectoryPicker({ id: 'casa-estoque', mode: 'readwrite' }));
  } catch (e) { if (e.name !== 'AbortError') alert('Não foi possível usar essa pasta: ' + e.message); }
}

function status() {
  const st = getSt(); if (!st) return;
  const t = [], n = count(build(st));
  if (hasDir) {
    t.push(dir ? `📁 Pasta do HD conectada: ${dir.name}. O que você salva é gravado lá.`
      : wait ? `📁 A pasta "${wait.name}" precisa de permissão: clique em "Reconectar pasta do HD".` : '📁 Nenhuma pasta do HD conectada.');
    $('dirBtn').textContent = wait ? 'Reconectar pasta do HD' : dir ? 'Trocar pasta do HD' : 'Abrir pasta do HD';
  }
  if (err) t.push('⚠️ ' + err);
  if (!dir && n) t.push(`📤 ${n} alteração(ões) ainda não exportadas para o computador.`);
  $('sync').textContent = t.join(' ');
}

export async function initSync(get, changed) {
  getSt = get; onChange = changed;
  let can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] })); } catch {}
  $('shareBtn').hidden = !can; $('dirBtn').hidden = !hasDir;
  afterSave(() => { status(); if (dir) { clearTimeout(timer); timer = setTimeout(push, 1500); } });
  if (hasDir) {
    let h = null; try { h = await kvGet('dir'); } catch {}
    if (h) {
      try { if (await perm(h, false)) await attach(h); else wait = h; }
      catch { wait = h; err = 'Não encontrei a pasta do HD. Conecte o HD e clique em "Reconectar pasta do HD".'; }
    }
  }
  status();
}
