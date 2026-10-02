// Liftbook — Adaptive targets: learn real daily energy burn from logged food and the weight trend.
// Classic script: files load in order (see index.html) and share top-level names.

/* Energy balance over the last 3 weeks:
     real burn (kcal/day) = average intake on fully logged days − trend-weight change × 7,700 kcal/kg ÷ days
   (7,700 kcal/kg is the usual 3,500 kcal per lb). The weight side uses the 7-day trend, not raw
   weigh-ins, so water swings wash out. Nothing changes until the user accepts a weekly check-in. */
const ADAPT = {windowDays: 21, minFoodDays: 10, minWeighIns: 6, kcalPerKg: 7700, minPlausible: 1200, maxPlausible: 5000, partialDayKcal: 600};

const isIncompleteDay = day => (S.profile.incompleteDays || []).includes(day);
// days in the window that count: something real logged, and not marked as partly logged
function loggedFoodDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d += DAY) {
    const day = startOfDay(d + 12 * 3600000), kcal = dayTotals(day).kcal;
    if (kcal >= ADAPT.partialDayKcal && !isIncompleteDay(day)) out.push({day, kcal});
  }
  return out;
}
function estimateBurn(now = Date.now()) {
  const end = startOfDay(now) - DAY, start = end - (ADAPT.windowDays - 1) * DAY;   // today is still in progress
  const food = loggedFoodDays(start, end);
  const pts = weightSeries().filter(p => p.t >= start && p.t <= end);
  const progress = {foodDays: food.length, weighIns: pts.length, needFood: ADAPT.minFoodDays, needWeighIns: ADAPT.minWeighIns};
  if (food.length < ADAPT.minFoodDays || pts.length < ADAPT.minWeighIns || pts[pts.length - 1].t - pts[0].t < 10 * DAY) return {ready: false, progress};
  // least-squares slope of the trend line, in kg per day
  const n = pts.length, mx = pts.reduce((s, p) => s + p.t, 0) / n, my = pts.reduce((s, p) => s + p.trend, 0) / n;
  let num = 0, den = 0; for (const p of pts) { num += (p.t - mx) * (p.trend - my); den += (p.t - mx) ** 2; }
  const kgPerDay = den ? num / den * DAY : 0;
  const intake = food.reduce((s, d) => s + d.kcal, 0) / food.length;
  const burn = intake - kgPerDay * ADAPT.kcalPerKg;
  if (!(burn >= ADAPT.minPlausible && burn <= ADAPT.maxPlausible)) return {ready: false, implausible: true, progress, intake, kgPerDay};
  return {ready: true, burn: Math.round(burn / 10) * 10, intake: Math.round(intake), kgPerWeek: kgPerDay * 7, foodDays: food.length, weighIns: n, progress};
}
// target calories for a given daily burn and the Cut/Maintain/Bulk goal
function goalAdjust() {
  const g = S.profile.goal || {type: 'maintain', rate: 0}, rateLb = unit() === 'kg' ? (g.rate || 0) / KG : (g.rate || 0);
  return {delta: (g.type === 'cut' ? -500 : g.type === 'bulk' ? 500 : 0) * rateLb, type: g.type, rateLb};
}
function targetsFromBurn(burn, basis) {
  const pts = weightSeries(); if (!pts.length) return null;
  const lb = pts[pts.length - 1].trend / KG, {delta} = goalAdjust();
  const kcal = Math.round((burn + delta) / 10) * 10, p = Math.round(lb * 0.9), f = Math.round(lb * 0.35);
  return {kcal, p, f, c: Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4)), fiber: 30, burn, basis};
}

