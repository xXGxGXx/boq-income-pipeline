/* ===================== EXTRAS: your catalog layer · links · catalog import · add sheet · quick actions · insights ===================== */
const stripRuntime = it => { const o = {}; Object.keys(it).forEach(k => { if (k[0] !== '_' && k !== 'session') o[k] = it[k]; }); return o; };
const firstUrl = t => { const m = /https?:\/\/[^\s<>"']+/i.exec(String(t || '')); return m ? m[0].replace(/[).,;]+$/, '') : ''; };
const IMG_URL = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;
const HOST_NAMES = { 'drive.google.com': 'Google Drive', 'docs.google.com': 'Google Drive', 'photos.google.com': 'Google Photos', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'dropbox.com': 'Dropbox', 'onedrive.live.com': 'OneDrive', '1drv.ms': 'OneDrive', 'icloud.com': 'iCloud', 'imgur.com': 'Imgur', 'reddit.com': 'Reddit', 'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok' };
function hostLabel(url) {                                  // known names first, else the site's own name with a capital ("example.co.uk" -> "Example")
  try {
    const h = new URL(url).hostname.replace(/^(www|m)\./, '').toLowerCase(); if (HOST_NAMES[h]) return HOST_NAMES[h];
    const parts = h.split('.'), sld = parts.length > 2 && /^(co|com|net|org|gov|edu|ac)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
    return sld ? sld.charAt(0).toUpperCase() + sld.slice(1) : h;
  } catch (e) { return 'Link'; }
}
function cleanExtra(x) {
  const link = /^https?:\/\//i.test(x.link || '') ? String(x.link) : '';
  const it = normItem({
    id: String(x.id), code: String(x.code || x.id).slice(0, 80), title: String(x.title).slice(0, 300), kind: x.kind === 'image' ? 'image' : 'video',
    category: String(x.category || 'My links').slice(0, 80), source: String(x.source || (link ? hostLabel(link) : '')).slice(0, 80), res: String(x.res || '').slice(0, 40),
    tags: (Array.isArray(x.tags) ? x.tags : String(x.tags || '').split(/[,;]/)).map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 30),
    link, desc: x.desc ? String(x.desc).slice(0, 2000) : '', audio: x.audio ? String(x.audio).slice(0, 80) : '', extra: true, userLink: !!x.userLink, added: +x.added || Date.now(), fromFile: x.fromFile ? String(x.fromFile).slice(0, 120) : ''
  });
  const d = /\/d\/([\w-]{10,})/.exec(link) || /[?&]id=([\w-]{10,})/.exec(link); if (d && /google\.com/.test(link)) it.driveId = d[1];
  return it;
}
async function loadExtra() { const rows = await dbGet('kv', 'extra'); extraItems = Array.isArray(rows) ? rows.map(cleanExtra).filter(Boolean) : []; }
const saveExtra = () => dbPut('kv', 'extra', extraItems.map(stripRuntime));
async function removeExtra(it) {
  extraItems = extraItems.filter(x => x.id !== it.id); await saveExtra(); reindex(); closeSheet(); closeViewer(); renderLibrary(); toast('Removed from the app');
}

/* ---------- add sheet (the + button) ---------- */
const ADD = { home: '' };                     // where the next files go ('' = automatic filing)
function addSheet() {
  const pre = state.tab === 'folders' && canFile(state.folder) ? state.folder : '';
  const http = /^https?:$/.test(location.protocol);
  openSheet(`<h2>Add to your library</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Any photo, video or audio file. Stored byte-for-byte: nothing is converted, resized or recompressed. Links and rows are just entries.</p>
    <label class="fileinto">File into<select class="sel" id="adHome"><option value="">Automatic: by source, AI files to AI</option>${fileTargets().map(([k, n, d]) => k === 'h' ? `<optgroup label="${esc(n)}">` : `<option value="${esc(k)}"${k === pre ? ' selected' : ''}>${'\u2003'.repeat(Math.max(0, d - 1))}${esc(n)}</option>`).join('')}</select></label>
    <div class="addgrid">
      <button class="addopt" id="adFiles"><svg><use href="#i-img"/></svg><b>Photos, videos &amp; audio</b><span>Pick from this device</span></button>
      <button class="addopt" id="adFolder"><svg><use href="#i-vault"/></svg><b>A whole folder</b><span>Copied in, subfolders kept</span></button>
      <button class="addopt" id="adLinkDir"><svg><use href="#i-link"/></svg><b>Link a folder</b><span>${canLink() ? 'Read in place, never copied' : 'Not in this browser: copies instead'}</span></button>
      <button class="addopt" id="adCam"><svg><use href="#i-camera"/></svg><b>Camera</b><span>Take a photo or video</span></button>
      <button class="addopt" id="adPaste"><svg><use href="#i-copy"/></svg><b>Paste</b><span>Picture or link on the clipboard</span></button>
      <button class="addopt" id="adLink"><svg><use href="#i-globe"/></svg><b>A link</b><span>Drive or any site</span></button>
      <button class="addopt" id="adCat"><svg><use href="#i-ws"/></svg><b>A catalog file</b><span>TSV, CSV or JSON rows</span></button>
      <button class="addopt" id="adServer"${http ? '' : ' disabled'}><svg><use href="#i-server"/></svg><b>Phone folders</b><span>${http ? 'From the companion server' : 'Needs the companion server'}</span></button>
    </div>`);
  const home = () => $('#adHome').value;
  $('#adFiles').onclick = () => { ADD.home = home(); closeSheet(); $('#filePick').click(); };
  $('#adFolder').onclick = () => { ADD.home = home(); closeSheet(); $('#folderPick').click(); };
  $('#adLinkDir').onclick = () => { ADD.home = home(); closeSheet(); linkFolder(ADD.home); };
  $('#adCam').onclick = () => { ADD.home = home(); closeSheet(); $('#camPick').click(); };
  $('#adPaste').onclick = () => { ADD.home = home(); closeSheet(); pasteFromClipboard(); };
  $('#adLink').onclick = () => addLinkSheet();
  $('#adCat').onclick = () => { closeSheet(); $('#catalogPick').click(); };
  $('#adServer').onclick = () => { closeSheet(); loadServerLibrary(false).then(ok => { if (ok) openFolder('src/server'); }); };
}
async function pasteFromClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read(), files = [];
      for (const ci of items) { const t = ci.types.find(x => /^(image|video|audio)\//.test(x)); if (t) { const b = await ci.getType(t); files.push(new File([b], 'pasted-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + (t.split('/')[1] || 'bin').replace('jpeg', 'jpg'), { type: t })); } }
      if (files.length) return importFiles(files, { home: ADD.home || 'src/inbox' });
    }
    const t = await navigator.clipboard.readText(), u = firstUrl(t);
    if (u) return addLinkSheet({ url: u });
    toast('Nothing to paste: copy a picture or a link first');
  } catch (e) { toast('The browser did not allow reading the clipboard. Press Ctrl+V (or long-press › Paste) on the page instead.'); }
}

