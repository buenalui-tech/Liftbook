// Liftbook — Food: search (USDA FoodData Central + Open Food Facts), barcode scanning, meals, daily targets.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- foods: one shape for every source ----------
   {key, source: 'usda'|'off'|'custom'|'quick', sourceId, name, brand,
    per100: {kcal, p, c, f, fiber} | null,      // per 100 g, when the weight is known
    perServing: {kcal, p, c, f, fiber} | null,  // labels and quick adds that only know one serving
    micro: {k, ca, …} | undefined,             // vitamins and minerals, on the same basis (see MICROS); only what the source reports
    servings: [{label, grams}]}                   // household measures ("1 banana", "1 cup")
   A logged entry keeps a copy of the food, so later database changes never rewrite past days. */
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snacks']];
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const OZ = 28.3495;
const r1 = n => Math.round(n * 10) / 10;
const NUTRIENTS0 = () => ({kcal: 0, p: 0, c: 0, f: 0, fiber: 0});
const usdaKey = () => CFG.usdaApiKey || 'DEMO_KEY';

function usdaNutrients(list) {
  const by = {}; for (const n of list || []) by[n.nutrientId] = n.value;
  const p = by[1003] || 0, c = by[1005] || 0, f = by[1004] || 0;
  // Foundation foods often report energy only as Atwater factors (2047/2048)
  return {kcal: by[1008] ?? by[2047] ?? by[2048] ?? r1(4 * p + 4 * c + 9 * f), p, c, f, fiber: by[1079] || 0};
}
function fromUsda(x) {
  const name = String(x.description || '').replace(/^./, ch => ch.toUpperCase());
  return {key: 'usda:' + x.fdcId, source: 'usda', sourceId: String(x.fdcId), name, brand: '', dataType: x.dataType,
    per100: usdaNutrients(x.foodNutrients), perServing: null, micro: microFromUsda(x.foodNutrients),
    servings: (x.foodMeasures || []).filter(m => m.gramWeight > 0 && !/not specified/i.test(m.disseminationText || ''))
      .map(m => ({label: m.disseminationText, grams: m.gramWeight})).slice(0, 4)};
}
function fromOff(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? r1(n.energy_100g / 4.184) : null);
  if (kcal == null || !(p.product_name || p.generic_name)) return null;
  const sq = parseFloat(p.serving_quantity);
  return {key: 'off:' + p.code, source: 'off', sourceId: String(p.code), name: p.product_name || p.generic_name, brand: String(p.brands || '').split(',')[0].trim(),
    per100: {kcal: +kcal || 0, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0, fiber: +n.fiber_100g || 0}, perServing: null, micro: microFromOff(n),
    servings: sq > 0 ? [{label: p.serving_size ? String(p.serving_size).trim() : '1 serving', grams: sq}] : []};
}
async function fetchJSON(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch {}
    await new Promise(res => setTimeout(res, 500 * (i + 1)));   // USDA's server sometimes answers a valid request with 400; try again
  }
  return null;
}
async function searchUsda(q) {
  const url = s => `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(s)}` +
    '&pageSize=30&requireAllWords=true&dataType=Foundation&dataType=SR%20Legacy&dataType=Survey%20%28FNDDS%29';
  // USDA's own top 30 for one word ("rice") is all dishes named after it; asking for "rice cooked" too brings in the plain food
  const one = q.trim().split(/\s+/).length === 1 && !COOK_WORDS.test(q) && !/\braw\b/i.test(q);
  const [d, d2] = await Promise.all([fetchJSON(url(q), 3), one ? fetchJSON(url(q + ' cooked'), 3) : null]);
  if (!d || !Array.isArray(d.foods)) return null;
  const seen = new Set(), foods = [...d.foods, ...(d2 && Array.isArray(d2.foods) ? d2.foods : [])].filter(f => !seen.has(f.fdcId) && seen.add(f.fdcId));
  return foods.map(fromUsda);
}
async function searchOff(q) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=20` +
    '&fields=code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity';
  const d = await fetchJSON(url, 1);
  return d && Array.isArray(d.products) ? d.products.map(fromOff).filter(Boolean) : null;
}
async function lookupBarcode(code) {
  const own = S.food.find(x => x.kind === 'food' && x.barcode && x.barcode.replace(/^0+/, '') === code.replace(/^0+/, '')); if (own) return customAsFood(own);
  const [usda, d] = await Promise.all([usdaBarcode(code).catch(() => null),
    fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity`)]);
  const off = d && d.status === 1 ? fromOff(d.product) : null;
  if (off) off.barcode = code;
  return usda || off;
}
/* Plain foods first. USDA names a food as "Food, descriptor, descriptor" ("Rice, white, long-grain, cooked"),
   so: a dish named after the food ("Rice dressing", "Salmon salad", "Steak tartare") ranks below the food itself;
   cooking and cut words ("cooked", "skinless", "2%") cost almost nothing; processed or mixed words ("roll",
   "glutinous", "with", "breaded") cost a lot, unless you typed them. Plurals match ("eggs" = "egg"). */
const stemWord = w => w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 4 && w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
const foodTokens = s => String(s || '').toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean).map(stemWord);
// USDA sometimes leads with a category: "Fish, salmon, raw", "Oil, olive", "Cheese, cottage", "Beef, ground"
const FOOD_CATEGORY = new Set(['fish', 'beef', 'pork', 'lamb', 'veal', 'chicken', 'turkey', 'cheese', 'oil', 'yogurt', 'milk', 'nut', 'seed', 'egg', 'cereal', 'bean', 'pea', 'lentil', 'crustacean', 'mollusk', 'spice', 'game', 'squash', 'lettuce', 'pepper', 'cabbage', 'mushroom']);
const PLAIN_WORDS = new Set(['raw', 'cooked', 'boiled', 'baked', 'roasted', 'grilled', 'steamed', 'broiled', 'poached', 'scrambled', 'plain', 'whole', 'white', 'brown',
  'skinless', 'boneless', 'lean', 'fresh', 'regular', 'enriched', 'unenriched', 'long', 'grain', 'medium', 'meat', 'only', 'large', 'nonfat', 'low', 'fat', 'reduced',
  '2%', '1%', 'skim', 'lowfat', 'nfs', 'without', 'skin', 'salt', 'added', 'unsalted', 'dry', 'heat', 'oven', 'grade', 'a', 'ns', 'as', 'to', 'form', 'in', 'or', 'and',
  'of', 'broiler', 'fryer', 'light', 'dark', 'ground', 'uncooked', 'prepared', 'from', 'water', 'unsweetened', 'creamy', 'smooth', 'chunky', 'virgin', 'extra', 'hass',
  'peeled', 'flesh', 'separable', 'trimmed', 'all', 'grade', 'choice', 'select', 'cut', 'breast', 'thigh', 'fillet', 'flaked', 'pack', 'bone', 'old', 'fashioned', 'rolled', 'quick', 'instant'].map(stemWord));
const NOT_PLAIN = new Set(['salad', 'sandwich', 'sub', 'wrap', 'burrito', 'taco', 'pie', 'cake', 'patty', 'nugget', 'soup', 'stew', 'chowder', 'casserole', 'dressing', 'sauce',
  'gravy', 'pilaf', 'pudding', 'tart', 'tartare', 'teriyaki', 'benedict', 'creamed', 'deviled', 'candied', 'chip', 'tot', 'roll', 'loaf', 'lunchmeat', 'deli', 'bologna',
  'frankfurter', 'sausage', 'dumpling', 'fritter', 'pancake', 'baby', 'human', 'malted', 'flavored', 'glutinous', 'dessert', 'smoothie', 'shake', 'bar', 'paper', 'leave',
  'dip', 'spread', 'stuffing', 'croquette', 'breaded', 'battered', 'fried', 'dehydrated', 'powder', 'nectar', 'frozen', 'imitation', 'substitute', 'meatless', 'yolk',
  'ingredient', 'jerky', 'cured', 'smoked', 'juice', 'syrup', 'jam', 'jelly', 'pickled', 'sweetened', 'coated', 'with', 'sliced', 'free', 'formulated', 'puree', 'dish',
  'mixture', 'topping', 'filling', 'strudel', 'bread', 'noodle', 'cracker', 'cookie', 'muffin', 'meal', 'kit', 'oil', 'flour', 'bran'].map(stemWord));
