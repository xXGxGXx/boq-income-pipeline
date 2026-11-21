/* ===================== CORE: utils · storage · data · search ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtBytes = n => {
  if (n == null || isNaN(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; n = +n;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n < 10 ? 2 : 1)) + ' ' + u[i];
};
const fmtTime = s => {
  if (!isFinite(s)) return '0:00'; s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const today = () => new Date().toISOString().slice(0, 10);
const debounce = (fn, ms) => {                  // .flush() runs a pending call now (used when the page is hidden or closed)
  let t, pend = null;
  const d = (...a) => { clearTimeout(t); pend = a; t = setTimeout(() => { pend = null; fn(...a); }, ms); };
  d.flush = () => { if (!pend) return; clearTimeout(t); const a = pend; pend = null; fn(...a); };
  return d;
};
const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const hexToBytes = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));
async function sha256Hex(buf) { return hex(await crypto.subtle.digest('SHA-256', buf)); }
function b64ToBlob(b64, mime) {
  const bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
}
function download(name, blobOrText, type) {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta);
    ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) { } ta.remove(); return ok;
  }
}

/* ---------- small synchronous prefs (localStorage, memory fallback) ---------- */
const PREF_KEY = 'mh:prefs';
const DEFAULT_PREFS = {
  theme: 'dark', accent: '#67d0f7', blur: true, blurAmt: 18, hideBg: true, lockAfter: 30000, pinSet: false, pinLen: 0,
  resume: true, autoNext: false, wake: true, driveThumbs: false, drivePlayHere: false, density: 'grid', sort: 'catalog',
  liveBase: 'http://127.0.0.1:8080', rememberToken: false, token: '', speed: 1,
  voiceReply: false, voiceWake: true, voiceLang: '', feedSound: false, feedAuto: true, startFolder: '', offlineOnly: false, encNotes: false
};
let prefs = Object.assign({}, DEFAULT_PREFS);
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { }
if (!prefs.rememberToken) prefs.token = '';
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { } };

/* ---------- IndexedDB (kv · progress · imports · files) with in-memory fallback ---------- */
const DB_NAME = 'media-hub', DB_VER = 1, STORES = ['kv', 'progress', 'imports', 'files'];
const mem = { kv: new Map(), progress: new Map(), imports: new Map(), files: new Map() };
let idb = null;
function openDB() {
  return new Promise(res => {
    if (!('indexedDB' in window)) return res(null);
    let req; try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return res(null); }
    req.onupgradeneeded = () => { const d = req.result; STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
}
const dbGet = (s, k) => new Promise(r => {
  if (!idb) return r(mem[s].get(k));
  try { const q = idb.transaction(s).objectStore(s).get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); } catch (e) { r(mem[s].get(k)); }
});
// commit() at once: a write made as the page closes (see saveUser.flush) is otherwise dropped by the browser
const dbPut = (s, k, v) => new Promise(r => {
  if (!idb) { mem[s].set(k, v); return r(false); }
  try { const t = idb.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); if (t.commit) t.commit(); t.oncomplete = () => r(true); t.onerror = t.onabort = () => { mem[s].set(k, v); r(false); }; } catch (e) { mem[s].set(k, v); r(false); }
});
const dbDel = (s, k) => new Promise(r => {
  mem[s].delete(k);
  if (!idb) return r(true);
  try { const t = idb.transaction(s, 'readwrite'); t.objectStore(s).delete(k); t.oncomplete = () => r(true); t.onerror = t.onabort = () => r(false); } catch (e) { r(false); }
});
const dbAll = s => new Promise(r => {
  if (!idb) return r(Array.from(mem[s].entries()));
  const out = [];
  try {
    const q = idb.transaction(s).objectStore(s).openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { out.push([c.key, c.value]); c.continue(); } else r(out); };
    q.onerror = () => r(out);
  } catch (e) { r(out); }
});

/* ---------- user layer: your edits on top of the untouched catalog ---------- */
let user = { fav: {}, rating: {}, note: {}, tags: {}, seen: {}, recent: [], collections: {}, adj: {}, folders: {}, home: {}, trash: {}, archive: {}, gone: {}, saved: {}, enote: {} };
const USER_MAPS = ['fav', 'rating', 'note', 'tags', 'seen', 'collections', 'adj', 'folders', 'home', 'trash', 'archive', 'gone', 'saved', 'enote'];
let LIBV = 0;                                   // bumps on any change that can move items between folders
const saveUser = debounce(() => dbPut('kv', 'user', user), 400);
// A change made in the last 400 ms (a star, a rating, a note) must not be lost when the app is closed, reloaded or sent to the background.
addEventListener('pagehide', () => saveUser.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) saveUser.flush(); });
const changed = () => { LIBV++; saveUser(); };
const touchSeen = id => {
  const s = user.seen[id] || { n: 0 }; s.n++; s.at = Date.now(); user.seen[id] = s;
  user.recent = [id].concat(user.recent.filter(x => x !== id)).slice(0, 24); saveUser();
};
const isFav = id => !!user.fav[id];
function toggleFav(id) { if (user.fav[id]) delete user.fav[id]; else user.fav[id] = Date.now(); saveUser(); return !!user.fav[id]; }