/* ---------- save a link ---------- */
async function nextLinkCode() { let n = (await dbGet('kv', 'linkSeq')) || 0; n++; await dbPut('kv', 'linkSeq', n); return 'L' + String(n).padStart(3, '0'); }
function addLinkSheet(pre) {
  pre = pre || {};
  const cats = Array.from(new Set(everything().map(i => i.category).filter(Boolean))).sort();
  const kind0 = IMG_URL.test(pre.url || '') ? 'image' : 'video';
  openSheet(`<h2>Save a link</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">It becomes an online item in your library. Drive links can play inside the app with “Play here”.</p>
    <div class="form">
      <label>Link<input class="input" id="lnUrl" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://drive.google.com/file/d/…" value="${esc(pre.url || '')}"></label>
      <label>Title<input class="input" id="lnTitle" placeholder="Optional; the link is used if empty" value="${esc(pre.title || '')}" maxlength="300"></label>
      <label>Category<input class="input" id="lnCat" list="lnCats" value="${esc(pre.category || 'My links')}" maxlength="80"><datalist id="lnCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label>Tags<input class="input" id="lnTags" placeholder="comma separated" autocapitalize="off"></label>
      <div class="seg" id="lnKind"><button data-k="video" aria-pressed="${kind0 === 'video'}">Video</button><button data-k="image" aria-pressed="${kind0 === 'image'}">Image</button></div>
    </div>
    <div id="lnMsg" class="formmsg"></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="lnSave">Save link</button><button class="btn" id="lnPaste">Paste from clipboard</button></div>`);
  const kindBtns = $$('#lnKind button');
  kindBtns.forEach(b => b.onclick = () => kindBtns.forEach(x => x.setAttribute('aria-pressed', x === b)));
  $('#lnPaste').onclick = async () => { try { const t = await navigator.clipboard.readText(); const u = firstUrl(t); if (u) { $('#lnUrl').value = u; if (IMG_URL.test(u)) kindBtns.forEach(x => x.setAttribute('aria-pressed', x.dataset.k === 'image')); } else $('#lnMsg').textContent = 'No link found on the clipboard.'; } catch (e) { $('#lnMsg').textContent = 'The browser did not allow reading the clipboard. Long-press the box and paste.'; } };
  const save = async () => {
    const url = firstUrl($('#lnUrl').value.trim()), msg = $('#lnMsg');
    if (!url) { msg.textContent = 'Please enter a link that starts with http:// or https://'; $('#lnUrl').focus(); return; }
    const dup = everything().find(i => i.link && i.link.split('#')[0] === url.split('#')[0]);
    if (dup) { msg.innerHTML = 'Already in your library as <b>' + esc(dup.code) + '</b> · ' + esc(dup.title) + '.'; return; }
    const it = cleanExtra({
      id: 'lnk-' + hashStr(url).toString(16), code: await nextLinkCode(), title: $('#lnTitle').value.trim() || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80),
      kind: ($('#lnKind [aria-pressed="true"]') || {}).dataset ? $('#lnKind [aria-pressed="true"]').dataset.k : 'video', category: $('#lnCat').value.trim() || 'My links',
      tags: $('#lnTags').value, link: url, userLink: true, added: Date.now()
    });
    extraItems.push(it); await saveExtra(); reindex(); closeSheet();
    if (state.tab === 'library') renderLibrary();
    toast('Saved as ' + it.code, { label: 'Open', fn: () => openViewer(it.id, [it]) });
  };
  $('#lnSave').onclick = save; $('#lnUrl').onkeydown = e => { if (e.key === 'Enter') save(); };
  setTimeout(() => { const u = $('#lnUrl'); if (u && !u.value) u.focus(); }, 300);
}

