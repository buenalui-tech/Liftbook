// Liftbook — Weigh-ins, body scans and the 2D composition avatar.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- body: weigh-ins, scans and the composition avatar ---------- */
// InBody reports five segments; this is the order its result sheet lists them.
const SEGS = [{k: 'ra', name: 'Right arm'}, {k: 'la', name: 'Left arm'}, {k: 'tr', name: 'Trunk'}, {k: 'rl', name: 'Right leg'}, {k: 'll', name: 'Left leg'}];
// Reference segment masses (kg) for a typical trained adult; the avatar's base proportions are drawn at these.
const REF = {lean: {ra: 3.3, la: 3.3, tr: 26, rl: 9.2, ll: 9.2}, fat: {ra: 1.0, la: 1.0, tr: 9, rl: 2.8, ll: 2.8}};
// Typical share of fat-free mass and fat mass per segment, used only when a scan has totals but no segments.
const SEG_SHARE = {lean: {ra: .055, la: .055, tr: .45, rl: .165, ll: .165}, fat: {ra: .06, la: .06, tr: .5, rl: .15, ll: .15}};
const KG = 0.453592;
const toKg = (v, u) => v == null || v === '' || isNaN(v) ? null : (u === 'kg' ? +v : v * KG);
const fromKg = kg => kg == null ? null : (unit() === 'kg' ? kg : kg / KG);
const f1 = n => n == null || isNaN(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1);
const scans = () => S.body.filter(e => e.kind === 'scan').sort((a, b) => a.date - b.date);
const localISO = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

function weightSeries() {
  // one reading per day: a weigh-in beats a scan's weight on the same day
  const byDay = new Map();
  for (const e of S.body) {
    const w = e.kind === 'weight' ? e.w : e.weight; if (!(w > 0)) continue;
    const d = startOfDay(e.date), prev = byDay.get(d);
    if (!prev || (e.kind === 'weight' && prev.kind !== 'weight') || (e.kind === prev.kind && e.date > prev.date))
      byDay.set(d, {t: d, kg: toKg(w, e.unit), kind: e.kind, id: e.id});
  }
  const pts = [...byDay.values()].sort((a, b) => a.t - b.t);
  // trend = average of the readings in the 7 days up to each point, which smooths out water and salt swings
  pts.forEach((p, i) => { let s = 0, n = 0; for (let j = i; j >= 0 && p.t - pts[j].t < 7 * DAY; j--) { s += pts[j].kg; n++; } p.trend = s / n; });
  return pts;
}
function weeklyRateKg(pts) {
  if (pts.length < 3) return null;
  const last = pts[pts.length - 1], span = pts.filter(p => last.t - p.t <= 14 * DAY);
  if (span.length < 3 || last.t - span[0].t < 5 * DAY) return null;
  // least-squares slope of the trend over the last two weeks
  const n = span.length, mx = span.reduce((s, p) => s + p.t, 0) / n, my = span.reduce((s, p) => s + p.trend, 0) / n;
  let num = 0, den = 0; for (const p of span) { num += (p.t - mx) * (p.trend - my); den += (p.t - mx) ** 2; }
  return den ? num / den * 7 * DAY : null;
}
function goalStatus(rate) {
  const g = S.profile.goal || {type: 'maintain', rate: 0};
  if (rate == null) return null;
  const target = g.type === 'cut' ? -Math.abs(g.rate) : g.type === 'bulk' ? Math.abs(g.rate) : 0;
  const tol = Math.max(Math.abs(target) * 0.3, unit() === 'kg' ? 0.1 : 0.25);
  if (Math.abs(rate - target) <= tol) return {tone: 'up', text: 'On pace'};
  if (g.type === 'maintain') return {tone: 'hold', text: rate > 0 ? 'Gaining' : 'Losing'};
  const fast = g.type === 'cut' ? rate < target : rate > target;
  return {tone: fast ? 'new' : 'hold', text: fast ? 'Faster than planned' : 'Slower than planned'};
}

