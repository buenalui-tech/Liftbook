// Unit tests for Liftbook's logic. Run from the project root:
//   node --test tests/
// The real app files are loaded into a sandbox with a minimal stand-in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['core', 'training', 'ui', 'program', 'body', 'food', 'adaptive', 'figure', 'share', 'tester', 'settings', 'timer', 'events'];
const DAY = 86400000;

function loadApp(stored = {}, extra = {}) {
  const store = new Map(Object.entries(stored).map(([k, v]) => [k, JSON.stringify(v)]));
  const el = () => ({innerHTML: '', textContent: '', hidden: false, style: {}, classList: {toggle() {}, contains() { return false; }},
    addEventListener() {}, appendChild() {}, remove() {}, querySelectorAll: () => [], querySelector: () => null, isConnected: false, dataset: {}});
  const document = {getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
    createElement: el, head: el(), body: el(), documentElement: {dataset: {}}, fonts: {ready: Promise.resolve()}, visibilityState: 'visible', activeElement: null};
  const ctx = {
    console, Math, Date, JSON, Promise, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, Float32Array, Float64Array, Int16Array, isNaN, parseFloat, parseInt,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    document, location: {protocol: 'file:', href: 'file:///'}, performance: {now: () => 0},
    navigator: {onLine: true, userAgent: 'node', maxTouchPoints: 0},
    localStorage: {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)},
    matchMedia: () => ({matches: false}), addEventListener() {}, scrollTo() {}, scrollBy() {}, getComputedStyle: () => ({getPropertyValue: () => ''}), LIFTBOOK_CONFIG: {},
  };
  Object.assign(ctx, extra);
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // top-level const/let live in the context's script scope; expose the names tests need
  const src = FILES.map(f => fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8')).join('\n;\n') +
    '\n;globalThis.T = {S, store, suggest, e1rm, niceTicks, weightSeries, weeklyRateKg, caloriesFor, improvements, recomputePRs, muscleLoad, musclesFor, tagFor, lastPerf, scanKg, conv, TEMPLATE, CATALOG, slug, startOfDay, fromUsda, fromOff, rankFoods, unitsFor, portionTotals, autoTargets, dayTotals, estimateBurn, targets, targetsFromBurn, computeTargets, nutritionPrefs, proposeTargets, applyCheckin, runAutoCheckin, checkinDue, copyMeal, foodLogs, viewToday, viewFood, viewProgress, viewBody, viewProgram, viewSheet, viewWorkout, startWorkout, viewSettings, buildPhases, Timer, viewTimer, viewTimerSetup, viewMobilitySetup, MOBILITY, viewTrainingLoad, sessionLoad, specFromVals, specToSheet, cleanSpec, specSecs, finishWorkout, timerOutline, viewTimerSetup, microFromUsda, microFromOff, entryMicro, viewMicros, Micro, fromUsda, portionMicros, TEMPLATE_COPY: () => JSON.parse(JSON.stringify(TEMPLATE))};';
  vm.runInContext(src, ctx, {filename: 'liftbook.js'});
  return ctx.T;
}
const set = (w, r, done = true) => ({w, r, done, warm: false});
const workout = (id, daysAgo, exercises, extra = {}) => {
  const t = Date.now() - daysAgo * DAY;
  return {id, routineId: 'upper-a', routineName: 'Upper A', unit: 'lb', startedAt: t, endedAt: t + 60 * 60000, exercises, ...extra};
};
const bench = sets => ({exId: 'bench-press-barbell', name: 'Bench Press (Barbell)', muscle: 'Chest', kind: 'barbell', repMin: 6, repMax: 8, rest: 180, sets});

test('estimated one-rep max (Epley)', () => {
  const T = loadApp();
  assert.equal(T.e1rm(100, 1), 100);
  assert.equal(Math.round(T.e1rm(185, 8)), 234);
  assert.equal(T.e1rm(0, 8), 0);
});

test('double progression: top of the range on every set means add weight', () => {
  const T = loadApp({'liftbook.v1': {workouts: [workout('a', 3, [bench([set(185, 8), set(185, 8), set(185, 8)])])]}});
  T.S.workouts = JSON.parse(JSON.stringify(T.S.workouts.length ? T.S.workouts : [workout('a', 3, [bench([set(185, 8), set(185, 8), set(185, 8)])])]));
  const ex = T.TEMPLATE.routines[0].exercises[0];
  const s = T.suggest(ex);
  assert.equal(s.tone, 'up');
  assert.equal(s.w, 190);
});

