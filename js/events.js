// Liftbook — Taps, typing, swipes and app startup.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- events ---------- */
let armT;
function arm(key) { if (S.armed === key) return true; S.armed = key; clearTimeout(armT); armT = setTimeout(() => { S.armed = null; render(); }, 3500); render(); return false; }
function disarm() { S.armed = null; clearTimeout(armT); }

const A = {
  tab: d => { S.tab = d.v; S.sheet = null; render(); window.scrollTo(0, 0); },
  start: d => startWorkout(d.v),
  resume: () => { S.screen = 'workout'; render(); wake(); },
  minimize: () => { S.screen = 'tabs'; render(); },
  set: d => toggleSet(+d.e, +d.s),
  warm: d => { const s = S.active.exercises[+d.e].sets[+d.s]; s.warm = !s.warm; saveActiveSoon(); render(); },
  'add-set': d => { const e = S.active.exercises[+d.e], l = e.sets[e.sets.length - 1]; e.sets.push({w: l ? l.w : null, r: null, done: false, warm: false}); saveActiveSoon(); render(); },
  'rm-set': d => { const e = S.active.exercises[+d.e]; if (e.sets.length > 1) e.sets.pop(); saveActiveSoon(); render(); },
  'ex-menu': d => { S.menuEx = S.menuEx === +d.e ? null : +d.e; render(); },
  'ex-up': d => { const i = +d.e, xs = S.active.exercises; if (i > 0) { [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]]; S.menuEx = i - 1; } saveActiveSoon(); render(); },
  'ex-down': d => { const i = +d.e, xs = S.active.exercises; if (i < xs.length - 1) { [xs[i + 1], xs[i]] = [xs[i], xs[i + 1]]; S.menuEx = i + 1; } saveActiveSoon(); render(); },
  'ex-remove': d => { if (!arm('rmex' + d.e)) return; disarm(); S.active.exercises.splice(+d.e, 1); S.menuEx = null; saveActiveSoon(); render(); },
  'rest-add': d => { if (S.rest) { S.rest.endAt += (+d.v) * 1000; S.rest.total = Math.max(5, S.rest.total + (+d.v)); S.rest.rang = false; } render(); },
  'rest-skip': () => { S.rest = null; render(); },
  'finish-open': () => { S.sheet = {type:'finish'}; render(); },
  finish: () => finishWorkout(),
  discard: () => { if (!arm('discard')) return; disarm(); discardWorkout(); },
  'sheet-close': () => { S.sheet = null; disarm(); render(); },
  scrim: (d, ev) => { if (S.sheet && (S.sheet.edit || S.sheet.type === 'timer-setup')) return;   // don't drop unsaved edits on a stray tap
    if (ev.target.classList.contains('scrim')) { S.sheet = S.sheet && S.sheet.type === 'howto' && S.sheet.back || null; disarm(); render(); } },
  // a video opened from a list (adding an exercise) goes back to that list when it closes
  'howto': d => { S.sheet = {type: 'howto', exId: d.v, name: d.n, back: S.sheet && S.sheet.type !== 'howto' ? S.sheet : null}; render(); },
  'howto-close': () => { S.sheet = S.sheet.back || null; render(); },
  'day-peek': d => { S.peekDay = S.peekDay === d.v ? null : d.v; render(); },
  'howto-save': () => {
    const i = document.getElementById('howto-link'), id = ytId(i && i.value);
    if (!id) { toast('That isn’t a YouTube link. In YouTube tap Share → Copy link, then paste it here'); return; }
    S.profile.videos = {...(S.profile.videos || {}), [S.sheet.exId]: id}; store.saveProfile(); render(); toast('Video saved');
  },
  'howto-reset': () => { const v = {...(S.profile.videos || {})}; delete v[S.sheet.exId]; S.profile.videos = v; store.saveProfile(); render(); },
  'add-ex-open': () => { S.sheet = {type:'add-ex', q:''}; render(); },
  'add-ex': d => { const ex = libraryExercises().find(x => x.id === d.v); if (!ex) return; S.active.exercises.push(buildEx(ex)); S.sheet = null; saveActiveSoon(); render(); window.scrollTo(0, document.body.scrollHeight); },
  'add-custom': () => {
    const name = (S.sheet.q || '').trim(); if (!name) return;
    const muscle = document.getElementById('add-m').value, kind = document.getElementById('add-k').value;
    S.active.exercises.push(buildEx({id: slug(name), name, sets: 3, repMin: 8, repMax: 12, kind, muscle, rest: 90, timed: false}));
    S.sheet = null; saveActiveSoon(); render(); window.scrollTo(0, document.body.scrollHeight);
  },
  detail: d => { S.sheet = {type:'detail', id:d.v}; render(); },
  'del-workout': d => { if (!arm('del' + d.v)) return; disarm(); S.workouts = S.workouts.filter(w => w.id !== d.v); S.sheet = null; store.deleteWorkout(d.v); recomputePRs(); render(); toast('Workout deleted'); },
  'ed-open': d => openEditor(d.v),
  day: d => { S.day = +d.v; render(); },
  'cal-day': d => { S.calDay = S.calDay === +d.v ? null : +d.v; render(); },
  'cal-month': d => { const today = new Date(); const cur = new Date(S.calMonth || new Date(today.getFullYear(), today.getMonth(), 1).getTime());
    const next = new Date(cur.getFullYear(), cur.getMonth() + (+d.v), 1); if (next > today) return; S.calMonth = next.getTime(); S.calDay = null; render(); },
  'show-all': () => { S.showAll = !S.showAll; render(); },
  'day-step': d => stepDay(+d.v),
  'log-open': () => { S.sheet = {type: 'log', day: S.day || startOfDay(Date.now())}; render(); },
  'log-activity': () => { S.sheet.form = activityForm(S.sheet.day); render(); },
  'log-strength': () => { const day = S.sheet.day; if (day === startOfDay(Date.now())) startCustomWorkout(); else newWorkoutEditor(day); },
  'act-type': d => { S.sheet.form.type = d.v; S.sheet.form.msg = ''; render(); },
  'act-save': () => saveActivity(),
  'act-edit': d => { const w = S.workouts.find(x => x.id === d.v); S.sheet = {type: 'log', day: startOfDay(w.startedAt), form: activityForm(null, w)}; render(); },
  'ed-cancel': () => { S.sheet = S.sheet.edit && S.sheet.edit.isNew ? null : {type: 'detail', id: S.sheet.id}; render(); },
  'ed-save': () => saveEditor(),
  'ed-warm': d => { const s = S.sheet.edit.exercises[+d.e].sets[+d.s]; s.warm = !s.warm; render(); },
  'ed-add-set': d => { const e = S.sheet.edit.exercises[+d.e], l = e.sets[e.sets.length - 1]; e.sets.push({w: l ? l.w : null, r: null, done: true, warm: false}); render(); },
  'ed-rm-set': d => { S.sheet.edit.exercises[+d.e].sets.splice(+d.s, 1); render(); },
  'ed-rm-ex': d => { S.sheet.edit.exercises.splice(+d.e, 1); render(); },
  'ed-add-ex': () => {
    const x = libraryExercises().find(e => e.id === document.getElementById('ed-add-sel').value); if (!x) return;
    S.sheet.edit.exercises.push({exId: x.id, name: x.name, kind: x.kind, muscle: x.muscle, muscles: x.muscles, repMin: x.repMin, repMax: x.repMax, rest: x.rest, timed: !!x.timed, target: x.sets, sets: [{w: null, r: null, done: true, warm: false}]});
    render();
  },
  'dismiss-summary': () => { S.summary = null; render(); },
  'sync-now': () => Sync.run(true),
  rpe: d => {
    const n = +d.v, set = o => { o.rpe = o.rpe === n ? null : n; };
    if (d.t === 'active' && S.active) { set(S.active); saveActiveSoon(); }
    else if (d.t === 'form' && S.sheet && S.sheet.form) set(S.sheet.form);
    else if (d.t === 'edit' && S.sheet && S.sheet.edit) set(S.sheet.edit);
    else if (d.t === 'timer' && S.timer && S.timer.done) set(S.timer.done);
    render();
  },
  'timer-setup': () => { if (S.timer) { S.screen = 'timer'; render(); return; } openTimerSheet(null); },
  'mobility-setup': () => { if (S.timer) { S.screen = 'timer'; render(); return; } S.sheet = {type: 'mobility-setup', hold: 0}; render(); },
  'ts-kind': d => { S.sheet.kind = d.v; render(); },
  'ts-preset': d => { Object.assign(S.sheet.vals, JSON.parse(d.v)); render(); },
  'ts-recent': d => { const r = (S.profile.recentTimers || []).filter(x => x.kind !== 'mobility')[+d.v]; if (r) { Object.assign(S.sheet, specToSheet(r)); render(); } },
  'ts-level': d => { S.sheet.vals.steps[+d.i].level = d.v; render(); },
  'ts-step-add': () => { const st = S.sheet.vals.steps, last = st[st.length - 1]; st.push({label: '', secs: last ? last.secs : 30, level: last && last.level === 'easy' ? 'hard' : 'easy', target: ''}); render(); },
  'ts-step-rm': d => { const st = S.sheet.vals.steps; if (st.length > 1) { st.splice(+d.i, 1); render(); } },
  'ts-saveday': () => { S.sheet.saveDay = !S.sheet.saveDay; },
  'ts-start': () => {
    const sh = S.sheet, spec = timerSpecFromSheet(); if (spec.err) { toast(spec.err); return; }
    const rt = sh.forStart && S.program ? S.program.routines.find(r => r.id === sh.forStart) : null;
    if (rt && sh.saveDay) { rt.timer = spec; store.saveProgram(); }
    Timer.start(spec, sh.attach ? {attach: true} : rt ? {routineId: rt.id, routineName: rt.name} : {});
  },
  'ts-save-day': () => {
    const spec = timerSpecFromSheet(); if (spec.err) { toast(spec.err); return; }
    const rt = S.program && S.program.routines.find(r => r.id === S.sheet.forDay); if (!rt) return;
    rt.timer = spec; store.saveProgram(); S.sheet = null; render(); toast(`Timer saved to ${rt.name}`);
  },
  'day-timer': d => { const rt = S.program.routines[+d.r]; openTimerSheet(rt.timer || null, {forDay: rt.id}); },
  'day-timer-rm': d => { if (!arm('dtrm' + d.r)) return; disarm(); delete S.program.routines[+d.r].timer; store.saveProgram(); render(); toast('Timer removed'); },
  'wk-timer': () => {
    const a = S.active; if (!a) return;
    const rt = S.program && a.routineId ? S.program.routines.find(r => r.id === a.routineId) : null;
    openTimerSheet(a.conditioning ? a.conditioning.spec : rt && rt.timer || null, {attach: true});
  },
  'tm-adj': d => Timer.adjust(+d.v),
  'tm-voice': () => { setSetting('voice', !setting('voice')); render(); if (setting('voice')) Voice.say('Spoken prompts on'); },
  'mob-hold': d => { S.sheet.hold = +d.v; render(); },
  'mob-start': d => { const r = MOBILITY[d.v]; if (r) Timer.start({kind: 'mobility', name: r.name, items: r.items, hold: S.sheet.hold || 0}); },
  'tm-pause': () => Timer.pause(),
  'tm-resume': () => Timer.resume(),
  'tm-skip': () => Timer.skip(),
  'tm-round': () => Timer.round(),
  'tm-finish': () => Timer.finish(true),
  'tm-end': () => Timer.finish(false),
  'tm-rounds': d => { const dn = S.timer.done; dn.rounds = Math.max(0, dn.rounds + (+d.v)); render(); },
  'tm-save': () => Timer.save(),
  'tm-discard': () => { if (!arm('tmdiscard')) return; disarm(); Timer.discard(); },
  'settings-open': () => { S.screen = 'settings'; S.sheet = null; render(); window.scrollTo(0, 0); },
  'settings-close': () => { S.screen = S.active && S.wasInWorkout ? 'workout' : 'tabs'; render(); window.scrollTo(0, 0); },
  'set-theme': d => { setSetting('theme', d.v); render(); },
  'set-accent': d => { setSetting('accent', d.v); render(); },
  'set-sound': d => { setSetting('sound', d.v); render(); playSound(d.v); },
  'sound-test': () => {
    unlockAudio(); playSound(setting('sound') === 'off' ? 'beep' : setting('sound'), Math.max(setting('volume'), 0.5));
    const spoke = typeof window.speechSynthesis !== 'undefined' && setting('voice') && Voice.say('Sound check. If you can hear this, the timer can talk to you.');
    // what the phone reports, so a silent phone can be told apart from a bug
    setTimeout(() => {
      const st = audio ? audio.state : 'unavailable';
      S.soundCheck = st === 'running' ? `The beep was played${spoke ? ' and the voice was sent' : ''}. Heard nothing? Your phone is muting it: see the steps below.`
        : `Your phone hasn’t allowed sound yet (audio is ${st}). Tap Sound check again.`;
      render();
    }, 400);
  },
  'set-toggle': d => { setSetting(d.v, !setting(d.v)); render(); },
  'ex-note': d => { S.noteOpen = {...(S.noteOpen || {}), [d.e]: !(S.noteOpen && S.noteOpen[d.e])}; render(); const t = document.getElementById('note-' + d.e); if (t) t.focus(); },
  'food-add': d => { S.sheet = {type: 'add-food', meal: d.v, mode: 'search', q: ''}; render(); const i = document.getElementById('food-q'); if (i) i.focus(); },
  'food-mode': d => { S.sheet.mode = d.v; render(); },
  'food-pick': d => { const sh = S.sheet, f = sh.results && sh.results[+d.v]; if (!f) return; if ((sh.q || '').trim() && (sh.remote || []).includes(f)) rememberSearch(sh.q); openPortion(f, sh.meal); },
  'food-q-pick': d => { const i = document.getElementById('food-q'); if (i) i.value = d.v; onFoodQuery(d.v); },
  'food-edit': d => { const e = S.food.find(x => x.id === d.v); if (e) { S.sheet = null; openPortion(e.food, e.meal, e); } },
  'portion-back': () => { S.sheet = S.sheet.back || null; render(); },
  'po-meal': d => { S.sheet.meal = d.v; render(); },
  'portion-save': () => savePortion(),
  'portion-save-next': () => {
    const meal = S.sheet.meal; savePortion();
    if (S.sheet) return;   // didn't save (no amount)
    Scale.tare(); S.sheet = {type: 'add-food', meal, mode: 'search', q: '', plate: true}; render();
  },
  'sc-weigh': async () => {
    const sh = S.sheet, start = () => { if (S.sheet === sh) { Object.assign(sh, {weigh: true, unit: 'g', qty: Math.max(0, Math.round(Scale.grams() || 0))}); render(); } };
    if (Scale.status === 'on') { start(); return; }
    try { if (Scale.status === 'lost' && Scale.dev) await Scale.attach(Scale.dev); else await Scale.connect(); start(); }
    catch (e) { if (e.name !== 'NotFoundError') toast(e.message || 'Couldn’t connect to the scale.'); }
  },
  'sc-manual': () => { S.sheet.weigh = false; render(); },
  'sc-tare': () => Scale.tare(),
  'sc-connect': async () => { try { await Scale.connect(); toast(`${Scale.name} connected`); } catch (e) { if (e.name !== 'NotFoundError') toast(e.message || 'Couldn’t connect to the scale.'); } },
  'sc-disconnect': () => Scale.disconnect(),
  'sc-demo-start': () => { Scale.startDemo(); toast('Demo scale on. Add a food and tap Weigh on scale.'); },
  'rec-start': async () => { try { await Scale.record(); } catch (e) { Scale.rec = null; render(); if (e.name !== 'NotFoundError') toast(e.message || 'Couldn’t connect.'); } },
  'rec-stop': () => { Scale.stopRecording(); Scale.rec = null; render(); },
  'rec-send': () => sendRecording(),
  'rec-copy': async () => { try { await navigator.clipboard.writeText(Scale.rec.lines.join('\n')); toast('Copied'); } catch { toast('Copying isn’t allowed here. Use Send instead.'); } },
  'food-del': () => { if (!arm('fdel')) return; disarm(); const id = S.sheet.editId; S.food = S.food.filter(x => x.id !== id); store.deleteFood(id); S.sheet = null; render(); toast('Removed'); },
  'quick-save': () => saveQuickAdd(),
  'custom-new': d => { S.sheet = {type: 'custom-food', meal: (S.sheet && S.sheet.meal) || 'snack', barcode: d.v || ''}; render(); },
  'custom-save': () => saveCustomFood(),
  'barcode-open': () => { S.sheet = {type: 'barcode', meal: S.sheet.meal}; render(); },
  'barcode-close': () => { Scanner.stop(); S.sheet = {type: 'add-food', meal: S.sheet.meal, mode: 'search'}; render(); },
  'barcode-type': () => onBarcode((document.getElementById('scan-code') || {}).value || ''),
  'targets-open': () => { S.sheet = {type: 'targets'}; render(); },
  'tg-kmode': d => { const dr = S.sheet.draft; dr.kcalMode = d.v; if (d.v === 'manual' && !dr.kcal) { const a = autoCalories(); dr.kcal = a ? a.kcal : 2200; } render(); },
  'tg-split': d => { const dr = S.sheet.draft; if (d.v === 'grams' && !dr.grams) { const t = computeTargets(dr); dr.grams = t ? {p: t.p, c: t.c, f: t.f} : {p: 150, c: 220, f: 70}; } dr.split = d.v; render(); },
  'tg-preset': d => { S.sheet.draft.pct = {p: +d.p, f: +d.f}; render(); },
  'targets-save': () => saveTargets(),
  'checkin-accept': () => { const est = estimateBurn(); if (!est.ready) return; const p = applyCheckin(est, false); render(); if (p) toast(`Targets updated: ${fmtNum(p.next.kcal)} kcal`); },
  'checkin-undo': () => {
    const a = S.profile.autoCheckin; if (!a) return;
    S.profile.nutrition = a.prev.nutrition; S.profile.adaptive = a.prev.adaptive;
    S.profile.checkinSkipped = a.week; S.profile.autoCheckin = {...a, dismissed: true};
    store.saveProfile(); render(); toast(`Back to ${fmtNum(a.from)} kcal`);
  },
  'checkin-note-close': () => { S.profile.autoCheckin = {...S.profile.autoCheckin, dismissed: true}; store.saveProfile(); render(); },
  'set-checkin': d => { setSetting('checkinMode', d.v); render(); },
  'checkin-skip': () => { S.profile.checkinSkipped = startOfWeek(Date.now()); store.saveProfile(); render(); },
  'day-incomplete': d => {
    const day = S.day || startOfDay(Date.now()), cut = startOfDay(Date.now()) - 120 * DAY;
    const list = (S.profile.incompleteDays || []).filter(x => x >= cut && x !== day);
    if (!isIncompleteDay(day)) list.push(day);
    S.profile.incompleteDays = list; store.saveProfile(); render();
  },
  'meal-copy': d => { const n = copyMeal(S.day - DAY, d.v, S.day); render(); toast(`Copied ${n} item${n === 1 ? '' : 's'}`); },
  'meal-save-open': d => { S.sheet = {type: 'save-meal', meal: d.v}; render(); const i = document.getElementById('sm-name'); if (i) i.focus(); },
  'meal-save': () => {
    const name = (document.getElementById('sm-name').value || '').trim(); if (!name) { toast('Give the meal a name.'); return; }
    saveMealAs(S.day || startOfDay(Date.now()), S.sheet.meal, name); S.sheet = null; render(); toast(`${name} saved`);
  },
  'saved-meal-log': d => { const m = S.food.find(x => x.id === d.v); if (!m) return; const meal = S.sheet.meal; logSavedMeal(m, meal, S.day || startOfDay(Date.now())); S.sheet = null; render(); toast(`${m.name} added to ${mealLabel(meal)}`); },
  'saved-meal-del': d => { if (!arm('smdel' + d.v)) return; disarm(); S.food = S.food.filter(x => x.id !== d.v); store.deleteFood(d.v); render(); },
  'feedback-open': () => { S.sheet = {type: 'feedback', kind: 'bug', msg: '', from: currentScreen()}; render(); },
  'fb-kind': d => { S.sheet.kind = d.v; render(); },
  'fb-send': () => sendFeedback(),
  'wl-next': () => { S.welcomeStep = (S.welcomeStep || 0) + 1; render(); window.scrollTo(0, 0); },
  'wl-done': () => finishWelcome(),
  'wl-browser': () => { S.welcomeInBrowser = true; render(); },
  'install-now': async () => { if (!installEvent) return; installEvent.prompt(); try { await installEvent.userChoice; } catch {} installEvent = null; render(); },
  'install-dismiss': () => { try { localStorage.setItem(INSTALL_KEY, '1'); } catch {} render(); },
  'share-open': d => { S.sheet = {type: 'share', id: d.v}; render(); prepareShare(); },
  'share-theme': d => { if ((S.profile.shareTheme || 'dark') === d.v) return; S.profile.shareTheme = d.v; store.saveProfile(); const sh = S.sheet; if (sh.url) URL.revokeObjectURL(sh.url); sh.url = null; sh.blob = null; render(); prepareShare(); },
  'share-go': () => shareGo(),
  'scan-open': d => { S.sheet = {type: 'scan', id: d.v || null}; S.scanMsg = ''; disarm(); render(); },
  'scan-del': d => { if (!arm('scandel')) return; disarm(); S.body = S.body.filter(e => e.id !== d.v); store.deleteBody(d.v); S.sheet = null; S.scanIdx = null; render(); toast('Scan deleted'); },
  seg: d => { S.bodySeg = S.bodySeg === d.v ? null : d.v; render(); },
  'scan-compare': d => { S.scanCompare = d.v; render(); },
  'wt-range': d => { S.wtRange = d.v === 'all' ? 'all' : +d.v; render(); },
  'wt-chart': (d, ev) => {
    const c = S.wtChart, svg = ev.target.closest('svg'); if (!c || !svg) return;
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) / r.width * c.W;
    const t = c.t0 + (vx - c.x0) / (c.x1 - c.x0) * c.span;
    const near = c.pts.reduce((a, p) => Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a);
    S.wtSel = S.wtSel === near.t ? null : near.t; render();
  },
  'wt-all': () => { S.wtAll = true; S.wtOpen = true; render(); },
  'wt-del': d => { if (!arm('wtdel' + d.v)) return; disarm(); S.body = S.body.filter(e => e.id !== d.v); store.deleteBody(d.v); S.wtOpen = true; render(); toast('Weigh-in deleted'); },
  goal: d => { const g = S.profile.goal || {}; S.profile.goal = {type: d.v, rate: g.rate || (unit() === 'kg' ? 0.25 : 0.5)}; store.saveProfile(); render(); },
  'sign-out': async () => { if (!arm('signout')) return; disarm(); await Sync.signOut(); S.authMsg = '✓ Signed out. Your log stays on this phone.'; render(); },
  'edit-routine': d => { S.editRoutine = d.v || null; disarm(); render(); },
  'p-up': d => { const xs = S.program.routines[+d.r].exercises, i = +d.x; if (i > 0) { [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]]; saveProgramSoon(); render(); } },
  'p-rm': d => { if (!arm(`prm${d.r}-${d.x}`)) return; disarm(); S.program.routines[+d.r].exercises.splice(+d.x, 1); saveProgramSoon(); render(); },
  'pick-open': d => { S.sheet = {type: 'pick', r: +d.r, q: ''}; render(); },
  'pick-ex': d => { const x = libraryExercises().find(e => e.id === d.v); if (x) addToDay(S.sheet.r, x); },
  'pick-custom': () => {
    const name = (document.getElementById('pick-name').value || '').trim();
    if (!name) { toast('Give the exercise a name.'); return; }
    addToDay(S.sheet.r, {id: slug(name), name, muscle: document.getElementById('pick-muscle').value, kind: document.getElementById('pick-kind').value,
      timed: document.getElementById('pick-timed').checked, repMin: document.getElementById('pick-timed').checked ? 30 : 8, repMax: document.getElementById('pick-timed').checked ? 60 : 12});
  },
  'prog-new': () => setProgram(EMPTY_PROGRAM(), 'Program created. Add exercises to Day 1.', 'program'),
  'prog-template': () => setProgram(JSON.parse(JSON.stringify(TEMPLATE)), 'Jeff Nippard 4-Day Upper/Lower loaded'),
  'prog-replace': () => { S.sheet = {type: 'program-choose'}; render(); },
  'day-add': () => { const d = newDay(S.program.routines.length + 1); S.program.routines.push(d); S.editRoutine = d.id; store.saveProgram(); render(); },
  'day-rm': d => { if (!arm('dayrm' + d.r)) return; disarm(); S.program.routines.splice(+d.r, 1); S.editRoutine = null; store.saveProgram(); render(); toast('Day deleted'); },
  'day-move': d => { const rs = S.program.routines, i = +d.r, j = i + (+d.v); if (j < 0 || j >= rs.length) return; [rs[i], rs[j]] = [rs[j], rs[i]]; store.saveProgram(); render(); },
  'export-program': () => offerFile(`${slug(S.program.name)}-program.json`, JSON.stringify({app: 'liftbook', type: 'program', version: 1, program: S.program}, null, 2)),
  unit: d => { if (S.profile.unit === d.v) return; const was = S.profile.unit; S.profile.unit = d.v; if (Number(S.profile.bar) === (was === 'kg' ? 20 : 45)) S.profile.bar = d.v === 'kg' ? 20 : 45; store.saveProfile(); render(); },
  'export-json': () => offerFile(`liftbook-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({app:'liftbook', version:1, exportedAt:new Date().toISOString(), profile:S.profile, program:S.program, workouts:S.workouts, body:S.body}, null, 2)),
  'export-csv': () => {
    const rows = [['date','routine','exercise','set','warmup','weight','unit','reps_or_seconds']];
    for (const w of [...S.workouts].reverse()) {
      if (isActivity(w)) { rows.push([new Date(w.startedAt).toISOString(), w.routineName, `activity: ${w.type}`, '', '', w.distance ?? '', w.distance ? w.distUnit : '', Math.round((w.endedAt - w.startedAt) / 1000)]); continue; }
      for (const e of w.exercises) e.sets.forEach((s, i) => rows.push([new Date(w.startedAt).toISOString(), w.routineName, e.name, i + 1, s.warm ? 1 : 0, s.w ?? '', w.unit, s.r ?? '']));
    }
    offerFile(`liftbook-sets-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n'));
  }
};
function markBackup(filename) { if (filename.endsWith('.json')) { S.profile.lastBackup = Date.now(); store.saveProfile(); render(); } }
async function offerFile(filename, data) {
  if (IN_CLAUDE) {
    let dl = null; try { dl = await window.claude.use('downloads'); } catch {}
    if (dl) { try { await dl.save({filename, data}); markBackup(filename); } catch (e) { if (e && e.code !== 'declined') toast('Could not save the file here.'); } return; }
  }
  const type = filename.endsWith('.csv') ? 'text/csv' : 'application/json';
  // phones: the share sheet offers Save to Files / Drive / email
  try {
    const file = new File([data], filename, {type});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: filename}); markBackup(filename); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try {
    const url = URL.createObjectURL(new Blob([data], {type}));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); markBackup(filename); return;
  } catch {}
  try { await navigator.clipboard.writeText(data); toast('Copied to clipboard'); } catch { toast('Saving files is not available here.'); }
}