const COOK_WORDS = /\b(baked|fried|roasted|grilled|boiled|cooked|steamed|broiled|poached|scrambled)\b/i;
function foodScore(x, q) {
  const qs = new Set(foodTokens(q)), first = foodTokens(x.name.split(',')[0]), all = new Set(foodTokens(x.name));
  let s = 0;
  // the food itself, not a dish named after it
  if (first.some(t => !qs.has(t)) && !(first.length === 1 && FOOD_CATEGORY.has(first[0]))) s += 3;
  // after a category, the next part names the food: "Fish, salmon" yes, "Cereal, rice squares" no
  else if (first.length === 1 && FOOD_CATEGORY.has(first[0]) && !qs.has(first[0])) { const second = foodTokens(x.name.split(',')[1]); if (second.some(t => !qs.has(t) && !PLAIN_WORDS.has(t))) s += 2.5; }
  if (!qs.has(first[0]) && !FOOD_CATEGORY.has(first[0])) s += 2;
  for (const t of all) if (!qs.has(t)) s += NOT_PLAIN.has(t) ? 2.5 : PLAIN_WORDS.has(t) ? 0.1 : 0.6;
  if (/\begg whites?\b/i.test(x.name) && !qs.has('white')) s += 2;   // "eggs" means whole eggs
  if (/\bNFS\b/.test(x.name)) s -= 1;                                // "not further specified": the everyday generic one
  if (!COOK_WORDS.test(q) && all.has('raw')) s -= 0.5;               // "banana" means a raw banana
  if (x.dataType === 'Foundation') s -= 0.3;
  return s;
}
function rankFoods(foods, q) {
  return foods.map((x, i) => [foodScore(x, q), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[2]);
}

/* ---------- my foods, recents, totals ---------- */
function customAsFood(c) {
  const per100 = c.servingGrams > 0 ? Object.fromEntries(Object.entries(c.perServing).map(([k, v]) => [k, r1(v * 100 / c.servingGrams)])) : null;
  return {key: 'custom:' + c.id, source: 'custom', sourceId: c.id, name: c.name, brand: c.brand || '', per100, perServing: per100 ? null : c.perServing,
    servings: c.servingGrams > 0 ? [{label: c.servingLabel || '1 serving', grams: c.servingGrams}] : []};
}
const foodLogs = day => S.food.filter(x => x.kind === 'log' && startOfDay(x.date) === day);
function recentFoods(limit = 25) {
  const seen = new Set(), out = [];
  for (const x of [...S.food].filter(e => e.kind === 'log' && e.food && e.food.source !== 'quick').sort((a, b) => b.date - a.date)) {
    if (seen.has(x.food.key)) continue; seen.add(x.food.key); out.push({food: x.food, last: x}); if (out.length >= limit) break;
  }
  return out;
}
function unitsFor(food) {
  if (!food.per100) return [{id: 'serving', label: food.perServing && food.servings[0] ? food.servings[0].label : 'serving', grams: null}];
  // the food's own unit first ("1 banana", "1 bar"), then the rest in database order
  const word = (food.name.toLowerCase().match(/[a-z]+/) || [''])[0].replace(/(e?s)$/, '');
  const natural = s => /^1 (serving|bar|piece|egg|slice|large|medium|small)\b/i.test(s.label) || (word && s.label.toLowerCase().startsWith('1 ' + word)) ? 0 : 1;
  const servs = food.servings.map((s, i) => ({id: 's' + i, label: s.label, grams: s.grams})).sort((a, b) => natural(a) - natural(b));
  return [...servs, {id: 'g', label: 'grams', grams: 1}, {id: 'oz', label: 'oz', grams: OZ}];
}
function portionTotals(food, qty, unitId) {
  const u = unitsFor(food).find(x => x.id === unitId) || unitsFor(food)[0];
  if (!food.per100) { const s = food.perServing || NUTRIENTS0(); return {grams: null, totals: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, r1(v * qty)]))}; }
  const grams = qty * (u.grams || 1);
  return {grams: r1(grams), totals: Object.fromEntries(Object.entries(food.per100).map(([k, v]) => [k, r1(v * grams / 100)]))};
}
function dayTotals(day) {
  const t = NUTRIENTS0();
  for (const x of foodLogs(day)) for (const k of Object.keys(t)) t[k] += x.totals[k] || 0;
  return t;
}

/* ---------- daily targets ----------
   Starting point until there's enough data to adapt: maintenance from the InBody BMR × 1.5 (a moderately
   active day) or, without a scan, about 15 kcal per lb of body weight; the Cut/Bulk rate moves it by
   500 kcal/day per lb/week. Protein 0.9 g per lb, fat 0.35 g per lb, carbs fill the rest. */
function autoTargets() {
  const pts = weightSeries(); if (!pts.length) return null;
  const lb = pts[pts.length - 1].trend / KG;
  const lastScan = scans().slice(-1)[0], bmr = lastScan && lastScan.bmr > 0 ? +lastScan.bmr : null;
  const maintenance = bmr ? bmr * 1.5 : lb * 15;
  const g = S.profile.goal || {type: 'maintain', rate: 0}, rateLb = unit() === 'kg' ? (g.rate || 0) / KG : (g.rate || 0);
  const kcal = Math.round((maintenance + (g.type === 'cut' ? -500 : g.type === 'bulk' ? 500 : 0) * rateLb) / 10) * 10;
  const p = Math.round(lb * 0.9), f = Math.round(lb * 0.35);
  return {kcal, p, f, c: Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4)), fiber: 30,
    basis: `${bmr ? `your InBody BMR (${fmtNum(bmr)} kcal) × 1.5` : `${Math.round(lb)} lb × 15`}${g.type !== 'maintain' ? `, ${g.type === 'cut' ? '−' : '+'}${Math.round(500 * rateLb)} kcal for your ${g.type}` : ''}`};
}
/* Targets have one source of truth per choice, so the numbers can't contradict each other:
     calories:  'auto' (learned burn or formula, moved by the goal) | 'manual' (your number)
     macros:    'recommended' (protein 0.9 g/lb, fat 0.35 g/lb, carbs fill the rest)
              | 'percent'     (protein % and fat %; carbs take whatever is left, so it always totals 100)
              | 'grams'       (your grams; calories are calculated from them, so they can't overshoot) */
const PCT_PRESETS = [['Balanced', 30, 30], ['High protein', 40, 30], ['Lower carb', 40, 40]];   // [name, protein %, fat %]
function nutritionPrefs() {
  const n = S.profile.nutrition || {};
  // the first version saved {mode: 'custom', kcal, p, c, f}: keep honouring it as grams
  if (n.mode === 'custom' && !n.split) return {kcalMode: 'manual', kcal: n.kcal, split: 'grams', grams: {p: n.p, c: n.c, f: n.f}, pct: {p: 30, f: 30}};
  return {kcalMode: n.kcalMode || 'auto', kcal: n.kcal || null, split: n.split || 'recommended', pct: n.pct || {p: 30, f: 30}, grams: n.grams || null};
}
function bodyLb() { const pts = weightSeries(); return pts.length ? pts[pts.length - 1].trend / KG : null; }
function autoCalories() {
  const a = S.profile.adaptive;
  // base = the maintenance the last check-in settled on (it moves at most 250 kcal a week toward the real burn)
  if (a && a.burn) return {kcal: Math.round(((a.base ?? a.burn) + goalAdjust().delta) / 10) * 10, basis: `your real burn of ${fmtNum(a.burn)} kcal/day, learned from your logs (updated ${fmtDate(a.at)})`};
  const t = autoTargets(); return t ? {kcal: t.kcal, basis: t.basis} : null;
}
function computeTargets(prefs) {
  const lb = bodyLb();
  if (prefs.split === 'grams' && prefs.grams) {
    const {p = 0, c = 0, f = 0} = prefs.grams;
    return {kcal: Math.round(p * 4 + c * 4 + f * 9), p, c, f, fiber: 30, lb, split: 'grams', basis: 'your macros (protein × 4 + carbs × 4 + fat × 9)'};
  }
  const cal = prefs.kcalMode === 'manual' && prefs.kcal ? {kcal: prefs.kcal, basis: 'your own calorie number'} : autoCalories();
  if (!cal) return null;
  const kcal = cal.kcal;
  const byPct = (pp, pf) => { const pc = Math.max(0, 100 - pp - pf); return {p: Math.round(kcal * pp / 400), c: Math.round(kcal * pc / 400), f: Math.round(kcal * pf / 900), pct: {p: pp, c: pc, f: pf}}; };
  if (prefs.split === 'percent') return {kcal, ...byPct(prefs.pct.p, prefs.pct.f), fiber: 30, lb, split: 'percent', basis: cal.basis};
  if (!lb) return {kcal, ...byPct(30, 30), fiber: 30, lb, split: 'recommended', basis: cal.basis, note: 'Log a weigh-in and protein will be set from your body weight.'};
  const p = Math.round(lb * 0.9), f = Math.round(lb * 0.35), c = Math.round((kcal - p * 4 - f * 9) / 4);
  return {kcal, p, f, c: Math.max(0, c), fiber: 30, lb, split: 'recommended', basis: cal.basis, note: c < 0 ? 'Calories are too low to fit the recommended protein and fat.' : ''};
}
function targets() { return computeTargets(nutritionPrefs()); }

