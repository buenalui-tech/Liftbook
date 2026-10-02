// Liftbook — Muscle map and the 3D anatomy figure, including the 3D body-composition avatar.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- muscle map: which muscles each exercise trains ---------- */
const MUSCLE_GROUPS = ['chest', 'frontDelt', 'sideDelt', 'rearDelt', 'biceps', 'triceps', 'forearms', 'traps', 'lats', 'midBack', 'lowBack', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves'];
const MUSCLE_NAMES = {chest: 'Chest', frontDelt: 'Front delts', sideDelt: 'Side delts', rearDelt: 'Rear delts', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', traps: 'Traps', lats: 'Lats', midBack: 'Mid back', lowBack: 'Lower back', abs: 'Abs', obliques: 'Obliques', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves'};
// [main targets, also worked] for each exercise in the program
const EX_MUSCLES = {
  'bench-press-barbell': [['chest'], ['frontDelt', 'triceps']],
  'incline-bench-press-dumbbell': [['chest'], ['frontDelt', 'triceps']],
  'overhead-press-dumbbell': [['frontDelt'], ['sideDelt', 'triceps']],
  'face-pull': [['rearDelt'], ['traps', 'midBack']],
  'lateral-raise-dumbbell': [['sideDelt'], ['traps']],
  'triceps-pushdown': [['triceps'], []],
  'crunch-machine': [['abs'], []],
  'squat-barbell': [['quads', 'glutes'], ['lowBack']],
  'leg-press-machine': [['quads'], ['glutes']],
  'leg-extension-machine': [['quads'], []],
  'seated-leg-curl-machine': [['hamstrings'], []],
  'lunge-dumbbell': [['quads', 'glutes'], ['hamstrings']],
  'standing-calf-raise': [['calves'], []],
  'hanging-knee-raise': [['abs'], ['obliques', 'forearms']],
  'bent-over-row-barbell': [['lats', 'midBack'], ['rearDelt', 'biceps', 'lowBack']],
  'lat-pulldown-cable': [['lats'], ['biceps', 'midBack']],
  'dumbbell-row': [['lats', 'midBack'], ['biceps', 'rearDelt']],
  'bicep-curl-dumbbell': [['biceps'], ['forearms']],
  'hammer-curl-dumbbell': [['biceps'], ['forearms']],
  'decline-crunch': [['abs'], ['obliques']],
  'deadlift-barbell': [['hamstrings', 'glutes', 'lowBack'], ['traps', 'forearms', 'quads', 'lats']],
  'romanian-deadlift-barbell': [['hamstrings'], ['glutes', 'lowBack']],
  'hip-thrust-barbell': [['glutes'], ['hamstrings']],
  'lying-leg-curl-machine': [['hamstrings'], []],
  'hip-abduction-machine': [['glutes'], []],
  'seated-calf-raise': [['calves'], []],
  'plank': [['abs'], ['obliques']]
};
// exercises you add yourself fall back to the muscle you picked for them
const FIELD_MUSCLES = {Chest: [['chest'], ['frontDelt', 'triceps']], Back: [['lats', 'midBack'], ['biceps', 'rearDelt']], Shoulders: [['frontDelt', 'sideDelt'], ['triceps']],
  'Side delts': [['sideDelt'], []], 'Rear delts': [['rearDelt'], ['traps']], Biceps: [['biceps'], ['forearms']], Triceps: [['triceps'], []], Quads: [['quads'], ['glutes']],
  Hamstrings: [['hamstrings'], ['glutes']], Glutes: [['glutes'], ['hamstrings']], Calves: [['calves'], []], Abs: [['abs'], ['obliques']],
  Forearms: [['forearms'], []], Traps: [['traps'], []], 'Lower back': [['lowBack'], ['glutes']]};
const musclesFor = e => e.muscles || EX_MUSCLES[e.exId || e.id] || FIELD_MUSCLES[e.muscle] || [[], []];
function muscleLoad(w) {
  const out = {};
  for (const e of w.exercises) {
    const n = working(e).length; if (!n) continue;
    const [main, also] = musclesFor(e);
    for (const m of main) { const o = out[m] || (out[m] = {score: 0, main: false}); o.score += n; o.main = true; }
    for (const m of also) { const o = out[m] || (out[m] = {score: 0, main: false}); o.score += n * 0.5; }
  }
  return out;
}
const mainMuscles = load => MUSCLE_GROUPS.filter(m => load[m] && load[m].main);
const alsoMuscles = load => MUSCLE_GROUPS.filter(m => load[m] && !load[m].main);

/* ---------- 3D figure (three.js, loaded the first time it's needed) ----------
   figure.glb is built from the Z-Anatomy atlas by tools/anatomy: one mesh per muscle group,
   named like MUSCLE_GROUPS, plus a neutral 'body'. If it can't load, a simple mannequin stands in. */
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const GLTF_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res;
  s.onerror = () => { s.remove(); rej(new Error('The 3D view needs an internet connection the first time.')); };
  document.head.appendChild(s);
});
let threeP = null, modelP = null;
function loadThree() {
  if (!threeP) threeP = (window.THREE ? Promise.resolve() : loadScript(THREE_URL))
    .then(() => window.THREE.GLTFLoader ? null : loadScript(GLTF_URL).catch(() => null))
    .catch(e => { threeP = null; throw e; });
  return threeP;
}
function loadModel() {
  if (!modelP) modelP = loadThree().then(() => new Promise(res => {
    if (!window.THREE.GLTFLoader) return res(null);
    new window.THREE.GLTFLoader().load('figure.glb', g => res(g.scene), undefined, () => res(null));
  }));
  return modelP;
}
const FIG_COLORS = {
  dark: {main: 0xE0525A, also: 0xF29A9E, off: 0x5E6874, skin: 0x7A8490},
  light: {main: 0xD63B45, also: 0xF2A0A5, off: 0xAEB6BF, skin: 0xD3D8DE}
};
const appTheme = () => {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
};
const Fig = {
  r: null, scene: null, cam: null, body: null, mats: {}, skin: null, canvas: null,
  ry: -0.5, rx: 0, drag: null, idle: 0, raf: 0, host: null, load: {},
  async ready() { const model = await loadModel(); this.ensure(model); },
  ensure(model) {
    if (this.r) return;
    const T = window.THREE;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'fig-canvas';
    this.canvas.setAttribute('aria-label', 'Muscles trained, drag to rotate'); this.canvas.setAttribute('role', 'img');
    this.r = new T.WebGLRenderer({canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true});
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new T.Scene();
    this.cam = new T.PerspectiveCamera(28, 0.8, 0.1, 200); this.cam.position.set(0, 9.3, 35); this.cam.lookAt(0, 9.1, 0);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x3a4450, 0.85));
    const d1 = new T.DirectionalLight(0xffffff, 0.75); d1.position.set(6, 14, 12); this.scene.add(d1);
    const d2 = new T.DirectionalLight(0xffffff, 0.35); d2.position.set(-8, 6, -10); this.scene.add(d2);
    this.body = new T.Group(); this.scene.add(this.body);
    if (model) this.useModel(T, model); else this.build(T);
    const c = this.canvas;
    c.addEventListener('pointerdown', e => { this.drag = {x: e.clientX, y: e.clientY, ry: this.ry, rx: this.rx}; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => { if (!this.drag) return; this.ry = this.drag.ry + (e.clientX - this.drag.x) * 0.012; this.rx = Math.max(-0.35, Math.min(0.35, this.drag.rx + (e.clientY - this.drag.y) * 0.006)); });
    const up = e => {
      const d = this.drag; this.drag = null; this.idle = performance.now();
      if (d && e && e.type === 'pointerup' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && this.mode === 'body') this.tap(e);
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  },
  useModel(T, model) {
    this.skin = new T.MeshStandardMaterial({color: 0x7A8490, roughness: 0.75});
    for (const m of MUSCLE_GROUPS) this.mats[m] = new T.MeshStandardMaterial({color: 0x8E97A1, roughness: 0.55, metalness: 0.05});
    this.modelMeshes = [];
    model.traverse(o => { if (o.isMesh) { o.material = this.mats[o.name] || this.skin; this.modelMeshes.push(o); } });
    this.body.add(model);
  },
  build(T) {
    const g = new T.SphereGeometry(1, 40, 28);
    this.skin = new T.MeshStandardMaterial({color: 0x6B7480, roughness: 0.7});
    for (const m of MUSCLE_GROUPS) this.mats[m] = new T.MeshStandardMaterial({color: 0x8E97A1, roughness: 0.55, metalness: 0.05});
    const blob = (mat, sx, sy, sz, x, y, z, rz, rx) => { const o = new T.Mesh(g, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.z = rz || 0; o.rotation.x = rx || 0; this.body.add(o); };
    const pair = (n, sx, sy, sz, x, y, z, rz, rx) => { const m = n ? this.mats[n] : this.skin; blob(m, sx, sy, sz, x, y, z, rz, rx); blob(m, sx, sy, sz, -x, y, z, -(rz || 0), rx); };
    blob(this.skin, 0.95, 1.15, 1, 0, 16.9, 0.05);          // head
    blob(this.skin, 0.55, 0.8, 0.55, 0, 15.4, 0);           // neck
    blob(this.skin, 2.05, 3.1, 1.15, 0, 12.2, 0);           // torso core
    blob(this.skin, 1.85, 1.2, 1.1, 0, 9.25, 0);            // pelvis
    pair('chest', 1.08, 0.72, 0.42, 0.98, 13.35, 0.82, 0.12);
    pair('frontDelt', 0.5, 0.66, 0.45, 2.05, 14.05, 0.42, -0.25);
    pair('sideDelt', 0.42, 0.72, 0.5, 2.38, 13.9, 0, -0.2);
    pair('rearDelt', 0.5, 0.64, 0.45, 2.05, 14.05, -0.44, -0.25);
    pair('traps', 1.05, 0.62, 0.5, 0.72, 14.85, -0.42, 0.35);
    pair('lats', 0.95, 1.9, 0.42, 1.3, 12.1, -0.72, -0.12);
    pair('midBack', 0.75, 0.95, 0.3, 0.55, 13.2, -1.0);
    pair('lowBack', 0.42, 1.25, 0.32, 0.42, 10.7, -1.0);
    pair('obliques', 0.45, 1.25, 0.42, 1.5, 11.0, 0.52, 0.08);
    blob(this.mats.abs, 0.9, 1.7, 0.36, 0, 11.25, 0.98);
    pair('biceps', 0.44, 1.05, 0.46, 2.66, 12.35, 0.24, 0.07);
    pair('triceps', 0.48, 1.18, 0.48, 2.64, 12.45, -0.3, 0.07);
    pair('forearms', 0.4, 1.25, 0.42, 2.95, 9.9, 0.05, 0.05);
    pair(null, 0.34, 0.55, 0.2, 3.05, 8.35, 0.05, 0.05);     // hands
    pair('glutes', 0.95, 0.9, 0.62, 0.66, 9.0, -0.7);
    pair('quads', 0.78, 2.15, 0.7, 0.86, 6.55, 0.22, -0.03);
    pair('hamstrings', 0.68, 1.95, 0.58, 0.86, 6.65, -0.32, -0.03);
    pair(null, 0.42, 0.45, 0.45, 0.92, 4.3, 0);              // knees
    pair('calves', 0.5, 1.35, 0.56, 0.92, 2.55, -0.22);
    pair(null, 0.34, 1.6, 0.34, 0.92, 2.55, 0.18);           // shins
    pair(null, 0.4, 0.22, 0.85, 0.95, 0.35, 0.35);           // feet
  },
  tap(e) {
    const T = window.THREE, rect = this.canvas.getBoundingClientRect();
    const ray = new T.Raycaster(); ray.setFromCamera({x: (e.clientX - rect.left) / rect.width * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1}, this.cam);
    const shells = Object.values(Comp.shells).filter(m => m.visible);
    shells.forEach(m => m.geometry.computeBoundingSphere());   // shapes change with the scan; refresh before picking
    const hit = ray.intersectObjects(shells)[0];
    if (!hit) return;
    const k = hit.object.userData.seg; S.bodySeg = S.bodySeg === k ? null : k;
    this.bodyState.sel = S.bodySeg; Comp.apply(this.bodyState.sc, this.bodyState.ghost, S.bodySeg);
    const t = document.getElementById('seg-table'); if (t) t.innerHTML = segTable(this.bodyState.sc, this.bodyState.ghost);
  },
  // Body tab: every muscle in lean-mass red, with the fat shells from the scan
  setBody(sc, ghost, sel) {
    this.bodyState = {sc, ghost, sel};
    const c = FIG_COLORS[appTheme()];
    for (const m of MUSCLE_GROUPS) this.mats[m].color.setHex(c.main);
    this.skin.color.setHex(c.skin);
    Comp.show(true); Comp.apply(sc, ghost, sel);
  },
  paint(load, theme) {
    const c = FIG_COLORS[theme];
    for (const m of MUSCLE_GROUPS) this.mats[m].color.setHex(!load[m] ? c.off : load[m].main ? c.main : c.also);
    this.skin.color.setHex(c.skin);
  },
  size(w, h) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); },
  // after each redraw, move the one canvas into the figure slot on screen (if any)
  attach() {
    const hosts = document.querySelectorAll('.fig-host'), host = hosts[hosts.length - 1];
    if (!host) { this.stop(); return; }
    if (host.dataset.mode === 'body') return this.attachBody(host);
    const w = S.workouts.find(x => x.id === host.dataset.w); if (!w) return;
    this.ready().then(() => {
      if (!host.isConnected) return;
      this.mode = 'workout'; Comp.reset();
      this.host = host; this.load = muscleLoad(w);
      host.innerHTML = ''; host.appendChild(this.canvas);
      this.size(host.clientWidth || 300, host.clientHeight || 300); this.paint(this.load, appTheme());
      if (!this.raf) this.loop();
    }).catch(e => { host.innerHTML = `<p class="small muted" style="margin:auto;text-align:center">${esc(e.message)}</p>`; });
  },
  attachBody(host) {
    const list = scans(), example = !list.length;
    const cur = example ? exampleScan() : scanKg(list[currentScanIndex(list)]);
    const cmpS = example ? null : compareScan(list, S.scanIdx), cmp = cmpS ? scanKg(cmpS) : null;
    // the 2D avatar stays as the fallback when 3D can't load (offline on first use, or no model)
    const fallback = () => { if (host.isConnected) host.parentElement.innerHTML = avatarSVG(cur, cmp, S.bodySeg, example) + (example ? '<span class="ex-tag">Example</span>' : ''); };
    this.ready().then(() => {
      if (!host.isConnected) return;
      if (!Comp.setup(window.THREE, this)) return fallback();
      this.mode = 'body'; this.host = host;
      host.innerHTML = ''; host.appendChild(this.canvas);
      this.size(host.clientWidth || 300, host.clientHeight || 360);
      this.setBody(shownScan || cur, cmp, S.bodySeg);
      if (!this.raf) this.loop();
    }).catch(fallback);
  },
  loop() {
    if (!this.host || !this.host.isConnected) { this.raf = 0; return; }
    if (!this.drag && performance.now() - this.idle > 1500 && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.ry += 0.006;
    this.body.rotation.set(this.rx, this.ry, 0); this.r.render(this.scene, this.cam);
    this.raf = requestAnimationFrame(() => this.loop());
  },
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.host = null; },
  snapshot(angle, w, h, theme, load) {
    const wasBody = this.mode === 'body' && this.bodyState;
    Comp.reset(); this.paint(load, theme); this.size(w, h);
    this.body.rotation.set(0, angle, 0); this.r.render(this.scene, this.cam);
    const url = this.canvas.toDataURL('image/png');
    if (this.host) {
      this.size(this.host.clientWidth || 300, this.host.clientHeight || 300);
      if (wasBody) this.setBody(wasBody.sc, wasBody.ghost, wasBody.sel); else this.paint(this.load, appTheme());
    }
    return url;
  }
};
/* ---------- 3D body composition: the InBody avatar on the anatomy figure ----------
   Each of InBody's 5 regions is sliced along its length. Muscles in a region are scaled around each
   slice's center by sqrt(lean / reference lean). A see-through fat shell is lofted around the region;
   its radius over the muscle is sqrt(1 + fat volume / lean volume), the same volume math as the 2D avatar.
   The model's right side is at -x and it faces +z. */
