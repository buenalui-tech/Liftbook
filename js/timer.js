// Liftbook — Interval timer (intervals/Tabata, EMOM, AMRAP, for time) and guided mobility holds.
// Classic script: files load in order (see index.html) and share top-level names.

/* One engine: a session is a list of phases {label, sub, secs, kind: 'ready'|'work'|'rest'|'hold'|'open'}.
   Time comes from the clock (Date.now), not from counting ticks, so a backgrounded or throttled
   phone never drifts; on return it simply catches up to the right phase. */
const TIMER_FORMATS = [
  ['intervals', 'Intervals', 'Work and rest, repeated. Any split you like'],
  ['custom', 'Custom', 'Warm-up, steps at different efforts, cool-down'],
  ['emom', 'EMOM', 'A new round every minute'],
  ['amrap', 'AMRAP', 'As many rounds as possible'],
  ['fortime', 'For time', 'Finish the work, fastest wins']
];
// effort levels for custom steps; each has its own color on the timer face and its own spoken word
const LEVELS = {
  easy: {name: 'Easy', say: 'easy'},
  moderate: {name: 'Moderate', say: 'moderate'},
  hard: {name: 'Hard', say: 'hard'},
  max: {name: 'All-out', say: 'all out'}
};
const mkStep = (label, secs, level) => ({label, secs, level, target: ''});
const TIMER_PRESETS = {
  intervals: [['Tabata 20/10', {work: 20, rest: 10, rounds: 8}], ['20/40 × 10', {work: 20, rest: 40, rounds: 10}], ['30/30 × 10', {work: 30, rest: 30, rounds: 10}],
    ['40/20 × 8', {work: 40, rest: 20, rounds: 8}], ['45/15 × 12', {work: 45, rest: 15, rounds: 12}]],
  custom: [
    ['Sprints', {warmup: 3, cooldown: 3, rounds: 8, steps: [mkStep('Sprint', 30, 'max'), mkStep('Recover', 90, 'easy')]}],
    ['Ramp', {warmup: 3, cooldown: 3, rounds: 5, steps: [mkStep('Steady', 60, 'moderate'), mkStep('Push', 60, 'hard'), mkStep('Sprint', 30, 'max'), mkStep('Recover', 90, 'easy')]}],
    ['Pyramid', {warmup: 3, cooldown: 3, rounds: 1, steps: [mkStep('Hard', 30, 'hard'), mkStep('Easy', 30, 'easy'), mkStep('Hard', 60, 'hard'), mkStep('Easy', 60, 'easy'), mkStep('Hard', 90, 'hard'), mkStep('Easy', 90, 'easy'), mkStep('Hard', 60, 'hard'), mkStep('Easy', 60, 'easy'), mkStep('Hard', 30, 'hard')]}],
    ['4 × 4', {warmup: 5, cooldown: 5, rounds: 4, steps: [mkStep('Hard', 240, 'hard'), mkStep('Recover', 180, 'easy')]}]
  ],
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

// "90" → "1 minute 30", for the spoken prompts
function secsWords(s) {
  const m = Math.floor(s / 60), x = s % 60;
  if (!m) return `${x} seconds`;
  return `${m} minute${m === 1 ? '' : 's'}${x ? ` ${x}` : ''}`;
}
// how a custom step is named out loud: "Sprint, all out"; the level alone when the name is the level
const stepWords = (label, level) => label && label.toLowerCase() !== LEVELS[level].name.toLowerCase() ? `${label}, ${LEVELS[level].say}` : LEVELS[level].say;

/* Every phase carries what to show (label, sub), what to say when it starts (say),
   and a short name used for "10 seconds. Next, sprint, all out" (short). */
function buildPhases(spec) {
  const ex = i => spec.exercises && spec.exercises.length ? spec.exercises[i % spec.exercises.length] : '';
  const P = [{kind: 'ready', label: 'Get ready', sub: ex(0), secs: READY_SECS}];
  if (spec.kind === 'intervals') {
    for (let r = 0; r < spec.rounds; r++) {
      P.push({kind: 'work', label: 'Work', sub: ex(r), secs: spec.work, round: r + 1, say: `Go. ${secsWords(spec.work)}${ex(r) ? `. ${ex(r)}` : ''}`, short: ex(r) ? `work, ${ex(r)}` : 'work'});
      if (r < spec.rounds - 1 && spec.rest > 0) P.push({kind: 'rest', label: 'Rest', sub: ex(r + 1) ? `Next: ${ex(r + 1)}` : '', secs: spec.rest, round: r + 1, say: `Rest${ex(r + 1) ? `. Next, ${ex(r + 1)}` : ''}`, short: 'rest'});
    }
  } else if (spec.kind === 'custom') {
    if (spec.warmup > 0) P.push({kind: 'easy', level: 'easy', label: 'Warm-up', sub: 'Easy pace', secs: spec.warmup, say: `Warm-up. Easy pace, ${secsWords(spec.warmup)}`, short: 'warm-up'});
    for (let r = 0; r < spec.rounds; r++) spec.steps.forEach((s, i) => {
      // the last easy step of the last round would just run into the cool-down
      if (r === spec.rounds - 1 && i === spec.steps.length - 1 && s.level === 'easy' && spec.cooldown > 0 && spec.steps.length > 1) return;
      const w = stepWords(s.label, s.level);
      P.push({kind: s.level, level: s.level, label: s.label || LEVELS[s.level].name, sub: s.target || '', secs: s.secs, round: r + 1,
        say: `${w}. ${secsWords(s.secs)}${s.target ? `. ${s.target}` : ''}`, short: w});
    });
    if (spec.cooldown > 0) P.push({kind: 'easy', level: 'easy', label: 'Cool-down', sub: 'Easy pace', secs: spec.cooldown, say: `Cool-down. Easy pace, ${secsWords(spec.cooldown)}`, short: 'cool-down'});
  } else if (spec.kind === 'emom') {
    for (let m = 0; m < spec.minutes; m++) P.push({kind: 'work', label: `Minute ${m + 1}`, sub: ex(m), secs: 60, round: m + 1, say: `Minute ${m + 1}${ex(m) ? `. ${ex(m)}` : ''}`, short: `minute ${m + 1}`});
  } else if (spec.kind === 'amrap') {
    P.push({kind: 'open', label: 'AMRAP', sub: (spec.exercises || []).join(' · '), secs: spec.minutes * 60, say: `Go. ${spec.minutes} minutes, as many rounds as you can`});
  } else if (spec.kind === 'fortime') {
    P.push({kind: 'open', label: 'For time', sub: (spec.exercises || []).join(' · '), secs: spec.cap ? spec.cap * 60 : 0, up: true, say: 'Go'});
  } else if (spec.kind === 'mobility') {
    const hold = spec.hold || null;
    spec.items.forEach(([name, secs, sides], i) => {
      const s = hold || secs;
      if (sides) {
        P.push({kind: 'hold', label: name, sub: 'Left side', secs: s, round: i + 1, say: `${name}, left side`, short: name});
        P.push({kind: 'rest', label: 'Switch sides', sub: name, secs: SWITCH_SECS, round: i + 1, say: 'Switch sides', short: 'switch sides'});
        P.push({kind: 'hold', label: name, sub: 'Right side', secs: s, round: i + 1, say: 'Right side', short: 'right side'});
      } else P.push({kind: 'hold', label: name, sub: '', secs: s, round: i + 1, say: name, short: name});
      if (i < spec.items.length - 1) P.push({kind: 'rest', label: 'Next', sub: spec.items[i + 1][0], secs: SWITCH_SECS, round: i + 1, say: `Next, ${spec.items[i + 1][0]}`, short: 'next stretch'});
    });
  }
  P[0].say = P[1] && P[1].short ? `Get ready. First, ${P[1].short}` : 'Get ready';
  return P;
}
const totalRounds = spec => spec.kind === 'intervals' || spec.kind === 'custom' ? spec.rounds : spec.kind === 'emom' ? spec.minutes : spec.kind === 'mobility' ? spec.items.length : 0;
const specSecs = spec => buildPhases(spec).reduce((s, p) => s + (p.kind === 'ready' ? 0 : p.secs || 0), 0);
function specName(spec) {
  if (spec.name) return spec.name;
  if (spec.kind === 'intervals') return `${spec.work}/${spec.rest} × ${spec.rounds}`;
  if (spec.kind === 'custom') return 'Custom intervals';
  if (spec.kind === 'emom') return `EMOM ${spec.minutes} min`;
  if (spec.kind === 'amrap') return `AMRAP ${spec.minutes} min`;
  if (spec.kind === 'fortime') return spec.cap ? `For time (${spec.cap} min cap)` : 'For time';
  return 'Mobility';
}
// one line describing the session, for program days and the log
function specDetail(spec) {
  if (spec.kind === 'intervals') return `${spec.work} s work / ${spec.rest} s rest × ${spec.rounds}`;
  if (spec.kind === 'custom') return `${spec.rounds} × ${spec.steps.map(s => `${s.label || LEVELS[s.level].name} ${fmtDur(s.secs)}`).join(' / ')}${spec.warmup || spec.cooldown ? ' + warm-up and cool-down' : ''}`;
  if (spec.kind === 'fortime') return spec.cap ? `${spec.cap} min cap` : 'No time cap';
  if (spec.kind === 'mobility') return `${spec.items.length} stretches`;
  return `${spec.minutes} min`;
}
// the session written out, for Today's "Up next" card
function timerOutline(spec) {
  const li = (nm, tg, ht, lv) => `<li><span class="nm">${esc(nm)}</span><span class="tg num">${tg}</span>${ht ? `<span class="ht ${lv ? 'lv-' + lv : ''}">${esc(ht)}</span>` : ''}</li>`;
  if (spec.kind !== 'custom') return li(specName(spec), fmtDur(specSecs(spec)), specDetail(spec));
  return [spec.warmup ? li('Warm-up', fmtDur(spec.warmup), 'Easy', 'easy') : '',
    `<li class="grp"><span class="nm small muted">${spec.rounds > 1 ? `${spec.rounds} rounds of` : 'Once through'}</span></li>`,
    ...spec.steps.map(s => li(s.label || LEVELS[s.level].name, fmtDur(s.secs), [LEVELS[s.level].name, s.target].filter(Boolean).join(' · '), s.level)),
    spec.cooldown ? li('Cool-down', fmtDur(spec.cooldown), 'Easy', 'easy') : ''].join('');
}

/* ---------- spoken prompts (the phone's built-in voice; nothing to download) ---------- */
const Voice = {
  ok: () => setting('voice') && typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
  pick() {
    if (this.voice !== undefined) return this.voice;
    try {
      const vs = speechSynthesis.getVoices(); if (!vs.length) return null;
      const lang = (navigator.language || 'en').toLowerCase();
      this.voice = vs.find(v => v.lang.toLowerCase() === lang && v.localService) || vs.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) || null;
    } catch { this.voice = null; }
    return this.voice;
  },
  say(text) {
    if (!text || !this.ok()) return false;
    try {
      const u = new SpeechSynthesisUtterance(text), v = this.pick();
      if (v) u.voice = v;
      u.rate = 1.05; u.volume = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  }
};

/* ---------- running ---------- */
/* ctx says where the result goes: {attach: true} adds it to the lifting workout in progress (a finisher);
   {routineId, routineName} logs it as that program day; nothing logs a standalone activity. */
const Timer = {
  start(spec, ctx = {}) {
    unlockAudio();
    const phases = buildPhases(spec);
    S.timer = {spec, ctx, phases, idx: 0, phaseStart: Date.now(), startedAt: Date.now(), paused: null, rounds: 0, tick: null};
    S.screen = 'timer'; S.sheet = null; render(); wake(); window.scrollTo(0, 0);
    Voice.say(phases[0].say);   // inside the tap, which is what lets iPhone speak at all
  },
  // a new phase: say it out loud, or play the sound when spoken prompts are off
  announce(ph) { if (!Voice.say(ph.say)) playSound(); },
  // advance phases by the clock
  update() {
    const t = S.timer; if (!t || t.paused || t.done) return;
    let ph = t.phases[t.idx], changed = false;
    while (ph && ph.secs && !ph.up && Date.now() - t.phaseStart >= ph.secs * 1000) {
      t.phaseStart += ph.secs * 1000; t.idx++; changed = true; ph = t.phases[t.idx];
    }
    if (ph && ph.up && ph.secs && Date.now() - t.phaseStart >= ph.secs * 1000) { this.finish(true); return; }   // for-time cap reached
    if (!ph) { this.finish(true); return; }
    if (changed) { t.tick = null; this.announce(ph); render(); return; }
    const since = Date.now() - t.phaseStart, left = ph.up ? null : Math.ceil((ph.secs * 1000 - since) / 1000);
    if (left != null && ph.kind !== 'ready' && Voice.ok() && t.said !== `${t.idx}:${left}`) {
      const next = t.phases[t.idx + 1];
      // heads-up before the change, so you know whether to speed up or back off
      if (left === 10 && ph.secs >= 30) { t.said = `${t.idx}:10`; Voice.say(next && next.short ? `10 seconds. Next, ${next.short}` : '10 seconds left'); }
      else if (left === 60 && ph.secs >= 150) { t.said = `${t.idx}:60`; Voice.say('One minute left'); }
      else if (ph.secs >= 120 && ph.secs % 2 === 0 && left === ph.secs / 2) { t.said = `${t.idx}:${left}`; Voice.say('Halfway'); }
    }
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
  skip() { const t = S.timer; if (!t) return; t.idx++; t.phaseStart = Date.now(); t.tick = null; const ph = t.phases[t.idx]; if (!ph) this.finish(true); else { this.announce(ph); render(); } },
  // stretch or shorten the phase you're in (never below what has already run)
  adjust(d) {
    const t = S.timer; if (!t || t.done) return;
    const ph = t.phases[t.idx]; if (!ph || ph.up || !ph.secs) return;
    const ran = Math.ceil(((t.paused || Date.now()) - t.phaseStart) / 1000);
    t.phases = t.phases.slice(); t.phases[t.idx] = {...ph, secs: Math.max(ran + 1, ph.secs + d)}; t.tick = null;
    this.paint();
  },
  round() { const t = S.timer; if (!t) return; t.rounds++; if (navigator.vibrate && setting('vibrate')) navigator.vibrate(40); render(); },
  finish(completed) {
    const t = S.timer; if (!t || t.done) return;
    if (t.paused) this.resume();
    const now = Date.now(), open = t.spec.kind === 'amrap' || t.spec.kind === 'fortime';
    let reached = 0, hardSecs = 0;
    t.phases.forEach((p, i) => {
      if (i > t.idx) return;
      if (p.round) reached = Math.max(reached, p.round);
      if (p.level === 'hard' || p.level === 'max') hardSecs += i < t.idx ? p.secs : Math.min(p.secs, (now - t.phaseStart) / 1000);
    });
    t.done = {endedAt: now, completed, hardSecs: Math.round(hardSecs), rounds: open ? t.rounds : completed ? totalRounds(t.spec) : Math.min(totalRounds(t.spec), reached)};
    if (completed && !Voice.say('Done. Nice work.')) playSound();
    if (!S.active) release();
    render();
  },
  // what gets stored: enough to show it in the log and to run it again
  result() {
    const t = S.timer, d = t.done, spec = t.spec;
    return {kind: spec.kind, name: specName(spec), rounds: d.rounds, completed: d.completed, hardSecs: d.hardSecs || 0,
      secs: Math.round((d.endedAt - t.startedAt) / 1000), spec};
  },
  save() {
    const t = S.timer, d = t.done, spec = t.spec, r = this.result();
    if (spec.kind !== 'mobility') rememberTimer(spec);
    if (t.ctx.attach && S.active) {
      S.active.conditioning = r; store.saveActive();
      S.timer = null; S.screen = 'workout'; render(); window.scrollTo(0, document.body.scrollHeight); wake();
      toast(`${r.name} added to your workout`); return;
    }
    const w = {id: newId(), kind: 'activity', exercises: [], unit: unit(), type: spec.kind === 'mobility' ? 'mobility' : 'hiit',
      routineId: t.ctx.routineId || null, routineName: t.ctx.routineName || r.name,
      startedAt: t.startedAt, endedAt: d.endedAt, rpe: d.rpe || null, notes: (d.notes || '').trim(),
      timer: {...r, work: spec.work, rest: spec.rest, minutes: spec.minutes, cap: spec.cap, exercises: spec.exercises}};
    S.workouts.push(w); S.workouts.sort((a, b) => b.startedAt - a.startedAt); store.saveWorkout(w);
    S.timer = null; S.screen = 'tabs'; S.tab = 'today'; S.day = startOfDay(Date.now()); render(); window.scrollTo(0, 0);
    toast(`${w.routineName} saved`);
  },
  discard() {
    const back = S.timer && S.timer.ctx.attach && S.active;
    S.timer = null; S.screen = back ? 'workout' : 'tabs';
    if (back) wake(); else release();
    render();
  }
};
setInterval(() => { if (S.timer && S.screen === 'timer') Timer.update(); }, 200);
// your recent timers, one tap to load
function rememberTimer(spec) {
  const key = JSON.stringify({...spec, name: undefined});
  const list = (S.profile.recentTimers || []).filter(x => JSON.stringify({...x, name: undefined}) !== key);
  S.profile.recentTimers = [spec, ...list].slice(0, 5); store.saveProfile();
}

/* ---------- the setup sheet: values ⇄ a timer spec ---------- */
const DEFAULT_STEPS = () => [mkStep('Sprint', 30, 'max'), mkStep('Recover', 90, 'easy')];
function specToSheet(spec) {
  const v = {work: 20, rest: 10, rounds: 8, minutes: 12, cap: 0, exText: '', warmup: 3, cooldown: 3, steps: DEFAULT_STEPS(), name: ''};
  if (!spec || !TIMER_FORMATS.some(f => f[0] === spec.kind)) return {kind: 'intervals', vals: v};
  for (const k of ['work', 'rest', 'rounds', 'minutes', 'cap']) if (spec[k] != null) v[k] = spec[k];
  if (Array.isArray(spec.exercises)) v.exText = spec.exercises.join('\n');
  if (spec.kind === 'custom') {
    v.warmup = Math.round((spec.warmup || 0) / 6) / 10; v.cooldown = Math.round((spec.cooldown || 0) / 6) / 10;
    v.steps = Array.isArray(spec.steps) ? spec.steps.map(s => ({label: s.label || '', secs: s.secs, level: s.level, target: s.target || ''})) : DEFAULT_STEPS();
  }
  v.name = spec.name && !(spec.kind === 'intervals' && spec.name === 'Tabata') ? spec.name : '';
  return {kind: spec.kind, vals: v};
}
function specFromVals(kind, v) {
  const exercises = (v.exText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20);
  const name = String(v.name || '').trim().slice(0, 40);
  if (kind === 'intervals') {
    if (!(v.work >= 5 && v.work <= 600) || !(v.rest >= 0 && v.rest <= 600) || !(v.rounds >= 1 && v.rounds <= 100)) return {err: 'Work needs 5–600 seconds, rest 0–600, and 1–100 rounds.'};
    return {kind, work: v.work, rest: v.rest, rounds: v.rounds, exercises, name: name || (v.work === 20 && v.rest === 10 && v.rounds === 8 ? 'Tabata' : '')};
  }
  if (kind === 'custom') {
    const steps = (v.steps || []).slice(0, 20).map(s => {
      const level = LEVELS[s.level] ? s.level : 'hard';
      return {label: String(s.label || '').trim().slice(0, 30) || LEVELS[level].name, secs: +s.secs, level, target: String(s.target || '').trim().slice(0, 40)};
    });
    if (!steps.length) return {err: 'Add at least one step.'};
    if (steps.some(s => !(s.secs >= 5 && s.secs <= 1800))) return {err: 'Each step needs 5 to 1800 seconds.'};
    if (!(v.rounds >= 1 && v.rounds <= 50)) return {err: 'Repeat the steps 1 to 50 times.'};
    const wu = +v.warmup || 0, cd = +v.cooldown || 0;
    if (wu < 0 || wu > 30 || cd < 0 || cd > 30) return {err: 'Warm-up and cool-down can each be up to 30 minutes.'};
    return {kind, name, warmup: Math.round(wu * 60), cooldown: Math.round(cd * 60), rounds: v.rounds, steps};
  }
  if (kind === 'fortime') return {kind, cap: v.cap > 0 ? Math.min(v.cap, 180) : 0, exercises, name};
  if (!(v.minutes >= 1 && v.minutes <= 120)) return {err: 'Choose between 1 and 120 minutes.'};
  return {kind, minutes: v.minutes, exercises, name};
}
const timerSpecFromSheet = () => specFromVals(S.sheet.kind || 'intervals', S.sheet.vals);
// a timer from outside (an imported program, the cloud) goes through the same checks as the sheet
function cleanSpec(spec) {
  if (!spec || typeof spec !== 'object' || !TIMER_FORMATS.some(f => f[0] === spec.kind)) return null;
  const s = specToSheet(spec), r = specFromVals(s.kind, s.vals);
  return r.err ? null : r;
}
function openTimerSheet(spec, extra = {}) { S.sheet = {type: 'timer-setup', ...specToSheet(spec), ...extra}; disarm(); render(); }
function timerSheetTotal() {
  const spec = timerSpecFromSheet(); if (spec.err) return '';
  const secs = specSecs(spec); if (!secs) return '';
  const hard = spec.kind === 'custom' ? buildPhases(spec).reduce((s, p) => s + (p.level === 'hard' || p.level === 'max' ? p.secs : 0), 0) : 0;
  return `Total ${fmtDur(secs)}${hard ? `, ${fmtDur(hard)} of it hard or all-out` : ''}.`;
}

/* ---------- screens ---------- */
function viewTimer() {
  const t = S.timer, spec = t.spec, attach = t.ctx.attach && S.active;
  if (t.done) {
    const d = t.done, mins = (d.endedAt - t.startedAt) / 60000;
    const third = spec.kind === 'intervals' ? [`${spec.work}/${spec.rest}`, 'Work/rest s'] : spec.kind === 'custom' ? [fmtDur(d.hardSecs || 0), 'Hard or all-out']
      : spec.kind === 'mobility' ? [spec.hold || '—', 'Hold s'] : [spec.minutes || spec.cap || '—', 'Minutes'];
    return `<div class="wrap timer done">
      <p class="eyebrow" style="margin:0">${d.completed ? 'Done' : 'Stopped early'}</p><h2>${esc(specName(spec))}</h2>
      <div class="stats"><div class="stat"><b class="num">${fmtDur(mins * 60)}</b><span>Time</span></div>
        <div class="stat"><b class="num">${d.rounds}${totalRounds(spec) ? '/' + totalRounds(spec) : ''}</b><span>${spec.kind === 'mobility' ? 'Stretches' : 'Rounds'}</span></div>
        <div class="stat"><b class="num">${third[0]}</b><span>${third[1]}</span></div></div>
      ${spec.kind === 'fortime' || spec.kind === 'amrap' ? `<div class="row between"><span>Rounds completed</span><div class="row" style="gap:6px"><button class="btn" data-act="tm-rounds" data-v="-1">−</button><b class="num" style="min-width:28px;text-align:center">${d.rounds}</b><button class="btn" data-act="tm-rounds" data-v="1">+</button></div></div>` : ''}
      ${attach ? `<p class="small muted" style="margin:0">This goes into ${esc(S.active.routineName)}. You’ll rate the whole workout when you finish it.</p>`
        : `${rpePicker('timer', d.rpe)}
      <label class="field">Notes (optional)<input id="tm-notes" data-in="tm-notes" value="${esc(d.notes || '')}" placeholder="Scaled to box jumps, felt strong"></label>`}
      <button class="btn primary lg block" data-act="tm-save">${attach ? 'Add to workout' : 'Save to log'}</button>
      <button class="btn danger block ${S.armed === 'tmdiscard' ? 'armed' : ''}" data-act="tm-discard">${S.armed === 'tmdiscard' ? 'Tap again to discard' : 'Discard'}</button></div>`;
  }
  const ph = t.phases[t.idx] || t.phases[t.phases.length - 1], next = t.phases[t.idx + 1];
  const tot = totalRounds(spec), open = spec.kind === 'amrap' || spec.kind === 'fortime';
  const showLevel = ph.level && ph.label.toLowerCase() !== LEVELS[ph.level].name.toLowerCase() && ph.label !== 'Warm-up' && ph.label !== 'Cool-down';
  const nextTxt = next ? [next.label, next.level && next.label.toLowerCase() !== LEVELS[next.level].name.toLowerCase() && next.label !== 'Cool-down' ? LEVELS[next.level].name : '', next.secs ? fmtDur(next.secs) : ''].filter(Boolean).join(' · ') : '';
  return `<div class="wrap timer ${ph.kind}">
    <div class="row between"><button class="btn ghost" data-act="tm-end" style="padding-left:0">End</button>
      <span class="small muted">${esc(specName(spec))} · <span class="num" id="tm-total">${fmtDur((Date.now() - t.startedAt) / 1000)}</span></span>
      <button class="iconbtn" data-act="tm-voice" aria-label="${setting('voice') ? 'Turn spoken prompts off' : 'Turn spoken prompts on'}" aria-pressed="${!!setting('voice')}" title="Spoken prompts">${setting('voice') ? ICON_VOICE : ICON_VOICE_OFF}</button></div>
    <div class="tm-face">
      ${showLevel ? `<span class="tm-level">${LEVELS[ph.level].name}</span>` : ''}
      <p class="tm-label">${esc(ph.label)}</p>
      <div class="tm-big num" id="tm-big">${ph.up ? '0:00' : fmtDur(ph.secs)}</div>
      ${ph.sub ? `<p class="tm-sub">${esc(ph.sub)}</p>` : ''}
      ${tot && ph.round ? `<p class="tm-round num">${spec.kind === 'mobility' ? 'Stretch' : 'Round'} ${ph.round} of ${tot}</p>` : ''}
      ${open ? `<p class="tm-round num">${t.rounds} round${t.rounds === 1 ? '' : 's'}</p>` : ''}
      <div class="tm-track"><div class="tm-fill" id="tm-bar"></div></div>
      ${nextTxt && !open ? `<p class="small muted" style="margin:0">Next: ${esc(nextTxt)}</p>` : ''}
    </div>
    ${open ? `<button class="btn primary tm-plus" data-act="tm-round">+1 round</button>` : ''}
    <div class="tm-controls">
      ${t.paused ? '<button class="btn primary lg" data-act="tm-resume">Resume</button>' : '<button class="btn lg" data-act="tm-pause">Pause</button>'}
      ${open ? '<button class="btn lg" data-act="tm-finish">Finish</button>' : '<button class="btn lg" data-act="tm-skip">Skip</button>'}
    </div>
    ${ph.up ? '' : `<div class="tm-adj"><button class="btn" data-act="tm-adj" data-v="-10">−10 s</button><span class="small muted">this ${ph.kind === 'ready' ? 'countdown' : 'step'}</span><button class="btn" data-act="tm-adj" data-v="10">+10 s</button></div>`}
    ${t.paused ? '' : '<p class="small muted" style="text-align:center;margin:0">Keep this screen open: sounds and the voice can’t play while the phone is locked.</p>'}
  </div>`;
}
const ICON_VOICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_VOICE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';

function viewTimerSetup() {
  const sh = S.sheet, kind = sh.kind || 'intervals', v = sh.vals;
  const rid = sh.forDay || sh.forStart, rt = rid && S.program ? S.program.routines.find(r => r.id === rid) : null;
  const title = sh.forDay ? `Timer for ${rt ? rt.name : 'this day'}` : sh.forStart && rt ? rt.name : sh.attach ? 'Timer for this workout' : 'Interval timer';
  const recents = sh.forDay || sh.forStart ? [] : (S.profile.recentTimers || []).filter(x => x.kind !== 'mobility');
  const num = (k, label, ph, mode = 'numeric') => `<label class="field grow">${label}<input id="ts-${k}" data-in="ts" data-k="${k}" inputmode="${mode}" value="${v[k] ?? ''}" placeholder="${ph}"></label>`;
  let fields = '';
  if (kind === 'intervals') fields = `<div class="row">${num('work', 'Work (sec)', '20')}${num('rest', 'Rest (sec)', '10')}${num('rounds', 'Rounds', '8')}</div>`;
  else if (kind === 'fortime') fields = `<div class="row">${num('cap', 'Time cap (min, optional)', '0')}</div>`;
  else if (kind === 'custom') {
    const steps = (v.steps || []).map((s, i) => `<div class="step-ed lv-${LEVELS[s.level] ? s.level : 'hard'}">
      <div class="row" style="gap:6px"><span class="step-n num">${i + 1}</span>
        <input id="tss-l-${i}" class="grow" data-in="ts-step" data-i="${i}" data-k="label" value="${esc(s.label || '')}" placeholder="${LEVELS[s.level] ? LEVELS[s.level].name : 'Hard'}" aria-label="Step ${i + 1} name" autocomplete="off">
        <input id="tss-s-${i}" class="secs" data-in="ts-step" data-i="${i}" data-k="secs" inputmode="numeric" value="${s.secs ?? ''}" aria-label="Step ${i + 1} seconds"><span class="small muted">sec</span>
        <button class="iconbtn" data-act="ts-step-rm" data-i="${i}" aria-label="Remove step ${i + 1}" ${v.steps.length > 1 ? '' : 'disabled'}>✕</button></div>
      <div class="lvls" role="group" aria-label="Step ${i + 1} effort">${Object.entries(LEVELS).map(([k, l]) => `<button class="lv-${k}" data-act="ts-level" data-i="${i}" data-v="${k}" aria-pressed="${s.level === k}">${l.name}</button>`).join('')}</div>
      <input id="tss-t-${i}" data-in="ts-step" data-i="${i}" data-k="target" value="${esc(s.target || '')}" placeholder="Target, optional: 9 mph, level 14, 300 W" aria-label="Step ${i + 1} target" autocomplete="off">
    </div>`).join('');
    fields = `<div class="row">${num('warmup', 'Warm-up (min)', '0', 'decimal')}${num('cooldown', 'Cool-down (min)', '0', 'decimal')}${num('rounds', 'Rounds', '8')}</div>
      <p class="eyebrow" style="margin:0">Each round</p>
      <div class="stack" style="gap:8px">${steps}</div>
      <button class="btn block" data-act="ts-step-add">+ Add a step</button>`;
  } else fields = `<div class="row">${num('minutes', 'Minutes', '10')}</div>`;
  const presets = TIMER_PRESETS[kind].map(([l, p]) => `<button class="chipbtn" data-act="ts-preset" data-v="${esc(JSON.stringify(p))}" aria-pressed="${Object.entries(p).every(([k, x]) => JSON.stringify(v[k]) === JSON.stringify(x))}">${l}</button>`).join('');
  const hint = kind === 'intervals' ? 'Exercises rotate through the work intervals.' : kind === 'emom' ? 'Exercises rotate through the minutes.' : 'Shown on screen while you go.';
  const action = sh.forDay ? `<button class="btn primary lg block" data-act="ts-save-day">Save to ${esc(rt ? rt.name : 'day')}</button>`
    : `${sh.forStart && rt ? `<label class="row small"><input type="checkbox" data-act="ts-saveday" ${sh.saveDay ? 'checked' : ''}> Save any changes to ${esc(rt.name)} for next time</label>` : ''}
       <button class="btn primary lg block" data-act="ts-start">Start</button>`;
  return `<div class="row between"><h2>${esc(title)}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    ${sh.forStart ? '<p class="small muted" style="margin:0">Change anything for today before you start.</p>' : ''}
    ${recents.length ? `<div class="stack" style="gap:6px"><p class="eyebrow" style="margin:0">Recent</p><div class="chips">${recents.map((r, i) => `<button class="chipbtn" data-act="ts-recent" data-v="${i}">${esc(specName(r))}</button>`).join('')}</div></div>` : ''}
    <div class="seg tabs5" role="group" aria-label="Format">${TIMER_FORMATS.map(([k, l]) => `<button data-act="ts-kind" data-v="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>
    <p class="small muted" style="margin:0">${TIMER_FORMATS.find(f => f[0] === kind)[2]}.</p>
    <div class="chips">${presets}</div>
    ${fields}
    ${kind === 'custom' ? '' : `<label class="field">Exercises (optional, one per line)<textarea id="ts-ex" data-in="ts-ex" rows="3" class="note-in" placeholder="${kind === 'emom' ? '10 burpees\n15 kettlebell swings' : kind === 'intervals' ? 'Mountain climbers\nJump squats' : '5 pull-ups\n10 push-ups\n15 air squats'}">${esc(v.exText || '')}</textarea></label>
    <p class="small muted" style="margin:0">${hint}</p>`}
    <label class="field">Name (optional)<input id="ts-name" data-in="ts-name" value="${esc(v.name || '')}" placeholder="${kind === 'custom' ? 'Bike sprints' : 'Leg day finisher'}" autocomplete="off"></label>
    <p class="small" style="margin:0" id="ts-total">${timerSheetTotal()}</p>
    ${action}`;
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

/* ---------- timers inside a program and a workout ---------- */
// "8 exercises", "Sprints", "6 exercises + Tabata"
function routineSummary(r) {
  const n = r.exercises.length, ex = `${n} exercise${n === 1 ? '' : 's'}`;
  if (!r.timer) return ex;
  return n ? `${ex} + ${specName(r.timer)}` : `Timer · ${specName(r.timer)} · ${fmtDur(specSecs(r.timer))}`;
}
function dayTimerEditor(r, ri) {
  const tm = r.timer;
  return `<div class="stack" style="gap:6px"><p class="eyebrow" style="margin:0">Timer</p>
    ${tm ? `<div class="tm-row"><div class="grow stack" style="gap:1px"><b>${esc(specName(tm))}</b><span class="small muted">${esc(specDetail(tm))} · ${fmtDur(specSecs(tm))}</span></div>
      <button class="btn" data-act="day-timer" data-r="${ri}">Edit</button>
      <button class="iconbtn" data-act="day-timer-rm" data-r="${ri}" aria-label="Remove timer" style="color:${S.armed === 'dtrm' + ri ? 'var(--pr)' : 'inherit'}">${S.armed === 'dtrm' + ri ? '✓?' : '✕'}</button></div>`
      : `<button class="btn block" data-act="day-timer" data-r="${ri}">+ Add a timer (HIIT, intervals)</button>`}
    <p class="small muted" style="margin:0">${r.exercises.length ? 'Runs as a finisher after your lifts.' : 'A day with only a timer opens straight into it when you start the day.'}</p></div>`;
}
// in the live workout: the day's timer (or one added on the spot), and how it went
function workoutTimerCard(a) {
  const rt = S.program && a.routineId ? S.program.routines.find(r => r.id === a.routineId) : null, spec = rt && rt.timer, c = a.conditioning;
  if (c) return `<section class="card tm-card done"><div class="row between"><div class="stack" style="gap:2px"><p class="eyebrow">Timer · done</p><h3>${esc(c.name)}</h3>
      <span class="small muted num">${[fmtDur(c.secs), c.rounds ? `${c.rounds} round${c.rounds === 1 ? '' : 's'}` : '', c.hardSecs ? `${fmtDur(c.hardSecs)} hard` : ''].filter(Boolean).join(' · ')}</span></div>
      <button class="btn" data-act="wk-timer">Run again</button></div></section>`;
  if (spec) return `<section class="card tm-card"><div class="row between"><div class="stack" style="gap:2px"><p class="eyebrow">${a.exercises.length ? 'Finisher' : 'Timer'}</p><h3>${esc(specName(spec))}</h3>
      <span class="small muted">${esc(specDetail(spec))} · ${fmtDur(specSecs(spec))}</span></div>
      <button class="btn primary" data-act="wk-timer">Start timer</button></div></section>`;
  return '';
}
const conditioningLine = c => [fmtDur(c.secs), c.rounds ? `${c.rounds} round${c.rounds === 1 ? '' : 's'}` : '', c.hardSecs ? `${fmtDur(c.hardSecs)} hard or all-out` : ''].filter(Boolean).join(' · ');
