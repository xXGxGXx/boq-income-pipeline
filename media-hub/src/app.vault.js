/* ---------- encrypted notes: AES-GCM 256, one passphrase, the key lives only in memory ----------
   Vault (kv 'noteVault'): { v, salt, iter, check } where check is a sealed known string, so a wrong passphrase is caught.
   Each note (user.enote[id]): { s: salt, it: iterations, iv, d } sealed with the item id as additional data, so a note can't be
   moved onto another item. The passphrase itself is never stored; the derived key is non-extractable and dropped on lock. */
const NV = { vault: null, keys: new Map(), plain: new Map(), hiddenAt: 0, fails: 0 };
const NV_ITER = 600000, NV_CHECK = 'media-hub-notes-v1';
const b64e = u8 => { const a = new Uint8Array(u8); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const nvTE = new TextEncoder();
async function nvDerive(pass, saltHex, iter) {
  const base = await crypto.subtle.importKey('raw', nvTE.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function nvSeal(key, text, saltHex, iter, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const d = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: nvTE.encode(aad) }, key, nvTE.encode(text));
  return { s: saltHex, it: iter, iv: b64e(iv), d: b64e(d) };
}
async function nvOpen(key, rec, aad) { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(rec.iv), additionalData: nvTE.encode(aad) }, key, b64d(rec.d))); }
const validEnc = r => !!(r && typeof r === 'object' && /^[0-9a-f]{32}$/.test(r.s) && Number.isInteger(r.it) && r.it >= 100000 && r.it <= 5000000 && typeof r.iv === 'string' && r.iv.length === 16 && typeof r.d === 'string' && r.d.length >= 24 && r.d.length <= 12000 && /^[A-Za-z0-9+/=]+$/.test(r.iv + r.d));
const validVault = v => !!(v && typeof v === 'object' && /^[0-9a-f]{32}$/.test(v.salt) && Number.isInteger(v.iter) && v.iter >= 100000 && v.iter <= 5000000 && validEnc(v.check));
const isEnc = id => !!user.enote[id];
const hasNote = id => !!user.note[id] || !!user.enote[id];
const nvUnlocked = () => !!(NV.vault && NV.keys.has(NV.vault.salt));
const encCount = () => Object.keys(user.enote).length;
async function loadVault() { const v = await dbGet('kv', 'noteVault'); NV.vault = validVault(v) ? v : null; }
async function persistUserNow() { LIBV++; return dbPut('kv', 'user', user); }   // straight away: a readable copy must not linger behind a debounce

function nvLock(quiet) {
  const was = NV.keys.size > 0; NV.keys.clear(); NV.plain.clear();
  const nb = $('#noteBox'); if (nb && nb.dataset.enc === '1') { nb.value = ''; closeSheet(); }
  if (was && !quiet) toast('Encrypted notes locked'); if ($('#tab-tools') && state.tab === 'tools') renderNotesCard();
}
document.addEventListener('visibilitychange', () => {                         // away for 5 minutes (or straight away with "cover when hidden") locks them
  if (document.hidden) { NV.hiddenAt = Date.now(); if (prefs.hideBg && prefs.lockAfter === 0) nvLock(true); }
  else if (NV.keys.size && NV.hiddenAt && Date.now() - NV.hiddenAt >= 300000) nvLock(true);
});

