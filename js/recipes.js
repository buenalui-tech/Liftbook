// Liftbook — Recipes and saved meals (one editor for both), quick re-logging and voice search.
// Classic script: files load in order (see index.html) and share top-level names.

/* A recipe becomes one food ("Chili, 1 serving"); a saved meal logs each of its foods separately.
   Both are a list of items shaped like a log entry: {food, qty, unit, qtyLabel, grams, totals}.
   Recipes change all the time, so everything is edited in place: amounts right in the list, servings with
   − and +, the whole batch scaled in one tap, and the cooked weight from the scale. */
const NUTR_KEYS = ['kcal', 'p', 'c', 'f', 'fiber'];
const sumItems = items => { const t = NUTRIENTS0(); for (const it of items || []) for (const k of NUTR_KEYS) t[k] += (it.totals && it.totals[k]) || 0; return t; };
const scaleNutr = (t, x) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * x * 100) / 100]));
// vitamins and minerals of a whole recipe: a nutrient counts once foods reporting it make up half the calories
function sumMicros(items) {
  const kcal = items.reduce((s, it) => s + ((it.totals && it.totals.kcal) || 0), 0) || 1, out = {};
  for (const [k] of MICROS) {
    if (k === 'fiber') continue;
    let sum = 0, known = 0;
    for (const it of items) { const v = entryMicro(it, k); if (v != null) { sum += v; known += (it.totals && it.totals.kcal) || 0; } }
    if (known / kcal >= 0.5) out[k] = sum;
  }
  return out;
}
function recipeAsFood(r) {
  const t = sumItems(r.items), m = sumMicros(r.items), n = Math.max(1, +r.servings || 1);
  const base = {key: 'recipe:' + r.id, source: 'recipe', sourceId: r.id, name: r.name || 'Recipe', brand: ''};
  // with the cooked weight, a serving can be weighed: log by grams or by servings
  if (r.cookedGrams > 0) return {...base, per100: scaleNutr(t, 100 / r.cookedGrams), perServing: null, micro: scaleNutr(m, 100 / r.cookedGrams),
    servings: [{label: `1 serving (1/${fmtW(n)} of the batch)`, grams: Math.round(r.cookedGrams / n)}]};
  return {...base, per100: null, perServing: scaleNutr(t, 1 / n), micro: scaleNutr(m, 1 / n), servings: [{label: '1 serving', grams: null}]};
}
const itemFromPortion = (food, qty, unitId) => {
  const u = unitsFor(food).find(x => x.id === unitId) || unitsFor(food)[0], {grams, totals} = portionTotals(food, qty, u.id);
  return {food, qty, unit: u.id, qtyLabel: qtyLabelFor(food, qty, u), grams, totals};
};
function qtyLabelFor(food, qty, u) {
  if (food.source === 'quick') return '';
  return u.id === 'g' ? `${fmtW(qty)} g` : u.id === 'oz' ? `${fmtW(qty)} oz` : /^1 /.test(u.label) ? `${fmtW(qty)} ${u.label.slice(2)}` : `${fmtW(qty)} × ${u.label}`;
}