/* ---------- Food tab ---------- */
function foodDayNav() {
  const today = startOfDay(Date.now()), day = S.day || today;
  const label = day === today ? 'Today' : day === today - DAY ? 'Yesterday' : new Date(day).toLocaleDateString(undefined, {weekday: 'long'});
  return `<div class="daynav"><button class="iconbtn" data-act="day-step" data-v="-1" aria-label="Previous day">‹</button>
    <div class="stack" style="gap:0;text-align:center"><b>${label}</b><span class="small muted">${new Date(day).toLocaleDateString(undefined, {month: 'long', day: 'numeric'})}</span></div>
    <button class="iconbtn" data-act="day-step" data-v="1" aria-label="Next day" ${day >= today ? 'disabled' : ''}>›</button></div>`;
}
function macroBar(label, val, target, unitLbl, cls) {
  const pct = target ? Math.min(100, val / target * 100) : 0, over = target && val > target * 1.05;
  return `<div class="mac"><div class="row between small"><span>${label}</span><span class="num"><b>${Math.round(val)}</b>${target ? ` / ${Math.round(target)}` : ''} ${unitLbl}</span></div>
    <div class="mac-tr"><div class="mac-v ${cls} ${over ? 'over' : ''}" style="width:${pct}%"></div></div></div>`;
}
function viewFood() {
  const today = startOfDay(Date.now()); if (!S.day || S.day > today) S.day = today;
  const day = S.day, tot = dayTotals(day), tg = targets();
  const left = tg ? tg.kcal - tot.kcal : null;
  if (day === today) runAutoCheckin();
  const due = day === today && setting('checkinMode') === 'ask' ? checkinDue() : null, partial = isIncompleteDay(day), yesterday = day - DAY;
  const meals = MEALS.map(([m, label]) => {
    const items = foodLogs(day).filter(x => x.meal === m).sort((a, b) => a.date - b.date);
    const kcal = items.reduce((s, x) => s + (x.totals.kcal || 0), 0);
    return `<section class="card meal"><div class="row between"><h3>${label}</h3><span class="small muted num">${items.length ? fmtNum(kcal) + ' kcal' : ''}</span></div>
      ${items.map(x => `<button class="food-row" data-act="food-edit" data-v="${esc(x.id)}">
        <span class="stack" style="gap:0;min-width:0"><span class="fname">${esc(x.food.name)}</span><span class="small muted">${esc([x.food.brand, x.qtyLabel].filter(Boolean).join(' · '))}</span></span>
        <span class="num fk"><b>${fmtNum(x.totals.kcal)}</b><span class="small muted">${Math.round(x.totals.p)}g P</span></span></button>`).join('')}
      <div class="row" style="flex-wrap:wrap;gap:4px">
        <button class="btn ghost" data-act="food-add" data-v="${m}">+ Add food</button>
        ${!items.length && foodLogs(yesterday).some(x => x.meal === m) ? `<button class="btn ghost" data-act="meal-copy" data-v="${m}">Copy yesterday’s ${label.toLowerCase()}</button>` : ''}
        ${items.length > 1 ? `<button class="btn ghost" data-act="meal-save-open" data-v="${m}" style="color:var(--muted)">Save as a meal</button>` : ''}
      </div></section>`;
  }).join('');
  return `${brand('Food')}${storageBanner()}
    ${day === today ? autoCheckinBanner() : ''}
    ${due ? viewCheckin(due) : ''}
    ${foodDayNav()}
    <section class="card">
      ${tg ? `<div class="cal-line num" role="group" aria-label="Calories: goal minus food equals remaining">
            <div><b>${fmtNum(tg.kcal)}</b><span>Goal</span></div><i aria-hidden="true">−</i>
            <div><b>${fmtNum(tot.kcal)}</b><span>Food</span></div><i aria-hidden="true">=</i>
            <div class="rem ${left < 0 ? 'over' : ''}"><b>${fmtNum(Math.abs(left))}</b><span>${left < 0 ? 'Over' : 'Remaining'}</span></div></div>
          <div class="mac-tr big"><div class="mac-v kc ${left < 0 ? 'over' : ''}" style="width:${Math.min(100, tot.kcal / tg.kcal * 100)}%"></div></div>`
        : `<div><b class="num kcal-big">${fmtNum(tot.kcal)}</b> <span class="muted">kcal</span></div>
           <p class="small muted" style="margin:0">Log a weigh-in on the Body tab and Liftbook sets calorie and protein targets for you, or tap Set targets to enter your own.</p>`}
      ${macroBar('Protein', tot.p, tg && tg.p, 'g', 'p')}${macroBar('Carbs', tot.c, tg && tg.c, 'g', 'c')}${macroBar('Fat', tot.f, tg && tg.f, 'g', 'f')}
      ${foodLogs(day).length ? `<details class="day-micros" id="food-micros" ${S.foodMicroOpen ? 'open' : ''}><summary><span>Fiber, vitamins and minerals</span><span class="row" style="gap:6px">${S.foodMicroOpen ? '' : `<span class="num muted">Fiber ${tot.fiber >= 10 ? Math.round(tot.fiber) : r1(tot.fiber)} g</span>`}<span class="chev" aria-hidden="true">›</span></span></summary>
        ${S.foodMicroOpen ? microList(foodLogs(day), 1, true) : ''}</details>` : ''}
      <div class="row small muted" style="justify-content:flex-end"><button class="btn edit-tg" data-act="targets-open">${tg ? 'Edit targets' : 'Set targets'}</button></div>
      ${learningNote()}
      <label class="row small partial-day"><input type="checkbox" data-act="day-incomplete" ${partial ? 'checked' : ''}> I didn’t log everything ${day === today ? 'today' : 'this day'}
        <span class="muted">(left out when Liftbook learns your burn)</span></label>
    </section>
    ${meals}
    <p class="small muted">Food data: <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener">USDA FoodData Central</a> and <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a> (ODbL).</p>
    ${Sync.missing.food_entries ? `<div class="banner">Food is saved on this phone but isn’t syncing yet. Run <b>supabase/004_food_entries.sql</b> in the Supabase SQL Editor.</div>` : ''}`;
}
function todayFoodCard() {
  const tot = dayTotals(startOfDay(Date.now())), tg = targets();
  if (!tot.kcal && !tg) return '';
  return `<button class="hitem weigh" data-act="tab" data-v="food"><span class="row between" style="width:100%">
    <span><span class="small muted">Food today</span><br><b class="num">${fmtNum(tot.kcal)}${tg ? ` / ${fmtNum(tg.kcal)}` : ''} kcal</b></span>
    <span class="small muted num">${Math.round(tot.p)}${tg ? ` / ${tg.p}` : ''} g protein</span></span></button>`;
}

/* ---------- add food: search, recent, my foods, quick add, scan ---------- */
let searchSeq = 0;
/* Search starts from what you already eat: your own history answers instantly as you type (no network),
   meal-aware when the box is empty, and the food databases fill in underneath. Typing only repaints the
   results, never the search box, so the keyboard, cursor and caret stay put. */
