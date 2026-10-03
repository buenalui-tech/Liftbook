// Liftbook — Rendering and the main screens: Today, the live workout, Progress, editors and sheets.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- render ---------- */
const $app = document.getElementById('app');
function render() {
  if (!S.ready) return;
  // redraws (e.g. a sync landing) must not wipe what someone is typing
  const keep = {}, focused = document.activeElement && document.activeElement.id;
  document.querySelectorAll('#wt-in, #wt-date, #scan-form input, #scan-form select').forEach(el => { keep[el.id] = el.value; });
  let html = '';
  try {
  if (S.screen === 'welcome') html = viewWelcome();
  else if (S.screen === 'settings') html = viewSettings();
  else if (S.screen === 'timer' && S.timer) html = viewTimer();
  else if (S.screen === 'workout' && S.active) html = viewWorkout();
  else {
    html = `<div class="wrap">${
      S.tab === 'today' ? viewToday() : S.tab === 'food' ? viewFood() : S.tab === 'progress' ? viewProgress() : S.tab === 'body' ? viewBody() : viewProgram()
    }</div>${S.active ? `<div class="resume"><button data-act="resume"><span>Resume ${esc(S.active.routineName)}</span><span class="num" id="resume-clock">${fmtDur((Date.now() - S.active.startedAt) / 1000)}</span></button></div>` : ''}${viewTabs()}`;
  }
  html += viewSheet();
  } catch (e) {
    logClientError('Render failed: ' + e.message, e.stack);
    html = `<div class="wrap"><div class="empty" style="text-align:left"><h3>Something went wrong on this screen</h3>
      <p class="small">Your data is safe. The problem has been reported automatically.</p>
      <button class="btn primary" onclick="location.reload()">Reload</button> <button class="btn" data-act="tab" data-v="today">Go to Today</button></div></div>`;
    S.sheet = null;
  }
  $app.innerHTML = html;
  for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el) el.value = v; }
  if (focused) { const el = document.getElementById(focused); if (el && ((el.tagName === 'INPUT' && el.type !== 'range') || el.tagName === 'TEXTAREA')) { el.focus({preventScroll: true}); if (el.tagName === 'TEXTAREA') el.selectionStart = el.selectionEnd = el.value.length; } }
  shownScan = null;
  Fig.attach();
  // the camera lives outside the redraw: keep it in the scan sheet, stop it when the sheet goes
  if (S.sheet && S.sheet.type === 'barcode' && !S.sheet.err && !S.sheet.looking && !S.sheet.notFound) Scanner.start(); else if (Scanner.video) Scanner.stop();
}
function viewTabs() {
  const t = (id, label, icon) => `<button data-act="tab" data-v="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${ICON[icon]}<span>${label}</span></button>`;
  return `<div class="tabs"><nav>${t('today','Today','today')}${t('food','Food','food')}${t('progress','Progress','prog')}${t('body','Body','body')}${t('program','Program','plan')}</nav></div>`;
}
function brand(sub) { return `<div class="brand"><h1>Lift<span>book</span></h1><div class="row" style="gap:6px">${syncPill()}<button class="iconbtn gear" data-act="settings-open" aria-label="Settings">${ICON_GEAR}</button></div></div>`; }
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
function storageBanner() {
  if (Sync.user) return '';
  if (Sync.client && S.workouts.length) return `<div class="banner row between"><span>Your log is only on this phone. Sign in to back it up automatically.</span><button class="btn" data-act="settings-open" style="min-height:36px">Sign in</button></div>`;
  // no cloud account: the log lives on this phone, so nudge a backup every two weeks
  const last = S.profile.lastBackup || 0;
  if (S.workouts.length && Date.now() - last > 14 * DAY)
    return `<div class="banner row between"><span>Your log lives on this phone only. ${last ? 'Last backup ' + fmtDate(last) + '.' : 'You haven’t backed it up yet.'}</span><button class="btn" data-act="export-json" style="min-height:36px">Back up</button></div>`;
  return '';
}

// gym machines first (most cardio happens there), then everything else; 'row' stays readable for older logs
const MACHINES = [['treadmill', 'Treadmill'], ['spin', 'Indoor bike'], ['rower', 'Rower'], ['stairs', 'Stair climber'], ['elliptical', 'Elliptical']];
const OUTSIDE = [['run', 'Run'], ['walk', 'Walk'], ['cycle', 'Cycle'], ['hike', 'Hike'], ['swim', 'Swim'], ['sport', 'Sport'], ['yoga', 'Yoga'], ['hiit', 'HIIT'], ['mobility', 'Mobility'], ['other', 'Other']];
const ACTIVITIES = [...MACHINES, ...OUTSIDE, ['row', 'Row']];
// the extra fields each type asks for (time, calories, heart rate and effort are always there)
const ACT_FIELDS = {treadmill: ['distance', 'incline', 'speed'], spin: ['distance', 'level'], rower: ['meters'], stairs: ['level', 'floors'], elliptical: ['distance', 'level'],
  run: ['distance'], walk: ['distance'], cycle: ['distance'], hike: ['distance'], swim: ['distance'], row: ['distance']};
