/* ===================== TOOLS: boot · privacy · import · backup · live server · self-test ===================== */
const APP_VERSION = (CAT.meta && CAT.meta.version) || '1.0';
const ACCENTS = ['#67d0f7', '#7ee0a0', '#f7b267', '#f78fb3', '#b79cff', '#ff7a7a', '#e6e6e6'];
const THEME_COLOR = { dark: '#0a0f18', oled: '#000000', light: '#f1f4f8' };
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* ---------- appearance & privacy prefs ---------- */
function inkFor(hexColor) {
  const n = parseInt(hexColor.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150 ? '#06121c' : '#ffffff';
}
function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = THEME_COLOR[prefs.theme] ? prefs.theme : 'dark';
  root.style.setProperty('--accent', prefs.accent);
  root.style.setProperty('--accent-ink', inkFor(prefs.accent));
  root.style.setProperty('--accent2', 'color-mix(in srgb,' + prefs.accent + ' 55%, #8b6cff)');
  root.style.setProperty('--blur', clamp(+prefs.blurAmt || 18, 4, 60) + 'px');
  const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = THEME_COLOR[root.dataset.theme];
  document.body.classList.toggle('priv', !!prefs.blur);
  const b = $('#btnPriv'); if (b) { b.setAttribute('aria-pressed', !!prefs.blur); b.innerHTML = '<svg><use href="#' + (prefs.blur ? 'i-eyeoff' : 'i-eye') + '"/></svg>'; }
}

/* ---------- PIN lock (PBKDF2-SHA256 · salted) · cover · panic ---------- */
const LOCK = { buf: '', mode: 'verify', first: '', cb: null, fails: 0, until: 0, on: false };
let panicCover = false, hiddenAt = 0, lastEsc = 0;
async function derivePin(pin, saltHex, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: iter || 150000 }, key, 256));
}
const sameStr = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function checkPin(pin) {
  const rec = await dbGet('kv', 'pin');
  if (!rec) { prefs.pinSet = false; prefs.pinLen = 0; savePrefs(); return 'missing'; }
  return sameStr(await derivePin(pin, rec.salt, rec.iter), rec.hash);
}
function buildKeys() {
  const k = $('#keys'); k.innerHTML = '';
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].forEach(x => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.k = x;
    b.setAttribute('aria-label', x === 'del' ? 'Delete' : x === 'ok' ? 'Confirm' : x);
    b.textContent = x === 'del' ? '⌫' : x === 'ok' ? '✓' : x;
    b.onclick = () => lockKey(x); k.appendChild(b);
  });
}
function lockDots() {
  const n = LOCK.mode === 'verify' ? (prefs.pinLen || 4) : Math.max(4, LOCK.buf.length), d = $('#pinDots'); d.innerHTML = '';
  for (let i = 0; i < n; i++) { const s = document.createElement('i'); if (i < LOCK.buf.length) s.className = 'f'; d.appendChild(s); }
}
function lockMsg(m, sub) { $('#lockMsg').textContent = m; $('#lockSub').textContent = sub || ''; }
function showLock(mode, cb) {
  if ((mode || 'verify') === 'verify') nvLock(true);                     // the PIN screen also locks encrypted notes
  LOCK.mode = mode || 'verify'; LOCK.buf = ''; LOCK.first = ''; LOCK.cb = cb || null; LOCK.on = true;
  if (V.vid) { try { V.vid.pause(); } catch (e) { } }
  $('#lock').classList.add('on'); $('#cover').classList.remove('on');
  $('#lockCancel').classList.toggle('hidden', !(LOCK.cb || LOCK.mode !== 'verify'));
  if (LOCK.mode === 'verify') lockMsg(LOCK.cb ? 'Enter PIN to continue' : 'Enter PIN', ''); else lockMsg('Choose a PIN', '4 to 8 digits, then tap ✓');
  lockDots();
}
function hideLock() { LOCK.on = false; LOCK.buf = ''; $('#lock').classList.remove('on'); panicCover = false; $('#cover').classList.remove('on'); }
async function lockSubmit() {
  const pin = LOCK.buf; if (!pin) return;
  if (LOCK.mode === 'verify') {
    if (Date.now() < LOCK.until) return lockMsg('Too many tries', 'Wait ' + Math.ceil((LOCK.until - Date.now()) / 1000) + ' s');
    let ok; try { ok = await checkPin(pin); } catch (e) { ok = 'missing'; }
    if (ok === 'missing') { hideLock(); toast('No PIN found on this device, so the lock was cleared'); return; }
    if (ok) { const cb = LOCK.cb; LOCK.fails = 0; hideLock(); if (cb) cb(); return; }
    LOCK.fails++; LOCK.buf = ''; lockDots();
    const d = $('#pinDots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); if (navigator.vibrate) navigator.vibrate(60);
    if (LOCK.fails >= 5) { LOCK.until = Date.now() + Math.min(300, 15 * Math.pow(2, LOCK.fails - 5)) * 1000; lockMsg('Too many tries', 'Wait ' + Math.ceil((LOCK.until - Date.now()) / 1000) + ' s'); }
    else lockMsg('Wrong PIN', (5 - LOCK.fails) + ' tries before a short wait');
    return;
  }
  if (LOCK.mode === 'set1') {
    if (pin.length < 4) return lockMsg('Too short', 'Use at least 4 digits');
    LOCK.first = pin; LOCK.buf = ''; LOCK.mode = 'set2'; lockMsg('Confirm PIN', 'Enter it once more, then tap ✓'); lockDots(); return;
  }
  if (LOCK.mode === 'set2') {
    if (pin !== LOCK.first) { LOCK.mode = 'set1'; LOCK.buf = ''; LOCK.first = ''; lockMsg('Did not match', 'Choose a PIN again'); lockDots(); return; }
    try {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const rec = { salt, iter: 150000, hash: await derivePin(pin, salt, 150000) };
      const persisted = await dbPut('kv', 'pin', rec);
      prefs.pinSet = true; prefs.pinLen = pin.length; savePrefs(); hideLock(); renderTools();
      toast(persisted ? 'PIN set' : 'PIN set for this session only: storage is unavailable here');
    } catch (e) { hideLock(); toast('PIN needs a secure page (https, localhost or the app)'); }
  }
}
function lockKey(k) {
  if (!LOCK.on) return;
  if (LOCK.mode === 'verify' && Date.now() < LOCK.until) {            // locked out: swallow input so the buffer never fills up
    LOCK.buf = ''; lockDots(); lockMsg('Too many tries', 'Wait ' + Math.ceil((LOCK.until - Date.now()) / 1000) + ' s'); return;
  }
  if (LOCK.until && LOCK.mode === 'verify') { LOCK.until = 0; lockMsg('Enter PIN', ''); }
  if (k === 'del') LOCK.buf = LOCK.buf.slice(0, -1);
  else if (k === 'ok') return lockSubmit();
  else if (/^\d$/.test(k) && LOCK.buf.length < 8) LOCK.buf += k;
  lockDots();
  if (LOCK.mode === 'verify' && prefs.pinLen && LOCK.buf.length === prefs.pinLen) lockSubmit();
}
function panic() {
  nvLock(true);
  if (LOCK.on) return;
  if (V.vid) { try { V.vid.pause(); } catch (e) { } }
  closeSheet(); $('#toast').classList.remove('on');
  if (prefs.pinSet) showLock('verify'); else { panicCover = true; $('#cover').classList.add('on'); }
}
function bindPrivacy() {
  $('#btnPriv').onclick = () => { prefs.blur = !prefs.blur; savePrefs(); applyPrefs(); renderTools(); toast(prefs.blur ? 'Thumbnails blurred' : 'Blur off'); };
  $('#btnPanic').onclick = panic; $('#btnLockNow').onclick = panic;
  buildKeys();
  $('#lockCancel').onclick = () => {
    if (LOCK.mode === 'verify' && !LOCK.cb) return; // launch / panic lock cannot be dismissed without the PIN
    hideLock();
  };
  let ct = 0; $('#cover').addEventListener('pointerup', () => { const n = Date.now(); if (panicCover && n - ct < 600) { panicCover = false; $('#cover').classList.remove('on'); } ct = n; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (prefs.hideBg) { if (V.vid) { try { V.vid.pause(); } catch (e) { } } if (!LOCK.on) $('#cover').classList.add('on'); }
      if (prefs.pinSet && prefs.lockAfter === 0 && !LOCK.on) showLock('verify');
    } else {
      if (!panicCover && !LOCK.on) $('#cover').classList.remove('on');
      if (prefs.pinSet && prefs.lockAfter > 0 && !LOCK.on && Date.now() - hiddenAt >= prefs.lockAfter) showLock('verify');
    }
  });
  $('#btnPin').onclick = () => { if (!(crypto && crypto.subtle)) return toast('PIN needs a secure page (https, localhost or the app)'); showLock('set1'); };
  $('#btnPinClear').onclick = () => showLock('verify', async () => { await dbDel('kv', 'pin'); prefs.pinSet = false; prefs.pinLen = 0; savePrefs(); renderTools(); toast('PIN removed'); });
}

