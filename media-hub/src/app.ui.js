/* ===================== UI: library · vault · workspace · sheets ===================== */
const state = { tab: 'library', q: '', filter: 'all', cat: null, col: null, wsGroup: 'All', list: [] };
/* Back steps the app makes itself (closing the viewer or the feed) finish before the next folder is pushed, so a quick
   “close, then open a folder” never bounces you back to the start. */
const NAV = { backing: 0, queue: [], self: false, t: 0 };
function navBack() { NAV.backing++; clearTimeout(NAV.t); NAV.t = setTimeout(() => { NAV.backing = 0; NAV.queue.splice(0).forEach(f => { try { f(); } catch (e) { } }); }, 1500); try { history.back(); } catch (e) { NAV.backing = 0; } }
function afterNav(fn) { if (NAV.backing > 0) NAV.queue.push(fn); else fn(); }
window.addEventListener('popstate', () => {
  if (NAV.backing <= 0) return;
  NAV.backing--; NAV.self = true;
  setTimeout(() => { NAV.self = false; if (!NAV.backing) { clearTimeout(NAV.t); NAV.queue.splice(0).forEach(f => { try { f(); } catch (e) { } }); } }, 0);
});
const progress = new Map();

/* ---------- toast ---------- */
let toastT;
function toast(msg, action) {
  const el = $('#toast'), m = $('#toastMsg');
  m.textContent = msg; $$('button', el).forEach(b => b.remove());
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); el.classList.remove('on'); }; el.appendChild(b); }
  el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), action ? 6000 : 2600);
}

/* ---------- thumbnails ---------- */
const svgIcon = (id, fill) => `<svg viewBox="0 0 24 24" width="12" height="12" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#${id}"/></svg>`;
function artFor(it) {
  const h = hashStr(it.category || it.code) % 360;
  const d = document.createElement('div'); d.className = 'art';
  d.style.background = `linear-gradient(135deg,hsl(${h} 52% 36%),hsl(${(h + 48) % 360} 58% 20%))`;
  const mono = (it.code || it.title || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  d.innerHTML = `${esc(mono)}<small>${esc(srcShort(it.source))}</small>`;
  return d;
}
const lazyObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { lazyObs.unobserve(e.target); hydrateThumb(e.target); } });
}, { rootMargin: '300px' }) : null;
async function hydrateThumb(el) {
  const it = byId.get(el.dataset.id); if (!it) return;
  const src = await srcFor(it); if (!src) return;
  if (it.kind === 'video') el.src = src + (src.startsWith('blob:') || src.includes('#') ? '' : '#t=0.1');
  else { el.decoding = 'async'; el.src = src; }
}
function thumbEl(it) {
  const t = document.createElement('div'); t.className = 'thumb';
  t.appendChild(artFor(it));
  if (it.kind === 'audio') { const a = $('.art', t); a.insertAdjacentHTML('afterbegin', '<svg class="anote" viewBox="0 0 24 24"><use href="#i-music"/></svg>'); }
  else if (hasLocal(it) && it.kind === 'video' && it.poster) {          // a still frame instead of loading the video itself
    const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.style.opacity = 0;
    im.addEventListener('load', () => { im.style.opacity = 1; const a = $('.art', t); if (a) a.style.visibility = 'hidden'; }, { once: true });
    im.addEventListener('error', () => im.remove(), { once: true }); im.src = posterSrc(it); t.appendChild(im);
  } else if (hasLocal(it)) {
    const m = document.createElement(it.kind === 'video' ? 'video' : 'img');
    m.dataset.id = it.id;
    if (it.kind === 'video') { m.muted = true; m.preload = 'metadata'; m.playsInline = true; m.setAttribute('playsinline', ''); m.tabIndex = -1; }
    else { m.alt = ''; }
    m.style.opacity = 0;
    m.addEventListener(it.kind === 'video' ? 'loadeddata' : 'load', () => { m.style.opacity = 1; const a = $('.art', t); if (a) a.style.visibility = 'hidden'; }, { once: true });
    m.addEventListener('error', () => { if (!m._retry) { m._retry = 1; setTimeout(() => { try { const s = m.currentSrc || m.src; m.removeAttribute('src'); m.load(); m.src = s; } catch (e) { } }, 700); } else m.remove(); });
    t.appendChild(m);
    lazyObs ? lazyObs.observe(m) : hydrateThumb(m);
  } else if (prefs.driveThumbs && !prefs.offlineOnly && it.driveId) {
    const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
    im.src = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(it.driveId) + '&sz=w480';
    im.onerror = () => im.remove(); im.onload = () => { const a = $('.art', t); if (a) a.style.visibility = 'hidden'; };
    t.appendChild(im);
  }
  return t;
}
function cardEl(it) {
  const c = document.createElement('div'); c.className = 'card'; c.dataset.id = it.id; c.tabIndex = 0; c.setAttribute('role', 'button');
  c.setAttribute('aria-label', it.title);
  const th = thumbEl(it), local = hasLocal(it);
  th.insertAdjacentHTML('beforeend',
    `<span class="badge">${esc(it.code)}</span>` +
    `<span class="kind">${svgIcon(local ? (it.kind === 'video' ? 'i-play' : it.kind === 'audio' ? 'i-music' : 'i-img') : 'i-link', local && it.kind === 'video')}${local ? (it.kind === 'video' ? 'Play' : it.kind === 'audio' ? 'Listen' : 'View') : 'Link'}</span>` +
    (qualLabel(it) ? `<span class="qual${isNew(it) ? ' new' : ''}">${esc(qualLabel(it))}</span>` : '') +
    (user.seen[it.id] ? '' : '<i class="dot" title="Not opened yet"></i>') +
    `<button class="favbtn" data-fav="${esc(it.id)}" aria-pressed="${isFav(it.id)}" aria-label="Favourite">${isFav(it.id) ? '★' : '☆'}</button><i class="selmark" aria-hidden="true"></i>`);
  if (SEL.on && SEL.ids.has(it.id)) c.classList.add('sel');
  const pr = progress.get(it.id);
  if (pr && pr.pct > 1 && pr.pct < 95) th.insertAdjacentHTML('beforeend', `<div class="pbar"><i style="width:${pr.pct}%"></i></div>`);
  const b = document.createElement('div'); b.className = 'cbody';
  const meta = [it.res, srcShort(it.source)].filter(Boolean).join(' · ');
  b.innerHTML = `<div class="cat">${esc(it.category || '')}</div><div class="title">${esc(it.title)}</div><div class="meta">${esc(meta)}</div>` + (it.desc ? `<div class="desc">${esc(it.desc)}</div>` : '');
  c.append(th, b); return c;
}

