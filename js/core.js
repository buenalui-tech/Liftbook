// Liftbook — Helpers, exercise library and program templates, storage, cloud sync, app state.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- helpers ---------- */
const APP_VERSION = '43';   // keep in step with VERSION in sw.js (liftbook-v43)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exercise';
const pad = n => String(n).padStart(2, '0');
const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const r05 = n => Math.round(n * 2) / 2;
const fmtW = n => n == null || n === '' ? '' : (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const fmtNum = n => Math.round(n).toLocaleString();
const DAY = 86400000;
const startOfDay = t => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const startOfWeek = t => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY; };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
const ICON = {
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8"/></svg>',
  hist:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M4 10h16"/></svg>',
  prog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M5 16l5-5 4 3 6-7"/></svg>',
  body:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2.5"/><path d="M7 9.5h10M12 9.5v5M9.5 21l2.5-6.5 2.5 6.5M7 9.5l-1.5 5M17 9.5l1.5 5"/></svg>',
  food:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1.5-3 4-3 7s1 4 3 4"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10.5 8.8v6.4l5-3.2z" fill="currentColor"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'
};

/* ---------- program template (from the user's Hevy routine) ---------- */
function E(name, sets, repMin, repMax, kind, muscle, rest, timed = false) { return {id: slug(name), name, sets, repMin, repMax, kind, muscle, rest, timed}; }
const TEMPLATE = {
  id: 'nippard-4day-ul', name: 'Jeff Nippard 4-Day UL — Fundamentals',
  routines: [
    {id:'upper-a', tag:'UA', name:'Upper A', focus:'Push emphasis', exercises:[
      E('Bench Press (Barbell)',3,6,8,'barbell','Chest',180),
      E('Incline Bench Press (Dumbbell)',3,8,10,'dumbbell','Chest',150),
      E('Overhead Press (Dumbbell)',3,10,12,'dumbbell','Shoulders',120),
      E('Face Pull',3,12,15,'cable','Rear delts',90),
      E('Lateral Raise (Dumbbell)',3,12,15,'dumbbell','Side delts',90),
      E('Triceps Pushdown',3,9,9,'cable','Triceps',90),
      E('Crunch (Machine)',3,15,15,'machine','Abs',60)]},
    {id:'lower-a', tag:'LA', name:'Lower A', focus:'Quad emphasis', exercises:[
      E('Squat (Barbell)',3,6,8,'barbell','Quads',180),
      E('Leg Press (Machine)',3,10,12,'machine','Quads',150),
      E('Leg Extension (Machine)',3,12,15,'machine','Quads',90),
      E('Seated Leg Curl (Machine)',3,10,12,'machine','Hamstrings',90),
      E('Lunge (Dumbbell)',3,10,10,'dumbbell','Glutes',120),
      E('Standing Calf Raise',3,12,15,'machine','Calves',60),
      E('Hanging Knee Raise',3,12,15,'bodyweight','Abs',60)]},
    {id:'upper-b', tag:'UB', name:'Upper B', focus:'Pull emphasis', exercises:[
      E('Bent Over Row (Barbell)',3,6,8,'barbell','Back',180),
      E('Lat Pulldown (Cable)',3,8,10,'cable','Back',150),
      E('Dumbbell Row',3,10,12,'dumbbell','Back',120),
      E('Face Pull',3,15,15,'cable','Rear delts',90),
      E('Lateral Raise (Dumbbell)',3,12,15,'dumbbell','Side delts',90),
      E('Bicep Curl (Dumbbell)',3,10,12,'dumbbell','Biceps',90),
      E('Hammer Curl (Dumbbell)',3,10,12,'dumbbell','Biceps',90),
      E('Decline Crunch',3,15,15,'bodyweight','Abs',60)]},
    {id:'lower-b', tag:'LB', name:'Lower B', focus:'Posterior chain emphasis', exercises:[
      E('Deadlift (Barbell)',3,5,6,'barbell','Hamstrings',180),
      E('Romanian Deadlift (Barbell)',3,8,10,'barbell','Hamstrings',150),
      E('Hip Thrust (Barbell)',3,10,12,'barbell','Glutes',120),
      E('Lying Leg Curl (Machine)',3,15,15,'machine','Hamstrings',90),
      E('Hip Abduction (Machine)',3,10,12,'machine','Glutes',90),
      E('Seated Calf Raise',3,12,15,'machine','Calves',60),
      E('Plank',3,30,60,'bodyweight','Abs',60,true)]}
  ]
};
const MUSCLES = ['Chest','Back','Shoulders','Side delts','Rear delts','Biceps','Triceps','Forearms','Traps','Lower back','Quads','Hamstrings','Glutes','Calves','Abs'];
// Exercise library for the program builder: [name, equipment, primary muscle, [main targets], [also worked], rep min, rep max, rest s, timed]
const CATALOG = [
  ['Incline Bench Press (Barbell)', 'barbell', 'Chest', ['chest'], ['frontDelt', 'triceps'], 6, 10, 180],
  ['Bench Press (Dumbbell)', 'dumbbell', 'Chest', ['chest'], ['frontDelt', 'triceps'], 8, 12, 150],
  ['Chest Press (Machine)', 'machine', 'Chest', ['chest'], ['frontDelt', 'triceps'], 8, 12, 120],
  ['Chest Fly (Cable)', 'cable', 'Chest', ['chest'], ['frontDelt'], 10, 15, 90],
  ['Pec Deck (Machine)', 'machine', 'Chest', ['chest'], [], 10, 15, 90],
  ['Push-up', 'bodyweight', 'Chest', ['chest'], ['frontDelt', 'triceps', 'abs'], 10, 20, 90],
  ['Chest Dip', 'bodyweight', 'Chest', ['chest'], ['triceps', 'frontDelt'], 8, 12, 120],
  ['Pull-up', 'bodyweight', 'Back', ['lats'], ['biceps', 'midBack'], 6, 10, 150],
  ['Chin-up', 'bodyweight', 'Back', ['lats', 'biceps'], ['midBack'], 6, 10, 150],
  ['Seated Cable Row', 'cable', 'Back', ['midBack', 'lats'], ['biceps', 'rearDelt'], 8, 12, 120],
  ['T-Bar Row', 'barbell', 'Back', ['midBack', 'lats'], ['biceps', 'rearDelt', 'lowBack'], 6, 10, 150],
  ['Chest-Supported Row (Dumbbell)', 'dumbbell', 'Back', ['midBack', 'lats'], ['rearDelt', 'biceps'], 8, 12, 120],
  ['Straight-Arm Pulldown (Cable)', 'cable', 'Back', ['lats'], ['triceps'], 10, 15, 90],
  ['Back Extension', 'bodyweight', 'Lower back', ['lowBack'], ['glutes', 'hamstrings'], 10, 15, 90],
  ['Shrug (Dumbbell)', 'dumbbell', 'Traps', ['traps'], ['forearms'], 10, 15, 90],
  ['Overhead Press (Barbell)', 'barbell', 'Shoulders', ['frontDelt'], ['sideDelt', 'triceps'], 5, 8, 180],
  ['Shoulder Press (Machine)', 'machine', 'Shoulders', ['frontDelt'], ['sideDelt', 'triceps'], 8, 12, 120],
  ['Arnold Press (Dumbbell)', 'dumbbell', 'Shoulders', ['frontDelt', 'sideDelt'], ['triceps'], 8, 12, 120],
  ['Lateral Raise (Cable)', 'cable', 'Side delts', ['sideDelt'], [], 12, 15, 60],
  ['Reverse Fly (Dumbbell)', 'dumbbell', 'Rear delts', ['rearDelt'], ['midBack'], 12, 15, 60],
  ['Reverse Pec Deck (Machine)', 'machine', 'Rear delts', ['rearDelt'], ['midBack'], 12, 15, 60],
  ['Bicep Curl (Barbell)', 'barbell', 'Biceps', ['biceps'], ['forearms'], 8, 12, 90],
  ['Bicep Curl (Cable)', 'cable', 'Biceps', ['biceps'], ['forearms'], 10, 15, 60],
  ['Preacher Curl', 'machine', 'Biceps', ['biceps'], [], 10, 12, 90],
  ['Incline Curl (Dumbbell)', 'dumbbell', 'Biceps', ['biceps'], [], 10, 12, 90],
  ['Skull Crusher (EZ Bar)', 'barbell', 'Triceps', ['triceps'], [], 8, 12, 90],
  ['Overhead Triceps Extension (Cable)', 'cable', 'Triceps', ['triceps'], [], 10, 15, 90],
  ['Close-Grip Bench Press', 'barbell', 'Triceps', ['triceps', 'chest'], ['frontDelt'], 6, 10, 150],
  ['Triceps Dip', 'bodyweight', 'Triceps', ['triceps'], ['chest', 'frontDelt'], 8, 12, 90],
  ['Wrist Curl (Dumbbell)', 'dumbbell', 'Forearms', ['forearms'], [], 12, 20, 60],
  ['Front Squat (Barbell)', 'barbell', 'Quads', ['quads'], ['glutes', 'abs'], 5, 8, 180],
  ['Hack Squat (Machine)', 'machine', 'Quads', ['quads'], ['glutes'], 8, 12, 150],
  ['Goblet Squat', 'dumbbell', 'Quads', ['quads', 'glutes'], [], 8, 12, 120],
  ['Bulgarian Split Squat (Dumbbell)', 'dumbbell', 'Quads', ['quads', 'glutes'], ['hamstrings'], 8, 12, 120],
  ['Walking Lunge (Dumbbell)', 'dumbbell', 'Glutes', ['quads', 'glutes'], ['hamstrings'], 10, 12, 120],
  ['Step-up (Dumbbell)', 'dumbbell', 'Quads', ['quads', 'glutes'], [], 10, 12, 90],
  ['Sumo Deadlift (Barbell)', 'barbell', 'Glutes', ['glutes', 'hamstrings'], ['quads', 'lowBack', 'traps'], 3, 6, 180],
  ['Trap Bar Deadlift', 'barbell', 'Quads', ['quads', 'glutes', 'hamstrings'], ['lowBack', 'traps', 'forearms'], 3, 6, 180],
  ['Good Morning (Barbell)', 'barbell', 'Hamstrings', ['hamstrings'], ['lowBack', 'glutes'], 8, 10, 120],
  ['Nordic Hamstring Curl', 'bodyweight', 'Hamstrings', ['hamstrings'], [], 4, 8, 120],
  ['Standing Leg Curl (Machine)', 'machine', 'Hamstrings', ['hamstrings'], [], 10, 15, 90],
  ['Glute Bridge', 'bodyweight', 'Glutes', ['glutes'], ['hamstrings'], 10, 15, 60],
  ['Cable Kickback', 'cable', 'Glutes', ['glutes'], [], 12, 15, 60],
  ['Calf Press (Leg Press)', 'machine', 'Calves', ['calves'], [], 12, 20, 60],
  ['Cable Crunch', 'cable', 'Abs', ['abs'], [], 10, 15, 60],
  ['Ab Wheel Rollout', 'bodyweight', 'Abs', ['abs'], ['obliques', 'lats'], 8, 12, 90],
  ['Leg Raise', 'bodyweight', 'Abs', ['abs'], ['obliques'], 10, 15, 60],
  ['Russian Twist', 'bodyweight', 'Abs', ['obliques'], ['abs'], 12, 20, 60],
  ['Pallof Press', 'cable', 'Abs', ['obliques'], ['abs'], 10, 12, 60],
  ['Dead Bug', 'bodyweight', 'Abs', ['abs'], [], 10, 12, 60],
  ['Side Plank', 'bodyweight', 'Abs', ['obliques'], ['abs'], 30, 60, 60, true]
].map(([name, kind, muscle, main, also, repMin, repMax, rest, timed]) => ({id: slug(name), name, sets: 3, repMin, repMax, kind, muscle, rest, timed: !!timed, muscles: [main, also]}));
const EMPTY_PROGRAM = () => ({id: newId(), name: 'My program', routines: [newDay(1)]});
const newDay = n => ({id: newId(), tag: 'D' + n, name: 'Day ' + n, focus: '', exercises: []});
const tagFor = name => { const w = String(name).trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w.map(x => x[0]).join('') : (w[0] || '').slice(0, 2)).slice(0, 3).toUpperCase(); };
const KINDS = ['barbell','dumbbell','machine','cable','bodyweight'];
const LOWER = new Set(['Quads','Hamstrings','Glutes','Calves']);
const DEFAULT_PROFILE = {unit:'lb', bar:45, weeklyGoal:4};

