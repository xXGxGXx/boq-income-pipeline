/* ===================== LIBRARY: master folder tree · auto-filing · move · select · trash · linked & phone folders · export ===================== */
/* Every item has exactly one home folder. Moving an item only changes that label: files are never moved, copied or altered.
   By type, Smart folders, Collections and the linked-folder mirrors are live views over the same items. */
const SYSDEF = [
  ['root', 'Library', null, 'root', 'Everything you keep, in one place.', 'i-lib'],
  ['type', 'By type', 'root', 'section', 'Every item, grouped by what it is', 'i-img'],
  ['type/photos', 'Photos', 'type', 'test', 'Still pictures', 'i-img'],
  ['type/videos', 'Videos', 'type', 'test', 'Clips and films', 'i-film'],
  ['type/gifs', 'GIFs & loops', 'type', 'test', 'Animated pictures and loop previews', 'i-film'],
  ['type/audio', 'Audio', 'type', 'test', 'Music, voice notes and recordings', 'i-music'],
  ['type/vertical', 'Vertical', 'type', 'test', 'Portrait clips and pictures', 'i-phone'],
  ['type/hd', 'HD & 4K', 'type', 'test', '720p and sharper', 'i-hd'],
  ['cats', 'By category', 'root', 'section', 'Every category in your library: how many items, how many are online or on this device, and where they come from', 'i-tag'],
  ['ai', 'AI', 'root', 'group', 'Anything an AI made, changed, found or handed to you, kept apart from everything else.', 'i-spark'],
  ['ai/generated', 'Generated', 'ai', 'home', 'Made from scratch by an AI: pictures, video, voice', 'i-spark'],
  ['ai/edited', 'Edited & enhanced', 'ai', 'home', 'Media changed by an AI: upscaled, restyled, extended. Keep the originals elsewhere', 'i-spark'],
  ['ai/sourced', 'Sourced', 'ai', 'home', 'Found or collected for you by an AI assistant', 'i-spark'],
  ['ai/provided', 'Provided', 'ai', 'home', 'Files an AI chat or app handed back to you', 'i-spark'],
  ['ai/prompts', 'Prompts & references', 'ai', 'home', 'Reference pictures and prompt material', 'i-note'],
  ['src', 'Sources', 'root', 'group', 'Where each item came from', 'i-inbox'],
  ['src/inbox', 'Inbox', 'src', 'home', 'Shared or pasted into the app, waiting to be filed', 'i-inbox'],
  ['src/device', 'This device', 'src', 'home', 'Files you added. Stored byte-for-byte inside the app', 'i-phone'],
  ['src/linked', 'Linked folders', 'src', 'home', 'Folders on this device, read in place and never copied', 'i-link'],
  ['src/server', 'Phone folders', 'src', 'home', 'Folders shared by the companion server (media_serve.py --library)', 'i-server'],
  ['src/gallery', 'Gallery originals', 'src', 'home', 'The original files that travel inside this app', 'i-img'],
  ['src/drive', 'Google Drive', 'src', 'home', 'Clips and files in your Drive', 'i-cloud'],
  ['src/web', 'Web links', 'src', 'home', 'Links to other sites, grouped by site', 'i-globe'],
  ['src/rows', 'Imported catalogs', 'src', 'home', 'Rows from TSV, CSV or JSON files you imported', 'i-ws'],
  ['src/live', 'Live server', 'src', 'home', 'Items from your Termux orchestrator', 'i-bolt'],
  ['my', 'My folders', 'root', 'group', 'Folders you make. Nest them as deep as you like', 'i-vault'],
  ['col', 'Collections', 'root', 'section', 'Playlists in your own order. One item can be in many', 'i-list'],
  ['smart', 'Smart folders', 'root', 'section', 'Live views that fill themselves', 'i-bolt'],
  ['smart/fav', 'Favourites', 'smart', 'test', 'Everything you starred', 'i-star'],
  ['smart/unseen', 'Not opened yet', 'smart', 'test', 'Never opened in this app', 'i-eye'],
  ['smart/continue', 'Continue watching', 'smart', 'test', 'Videos you stopped part-way', 'i-play'],
  ['smart/recent', 'Recently added', 'smart', 'test', 'The newest additions first', 'i-clock'],
  ['smart/opened', 'Recently opened', 'smart', 'test', 'What you looked at last', 'i-clock'],
  ['smart/rated', 'Rated', 'smart', 'test', 'Best rated first', 'i-star'],
  ['smart/notes', 'With notes', 'smart', 'test', 'Items with a private note', 'i-note'],
  ['smart/dupes', 'Exact duplicates', 'smart', 'test', 'Byte-for-byte copies, found by SHA-256', 'i-copy'],
  ['idx', 'Indexes', 'root', 'section', 'Read-only lists of files kept elsewhere', 'i-ws'],
  ['idx/vault', 'Phone folder snapshot', 'idx', 'index', 'Folder sizes from the phone vault scan', 'i-vault'],
  ['idx/workspace', 'Workspace files', 'idx', 'index', 'Documents, notes and tools from the workspace library', 'i-ws'],
  ['shared', 'Shared', 'root', 'section', 'The one place meant for other people. Nothing gets in unless you share it, and everyone gets one folder, named after them.', 'i-users'],
  ['archive', 'Archive', 'root', 'special', 'Hidden from Home and Scroll, kept here', 'i-archive'],
  ['trash', 'Trash', 'root', 'special', 'Removed items. Restore them, or delete them for good', 'i-trash']
];
const SYS = {}, SYSKIDS = {};
SYSDEF.forEach(([id, name, parent, kind, desc, icon]) => { SYS[id] = { id, name, parent, kind, desc, icon }; if (parent) (SYSKIDS[parent] = SYSKIDS[parent] || []).push(id); });
const MIRROR_HOMES = new Set(['src/linked', 'src/server', 'src/live']);
const ALWAYS_TILES = new Set(['type/photos', 'type/videos', 'ai/generated', 'ai/edited', 'ai/sourced', 'ai/provided', 'ai/prompts', 'src/inbox', 'src/device', 'src/linked']);
const SECTION_ONLY = new Set(['root', 'type', 'cats', 'col', 'smart', 'idx', 'shared']);
const catId = name => 'cat:' + encodeURIComponent(name);
function categoryStats() {                              // the live category reference: computed from what is in your library right now
  const m = new Map();
  shown().forEach(it => { const k = it.category || 'Uncategorised'; if (!m.has(k)) m.set(k, { name: k, n: 0, online: 0, device: 0, src: new Map() }); const d = m.get(k); d.n++; if (hasLocal(it)) d.device++; else d.online++; const s = srcShort(it.source) || 'Other'; d.src.set(s, (d.src.get(s) || 0) + 1); });
  return Array.from(m.values()).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
const isMy = f => typeof f === 'string' && f.startsWith('my:');

/* ---------- auto-filing: where an item lives until you move it ---------- */
const AI_EDIT = /(^|[^a-z])(upscal\w*|ai[- _]?(edit\w*|enhanc\w*)|enhanced|restyl\w*|remaster\w*|interpolat\w*|topaz|gigapixel)([^a-z]|$)/i;
const AI_SRC = /(^|[^a-z])(ai[- _]?(sourced|found|retrieved|search(ed)?)|sourced)([^a-z]|$)/i;
const AI_PROV = /(^|[^a-z])(ai[- _]?provided|provided|chatgpt|claude|perplexity|copilot)([^a-z]|$)/i;
const AI_PROMPT = /(^|[^a-z])(prompts?|ai[- _]?ref(erence)?s?)([^a-z]|$)/i;
const AI_GEN = /(^|[^a-z])(ai[- _]?(gen(erated)?|art|images?|videos?|studies|made|renders?)|generated|grok( ?imagine)?|midjourney|dall[- ]?e|stable[- _]?diffusion|sdxl|comfy ?ui|flux|sora|runway|kling|pika|leonardo|ideogram|firefly|imagen|veo|hailuo|luma)([^a-z]|$)/i;
function aiHome(txt, path) {
  const seg = (path || '').toLowerCase().split('/');                 // a folder on disk named AI/Generated, Sourced, … decides first
  const ai = seg.indexOf('ai'), nxt = ai >= 0 ? seg[ai + 1] || '' : '';
  const byName = n => /^generat|^creat/.test(n) ? 'ai/generated' : /^edit|^enhanc|^upscal/.test(n) ? 'ai/edited' : /^sourc|^found/.test(n) ? 'ai/sourced' : /^provid/.test(n) ? 'ai/provided' : /^prompt|^ref/.test(n) ? 'ai/prompts' : '';
  if (ai >= 0) return byName(nxt) || 'ai/generated';
  for (const s of seg) { const h = /^(ai[- _]?)?(generated|edited|enhanced|sourced|provided|prompts?)( |$)/.test(s) ? byName(s.replace(/^ai[- _]?/, '')) : ''; if (h) return h; }
  if (AI_EDIT.test(txt)) return 'ai/edited';
  if (AI_SRC.test(txt) && /\bai\b|sourced/i.test(txt)) return 'ai/sourced';
  if (AI_PROV.test(txt)) return 'ai/provided';
  if (AI_PROMPT.test(txt) && /\bai\b|prompt/i.test(txt)) return 'ai/prompts';
  if (AI_GEN.test(txt)) return 'ai/generated';
  return '';
}
function autoHome(it) {
  if (it.shared) return 'sh:' + ownerKeyOf(it);            // shared copies live in Shared, never in your library
  if (it._auto) return it._auto;
  const txt = [it.code, it.category, it.source, (it.tags || []).join(' '), it.name || ''].join(' ');
  let h = /^(ai|grok)[-_]/i.test(it.code || '') ? 'ai/generated' : aiHome(txt, it.dir || it.folder || '');
  if (!h) {
    const d0 = ((it.dir || '').split('/')[0] || '').toLowerCase();
    if (it.linked) h = d0 === 'inbox' ? 'src/inbox' : 'src/linked';
    else if (it.server) h = d0 === 'inbox' ? 'src/inbox' : 'src/server';
    else if (it.imported) h = it.inbox ? 'src/inbox' : 'src/device';
    else if (it._live) h = 'src/live';
    else if (it.extra) h = it.fromFile ? 'src/rows' : it.driveId ? 'src/drive' : 'src/web';
    else if (it.local && /gallery/i.test(it.source || '')) h = 'src/gallery';
    else if (it.driveId || /drive/i.test(it.source || '')) h = 'src/drive';
    else h = it.local ? 'src/gallery' : it.link ? 'src/web' : 'src/gallery';
  }
  return (it._auto = h);
}
function canFile(fid) { return (!!SYS[fid] && SYS[fid].kind === 'home' && !MIRROR_HOMES.has(fid)) || (isMy(fid) && !!user.folders[fid]); }
function homeOf(it) { const h = user.home[it.id]; return h && canFile(h) ? h : autoHome(it); }
let _hm = null, _hmV = -1;
function homeMap() {                                   // home folder → shown items, cached until something changes
  if (_hm && _hmV === LIBV) return _hm;
  _hm = new Map(); shown().forEach(it => { const h = homeOf(it); if (!_hm.has(h)) _hm.set(h, []); _hm.get(h).push(it); }); _hmV = LIBV; return _hm;
}

/* ---------- folder identity ---------- */
function linkRootOf(id) { return LINK.roots.find(r => r.id === id); }
function parentOf(f) {
  if (SYS[f]) return SYS[f].parent;
  if (isMy(f)) { const p = (user.folders[f] || {}).parent || 'my'; return p === 'my' || user.folders[p] ? p : 'my'; }
  if (f.startsWith('col:')) return 'col';
  if (f.startsWith('saved:')) return 'smart';
  if (f.startsWith('lk:') || f.startsWith('sv:')) { const rest = f.slice(3), i = rest.lastIndexOf('/'); return i < 0 ? (f.startsWith('lk:') ? 'src/linked' : 'src/server') : f.slice(0, 3) + rest.slice(0, i); }
  if (f.startsWith('grp:')) return decodeURIComponent(f.slice(4).split(':')[0]);
  if (f.startsWith('sh:')) return 'shared';
  if (f.startsWith('cat:')) return 'cats';
  return 'root';
}
function folderName(f) {
  if (SYS[f]) return SYS[f].name;
  if (isMy(f)) return (user.folders[f] || {}).name || 'Folder';
  if (f.startsWith('col:')) return ((user.collections || {})[f.slice(4)] || {}).name || 'Collection';
  if (f.startsWith('saved:')) return ((user.saved || {})[f.slice(6)] || {}).name || 'Saved search';
  if (f.startsWith('lk:') || f.startsWith('sv:')) { const rest = f.slice(3), i = rest.lastIndexOf('/'); if (i >= 0) return rest.slice(i + 1); return f.startsWith('lk:') ? ((linkRootOf(rest) || {}).name || 'Linked folder') : rest; }
  if (f.startsWith('grp:')) return decodeURIComponent(f.slice(4).split(':')[1] || '');
  if (f.startsWith('sh:')) { const k = f.slice(3), o = sharedOwners().find(x => x.key === k); return k === 'me' ? (PROFILE.dir || PROFILE.name || 'You') + ' (you)' : o ? o.name : 'Someone'; }
  if (f.startsWith('cat:')) return decodeURIComponent(f.slice(4));
  return 'Folder';
}
function folderValid(f) {
  if (!f) return false;
  if (SYS[f]) return true;
  if (isMy(f)) return !!user.folders[f];
  if (f.startsWith('col:')) return !!(user.collections || {})[f.slice(4)];
  if (f.startsWith('saved:')) return !!(user.saved || {})[f.slice(6)];
  if (f.startsWith('lk:')) return !!linkRootOf(f.slice(3).split('/')[0]);
  if (f.startsWith('sv:')) return SERVER.roots.some(r => r.name === f.slice(3).split('/')[0]);
  if (f.startsWith('grp:')) return folderValid(parentOf(f));
  if (f.startsWith('sh:')) { const k = f.slice(3); return k === 'me' || sharedOwners().some(o => o.key === k); }
  if (f.startsWith('cat:')) { const n = decodeURIComponent(f.slice(4)); return shown().some(it => (it.category || 'Uncategorised') === n); }
  return false;
}
function pathOf(f) { const out = []; let cur = f, n = 0; while (cur && n++ < 40) { out.unshift({ id: cur, name: folderName(cur) }); cur = parentOf(cur); } return out; }
function iconOf(f) { if (SYS[f]) return SYS[f].icon; if (f.startsWith('sh:')) return 'i-user'; if (f.startsWith('cat:')) return 'i-tag'; if (f.startsWith('col:')) return 'i-list'; if (f.startsWith('saved:')) return 'i-search'; if (f.startsWith('lk:')) return 'i-link'; if (f.startsWith('sv:')) return 'i-server'; if (f.startsWith('grp:')) return 'i-tag'; return 'i-vault'; }
function descOf(f) {
  if (SYS[f]) return SYS[f].desc;
  if (isMy(f)) return 'Your folder';
  if (f.startsWith('col:')) return 'Collection · your order';
  if (f.startsWith('saved:')) return 'Saved search: ' + ((user.saved || {})[f.slice(6)] || {}).q;
  if (f.startsWith('lk:')) { const r = linkRootOf(f.slice(3).split('/')[0]); return 'Read in place from this device' + (r && LINK.perm[r.id] !== 'granted' ? ' · tap Reconnect to open files' : ''); }
  if (f.startsWith('sv:')) return 'Streamed from the phone server, nothing copied';
  if (f.startsWith('grp:')) return 'Grouped inside ' + folderName(parentOf(f));
  if (f.startsWith('cat:')) { const d = categoryStats().find(x => x.name === folderName(f)); return d ? 'Category · ' + d.online + ' online · ' + d.device + ' on this device · ' + Array.from(d.src.entries()).map(([s, n]) => s + ' ' + n).join(', ') : 'Category'; }
  if (f === 'sh:me') return 'Your shared folder: only copies you chose to share. Your originals stay private.';
  if (f.startsWith('sh:')) return 'Shared with you by ' + folderName(f) + '. Kept apart from your private library.';
  return '';
}
function myDescendants(f) { const out = new Set([f]); let grew = true; while (grew) { grew = false; Object.keys(user.folders).forEach(k => { const p = user.folders[k].parent || 'my'; if (out.has(p) && !out.has(k)) { out.add(k); grew = true; } }); } return out; }
function inFolderText(it) {
  if (it._inV === LIBV && it._inT != null) return it._inT;
  it._inV = LIBV; return (it._inT = (pathOf(homeOf(it)).map(p => p.name).join(' / ') + ' ' + (it.dir || it.folder || '')).toLowerCase());
}

/* ---------- what is inside a folder ---------- */
const TESTS = {
  'type/photos': it => it.kind === 'image' && !isGif(it), 'type/videos': it => it.kind === 'video', 'type/gifs': isGif, 'type/audio': it => it.kind === 'audio',
  'type/vertical': isVertical, 'type/hd': it => /^(720p|1080p|1440p|4K)$/.test(qualityOf(it)),
  'smart/fav': it => isFav(it.id), 'smart/unseen': it => !user.seen[it.id], 'smart/continue': it => { const p = progress.get(it.id); return !!(p && p.pct > 1 && p.pct < 95); },
  'smart/recent': it => !!it.added, 'smart/opened': it => !!user.seen[it.id], 'smart/rated': it => !!user.rating[it.id], 'smart/notes': it => hasNote(it.id), 'smart/dupes': it => dupeSet.has(it.id)
};
const SMART_SORT = {
  'smart/recent': (a, b) => (b.added || 0) - (a.added || 0), 'smart/opened': (a, b) => ((user.seen[b.id] || {}).at || 0) - ((user.seen[a.id] || {}).at || 0),
  'smart/rated': (a, b) => (user.rating[b.id] || 0) - (user.rating[a.id] || 0), 'smart/continue': (a, b) => (progress.get(b.id) || {}).at - (progress.get(a.id) || {}).at,
  'smart/fav': (a, b) => (user.fav[b.id] || 0) - (user.fav[a.id] || 0), 'trash': (a, b) => (user.trash[b.id] || 0) - (user.trash[a.id] || 0)
};
function groupKey(f, it) { return f === 'src/web' ? (srcShort(it.source) || 'Other sites') : f === 'src/device' && it.folder ? it.folder.split('/')[0] : (it.category || 'Uncategorised'); }
function rawFolderItems(f) {
  if (f === 'shared') return sharedAll().slice();
  if (f === 'cats') return shown();
  if (f.startsWith('cat:')) { const n = decodeURIComponent(f.slice(4)); return shown().filter(it => (it.category || 'Uncategorised') === n); }
  if (f.startsWith('sh:')) return sharedItemsOf(f.slice(3));
  if (f === 'trash') return everything().filter(it => user.trash[it.id] && !user.gone[it.id]);
  if (f === 'archive') return everything().filter(it => user.archive[it.id] && !user.trash[it.id] && !user.gone[it.id]);
  if (TESTS[f]) return shown().filter(TESTS[f]);
  if (f === 'root' || f === 'type' || f === 'smart' || f === 'idx') return shown();
  const hm = homeMap(), pick = pred => { let out = []; hm.forEach((list, h) => { if (pred(h)) out = out.concat(list); }); return out; };
  if (f === 'ai') return pick(h => h.startsWith('ai/'));
  if (f === 'src') return pick(h => h.startsWith('src/'));
  if (f === 'my') return pick(isMy);
  if (isMy(f)) { const set = myDescendants(f); return pick(h => set.has(h)); }
  if (SYS[f] && SYS[f].kind === 'home') return f === 'src/linked' ? shown().filter(it => it.linked) : f === 'src/server' ? shown().filter(it => it.server) : (hm.get(f) || []).slice();
  if (f === 'col') return shown().filter(it => collectionsOf(it.id).length);
  if (f.startsWith('col:')) { const c = (user.collections || {})[f.slice(4)]; return c ? c.ids.map(id => byId.get(id)).filter(it => it && isShown(it)) : []; }
  if (f.startsWith('saved:')) { const s = (user.saved || {})[f.slice(6)]; if (!s) return []; const p = parseQuery(s.q); return (wantsHidden(p) ? everything() : shown()).filter(it => matchesQuery(it, p)); }
  if (f.startsWith('lk:') || f.startsWith('sv:')) {
    const rest = f.slice(3), i = rest.indexOf('/'), root = i < 0 ? rest : rest.slice(0, i), sub = i < 0 ? '' : rest.slice(i + 1), lk = f.startsWith('lk:');
    return shown().filter(it => (lk ? it.linked && it.linkRoot === root : it.server && it.serverRoot === root) && (!sub || it.dir === sub || (it.dir || '').startsWith(sub + '/')));
  }
  if (f.startsWith('grp:')) { const parent = parentOf(f), key = folderName(f); return rawFolderItems(parent).filter(it => groupKey(parent, it) === key); }
  return [];
}
function folderItems(f) {
  const list = rawFolderItems(f);
  if (prefs.sort === 'catalog' && SMART_SORT[f]) return list.sort(SMART_SORT[f]);
  if (prefs.sort === 'catalog' && f.startsWith('col:')) return list;
  return sortList(list, prefs.sort);
}
function childFolders(f) {
  let kids = (SYSKIDS[f] || []).slice();
  if (f === 'my' || isMy(f)) kids = kids.concat(Object.keys(user.folders).filter(k => (user.folders[k].parent || 'my') === f).sort((a, b) => user.folders[a].name.localeCompare(user.folders[b].name, undefined, { numeric: true })));
  if (f === 'col') kids = Object.entries(user.collections || {}).sort((a, b) => a[1].created - b[1].created).map(([cid]) => 'col:' + cid);
  if (f === 'smart') kids = kids.concat(Object.keys(user.saved || {}).map(s => 'saved:' + s));
  if (f === 'src/linked') kids = LINK.roots.map(r => 'lk:' + r.id);
  if (f === 'src/server') kids = SERVER.roots.map(r => 'sv:' + r.name);
  if (f === 'shared') kids = sharedOwners().map(o => 'sh:' + o.key);
  if (f === 'cats') kids = categoryStats().map(d => catId(d.name));
  if (f.startsWith('lk:') || f.startsWith('sv:')) {
    const rest = f.slice(3), i = rest.indexOf('/'), sub = i < 0 ? '' : rest.slice(i + 1), dirs = new Set();
    rawFolderItems(f).forEach(it => { const d = it.dir || ''; const tail = sub ? (d.startsWith(sub + '/') ? d.slice(sub.length + 1) : '') : d; if (tail) dirs.add(tail.split('/')[0]); });
    kids = Array.from(dirs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(d => f + '/' + d);
  }
  if ((SYS[f] && SYS[f].kind === 'home' && !MIRROR_HOMES.has(f)) || isMy(f)) {           // virtual sub-folders: by category, or by site for web links
    const counts = new Map(); rawFolderItems(f).forEach(it => { const k = groupKey(f, it); counts.set(k, (counts.get(k) || 0) + 1); });
    if (counts.size >= 2) kids = kids.concat(Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 48).map(([k]) => 'grp:' + encodeURIComponent(f) + ':' + encodeURIComponent(k)));
  }
  return kids;
}

/* ---------- names you can say or type ---------- */
const FOLDER_WORDS = {
  'library': 'root', 'master': 'root', 'master folder': 'root', 'folders': 'root', 'all folders': 'root', 'storage': 'root',
  'by type': 'type', 'types': 'type', 'categories': 'cats', 'by category': 'cats', 'all categories': 'cats', 'category list': 'cats', 'category reference': 'cats', 'photos': 'type/photos', 'pictures': 'type/photos', 'images': 'type/photos', 'stills': 'type/photos', 'pics': 'type/photos',
  'videos': 'type/videos', 'clips': 'type/videos', 'motion': 'type/videos', 'movies': 'type/videos', 'gifs': 'type/gifs', 'gifs and loops': 'type/gifs', 'loops': 'type/gifs',
  'audio': 'type/audio', 'sound': 'type/audio', 'music': 'type/audio', 'vertical': 'type/vertical', 'portrait': 'type/vertical', 'hd': 'type/hd', 'hd and 4k': 'type/hd', '4k': 'type/hd',
  'ai': 'ai', 'a i': 'ai', 'ai folder': 'ai', 'ai stuff': 'ai', 'ai content': 'ai', 'ai media': 'ai',
  'generated': 'ai/generated', 'ai generated': 'ai/generated', 'created': 'ai/generated', 'made by ai': 'ai/generated', 'ai made': 'ai/generated', 'ai art': 'ai/generated', 'ai created': 'ai/generated',
  'edited': 'ai/edited', 'enhanced': 'ai/edited', 'upscaled': 'ai/edited', 'ai edited': 'ai/edited', 'edited and enhanced': 'ai/edited', 'ai enhanced': 'ai/edited',
  'sourced': 'ai/sourced', 'ai sourced': 'ai/sourced', 'found by ai': 'ai/sourced', 'provided': 'ai/provided', 'ai provided': 'ai/provided',
  'prompts': 'ai/prompts', 'references': 'ai/prompts', 'prompts and references': 'ai/prompts', 'ai references': 'ai/prompts',
  'sources': 'src', 'inbox': 'src/inbox', 'unfiled': 'src/inbox', 'shared': 'src/inbox', 'this device': 'src/device', 'device': 'src/device', 'my files': 'src/device', 'uploads': 'src/device', 'added': 'src/device',
  'linked': 'src/linked', 'linked folders': 'src/linked', 'phone folders': 'src/server', 'server': 'src/server', 'phone server': 'src/server',
  'gallery': 'src/gallery', 'originals': 'src/gallery', 'gallery originals': 'src/gallery', 'drive': 'src/drive', 'google drive': 'src/drive',
  'web': 'src/web', 'links': 'src/web', 'web links': 'src/web', 'catalogs': 'src/rows', 'imported catalogs': 'src/rows', 'live server': 'src/live',
  'my folders': 'my', 'collections': 'col', 'playlists': 'col', 'smart folders': 'smart', 'smart': 'smart',
  'favourites': 'smart/fav', 'favorites': 'smart/fav', 'starred': 'smart/fav', 'faves': 'smart/fav', 'liked': 'smart/fav',
  'unseen': 'smart/unseen', 'not opened yet': 'smart/unseen', 'not opened': 'smart/unseen', 'unwatched': 'smart/unseen', 'new to me': 'smart/unseen',
  'continue watching': 'smart/continue', 'continue': 'smart/continue', 'recently added': 'smart/recent', 'newest': 'smart/recent', 'latest': 'smart/recent',
  'recently opened': 'smart/opened', 'history': 'smart/opened', 'recent': 'smart/opened', 'rated': 'smart/rated', 'top rated': 'smart/rated', 'best rated': 'smart/rated',
  'notes': 'smart/notes', 'with notes': 'smart/notes', 'duplicates': 'smart/dupes', 'dupes': 'smart/dupes', 'exact duplicates': 'smart/dupes',
  'indexes': 'idx', 'vault': 'idx/vault', 'phone snapshot': 'idx/vault', 'phone folder snapshot': 'idx/vault', 'workspace': 'idx/workspace', 'workspace files': 'idx/workspace',
  'shared': 'shared', 'shared space': 'shared', 'shared folder': 'shared', 'shared folders': 'shared', 'share': 'shared', 'everyone': 'shared',
  'my shared folder': 'sh:me', 'my shared': 'sh:me', 'what i shared': 'sh:me', 'my shares': 'sh:me',
  'archive': 'archive', 'archived': 'archive', 'hidden': 'archive', 'trash': 'trash', 'bin': 'trash', 'recycle bin': 'trash', 'deleted': 'trash', 'rubbish': 'trash'
};
const normName = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|my|folder|folders?$)\b/g, m => m === 'folders' ? m : '').replace(/\s+/g, ' ').trim();
function resolveFolder(raw) {
  const n = normName(raw); if (!n) return null;
  const direct = String(raw || '').toLowerCase().trim(); if (FOLDER_WORDS[direct]) return FOLDER_WORDS[direct];
  if (FOLDER_WORDS[n]) return FOLDER_WORDS[n];
  const cands = [];
  Object.keys(user.folders).forEach(k => cands.push([k, user.folders[k].name]));
  Object.entries(user.collections || {}).forEach(([cid, c]) => cands.push(['col:' + cid, c.name]));
  Object.entries(user.saved || {}).forEach(([sid, s]) => cands.push(['saved:' + sid, s.name]));
  LINK.roots.forEach(r => cands.push(['lk:' + r.id, r.name])); SERVER.roots.forEach(r => cands.push(['sv:' + r.name, r.name]));
  sharedOwners().forEach(o => cands.push(['sh:' + o.key, o.name]));
  SYSDEF.forEach(d => cands.push([d[0], d[1]]));
  const hit = cands.find(([, nm]) => normName(nm) === n) || cands.find(([, nm]) => normName(nm).startsWith(n) && n.length >= 3) || (n.length >= 4 && cands.find(([, nm]) => normName(nm).includes(n)));
  return hit ? hit[0] : null;
}