/* ---------- weekly check-in (once per Monday-started week, only when there's a learned value) ---------- */
function checkinDue() {
  const pr = nutritionPrefs(); if (pr.kcalMode === 'manual' || pr.split === 'grams') return null;   // the user chose their own calories
  const est = estimateBurn(); if (!est.ready) return null;
  const wk = startOfWeek(Date.now()), a = S.profile.adaptive;
  if (a && a.week === wk) return null;                          // already accepted this week
  if ((S.profile.checkinSkipped || 0) === wk) return null;      // "keep current" this week
  return est;
}
function viewCheckin(est) {
  const cur = targets(), next = targetsFromBurn(est.burn, '');
  const u = unit(), change = fromKg(est.kgPerWeek);
  const first = !S.profile.adaptive;
  return `<section class="card checkin">
    <div class="stack" style="gap:2px"><p class="eyebrow" style="margin:0">Weekly check-in</p><h3>${first ? 'Liftbook has learned your metabolism' : 'Your targets for this week'}</h3></div>
    <div class="stats">
      <div class="stat"><b class="num">${fmtNum(est.intake)}</b><span>Avg kcal eaten</span></div>
      <div class="stat"><b class="num">${change > 0 ? '+' : change < 0 ? '−' : ''}${f1(Math.abs(change))}</b><span>${u}/week trend</span></div>
      <div class="stat"><b class="num">${fmtNum(est.burn)}</b><span>Real burn/day</span></div></div>
    <p class="small muted" style="margin:0">From ${est.foodDays} fully logged days and ${est.weighIns} weigh-ins in the last 3 weeks. ${first ? `Your formula estimate was ${fmtNum(autoTargets() ? autoTargets().kcal - goalAdjust().delta : 0)} kcal.` : ''}</p>
    <div class="row between"><span>New target</span><b class="num">${cur ? `<span class="muted" style="text-decoration:line-through;font-weight:500">${fmtNum(cur.kcal)}</span> → ` : ''}${fmtNum(next.kcal)} kcal</b></div>
    <div class="row"><button class="btn primary grow" data-act="checkin-accept">Update my targets</button><button class="btn" data-act="checkin-skip">Keep current</button></div>
  </section>`;
}
function learningNote() {
  if (S.profile.adaptive) return '';
  const est = estimateBurn();
  if (est.ready) return '';
  const p = est.progress;
  return `<p class="small muted" style="margin:0">${est.implausible
    ? 'Your logged food and weight don’t add up yet (likely some days weren’t fully logged). Mark those days, and the estimate will settle.'
    : `Learning your real burn: ${Math.min(p.foodDays, p.needFood)} of ${p.needFood} fully logged days, ${Math.min(p.weighIns, p.needWeighIns)} of ${p.needWeighIns} weigh-ins (last 3 weeks).`}</p>`;
}