/* ---------- the editor ---------- */
function openCollection(kind, id, extra = {}) {
  const src = id ? S.food.find(x => x.id === id) : null;
  const draft = src ? JSON.parse(JSON.stringify(src)) : {id: newId(), kind, name: '', items: [], ...(kind === 'recipe' ? {servings: 4, cookedGrams: null} : {})};
  const logged = src && kind === 'recipe' ? loggedFrom(src.id).length : 0, day = S.day || startOfDay(Date.now());
  S.sheet = {type: 'collection', kind, draft, isNew: !src, back: S.sheet && S.sheet.type !== 'collection' ? S.sheet : null,
    updates: logged, updatesWhen: day === startOfDay(Date.now()) ? 'today' : 'that day', ...extra};
  disarm(); render();
}
function collectionSummary(d) {
  const t = sumItems(d.items), n = d.kind === 'recipe' ? Math.max(1, +d.servings || 1) : 1, per = scaleNutr(t, 1 / n);
  return `<div class="stats"><div class="stat"><b class="num">${fmtNum(per.kcal)}</b><span>kcal${d.kind === 'recipe' ? ' / serving' : ''}</span></div>
    <div class="stat"><b class="num">${Math.round(per.p)} g</b><span>Protein</span></div><div class="stat"><b class="num">${Math.round(per.c)} / ${Math.round(per.f)}</b><span>Carbs / fat g</span></div></div>
    ${d.kind === 'recipe' ? `<p class="small muted num" style="margin:0">Whole batch: ${fmtNum(t.kcal)} kcal · ${Math.round(t.p)} g protein${d.cookedGrams > 0 ? ` · ${fmtNum(d.cookedGrams)} g cooked, so ${fmtNum(d.cookedGrams / n)} g a serving` : ''}</p>` : ''}`;
}
function viewCollection() {
  const sh = S.sheet, d = sh.draft, recipe = d.kind === 'recipe';
  const rows = d.items.map((it, i) => {
    const units = unitsFor(it.food);
    return `<div class="ing">
      <div class="ing-top"><span class="stack" style="gap:0;min-width:0"><span class="fname">${esc(it.food.name)}</span>${it.food.brand ? `<span class="small muted">${esc(it.food.brand)}</span>` : ''}</span>
        <button class="iconbtn" data-act="ci-rm" data-i="${i}" aria-label="Remove ${esc(it.food.name)}" style="color:${S.armed === 'cirm' + i ? 'var(--pr)' : 'inherit'}">${S.armed === 'cirm' + i ? '✓?' : '✕'}</button></div>
      <div class="ing-amt">${it.food.source === 'quick' ? '<span class="small muted grow">Quick add</span>' : `<input id="ci-q-${i}" class="ci-q" data-in="ci-qty" data-i="${i}" inputmode="decimal" value="${esc(fmtW(it.qty))}" aria-label="Amount of ${esc(it.food.name)}">
        <select id="ci-u-${i}" data-in="ci-unit" data-i="${i}" aria-label="Unit">${units.map(u => `<option value="${u.id}" ${u.id === it.unit ? 'selected' : ''}>${esc(u.label.replace(/^1 /, ''))}</option>`).join('')}</select>`}
        <span class="num ci-k" id="ci-k-${i}">${fmtNum(it.totals.kcal)} kcal</span></div></div>`;
  }).join('');
  const into = sh.back && sh.back.type === 'add-food' ? sh.back.meal : null;
  return `<div class="row between"><h2>${sh.isNew ? (recipe ? 'New recipe' : 'New meal') : (recipe ? 'Edit recipe' : 'Edit meal')}</h2><button class="iconbtn" data-act="coll-close" aria-label="Close">✕</button></div>
    <label class="field">Name<input id="coll-name" data-in="coll-name" value="${esc(d.name)}" placeholder="${recipe ? 'Turkey chili' : 'Usual breakfast'}" autocomplete="off" autocorrect="off" spellcheck="false"></label>
    ${recipe ? `<div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div class="field">Servings<div class="stepper"><button class="btn" data-act="coll-serv" data-v="-1" aria-label="Fewer servings">−</button><b class="num" id="coll-serv">${fmtW(d.servings)}</b><button class="btn" data-act="coll-serv" data-v="1" aria-label="More servings">+</button></div></div>
        <label class="field grow">Cooked weight, g (optional)<input id="coll-cooked" data-in="coll-cooked" inputmode="decimal" value="${d.cookedGrams > 0 ? esc(fmtW(d.cookedGrams)) : ''}" placeholder="Weigh the finished batch"></label>
        ${Scale.status === 'on' ? '<button class="btn" data-act="coll-weigh">Use scale</button>' : ''}</div>
      <p class="small muted" style="margin:0">With the cooked weight you can log exactly what’s in your bowl, by grams. Without it, you log by servings.</p>` : ''}
    <div id="coll-sum">${collectionSummary(d)}</div>
    <p class="eyebrow" style="margin:0">${recipe ? 'Ingredients' : 'Foods'}${d.items.length ? ` · ${d.items.length}` : ''}</p>
    ${rows ? `<div class="ings">${rows}</div>` : `<p class="small muted" style="margin:0">${recipe ? 'Add each ingredient with its raw amount.' : 'Add the foods you usually have together.'}</p>`}
    <button class="btn block" data-act="coll-add">+ Add ${recipe ? 'ingredient' : 'food'}</button>
    ${recipe && d.items.length ? `<div class="set-row"><span class="stack" style="gap:1px"><span>Made a different amount?</span><span class="small muted">Scales every ingredient</span></span>
      <div class="seg">${[[0.5, '½×'], [1.5, '1½×'], [2, '2×']].map(([x, l]) => `<button data-act="coll-scale" data-v="${x}">${l}</button>`).join('')}</div></div>` : ''}
    ${sh.msg ? `<p class="small" style="margin:0;color:var(--pr)">${esc(sh.msg)}</p>` : ''}
    ${sh.updates ? `<label class="row small"><input type="checkbox" data-act="coll-upd" ${sh.updateLogged !== false ? 'checked' : ''}> Also update the ${sh.updates} time${sh.updates === 1 ? '' : 's'} you logged it ${sh.updatesWhen}</label>` : ''}
    <button class="btn primary lg block" data-act="coll-save">${into ? `Save and add to ${esc(mealLabel(into))}` : `Save ${recipe ? 'recipe' : 'meal'}`}</button>
    ${into ? '<button class="btn block" data-act="coll-save" data-v="only">Just save</button>' : ''}
    ${sh.isNew ? '' : `<div class="row"><button class="btn grow" data-act="coll-dup">Duplicate</button><button class="btn danger grow ${S.armed === 'colldel' ? 'armed' : ''}" data-act="coll-del">${S.armed === 'colldel' ? 'Tap again to delete' : 'Delete'}</button></div>`}`;
}
// live totals while amounts are typed, without redrawing the inputs
function paintCollection() {
  const sh = S.sheet; if (!sh || sh.type !== 'collection') return;
  const box = document.getElementById('coll-sum'); if (box) box.innerHTML = collectionSummary(sh.draft);
  sh.draft.items.forEach((it, i) => { const k = document.getElementById('ci-k-' + i); if (k) k.textContent = `${fmtNum(it.totals.kcal)} kcal`; });
}
function setItemAmount(i, qty, unitId) {
  const d = S.sheet.draft, it = d.items[i]; if (!it) return;
  const next = itemFromPortion(it.food, qty > 0 ? qty : 0, unitId || it.unit);
  d.items[i] = next; paintCollection();
}
// recipes logged today (or on the day you're looking at) can follow the edit
function loggedFrom(id) { const day = S.day || startOfDay(Date.now()); return foodLogs(day).filter(x => x.food && x.food.key === 'recipe:' + id); }
function saveCollection() {
  const sh = S.sheet, d = sh.draft;
  d.name = (d.name || '').trim();
  if (!d.name) { sh.msg = `Give the ${d.kind} a name.`; render(); return false; }
  if (!d.items.length) { sh.msg = `Add at least one ${d.kind === 'recipe' ? 'ingredient' : 'food'}.`; render(); return false; }
  const i = S.food.findIndex(x => x.id === d.id);
  const rec = {...d, date: (i >= 0 ? S.food[i].date : Date.now()), items: d.items.filter(it => it.food)};
  delete rec.updatedAt;
  if (i >= 0) S.food[i] = rec; else S.food.push(rec);
  store.saveFood(rec);
  if (d.kind === 'recipe' && sh.updateLogged !== false) for (const e of loggedFrom(d.id)) {
    const food = recipeAsFood(rec), unit = unitsFor(food).some(u => u.id === e.unit) ? e.unit : unitsFor(food)[0].id;
    Object.assign(e, itemFromPortion(food, e.qty, unit)); store.saveFood(e);
  }
  return rec;
}