const qualLabel = it => [isNew(it) ? 'New' : '', qualityOf(it), isVertical(it) ? '↕' : ''].filter(Boolean).join(' · ');

/* ---------- library ---------- */
function filterBase(it) {
  switch (state.filter) {
    case 'fav': return isFav(it.id);
    case 'video': return it.kind === 'video';
    case 'image': return it.kind === 'image';
    case 'audio': return it.kind === 'audio';
    case 'local': return hasLocal(it);
    case 'imported': return !!it.imported;
    case 'cat': return (it.category || 'Other') === state.cat;
    case 'col': return !!(user.collections[state.col] && user.collections[state.col].ids.includes(it.id));
    case 'added': return !!it.extra;
    default: return true;
  }
}
function libraryList() {
  const parsed = parseQuery(state.q);
  const list = (wantsHidden(parsed) ? everything() : shown()).filter(it => filterBase(it) && matchesQuery(it, parsed));
  if (state.filter === 'col' && prefs.sort === 'catalog' && user.collections[state.col]) { const ids = user.collections[state.col].ids; return list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); }
  return sortList(list, prefs.sort);
}
function renderChips() {
  const all = shown(), el = $('#chips');
  const cats = {}; all.forEach(i => { const c = i.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
  const chips = [
    ['all', null, 'All', all.length], ['fav', null, '★ Favourites', all.filter(i => isFav(i.id)).length],
    ['video', null, 'Videos', all.filter(i => i.kind === 'video').length], ['image', null, 'Images', all.filter(i => i.kind === 'image').length],
    ['local', null, 'On device', all.filter(hasLocal).length]
  ];
  const na = all.filter(i => i.kind === 'audio').length; if (na) chips.splice(4, 0, ['audio', null, 'Audio', na]);
  if (imported.length) chips.push(['imported', null, 'My files', imported.length]);
  if (extraItems.length) chips.push(['added', null, 'My links & rows', extraItems.length]);
  Object.entries(user.collections || {}).sort((a, b) => a[1].created - b[1].created).forEach(([cid, c]) => chips.push(['col', cid, '▸ ' + c.name, c.ids.filter(id => byId.has(id)).length]));
  Object.keys(cats).sort((a, b) => cats[b] - cats[a] || a.localeCompare(b)).forEach(c => chips.push(['cat', c, c, cats[c]]));
  el.innerHTML = '';
  chips.forEach(([f, c, label, n]) => {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button';
    b.innerHTML = `${esc(label)} <span class="n">${n}</span>`;
    b.setAttribute('aria-pressed', String(f === state.filter && (f !== 'cat' || c === state.cat) && (f !== 'col' || c === state.col)));
    if (f === 'col') b.classList.add('colchip');
    b.onclick = () => { state.filter = f; state.cat = f === 'cat' ? c : null; state.col = f === 'col' ? c : null; renderLibrary(); };
    el.appendChild(b);
  });
  const act = $('[aria-pressed="true"]', el); if (act && el.scrollWidth > el.clientWidth) act.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function railEl(title, items, opts = {}) {
  const w = document.createElement('div'); w.className = 'rail';
  w.innerHTML = `<h2>${esc(title)}</h2>`;
  const row = document.createElement('div'); row.className = 'rail-row';
  items.forEach(it => {
    const b = document.createElement('button'); b.className = 'cw'; b.dataset.id = it.id; b.type = 'button';
    b.appendChild(thumbEl(it));
    const pr = progress.get(it.id);
    if (opts.progress && pr) b.insertAdjacentHTML('beforeend', `<div class="bar"><i style="width:${pr.pct}%"></i></div>`);
    b.insertAdjacentHTML('beforeend', `<div class="cwt">${esc(it.title)}</div>` + (opts.progress && pr ? `<div class="cwm">${fmtTime(Math.max(0, pr.d - pr.t))} left</div>` : opts.added && it.added ? `<div class="cwm">Added ${esc(new Date(it.added).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))} · ${esc(srcShort(it.source))}</div>` : `<div class="cwm">${esc(it.category || '')}</div>`));
    row.appendChild(b);
  });
  w.appendChild(row); return w;
}
function renderRails() {
  const box = $('#rails'); box.innerHTML = '';
  if (state.q || state.filter !== 'all') return;
  const cont = Array.from(progress.entries()).filter(([id, p]) => byId.has(id) && isShown(byId.get(id)) && p.pct > 1 && p.pct < 95).sort((a, b) => b[1].at - a[1].at).map(([id]) => byId.get(id)).slice(0, 10);
  if (cont.length) box.appendChild(railEl('Continue watching', cont, { progress: true }));
  const ids = new Set(cont.map(i => i.id));
  const rec = user.recent.filter(id => byId.has(id) && isShown(byId.get(id)) && !ids.has(id)).slice(0, 12).map(id => byId.get(id));
  if (rec.length) box.appendChild(railEl('Recently opened', rec));
  const shownIds = new Set(cont.map(i => i.id).concat(rec.map(i => i.id)));
  const fresh = shown().filter(i => i.added && !shownIds.has(i.id)).sort((a, b) => b.added - a.added).slice(0, 12);
  if (fresh.length) box.appendChild(railEl('Recently added', fresh, { added: true }));
}
function updateSubtitle() {
  const all = shown(), local = all.filter(hasLocal).length;
  $('#subtitle').textContent = all.length + ' items · ' + local + ' on device' + (user.fav && Object.keys(user.fav).length ? ' · ' + Object.keys(user.fav).length + ' ★' : '');
}
function renderColBar() {
  let bar = $('#colbar'); if (!bar) { bar = document.createElement('div'); bar.id = 'colbar'; bar.className = 'colbar'; $('#rails').before(bar); }
  const c = state.filter === 'col' && user.collections[state.col];
  bar.classList.toggle('hidden', !c); if (!c) return;
  bar.innerHTML = `<b>▸ ${esc(c.name)}</b><span>${c.ids.filter(id => byId.has(id)).length} items · your order</span><button class="btn small primary" id="colPlay">Play all</button><button class="btn small" id="colRename">Rename</button><button class="btn small danger" id="colDelete">Delete</button>`;
  $('#colPlay').onclick = () => { const l = libraryList(); if (l.length) openViewer(l[0].id, l); else toast('This collection is empty'); };
  $('#colRename').onclick = () => { const n = prompt('Rename collection', c.name); if (n && n.trim()) { c.name = n.trim().slice(0, 60); saveUser(); renderLibrary(); } };
  $('#colDelete').onclick = () => { if (confirm('Delete the collection "' + c.name + '"? The items themselves stay.')) { delete user.collections[state.col]; saveUser(); state.filter = 'all'; state.col = null; renderLibrary(); toast('Collection deleted'); } };
}
function renderLibrary() {
  renderChips(); renderRails(); updateSubtitle(); renderColBar();
  const list = state.list = libraryList(), grid = $('#grid');
  $('#count').textContent = list.length + (list.length === 1 ? ' item' : ' items') + (state.q ? ' match' : '');
  if (!list.length) {
    grid.innerHTML = ''; grid._list = [];
    const none = !everything().length;
    grid.innerHTML = `<div class="empty"><b>${none ? 'Your library is empty' : 'Nothing here'}</b>${none ? 'Add photos or videos from this device to get started.' : state.q ? 'No matches for “' + esc(state.q) + '”.' : state.filter === 'fav' ? 'Tap ☆ on any card to keep it here.' : 'This filter is empty.'}<br>` +
      (none ? '<button class="btn primary" id="btnEmptyAdd">Add files…</button>' : '<button class="btn" id="btnClear">Clear filters</button>') + '</div>';
    const a = $('#btnEmptyAdd'); if (a) a.onclick = () => $('#filePick').click();
    const c = $('#btnClear'); if (c) c.onclick = () => { state.q = ''; $('#q').value = ''; state.filter = 'all'; state.cat = null; renderLibrary(); };
    return;
  }
  fillGrid(grid, list, '');
}
function fillGrid(grid, list, emptyHtml) {            // chunked so even very large libraries start drawing at once
  const my = grid._tok = (grid._tok || 0) + 1; grid.innerHTML = ''; grid._list = list;
  if (!list.length) { grid.innerHTML = emptyHtml || ''; return; }
  const CH = 60;
  const push = from => {
    if (my !== grid._tok) return;
    const f = document.createDocumentFragment();
    list.slice(from, from + CH).forEach(it => f.appendChild(cardEl(it)));
    grid.appendChild(f);
    if (from + CH < list.length) requestAnimationFrame(() => push(from + CH));
  };
  push(0);
}

/* grid interactions: open · favourite · press-and-hold to peek · right-click favourite (mouse only) */
let pressT = null, pressed = false;
const canHover = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
function bindGrid() {
  const handler = e => {
    const card = e.target.closest('.card');
    if (card && (SEL.on || (e.type === 'click' && (e.ctrlKey || e.metaKey || e.shiftKey)))) { e.preventDefault(); e.stopPropagation(); if (!SEL.on) startSelect(); toggleSel(card.dataset.id, card); return; }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.stopPropagation(); const on = toggleFav(fav.dataset.fav); fav.setAttribute('aria-pressed', on); fav.textContent = on ? '★' : '☆';
      renderChips(); updateSubtitle(); if (state.filter === 'fav' && state.tab === 'library') renderLibrary(); return;
    }
    if (pressed) { pressed = false; return; }
    const c = e.target.closest('.card, .cw'); if (!c) return;
    const list = c.classList.contains('cw') ? $$('.cw', c.parentNode).map(x => byId.get(x.dataset.id)) : (c.closest('.grid') || {})._list || state.list;
    openViewer(c.dataset.id, list);
  };
  ['#grid', '#rails', '#fgrid'].forEach(sel => {
    const root = $(sel);
    root.addEventListener('click', handler);
    root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card')) { e.preventDefault(); handler(e); } });
    root.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      const c = e.target.closest('.card, .cw'); if (!c || e.target.closest('[data-fav]')) return;
      clearTimeout(pressT); pressT = setTimeout(() => { c.classList.add('reveal'); pressed = true; if (navigator.vibrate) navigator.vibrate(8); }, 380);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(ev => root.addEventListener(ev, () => {
      clearTimeout(pressT); $$('.reveal', root).forEach(x => x.classList.remove('reveal'));
      if (ev === 'pointerup') setTimeout(() => { pressed = false; }, 60); else pressed = false;
    }, true));
    root.addEventListener('contextmenu', e => {
      const c = e.target.closest('.card, .cw'); if (!c) return;
      e.preventDefault();
      if (canHover() && c.classList.contains('card')) { const on = toggleFav(c.dataset.id); toast(on ? 'Added to favourites' : 'Removed from favourites'); refreshViews(); }
    });
  });
}

/* ---------- vault ---------- */
function renderVault() {
  const parsed = parseQuery(state.q), box = $('#vaultPanel'), v = CAT.vault || [];
  const list = v.filter(f => matchesQuery({ id: f.path, code: f.path, title: f.path, category: f.note, source: '', tags: [], kind: '', res: '' }, parsed));
  const files = v.reduce((s, f) => s + f.files, 0), max = Math.max(1, ...v.map(f => f.files));
  box.innerHTML = `<button class="backlink" data-back>‹ Folders › Indexes</button><div class="pcard"><h3>Vault folders</h3><p>Snapshot of the phone’s folder index${CAT.meta && CAT.meta.vaultSnapshot ? ' · ' + esc(CAT.meta.vaultSnapshot) : ''}. Tap a row to copy its path.</p>
    <div class="stat-grid" style="margin-top:10px"><div class="stat"><b>${v.length}</b><span>folders</span></div><div class="stat"><b>${files.toLocaleString()}</b><span>files</span></div><div class="stat"><b>${list.length}</b><span>shown</span></div></div></div>
    <div class="pcard" id="vaultRows"></div>`;
  const rows = $('#vaultRows', box);
  if (!list.length) rows.innerHTML = '<div class="empty" style="padding:20px"><b>No folders match</b></div>';
  list.forEach(f => {
    const r = document.createElement('button'); r.className = 'bar-row'; r.type = 'button';
    r.innerHTML = `<span class="path mono" style="font-size:.8rem">${esc(f.path)}</span><span class="val">${f.files.toLocaleString()} · ${esc(f.size)}</span><span class="track"><i style="width:${Math.max(2, f.files / max * 100)}%"></i></span><span class="note">${esc(f.note || '')}</span>`;
    r.onclick = async () => toast((await copyText(f.path)) ? 'Copied ' + f.path : 'Copy failed');
    rows.appendChild(r);
  });
}

/* ---------- workspace index ---------- */
const WS_ICON = { IMAGE: 'IMG', VIDEO: 'VID', HTML: 'WEB', CODE: 'SRC', JSON: 'JSN', TEXT: 'TXT', NOTE: 'NOTE', SHEET: 'XLS', CSV: 'CSV', MHTML: 'WEB', LINK: 'URL' };
function renderWorkspace() {
  const W = (CAT.workspace && CAT.workspace.items) || [], parsed = parseQuery(state.q);
  const groups = {}; W.forEach(i => { groups[i.collection] = (groups[i.collection] || 0) + 1; });
  const gc = $('#wsChips'); gc.innerHTML = '';
  ['All'].concat(Object.keys(groups).sort((a, b) => groups[b] - groups[a])).forEach(g => {
    const b = document.createElement('button'); b.className = 'chip'; b.innerHTML = `${esc(g)} <span class="n">${g === 'All' ? W.length : groups[g]}</span>`;
    b.setAttribute('aria-pressed', String(state.wsGroup === g)); b.onclick = () => { state.wsGroup = g; renderWorkspace(); }; gc.appendChild(b);
  });
  const list = W.filter(i => (state.wsGroup === 'All' || i.collection === state.wsGroup) &&
    matchesQuery({ id: 'ws' + i.id, code: i.file || '', title: i.title, category: i.collection, source: i.type, tags: i.tags || [], kind: '', res: '' }, parsed));
  const bytes = W.reduce((s, i) => s + (i.size || 0), 0);
  const box = $('#wsPanel');
  box.innerHTML = `<button class="backlink" data-back>‹ Folders › Indexes</button><div class="pcard"><h3>Workspace index</h3><p>Counted from the catalog itself, so totals and groups always add up.${CAT.meta && CAT.meta.workspaceSource ? ' Source: ' + esc(CAT.meta.workspaceSource) + '.' : ''}</p>
    <div class="stat-grid" style="margin-top:10px"><div class="stat"><b>${W.length}</b><span>items</span></div><div class="stat"><b>${W.filter(i => i.size).length}</b><span>files</span></div><div class="stat"><b>${fmtBytes(bytes)}</b><span>total</span></div><div class="stat"><b>${Object.keys(groups).length}</b><span>groups</span></div></div></div>
    <div class="pcard" id="wsRows"></div>`;
  const rows = $('#wsRows', box);
  if (!list.length) rows.innerHTML = '<div class="empty" style="padding:20px"><b>No items match</b></div>';
  list.forEach(i => {
    const r = document.createElement('button'); r.type = 'button'; r.className = 'wsrow';
    r.innerHTML = `<span class="ico">${WS_ICON[i.type] || 'FILE'}</span><span style="min-width:0;flex:1"><span class="t">${esc(i.title)}</span><span class="s">${esc(i.collection)} · ${i.size ? fmtBytes(i.size) : 'note'} · ${esc(i.filed || '')}</span></span>`;
    r.onclick = () => {
      openSheet(`<h2>${esc(i.title)}</h2><div class="meta" style="color:var(--muted)">${esc(i.collection)} · ${esc(i.type)}${i.size ? ' · ' + fmtBytes(i.size) : ''}</div>
        <p style="margin:12px 0 0">${esc(i.note || '')}</p>${i.text ? '<pre class="log" style="max-height:300px">' + esc(i.text) + '</pre>' : ''}
        <dl class="kv"><dt>File</dt><dd class="mono">${esc(i.file || '—')}</dd><dt>Path</dt><dd class="mono">${esc(i.path || '—')}</dd>${i.sha256 ? `<dt>SHA-256</dt><dd class="mono" style="font-size:.74rem">${esc(i.sha256)}</dd>` : ''}<dt>Filed</dt><dd>${esc(i.filed || '—')}</dd></dl>
        <div style="margin-top:14px;display:flex;gap:8px"><button class="btn" id="wsCopy">Copy path</button><button class="btn" id="wsCopyHash" ${i.sha256 ? '' : 'disabled'}>Copy hash</button></div>`);
      $('#wsCopy').onclick = async () => toast((await copyText(i.path || i.file || '')) ? 'Copied' : 'Copy failed');
      $('#wsCopyHash').onclick = async () => toast((await copyText(i.sha256 || '')) ? 'Hash copied' : 'Copy failed');
    };
    rows.appendChild(r);
  });
}

/* ---------- sheet ---------- */
/* ---------- dialogs: focus moves in, Tab stays inside, focus returns to where you were on close ----------
   The container itself takes focus (not its first button), so Space still means play/pause, not "press Close". */
const MODALS = [], BEHIND = ['#top', '#main', '#nav', '#fab', '#selbar'];
function modalIn(el) {
  if (!el || MODALS.some(m => m.el === el)) return;
  const top = MODALS[MODALS.length - 1];
  if (top) top.el.inert = true; else BEHIND.forEach(s => { const b = $(s); if (b) b.inert = true; });
  MODALS.push({ el, prev: document.activeElement });
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.tabIndex = -1;
  requestAnimationFrame(() => { if (MODALS.some(m => m.el === el) && !el.contains(document.activeElement)) try { el.focus({ preventScroll: true }); } catch (e) { } });
}
function modalOut(el) {
  const i = MODALS.findIndex(m => m.el === el); if (i < 0) return;
  const m = MODALS.splice(i, 1)[0]; el.inert = false;
  if (i < MODALS.length) { const up = MODALS[i]; if (!up.prev || el.contains(up.prev)) up.prev = m.prev; return; }   // closed from under another dialog
  const top = MODALS[MODALS.length - 1];
  if (top) top.el.inert = false; else BEHIND.forEach(s => { const b = $(s); if (b) b.inert = false; });
  const back = top && !(m.prev && top.el.contains(m.prev)) ? top.el : m.prev;
  if (back && back.isConnected && back.getClientRects().length) try { back.focus({ preventScroll: true }); } catch (e) { }
}
function openSheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); $('#scrim').classList.add('open'); $('#sheet').scrollTop = 0; modalIn($('#sheet')); }
function closeSheet() { $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); modalOut($('#sheet')); }