/* scan → kilograms, with segments filled in (estimated from totals if the sheet had none) */
function scanKg(s) {
  const k = v => toKg(v, s.unit);
  const weight = k(s.weight);
  const bfm = s.bfm != null && s.bfm !== '' ? k(s.bfm) : (s.pbf != null && weight ? weight * s.pbf / 100 : null);
  const ffm = weight != null && bfm != null ? weight - bfm : null;
  const seg = {}; let est = false;
  for (const {k: key} of SEGS) {
    const src = (s.seg && s.seg[key]) || {};
    let lean = k(src.lean), fat = k(src.fat);
    if (lean == null) { lean = ffm != null ? ffm * SEG_SHARE.lean[key] : REF.lean[key]; est = true; }
    if (fat == null) { fat = bfm != null ? bfm * SEG_SHARE.fat[key] : REF.fat[key]; est = true; }
    seg[key] = {lean, fat};
  }
  return {date: s.date, weight, bfm, pbf: s.pbf != null && s.pbf !== '' ? +s.pbf : (weight && bfm != null ? bfm / weight * 100 : null),
    smm: k(s.smm), visceral: s.visceral != null && s.visceral !== '' ? +s.visceral : null, bmr: s.bmr != null && s.bmr !== '' ? +s.bmr : null, seg, est};
}
function lerpScan(a, b, t) {
  const L = (x, y) => x == null || y == null ? (t < .5 ? x : y) : x + (y - x) * t;
  const seg = {}; for (const {k} of SEGS) seg[k] = {lean: L(a.seg[k].lean, b.seg[k].lean), fat: L(a.seg[k].fat, b.seg[k].fat)};
  return {date: t < .5 ? a.date : b.date, weight: L(a.weight, b.weight), bfm: L(a.bfm, b.bfm), pbf: L(a.pbf, b.pbf), smm: L(a.smm, b.smm), visceral: L(a.visceral, b.visceral), bmr: L(a.bmr, b.bmr), seg, est: t < .5 ? a.est : b.est};
}

/* ---------- avatar geometry ----------
   Each segment is two layers. Cross-section area tracks volume, so width scales with the square root of
   volume: inner (lean) = lean/1.06, outer adds fat/0.90 (muscle and fat densities, g/cm³). */
