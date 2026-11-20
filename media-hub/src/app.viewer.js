/* ===================== VIEWER: images · video · gestures ===================== */
const V = {
  list: [], idx: 0, item: null, vid: null, img: null, tok: 0, open: false,
  ab: { a: null, b: null, on: false }, z: { s: 1, tx: 0, ty: 0, base: null },
  idleT: 0, saveAt: 0, raf: 0, slide: 0, wake: null, hist: false,
  sleep: { until: 0, end: false, timer: 0 }, ptrs: new Map(), lastTap: { t: 0, x: 0, y: 0 }, tapT: 0, drag: null, pinch: null
};
const vEl = () => $('#viewer'), stageEl = () => $('#vstage');

function openViewer(id, list) {
  const it = byId.get(id); if (!it) return;
  V.list = (list && list.length ? list : [it]).filter(Boolean);
  V.idx = V.list.findIndex(x => x.id === id);
  if (V.idx < 0) { V.list = [it]; V.idx = 0; }
  vEl().classList.add('open'); V.open = true; document.body.style.overflow = 'hidden'; document.body.classList.add('viewing');
  if (!V.hist) { V.hist = true; afterNav(() => { try { history.pushState({ mh: 'viewer' }, ''); } catch (e) { } }); }
  drawItem();
}
function closeViewer(fromPop) {
  if (!V.open) return;
  persistProgress(true); teardownMedia(); stopSlideshow(); clearSleep(); const lk = $('#vlock'); if (lk) { lk.remove(); vEl().classList.remove('locked'); }
  V.open = false; vEl().classList.remove('open', 'theatre', 'idle'); document.body.style.overflow = ''; document.body.classList.remove('viewing');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  if (V.hist && !fromPop) { V.hist = false; navBack(); } else V.hist = false;
  closeSheet(); renderRails(); updateSubtitle(); if (state.tab === 'library') renderChips();
}
window.addEventListener('popstate', () => { if (NAV.self) return; if (V.open) { V.hist = false; closeViewer(true); } });

function step(d) {
  if (V.list.length < 2) return;
  persistProgress(true);
  V.idx = (V.idx + d + V.list.length) % V.list.length; drawItem();
}
function teardownMedia() {
  cancelAnimationFrame(V.raf); releaseWake();
  if (V.vid) { try { V.vid.pause(); } catch (e) { } try { if (V.vid._src) V.vid._src.disconnect(); } catch (e) { } V.vid.removeAttribute('src'); V.vid.load(); }
  V.vid = null; V.img = null; V.ab = { a: null, b: null, on: false }; V.ptrs.clear(); V.pinch = null;
  if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) { } }
}
function showChrome() {
  const v = vEl(); v.classList.remove('idle'); clearTimeout(V.idleT);
  if (V.vid && !V.vid.paused) V.idleT = setTimeout(() => v.classList.add('idle'), 3200);
}
function toggleChrome() { const v = vEl(); if (v.classList.contains('idle')) showChrome(); else { clearTimeout(V.idleT); v.classList.add('idle'); } }

async function drawItem(keepSlide) {
  const it = V.item = V.list[V.idx], tok = ++V.tok;
  teardownMedia(); if (!keepSlide) stopSlideshow();
  touchSeen(it.id);
  $('#vTitle').textContent = it.title;
  $('#vSub').textContent = it.code + (it.category ? ' · ' + it.category : '') + (V.list.length > 1 ? '  ·  ' + (V.idx + 1) + '/' + V.list.length : '');
  syncFavBtn();
  const stage = stageEl(), tools = $('#vtools'); stage.innerHTML = ''; stage.className = 'vstage'; tools.innerHTML = '';
  vEl().classList.remove('idle');
  if (!hasLocal(it)) return drawRemote(it, stage, tools);
  const src = await srcFor(it); if (tok !== V.tok) return;
  if (!src) { drawMissing(stage); return; }
  it.kind === 'video' || it.kind === 'audio' ? drawVideo(it, src, stage, tools, tok) : drawImage(it, src, stage, tools, tok);
}
function drawMissing(stage) {
  stage.classList.add('remote');
  const it = V.item, lk = it && it.linked;
  stage.innerHTML = '<div class="remote-card"><h2>' + (lk ? 'Folder access needed' : 'File not available') + '</h2><p style="color:var(--muted)">' + (lk ? 'This file lives in a linked folder. Allow access again and it opens straight from there; nothing is copied.' : it && it.server ? 'The phone server is not running, or the file moved. Start tools/media_serve.py with --library and refresh phone folders.' : 'This item points to a file that is not stored here. Put it in the media folder next to the app, or add it with the + button.') + '</p>' + (lk ? '<button class="btn primary" id="mReconnect">Allow access</button>' : '') + '</div>';
  const b = $('#mReconnect'); if (b) b.onclick = async () => { if (await reconnectLink(it.linkRoot)) drawItem(); };
}