/* ---------- import: byte-for-byte, hashed, de-duplicated ---------- */
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'svg']);
const VID_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'avi', '3gp', 'ts']);
const HASH_MAX = 400 * 1024 * 1024;
async function sniffType(file) {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer()), s = (a, o) => a.every((x, i) => b[o + i] === x);
  const asc = (t, o) => s(Array.from(t).map(c => c.charCodeAt(0)), o);
  if (s([0xFF, 0xD8, 0xFF], 0)) return 'image/jpeg';
  if (s([0x89, 0x50, 0x4E, 0x47], 0)) return 'image/png';
  if (asc('GIF8', 0)) return 'image/gif';
  if (asc('RIFF', 0) && asc('WEBP', 8)) return 'image/webp';
  if (asc('BM', 0)) return 'image/bmp';
  if (asc('ftyp', 4)) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/^(heic|heix|hevc|mif1|msf1)/.test(brand)) return 'image/heic';
    if (brand === 'avif') return 'image/avif';
    if (/^(M4A |M4B |M4P )/.test(brand) || (/\.(m4a|m4b)$/i.test(file.name) && brand !== 'qt  ')) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  if (s([0x1A, 0x45, 0xDF, 0xA3], 0)) return /\.(weba)$/i.test(file.name) ? 'audio/webm' : 'video/webm';
  if (asc('OggS', 0)) return /\.(ogg|oga|opus)$/i.test(file.name) ? 'audio/ogg' : 'video/ogg';
  if (asc('ID3', 0) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0 && /\.(mp3|aac)$/i.test(file.name))) return /\.aac$/i.test(file.name) ? 'audio/aac' : 'audio/mpeg';
  if (asc('fLaC', 0)) return 'audio/flac';
  if (asc('RIFF', 0) && asc('WAVE', 8)) return 'audio/wav';
  if (asc('#!AMR', 0)) return 'audio/amr';
  return '';
}
const kindOfMime = m => /^video\//.test(m) ? 'video' : /^image\//.test(m) ? 'image' : /^audio\//.test(m) ? 'audio' : '';
function kindOfFile(f) {
  const k = kindOfMime(f.type); if (k) return k;
  const e = (f.name.split('.').pop() || '').toLowerCase(); return VID_EXT.has(e) ? 'video' : IMG_EXT.has(e) ? 'image' : AUD_EXT.has(e) ? 'audio' : '';
}
async function probeDims(file, kind) {
  try {
    if (kind === 'image') { const bm = await createImageBitmap(file); const r = bm.width + '×' + bm.height; bm.close && bm.close(); return { res: r }; }
    return await new Promise(res => {
      const v = document.createElement(kind === 'audio' ? 'audio' : 'video'), u = URL.createObjectURL(file); v.preload = 'metadata'; v.muted = true;
      const done = r => { URL.revokeObjectURL(u); v.removeAttribute('src'); res(r); };
      v.onloadedmetadata = () => done({ res: v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '', dur: v.duration });
      v.onerror = () => done({}); setTimeout(() => done({}), 4000); v.src = u;
    });
  } catch (e) { return {}; }
}
const busy = msg => { $('#toastMsg').textContent = msg; $$('#toast button').forEach(b => b.remove()); $('#toast').classList.add('on'); clearTimeout(toastT); };
const receiptRows = rows => '<dl class="kv">' + rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1]}</dd>`).join('') + '</dl>';
async function nextCode() {
  let n = (await dbGet('kv', 'impSeq')) || 0; n++; await dbPut('kv', 'impSeq', n); return 'U' + String(n).padStart(3, '0');
}
async function importFiles(fileList, opts = {}) {
  const files = Array.from(fileList || []); if (!files.length) return;
  const home = opts.home && canFile(opts.home) ? opts.home : '', inbox = !!opts.inbox || home === 'src/inbox';
  const rep = { added: [], dupes: [], skipped: [], unhashed: 0, session: 0 };
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; busy('Adding ' + (i + 1) + ' of ' + files.length + '…');
    let kind = kindOfFile(f); const sniff = await sniffType(f).catch(() => '');
    if (sniff && kindOfMime(sniff)) kind = kindOfMime(sniff);
    if (!kind) { rep.skipped.push(f.name); continue; }
    let sha = '';
    if (f.size <= HASH_MAX) { try { sha = await sha256Hex(await f.arrayBuffer()); } catch (e) { sha = ''; } } else rep.unhashed++;
    const id = sha ? 'imp-' + sha.slice(0, 16) : 'imp-' + hashStr(f.name + '|' + f.size + '|' + f.lastModified).toString(16);
    const twin = everything().find(x => x.id === id || (sha && x.sha256 === sha));
    if (twin) { rep.dupes.push({ name: f.name, code: twin.code }); if (home && !user.home[twin.id] && twin.imported) user.home[twin.id] = home; continue; }
    const rel = (f.webkitRelativePath || f._rel || '').split('/').filter(Boolean); rel.pop();
    const mime = sniff || f.type || EXT_MIME[extOf(f.name)] || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/jpeg');
    const blob = (f.type === mime) ? f : new Blob([f], { type: mime });  // same bytes, only the label differs
    const dims = await probeDims(blob, kind);
    const it = normItem({
      id, code: await nextCode(), title: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), kind, mime, bytes: f.size, sha256: sha, name: f.name,
      added: Date.now(), category: rel.length ? rel[rel.length - 1] : 'Added by me', source: opts.from ? 'Shared by ' + String(opts.from).slice(0, 60) : inbox ? 'Shared to the app' : 'This device', res: dims.res || '', dur: dims.dur || 0, tags: rel.map(s => s.toLowerCase()).slice(0, 8), imported: true,
      folder: rel.join('/'), inbox
    });
    if (home && home !== autoHome(it)) user.home[id] = home;
    const okF = await dbPut('files', id, { blob, name: f.name, type: mime });
    const okM = await dbPut('imports', id, Object.assign({}, it));
    if (!okF || !okM) { it.session = true; it._file = blob; rep.session++; }
    imported.push(it); rep.added.push(it);
  }
  reindex(); changed(); $('#toast').classList.remove('on');
  refreshViews();
  const folders = Array.from(new Set(rep.added.map(it => pathOf(homeOf(it)).slice(1).map(p => p.name).join(' › '))));
  const rows = [
    ['Source used', 'Your own files from this device (' + files.length + ' picked)'],
    ['Original untouched?', '<span class="ok">Yes.</span> Stored as a byte-for-byte copy. The files you picked were only read.'],
    ['Anything processed?', 'No. Nothing was resized, converted or recompressed. A SHA-256 was computed' + (rep.unhashed ? ' (skipped for ' + rep.unhashed + ' very large file' + (rep.unhashed > 1 ? 's' : '') + ')' : '') + '.'],
    ['Archived?', rep.session ? '<span class="warn">Only for this session</span> (' + rep.session + '): storage is full or blocked. Free space or install the app, then add again.' : 'Yes, inside this app (' + rep.added.length + ' new).'],
    ['Reusable later?', 'Yes. They persist, and adding the same file again is recognised by hash.']
  ];
  if (rep.added.length) rows.splice(1, 0, ['Filed in', folders.slice(0, 4).map(esc).join(', ') + (folders.length > 4 ? '…' : '') + (home ? '' : ' (automatic: AI-made files go to AI)')]);
  if (rep.dupes.length) rows.push(['Already here', rep.dupes.length + ' exact copy' + (rep.dupes.length > 1 ? ' copies' : '') + ' skipped: ' + rep.dupes.slice(0, 6).map(d => esc(d.name) + ' = ' + esc(d.code)).join(', ') + (rep.dupes.length > 6 ? '…' : '')]);
  if (rep.skipped.length) rows.push(['Skipped', rep.skipped.length + ' not a photo, video or audio file: ' + rep.skipped.slice(0, 4).map(esc).join(', ') + (rep.skipped.length > 4 ? '…' : '')]);
  if (!rep.added.length && !rep.dupes.length && !rep.skipped.length) return;
  if (rep.added.length === 1 && !rep.dupes.length && !rep.skipped.length && !rep.session) { const it = rep.added[0]; toast('Added ' + it.code + ' to ' + folders[0], { label: 'Open', fn: () => openViewer(it.id, [it]) }); return; }
  openSheet('<h2>' + (rep.added.length ? 'Added ' + rep.added.length + ' file' + (rep.added.length > 1 ? 's' : '') : 'Nothing new to add') + '</h2>' + receiptRows(rows) +
    (rep.added.length ? '<div style="margin-top:12px"><button class="btn primary" id="rcShow">Show them</button></div>' : ''));
  const sh = $('#rcShow'); if (sh) sh.onclick = () => { closeSheet(); if (rep.added.length && folders.length === 1) openFolder(homeOf(rep.added[0])); else { setTab('library'); setQuery('is:imported'); } };
  if (navigator.storage && navigator.storage.persist && rep.added.length) navigator.storage.persist().catch(() => { });
}
async function loadImports() {
  const rows = await dbAll('imports');
  imported = rows.map(([, v]) => normItem(Object.assign({}, v, { imported: true }))).sort((a, b) => (a.added || 0) - (b.added || 0));
}
async function removeImported(it) {
  await dbDel('imports', it.id); await dbDel('files', it.id);
  const u = urlCache.get(it.id); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); urlCache.delete(it.id);
  imported = imported.filter(x => x.id !== it.id); reindex(); closeSheet(); closeViewer(); renderLibrary(); toast('Removed from the app');
}
async function filesFromDrop(dt) {
  const entries = Array.from(dt.items || []).map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return Array.from(dt.files || []);
  const out = [];
  async function walk(en) {
    if (en.isFile) await new Promise(r => en.file(f => { f._rel = en.fullPath.replace(/^\//, ''); out.push(f); r(); }, r));
    else if (en.isDirectory) { const rd = en.createReader(); let batch; do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); for (const c of batch) await walk(c); } while (batch.length); }
  }
  for (const en of entries) await walk(en);
  return out;
}
async function scanShared() {
  const sl = await dbGet('kv', 'sharedLink');
  if (sl) { await dbDel('kv', 'sharedLink'); const u = firstUrl(sl.url) || firstUrl(sl.text); if (u) addLinkSheet({ url: u, title: sl.title || '' }); }
  const rows = (await dbAll('files')).filter(([k]) => String(k).startsWith('shared:')); if (!rows.length) return;
  const files = rows.map(([, v]) => new File([v.blob || v], v.name || 'shared', { type: v.type || (v.blob && v.blob.type) || '' }));
  for (const [k] of rows) await dbDel('files', k);
  await importFiles(files, { home: 'src/inbox', inbox: true });
}
function bindImport() {
  const pick = $('#filePick'), folder = $('#folderPick'), cam = $('#camPick');
  const takeHome = () => { const h = ADD.home; ADD.home = ''; return h; };
  $('#btnAdd').onclick = () => pick.click(); $('#btnFabAdd').onclick = addSheet;
  cam.onchange = () => { importFiles(cam.files, { home: takeHome() }).finally(() => { cam.value = ''; }); };
  $('#btnAddLink').onclick = () => addLinkSheet(); $('#btnImportCat').onclick = () => $('#catalogPick').click();
  $('#catalogPick').onchange = e => { const f = e.target.files[0]; if (f) importCatalogFile(f).finally(() => { e.target.value = ''; }); };
  $('#packPick').onchange = e => { const f = e.target.files[0]; if (f) importSharePack(f).finally(() => { e.target.value = ''; }); };
  $('#btnAddFolder').onclick = () => folder.click();
  pick.onchange = () => { importFiles(pick.files, { home: takeHome() }).finally(() => { pick.value = ''; }); };
  folder.onchange = () => { importFiles(folder.files, { home: takeHome() }).finally(() => { folder.value = ''; }); };
  pick.addEventListener('cancel', () => { ADD.home = ''; }); folder.addEventListener('cancel', () => { ADD.home = ''; });
  document.addEventListener('paste', e => {                       // Ctrl+V anywhere: pictures and clips go to the Inbox, links open “Save a link”
    if (e.target.matches && e.target.matches('input,textarea,[contenteditable]')) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => kindOfFile(f));
    if (files.length) { e.preventDefault(); importFiles(files, { home: state.tab === 'folders' && canFile(state.folder) ? state.folder : 'src/inbox' }); return; }
    const u = firstUrl(e.clipboardData && e.clipboardData.getData('text')); if (u) { e.preventDefault(); addLinkSheet({ url: u }); }
  });
  let depth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; document.body.classList.remove('dragging'); const home = state.tab === 'folders' && canFile(state.folder) ? state.folder : ''; filesFromDrop(e.dataTransfer).then(f => importFiles(f, { home })); });
}

/* ---------- verify originals · duplicates · CSV · backup ---------- */
async function verifyAll() {
  const log = $('#verifyLog'); log.classList.remove('hidden'); log.textContent = 'Checking…';
  const list = everything().filter(i => hasLocal(i) && i.sha256), out = []; let same = 0, diff = 0, unread = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i]; log.textContent = 'Checking ' + (i + 1) + ' of ' + list.length + '…\n' + out.slice(-6).join('\n');
    try {
      const buf = await bytesFor(it); if (!buf) { unread++; out.push('?  ' + it.code + '  not readable'); continue; }
      const h = await sha256Hex(buf);
      if (h === it.sha256) same++; else { diff++; out.push('✗  ' + it.code + '  differs from the catalog hash'); }
    } catch (e) { unread++; out.push('?  ' + it.code + '  ' + e.message); }
  }
  const nohash = everything().filter(i => hasLocal(i) && !i.sha256).length;
  log.innerHTML = esc(out.join('\n')) + (out.length ? '\n\n' : '') +
    `<span class="${diff ? 'bad' : 'ok'}">${same} identical</span> · <span class="${diff ? 'bad' : ''}">${diff} different</span> · <span class="${unread ? 'warn' : ''}">${unread} unreadable</span>${nohash ? ' · ' + nohash + ' without a hash' : ''}\n\n` +
    'Source used: files stored in this app / next to it\nOriginal untouched? Yes, read only\nAnything processed? No, hashes only\nArchived? n/a\nReusable later? Re-run any time' +
    (unread ? '\n\nUnreadable usually means the media folder is not reachable from a file:// page. Serve the folder with tools/media_serve.py or use the single-file build.' : '');
}
function showDupes() {
  const groups = new Map(); everything().forEach(i => { if (i.sha256) { if (!groups.has(i.sha256)) groups.set(i.sha256, []); groups.get(i.sha256).push(i); } });
  const d = Array.from(groups.values()).filter(g => g.length > 1);
  openSheet('<h2>Duplicate files</h2><p style="color:var(--muted)">Exact byte-for-byte matches, found by SHA-256. Nothing is deleted for you.</p>' +
    (d.length ? d.map(g => '<div class="pcard" style="background:var(--surface2);margin-top:8px"><b class="mono" style="font-size:.76rem">' + esc(g[0].sha256.slice(0, 16)) + '…</b><div style="margin-top:6px">' + g.map(i => '<button class="chip" data-open="' + esc(i.id) + '">' + esc(i.code) + ' · ' + esc(i.title) + '</button>').join(' ') + '</div></div>').join('') +
      '<div style="margin-top:12px"><button class="btn" id="dupShow">Show all in library</button></div>' : '<div class="empty" style="padding:24px"><b>No duplicates</b>Every file here is unique.</div>'));
  $$('#sheetBody [data-open]').forEach(b => b.onclick = () => { const it = byId.get(b.dataset.open); closeSheet(); if (it) openViewer(it.id, [it]); });
  const s = $('#dupShow'); if (s) s.onclick = () => { closeSheet(); setTab('library'); setQuery('is:dupe'); };
}
const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function exportCsv() {
  const head = ['code', 'title', 'kind', 'folder', 'category', 'source', 'resolution', 'tags', 'favourite', 'rating', 'note', 'on_device', 'sha256', 'link'];
  const src = state.tab === 'folders' ? ($('#fgrid')._list || []) : state.list, list = src.length ? src : shown();
  const rows = list.map(i => [i.code, i.title, i.kind, pathOf(homeOf(i)).slice(1).map(p => p.name).join(' / '), i.category, i.source, i.res, tagsOf(i).join(' '), isFav(i.id) ? 1 : '', user.rating[i.id] || '', user.note[i.id] || (isEnc(i.id) ? '[encrypted]' : ''), hasLocal(i) ? 1 : '', i.sha256 || '', i.link || '']);
  download('media-hub-view-' + today() + '.csv', '\uFEFF' + [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
  toast('Exported ' + rows.length + ' rows');
}
function safeMerge(dst, src) { if (!src || typeof src !== 'object') return 0; let n = 0; Object.keys(src).forEach(k => { if (!UNSAFE_KEYS.has(k)) { dst[k] = src[k]; n++; } }); return n; }
function exportBackup() {
  const p = Object.assign({}, prefs); delete p.token; delete p.pinSet; delete p.pinLen; delete p.rememberToken;
  const data = { app: 'media-hub', version: 3, exported: new Date().toISOString(), prefs: p, user, progress: Object.fromEntries(progress), extra: extraItems.map(stripRuntime), imports: imported.map(i => ({ id: i.id, code: i.code, title: i.title, sha256: i.sha256, bytes: i.bytes, name: i.name, folder: i.folder || '' })), linkedFolders: LINK.roots.map(r => ({ name: r.name, files: r.n || 0 })), profile: Object.assign({}, PROFILE), shared: sharedHeld.length, noteVault: NV.vault ? { v: NV.vault.v, salt: NV.vault.salt, iter: NV.vault.iter, check: NV.vault.check } : null };
  download('media-hub-backup-' + today() + '.json', JSON.stringify(data, null, 1), 'application/json');
  toast('Backup saved. No media files and no PIN are inside it' + (encCount() ? '; encrypted notes stay encrypted.' : '.'));
}
async function restoreBackup(file) {
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('file is too large to be a backup');
    const d = JSON.parse(await file.text()); if (!d || d.app !== 'media-hub' || !d.user) throw new Error('not a Media Hub backup');
    if (!confirm('Merge this backup into the app? Items in the backup win where both have a value. A restore point of how things are now is saved first.')) return;
    await makeRestorePoint('Before restoring ' + String(file.name).slice(0, 40), { force: true });
    const u = d.user, c = {};
    ['fav', 'rating', 'note', 'seen'].forEach(k => { c[k] = safeMerge(user[k], u[k]); });
    if (u.tags && typeof u.tags === 'object') Object.keys(u.tags).forEach(id => { if (!UNSAFE_KEYS.has(id) && Array.isArray(u.tags[id])) user.tags[id] = Array.from(new Set((user.tags[id] || []).concat(u.tags[id].map(String)))); });
    if (Array.isArray(u.recent)) user.recent = Array.from(new Set(u.recent.concat(user.recent))).slice(0, 24);
    let nc = 0; if (u.collections && typeof u.collections === 'object') Object.keys(u.collections).forEach(cid => { const c = u.collections[cid]; if (UNSAFE_KEYS.has(cid) || !c || typeof c.name !== 'string' || !Array.isArray(c.ids)) return; const cur = user.collections[cid]; user.collections[cid] = { name: c.name.slice(0, 60), created: +c.created || Date.now(), ids: Array.from(new Set((cur ? cur.ids : []).concat(c.ids.map(String)))) }; nc++; });
    if (u.adj && typeof u.adj === 'object') safeMerge(user.adj, u.adj);
    c.enote = 0; if (u.enote && typeof u.enote === 'object') Object.keys(u.enote).forEach(id => { if (!UNSAFE_KEYS.has(id) && validEnc(u.enote[id])) { user.enote[id] = u.enote[id]; c.enote++; if (!(u.note && u.note[id])) delete user.note[id]; } });
    if (u.note && typeof u.note === 'object') Object.keys(u.note).forEach(id => { if (!UNSAFE_KEYS.has(id) && user.note[id] && !(u.enote && u.enote[id])) delete user.enote[id]; });
    if (!NV.vault && validVault(d.noteVault)) { NV.vault = { v: 1, salt: d.noteVault.salt, iter: d.noteVault.iter, check: d.noteVault.check, created: Date.now() }; await dbPut('kv', 'noteVault', NV.vault); }
    NV.plain.clear();
    if (u.folders && typeof u.folders === 'object') Object.keys(u.folders).forEach(k => { const f = u.folders[k]; if (/^my:[\w-]{1,40}$/.test(k) && f && typeof f.name === 'string') user.folders[k] = { name: f.name.slice(0, 80), parent: typeof f.parent === 'string' && (f.parent === 'my' || /^my:[\w-]{1,40}$/.test(f.parent)) ? f.parent : 'my', created: +f.created || Date.now() }; });
    c.folders = 0; if (u.home && typeof u.home === 'object') Object.keys(u.home).forEach(id => { const h = u.home[id]; if (!UNSAFE_KEYS.has(id) && typeof h === 'string' && (SYS[h] || /^my:/.test(h))) { user.home[id] = h; c.folders++; } });
    ['trash', 'archive', 'gone'].forEach(k => { if (u[k] && typeof u[k] === 'object') Object.keys(u[k]).forEach(id => { if (!UNSAFE_KEYS.has(id) && isFinite(u[k][id])) user[k][id] = +u[k][id]; }); });
    if (u.saved && typeof u.saved === 'object') Object.keys(u.saved).forEach(sid => { const x = u.saved[sid]; if (!UNSAFE_KEYS.has(sid) && x && typeof x.q === 'string' && typeof x.name === 'string') user.saved[sid] = { name: x.name.slice(0, 60), q: x.q.slice(0, 300), created: +x.created || Date.now() }; });
    if (d.profile && typeof d.profile === 'object' && !PROFILE.name && typeof d.profile.name === 'string') { PROFILE = { uid: /^[a-z0-9-]{4,40}$/i.test(String(d.profile.uid || '')) ? String(d.profile.uid) : randHex(8), name: d.profile.name.slice(0, 40), dir: String(d.profile.dir || '').slice(0, 60) }; await saveProfile(); }
    let ne = 0; if (Array.isArray(d.extra)) d.extra.slice(0, 5000).forEach(x => { if (x && typeof x.id === 'string' && typeof x.title === 'string' && !byId.has(x.id)) { const it = cleanExtra(x); if (it) { extraItems.push(it); ne++; } } }); if (ne) { await saveExtra(); reindex(); }
    c.collections = nc; c.extra = ne;
    let pr = 0; if (d.progress && typeof d.progress === 'object') Object.keys(d.progress).forEach(id => { const v = d.progress[id]; if (!UNSAFE_KEYS.has(id) && v && isFinite(v.t) && isFinite(v.d)) { progress.set(id, v); dbPut('progress', id, v); pr++; } });
    if (d.prefs && typeof d.prefs === 'object') ['theme', 'accent', 'blur', 'blurAmt', 'hideBg', 'resume', 'autoNext', 'wake', 'driveThumbs', 'density', 'sort', 'speed', 'voiceReply', 'voiceWake', 'voiceLang', 'feedSound', 'feedAuto', 'startFolder'].forEach(k => { if (k in d.prefs && typeof d.prefs[k] === typeof DEFAULT_PREFS[k]) prefs[k] = d.prefs[k]; });
    savePrefs(); LIBV++; await dbPut('kv', 'user', user); applyPrefs(); setDensity(prefs.density); $('#sort').value = prefs.sort; everything().forEach(i => { i._hay = null; });
    renderLibrary(); renderTools();
    toast('Restored ' + c.fav + ' favourites, ' + c.rating + ' ratings, ' + c.note + ' notes, ' + (c.enote ? c.enote + ' encrypted notes, ' : '') + c.collections + ' collections, ' + c.folders + ' filed items, ' + pr + ' resume points' + (c.extra ? ', ' + c.extra + ' saved links/rows' : ''));
  } catch (e) { toast('Could not restore: ' + e.message); }
}

/* ---------- live Termux server (loopback only) ---------- */
function liveBaseUrl() {
  const raw = ($('#liveBase').value || '').trim(); let u;
  try { u = new URL(raw); } catch (e) { return { err: 'That is not a valid address.' }; }
  if (!/^https?:$/.test(u.protocol)) return { err: 'Use http:// or https://.' };
  if (u.username || u.password) return { err: 'Remove the user name or password from the address.' };
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return { err: 'Only loopback addresses (127.0.0.1, localhost, ::1) are accepted, so your token cannot leave this device.' };
  return { base: u.origin };
}
async function liveCall(path) {
  const log = $('#liveLog'), b = liveBaseUrl(); if (b.err) { log.textContent = b.err; return null; }
  const token = $('#liveToken').value.trim(), ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
  log.textContent = 'GET ' + b.base + path + ' …';
  try {
    const r = await fetch(b.base + path, { headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    const txt = await r.text(); let body; try { body = JSON.parse(txt); } catch (e) { body = null; }
    log.textContent = 'GET ' + path + ' → ' + r.status + '\n' + (body ? JSON.stringify(body, null, 1).slice(0, 1800) : txt.slice(0, 600)) +
      (r.status === 404 && /\/v1\/media\//.test(path) ? '\n\nThis endpoint is not on the orchestrator yet. It currently serves /v1/health and /v1/catalog.' : '') +
      (r.status === 401 || r.status === 403 ? '\n\nThe server wants a bearer token.' : '');
    return r.ok ? (body || txt) : null;
  } catch (e) {
    log.textContent = (e.name === 'AbortError' ? 'Timed out after 6 s. ' : 'Could not reach the server. ') + 'Is it running on this device, and does it allow this page’s origin (CORS)?';
    return null;
  } finally { clearTimeout(t); }
}
async function liveLoadCatalog() {
  const j = await liveCall('/v1/catalog'); if (!j) return;
  const arr = Array.isArray(j) ? j : (j.items || j.catalog || j.data || []);
  liveItems = arr.slice(0, 5000).filter(x => x && typeof x === 'object').map(x => {
    const code = String(x.code || x.id || ''), type = String(x.type || x.kind || '').toLowerCase();
    return normItem({
      id: 'live-' + code, code, title: String(x.title || code), kind: /image|photo|picture/.test(type) ? 'image' : 'video', category: String(x.category || 'Live'),
      source: String(x.source || 'Termux'), res: String(x.resolution || x.res || ''), tags: x.tags || '', link: /^https?:\/\//.test(x.link || x.url || '') ? (x.link || x.url) : '', _live: true
    });
  }).filter(x => x.code);
  reindex(); renderLibrary();
  $('#liveLog').textContent += '\n\nLoaded ' + liveItems.length + ' live items. Filter them with is:live.';
}
function bindLive() {
  const base = $('#liveBase'), tok = $('#liveToken'), rem = $('#optRememberToken');
  base.value = prefs.liveBase || 'http://127.0.0.1:8080'; tok.value = prefs.token || ''; rem.checked = !!prefs.rememberToken;
  base.onchange = () => { prefs.liveBase = base.value.trim(); savePrefs(); };
  tok.onchange = () => { if (prefs.rememberToken) { prefs.token = tok.value.trim(); savePrefs(); } };
  rem.onchange = () => { prefs.rememberToken = rem.checked; prefs.token = rem.checked ? tok.value.trim() : ''; savePrefs(); };
  $$('[data-live]').forEach(b => b.onclick = () => b.dataset.live === '/v1/catalog' ? liveLoadCatalog() : liveCall(b.dataset.live));
}

/* ---------- privacy & network: everything that could ever leave the device, and its state ---------- */
function renderNetCard() {
  const el = $('#netRows'); if (!el) return; const off = prefs.offlineOnly;
  const rows = [
    ['off', 'Your photos, videos and audio', 'Never uploaded. Not indexed, not searchable online. The page cannot contact any server except this device.'],
    [off || !prefs.driveThumbs ? 'off' : 'on', 'Drive thumbnails', off ? 'Off (offline-only)' : prefs.driveThumbs ? 'On: small previews of your Drive links load from Google' : 'Off'],
    [off ? 'off' : 'tap', 'Drive “Play here”', off ? 'Off (offline-only)' : prefs.drivePlayHere ? 'Opens Google Drive’s player straight away for Drive items' : 'Only when you tap Play here on a Drive item'],
    [off || !VOICE.SR ? 'off' : 'tap', 'Voice', off ? 'Off (offline-only)' : VOICE.SR ? 'Only while the mic is on: the words you say go to your browser’s speech service (Google’s, in Chrome). Never your media.' : 'Not available in this browser'],
    [off ? 'off' : 'tap', 'Web search links', off ? 'Off (offline-only)' : 'Only the words you type, only when you tap a search engine'],
    ['tap', 'Shared space', 'Leaves only as a share pack you send, or through a folder you connected and sync yourself']];
  el.innerHTML = rows.map(([st, t, d], i) => `<div class="netrow"><span class="st ${st === 'on' ? 'on' : 'off'}">${i === 0 ? 'never' : st === 'on' ? 'on' : st === 'tap' ? 'you decide' : 'off'}</span><span><b>${esc(t)}</b></span><small>${esc(d)}</small></div>`).join('');
}

/* ---------- install · storage · self-test · help ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; const b = $('#btnInstall'); if (b) b.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Installed'); renderTools(); });
async function storageLine() {
  const el = $('#storageInfo'); if (!el) return;
  try {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const per = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.textContent = (est ? fmtBytes(est.usage) + ' used of ' + fmtBytes(est.quota) + ' · ' : '') + (per ? 'protected' : 'not protected yet');
    $('#btnPersist').classList.toggle('hidden', per || !(navigator.storage && navigator.storage.persist));
  } catch (e) { el.textContent = ''; }
}
function renderTools() {
  $('#optBlur').checked = !!prefs.blur; $('#optBlurAmt').value = prefs.blurAmt; $('#optHideBg').checked = !!prefs.hideBg;
  $('#optLockAfter').value = String(prefs.lockAfter); $('#optResume').checked = !!prefs.resume; $('#optAutoNext').checked = !!prefs.autoNext;
  $('#optWake').checked = !!prefs.wake; $('#optDriveThumbs').checked = !!prefs.driveThumbs; $('#optDrivePlayHere').checked = !!prefs.drivePlayHere;
  renderInsights(); renderVoiceCard(); renderNetCard(); renderNotesCard(); renderRestoreCard();
  $('#optOffline').checked = !!prefs.offlineOnly;
  const si = $('#sharedInfo'); if (si) { const mine = sharedHeld.filter(x => x.owner && x.owner.uid === PROFILE.uid).length, others = sharedOwners().filter(o => o.key !== 'me' && o.n); si.textContent = (PROFILE.name ? 'Your folder: “' + (PROFILE.dir || PROFILE.name) + '”, ' + mine + ' shared. ' : 'No name yet: you will be asked the first time you share. ') + (others.length ? 'From others: ' + others.map(o => o.name + ' (' + o.n + ')').join(', ') + '. ' : '') + (SH.folder ? 'Shared folder connected.' : canLink() ? '' : 'This browser can’t connect folders; share packs work everywhere.'); }
  $('#btnConnectShared').classList.toggle('hidden', !canLink()); $('#btnConnectShared').textContent = SH.folder ? 'Sync shared folder' : 'Connect a shared folder…';
  const lc = $('#locCard'); if (lc) { lc.innerHTML = locationHtml(false); bindLocation(lc); }
  const sf = $('#srcInfo'); if (sf) sf.textContent = (canLink() ? 'This browser can link folders in place. ' : 'This browser cannot link folders in place; “Add folder” copies them in instead. ') + (LINK.roots.length ? LINK.roots.length + ' linked (' + linkedItems.length.toLocaleString() + ' files). ' : '') + (SERVER.roots.length ? 'Phone folders: ' + SERVER.roots.map(r => r.name).join(', ') + '.' : /^https?:$/.test(location.protocol) ? '' : 'Phone folders need the companion server.');
  $('#btnPin').textContent = prefs.pinSet ? 'Change PIN' : 'Set PIN'; $('#btnPinClear').classList.toggle('hidden', !prefs.pinSet);
  $('#optLockAfter').disabled = !prefs.pinSet;
  const kn = Object.keys(KIT).length; $('#cardKit').classList.toggle('hidden', !kn); if (kn) $('#kitInfo').textContent = kn + ' files, ' + fmtBytes(Object.values(KIT).reduce((s, x) => s + x.length, 0));
  $$('#themeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === prefs.theme));
  $$('#swatches .swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === prefs.accent));
  const st = $('#installState'), ctrl = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  st.textContent = isStandalone() ? 'Running as an installed app.' :
    location.protocol === 'file:' ? 'Opened from a file. Everything works offline as it is. To install it as an app, serve this folder with tools/media_serve.py (localhost) or host it over https.' :
    ctrl ? 'Offline copy is ready. Install it from the browser menu, or use the button.' : 'Setting up the offline copy… reload once if this stays here.';
  $('#btnInstall').classList.toggle('hidden', !deferredInstall);
  storageLine();
  const all = everything(), kv = [['Version', APP_VERSION], ['Folders', Object.keys(user.folders).length + ' of yours · ' + Object.keys(user.home).length + ' items filed by hand'], ['Built', (CAT.meta && CAT.meta.built) || '—'], ['Items', all.length + ' (' + all.filter(hasLocal).length + ' on device)'], ['Storage', idb ? 'IndexedDB' : 'memory only (this session)'], ['Mode', location.protocol === 'file:' ? 'file' : isStandalone() ? 'installed app' : 'browser']];
  $('#aboutKv').innerHTML = kv.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('');
}
async function selfTest() {
  const log = $('#diagLog'); log.classList.remove('hidden'); const L = [];
  const add = (lvl, t) => { L.push('<span class="' + lvl + '">' + (lvl === 'ok' ? '✓' : lvl === 'warn' ? '!' : '✗') + '</span> ' + esc(t)); log.innerHTML = L.join('\n'); };
  const all = everything(), ids = new Set(all.map(i => i.id));
  add(ids.size === all.length ? 'ok' : 'bad', 'Catalog: ' + all.length + ' items, ' + (ids.size === all.length ? 'all ids unique' : (all.length - ids.size) + ' duplicate ids'));
  add(all.every(i => i.title) ? 'ok' : 'warn', 'Every item has a title');
  const emb = Object.keys(EMB); let embOk = 0;
  for (const k of emb) { try { const h = await sha256Hex(await embBlob(k).arrayBuffer()); const it = catalogItems.find(x => x.local === k); if (!it || !it.sha256 || it.sha256 === h) embOk++; } catch (e) { } }
  if (emb.length) add(embOk === emb.length ? 'ok' : 'bad', 'Embedded media: ' + embOk + ' of ' + emb.length + ' match their catalog hashes');
  const rel = catalogItems.filter(i => i.local && !EMB[i.local]);
  if (rel.length) {
    if (location.protocol === 'file:') add('warn', rel.length + ' media files are referenced by path; they cannot be read from a file:// page (serve the folder, or use the single-file build)');
    else { let okc = 0; await Promise.all(rel.slice(0, 40).map(async i => { try { const r = await fetch(i.local, { method: 'HEAD', cache: 'no-store' }); if (r.ok) okc++; } catch (e) { } })); add(okc === Math.min(40, rel.length) ? 'ok' : 'bad', 'Media files reachable: ' + okc + ' of ' + Math.min(40, rel.length) + ' checked'); }
  }
  add(window.isSecureContext && crypto && crypto.subtle ? 'ok' : 'warn', window.isSecureContext && crypto && crypto.subtle ? 'Crypto available (hashes, PIN)' : 'Crypto needs a secure page; hashes and PIN are off');
  try { const ok = await dbPut('kv', '__t', { n: 1 }); const v = await dbGet('kv', '__t'); await dbDel('kv', '__t'); add(ok && v && v.n === 1 ? 'ok' : 'warn', ok ? 'Storage read/write works' : 'Storage is memory-only: files you add will not survive closing the app'); } catch (e) { add('bad', 'Storage failed: ' + e.message); }
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); add('ok', 'Settings storage works'); } catch (e) { add('warn', 'Settings cannot be saved here'); }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const regs = await navigator.serviceWorker.getRegistrations(); add(regs.length && navigator.serviceWorker.controller ? 'ok' : 'warn', regs.length ? (navigator.serviceWorker.controller ? 'Offline copy is active' : 'Offline copy installed, reload once to use it') : 'Offline copy not registered');
    if ('caches' in window) { const names = await caches.keys(); add(names.length ? 'ok' : 'warn', 'Cache: ' + (names.join(', ') || 'empty')); }
  } else add('warn', 'Offline copy needs http(s) or localhost (this page is ' + location.protocol + ')');
  try { const per = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; add(per ? 'ok' : 'warn', per ? 'Storage is protected from automatic clean-up' : 'Storage is not protected yet (use Protect storage)'); } catch (e) { }
  add(VOICE.SR ? 'ok' : 'warn', VOICE.SR ? 'Voice commands available (the browser’s speech service)' : 'No speech recognition in this browser: type commands in Quick actions instead');
  add(canLink() ? 'ok' : 'warn', canLink() ? 'Folders can be linked in place' : 'Linking folders is not supported here; “Add folder” copies instead');
  if (/^https?:$/.test(location.protocol)) { const ok = SERVER.state === 'on' || await loadServerLibrary(true); add(ok ? 'ok' : 'warn', ok ? 'Phone folders: ' + serverItems.length + ' files from the companion server' : 'Phone folders: not shared by this server (start media_serve.py with --library DIR)'); }
  const homes = new Set(everything().map(homeOf)); add('ok', 'Library: ' + homes.size + ' folders in use, ' + Object.keys(user.trash).length + ' in Trash, ' + Object.keys(user.archive).length + ' archived');
  add('ok', 'Done at ' + new Date().toLocaleTimeString());
}
function showHelp() {
  const k = (a, b) => `<dt><kbd>${a}</kbd></dt><dd>${b}</dd>`;
  openSheet(`<h2>Shortcuts &amp; search</h2><p style="margin:6px 0 0"><button class="btn small" id="hSay">What can I say or type? (commands)</button></p><h3 style="margin:14px 0 4px;font-size:.9rem">Anywhere</h3><dl class="kv">${k('/', 'Search, or type a command and press Enter')}${k('1–4', 'Home, Folders, Scroll, Tools')}${k('V', 'Voice: talk a command (hold the mic for hands-free)')}${k('Backspace', 'Up one folder')}${k('Ctrl/Shift + click', 'Select items')}${k('B', 'Blur on or off')}${k('X or Esc Esc', 'Hide the screen now (press Esc twice quickly)')}${k('S', 'Surprise me (something unseen)')}${k('K or Ctrl+K', 'Quick actions: jump to anything')}${k('A', 'Add files, a folder, a link or a catalog')}${k('?', 'This sheet')}</dl>
    <h3 style="margin:14px 0 4px;font-size:.9rem">Viewer</h3><dl class="kv">${k('← →', 'Previous or next')}${k('Space / K', 'Play or pause')}${k('J / L', '−10 / +10 seconds')}${k(', / .', 'Step one frame')}${k('A  B  R', 'Loop start, end, on or off')}${k('[ / ]', 'Slower or faster')}${k('T', 'Theatre')}${k('M', 'Mute')}${k('P', 'Picture-in-picture')}${k('F', 'Favourite')}${k('I', 'Details')}${k('E', 'Adjust view: brightness, rotate, volume boost')}${k('G', 'Move to a folder')}${k('Delete', 'Move to Trash')}${k('Esc', 'Close')}</dl>
    <h3 style="margin:14px 0 4px;font-size:.9rem">Scroll</h3><dl class="kv">${k('↑ ↓  or  J K', 'Previous or next')}${k('Space', 'Play or pause')}${k('M', 'Sound')}${k('F', 'Star (or double-tap)')}${k('Enter', 'Open in the full viewer')}</dl>
    <h3 style="margin:14px 0 4px;font-size:.9rem">Search language</h3><p style="color:var(--muted);font-size:.86rem;line-height:1.6">Words match everywhere. <code>"exact phrase"</code>, <code>-word</code> to exclude.<br><code>tag:</code> <code>cat:</code> <code>src:</code> <code>kind:video</code> <code>code:M10</code> <code>res:1080</code><br><code>has:note</code> <code>has:link</code> <code>has:local</code> <code>has:hash</code><br><code>is:fav</code> <code>is:local</code> <code>is:remote</code> <code>is:seen</code> <code>is:unseen</code> <code>is:video</code> <code>is:image</code> <code>is:noted</code> <code>is:rated</code> <code>is:imported</code> <code>is:added</code> <code>is:dupe</code> <code>is:live</code> <code>is:silent</code> <code>is:drive</code> <code>is:collected</code><br><code>col:keepers</code> <code>audio:near-silent</code> <code>has:desc</code><br><code>in:generated</code> <code>in:trips</code> (folder) <code>is:ai</code> <code>is:audio</code> <code>is:gif</code> <code>is:linked</code> <code>is:server</code> <code>is:inbox</code> <code>is:trash</code> <code>is:archived</code><br><code>a|b</code> matches either, e.g. <code>beach|sunset</code><br>Example: <code>src:drive is:unseen -is:gif</code></p><p style="color:var(--muted);font-size:.86rem">App links: <code>?open=CODE</code> opens one item, <code>?folder=ai/generated</code> opens a folder, <code>?scroll=1</code> starts scrolling, <code>?cmd=play favourites</code> runs a command, <code>?col=Name</code>, <code>?filter=fav</code>, <code>?shuffle=1</code>. Good for home-screen shortcuts and Tasker.</p>`);
  $('#hSay').onclick = commandsSheet;
}

/* ---------- misc features ---------- */
function shuffle() {
  const g = state.tab === 'folders' ? ($('#fgrid')._list || []) : state.tab === 'library' ? state.list : [];
  const pool = (g.length ? g : shown()).filter(hasLocal);
  const unseen = pool.filter(i => !user.seen[i.id]), src = unseen.length ? unseen : pool;
  if (!src.length) return toast('Nothing on this device to open yet. Add some files first.');
  openViewer(src[Math.floor(Math.random() * src.length)].id, pool);
}
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready', { label: 'Reload', fn: () => location.reload() }); }); });
  }).catch(() => { });
}
function bindSheetDrag() {
  const sh = $('#sheet'); let y0 = null, dy = 0;
  sh.addEventListener('pointerdown', e => { if (e.target.closest('.grab') || (sh.scrollTop === 0 && e.pointerType === 'touch' && !e.target.closest('input,textarea,button,a,select'))) { y0 = e.clientY; dy = 0; } });
  sh.addEventListener('pointermove', e => { if (y0 == null) return; dy = e.clientY - y0; if (dy > 0) sh.style.transform = 'translateY(' + dy + 'px)'; });
  const end = () => { if (y0 == null) return; y0 = null; sh.style.transform = ''; if (dy > 90) closeSheet(); dy = 0; };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
}

/* ---------- global bindings ---------- */
function bindApp() {
  $$('#nav button[data-tab]').forEach(b => b.onclick = () => { if (b.dataset.tab === 'folders' && state.tab === 'folders' && state.folder !== 'root') openFolder('root'); else if (b.dataset.tab === 'folders') openFolder(state.folder || 'root', false); else setTab(b.dataset.tab); });
  $('#navScroll').onclick = () => runCommand('scroll', 'typed');
  const q = $('#q'); q.addEventListener('input', debounce(() => { state.q = q.value; onQuery(); }, 110));
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (q.value) { q.value = ''; state.q = ''; onQuery(); } else q.blur(); e.stopPropagation(); }
    else if (e.key === 'Enter' && q.value.trim()) {                  // typed requests and commands: "unseen videos from drive", "open generated", "play favourites"
      const c = interpret(q.value); if (c.t !== 'search' && c.t !== 'none' && !c.bare) { e.preventDefault(); const v = q.value; if (c.t !== 'show') { q.value = ''; state.q = ''; } runCommand(v, 'typed'); q.blur(); }
      else if (c.bare && c.t === 'show' && c.q !== q.value.trim()) { e.preventDefault(); runCommand(q.value, 'typed'); q.blur(); }
    }
  });
  $('#btnSaveSearch').onclick = () => { if (!state.q.trim()) return toast('Type a search first'); const n = prompt('Name this saved search', state.q); if (n && n.trim()) runCommand('save search as ' + n.trim(), 'typed'); };
  $('#dGrid').onclick = () => setDensity('grid'); $('#dList').onclick = () => setDensity('list'); $('#dCompact').onclick = () => setDensity('compact');
  const sort = $('#sort'); sort.value = prefs.sort; sort.onchange = () => { prefs.sort = sort.value; savePrefs(); $('#fsort').value = prefs.sort; renderLibrary(); };
  $('#fsort').value = prefs.sort; $('#btnSelect').onclick = () => SEL.on ? exitSelect() : startSelect(); $('#fSelect').onclick = () => SEL.on ? exitSelect() : startSelect();
  $('#scrim').onclick = closeSheet; $('#btnShuffle').onclick = shuffle; $('#btnHelp').onclick = showHelp;
  $('#btnVerify').onclick = verifyAll; $('#btnDupes').onclick = showDupes; $('#btnExportView').onclick = exportCsv;
  $('#btnBackup').onclick = exportBackup; $('#btnRestore').onclick = () => $('#restorePick').click();
  $('#restorePick').onchange = e => { const f = e.target.files[0]; if (f) restoreBackup(f).finally(() => { e.target.value = ''; }); };
  $('#btnSelfTest').onclick = selfTest; $('#btnCopyDiag').onclick = copyDiagnostics;
  bindNotesCard(); $('#btnRpNow').onclick = async () => { const rp = await makeRestorePoint('Saved by you', { force: true }); toast(rp ? 'Restore point saved' : 'Could not save a restore point here'); renderRestoreCard(); };
  $('#btnKit').onclick = downloadKit; $('#btnKitView').onclick = viewKit;
  $('#btnLinkDir').onclick = () => linkFolder(); $('#btnServerLib').onclick = () => loadServerLibrary(false).then(ok => { if (ok) { renderTools(); } });
  $('#btnMaster').onclick = () => masterSheet(); $('#btnWhere').onclick = whereSheet;
  $('#btnProfile').onclick = () => profileSheet(() => renderTools()); $('#btnOpenShared').onclick = () => openFolder('shared'); $('#btnPack').onclick = exportSharePack; $('#btnImportPack').onclick = () => $('#packPick').click();
  $('#btnConnectShared').onclick = () => SH.folder ? syncSharedFolder().then(n => { toast('Shared folder synced: ' + n + ' items from other people'); renderTools(); }) : connectSharedFolder();
  $('#optOffline').onchange = e => { prefs.offlineOnly = e.target.checked; savePrefs(); if (prefs.offlineOnly) stopVoice(); renderNetCard(); refreshViews(); toast(prefs.offlineOnly ? 'Offline-only: nothing in the app can go online now' : 'Offline-only mode off'); };
  $('#btnSayHelp').onclick = commandsSheet; $('#btnVoiceTry').onclick = () => startVoice(false);
  $('#optVoiceLang').onchange = e => { prefs.voiceLang = e.target.value.trim().slice(0, 20); savePrefs(); renderVoiceCard(); };
  $('#btnInstall').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch (e) { } deferredInstall = null; renderTools(); };
  $('#btnPersist').onclick = async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Storage protected' : 'The browser declined. Installing the app usually helps.'); } catch (e) { toast('Not supported here'); } storageLine(); };
  const bindSw = (id, key, after) => { const el = $(id); el.onchange = () => { prefs[key] = el.type === 'checkbox' ? el.checked : (isNaN(+el.value) ? el.value : +el.value); savePrefs(); applyPrefs(); if (after) after(); }; };
  bindSw('#optBlur', 'blur'); bindSw('#optBlurAmt', 'blurAmt'); bindSw('#optHideBg', 'hideBg'); bindSw('#optLockAfter', 'lockAfter');
  bindSw('#optResume', 'resume'); bindSw('#optAutoNext', 'autoNext'); bindSw('#optWake', 'wake'); bindSw('#optDriveThumbs', 'driveThumbs', () => { renderLibrary(); }); bindSw('#optDrivePlayHere', 'drivePlayHere');
  bindSw('#optVoiceReply', 'voiceReply'); bindSw('#optVoiceWake', 'voiceWake');
  $('#btnCmd').onclick = openPalette;
  $('#optBlurAmt').oninput = e => { document.documentElement.style.setProperty('--blur', e.target.value + 'px'); };
  $$('#themeSeg button').forEach(b => b.onclick = () => { prefs.theme = b.dataset.theme; savePrefs(); applyPrefs(); renderTools(); });
  const sw = $('#swatches'); sw.innerHTML = '';
  ACCENTS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.c = c; b.style.background = c; b.setAttribute('aria-label', 'Accent ' + c); b.onclick = () => { prefs.accent = c; savePrefs(); applyPrefs(); renderTools(); }; sw.appendChild(b); });
  ['#vaultPanel', '#wsPanel'].forEach(sel => $(sel).addEventListener('click', e => { if (e.target.closest('[data-back]')) openFolder('idx'); }));
  bindPrivacy(); bindImport(); bindLive(); bindVoice(); bindGrid(); bindViewer(); bindSheetDrag(); bindFolders(); bindFeed();
  window.addEventListener('online', () => toast('Back online')); window.addEventListener('offline', () => toast('Offline. Everything here still works.'));
  document.addEventListener('keydown', e => {
    if (PAL.open) { palKey(e); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !V.open) { e.preventDefault(); openPalette(); return; }
    if (LOCK.on) { if (/^\d$/.test(e.key)) lockKey(e.key); else if (e.key === 'Backspace') lockKey('del'); else if (e.key === 'Enter') lockKey('ok'); else if (e.key === 'Escape') $('#lockCancel').click(); e.preventDefault(); return; }
    if (e.key === 'Escape') { const n = Date.now(), dbl = n - lastEsc < 350; lastEsc = n; if (dbl) { panic(); return; } }
    const typing = e.target.matches && e.target.matches('input,textarea,select');
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'v' && !$('#vlock')) { e.preventDefault(); startVoice(false); return; }
    if (feedKey(e)) { e.preventDefault(); return; }
    if (viewerKey(e)) { e.preventDefault(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || V.open || FEED.open) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' && SEL.on) { exitSelect(); return; }
    if (e.key === '/') { e.preventDefault(); if (state.tab === 'tools') setTab('library'); $('#q').focus(); }
    else if (k === 'b') { $('#btnPriv').click(); } else if (k === 'x') panic(); else if (k === 's') shuffle(); else if (e.key === '?') showHelp();
    else if (k === 'k') { e.preventDefault(); openPalette(); } else if (k === 'a') addSheet();
    else if (e.key === 'Backspace' && state.tab === 'folders' && state.folder !== 'root') { e.preventDefault(); openFolder(parentOf(state.folder) || 'root'); }
    else if (k === '1') setTab('library'); else if (k === '2') openFolder(state.tab === 'folders' ? 'root' : state.folder || 'root', state.tab === 'folders'); else if (k === '3') runCommand('scroll', 'typed'); else if (k === '4') setTab('tools');
    else if (k === 'escape' && $('#sheet').classList.contains('open')) closeSheet();
  });
}

/* ---------- boot ---------- */
async function init() {
  applyPrefs();
  if (prefs.pinSet) showLock('verify');                       // lock before anything renders
  document.body.classList.toggle('list', prefs.density === 'list'); document.body.classList.toggle('compact', prefs.density === 'compact');
  skeleton();
  idb = await openDB();
  try { const u = await dbGet('kv', 'user'); if (u && typeof u === 'object') { USER_MAPS.forEach(k => { user[k] = (u[k] && typeof u[k] === 'object') ? u[k] : {}; }); user.recent = Array.isArray(u.recent) ? u.recent : []; } } catch (e) { }
  try { (await dbAll('progress')).forEach(([k, v]) => { if (v && isFinite(v.pct)) progress.set(k, v); }); } catch (e) { }
  try { await loadImports(); } catch (e) { }
  try { await loadExtra(); } catch (e) { }
  try { await loadLinks(); } catch (e) { }
  try { await loadShared(); } catch (e) { }
  try { await loadVault(); } catch (e) { }
  reindex(); bindApp(); setDensity(prefs.density);
  const P = new URLSearchParams(location.search), tabs = ['library', 'folders', 'vault', 'workspace', 'tools'];
  const f = P.get('filter'); if (['all', 'fav', 'video', 'image', 'audio', 'local', 'imported'].includes(f)) state.filter = f;
  if (P.get('q')) { state.q = P.get('q').slice(0, 200); $('#q').value = state.q; }
  const fol = P.get('folder') || (!P.get('tab') && !P.get('q') && !f && !P.get('open') && !P.get('play') && prefs.startFolder);
  if (fol && folderValid(fol)) { state.folder = fol; setTab('folders'); } else setTab(tabs.includes(P.get('tab')) ? P.get('tab') : 'library');
  if (P.get('shuffle')) shuffle();
  const cn = P.get('col'); if (cn) { const e = Object.entries(user.collections).find(([, c]) => c.name.toLowerCase() === cn.toLowerCase()); if (e) { state.filter = 'col'; state.col = e[0]; renderLibrary(); } }
  const op = P.get('open') || P.get('play'); if (op) openByCode(op.slice(0, 200));
  if (P.get('scroll')) runCommand('scroll', 'typed');
  if (P.get('cmd')) runCommand(P.get('cmd').slice(0, 200), 'typed');
  registerSW(); scanShared(); setTimeout(() => rpDaily(), 1500);
  if (/^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)) loadServerLibrary(true);
  LINK.roots.forEach(r => { if (LINK.perm[r.id] === 'granted' && Date.now() - (r.scanned || 0) > 6 * 3600 * 1000) rescanQuiet(r.id); });
  window.__mh = { ready: true, version: APP_VERSION, count: everything().length };
}
function findByCode(q) {                                   // code, id or alias (e.g. a gallery number listed in aliases), any case
  const k = String(q || '').trim().toLowerCase(); if (!k) return null;
  return byId.get(q) || everything().find(i => i.code.toLowerCase() === k || String(i.id).toLowerCase() === k || (i.aliases || []).some(a => String(a).toLowerCase() === k)) || sharedAll().find(i => i.code.toLowerCase() === k) || null;
}
function openByCode(q) {
  const it = findByCode(q); if (it) return openViewer(it.id, [it]);
  const hits = shown().filter(i => matchesQuery(i, parseQuery(q)));
  if (hits.length === 1) return openViewer(hits[0].id, hits);
  setTab('library'); setQuery(q); toast(hits.length ? 'No item has the code ' + q + '; here are ' + hits.length + ' matches' : 'Nothing called ' + q + ' here');
}
async function rescanQuiet(id) { const r = linkRootOf(id), h = LINK.handles.get(id); if (!r || !h) return; try { const files = await scanDir(h); r.n = files.length; r.scanned = Date.now(); await dbPut('kv', 'linkidx:' + id, files); await saveLinks(); linkedItems = linkedItems.filter(x => x.linkRoot !== id).concat(makeLinkedItems(r, files)); reindex(); refreshViews(); } catch (e) { } }
init().catch(e => { console.error(e); try { toast('Something went wrong while starting: ' + e.message); } catch (_) { } });