test('double progression: a set below the range means stay', () => {
  const T = loadApp();
  T.S.workouts = [workout('a', 3, [bench([set(185, 8), set(185, 6), set(185, 5)])])];
  const s = T.suggest(T.TEMPLATE.routines[0].exercises[0]);
  assert.equal(s.tone, 'hold');
  assert.equal(s.w, 185);
});

test('records are recalculated in date order after edits', () => {
  const T = loadApp();
  T.S.workouts = [workout('new', 1, [bench([set(185, 8)])]), workout('old', 8, [bench([set(175, 8)])])];
  T.recomputePRs();
  // arrays made inside the sandbox are compared by contents
  assert.deepEqual([...(T.S.workouts.find(w => w.id === 'new').prs || [])], ['bench-press-barbell']);
  assert.deepEqual([...(T.S.workouts.find(w => w.id === 'old').prs || [])], []);
  // move the heavier one before the lighter one: the record moves too
  T.S.workouts.find(w => w.id === 'new').startedAt = Date.now() - 10 * DAY;
  T.recomputePRs();
  assert.deepEqual([...(T.S.workouts.find(w => w.id === 'new').prs || [])], []);
});

test('"Improved" compares with the previous session of each exercise', () => {
  const T = loadApp();
  const prev = workout('p', 7, [bench([set(175, 8)])]), now = workout('n', 0, [bench([set(180, 8)])]);
  T.S.workouts = [now, prev];
  const r = T.improvements(now);
  assert.equal(r.compared, 1);
  assert.equal(r.improved.size, 1);
  const same = workout('s', 0, [bench([set(175, 8)])]);
  assert.equal(T.improvements(same).improved.size, 0, 'repeating last time is not an improvement');
});

test('weight trend averages the last 7 days and the weekly rate matches a steady loss', () => {
  const T = loadApp();
  // 3 weeks of readings dropping 0.2 lb a day = -1.4 lb/week (the first week only warms up the 7-day average)
  T.S.body = Array.from({length: 21}, (_, i) => ({id: 'w' + i, kind: 'weight', date: Date.now() - (20 - i) * DAY, w: 200 - i * 0.2, unit: 'lb'}));
  const pts = T.weightSeries();
  assert.equal(pts.length, 21);
  const last = pts[pts.length - 1];
  assert.ok(last.trend > last.kg, 'when losing, the 7-day average sits above the latest reading');
  const rate = T.weeklyRateKg(pts) / 0.453592;   // lb per week
  assert.ok(rate < -1.2 && rate > -1.6, `expected about -1.4 lb/week, got ${rate}`);
});

test('chart gridlines land on clean decimal steps', () => {
  const T = loadApp();
  const r = T.niceTicks(197.2, 198.9, 5);
  assert.deepEqual([...r.ticks], [197.5, 198, 198.5]);
  assert.equal(r.digits, 1);
});

test('calories: a watch number wins, otherwise MET × weight × time', () => {
  const T = loadApp();
  T.S.body = [{id: 'b', kind: 'weight', date: Date.now() - 20 * DAY, w: 197, unit: 'lb'}];
  const w = workout('a', 1, [bench([set(185, 8)])]);
  w.endedAt = w.startedAt + 58 * 60000;
  assert.deepEqual({...T.caloriesFor(w)}, {kcal: 432, est: true});
  assert.deepEqual({...T.caloriesFor({...w, calories: 515})}, {kcal: 515, est: false});
  T.S.body = [];
  assert.equal(T.caloriesFor(w), null, 'no weigh-in: no guess');
});

test('muscle map: main targets and supporting muscles', () => {
  const T = loadApp();
  const load = T.muscleLoad(workout('a', 0, [bench([set(185, 8), set(185, 8), set(185, 8)])]));
  assert.equal(load.chest.main, true);
  assert.equal(load.chest.score, 3);
  assert.equal(load.triceps.main, false);
  assert.equal(load.biceps, undefined, 'bench does not train biceps');
  // library exercises carry their own tags
  const curl = T.CATALOG.find(x => x.id === T.slug('Bicep Curl (Cable)'));
  assert.deepEqual([...T.musclesFor(curl)[0]], ['biceps']);
});

test('every library and template exercise maps to at least one muscle', () => {
  const T = loadApp();
  const all = [...T.CATALOG, ...T.TEMPLATE.routines.flatMap(r => r.exercises)];
  for (const ex of all) assert.ok(T.musclesFor(ex)[0].length, `${ex.name} has no main muscle`);
  assert.equal(new Set(T.CATALOG.map(x => x.id)).size, T.CATALOG.length, 'library ids are unique');
});