/* ---------- remote item card ---------- */
function drawRemote(it, stage, tools) {
  stage.classList.add('remote');
  const card = document.createElement('div'); card.className = 'remote-card';
  const art = artFor(it); art.style.cssText += ';position:relative;height:170px;border-radius:14px;overflow:hidden;margin-bottom:10px';
  card.appendChild(art);
  const host = (() => { try { return new URL(it.link).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
  card.insertAdjacentHTML('beforeend', `<div class="cat">${esc(it.category || '')}</div><h2>${esc(it.title)}</h2>
    <p style="color:var(--muted);margin:2px 0 10px">${esc([srcShort(it.source), it.res, it.audio ? 'audio: ' + it.audio : '', host].filter(Boolean).join(' · '))}</p>
    ${it.desc ? `<p class="descp">${esc(it.desc)}</p>` : ''}
    <div class="taglist">${tagsOf(it).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">${it.driveId && !prefs.offlineOnly ? '<button class="btn primary" id="rcHere">Play here</button>' : ''}${it.link ? `<a class="btn ${it.driveId && !prefs.offlineOnly ? '' : 'primary'}" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Open in ${esc(srcShort(it.source) || 'browser')}</a><button class="btn" id="rcCopy">Copy link</button>` : '<span style="color:var(--muted)">No link saved for this item.</span>'}<button class="btn" id="rcInfo">Details</button></div>
    <p class="rcnote" style="color:var(--muted);font-size:.8rem;margin-top:14px">${prefs.offlineOnly ? 'Offline-only mode is on, so Drive’s player is off. “Open” takes you to the link in your browser.' : it.driveId ? '“Play here” loads Google Drive’s own player inside the app, so Google sees that request. Turn on “Play Drive clips here” in Tools to skip this tap.' : 'This one lives online, so it opens in your browser. Add a copy of the file with the + button to play it inside Media Hub.'}</p>`);
  stage.appendChild(card);
  const c = $('#rcCopy', card); if (c) c.onclick = async () => toast((await copyText(it.link)) ? 'Link copied' : 'Copy failed');
  $('#rcInfo', card).onclick = () => itemSheet(it);
  const here = $('#rcHere', card);
  const playHere = () => {
    const f = document.createElement('iframe'); f.className = 'drivebox'; f.title = it.title;
    f.src = 'https://drive.google.com/file/d/' + encodeURIComponent(it.driveId) + '/preview';
    f.allow = 'autoplay; fullscreen; picture-in-picture'; f.allowFullscreen = true; f.referrerPolicy = 'no-referrer';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    art.replaceWith(f); card.classList.add('wide'); if (here) here.remove();
    const n = $('.rcnote', card); if (n) n.textContent = 'Playing in Google Drive’s player. If it asks you to sign in or stays blank, the file is private to your Google account: use “Open in Drive”.';
  };
  if (here) here.onclick = playHere;
  if (it.driveId && prefs.drivePlayHere && !prefs.offlineOnly) playHere();
}

/* ---------- view adjustments: display only, the file is never changed ---------- */
const ADJ0 = { b: 100, c: 100, s: 100, r: 0, m: false, g: 100 };
const adjOf = id => Object.assign({}, ADJ0, (user.adj && user.adj[id]) || {});
let ACTX = null;
function setBoost(g) {
  const v = V.vid; if (!v || (g <= 1 && !v._gain)) return;
  try {
    if (!ACTX) ACTX = new (window.AudioContext || window.webkitAudioContext)();
    if (!v._gain) { const src = ACTX.createMediaElementSource(v), gain = ACTX.createGain(); src.connect(gain).connect(ACTX.destination); v._gain = gain; v._src = src; }
    v._gain.gain.value = g; if (ACTX.state === 'suspended') ACTX.resume().catch(() => { });
  } catch (e) { toast('Volume boost is not available here'); }
}
function applyAdj() {
  const it = V.item, el = V.vid || V.img; if (!it || !el) return; const a = adjOf(it.id);
  el.style.filter = (a.b !== 100 || a.c !== 100 || a.s !== 100) ? `brightness(${a.b}%) contrast(${a.c}%) saturate(${a.s}%)` : '';
  if (V.vid) {
    const st = stageEl().getBoundingClientRect(), rot = ((a.r % 360) + 360) % 360, side = rot === 90 || rot === 270, v = V.vid;
    if (rot) { v.style.position = 'absolute'; v.style.left = v.style.top = '50%'; v.style.width = (side ? st.height : st.width) + 'px'; v.style.height = (side ? st.width : st.height) + 'px'; v.style.transform = `translate(-50%,-50%) rotate(${rot}deg)${a.m ? ' scaleX(-1)' : ''}`; }
    else { v.style.position = v.style.left = v.style.top = v.style.width = v.style.height = ''; v.style.transform = a.m ? 'scaleX(-1)' : ''; }
    v.style.transformOrigin = 'center'; setBoost(a.g / 100);
  }
  const b = $('#tAdj'); if (b) b.setAttribute('aria-pressed', String(JSON.stringify(a) !== JSON.stringify(ADJ0)));
}
const adjSlider = (k, label, min, max, v) => `<div class="adjrow"><label for="adj-${k}">${label}</label><input type="range" id="adj-${k}" data-k="${k}" min="${min}" max="${max}" value="${v}"><output>${v}%</output></div>`;
function adjustSheet() {
  const it = V.item; if (!it) return; const a = adjOf(it.id), isV = !!V.vid;
  openSheet(`<h2>Adjust view</h2><p style="color:var(--muted);margin:2px 0 10px;font-size:.85rem">Changes only how it looks and sounds here, remembered for this item. The file itself is never changed.</p>
    ${adjSlider('b', 'Brightness', 50, 160, a.b)}${adjSlider('c', 'Contrast', 50, 160, a.c)}${adjSlider('s', 'Saturation', 0, 200, a.s)}
    ${isV ? `<div class="sect"><div class="sect-h">Rotate &amp; mirror</div><div style="display:flex;gap:8px;flex-wrap:wrap"><div class="seg" id="adjRot">${[0, 90, 180, 270].map(r => `<button data-r="${r}" aria-pressed="${a.r === r}">${r}°</button>`).join('')}</div><button class="btn small" id="adjMirror" aria-pressed="${a.m}">Mirror</button></div></div>
    <div class="sect"><div class="sect-h">Volume boost <small style="color:var(--muted);font-weight:500">for quiet clips</small></div><div class="seg" id="adjGain">${[100, 150, 200, 300].map(g => `<button data-g="${g}" aria-pressed="${a.g === g}">${g}%</button>`).join('')}</div></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="adjReset">Reset</button><button class="btn primary" id="adjDone">Done</button></div>`);
  const save = (k, v) => {
    const cur = adjOf(it.id); cur[k] = v; const diff = {};
    Object.keys(cur).forEach(x => { if (cur[x] !== ADJ0[x]) diff[x] = cur[x]; });
    if (Object.keys(diff).length) user.adj[it.id] = diff; else delete user.adj[it.id];
    saveUser(); applyAdj();
  };
  $$('#sheetBody input[data-k]').forEach(r => r.oninput = () => { r.nextElementSibling.textContent = r.value + '%'; save(r.dataset.k, +r.value); });
  $$('#adjRot button').forEach(b => b.onclick = () => { save('r', +b.dataset.r); $$('#adjRot button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $$('#adjGain button').forEach(b => b.onclick = () => { save('g', +b.dataset.g); $$('#adjGain button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const m = $('#adjMirror'); if (m) m.onclick = () => { const on = m.getAttribute('aria-pressed') !== 'true'; m.setAttribute('aria-pressed', on); save('m', on); };
  $('#adjReset').onclick = () => { delete user.adj[it.id]; saveUser(); applyAdj(); adjustSheet(); };
  $('#adjDone').onclick = closeSheet;
}

/* ---------- images: pinch, double-tap, wheel, swipe ---------- */
function applyZ() { const z = V.z; if (V.img) V.img.style.transform = `translate(${z.tx}px,${z.ty}px) scale(${z.s})`; }
function baseRect() {
  if (!V.img) return;
  const s = stageEl().getBoundingClientRect(), i = V.img.getBoundingClientRect(), z = V.z;
  V.z.base = { l: (i.left - s.left) - z.tx, t: (i.top - s.top) - z.ty, w: i.width / z.s, h: i.height / z.s };
}
function clampPan() {
  const s = stageEl().getBoundingClientRect(), z = V.z, b = z.base; if (!b) return;
  const w = b.w * z.s, h = b.h * z.s;
  z.tx = w <= s.width ? (s.width - w) / 2 - b.l : clamp(z.tx, s.width - w - b.l, -b.l);
  z.ty = h <= s.height ? (s.height - h) / 2 - b.t : clamp(z.ty, s.height - h - b.t, -b.t);
}
function zoomAt(cx, cy, ns) {
  const z = V.z, b = z.base; if (!b) return; ns = clamp(ns, 1, 8);
  const k = ns / z.s;
  z.tx = (cx - b.l) - (cx - b.l - z.tx) * k; z.ty = (cy - b.t) - (cy - b.t - z.ty) * k; z.s = ns;
  if (ns === 1) { z.tx = 0; z.ty = 0; }
  clampPan(); applyZ(); syncZoomBtn();
}
function syncZoomBtn() { const b = $('#tZoom'); if (b) b.setAttribute('aria-pressed', V.z.s > 1.01); }
function drawImage(it, src, stage, tools, tok) {
  const img = new Image(); img.alt = it.title; img.draggable = false; V.img = img; V.z = { s: 1, tx: 0, ty: 0, base: null };
  img.onload = () => { if (tok !== V.tok) return; baseRect(); preloadNeighbor(); };
  img.onerror = () => { if (tok === V.tok) { stage.innerHTML = ''; drawMissing(stage); V.img = null; } };
  img.src = src; stage.appendChild(img);
  tools.innerHTML = `<div class="vrow"><button class="btn" id="tZoom" aria-pressed="false">Zoom</button><button class="btn" id="tSlide" aria-pressed="${!!V.slide}">Slideshow</button><button class="btn" id="tAdj" aria-pressed="false">Adjust</button><button class="btn" id="tInfo">Details</button></div>`;
  $('#tZoom').onclick = () => { const r = stageEl().getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, V.z.s > 1.01 ? 1 : 2.5); };
  $('#tSlide').onclick = () => V.slide ? stopSlideshow() : startSlideshow();
  $('#tAdj').onclick = adjustSheet; applyAdj();
  $('#tInfo').onclick = () => itemSheet(it);
}
function preloadNeighbor() {
  const n = V.list[(V.idx + 1) % V.list.length]; if (n && n !== V.item && hasLocal(n) && n.kind === 'image') srcFor(n).then(s => { if (s) { const i = new Image(); i.src = s; } });
}
const isLocalImage = x => hasLocal(x) && x.kind === 'image';
function startSlideshow() {
  if (V.list.filter(isLocalImage).length < 2) return toast('Need at least two images in this view');
  const b = $('#tSlide'); if (b) b.setAttribute('aria-pressed', 'true');
  V.slide = setInterval(() => {
    let n = 0; do { V.idx = (V.idx + 1) % V.list.length; n++; } while (!isLocalImage(V.list[V.idx]) && n < V.list.length);
    drawItem(true);
  }, 4000);
  toast('Slideshow: new image every 4 s');
}
function stopSlideshow() { if (V.slide) { clearInterval(V.slide); V.slide = 0; const b = $('#tSlide'); if (b) b.setAttribute('aria-pressed', 'false'); } }

function bindStage() {
  const st = stageEl();
  st.addEventListener('pointerdown', e => {
    if (!V.img && !V.vid) return;
    try { st.setPointerCapture(e.pointerId); } catch (_) { }
    V.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: Date.now() });
    if (V.ptrs.size === 2) { const [a, b] = Array.from(V.ptrs.values()); V.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: V.z.s }; }
    V.drag = { tx: V.z.tx, ty: V.z.ty, moved: false, mode: null };
  });
  st.addEventListener('pointermove', e => {
    const p = V.ptrs.get(e.pointerId); if (!p || !V.img || !V.drag) return; p.x = e.clientX; p.y = e.clientY;
    const r = st.getBoundingClientRect();
    if (V.ptrs.size === 2 && V.pinch) {
      const [a, b] = Array.from(V.ptrs.values()); const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, V.pinch.s * d / V.pinch.d); V.drag.moved = true; return;
    }
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) V.drag.moved = true;
    if (V.z.s > 1.01) { V.z.tx = V.drag.tx + dx; V.z.ty = V.drag.ty + dy; clampPan(); applyZ(); }
    else {
      if (!V.drag.mode && V.drag.moved) V.drag.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (V.drag.mode === 'h') V.img.style.transform = `translate(${dx * .6}px,0)`;
      if (V.drag.mode === 'v') { V.img.style.transform = `translate(0,${Math.max(0, dy) * .8}px)`; vEl().style.opacity = String(clamp(1 - dy / 500, .4, 1)); }
    }
  });
  const end = e => {
    const p = V.ptrs.get(e.pointerId); if (!p) return; V.ptrs.delete(e.pointerId);
    if (V.ptrs.size < 2) V.pinch = null;
    vEl().style.opacity = '';
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy, dt = Date.now() - p.t, tap = Math.abs(dx) + Math.abs(dy) < 10 && dt < 320;
    const r = st.getBoundingClientRect();
    if (V.img && V.z.s <= 1.01 && V.drag && V.drag.moved && V.ptrs.size === 0) {
      if (V.drag.mode === 'h' && Math.abs(dx) > 70) { V.img.style.transform = ''; return step(dx < 0 ? 1 : -1); }
      if (V.drag.mode === 'v' && dy > 110) return closeViewer();
      V.img.style.transform = '';
    }
    if (!tap || e.type === 'pointercancel') return;
    const now = Date.now(), lt = V.lastTap, dbl = now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40;
    V.lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    clearTimeout(V.tapT);
    if (dbl) {
      if (V.img) zoomAt(e.clientX - r.left, e.clientY - r.top, V.z.s > 1.01 ? 1 : 2.5);
      else if (V.vid) seekBy(e.clientX - r.left < r.width / 2 ? -10 : 10, true);
    } else V.tapT = setTimeout(toggleChrome, 230);
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', e => {
    if (!V.img) return; e.preventDefault();
    const r = st.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, V.z.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
  }, { passive: false });
  window.addEventListener('resize', () => { if (V.open && V.img && V.z.s === 1) { V.img.style.transform = ''; baseRect(); } if (V.open && V.vid) applyAdj(); });
}

/* ---------- video ---------- */
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function drawVideo(it, src, stage, tools, tok) {
  const v = document.createElement('video'); v.src = src; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.controls = false;
  v.playbackRate = prefs.speed || 1; V.vid = v; if (it.poster) v.poster = posterSrc(it);
  if (it.kind === 'audio') { stage.classList.add('audio'); const a = artFor(it); a.classList.add('vaudio'); a.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 24 24"><use href="#i-music"/></svg>'); stage.appendChild(a); }
  stage.appendChild(v);
  tools.innerHTML = `
    <div><input class="vseek" id="tSeek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek"><div class="vtime"><span id="tCur">0:00</span><span id="tAB"></span><span id="tDur">0:00</span></div></div>
    <div class="vrow">
      <button class="btn" id="tBack" aria-label="Back 10 seconds">−10</button>
      <button class="btn vplay" id="tPlay" aria-label="Play or pause"><svg viewBox="0 0 24 24"><use href="#i-play"/></svg></button>
      <button class="btn" id="tFwd" aria-label="Forward 10 seconds">+10</button>
      <button class="btn" id="tA" title="Set loop start (A)">A</button><button class="btn" id="tB" title="Set loop end (B)">B</button><button class="btn" id="tLoopAB" aria-pressed="false" title="Loop A to B (R)">A–B</button>
      <select id="tSpeed" aria-label="Speed">${SPEEDS.map(s => `<option value="${s}" ${s === (prefs.speed || 1) ? 'selected' : ''}>${s}×</option>`).join('')}</select>
      <select id="tSleep" aria-label="Sleep timer"><option value="0">Sleep: off</option><option value="10">10 min</option><option value="20">20 min</option><option value="30">30 min</option><option value="60">60 min</option><option value="end">End of video</option></select>
      <button class="btn" id="tTheatre" aria-pressed="false">Theatre</button>
      <button class="btn" id="tPip">PiP</button>
      <button class="btn" id="tFrameB" aria-label="Previous frame">◂ frame</button><button class="btn" id="tFrameF" aria-label="Next frame">frame ▸</button>
      <button class="btn" id="tShot">Save frame</button>
      <button class="btn" id="tAdj" aria-pressed="false">Adjust</button><button class="btn" id="tMute" aria-pressed="false">Mute</button><button class="btn" id="tLoop" aria-pressed="false">Loop</button>
      <button class="btn" id="tLock" title="Lock the controls so a touch can't pause or skip">Lock</button><button class="btn" id="tInfo">Details</button>
    </div>`;
  const seek = $('#tSeek'), cur = $('#tCur'), dur = $('#tDur'), play = $('#tPlay');
  const setPlayIcon = () => { play.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${v.paused ? 'i-play' : 'i-pause'}"/></svg>`; };
  let scrubbing = false;
  const tick = () => {
    if (V.vid !== v) return;
    if (!scrubbing && isFinite(v.duration)) { seek.value = Math.round(v.currentTime / v.duration * 1000); cur.textContent = fmtTime(v.currentTime); }
    const ab = V.ab; if (ab.on && ab.a != null && ab.b != null && ab.b > ab.a && v.currentTime >= ab.b) v.currentTime = ab.a;
    persistProgress(false);
    if (!v.paused) V.raf = requestAnimationFrame(tick);
  };
  v.addEventListener('loadedmetadata', () => {
    dur.textContent = fmtTime(v.duration);
    const pr = progress.get(it.id);
    if (prefs.resume && pr && pr.pct > 1 && pr.pct < 95 && pr.t < v.duration - 5) {
      v.currentTime = pr.t; toast('Resumed at ' + fmtTime(pr.t), { label: 'Start over', fn: () => { v.currentTime = 0; } });
    }
    setupMediaSession(it, v);
  });
  v.addEventListener('play', () => { setPlayIcon(); cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(tick); requestWake(); showChrome(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  v.addEventListener('pause', () => { setPlayIcon(); persistProgress(true); releaseWake(); showChrome(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
  v.addEventListener('ended', () => {
    setPlayIcon(); progress.delete(it.id); dbDel('progress', it.id); releaseWake();
    if (V.sleep.end) { clearSleep(); toast('Sleep timer: finished'); return; }
    if (prefs.autoNext && !v.loop) { const n = nextPlayable(); if (n >= 0) { V.idx = n; drawItem(); } }
  });
  v.addEventListener('error', () => {
    if (tok !== V.tok) return;
    if (it.playable && !v._usedPlayable) { v._usedPlayable = true; v.src = it.playable; v.play().catch(() => { }); toast('Playing the separate playable copy. The original is untouched.'); return; }
    toast(it.local ? 'This format can’t play in this browser. Details → “Copy playable copy command” makes a separate playable file.' : 'This file could not be played in this browser');
  });
  seek.addEventListener('input', () => { scrubbing = true; cur.textContent = fmtTime(seek.value / 1000 * v.duration); });
  seek.addEventListener('change', () => { v.currentTime = seek.value / 1000 * v.duration; scrubbing = false; });
  play.onclick = togglePlay;
  $('#tBack').onclick = () => seekBy(-10, true); $('#tFwd').onclick = () => seekBy(10, true);
  $('#tA').onclick = () => { V.ab.a = v.currentTime; if (V.ab.b != null && V.ab.b <= V.ab.a) V.ab.b = null; abLabel(); };
  $('#tB').onclick = () => { if (V.ab.a == null) return toast('Set A first'); if (v.currentTime <= V.ab.a) return toast('B must come after A'); V.ab.b = v.currentTime; V.ab.on = true; abLabel(); };
  $('#tLoopAB').onclick = () => { if (V.ab.a == null || V.ab.b == null) return toast('Set A and B first'); V.ab.on = !V.ab.on; abLabel(); };
  $('#tSpeed').onchange = e => { v.playbackRate = prefs.speed = +e.target.value; savePrefs(); };
  $('#tSleep').onchange = e => setSleep(e.target.value);
  $('#tTheatre').onclick = toggleTheatre; $('#tPip').onclick = pip;
  $('#tFrameB').onclick = () => frameStep(-1); $('#tFrameF').onclick = () => frameStep(1);
  $('#tShot').onclick = saveFrame;
  $('#tMute').onclick = e => { v.muted = !v.muted; e.currentTarget.setAttribute('aria-pressed', v.muted); };
  $('#tLoop').onclick = e => { v.loop = !v.loop; e.currentTarget.setAttribute('aria-pressed', v.loop); };
  $('#tInfo').onclick = () => itemSheet(it); $('#tLock').onclick = toggleLockCtl;
  $('#tAdj').onclick = adjustSheet; v.addEventListener('loadedmetadata', applyAdj, { once: true }); applyAdj();
  if (!document.pictureInPictureEnabled) $('#tPip').classList.add('hidden');
  v.play().catch(() => { if (!v.error && !v._usedPlayable && tok === V.tok) toast('Tap play to start'); });
}
function abLabel() {
  const ab = V.ab, el = $('#tAB'), b = $('#tLoopAB');
  if (el) el.textContent = ab.a == null ? '' : 'A ' + fmtTime(ab.a) + (ab.b != null ? ' → B ' + fmtTime(ab.b) : '');
  if (b) b.setAttribute('aria-pressed', !!ab.on);
}
function togglePlay() { const v = V.vid; if (!v) return; v.paused ? v.play().catch(() => { }) : v.pause(); }
function seekBy(d, hint) {
  const v = V.vid; if (!v) return; v.currentTime = clamp(v.currentTime + d, 0, v.duration || 1e9);
  if (hint) toast((d < 0 ? '⟲ ' : '⟳ ') + Math.abs(d) + ' s');
}
function frameStep(d) { const v = V.vid; if (!v) return; v.pause(); v.currentTime = clamp(v.currentTime + d / 30, 0, v.duration || 1e9); }
async function pip() { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await V.vid.requestPictureInPicture(); } catch (e) { toast('Picture-in-picture is not available here'); } }
function toggleTheatre() {
  const v = vEl(), on = !v.classList.contains('theatre'); v.classList.toggle('theatre', on);
  const b = $('#tTheatre'); if (b) b.setAttribute('aria-pressed', on);
  if (on) { (v.requestFullscreen ? v.requestFullscreen() : Promise.reject()).then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { }); showChrome(); }
  else { if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); try { screen.orientation.unlock(); } catch (e) { } }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && V.open) { vEl().classList.remove('theatre'); const b = $('#tTheatre'); if (b) b.setAttribute('aria-pressed', false); try { screen.orientation.unlock(); } catch (e) { } }
});
function saveFrame() {
  const v = V.vid; if (!v || !v.videoWidth) return;
  try {
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(b => { if (!b) return toast('Could not capture this frame'); download((V.item.code || 'frame') + '-' + fmtTime(v.currentTime).replace(':', 'm') + 's.png', b); toast('Frame saved as a new PNG. The video is untouched.'); }, 'image/png');
  } catch (e) { toast('Saving frames needs the app opened over http(s)'); }
}
function nextPlayable() {
  for (let i = 1; i < V.list.length; i++) { const k = (V.idx + i) % V.list.length, n = V.list[k]; if (hasLocal(n) && (n.kind === 'video' || n.kind === 'audio')) return k; }
  return -1;
}

/* ---------- progress (true percent) ---------- */
function persistProgress(force) {
  const v = V.vid, it = V.item; if (!v || !it || !isFinite(v.duration) || v.duration < 1) return;
  const now = Date.now(); if (!force && now - V.saveAt < 4000) return; V.saveAt = now;
  if (v.ended || v.currentTime < 2) return;
  const rec = { t: v.currentTime, d: v.duration, pct: Math.round(v.currentTime / v.duration * 100), at: now };
  if (rec.pct >= 95) { progress.delete(it.id); dbDel('progress', it.id); return; }
  progress.set(it.id, rec); dbPut('progress', it.id, rec);
}

/* ---------- wake lock · media session · sleep timer ---------- */
async function requestWake() { if (!prefs.wake || !('wakeLock' in navigator) || V.wake) return; try { V.wake = await navigator.wakeLock.request('screen'); V.wake.addEventListener('release', () => { V.wake = null; }); } catch (e) { } }
function releaseWake() { if (V.wake) { try { V.wake.release(); } catch (e) { } V.wake = null; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden && V.vid && !V.vid.paused) requestWake(); });
function setupMediaSession(it, v) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.category || 'Media Hub', album: 'Media Hub', artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] });
    const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { } };
    h('play', () => v.play()); h('pause', () => v.pause()); h('seekbackward', () => seekBy(-10)); h('seekforward', () => seekBy(10));
    h('previoustrack', () => step(-1)); h('nexttrack', () => step(1));
  } catch (e) { }
}
function setSleep(val) {
  clearSleep(); if (val === '0') return;
  if (val === 'end') { V.sleep.end = true; showPill('Sleep: end of video'); const s = $('#tSleep'); if (s) s.value = 'end'; return; }
  const mins = +val; V.sleep.until = Date.now() + mins * 60000;
  V.sleep.timer = setInterval(() => {
    const left = V.sleep.until - Date.now();
    if (left <= 0) { clearSleep(); fadeAndPause(); return; }
    showPill('Sleep in ' + fmtTime(left / 1000));
  }, 1000); showPill('Sleep in ' + mins + ':00');
  const s = $('#tSleep'); if (s) s.value = val;
}
function clearSleep() { clearInterval(V.sleep.timer); V.sleep = { until: 0, end: false, timer: 0 }; showPill(''); const s = $('#tSleep'); if (s) s.value = '0'; }
function showPill(t) { const p = $('#sleepPill'); p.textContent = t; p.classList.toggle('on', !!t); }
function fadeAndPause() {
  const v = V.vid; if (!v) return; const start = v.volume; let n = 12;
  const f = setInterval(() => { n--; v.volume = Math.max(0, start * n / 12); if (n <= 0) { clearInterval(f); v.pause(); v.volume = start; toast('Sleep timer: paused'); } }, 500);
}

