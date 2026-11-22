/* ===================== SHARED SPACE: the one place meant for other people · everything else stays walled off ===================== */
/* Your library is private: it is never uploaded, indexed or searchable from outside this device. Shared is separate:
   nothing gets in unless you share it, and every person gets exactly one folder, named after them.
   Ways it travels, all started by you: a share pack (.zip you send any way you like), a shared folder you connect
   (synced by Drive, Syncthing, a USB stick...), or phone folders served by the companion server. Media Hub uploads nothing. */
const SHARED_DIR = 'Media Hub Shared';
let PROFILE = { uid: '', name: '', dir: '' };
let sharedHeld = [];                                   // shared copies held in this app (yours and received), bytes in IndexedDB files 'sh:<id>'
const SH = { folder: null, perm: '', views: {}, names: {} };   // views: items found in linked/phone/shared folders under "Media Hub Shared/<person>/"
let _shAll = null, _shV = -1;
const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const sharedOwnerOfPath = (p, rootName) => {
  if (rootName === SHARED_DIR) { const seg = String(p || '').split('/'); return seg.length > 1 ? seg[0] : ''; }
  const m = /(?:^|\/)Media Hub Shared\/([^/]+)\//.exec(p || ''); return m ? m[1] : '';
};
const saveProfile = () => dbPut('kv', 'profile', Object.assign({}, PROFILE));
const saveHeld = () => dbPut('kv', 'sharedIndex', sharedHeld.map(stripRuntime));
function heldItem(rec) { return normItem(Object.assign({}, rec, { held: true, shared: true, tags: (rec.tags || []).slice(0, 30), source: 'Shared by ' + ((rec.owner || {}).name || 'someone') })); }
function markShared(it, owner) { it.shared = true; it.sharedFrom = owner; it.source = 'Shared by ' + owner; return it; }
function splitShared(list, key) {                      // linked and phone folders: anything under "Media Hub Shared/<person>/" belongs to Shared, not to your library
  const priv = [], sh = []; list.forEach(it => (it.sharedFrom ? sh : priv).push(it));
  if (sh.length) SH.views[key] = sh; else delete SH.views[key];
  return priv;
}
function ownerKeyOf(it) {
  if (it.held) return it.owner && it.owner.uid === PROFILE.uid ? 'me' : 'u:' + ((it.owner || {}).uid || 'x');
  const n = String(it.sharedFrom || '').toLowerCase();
  if (PROFILE.dir && n === PROFILE.dir.toLowerCase()) return 'me';
  const uid = SH.names[n]; return uid ? (uid === PROFILE.uid ? 'me' : 'u:' + uid) : 'n:' + n;
}
function ownerNameOf(it) { return it.held ? (it.owner || {}).name || 'Someone' : it.sharedFrom || 'Someone'; }
function sharedAll() {
  if (_shAll && _shV === LIBV) return _shAll;
  const out = [], seen = new Set();
  const add = it => { if (user.gone[it.id]) return; const k = ownerKeyOf(it) + '|' + (it.sha256 || it.file || it.path || it.link || it.id); if (seen.has(k)) return; seen.add(k); out.push(it); };
  sharedHeld.forEach(add); Object.keys(SH.views).sort().forEach(k => SH.views[k].forEach(add));
  _shAll = out; _shV = LIBV; return out;
}
function sharedOwners() {
  const m = new Map();
  sharedAll().forEach(it => { const k = ownerKeyOf(it); if (!m.has(k)) m.set(k, { key: k, name: k === 'me' ? (PROFILE.name || 'You') : ownerNameOf(it), n: 0 }); m.get(k).n++; });
  if (PROFILE.name && !m.has('me')) m.set('me', { key: 'me', name: PROFILE.name, n: 0 });
  return Array.from(m.values()).sort((a, b) => (a.key === 'me' ? -1 : b.key === 'me' ? 1 : a.name.localeCompare(b.name)));
}
const sharedItemsOf = key => sharedAll().filter(it => ownerKeyOf(it) === key);
const isMine = it => ownerKeyOf(it) === 'me';