/* ---------- import a catalog file (TSV / CSV / JSON) into your own layer ---------- */
function parseTable(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0], delim = first.split('\t').length > first.split(',').length ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === '') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const COL_ALIASES = { code: ['code', 'id', 'key'], title: ['title', 'name', 'file / item name'], kind: ['type', 'kind', 'format'], category: ['category', 'cat', 'group', 'section'], source: ['source', 'source group', 'site'],
  res: ['resolution', 'res', 'dimensions', 'quality'], tags: ['tags', 'tag', 'keywords'], link: ['link', 'url', 'href', 'drive link'], desc: ['description', 'desc', 'notes', 'note'], audio: ['audio'] };
function rowsToItems(objs, fileName) {
  const pick = (o, k) => { for (const a of COL_ALIASES[k]) { if (o[a] != null && String(o[a]).trim() !== '') return String(o[a]).trim(); } return ''; };
  return objs.map((o, n) => {
    const lo = {}; Object.keys(o || {}).forEach(k => { if (!UNSAFE_KEYS.has(k)) lo[k.toLowerCase().trim()] = o[k]; });
    const title = pick(lo, 'title'), link = pick(lo, 'link'); let code = pick(lo, 'code');
    if (!title && !link) return null;
    if (!code) code = (title || link).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'row-' + (n + 1);
    return cleanExtra({ id: 'row-' + code, code, title: title || link, kind: /image|photo|picture|img|jpe?g|png/i.test(pick(lo, 'kind')) ? 'image' : 'video', category: pick(lo, 'category') || 'Imported',
      source: pick(lo, 'source'), res: pick(lo, 'res'), tags: pick(lo, 'tags'), link, desc: pick(lo, 'desc'), audio: pick(lo, 'audio'), fromFile: fileName, added: Date.now() });
  }).filter(Boolean);
}
async function importCatalogFile(file) {
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('that file is larger than 10 MB');
    const text = await file.text(); let objs;
    if (/^\s*[\[{]/.test(text)) { const j = JSON.parse(text); objs = Array.isArray(j) ? j : (j.items || j.catalog || j.data || j.LIBRARY || []); if (!Array.isArray(objs)) throw new Error('no list of items found in that JSON'); }
    else { const rows = parseTable(text); if (rows.length < 2) throw new Error('need a header row and at least one row'); const head = rows[0].map(h => h.trim().toLowerCase()); objs = rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] == null ? '' : r[i]; }); return o; }); }
    makeRestorePoint('Before importing ' + file.name.slice(0, 40));
    const items = rowsToItems(objs.slice(0, 5000), file.name), known = new Set(everything().map(i => i.code.toLowerCase())), knownLinks = new Set(everything().map(i => i.link).filter(Boolean));
    const fresh = [], same = [];
    items.forEach(it => { if (known.has(it.code.toLowerCase()) || (it.link && knownLinks.has(it.link))) same.push(it.code); else { known.add(it.code.toLowerCase()); if (it.link) knownLinks.add(it.link); fresh.push(it); } });
    extraItems = extraItems.concat(fresh); await saveExtra(); reindex(); if (state.tab === 'library') renderLibrary();
    openSheet(`<h2>${fresh.length ? 'Added ' + fresh.length + ' new item' + (fresh.length > 1 ? 's' : '') : 'Nothing new in that file'}</h2>` + receiptRows([
      ['Source used', esc(file.name) + ' (' + objs.length + ' rows read)'],
      ['Original untouched?', '<span class="ok">Yes.</span> The file was only read. Your built-in catalog is not changed either; these rows live in your own layer.'],
      ['Anything processed?', 'No media. Rows were matched by code and link.'],
      ['Already here', same.length ? same.length + ' row' + (same.length > 1 ? 's' : '') + ' skipped: ' + same.slice(0, 8).map(esc).join(', ') + (same.length > 8 ? '…' : '') : 'none'],
      ['Reusable later?', 'Yes. They persist, appear under “My links &amp; rows”, and are included in backups.']]) +
      (fresh.length ? '<div style="margin-top:12px"><button class="btn primary" id="rcShowAdded">Show them</button></div>' : ''));
    const b = $('#rcShowAdded'); if (b) b.onclick = () => { closeSheet(); setTab('library'); state.filter = 'added'; renderLibrary(); };
  } catch (e) { toast('Could not import: ' + e.message); }
}