document.addEventListener('click', ev => {
  unlockAudio();
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  if (el.dataset.act === 'scrim' && el !== ev.target) return;
  fn(el.dataset, ev);
});
document.addEventListener('input', ev => {
  const el = ev.target, k = el.dataset && el.dataset.in; if (!k) return;
  if (k === 'w' || k === 'r') {
    const e = S.active.exercises[+el.dataset.e], s = e.sets[+el.dataset.s];
    const v = el.value.trim() === '' ? null : parseFloat(el.value.replace(',', '.'));
    const old = s[k];
    s[k] = v == null || isNaN(v) ? null : (k === 'r' ? Math.round(v) : v);
    // a new weight carries down to the unfinished sets below that were blank or matched the old weight
    if (k === 'w' && s.w != null) e.sets.forEach((x, i) => {
      if (i <= +el.dataset.s || x.done || !(x.w == null || x.w === old)) return;
      x.w = s.w; const inp = document.getElementById(`w-${el.dataset.e}-${i}`); if (inp) inp.value = fmtW(s.w);
    });
    if (k === 'w' && e.kind === 'barbell') { const box = document.getElementById('plates-' + el.dataset.e); if (box) box.innerHTML = platesHTML(e.sets.map(x => x.w).filter(x => x > 0).pop() || 0); }
    saveActiveSoon();
  } else if (k === 'add-q') {
    S.sheet.q = el.value; const pos = el.selectionStart; render();
    const n = document.getElementById('add-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
  } else if (k.startsWith('p-')) {
    const ex = S.program.routines[+el.dataset.r].exercises[+el.dataset.x], f = k.slice(2);
    if (f === 'name') { const nm = el.value.trim(); if (nm) { ex.name = nm; ex.id = slug(nm); } }
    else if (f === 'cue') ex.cue = el.value.trim();
    else { const n = parseInt(el.value, 10); if (n > 0) ex[f] = n; if (ex.repMax < ex.repMin && f !== 'rest' && f !== 'sets') {} }
    saveProgramSoon();
  } else if (k === 'auth-email') { S.authEmail = el.value;
  } else if (k === 'scan-idx') { showScan(+el.value);
  } else if (k === 'ed-w' || k === 'ed-r') {
    const s = S.sheet.edit.exercises[+el.dataset.e].sets[+el.dataset.s], t = el.value.trim().replace(',', '.');
    const v = t === '' ? null : parseFloat(t); s[k === 'ed-w' ? 'w' : 'r'] = v == null || isNaN(v) ? null : (k === 'ed-r' ? Math.round(v) : v);
  } else if (k === 'ed-date') { S.sheet.edit.dateStr = el.value;
  } else if (k === 'ed-name') { S.sheet.edit.routineName = el.value;
  } else if (k === 'fb-msg') { S.sheet.msg = el.value;
  } else if (k === 'sc-demo') { Scale.demoG = +el.value;
  } else if (k === 'ts' || k === 'ts-step' || k === 'ts-name' || k === 'ts-ex') {
    const v = S.sheet.vals;
    if (k === 'ts') { const n = (el.dataset.k === 'warmup' || el.dataset.k === 'cooldown' ? parseFloat : parseInt)(el.value.replace(',', '.'), 10); v[el.dataset.k] = isNaN(n) ? null : n; }
    else if (k === 'ts-step') { const s = v.steps[+el.dataset.i]; if (el.dataset.k === 'secs') { const n = parseInt(el.value, 10); s.secs = isNaN(n) ? null : n; } else s[el.dataset.k] = el.value; }
    else if (k === 'ts-name') v.name = el.value;
    else v.exText = el.value;
    const tt = document.getElementById('ts-total'); if (tt) tt.textContent = timerSheetTotal();
  } else if (k === 'tm-notes') { if (S.timer && S.timer.done) S.timer.done.notes = el.value;
  } else if (k === 'tg-kcal' || k === 'tg-pct' || k === 'tg-gram') {
    const dr = S.sheet.draft, n = parseInt(el.value, 10);
    if (k === 'tg-kcal') dr.kcal = n > 0 ? n : null;
    else if (k === 'tg-pct') { dr.pct = {...dr.pct, [el.dataset.k]: n >= 0 ? Math.min(n, 95) : 0}; const c = document.getElementById('tg-pc'); if (c) c.value = Math.max(0, 100 - dr.pct.p - dr.pct.f); }
    else dr.grams = {...(dr.grams || {}), [el.dataset.k]: n >= 0 ? n : 0};
    const pv = document.getElementById('tg-preview'); if (pv) pv.innerHTML = targetPreview(dr);
  } else if (k === 'ex-note') { S.active.exercises[+el.dataset.e].note = el.value; saveActiveSoon();
  } else if (k === 'wk-note') { S.active.note = el.value; saveActiveSoon();
  } else if (k === 'ed-note') { S.sheet.edit.exercises[+el.dataset.e].note = el.value;
  } else if (k === 'ed-wnote') { S.sheet.edit.note = el.value;
  } else if (k === 'set-volume') { S.profile.settings = {...(S.profile.settings || {}), volume: +el.value}; later('profile', () => store.saveProfile());
  } else if (k === 'food-q') { onFoodQuery(el.value);
  } else if (k === 'po-qty' || k === 'po-unit') {
    if (k === 'po-qty') S.sheet.qty = el.value; else S.sheet.unit = el.value;
    const {grams, totals} = portionTotals(S.sheet.food, parseFloat(String(S.sheet.qty).replace(',', '.')) || 0, S.sheet.unit);
    const box = document.getElementById('po-totals'); if (box) box.innerHTML = portionStats(totals, grams);
    const mi = document.getElementById('po-micros'); if (mi) mi.innerHTML = portionMicros(S.sheet.food, grams, parseFloat(String(S.sheet.qty).replace(',', '.')) || 0);
  } else if (k === 'prog-name') { S.program.name = el.value.trim() || 'My program'; saveProgramSoon();
  } else if (k === 'day-name') {
    const i = +el.dataset.r, r = S.program.routines[i]; r.name = el.value.trim() || `Day ${i + 1}`;
    // badges must tell days apart: fall back to first letter + day number when two would match
    const t = tagFor(r.name); r.tag = S.program.routines.some((x, j) => j !== i && x.tag === t) ? r.name[0].toUpperCase() + (i + 1) : t;
    saveProgramSoon();
  } else if (k === 'day-focus') { S.program.routines[+el.dataset.r].focus = el.value.trim(); saveProgramSoon();
  } else if (k === 'pick-q') { S.sheet.q = el.value; const pos = el.selectionStart; render(); const n = document.getElementById('pick-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
  } else if (k === 'act') { S.sheet.form[el.dataset.f] = el.value;
  } else if (k === 'ed-dur') { S.sheet.edit.durMin = el.value;
  } else if (k === 'ed-cal') { const n = parseInt(el.value, 10); S.sheet.edit.calories = n > 0 ? n : null;
  } else if (k === 'goal-rate') { const n = parseFloat(el.value); if (n > 0 && n < 5) { S.profile.goal = {...(S.profile.goal || {type: 'cut'}), rate: n}; later('profile', () => store.saveProfile()); }
  } else if (k === 'bar') { const n = parseFloat(el.value); if (n >= 0) { S.profile.bar = n; later('profile', () => store.saveProfile()); } }
  else if (k === 'goal') { const n = parseInt(el.value, 10); if (n > 0 && n < 15) { S.profile.weeklyGoal = n; later('profile', () => store.saveProfile()); } }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.in === 'prog-ex') { S.progressEx = el.value; render(); }
  if (el.dataset && el.dataset.in && el.dataset.in.startsWith('p-')) render();
  if (el.id === 'import-file' && el.files && el.files[0]) importFile(el.files[0]);
  if (el.id === 'program-file' && el.files && el.files[0]) importProgramFile(el.files[0]);
});
document.addEventListener('submit', ev => {
  const id = ev.target.id;
  if (!['auth-form', 'wt-form', 'scan-form'].includes(id)) return;
  ev.preventDefault();
  if (id === 'auth-form') authSubmit(ev.submitter && ev.submitter.dataset.mode === 'up' ? 'up' : 'in');
  if (id === 'wt-form') logWeight();
  if (id === 'scan-form') saveScanForm();
});
function stepDay(n) {
  const today = startOfDay(Date.now()), next = startOfDay((S.day || today) + n * DAY + 12 * 3600000);
  if (next > today) return;
  S.day = next; render();
}
// swipe left/right anywhere on the Today tab (outside the 3D figure) to move between days
let swipe = null;
document.addEventListener('touchstart', ev => {
  if (S.tab !== 'today' || S.screen !== 'tabs' || S.sheet || ev.touches.length !== 1 || ev.target.closest('.fig-host, input, select')) { swipe = null; return; }
  swipe = {x: ev.touches[0].clientX, y: ev.touches[0].clientY};
}, {passive: true});
document.addEventListener('touchend', ev => {
  if (!swipe) return;
  const t = ev.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y; swipe = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) stepDay(dx < 0 ? 1 : -1);
}, {passive: true});
// tapping into a number puts the cursor after it, ready to backspace, wherever on the box the tap landed;
// the phone places its own cursor after focus, so put it back once the tap's click lands
const caretEnd = el => { try { const n = el.value.length; el.setSelectionRange(n, n); } catch {} };
let caretTap = null;
document.addEventListener('focusin', ev => {
  const el = ev.target;
  if (el.tagName !== 'INPUT' || (el.inputMode !== 'numeric' && el.inputMode !== 'decimal')) return;
  caretTap = {el, at: Date.now()}; caretEnd(el);
  setTimeout(() => { if (document.activeElement === el) caretEnd(el); }, 0);
});
document.addEventListener('click', ev => {
  if (caretTap && ev.target === caretTap.el && Date.now() - caretTap.at < 600) caretEnd(caretTap.el);
  caretTap = null;
}, true);
document.addEventListener('toggle', ev => { if (ev.target.id === 'wt-details') S.wtOpen = ev.target.open; if (ev.target.id === 'micro-details') S.microOpen = ev.target.open;
  if (ev.target.id === 'food-micros' && S.foodMicroOpen !== ev.target.open) { S.foodMicroOpen = ev.target.open; render(); } }, true);