test('InBody scan values convert from lb and fill missing segments from totals', () => {
  const T = loadApp();
  const k = T.scanKg({unit: 'lb', weight: 203.5, bfm: 56.2, pbf: 27.6, seg: {ra: {lean: 8.64, fat: 3.5}}});
  assert.ok(Math.abs(k.weight - 92.3) < 0.1);
  assert.ok(Math.abs(k.seg.ra.lean - 3.92) < 0.01);
  assert.equal(k.est, true, 'segments filled from totals are flagged as estimates');
});

test('day badges are short and readable', () => {
  const T = loadApp();
  assert.equal(T.tagFor('Upper A'), 'UA');
  assert.equal(T.tagFor('Push'), 'PU');
});

test('food: USDA results become per-100 g foods with household portions', () => {
  const T = loadApp();
  const f = T.fromUsda({fdcId: 1105314, description: 'Banana, raw', dataType: 'Survey (FNDDS)',
    foodNutrients: [{nutrientId: 1008, value: 97}, {nutrientId: 1003, value: 0.74}, {nutrientId: 1005, value: 22.71}, {nutrientId: 1004, value: 0.28}, {nutrientId: 1079, value: 1.7}],
    foodMeasures: [{disseminationText: 'Quantity not specified', gramWeight: 118}, {disseminationText: '1 banana', gramWeight: 126}]});
  assert.equal(f.per100.kcal, 97);
  assert.deepEqual(f.servings.map(s => s.label), ['1 banana'], '"Quantity not specified" is dropped');
  const {grams, totals} = T.portionTotals(f, 1, 's0');
  assert.equal(grams, 126);
  assert.equal(totals.kcal, 122.2);
  // Foundation foods that only report Atwater energy still get calories
  const g = T.fromUsda({fdcId: 1, description: 'Chicken breast, cooked', dataType: 'Foundation', foodNutrients: [{nutrientId: 2047, value: 165}, {nutrientId: 1003, value: 31}]});
  assert.equal(g.per100.kcal, 165);
});

test('food: Open Food Facts products convert, kJ-only labels included', () => {
  const T = loadApp();
  const f = T.fromOff({code: '123', product_name: 'Bar', brands: 'Quest, Other', serving_quantity: '60', serving_size: '1 bar (60 g)',
    nutriments: {energy_100g: 1590, proteins_100g: 35, carbohydrates_100g: 38, fat_100g: 13}});
  assert.equal(f.brand, 'Quest');
  assert.equal(f.per100.kcal, 380);
  assert.equal(T.portionTotals(f, 1, 's0').totals.p, 21);
  assert.equal(f.servings[0].label, '1 bar (60 g)', 'the label’s own serving wording is kept as is');
  assert.equal(T.fromOff({code: '9', product_name: 'No data', nutriments: {}}), null, 'products without energy are skipped');
});

test('food: plain matches rank above processed ones', () => {
  const T = loadApp();
  const names = ['Lunchmeat, chicken breast, sliced', 'Chicken breast tenders, breaded, cooked', 'Chicken breast, roasted'];
  const ranked = T.rankFoods(names.map(n => ({name: n, source: 'usda'})), 'chicken breast');
  assert.equal(ranked[0].name, 'Chicken breast, roasted');
});

test('food: targets come from the InBody BMR when there is one, and the goal moves them', () => {
  const T = loadApp();
  T.S.body = [{id: 'w', kind: 'weight', date: Date.now() - DAY, w: 200, unit: 'lb'}];
  T.S.profile.goal = {type: 'maintain', rate: 0};
  assert.equal(T.autoTargets().kcal, 3000, '200 lb × 15');
  T.S.body.push({id: 's', kind: 'scan', date: Date.now() - 2 * DAY, unit: 'lb', weight: 200, bmr: 1800, seg: {}});
  assert.equal(T.autoTargets().kcal, 2700, 'BMR 1800 × 1.5');
  T.S.profile.goal = {type: 'cut', rate: 1};
  const t = T.autoTargets();
  assert.equal(t.kcal, 2200, '1 lb/week cut = −500 kcal/day');
  assert.equal(t.p, 180);
  assert.equal(t.c, Math.round((2200 - 180 * 4 - 70 * 9) / 4));
});

// a steady world: eat `kcal` every day, weight falls `lbPerWeek` from 200 lb, weighed every day
function steadyWorld(T, {kcal, lbPerWeek, days = 35, skipFood = []}) {
  const today = T.startOfDay(Date.now());
  T.S.body = []; T.S.food = [];
  for (let i = days; i >= 1; i--) {
    const day = today - i * DAY;
    T.S.body.push({id: 'w' + i, kind: 'weight', date: day + 7 * 3600000, w: 200 - (days - i) * lbPerWeek / 7, unit: 'lb'});
    if (!skipFood.includes(i)) T.S.food.push({id: 'f' + i, kind: 'log', date: day + 12 * 3600000, meal: 'lunch', food: {key: 'quick:x', name: 'x', source: 'quick'}, qty: 1, totals: {kcal, p: 150, c: 250, f: 70, fiber: 20}});
  }
}