function segScale(sc, key) {
  const r = REF.lean[key] / 1.06, iv = sc.seg[key].lean / 1.06, ov = iv + sc.seg[key].fat / 0.9;
  const c = x => Math.max(0.5, Math.min(1.8, x));
  return {i: c(Math.sqrt(iv / r)), o: c(Math.sqrt(ov / r))};
}
function smoothClosed(P) {
  // closed Catmull-Rom spline through the outline points
  const n = P.length, q = v => v.toFixed(1);
  let d = `M${q(P[0][0])},${q(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    d += `C${q(p1[0] + (p2[0] - p0[0]) / 6)},${q(p1[1] + (p2[1] - p0[1]) / 6)} ${q(p2[0] - (p3[0] - p1[0]) / 6)},${q(p2[1] - (p3[1] - p1[1]) / 6)} ${q(p2[0])},${q(p2[1])}`;
  }
  return d + 'Z';
}
const tube = pts => smoothClosed([...pts.map(p => [p.x - p.h, p.y]), ...pts.map(p => [p.x + p.h, p.y]).reverse()]);
function layer(spine, sc, which) {
  // spine: [x, y, base half-width, fat weight]; which = 'i' (lean) or 'o' (lean + fat)
  return spine.map(([x, y, b, fw]) => ({x, y, h: which === 'i' ? b * sc.i : b * sc.i + b * (sc.o - sc.i) * fw}));
}
function avatarGeometry(sc) {
  // front-facing mannequin in a 240×400 box; spines are [x, y, base half-width, share of the fat layer]
  const cx = 120, t = segScale(sc, 'tr');
  const torsoSpine = [[cx, 66, 17, .2], [cx, 76, 40, .35], [cx, 90, 43, .45], [cx, 110, 38, .8], [cx, 138, 32, 1.3], [cx, 160, 30, 1.7], [cx, 184, 33, 1.4], [cx, 204, 32, .9], [cx, 214, 24, .5]];
  const torsoO = layer(torsoSpine, t, 'o');
  const out = {tr: {i: tube(layer(torsoSpine, t, 'i')), o: tube(torsoO)}};
  const shoulder = torsoO[2].h;
  for (const [key, s] of [['ra', -1], ['la', 1]]) {
    // the figure faces you, like the InBody sheet: its right side is on your left
    const a = segScale(sc, key), x0 = cx + s * (shoulder - 3);
    const sp = [[84, 12.5, 1], [116, 11.5, 1.2], [148, 8.5, .6], [166, 9.5, .8], [210, 6, .3]]
      .map(([y, b, fw]) => [x0 + s * ((y - 84) * 0.15 + b * a.o * 0.6), y, b, fw]);
    out[key] = {i: tube(layer(sp, a, 'i')), o: tube(layer(sp, a, 'o')), hand: [sp[4][0] + s * 1.5, 222]};
  }
  const hip = torsoO[6].h;
  for (const [key, s] of [['rl', -1], ['ll', 1]]) {
    const l = segScale(sc, key), x0 = cx + s * (hip * 0.5 + 1.5);
    const sp = [[196, 21, 1.25], [238, 19, 1.2], [280, 12, .55], [306, 13.5, .8], [360, 7, .3]]
      .map(([y, b, fw]) => [x0 + s * (y - 196) * 0.02, y, b, fw]);
    out[key] = {i: tube(layer(sp, l, 'i')), o: tube(layer(sp, l, 'o')), foot: [sp[4][0] + s * 5, 369]};
  }
  return out;
}
function avatarSVG(sc, ghost, sel, example) {
  const g = avatarGeometry(sc), gh = ghost ? avatarGeometry(ghost) : null;
  const seg = k => `<g class="seg ${sel === k ? 'sel' : ''}" data-act="seg" data-v="${k}" role="button" aria-label="${SEGS.find(s => s.k === k).name}">
      <path class="fat" d="${g[k].o}"/><path class="lean" d="${g[k].i}"/></g>`;
  const ghostPaths = gh ? ['rl', 'll', 'tr', 'ra', 'la'].map(k => `<path class="ghost" d="${gh[k].o}"/>`).join('') : '';
  return `<svg viewBox="0 0 240 392" role="img" aria-label="${example ? 'Example body composition avatar' : 'Body composition avatar'}" class="${example ? 'example' : ''}">
    ${['rl', 'll'].map(k => `<ellipse class="skin" cx="${g[k].foot[0].toFixed(1)}" cy="${g[k].foot[1]}" rx="12" ry="5"/>`).join('')}
    ${seg('rl')}${seg('ll')}
    <rect class="skin" x="112" y="48" width="16" height="24" rx="6"/>
    ${seg('tr')}
    ${['ra', 'la'].map(k => `<ellipse class="skin" cx="${g[k].hand[0].toFixed(1)}" cy="${g[k].hand[1]}" rx="6.5" ry="9"/>`).join('')}
    ${seg('ra')}${seg('la')}
    <ellipse class="skin" cx="120" cy="30" rx="16.5" ry="20"/>
    ${ghostPaths}
    <text x="6" y="388">R</text><text x="234" y="388" text-anchor="end">L</text>
  </svg>`;
}

/* ---------- body tab ---------- */
function viewBody() {
  return `${brand('Body')}${storageBanner()}${viewWeightCard()}${viewAvatarCard()}${viewScanList()}
    ${Sync.missing.body_entries ? `<div class="banner">Weigh-ins and scans are saved on this phone but aren’t syncing yet. Run <b>supabase/002_body_entries.sql</b> in the Supabase SQL Editor to turn on syncing.</div>` : ''}`;
}
function viewWeightCard() {
  const pts = weightSeries(), u = unit(), last = pts[pts.length - 1], rate = weeklyRateKg(pts);
  const rateU = rate == null ? null : fromKg(rate), st = goalStatus(rateU);
  const g = S.profile.goal || {type: 'maintain', rate: u === 'kg' ? 0.25 : 0.5};
  const todayEntry = S.body.find(e => e.kind === 'weight' && startOfDay(e.date) === startOfDay(Date.now()));
  const range = S.wtRange || 90, from = range === 'all' ? 0 : startOfDay(Date.now()) - range * DAY;
  const shown = pts.filter(p => p.t >= from);
  const recent = S.body.filter(e => e.kind === 'weight').sort((a, b) => b.date - a.date).slice(0, S.wtAll ? 60 : 5);
  return `<section class="card">
    <div class="row between"><h3>Weight</h3>${st ? `<span class="chip ${st.tone}">${st.text}</span>` : ''}</div>
    ${last ? `<div class="wt-hero"><div><b class="num big">${f1(fromKg(last.trend))}</b> <span>${u}</span></div>
        <div class="small muted num">7-day trend${rateU != null ? ` · <b style="color:var(--ink)">${rateU > 0 ? '+' : rateU < 0 ? '−' : ''}${f1(Math.abs(rateU))} ${u}/week</b>` : ' · rate shows after a week of weigh-ins'}<br>Last weigh-in ${f1(fromKg(last.kg))} ${u}, ${fmtDate(last.t)}</div></div>
      ${weightChart(shown)}
      <div class="seg" role="group" aria-label="Chart range">${[[30, '30 days'], [90, '90 days'], ['all', 'All']].map(([v, l]) => `<button data-act="wt-range" data-v="${v}" aria-pressed="${String(range) === String(v)}">${l}</button>`).join('')}</div>`
    : `<p class="muted small">Weigh in first thing in the morning, after the bathroom and before eating. Daily readings swing with water and salt, so Liftbook tracks a 7-day trend.</p>`}
    <form id="wt-form" class="wt-form">
      <label class="field grow">${todayEntry ? 'Update weight' : 'Weight'} (${u})<input id="wt-in" inputmode="decimal" placeholder="${last ? f1(fromKg(last.kg)) : ''}" autocomplete="off" required></label>
      <label class="field">Date<input id="wt-date" type="date" value="${localISO(Date.now())}" max="${localISO(Date.now())}"></label>
      <button class="btn primary" type="submit">Log</button>
    </form>
    <div class="goal">
      <div class="seg" role="group" aria-label="Goal">${[['cut', 'Cut'], ['maintain', 'Maintain'], ['bulk', 'Bulk']].map(([v, l]) => `<button data-act="goal" data-v="${v}" aria-pressed="${g.type === v}">${l}</button>`).join('')}</div>
      ${g.type !== 'maintain' ? `<label class="small muted row" style="gap:6px">Target <input id="goal-rate" data-in="goal-rate" inputmode="decimal" value="${g.rate}" class="mini"> ${u}/week</label>` : ''}
    </div>
    ${recent.length ? `<details ${S.wtOpen ? 'open' : ''} id="wt-details"><summary class="small muted">Weigh-in history</summary>
      <table class="dtable num"><tbody>${recent.map(e => `<tr><td class="muted">${fmtDate(e.date)}</td><td>${f1(conv(e.w, e.unit))} ${u}</td>
        <td style="width:44px"><button class="iconbtn" data-act="wt-del" data-v="${esc(e.id)}" aria-label="Delete weigh-in" style="${S.armed === 'wtdel' + e.id ? 'color:var(--pr)' : ''}">${S.armed === 'wtdel' + e.id ? '✓?' : '✕'}</button></td></tr>`).join('')}</tbody></table>
      ${!S.wtAll && S.body.filter(e => e.kind === 'weight').length > 5 ? `<button class="btn ghost" data-act="wt-all">Show more</button>` : ''}</details>` : ''}
  </section>`;
}
// gridlines at clean steps (0.1, 0.2, 0.5, 1, 2, 5…) so a line labelled 197.5 sits exactly at 197.5
function niceTicks(lo, hi, want = 5) {
  const raw = (hi - lo) / want, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return {ticks: out, digits: step < 1 ? Math.max(1, -Math.floor(Math.log10(step) + 1e-9)) : 0};
}
function weightChart(pts) {
  if (!pts.length) return '';
  const W = 320, H = 170, L = 40, R = 10, T = 10, B = 22, u = unit();
  const vals = pts.flatMap(p => [fromKg(p.kg), fromKg(p.trend)]);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1) { const c = (lo + hi) / 2; lo = c - 0.5; hi = c + 0.5; }
  const pd = (hi - lo) * .1; lo -= pd; hi += pd;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(DAY, t1 - t0);
  const x = t => pts.length === 1 ? (L + W - R) / 2 : L + (t - t0) / span * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const {ticks, digits} = niceTicks(lo, hi);
  const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)"/><text x="${L - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v.toFixed(digits)}</text>`).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(fromKg(p.trend)).toFixed(1)}`).join('');
  const dl = t => new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  const lastP = pts[pts.length - 1], sel = pts.find(p => p.t === S.wtSel) || null;
  // remembered for tap-to-read (see the 'wt-chart' handler)
  S.wtChart = {pts, x0: L, x1: W - R, W, t0, span};
  return `<div class="chart wt-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend in ${u}. Tap to read a day." data-act="wt-chart">${grid}
    ${sel ? `<line x1="${x(sel.t)}" x2="${x(sel.t)}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/>` : ''}
    ${pts.map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(fromKg(p.kg)).toFixed(1)}" r="${p === sel ? 4 : 2.5}" fill="${p.kind === 'scan' ? 'var(--plate-yellow)' : 'var(--muted)'}" opacity="${p === sel ? 1 : .7}"/>`).join('')}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x((sel || lastP).t).toFixed(1)}" cy="${y(fromKg((sel || lastP).trend)).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>
    <text x="${L}" y="${H - 6}">${dl(t0)}</text>${pts.length > 1 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end">${dl(t1)}</text>` : ''}</svg>
    <p class="small num wt-read" style="margin:4px 0 0">${sel
      ? `<b>${fmtDate(sel.t)}</b> · weighed <b>${f1(fromKg(sel.kg))} ${u}</b>${sel.kind === 'scan' ? ' (scan)' : ''} · trend <b style="color:var(--accent)">${f1(fromKg(sel.trend))} ${u}</b>`
      : '<span class="muted">Tap the chart to read any day’s weigh-in and trend.</span>'}</p></div>`;
}

function currentScanIndex(list) {
  if (S.scanIdx == null || S.scanIdx >= list.length) S.scanIdx = list.length - 1;
  return S.scanIdx;
}
function compareScan(list, idx) {
  const mode = S.scanCompare || 'prev';
  if (mode === 'off' || list.length < 2) return null;
  if (mode === 'first') return idx === 0 ? null : list[0];
  return idx === 0 ? null : list[idx - 1];
}
function viewAvatarCard() {
  const list = scans();
  if (!list.length) {
    return `<section class="card"><div class="row between"><h3>Body composition</h3><button class="btn primary" data-act="scan-open">+ Add scan</button></div>
      <div class="avatar-wrap"><div class="avatar"><div class="fig-host body-host" data-mode="body"></div><span class="ex-tag">Example</span></div>
        <div class="stack small muted"><p style="margin:0">Add an InBody (or similar) scan and this figure is rebuilt from your numbers: each arm, leg and your trunk sized by its muscle, with body fat as the outer layer.</p>
        <div class="legend"><span><i class="lean-sw"></i>Lean mass</span><span><i class="fat-sw"></i>Fat</span></div></div></div></section>`;
  }
  const idx = currentScanIndex(list), cur = list[idx], cmp = compareScan(list, idx);
  return `<section class="card" id="avatar-card">
    <div class="row between"><h3>Body composition</h3><button class="btn" data-act="scan-open">+ Add scan</button></div>
    <div class="avatar-wrap">
      <div class="avatar" id="avatar-svg"><div class="fig-host body-host" data-mode="body"></div></div>
      <div class="stack" id="avatar-stats" style="gap:10px">${avatarStats(scanKg(cur), cmp ? scanKg(cmp) : null)}</div>
    </div>
    ${list.length > 1 ? `<div class="stack" style="gap:4px">
      <div class="row between small"><span class="muted">Scan</span><b id="scan-date">${fmtDate(cur.date)}</b></div>
      <input type="range" id="scan-slider" data-in="scan-idx" min="0" max="${list.length - 1}" step="1" value="${idx}" aria-label="Choose scan">
      <div class="row between small muted"><span>${fmtDate(list[0].date)}</span><span>${fmtDate(list[list.length - 1].date)}</span></div></div>
      <div class="row between"><span class="small muted">Outline shows</span><div class="seg" role="group" aria-label="Compare with">${[['prev', 'Previous scan'], ['first', 'First scan'], ['off', 'Off']].map(([v, l]) => `<button data-act="scan-compare" data-v="${v}" aria-pressed="${(S.scanCompare || 'prev') === v}">${l}</button>`).join('')}</div></div>` : ''}
    <div id="seg-table">${segTable(scanKg(cur), cmp ? scanKg(cmp) : null)}</div>
    <div class="legend small muted"><span><i class="lean-sw"></i>Lean mass</span><span><i class="fat-sw"></i>Fat</span>${cmp ? '<span><i class="ghost-sw"></i>Earlier scan</span>' : ''}</div>
    <p class="small muted" style="margin:0">Drag to turn the figure. Tap a region, or a row, to highlight it.</p>
  </section>`;
}
function delta(v, base, goodUp, digits = 1) {
  if (v == null || base == null) return '';
  const d = v - base; if (Math.abs(d) < (digits ? 0.05 : 0.5)) return '<span class="d">±0</span>';
  const good = goodUp == null ? null : (d > 0) === goodUp;
  return `<span class="d ${good == null ? '' : good ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}</span>`;
}
function avatarStats(sc, cmp) {
  const u = unit(), m = v => fromKg(v);
  const row = (label, v, base, unitLabel, goodUp) => v == null ? '' :
    `<div class="stat-line"><span class="small muted">${label}</span><span class="num"><b>${f1(v)}</b>${unitLabel ? ` <small>${unitLabel}</small>` : ''} ${delta(v, base, goodUp)}</span></div>`;
  const extra = [sc.visceral != null ? `Visceral fat level <b>${Math.round(sc.visceral)}</b> ${delta(sc.visceral, cmp && cmp.visceral, false, 0)}` : '',
    sc.bmr != null ? `BMR <b>${fmtNum(sc.bmr)}</b> kcal` : ''].filter(Boolean);
  return `${row('Weight', m(sc.weight), cmp && m(cmp.weight), u, null)}
    ${row('Body fat', sc.pbf, cmp && cmp.pbf, '%', false)}
    ${row('Skeletal muscle', m(sc.smm), cmp && m(cmp.smm), u, true)}
    ${row('Fat mass', m(sc.bfm), cmp && m(cmp.bfm), u, false)}
    ${extra.length ? `<p class="small muted num" style="margin:0">${extra.join('<br>')}</p>` : ''}
    ${sc.est ? '<p class="small muted" style="margin:0">Some segments are estimated from your totals. Add segment numbers for an exact figure.</p>' : ''}`;
}
function segTable(sc, cmp) {
  const u = unit();
  return `<table class="segtable num"><thead><tr><th></th><th>Lean (${u})</th><th>Fat (${u})</th></tr></thead><tbody>
    ${SEGS.map(({k, name}) => `<tr class="${S.bodySeg === k ? 'sel' : ''}" data-act="seg" data-v="${k}"><td>${name}</td>
      <td>${f1(fromKg(sc.seg[k].lean))} ${delta(fromKg(sc.seg[k].lean), cmp && fromKg(cmp.seg[k].lean), true)}</td>
      <td>${f1(fromKg(sc.seg[k].fat))} ${delta(fromKg(sc.seg[k].fat), cmp && fromKg(cmp.seg[k].fat), false)}</td></tr>`).join('')}
  </tbody></table>`;
}
function viewScanList() {
  const list = scans().slice().reverse(); if (!list.length) return '';
  return `<section class="section"><p class="eyebrow">Scan history</p><div class="hist">${list.map(s => { const k = scanKg(s); return `
    <button class="hitem" data-act="scan-open" data-v="${esc(s.id)}"><div class="row between" style="width:100%"><h3>${fmtDate(s.date)}</h3><span class="small muted">Edit</span></div>
      <div class="kv num"><span><b>${f1(fromKg(k.weight))}</b> ${unit()}</span>${k.pbf != null ? `<span><b>${f1(k.pbf)}</b>% fat</span>` : ''}${k.smm != null ? `<span><b>${f1(fromKg(k.smm))}</b> ${unit()} muscle</span>` : ''}</div></button>`; }).join('')}</div></section>`;
}