const searchCache = new Map();   // query → database results, for this session
function foodHistory() {
  const by = new Map(), now = Date.now();
  for (const x of S.food) {
    if (x.kind !== 'log' || !x.food || x.food.source === 'quick') continue;
    const k = x.food.key, e = by.get(k) || {food: x.food, n: 0, meals: {}, last: x};
    e.n++; e.meals[x.meal] = (e.meals[x.meal] || 0) + 1;
    if (x.date >= e.last.date) { e.last = x; e.food = x.food; }
    by.set(k, e);
  }
  for (const c of S.food) if (c.kind === 'food') { const f = customAsFood(c); if (!by.has(f.key)) by.set(f.key, {food: f, n: 0, meals: {}, last: null}); }
  for (const r of S.food) if (r.kind === 'recipe') { const f = recipeAsFood(r), e = by.get(f.key); if (e) e.food = f; else by.set(f.key, {food: f, n: 0, meals: {}, last: null}); }
  return [...by.values()].map(e => ({...e, age: e.last ? (now - e.last.date) / DAY : 999}));
}
// every word you type is the start of some word in the name: "chi bre" finds "Chicken breast"
function matchesQuery(name, q) {
  const words = (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), qs = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return qs.length && qs.every(w => words.some(x => x.startsWith(w)));
}
function localMatches(q, meal) {
  const hist = foodHistory();
  // often, recently, and at this meal
  const score = e => e.n * 2 + (e.meals[meal] || 0) * 3 - Math.min(e.age, 60) / 6;
  if (!q.trim()) return hist.filter(e => e.n).sort((a, b) => score(b) - score(a)).slice(0, 12);
  return hist.filter(e => matchesQuery(`${e.food.name} ${e.food.brand || ''}`, q)).sort((a, b) => score(b) - score(a)).slice(0, 8);
}
function searchResultsHTML(sh) {
  const q = (sh.q || '').trim(), local = localMatches(q, sh.meal), seen = new Set(local.map(e => e.food.key));
  const meals = q && !sh.into ? S.food.filter(x => x.kind === 'meal' && matchesQuery(x.name, q)) : [];
  // your own foods: tap to choose an amount, or + to add last time's amount right away
  const own = (e, i, note) => sh.into || !e.last ? foodResult(e.food, i, note)
    : `<div class="lib-row">${foodResult(e.food, i, note)}<button class="quick-plus" data-act="food-relog" data-v="${i}" aria-label="Add ${esc(e.food.name)}, ${esc(e.last.qtyLabel || 'same amount')}">+</button></div>`;
  sh.local = local;
  const remote = q.length >= 2 && sh.remoteQ === q ? (sh.remote || []).filter(f => !seen.has(f.key)) : [];
  sh.results = [...local.map(e => e.food), ...remote];
  const portion = e => e.last && e.last.qtyLabel ? `last time ${e.last.qtyLabel}` : '';
  let out = '';
  if (!q) {
    const searches = (S.profile.recentSearches || []).slice(0, 6);
    out += searches.length ? `<div class="chips recent-q">${searches.map(s => `<button class="chipbtn" data-act="food-q-pick" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
    out += local.length ? `<p class="eyebrow" style="margin:0">${sh.into ? 'Your foods' : `Your usual ${esc(mealLabel(sh.meal).toLowerCase())}`}</p><div class="lib">${local.map((e, i) => own(e, i, portion(e))).join('')}</div>`
      : '<p class="small muted">Search for a food, or scan a barcode. Foods you log show up here first next time, ready to add again in one tap.</p>';
    return out;
  }
  if (local.length || meals.length) out += `<p class="eyebrow" style="margin:0">Yours</p><div class="lib">${meals.map(m => `<button data-act="saved-meal-log" data-v="${esc(m.id)}"><span class="stack" style="gap:1px;min-width:0;text-align:left"><span class="fname">${esc(m.name)}</span><span class="small muted">${m.items.length} items · ${fmtNum(mealKcal(m))} kcal</span></span><span class="src custom">Meal</span></button>`).join('')}${local.map((e, i) => own(e, i, portion(e))).join('')}</div>`;
  if (q.length < 2) return out;
  if (remote.length) out += `<p class="eyebrow" style="margin:0">Food database</p><div class="lib">${remote.map((f, i) => foodResult(f, local.length + i)).join('')}</div>`;
  if (sh.loading) out += '<p class="small muted" style="margin:0">Searching the food database…</p>';
  else if (sh.remoteQ === q && !remote.length && !local.length && !meals.length) out += `<p class="small muted">No matches for “${esc(q)}”. Try fewer words, or create it under My foods.</p>`;
  if (sh.partial && sh.remoteQ === q) out += '<p class="small muted" style="margin:0">One of the food databases didn’t answer, so results may be incomplete.</p>';
  return out;
}
// repaint only the list under the search box
function paintSearch() {
  const box = document.getElementById('food-results');
  if (box && S.sheet && S.sheet.type === 'add-food') box.innerHTML = searchResultsHTML(S.sheet);
}
function viewAddFood() {
  const sh = S.sheet, mode = sh.mode === 'recent' ? 'search' : sh.mode || 'search';
  const tabs = [['search', 'Search'], ['mine', 'Mine'], ['quick', 'Quick add']];
  let body = '';
  if (mode === 'search') {
    body = `<div class="row" style="gap:8px"><span class="search-wrap grow"><input id="food-q" data-in="food-q" type="search" class="search" value="${esc(sh.q || '')}" placeholder="${SpeechRec ? 'Search or tap the mic' : 'Search foods, e.g. greek yogurt'}"
        autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
        ${SpeechRec ? `<button id="food-mic" class="mic ${sh.listening ? 'on' : ''}" data-act="food-mic" aria-label="Say a food, like 150 grams of chicken breast" aria-pressed="${!!sh.listening}">${ICON_MIC}</button>` : ''}</span>
        <button class="btn" data-act="barcode-open" aria-label="Scan a barcode">${BARCODE_ICON} Scan</button></div>
      <div class="stack" id="food-results" style="gap:10px">${searchResultsHTML(sh)}</div>`;
  } else if (mode === 'mine') {
    // My meals, My recipes, My foods: tap to log, Edit to change; everything is edited in place
    const byName = (x, y) => x.name.localeCompare(y.name);
    const mine = S.food.filter(x => x.kind === 'food').sort(byName), meals = S.food.filter(x => x.kind === 'meal').sort(byName), recipes = S.food.filter(x => x.kind === 'recipe').sort(byName);
    sh.results = [...recipes.map(recipeAsFood), ...mine.map(customAsFood)];
    const row = (act, v, name, sub, badge, editAct, editV = v) => `<div class="lib-row"><button data-act="${act}" data-v="${esc(v)}"><span class="stack" style="gap:1px;min-width:0;text-align:left"><span class="fname">${esc(name)}</span><span class="small muted">${esc(sub)}</span></span><span class="src ${badge.toLowerCase()}">${badge}</span></button>
      <button class="edit-link" data-act="${editAct}" data-v="${esc(editV)}" aria-label="Edit ${esc(name)}">Edit</button></div>`;
    const section = (title, list, add) => `<div class="row between"><p class="eyebrow" style="margin:0">${title}</p>${add}</div>${list || ''}`;
    body = `${sh.into ? '' : section('My meals', meals.length ? `<div class="lib">${meals.map(m => row('saved-meal-log', m.id, m.name, `${m.items.length} foods · ${fmtNum(mealKcal(m))} kcal`, 'Meal', 'meal-edit')).join('')}</div>` : '<p class="small muted" style="margin:0">Foods you often have together, added in one tap.</p>', '<button class="btn ghost small-btn" data-act="meal-new">+ New</button>')}
      ${section('My recipes', recipes.length ? `<div class="lib">${recipes.map((r, i) => { const f = sh.results[i], k = f.per100 ? f.per100.kcal * (f.servings[0].grams || 100) / 100 : f.perServing.kcal;
        return row('food-pick', i, r.name, `${fmtW(r.servings)} servings · ${fmtNum(k)} kcal each`, 'Recipe', 'recipe-edit', r.id); }).join('')}</div>`
        : '<p class="small muted" style="margin:0">Cook once, log a serving or weigh your bowl. Easy to change when the recipe does.</p>', '<button class="btn ghost small-btn" data-act="recipe-new">+ New</button>')}
      ${section('My foods', mine.length ? `<div class="lib">${mine.map((c, i) => row('food-pick', recipes.length + i, c.name, [c.brand, `${fmtNum(c.perServing.kcal)} kcal per ${c.servingLabel || 'serving'}`].filter(Boolean).join(' · '), 'Mine', 'custom-edit', c.id)).join('')}</div>`
        : '<p class="small muted" style="margin:0">Foods the databases don’t have, or your own corrections to a label.</p>', '<button class="btn ghost small-btn" data-act="custom-new">+ New</button>')}`;
  } else if (mode === 'quick') {
    body = `<p class="small muted" style="margin:0">For restaurant meals or anything you only know the numbers for.</p>
      <label class="field">Name (optional)<input id="qa-name" placeholder="Chipotle bowl"></label>
      <div class="scan-grid"><label class="field">Calories<input id="qa-kcal" inputmode="numeric"></label><label class="field">Protein (g)<input id="qa-p" inputmode="decimal"></label>
        <label class="field">Carbs (g)<input id="qa-c" inputmode="decimal"></label><label class="field">Fat (g)<input id="qa-f" inputmode="decimal"></label></div>
      <button class="btn primary block" data-act="quick-save">Add to ${esc(mealLabel(sh.meal))}</button>`;
  }
  return `<div class="row between"><h2>${sh.into ? `Add to ${esc(sh.into.draft.name || (sh.into.kind === 'recipe' ? 'recipe' : 'meal'))}` : `Add to ${esc(mealLabel(sh.meal))}`}</h2><button class="iconbtn" data-act="${sh.into ? 'into-back' : 'sheet-close'}" aria-label="${sh.into ? 'Back' : 'Close'}">✕</button></div>
    ${sh.plate ? `<div class="banner small">${ICON_SCALE} Scale zeroed. Put the next food on the plate and pick it below, or close when you’re done.</div>` : ''}
    <div class="seg tabs3" role="tablist">${tabs.map(([k, l]) => `<button data-act="food-mode" data-v="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
    ${body}`;
}
const mealLabel = m => (MEALS.find(x => x[0] === m) || [, 'Snacks'])[1];
const BARCODE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>';
function foodResult(x, i, note) {
  const per = x.per100 ? `${fmtNum(x.per100.kcal)} kcal · ${r1(x.per100.p)}g P per 100 g` : x.perServing ? `${fmtNum(x.perServing.kcal)} kcal per serving` : '';
  return `<button data-act="food-pick" data-v="${i}"><span class="stack" style="gap:1px;min-width:0;text-align:left"><span class="fname">${esc(x.name)}</span>
    <span class="small muted">${esc([x.brand, note || per].filter(Boolean).join(' · '))}</span></span>
    <span class="src ${x.source}">${x.source === 'usda' ? (x.dataType === 'Branded' ? 'Label' : 'USDA') : x.source === 'off' ? 'Label' : x.source === 'recipe' ? 'Recipe' : 'Mine'}</span></button>`;
}
// typing: your own foods repaint at once; the databases are asked after a short pause, and remembered
function onFoodQuery(q) {
  const sh = S.sheet; sh.q = q; paintSearch();
  const t = q.trim();
  if (t.length < 2) { searchSeq++; sh.loading = false; return; }
  const hit = searchCache.get(t.toLowerCase());
  if (hit) { searchSeq++; Object.assign(sh, {remote: hit.results, remoteQ: t, partial: hit.partial, loading: false}); paintSearch(); return; }
  sh.loading = true; paintSearch();
  later('food-q', () => runSearch(t), 350);
}
async function runSearch(q) {
  const sh = S.sheet, seq = ++searchSeq;
  q = q.trim(); if (q.length < 2) return;
  const [u, o] = await Promise.all([searchUsda(q), searchOff(q)]);
  const results = [...rankFoods(u || [], q).slice(0, 12), ...(o || []).slice(0, 12)], partial = !u || !o;
  if (u && o) searchCache.set(q.toLowerCase(), {results, partial});
  if (seq !== searchSeq || S.sheet !== sh) return;   // a newer search or a closed sheet wins
  Object.assign(sh, {remote: results, remoteQ: q, partial, loading: false});
  paintSearch();
}
// a database pick from a search is worth remembering as a recent search
function rememberSearch(q) {
  q = (q || '').trim(); if (q.length < 2) return;
  const list = (S.profile.recentSearches || []).filter(s => s.toLowerCase() !== q.toLowerCase());
  S.profile.recentSearches = [q, ...list].slice(0, 8); store.saveProfile();
}

/* ---------- portion: how much, which meal ---------- */
function openPortion(food, meal, existing) {
  const units = unitsFor(food), last = existing || recentFoods(60).find(x => x.food.key === food.key)?.last;
  const unitId = last && units.some(u => u.id === last.unit) ? last.unit : units[0].id;
  S.sheet = {type: 'portion', food, meal: existing ? existing.meal : meal, qty: last ? last.qty : (units[0].id === 'g' ? 100 : 1), unit: unitId, editId: existing ? existing.id : null, back: S.sheet};
  // weighing a plate: the next food goes straight onto the scale
  if (S.sheet.back && S.sheet.back.plate && Scale.status === 'on' && food.per100) Object.assign(S.sheet, {weigh: true, unit: 'g', qty: Math.max(0, Math.round(Scale.grams() || 0))});
  else if (!existing && S.sheet.back && S.sheet.back.spoken) applySpoken(S.sheet, S.sheet.back.spoken);
  render();
}
function viewPortion() {
  const sh = S.sheet, f = sh.food, units = unitsFor(f), {grams, totals} = portionTotals(f, +sh.qty || 0, sh.unit);
  const into = sh.back && sh.back.into, labelled = f.dataType === 'Branded' || f.source === 'off';
  return `<div class="row between"><h2>${sh.editId ? 'Edit food' : into ? `Add to ${esc(into.draft.name || into.kind)}` : 'Add food'}</h2><button class="iconbtn" data-act="${sh.editId ? 'sheet-close' : 'portion-back'}" aria-label="Back">✕</button></div>
    <div class="stack" style="gap:2px"><b>${esc(f.name)}</b><span class="small muted">${esc([f.brand, f.dataType === 'Branded' ? 'Package label (USDA)' : f.source === 'usda' ? 'USDA FoodData Central' : f.source === 'off' ? 'Package label (Open Food Facts)' : f.source === 'quick' ? 'Quick add' : f.source === 'recipe' ? 'My recipe' : 'My food'].filter(Boolean).join(' · '))}</span>
      ${labelled ? '<button class="linkbtn small" data-act="food-fix" style="align-self:flex-start">Numbers don’t match the package? Fix them</button>' : ''}</div>
    ${f.source === 'quick' ? '' : sh.weigh && Scale.status === 'on' ? weighBlock(sh) : `<div class="row"><label class="field" style="width:110px">Amount<input id="po-qty" data-in="po-qty" inputmode="decimal" value="${esc(sh.qty)}"></label>
      <label class="field grow">Unit<select id="po-unit" data-in="po-unit">${units.map(u => `<option value="${u.id}" ${u.id === sh.unit ? 'selected' : ''}>${esc(u.label)}${u.grams && u.id !== 'g' && u.id !== 'oz' && !/\d\s*(g|ml)\b/i.test(u.label) ? ` (${r1(u.grams)} g)` : ''}</option>`).join('')}</select></label></div>
      ${weighBlock(sh)}`}
    <div class="stats" id="po-totals">${portionStats(totals, grams)}</div>
    <p class="small" id="po-micros" style="margin:0">${portionMicros(f, grams, +sh.qty || 0)}</p>
    ${into ? '' : `<div class="chips" role="group" aria-label="Meal">${MEALS.map(([m, l]) => `<button class="chipbtn" data-act="po-meal" data-v="${m}" aria-pressed="${sh.meal === m}">${l}</button>`).join('')}</div>`}
    <button class="btn primary lg block" data-act="portion-save">${sh.editId ? 'Save changes' : into ? `Add to ${into.kind}` : `Add to ${esc(mealLabel(sh.meal))}`}</button>
    ${sh.weigh && Scale.status === 'on' && !sh.editId ? '<button class="btn block" data-act="portion-save-next">Add, then weigh the next food</button>' : ''}
    ${sh.editId ? `<button class="btn danger block ${S.armed === 'fdel' ? 'armed' : ''}" data-act="food-del">${S.armed === 'fdel' ? 'Tap again to remove' : 'Remove from log'}</button>` : ''}`;
}
const portionStats = (t, grams) => `<div class="stat"><b class="num">${fmtNum(t.kcal)}</b><span>kcal${grams ? ` · ${fmtNum(grams)} g` : ''}</span></div>
  <div class="stat"><b class="num">${r1(t.p)}</b><span>Protein g</span></div><div class="stat"><b class="num">${r1(t.c)} / ${r1(t.f)}</b><span>Carbs / fat g</span></div>`;
function savePortion() {
  const sh = S.sheet, qty = parseFloat(String(sh.qty).replace(',', '.'));
  if (sh.food.source !== 'quick' && !(qty > 0)) { toast('Enter an amount, like 1 or 150.'); return false; }
  const u = unitsFor(sh.food).find(x => x.id === sh.unit) || unitsFor(sh.food)[0];
  const {grams, totals} = portionTotals(sh.food, sh.food.source === 'quick' ? 1 : qty, sh.unit);
  const qtyLabel = sh.food.source === 'quick' ? '' : u.id === 'g' ? `${fmtW(qty)} g` : u.id === 'oz' ? `${fmtW(qty)} oz`
    : /^1 /.test(u.label) ? `${fmtW(qty)} ${u.label.slice(2)}` : `${fmtW(qty)} × ${u.label}`;
  // building a recipe or a meal: the portion becomes one of its items
  const into = sh.back && sh.back.into;
  if (into && !sh.editId) { into.draft.items.push({food: sh.food, qty: sh.food.source === 'quick' ? 1 : qty, unit: u.id, qtyLabel, grams, totals}); into.msg = ''; S.sheet = into; render(); toast(`${sh.food.name} added`); return true; }
  const existing = sh.editId ? S.food.find(x => x.id === sh.editId) : null;
  const day = S.day || startOfDay(Date.now());
  const e = existing || {id: newId(), kind: 'log', date: day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600000};
  Object.assign(e, {meal: sh.meal, food: sh.food, qty: sh.food.source === 'quick' ? 1 : qty, unit: u.id, qtyLabel, grams, totals});
  if (!existing) S.food.push(e);
  store.saveFood(e); S.sheet = null; render(); toast(existing ? 'Updated' : `Added to ${mealLabel(e.meal)}`);
  return true;
}
function saveQuickAdd() {
  const num = id => { const v = parseFloat((document.getElementById(id).value || '').replace(',', '.')); return v > 0 ? v : 0; };
  const kcal = num('qa-kcal'); if (!kcal) { toast('Enter the calories.'); return; }
  const name = (document.getElementById('qa-name').value || '').trim() || 'Quick add';
  const food = {key: 'quick:' + newId(), source: 'quick', sourceId: '', name, brand: '', per100: null, perServing: {kcal, p: num('qa-p'), c: num('qa-c'), f: num('qa-f'), fiber: 0}, servings: []};
  S.sheet = {type: 'portion', food, meal: S.sheet.meal, qty: 1, unit: 'serving', back: S.sheet}; savePortion();
}

/* ---------- custom foods ---------- */
function viewCustomFood() {
  const sh = S.sheet, p = sh.pre || {}, ps = p.perServing || {}, v = n => n > 0 ? esc(fmtW(Math.round(n * 10) / 10)) : '';
  const title = sh.editId ? 'Edit food' : sh.pre ? 'Fix the label' : 'Create a food';
  return `<div class="row between"><h2>${title}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <p class="small muted" style="margin:0">${sh.pre && !sh.editId ? 'Change anything that doesn’t match the package. It’s saved as your own, and scanning this barcode uses your numbers from now on.' : 'Copy the numbers from the nutrition label, for one serving.'}</p>
    <label class="field">Name<input id="cf-name" value="${esc(p.name || sh.name || '')}" placeholder="Protein overnight oats"></label>
    <div class="row"><label class="field grow">Brand (optional)<input id="cf-brand" value="${esc(p.brand || '')}"></label><label class="field grow">Barcode (optional)<input id="cf-code" inputmode="numeric" value="${esc(p.barcode || sh.barcode || '')}"></label></div>
    <div class="row"><label class="field grow">Serving<input id="cf-serv" value="${esc(p.servingLabel || '1 serving')}" placeholder="1 bar"></label><label class="field" style="width:120px">Serving weight g (optional)<input id="cf-g" inputmode="decimal" value="${v(p.servingGrams)}"></label></div>
    <div class="scan-grid"><label class="field">Calories<input id="cf-kcal" inputmode="numeric" value="${v(ps.kcal)}"></label><label class="field">Protein (g)<input id="cf-p" inputmode="decimal" value="${v(ps.p)}"></label>
      <label class="field">Carbs (g)<input id="cf-c" inputmode="decimal" value="${v(ps.c)}"></label><label class="field">Fat (g)<input id="cf-f" inputmode="decimal" value="${v(ps.f)}"></label></div>
    <button class="btn primary block" data-act="custom-save">${sh.editId ? 'Save changes' : 'Save food'}</button>
    ${sh.editId ? `<button class="btn danger block ${S.armed === 'cfdel' ? 'armed' : ''}" data-act="custom-del">${S.armed === 'cfdel' ? 'Tap again to delete' : 'Delete food'}</button>` : ''}`;
}
function saveCustomFood() {
  const val = id => (document.getElementById(id).value || '').trim(), num = id => { const v = parseFloat(val(id).replace(',', '.')); return v > 0 ? v : 0; };
  const name = val('cf-name'); if (!name) { toast('Give the food a name.'); return; }
  if (!num('cf-kcal')) { toast('Enter the calories per serving.'); return; }
  const sh = S.sheet, meal = sh.meal, old = sh.editId ? S.food.find(x => x.id === sh.editId) : null;
  const c = {...(old || {id: newId(), kind: 'food', date: Date.now()}), name, brand: val('cf-brand'), barcode: val('cf-code').replace(/\D/g, ''),
    servingLabel: val('cf-serv') || '1 serving', servingGrams: num('cf-g') || null,
    perServing: {kcal: num('cf-kcal'), p: num('cf-p'), c: num('cf-c'), f: num('cf-f'), fiber: (old && old.perServing.fiber) || (sh.pre && sh.pre.perServing.fiber) || 0}};
  delete c.updatedAt;
  if (!old) S.food.push(c);
  store.saveFood(c); toast(`${name} saved`);
  if (old) { S.sheet = sh.back || null; render(); return; }
  const food = customAsFood(c);
  S.sheet = {type: 'add-food', meal, mode: 'mine', into: sh.into};
  openPortion(food, meal);
}

/* ---------- barcode scanner (camera; ZXing works on iPhone and Android) ---------- */
const Scanner = {
  reader: null, video: null, running: false,
  async start() {
    const box = document.getElementById('scan-box'); if (!box) return;
    if (this.video) { box.appendChild(this.video); return; }   // already scanning: just re-attach after a redraw
    try {
      if (!window.ZXing) await loadScript(ZXING_URL);
      this.video = document.createElement('video'); this.video.setAttribute('playsinline', ''); this.video.muted = true; this.video.className = 'scan-video';
      box.appendChild(this.video);
      this.reader = new window.ZXing.BrowserMultiFormatReader();
      this.running = true;
      await this.reader.decodeFromConstraints({video: {facingMode: 'environment'}}, this.video, (res) => {
        if (res && this.running) { this.running = false; if (navigator.vibrate) navigator.vibrate(60); onBarcode(res.getText()); }
      });
    } catch (e) {
      this.stop();
      const msg = e && /Permission|NotAllowed/i.test(e.name + e.message) ? 'Camera access was blocked. Allow it in your phone’s settings for this app, or type the barcode below.' : 'The camera couldn’t start. Type the barcode below instead.';
      if (S.sheet && S.sheet.type === 'barcode') { S.sheet.err = msg; render(); }
    }
  },
  stop() { this.running = false; try { this.reader && this.reader.reset(); } catch {} this.reader = null; if (this.video) { this.video.remove(); this.video = null; } }
};
function viewScan() {
  const sh = S.sheet;
  return `<div class="row between"><h2>Scan a barcode</h2><button class="iconbtn" data-act="barcode-close" aria-label="Close">✕</button></div>
    ${sh.err ? `<p class="small" style="margin:0;color:var(--pr)">${esc(sh.err)}</p>` : `<div id="scan-box" class="scan-box"><span class="small muted">Starting camera…</span></div>
      <p class="small muted" style="margin:0">Point at the barcode on the package. It reads automatically.</p>`}
    ${sh.looking ? '<p class="small muted">Looking it up…</p>' : ''}
    ${sh.notFound ? `<p class="small" style="margin:0">No product found for <b>${esc(sh.notFound)}</b>. You can add it yourself; it’ll scan next time.</p>
      <button class="btn block" data-act="custom-new" data-v="${esc(sh.notFound)}">Create this food</button>` : ''}
    <div class="row"><input id="scan-code" class="grow search" inputmode="numeric" placeholder="Or type the barcode number"><button class="btn" data-act="barcode-type">Look up</button></div>`;
}
async function onBarcode(code) {
  code = String(code).replace(/\D/g, ''); if (code.length < 6) { toast('That doesn’t look like a barcode.'); return; }
  const sh = S.sheet; Scanner.stop(); sh.looking = true; sh.notFound = null; render();
  const food = await lookupBarcode(code);
  if (S.sheet !== sh) return;
  sh.looking = false;
  if (food) { S.sheet = {type: 'add-food', meal: sh.meal, mode: 'search', into: sh.into}; openPortion(food, sh.meal); }
  else { sh.notFound = code; render(); }
}

/* ---------- targets sheet (edits a draft; nothing changes until Save) ---------- */
function targetPreview(d) {
  const t = computeTargets(d); if (!t) return '<p class="small muted" style="margin:0">Log a weigh-in on the Body tab, or choose "My own number", to see your targets.</p>';
  const pct = k => t.kcal ? Math.round((k === 'f' ? t[k] * 9 : t[k] * 4) / t.kcal * 100) : 0;
  const gPerLb = t.lb ? t.p / t.lb : null;
  const warn = gPerLb == null ? '' : gPerLb < 0.7 ? `Protein is ${r1(gPerLb)} g per lb of body weight, below the 0.7–1.0 g most lifters aim for.`
    : gPerLb > 1.2 ? `Protein is ${r1(gPerLb)} g per lb of body weight, more than the 0.7–1.0 g that helps with muscle. It won’t hurt, but those calories may be better spent on carbs.` : '';
  return `<div class="tg-sum"><div><b class="num kcal-big">${fmtNum(t.kcal)}</b> <span class="muted">kcal/day</span></div>
      <div class="tg-macros num">${[['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, l]) => `<span><b>${t[k]} g</b><small>${l} · ${pct(k)}%</small></span>`).join('')}</div></div>
    ${gPerLb ? `<p class="small muted" style="margin:0">That’s ${r1(gPerLb)} g of protein per lb of body weight.</p>` : ''}
    ${warn ? `<p class="small" style="margin:0;color:var(--warn)">${warn}</p>` : ''}
    ${t.note ? `<p class="small" style="margin:0;color:var(--warn)">${t.note}</p>` : ''}`;
}
function viewTargets() {
  const d = S.sheet.draft || (S.sheet.draft = JSON.parse(JSON.stringify(nutritionPrefs())));
  const grams = d.split === 'grams', auto = autoCalories(), cur = computeTargets(d) || {};
  const seg = (act, opts, val) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div>`;
  const kcalBlock = grams ? '<p class="small muted" style="margin:0">With Grams, calories are worked out from your macros.</p>'
    : `${seg('tg-kmode', [['auto', 'Set for me'], ['manual', 'My own number']], d.kcalMode)}
       ${d.kcalMode === 'manual' ? `<label class="field">Calories per day<input id="tg-kcal" data-in="tg-kcal" inputmode="numeric" value="${d.kcal ?? (auto ? auto.kcal : '')}"></label>`
         : `<p class="small muted" style="margin:0">${auto ? `${fmtNum(auto.kcal)} kcal, from ${esc(auto.basis)}. ${S.profile.adaptive ? 'The weekly check-in keeps it up to date.' : 'After about 2 weeks of logging, a weekly check-in replaces this estimate with your real burn.'}` : 'Log a weigh-in on the Body tab so Liftbook can estimate your calories.'}</p>`}`;
  const macroBlock = d.split === 'recommended'
    ? '<p class="small muted" style="margin:0">Protein 0.9 g and fat 0.35 g per lb of body weight; carbs fill the rest of your calories. The simplest choice for lifting.</p>'
    : d.split === 'percent'
    ? `<div class="chips">${PCT_PRESETS.map(([n, p, f]) => `<button class="chipbtn" data-act="tg-preset" data-p="${p}" data-f="${f}" aria-pressed="${d.pct.p === p && d.pct.f === f}">${n} ${p}/${100 - p - f}/${f}</button>`).join('')}</div>
       <div class="scan-grid three"><label class="field">Protein %<input id="tg-pp" data-in="tg-pct" data-k="p" inputmode="numeric" value="${d.pct.p}"></label>
         <label class="field">Fat %<input id="tg-pf" data-in="tg-pct" data-k="f" inputmode="numeric" value="${d.pct.f}"></label>
         <label class="field">Carbs %<input id="tg-pc" value="${Math.max(0, 100 - d.pct.p - d.pct.f)}" disabled></label></div>
       <p class="small muted" style="margin:0">Carbs take whatever’s left, so the total is always 100%.</p>`
    : `<div class="scan-grid three">${[['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, l]) => `<label class="field">${l} (g)<input id="tg-g${k}" data-in="tg-gram" data-k="${k}" inputmode="numeric" value="${(d.grams || cur)[k] ?? ''}"></label>`).join('')}</div>`;
  return `<div class="row between"><h2>Calorie and macro targets</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <div class="stack" style="gap:8px"><p class="eyebrow" style="margin:0">Calories</p>${kcalBlock}</div>
    <div class="stack" style="gap:8px"><p class="eyebrow" style="margin:0">Macros</p>${seg('tg-split', [['recommended', 'Recommended'], ['percent', 'Percentages'], ['grams', 'Grams']], d.split)}${macroBlock}</div>
    <div class="card tg-preview" id="tg-preview">${targetPreview(d)}</div>
    <button class="btn primary lg block" data-act="targets-save">Save targets</button>
    <p class="small muted" style="margin:0">Cut, Maintain or Bulk is set on the Body tab and moves calories when they’re set for you.</p>`;
}
function saveTargets() {
  const d = S.sheet.draft, t = computeTargets(d);
  if (d.split !== 'grams' && d.kcalMode === 'manual' && !(d.kcal >= 800 && d.kcal <= 8000)) { toast('Calories should be between 800 and 8,000.'); return; }
  if (d.split === 'percent' && d.pct.p + d.pct.f > 95) { toast('Protein and fat can’t add up to more than 95%.'); return; }
  if (d.split === 'grams' && !(t && t.kcal >= 800 && t.kcal <= 8000)) { toast('Those macros come to ' + fmtNum(t ? t.kcal : 0) + ' kcal. Aim for 800–8,000.'); return; }
  if (!t) { toast('Log a weigh-in first, or choose “My own number”.'); return; }
  S.profile.nutrition = {kcalMode: d.kcalMode, kcal: d.kcal, split: d.split, pct: d.pct, grams: d.split === 'grams' ? d.grams : null};
  store.saveProfile(); S.sheet = null; render(); toast(`Targets saved: ${fmtNum(t.kcal)} kcal`);
}

/* ---------- vitamins and minerals ----------
   A short list that matters for most people, against the Daily Values on US food labels (FDA, adults).
   [key, name, unit, daily value, USDA nutrient numbers, Open Food Facts field, OFF grams → unit, upper limit?] */
const MICROS = [
  ['fiber', 'Fiber', 'g', 28],
  ['k', 'Potassium', 'mg', 4700, ['306'], 'potassium', 1e3],
  ['ca', 'Calcium', 'mg', 1300, ['301'], 'calcium', 1e3],
  ['mg', 'Magnesium', 'mg', 420, ['304'], 'magnesium', 1e3],
  ['fe', 'Iron', 'mg', 18, ['303'], 'iron', 1e3],
  ['zn', 'Zinc', 'mg', 11, ['309'], 'zinc', 1e3],
  ['va', 'Vitamin A', 'µg', 900, ['320'], 'vitamin-a', 1e6],
  ['vc', 'Vitamin C', 'mg', 90, ['401'], 'vitamin-c', 1e3],
  ['vd', 'Vitamin D', 'µg', 20, ['328'], 'vitamin-d', 1e6],
  ['b12', 'Vitamin B12', 'µg', 2.4, ['418'], 'vitamin-b12', 1e6],
  ['fol', 'Folate', 'µg', 400, ['435', '417'], 'vitamin-b9', 1e6],
  ['na', 'Sodium', 'mg', 2300, ['307'], 'sodium', 1e3, true],
  ['sf', 'Saturated fat', 'g', 20, ['606'], 'saturated-fat', 1, true]
];
// search results carry nutrientNumber/value; the by-id lookup carries number/amount
function microFromUsda(list) {
  const by = {}; for (const n of list || []) { const num = n.nutrientNumber || n.number, v = n.value ?? n.amount; if (num && v != null) by[num] = +v; }
  const m = {}; for (const [k, , , , nums] of MICROS) if (nums) { const num = nums.find(x => by[x] != null); if (num) m[k] = by[num]; }
  return m;
}
function microFromOff(n) {
  const m = {}; for (const [k, , , , , off, scale] of MICROS) if (off && n && n[off + '_100g'] != null && !isNaN(+n[off + '_100g'])) m[k] = +n[off + '_100g'] * scale;
  return m;
}
// one logged entry's amount of a nutrient, or null when its food doesn't report it
function entryMicro(x, k) {
  if (k === 'fiber') return x.food && x.food.source === 'quick' ? null : x.totals.fiber || 0;
  const m = x.food && x.food.micro; if (!m || m[k] == null) return null;
  return x.grams ? m[k] * x.grams / 100 : m[k] * (x.qty || 1);
}
/* Foods logged before this existed only kept calories and macros: look them up again once, quietly. */
const Micro = {
  state: null,
  needs: f => f && !f.micro && (f.source === 'usda' || f.source === 'off') && f.sourceId,
  async backfill() {
    if (this.state) return; this.state = 'running';
    try {
      const since = startOfDay(Date.now()) - 30 * DAY, slots = [];
      for (const x of S.food) {
        if (x.kind === 'log' && x.date >= since && this.needs(x.food)) slots.push([x, x.food]);
        if (x.kind === 'meal') for (const it of x.items || []) if (this.needs(it.food)) slots.push([x, it.food]);
      }
      if (!slots.length) { this.state = 'done'; return; }
      const found = {};
      const usda = [...new Set(slots.filter(s => s[1].source === 'usda').map(s => s[1].sourceId))];
      for (let i = 0; i < usda.length; i += 20) {
        const d = await fetchJSON(`https://api.nal.usda.gov/fdc/v1/foods?api_key=${encodeURIComponent(usdaKey())}&format=abridged&fdcIds=${usda.slice(i, i + 20).join(',')}`, 3);
        if (Array.isArray(d)) for (const f of d) found['usda:' + f.fdcId] = microFromUsda(f.foodNutrients);
      }
      const off = [...new Set(slots.filter(s => s[1].source === 'off').map(s => s[1].sourceId))].slice(0, 40);
      for (const code of off) {
        const d = await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,nutriments`, 1);
        if (d && d.status === 1) found['off:' + code] = microFromOff(d.product && d.product.nutriments);
      }
      const changed = new Set();
      for (const [owner, food] of slots) { const m = found[food.source + ':' + food.sourceId]; if (m) { food.micro = m; changed.add(owner); } }
      for (const o of changed) store.saveFood(o);
    } catch {}
    this.state = 'done';
    if (S.tab === 'progress' && S.screen === 'tabs') render();
  }
};
/* Progress: daily averages over the last week of fully logged days. Folded away by default; no flags, just
   the numbers next to the label values, and an honest note about foods that don't report them. */
function viewMicros() {
  const end = startOfDay(Date.now()), days = [];
  for (let d = end - 6 * DAY; d <= end; d += DAY) { const day = startOfDay(d + 12 * 3600000); if (dayTotals(day).kcal >= ADAPT.partialDayKcal && !isIncompleteDay(day)) days.push(day); }
  if (!days.length) return '';
  const logs = days.flatMap(foodLogs);
  return `<section class="card micros"><details id="micro-details" ${S.microOpen ? 'open' : ''}>
    <summary><span class="stack" style="gap:2px"><h3>Vitamins and minerals</h3><span class="small muted">Daily average, last ${days.length === 1 ? 'logged day' : `${days.length} logged days`}</span></span><span class="chev" aria-hidden="true">›</span></summary>
    ${microList(logs, days.length)}</details></section>`;
}
// the list itself, shared by Progress (a week's average) and the Food tab (one day so far)
function microList(logs, nDays, today) {
  if (logs.some(x => Micro.needs(x.food)) && !Micro.state) setTimeout(() => Micro.backfill(), 0);
  const kcalAll = logs.reduce((s, x) => s + (x.totals.kcal || 0), 0) || 1;
  const row = ([k, name, u, dv]) => {
    let sum = 0, known = 0;
    for (const x of logs) { const v = entryMicro(x, k); if (v != null) { sum += v; known += x.totals.kcal || 0; } }
    const avg = sum / nDays, pct = Math.round(avg / dv * 100), enough = known / kcalAll >= 0.5;
    const amt = avg >= 100 ? fmtNum(avg) : avg >= 10 ? Math.round(avg) : r1(avg);
    return `<div class="mi"><span class="mi-n">${name} <span class="muted">${enough ? `${amt} ${u}` : ''}</span></span>
      ${enough ? `<span class="mi-bar"><i style="width:${Math.min(100, pct)}%"></i></span><span class="mi-p num">${pct}%</span>` : '<span class="mi-na small muted">Not enough data</span>'}</div>`;
  };
  const withData = logs.filter(x => x.food && x.food.micro && Object.keys(x.food.micro).length >= 5).length;
  return `<div class="stack" style="gap:6px;margin-top:10px">
      <p class="eyebrow" style="margin:0">Aim for</p>${MICROS.filter(m => !m[7]).map(row).join('')}
      <p class="eyebrow" style="margin:6px 0 0">Keep under</p>${MICROS.filter(m => m[7]).map(row).join('')}
      <p class="small muted" style="margin:6px 0 0">% of the Daily Value on US food labels${today ? ', for everything logged so far' : ''}.${withData < logs.length ? ` ${withData} of ${logs.length} foods logged${today ? ' today' : ''} list their vitamins and minerals; packaged foods and quick adds often don’t, so your real intake is likely a bit higher.` : ''}${Micro.state === 'running' ? ' Adding details for foods you logged earlier…' : ''}</p>
    </div>`;
}
// in the portion sheet: what this amount brings, the three biggest wins (and sodium when it's a lot)
function portionMicros(f, grams, qty) {
  const m = f.micro; if (!m || Object.keys(m).length < 3) return '';
  const factor = f.per100 ? (grams || 0) / 100 : qty || 0; if (!(factor > 0)) return '';
  const pct = ([k, , , dv]) => k === 'fiber' ? ((f.per100 || f.perServing || {}).fiber || 0) * factor / dv * 100 : m[k] != null ? m[k] * factor / dv * 100 : null;
  const top = MICROS.filter(x => !x[7]).map(x => [x[1], pct(x)]).filter(x => x[1] >= 5).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const na = pct(MICROS.find(x => x[0] === 'na'));
  const parts = [...top.map(([n, p]) => `${n} ${Math.round(p)}%`), na >= 15 ? `Sodium ${Math.round(na)}%` : ''].filter(Boolean);
  return parts.length ? `<span class="muted">Daily value:</span> ${esc(parts.join(' · '))}` : '';
}