function itemSheet(it) {
  const tags = tagsOf(it), mine = user.tags[it.id] || [], rating = user.rating[it.id] || 0;
  const twins = it.sha256 ? everything().filter(x => x.sha256 === it.sha256 && x.id !== it.id) : [];
  const rows = [['Code', it.code], ['Category', it.category], ['Source', it.source], ['Resolution', it.res], ['Audio', it.audio], ['Size', it.bytes ? fmtBytes(it.bytes) : ''],
    ['File type', it.mimeNote || (it.mime && hasLocal(it) ? it.mime : '')], ['Playable copy', it.playable ? 'Yes, a separate file. The original is untouched.' : ''],
    ['Added', it.extra ? (it.userLink ? 'Link you saved' : 'Row from a catalog you imported') : ''],
    ['Opened', (user.seen[it.id] || {}).n ? (user.seen[it.id].n + '× · last ' + new Date(user.seen[it.id].at).toLocaleDateString()) : 'never']].filter(r => r[1]);
  const cols = Object.entries(user.collections || {}).sort((x, y) => x[1].created - y[1].created), home = homeOf(it);
  if (it.linked) rows.splice(3, 0, ['Linked file', (linkRootOf(it.linkRoot) || {}).name + ' / ' + it.path]); if (it.server) rows.splice(3, 0, ['Phone file', it.serverRoot + ' / ' + it.path]);
  openSheet(`<h2>${esc(it.title)}</h2><div class="meta" style="color:var(--muted)">${esc(it.kind)} · ${esc(it.category || '')}</div>
    ${it.shared ? `<div class="folderline shared"><svg viewBox="0 0 24 24"><use href="#i-users"/></svg><button class="linkish" id="isFolder" title="Open this shared folder">Shared › ${esc(folderName(home))}</button><span class="pill2">${isMine(it) ? 'your shared copy' : 'shared with you'}</span></div>` :
      `<div class="folderline"><svg viewBox="0 0 24 24"><use href="#${iconOf(home)}"/></svg><button class="linkish" id="isFolder" title="Open this folder">${esc(pathOf(home).slice(1).map(p => p.name).join(' › '))}</button><button class="btn small" id="isMove">Move…</button><button class="btn small" id="isShare" title="Put a copy in your Shared folder. The original stays private.">Share…</button></div>`}
    ${it.desc ? `<p class="descp">${esc(it.desc)}</p>` : ''}
    <div class="stars" id="stars" style="margin-top:8px">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= rating ? 'on' : ''}" data-n="${n}" aria-label="${n} star">★</button>`).join('')}</div>
    <dl class="kv">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
    <div class="taglist" id="tagList">${tags.map(t => `<button class="tag ${mine.includes(t) ? 'mine' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('') || '<span style="color:var(--muted);font-size:.84rem">No tags yet</span>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="newTag" placeholder="Add tags (comma separated)" autocapitalize="off"><button class="btn" id="addTag">Add</button></div>
    <div class="sect"><div class="sect-h">Collections</div><div class="taglist" id="colList">${cols.map(([cid, c]) => { const on = c.ids.includes(it.id); return `<button class="tag ${on ? 'mine' : ''}" data-col="${esc(cid)}" aria-pressed="${on}">${on ? '✓ ' : '+ '}${esc(c.name)}</button>`; }).join('') || '<span style="color:var(--muted);font-size:.84rem">No collections yet</span>'}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input class="input" id="newCol" placeholder="New collection, e.g. Keepers" maxlength="60"><button class="btn" id="addCol">Create &amp; add</button></div></div>
    ${noteSectionHtml(it)}
    ${hasLocal(it) ? `<div class="pcard" style="margin-top:12px;background:var(--surface2)"><b style="font-size:.9rem">Original file</b>
      <dl class="kv"><dt>Stored as</dt><dd class="mono" style="font-size:.78rem">${esc(it.held ? 'a shared copy in this app (byte-for-byte)' : it.imported ? 'this app (byte-for-byte copy)' : it.local || it.path || '')}</dd>${it.sha256 ? `<dt>SHA-256</dt><dd class="mono" style="font-size:.72rem">${esc(it.sha256)}</dd>` : ''}${twins.length ? `<dt>Same file</dt><dd>${twins.map(t => esc(t.code)).join(', ')}</dd>` : ''}</dl>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn small" id="btnVerifyOne" ${it.sha256 ? '' : 'disabled'}>Verify against catalog</button>${it.kind === 'video' && it.local ? '<button class="btn small" id="btnPlayableCmd">Copy “playable copy” command</button>' : ''}${it.imported ? '<button class="btn small danger" id="btnRemoveImp">Remove from app</button>' : ''}</div><div id="verifyOne" style="margin-top:8px;color:var(--muted);font-size:.8rem"></div></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${it.link ? `<a class="btn primary" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Open link</a><button class="btn" id="btnCopyLink">Copy link</button>` : ''}<button class="btn" id="btnCopyCode">Copy code</button><button class="btn" id="btnCopyApp" title="A link that opens this item straight away (home-screen shortcut, Tasker)">Copy app link</button>${it.extra ? '<button class="btn danger" id="btnRemoveExtra">Remove from app</button>' : ''}</div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">${it.shared ? (!isMine(it) && hasLocal(it) ? '<button class="btn primary" id="isKeep">Save to my library</button>' : '') + '<button class="btn danger" id="isUnshare">Remove from Shared</button>' : user.trash[it.id] ? '<button class="btn" id="isRestore">Restore from Trash</button>' : `<button class="btn" id="isArchive">${user.archive[it.id] ? 'Unarchive' : 'Archive'}</button><button class="btn danger" id="isTrash">Move to Trash</button>`}</div>`);
  const im = $('#isMove'); if (im) im.onclick = () => moveSheet([it.id], () => { });
  const ish = $('#isShare'); if (ish) ish.onclick = () => { closeSheet(); shareItems([it.id]); };
  const iu = $('#isUnshare'); if (iu) iu.onclick = () => { closeSheet(); removeShared([it.id]); };
  const ik = $('#isKeep'); if (ik) ik.onclick = () => { closeSheet(); saveSharedToLibrary([it.id]); };
  $('#isFolder').onclick = () => { closeSheet(); if (V.open) closeViewer(); if (FEED.open) closeFeed(); openFolder(home); };
  const ia = $('#isArchive'); if (ia) ia.onclick = () => { closeSheet(); user.archive[it.id] ? unarchiveItems([it.id]) : archiveItems([it.id]); };
  const itr = $('#isTrash'); if (itr) itr.onclick = () => { closeSheet(); trashItems([it.id]); };
  const irs = $('#isRestore'); if (irs) irs.onclick = () => { closeSheet(); restoreItems([it.id]); };
  $$('#stars button').forEach(b => b.onclick = () => { const n = +b.dataset.n; if (user.rating[it.id] === n) delete user.rating[it.id]; else user.rating[it.id] = n; saveUser(); itemSheet(it); });
  $$('#tagList [data-tag]').forEach(b => b.onclick = () => { closeSheet(); closeViewer(); setTab('library'); setQuery('tag:' + b.dataset.tag); });
  $('#addTag').onclick = () => {
    const v = $('#newTag').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); if (!v.length) return;
    user.tags[it.id] = Array.from(new Set((user.tags[it.id] || []).concat(v))); invalidateHay(it.id); saveUser(); itemSheet(it);
  };
  $$('#colList [data-col]').forEach(b => b.onclick = () => { const on = toggleInCollection(b.dataset.col, it.id); toast((on ? 'Added to ' : 'Removed from ') + user.collections[b.dataset.col].name); itemSheet(it); if (state.tab === 'library' && !V.open) renderLibrary(); });
  const addCol = () => { const n = $('#newCol').value.trim(); if (!n) return $('#newCol').focus(); const cid = createCollection(n); toggleInCollection(cid, it.id); toast('Created “' + n + '”'); itemSheet(it); if (state.tab === 'library' && !V.open) renderLibrary(); };
  $('#addCol').onclick = addCol; $('#newCol').onkeydown = e => { if (e.key === 'Enter') addCol(); };
  bindNoteSection(it);
  const cl = $('#btnCopyLink'); if (cl) cl.onclick = async () => toast((await copyText(it.link)) ? 'Link copied' : 'Copy failed');
  $('#btnCopyCode').onclick = async () => toast((await copyText(it.code)) ? 'Code copied' : 'Copy failed');
  $('#btnCopyApp').onclick = async () => toast((await copyText(appLink(it))) ? 'App link copied: it opens this item directly' : 'Copy failed');
  const pc = $('#btnPlayableCmd'); if (pc) pc.onclick = async () => toast((await copyText('python3 tools/optimize_media.py "' + it.local + '" --out media/playable')) ? 'Command copied. Run it in the app folder; the original is never changed.' : 'Copy failed');
  const vb = $('#btnVerifyOne'); if (vb) vb.onclick = async () => {
    const out = $('#verifyOne'); out.textContent = 'Hashing…';
    try { const buf = await bytesFor(it); const h = await sha256Hex(buf); out.innerHTML = h === it.sha256 ? '<span class="ok">✓ Identical to the catalog hash. Untouched.</span>' : '<span class="bad">✗ Different from the catalog hash.</span>'; }
    catch (e) { out.innerHTML = '<span class="warn">Could not read the file here (' + esc(e.message) + '). Serve the folder over http(s), or use the single-file build.</span>'; }
  };
  const rm = $('#btnRemoveImp'); if (rm) rm.onclick = () => { if (confirm('Remove this file from the app? Your original elsewhere is not touched.')) removeImported(it); };
  const rx = $('#btnRemoveExtra'); if (rx) rx.onclick = () => { if (confirm('Remove this entry from the app?')) removeExtra(it); };
}
const appLink = it => location.href.split(/[?#]/)[0] + '?open=' + encodeURIComponent(it.code);

/* ---------- tabs & search plumbing ---------- */
function setTab(t) {
  if (SEL.on && t !== state.tab) exitSelect();
  state.tab = t;
  $$('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + t));
  const navT = t === 'vault' || t === 'workspace' ? 'folders' : t;
  $$('#nav button[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === navT ? 'page' : 'false'));
  $('#searchRow').classList.toggle('hidden', t === 'tools');
  $('#fab').classList.toggle('hidden', t !== 'library' && t !== 'folders');
  const wide = innerWidth > 600;
  $('#q').placeholder = t === 'folders' ? (wide ? 'Search this folder, or type a command' : 'Search this folder') : t === 'library' ? (wide ? 'Search or ask…  try  unseen videos from drive' : 'Search or ask…') : 'Search…';
  if (t === 'library') renderLibrary(); else if (t === 'folders') renderFolders(); else if (t === 'vault') renderVault(); else if (t === 'workspace') renderWorkspace(); else renderTools();
  window.scrollTo({ top: 0 });
}
function setQuery(q) { state.q = q; $('#q').value = q; onQuery(); }
function onQuery() {
  if (state.tab === 'library') renderLibrary(); else if (state.tab === 'folders') renderFolders(); else if (state.tab === 'vault') renderVault(); else if (state.tab === 'workspace') renderWorkspace();
}
function setDensity(d) {
  prefs.density = d; savePrefs();
  document.body.classList.toggle('list', d === 'list'); document.body.classList.toggle('compact', d === 'compact');
  $('#dGrid').setAttribute('aria-pressed', d === 'grid'); $('#dList').setAttribute('aria-pressed', d === 'list'); $('#dCompact').setAttribute('aria-pressed', d === 'compact');
}
function skeleton() { $('#grid').innerHTML = Array.from({ length: 8 }, () => '<div class="sk"></div>').join(''); }