/* ---------- viewer chrome bindings & keys ---------- */
/* ---------- control lock (touches ignored until you hold the lock) ---------- */
function toggleLockCtl() {
  const v = vEl(); let l = $('#vlock');
  if (l) { l.remove(); v.classList.remove('locked'); showChrome(); toast('Controls unlocked'); return; }
  l = document.createElement('div'); l.id = 'vlock'; l.innerHTML = '<button id="vlockBtn" aria-label="Hold to unlock"><svg viewBox="0 0 24 24"><use href="#i-lock"/></svg><span>Hold to unlock</span></button>';
  v.appendChild(l); v.classList.add('locked'); clearTimeout(V.idleT); v.classList.add('idle');
  let t = 0; const b = $('#vlockBtn');
  l.addEventListener('pointerdown', e => { e.stopPropagation(); l.classList.add('show'); clearTimeout(l._h); l._h = setTimeout(() => l.classList.remove('show'), 2200); });
  b.addEventListener('pointerdown', e => { e.stopPropagation(); b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); toggleLockCtl(); }, 700); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { clearTimeout(t); b.classList.remove('holding'); }));
  toast('Controls locked. Hold the lock to unlock.');
}
function syncFavBtn() { const b = $('#vFav'), on = V.item && isFav(V.item.id); b.setAttribute('aria-pressed', !!on); b.textContent = on ? '★' : '☆'; b.style.color = on ? 'var(--gold)' : ''; }
function bindViewer() {
  $('#vClose').onclick = () => closeViewer();
  $('#vPrev').onclick = () => step(-1); $('#vNext').onclick = () => step(1);
  $('#vFav').onclick = () => { if (!V.item) return; toggleFav(V.item.id); syncFavBtn(); renderChips(); };
  $('#vInfo').onclick = () => V.item && itemSheet(V.item);
  $('#vFolder').onclick = () => V.item && moveSheet([V.item.id]);
  const v = vEl(); ['pointermove', 'touchstart'].forEach(ev => v.addEventListener(ev, () => { if (V.vid && v.classList.contains('idle')) showChrome(); }, { passive: true }));
  bindStage();
}
function viewerKey(e) {
  if (!V.open || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.target.matches && e.target.matches('input[type=text],input[type=search],textarea,input:not([type])')) return false;
  const k = e.key;
  if ($('#vlock') && k !== 'Escape') return true;          // locked: keys do nothing either
  if (k === 'Escape') { if ($('#sheet').classList.contains('open')) closeSheet(); else closeViewer(); return true; }
  if (k === 'ArrowRight') { step(1); return true; } if (k === 'ArrowLeft') { step(-1); return true; }
  if (k === 'f') { $('#vFav').click(); return true; } if (k === 'i') { $('#vInfo').click(); return true; } if (k === 'e') { adjustSheet(); return true; }
  if (k === 'g') { moveSheet([V.item.id]); return true; } if (k === 'Delete') { trashItems([V.item.id]); return true; }
  if (V.vid) {
    if (k === ' ' || k === 'k') { togglePlay(); return true; }
    if (k === 'j') { seekBy(-10, true); return true; } if (k === 'l') { seekBy(10, true); return true; }
    if (k === ',') { frameStep(-1); return true; } if (k === '.') { frameStep(1); return true; }
    if (k === 'a') { $('#tA').click(); return true; } if (k === 'b') { $('#tB').click(); return true; } if (k === 'r') { $('#tLoopAB').click(); return true; }
    if (k === 't') { toggleTheatre(); return true; } if (k === 'm') { $('#tMute').click(); return true; } if (k === 'p') { pip(); return true; }
    if (k === '[' || k === ']') { const s = $('#tSpeed'), i = clamp(s.selectedIndex + (k === ']' ? 1 : -1), 0, s.options.length - 1); s.selectedIndex = i; s.onchange({ target: s }); toast(SPEEDS[i] + '×'); return true; }
  }
  return false;
}
