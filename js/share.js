// Liftbook — Share images and the stats they use (calories, improvements).
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- share image: front + back views and the full log, 1080×1920 for Stories ---------- */
const SHARE_THEME = {
  dark: {bg: '#10151C', ink: '#E8ECF1', muted: '#95A0AD', line: '#2A313A', accent: '#6A93FF', pr: '#FF6275', good: '#45C47E', panel: '#171D26'},
  light: {bg: '#F4F6F8', ink: '#121820', muted: '#5A6573', line: '#D3D9E0', accent: '#1B4FD6', pr: '#C81F34', good: '#1B7D44', panel: '#FFFFFF'}
};
// Did each exercise beat the previous session of it? Weighted: estimated max; bodyweight: reps; timed: seconds.
/* Calories: a number from your watch wins; otherwise an estimate = MET × body weight (kg) × hours,
   using the Compendium of Physical Activities / ACSM equations. Lifting estimates are rough (±30%+). */
const ACTIVITY_MET = {run: 9.8, walk: 3.5, cycle: 7.5, swim: 7.0, hike: 6.0, row: 7.0, sport: 7.0, yoga: 2.5, hiit: 8.0, other: 5.0};
const STRENGTH_MET = 5.0;   // resistance training, moderate to vigorous
function bodyWeightKgAt(t) {
  const pts = weightSeries(); if (!pts.length) return null;
  let best = null; for (const p of pts) { if (p.t <= t) best = p; else break; }
  return (best || pts[0]).kg;
}
function caloriesFor(w) {
  if (w.calories > 0) return {kcal: Math.round(w.calories), est: false};
  const kg = bodyWeightKgAt(w.startedAt), hours = ((w.endedAt || w.startedAt) - w.startedAt) / 3600000;
  if (!kg || !(hours > 0)) return null;
  let met = STRENGTH_MET;
  if (isActivity(w)) {
    met = ACTIVITY_MET[w.type] || 5;
    if ((w.type === 'run' || w.type === 'walk') && w.distance > 0) {
      // ACSM: metres per minute → oxygen cost → METs (only where the equation holds)
      const mpm = w.distance * (w.distUnit === 'km' ? 1000 : 1609.34) / (hours * 60);
      const vo2 = w.type === 'run' && mpm > 134 ? 0.2 * mpm + 3.5 : w.type === 'walk' && mpm >= 50 && mpm <= 100 ? 0.1 * mpm + 3.5 : null;
      if (vo2) met = vo2 / 3.5;
    }
  }
  return {kcal: Math.round(met * kg * hours), est: true};
}
const kcalText = c => c ? `${c.est ? '~' : ''}${fmtNum(c.kcal)}` : '—';
function improvedText(w) { const imp = improvements(w); return imp.compared ? `${imp.improved.size}/${imp.compared}` : 'New'; }
function workoutStats(w) {
  const c = caloriesFor(w);
  return `<div class="stats">
    <div class="stat"><b class="num">${fmtDur(((w.endedAt || w.startedAt) - w.startedAt) / 1000)}</b><span>Duration</span></div>
    <div class="stat"><b class="num">${kcalText(c)}</b><span>${c ? (c.est ? 'Calories (est.)' : 'Calories') : 'Calories · log weight'}</span></div>
    <div class="stat"><b class="num" style="${improvements(w).improved.size ? 'color:var(--good)' : ''}">${improvedText(w)}</b><span>Improved</span></div></div>`;
}
function sessionScore(e, sets, unitFrom) {
  if (e.timed) return Math.max(0, ...sets.map(s => s.r || 0));
  const weighted = sets.filter(s => s.w > 0);
  if (!weighted.length) return Math.max(0, ...sets.map(s => s.r || 0));
  return Math.max(...weighted.map(s => e1rm(conv(s.w, unitFrom), s.r)));
}
function improvements(w) {
  const improved = new Set(); let compared = 0;
  for (const e of w.exercises) {
    const now = working(e); if (!now.length) continue;
    const prev = lastPerf(e.exId, w.startedAt, w.id); if (!prev) continue;
    compared++;
    // weighted lifts need a real gain (0.5%) so rounding doesn't count as progress
    const a = sessionScore(e, now, w.unit), b = sessionScore(e, prev.sets, prev.w.unit);
    if (a > b * (now.some(s => s.w > 0) ? 1.005 : 1)) improved.add(e.exId);
  }
  return {improved, compared};
}
function bestSet(e, unitFrom) {
  const ws = working(e); if (!ws.length) return null;
  if (e.timed) return {text: `${Math.max(...ws.map(s => s.r || 0))} s`};
  const withW = ws.filter(s => s.w > 0);
  if (!withW.length) return {text: `${Math.max(...ws.map(s => s.r || 0))} reps`};
  const b = withW.reduce((a, s) => (s.w > a.w || (s.w === a.w && s.r > a.r)) ? s : a);
  return {text: `${fmtW(conv(b.w, unitFrom))} × ${b.r}`};
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function makeShareImage(w, theme) {
  await Fig.ready();
  try { await document.fonts.ready; } catch {}
  const P = SHARE_THEME[theme], load = muscleLoad(w);
  const [front, back] = await Promise.all([loadImg(Fig.snapshot(0, 460, 760, theme, load)), loadImg(Fig.snapshot(Math.PI, 460, 760, theme, load))]);
  const C = document.createElement('canvas'); C.width = 1080; C.height = 1920;
  const x = C.getContext('2d'), L = 76, R = 1080 - 76;
  const D = '"Barlow Condensed", "Arial Narrow", sans-serif', B = 'Barlow, system-ui, sans-serif';
  const text = (s, px, y, font, color, align = 'left') => { x.font = font; x.fillStyle = color; x.textAlign = align; x.fillText(s, px, y); };
  const fit = (s, font, max) => { x.font = font; if (x.measureText(s).width <= max) return s; while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  x.fillStyle = P.bg; x.fillRect(0, 0, 1080, 1920);
  // header
  text(new Date(w.startedAt).toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'}), L, 128, `600 32px ${B}`, P.muted);
  text(fit(w.routineName.toUpperCase(), `700 112px ${D}`, R - L), L, 238, `700 112px ${D}`, P.ink);
  const rt = S.program && S.program.routines.find(r => r.id === w.routineId);
  if (rt && rt.focus) text(rt.focus, L, 290, `600 34px ${B}`, P.accent);
  // stats
  const {v, sets} = volume(w), prs = (w.prs || []).length;
  const imp = improvements(w), exCount = w.exercises.filter(e => working(e).length).length;
  const cal = caloriesFor(w);
  const stats = [['TIME', fmtDur(((w.endedAt || w.startedAt) - w.startedAt) / 1000)], cal ? [cal.est ? 'KCAL (EST.)' : 'KCAL', kcalText(cal)] : ['SETS', String(sets)],
    imp.compared ? ['IMPROVED', `${imp.improved.size} of ${imp.compared}`] : ['EXERCISES', String(exCount)], ['PRS', String(prs)]];
  stats.forEach(([k, val], i) => {
    const sx = L + i * ((R - L) / 4);
    text(k, sx, 368, `600 24px ${B}`, P.muted);
    text(val, sx, 428, `700 58px ${D}`, k === 'PRS' && prs ? P.pr : k === 'IMPROVED' && imp.improved.size ? P.good : P.ink);
  });
  // figures
  const fy = 470, fw = 440, fh = 727;
  x.drawImage(front, 540 - 20 - fw, fy, fw, fh); x.drawImage(back, 540 + 20, fy, fw, fh);
  text('FRONT', 540 - 20 - fw / 2, fy + fh + 30, `600 24px ${B}`, P.muted, 'center');
  text('BACK', 540 + 20 + fw / 2, fy + fh + 30, `600 24px ${B}`, P.muted, 'center');
  const main = mainMuscles(load).map(m => MUSCLE_NAMES[m]).join(' · ');
  if (main) text(fit(main, `600 30px ${B}`, R - L), 540, fy + fh + 82, `600 30px ${B}`, P.ink, 'center');
  // log
  let y = fy + fh + 140;
  x.fillStyle = P.line; x.fillRect(L, y - 44, R - L, 2);
  const rows = w.exercises.filter(e => working(e).length), room = Math.floor((1790 - y) / 58);
  const shown = rows.length > room ? rows.slice(0, room - 1) : rows;
  for (const e of shown) {
    const b = bestSet(e, w.unit), pr = (w.prs || []).includes(e.exId), up = !pr && imp.improved.has(e.exId);
    text(fit(e.name.replace(/ \((Barbell|Dumbbell|Machine|Cable)\)$/, ''), `500 34px ${B}`, 600), L, y, `500 34px ${B}`, P.ink);
    text((b ? b.text : '') + (pr ? '  ★' : up ? '  ▲' : ''), R, y, `700 38px ${D}`, pr ? P.pr : up ? P.good : P.ink, 'right');
    y += 58;
  }
  if (shown.length < rows.length) text(`+ ${rows.length - shown.length} more`, L, y, `500 30px ${B}`, P.muted);
  // footer
  text('LIFT', L, 1856, `700 44px ${D}`, P.ink);
  x.font = `700 44px ${D}`; const lw = x.measureText('LIFT').width;
  text('BOOK', L + lw, 1856, `700 44px ${D}`, P.accent);
  // explain only the marks that actually appear (a record shows ★ instead of ▲)
  const anyUp = shown.some(e => imp.improved.has(e.exId) && !(w.prs || []).includes(e.exId));
  text([prs ? '★ record' : '', anyUp ? '▲ beat last time' : '', 'best set shown'].filter(Boolean).join(' · '), R, 1852, `500 26px ${B}`, P.muted, 'right');
  return new Promise(res => C.toBlob(res, 'image/png'));
}
function shareFileName(w) { return `liftbook-${slug(w.routineName)}-${localISO(w.startedAt)}.png`; }
async function prepareShare() {
  const sh = S.sheet; if (!sh || sh.type !== 'share') return;
  const w = S.workouts.find(x => x.id === sh.id); if (!w) return;
  const theme = S.profile.shareTheme || 'dark', token = {};
  S.shareToken = token; sh.busy = true; sh.error = '';
  try {
    const blob = await makeShareImage(w, theme);
    if (S.shareToken !== token) return;
    if (sh.url) URL.revokeObjectURL(sh.url);
    sh.blob = blob; sh.url = URL.createObjectURL(blob);
  } catch (e) { sh.error = e.message || 'Couldn’t make the image.'; }
  sh.busy = false; if (S.sheet === sh) render();
}
function viewShareSheet() {
  const sh = S.sheet, w = S.workouts.find(x => x.id === sh.id); if (!w) { S.sheet = null; return ''; }
  const theme = S.profile.shareTheme || 'dark';
  return `<div class="row between"><h2>Share workout</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <div class="row between"><span class="small muted">Card style</span><div class="seg" role="group" aria-label="Card style">
      <button data-act="share-theme" data-v="dark" aria-pressed="${theme === 'dark'}">Dark</button><button data-act="share-theme" data-v="light" aria-pressed="${theme === 'light'}">Light</button></div></div>
    <div class="share-preview">${sh.url ? `<img src="${sh.url}" alt="Share image for ${esc(w.routineName)}">` : `<p class="small muted">${sh.error ? esc(sh.error) : 'Making your image…'}</p>`}</div>
    <button class="btn primary lg block" data-act="share-go" ${sh.url ? '' : 'disabled'}>Share image</button>
    <p class="small muted" style="margin:0;text-align:center">Opens your phone’s share menu: Instagram, Messages, Save Image and more. Or press and hold the picture to save it.</p>`;
}
async function shareGo() {
  const sh = S.sheet; if (!sh || !sh.blob) return;
  const w = S.workouts.find(x => x.id === sh.id), name = shareFileName(w);
  const file = new File([sh.blob], name, {type: 'image/png'});
  // share straight from the tap: phones only allow the share menu during a user gesture
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file]}); } catch (e) { if (e.name !== 'AbortError') toast('Couldn’t open the share menu. Press and hold the image to save it.'); }
    return;
  }
  const a = document.createElement('a'); a.href = sh.url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast('Image saved');
}