/* ---------- storage: this device first, synced to the signed-in Supabase account ---------- */
// Everything is saved on the phone immediately (works offline); Sync copies changes to the cloud.
// Keep LS_KEY stable across updates so existing logs keep loading.
const LS_KEY = 'liftbook.v1';
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const lsWrite = o => { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); return true; } catch { return false; } };
const freshMeta = () => ({stamps: {profile: 0, program: 0, active: 0}, userId: null, dirtyS: false, dirtyW: [], delW: [], cursor: null, dirtyB: [], delB: [], cursorB: null, dirtyF: [], delF: [], cursorF: null, lastSync: 0});
// Lists that sync row-by-row: each finished workout, and each weigh-in or body scan.
const COLLS = [
  {table: 'workouts', dirty: 'dirtyW', del: 'delW', cursor: 'cursor', list: () => S.workouts, stamp: x => x.updatedAt || x.startedAt,
   sort: () => S.workouts.sort((a, b) => b.startedAt - a.startedAt), extra: w => ({started_at: w.startedAt}), tomb: {started_at: 0}},
  {table: 'body_entries', dirty: 'dirtyB', del: 'delB', cursor: 'cursorB', list: () => S.body, stamp: x => x.updatedAt || x.date,
   sort: () => S.body.sort((a, b) => b.date - a.date), extra: e => ({kind: e.kind, date: e.date}), tomb: {kind: 'deleted', date: 0}},
  {table: 'food_entries', dirty: 'dirtyF', del: 'delF', cursor: 'cursorF', list: () => S.food, stamp: x => x.updatedAt || x.date,
   sort: () => S.food.sort((a, b) => b.date - a.date), extra: e => ({kind: e.kind, date: e.date}), tomb: {kind: 'deleted', date: 0}}
];