/* ---------- catalog ---------- */
let CAT = { meta: {}, items: [], vault: [], workspace: { items: [] } };
try { CAT = JSON.parse($('#catalog').textContent); } catch (e) { console.error('catalog parse failed', e); }
let EMB = {};
try { EMB = JSON.parse($('#embedded').textContent || '{}') || {}; } catch (e) { EMB = {}; }
const catalogItems = CAT.items || [];
let imported = [];       // device imports (metadata from IndexedDB)
let extraItems = [];     // your own catalog layer: imported TSV/CSV/JSON rows + links you saved (IndexedDB kv 'extra')
let liveItems = [];      // optional Termux catalog (memory only)
let linkedItems = [];    // files inside folders you linked on this device: read in place, never copied
let serverItems = [];    // files in phone folders shared by tools/media_serve.py --library
const byId = new Map();
let dupeSet = new Set();
function normItem(it) {
  it.id = it.id || it.code;
  it.code = it.code || it.id;
  it.title = it.title || it.code;
  it.tags = Array.isArray(it.tags) ? it.tags : String(it.tags || '').split(',').map(s => s.trim()).filter(Boolean);
  it.kind = it.kind || 'video';
  return it;
}
catalogItems.forEach(normItem);
const SRC_SHORT = { 'Google Drive': 'Drive', 'Gallery (uploaded)': 'Gallery' };
const srcShort = s => SRC_SHORT[s] || s || '';
function everything() { return catalogItems.concat(extraItems, imported, linkedItems, serverItems, liveItems); }
const isShown = it => !user.trash[it.id] && !user.archive[it.id] && !user.gone[it.id];
const shown = () => everything().filter(isShown);
function computeDupes() {
  const m = new Map();
  everything().forEach(i => { if (i.sha256) { if (!m.has(i.sha256)) m.set(i.sha256, []); m.get(i.sha256).push(i.id); } });
  dupeSet = new Set(); m.forEach(ids => { if (ids.length > 1) ids.forEach(x => dupeSet.add(x)); });
}
function reindex() {
  byId.clear(); NEWEST = 0; LIBV++; everything().forEach(i => { byId.set(i.id, i); if ((i.added || 0) > NEWEST) NEWEST = i.added; }); computeDupes();
  sharedAll().forEach(i => { if (!byId.has(i.id)) byId.set(i.id, i); });      // shared items can be opened, but never join the private lists
}
function tagsOf(it) { const m = user.tags[it.id] || []; return it.tags.concat(m.filter(t => !it.tags.includes(t))); }
function hayOf(it) {
  return (it.code + ' ' + it.title + ' ' + (it.category || '') + ' ' + (it.source || '') + ' ' + tagsOf(it).join(' ') + ' ' + (user.note[it.id] || '') + ' ' + (it.res || '') + ' ' + (it.desc || '') + ' ' + (it.audio || '') + ' ' + (it.name || '') + ' ' + (it.dir || it.folder || '') + ' ' + (it.aliases || []).join(' ')).toLowerCase();
}
const resPx = it => { const m = /(\d+)\s*[×x]\s*(\d+)/.exec(it.res || ''); return m ? (+m[1]) * (+m[2]) : 0; };
const dimsOf = it => { const m = /(\d+)\s*[×x]\s*(\d+)/.exec(it.res || ''); return m ? [+m[1], +m[2]] : null; };
function qualityOf(it) {          // label from the stored size only; nothing is measured or changed
  const d = dimsOf(it); if (!d) return '';
  const s = Math.min(d[0], d[1]); return s >= 2160 ? '4K' : s >= 1440 ? '1440p' : s >= 1080 ? '1080p' : s >= 720 ? '720p' : s >= 480 ? '480p' : s >= 360 ? '360p' : 'SD';
}
const isVertical = it => { const d = dimsOf(it); return !!(d && d[1] > d[0] * 1.05); };
let NEWEST = 0; const isNew = it => !!(it.added && NEWEST && it.added >= NEWEST - 36 * 3600 * 1000);
const hasLocal = it => !!(it.local || it.imported || it.linked || it.server || it.shf || (it.held && it.bytes));     // playable inside the app
const isGif = it => (it.mime || '') === 'image/gif' || /\.gif$/i.test(it.name || it.local || '') || (it.kind === 'video' && /\bgifs?\b/i.test((it.category || '') + ' ' + (it.tags || []).join(' ')));   // real GIF files and GIF-style loop clips; stills stay photos

