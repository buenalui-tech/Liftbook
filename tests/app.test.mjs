// Unit tests for Liftbook's logic. Run from the project root:
//   node --test tests/
// The real app files are loaded into a sandbox with a minimal stand-in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['core', 'training', 'ui', 'program', 'body', 'food', 'figure', 'share', 'tester', 'events'];
const DAY = 86400000;

function loadApp(stored = {}) {
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
    matchMedia: () => ({matches: false}), addEventListener() {}, LIFTBOOK_CONFIG: {},
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // top-level const/let live in the context's script scope; expose the names tests need
  const src = FILES.map(f => fs.readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8')).join('\n;\n') +
    '\n;globalThis.T = {S, store, suggest, e1rm, niceTicks, weightSeries, weeklyRateKg, caloriesFor, improvements, recomputePRs, muscleLoad, musclesFor, tagFor, lastPerf, scanKg, conv, TEMPLATE, CATALOG, slug, startOfDay, fromUsda, fromOff, rankFoods, unitsFor, portionTotals, autoTargets, dayTotals};';
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
