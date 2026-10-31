// Levar os dados entre celular e computador (arquivo de lote) e gravar na pasta do HD (só no computador)
import { fix, save, afterSave, kvGet, kvSet, ts, uid, exportJSON, collapse, docFps, itemFps } from './storage.js';
const $ = id => document.getElementById(id);
export const hasDir = 'showDirectoryPicker' in window && !/Android|iPhone|iPad/i.test(navigator.userAgent);
let getSt, onChange, dir = null, wait = null, err = '', timer = 0, bakDone = false, replacing = false;

// ---------- Juntar os dados de outro arquivo aos atuais ----------
// Regra: vale a alteração mais recente; o que foi excluído (e não alterado depois) continua excluído.
export function merge(st, inc) {
  st.cnpjs = st.cnpjs || {};
  const n = { add: 0, upd: 0, del: 0, dup: 0 }, dead = st.deleted;
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
    const base = key === 'saved' ? list : collapse(list, key === 'items' ? itemFps : docFps, dead, n);   // sem duplicados
    st[key] = base.filter(x => { if ((dead[String(x.id)] || 0) >= x.u) { n.del++; return false; } return true; });
  }
  const sec = new Set(st.sectors.map(s => s.id)); (inc.sectors || []).forEach(s => { if (!sec.has(s.id)) st.sectors.push(s); });
  (inc.units || []).forEach(u => { if (!st.units.includes(u)) st.units.push(u); });
  const col = new Set(st.colors.map(c => c.name)); (inc.colors || []).forEach(c => { if (!col.has(c.name)) st.colors.push(c); });
  Object.assign(st.learn, { ...(inc.learn || {}), ...st.learn });
  Object.assign(st.codes, { ...(inc.codes || {}), ...st.codes });
  Object.assign(st.cnpjs, { ...(inc.cnpjs || {}), ...st.cnpjs });
  fix(st); return n;
}
// Unifica duplicados que já existam nos dados (devolve quantos foram unificados)
export function dedupe(st) {
  const n = { dup: 0 }; st.items = collapse(st.items, itemFps, st.deleted, n); st.docs = collapse(st.docs, docFps, st.deleted, n); fix(st); return n.dup;
}
export function mergeData(d) {
  if (!Array.isArray(d.items) || !Array.isArray(d.sectors)) throw new Error('Arquivo inválido');
  const st = getSt(), n = merge(st, d); save(st); onChange(); return n;
}
export async function mergeFile(file) { return mergeData(JSON.parse(await file.text())); }

// ---------- Arquivo de lote: só o que mudou desde a última exportação ----------
function build(st) {
  const since = st.meta.lastExport, ch = a => a.filter(x => x.u > since), items = ch(st.items), codes = {};
  items.forEach(i => { if (i.code && st.codes[i.code]) codes[i.code] = st.codes[i.code]; });
  const deleted = Object.fromEntries(Object.entries(st.deleted).filter(([, t]) => t > since));
  return { kind: 'lote', v: 1, device: st.meta.device, created: Date.now(), sectors: st.sectors, units: st.units, colors: st.colors,
    learn: st.learn, cnpjs: st.cnpjs, codes, items, docs: ch(st.docs), saved: ch(st.saved), deleted };
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
  st.meta.lastExport = L.created; st.meta.lastBackup = Date.now(); save(st);
}

// ---------- Pasta do HD (computador) ----------
const perm = async (h, ask) => { const o = { mode: 'readwrite' }; return (await h.queryPermission(o)) === 'granted' || (ask && (await h.requestPermission(o)) === 'granted'); };
const put = async (name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
async function readRaw(h) {
  try { return await (await (await h.getFileHandle('casa.json')).getFile()).text(); }
  catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
}
const parse = raw => {
  const d = JSON.parse(raw);
  if (!Array.isArray(d.items) || !Array.isArray(d.sectors)) throw new Error('casa.json inválido');
  return d;
};
const bad = e => e.name === 'SyntaxError' || e.message === 'casa.json inválido';
async function readFile(h) { const raw = await readRaw(h); return raw && parse(raw); }
async function attach(h) {
  for await (const _ of h.values()) break;   // falha se o HD não estiver conectado
  const st = getSt(), data = await readFile(h);
  if (data) merge(st, data);
  dir = h; wait = null; err = ''; bakDone = false; replacing = false;
  await kvSet('dir', h); save(st); onChange();
}
async function push() {
  if (!dir) return;
  try {
    const st = getSt(), raw = await readRaw(dir);
    if (raw) {
      if (!bakDone) { await put('casa.bak.json', raw); bakDone = true; }   // 1ª gravação da sessão: guarda o casa.json que estava no HD
      if (!replacing) {   // lê antes de gravar: junta o que outro navegador/aparelho já tenha gravado, para nunca apagar nada
        const n = merge(st, parse(raw));
        await kvSet('state', st);
        if (n.add || n.upd || n.del || n.dup) onChange();
      }
    } else bakDone = true;
    replacing = false;
    await put('casa.json', JSON.stringify(st)); err = ''; st.meta.lastBackup = Date.now();
  } catch (e) {
    err = bad(e) ? 'O casa.json da pasta do HD está ilegível; não o sobrescrevi. A cópia casa.bak.json guarda a versão anterior.'
      : 'Não consegui gravar na pasta do HD (ele está conectado?). Os dados continuam salvos neste navegador.';
  }
  status();
}

// ---------- Backup e restauração ----------
// Com a pasta do HD conectada, grava direto em casa.json (mesmo nome sempre); sem ela, baixa um arquivo com data e hora no nome.
export async function saveBackup() {
  if (dir) {
    clearTimeout(timer); await push();
    return alert(err ? '⚠️ ' + err : 'Backup gravado na pasta do HD: casa.json. A versão que estava lá ao abrir o site fica em casa.bak.json.');
  }
  const name = exportJSON(getSt()); getSt().meta.lastBackup = Date.now(); save(getSt());
  alert(`Backup salvo em ${name} (pasta Downloads).` + (hasDir ? ' Conecte a pasta do HD para gravar direto nela, sempre com o mesmo nome.' : ''));
}
// Lê o casa.json da pasta do HD (para restaurar ou juntar)
export async function readDirBackup() {
  if (!dir) { alert('Conecte a pasta do HD primeiro.'); return null; }
  try { const d = await readFile(dir); if (!d) alert('Não há casa.json nesta pasta.'); return d; }
  catch (e) { alert('Não consegui ler o casa.json: ' + e.message); return null; }
}
// Antes de SUBSTITUIR os dados: guarda os atuais e evita que a gravação seguinte junte de volta o que foi descartado
export async function safetyCopy() {
  const st = getSt();
  if (dir) { try { await put('casa.antes-de-restaurar.json', JSON.stringify(st)); } catch { exportJSON(st, 'casa-antes-de-restaurar'); } replacing = true; }
  else exportJSON(st, 'casa-antes-de-restaurar');
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
    $('dirRestoreBtn').hidden = !dir;
  }
  if (err) t.push('⚠️ ' + err);
  const lb = st.meta.lastBackup, days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;   // lembrete de backup
  if (days === null) t.push('💾 Nenhum backup feito ainda: use "Salvar backup".');
  else if (days >= 7) t.push(`⚠️ Faz ${days} dias sem backup: use "Salvar backup".`);
  else t.push(`💾 Último backup: ${new Date(lb).toLocaleDateString('pt-BR')}.`);
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