/* ---------- search language:  words · "phrases" · -exclude · tag: cat: src: kind: code: res: has: is: ---------- */
function parseQuery(q) {
  const toks = (q || '').toLowerCase().match(/-?"[^"]+"|-?\S+/g) || [];
  return toks.map(t => {
    let neg = false; if (t[0] === '-' && t.length > 1) { neg = true; t = t.slice(1); }
    t = t.replace(/^"|"$/g, '');
    const m = /^(tag|cat|src|kind|is|code|res|has|col|audio|q|in):(.*)$/.exec(t);
    return m ? { neg, op: m[1], v: m[2].replace(/^"|"$/g, '') } : { neg, op: '', v: t };
  }).filter(t => t.v !== '');
}
function matchTok(it, t) {
  const v = t.v;
  switch (t.op) {
    case 'tag': return tagsOf(it).some(x => x.toLowerCase().includes(v));
    case 'cat': return (it.category || '').toLowerCase().includes(v);
    case 'src': return (it.source || '').toLowerCase().includes(v) || srcShort(it.source).toLowerCase().includes(v);
    case 'kind': return it.kind === v;
    case 'code': return it.code.toLowerCase().includes(v) || (it.aliases || []).some(a => String(a).toLowerCase().includes(v));
    case 'res': return (it.res || '').toLowerCase().includes(v);
    case 'has': return v === 'note' ? hasNote(it.id) : v === 'link' ? !!it.link : v === 'local' ? hasLocal(it) : v === 'hash' ? !!it.sha256 : v === 'desc' ? !!it.desc : v === 'audio' ? !!it.audio : v === 'playable' ? !!it.playable : false;
    case 'col': return collectionsOf(it.id).some(c => c.name.toLowerCase().includes(v));
    case 'audio': return (it.audio || '').toLowerCase().includes(v);
    case 'q': return qualityOf(it).toLowerCase().includes(v.replace(/p$/, ''));
    case 'in': return typeof inFolderText === 'function' && inFolderText(it).includes(v);
    case 'is':
      return v === 'fav' ? isFav(it.id) : v === 'local' ? hasLocal(it) : v === 'remote' ? !hasLocal(it) :
        v === 'seen' ? !!user.seen[it.id] : v === 'unseen' ? !user.seen[it.id] : v === 'video' ? it.kind === 'video' :
        v === 'image' ? it.kind === 'image' : v === 'noted' ? hasNote(it.id) : v === 'rated' ? !!user.rating[it.id] :
        v === 'imported' ? !!it.imported : v === 'live' ? !!it._live : v === 'dupe' ? dupeSet.has(it.id) : v === 'silent' ? /silent/i.test(it.audio || '') :
        v === 'added' ? !!it.extra : v === 'drive' ? !!it.driveId : v === 'collected' ? collectionsOf(it.id).length > 0 :
        v === 'vertical' ? isVertical(it) : v === 'hd' ? /^(720p|1080p|1440p|4K)$/.test(qualityOf(it)) : v === 'new' ? isNew(it) :
        v === 'audio' ? it.kind === 'audio' : v === 'gif' ? isGif(it) : v === 'linked' ? !!it.linked : v === 'server' ? !!it.server :
        v === 'trash' || v === 'trashed' || v === 'deleted' ? !!user.trash[it.id] : v === 'archived' ? !!user.archive[it.id] :
        v === 'ai' ? typeof homeOf === 'function' && homeOf(it).startsWith('ai/') : v === 'inbox' ? typeof homeOf === 'function' && homeOf(it) === 'src/inbox' :
        v === 'filed' ? !!user.home[it.id] : false;
    default: return (it._hay || (it._hay = hayOf(it))).includes(v);
  }
}
/* ---------- collections (your playlists; ids only, so nothing is copied) ---------- */
const collectionsOf = id => Object.entries(user.collections || {}).filter(([, c]) => c.ids.includes(id)).map(([cid, c]) => Object.assign({ cid }, c));
function createCollection(name) { const cid = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e3); user.collections[cid] = { name: String(name).slice(0, 60), ids: [], created: Date.now() }; saveUser(); return cid; }
function toggleInCollection(cid, id) { const c = user.collections[cid]; if (!c) return false; const i = c.ids.indexOf(id); if (i >= 0) c.ids.splice(i, 1); else c.ids.push(id); saveUser(); return i < 0; }
const invalidateHay = id => { const it = byId.get(id); if (it) it._hay = null; };
function matchesQuery(it, parsed) {
  for (const t of parsed) {
    const hit = t.v.includes('|') ? t.v.split('|').filter(Boolean).some(v => matchTok(it, { op: t.op, v, neg: t.neg })) : matchTok(it, t);   // a|b = either
    if (hit === t.neg) return false;
  }
  return true;
}
const wantsHidden = parsed => parsed.some(t => t.op === 'is' && !t.neg && /^(trash|trashed|deleted|archived)$/.test(t.v));

