// Liftbook — Interval timer (intervals/Tabata, EMOM, AMRAP, for time) and guided mobility holds.
// Classic script: files load in order (see index.html) and share top-level names.

/* One engine: a session is a list of phases {label, sub, secs, kind: 'ready'|'work'|'rest'|'hold'|'open'}.
   Time comes from the clock (Date.now), not from counting ticks, so a backgrounded or throttled
   phone never drifts; on return it simply catches up to the right phase. */
const TIMER_FORMATS = [
  ['intervals', 'Intervals', 'Work and rest, repeated'],
  ['emom', 'EMOM', 'A new round every minute'],
  ['amrap', 'AMRAP', 'As many rounds as possible'],
  ['fortime', 'For time', 'Finish the work, fastest wins']
];
const TIMER_PRESETS = {
  intervals: [['Tabata', {work: 20, rest: 10, rounds: 8}], ['30/30 × 10', {work: 30, rest: 30, rounds: 10}], ['40/20 × 8', {work: 40, rest: 20, rounds: 8}], ['45/15 × 12', {work: 45, rest: 15, rounds: 12}]],
  emom: [['10 min', {minutes: 10}], ['12 min', {minutes: 12}], ['20 min', {minutes: 20}]],
  amrap: [['10 min', {minutes: 10}], ['15 min', {minutes: 15}], ['20 min', {minutes: 20}]],
  fortime: [['No cap', {cap: 0}], ['15 min cap', {cap: 15}], ['20 min cap', {cap: 20}]]
};
// guided stretches: [name, seconds, both sides]
const MOBILITY = {
  warmup: {name: 'Full-body warm-up', items: [['Arm circles', 30], ['Cat-cow', 40], ['World’s greatest stretch', 30, true], ['Leg swings', 30, true], ['Bodyweight squats', 40], ['Glute bridges', 40]]},
  hips: {name: 'Hips and lower back', items: [['Hip flexor stretch', 40, true], ['Pigeon pose', 45, true], ['90/90 hip switches', 40], ['Hamstring stretch', 40, true], ['Child’s pose', 45]]},
  shoulders: {name: 'Shoulders and upper back', items: [['Doorway chest stretch', 40], ['Thread the needle', 30, true], ['Thoracic extension', 40], ['Cross-body shoulder stretch', 30, true], ['Wall slides', 40]]},
  cooldown: {name: 'Post-lift cool-down', items: [['Quad stretch', 30, true], ['Hamstring stretch', 30, true], ['Chest stretch', 30], ['Lat stretch', 30, true], ['Child’s pose', 45]]}
};
const READY_SECS = 10, SWITCH_SECS = 5;