async function nvCreate(pass) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))), key = await nvDerive(pass, salt, NV_ITER);
  const vault = { v: 1, salt, iter: NV_ITER, check: await nvSeal(key, NV_CHECK, salt, NV_ITER, 'check'), created: Date.now() };
  const ok = await dbPut('kv', 'noteVault', vault); NV.vault = vault; NV.keys.set(salt, key); return ok;
}
async function nvUnlock(pass) {
  const v = NV.vault; if (!v) return false;
  const key = await nvDerive(pass, v.salt, v.iter);
  try { if (await nvOpen(key, v.check, 'check') !== NV_CHECK) return false; } catch (e) { return false; }
  NV.keys.set(v.salt, key);
  const other = new Map(); Object.values(user.enote).forEach(r => { if (r.s !== v.salt && !other.has(r.s)) other.set(r.s, r.it); });   // notes from a backup made on another device
  for (const [s, it] of other) { try { NV.keys.set(s, await nvDerive(pass, s, it)); } catch (e) { } }
  let moved = 0;                                                                                            // same passphrase: re-seal them under this device's vault
  for (const id of Object.keys(user.enote)) { const r = user.enote[id]; if (r.s === v.salt) continue; const k = NV.keys.get(r.s); if (!k) continue; try { const t = await nvOpen(k, r, id); user.enote[id] = await nvSeal(key, t, v.salt, v.iter, id); moved++; } catch (e) { } }
  if (moved) await persistUserNow();
  return true;
}
async function noteText(id) {          // '' none · string · null locked · undefined: sealed with a different passphrase
  if (user.note[id]) return user.note[id];
  const r = user.enote[id]; if (!r) return '';
  if (NV.plain.has(id)) return NV.plain.get(id);
  const k = NV.keys.get(r.s); if (!k) return NV.vault && NV.keys.has(NV.vault.salt) ? undefined : null;
  try { const t = await nvOpen(k, r, id); NV.plain.set(id, t); return t; } catch (e) { return undefined; }
}
async function setNote(id, text, encrypt) {
  text = String(text || '').trim().slice(0, 4000);
  const wasPlain = !!user.note[id];
  if (!text) { delete user.note[id]; delete user.enote[id]; NV.plain.delete(id); }
  else if (encrypt) { if (!nvUnlocked()) throw new Error('locked'); const v = NV.vault; user.enote[id] = await nvSeal(NV.keys.get(v.salt), text, v.salt, v.iter, id); delete user.note[id]; NV.plain.set(id, text); }
  else { user.note[id] = text; delete user.enote[id]; NV.plain.delete(id); }
  invalidateHay(id); await persistUserNow();
  if (encrypt && wasPlain) await rpScrubPlain([id]);
}
/* restore points must not keep a readable copy of a note you encrypted: swap it for the sealed version */
async function rpScrubPlain(ids) {
  const l = await rpList(); let n = 0;
  l.forEach(rp => { const u = rp.data && rp.data.user; if (!u || !u.note) return; ids.forEach(id => { if (u.note[id] != null) { delete u.note[id]; if (user.enote[id]) { u.enote = u.enote || {}; u.enote[id] = user.enote[id]; } n++; rp.sig = 'scrubbed-' + randHex(4); } }); });
  if (n) await dbPut('kv', 'restorePoints', l); return n;
}
async function rpReseal(newKey, salt, iter) {             // after a passphrase change, restore points use the new one too
  const l = await rpList(); let n = 0;
  for (const rp of l) { const e = rp.data && rp.data.user && rp.data.user.enote; if (!e) continue; for (const id of Object.keys(e)) { const r = e[id], k = validEnc(r) && NV.keys.get(r.s); if (!k || r.s === salt) continue; try { e[id] = await nvSeal(newKey, await nvOpen(k, r, id), salt, iter, id); n++; rp.sig = 'resealed-' + randHex(4); } catch (er) { } } }
  if (n) await dbPut('kv', 'restorePoints', l); return n;
}
const wantsEnc = id => isEnc(id) || (!!prefs.encNotes && !!NV.vault);