/* ---------- changes, always undoable ---------- */
function refreshViews() {
  if (state.tab === 'library') renderLibrary(); else if (state.tab === 'folders') renderFolders();
  updateSubtitle(); if (SEL.on) renderSelBar();
}
function undoToast(msg, undo) { toast(msg, undo ? { label: 'Undo', fn: () => { undo(); refreshViews(); toast('Undone'); } } : null); }
function createFolder(name, parent) {
  name = String(name || '').trim().slice(0, 80); if (!name) return null;
  parent = parent && (parent === 'my' || user.folders[parent]) ? parent : 'my';
  const ex = Object.keys(user.folders).find(k => (user.folders[k].parent || 'my') === parent && user.folders[k].name.toLowerCase() === name.toLowerCase()); if (ex) return ex;
  const id = 'my:' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  user.folders[id] = { name, parent, created: Date.now() }; changed(); return id;
}
function setHome(ids, fid, quiet) {
  ids = ids.filter(id => byId.has(id)); if (!ids.length) return;
  if (ids.length >= 25) makeRestorePoint('Before filing ' + ids.length + ' items');   // the snapshot is taken before anything changes
  const prev = ids.map(id => [id, user.home[id]]);
  ids.forEach(id => { if (fid && fid !== autoHome(byId.get(id))) user.home[id] = fid; else delete user.home[id]; });
  changed(); refreshViews();
  const where = fid ? pathOf(fid).slice(1).map(p => p.name).join(' › ') : 'its automatic folder';
  if (!quiet) undoToast((ids.length === 1 ? 'Filed in ' : 'Filed ' + ids.length + ' items in ') + where, () => { prev.forEach(([id, h]) => { if (h) user.home[id] = h; else delete user.home[id]; }); changed(); });
  return where;
}
function flagItems(map, ids, on, msgOn, msgOff) {
  ids = ids.filter(id => byId.has(id)); if (!ids.length) return;
  const prev = ids.map(id => [id, user[map][id]]);
  ids.forEach(id => { if (on) user[map][id] = Date.now(); else delete user[map][id]; });
  changed(); if (SEL.on) exitSelect(); refreshViews();
  if (V.open && V.item && ids.includes(V.item.id) && on) closeViewer();
  if (FEED.open && on) feedRemove(ids);
  undoToast((on ? msgOn : msgOff).replace('{n}', ids.length === 1 ? '1 item' : ids.length + ' items'), () => { prev.forEach(([id, v]) => { if (v) user[map][id] = v; else delete user[map][id]; }); changed(); });
}
const trashItems = ids => flagItems('trash', ids, true, 'Moved {n} to Trash', '');
const restoreItems = ids => flagItems('trash', ids, false, '', 'Restored {n}');
const archiveItems = ids => flagItems('archive', ids, true, 'Archived {n}. Find it in Folders › Archive', '');
const unarchiveItems = ids => flagItems('archive', ids, false, '', 'Back in the library: {n}');
async function deleteForever(ids) {
  const items = ids.map(id => byId.get(id)).filter(Boolean); if (!items.length) return;
  const own = items.filter(i => i.imported).length;
  makeRestorePoint('Before deleting ' + items.length + ' for good', { force: true });
  if (!confirm('Delete ' + (items.length === 1 ? 'this item' : items.length + ' items') + ' for good?' + (own ? '\n\n' + own + ' file' + (own > 1 ? 's' : '') + ' stored inside the app will be erased from the app.' : '') + '\n\nNothing outside the app is touched: originals elsewhere, linked folders and Drive stay as they are. This cannot be undone.')) return;
  for (const it of items) {
    delete user.trash[it.id];
    if (it.imported) { await dbDel('imports', it.id); await dbDel('files', it.id); const u = urlCache.get(it.id); if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); urlCache.delete(it.id); imported = imported.filter(x => x.id !== it.id); }
    else if (it.extra) extraItems = extraItems.filter(x => x.id !== it.id);
    else user.gone[it.id] = Date.now();               // read-only catalog, linked or phone file: hidden for good, the file itself is untouched
  }
  if (items.some(i => i.extra)) await saveExtra();
  reindex(); changed(); if (SEL.on) exitSelect(); refreshViews(); toast('Deleted ' + items.length + ' for good');
}