test('adaptive: real burn = intake minus trend change (3,500 kcal per lb)', () => {
  const T = loadApp();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});
  const est = T.estimateBurn();
  assert.equal(est.ready, true);
  assert.ok(Math.abs(est.burn - 2750) <= 20, `expected about 2,750, got ${est.burn}`);
  steadyWorld(T, {kcal: 3000, lbPerWeek: -0.5});   // gaining
  assert.ok(Math.abs(T.estimateBurn().burn - 2750) <= 20);
});

test('adaptive: waits for enough data, and skips partly logged days', () => {
  const T = loadApp();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5, days: 8});
  const early = T.estimateBurn();
  assert.equal(early.ready, false);
  assert.equal(early.progress.foodDays, 8);
  // a 300 kcal day (forgot to log) is ignored; so is a day marked as incomplete
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});
  const today = T.startOfDay(Date.now());
  T.S.food.find(x => x.id === 'f3').totals.kcal = 300;
  T.S.food.find(x => x.id === 'f5').totals.kcal = 1200;
  T.S.profile.incompleteDays = [today - 5 * DAY];
  const est = T.estimateBurn();
  assert.equal(est.foodDays, 19);
  assert.ok(Math.abs(est.burn - 2750) <= 20, `partial days must not drag the estimate, got ${est.burn}`);
});

test('adaptive: an accepted burn drives targets, adjusted for the goal', () => {
  const T = loadApp();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});
  T.S.profile.goal = {type: 'cut', rate: 0.5};
  T.S.profile.adaptive = {burn: 2750, at: Date.now(), week: 0};
  assert.equal(T.targets().kcal, 2500, '2,750 burn − 250 for a 0.5 lb/week cut');
  T.S.profile.nutrition = {kcalMode: 'manual', kcal: 2000, split: 'recommended'};
  assert.equal(T.targets().kcal, 2000, 'your own calorie number wins over the learned burn');
});

test('food: copying yesterday’s meal makes new entries for today', () => {
  const T = loadApp();
  const today = T.startOfDay(Date.now());
  T.S.food = [{id: 'a', kind: 'log', date: today - DAY + 9 * 3600000, meal: 'breakfast', food: {key: 'k', name: 'Oats'}, qty: 1, totals: {kcal: 300, p: 10, c: 50, f: 5, fiber: 8}}];
  assert.equal(T.copyMeal(today - DAY, 'breakfast', today), 1);
  const copied = T.foodLogs(today);
  assert.equal(copied.length, 1);
  assert.notEqual(copied[0].id, 'a');
  assert.equal(T.dayTotals(today).kcal, 300);
});