/* live avatar updates while dragging the scan slider (no full re-render, so the drag isn't interrupted) */
let tweenRaf = null, shownScan = null;
const exampleScan = () => scanKg({unit: 'kg', weight: 80, bfm: 14, seg: Object.fromEntries(SEGS.map(({k}) => [k, {lean: REF.lean[k], fat: REF.fat[k]}]))});
function paintAvatar(sc, cmp) {
  const a = document.getElementById('avatar-svg'); if (!a) return;
  if (Fig.mode === 'body' && Fig.host && a.contains(Fig.host)) Fig.setBody(sc, cmp, S.bodySeg);
  else a.innerHTML = avatarSVG(sc, cmp, S.bodySeg);
  document.getElementById('avatar-stats').innerHTML = avatarStats(sc, cmp);
  document.getElementById('seg-table').innerHTML = segTable(sc, cmp);
}
function showScan(idx) {
  const list = scans(); if (!list[idx]) return;
  S.scanIdx = idx;
  const target = scanKg(list[idx]), cmpS = compareScan(list, idx), cmp = cmpS ? scanKg(cmpS) : null;
  const dateEl = document.getElementById('scan-date'); if (dateEl) dateEl.textContent = fmtDate(list[idx].date);
  const from = shownScan || target;
  cancelAnimationFrame(tweenRaf);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { shownScan = target; paintAvatar(target, cmp); return; }
  const t0 = performance.now();
  const run = showScan.run = {};   // a newer slider move or the landing timer retires this animation
  const step = now => {
    if (showScan.run !== run) return;
    const t = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - t, 3);
    shownScan = lerpScan(from, target, e); paintAvatar(shownScan, cmp);
    if (t < 1) tweenRaf = requestAnimationFrame(step); else showScan.run = null;
  };
  tweenRaf = requestAnimationFrame(step);
  // frames can be paused or slow (backgrounded tab, low-power mode): always land on the chosen scan
  clearTimeout(showScan.done);
  showScan.done = setTimeout(() => { if (showScan.run === run) { showScan.run = null; cancelAnimationFrame(tweenRaf); shownScan = target; paintAvatar(target, cmp); } }, 420);
}