/* ---------- Progress: nutrition, last 4 weeks ---------- */
function viewNutritionProgress() {
  const end = startOfDay(Date.now()), start = end - 27 * DAY;
  const days = []; for (let d = start; d <= end; d += DAY) { const day = startOfDay(d + 12 * 3600000); days.push({day, ...dayTotals(day), partial: isIncompleteDay(day)}); }
  const logged = days.filter(d => d.kcal >= ADAPT.partialDayKcal && !d.partial);
  if (!logged.length) return `<section class="card"><h3>Nutrition</h3><p class="small muted" style="margin:0">Log food on the Food tab and your averages, protein streak and calories against your weight trend show up here.</p></section>`;
  const tg = targets(), avg = k => logged.reduce((s, d) => s + d[k], 0) / logged.length;
  const proteinHits = tg ? logged.filter(d => d.p >= tg.p * 0.9).length : null;
  const est = estimateBurn(), a = S.profile.adaptive;
  return `<section class="card"><div class="stack" style="gap:2px"><h3>Nutrition, last 4 weeks</h3><span class="small muted">${logged.length} fully logged day${logged.length === 1 ? '' : 's'}</span></div>
    <div class="stats"><div class="stat"><b class="num">${fmtNum(avg('kcal'))}</b><span>Avg kcal/day</span></div>
      <div class="stat"><b class="num">${Math.round(avg('p'))} g</b><span>Avg protein</span></div>
      <div class="stat"><b class="num">${proteinHits == null ? '—' : `${proteinHits}/${logged.length}`}</b><span>Protein days hit</span></div></div>
    ${intakeChart(days, tg)}
    <div class="legend small muted"><span><i class="lean-sw" style="background:var(--accent)"></i>kcal eaten</span><span><i style="border-top:2px dashed var(--muted);height:0;width:14px"></i>Target</span><span><i style="background:var(--good);height:3px"></i>Weight trend</span></div>
    <p class="small muted" style="margin:0">${est.ready ? `Real burn from your data: <b>${fmtNum(est.burn)} kcal/day</b>${a ? ` (in use since ${fmtDate(a.at)})` : ''}.` : learningNote().replace(/<\/?p[^>]*>/g, '')}</p>
  </section>`;
}
function intakeChart(days, tg) {
  const W = 320, H = 150, L = 34, R = 34, T = 10, B = 20;
  const maxK = Math.max(tg ? tg.kcal * 1.15 : 0, ...days.map(d => d.kcal), 1000);
  const bw = (W - L - R) / days.length, yK = v => T + (1 - v / maxK) * (H - T - B);
  const bars = days.map((d, i) => d.kcal ? `<rect x="${(L + i * bw + 1).toFixed(1)}" y="${yK(d.kcal).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - B - yK(d.kcal)).toFixed(1)}" rx="1.5" fill="var(--accent)" opacity="${d.partial || d.kcal < ADAPT.partialDayKcal ? .3 : .85}"/>` : '').join('');
  const tline = tg ? `<line x1="${L}" x2="${W - R}" y1="${yK(tg.kcal)}" y2="${yK(tg.kcal)}" stroke="var(--muted)" stroke-dasharray="4 3"/>` : '';
  // weight trend on its own right-hand scale
  const pts = weightSeries().filter(p => p.t >= days[0].day && p.t <= days[days.length - 1].day + DAY);
  let wline = '', wlab = '';
  if (pts.length > 1) {
    const vals = pts.map(p => fromKg(p.trend)); let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1) { lo -= .5; hi += .5; }
    const yW = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B), xT = t => L + (t - days[0].day) / (days.length * DAY) * (W - L - R);
    wline = `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${xT(p.t).toFixed(1)},${yW(fromKg(p.trend)).toFixed(1)}`).join('')}" fill="none" stroke="var(--good)" stroke-width="2.5" stroke-linejoin="round"/>`;
    wlab = `<text x="${W - R + 4}" y="${yW(hi) + 4}">${f1(hi)}</text><text x="${W - R + 4}" y="${yW(lo)}">${f1(lo)}</text>`;
  }
  const dl = t => new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily calories and weight trend, last 4 weeks">
    <text x="${L - 4}" y="${yK(maxK) + 8}" text-anchor="end">${fmtNum(Math.round(maxK / 100) * 100)}</text><text x="${L - 4}" y="${H - B}" text-anchor="end">0</text>
    ${bars}${tline}${wline}${wlab}
    <text x="${L}" y="${H - 5}">${dl(days[0].day)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${dl(days[days.length - 1].day)}</text></svg></div>`;
}

/* ---------- quick wins: copy yesterday's meal, saved meals ---------- */
function copyMeal(fromDay, meal, toDay) {
  const items = foodLogs(fromDay).filter(x => x.meal === meal).sort((a, b) => a.date - b.date);
  const base = toDay === startOfDay(Date.now()) ? Date.now() : toDay + 12 * 3600000;
  for (const [i, x] of items.entries()) {
    const e = {...JSON.parse(JSON.stringify(x)), id: newId(), date: base + i};   // +i ms keeps the original order
    delete e.updatedAt; S.food.push(e); store.saveFood(e);
  }
  return items.length;
}
function saveMealAs(day, meal, name) {
  const items = foodLogs(day).filter(x => x.meal === meal).sort((a, b) => a.date - b.date).map(x => ({food: x.food, qty: x.qty, unit: x.unit, qtyLabel: x.qtyLabel, grams: x.grams, totals: x.totals}));
  const m = {id: newId(), kind: 'meal', date: Date.now(), name, items};
  S.food.push(m); store.saveFood(m); return m;
}
function logSavedMeal(m, meal, day) {
  const base = day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600000;
  for (const [i, it] of m.items.entries()) {
    const e = {id: newId(), kind: 'log', date: base + i, meal, ...JSON.parse(JSON.stringify(it))};
    S.food.push(e); store.saveFood(e);
  }
}
const mealKcal = m => m.items.reduce((s, x) => s + (x.totals.kcal || 0), 0);