/* ---------- Folders tab ---------- */
state.folder = 'root';
function openFolder(f, push = true) {
  if (f === 'idx/vault') return setTab('vault');
  if (f === 'idx/workspace') return setTab('workspace');
  if (!folderValid(f)) f = 'root';
  const same = state.tab === 'folders' && state.folder === f;
  state.folder = f;
  if (state.tab !== 'folders') setTab('folders'); else { renderFolders(); if (!same) window.scrollTo({ top: 0 }); }
  if (push && !same) afterNav(() => { try { history.pushState({ mh: 'folder', fid: f }, ''); } catch (e) { } });
}
window.addEventListener('popstate', e => {
  if (NAV.self || V.open || FEED.open) return;
  const st = e.state; if (state.tab !== 'folders') return;
  const f = st && st.mh === 'folder' && folderValid(st.fid) ? st.fid : 'root';
  if (f !== state.folder) { state.folder = f; renderFolders(); window.scrollTo({ top: 0 }); }
});
const folderSvg = (id, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24"><use href="#${id}"/></svg>`;
function coverOf(list) { return list.find(it => hasLocal(it) && (it.kind === 'image' || it.poster)) || list.find(hasLocal) || list[0] || null; }
function tileEl(f, list, opts = {}) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ftile' + (opts.small ? ' small' : ''); b.dataset.go = f;
  const n = list.length, cov = opts.small ? null : coverOf(list), cv = document.createElement('div'); cv.className = 'fcover';
  if (cov) cv.appendChild(thumbEl(cov)); else cv.innerHTML = `<div class="fart" style="--h:${hashStr(f) % 360}">${folderSvg(iconOf(f))}</div>`;
  if (cov) cv.insertAdjacentHTML('beforeend', `<span class="fbadge">${folderSvg(iconOf(f))}</span>`);
  const warn = f.startsWith('lk:') && !f.includes('/', 3) && LINK.perm[f.slice(3)] !== 'granted' ? '<em>Tap to reconnect</em>' : '';
  b.appendChild(cv);
  b.insertAdjacentHTML('beforeend', `<span class="fmeta"><b>${esc(opts.label || folderName(f))}</b><small>${n.toLocaleString()} item${n === 1 ? '' : 's'}${warn ? ' · ' : ''}${warn}</small></span>`);
  return b;
}
function sectionEl(f) {
  const s = document.createElement('section'); s.className = 'fsec';
  const kids = childFolders(f).filter(k => ALWAYS_TILES.has(k) || rawFolderItems(k).length || isMy(k) || k.startsWith('col:') || k.startsWith('saved:') || k.startsWith('lk:') || k.startsWith('sh:') || SYS[k] && SYS[k].kind === 'index');
  if (f === 'shared') s.classList.add('shared');
  const more = f === 'cats' && kids.length > 8 ? kids.length : 0; if (more) kids.splice(8);
  const total = f === 'type' || f === 'smart' || f === 'idx' ? null : rawFolderItems(f).length;
  s.innerHTML = `<button class="fsec-h" data-go="${esc(f)}">${folderSvg(iconOf(f))}<span>${esc(folderName(f))}</span>${total != null ? `<small>${total.toLocaleString()}</small>` : ''}<i>›</i></button><p class="fsec-d">${esc(descOf(f))}</p>`;
  const row = document.createElement('div'); row.className = 'ftiles';
  kids.forEach(k => {
    if (SYS[k] && SYS[k].kind === 'index') { const n = k === 'idx/vault' ? (CAT.vault || []).length : ((CAT.workspace || {}).items || []).length; const t = tileEl(k, [], { small: true }); $('small', t).textContent = n + (k === 'idx/vault' ? ' folders' : ' files'); row.appendChild(t); return; }
    row.appendChild(tileEl(k, rawFolderItems(k)));
  });
  if (more) row.insertAdjacentHTML('beforeend', `<button class="ftile add" data-go="cats"><span class="fcover"><span class="fart plus">${more}</span></span><span class="fmeta"><b>All categories</b><small>The full reference ›</small></span></button>`);
  if (f === 'my') row.insertAdjacentHTML('beforeend', '<button class="ftile add" data-act="newfolder"><span class="fcover"><span class="fart plus">+</span></span><span class="fmeta"><b>New folder</b><small>Make your own shelf</small></span></button>');
  if (f === 'col' && !kids.length) row.insertAdjacentHTML('beforeend', '<div class="fhint">Open any item’s details and use <b>Create &amp; add</b>, or say “add this to keepers”.</div>');
  if (f === 'shared' && !kids.length) row.insertAdjacentHTML('beforeend', '<div class="fhint">Empty, and private until you choose otherwise. Open any item › <b>Share</b> to create your own folder here, or import a share pack someone sent you.</div>');
  s.appendChild(row); return s;
}
function folderActions(f, list) {
  const A = [];
  if (list.length && !SECTION_ONLY.has(f)) A.push(['scroll', 'Scroll', 'i-scroll'], ['play', 'Play all', 'i-playo']);
  if (canFile(f)) A.push(['addhere', 'Add files here', 'i-plus']);
  if (f === 'my' || isMy(f)) A.push(['newfolder', isMy(f) ? 'New subfolder' : 'New folder', 'i-vault']);
  if (isMy(f)) A.push(['rename', 'Rename', 'i-note'], ['delfolder', 'Delete folder', 'i-trash']);
  if (f === 'src/linked') A.push(['link', 'Link a folder', 'i-link']);
  if (f.startsWith('lk:') && !f.includes('/', 3)) { const id = f.slice(3); if (LINK.perm[id] !== 'granted') A.push(['reconnect', 'Reconnect', 'i-link']); A.push(['rescan', 'Rescan', 'i-bolt'], ['unlink', 'Unlink', 'i-close']); }
  if (f === 'src/server' || f.startsWith('sv:')) A.push(['server', SERVER.roots.length ? 'Refresh phone folders' : 'Load phone folders', 'i-server']);
  if (f === 'trash' && list.length) A.push(['restoreall', 'Restore all', 'i-play'], ['empty', 'Empty trash', 'i-trash']);
  if (f === 'archive' && list.length) A.push(['unarchiveall', 'Unarchive all', 'i-archive']);
  if (f.startsWith('saved:')) A.push(['delsaved', 'Delete saved search', 'i-trash']);
  if (f.startsWith('col:')) A.push(['delcol', 'Delete collection', 'i-trash']);
  if (f === 'shared' || f === 'sh:me') A.push(['profile', PROFILE.name ? 'Your name: ' + PROFILE.name : 'Choose your name', 'i-user'], ['pack', 'Make a share pack', 'i-archive']);
  if (f === 'shared') { A.push(['importpack', 'Import a share pack', 'i-inbox']); if (canLink()) A.push(['connect', SH.folder ? 'Sync shared folder' : 'Connect a shared folder', 'i-link']); if (SH.folder) A.push(['disconnect', 'Disconnect folder', 'i-close']); }
  if (f !== 'root' && !f.startsWith('sh:')) A.push(['start', prefs.startFolder === f ? 'Opens on launch ✓' : 'Open here on launch', 'i-pin']);
  return A;
}
function renderFolders() {
  if (!folderValid(state.folder)) state.folder = 'root';
  updateSubtitle();
  const f = state.folder, head = $('#fhead'), tiles = $('#ftiles'), grid = $('#fgrid'), path = pathOf(f);
  const parsed = parseQuery(state.q), all = folderItems(f), list = state.q ? all.filter(it => matchesQuery(it, parsed)) : all;
  head.innerHTML = (f === 'root' ? '' : `<nav class="crumbs" aria-label="Folder path">${path.map((p, i) => i < path.length - 1 ? `<button data-go="${esc(p.id)}">${esc(p.name)}</button><span aria-hidden="true">›</span>` : `<b aria-current="page">${esc(p.name)}</b>`).join('')}</nav>`) +
    `<div class="fhead">${f === 'root' ? '' : '<button class="ibtn" id="fUp" data-act="up" aria-label="Up one folder" title="Up (Backspace)"><svg><use href="#i-up"/></svg></button>'}<div class="fico" style="--h:${hashStr(f) % 360}">${folderSvg(iconOf(f))}</div>
      <div class="grow"><h2 id="fTitle">${esc(folderName(f))}</h2><p>${esc(descOf(f))}${SECTION_ONLY.has(f) ? '' : ' · ' + list.length.toLocaleString() + (state.q ? ' match' + (list.length === 1 ? '' : 'es') : ' item' + (list.length === 1 ? '' : 's'))}</p></div></div>` +
    `<div class="factions">${folderActions(f, list).map(([k, label, ic]) => `<button class="btn small" data-act="${k}">${folderSvg(ic, 'bi')}${esc(label)}</button>`).join('')}</div>`;
  tiles.innerHTML = '';
  if (f === 'root') {
    const nSh = sharedAll().length, people = sharedOwners().filter(o => o.n).length;
    tiles.insertAdjacentHTML('beforeend', `<div class="walls"><div class="wall priv">${folderSvg('i-lock')}<div><b>Private library</b><small>Only on this device. Never uploaded, indexed or searchable from anywhere else.</small></div></div>
      <button class="wall share" data-go="shared">${folderSvg('i-users')}<div><b>Shared</b><small>${nSh ? nSh + ' item' + (nSh === 1 ? '' : 's') + ' from ' + people + ' ' + (people === 1 ? 'person' : 'people') : 'Only what you choose to share. One folder per person.'}</small></div><i>›</i></button></div>`);
    tiles.insertAdjacentHTML('beforeend', locationHtml(true));
    ['type', 'cats', 'ai', 'src', 'my', 'col', 'smart', 'idx'].forEach(s => tiles.appendChild(sectionEl(s)));
    const sp = document.createElement('div'); sp.className = 'ftiles sp';
    ['archive', 'trash'].forEach(k => sp.appendChild(tileEl(k, rawFolderItems(k), { small: true }))); tiles.appendChild(sp);
    tiles.insertAdjacentHTML('beforeend', '<div class="wallline"><span>Outside your private library</span></div>');
    tiles.appendChild(sectionEl('shared'));
    bindLocation(tiles);
  } else {
    const kids = childFolders(f).filter(k => ALWAYS_TILES.has(k) || isMy(k) || k.startsWith('col:') || k.startsWith('saved:') || k.startsWith('lk:') || k.startsWith('sv:') || k.startsWith('sh:') || (SYS[k] && SYS[k].kind === 'index') || rawFolderItems(k).length);
    if (f === 'cats') {
      const st = categoryStats(), tot = st.reduce((a, d) => [a[0] + d.n, a[1] + d.online, a[2] + d.device], [0, 0, 0]);
      tiles.insertAdjacentHTML('beforeend', `<div class="reftab-wrap"><div class="refhead"><b>${st.length} categories · ${tot[0]} items · ${tot[1]} online · ${tot[2]} on this device</b><button class="btn small" id="catCopy">Copy as text</button></div>
        <table class="reftab"><thead><tr><th>Category</th><th>Items</th><th>Online</th><th>On device</th><th>Sources</th></tr></thead><tbody>${st.map(d => `<tr data-go="${esc(catId(d.name))}" tabindex="0"><td>${esc(d.name)}</td><td>${d.n}</td><td>${d.online || ''}</td><td>${d.device || ''}</td><td>${esc(Array.from(d.src.entries()).sort((a, b) => b[1] - a[1]).map(([s, n]) => s + ' ' + n).join(', '))}</td></tr>`).join('')}</tbody></table></div>`);
      $('#catCopy').onclick = async () => { const txt = 'Category\tItems\tOnline\tOn device\tSources\n' + st.map(d => [d.name, d.n, d.online, d.device, Array.from(d.src.entries()).map(([s, n]) => s + ' ' + n).join(', ')].join('\t')).join('\n'); toast((await copyText(txt)) ? 'Category reference copied (' + st.length + ' rows). Paste it into a note or a sheet.' : 'Copy failed'); };
    }
    if (f === 'shared' && !kids.length) tiles.insertAdjacentHTML('beforeend', '<div class="fhint">Nothing is shared yet, and nothing leaves your library unless you say so. Open any item › <b>Share</b> (or say “share this”) to create your folder, then <b>Make a share pack</b> to send it, or connect a shared folder that you sync yourself.</div>');
    if (kids.length) {
      const row = document.createElement('div'); row.className = 'ftiles';
      kids.forEach(k => row.appendChild(SYS[k] && SYS[k].kind === 'index' ? tileEl(k, [], { small: true }) : tileEl(k, rawFolderItems(k))));
      if (kids.some(k => k.startsWith('grp:'))) tiles.insertAdjacentHTML('beforeend', '<div class="fsub">Inside, by ' + (f === 'src/web' ? 'site' : f === 'src/device' ? 'folder' : 'category') + '</div>');
      tiles.appendChild(row);
    }
  }
  $('#ftool').classList.toggle('hidden', SECTION_ONLY.has(f)); $('#fcount').textContent = SECTION_ONLY.has(f) ? '' : list.length.toLocaleString() + (list.length === 1 ? ' item' : ' items') + (state.q ? ' match' : '');
  if (SECTION_ONLY.has(f)) { grid.innerHTML = ''; grid._list = []; return; }
  const emptyMsg = f === 'sh:me' ? 'You haven’t shared anything. Open any item › Share.' : f.startsWith('sh:') ? 'Nothing here right now.' : f === 'trash' ? 'Trash is empty.' : f === 'archive' ? 'Nothing archived.' : f === 'src/inbox' ? 'Things you share to the app or paste land here.' : f === 'src/linked' ? (canLink() ? 'Link a folder on this device: its files are read in place, never copied.' : 'This browser cannot link folders. Use “Add folder” to copy one in, or the phone server.') :
    f === 'src/server' ? 'Start the companion server with --library to see your phone folders here.' : canFile(f) ? 'Empty. Add files here, or move items in with Select › Move.' : state.q ? 'No matches in this folder.' : 'Nothing here yet.';
  fillGrid(grid, list, `<div class="empty"><b>${state.q ? 'No matches' : 'Empty folder'}</b>${esc(emptyMsg)}</div>`);
}
function bindFolders() {
  const tab = $('#tab-folders');
  tab.addEventListener('click', async e => {
    const go = e.target.closest('[data-go]');
    if (go) {
      const f = go.dataset.go;
      if (f.startsWith('lk:') && !f.includes('/', 3) && LINK.perm[f.slice(3)] !== 'granted') { await reconnectLink(f.slice(3)); }
      openFolder(f); return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return;
    folderAct(a.dataset.act);
  });
  $('#fsort').onchange = e => { prefs.sort = e.target.value; savePrefs(); $('#sort').value = prefs.sort; renderFolders(); };
}
async function folderAct(k) {
  const f = state.folder, list = state.q ? folderItems(f).filter(it => matchesQuery(it, parseQuery(state.q))) : folderItems(f);
  if (k === 'up') return openFolder(parentOf(f) || 'root');
  if (k === 'scroll') return openFeed(list, list[0] && list[0].id, folderName(f));
  if (k === 'play') { const l = list.filter(hasLocal); return l.length ? openViewer(l[0].id, l) : list.length ? openViewer(list[0].id, list) : toast('Nothing to play here'); }
  if (k === 'addhere') { ADD.home = f; return $('#filePick').click(); }
  if (k === 'newfolder') return newFolderSheet(isMy(f) ? f : 'my');
  if (k === 'rename' && isMy(f)) { const n = prompt('Rename folder', user.folders[f].name); if (n && n.trim()) { user.folders[f].name = n.trim().slice(0, 80); changed(); renderFolders(); } return; }
  if (k === 'delfolder' && isMy(f)) return deleteFolder(f);
  if (k === 'link') return linkFolder();
  if (k === 'reconnect') { await reconnectLink(f.slice(3)); return renderFolders(); }
  if (k === 'rescan') return rescanLink(f.slice(3));
  if (k === 'unlink') return unlinkFolder(f.slice(3));
  if (k === 'server') return loadServerLibrary(false);
  if (k === 'restoreall') return restoreItems(list.map(i => i.id));
  if (k === 'empty') return deleteForever(list.map(i => i.id));
  if (k === 'unarchiveall') return unarchiveItems(list.map(i => i.id));
  if (k === 'delsaved') { const s = f.slice(6); if (confirm('Delete the saved search “' + user.saved[s].name + '”?')) { delete user.saved[s]; changed(); openFolder('smart', false); } return; }
  if (k === 'delcol') { const c = f.slice(4); if (confirm('Delete the collection “' + user.collections[c].name + '”? The items themselves stay.')) { delete user.collections[c]; changed(); openFolder('col', false); } return; }
  if (k === 'profile') return profileSheet();
  if (k === 'pack') return exportSharePack();
  if (k === 'importpack') return $('#packPick').click();
  if (k === 'connect') return SH.folder ? syncSharedFolder().then(n => toast('Shared folder synced: ' + n + ' items from other people')) : connectSharedFolder();
  if (k === 'disconnect') return disconnectSharedFolder();
  if (k === 'start') { prefs.startFolder = prefs.startFolder === f ? '' : f; savePrefs(); renderFolders(); return toast(prefs.startFolder ? 'The app will open in ' + folderName(f) : 'The app will open on Home'); }
}
function newFolderSheet(parent, thenFile) {
  openSheet(`<h2>New folder</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Inside ${esc(pathOf(parent).slice(1).map(p => p.name).join(' › ') || 'My folders')}. Folders only label items; nothing is copied.</p>
    <div style="display:flex;gap:8px"><input class="input" id="nfName" maxlength="80" placeholder="e.g. Trips, Keepers, Studio refs"><button class="btn primary" id="nfGo">Create</button></div>`);
  const go = () => { const n = $('#nfName').value.trim(); if (!n) return $('#nfName').focus(); const id = createFolder(n, parent); closeSheet(); if (thenFile && thenFile.length) setHome(thenFile, id); else openFolder(id); toast('Folder “' + n + '” ready'); };
  $('#nfGo').onclick = go; $('#nfName').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => { const i = $('#nfName'); if (i) i.focus(); }, 250);
}
function deleteFolder(f) {
  const fo = user.folders[f]; if (!fo) return;
  const set = myDescendants(f), parent = fo.parent || 'my', homed = Object.keys(user.home).filter(id => set.has(user.home[id]));
  if (!confirm('Delete the folder “' + fo.name + '”' + (set.size > 1 ? ' and its ' + (set.size - 1) + ' subfolder' + (set.size > 2 ? 's' : '') : '') + '?\n\n' + homed.length + ' item' + (homed.length === 1 ? '' : 's') + ' inside go back to ' + (parent === 'my' ? 'their automatic folders' : 'the parent folder') + '. No file is deleted.')) return;
  const snapF = {}, snapH = {}; set.forEach(k => { snapF[k] = user.folders[k]; }); homed.forEach(id => { snapH[id] = user.home[id]; });
  homed.forEach(id => { if (parent !== 'my') user.home[id] = parent; else delete user.home[id]; });
  set.forEach(k => delete user.folders[k]);
  if (prefs.startFolder && set.has(prefs.startFolder)) { prefs.startFolder = ''; savePrefs(); }
  changed(); openFolder(parent === 'my' ? 'my' : parent, false);
  undoToast('Folder deleted', () => { Object.assign(user.folders, snapF); Object.assign(user.home, snapH); changed(); });
}
function fileTargets() {
  const out = [['h', 'AI']]; SYSKIDS.ai.forEach(k => out.push([k, SYS[k].name, 1]));
  out.push(['h', 'Sources']); SYSKIDS.src.filter(canFile).forEach(k => out.push([k, SYS[k].name, 1]));
  out.push(['h', 'My folders']);
  const walk = (p, d) => Object.keys(user.folders).filter(k => (user.folders[k].parent || 'my') === p).sort((a, b) => user.folders[a].name.localeCompare(user.folders[b].name)).forEach(k => { out.push([k, user.folders[k].name, d]); walk(k, d + 1); });
  walk('my', 1); return out;
}
function moveSheet(ids, after) {
  ids = ids.filter(id => byId.has(id) && !byId.get(id).shared); if (!ids.length) return toast('Shared items live in Shared. Use “Save to my library” to keep your own copy.');
  const cur = ids.length === 1 ? homeOf(byId.get(ids[0])) : '';
  openSheet(`<h2>Move ${ids.length === 1 ? 'this item' : ids.length + ' items'} to…</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.84rem">Only the folder label changes. The file itself is not moved, copied or altered.</p>
    <div class="ftree">${fileTargets().map(([k, name, d]) => k === 'h' ? `<div class="fth">${esc(name)}</div>` : `<button class="frow${k === cur ? ' cur' : ''}" data-to="${esc(k)}" style="--d:${d}">${folderSvg(iconOf(k))}<span>${esc(name)}</span>${k === cur ? '<small>here now</small>' : ''}</button>`).join('')}
      <button class="frow" data-to="" style="--d:0">${folderSvg('i-bolt')}<span>Automatic</span><small>the folder it would be filed in by default</small></button></div>
    <div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="mvNew" maxlength="80" placeholder="New folder in My folders"><button class="btn" id="mvNewGo">Create &amp; move</button></div>`);
  $$('#sheetBody [data-to]').forEach(b => b.onclick = () => { closeSheet(); setHome(ids, b.dataset.to || null); if (SEL.on) exitSelect(); if (after) after(); if (V.open) syncViewerFolder(); });
  const mk = () => { const n = $('#mvNew').value.trim(); if (!n) return $('#mvNew').focus(); const id = createFolder(n, 'my'); closeSheet(); setHome(ids, id); if (SEL.on) exitSelect(); if (V.open) syncViewerFolder(); };
  $('#mvNewGo').onclick = mk; $('#mvNew').onkeydown = e => { if (e.key === 'Enter') mk(); };
}
function syncViewerFolder() { const b = $('#vFolder'); if (b && V.item) b.title = 'Folder: ' + pathOf(homeOf(V.item)).slice(1).map(p => p.name).join(' › '); }
function collectionSheet(ids) {
  const cols = Object.entries(user.collections || {}).sort((a, b) => a[1].created - b[1].created);
  openSheet(`<h2>Add ${ids.length === 1 ? 'this item' : ids.length + ' items'} to a collection</h2><div class="taglist" style="margin-top:10px">${cols.map(([cid, c]) => `<button class="tag" data-col="${esc(cid)}">+ ${esc(c.name)}</button>`).join('') || '<span style="color:var(--muted);font-size:.84rem">No collections yet</span>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="csNew" maxlength="60" placeholder="New collection"><button class="btn" id="csGo">Create &amp; add</button></div>`);
  const add = cid => { const c = user.collections[cid]; let n = 0; ids.forEach(id => { if (!c.ids.includes(id)) { c.ids.push(id); n++; } }); changed(); closeSheet(); if (SEL.on) exitSelect(); refreshViews(); toast('Added ' + n + ' to ' + c.name); };
  $$('#sheetBody [data-col]').forEach(b => b.onclick = () => add(b.dataset.col));
  const mk = () => { const n = $('#csNew').value.trim(); if (!n) return $('#csNew').focus(); add(createCollection(n)); };
  $('#csGo').onclick = mk; $('#csNew').onkeydown = e => { if (e.key === 'Enter') mk(); };
}
function tagSheet(ids) {
  openSheet(`<h2>Tag ${ids.length} item${ids.length === 1 ? '' : 's'}</h2><div style="display:flex;gap:8px;margin-top:10px"><input class="input" id="tgIn" placeholder="tags, comma separated" autocapitalize="off"><button class="btn primary" id="tgGo">Add tags</button></div>`);
  const go = () => { const v = $('#tgIn').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean); if (!v.length) return; ids.forEach(id => { user.tags[id] = Array.from(new Set((user.tags[id] || []).concat(v))); invalidateHay(id); }); changed(); closeSheet(); if (SEL.on) exitSelect(); refreshViews(); toast('Tagged ' + ids.length); };
  $('#tgGo').onclick = go; $('#tgIn').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => { const i = $('#tgIn'); if (i) i.focus(); }, 250);
}