/* scan entry sheet */
function viewScanSheet() {
  const s = S.sheet.id ? S.body.find(e => e.id === S.sheet.id) : null;
  const u = s ? s.unit : unit(), v = x => x == null ? '' : esc(String(x));
  const segRow = ({k, name}) => `<tr><td>${name}</td>
    <td><input id="sc-${k}-lean" inputmode="decimal" value="${v(s && s.seg && s.seg[k] && s.seg[k].lean)}" aria-label="${name} lean mass"></td>
    <td><input id="sc-${k}-fat" inputmode="decimal" value="${v(s && s.seg && s.seg[k] && s.seg[k].fat)}" aria-label="${name} fat mass"></td></tr>`;
  return `<div class="row between"><h2>${s ? 'Edit scan' : 'Add a body scan'}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <form id="scan-form" class="stack" style="gap:14px">
      <div class="row" style="flex-wrap:wrap">
        <label class="field grow">Scan date<input id="sc-date" type="date" value="${localISO(s ? s.date : Date.now())}" max="${localISO(Date.now())}"></label>
        <label class="field">Units<select id="sc-unit"><option ${u === 'lb' ? 'selected' : ''}>lb</option><option ${u === 'kg' ? 'selected' : ''}>kg</option></select></label>
      </div>
      <div class="stack" style="gap:4px"><p class="eyebrow" style="margin:0">Muscle-Fat Analysis</p><p class="small muted" style="margin:0">Fields follow the order of the InBody result sheet.</p></div>
      <div class="scan-grid">
        <label class="field">Weight<input id="sc-weight" inputmode="decimal" value="${v(s && s.weight)}" required></label>
        <label class="field">SMM (skeletal muscle)<input id="sc-smm" inputmode="decimal" value="${v(s && s.smm)}"></label>
        <label class="field">Body Fat Mass<input id="sc-bfm" inputmode="decimal" value="${v(s && s.bfm)}"></label>
        <label class="field">PBF (% body fat)<input id="sc-pbf" inputmode="decimal" value="${v(s && s.pbf)}"></label>
      </div>
      <div class="stack" style="gap:4px"><p class="eyebrow" style="margin:0">Segmental analysis</p>
        <p class="small muted" style="margin:0"><b>Lean:</b> the top number for each segment under Segmental Lean Analysis (lbs or kg, not the %). <b>Fat:</b> the number in brackets under Segmental Fat Analysis.</p></div>
      <table class="scan-seg"><thead><tr><th></th><th>Lean</th><th>Fat</th></tr></thead><tbody>${SEGS.map(segRow).join('')}</tbody></table>
      <details ${s && (s.lbm != null || s.bmi != null || s.ecw != null || s.bmr != null || s.visceral != null) ? 'open' : ''}><summary class="small muted">More from the sheet (optional)</summary>
        <div class="scan-grid" style="margin-top:10px">
          <label class="field">Visceral Fat Level<input id="sc-visceral" inputmode="decimal" value="${v(s && s.visceral)}"></label>
          <label class="field">Lean Body Mass<input id="sc-lbm" inputmode="decimal" value="${v(s && s.lbm)}"></label>
          <label class="field">BMI<input id="sc-bmi" inputmode="decimal" value="${v(s && s.bmi)}"></label>
          <label class="field">ECW/TBW<input id="sc-ecw" inputmode="decimal" value="${v(s && s.ecw)}"></label>
          <label class="field">Basal Metabolic Rate (kcal)<input id="sc-bmr" inputmode="decimal" value="${v(s && s.bmr)}"></label>
        </div></details>
      ${S.scanMsg ? `<p class="small" style="margin:0;color:var(--pr)">${esc(S.scanMsg)}</p>` : ''}
      <button class="btn primary lg block" type="submit">${s ? 'Save changes' : 'Save scan'}</button>
      ${s ? `<button class="btn danger block ${S.armed === 'scandel' ? 'armed' : ''}" type="button" data-act="scan-del" data-v="${esc(s.id)}">${S.armed === 'scandel' ? 'Tap again to delete' : 'Delete scan'}</button>` : ''}
    </form>`;
}
function saveScanForm() {
  const val = id => { const el = document.getElementById(id); const t = el ? el.value.trim().replace(',', '.') : ''; return t === '' ? null : parseFloat(t); };
  const weight = val('sc-weight');
  if (!(weight > 0)) { S.scanMsg = 'Enter the weight from your scan.'; render(); return; }
  const nums = ['sc-pbf', 'sc-smm', 'sc-bfm', 'sc-visceral', 'sc-lbm', 'sc-bmi', 'sc-ecw', 'sc-bmr', ...SEGS.flatMap(({k}) => [`sc-${k}-lean`, `sc-${k}-fat`])];
  if (nums.some(id => { const x = val(id); return x != null && (isNaN(x) || x < 0); })) { S.scanMsg = 'One of the numbers isn’t valid. Use digits only, like 12.4.'; render(); return; }
  const pbf = val('sc-pbf'); if (pbf != null && pbf > 70) { S.scanMsg = 'Percent body fat looks too high. Check that value.'; render(); return; }
  const dateStr = document.getElementById('sc-date').value;
  const existing = S.sheet.id ? S.body.find(e => e.id === S.sheet.id) : null;
  const day = dateStr ? fromISO(dateStr) : startOfDay(Date.now());
  const e = existing || {id: newId(), kind: 'scan'};
  Object.assign(e, {
    date: startOfDay(day) === startOfDay(Date.now()) ? Date.now() : day + 9 * 3600000,
    unit: document.getElementById('sc-unit').value, weight, pbf, smm: val('sc-smm'), bfm: val('sc-bfm'), visceral: val('sc-visceral'), lbm: val('sc-lbm'), bmi: val('sc-bmi'), ecw: val('sc-ecw'), bmr: val('sc-bmr'),
    seg: Object.fromEntries(SEGS.map(({k}) => [k, {lean: val(`sc-${k}-lean`), fat: val(`sc-${k}-fat`)}]))
  });
  if (!existing) S.body.push(e);
  S.body.sort((a, b) => b.date - a.date);
  store.saveBody(e);
  S.sheet = null; S.scanMsg = ''; S.scanIdx = scans().findIndex(x => x.id === e.id); shownScan = null;
  render(); toast(existing ? 'Scan updated' : 'Scan saved');
}
function logWeight() {
  const inp = document.getElementById('wt-in'), w = parseFloat((inp.value || '').replace(',', '.'));
  if (!(w > 0) || w > 1500) { toast('Enter your weight as a number, like 182.4'); inp.focus(); return; }
  const dStr = document.getElementById('wt-date').value, day = dStr ? fromISO(dStr) : startOfDay(Date.now());
  const isToday = day === startOfDay(Date.now());
  // one weigh-in per day: logging again replaces that day's entry
  let e = S.body.find(x => x.kind === 'weight' && startOfDay(x.date) === day);
  if (e) Object.assign(e, {w, unit: unit()});
  else { e = {id: newId(), kind: 'weight', date: isToday ? Date.now() : day + 8 * 3600000, w, unit: unit()}; S.body.push(e); }
  S.body.sort((a, b) => b.date - a.date);
  store.saveBody(e); inp.value = ''; render(); toast(`Logged ${f1(w)} ${unit()}`);
}