test('every tab and the main sheets draw without errors, empty and with data', () => {
  const T = loadApp();
  const draw = label => {
    for (const [name, fn] of [['Settings', T.viewSettings], ['Today', T.viewToday], ['Food', T.viewFood], ['Progress', T.viewProgress], ['Body', T.viewBody], ['Program', T.viewProgram]]) {
      assert.doesNotThrow(() => { const html = fn(); assert.ok(html.length > 50); }, `${name} tab (${label})`);
    }
  };
  draw('brand-new user');
  // a well-used account: program, workouts, weigh-ins, a scan, food, an accepted learned burn
  T.S.program = T.TEMPLATE_COPY();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});
  T.S.workouts = [workout('a', 1, [bench([set(185, 8), set(185, 8)])]), {id: 'r', kind: 'activity', type: 'run', routineName: 'Run', unit: 'lb', exercises: [], startedAt: Date.now() - 2 * DAY, endedAt: Date.now() - 2 * DAY + 1800000, distance: 3, distUnit: 'mi'}];
  T.S.body.push({id: 's', kind: 'scan', date: Date.now() - 3 * DAY, unit: 'lb', weight: 200, bfm: 50, pbf: 25, smm: 85, bmr: 1800, seg: {ra: {lean: 8.6, fat: 3.5}}});
  T.S.profile.goal = {type: 'cut', rate: 0.5};
  draw('with data');
  T.S.profile.adaptive = {burn: 2750, at: Date.now(), week: 0};
  draw('after accepting a learned burn');
  // sheets reached from those tabs
  for (const sheet of [{type: 'add-food', meal: 'lunch', mode: 'search'}, {type: 'add-food', meal: 'lunch', mode: 'recent'}, {type: 'add-food', meal: 'lunch', mode: 'mine'},
    {type: 'add-food', meal: 'lunch', mode: 'quick'}, {type: 'custom-food', meal: 'lunch'}, {type: 'barcode', meal: 'lunch'}, {type: 'targets'}, {type: 'targets', draft: {kcalMode: 'manual', kcal: 2400, split: 'percent', pct: {p: 40, f: 30}}}, {type: 'targets', draft: {kcalMode: 'auto', split: 'grams', grams: {p: 180, c: 250, f: 70}, pct: {p: 30, f: 30}}}, {type: 'save-meal', meal: 'lunch'},
    {type: 'detail', id: 'a'}, {type: 'detail', id: 'r'}, {type: 'log', day: T.startOfDay(Date.now())}, {type: 'log', day: T.startOfDay(Date.now()), form: {type: 'treadmill', dateStr: '2026-10-01', rpe: 6}}, {type: 'log', day: T.startOfDay(Date.now()), form: {type: 'rower', dateStr: '2026-10-01'}}, {type: 'timer-setup', kind: 'emom', vals: {minutes: 12}}, {type: 'timer-setup', ...T.specToSheet(null), kind: 'custom'}, {type: 'timer-setup', ...T.specToSheet(null), forDay: 'upper-a'}, {type: 'timer-setup', ...T.specToSheet(null), forStart: 'upper-a'}, {type: 'mobility-setup', hold: 0}, {type: 'scan'}, {type: 'feedback', kind: 'bug'}]) {
    T.S.sheet = sheet;
    assert.doesNotThrow(() => T.viewSheet(), `sheet ${sheet.type}${sheet.mode ? '/' + sheet.mode : ''}`);
  }
  T.S.sheet = null;
  // and the live workout screen
  T.startWorkout('upper-a');
  assert.doesNotThrow(() => T.viewWorkout(), 'live workout');
  T.S.workouts[0].rpe = 7; assert.doesNotThrow(() => T.viewTrainingLoad(), 'training load');
  T.Timer.start({kind: 'amrap', minutes: 10, exercises: ['5 pull-ups']}); assert.doesNotThrow(() => T.viewTimer(), 'timer screen');
  T.Timer.finish(true); assert.doesNotThrow(() => T.viewTimer(), 'timer summary');
});

test('targets: percentages always total 100, grams set the calories, legacy custom targets still load', () => {
  const T = loadApp();
  T.S.body = [{id: 'w', kind: 'weight', date: Date.now() - DAY, w: 200, unit: 'lb'}];
  // 50% protein, 25% fat: carbs take the remaining 25%
  const pct = T.computeTargets({kcalMode: 'manual', kcal: 2000, split: 'percent', pct: {p: 50, f: 25}});
  assert.deepEqual({...pct.pct}, {p: 50, c: 25, f: 25});
  assert.equal(pct.p, 250); assert.equal(pct.c, 125); assert.equal(pct.f, 56);
  // grams: calories are the result, so they can never disagree with the macros
  const g = T.computeTargets({kcalMode: 'manual', kcal: 1500, split: 'grams', grams: {p: 200, c: 250, f: 70}});
  assert.equal(g.kcal, 200 * 4 + 250 * 4 + 70 * 9);
  // recommended: protein and fat from body weight, carbs fill the rest
  const r = T.computeTargets({kcalMode: 'manual', kcal: 2500, split: 'recommended'});
  assert.equal(r.p, 180); assert.equal(r.f, 70); assert.equal(r.c, Math.round((2500 - 180 * 4 - 70 * 9) / 4));
  // the first version's saved shape keeps working
  T.S.profile.nutrition = {mode: 'custom', kcal: 2000, p: 160, c: 200, f: 60};
  assert.equal(T.nutritionPrefs().split, 'grams');
  assert.equal(T.targets().kcal, 160 * 4 + 200 * 4 + 60 * 9);
});