/* ---------- select mode ---------- */
const SEL = { on: false, ids: new Set() };
function startSelect(first) { SEL.on = true; SEL.ids.clear(); if (first) SEL.ids.add(first); document.body.classList.add('selecting'); $$('.card').forEach(c => c.classList.toggle('sel', SEL.ids.has(c.dataset.id))); renderSelBar(); }
function exitSelect() { SEL.on = false; SEL.ids.clear(); document.body.classList.remove('selecting'); $$('.card.sel').forEach(c => c.classList.remove('sel')); renderSelBar(); }
function toggleSel(id, card) { if (SEL.ids.has(id)) SEL.ids.delete(id); else SEL.ids.add(id); if (card) card.classList.toggle('sel', SEL.ids.has(id)); renderSelBar(); }
function currentGridList() { const g = state.tab === 'folders' ? $('#fgrid') : $('#grid'); return (g && g._list) || []; }
function renderSelBar() {
  const bar = $('#selbar'); bar.classList.toggle('on', SEL.on); if (!SEL.on) { bar.innerHTML = ''; return; }
  const ids = Array.from(SEL.ids), n = ids.length, inTrash = state.tab === 'folders' && state.folder === 'trash', inArc = state.tab === 'folders' && state.folder === 'archive';
  const inShared = state.tab === 'folders' && (state.folder === 'shared' || state.folder.startsWith('sh:'));
  const allFav = n && ids.every(isFav);
  bar.innerHTML = `<b>${n} selected</b><div class="selacts">` + (inShared ? `${state.folder === 'sh:me' ? '' : '<button data-s="keep">Save to my library</button>'}<button data-s="unshare" class="danger">Remove from Shared</button>` : inTrash ? `<button data-s="restore">Restore</button><button data-s="forever" class="danger">Delete for good</button>` :
    `<button data-s="move">Move…</button><button data-s="share">Share</button><button data-s="col">Collection…</button><button data-s="fav">${allFav ? '☆ Unstar' : '★ Star'}</button><button data-s="tag">Tag…</button>${inArc ? '<button data-s="unarchive">Unarchive</button>' : '<button data-s="archive">Archive</button>'}<button data-s="trash" class="danger">Trash</button>`) +
    `<button data-s="all">All</button><button data-s="done" class="done">Done</button></div>`;
  $$('[data-s]', bar).forEach(b => b.onclick = () => selAct(b.dataset.s));
}
function selAct(k) {
  const ids = Array.from(SEL.ids);
  if (k === 'done') return exitSelect();
  if (k === 'all') { currentGridList().forEach(it => SEL.ids.add(it.id)); $$('.card').forEach(c => c.classList.toggle('sel', SEL.ids.has(c.dataset.id))); return renderSelBar(); }
  if (!ids.length) return toast('Tap items to select them first');
  if (k === 'move') return moveSheet(ids);
  if (k === 'col') return collectionSheet(ids);
  if (k === 'tag') return tagSheet(ids);
  if (k === 'fav') { const on = !ids.every(isFav); ids.forEach(id => { if (on) user.fav[id] = user.fav[id] || Date.now(); else delete user.fav[id]; }); saveUser(); exitSelect(); refreshViews(); return toast((on ? 'Starred ' : 'Unstarred ') + ids.length); }
  if (k === 'archive') return archiveItems(ids);
  if (k === 'unarchive') return unarchiveItems(ids);
  if (k === 'trash') return trashItems(ids);
  if (k === 'restore') return restoreItems(ids);
  if (k === 'forever') return deleteForever(ids);
  if (k === 'share') return shareItems(ids);
  if (k === 'unshare') return removeShared(ids);
  if (k === 'keep') { exitSelect(); return saveSharedToLibrary(ids); }
}