/* ---------- your name ---------- */
function profileSheet(then) {
  openSheet(`<h2>Your name in Shared</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Your library stays private on this device. <b>Shared</b> is the only place meant for other people: everyone who shares gets one folder, named after them. This is the name your folder will have.</p>
    <div style="display:flex;gap:8px"><input class="input" id="pfName" maxlength="40" placeholder="e.g. GJee" value="${esc(PROFILE.name)}" autocapitalize="words"><button class="btn primary" id="pfGo">Save</button></div>
    <p style="color:var(--muted);font-size:.78rem;margin-top:8px">You can change it later; your folder stays the same one${PROFILE.dir ? ' (“' + esc(PROFILE.dir) + '”)' : ''}.</p>`);
  const go = async () => {
    const v = $('#pfName').value.trim().replace(/[\u0000-\u001f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').slice(0, 40); if (!v) return $('#pfName').focus();
    PROFILE.name = v; if (!PROFILE.uid) PROFILE.uid = randHex(8);
    sharedHeld.forEach(it => { if (it.owner && it.owner.uid === PROFILE.uid) { it.owner.name = v; it.source = 'Shared by ' + v; } });
    await saveProfile(); await saveHeld(); reindex(); closeSheet(); refreshViews(); toast('Your Shared folder is called “' + (PROFILE.dir || v) + '”');
    if (then) then();
  };
  $('#pfGo').onclick = go; $('#pfName').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => { const i = $('#pfName'); if (i) i.focus(); }, 250);
}

/* ---------- share · unshare · keep a copy ---------- */
function shareFileName(rec, used) {
  const ext = extOf(rec.name || '') || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' }[rec.mime] || 'bin');
  let f = safeName(rec.code + ' - ' + rec.title) + '.' + ext, k = 2; while (used && used.has(f.toLowerCase())) f = safeName(rec.code + ' - ' + rec.title) + ' (' + k++ + ').' + ext; if (used) used.add(f.toLowerCase()); return f;
}
async function shareItems(ids) {
  const items = ids.map(id => byId.get(id)).filter(it => it && !it.shared);
  if (!items.length) return toast('Choose items from your own library to share');
  if (!PROFILE.name) return profileSheet(() => shareItems(ids));
  const rep = { added: [], already: [], failed: [] }, used = new Set(sharedHeld.map(x => (x.file || '').toLowerCase()));
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; busy('Sharing ' + (i + 1) + ' of ' + items.length + '…');
    try {
      let blob = null, sha = it.sha256 || '';
      if (hasLocal(it)) {
        const buf = await bytesFor(it); if (!buf) throw new Error('not readable here');
        const h = buf.byteLength <= HASH_MAX ? await sha256Hex(buf) : ''; if (sha && h && h !== sha) throw new Error('bytes differ from the catalog hash');
        sha = sha || h; blob = new Blob([buf], { type: it.mime || '' });
      } else if (!it.link) throw new Error('nothing to share: no file or link');
      const id = 'sh-' + PROFILE.uid + '-' + (sha ? sha.slice(0, 16) : hashStr(it.link || it.id).toString(36));
      if (sharedHeld.some(x => x.id === id)) { rep.already.push(it.code); continue; }
      const rec = { id, code: it.code, title: it.title, kind: it.kind, mime: it.mime || '', bytes: blob ? blob.size : 0, sha256: sha, res: it.res || '', dur: it.dur || 0, desc: it.desc || '', tags: tagsOf(it), link: it.link || '', driveId: it.driveId || '',
        category: it.category || '', owner: { uid: PROFILE.uid, name: PROFILE.name }, sharedAt: Date.now(), added: Date.now(), name: it.name || it.local || '', fromId: it.id };
      rec.file = blob ? shareFileName(rec, used) : '';
      if (blob && !(await dbPut('files', 'sh:' + id, blob))) throw new Error('storage is full or blocked');
      sharedHeld.push(heldItem(rec)); rep.added.push(rec);
    } catch (e) { rep.failed.push(it.code + ' (' + e.message + ')'); }
  }
  await saveHeld(); reindex(); $('#toast').classList.remove('on');
  let wrote = 0; if (SH.folder && SH.perm === 'granted' && rep.added.length) { try { wrote = await writeMineToFolder(); } catch (e) { rep.failed.push('shared folder (' + e.message + ')'); } }
  if (SEL.on) exitSelect(); refreshViews();
  openSheet('<h2>' + (rep.added.length ? 'Shared ' + rep.added.length + ' item' + (rep.added.length === 1 ? '' : 's') : 'Nothing new to share') + '</h2>' + receiptRows([
    ['Source used', 'your private library (' + items.length + ' chosen)'],
    ['Original untouched?', '<span class="ok">Yes.</span> Your original stays where it is, still private. A separate copy went to Shared › ' + esc(PROFILE.dir || PROFILE.name) + '.'],
    ['Anything processed?', 'No. Byte-for-byte copies, checked against their SHA-256.'],
    ['Archived?', 'In this app’s Shared space' + (wrote ? ', and written to your connected shared folder' : '') + '. Nobody sees it until you send a share pack or it syncs through a folder you chose.'],
    ['Reusable later?', 'Yes. Remove it from Shared any time; your original is not affected.']].concat(rep.already.length ? [['Already shared', rep.already.map(esc).join(', ')]] : []).concat(rep.failed.length ? [['Not shared', '<span class="warn">' + rep.failed.map(esc).join(', ') + '</span>']] : [])) +
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="shOpen">Open my Shared folder</button><button class="btn" id="shPack">Make a share pack</button></div>');
  $('#shOpen').onclick = () => { closeSheet(); if (V.open) closeViewer(); if (FEED.open) closeFeed(); openFolder('sh:me'); };
  $('#shPack').onclick = () => { closeSheet(); exportSharePack(); };
}
async function removeShared(ids) {
  const items = ids.map(id => byId.get(id)).filter(it => it && it.shared); if (!items.length) return;
  const mineInFolder = items.filter(it => it.shf && isMine(it));
  if (!confirm('Remove ' + (items.length === 1 ? 'this item' : items.length + ' items') + ' from Shared?\n\nOnly the shared copy goes. Your private library is not touched.' + (mineInFolder.length ? '\n' + mineInFolder.length + ' of your copies in the connected shared folder will be deleted from it.' : ''))) return;
  for (const it of items) {
    if (it.held) { await dbDel('files', 'sh:' + it.id); sharedHeld = sharedHeld.filter(x => x.id !== it.id); const u = urlCache.get(it.id); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); urlCache.delete(it.id); if (isMine(it) && it.file) await removeMineFromFolder(it.file); }
    else if (it.shf && isMine(it)) await removeMineFromFolder(it.path.split('/').pop());
    else user.gone[it.id] = Date.now();                 // someone else's file in a folder: hidden here, never deleted
  }
  await saveHeld(); if (SH.folder && SH.perm === 'granted') { try { await writeMineToFolder(); } catch (e) { } }
  changed(); reindex(); if (V.open) closeViewer(); if (SEL.on) exitSelect(); refreshViews(); toast('Removed from Shared');
}
async function saveSharedToLibrary(ids) {                // a received item becomes yours only when you say so; it lands in your Inbox
  const items = ids.map(id => byId.get(id)).filter(it => it && it.shared && hasLocal(it)); if (!items.length) return toast('Nothing to save: these are links only');
  const files = [];
  for (const it of items) { const buf = await bytesFor(it); if (buf) files.push(new File([buf], (it.file || it.name || it.code).split('/').pop() || it.code, { type: it.mime || '' })); }
  await importFiles(files, { home: 'src/inbox', inbox: true, from: ownerNameOf(items[0]) });
}