/* passphrase sheet: mode create | unlock | change | foreign */
function nvPassSheet(mode, then, opt = {}) {
  const create = mode === 'create', change = mode === 'change';
  openSheet(`<h2>${create ? 'Encrypt your notes' : change ? 'Change the notes passphrase' : 'Unlock encrypted notes'}</h2>
    <p class="hint">${create ? 'Choose a passphrase. Notes you encrypt are sealed with AES-256 on this device; the passphrase is never stored. <b>There is no recovery:</b> if you forget it, nobody can read those notes, including you.' :
      change ? 'Every encrypted note is re-sealed with the new passphrase.' : mode === 'foreign' ? 'This note was sealed with a different passphrase (for example on another device). Enter that one.' : 'Your notes stay locked again when you hide the screen, use panic, the PIN lock appears, or the app is away for 5 minutes.'}</p>
    <form id="nvForm" autocomplete="off" novalidate style="display:grid;gap:10px;margin-top:10px">
      ${change && !nvUnlocked() ? '<input class="input" type="password" id="nvOld" placeholder="Current passphrase" autocomplete="current-password">' : ''}
      <input class="input" type="password" id="nvPass" placeholder="${change ? 'New passphrase' : 'Passphrase'}" autocomplete="${create || change ? 'new-password' : 'current-password'}" minlength="${create || change ? 8 : 1}" required>
      ${create || change ? '<input class="input" type="password" id="nvPass2" placeholder="Repeat it" autocomplete="new-password" required>' : ''}
      ${create ? `<label class="switch"><span>Encrypt new notes too<small>Otherwise only the notes you choose</small></span><input type="checkbox" id="nvAuto" checked></label>` : ''}
      <div class="row"><button class="btn primary" type="submit" id="nvGo">${create ? 'Create and encrypt' : change ? 'Change passphrase' : 'Unlock'}</button><button class="btn" type="button" id="nvCancel">Cancel</button></div>
      <p class="hint" id="nvMsg" role="status"></p>
    </form>`);
  const msg = t => { $('#nvMsg').textContent = t; };
  setTimeout(() => { const f = $('#nvOld') || $('#nvPass'); if (f) f.focus(); }, 60);
  $('#nvCancel').onclick = () => { closeSheet(); if (opt.back) opt.back(); };
  $('#nvForm').onsubmit = async e => {
    e.preventDefault(); if (!(crypto && crypto.subtle)) return msg('Encryption needs a secure page (https, localhost or the installed app).');
    const p = $('#nvPass').value, go = $('#nvGo'); if (!p) return;
    if ((create || change) && p.length < 8) return msg('Use at least 8 characters. A short sentence works well.');
    if ((create || change) && p !== $('#nvPass2').value) return msg('The two passphrases are different.');
    go.disabled = true; msg(create || change ? 'Sealing…' : 'Checking…');
    try {
      if (create) { await nvCreate(p); prefs.encNotes = !!($('#nvAuto') || {}).checked; savePrefs(); }
      else if (change) { if (!nvUnlocked() && !(await nvUnlock($('#nvOld').value))) { go.disabled = false; return msg('The current passphrase is wrong.'); } await nvChange(p); }
      else if (mode === 'foreign') { const r = user.enote[opt.id]; const k = await nvDerive(p, r.s, r.it); try { await nvOpen(k, r, opt.id); NV.keys.set(r.s, k); } catch (er) { go.disabled = false; return msg('That passphrase does not open this note.'); } }
      else if (!(await nvUnlock(p))) { NV.fails++; go.disabled = false; $('#nvPass').value = ''; if (NV.fails >= 5) { msg('Wrong passphrase. Wait 10 seconds.'); go.disabled = true; setTimeout(() => { go.disabled = false; msg(''); }, 10000); } else msg('Wrong passphrase.'); return; }
      NV.fails = 0; $$('#nvForm input[type=password]').forEach(i => { i.value = ''; });
      closeSheet(); if (state.tab === 'tools') renderNotesCard();
      if (create) toast('Notes passphrase set. Keep it somewhere safe: it cannot be recovered.');
      else if (change) toast('Passphrase changed; every note re-sealed');
      if (then) then();
    } catch (er) { go.disabled = false; msg('Could not do that here: ' + (er && er.message || er)); }
  };
}
function nvEnsure(then, back) { if (!NV.vault) return nvPassSheet('create', then, { back }); if (!nvUnlocked()) return nvPassSheet('unlock', then, { back }); then(); }