test('check-in: works with your own numbers, moves at most 250 kcal a week, and grams keep protein', () => {
  const T = loadApp();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});           // real burn ≈ 2,750
  T.S.profile.goal = {type: 'cut', rate: 1};              // wants −500 → about 2,250
  // my own number, far too high: the suggestion moves 250 toward the goal, not all the way
  T.S.profile.nutrition = {kcalMode: 'manual', kcal: 3000, split: 'recommended'};
  const est = T.checkinDue();
  assert.ok(est, 'check-ins now appear for your own numbers too');
  const p = T.proposeTargets(est);
  assert.equal(p.next.kcal, 2750); assert.equal(p.capped, true);
  T.applyCheckin(est, false);
  assert.equal(T.nutritionPrefs().kcalMode, 'manual', 'still your own number');
  assert.equal(T.targets().kcal, 2750);
  // grams: protein fixed, carbs absorb the change
  T.S.profile.adaptive = null;
  T.S.profile.nutrition = {kcalMode: 'manual', split: 'grams', grams: {p: 200, c: 300, f: 70}};   // 2,630 kcal
  const g = T.proposeTargets(T.checkinDue());
  assert.equal(g.next.p, 200);
  assert.ok(g.next.c < 300 && g.next.f === 70, `carbs drop first: ${g.next.c} g carbs, ${g.next.f} g fat`);
  assert.ok(Math.abs(g.next.kcal - (2630 - 250)) <= 10);
});

test('check-in: automatic mode applies once a week and can be undone', () => {
  const T = loadApp();
  steadyWorld(T, {kcal: 2500, lbPerWeek: 0.5});
  T.S.profile.goal = {type: 'maintain', rate: 0};
  T.S.profile.settings = {checkinMode: 'auto'};
  T.S.profile.nutrition = {kcalMode: 'manual', kcal: 2400, split: 'recommended'};
  T.runAutoCheckin();
  assert.equal(T.targets().kcal, 2650, '2,400 moves 250 toward the 2,750 burn');
  T.runAutoCheckin();
  assert.equal(T.targets().kcal, 2650, 'only once a week');
  assert.equal(T.S.profile.autoCheckin.from, 2400);
});

test('timer: phases for each format', () => {
  const T = loadApp();
  const tabata = T.buildPhases({kind: 'intervals', work: 20, rest: 10, rounds: 8, exercises: ['Burpees', 'Squats']});
  assert.equal(tabata.filter(p => p.kind === 'work').length, 8);
  assert.equal(tabata.filter(p => p.kind === 'rest').length, 7, 'no rest after the last round');
  assert.equal(tabata[1].sub, 'Burpees'); assert.equal(tabata[3].sub, 'Squats', 'exercises rotate');
  assert.equal(tabata.reduce((s, p) => s + p.secs, 0), 10 + 8 * 20 + 7 * 10);
  assert.equal(T.buildPhases({kind: 'emom', minutes: 12}).filter(p => p.secs === 60).length, 12);
  const mob = T.buildPhases({kind: 'mobility', items: T.MOBILITY.hips.items, hold: 30});
  assert.ok(mob.some(p => p.sub === 'Left side') && mob.some(p => p.sub === 'Right side'), 'both sides are timed');
  assert.ok(mob.filter(p => p.kind === 'hold').every(p => p.secs === 30), 'hold length applies to every stretch');
});

test('timer: follows the clock, so a locked or throttled phone catches up instead of drifting', () => {
  const T = loadApp();
  T.Timer.start({kind: 'intervals', work: 20, rest: 10, rounds: 3, exercises: []});
  const t = T.S.timer;
  t.phaseStart -= (10 + 20 + 10 + 5) * 1000;     // pretend 45 s passed with no ticks at all
  T.Timer.update();
  assert.equal(t.phases[t.idx].kind, 'work'); assert.equal(t.phases[t.idx].round, 2, 'lands in round 2’s work interval');
  T.Timer.finish(false);
  assert.equal(T.S.timer.done.completed, false);
  T.Timer.save();
  const saved = T.S.workouts[0];
  assert.equal(saved.type, 'hiit'); assert.equal(saved.timer.kind, 'intervals');
});

test('effort: scales calorie estimates and drives training load; treadmill incline costs more', () => {
  const T = loadApp();
  T.S.body = [{id: 'b', kind: 'weight', date: Date.now() - 10 * DAY, w: 180, unit: 'lb'}];
  const base = {id: 'h', kind: 'activity', type: 'hiit', exercises: [], startedAt: Date.now() - 2 * DAY, endedAt: Date.now() - 2 * DAY + 30 * 60000};
  const easy = T.caloriesFor({...base, rpe: 3}).kcal, hard = T.caloriesFor({...base, rpe: 9}).kcal;
  assert.ok(hard > easy * 1.4, `hard (${hard}) should cost clearly more than easy (${easy})`);
  assert.equal(T.sessionLoad({...base, rpe: 7}), 7 * 30);
  const walk = {id: 't', kind: 'activity', type: 'treadmill', exercises: [], startedAt: 0, endedAt: 30 * 60000, speed: 3.5, speedUnit: 'mph'};
  T.S.body[0].date = -DAY;
  assert.ok(T.caloriesFor({...walk, incline: 10}).kcal > T.caloriesFor({...walk, incline: 0}).kcal * 1.6, 'a 10% incline walk costs much more than flat');
});