/* ---------- sorting ---------- */
function sortList(list, mode) {
  const a = list.slice();
  const cmp = {
    title: (x, y) => x.title.localeCompare(y.title, undefined, { numeric: true }),
    code: (x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }),
    category: (x, y) => (x.category || '').localeCompare(y.category || '') || x.title.localeCompare(y.title),
    res: (x, y) => resPx(y) - resPx(x),
    opens: (x, y) => ((user.seen[y.id] || {}).n || 0) - ((user.seen[x.id] || {}).n || 0),
    rating: (x, y) => (user.rating[y.id] || 0) - (user.rating[x.id] || 0),
    recent: (x, y) => ((user.seen[y.id] || {}).at || 0) - ((user.seen[x.id] || {}).at || 0),
    added: (x, y) => (y.added || 0) - (x.added || 0)
  }[mode];
  return cmp ? a.sort(cmp) : a;
}

/* ---------- media access: embedded (lazy, per file) → blob URL · relative path · imported blob ---------- */
const urlCache = new Map(), embBlobs = new Map();
function embBlob(path) {                       // single-file build: each file sits in its own inert data block and is decoded only when first needed
  if (embBlobs.has(path)) return embBlobs.get(path);
  const e = EMB[path]; if (!e) return null;
  let b64 = e.b64; const el = e.id && document.getElementById(e.id);
  if (!b64 && el) b64 = el.textContent.trim();
  if (!b64) return null;
  const blob = b64ToBlob(b64, e.mime); embBlobs.set(path, blob);
  if (el) el.textContent = ''; delete e.b64;   // free the text copy; the blob holds the same bytes
  return blob;
}
async function srcFor(it) {
  if (urlCache.has(it.id)) return urlCache.get(it.id);
  let url = null;
  if (it.server) url = it.url;                                   // phone folder over the loopback server: streamed with Range, nothing copied
  else if (it.held) { const b = await dbGet('files', 'sh:' + it.id); if (b instanceof Blob) url = URL.createObjectURL(b); }   // a shared copy held in the app
  else if (it.shf) { const f = await sharedFolderFile(it); if (f) url = URL.createObjectURL(f); }                          // the connected shared folder
  else if (it.linked) { const f = await linkedFile(it); if (f) url = URL.createObjectURL(f); }   // linked folder: read in place
  else if (it.imported) {
    const rec = it.session ? it._file : (await dbGet('files', it.id));
    const blob = rec && (rec.blob || rec);
    if (blob instanceof Blob) url = URL.createObjectURL(blob);
  } else if (it.local) {
    const b = embBlob(it.local); url = b ? URL.createObjectURL(b) : it.local;
  }
  if (url) urlCache.set(it.id, url);
  return url;
}
const posterCache = new Map();
function posterSrc(it) {
  if (!it.poster) return '';
  if (posterCache.has(it.id)) return posterCache.get(it.id);
  const b = embBlob(it.poster), u = b ? URL.createObjectURL(b) : it.poster; posterCache.set(it.id, u); return u;
}
async function bytesFor(it) {
  if (it.linked) { const f = await linkedFile(it); return f ? await f.arrayBuffer() : null; }
  if (it.held) { const b = await dbGet('files', 'sh:' + it.id); return b instanceof Blob ? await b.arrayBuffer() : null; }
  if (it.shf) { const f = await sharedFolderFile(it); return f ? await f.arrayBuffer() : null; }
  if (it.server) { const r = await fetch(it.url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.arrayBuffer(); }
  if (it.imported) { const rec = it.session ? it._file : await dbGet('files', it.id); const b = rec && (rec.blob || rec); return b ? await b.arrayBuffer() : null; }
  if (it.local) { const b = embBlob(it.local); if (b) return await b.arrayBuffer(); }
  if (it.local) { const r = await fetch(it.local, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.arrayBuffer(); }
  return null;
}