function buildPhases(spec) {
  const ex = i => spec.exercises && spec.exercises.length ? spec.exercises[i % spec.exercises.length] : '';
  const P = [{kind: 'ready', label: 'Get ready', sub: ex(0), secs: READY_SECS}];
  if (spec.kind === 'intervals') {
    for (let r = 0; r < spec.rounds; r++) {
      P.push({kind: 'work', label: 'Work', sub: ex(r), secs: spec.work, round: r + 1});
      if (r < spec.rounds - 1 && spec.rest > 0) P.push({kind: 'rest', label: 'Rest', sub: ex(r + 1) ? `Next: ${ex(r + 1)}` : '', secs: spec.rest, round: r + 1});
    }
  } else if (spec.kind === 'emom') {
    for (let m = 0; m < spec.minutes; m++) P.push({kind: 'work', label: `Minute ${m + 1}`, sub: ex(m), secs: 60, round: m + 1});
  } else if (spec.kind === 'amrap') {
    P.push({kind: 'open', label: 'AMRAP', sub: (spec.exercises || []).join(' · '), secs: spec.minutes * 60});
  } else if (spec.kind === 'fortime') {
    P.push({kind: 'open', label: 'For time', sub: (spec.exercises || []).join(' · '), secs: spec.cap ? spec.cap * 60 : 0, up: true});
  } else if (spec.kind === 'mobility') {
    const hold = spec.hold || null;
    spec.items.forEach(([name, secs, sides], i) => {
      const s = hold || secs;
      if (sides) { P.push({kind: 'hold', label: name, sub: 'Left side', secs: s, round: i + 1}); P.push({kind: 'rest', label: 'Switch sides', sub: name, secs: SWITCH_SECS, round: i + 1}); P.push({kind: 'hold', label: name, sub: 'Right side', secs: s, round: i + 1}); }
      else P.push({kind: 'hold', label: name, sub: '', secs: s, round: i + 1});
      if (i < spec.items.length - 1) P.push({kind: 'rest', label: 'Next', sub: spec.items[i + 1][0], secs: SWITCH_SECS, round: i + 1});
    });
  }
  return P;
}
const totalRounds = spec => spec.kind === 'intervals' ? spec.rounds : spec.kind === 'emom' ? spec.minutes : spec.kind === 'mobility' ? spec.items.length : 0;
function specName(spec) {
  if (spec.kind === 'intervals') return spec.name || `${spec.work}/${spec.rest} × ${spec.rounds}`;
  if (spec.kind === 'emom') return `EMOM ${spec.minutes} min`;
  if (spec.kind === 'amrap') return `AMRAP ${spec.minutes} min`;
  if (spec.kind === 'fortime') return spec.cap ? `For time (${spec.cap} min cap)` : 'For time';
  return spec.name || 'Mobility';
}

/* ---------- running ---------- */
const Timer = {
  start(spec) {
    unlockAudio();
    const phases = buildPhases(spec);
    S.timer = {spec, phases, idx: 0, phaseStart: Date.now(), startedAt: Date.now(), paused: null, rounds: 0, tick: null};
    S.screen = 'timer'; S.sheet = null; render(); wake(); window.scrollTo(0, 0);
  },
  // advance phases by the clock
  update() {
    const t = S.timer; if (!t || t.paused || t.done) return;
    let ph = t.phases[t.idx], changed = false;
    while (ph && ph.secs && !ph.up && Date.now() - t.phaseStart >= ph.secs * 1000) {
      t.phaseStart += ph.secs * 1000; t.idx++; changed = true; ph = t.phases[t.idx];
    }
    if (ph && ph.up && ph.secs && Date.now() - t.phaseStart >= ph.secs * 1000) { this.finish(true); return; }   // for-time cap reached
    if (!ph) { this.finish(true); return; }
    if (changed) { t.tick = null; playSound(); render(); return; }
    const left = ph.up ? null : Math.ceil((ph.secs * 1000 - (Date.now() - t.phaseStart)) / 1000);
    if (left != null && left <= 3 && left >= 1 && t.tick !== left && setting('countdown')) { t.tick = left; playTick(); }
    this.paint();
  },
  paint() {
    const t = S.timer; if (!t) return;
    const ph = t.phases[t.idx]; if (!ph) return;
    const since = (t.paused ? t.paused : Date.now()) - t.phaseStart;
    const big = document.getElementById('tm-big'), bar = document.getElementById('tm-bar'), tot = document.getElementById('tm-total');
    if (big) big.textContent = ph.up ? fmtDur(since / 1000) : fmtDur(Math.max(0, Math.ceil((ph.secs * 1000 - since) / 1000)));
    if (bar) bar.style.width = (ph.up ? (ph.secs ? Math.min(100, since / (ph.secs * 10)) : 0) : Math.min(100, since / (ph.secs * 10))) + '%';
    if (tot) tot.textContent = fmtDur(((t.paused || Date.now()) - t.startedAt) / 1000);
  },
  pause() { const t = S.timer; if (!t || t.paused) return; t.paused = Date.now(); render(); },
  resume() { const t = S.timer; if (!t || !t.paused) return; const gap = Date.now() - t.paused; t.phaseStart += gap; t.startedAt += gap; t.paused = null; render(); },
  skip() { const t = S.timer; if (!t) return; t.idx++; t.phaseStart = Date.now(); t.tick = null; if (!t.phases[t.idx]) this.finish(true); else render(); },
  round() { const t = S.timer; if (!t) return; t.rounds++; if (navigator.vibrate && setting('vibrate')) navigator.vibrate(40); render(); },
  finish(completed) {
    const t = S.timer; if (!t || t.done) return;
    if (t.paused) this.resume();
    t.done = {endedAt: Date.now(), completed, rounds: t.spec.kind === 'amrap' || t.spec.kind === 'fortime' ? t.rounds : Math.min(totalRounds(t.spec), (t.phases[Math.min(t.idx, t.phases.length - 1)] || {}).round || 0)};
    if (completed) playSound();
    release(); render();
  },
  save() {
    const t = S.timer, d = t.done, spec = t.spec;
    const w = {id: newId(), kind: 'activity', exercises: [], unit: unit(), type: spec.kind === 'mobility' ? 'mobility' : 'hiit', routineName: specName(spec),
      startedAt: t.startedAt, endedAt: d.endedAt, rpe: d.rpe || null, notes: (d.notes || '').trim(),
      timer: {kind: spec.kind, rounds: d.rounds, work: spec.work, rest: spec.rest, minutes: spec.minutes, cap: spec.cap, exercises: spec.exercises, completed: d.completed}};
    S.workouts.push(w); S.workouts.sort((a, b) => b.startedAt - a.startedAt); store.saveWorkout(w);
    rememberTimer(spec);
    S.timer = null; S.screen = 'tabs'; S.tab = 'today'; S.day = startOfDay(Date.now()); render(); window.scrollTo(0, 0);
    toast(`${w.routineName} saved`);
  },
  discard() { S.timer = null; S.screen = 'tabs'; release(); render(); }
};
setInterval(() => { if (S.timer && S.screen === 'timer') Timer.update(); }, 200);
// your recent timers, one tap to repeat
function rememberTimer(spec) {
  const key = JSON.stringify({...spec, name: undefined});
  const list = (S.profile.recentTimers || []).filter(x => JSON.stringify({...x, name: undefined}) !== key);
  S.profile.recentTimers = [spec, ...list].slice(0, 5); store.saveProfile();
}

