// Liftbook — Progression math, the live workout, rest timer and toasts.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- training math ---------- */
const unit = () => S.profile.unit;
function conv(w, from) {
  if (w == null || w === '') return null;
  const to = unit(); if (!from || from === to) return w;
  return r05(from === 'kg' ? w * 2.20462 : w / 2.20462);
}
const working = e => (e.sets || []).filter(s => s.done && !s.warm);
function lastPerf(exId, before = Infinity, skipId = null) {
  for (const w of S.workouts) {
    if (w.id === skipId || w.startedAt >= before) continue;
    const e = w.exercises.find(x => x.exId === exId);
    if (e && working(e).length) return {w, e, sets: working(e)};
  }
  return null;
}
const e1rm = (w, r) => (!(w > 0) || !(r > 0)) ? 0 : (r === 1 ? w : w * (1 + r / 30));
function increment(ex) {
  const big = ex.kind === 'barbell' && LOWER.has(ex.muscle);
  return unit() === 'kg' ? (big ? 5 : 2.5) : (big ? 10 : 5);
}
const rangeText = ex => ex.repMin === ex.repMax ? `${ex.repMax}` : `${ex.repMin}–${ex.repMax}`;
function suggest(ex) {
  const id = ex.id || ex.exId, last = lastPerf(id), u = unit();
  if (!last) return {tone:'new', w:null, text: ex.timed ? `First time. Hold each set ${rangeText(ex)} seconds.` : `First time. Pick a weight you can do for ${rangeText(ex)} reps with 1–2 left in the tank.`};
  const reps = last.sets.map(s => s.r || 0);
  const top = Math.max(0, ...last.sets.map(s => conv(s.w, last.w.unit) || 0));
  const target = ex.sets || ex.target || 3;
  const allTop = last.sets.length >= target && reps.every(r => r >= ex.repMax);
  const anyLow = reps.some(r => r < ex.repMin);
  if (ex.timed) return allTop ? {tone:'up', w:null, text:`Held ${ex.repMax}s every set last time. Try ${ex.repMax + 10}s.`} : {tone:'hold', w:null, text:`Last time: ${reps.join(', ')}s. Beat one of them.`};
  if (!top) return allTop ? {tone:'up', w:null, text:`Top of the range on every set. Add reps or hold a weight.`} : {tone:'hold', w:null, text:`Last time: ${reps.join(', ')} reps. Add a rep to any set.`};
  if (allTop) { const nw = top + increment(ex); return {tone:'up', w:nw, text:`You hit ${ex.repMax} on every set. Go up to ${fmtW(nw)} ${u}.`}; }
  if (anyLow) return {tone:'hold', w:top, text:`Stay at ${fmtW(top)} ${u} until every set reaches ${ex.repMin}.`};
  return {tone:'hold', w:top, text:`Stay at ${fmtW(top)} ${u} and add a rep to any set.`};
}
function volume(w) {
  let v = 0, sets = 0;
  for (const e of w.exercises) for (const s of working(e)) { sets++; if (!e.timed) v += (conv(s.w, w.unit) || 0) * (s.r || 0); }
  return {v, sets};
}
function platesFor(total) {
  const u = unit(), bar = Number(S.profile.bar) || (u === 'kg' ? 20 : 45);
  if (!(total > bar)) return null;
  const sizes = u === 'kg' ? [25,20,15,10,5,2.5,1.25] : [45,35,25,10,5,2.5];
  let side = (total - bar) / 2; const out = [];
  for (const p of sizes) while (side >= p - 1e-9) { out.push(p); side -= p; }
  return {plates: out, left: Math.round(side * 2 * 100) / 100, bar};
}
const PLATE_STYLE = {
  lb: {45:['--plate-blue',38],35:['--plate-yellow',34],25:['--plate-green',30],10:['--plate-white',22],5:['--plate-black',18],2.5:['--plate-red',14]},
  kg: {25:['--plate-red',38],20:['--plate-blue',38],15:['--plate-yellow',34],10:['--plate-green',30],5:['--plate-white',22],2.5:['--plate-red',16],1.25:['--plate-white',13]}
};
function platesHTML(w) {
  const r = platesFor(w); if (!r) return '';
  const st = PLATE_STYLE[unit()];
  const pl = r.plates.map(p => `<span class="plate" style="height:${st[p][1]}px;background:var(${st[p][0]})"></span>`).join('');
  return `<div class="bar" aria-hidden="true"><span class="shaft"></span><span class="collar"></span>${pl}</div>
    <span>${fmtW(w)} ${unit()}: <b>${r.plates.length ? r.plates.map(fmtW).join(' + ') : 'empty bar'}</b> per side${r.left ? ` <span class="small">(${fmtW(r.left)} left over)</span>` : ''}</span>`;
}
function nextRoutine() {
  if (!S.program) return null;
  const rs = S.program.routines; if (!rs.length) return null;
  const last = S.workouts.find(w => rs.some(r => r.id === w.routineId));
  if (!last) return rs[0];
  const i = rs.findIndex(r => r.id === last.routineId);
  return rs[(i + 1) % rs.length];
}
function libraryExercises() {
  const map = new Map();
  if (S.program) for (const r of S.program.routines) for (const ex of r.exercises) if (!map.has(ex.id)) map.set(ex.id, ex);
  for (const r of TEMPLATE.routines) for (const ex of r.exercises) if (!map.has(ex.id)) map.set(ex.id, ex);
  for (const ex of CATALOG) if (!map.has(ex.id)) map.set(ex.id, ex);
  for (const w of S.workouts) for (const e of w.exercises) if (!map.has(e.exId)) map.set(e.exId, {id:e.exId, name:e.name, sets:e.target||3, repMin:e.repMin, repMax:e.repMax, kind:e.kind, muscle:e.muscle, rest:e.rest, timed:e.timed});
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- live workout ---------- */
function buildEx(ex) {
  const sug = suggest(ex), last = lastPerf(ex.id);
  return {
    exId: ex.id, name: ex.name, kind: ex.kind, muscle: ex.muscle, repMin: ex.repMin, repMax: ex.repMax,
    rest: ex.rest || 90, timed: !!ex.timed, target: ex.sets, hint: sug, muscles: ex.muscles, cue: ex.cue || '',
    sets: Array.from({length: ex.sets}, (_, i) => ({
      w: ex.timed ? null : (sug.w ?? (last && last.sets[i] ? conv(last.sets[i].w, last.w.unit) : null)),
      r: null, done: false, warm: false }))
  };
}
function startWorkout(routineId) {
  if (S.active) { S.screen = 'workout'; render(); return; }
  const rt = S.program && S.program.routines.find(r => r.id === routineId); if (!rt) return;
  S.active = {id:newId(), routineId:rt.id, routineName:rt.name, unit:unit(), startedAt:Date.now(), exercises: rt.exercises.map(buildEx)};
  S.screen = 'workout'; S.menuEx = null;
  store.saveActive(); render(); window.scrollTo(0, 0); wake();
}
function prevFor(e, i) {
  const last = lastPerf(e.exId, S.active ? S.active.startedAt : Infinity, S.active && S.active.id);
  if (!last) return null;
  const s = last.sets[i] || null; if (!s) return null;
  return {w: conv(s.w, last.w.unit), r: s.r};
}
function repsPlaceholder(e, i) { const p = prevFor(e, i); return p && p.r ? p.r : e.repMax; }
function toggleSet(ei, si) {
  const e = S.active.exercises[ei], s = e.sets[si];
  if (!s.done) {
    if (s.r == null || s.r === '') s.r = repsPlaceholder(e, si);
    if ((s.w == null || s.w === '') && !e.timed) {
      const before = e.sets.slice(0, si).map(x => x.w).filter(x => x > 0).pop();
      const p = prevFor(e, si);
      s.w = before ?? (p && p.w ? p.w : null);
    }
    if (!(s.r > 0)) { toast('Enter reps first'); return; }
    s.done = true; if (setting('autoRest')) startRest(e.rest);
  } else s.done = false;
  saveActiveSoon(); render();
}
function finishWorkout() {
  const a = S.active;
  const exercises = a.exercises.map(e => ({...e, hint: undefined, sets: e.sets.filter(s => s.done)})).filter(e => e.sets.length);
  exercises.forEach(e => delete e.hint);
  if (!exercises.length) { toast('Complete at least one set, or discard the workout.'); return; }
  const w = {...a, exercises, endedAt: Date.now()};
  const prs = [];
  for (const e of exercises) {
    if (e.timed) continue;
    let best = null;
    for (const s of working(e)) { const v = e1rm(conv(s.w, w.unit), s.r); if (!best || v > best.v) best = {v, s}; }
    if (!best || !best.v) continue;
    let prior = 0, seen = false;
    for (const o of S.workouts) { const oe = o.exercises.find(x => x.exId === e.exId); if (!oe) continue; seen = true; for (const s of working(oe)) prior = Math.max(prior, e1rm(conv(s.w, o.unit), s.r)); }
    if (seen && best.v > prior + 0.01) prs.push({exId:e.exId, name:e.name, w:best.s.w, r:best.s.r, e1:best.v, prev:prior});
  }
  w.prs = prs.map(p => p.exId);
  S.workouts.unshift(w); S.workouts.sort((x, y) => y.startedAt - x.startedAt);
  S.active = null; S.rest = null; S.sheet = null; S.screen = 'tabs'; S.tab = 'today';
  S.summary = {id: w.id, prs};
  clearTimeout(debounced.active); delete pending.active;
  store.saveWorkout(w); store.saveActive();
  release(); render(); window.scrollTo(0, 0);
}
function discardWorkout() {
  S.active = null; S.rest = null; S.sheet = null; S.screen = 'tabs';
  clearTimeout(debounced.active); delete pending.active; store.saveActive(); release(); render(); toast('Workout discarded');
}

/* ---------- rest timer, sound, wake lock ---------- */
let audio = null;
function unlockAudio() { try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch {} }
// rest is over: the chosen sound (see js/settings.js) and, where phones allow it, a buzz
function beep() {
  try { if (setting('vibrate') && canVibrate()) navigator.vibrate([200, 100, 200]); } catch {}
  playSound();
}
function startRest(sec) { S.rest = {endAt: Date.now() + sec * 1000, total: sec, rang: false}; }
let lock = null;
async function wake() { if (!setting('keepAwake')) return; try { if (navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch {} }
function release() { try { lock && lock.release(); } catch {} lock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.active) wake(); });

setInterval(() => {
  if (S.active) { const el = document.getElementById('clock'); if (el) el.textContent = fmtDur((Date.now() - S.active.startedAt) / 1000);
    const rb = document.getElementById('resume-clock'); if (rb) rb.textContent = fmtDur((Date.now() - S.active.startedAt) / 1000); }
  if (S.rest) {
    const left = (S.rest.endAt - Date.now()) / 1000;
    if (left <= 0 && !S.rest.rang) { S.rest.rang = true; beep(); }
    // countdown: one tick at 3, 2 and 1 seconds left
    const sec = Math.ceil(left);
    if (setting('countdown') && sec >= 1 && sec <= 3 && S.rest.tick !== sec) { S.rest.tick = sec; playTick(); }
    if (left < -20) { S.rest = null; render(); return; }
    const t = document.getElementById('rest-t'), f = document.getElementById('rest-f'), box = document.getElementById('rest');
    if (t) t.textContent = left > 0 ? fmtDur(Math.ceil(left)) : 'Go';
    if (f) f.style.width = Math.min(100, Math.max(0, 100 * (1 - left / S.rest.total))) + '%';
    if (box) box.classList.toggle('over', left <= 0);
  }
}, 250);

/* ---------- toast ---------- */
let toastT;
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