/* ---------- quick actions (command palette) ---------- */
const PAL = { open: false, sel: 0, results: [] };
const goFilter = f => { setTab('library'); state.filter = f; state.cat = state.col = null; state.q = ''; $('#q').value = ''; renderLibrary(); };
function paletteActions() {
  const A = [
    ['Home', 'Go to', () => setTab('library'), '1'], ['Folders (your master library)', 'Go to', () => openFolder('root'), '2'], ['Scroll through this', 'Play', () => runCommand('scroll', 'palette'), '3'], ['Tools', 'Go to', () => setTab('tools'), '4'],
    ['Vault: phone folder snapshot', 'Go to', () => setTab('vault')], ['Workspace files', 'Go to', () => setTab('workspace')],
    ['Add photos, videos & audio', 'Add', () => $('#filePick').click(), 'A'], ['Add a folder (copy)', 'Add', () => $('#folderPick').click()], ['Link a folder (read in place)', 'Add', () => linkFolder()], ['Camera', 'Add', () => $('#camPick').click()], ['Paste a picture or link', 'Add', pasteFromClipboard],
    ['Save a link', 'Add', () => addLinkSheet()], ['Import a catalog file (TSV, CSV, JSON)', 'Add', () => $('#catalogPick').click()], ['Load phone folders (companion server)', 'Add', () => loadServerLibrary(false)],
    ['Voice: tap to talk', 'Voice', () => startVoice(false), 'V'], ['Voice: keep listening (hands-free)', 'Voice', () => startVoice(true)], ['What can I say?', 'Voice', commandsSheet],
    ['New folder', 'Organise', () => newFolderSheet(isMy(state.folder) && state.tab === 'folders' ? state.folder : 'my')], ['Select items', 'Organise', () => runCommand('select', 'palette')], ['Save this search', 'Organise', () => runCommand('save search', 'palette')],
    ['Where are my files? (library location)', 'Library', whereSheet], ['Copy the library link', 'Library', () => copyText(appBase() + '?tab=folders').then(ok => toast(ok ? 'Library link copied' : 'Copy failed'))], ['Export the library to a real folder', 'Library', () => masterSheet()],
    ['Surprise me: something unseen', 'Play', shuffle, 'S'], ['Show favourites', 'Filter', () => goFilter('fav')], ['Show what is on this device', 'Filter', () => goFilter('local')], ['Show videos', 'Filter', () => goFilter('video')],
    ['Show unseen', 'Filter', () => { goFilter('all'); setQuery('is:unseen'); }], ['Show Drive items', 'Filter', () => { goFilter('all'); setQuery('is:drive'); }], ['Clear search and filters', 'Filter', () => goFilter('all')],
    ['Blur thumbnails on / off', 'Privacy', () => $('#btnPriv').click(), 'B'], ['Hide the screen now', 'Privacy', panic, 'X'], ['Set or change PIN', 'Privacy', () => { setTab('tools'); $('#btnPin').click(); }],
    ['Dark theme', 'Look', () => { prefs.theme = 'dark'; savePrefs(); applyPrefs(); }], ['OLED black theme', 'Look', () => { prefs.theme = 'oled'; savePrefs(); applyPrefs(); }], ['Light theme', 'Look', () => { prefs.theme = 'light'; savePrefs(); applyPrefs(); }],
    ['Verify originals', 'Tools', () => { setTab('tools'); verifyAll(); }], ['Find duplicates', 'Tools', showDupes], ['Export backup', 'Tools', exportBackup], ['Restore a backup', 'Tools', () => $('#restorePick').click()],
    ['Export this view as CSV', 'Tools', exportCsv], ['Run self-test', 'Tools', () => { setTab('tools'); selfTest(); }], ['Insights', 'Tools', () => { setTab('tools'); setTimeout(() => $('#cardInsights').scrollIntoView({ block: 'start' }), 50); }],
    ['Keyboard shortcuts & search help', 'Help', showHelp, '?']
  ];
  Object.entries(user.collections || {}).forEach(([cid, c]) => A.push(['Open collection: ' + c.name, 'Collection', () => { setTab('library'); state.filter = 'col'; state.col = cid; renderLibrary(); }]));
  const fol = SYSDEF.filter(d => d[0] !== 'root').map(d => d[0]).concat(Object.keys(user.folders), Object.keys(user.saved || {}).map(s => 'saved:' + s), LINK.roots.map(r => 'lk:' + r.id));
  fol.forEach(f => A.push(['Folder: ' + pathOf(f).slice(1).map(p => p.name).join(' › '), 'Folder', () => openFolder(f)]));
  return A;
}
function openPalette() {
  let el = $('#palette');
  if (!el) {
    el = document.createElement('div'); el.id = 'palette'; el.className = 'palette'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Quick actions');
    el.innerHTML = '<div class="pbox"><div class="pin"><svg viewBox="0 0 24 24"><use href="#i-bolt"/></svg><input id="palQ" placeholder="Type a command, a folder, or search…  e.g. play unseen videos" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Quick actions"></div><ul id="palList" role="listbox"></ul><div class="pfoot">↑↓ to move · Enter to run · Esc to close · try “file this in sourced”, “open generated”, “scroll favourites”</div></div>';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', e => { if (e.target === el) closePalette(); });
    $('#palQ').addEventListener('input', e => { PAL.sel = 0; renderPal(e.target.value); });
    $('#palList').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) runPal(+li.dataset.i); });
  }
  PAL.open = true; PAL.sel = 0; el.classList.add('open'); $('#palQ').value = ''; renderPal(''); setTimeout(() => $('#palQ').focus(), 20);
}
function closePalette() { PAL.open = false; const el = $('#palette'); if (el) el.classList.remove('open'); }
function renderPal(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const acts = paletteActions().filter(a => words.every(w => (a[0] + ' ' + a[1]).toLowerCase().includes(w))).slice(0, q ? 7 : 10);
  const items = q.trim() ? (/[a-z]:\S/.test(q) || interpret(q).t === 'search' ? shown().filter(it => matchesQuery(it, parseQuery(q))).slice(0, 8) : []) : user.recent.map(id => byId.get(id)).filter(it => it && isShown(it)).slice(0, 4);
  PAL.results = acts.map(a => ({ label: a[0], hint: a[1], key: a[3], run: a[2] })).concat(items.map(it => ({ label: it.title, hint: it.code + (it.category ? ' · ' + it.category : ''), item: it, run: () => openViewer(it.id, [it]) })));
  if (q.trim()) { const c = interpret(q); if (c.t !== 'search' && c.t !== 'none') PAL.results.unshift({ label: describe(c), hint: 'Command · Enter to run', key: '↵', run: () => runCommand(q, 'palette'), cmd: true }); }
  if (PAL.sel >= PAL.results.length) PAL.sel = Math.max(0, PAL.results.length - 1);
  $('#palList').innerHTML = PAL.results.length ? PAL.results.map((r, i) => `<li data-i="${i}" role="option" aria-selected="${i === PAL.sel}"><span class="pt"><b>${esc(r.label)}</b><small>${esc(r.hint)}</small></span>${r.key ? `<kbd>${esc(r.key)}</kbd>` : r.item ? `<span class="pk">${hasLocal(r.item) ? 'open' : 'link'}</span>` : ''}</li>`).join('') +
    (q.trim() && !items.length ? '' : '') : `<li class="none">Nothing matches “${esc(q)}”.</li>`;
  const s = $('#palList [aria-selected="true"]'); if (s) s.scrollIntoView({ block: 'nearest' });
}
function runPal(i) { const r = PAL.results[i]; if (!r) return; closePalette(); try { r.run(); } catch (e) { toast('That did not work: ' + e.message); } }
function palKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); PAL.sel = clamp(PAL.sel + (e.key === 'ArrowDown' ? 1 : -1), 0, PAL.results.length - 1); renderPal($('#palQ').value); }
  else if (e.key === 'Enter') { e.preventDefault(); runPal(PAL.sel); }
}