/* ---------- quick re-log: the + on your own foods adds last time's amount, and the sheet stays open ---------- */
function relogLast(e, meal) {
  const last = e.last, day = S.day || startOfDay(Date.now());
  const food = e.food.source === 'recipe' ? (S.food.find(x => x.kind === 'recipe' && 'recipe:' + x.id === e.food.key) ? recipeAsFood(S.food.find(x => 'recipe:' + x.id === e.food.key)) : e.food) : e.food;
  const unit = unitsFor(food).some(u => u.id === last.unit) ? last.unit : unitsFor(food)[0].id;
  const entry = {id: newId(), kind: 'log', date: day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600000, meal, ...itemFromPortion(food, last.qty, unit)};
  S.food.push(entry); store.saveFood(entry);
  toastUndo(`Added ${food.name}${entry.qtyLabel ? ' · ' + entry.qtyLabel : ''}`, () => { S.food = S.food.filter(x => x.id !== entry.id); store.deleteFood(entry.id); render(); });
}
let undoFn = null;
function toastUndo(msg, fn) {
  const el = document.getElementById('toast'); if (!el) return;
  undoFn = fn; el.innerHTML = `<span>${esc(msg)}</span><button class="toast-undo" data-act="undo">Undo</button>`; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; undoFn = null; }, 4500);
}

/* ---------- voice: say "150 grams of chicken breast" or "two eggs" ---------- */
const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const NUM_WORDS = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, quarter: 0.25};
const UNIT_WORDS = [[/^(g|gram|grams|gs)$/, 'g'], [/^(oz|ounce|ounces)$/, 'oz'], [/^(cup|cups)$/, 'cup'], [/^(tablespoon|tablespoons|tbsp)$/, 'tbsp'], [/^(teaspoon|teaspoons|tsp)$/, 'tsp'],
  [/^(slice|slices)$/, 'slice'], [/^(piece|pieces)$/, 'piece'], [/^(scoop|scoops)$/, 'scoop'], [/^(serving|servings)$/, 'serving'], [/^(bowl|bowls)$/, 'bowl']];