async function nvChange(pass) {
  const old = NV.vault, salt = hex(crypto.getRandomValues(new Uint8Array(16))), key = await nvDerive(pass, salt, NV_ITER), next = {}; let kept = 0;
  for (const id of Object.keys(user.enote)) { const r = user.enote[id], k = NV.keys.get(r.s); try { if (!k) throw 0; next[id] = await nvSeal(key, await nvOpen(k, r, id), salt, NV_ITER, id); } catch (e) { next[id] = r; kept++; } }
  const vault = { v: 1, salt, iter: NV_ITER, check: await nvSeal(key, NV_CHECK, salt, NV_ITER, 'check'), created: old ? old.created : Date.now(), changed: Date.now() };
  user.enote = next; await persistUserNow(); await dbPut('kv', 'noteVault', vault);
  await rpReseal(key, salt, NV_ITER);
  NV.vault = vault; NV.keys.clear(); NV.plain.clear(); NV.keys.set(salt, key);
  if (kept) toast(kept + ' note' + (kept > 1 ? 's' : '') + ' sealed with another passphrase were left as they are');
}
async function encryptAllNotes() {
  const ids = Object.keys(user.note); if (!ids.length) return toast('No readable notes to encrypt');
  const v = NV.vault, key = NV.keys.get(v.salt);
  for (const id of ids) { user.enote[id] = await nvSeal(key, user.note[id], v.salt, v.iter, id); delete user.note[id]; invalidateHay(id); }
  await persistUserNow(); await rpScrubPlain(ids); renderNotesCard(); toast('Encrypted ' + ids.length + ' note' + (ids.length > 1 ? 's' : '') + '. Backups you saved earlier still hold the readable versions.');
}
async function decryptAllNotes() {
  if (!confirm('Turn every encrypted note back into a readable note and remove the passphrase?')) return;
  await makeRestorePoint('Before removing note encryption', { force: true });
  let n = 0, left = 0;
  for (const id of Object.keys(user.enote)) { const t = await noteText(id); if (typeof t === 'string' && t) { user.note[id] = t; delete user.enote[id]; invalidateHay(id); n++; } else left++; }
  await persistUserNow();
  if (!left) { await dbDel('kv', 'noteVault'); NV.vault = null; NV.keys.clear(); NV.plain.clear(); prefs.encNotes = false; savePrefs(); }
  renderNotesCard(); toast(n + ' note' + (n === 1 ? '' : 's') + ' readable again' + (left ? '; ' + left + ' sealed with another passphrase were kept' : ''));
}
async function forgetNotesPassphrase() {
  const n = encCount();
  if (!confirm('Forgot the passphrase?\n\nThis deletes the passphrase' + (n ? ' and the ' + n + ' encrypted note' + (n > 1 ? 's' : '') + ' (they cannot be read without it)' : '') + '. Readable notes, media and everything else stay.\n\nA restore point is saved first.')) return;
  await makeRestorePoint('Before deleting encrypted notes', { force: true });
  Object.keys(user.enote).forEach(id => invalidateHay(id)); user.enote = {}; await persistUserNow();
  await dbDel('kv', 'noteVault'); NV.vault = null; NV.keys.clear(); NV.plain.clear(); prefs.encNotes = false; savePrefs(); renderNotesCard(); toast('Passphrase removed');
}

