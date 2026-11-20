/* ===================== SCROLL: a full-screen vertical feed · snap · autoplay the one in view · double-tap to star ===================== */
const FEED = { open: false, list: [], idx: -1, title: '', obs: null, timer: 0, seenT: 0, hist: false, tapT: 0, lastTap: 0 };
const FEED_MAX = 5000;
function openFeed(list, startId, title) {
  list = (list || []).filter(it => it && isShown(it)).slice(0, FEED_MAX);
  if (!list.length) return toast('Nothing to scroll here yet');
  if (V.open) closeViewer();
  closeSheet(); if (PAL.open) closePalette();
  FEED.title = title || 'Scroll'; FEED.open = true;
  $('#feed').classList.add('open'); document.body.classList.add('feeding'); document.body.style.overflow = 'hidden'; modalIn($('#feed'));
  if (!FEED.hist) { FEED.hist = true; afterNav(() => { try { history.pushState({ mh: 'feed' }, ''); } catch (e) { } }); }
  feedRender(list, Math.max(0, list.findIndex(x => x.id === startId)));
}
function feedRender(list, start) {
  const sc = $('#fscroll'); if (FEED.obs) FEED.obs.disconnect();
  $$('video', sc).forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { } });
  FEED.list = list; FEED.idx = -1; sc.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach((it, i) => { const s = document.createElement('div'); s.className = 'fslide'; s.dataset.i = i; s.setAttribute('role', 'group'); s.setAttribute('aria-label', (i + 1) + ' of ' + list.length + ': ' + it.title); frag.appendChild(s); });
  sc.appendChild(frag); syncFeedBar();
  FEED.obs = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting && e.intersectionRatio >= 0.6) feedFocus(+e.target.dataset.i); }); }, { root: sc, threshold: [0.6] });
  Array.from(sc.children).forEach(s => FEED.obs.observe(s));
  sc.scrollTop = start * sc.clientHeight; feedFocus(start);
}
function closeFeed(fromPop) {
  if (!FEED.open) return;
  clearTimeout(FEED.timer); clearTimeout(FEED.seenT); if (FEED.obs) FEED.obs.disconnect();
  const sc = $('#fscroll'); $$('video', sc).forEach(v => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { } }); sc.innerHTML = '';
  FEED.open = false; FEED.list = []; FEED.idx = -1; releaseWake();
  $('#feed').classList.remove('open'); document.body.classList.remove('feeding'); document.body.style.overflow = ''; modalOut($('#feed'));
  if (FEED.hist && !fromPop) { FEED.hist = false; navBack(); } else FEED.hist = false;
  renderRails(); updateSubtitle(); if (state.tab === 'library') renderChips();
}
window.addEventListener('popstate', e => { if (NAV.self) return; if (FEED.open && !V.open && !(e.state && e.state.mh === 'feed')) { FEED.hist = false; closeFeed(true); } });
const feedItem = () => FEED.list[FEED.idx];
const feedVid = () => { const s = $('#fscroll').children[FEED.idx]; return s && s._vid; };
function syncFeedBar() {
  $('#feedTitle').textContent = FEED.title; $('#feedPos').textContent = FEED.list.length ? (FEED.idx + 1) + ' / ' + FEED.list.length : '';
  const a = $('#feedAuto'), m = $('#feedSound'); a.setAttribute('aria-pressed', !!prefs.feedAuto); m.setAttribute('aria-pressed', !!prefs.feedSound);
  m.innerHTML = `<svg><use href="#${prefs.feedSound ? 'i-vol' : 'i-mute'}"/></svg>`; m.setAttribute('aria-label', prefs.feedSound ? 'Sound on' : 'Sound off');
}
function feedFocus(i) {
  if (i === FEED.idx || i < 0 || i >= FEED.list.length) return;
  FEED.idx = i; clearTimeout(FEED.timer); clearTimeout(FEED.seenT);
  const slides = $('#fscroll').children;
  for (let k = 0; k < slides.length; k++) {
    const d = Math.abs(k - i), s = slides[k];
    if (d <= 2 && !s._built) buildSlide(s, FEED.list[k]);
    else if (d > 4 && s._built) unbuildSlide(s);
    if (s._vid && k !== i) { try { s._vid.pause(); } catch (e) { } }
  }
  const it = FEED.list[i], s = slides[i];
  if (s && s._vid) feedPlay(s._vid);
  else if (it && prefs.feedAuto && (it.kind === 'image' || !hasLocal(it))) FEED.timer = setTimeout(() => feedGo(1), it.kind === 'image' ? 5000 : 7000);
  FEED.seenT = setTimeout(() => { if (FEED.open && feedItem() === it) touchSeen(it.id); }, 900);
  syncFeedBar();
}
function feedPlay(v) {
  v.muted = !prefs.feedSound; v.loop = !prefs.feedAuto;
  const p = v.play(); if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; v.play().catch(() => { }); toast('Tap the speaker for sound'); } });
  requestWake();
}
function feedGo(d) {
  const sc = $('#fscroll'), n = clamp(FEED.idx + d, 0, FEED.list.length - 1);
  if (n === FEED.idx) { if (d > 0) toast('That’s everything here'); return; }
  sc.scrollTo({ top: n * sc.clientHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => { if (FEED.idx !== n && FEED.open) feedFocus(n); }, 650);      // in case the observer is slow (background tab, reduced motion)
}
function unbuildSlide(s) { if (s._vid) { try { s._vid.pause(); s._vid.removeAttribute('src'); s._vid.load(); } catch (e) { } } s._vid = null; s._built = false; s.innerHTML = ''; }
async function buildSlide(s, it) {
  s._built = true; s.innerHTML = '';
  const stage = document.createElement('div'); stage.className = 'fmedia'; s.appendChild(stage);
  const path = pathOf(homeOf(it)).slice(1).map(p => p.name).join(' › ');
  s.insertAdjacentHTML('beforeend', `<div class="fcap"><div class="cat">${esc(path)}</div><b>${esc(it.title)}</b><small>${esc([it.code, it.res, srcShort(it.source)].filter(Boolean).join(' · '))}</small>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}</div>
    <div class="frail"><button data-f="fav" aria-label="Favourite" aria-pressed="${isFav(it.id)}">${isFav(it.id) ? '★' : '☆'}</button><button data-f="info" aria-label="Details"><svg><use href="#i-info"/></svg></button><button data-f="move" aria-label="Move to a folder"><svg><use href="#i-vault"/></svg></button><button data-f="open" aria-label="Open in the full viewer"><svg><use href="#i-expand"/></svg></button></div>
    <div class="fprog"><i></i></div>`);
  if (!hasLocal(it)) {
    const card = document.createElement('div'); card.className = 'fremote';
    const art = artFor(it); art.style.cssText += ';position:relative;height:42vh;border-radius:18px;overflow:hidden'; card.appendChild(art);
    card.insertAdjacentHTML('beforeend', `<div class="row">${it.driveId && !prefs.offlineOnly ? '<button class="btn primary" data-f="here">Play here</button>' : ''}${it.link ? `<a class="btn" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Open in ${esc(srcShort(it.source) || 'browser')}</a>` : ''}</div>`);
    stage.appendChild(card); return;
  }
  const src = await srcFor(it); if (!s._built) return;
  if (!src) { stage.innerHTML = '<div class="fremote"><b>Not available here</b><p>' + (it.linked ? 'Tap the folder in Folders › Linked folders to reconnect it.' : 'This file is not stored on this device.') + '</p></div>'; return; }
  if (it.kind === 'image') { const im = document.createElement('img'); im.alt = it.title; im.decoding = 'async'; im.draggable = false; im.src = src; stage.appendChild(im); return; }
  if (it.kind === 'audio') stage.appendChild(Object.assign(artFor(it), { className: 'art faudio' }));
  const v = document.createElement('video'); v.src = src; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'metadata'; v.muted = !prefs.feedSound; v.loop = !prefs.feedAuto;
  if (it.poster) v.poster = posterSrc(it); if (it.kind === 'audio') v.className = 'aud';
  const bar = $('.fprog i', s);
  v.addEventListener('timeupdate', () => { if (isFinite(v.duration) && v.duration) bar.style.width = (v.currentTime / v.duration * 100) + '%'; });
  v.addEventListener('ended', () => { if (prefs.feedAuto && FEED.list[FEED.idx] === it) feedGo(1); });
  v.addEventListener('error', () => { if (it.playable && !v._pl) { v._pl = 1; v.src = it.playable; if (FEED.list[FEED.idx] === it) feedPlay(v); } });
  stage.appendChild(v); s._vid = v;
  if (FEED.list[FEED.idx] === it) feedPlay(v);
}
function heartAt(s, x, y) { const h = document.createElement('i'); h.className = 'fheart'; h.textContent = '★'; const r = s.getBoundingClientRect(); h.style.left = (x - r.left) + 'px'; h.style.top = (y - r.top) + 'px'; s.appendChild(h); setTimeout(() => h.remove(), 800); }
function feedFav(it, on) {
  const now = isFav(it.id); if (on === now) return now;
  toggleFav(it.id); const s = $('#fscroll').children[FEED.list.indexOf(it)], b = s && $('[data-f="fav"]', s);
  if (b) { b.textContent = isFav(it.id) ? '★' : '☆'; b.setAttribute('aria-pressed', isFav(it.id)); }
  return isFav(it.id);
}
function feedRemove(ids) {
  const set = new Set(ids), cur = FEED.idx, list = FEED.list.filter(it => !set.has(it.id));
  if (!list.length) return closeFeed();
  feedRender(list, Math.min(cur, list.length - 1));
}
function feedAction(k, it) {
  if (k === 'fav') { const on = feedFav(it, !isFav(it.id)); toast(on ? 'Starred' : 'Unstarred'); }
  else if (k === 'info') itemSheet(it);
  else if (k === 'move') moveSheet([it.id]);
  else if (k === 'open') { const v = feedVid(); if (v) v.pause(); openViewer(it.id, FEED.list); }
  else if (k === 'here' && it.driveId) {
    const s = $('#fscroll').children[FEED.list.indexOf(it)], card = s && $('.fremote', s); if (!card) return;
    const f = document.createElement('iframe'); f.className = 'drivebox'; f.title = it.title; f.src = 'https://drive.google.com/file/d/' + encodeURIComponent(it.driveId) + '/preview';
    f.allow = 'autoplay; fullscreen; picture-in-picture'; f.allowFullscreen = true; f.referrerPolicy = 'no-referrer'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    clearTimeout(FEED.timer); card.innerHTML = ''; card.appendChild(f);
  }
}
function bindFeed() {
  const sc = $('#fscroll');
  $('#feedClose').onclick = () => closeFeed();
  $('#feedAuto').onclick = () => { prefs.feedAuto = !prefs.feedAuto; savePrefs(); syncFeedBar(); const v = feedVid(); if (v) v.loop = !prefs.feedAuto; clearTimeout(FEED.timer); toast(prefs.feedAuto ? 'Auto-scroll on: moves on when a clip ends' : 'Auto-scroll off: clips loop'); if (prefs.feedAuto && !v) { const it = feedItem(); if (it) FEED.timer = setTimeout(() => feedGo(1), 5000); } };
  $('#feedSound').onclick = () => { prefs.feedSound = !prefs.feedSound; savePrefs(); syncFeedBar(); $$('video', sc).forEach(v => { v.muted = !prefs.feedSound; }); const v = feedVid(); if (v && v.paused) feedPlay(v); };
  sc.addEventListener('click', e => {
    const s = e.target.closest('.fslide'); if (!s) return; const it = FEED.list[+s.dataset.i]; if (!it) return;
    const b = e.target.closest('[data-f]'); if (b) { e.stopPropagation(); return feedAction(b.dataset.f, it); }
    if (e.target.closest('a,button,iframe')) return;
    const now = Date.now();
    if (now - FEED.lastTap < 300) { clearTimeout(FEED.tapT); FEED.lastTap = 0; feedFav(it, true); heartAt(s, e.clientX, e.clientY); return; }   // double tap: star (never un-stars)
    FEED.lastTap = now; clearTimeout(FEED.tapT);
    FEED.tapT = setTimeout(() => { const v = s._vid; if (v) { v.paused ? feedPlay(v) : v.pause(); } }, 280);
  });
  sc.addEventListener('scroll', debounce(() => { const i = Math.round(sc.scrollTop / Math.max(1, sc.clientHeight)); if (FEED.open && i !== FEED.idx) feedFocus(i); }, 140), { passive: true });
  window.addEventListener('resize', () => { if (FEED.open) sc.scrollTop = FEED.idx * sc.clientHeight; });
}
function feedKey(e) {
  if (!FEED.open || V.open || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.target.matches && e.target.matches('input,textarea,select')) return false;
  if ($('#sheet').classList.contains('open')) { if (e.key === 'Escape') { closeSheet(); return true; } return false; }
  const k = e.key, it = feedItem(), v = feedVid();
  if (k === 'Escape') { closeFeed(); return true; }
  if (k === 'ArrowDown' || k === 'PageDown' || k === 'j') { feedGo(1); return true; }
  if (k === 'ArrowUp' || k === 'PageUp' || k === 'k') { feedGo(-1); return true; }
  if (k === ' ') { if (v) v.paused ? feedPlay(v) : v.pause(); return true; }
  if (k === 'm') { $('#feedSound').click(); return true; }
  if (k === 'f' && it) { feedAction('fav', it); return true; }
  if (k === 'i' && it) { itemSheet(it); return true; }
  if ((k === 'Enter' || k === 'o') && it) { feedAction('open', it); return true; }
  if (k === 'ArrowRight' && v) { v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 5); return true; }
  if (k === 'ArrowLeft' && v) { v.currentTime = Math.max(0, v.currentTime - 5); return true; }
  return false;
}