test('custom timer: warm-up, effort steps repeated, cool-down, and what the voice says', () => {
  const T = loadApp();
  const spec = T.specFromVals('custom', {warmup: 3, cooldown: 2, rounds: 4, steps: [{label: 'Sprint', secs: 30, level: 'max', target: '9 mph'}, {label: 'Recover', secs: 90, level: 'easy'}]});
  assert.ok(!spec.err, spec.err);
  const P = T.buildPhases(spec);
  assert.equal(P[1].label, 'Warm-up'); assert.equal(P[1].secs, 180);
  assert.equal(P.filter(p => p.level === 'max').length, 4);
  assert.equal(P.filter(p => p.label === 'Recover').length, 3, 'the last recovery runs straight into the cool-down');
  assert.equal(P[P.length - 1].label, 'Cool-down'); assert.equal(P[P.length - 1].secs, 120);
  const sprint = P.find(p => p.level === 'max');
  assert.equal(sprint.say, 'Sprint, all out. 30 seconds. 9 mph'); assert.equal(sprint.sub, '9 mph');
  assert.equal(P.find(p => p.label === 'Recover').say, 'Recover, easy. 1 minute 30');
  assert.equal(P[0].say, 'Get ready. First, warm-up');
  assert.equal(T.specSecs(spec), 180 + 4 * 30 + 3 * 90 + 120);
  assert.ok(T.timerOutline(spec).includes('4 rounds of'));
  // bad input is caught, and anything stored or imported goes through the same checks
  assert.ok(T.specFromVals('custom', {rounds: 4, steps: []}).err);
  assert.ok(T.specFromVals('custom', {rounds: 4, steps: [{secs: 2, level: 'hard'}]}).err);
  assert.equal(T.cleanSpec({kind: 'custom', rounds: 1e9, steps: [{secs: 30, level: 'hard'}]}), null);
  assert.deepEqual(T.cleanSpec(spec), spec, 'a valid spec survives the round trip unchanged');
  assert.equal(T.cleanSpec({kind: 'intervals', work: 20, rest: 40, rounds: 10}).rest, 40);
});

test('timer: spoken prompts call each step, warn 10 seconds ahead, and the current step can be stretched', () => {
  const said = [];
  class SpeechSynthesisUtterance { constructor(t) { this.text = t; } }
  const T = loadApp({}, {SpeechSynthesisUtterance, speechSynthesis: {speak: u => said.push(u.text), cancel() {}, getVoices: () => []}});
  T.Timer.start(T.specFromVals('custom', {warmup: 0, cooldown: 0, rounds: 2, steps: [{label: 'Sprint', secs: 30, level: 'max'}, {label: 'Recover', secs: 60, level: 'easy'}]}));
  assert.equal(said.pop(), 'Get ready. First, Sprint, all out');
  const t = T.S.timer;
  t.phaseStart -= 10 * 1000; T.Timer.update();
  assert.equal(said.pop(), 'Sprint, all out. 30 seconds');
  t.phaseStart -= 20 * 1000 + 1; T.Timer.update();
  assert.equal(said.pop(), '10 seconds. Next, Recover, easy', 'heads-up before backing off');
  T.Timer.adjust(10);
  assert.equal(t.phases[t.idx].secs, 40, '+10 s stretches only the step you are in');
  assert.equal(T.buildPhases(t.spec)[1].secs, 30, 'the saved timer is unchanged');
  T.S.profile.settings = {voice: false};
  const before = said.length;
  t.phaseStart -= 40 * 1000; T.Timer.update();
  assert.equal(t.phases[t.idx].label, 'Recover');
  assert.equal(said.length, before, 'nothing is spoken with the prompts turned off');
});