/* the note section of an item's sheet */
function noteSectionHtml(it) {
  const enc = isEnc(it.id), auto = wantsEnc(it.id);
  return `<div class="sect" id="noteSect"><div class="notehead"><label for="noteBox" class="sect-h">Private note</label>${enc ? '<span class="pill2 lockpill"><svg viewBox="0 0 24 24"><use href="#i-lock"/></svg>Encrypted</span>' : ''}<span style="flex:1"></span>
    ${enc ? (nvUnlocked() ? '<button class="btn small" id="noteDecrypt" title="Keep this note as plain text again">Remove encryption</button>' : '') : `<button class="btn small" id="noteEncrypt" title="Seal this note with your passphrase">${auto && nvUnlocked() ? 'Encrypted on save' : 'Encrypt…'}</button>`}</div>
    ${enc && !nvUnlocked() ? `<div class="enclocked"><span>This note is sealed on this device.</span><button class="btn small primary" id="noteUnlock">Unlock to read</button></div>` :
      `<textarea class="input" id="noteBox" data-enc="${enc ? 1 : 0}" placeholder="${auto ? (nvUnlocked() ? 'Encrypted with your passphrase, only on this device' : 'Unlock to write an encrypted note') : 'Only stored on this device'}" ${auto && !nvUnlocked() ? 'readonly' : ''}>${enc ? '' : esc(user.note[it.id] || '')}</textarea>
       ${auto && !nvUnlocked() && !enc ? '<div class="row" style="margin-top:6px"><button class="btn small primary" id="noteUnlock">Unlock</button></div>' : ''}`}
    ${enc || auto ? '<p class="hint" style="margin-top:6px">Encrypted notes are not searchable, so their words never sit in the search index.</p>' : ''}</div>`;
}
function bindNoteSection(it) {
  const reopen = () => { if (byId.get(it.id)) itemSheet(byId.get(it.id)); };
  const nb = $('#noteBox');
  if (nb && isEnc(it.id)) { nb.value = ''; nb.placeholder = 'Decrypting…'; noteText(it.id).then(t => { if (!document.contains(nb)) return; if (t === undefined) { $('#noteSect').querySelector('textarea').replaceWith(Object.assign(document.createElement('div'), { className: 'enclocked', innerHTML: '<span>Sealed with a different passphrase.</span><button class="btn small" id="noteForeign">Enter that passphrase</button>' })); $('#noteForeign').onclick = () => nvPassSheet('foreign', reopen, { id: it.id, back: reopen }); return; } nb.value = t || ''; nb.placeholder = 'Encrypted with your passphrase, only on this device'; }); }
  if (nb) nb.onchange = async e => {
    const v = e.target.value, enc = wantsEnc(it.id);
    if (enc && !nvUnlocked()) return nvEnsure(async () => { await setNote(it.id, v, true); toast('Encrypted note saved'); reopen(); }, reopen);
    try { await setNote(it.id, v, enc); toast(v.trim() ? (enc ? 'Encrypted note saved' : 'Note saved') : 'Note removed'); } catch (er) { toast('Could not save the note'); }
  };
  const un = $('#noteUnlock'); if (un) un.onclick = () => nvEnsure(reopen, reopen);
  const en = $('#noteEncrypt'); if (en) en.onclick = () => nvEnsure(async () => { const cur = ($('#noteBox') && $('#noteBox').value) || user.note[it.id] || ''; if (cur.trim()) { await setNote(it.id, cur, true); toast('Note encrypted. Older backups still hold the readable version.'); } else if (!prefs.encNotes) { prefs.encNotes = true; savePrefs(); toast('New notes will be encrypted'); } reopen(); }, reopen);
  const de = $('#noteDecrypt'); if (de) de.onclick = async () => { const t = await noteText(it.id); if (typeof t !== 'string') return; await setNote(it.id, t, false); toast('This note is plain text again'); reopen(); };
}
async function noteCommand(id, words) {           // "note: …" by voice or typing
  const go = async () => { const cur = await noteText(id); const t = ((typeof cur === 'string' && cur ? cur + '\n' : '') + words).slice(0, 4000); await setNote(id, t, wantsEnc(id)); toast(wantsEnc(id) ? 'Encrypted note saved' : 'Note saved'); };
  if (wantsEnc(id) && !nvUnlocked()) { nvEnsure(go); return 'Unlock your notes first'; }
  await go(); return '';
}