/* ---------- where your library lives (with a link you can click, copy or pin) ---------- */
const appBase = () => location.href.split(/[?#]/)[0];
function locationHtml(compact) {
  const link = appBase() + '?tab=folders', all = everything(), emb = Object.keys(EMB).length;
  const parts = [[catalogItems.filter(i => i.local).length, 'originals inside the app' + (emb ? ' file' : ' folder')], [imported.length, 'files you added (stored in the app)'], [linkedItems.length, 'in ' + LINK.roots.length + ' linked folder' + (LINK.roots.length === 1 ? '' : 's')], [serverItems.length, 'in phone folders'], [all.filter(i => !hasLocal(i) && i.link).length, 'online links']].filter(p => p[0]);
  const cloud = ((CAT.meta && CAT.meta.cloud) || []).filter(c => /^https:\/\//.test(c.url));
  return `<div class="loccard${compact ? ' compact' : ''}"><div class="lochead">${folderSvg('i-pin')}<div class="grow"><b>Your library</b><small>${all.length.toLocaleString()} items · ${parts.map(p => p[0].toLocaleString() + ' ' + p[1]).join(' · ')}</small></div></div>
    <a class="loclink mono" href="${esc(link)}" id="locLink">${esc(link)}</a>
    <div class="row"><button class="btn small" data-loc="copy">Copy link</button><a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Open in a new tab</a><button class="btn small" data-loc="where">Where are my files?</button>${compact ? '' : '<button class="btn small" data-loc="export">Export to a real folder…</button>'}</div>
    ${cloud.length ? `<div class="loccloud"><span>Cloud folders</span>${cloud.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${folderSvg('i-cloud')}${esc(c.name)}</a>`).join('')}</div>` : ''}</div>`;
}
function bindLocation(root) {
  $$('[data-loc]', root).forEach(b => b.onclick = async () => {
    const k = b.dataset.loc;
    if (k === 'copy') toast((await copyText(appBase() + '?tab=folders')) ? 'Library link copied. Paste it in your browser, a note or a home-screen shortcut.' : 'Copy failed');
    else if (k === 'where') whereSheet();
    else if (k === 'export') masterSheet();
  });
}
async function whereSheet() {
  let est = null; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { }
  const emb = Object.keys(EMB).length, rows = [
    ['The app', esc(appBase())],
    ['Bundled originals', emb ? emb + ' files inside this single app file, decoded only when shown' : catalogItems.filter(i => i.local).length + ' files in the <code>media/</code> folder next to the app'],
    ['Files you added', imported.length + ' files, byte-for-byte, in this browser’s private app storage (IndexedDB)' + (est ? ' · ' + fmtBytes(est.usage) + ' used of ' + fmtBytes(est.quota) : '')],
    ['Linked folders', LINK.roots.length ? LINK.roots.map(r => esc(r.name) + ' (' + (r.n || 0) + ')').join(', ') + ' · read in place on this device' : 'none yet'],
    ['Phone folders', SERVER.roots.length ? SERVER.roots.map(r => esc(r.name)).join(', ') + ' · streamed by the companion server' : 'not connected'],
    ['Online items', everything().filter(i => !hasLocal(i) && i.link).length + ' links (Drive and other sites); nothing is downloaded'],
    ['Your edits', 'favourites, folders, notes, tags, collections and progress: this app only, in Tools › Backup']
  ];
  openSheet('<h2>Where your files are</h2>' + receiptRows(rows) + '<p style="color:var(--muted);font-size:.84rem;margin-top:10px">Want a real folder you can see in your file manager? <b>Export to a real folder</b> writes a Media Hub Library folder with AI, Sources, Photos, Videos and your own folders inside, byte-for-byte.</p><div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn primary" id="whExport">Export to a real folder…</button><button class="btn" id="whCopy">Copy library link</button></div>');
  $('#whExport').onclick = masterSheet; $('#whCopy').onclick = async () => toast((await copyText(appBase() + '?tab=folders')) ? 'Library link copied' : 'Copy failed');
}

/* ---------- linked folders: File System Access, read only, files stay where they are ---------- */
const LINK = { roots: [], handles: new Map(), perm: {} };
const canLink = () => 'showDirectoryPicker' in window;
const AUD_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'weba', 'amr']);
const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg', avi: 'video/x-msvideo', '3gp': 'video/3gpp', ts: 'video/mp2t',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm', amr: 'audio/amr' };
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
function kindOfName(n) { const e = extOf(n); return IMG_EXT.has(e) ? 'image' : VID_EXT.has(e) ? 'video' : AUD_EXT.has(e) ? 'audio' : ''; }
const saveLinks = () => dbPut('kv', 'links', LINK.roots.map(r => ({ id: r.id, name: r.name, seq: r.seq, added: r.added, n: r.n || 0, scanned: r.scanned || 0 })));
async function permOf(h, ask) { try { const o = { mode: 'read' }; let p = await h.queryPermission(o); if (p !== 'granted' && ask) p = await h.requestPermission(o); return p; } catch (e) { return 'error'; } }
function buildEntries(prefix, root, files, mk) {        // stable ids from the path; a rare hash clash gets a suffix
  const seen = new Set(); return files.map(f => { const h = hashStr(root + '/' + f.p).toString(36); let id = prefix + h, k = 2; while (seen.has(id)) id = prefix + h + '-' + k++; seen.add(id); return mk(f, id, h); });
}
function makeLinkedAll(r, files) {
  return buildEntries('lk-' + r.id + '-', r.id, files, (f, id, h) => {
    const i = f.p.lastIndexOf('/'), dir = i < 0 ? '' : f.p.slice(0, i), name = f.p.slice(i + 1);
    const it = normItem({ id, code: 'F' + r.seq + '-' + h.toUpperCase(), title: name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '), kind: f.k, mime: f.m || EXT_MIME[extOf(name)] || '', bytes: f.s, added: f.t || r.added, name, dir, path: f.p,
      category: dir ? dir.split('/').pop() : r.name, source: 'Linked folder', tags: dir ? dir.split('/').map(x => x.toLowerCase()).slice(0, 6) : [], linked: true, linkRoot: r.id });
    const so = sharedOwnerOfPath(f.p, r.name); return so ? markShared(it, so) : it;
  });
}
function makeLinkedItems(r, files) { return splitShared(makeLinkedAll(r, files), 'lk:' + r.id); }
async function loadLinks() {
  const roots = await dbGet('kv', 'links'); LINK.roots = Array.isArray(roots) ? roots.filter(r => r && r.id && r.name) : [];
  const items = [];
  for (const r of LINK.roots) {
    const h = await dbGet('kv', 'linkh:' + r.id); if (h) LINK.handles.set(r.id, h);
    LINK.perm[r.id] = h ? await permOf(h, false) : 'missing';
    const idx = await dbGet('kv', 'linkidx:' + r.id); if (Array.isArray(idx)) items.push(...makeLinkedItems(r, idx));
  }
  linkedItems = items;
}
async function scanDir(h, onProgress) {
  const files = [], MAX = 50000;
  async function walk(dir, pre, depth) {
    if (depth > 16 || files.length >= MAX) return;
    for await (const [name, ch] of dir.entries()) {
      if (name.startsWith('.') || files.length >= MAX) continue;
      if (ch.kind === 'directory') await walk(ch, pre + name + '/', depth + 1);
      else { const k = kindOfName(name); if (!k) continue; try { const f = await ch.getFile(); files.push({ p: pre + name, s: f.size, t: f.lastModified, k, m: f.type || EXT_MIME[extOf(name)] || '' }); } catch (e) { } if (onProgress && files.length % 200 === 0) onProgress(files.length); }
    }
  }
  await walk(h, '', 0);
  return files.sort((a, b) => a.p.localeCompare(b.p));
}
async function indexLink(r, h) {
  busy('Reading “' + r.name + '”…');
  const files = await scanDir(h, n => busy('Reading “' + r.name + '”… ' + n.toLocaleString() + ' files'));
  r.n = files.length; r.scanned = Date.now(); await dbPut('kv', 'linkidx:' + r.id, files); await saveLinks();
  linkedItems = linkedItems.filter(x => x.linkRoot !== r.id).concat(makeLinkedItems(r, files)); reindex();
  $('#toast').classList.remove('on'); return files;
}
async function linkFolder(home) {
  if (!canLink()) { toast('This browser cannot link folders in place, so the folder will be copied in instead (byte-for-byte).'); ADD.home = home || ADD.home; $('#folderPick').click(); return; }
  let h; try { h = await window.showDirectoryPicker({ id: 'mh-link', mode: 'read' }); } catch (e) { if (e && e.name !== 'AbortError') toast('Could not open that folder: ' + e.message); return; }
  return attachLink(h);
}
async function attachLink(h) {
  for (const r of LINK.roots) { const o = LINK.handles.get(r.id); try { if (o && o.isSameEntry && await o.isSameEntry(h)) { toast('“' + r.name + '” is already linked. Rescanning.'); return rescanLink(r.id); } } catch (e) { } }
  const seq = LINK.roots.reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1;
  const r = { id: 'r' + Date.now().toString(36), name: h.name || 'Folder', seq, added: Date.now(), n: 0 };
  LINK.roots.push(r); LINK.handles.set(r.id, h); LINK.perm[r.id] = 'granted';
  await dbPut('kv', 'linkh:' + r.id, h);
  const files = await indexLink(r, h);
  refreshViews();
  openSheet('<h2>Linked “' + esc(r.name) + '”</h2>' + receiptRows([
    ['Source used', esc(r.name) + ' on this device (' + files.length.toLocaleString() + ' photos, videos and audio files found)'],
    ['Original untouched?', '<span class="ok">Yes.</span> Read-only access. Nothing was copied, moved or changed.'],
    ['Anything processed?', 'No. Only names, sizes and dates were read.'],
    ['Archived?', 'No copy is made. The files stay in the folder and open from there.'],
    ['Reusable later?', 'Yes. The link is remembered; after a restart the browser may ask once to allow access again.']]) +
    '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="lkOpen">Open it</button><button class="btn" id="lkScroll">Scroll through it</button></div>');
  $('#lkOpen').onclick = () => { closeSheet(); openFolder('lk:' + r.id); };
  $('#lkScroll').onclick = () => { closeSheet(); const l = folderItems('lk:' + r.id); if (l.length) openFeed(l, l[0].id, r.name); };
  return r;
}
async function reconnectLink(id) {
  const h = LINK.handles.get(id); if (!h) { toast('That folder needs to be linked again'); return false; }
  LINK.perm[id] = await permOf(h, true);
  if (LINK.perm[id] === 'granted') { toast('Reconnected'); return true; }
  toast('Access was not allowed. Tap the folder again to retry.'); return false;
}
async function rescanLink(id) {
  const r = linkRootOf(id), h = LINK.handles.get(id); if (!r || !h) return toast('Link the folder again');
  if (LINK.perm[id] !== 'granted' && !(await reconnectLink(id))) return;
  const before = linkedItems.filter(x => x.linkRoot === id).length, files = await indexLink(r, h);
  refreshViews(); toast('Rescanned “' + r.name + '”: ' + files.length.toLocaleString() + ' files (' + (files.length - before >= 0 ? '+' : '') + (files.length - before) + ')');
}
async function unlinkFolder(id) {
  const r = linkRootOf(id); if (!r) return;
  if (!confirm('Unlink “' + r.name + '”? The folder and its files stay exactly where they are; they just stop showing here.')) return;
  LINK.roots = LINK.roots.filter(x => x.id !== id); LINK.handles.delete(id); delete LINK.perm[id];
  await dbDel('kv', 'linkh:' + id); await dbDel('kv', 'linkidx:' + id); await saveLinks();
  linkedItems = linkedItems.filter(x => x.linkRoot !== id); delete SH.views['lk:' + id]; reindex(); openFolder('src/linked', false); toast('Unlinked. Nothing was deleted.');
}
async function linkedFile(it) {
  const h = LINK.handles.get(it.linkRoot); if (!h) return null;
  if (LINK.perm[it.linkRoot] !== 'granted') { LINK.perm[it.linkRoot] = await permOf(h, true); if (LINK.perm[it.linkRoot] !== 'granted') return null; }
  try { const parts = it.path.split('/'), name = parts.pop(); let d = h; for (const p of parts) d = await d.getDirectoryHandle(p); return await (await d.getFileHandle(name)).getFile(); } catch (e) { return null; }
}

/* ---------- phone folders over the companion server (media_serve.py --library DIR) ---------- */
const SERVER = { roots: [], state: 'idle' };
async function loadServerLibrary(quiet) {
  if (!/^https?:$/.test(location.protocol)) { if (!quiet) toast('Open the app through the companion server (tools/media_serve.py --library …) to see phone folders.'); return false; }
  try {
    const r = await fetch('library/index.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) { SERVER.state = 'off'; if (!quiet) toast(r.status === 404 ? 'The server is not sharing any folders. Start it with --library DIR.' : 'The server answered ' + r.status); return false; }
    const j = await r.json(); if (!j || !Array.isArray(j.files) || !Array.isArray(j.roots)) throw new Error('unexpected answer');
    if (!j.roots.length) { SERVER.state = 'off'; SERVER.roots = []; if (serverItems.length) { serverItems = []; reindex(); refreshViews(); } if (!quiet) toast('The companion server is not sharing any folders yet. Start it with --library DIR (the Termux script does this for you).'); return false; }
    const roots = j.roots.filter(x => x && typeof x.name === 'string').map(x => ({ name: x.name.slice(0, 120), n: +x.files || 0 }));
    const files = j.files.slice(0, 100000).filter(f => f && typeof f.r === 'string' && typeof f.p === 'string' && /^(image|video|audio)$/.test(f.k) && !f.p.split('/').some(s => s === '..' || s.startsWith('.')));
    const byRoot = {}; files.forEach(f => (byRoot[f.r] = byRoot[f.r] || []).push(f));
    serverItems = [];
    roots.forEach(rt => serverItems.push(...buildEntries('sv-', rt.name, byRoot[rt.name] || [], (f, id, h) => {
      const i = f.p.lastIndexOf('/'), dir = i < 0 ? '' : f.p.slice(0, i), name = f.p.slice(i + 1);
      const it = normItem({ id, code: 'S-' + h.toUpperCase(), title: name.replace(/\.[^.]+$/, '').replace(/_+/g, ' '), kind: f.k, mime: String(f.m || EXT_MIME[extOf(name)] || ''), bytes: +f.s || 0, added: (+f.t || 0) * 1000, name, dir, path: f.p,
        category: dir ? dir.split('/').pop() : rt.name, source: 'Phone folder', tags: dir ? dir.split('/').map(x => x.toLowerCase()).slice(0, 6) : [], server: true, serverRoot: rt.name,
        url: 'library/' + encodeURIComponent(rt.name) + '/' + f.p.split('/').map(encodeURIComponent).join('/') });
      const so = sharedOwnerOfPath(f.p, rt.name); return so ? markShared(it, so) : it;
    })));
    serverItems = splitShared(serverItems, 'sv');
    SERVER.roots = roots; SERVER.state = 'on'; reindex(); refreshViews();
    if (!quiet) toast('Phone folders: ' + serverItems.length.toLocaleString() + ' files in ' + roots.length + ' folder' + (roots.length === 1 ? '' : 's') + (j.truncated ? ' (first 50,000 shown)' : ''));
    return true;
  } catch (e) { SERVER.state = 'error'; if (!quiet) toast('Could not read the phone folders: ' + e.message); return false; }
}

/* ---------- a real Master folder on disk: export (byte-for-byte) or an empty skeleton ---------- */
const MASTER = 'Media Hub Library';
const MASTER_TREE = ['Inbox', 'Photos', 'Videos', 'GIFs', 'Audio', 'AI/Generated', 'AI/Edited & enhanced', 'AI/Sourced', 'AI/Provided', 'AI/Prompts & references', 'Sources/This device', 'Sources/Gallery originals', 'Sources/Google Drive', 'Sources/Web saves', 'Sources/Camera', 'Sources/Screenshots', 'Sources/Downloads', 'Sources/Shared to me', 'My folders', 'Collections'];
const safeName = s => String(s || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 110) || 'item';
function masterDirFor(it) {
  const h = homeOf(it);
  if (h.startsWith('ai/')) return 'AI/' + SYS[h].name;
  if (isMy(h)) return 'My folders/' + pathOf(h).slice(2).map(p => safeName(p.name)).join('/');
  if (h === 'src/inbox') return 'Inbox';
  const type = it.kind === 'audio' ? 'Audio' : isGif(it) ? 'GIFs' : it.kind === 'image' ? 'Photos' : 'Videos';
  if (h === 'src/device') return type + (it.folder ? '/' + it.folder.split('/').map(safeName).join('/') : '');
  if (h === 'src/gallery') return 'Sources/Gallery originals';
  if (h === 'src/drive') return 'Sources/Google Drive';
  return 'Sources/' + safeName(SYS[h] ? SYS[h].name : 'Other');
}
function masterFileName(it) { const ext = extOf(it.name || it.local || '') || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' }[it.mime] || 'bin'); return safeName(it.code + ' - ' + it.title) + '.' + ext; }
const MASTER_README = 'Media Hub Library\n=================\nMade by Media Hub. Every file here is a byte-for-byte copy of an original; nothing was converted, resized or recompressed.\n\nAI/          anything an AI made (Generated), changed (Edited & enhanced), found (Sourced) or handed over (Provided), plus Prompts & references\nInbox/       things waiting to be filed\nPhotos, Videos, GIFs, Audio/   your own files by type\nSources/     where things came from: Gallery originals, Google Drive, Camera, Screenshots, Downloads, Shared to me\nMy folders/  the folders you made in the app\n\nTip: link this folder back in Media Hub (Folders › Sources › Linked folders) or share it with tools/media_serve.py --library.\nFiles you drop into AI/Generated, AI/Sourced and so on are filed into the matching AI folder automatically.\nindex.csv lists every item with its folder, file name, SHA-256 and link.\n';
function masterPlan(scope) {
  const pool = scope === 'all' ? shown() : scope.filter(Boolean);
  const files = [], rows = [], used = new Set();
  pool.forEach(it => {
    const dir = masterDirFor(it), byteable = (it.local || it.imported) && !it.server && !it.linked;
    let file = '';
    if (byteable) { file = dir + '/' + masterFileName(it); let k = 2; while (used.has(file.toLowerCase())) file = dir + '/' + masterFileName(it).replace(/(\.[^.]+)$/, ' (' + k++ + ')$1'); used.add(file.toLowerCase()); files.push({ it, file }); }
    rows.push([it.code, it.title, it.kind, pathOf(homeOf(it)).slice(1).map(p => p.name).join(' / '), file, it.sha256 || '', it.link || '', it.linked ? 'linked folder (already on disk)' : it.server ? 'phone folder (already on disk)' : '']);
  });
  const csv = '﻿' + [['code', 'title', 'kind', 'folder', 'file', 'sha256', 'link', 'note']].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
  return { files, csv, rows };
}
function masterSheet(scopeIds) {
  const plan = masterPlan(scopeIds || 'all'), bytes = plan.files.reduce((s, f) => s + (f.it.bytes || 0), 0);
  openSheet(`<h2>Export to a real folder</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.86rem">Creates <b>${MASTER}</b> with AI, Inbox, Photos, Videos, GIFs, Audio, Sources and your own folders inside, then writes each file byte-for-byte into the folder it lives in here. Your originals are only read.</p>
    <dl class="kv"><dt>Files to write</dt><dd>${plan.files.length.toLocaleString()} · ${fmtBytes(bytes)}</dd><dt>Listed only</dt><dd>${(plan.rows.length - plan.files.length).toLocaleString()} links, linked and phone files (already on disk or online), in index.csv</dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${canLink() ? '<button class="btn primary" id="msFolder">Choose where to create it…</button>' : ''}<button class="btn${canLink() ? '' : ' primary'}" id="msZip">Download as .zip</button><button class="btn" id="msSkel">Empty folder structure only</button></div>
    <p style="color:var(--muted);font-size:.78rem;margin-top:10px">${canLink() ? 'Choose a place such as Documents or your phone’s storage. Existing identical files are skipped, nothing is overwritten.' : 'This browser cannot write folders directly, so you get the same structure as a .zip to unzip anywhere.'} Zips above about 1.5 GB are refused; use the folder option or export a selection.</p>`);
  const f = $('#msFolder'); if (f) f.onclick = () => exportMasterToFolder(plan);
  $('#msZip').onclick = () => exportMasterZip(plan);
  $('#msSkel').onclick = () => canLink() ? exportMasterToFolder({ files: [], csv: plan.csv, rows: plan.rows, skeleton: true }) : exportMasterZip({ files: [], csv: plan.csv, rows: plan.rows, skeleton: true });
}
async function dirPath(root, rel) { let d = root; for (const p of rel.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true }); return d; }
async function writeText(dir, name, text) { const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(new Blob([text], { type: 'text/plain' })); await w.close(); }
async function blobFor(it) { if (it.imported) { const rec = it.session ? it._file : await dbGet('files', it.id); return rec && (rec.blob || rec); } if (it.local) { const b = embBlob(it.local); if (b) return b; const r = await fetch(it.local, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.blob(); } return null; }
async function exportMasterToFolder(plan) {
  let parent; try { parent = await window.showDirectoryPicker({ id: 'mh-export', mode: 'readwrite' }); } catch (e) { if (e && e.name !== 'AbortError') toast('Could not open that place: ' + e.message); return; }
  closeSheet();
  const root = parent.name === MASTER ? parent : await parent.getDirectoryHandle(MASTER, { create: true });
  for (const d of MASTER_TREE) await dirPath(root, d);
  await writeText(root, 'README.txt', MASTER_README); await writeText(root, 'index.csv', plan.csv);
  const rep = { wrote: 0, same: 0, verified: 0, failed: [] };
  for (let i = 0; i < plan.files.length; i++) {
    const { it, file } = plan.files[i]; busy('Writing ' + (i + 1) + ' of ' + plan.files.length + '…');
    try {
      const dir = await dirPath(root, file.slice(0, file.lastIndexOf('/'))), name = file.slice(file.lastIndexOf('/') + 1);
      let exists = null; try { exists = await (await dir.getFileHandle(name)).getFile(); } catch (e) { }
      const blob = await blobFor(it); if (!blob) throw new Error('not readable here');
      if (exists && exists.size === blob.size) { rep.same++; continue; }
      const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close(); rep.wrote++;
      if (it.sha256 && blob.size <= HASH_MAX) { const back = await (await fh.getFile()).arrayBuffer(); if (await sha256Hex(back) === it.sha256) rep.verified++; else rep.failed.push(it.code + ' (hash differs after writing)'); }
    } catch (e) { rep.failed.push(it.code + ' (' + e.message + ')'); }
  }
  $('#toast').classList.remove('on');
  exportReceipt(rep, plan, (parent.name === MASTER ? '' : parent.name + ' › ') + MASTER);
}
async function exportMasterZip(plan) {
  const bytes = plan.files.reduce((s, f) => s + (f.it.bytes || 0), 0);
  if (bytes > 1.5 * 1024 * 1024 * 1024) return toast('That is ' + fmtBytes(bytes) + ', too big for one zip here. Use “Choose where to create it”, or select fewer items.');
  closeSheet();
  const enc = new TextEncoder(), out = MASTER_TREE.map(d => ({ name: MASTER + '/' + d + '/', data: new Uint8Array(0), dir: true }));
  out.push({ name: MASTER + '/README.txt', data: enc.encode(MASTER_README) }, { name: MASTER + '/index.csv', data: enc.encode(plan.csv) });
  const seenDirs = new Set(MASTER_TREE), rep = { wrote: 0, same: 0, verified: 0, failed: [] };
  for (let i = 0; i < plan.files.length; i++) {
    const { it, file } = plan.files[i]; busy('Packing ' + (i + 1) + ' of ' + plan.files.length + '…');
    try {
      const dir = file.slice(0, file.lastIndexOf('/')); if (!seenDirs.has(dir)) { seenDirs.add(dir); out.push({ name: MASTER + '/' + dir + '/', data: new Uint8Array(0), dir: true }); }
      const b = await blobFor(it); if (!b) throw new Error('not readable here'); const u8 = new Uint8Array(await b.arrayBuffer());
      if (it.sha256 && u8.length <= HASH_MAX) { if (await sha256Hex(u8) === it.sha256) rep.verified++; else rep.failed.push(it.code + ' (hash differs)'); }
      out.push({ name: MASTER + '/' + file, data: u8 }); rep.wrote++;
    } catch (e) { rep.failed.push(it.code + ' (' + e.message + ')'); }
  }
  $('#toast').classList.remove('on');
  download(MASTER.replace(/ /g, '-') + '-' + today() + '.zip', makeZip(out));
  exportReceipt(rep, plan, 'the .zip you just saved');
}
function exportReceipt(rep, plan, where) {
  openSheet('<h2>' + (plan.skeleton ? 'Folder structure ready' : 'Exported ' + rep.wrote + ' file' + (rep.wrote === 1 ? '' : 's')) + '</h2>' + receiptRows([
    ['Source used', plan.skeleton ? 'none: empty folders, README and index.csv only' : 'files inside this app (bundled originals and files you added)'],
    ['Original untouched?', '<span class="ok">Yes.</span> Only read.'],
    ['Anything processed?', 'No. Byte-for-byte copies' + (rep.verified ? '; ' + rep.verified + ' re-hashed and identical' : '') + '.'],
    ['Archived?', 'Yes, in ' + esc(where) + (rep.same ? ' (' + rep.same + ' identical file' + (rep.same === 1 ? '' : 's') + ' already there, skipped)' : '')],
    ['Reusable later?', 'Yes. Link that folder back here or serve it with media_serve.py --library; index.csv lists every item.']].concat(rep.failed.length ? [['Not written', '<span class="warn">' + rep.failed.slice(0, 8).map(esc).join(', ') + (rep.failed.length > 8 ? '…' : '') + '</span>']] : [])));
}

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