/* ---------- share packs: a zip you send any way you like ---------- */
async function exportSharePack() {
  if (!PROFILE.name) return profileSheet(exportSharePack);
  const mine = sharedHeld.filter(x => x.owner && x.owner.uid === PROFILE.uid);
  if (!mine.length) return toast('Share something first: open an item › Share, or select items › Share');
  const bytes = mine.reduce((s, x) => s + (x.bytes || 0), 0); if (bytes > 1.5 * 1024 * 1024 * 1024) return toast('That is ' + fmtBytes(bytes) + ', too big for one pack. Remove a few items from Shared first.');
  const enc = new TextEncoder(), dir = SHARED_DIR + '/' + safeName(PROFILE.dir || PROFILE.name) + '/', out = [{ name: SHARED_DIR + '/', data: new Uint8Array(0), dir: true }, { name: dir, data: new Uint8Array(0), dir: true }], list = [];
  for (const it of mine) {
    const e = { code: it.code, title: it.title, kind: it.kind, mime: it.mime, bytes: it.bytes, sha256: it.sha256, res: it.res, desc: it.desc, tags: it.tags, link: it.link, sharedAt: it.sharedAt, file: '' };
    if (it.bytes) { const b = await dbGet('files', 'sh:' + it.id); if (b instanceof Blob) { e.file = it.file || shareFileName(it); out.push({ name: dir + e.file, data: new Uint8Array(await b.arrayBuffer()) }); } }
    list.push(e);
  }
  out.push({ name: dir + 'shared.json', data: enc.encode(JSON.stringify({ app: 'media-hub-shared', version: 1, owner: { uid: PROFILE.uid, name: PROFILE.name, dir: PROFILE.dir || PROFILE.name }, exported: new Date().toISOString(), items: list }, null, 1)) });
  download('Media-Hub-Shared-' + safeName(PROFILE.name).replace(/ /g, '-') + '-' + today() + '.zip', makeZip(out));
  toast('Share pack saved: ' + list.length + ' items. Send it however you like; Media Hub uploads nothing.');
}
async function readZip(file) {                           // STORE and DEFLATE entries; enough for packs made by Media Hub or by ordinary zip tools
  const size = file.size, tail = new DataView(await file.slice(Math.max(0, size - 66000)).arrayBuffer()); let eo = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error('not a zip file');
  const n = tail.getUint16(eo + 10, true), cdSize = tail.getUint32(eo + 12, true), cdOff = tail.getUint32(eo + 16, true);
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), out = []; let p = 0;
  for (let k = 0; k < n && p + 46 <= cd.byteLength; k++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl)); p += 46 + nl + xl + cl;
    out.push({ name, method, csize, usize, lo });
  }
  const blobOf = async e => {
    const lh = new DataView(await file.slice(e.lo, e.lo + 30).arrayBuffer()); if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('damaged zip');
    const start = e.lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = file.slice(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8 && typeof DecompressionStream === 'function') return await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    throw new Error('unsupported compression in ' + e.name);
  };
  return { entries: out, blobOf };
}
async function importSharePack(file) {
  try {
    if (!PROFILE.uid) { PROFILE.uid = randHex(8); await saveProfile(); }
    const z = await readZip(file), groups = {};
    z.entries.forEach(e => { const m = /(?:^|\/)Media Hub Shared\/([^/]+)\/(.+)$/.exec(e.name); if (m && !e.name.endsWith('/')) (groups[m[1]] = groups[m[1]] || []).push(Object.assign({ rel: m[2] }, e)); });
    if (!Object.keys(groups).length) throw new Error('this zip is not a Media Hub share pack (no “' + SHARED_DIR + '/<name>/” folder inside)');
    const rep = { added: 0, same: 0, bad: [], people: [] };
    for (const dir of Object.keys(groups)) {
      const list = groups[dir], mf = list.find(e => e.rel === 'shared.json'); let man = null;
      if (mf) { try { man = JSON.parse(await (await z.blobOf(mf)).text()); } catch (e) { man = null; } }
      const o = man && man.owner && typeof man.owner === 'object' ? man.owner : {};
      const owner = { uid: /^[a-z0-9-]{4,40}$/i.test(String(o.uid || '')) ? String(o.uid) : 'n-' + hashStr(dir.toLowerCase()).toString(16), name: String(o.name || dir).replace(/[\u0000-\u001f]/g, '').slice(0, 60) || dir };
      SH.names[dir.toLowerCase()] = owner.uid; rep.people.push(owner.name);
      const meta = new Map((man && Array.isArray(man.items) ? man.items : []).filter(x => x && typeof x.file === 'string' && x.file).map(x => [x.file, x]));
      for (const e of list) {
        if (e.rel === 'shared.json' || e.rel.split('/').some(s => s.startsWith('.') || s === '..')) continue;
        const kind = kindOfName(e.rel); if (!kind) continue;
        const m0 = meta.get(e.rel) || {}, blob0 = await z.blobOf(e), buf = await blob0.arrayBuffer(), sha = buf.byteLength <= HASH_MAX ? await sha256Hex(buf) : '';
        if (m0.sha256 && sha && m0.sha256 !== sha) { rep.bad.push(e.rel + ' (does not match its fingerprint, left out)'); continue; }
        const id = 'sh-' + owner.uid + '-' + (sha ? sha.slice(0, 16) : hashStr(e.rel).toString(36));
        if (sharedHeld.some(x => x.id === id)) { rep.same++; continue; }
        const mime = String(m0.mime || EXT_MIME[extOf(e.rel)] || ''), base = e.rel.split('/').pop();
        const rec = { id, code: String(m0.code || base.replace(/\.[^.]+$/, '')).slice(0, 80), title: String(m0.title || base.replace(/\.[^.]+$/, '').replace(/_+/g, ' ')).slice(0, 300), kind: /^(image|video|audio)$/.test(m0.kind) ? m0.kind : kind, mime, bytes: buf.byteLength, sha256: sha,
          res: String(m0.res || '').slice(0, 40), desc: String(m0.desc || '').slice(0, 2000), tags: Array.isArray(m0.tags) ? m0.tags.map(String).slice(0, 30) : [], link: /^https:\/\//.test(m0.link || '') ? m0.link : '', category: owner.name,
          owner, sharedAt: +m0.sharedAt || Date.now(), added: Date.now(), file: base, name: base, received: owner.uid !== PROFILE.uid };
        if (!(await dbPut('files', 'sh:' + id, new Blob([buf], { type: mime })))) { rep.bad.push(e.rel + ' (storage full)'); continue; }
        sharedHeld.push(heldItem(rec)); rep.added++;
      }
      if (man && Array.isArray(man.items)) for (const x of man.items) {          // link-only entries
        if (!x || x.file || !/^https:\/\//.test(x.link || '')) continue;
        const id = 'sh-' + owner.uid + '-' + hashStr(x.link).toString(36); if (sharedHeld.some(y => y.id === id)) { rep.same++; continue; }
        sharedHeld.push(heldItem({ id, code: String(x.code || 'link').slice(0, 80), title: String(x.title || x.link).slice(0, 300), kind: x.kind === 'image' ? 'image' : 'video', link: x.link, desc: String(x.desc || '').slice(0, 2000), tags: Array.isArray(x.tags) ? x.tags.map(String).slice(0, 30) : [], category: owner.name, owner, sharedAt: +x.sharedAt || Date.now(), added: Date.now(), bytes: 0, received: owner.uid !== PROFILE.uid }));
        rep.added++;
      }
    }
    await saveHeld(); reindex(); refreshViews();
    openSheet('<h2>' + (rep.added ? 'Added ' + rep.added + ' shared item' + (rep.added === 1 ? '' : 's') : 'Nothing new in that pack') + '</h2>' + receiptRows([
      ['Source used', esc(file.name) + ' (from ' + rep.people.map(esc).join(', ') + ')'],
      ['Original untouched?', '<span class="ok">Yes.</span> The pack was only read.'],
      ['Anything processed?', 'No. Each file was checked against the fingerprint in the pack.'],
      ['Archived?', 'In Shared › ' + rep.people.map(esc).join(', ') + ', kept apart from your private library.'],
      ['Reusable later?', 'Yes. Use “Save to my library” on anything you want to keep as your own.']].concat(rep.same ? [['Already here', String(rep.same)]] : []).concat(rep.bad.length ? [['Left out', '<span class="warn">' + rep.bad.slice(0, 6).map(esc).join(', ') + '</span>']] : [])) +
      '<div style="margin-top:12px"><button class="btn primary" id="pkOpen">Open Shared</button></div>');
    $('#pkOpen').onclick = () => { closeSheet(); openFolder('shared'); };
  } catch (e) { toast('Could not import: ' + e.message); }
}

/* ---------- a shared folder you connect (synced by whatever you choose) ---------- */
async function connectSharedFolder() {
  if (!canLink()) return toast('This browser can’t write to folders. Use share packs, or share a synced folder with the companion server (--library).');
  if (!PROFILE.name) return profileSheet(connectSharedFolder);
  let h; try { h = await window.showDirectoryPicker({ id: 'mh-shared', mode: 'readwrite' }); } catch (e) { if (e && e.name !== 'AbortError') toast('Could not open that folder: ' + e.message); return; }
  SH.folder = h.name === SHARED_DIR ? h : await h.getDirectoryHandle(SHARED_DIR, { create: true }); SH.perm = 'granted';
  await dbPut('kv', 'sharedDirH', SH.folder);
  const n = await syncSharedFolder(); openFolder('shared'); toast('Shared folder connected: ' + n + ' items from ' + Math.max(0, sharedOwners().length) + ' people');
}
async function myDirHandle() {
  if (!PROFILE.dir) {                                  // one folder per person, kept for good even if you change your name later
    let name = safeName(PROFILE.name), k = 2;
    while (true) { let other = false; try { const d = await SH.folder.getDirectoryHandle(name); const j = JSON.parse(await (await (await d.getFileHandle('shared.json')).getFile()).text()); other = j && j.owner && j.owner.uid && j.owner.uid !== PROFILE.uid; } catch (e) { } if (!other) break; name = safeName(PROFILE.name) + ' (' + k++ + ')'; }
    PROFILE.dir = name; await saveProfile();
  }
  return SH.folder.getDirectoryHandle(PROFILE.dir, { create: true });
}
async function writeMineToFolder() {
  const d = await myDirHandle(), mine = sharedHeld.filter(x => x.owner && x.owner.uid === PROFILE.uid); let wrote = 0;
  for (const it of mine) {
    if (!it.bytes || !it.file) continue;
    let ex = null; try { ex = await (await d.getFileHandle(it.file)).getFile(); } catch (e) { }
    if (ex && ex.size === it.bytes) continue;
    const b = await dbGet('files', 'sh:' + it.id); if (!(b instanceof Blob)) continue;
    const w = await (await d.getFileHandle(it.file, { create: true })).createWritable(); await w.write(b); await w.close(); wrote++;
  }
  const man = { app: 'media-hub-shared', version: 1, owner: { uid: PROFILE.uid, name: PROFILE.name, dir: PROFILE.dir }, updated: new Date().toISOString(),
    items: mine.map(it => ({ code: it.code, title: it.title, kind: it.kind, mime: it.mime, bytes: it.bytes, sha256: it.sha256, res: it.res, desc: it.desc, tags: it.tags, link: it.link, sharedAt: it.sharedAt, file: it.file || '' })) };
  const w = await (await d.getFileHandle('shared.json', { create: true })).createWritable(); await w.write(new Blob([JSON.stringify(man, null, 1)], { type: 'application/json' })); await w.close();
  return wrote;
}
async function removeMineFromFolder(name) { if (!SH.folder || SH.perm !== 'granted' || !name) return; try { const d = await myDirHandle(); await d.removeEntry(name); } catch (e) { } }
async function syncSharedFolder() {
  if (!SH.folder) return 0;
  if (SH.perm !== 'granted') { try { SH.perm = await SH.folder.requestPermission({ mode: 'readwrite' }); } catch (e) { SH.perm = 'error'; } if (SH.perm !== 'granted') { toast('Access to the shared folder was not allowed'); return 0; } }
  busy('Syncing the shared folder…');
  try { if (sharedHeld.some(x => x.owner && x.owner.uid === PROFILE.uid)) await writeMineToFolder(); } catch (e) { }
  const items = [], myFiles = new Set(sharedHeld.filter(x => x.owner && x.owner.uid === PROFILE.uid).map(x => (x.file || '').toLowerCase()));
  for await (const [dir, h] of SH.folder.entries()) {
    if (h.kind !== 'directory' || dir.startsWith('.')) continue;
    try { const j = JSON.parse(await (await (await h.getFileHandle('shared.json')).getFile()).text()); if (j && j.owner && /^[a-z0-9-]{4,40}$/i.test(String(j.owner.uid || ''))) SH.names[dir.toLowerCase()] = String(j.owner.uid); } catch (e) { }
    const mine = (PROFILE.dir && dir.toLowerCase() === PROFILE.dir.toLowerCase()) || SH.names[dir.toLowerCase()] === PROFILE.uid;
    const files = await scanDir(h);
    files.forEach(f => {
      if (mine && myFiles.has(f.p.toLowerCase())) return;          // you already hold this copy
      const name = f.p.split('/').pop(), id = 'shf-' + hashStr(dir + '/' + f.p).toString(36);
      items.push(markShared(normItem({ id, code: name.replace(/\.[^.]+$/, '').slice(0, 80), title: name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '), kind: f.k, mime: f.m, bytes: f.s, added: f.t, name, path: dir + '/' + f.p, dir: f.p.includes('/') ? f.p.slice(0, f.p.lastIndexOf('/')) : '', category: dir, tags: [], shf: true }), dir));
    });
  }
  SH.views.shf = items; reindex(); $('#toast').classList.remove('on'); refreshViews(); return items.length;
}
async function sharedFolderFile(it) {
  if (!SH.folder) return null;
  if (SH.perm !== 'granted') { try { SH.perm = await SH.folder.requestPermission({ mode: 'readwrite' }); } catch (e) { return null; } if (SH.perm !== 'granted') return null; }
  try { const parts = it.path.split('/'), name = parts.pop(); let d = SH.folder; for (const p of parts) d = await d.getDirectoryHandle(p); return await (await d.getFileHandle(name)).getFile(); } catch (e) { return null; }
}
async function loadShared() {
  const p = await dbGet('kv', 'profile'); if (p && typeof p === 'object') PROFILE = { uid: String(p.uid || ''), name: String(p.name || ''), dir: String(p.dir || '') };
  const rows = await dbGet('kv', 'sharedIndex'); sharedHeld = Array.isArray(rows) ? rows.filter(r => r && typeof r.id === 'string' && r.owner).map(heldItem) : [];
  sharedHeld.forEach(it => { if (it.owner && it.owner.uid && it.owner.name) SH.names[String(it.owner.name).toLowerCase()] = it.owner.uid; });
  const h = await dbGet('kv', 'sharedDirH');
  if (h && typeof h.queryPermission === 'function') { SH.folder = h; try { SH.perm = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { SH.perm = 'error'; } if (SH.perm === 'granted') syncSharedFolder().catch(() => { }); }
}
async function disconnectSharedFolder() {
  if (!SH.folder) return;
  if (!confirm('Disconnect the shared folder? Nothing in it is deleted; it just stops showing here.')) return;
  SH.folder = null; SH.perm = ''; delete SH.views.shf; await dbDel('kv', 'sharedDirH'); reindex(); refreshViews(); toast('Shared folder disconnected');
}