const HAS_DISTANCE = new Set(Object.keys(ACT_FIELDS).filter(k => ACT_FIELDS[k].includes('distance')));
const speedUnit = () => unit() === 'kg' ? 'km/h' : 'mph';
// effort: session RPE, 1–10
const RPE_WORDS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Max effort'];
function rpePicker(target, val) {
  return `<div class="stack" style="gap:6px"><div class="row between"><span class="small"><b>How hard was it?</b></span><span class="small muted">${val ? `${val}/10 · ${RPE_WORDS[val]}` : 'Optional'}</span></div>
    <div class="rpe" role="group" aria-label="Effort from 1 to 10">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-act="rpe" data-t="${target}" data-v="${n}" aria-pressed="${val === n}" class="r${n <= 3 ? 1 : n <= 6 ? 2 : n <= 8 ? 3 : 4}">${n}</button>`).join('')}</div></div>`;
}
function actExtras(w) {
  const t = w.type, out = [];
  if (w.distance) out.push(`${fmtW(w.distance)} ${w.distUnit || distUnit()}`);
  if (w.meters) { out.push(`${fmtNum(w.meters)} m`); const mins = ((w.endedAt || w.startedAt) - w.startedAt) / 60000; if (mins > 0) out.push(`${fmtDur(mins * 60 / (w.meters / 500))}/500 m`); }
  if (w.speed && !w.distance) out.push(`${fmtW(w.speed)} ${w.speedUnit || speedUnit()}`);
  if (w.incline) out.push(`${fmtW(w.incline)}% incline`);
  if (w.level) out.push(`level ${fmtW(w.level)}`);
  if (w.floors) out.push(`${fmtNum(w.floors)} floors`);
  if (w.timer && w.timer.rounds) out.push(`${w.timer.rounds} ${w.timer.kind === 'mobility' ? 'stretch' : 'round'}${w.timer.rounds === 1 ? '' : (w.timer.kind === 'mobility' ? 'es' : 's')}`);
  return out;
}
const isActivity = w => w.kind === 'activity';
const distUnit = () => unit() === 'kg' ? 'km' : 'mi';
function entrySummary(w) {
  const dur = fmtDur(((w.endedAt || w.startedAt) - w.startedAt) / 1000);
  if (isActivity(w)) { const c = caloriesFor(w); return [dur, ...actExtras(w).slice(0, 2), c ? `${kcalText(c)} kcal` : '', w.rpe ? `effort ${w.rpe}/10` : ''].filter(Boolean); }
  const c = caloriesFor(w), imp = improvements(w);
  return [dur, c ? `${kcalText(c)} kcal` : '', imp.compared ? `${imp.improved.size}/${imp.compared} improved` : ''].filter(Boolean);
}
function entryCard(w, withDate) {
  const prs = (w.prs || []).length;
  return `<button class="hitem" data-act="detail" data-v="${esc(w.id)}">
    <div class="row between" style="width:100%"><h3>${esc(w.routineName)}</h3>
      <span class="row" style="gap:6px">${isActivity(w) ? '<span class="chip">Activity</span>' : ''}${prs ? `<span class="chip pr">${prs} PR${prs > 1 ? 's' : ''}</span>` : ''}</span></div>
    <div class="kv num">${withDate ? `<span>${fmtDate(w.startedAt)}</span>` : ''}${entrySummary(w).map((x, i) => i ? `<span>${esc(x)}</span>` : `<span><b>${esc(x)}</b></span>`).join('')}</div>
    ${isActivity(w) ? (w.notes ? `<div class="small muted">${esc(w.notes)}</div>` : '') : `<div class="small muted">${[...w.exercises.map(e => esc(e.name.replace(/ \(.*\)$/, ''))), w.conditioning ? '+ ' + esc(w.conditioning.name) : ''].filter(Boolean).join(' · ')}</div>`}</button>`;
}
function viewToday() {
  const now = Date.now(), today = startOfDay(now);
  if (!S.day || S.day > today) S.day = today;
  const day = S.day, isToday = day === today, wk = startOfWeek(day);
  const kinds = {};
  for (const w of S.workouts) { const d = startOfDay(w.startedAt); (kinds[d] = kinds[d] || new Set()).add(isActivity(w) ? 'a' : 's'); }
  const days = ['M','T','W','T','F','S','S'].map((d, i) => {
    const t = wk + i * DAY, k = kinds[t] || new Set(), future = t > today;
    return `<button class="day ${k.has('s') ? 'done' : ''} ${k.has('a') && !k.has('s') ? 'act' : ''} ${t === today ? 'today' : ''} ${t === day ? 'sel' : ''}" data-act="day" data-v="${t}" ${future ? 'disabled' : ''} aria-label="${new Date(t).toDateString()}"><i>${new Date(t).getDate()}</i>${d}</button>`;
  }).join('');
  const strengthThisWeek = Object.entries(kinds).filter(([t, k]) => +t >= startOfWeek(today) && k.has('s')).length, goal = S.profile.weeklyGoal || 4;
  const entries = S.workouts.filter(w => startOfDay(w.startedAt) === day).sort((a, b) => a.startedAt - b.startedAt);
  const label = isToday ? 'Today' : day === today - DAY ? 'Yesterday' : new Date(day).toLocaleDateString(undefined, {weekday: 'long'});
  const nav = `<div class="daynav">
      <button class="iconbtn" data-act="day-step" data-v="-1" aria-label="Previous day">‹</button>
      <div class="stack" style="gap:0;text-align:center"><b>${label}</b><span class="small muted">${new Date(day).toLocaleDateString(undefined, {month: 'long', day: 'numeric', year: day < today - 300 * DAY ? 'numeric' : undefined})}</span></div>
      <button class="iconbtn" data-act="day-step" data-v="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button></div>`;
  const logged = entries.length ? `<section class="section"><p class="eyebrow">${isToday ? 'Logged today' : 'Logged'}</p><div class="hist">${entries.map(entryCard).join('')}</div></section>`
    : (!isToday ? `<div class="empty">Rest day. Nothing logged on ${new Date(day).toLocaleDateString(undefined, {weekday: 'long'})}.</div>` : '');
  const logBtn = `<button class="btn block" data-act="log-open">+ Log ${isToday ? 'an activity or custom workout' : 'something for this day'}</button>`;
  let plan = '';
  if (isToday) {
    const nr = nextRoutine();
    const list = nr && !nr.exercises.length && nr.timer ? timerOutline(nr.timer) : nr ? nr.exercises.map(ex => {
      const s = suggest(ex), tgt = `${ex.sets} × ${rangeText(ex)}${ex.timed ? 's' : ''}`;
      return `<li><span class="nm">${esc(ex.name)}</span><span class="tg num">${tgt}</span><span class="ht ${s.tone}">${s.w != null ? `<b>${fmtW(s.w)} ${unit()}</b> · ` : ''}${esc(s.text)}</span></li>`;
    }).join('') + (nr.timer ? `<li><span class="nm">Finisher: ${esc(specName(nr.timer))}</span><span class="tg num">${fmtDur(specSecs(nr.timer))}</span><span class="ht">${esc(specDetail(nr.timer))}</span></li>` : '') : '';
    const others = (S.program ? S.program.routines : []).filter(r => !nr || r.id !== nr.id).map(r => `
      <div class="routine-row"><span class="tag">${esc(r.tag || r.name.slice(0,2).toUpperCase())}</span>
        <div class="grow"><div style="font-weight:600">${esc(r.name)}</div><div class="small muted">${[r.focus, routineSummary(r)].filter(Boolean).map(esc).join(' · ')}</div></div>
        <button class="btn" data-act="start" data-v="${esc(r.id)}">Start</button></div>`).join('');
    plan = `${nr ? `<section class="card next">
        <div class="row between"><div class="stack"><p class="eyebrow">Up next${nr.focus ? ' · ' + esc(nr.focus) : ''}</p><h2>${esc(nr.name)}</h2></div><span class="tag">${esc(nr.tag || '')}</span></div>
        <ul class="plan">${list}</ul>
        <button class="btn primary lg block" data-act="start" data-v="${esc(nr.id)}">${S.active ? 'Resume workout' : `Start ${esc(nr.name)}`}</button>
      </section>` : programSetupCard()}
      ${others ? `<section class="section"><p class="eyebrow">Other days</p><div class="card" style="padding-block:4px">${others}</div></section>` : ''}`;
  }
  const weigh = S.body.find(e => e.kind === 'weight' && startOfDay(e.date) === day);
  return `${brand(new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'}))}
    ${storageBanner()}
    ${isToday && shouldOfferInstall() ? installCard(false) : ''}
    ${isToday ? summaryCard() : ''}
    <section class="section" id="day-swipe">
      <div class="row between"><p class="eyebrow">${wk === startOfWeek(today) ? 'This week' : 'Week of ' + new Date(wk).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</p><span class="small muted num">${strengthThisWeek} of ${goal} lifting sessions this week</span></div>
      <div class="week">${days}</div>
      ${nav}
    </section>
    ${isToday ? todayFoodCard() : ''}
    ${isToday ? todayWeighIn() : (weigh ? `<button class="hitem weigh" data-act="tab" data-v="body"><span class="row between" style="width:100%"><span class="small muted">Weigh-in</span><b class="num">${f1(conv(weigh.w, weigh.unit))} ${unit()}</b></span></button>` : '')}
    ${logged}
    ${logBtn}
    ${plan}
    ${isToday && S.program ? `<p class="small muted">${esc(S.program.name)} · double progression: work up to the top of the rep range on every set, then add weight.</p>` : ''}
    <button class="btn ghost" data-act="feedback-open" style="align-self:center">Send feedback</button>`;
}