/* ---------- screens ---------- */
function viewTimer() {
  const t = S.timer, spec = t.spec;
  if (t.done) {
    const d = t.done, mins = (d.endedAt - t.startedAt) / 60000;
    return `<div class="wrap timer done">
      <p class="eyebrow" style="margin:0">${d.completed ? 'Done' : 'Stopped early'}</p><h2>${esc(specName(spec))}</h2>
      <div class="stats"><div class="stat"><b class="num">${fmtDur(mins * 60)}</b><span>Time</span></div>
        <div class="stat"><b class="num">${d.rounds}${totalRounds(spec) ? '/' + totalRounds(spec) : ''}</b><span>${spec.kind === 'mobility' ? 'Stretches' : 'Rounds'}</span></div>
        <div class="stat"><b class="num">${spec.kind === 'intervals' ? spec.work + '/' + spec.rest : spec.kind === 'mobility' ? (spec.hold || '—') : spec.minutes || spec.cap || '—'}</b><span>${spec.kind === 'intervals' ? 'Work/rest s' : spec.kind === 'mobility' ? 'Hold s' : 'Minutes'}</span></div></div>
      ${spec.kind === 'fortime' || spec.kind === 'amrap' ? `<div class="row between"><span>Rounds completed</span><div class="row" style="gap:6px"><button class="btn" data-act="tm-rounds" data-v="-1">−</button><b class="num" style="min-width:28px;text-align:center">${d.rounds}</b><button class="btn" data-act="tm-rounds" data-v="1">+</button></div></div>` : ''}
      ${rpePicker('timer', d.rpe)}
      <label class="field">Notes (optional)<input id="tm-notes" data-in="tm-notes" value="${esc(d.notes || '')}" placeholder="Scaled to box jumps, felt strong"></label>
      <button class="btn primary lg block" data-act="tm-save">Save to log</button>
      <button class="btn danger block ${S.armed === 'tmdiscard' ? 'armed' : ''}" data-act="tm-discard">${S.armed === 'tmdiscard' ? 'Tap again to discard' : 'Discard'}</button></div>`;
  }
  const ph = t.phases[t.idx] || t.phases[t.phases.length - 1], next = t.phases[t.idx + 1];
  const tot = totalRounds(spec), open = spec.kind === 'amrap' || spec.kind === 'fortime';
  return `<div class="wrap timer ${ph.kind}">
    <div class="row between"><button class="btn ghost" data-act="tm-end" style="padding-left:0">End</button>
      <span class="small muted">${esc(specName(spec))} · <span class="num" id="tm-total">${fmtDur((Date.now() - t.startedAt) / 1000)}</span></span><span style="width:48px"></span></div>
    <div class="tm-face">
      <p class="tm-label">${esc(ph.label)}</p>
      <div class="tm-big num" id="tm-big">${ph.up ? '0:00' : fmtDur(ph.secs)}</div>
      ${ph.sub ? `<p class="tm-sub">${esc(ph.sub)}</p>` : ''}
      ${tot && ph.round ? `<p class="tm-round num">${spec.kind === 'mobility' ? 'Stretch' : 'Round'} ${ph.round} of ${tot}</p>` : ''}
      ${open ? `<p class="tm-round num">${t.rounds} round${t.rounds === 1 ? '' : 's'}</p>` : ''}
      <div class="tm-track"><div class="tm-fill" id="tm-bar"></div></div>
      ${next && !open ? `<p class="small muted" style="margin:0">Next: ${esc(next.label)}${next.secs ? ` · ${fmtDur(next.secs)}` : ''}</p>` : ''}
    </div>
    ${open ? `<button class="btn primary tm-plus" data-act="tm-round">+1 round</button>` : ''}
    <div class="tm-controls">
      ${t.paused ? '<button class="btn primary lg" data-act="tm-resume">Resume</button>' : '<button class="btn lg" data-act="tm-pause">Pause</button>'}
      ${open ? '<button class="btn lg" data-act="tm-finish">Finish</button>' : '<button class="btn lg" data-act="tm-skip">Skip</button>'}
    </div>
    ${t.paused ? '' : '<p class="small muted" style="text-align:center;margin:0">Keep this screen open: sounds can’t play while the phone is locked.</p>'}
  </div>`;
}
function viewTimerSetup() {
  const sh = S.sheet, kind = sh.kind || 'intervals', v = sh.vals;
  const recents = (S.profile.recentTimers || []).filter(x => x.kind !== 'mobility');
  const num = (k, label, ph) => `<label class="field grow">${label}<input id="ts-${k}" data-in="ts" data-k="${k}" inputmode="numeric" value="${v[k] ?? ''}" placeholder="${ph}"></label>`;
  const fields = kind === 'intervals' ? `<div class="row">${num('work', 'Work (s)', '20')}${num('rest', 'Rest (s)', '10')}${num('rounds', 'Rounds', '8')}</div>`
    : kind === 'fortime' ? `<div class="row">${num('cap', 'Time cap (min, optional)', '0')}</div>` : `<div class="row">${num('minutes', 'Minutes', '10')}</div>`;
  const total = kind === 'intervals' ? (v.work || 0) * (v.rounds || 0) + (v.rest || 0) * Math.max(0, (v.rounds || 0) - 1) : kind === 'fortime' ? (v.cap || 0) * 60 : (v.minutes || 0) * 60;
  return `<div class="row between"><h2>Interval timer</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    ${recents.length ? `<div class="stack" style="gap:6px"><p class="eyebrow" style="margin:0">Recent</p><div class="chips">${recents.map((r, i) => `<button class="chipbtn" data-act="ts-recent" data-v="${i}">${esc(specName(r))}</button>`).join('')}</div></div>` : ''}
    <div class="seg tabs4" role="group" aria-label="Format">${TIMER_FORMATS.map(([k, l]) => `<button data-act="ts-kind" data-v="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>
    <p class="small muted" style="margin:0">${TIMER_FORMATS.find(f => f[0] === kind)[2]}.</p>
    <div class="chips">${TIMER_PRESETS[kind].map(([l, p]) => `<button class="chipbtn" data-act="ts-preset" data-v="${esc(JSON.stringify(p))}" aria-pressed="${Object.entries(p).every(([k, x]) => v[k] === x)}">${l}</button>`).join('')}</div>
    ${fields}
    <label class="field">Exercises (optional, one per line)<textarea id="ts-ex" data-in="ts-ex" rows="3" class="note-in" placeholder="${kind === 'emom' ? '10 burpees\n15 kettlebell swings' : kind === 'intervals' ? 'Mountain climbers\nJump squats' : '5 pull-ups\n10 push-ups\n15 air squats'}">${esc(v.exText || '')}</textarea></label>
    <p class="small muted" style="margin:0">${kind === 'intervals' ? 'Exercises rotate through the work intervals.' : kind === 'emom' ? 'Exercises rotate through the minutes.' : 'Shown on screen while you go.'}${total ? ` Total about ${fmtDur(total + READY_SECS)}.` : ''}</p>
    <button class="btn primary lg block" data-act="ts-start">Start</button>`;
}
function viewMobilitySetup() {
  const sh = S.sheet, hold = sh.hold || 0;
  return `<div class="row between"><h2>Mobility and stretching</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <p class="small muted" style="margin:0">Pick a routine. The timer counts each hold and tells you what’s next, sides included.</p>
    <div class="stack" style="gap:8px">${Object.entries(MOBILITY).map(([k, r]) => {
      const secs = r.items.reduce((s, [, sec, sides]) => s + (hold || sec) * (sides ? 2 : 1) + (sides ? SWITCH_SECS : 0), 0) + (r.items.length - 1) * SWITCH_SECS + READY_SECS;
      return `<button class="hitem" data-act="mob-start" data-v="${k}"><div class="row between" style="width:100%"><h3>${esc(r.name)}</h3><span class="small muted num">${Math.round(secs / 60)} min</span></div>
        <span class="small muted">${r.items.map(i => esc(i[0])).join(' · ')}</span></button>`; }).join('')}</div>
    <div class="set-row"><span>Hold length</span><div class="seg" role="group" aria-label="Hold length">${[[0, 'As listed'], [30, '30 s'], [45, '45 s'], [60, '60 s']].map(([s, l]) => `<button data-act="mob-hold" data-v="${s}" aria-pressed="${hold === s}">${l}</button>`).join('')}</div></div>`;
}
function timerSpecFromSheet() {
  const sh = S.sheet, v = sh.vals, kind = sh.kind || 'intervals';
  const exercises = (v.exText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);
  if (kind === 'intervals') {
    if (!(v.work >= 5 && v.work <= 600) || !(v.rest >= 0 && v.rest <= 600) || !(v.rounds >= 1 && v.rounds <= 100)) return {err: 'Work needs 5–600 seconds, rest 0–600, and 1–100 rounds.'};
    return {kind, work: v.work, rest: v.rest, rounds: v.rounds, exercises, name: v.work === 20 && v.rest === 10 && v.rounds === 8 ? 'Tabata' : ''};
  }
  if (kind === 'fortime') return {kind, cap: v.cap > 0 ? Math.min(v.cap, 180) : 0, exercises};
  if (!(v.minutes >= 1 && v.minutes <= 120)) return {err: 'Choose between 1 and 120 minutes.'};
  return {kind, minutes: v.minutes, exercises};
}