/* Tools card */
function renderNotesCard() {
  const el = $('#notesInfo'); if (!el) return;
  const plain = Object.keys(user.note).length, enc = encCount();
  el.textContent = NV.vault ? (nvUnlocked() ? 'Unlocked. ' : 'Locked. ') + enc + ' encrypted, ' + plain + ' readable note' + (plain === 1 ? '' : 's') + '. ' + (prefs.encNotes ? 'New notes are encrypted.' : 'New notes are readable unless you encrypt them.') : (plain ? plain + ' readable note' + (plain === 1 ? '' : 's') + '. ' : '') + 'No passphrase yet.';
  const has = !!NV.vault, un = nvUnlocked();
  $('#btnNotesSetup').classList.toggle('hidden', has); $('#btnNotesUnlock').classList.toggle('hidden', !has || un); $('#btnNotesLock').classList.toggle('hidden', !un);
  $('#btnNotesAll').classList.toggle('hidden', !has || !plain); $('#btnNotesChange').classList.toggle('hidden', !has); $('#btnNotesOff').classList.toggle('hidden', !un); $('#btnNotesForgot').classList.toggle('hidden', !has || un);
  $('#optEncNotes').checked = !!prefs.encNotes; $('#optEncNotes').disabled = !has; $('#optEncNotesRow').classList.toggle('hidden', !has);
}
function bindNotesCard() {
  $('#btnNotesSetup').onclick = () => nvPassSheet('create', () => { renderNotesCard(); if (Object.keys(user.note).length && confirm('Encrypt your ' + Object.keys(user.note).length + ' existing notes now?')) encryptAllNotes(); });
  $('#btnNotesUnlock').onclick = () => nvPassSheet('unlock', renderNotesCard);
  $('#btnNotesLock').onclick = () => { nvLock(); renderNotesCard(); };
  $('#btnNotesAll').onclick = () => nvEnsure(encryptAllNotes);
  $('#btnNotesChange').onclick = () => nvPassSheet('change', renderNotesCard);
  $('#btnNotesOff').onclick = decryptAllNotes;
  $('#btnNotesForgot').onclick = forgetNotesPassphrase;
  $('#optEncNotes').onchange = e => { prefs.encNotes = e.target.checked; savePrefs(); renderNotesCard(); };
}