const ARM_GROUPS = new Set(['biceps', 'triceps', 'forearms', 'frontDelt', 'sideDelt', 'rearDelt']);
const LEG_GROUPS = new Set(['quads', 'hamstrings', 'calves']);
const segKeyOf = (group, x) => ARM_GROUPS.has(group) ? (x < 0 ? 'ra' : 'la') : LEG_GROUPS.has(group) ? (x < 0 ? 'rl' : 'll') : 'tr';
const SLICES = 26, ANGLES = 28;
const Comp = {
  ready: false, parts: [], rings: {}, shells: {}, ghosts: {}, shellMat: null, selMat: null, ghostMat: null,
  // one-time: remember original vertex positions, sort vertices into regions and slices, measure each slice
  setup(T, fig) {
    if (this.ready || !fig.modelMeshes) return this.ready;
    const acc = {};
    for (const k of ['ra', 'la', 'tr', 'rl', 'll']) acc[k] = {y0: Infinity, y1: -Infinity, pts: []};
    // left and right split at the body's own midline (the average of all its paired muscles), not at x = 0
    const muscles = fig.modelMeshes.filter(m => MUSCLE_GROUPS.includes(m.name));
    let sum = 0, cnt = 0;
    for (const m of muscles) { const a = m.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) { sum += a[i]; cnt++; } }
    const mid = this.mid = cnt ? sum / cnt : 0;
    for (const mesh of muscles) {
      const pos = mesh.geometry.attributes.position, orig = Float32Array.from(pos.array), keys = new Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const x = orig[i * 3], y = orig[i * 3 + 1], z = orig[i * 3 + 2], k = segKeyOf(mesh.name, x - mid);
        keys[i] = k; const a = acc[k]; a.pts.push(x, y, z);
        if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y;
      }
      mesh.frustumCulled = false;   // shapes change every frame while the slider moves
      this.parts.push({mesh, pos, orig, keys, slice: new Int16Array(pos.count)});
    }
    // the trapezius climbs the neck: end the trunk at the shoulders so its shell doesn't hood the head
    acc.tr.y1 = Math.min(acc.tr.y1, Math.max(acc.ra.y1, acc.la.y1) - 0.2);
    // the lowest leg slices are ankle tendon: start the legs a little higher
    for (const k of ['rl', 'll']) acc[k].y0 += (acc[k].y1 - acc[k].y0) * 0.04;
    for (const [k, a] of Object.entries(acc)) {
      const n = SLICES, cx = new Float64Array(n), cz = new Float64Array(n), cnt = new Float64Array(n), r = Array.from({length: n}, () => new Float64Array(ANGLES));
      const si = y => Math.max(0, Math.min(n - 1, Math.floor((y - a.y0) / (a.y1 - a.y0) * n)));
      for (let i = 0; i < a.pts.length; i += 3) { if (a.pts[i + 1] < a.y0 || a.pts[i + 1] > a.y1) continue; const s = si(a.pts[i + 1]); cx[s] += a.pts[i]; cz[s] += a.pts[i + 2]; cnt[s]++; }
      for (let s = 0; s < n; s++) if (cnt[s]) { cx[s] /= cnt[s]; cz[s] /= cnt[s]; }
      // empty slices borrow the nearest filled neighbour's center
      for (let s = 0; s < n; s++) if (!cnt[s]) { let d = 1; while (d < n) { const t = cnt[s - d] ? s - d : cnt[s + d] ? s + d : -1; if (t >= 0) { cx[s] = cx[t]; cz[s] = cz[t]; break; } d++; } }
      const inside = y => y >= a.y0 && y <= a.y1;
      for (let i = 0; i < a.pts.length; i += 3) {
        if (!inside(a.pts[i + 1])) continue;
        const s = si(a.pts[i + 1]), dx = a.pts[i] - cx[s], dz = a.pts[i + 2] - cz[s];
        const b = ((Math.round(Math.atan2(dz, dx) / (2 * Math.PI) * ANGLES) % ANGLES) + ANGLES) % ANGLES, d = Math.hypot(dx, dz);
        if (d > r[s][b]) r[s][b] = d;
      }
      // ignore stray points: cap each direction at 1.4x the slice's typical radius
      for (const row of r) {
        const vals = [...row].filter(v => v > 0).sort((p, q) => p - q), med = vals[vals.length >> 1] || 0;
        if (med) for (let b = 0; b < ANGLES; b++) row[b] = Math.min(row[b], med * 1.4);
      }
      // directions with no muscle (e.g. the front of the shin) blend between their nearest measured neighbours
      for (const row of r) {
        const have = []; for (let b = 0; b < ANGLES; b++) if (row[b] > 0) have.push(b);
        if (!have.length) continue;
        for (let b = 0; b < ANGLES; b++) {
          if (row[b] > 0) continue;
          let lo = b, hi = b, dl = 0, dh = 0;
          while (!(row[lo] > 0)) { lo = (lo + ANGLES - 1) % ANGLES; dl++; }
          while (!(row[hi] > 0)) { hi = (hi + 1) % ANGLES; dh++; }
          row[b] = (row[lo] * dh + row[hi] * dl) / (dl + dh);
        }
      }
      // smooth around each ring and along the length
      for (let pass = 0; pass < 3; pass++) for (let s = 0; s < n; s++) {
        const row = r[s], nx = new Float64Array(ANGLES), fallback = Math.max(...row) || 0.1;
        for (let b = 0; b < ANGLES; b++) {
          const v = row[b] || fallback, p = row[(b + ANGLES - 1) % ANGLES] || v, q = row[(b + 1) % ANGLES] || v;
          const up = s > 0 ? (r[s - 1][b] || v) : v, dn = s < n - 1 ? (r[s + 1][b] || v) : v;
          nx[b] = Math.max(v * 0.5 + (p + q) * 0.15 + (up + dn) * 0.1, v * 0.9);
        }
        r[s] = nx;
      }
      this.rings[k] = {y0: a.y0, y1: a.y1, cx, cz, r, si};
    }
    // The atlas is one real person, so its left and right limbs differ a little. Mirror-average each pair
    // so any left/right difference on screen comes only from the scan's numbers.
    for (const [rk, lk] of [['ra', 'la'], ['rl', 'll']]) {
      const R = this.rings[rk], L = this.rings[lk];
      const y0 = (R.y0 + L.y0) / 2, y1 = (R.y1 + L.y1) / 2, si = y => Math.max(0, Math.min(SLICES - 1, Math.floor((y - y0) / (y1 - y0) * SLICES)));
      for (let s = 0; s < SLICES; s++) {
        const mx = (L.cx[s] - R.cx[s]) / 2, mz = (L.cz[s] + R.cz[s]) / 2;
        R.cx[s] = mid - mx; L.cx[s] = mid + mx; R.cz[s] = mz; L.cz[s] = mz;
        for (let b = 0; b < ANGLES; b++) {
          const mb = ((ANGLES / 2 - b) % ANGLES + ANGLES) % ANGLES, avg = (R.r[s][b] + L.r[s][mb]) / 2;
          R.r[s][b] = avg; L.r[s][mb] = avg;
        }
      }
      for (const X of [R, L]) { X.y0 = y0; X.y1 = y1; X.si = si; }
    }
    for (const p of this.parts) for (let i = 0; i < p.pos.count; i++) p.slice[i] = this.rings[p.keys[i]].si(p.orig[i * 3 + 1]);
    // shells: one lofted tube per region
    this.shellMat = new T.MeshStandardMaterial({color: 0xF2C94C, transparent: true, opacity: 0.38, roughness: 0.6, depthWrite: false, side: T.DoubleSide});
    this.selMat = new T.MeshStandardMaterial({color: 0x6A93FF, transparent: true, opacity: 0.42, roughness: 0.6, depthWrite: false, side: T.DoubleSide});
    this.ghostMat = new T.MeshBasicMaterial({color: 0x9AA4AF, wireframe: true, transparent: true, opacity: 0.22});
    for (const k of Object.keys(this.rings)) {
      this.shells[k] = this.tube(T, k, this.shellMat); this.ghosts[k] = this.tube(T, k, this.ghostMat);
      fig.body.add(this.shells[k]); fig.body.add(this.ghosts[k]);
    }
    this.ready = true; this.show(false);
    return true;
  },
  tube(T, k, mat) {
    const n = SLICES, m = ANGLES, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * m * 3), 3));
    const idx = [];
    for (let s = 0; s < n - 1; s++) for (let b = 0; b < m; b++) {
      const a = s * m + b, c = s * m + (b + 1) % m, d = a + m, e = c + m;
      idx.push(a, d, c, c, d, e);
    }
    g.setIndex(idx);
    const mesh = new T.Mesh(g, mat); mesh.renderOrder = 2; mesh.userData.seg = k; mesh.frustumCulled = false;
    return mesh;
  },
  // shape the muscles and shells for one scan (kg values); ghost = an earlier scan's shells, or null
  apply(sc, ghost, sel) {
    if (!this.ready) return;
    const scale = {}, ratio = {};
    for (const {k} of SEGS) {
      const {lean, fat} = sc.seg[k];
      scale[k] = Math.max(0.6, Math.min(1.6, Math.sqrt(lean / REF.lean[k])));
      ratio[k] = Math.sqrt(1 + (fat / 0.9) / (lean / 1.06));
    }
    for (const p of this.parts) {
      const a = p.pos.array, o = p.orig;
      for (let i = 0; i < p.pos.count; i++) {
        const k = p.keys[i], R = this.rings[k], s = p.slice[i], f = scale[k], j = i * 3;
        a[j] = R.cx[s] + (o[j] - R.cx[s]) * f; a[j + 1] = o[j + 1]; a[j + 2] = R.cz[s] + (o[j + 2] - R.cz[s]) * f;
      }
      p.pos.needsUpdate = true;
    }
    for (const k of Object.keys(this.rings)) {
      this.loft(this.shells[k], k, scale[k], ratio[k]);
      this.shells[k].material = sel === k ? this.selMat : this.shellMat;
      if (ghost) {
        const gl = ghost.seg[k], gs = Math.max(0.6, Math.min(1.6, Math.sqrt(gl.lean / REF.lean[k])));
        this.loft(this.ghosts[k], k, gs, Math.sqrt(1 + (gl.fat / 0.9) / (gl.lean / 1.06)));
      }
      this.ghosts[k].visible = !!ghost && this.on;
    }
  },
  loft(mesh, k, scale, ratio) {
    const R = this.rings[k], a = mesh.geometry.attributes.position.array, h = R.y1 - R.y0;
    for (let s = 0; s < SLICES; s++) {
      const y = R.y0 + (s + 0.5) / SLICES * h, t = (s + 0.5) / SLICES;
      for (let b = 0; b < ANGLES; b++) {
        const ang = b / ANGLES * 2 * Math.PI, base = R.r[s][b] * scale;
        // trunk fat gathers at the belly: thicker around the waist and toward the front
        const w = k === 'tr' ? 1 + 0.9 * Math.exp(-(((t - 0.3) / 0.16) ** 2)) * (0.45 + 0.55 * Math.max(0, Math.sin(ang))) : 1;
        const rad = base + base * (ratio - 1) * w + 0.05, j = (s * ANGLES + b) * 3;
        a[j] = R.cx[s] + Math.cos(ang) * rad; a[j + 1] = y; a[j + 2] = R.cz[s] + Math.sin(ang) * rad;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.computeVertexNormals();
  },
  // back to the untouched anatomy (for workout maps and share images)
  reset() {
    if (!this.ready) return;
    for (const p of this.parts) { p.pos.array.set(p.orig); p.pos.needsUpdate = true; }
    this.show(false);
  },
  show(on) { this.on = on; for (const k of Object.keys(this.shells)) { this.shells[k].visible = on; this.ghosts[k].visible = false; } }
};

function figureBlock(w) {
  const load = muscleLoad(w), main = mainMuscles(load), also = alsoMuscles(load);
  return `<div class="fig-wrap"><div class="fig-host" data-w="${esc(w.id)}"></div>
    <div class="stack small" style="gap:6px">
      <div class="legend"><span><i class="main-sw"></i>Main target</span><span><i class="also-sw"></i>Also worked</span></div>
      ${main.length ? `<span><b>Main:</b> ${main.map(m => MUSCLE_NAMES[m]).join(', ')}</span>` : ''}
      ${also.length ? `<span class="muted"><b>Also:</b> ${also.map(m => MUSCLE_NAMES[m]).join(', ')}</span>` : ''}
      <span class="muted">Drag the figure to turn it.</span></div></div>`;
}