/* ---------- insights ---------- */
function renderInsights() {
  const box = $('#insights'); if (!box) return;
  const all = everything(), local = all.filter(hasLocal), bytes = local.reduce((s, i) => s + (i.bytes || 0), 0);
  const count = f => { const m = {}; all.forEach(i => { const k = f(i); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const tags = {}; all.forEach(i => tagsOf(i).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
  const bars = (title, rows, max) => `<div class="sect-h" style="margin-top:12px">${title}</div>` + rows.map(([k, n]) => `<div class="bar-row"><span class="path">${esc(k)}</span><span class="val">${n}</span><span class="track"><i style="width:${Math.max(3, n / max * 100)}%"></i></span></div>`).join('');
  const src = count(i => srcShort(i.source) || 'Other').slice(0, 6), cats = count(i => i.category || 'Other').slice(0, 8), topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 14);
  const opened = Object.keys(user.seen).filter(id => byId.has(id)).length;
  box.innerHTML = `<div class="stat-grid"><div class="stat"><b>${all.length}</b><span>items</span></div><div class="stat"><b>${local.length}</b><span>on device · ${fmtBytes(bytes)}</span></div>
    <div class="stat"><b>${opened}</b><span>opened (${all.length ? Math.round(opened / all.length * 100) : 0}%)</span></div><div class="stat"><b>${Object.keys(user.fav).length}</b><span>favourites</span></div>
    <div class="stat"><b>${Object.keys(user.rating).length}</b><span>rated</span></div><div class="stat"><b>${Object.keys(user.collections || {}).length}</b><span>collections</span></div></div>
    ${bars('By source', src, src.length ? src[0][1] : 1)}${bars('Top categories', cats, cats.length ? cats[0][1] : 1)}
    <div class="sect-h" style="margin-top:12px">Top tags</div><div class="taglist">${topTags.map(([t, n]) => `<button class="tag" data-itag="${esc(t)}">${esc(t)} <span style="color:var(--muted)">${n}</span></button>`).join('')}</div>`;
  $$('[data-itag]', box).forEach(b => b.onclick = () => { setTab('library'); setQuery('tag:' + b.dataset.itag); });
}

/* ---------- companion kit: the tools travel inside the single file and come out as a zip (no network) ---------- */
let KIT = {}; try { KIT = JSON.parse(($('#kit') || {}).textContent || '{}') || {}; } catch (e) { KIT = {}; }
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {                       // plain STORE zip: [{name, data: Uint8Array, exec}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, (3 << 8) | 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, f.dir ? (((0o40755 << 16) | 0x10) >>> 0) : (((f.exec ? 0o100755 : 0o100644) << 16) >>> 0), 4], [42, off, 4]].forEach(([o, v, n]) => n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    central.push(c.buffer, name); off += 30 + name.length + data.length;
  }
  const csize = central.reduce((s, b) => s + (b.byteLength !== undefined ? b.byteLength : b.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
}
function downloadKit() {
  const enc = new TextEncoder(), names = Object.keys(KIT).sort();
  if (!names.length) return toast('The companion kit is part of the single-file version');
  const files = names.map(n => ({ name: 'media-hub-kit/' + n, data: enc.encode(KIT[n]), exec: /\.sh$/.test(n) }));
  files.push({ name: 'media-hub-kit/catalog.json', data: enc.encode(JSON.stringify(CAT, null, 1)) });
  download('media-hub-companion-kit.zip', makeZip(files)); toast('Kit saved: ' + files.length + ' files. Unzip it next to this file (on a phone: open it in Files and choose Extract).');
}
/* Phones can't preview a .zip, so every kit file can also be read, copied or saved on its own, right here. */
function viewKit() {
  const names = Object.keys(KIT).sort();
  if (!names.length) return toast('The companion kit is part of the single-file version');
  openSheet(`<h2>Companion kit</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Open a file to read it, copy it (for example into Termux), or save just that file. To unpack the whole kit on a phone, download the zip, open it in the Files app and choose Extract.</p>
    <div class="kitlist">${names.map((n, i) => `<details class="kitfile" data-i="${i}"><summary><b>${esc(n)}</b> <span class="kitsize">${fmtBytes(KIT[n].length)}</span></summary>
      <div class="row kitbtns"><button class="btn" data-kcopy="${i}">Copy</button><button class="btn" data-ksave="${i}">Save this file</button></div><pre class="kitpre"></pre></details>`).join('')}</div>
    <div style="margin-top:12px"><button class="btn primary" id="kvZip">Download all (.zip)</button></div>`);
  $$('#sheetBody .kitfile').forEach(d => d.addEventListener('toggle', () => { const pre = $('.kitpre', d); if (d.open && !pre.textContent) pre.textContent = KIT[names[+d.dataset.i]]; }));
  $$('#sheetBody [data-kcopy]').forEach(b => b.onclick = () => { const n = names[+b.dataset.kcopy]; copyText(KIT[n]).then(ok => toast(ok ? 'Copied ' + n.split('/').pop() : 'Copy failed: open the file and long-press the text')); });
  $$('#sheetBody [data-ksave]').forEach(b => b.onclick = () => { const n = names[+b.dataset.ksave]; download(n.split('/').pop(), KIT[n], 'text/plain'); });
  $('#kvZip').onclick = downloadKit;
}