/* ---------- restore points: local snapshots of your layer (never media) ---------- */
const RP_MAX = 12;
async function rpList() { const l = await dbGet('kv', 'restorePoints'); return Array.isArray(l) ? l : []; }
function rpCounts(u, pr) { return { fav: Object.keys(u.fav || {}).length, notes: Object.keys(u.note || {}).length + Object.keys(u.enote || {}).length, rated: Object.keys(u.rating || {}).length, filed: Object.keys(u.home || {}).length, folders: Object.keys(u.folders || {}).length, collections: Object.keys(u.collections || {}).length, trash: Object.keys(u.trash || {}).length, resume: Object.keys(pr || {}).length }; }
const rpHasData = c => c.fav + c.notes + c.rated + c.filed + c.folders + c.collections + c.trash + c.resume > 0;
async function makeRestorePoint(label, opt = {}) {
  try {
    const data = { user: JSON.parse(JSON.stringify(user)), progress: Object.fromEntries(progress), extra: extraItems.map(stripRuntime), profile: Object.assign({}, PROFILE) };
    let json = JSON.stringify(data); if (json.length > 6e6) { data.extra = null; json = JSON.stringify(data); }
    const counts = rpCounts(data.user, data.progress); if (!opt.force && !rpHasData(counts)) return null;
    const sig = (await sha256Hex(nvTE.encode(json))).slice(0, 24), list = await rpList();
    if (list[0] && list[0].sig === sig) return list[0];                                         // nothing changed since the last one
    const rp = { id: 'rp-' + Date.now().toString(36) + randHex(2), at: Date.now(), label: String(label || 'Saved').slice(0, 80), sig, bytes: json.length, counts, data };
    list.unshift(rp); await dbPut('kv', 'restorePoints', list.slice(0, RP_MAX));
    if (state.tab === 'tools') renderRestoreCard(); return rp;
  } catch (e) { return null; }
}
async function rpDaily() { const l = await rpList(); if (!l.length || Date.now() - l[0].at > 20 * 3600 * 1000) await makeRestorePoint('Daily'); }
const rpWhen = t => { const d = new Date(t), now = new Date(); return (d.toDateString() === now.toDateString() ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
async function rpRestore(id, skipAsk) {
  const rp = (await rpList()).find(x => x.id === id); if (!rp || !rp.data || !rp.data.user) return toast('That restore point is gone');
  if (!skipAsk && !confirm('Go back to “' + rp.label + '” (' + rpWhen(rp.at) + ')?\n\nFavourites, ratings, notes, tags, folders and filing, collections, Trash, saved searches and resume points return to how they were. Media is never touched. Your current state is saved as a restore point first, so this can be undone.')) return;
  const before = await makeRestorePoint('Before going back to ' + rpWhen(rp.at), { force: true });
  const u = rp.data.user;
  USER_MAPS.forEach(k => { user[k] = (u[k] && typeof u[k] === 'object' && !Array.isArray(u[k])) ? JSON.parse(JSON.stringify(u[k])) : {}; }); user.recent = Array.isArray(u.recent) ? u.recent.slice(0, 24) : [];
  Object.keys(user.enote).forEach(k => { if (!validEnc(user.enote[k])) delete user.enote[k]; });
  for (const k of Array.from(progress.keys())) { if (!(rp.data.progress || {})[k]) { progress.delete(k); await dbDel('progress', k); } }
  for (const [k, v] of Object.entries(rp.data.progress || {})) { if (v && isFinite(v.pct)) { progress.set(k, v); await dbPut('progress', k, v); } }
  if (Array.isArray(rp.data.extra)) { extraItems = rp.data.extra.map(cleanExtra).filter(Boolean); await saveExtra(); }
  NV.plain.clear(); await persistUserNow(); reindex(); everything().forEach(i => { i._hay = null; }); refreshViews(); renderTools();
  toast('Back to ' + rpWhen(rp.at), before ? { label: 'Undo', fn: () => rpRestore(before.id, true) } : null);
}
function rpBackupJson(rp) {
  return JSON.stringify({ app: 'media-hub', version: 3, exported: new Date(rp.at).toISOString(), restorePoint: rp.label, prefs: {}, user: rp.data.user, progress: rp.data.progress || {}, extra: rp.data.extra || [], profile: rp.data.profile || {}, noteVault: NV.vault ? { v: NV.vault.v, salt: NV.vault.salt, iter: NV.vault.iter, check: NV.vault.check } : null }, null, 1);
}
async function renderRestoreCard() {
  const box = $('#rpList'); if (!box) return;
  const l = await rpList();
  box.innerHTML = l.length ? l.map(rp => { const c = rp.counts || {}; return `<div class="rprow"><div><b>${esc(rp.label)}</b><small>${esc(rpWhen(rp.at))} · ${c.fav || 0} ★ · ${c.notes || 0} notes · ${c.filed || 0} filed · ${c.folders || 0} folders · ${c.collections || 0} collections · ${c.resume || 0} resume points</small></div><button class="btn small" data-rp="${esc(rp.id)}" data-a="restore">Go back</button><button class="btn small" data-rp="${esc(rp.id)}" data-a="save" title="Save as a backup file">Save</button></div>`; }).join('') : '<p class="hint">None yet. One is made each day you use the app and before big changes.</p>';
  $$('#rpList [data-rp]').forEach(b => b.onclick = async () => { if (b.dataset.a === 'restore') return rpRestore(b.dataset.rp); const rp = l.find(x => x.id === b.dataset.rp); if (rp) { download('media-hub-restore-point-' + new Date(rp.at).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json', rpBackupJson(rp), 'application/json'); toast('Saved as a backup file. No media and no PIN inside.'); } });
}

/* ---------- diagnostics you can paste anywhere: counts and settings only ---------- */
async function diagnosticsText() {
  const all = everything(), kinds = {}; all.forEach(i => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
  let est = null, per = false; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; per = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { }
  let sw = 'not available here'; try { if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { const r = await navigator.serviceWorker.getRegistrations(); sw = r.length ? (navigator.serviceWorker.controller ? 'active' : 'installed, not controlling yet') : 'not registered'; } } catch (e) { }
  const rps = await rpList(), log = $('#diagLog');
  const L = ['Media Hub diagnostics · ' + new Date().toISOString(), 'Version ' + APP_VERSION + ' · catalog built ' + ((CAT.meta && CAT.meta.built) || '?'),
    'Mode: ' + (location.protocol === 'file:' ? 'file' : isStandalone() ? 'installed app' : 'browser (' + location.protocol.replace(':', '') + ')') + ' · secure context: ' + !!window.isSecureContext + ' · online: ' + navigator.onLine + ' · offline-only: ' + !!prefs.offlineOnly,
    'Browser: ' + navigator.userAgent,
    'Storage: ' + (idb ? 'IndexedDB' : 'memory only') + (est ? ' · ' + fmtBytes(est.usage) + ' of ' + fmtBytes(est.quota) : '') + ' · protected: ' + per,
    'Offline copy (service worker): ' + sw,
    'Items: ' + all.length + ' (' + Object.entries(kinds).map(([k, n]) => n + ' ' + k).join(', ') + ') · on device ' + all.filter(hasLocal).length + ' · added by you ' + imported.length + ' · links/rows ' + extraItems.length,
    'Linked folders: ' + LINK.roots.length + ' (' + linkedItems.length + ' files) · phone folders: ' + serverItems.length + ' files · shared space: ' + sharedAll().length + ' items from ' + sharedOwners().filter(o => o.n).length + ' people',
    'Your layer: ' + Object.keys(user.fav).length + ' favourites, ' + Object.keys(user.rating).length + ' rated, ' + Object.keys(user.note).length + ' readable notes, ' + encCount() + ' encrypted notes, ' + Object.keys(user.folders).length + ' folders, ' + Object.keys(user.home).length + ' filed, ' + Object.keys(user.collections).length + ' collections, ' + Object.keys(user.trash).length + ' in Trash',
    'Notes passphrase: ' + (NV.vault ? (nvUnlocked() ? 'set, unlocked' : 'set, locked') : 'none') + ' · PIN: ' + (prefs.pinSet ? 'set' : 'none') + ' · blur: ' + !!prefs.blur + ' · cover when hidden: ' + !!prefs.hideBg,
    'Restore points: ' + rps.length + (rps[0] ? ' (latest ' + new Date(rps[0].at).toISOString().slice(0, 16) + ')' : ''),
    'Voice: ' + (VOICE.SR ? 'available' : 'not in this browser') + ' · link folders in place: ' + canLink()];
  if (log && !log.classList.contains('hidden') && log.innerText.trim()) L.push('', 'Self-test:', log.innerText.trim());
  L.push('', 'No titles, notes, file names, folder names or links are included.');
  return L.join('\n');
}
async function copyDiagnostics() {
  const log = $('#diagLog'); if (log && (log.classList.contains('hidden') || !log.innerText.trim())) await selfTest();
  const t = await diagnosticsText(); toast((await copyText(t)) ? 'Diagnostics copied (' + t.split('\n').length + ' lines, no titles or notes)' : 'Copy failed'); return t;
}