const store = {
  mode: 'local',
  load() {
    const o = lsRead();
    return {profile: o.profile || null, program: o.program || null, active: o.active || null, workouts: o.workouts || [], body: o.body || [], food: o.food || [], meta: {...freshMeta(), ...(o.meta || {})}};
  },
  persistLocal() {
    if (!lsWrite({profile: S.profile, program: S.program, active: S.active, workouts: S.workouts, body: S.body, food: S.food, meta: S.meta}))
      toast('This phone is out of storage space. Export a backup.');
  },
  touch(field) { S.meta.stamps[field] = Date.now(); S.meta.dirtyS = true; S.meta.gen = (S.meta.gen || 0) + 1; },
  saveProfile() { this.touch('profile'); this.persistLocal(); Sync.schedule(); },
  saveProgram() { this.touch('program'); this.persistLocal(); Sync.schedule(); },
  saveActive() { this.touch('active'); this.persistLocal(); Sync.schedule(); },
  saveRow(c, x) {
    x.updatedAt = Date.now();
    if (!S.meta[c.dirty].includes(x.id)) S.meta[c.dirty].push(x.id);
    S.meta.gen = (S.meta.gen || 0) + 1; this.persistLocal(); Sync.schedule();
  },
  deleteRow(c, id) {
    S.meta[c.dirty] = S.meta[c.dirty].filter(x => x !== id);
    if (!S.meta[c.del].includes(id)) S.meta[c.del].push(id);
    S.meta.gen = (S.meta.gen || 0) + 1; this.persistLocal(); Sync.schedule();
  },
  saveWorkout(w) { this.saveRow(COLLS[0], w); },
  deleteWorkout(id) { this.deleteRow(COLLS[0], id); },
  saveBody(e) { this.saveRow(COLLS[1], e); },
  saveFood(e) { this.saveRow(COLLS[2], e); },
  deleteFood(id) { this.deleteRow(COLLS[2], id); },
  deleteBody(id) { this.deleteRow(COLLS[1], id); }
};