async function importProgramFile(file) {
  try {
    const o = JSON.parse(await file.text()), p = o && o.program;
    if (!p || !Array.isArray(p.routines) || !p.routines.every(r => r && Array.isArray(r.exercises))) throw new Error('bad');
    p.id = p.id || newId(); p.routines.forEach((r, i) => { r.id = r.id || newId(); r.name = r.name || `Day ${i + 1}`; r.tag = r.tag || tagFor(r.name); const tm = cleanSpec(r.timer); if (tm) r.timer = tm; else delete r.timer; });
    setProgram(p, `${p.name || 'Program'} imported`);
  } catch { toast('That file isn’t a Liftbook program.'); }
}
async function importFile(file) {
  try {
    const o = JSON.parse(await file.text());
    if (!o || !Array.isArray(o.workouts)) throw new Error('bad');
    const have = new Set(S.workouts.map(w => w.id)); let added = 0;
    for (const w of o.workouts) if (w && w.id && Array.isArray(w.exercises) && !have.has(w.id)) { S.workouts.push(w); added++; store.saveWorkout(w); }
    S.workouts.sort((a, b) => b.startedAt - a.startedAt);
    const haveB = new Set(S.body.map(e => e.id));
    for (const e of (Array.isArray(o.body) ? o.body : [])) if (e && e.id && e.kind && !haveB.has(e.id)) { S.body.push(e); store.saveBody(e); }
    S.body.sort((a, b) => b.date - a.date);
    if (o.program && Array.isArray(o.program.routines)) { S.program = o.program; store.saveProgram(); }
    if (o.profile && o.profile.unit) { S.profile = {...DEFAULT_PROFILE, ...o.profile}; store.saveProfile(); }
    store.persistLocal(); render(); toast(`Imported ${added} workout${added === 1 ? '' : 's'}`);
  } catch { toast('That file is not a Liftbook backup.'); }
}

/* ---------- boot ---------- */
(async () => {
  const d = store.load();
  S.meta = d.meta;
  S.profile = {...DEFAULT_PROFILE, ...(d.profile || {})};
  S.program = d.program || null;   // new users choose: build from scratch, a template, or an imported program
  S.workouts = (d.workouts || []).sort((a, b) => b.startedAt - a.startedAt);
  S.body = (d.body || []).sort((a, b) => b.date - a.date);
  S.food = (d.food || []).sort((a, b) => b.date - a.date);
  applyAppearance();
  S.active = d.active || null;
  // defaults keep a zero timestamp so they never overwrite a program already saved in the cloud
  if (!d.program || !d.profile) store.persistLocal();
  if (needsWelcome()) S.screen = 'welcome';
  S.ready = true; render();
  // ask the browser not to evict the log when storage runs low
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  await Sync.init(); render();
  Outbox.flush();
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