function parseSpoken(text) {
  let words = String(text || '').toLowerCase().replace(/[^\w\s.½]/g, ' ').split(/\s+/).filter(Boolean), qty = null, unit = null;
  const num = w => w === '½' ? 0.5 : /^\d+(\.\d+)?$/.test(w) ? +w : NUM_WORDS[w];
  if (words.length && num(words[0]) != null) {
    qty = num(words.shift());
    if (words[0] === 'and' && words[1] && ['a', 'half'].includes(words[1])) { words.splice(0, words[1] === 'a' ? 3 : 2); qty += 0.5; }   // "one and a half"
    if (qty === 1 && words[0] === 'half') { words.shift(); qty = 0.5; }                                                                // "a half cup"
  }
  if (words.length) { const u = UNIT_WORDS.find(([re]) => re.test(words[0])); if (u) { unit = u[1]; words.shift(); } }
  if (words[0] === 'of') words.shift();
  return {q: words.join(' '), qty, unit};
}
// a picked food takes the spoken amount when it fits one of its units
function applySpoken(sh, sp) {
  if (!sp || !(sp.qty > 0)) return;
  const units = unitsFor(sh.food);
  if (sp.unit === 'g' || sp.unit === 'oz') { if (units.some(u => u.id === sp.unit)) Object.assign(sh, {qty: sp.qty, unit: sp.unit}); return; }
  const want = sp.unit === 'tbsp' ? /tbsp|tablespoon/i : sp.unit === 'tsp' ? /tsp|teaspoon/i : sp.unit ? new RegExp('\\b' + sp.unit, 'i') : null;
  const u = want ? units.find(x => want.test(x.label)) : units.find(x => x.id !== 'g' && x.id !== 'oz');
  if (u) Object.assign(sh, {qty: sp.qty, unit: u.id});
}
const VoiceSearch = {
  rec: null,
  start(sh) {
    if (!SpeechRec) return;
    if (this.rec) { this.rec.stop(); return; }
    const rec = new SpeechRec(); this.rec = rec;
    rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
    sh.listening = true; paintMic();
    rec.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
      const p = parseSpoken(text), input = document.getElementById('food-q');
      if (input) input.value = p.q || text;
      if (e.results[e.results.length - 1].isFinal) { sh.spoken = p.qty ? {qty: p.qty, unit: p.unit} : null; onFoodQuery(p.q || text); }
    };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow the microphone and speech recognition for this app in your phone’s settings.'); else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Didn’t catch that. Try again.'); };
    rec.onend = () => { this.rec = null; sh.listening = false; paintMic(); };
    try { rec.start(); } catch { this.rec = null; sh.listening = false; paintMic(); }
  }
};
function paintMic() { const b = document.getElementById('food-mic'); if (b && S.sheet) { b.classList.toggle('on', !!S.sheet.listening); b.setAttribute('aria-pressed', String(!!S.sheet.listening)); } }
const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/* ---------- barcodes: the official label first ----------
   USDA's Branded Foods database holds the label data manufacturers submit (keyed by the 14-digit GTIN); it is
   tried alongside Open Food Facts, and wins when it has the product. */
function titleCase(s) { return /[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()); }
function fromUsdaBranded(x) {
  const f = fromUsda(x), size = +x.servingSize, unit = String(x.servingSizeUnit || '').toLowerCase();
  const grams = size > 0 && /^(g|grm|ml|mlt)$/.test(unit) ? size : null;
  return {...f, key: 'usda:' + x.fdcId, name: titleCase(f.name), brand: titleCase(String(x.brandName || x.brandOwner || '').trim()), dataType: 'Branded', barcode: String(x.gtinUpc || ''),
    servings: grams ? [{label: x.householdServingFullText ? `${titleCase(String(x.householdServingFullText))} (${fmtW(grams)} ${/ml|mlt/.test(unit) ? 'ml' : 'g'})` : `1 serving (${fmtW(grams)} g)`, grams}] : f.servings};
}
async function usdaBarcode(code) {
  const gtin = code.padStart(14, '0');
  const d = await fetchJSON(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaKey())}&query=${gtin}&dataType=Branded&pageSize=5`, 3);
  const hit = d && Array.isArray(d.foods) && d.foods.find(f => String(f.gtinUpc || '').replace(/^0+/, '') === code.replace(/^0+/, ''));
  return hit ? fromUsdaBranded(hit) : null;
}
// "Numbers don't match the package?": the food opens in the editor with the label values, saved as your own for next time
function prefillFromFood(f) {
  const s = f.servings && f.servings[0], g = f.per100 && s && s.grams ? s.grams : f.per100 ? 100 : null;
  const per = f.per100 ? scaleNutr(f.per100, g / 100) : f.perServing || NUTRIENTS0();
  return {name: f.name, brand: f.brand || '', barcode: f.barcode || (f.source === 'off' ? f.sourceId : ''), servingLabel: s && s.grams ? s.label : f.per100 ? '100 g' : (s && s.label) || '1 serving', servingGrams: g, perServing: per};
}