test('program: a timer-only day opens its timer; a finisher saves inside the lifting workout', () => {
  const T = loadApp();
  T.S.program = T.TEMPLATE_COPY();
  const hiit = {id: 'hiit', name: 'HIIT', tag: 'HI', focus: '', exercises: [], timer: T.specFromVals('intervals', {work: 20, rest: 40, rounds: 10})};
  T.S.program.routines.push(hiit);
  T.S.program.routines[0].timer = T.specFromVals('custom', {warmup: 0, cooldown: 0, rounds: 1, steps: [{label: 'Bike', secs: 60, level: 'hard'}]});
  // a timer-only day: Start opens the timer, prefilled and adjustable, and logs as that day
  T.startWorkout('hiit');
  assert.equal(T.S.sheet.type, 'timer-setup'); assert.equal(T.S.sheet.vals.rest, 40); assert.equal(T.S.active, null);
  T.Timer.start(T.specFromVals('intervals', {work: 30, rest: 30, rounds: 10}), {routineId: 'hiit', routineName: 'HIIT'});
  T.Timer.finish(true); T.Timer.save();
  assert.equal(T.S.workouts[0].routineId, 'hiit'); assert.equal(T.S.workouts[0].routineName, 'HIIT');
  assert.equal(hiit.timer.work, 20, 'changing today’s settings leaves the program alone');
  // a lifting day with a finisher
  T.startWorkout(T.S.program.routines[0].id);
  assert.ok(T.viewWorkout().includes('Finisher'));
  T.S.active.exercises[0].sets[0] = {w: 100, r: 10, done: true, warm: false};
  T.Timer.start(T.S.program.routines[0].timer, {attach: true});
  T.Timer.finish(true); T.Timer.save();
  assert.equal(T.S.screen, 'workout'); assert.equal(T.S.active.conditioning.name, 'Custom intervals');
  T.finishWorkout();
  const w = T.S.workouts.find(x => x.conditioning);
  assert.ok(w && w.exercises.length === 1, 'saved as one session with the lifts and the timer');
  assert.ok(T.viewToday().length > 50);
});

test('vitamins and minerals: read from USDA and labels, scaled by portion, and averaged honestly', async () => {
  const usdaList = [{nutrientNumber: '306', value: 316}, {nutrientNumber: '401', value: 89.2}, {nutrientNumber: '417', value: 63}, {nutrientNumber: '307', value: 33}, {nutrientNumber: '301', value: 47}];
  const fetched = [];
  const fetch = async url => { fetched.push(url); return {ok: true, status: 200, json: async () => [{fdcId: 170379, foodNutrients: usdaList.map(n => ({number: n.nutrientNumber, amount: n.value}))}]}; };
  const T = loadApp({}, {fetch});
  const m = T.microFromUsda(usdaList);
  assert.equal(m.k, 316); assert.equal(m.vc, 89.2); assert.equal(m.fol, 63, 'folate falls back to the total when DFE is missing');
  assert.equal(m.vd, undefined, 'only what the source reports');
  assert.equal(T.microFromOff({sodium_100g: 0.4, 'vitamin-d_100g': 0.000005}).na, 400);
  assert.equal(Math.round(T.microFromOff({'vitamin-d_100g': 0.000005}).vd), 5);
  // 250 g of broccoli = 2.5 × the per-100 g values; a quick add has no data rather than zero
  const broc = {key: 'usda:170379', source: 'usda', sourceId: '170379', name: 'Broccoli', per100: {kcal: 34, p: 2.8, c: 6.6, f: 0.4, fiber: 2.6}, micro: m};
  const day = T.startOfDay(Date.now());
  T.S.food = [{id: 'b', kind: 'log', date: day + 1, meal: 'lunch', food: broc, qty: 250, unit: 'g', grams: 250, totals: {kcal: 85, p: 7, c: 16.5, f: 1, fiber: 6.5}},
    {id: 'q', kind: 'log', date: day + 2, meal: 'lunch', food: {key: 'quick:1', source: 'quick'}, qty: 1, totals: {kcal: 2000, p: 150, c: 200, f: 70, fiber: 0}}];
  assert.equal(T.entryMicro(T.S.food[0], 'vc'), 223);
  assert.equal(T.entryMicro(T.S.food[1], 'vc'), null);
  const html = T.viewMicros();
  assert.ok(html.includes('Vitamins and minerals') && html.includes('Not enough data'), 'a nutrient from under half the day’s calories isn’t shown as a number');
  assert.ok(html.includes('1 of 2 foods logged list'), 'says how much of the log has data');
  // the Food tab folds the same list away under the day's macros, and the portion sheet names the biggest wins
  T.S.day = day; T.S.tab = 'food';
  assert.ok(T.viewFood().includes('Fiber, vitamins and minerals'));
  T.S.foodMicroOpen = true;
  assert.ok(T.viewFood().includes('for everything logged so far'));
  assert.equal(T.portionMicros(broc, 100, 100), '<span class="muted">Daily value:</span> Vitamin C 99% · Folate 16% · Fiber 9%');
  assert.equal(T.portionMicros({...broc, micro: undefined}, 100, 100), '', 'nothing shown for foods without data');
  // foods logged before this existed are looked up once
  delete broc.micro;
  await T.Micro.backfill();
  assert.equal(fetched.length, 1); assert.ok(fetched[0].includes('fdcIds=170379'));
  assert.equal(T.S.food[0].food.micro.k, 316);
});