/* ---------- cloud sync (Supabase) ---------- */
const CFG = window.LIFTBOOK_CONFIG || {};
const Sync = {
  client: null, user: null, status: 'off', detail: '', busy: false, again: false, timer: null, missing: {},
  configured() { return !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase && window.supabase.createClient); },
  async init() {
    if (!this.configured()) return;
    // a password-reset link lands here with "type=recovery" in the address: ask for the new password once signed in
    const recovering = /type=recovery/.test(location.hash);
    try {
      this.client = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
      const {data} = await this.client.auth.getSession();
      this.user = data.session ? data.session.user : null;
    } catch (e) { console.warn('sync init', e); return; }
    // Supabase warns against awaiting its own calls inside this callback, so hand off with setTimeout
    this.client.auth.onAuthStateChange((ev, session) => {
      const u = session ? session.user : null, changed = (u && u.id) !== (this.user && this.user.id);
      this.user = u;
      if (ev === 'PASSWORD_RECOVERY') setTimeout(() => { S.sheet = {type: 'new-password'}; render(); }, 0);
      if (changed) setTimeout(() => { u ? this.onSignedIn() : this.set('off'); render(); }, 0);
    });
    if (recovering && this.user) setTimeout(() => { S.sheet = {type: 'new-password'}; render(); }, 0);
    window.addEventListener('online', () => this.run(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.run(true); });
    if (this.user) this.onSignedIn();
  },
  onSignedIn() {
    if (S.meta.userId && S.meta.userId !== this.user.id) {
      // a different account on this phone: start from that account's cloud log
      S.workouts = []; S.body = []; S.food = []; S.active = null; S.program = null; S.profile = {...DEFAULT_PROFILE};
      S.meta = freshMeta();
    }
    if (!S.meta.userId) {
      // first link on this phone: everything already logged here gets uploaded
      for (const c of COLLS) S.meta[c.dirty] = [...new Set([...S.meta[c.dirty], ...c.list().map(x => x.id)])];
      S.meta.dirtyS = true;
    }
    S.meta.userId = this.user.id; store.persistLocal();
    this.run(true);
  },
  set(status, detail = '') {
    this.status = status; this.detail = detail;
    document.querySelectorAll('.syncpill').forEach(el => { el.outerHTML = syncPill(); });
    const st = document.getElementById('sync-status'); if (st) st.textContent = syncStatusText();
  },
  schedule(ms = 1500) { if (!this.user) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.run(false), ms); },
  async run(pull) {
    if (!this.client || !this.user) return;
    if (!navigator.onLine) { this.set('offline'); return; }
    if (this.busy) { this.again = true; this.againPull = this.againPull || pull; return; }
    this.busy = true; this.set('saving');
    try {
      if (pull) await this.pull();
      await this.push();
      S.meta.lastSync = Date.now(); store.persistLocal(); this.set('idle');
    } catch (e) {
      console.warn('sync', e);
      this.set(navigator.onLine ? 'error' : 'offline', (e && e.message) || '');
      // weak gym signal often never fires an 'online' event, so keep retrying quietly
      clearTimeout(this.retry); this.retry = setTimeout(() => this.run(true), 30000);
    } finally {
      this.busy = false;
      if (this.again) { const p = this.againPull; this.again = false; this.againPull = false; setTimeout(() => this.run(p), 300); }
    }
  },
  async pull() {
    const uid = this.user.id; let changed = false;
    const st = await this.client.from('user_state').select('*').eq('user_id', uid).maybeSingle();
    if (st.error) throw st.error;
    if (st.data) {
      for (const f of ['profile', 'program', 'active']) {
        const at = Number(st.data[f + '_at']) || 0;
        if (at > (S.meta.stamps[f] || 0) || (f === 'program' && !S.program && st.data.program)) {
          if (f === 'profile') S.profile = {...DEFAULT_PROFILE, ...(st.data.profile || {})};
          if (f === 'program' && st.data.program) S.program = st.data.program;
          if (f === 'program') Sync.pulledProgram = true;
          if (f === 'active') { S.active = st.data.active || null; if (!S.active && S.screen === 'workout') S.screen = 'tabs'; }
          S.meta.stamps[f] = at; changed = true;
        }
      }
    } else S.meta.dirtyS = true;
    Sync.pulledProgram = true;
    // rows changed on the server since the last pull (server-stamped, so phone clocks don't matter)
    for (const c of COLLS) {
      if (this.missing[c.table]) continue;
      let hit = false;
      for (let from = 0; ; from += 1000) {
        let q = this.client.from(c.table).select('id,updated_at,deleted,data,synced_at').eq('user_id', uid).order('synced_at').range(from, from + 999);
        if (S.meta[c.cursor]) q = q.gt('synced_at', S.meta[c.cursor]);
        const {data, error} = await q;
        if (error) { if (tableMissing(error)) { this.missing[c.table] = true; break; } throw error; }
        const list = c.list();
        for (const row of data) {
          const i = list.findIndex(x => x.id === row.id), local = list[i];
          if (row.deleted) { if (local) { list.splice(i, 1); hit = true; } S.meta[c.dirty] = S.meta[c.dirty].filter(x => x !== row.id); }
          else if (!local || Number(row.updated_at) > c.stamp(local)) {
            if (local) list[i] = row.data; else list.push(row.data);
            S.meta[c.dirty] = S.meta[c.dirty].filter(x => x !== row.id); hit = true;
          }
          if (!S.meta[c.cursor] || row.synced_at > S.meta[c.cursor]) S.meta[c.cursor] = row.synced_at;
        }
        if (data.length < 1000) break;
      }
      if (hit) { c.sort(); changed = true; }
    }
    if (changed) {
      store.persistLocal();
      // don't redraw under the lifter's thumbs mid-set unless the workout itself changed
      if (S.screen !== 'workout' || !S.active) render();
    }
  },
  async push() {
    const uid = this.user.id, gen = S.meta.gen || 0;
    const state = S.meta.dirtyS;
    if (state) {
      const {error} = await this.client.from('user_state').upsert({
        user_id: uid, profile: S.profile, program: S.program, active: S.active,
        profile_at: S.meta.stamps.profile || 0, program_at: S.meta.stamps.program || 0, active_at: S.meta.stamps.active || 0
      }, {onConflict: 'user_id'});
      if (error) throw error;
    }
    for (const c of COLLS) {
      if (this.missing[c.table]) continue;
      const ids = [...S.meta[c.dirty]], dels = [...S.meta[c.del]];
      const rows = ids.map(id => c.list().find(x => x.id === id)).filter(Boolean)
        .map(x => ({user_id: uid, id: x.id, updated_at: c.stamp(x), deleted: false, data: x, ...c.extra(x)}))
        .concat(dels.map(id => ({user_id: uid, id, updated_at: Date.now(), deleted: true, data: null, ...c.tomb})));
      for (let i = 0; i < rows.length; i += 200) {
        const {error} = await this.client.from(c.table).upsert(rows.slice(i, i + 200), {onConflict: 'user_id,id'});
        if (error) { if (tableMissing(error)) { this.missing[c.table] = true; break; } throw error; }
      }
      if (this.missing[c.table]) continue;
      // clear only what was sent; anything changed mid-push stays queued for the next run
      S.meta[c.dirty] = S.meta[c.dirty].filter(x => !ids.includes(x));
      S.meta[c.del] = S.meta[c.del].filter(x => !dels.includes(x));
    }
    if (state && (S.meta.gen || 0) === gen) S.meta.dirtyS = false;
    if ((S.meta.gen || 0) !== gen) this.again = true;
  },
  async signIn(email, password) { return this.client.auth.signInWithPassword({email, password}); },
  async signUp(email, password) { return this.client.auth.signUp({email, password, options: {emailRedirectTo: location.href.split('#')[0]}}); },
  async signOut() { await this.client.auth.signOut(); this.user = null; this.set('off'); },
  async resetPassword(email) { return this.client.auth.resetPasswordForEmail(email, {redirectTo: location.href.split('#')[0]}); },
  async updatePassword(password) { return this.client.auth.updateUser({password}); },
  // removes the sign-in and every synced row (they cascade); see supabase/005_delete_account.sql
  async deleteAccount() { return this.client.rpc('delete_my_account'); }
};
// a table the database doesn't have yet (setup.sql not re-run): skip it, keep the rest syncing
const tableMissing = e => e && (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || ''));
function syncPill() {
  if (!Sync.user) return '<span class="syncpill"></span>';
  const map = {idle: ['ok', 'Synced'], saving: ['busy', 'Syncing…'], offline: ['off', 'Offline · saved on phone'], error: ['err', 'Sync problem'], off: ['off', '']};
  const [cls, label] = map[Sync.status] || map.off;
  return label ? `<button class="syncpill ${cls}" data-act="settings-open">${label}</button>` : '<span class="syncpill"></span>';
}
function syncStatusText() {
  if (Sync.status === 'error') return 'Last sync failed: ' + (Sync.detail || 'unknown error') + '. Your log is safe on this phone.';
  if (Sync.status === 'offline') return 'Offline. Changes are saved on this phone and upload when you reconnect.';
  if (Sync.status === 'saving') return 'Syncing…';
  return S.meta.lastSync ? 'Last synced ' + new Date(S.meta.lastSync).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : 'Not synced yet.';
}

const debounced = {};
const pending = {};
function later(key, fn, ms = 700) {
  clearTimeout(debounced[key]); pending[key] = fn;
  debounced[key] = setTimeout(() => { delete pending[key]; fn(); }, ms);
}
const saveActiveSoon = () => later('active', () => store.saveActive());
// run any pending save the moment the app is backgrounded or closed
function flushSaves() { for (const k of Object.keys(pending)) { clearTimeout(debounced[k]); const fn = pending[k]; delete pending[k]; fn(); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); });
window.addEventListener('pagehide', flushSaves);
const saveProgramSoon = () => later('program', () => store.saveProgram());

/* ---------- state ---------- */
const S = {
  ready: false, profile: {...DEFAULT_PROFILE}, program: null, workouts: [], active: null,
  tab: 'today', screen: 'tabs', sheet: null, menuEx: null, editRoutine: null,
  progressEx: null, rest: null, armed: null, summary: null,
  meta: freshMeta(), authEmail: '', authMsg: '', authBusy: false,
  body: [], food: [], scanIdx: null, scanCompare: 'prev', bodySeg: null, wtRange: 90, wtAll: false, wtOpen: false, scanMsg: ''
};

const ICON_NOTE = ICON.note;
const ICON_PIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/></svg>';