/* ---------- logging activities and custom workouts ---------- */
function viewLogSheet() {
  const sh = S.sheet, today = startOfDay(Date.now());
  if (!sh.form) {
    const live = sh.day === today;
    return `<div class="row between"><h2>Log ${sh.day === today ? 'for today' : 'for ' + fmtDate(sh.day)}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
      ${live ? `<button class="hitem" data-act="timer-setup"><h3>Interval timer</h3><span class="small muted">HIIT, Tabata, EMOM, AMRAP or for time. Saves to your log when you finish.</span></button>
      <button class="hitem" data-act="mobility-setup"><h3>Mobility and stretching</h3><span class="small muted">Guided holds for warm-ups and cool-downs.</span></button>` : ''}
      <button class="hitem" data-act="log-activity"><h3>Cardio or activity</h3><span class="small muted">Treadmill, bike, rower, stairs, runs, classes, sports. Time, distance, machine calories, effort.</span></button>
      <button class="hitem" data-act="log-strength"><h3>Custom strength workout</h3><span class="small muted">${live ? (S.active ? 'You already have a workout in progress. Finish it first.' : 'Start a live session and add any exercises as you go.') : 'Enter the exercises and sets you did that day.'}</span></button>`;
  }
  const f = sh.form, du = f.distUnit || distUnit();
  return `<div class="row between"><h2>${f.id ? 'Edit activity' : 'Log activity'}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <p class="eyebrow" style="margin:0">Gym machines</p>
    <div class="chips" role="group" aria-label="Gym machines">${MACHINES.map(([k, l]) => `<button class="chipbtn" data-act="act-type" data-v="${k}" aria-pressed="${f.type === k}">${l}</button>`).join('')}</div>
    <p class="eyebrow" style="margin:0">Other</p>
    <div class="chips" role="group" aria-label="Other activities">${OUTSIDE.map(([k, l]) => `<button class="chipbtn" data-act="act-type" data-v="${k}" aria-pressed="${f.type === k}">${l}</button>`).join('')}</div>
    ${f.type === 'sport' || f.type === 'other' ? `<label class="field">Name<input id="act-name" data-in="act" data-f="name" value="${esc(f.name || '')}" placeholder="${f.type === 'sport' ? 'Basketball' : 'Stretching'}"></label>` : ''}
    <div class="row">
      <label class="field grow">Date<input id="act-date" type="date" data-in="act" data-f="dateStr" value="${f.dateStr}" max="${localISO(Date.now())}"></label>
      <label class="field grow">Duration (min)<input id="act-dur" data-in="act" data-f="dur" inputmode="numeric" value="${esc(f.dur || '')}" placeholder="30"></label>
    </div>
    ${(() => { const fl = ACT_FIELDS[f.type] || [], box = [];
      if (fl.includes('distance')) box.push(`<label class="field grow">Distance (${du})<input id="act-dist" data-in="act" data-f="distance" inputmode="decimal" value="${esc(f.distance ?? '')}" placeholder="${f.type === 'cycle' || f.type === 'spin' ? '12' : '3.1'}"></label>`);
      if (fl.includes('meters')) box.push(`<label class="field grow">Meters<input id="act-m" data-in="act" data-f="meters" inputmode="numeric" value="${esc(f.meters ?? '')}" placeholder="5000"></label>`);
      if (fl.includes('speed')) box.push(`<label class="field grow">Speed (${speedUnit()})<input id="act-speed" data-in="act" data-f="speed" inputmode="decimal" value="${esc(f.speed ?? '')}" placeholder="${unit() === 'kg' ? '9' : '5.5'}"></label>`);
      if (fl.includes('incline')) box.push(`<label class="field grow">Incline %<input id="act-inc" data-in="act" data-f="incline" inputmode="decimal" value="${esc(f.incline ?? '')}" placeholder="2"></label>`);
      if (fl.includes('level')) box.push(`<label class="field grow">Level<input id="act-lvl" data-in="act" data-f="level" inputmode="numeric" value="${esc(f.level ?? '')}" placeholder="8"></label>`);
      if (fl.includes('floors')) box.push(`<label class="field grow">Floors<input id="act-fl" data-in="act" data-f="floors" inputmode="numeric" value="${esc(f.floors ?? '')}" placeholder="60"></label>`);
      return box.length ? `<div class="row" style="flex-wrap:wrap">${box.join('')}</div>` : ''; })()}
    ${rpePicker('form', f.rpe)}
    <div class="row">
      <label class="field grow">${MACHINES.some(m => m[0] === f.type) ? 'Calories on the machine' : 'Calories'} (optional)<input id="act-cal" data-in="act" data-f="calories" inputmode="numeric" value="${esc(f.calories ?? '')}" placeholder="Leave blank to estimate"></label>
      <label class="field grow">Avg heart rate (optional)<input id="act-hr" data-in="act" data-f="hr" inputmode="numeric" value="${esc(f.hr ?? '')}"></label>
    </div>
    <label class="field">Notes (optional)<input id="act-notes" data-in="act" data-f="notes" value="${esc(f.notes || '')}" placeholder="Easy zone 2, felt good"></label>
    ${f.msg ? `<p class="small" style="margin:0;color:var(--pr)">${esc(f.msg)}</p>` : ''}
    <button class="btn primary lg block" data-act="act-save">${f.id ? 'Save changes' : 'Save activity'}</button>
    ${f.id ? `<button class="btn danger block ${S.armed === 'del' + f.id ? 'armed' : ''}" data-act="del-workout" data-v="${esc(f.id)}">${S.armed === 'del' + f.id ? 'Tap again to delete' : 'Delete activity'}</button>` : ''}`;
}
function activityForm(day, w) {
  if (w) return {id: w.id, type: w.type, name: w.type === 'sport' || w.type === 'other' ? w.routineName : '', dateStr: localISO(w.startedAt),
    dur: String(Math.round((w.endedAt - w.startedAt) / 60000)), distance: w.distance ?? '', distUnit: w.distUnit, calories: w.calories ?? '', hr: w.hr ?? '', notes: w.notes || '',
    meters: w.meters ?? '', speed: w.speed ?? '', incline: w.incline ?? '', level: w.level ?? '', floors: w.floors ?? '', rpe: w.rpe || null, timer: w.timer || null};
  return {type: 'treadmill', dateStr: localISO(day), dur: '', distance: '', calories: '', hr: '', notes: '', rpe: null};
}
function saveActivity() {
  const f = S.sheet.form, num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
  const dur = num(f.dur);
  if (!(dur > 0 && dur < 1440)) { f.msg = 'Enter how many minutes it took, like 45.'; render(); return; }
  const fl = ACT_FIELDS[f.type] || [], pick = k => fl.includes(k) ? num(f[k]) : null;
  const dist = pick('distance'), cal = num(f.calories), hr = num(f.hr), extra = {meters: pick('meters'), speed: pick('speed'), incline: pick('incline'), level: pick('level'), floors: pick('floors')};
  if ([dist, cal, hr, ...Object.values(extra)].some(v => v != null && v < 0)) { f.msg = 'Numbers can’t be negative.'; render(); return; }
  const label = (ACTIVITIES.find(a => a[0] === f.type) || [, 'Activity'])[1];
  const day = f.dateStr ? fromISO(f.dateStr) : startOfDay(Date.now());
  const existing = f.id ? S.workouts.find(w => w.id === f.id) : null;
  // keep the time of day when editing; new entries use now (today) or midday (a past day)
  const startedAt = existing ? day + (existing.startedAt - startOfDay(existing.startedAt))
    : (day === startOfDay(Date.now()) ? Date.now() - dur * 60000 : day + 12 * 3600000);
  const w = existing || {id: newId(), kind: 'activity', exercises: [], unit: unit()};
  Object.assign(w, {type: f.type, routineName: (f.type === 'sport' || f.type === 'other') && f.name.trim() ? f.name.trim() : label,
    startedAt, endedAt: startedAt + dur * 60000, distance: dist, distUnit: f.distUnit || distUnit(), calories: cal, hr: hr ? Math.round(hr) : null, notes: f.notes.trim(),
    ...extra, speedUnit: speedUnit(), rpe: f.rpe || null, ...(f.timer ? {timer: f.timer} : {})});
  if (!existing) S.workouts.push(w);
  S.workouts.sort((a, b) => b.startedAt - a.startedAt);
  store.saveWorkout(w);
  S.sheet = null; S.day = startOfDay(w.startedAt); render(); toast(existing ? 'Activity updated' : `${w.routineName} logged`);
}
function startCustomWorkout() {
  if (S.active) { toast('Finish or discard the workout in progress first.'); return; }
  S.active = {id: newId(), routineId: null, routineName: 'Custom workout', unit: unit(), startedAt: Date.now(), exercises: []};
  S.sheet = {type: 'add-ex', q: ''}; S.screen = 'workout';
  store.saveActive(); render(); wake();
}
/* ---------- editing a finished workout ---------- */
function viewEditWorkout() {
  const d = S.sheet.edit, u = d.unit || unit();
  const lib = libraryExercises();
  const exs = d.exercises.map((e, ei) => `<div class="stack ed-ex">
      <div class="row between"><b>${esc(e.name)}</b><button class="iconbtn" data-act="ed-rm-ex" data-e="${ei}" aria-label="Remove ${esc(e.name)}">✕</button></div>
      <div class="ed-set ed-hd"><span>Set</span><span>${e.timed ? '' : `Weight (${u})`}</span><span>${e.timed ? 'Seconds' : 'Reps'}</span><span></span></div>
      ${e.sets.map((s, si) => `<div class="ed-set">
        <button class="lbl ${s.warm ? 'warm' : ''}" data-act="ed-warm" data-e="${ei}" data-s="${si}" aria-label="Toggle warm-up">${s.warm ? 'W' : si + 1}</button>
        ${e.timed ? '<span></span>' : `<input id="ed-w-${ei}-${si}" data-in="ed-w" data-e="${ei}" data-s="${si}" inputmode="decimal" value="${fmtW(s.w)}" placeholder="${e.kind === 'bodyweight' ? 'BW' : ''}" aria-label="Weight">`}
        <input id="ed-r-${ei}-${si}" data-in="ed-r" data-e="${ei}" data-s="${si}" inputmode="numeric" value="${s.r ?? ''}" aria-label="${e.timed ? 'Seconds' : 'Reps'}">
        <button class="iconbtn" data-act="ed-rm-set" data-e="${ei}" data-s="${si}" aria-label="Remove set">✕</button></div>`).join('')}
      <button class="btn ghost" data-act="ed-add-set" data-e="${ei}" style="align-self:flex-start">+ Add set</button>
      <textarea id="ed-note-${ei}" class="note-in" data-in="ed-note" data-e="${ei}" rows="2" placeholder="Note for this exercise">${esc(e.note || '')}</textarea></div>`).join('');
  return `<div class="row between"><h2>${d.isNew ? 'Log workout' : 'Edit workout'}</h2><button class="iconbtn" data-act="ed-cancel" aria-label="Cancel editing">✕</button></div>
    ${d.isNew ? `<label class="field">Name<input id="ed-name" data-in="ed-name" value="${esc(d.routineName)}"></label>` : ''}
    <label class="field">Workout note<textarea id="ed-wnote" class="note-in" data-in="ed-wnote" rows="2" placeholder="Energy, sleep, anything worth remembering">${esc(d.note || '')}</textarea></label>
    <div class="row">
      <label class="field grow">Date<input id="ed-date" data-in="ed-date" type="date" value="${d.dateStr}" max="${localISO(Date.now())}"></label>
      <label class="field grow">Duration (min)<input id="ed-dur" data-in="ed-dur" inputmode="numeric" value="${d.durMin}"></label>
    </div>
    ${rpePicker('edit', d.rpe)}
    <label class="field">Calories from your watch (optional)<input id="ed-cal" data-in="ed-cal" inputmode="numeric" value="${d.calories ?? ''}" placeholder="Leave blank to estimate"></label>
    ${exs || '<p class="small muted">No exercises. Add one below, or delete this workout instead.</p>'}
    <div class="row"><label class="field grow">Add an exercise<select id="ed-add-sel">${lib.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
      <button class="btn" data-act="ed-add-ex" style="align-self:flex-end">Add</button></div>
    ${d.msg ? `<p class="small" style="margin:0;color:var(--pr)">${esc(d.msg)}</p>` : ''}
    <button class="btn primary lg block" data-act="ed-save">Save changes</button>
    <button class="btn block" data-act="ed-cancel">Cancel</button>`;
}
function openEditor(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  const d = JSON.parse(JSON.stringify(w));
  d.dateStr = localISO(w.startedAt);
  d.durMin = Math.max(1, Math.round(((w.endedAt || w.startedAt) - w.startedAt) / 60000));
  S.sheet = {type: 'detail', id, edit: d}; disarm(); render();
}
function newWorkoutEditor(day) {
  const d = {id: newId(), routineId: null, routineName: 'Custom workout', unit: unit(), startedAt: day + 17 * 3600000, exercises: [], isNew: true,
    dateStr: localISO(day), durMin: '60'};
  S.sheet = {type: 'detail', id: d.id, edit: d}; disarm(); render();
}
function saveEditor() {
  const d = S.sheet.edit;
  let w = S.workouts.find(x => x.id === S.sheet.id);
  if (!w && d.isNew) w = {id: d.id, routineId: null, routineName: (d.routineName || '').trim() || 'Custom workout', unit: d.unit, startedAt: d.startedAt, exercises: []};
  if (!w) return;
  const exercises = d.exercises.map(e => ({...e, sets: e.sets.filter(s => s.r > 0).map(s => ({...s, done: true}))})).filter(e => e.sets.length);
  if (!exercises.length && !w.conditioning) { d.msg = 'Add at least one set with reps, or delete the workout instead.'; render(); return; }
  const dur = parseInt(d.durMin, 10);
  if (!(dur > 0 && dur < 600)) { d.msg = 'Enter a duration in minutes, like 55.'; render(); return; }
  const day = d.dateStr ? fromISO(d.dateStr) : startOfDay(w.startedAt);
  const startedAt = day + (w.startedAt - startOfDay(w.startedAt));   // keep the original time of day
  Object.assign(w, {exercises, startedAt, endedAt: startedAt + dur * 60000, calories: d.calories > 0 ? d.calories : null, note: (d.note || '').trim(), rpe: d.rpe || null});
  if (d.isNew) { w.routineName = (d.routineName || '').trim() || 'Custom workout'; S.workouts.push(w); }
  S.workouts.sort((a, b) => b.startedAt - a.startedAt);
  store.saveWorkout(w);
  recomputePRs();
  S.sheet = {type: 'detail', id: w.id}; S.day = startOfDay(w.startedAt); render(); toast(d.isNew ? 'Workout logged' : 'Workout updated');
}
// Records depend on every earlier workout, so recheck them all after an edit or delete.
function recomputePRs() {
  const best = {};
  for (const w of [...S.workouts].sort((a, b) => a.startedAt - b.startedAt)) {
    const prs = [];
    for (const e of w.exercises) {
      if (e.timed) continue;
      let top = 0; for (const s of working(e)) top = Math.max(top, e1rm(conv(s.w, w.unit), s.r));
      if (!top) continue;
      if (e.exId in best && top > best[e.exId] + 0.01) prs.push(e.exId);
      best[e.exId] = Math.max(best[e.exId] || 0, top);
    }
    if (JSON.stringify(prs) !== JSON.stringify(w.prs || [])) { w.prs = prs; store.saveWorkout(w); }
  }
}
function todayWeighIn() {
  const pts = weightSeries(), last = pts[pts.length - 1];
  const done = S.body.some(e => e.kind === 'weight' && startOfDay(e.date) === startOfDay(Date.now()));
  return `<button class="hitem weigh" data-act="tab" data-v="body"><span class="row between" style="width:100%">
    <span><span class="small muted">Weight trend</span><br><b class="num">${last ? f1(fromKg(last.trend)) + ' ' + unit() : '—'}</b></span>
    <span class="chip ${done ? 'up' : 'new'}">${done ? '✓ Weighed in today' : 'Log today’s weight'}</span></span></button>`;
}
function summaryCard() {
  if (!S.summary) return '';
  const w = S.workouts.find(x => x.id === S.summary.id); if (!w) return '';
  const {v, sets} = volume(w);
  const prs = S.summary.prs.map(p => `<div class="row between"><span>${esc(p.name)}</span><span class="chip pr num">${fmtW(p.w)} × ${p.r} · e1RM ${fmtW(r05(p.e1))}</span></div>`).join('');
  return `<section class="card" style="border-color:var(--good)">
    <div class="row between"><div class="stack"><p class="eyebrow">Workout saved</p><h2>${esc(w.routineName)} done</h2></div><button class="iconbtn" data-act="dismiss-summary" aria-label="Dismiss">✕</button></div>
    ${workoutStats(w)}
    ${prs ? `<p class="eyebrow" style="color:var(--pr)">New personal records</p><div class="prlist">${prs}</div>` : `<p class="small muted">No new records this time. Next session's targets are updated below.</p>`}
    ${figureBlock(w)}
    <button class="btn primary block" data-act="share-open" data-v="${esc(w.id)}">Share workout</button>
  </section>`;
}

function viewWorkout() {
  const a = S.active, done = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0), total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  const exs = a.exercises.map((e, ei) => {
    const rows = e.sets.map((s, si) => {
      const p = prevFor(e, si);
      const prevTxt = p ? (e.timed ? `${p.r}s` : (p.w ? `${fmtW(p.w)} × ${p.r}` : `${p.r} reps`)) : '—';
      const lbl = s.warm ? 'W' : String(e.sets.slice(0, si + 1).filter(x => !x.warm).length);
      return `<div class="set ${s.done ? 'done' : ''}">
        <button class="lbl ${s.warm ? 'warm' : ''}" data-act="warm" data-e="${ei}" data-s="${si}" aria-label="Set ${lbl}, tap to toggle warm-up">${lbl}</button>
        <span class="prev num">${prevTxt}</span>
        ${e.timed ? '<span class="muted small" style="text-align:center">—</span>' : `<input id="w-${ei}-${si}" inputmode="decimal" data-in="w" data-e="${ei}" data-s="${si}" value="${fmtW(s.w)}" placeholder="${e.kind === 'bodyweight' ? 'BW' : (p && p.w ? fmtW(p.w) : '')}" aria-label="Weight">`}
        <input id="r-${ei}-${si}" inputmode="numeric" data-in="r" data-e="${ei}" data-s="${si}" value="${s.r ?? ''}" placeholder="${repsPlaceholder(e, si)}" aria-label="${e.timed ? 'Seconds' : 'Reps'}">
        <button class="check" data-act="set" data-e="${ei}" data-s="${si}" aria-label="Complete set">${ICON.check}</button>
      </div>`;
    }).join('');
    const pw = e.kind === 'barbell' ? (e.sets.map(s => s.w).filter(x => x > 0).pop() || 0) : 0;
    const menu = S.menuEx === ei ? `<div class="menu">
        <button class="btn" data-act="ex-up" data-e="${ei}" ${ei === 0 ? 'disabled' : ''}>Move up</button>
        <button class="btn" data-act="ex-down" data-e="${ei}" ${ei === a.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
        <button class="btn danger ${S.armed === 'rmex' + ei ? 'armed' : ''}" data-act="ex-remove" data-e="${ei}">${S.armed === 'rmex' + ei ? 'Tap again to remove' : 'Remove exercise'}</button></div>` : '';
    return `<section class="card ex">
      <div class="ex-head"><div class="grow stack" style="gap:2px"><h3>${esc(e.name)}</h3><span class="ex-meta num">${e.target || e.sets.length} × ${rangeText(e)}${e.timed ? 's' : ''} · rest ${fmtDur(e.rest)} · ${esc(e.muscle || '')}</span></div>
      <button class="iconbtn ${e.note ? 'has-note' : ''}" data-act="ex-note" data-e="${ei}" aria-label="${e.note ? 'Edit note' : 'Add a note'}">${ICON_NOTE}</button>
      <button class="iconbtn" data-act="ex-menu" data-e="${ei}" aria-label="Exercise options">${ICON.dots}</button></div>
      ${menu}
      ${e.cue ? `<div class="cue">${ICON_PIN}<span>${esc(e.cue)}</span></div>` : ''}
      ${(() => { const prev = lastPerf(e.exId, a.startedAt, a.id); return prev && prev.e.note ? `<div class="prev-note"><b>Last time:</b> ${esc(prev.e.note)}</div>` : ''; })()}
      ${S.noteOpen && S.noteOpen[ei] || e.note ? `<textarea id="note-${ei}" class="note-in" data-in="ex-note" data-e="${ei}" rows="2" placeholder="How it felt, setup, pain, anything for next time">${esc(e.note || '')}</textarea>` : ''}
      ${e.hint ? `<div class="hint ${e.hint.tone}">${esc(e.hint.text)}</div>` : ''}
      <div class="sets"><div class="set hd"><span>Set</span><span>Previous</span><span>${e.timed ? '' : unit()}</span><span>${e.timed ? 'Sec' : 'Reps'}</span><span></span></div>${rows}</div>
      ${e.kind === 'barbell' ? `<div class="plates" id="plates-${ei}">${platesHTML(pw)}</div>` : ''}
      <div class="ex-foot"><button class="btn ghost" data-act="add-set" data-e="${ei}">+ Add set</button>${e.sets.length > 1 ? `<button class="btn ghost" data-act="rm-set" data-e="${ei}" style="color:var(--muted)">Remove last set</button>` : ''}</div>
    </section>`;
  }).join('');
  const left = S.rest ? (S.rest.endAt - Date.now()) / 1000 : 0;
  const rest = S.rest ? `<div class="rest ${left <= 0 ? 'over' : ''}" id="rest"><div class="in">
      <span class="t num" id="rest-t">${left > 0 ? fmtDur(Math.ceil(left)) : 'Go'}</span>
      <div class="track"><div class="fill" id="rest-f" style="width:${Math.min(100, Math.max(0, 100 * (1 - left / S.rest.total)))}%"></div></div>
      <button data-act="rest-add" data-v="-15">−15</button><button data-act="rest-add" data-v="15">+15</button><button data-act="rest-skip">Skip</button></div></div>` : '';
  return `<div class="wrap" style="padding-bottom:${S.rest ? 120 : 40}px">
    <div class="wbar"><button class="iconbtn" data-act="minimize" aria-label="Back to tabs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="grow stack" style="gap:0"><span class="small muted">${esc(a.routineName)} · <span class="num">${done}/${total}</span> sets</span><span class="clock num" id="clock">${fmtDur((Date.now() - a.startedAt) / 1000)}</span></div>
      <button class="btn primary" data-act="finish-open">Finish</button></div>
    ${exs}
    ${workoutTimerCard(a)}
    <div class="row"><button class="btn grow" data-act="add-ex-open">+ Add exercise</button>${workoutTimerCard(a) ? '' : '<button class="btn grow" data-act="wk-timer">+ Add a timer</button>'}</div>
    <label class="field">Workout note<textarea id="wk-note" class="note-in" data-in="wk-note" rows="2" placeholder="Energy, sleep, anything worth remembering">${esc(a.note || '')}</textarea></label>
    <p class="small muted">Tap a set number to mark it as a warm-up. Warm-ups don't count toward records or progression.</p>
  </div>${rest}`;
}

function viewSheet() {
  if (!S.sheet) return '';
  let body = '';
  if (S.sheet.type === 'finish') {
    const a = S.active, done = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0), total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
    body = `<h2>Finish ${esc(a.routineName)}?</h2>
      <p class="muted">${done} of ${total} sets completed${a.conditioning ? ` plus ${esc(a.conditioning.name)}` : ''} in ${fmtDur((Date.now() - a.startedAt) / 1000)}. Unchecked sets won't be saved.</p>
      ${rpePicker('active', a.rpe)}
      <button class="btn primary lg block" data-act="finish" ${done || a.conditioning ? '' : 'disabled'}>Save workout</button>
      <button class="btn block" data-act="sheet-close">Keep training</button>
      <button class="btn danger block ${S.armed === 'discard' ? 'armed' : ''}" data-act="discard">${S.armed === 'discard' ? 'Tap again to discard' : 'Discard workout'}</button>`;
  } else if (S.sheet.type === 'add-ex') {
    const q = (S.sheet.q || '').toLowerCase();
    const lib = libraryExercises().filter(x => !q || x.name.toLowerCase().includes(q));
    body = `<div class="row between"><h2>Add exercise</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
      <label class="field">Search or type a new name<input id="add-q" data-in="add-q" value="${esc(S.sheet.q || '')}" placeholder="e.g. Cable fly" autocomplete="off"></label>
      <div class="lib">${lib.map(x => `<button data-act="add-ex" data-v="${esc(x.id)}"><span>${esc(x.name)}</span><span class="muted small">${esc(x.muscle || '')}</span></button>`).join('') || '<div class="muted small" style="padding:12px">No match in your library.</div>'}</div>
      ${q ? `<div class="row"><label class="field grow">Muscle<select id="add-m">${MUSCLES.map(m => `<option>${m}</option>`).join('')}</select></label><label class="field grow">Equipment<select id="add-k">${KINDS.map(k => `<option>${k}</option>`).join('')}</select></label></div>
      <button class="btn primary block" data-act="add-custom">Add “${esc(S.sheet.q)}” as a new exercise</button>` : ''}`;
  } else if (S.sheet.type === 'share') {
    body = viewShareSheet();
  } else if (S.sheet.type === 'scan') {
    body = viewScanSheet();
  } else if (S.sheet.type === 'detail' && S.sheet.edit) {
    body = viewEditWorkout();
  } else if (S.sheet.type === 'timer-setup') {
    body = viewTimerSetup();
  } else if (S.sheet.type === 'mobility-setup') {
    body = viewMobilitySetup();
  } else if (S.sheet.type === 'add-food') {
    body = viewAddFood();
  } else if (S.sheet.type === 'portion') {
    body = viewPortion();
  } else if (S.sheet.type === 'custom-food') {
    body = viewCustomFood();
  } else if (S.sheet.type === 'barcode') {
    body = viewScan();
  } else if (S.sheet.type === 'targets') {
    body = viewTargets();
  } else if (S.sheet.type === 'save-meal') {
    body = `<div class="row between"><h2>Save as a meal</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
      <p class="small muted" style="margin:0">Saves these foods and amounts so you can add them all in one tap from My foods.</p>
      <label class="field">Name<input id="sm-name" placeholder="Morning shake"></label>
      <button class="btn primary block" data-act="meal-save">Save meal</button>`;
  } else if (S.sheet.type === 'feedback') {
    body = viewFeedbackSheet();
  } else if (S.sheet.type === 'pick') {
    body = viewPickSheet();
  } else if (S.sheet.type === 'program-choose') {
    body = `<div class="row between"><h2>Replace program</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>${programChoices(true)}`;
  } else if (S.sheet.type === 'log') {
    body = viewLogSheet();
  } else if (S.sheet.type === 'detail' && (S.workouts.find(x => x.id === S.sheet.id) || {}).kind === 'activity') {
    const w = S.workouts.find(x => x.id === S.sheet.id);
    body = `<div class="row between"><div class="stack"><p class="eyebrow">${fmtDate(w.startedAt)} · Activity</p><h2>${esc(w.routineName)}</h2></div><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
      <div class="stats">${[['Duration', fmtDur((w.endedAt - w.startedAt) / 1000)], w.distance ? ['Distance', `${fmtW(w.distance)} ${w.distUnit}`] : null,
        w.distance && HAS_DISTANCE.has(w.type) && w.type !== 'cycle' && w.type !== 'swim' ? ['Pace', `${fmtDur((w.endedAt - w.startedAt) / 1000 / w.distance)}/${w.distUnit}`] : null,
        w.calories ? ['Calories', fmtNum(w.calories)] : null, w.hr ? ['Avg HR', `${w.hr} bpm`] : null].filter(Boolean).slice(0, 3)
        .map(([k, v]) => `<div class="stat"><b class="num">${esc(v)}</b><span>${k}</span></div>`).join('')}</div>
      ${actExtras(w).length || w.rpe ? `<p class="small muted" style="margin:0">${esc([...actExtras(w), w.rpe ? `effort ${w.rpe}/10 (${RPE_WORDS[w.rpe].toLowerCase()})` : ''].filter(Boolean).join(' · '))}</p>` : ''}
      ${w.notes ? `<p style="margin:0">${esc(w.notes)}</p>` : ''}
      <button class="btn block" data-act="act-edit" data-v="${esc(w.id)}">Edit activity</button>
      <button class="btn danger block ${S.armed === 'del' + w.id ? 'armed' : ''}" data-act="del-workout" data-v="${esc(w.id)}">${S.armed === 'del' + w.id ? 'Tap again to delete' : 'Delete activity'}</button>`;
  } else if (S.sheet.type === 'detail') {
    const w = S.workouts.find(x => x.id === S.sheet.id); if (!w) { S.sheet = null; return ''; }
    const {v, sets} = volume(w);
    const exs = w.exercises.map(e => `<div class="stack"><div class="row between"><b>${esc(e.name)}</b>${(w.prs || []).includes(e.exId) ? '<span class="chip pr">PR</span>' : ''}</div>
      ${e.note ? `<div class="prev-note">${esc(e.note)}</div>` : ''}
      <table class="dtable num"><tbody>${e.sets.map((s, i) => `<tr><td class="muted">${s.warm ? 'Warm-up' : 'Set ' + (i + 1)}</td><td>${e.timed ? `${s.r}s` : (s.w ? `${fmtW(conv(s.w, w.unit))} ${unit()} × ${s.r}` : `${s.r} reps`)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    body = `<div class="row between"><div class="stack"><p class="eyebrow">${fmtDate(w.startedAt)}</p><h2>${esc(w.routineName)}</h2></div><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
      ${workoutStats(w)}
      ${w.note ? `<div class="prev-note"><b>Note:</b> ${esc(w.note)}</div>` : ''}
      ${figureBlock(w)}
      <div class="row"><button class="btn primary grow" data-act="share-open" data-v="${esc(w.id)}">Share workout</button><button class="btn grow" data-act="ed-open" data-v="${esc(w.id)}">Edit workout</button></div>
      ${exs}
      ${w.conditioning ? `<div class="stack" style="gap:2px"><b>${esc(w.conditioning.name)}</b><span class="small muted num">${esc(conditioningLine(w.conditioning))}</span></div>` : ''}
      <button class="btn danger block ${S.armed === 'del' + w.id ? 'armed' : ''}" data-act="del-workout" data-v="${esc(w.id)}">${S.armed === 'del' + w.id ? 'Tap again to delete' : 'Delete workout'}</button>`;
  }
  return `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true">${body}</div></div>`;
}

function viewProgress() {
  const now = Date.now(), wk = startOfWeek(now);
  const thisWeek = S.workouts.filter(w => w.startedAt >= wk).length;
  // consecutive weeks with at least one workout; an empty current week doesn't break the streak yet
  const inWeek = t => S.workouts.some(w => w.startedAt >= t && w.startedAt < t + 7 * DAY);
  let streak = 0;
  for (let t = inWeek(wk) ? wk : wk - 7 * DAY; inWeek(t) && streak < 520; t -= 7 * DAY) streak++;
  const cal = viewCalendar();
  // weekly sets per muscle (last 7 days)
  const since = now - 7 * DAY, counts = {};
  for (const w of S.workouts) if (w.startedAt >= since) for (const e of w.exercises) counts[e.muscle || 'Other'] = (counts[e.muscle || 'Other'] || 0) + working(e).length;
  const maxC = 24;
  const bars = MUSCLES.map(m => { const c = counts[m] || 0; return `<div class="mbar"><span>${m}</span><div class="tr"><div class="band" style="left:${10 / maxC * 100}%;width:${10 / maxC * 100}%"></div><div class="val" style="width:${Math.min(100, c / maxC * 100)}%"></div></div><span class="num" style="text-align:right">${c}</span></div>`; }).join('');
  // exercise chart
  const lib = libraryExercises().filter(x => S.workouts.some(w => w.exercises.some(e => e.exId === x.id && working(e).length)));
  if (!S.progressEx || !lib.some(x => x.id === S.progressEx)) S.progressEx = lib[0] ? lib[0].id : null;
  const chart = S.progressEx ? exerciseChart(S.progressEx) : '';
  return `${brand('Progress')}${storageBanner()}
    <div class="stats"><div class="stat"><b class="num">${S.workouts.length}</b><span>Sessions</span></div><div class="stat"><b class="num">${thisWeek}/${S.profile.weeklyGoal || 4}</b><span>This week</span></div><div class="stat"><b class="num">${streak}</b><span>Week streak</span></div></div>
    ${cal}
    <section class="card"><div class="row between"><h3>Strength trend</h3></div>
      ${lib.length ? `<label class="field">Exercise<select id="prog-ex" data-in="prog-ex">${lib.map(x => `<option value="${esc(x.id)}" ${x.id === S.progressEx ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>${chart}`
      : `<div class="empty">Log a workout and your estimated one-rep max for each lift is charted here.</div>`}
    </section>
    <section class="card"><div class="stack"><h3>Sets per muscle, last 7 days</h3><span class="small muted">The green band marks 10–20 hard sets a week, a common range for growth.</span></div>${bars}</section>
    ${viewTrainingLoad()}
    ${viewNutritionProgress()}
    ${viewMicros()}
    ${viewAllWorkouts()}`;
}
/* month calendar: blue dot = lifting, green dot = activity; tap a day to see what was logged */
function viewCalendar() {
  const today = startOfDay(Date.now()), m0 = S.calMonth || new Date(new Date(today).getFullYear(), new Date(today).getMonth(), 1).getTime();
  const first = new Date(m0), y = first.getFullYear(), mo = first.getMonth(), daysIn = new Date(y, mo + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;   // weeks start on Monday, like the week strip
  const kinds = {};
  for (const w of S.workouts) { const d = startOfDay(w.startedAt); (kinds[d] = kinds[d] || new Set()).add(isActivity(w) ? 'a' : 's'); }
  const sel = S.calDay && S.calDay >= m0 && S.calDay < new Date(y, mo + 1, 1).getTime() ? S.calDay : null;
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="cal-h">${d}</span>`).join('') + '<span></span>'.repeat(lead);
  let count = 0;
  for (let d = 1; d <= daysIn; d++) {
    const t = new Date(y, mo, d).getTime(), k = kinds[t] || new Set(); if (k.size) count++;
    cells += `<button class="cal-d ${t === today ? 'today' : ''} ${t === sel ? 'sel' : ''}" data-act="cal-day" data-v="${t}" ${t > today ? 'disabled' : ''} aria-label="${new Date(t).toDateString()}${k.size ? ', logged' : ''}">
      <span>${d}</span><i>${k.has('s') ? '<b class="dot s"></b>' : ''}${k.has('a') ? '<b class="dot a"></b>' : ''}</i></button>`;
  }
  const atNow = y === new Date(today).getFullYear() && mo === new Date(today).getMonth();
  const entries = sel ? S.workouts.filter(w => startOfDay(w.startedAt) === sel).sort((a, b) => a.startedAt - b.startedAt) : [];
  return `<section class="card">
    <div class="row between"><button class="iconbtn" data-act="cal-month" data-v="-1" aria-label="Previous month">‹</button>
      <div class="stack" style="gap:0;text-align:center"><h3>${first.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</h3><span class="small muted">${count} day${count === 1 ? '' : 's'} trained</span></div>
      <button class="iconbtn" data-act="cal-month" data-v="1" aria-label="Next month" ${atNow ? 'disabled' : ''}>›</button></div>
    <div class="cal">${cells}</div>
    <div class="legend small muted"><span><b class="dot s"></b>Lifting</span><span><b class="dot a"></b>Activity</span></div>
    ${sel ? `<div class="stack" style="gap:8px"><p class="eyebrow" style="margin:0">${fmtDate(sel)}</p>${entries.length ? `<div class="hist">${entries.map(entryCard).join('')}</div>` : '<p class="small muted" style="margin:0">Rest day.</p>'}</div>` : '<p class="small muted" style="margin:0">Tap a day to see what you logged.</p>'}
  </section>`;
}
/* training load = effort (1–10) × minutes, per week (the session-RPE method) */
function sessionLoad(w) { const mins = ((w.endedAt || w.startedAt) - w.startedAt) / 60000; return w.rpe && mins > 0 ? w.rpe * mins : 0; }
function viewTrainingLoad() {
  const wk0 = startOfWeek(Date.now()), weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = wk0 - i * 7 * DAY, list = S.workouts.filter(w => w.startedAt >= start && w.startedAt < start + 7 * DAY);
    const lift = list.filter(w => !isActivity(w)), other = list.filter(isActivity);
    weeks.push({start, lift: lift.reduce((s, w) => s + sessionLoad(w), 0), other: other.reduce((s, w) => s + sessionLoad(w), 0), rated: list.filter(w => w.rpe).length, sessions: list.length,
      cardioMin: other.reduce((s, w) => s + ((w.endedAt || w.startedAt) - w.startedAt) / 60000, 0)});
  }
  const rated = weeks.reduce((s, w) => s + w.rated, 0), all = weeks.reduce((s, w) => s + w.sessions, 0);
  if (!rated) return `<section class="card"><h3>Training load</h3><p class="small muted" style="margin:0">Rate how hard each session was (1–10) when you finish it, and your weekly training load shows up here: effort × minutes, for lifting and everything else.</p></section>`;
  const cur = weeks[7], prev4 = weeks.slice(3, 7), avg = prev4.reduce((s, w) => s + w.lift + w.other, 0) / 4;
  const total = cur.lift + cur.other, ratio = avg ? total / avg : null;
  const W = 320, H = 130, L = 8, R = 8, T = 10, B = 20, max = Math.max(...weeks.map(w => w.lift + w.other), 1), bw = (W - L - R) / 8;
  const y = v => T + (1 - v / max) * (H - T - B);
  const bars = weeks.map((w, i) => { const x = L + i * bw + 3, lh = H - B - y(w.lift), oh = H - B - y(w.other);
    return `${w.lift ? `<rect x="${x}" y="${y(w.lift)}" width="${bw - 6}" height="${lh}" rx="2" fill="var(--accent)"/>` : ''}${w.other ? `<rect x="${x}" y="${y(w.lift) - oh}" width="${bw - 6}" height="${oh}" rx="2" fill="var(--good)"/>` : ''}
      <text x="${x + (bw - 6) / 2}" y="${H - 6}" text-anchor="middle">${new Date(w.start).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</text>`; }).join('');
  const msg = ratio == null ? '' : ratio > 1.3 ? `This week is ${Math.round((ratio - 1) * 100)}% above your 4-week average. Big jumps are worth easing into.`
    : ratio < 0.7 ? `This week is ${Math.round((1 - ratio) * 100)}% below your 4-week average${cur.start === wk0 ? ' so far' : ''}.` : 'This week is in line with your 4-week average.';
  return `<section class="card"><div class="stack" style="gap:2px"><h3>Training load</h3><span class="small muted">Effort × minutes, last 8 weeks</span></div>
    <div class="stats"><div class="stat"><b class="num">${fmtNum(total)}</b><span>This week</span></div><div class="stat"><b class="num">${fmtNum(avg)}</b><span>4-week avg</span></div>
      <div class="stat"><b class="num">${fmtNum(cur.cardioMin)}</b><span>Cardio min</span></div></div>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly training load">${bars}</svg></div>
    <div class="legend small muted"><span><i style="background:var(--accent)"></i>Lifting</span><span><i style="background:var(--good)"></i>Cardio and other</span></div>
    ${msg ? `<p class="small muted" style="margin:0">${msg}</p>` : ''}
    ${rated < all ? `<p class="small muted" style="margin:0">${all - rated} of ${all} sessions have no effort rating, so they aren’t counted.</p>` : ''}
  </section>`;
}
function viewAllWorkouts() {
  if (!S.workouts.length) return '';
  const list = S.showAll ? S.workouts : S.workouts.slice(0, 5);
  let month = '', out = '';
  for (const w of list) {
    const m = new Date(w.startedAt).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    if (m !== month) { out += `<p class="eyebrow" style="margin-top:8px">${m}</p>`; month = m; }
    out += entryCard(w, true);
  }
  return `<section class="section"><div class="row between"><p class="eyebrow">All workouts</p><span class="small muted">${S.workouts.length} logged</span></div>
    <div class="hist">${out}</div>
    ${S.workouts.length > 5 ? `<button class="btn block" data-act="show-all">${S.showAll ? 'Show fewer' : `Show all ${S.workouts.length}`}</button>` : ''}</section>`;
}
function exerciseChart(exId) {
  const pts = [];
  for (const w of [...S.workouts].reverse()) {
    const e = w.exercises.find(x => x.exId === exId); if (!e) continue;
    const ws = working(e); if (!ws.length) continue;
    let best = null;
    for (const s of ws) {
      const wt = conv(s.w, w.unit) || 0;
      const v = e.timed ? s.r : (wt > 0 ? e1rm(wt, s.r) : s.r);
      if (!best || v > best.v) best = {v, label: e.timed ? `${s.r}s` : (wt > 0 ? `${fmtW(wt)} × ${s.r}` : `${s.r} reps`)};
    }
    pts.push({t: w.startedAt, v: best.v, label: best.label, timed: e.timed, bw: !e.timed && !(ws.some(s => s.w > 0))});
  }
  if (!pts.length) return '';
  const metric = pts[0].timed ? 'Longest hold (s)' : pts[0].bw ? 'Best reps' : `Estimated 1RM (${unit()})`;
  const W = 320, H = 170, L = 36, R = 12, T = 12, B = 26;
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  if (hi - lo < 1) { lo -= 5; hi += 5; } const padv = (hi - lo) * .15; lo = Math.max(0, lo - padv); hi += padv;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
  const x = t => pts.length === 1 ? L + (W - L - R) / 2 : L + (t - t0) / span * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = pts.length > 1 ? `<path d="${line}L${x(t1)},${H - B}L${x(t0)},${H - B}Z" fill="var(--accent-soft)"/>` : '';
  const last = pts[pts.length - 1], bestPt = pts.reduce((a, b) => b.v > a.v ? b : a);
  const dl = t => new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'});
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metric)} over time">${ticks}${area}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${pts.map(p => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${p === last ? 5 : 3}" fill="${p === bestPt ? 'var(--pr)' : 'var(--accent)'}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}
    <text x="${L}" y="${H - 8}">${dl(t0)}</text>${pts.length > 1 ? `<text x="${W - R}" y="${H - 8}" text-anchor="end">${dl(t1)}</text>` : ''}</svg></div>
    <div class="row between small"><span class="muted">${esc(metric)}</span><span class="num">Latest <b>${Math.round(last.v)}</b> · Best <b style="color:var(--pr)">${Math.round(bestPt.v)}</b> (${esc(bestPt.label)})</span></div>`;
}
