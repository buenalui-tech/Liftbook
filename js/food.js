// Liftbook — Food: search (USDA FoodData Central + Open Food Facts), barcode scanning, meals, daily targets.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- foods: one shape for every source ----------
   {key, source: 'usda'|'off'|'custom'|'quick', sourceId, name, brand,
    per100: {kcal, p, c, f, fiber} | null,      // per 100 g, when the weight is known
    perServing: {kcal, p, c, f, fiber} | null,  // labels and quick adds that only know one serving
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
    per100: usdaNutrients(x.foodNutrients), perServing: null,
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
    per100: {kcal: +kcal || 0, p: +n.proteins_100g || 0, c: +n.carbohydrates_100g || 0, f: +n.fat_100g || 0, fiber: +n.fiber_100g || 0}, perServing: null,
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
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${encodeURIComponent(q)}` +
    '&pageSize=30&requireAllWords=true&dataType=Foundation&dataType=SR%20Legacy&dataType=Survey%20%28FNDDS%29';
  const d = await fetchJSON(url);
  return d && Array.isArray(d.foods) ? d.foods.map(fromUsda) : null;
}
async function searchOff(q) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=20` +
    '&fields=code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity';
  const d = await fetchJSON(url, 1);
  return d && Array.isArray(d.products) ? d.products.map(fromOff).filter(Boolean) : null;
}
async function lookupBarcode(code) {
  const own = S.food.find(x => x.kind === 'food' && x.barcode === code); if (own) return customAsFood(own);
  const d = await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,generic_name,brands,nutriments,serving_size,serving_quantity`);
  return d && d.status === 1 ? fromOff(d.product) : null;
}
// Plain matches first: "chicken breast" should find "Chicken breast, roasted" before "Lunchmeat, chicken breast"
function rankFoods(foods, q) {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  const score = x => {
    const toks = x.name.toLowerCase().split(/\W+/).filter(Boolean);
    const extra = toks.filter(t => !words.includes(t)).length;
    const lead = toks[0] === words[0] ? 0 : 4;
    const processed = /\b(lunchmeat|breaded|fried|canned|baby food|dehydrated|powder|nectar|sauce|frozen meal)\b/i.test(x.name) && !words.some(w => /lunchmeat|breaded|fried|canned|baby|dehydrated|powder|nectar|sauce/.test(w)) ? 3 : 0;
    const cooked = /\b(baked|fried|roasted|grilled|boiled|cooked|raw|steamed)\b/i;
    const plain = !words.some(w => cooked.test(w)) && toks.includes('raw') ? -0.8 : 0;   // "banana" means a raw banana
    return lead + processed + plain + extra * 0.6 + (x.dataType === 'Foundation' ? -0.3 : 0);
  };
  return foods.map(x => [score(x), x]).sort((a, b) => a[0] - b[0]).map(e => e[1]);
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
function targets() {
  const n = S.profile.nutrition;
  if (n && n.mode === 'custom') return {...n, basis: 'your own numbers'};
  return autoTargets();
}

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
  const meals = MEALS.map(([m, label]) => {
    const items = foodLogs(day).filter(x => x.meal === m).sort((a, b) => a.date - b.date);
    const kcal = items.reduce((s, x) => s + (x.totals.kcal || 0), 0);
    return `<section class="card meal"><div class="row between"><h3>${label}</h3><span class="small muted num">${items.length ? fmtNum(kcal) + ' kcal' : ''}</span></div>
      ${items.map(x => `<button class="food-row" data-act="food-edit" data-v="${esc(x.id)}">
        <span class="stack" style="gap:0;min-width:0"><span class="fname">${esc(x.food.name)}</span><span class="small muted">${esc([x.food.brand, x.qtyLabel].filter(Boolean).join(' · '))}</span></span>
        <span class="num fk"><b>${fmtNum(x.totals.kcal)}</b><span class="small muted">${Math.round(x.totals.p)}g P</span></span></button>`).join('')}
      <button class="btn ghost" data-act="food-add" data-v="${m}" style="align-self:flex-start">+ Add food</button></section>`;
  }).join('');
  return `${brand('Food')}${storageBanner()}
    ${foodDayNav()}
    <section class="card">
      ${tg ? `<div class="row between" style="align-items:flex-end"><div><b class="num kcal-big">${fmtNum(tot.kcal)}</b> <span class="muted">/ ${fmtNum(tg.kcal)} kcal</span></div>
          <span class="chip ${left >= 0 ? 'hold' : 'new'} num">${left >= 0 ? `${fmtNum(left)} left` : `${fmtNum(-left)} over`}</span></div>
          <div class="mac-tr big"><div class="mac-v kc ${left < 0 ? 'over' : ''}" style="width:${Math.min(100, tot.kcal / tg.kcal * 100)}%"></div></div>`
        : `<div><b class="num kcal-big">${fmtNum(tot.kcal)}</b> <span class="muted">kcal</span></div>
           <p class="small muted" style="margin:0">Log a weigh-in on the Body tab and Liftbook sets calorie and protein targets for you.</p>`}
      ${macroBar('Protein', tot.p, tg && tg.p, 'g', 'p')}${macroBar('Carbs', tot.c, tg && tg.c, 'g', 'c')}${macroBar('Fat', tot.f, tg && tg.f, 'g', 'f')}
      <div class="row between small muted"><span>Fiber ${Math.round(tot.fiber)} g</span>${tg ? `<button class="btn ghost" data-act="targets-open" style="min-height:0;padding:0">Targets</button>` : ''}</div>
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
function viewAddFood() {
  const sh = S.sheet, mode = sh.mode || 'search';
  const tabs = [['search', 'Search'], ['recent', 'Recent'], ['mine', 'My foods'], ['quick', 'Quick add']];
  let body = '';
  if (mode === 'search') {
    const r = sh.results;
    body = `<div class="row" style="gap:8px"><input id="food-q" data-in="food-q" class="grow search" value="${esc(sh.q || '')}" placeholder="Search foods, e.g. greek yogurt" autocomplete="off" enterkeyhint="search">
        <button class="btn" data-act="barcode-open" aria-label="Scan a barcode">${BARCODE_ICON} Scan</button></div>
      ${sh.loading ? '<p class="small muted">Searching…</p>' : ''}
      ${r ? (r.length ? `<div class="lib">${r.map((x, i) => foodResult(x, i)).join('')}</div>` : `<p class="small muted">No matches for “${esc(sh.q)}”. Try fewer words, or create it under My foods.</p>`) : ''}
      ${sh.partial ? '<p class="small muted" style="margin:0">One of the food databases didn’t answer, so results may be incomplete.</p>' : ''}`;
  } else if (mode === 'recent') {
    const rec = recentFoods();
    sh.results = rec.map(x => x.food);
    body = rec.length ? `<div class="lib">${rec.map((x, i) => foodResult(x.food, i, x.last.qtyLabel)).join('')}</div>` : '<p class="small muted">Foods you log show up here for one-tap repeats.</p>';
  } else if (mode === 'mine') {
    const mine = S.food.filter(x => x.kind === 'food').sort((a, b) => a.name.localeCompare(b.name));
    sh.results = mine.map(customAsFood);
    body = `${mine.length ? `<div class="lib">${sh.results.map((x, i) => foodResult(x, i)).join('')}</div>` : '<p class="small muted">Save foods and recipes the databases don’t have.</p>'}
      <button class="btn block" data-act="custom-new">+ Create a food</button>`;
  } else if (mode === 'quick') {
    body = `<p class="small muted" style="margin:0">For restaurant meals or anything you only know the numbers for.</p>
      <label class="field">Name (optional)<input id="qa-name" placeholder="Chipotle bowl"></label>
      <div class="scan-grid"><label class="field">Calories<input id="qa-kcal" inputmode="numeric"></label><label class="field">Protein (g)<input id="qa-p" inputmode="decimal"></label>
        <label class="field">Carbs (g)<input id="qa-c" inputmode="decimal"></label><label class="field">Fat (g)<input id="qa-f" inputmode="decimal"></label></div>
      <button class="btn primary block" data-act="quick-save">Add to ${esc(mealLabel(sh.meal))}</button>`;
  }
  return `<div class="row between"><h2>Add to ${esc(mealLabel(sh.meal))}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <div class="seg tabs4" role="tablist">${tabs.map(([k, l]) => `<button data-act="food-mode" data-v="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
    ${body}`;
}
const mealLabel = m => (MEALS.find(x => x[0] === m) || [, 'Snacks'])[1];
const BARCODE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>';
function foodResult(x, i, note) {
  const per = x.per100 ? `${fmtNum(x.per100.kcal)} kcal · ${r1(x.per100.p)}g P per 100 g` : x.perServing ? `${fmtNum(x.perServing.kcal)} kcal per serving` : '';
  return `<button data-act="food-pick" data-v="${i}"><span class="stack" style="gap:1px;min-width:0;text-align:left"><span class="fname">${esc(x.name)}</span>
    <span class="small muted">${esc([x.brand, note || per].filter(Boolean).join(' · '))}</span></span>
    <span class="src ${x.source}">${x.source === 'usda' ? 'USDA' : x.source === 'off' ? 'Label' : 'Mine'}</span></button>`;
}
async function runSearch(q) {
  const sh = S.sheet, seq = ++searchSeq;
  q = q.trim(); if (q.length < 2) { sh.results = null; sh.loading = false; render(); return; }
  sh.loading = true; render();
  const mine = S.food.filter(x => x.kind === 'food' && x.name.toLowerCase().includes(q.toLowerCase())).map(customAsFood);
  const [u, o] = await Promise.all([searchUsda(q), searchOff(q)]);
  if (seq !== searchSeq || S.sheet !== sh) return;   // a newer search or a closed sheet wins
  sh.loading = false; sh.partial = !u || !o;
  sh.results = [...mine, ...rankFoods(u || [], q).slice(0, 12), ...(o || []).slice(0, 12)];
  render();
}

/* ---------- portion: how much, which meal ---------- */
function openPortion(food, meal, existing) {
  const units = unitsFor(food), last = existing || recentFoods(60).find(x => x.food.key === food.key)?.last;
  const unitId = last && units.some(u => u.id === last.unit) ? last.unit : units[0].id;
  S.sheet = {type: 'portion', food, meal: existing ? existing.meal : meal, qty: last ? last.qty : (units[0].id === 'g' ? 100 : 1), unit: unitId, editId: existing ? existing.id : null, back: S.sheet};
  render();
}
function viewPortion() {
  const sh = S.sheet, f = sh.food, units = unitsFor(f), {grams, totals} = portionTotals(f, +sh.qty || 0, sh.unit);
  return `<div class="row between"><h2>${sh.editId ? 'Edit food' : 'Add food'}</h2><button class="iconbtn" data-act="${sh.editId ? 'sheet-close' : 'portion-back'}" aria-label="Back">✕</button></div>
    <div class="stack" style="gap:2px"><b>${esc(f.name)}</b><span class="small muted">${esc([f.brand, f.source === 'usda' ? 'USDA FoodData Central' : f.source === 'off' ? 'Open Food Facts' : f.source === 'quick' ? 'Quick add' : 'My food'].filter(Boolean).join(' · '))}</span></div>
    ${f.source === 'quick' ? '' : `<div class="row"><label class="field" style="width:110px">Amount<input id="po-qty" data-in="po-qty" inputmode="decimal" value="${esc(sh.qty)}"></label>
      <label class="field grow">Unit<select id="po-unit" data-in="po-unit">${units.map(u => `<option value="${u.id}" ${u.id === sh.unit ? 'selected' : ''}>${esc(u.label)}${u.grams && u.id !== 'g' && u.id !== 'oz' && !/\d\s*(g|ml)\b/i.test(u.label) ? ` (${r1(u.grams)} g)` : ''}</option>`).join('')}</select></label></div>`}
    <div class="stats" id="po-totals">${portionStats(totals, grams)}</div>
    <div class="chips" role="group" aria-label="Meal">${MEALS.map(([m, l]) => `<button class="chipbtn" data-act="po-meal" data-v="${m}" aria-pressed="${sh.meal === m}">${l}</button>`).join('')}</div>
    <button class="btn primary lg block" data-act="portion-save">${sh.editId ? 'Save changes' : `Add to ${esc(mealLabel(sh.meal))}`}</button>
    ${sh.editId ? `<button class="btn danger block ${S.armed === 'fdel' ? 'armed' : ''}" data-act="food-del">${S.armed === 'fdel' ? 'Tap again to remove' : 'Remove from log'}</button>` : ''}`;
}
const portionStats = (t, grams) => `<div class="stat"><b class="num">${fmtNum(t.kcal)}</b><span>kcal${grams ? ` · ${fmtNum(grams)} g` : ''}</span></div>
  <div class="stat"><b class="num">${r1(t.p)}</b><span>Protein g</span></div><div class="stat"><b class="num">${r1(t.c)} / ${r1(t.f)}</b><span>Carbs / fat g</span></div>`;
function savePortion() {
  const sh = S.sheet, qty = parseFloat(String(sh.qty).replace(',', '.'));
  if (sh.food.source !== 'quick' && !(qty > 0)) { toast('Enter an amount, like 1 or 150.'); return; }
  const u = unitsFor(sh.food).find(x => x.id === sh.unit) || unitsFor(sh.food)[0];
  const {grams, totals} = portionTotals(sh.food, sh.food.source === 'quick' ? 1 : qty, sh.unit);
  const qtyLabel = sh.food.source === 'quick' ? '' : u.id === 'g' ? `${fmtW(qty)} g` : u.id === 'oz' ? `${fmtW(qty)} oz`
    : /^1 /.test(u.label) ? `${fmtW(qty)} ${u.label.slice(2)}` : `${fmtW(qty)} × ${u.label}`;
  const existing = sh.editId ? S.food.find(x => x.id === sh.editId) : null;
  const day = S.day || startOfDay(Date.now());
  const e = existing || {id: newId(), kind: 'log', date: day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600000};
  Object.assign(e, {meal: sh.meal, food: sh.food, qty: sh.food.source === 'quick' ? 1 : qty, unit: u.id, qtyLabel, grams, totals});
  if (!existing) S.food.push(e);
  store.saveFood(e); S.sheet = null; render(); toast(existing ? 'Updated' : `Added to ${mealLabel(e.meal)}`);
}
function saveQuickAdd() {
  const num = id => { const v = parseFloat((document.getElementById(id).value || '').replace(',', '.')); return v > 0 ? v : 0; };
  const kcal = num('qa-kcal'); if (!kcal) { toast('Enter the calories.'); return; }
  const name = (document.getElementById('qa-name').value || '').trim() || 'Quick add';
  const food = {key: 'quick:' + newId(), source: 'quick', sourceId: '', name, brand: '', per100: null, perServing: {kcal, p: num('qa-p'), c: num('qa-c'), f: num('qa-f'), fiber: 0}, servings: []};
  S.sheet = {type: 'portion', food, meal: S.sheet.meal, qty: 1, unit: 'serving'}; savePortion();
}

/* ---------- custom foods ---------- */
function viewCustomFood() {
  const sh = S.sheet;
  return `<div class="row between"><h2>Create a food</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <p class="small muted" style="margin:0">Copy the numbers from the nutrition label, for one serving.</p>
    <label class="field">Name<input id="cf-name" value="${esc(sh.name || '')}" placeholder="Protein overnight oats"></label>
    <div class="row"><label class="field grow">Brand (optional)<input id="cf-brand"></label><label class="field grow">Barcode (optional)<input id="cf-code" inputmode="numeric" value="${esc(sh.barcode || '')}"></label></div>
    <div class="row"><label class="field grow">Serving<input id="cf-serv" value="1 serving" placeholder="1 bar"></label><label class="field" style="width:120px">Serving weight g (optional)<input id="cf-g" inputmode="decimal"></label></div>
    <div class="scan-grid"><label class="field">Calories<input id="cf-kcal" inputmode="numeric"></label><label class="field">Protein (g)<input id="cf-p" inputmode="decimal"></label>
      <label class="field">Carbs (g)<input id="cf-c" inputmode="decimal"></label><label class="field">Fat (g)<input id="cf-f" inputmode="decimal"></label></div>
    <button class="btn primary block" data-act="custom-save">Save food</button>`;
}
function saveCustomFood() {
  const val = id => (document.getElementById(id).value || '').trim(), num = id => { const v = parseFloat(val(id).replace(',', '.')); return v > 0 ? v : 0; };
  const name = val('cf-name'); if (!name) { toast('Give the food a name.'); return; }
  if (!num('cf-kcal')) { toast('Enter the calories per serving.'); return; }
  const meal = S.sheet.meal;
  const c = {id: newId(), kind: 'food', date: Date.now(), name, brand: val('cf-brand'), barcode: val('cf-code').replace(/\D/g, ''),
    servingLabel: val('cf-serv') || '1 serving', servingGrams: num('cf-g') || null,
    perServing: {kcal: num('cf-kcal'), p: num('cf-p'), c: num('cf-c'), f: num('cf-f'), fiber: 0}};
  S.food.push(c); store.saveFood(c); toast(`${name} saved`);
  const food = customAsFood(c);
  S.sheet = {type: 'add-food', meal, mode: 'mine'};
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
  if (food) { S.sheet = {type: 'add-food', meal: sh.meal, mode: 'search'}; openPortion(food, sh.meal); }
  else { sh.notFound = code; render(); }
}

/* ---------- targets sheet ---------- */
function viewTargets() {
  const a = autoTargets(), n = S.profile.nutrition || {mode: 'auto'}, custom = n.mode === 'custom', cur = custom ? n : a;
  return `<div class="row between"><h2>Daily targets</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <div class="seg" role="group" aria-label="Target mode"><button data-act="targets-mode" data-v="auto" aria-pressed="${!custom}">Set for me</button><button data-act="targets-mode" data-v="custom" aria-pressed="${custom}">My own numbers</button></div>
    ${!custom ? (a ? `<p class="small muted" style="margin:0">Based on ${esc(a.basis)}. Protein is 0.9 g per lb of body weight, fat 0.35 g per lb, and carbs fill the rest. Change Cut, Maintain or Bulk on the Body tab. Once you’ve logged food for a few weeks, these will adjust to how your weight actually responds.</p>`
      : '<p class="small muted" style="margin:0">Log a weigh-in on the Body tab first.</p>') : ''}
    <div class="scan-grid">
      ${[['kcal', 'Calories', ''], ['p', 'Protein', 'g'], ['c', 'Carbs', 'g'], ['f', 'Fat', 'g']].map(([k, l, u]) => `<label class="field">${l}${u ? ` (${u})` : ''}<input id="tg-${k}" inputmode="numeric" value="${cur ? cur[k] : ''}" ${custom ? '' : 'disabled'}></label>`).join('')}
    </div>
    ${custom ? '<button class="btn primary block" data-act="targets-save">Save targets</button>' : ''}`;
}
function saveTargets() {
  const num = id => parseInt(document.getElementById(id).value, 10) || 0;
  const t = {mode: 'custom', kcal: num('tg-kcal'), p: num('tg-p'), c: num('tg-c'), f: num('tg-f'), fiber: 30};
  if (t.kcal < 800 || t.kcal > 8000) { toast('Calories should be between 800 and 8,000.'); return; }
  S.profile.nutrition = t; store.saveProfile(); S.sheet = null; render(); toast('Targets saved');
}
