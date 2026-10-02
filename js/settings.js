// Liftbook — Settings: appearance, rest timer sound and behaviour, units, account, backups.
// Classic script: files load in order (see index.html) and share top-level names.

const SETTING_DEFAULTS = {theme: 'system', accent: 'blue', sound: 'beep', volume: 0.7, countdown: true, vibrate: true, keepAwake: true, autoRest: true};
const setting = k => { const s = S.profile.settings || {}; return s[k] ?? SETTING_DEFAULTS[k]; };
function setSetting(k, v) { S.profile.settings = {...(S.profile.settings || {}), [k]: v}; store.saveProfile(); applyAppearance(); }

// accent presets, each checked for contrast on light and dark backgrounds: [light, dark, light tint, dark tint]
const ACCENTS = {
  blue:   {name: 'Blue',   c: ['#1B4FD6', '#6A93FF', '#DCE5FB', '#1A2540']},
  teal:   {name: 'Teal',   c: ['#0B7A84', '#3CC6CF', '#D4EFF1', '#10302F']},
  green:  {name: 'Green',  c: ['#1B7D44', '#45C47E', '#DDF1E5', '#143023']},
  orange: {name: 'Orange', c: ['#B8520A', '#FF9A4D', '#FBE6D6', '#3A2414']},
  purple: {name: 'Purple', c: ['#6B3FD6', '#A98BFF', '#E7DFFB', '#261C40']}
};
function applyAppearance() {
  const theme = setting('theme'), root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  const a = (ACCENTS[setting('accent')] || ACCENTS.blue).c;
  let el = document.getElementById('accent-style');
  if (!el) { el = document.createElement('style'); el.id = 'accent-style'; document.head.appendChild(el); }
  const dark = `--accent:${a[1]};--accent-soft:${a[3]};--accent-ink:#08101F;`;
  el.textContent = `:root{--accent:${a[0]};--accent-soft:${a[2]};--accent-ink:#FFFFFF}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}
:root[data-theme="dark"]{${dark}}`;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta'); meta.name = 'theme-color';
  try { meta.content = getComputedStyle(document.body || root).getPropertyValue('--bg').trim() || '#0D1116'; } catch { meta.content = '#0D1116'; }
  document.head.appendChild(meta);
}

/* ---------- rest timer sounds (made with Web Audio, so there are no files to download) ---------- */
const SOUNDS = {
  beep:  {name: 'Beep',  notes: [[880, 0, .18], [880, .25, .18]], wave: 'square'},
  bell:  {name: 'Bell',  notes: [[660, 0, 1.2], [1320, 0, .8]], wave: 'sine'},
  chime: {name: 'Chime', notes: [[523, 0, .35], [659, .18, .35], [784, .36, .6]], wave: 'triangle'},
  off:   {name: 'Off', notes: []}
};
function playSound(kind = setting('sound'), vol = setting('volume')) {
  try {
    if (!audio || kind === 'off' || !(vol > 0)) return;
    const s = SOUNDS[kind] || SOUNDS.beep, peak = 0.45 * vol * (s.wave === 'square' ? 0.5 : 1);
    for (const [freq, off, dur] of s.notes) {
      const o = audio.createOscillator(), g = audio.createGain(); o.type = s.wave; o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + off; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.start(t); o.stop(t + dur + .05);
    }
  } catch {}
}
function playTick() {
  try {
    if (!audio || setting('sound') === 'off') return;
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime, v = .25 * setting('volume');
    o.frequency.value = 1000; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(v, .0002), t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .07); o.start(t); o.stop(t + .08);
  } catch {}
}
const canVibrate = () => typeof navigator.vibrate === 'function';   // Android; iPhone web apps can't vibrate

/* ---------- Settings screen ---------- */
const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
function toggle(k, label, hint) {
  return `<label class="set-row"><span class="stack" style="gap:1px"><span>${label}</span>${hint ? `<span class="small muted">${hint}</span>` : ''}</span>
    <input type="checkbox" class="switch" data-act="set-toggle" data-v="${k}" ${setting(k) ? 'checked' : ''}></label>`;
}
function viewSettings() {
  const u = unit(), theme = setting('theme'), accent = setting('accent'), sound = setting('sound');
  return `<div class="wrap">
    <div class="row between"><button class="btn ghost" data-act="settings-close" style="padding-left:0">‹ Back</button><h2 style="margin:0">Settings</h2><span style="width:60px"></span></div>

    <section class="card"><h3>Appearance</h3>
      <div class="set-row"><span>Theme</span><div class="seg" role="group" aria-label="Theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button data-act="set-theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><span>Accent color</span><div class="swatches" role="group" aria-label="Accent color">${Object.entries(ACCENTS).map(([k, a]) =>
        `<button class="swatch ${accent === k ? 'on' : ''}" data-act="set-accent" data-v="${k}" style="--sw-l:${a.c[0]};--sw-d:${a.c[1]}" aria-label="${a.name}" aria-pressed="${accent === k}"></button>`).join('')}</div></div>
    </section>

    <section class="card"><h3>Rest timer</h3>
      ${toggle('autoRest', 'Start automatically', 'When you check off a set')}
      <div class="set-row"><span>Sound</span><div class="seg" role="group" aria-label="Rest timer sound">${Object.entries(SOUNDS).map(([k, s]) => `<button data-act="set-sound" data-v="${k}" aria-pressed="${sound === k}">${s.name}</button>`).join('')}</div></div>
      <div class="set-row ${sound === 'off' ? 'disabled' : ''}"><label for="set-volume">Volume</label>
        <div class="row" style="gap:8px;flex:1;max-width:220px"><input type="range" id="set-volume" data-in="set-volume" min="0" max="1" step="0.05" value="${setting('volume')}" ${sound === 'off' ? 'disabled' : ''} aria-label="Rest timer volume"><button class="btn" data-act="sound-test" ${sound === 'off' ? 'disabled' : ''}>Test</button></div></div>
      ${toggle('countdown', 'Countdown beeps', 'A tick in each of the last 3 seconds')}
      ${canVibrate() ? toggle('vibrate', 'Vibrate when rest ends') : ''}
      ${toggle('keepAwake', 'Keep screen on during workouts')}
      <p class="small muted" style="margin:0">${isIOS() ? 'On iPhone, sounds follow your phone’s volume and are muted when the ringer switch is on silent. They also can’t play while the screen is locked; that needs the App Store version.' : 'Volume is relative to your phone’s media volume. Sounds can’t play while the screen is off.'}</p>
    </section>

    <section class="card"><h3>Training</h3>
      <div class="set-row"><span>Units</span><div class="seg"><button data-act="unit" data-v="lb" aria-pressed="${u === 'lb'}">lb</button><button data-act="unit" data-v="kg" aria-pressed="${u === 'kg'}">kg</button></div></div>
      <div class="set-row"><label for="set-bar">Barbell weight (${u})</label><input id="set-bar" class="mini" data-in="bar" inputmode="decimal" value="${fmtW(S.profile.bar)}"></div>
      <div class="set-row"><label for="set-goal">Lifting sessions per week</label><input id="set-goal" class="mini" data-in="goal" inputmode="numeric" value="${S.profile.weeklyGoal || 4}"></div>
      <p class="small muted" style="margin:0">Past workouts keep the unit they were logged in and are converted for display.</p>
    </section>

    ${viewAccount()}

    <section class="card"><h3>Backups</h3>
      <p class="small muted" style="margin:0">${Sync.user ? 'Your log syncs to your account automatically. Exports are an extra copy you keep yourself.' : 'Export a backup now and then, and use Import to move your log to a new phone.'}</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="export-json">Export backup (.json)</button><button class="btn" data-act="export-csv">Export sets (.csv)</button><label class="btn" for="import-file">Import backup</label><input type="file" id="import-file" accept=".json,application/json" hidden></div>
    </section>

    <section class="card row between" style="flex-direction:row;align-items:center"><div class="stack" style="gap:2px"><h3>Help shape Liftbook</h3><span class="small muted">Found a bug or have an idea?</span></div><button class="btn primary" data-act="feedback-open">Send feedback</button></section>

    <section class="card"><h3>About</h3>
      <p class="small muted" style="margin:0">Liftbook version ${APP_VERSION}.</p>
      <p class="small muted" style="margin:0">3D muscle figure adapted from <a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" target="_blank" rel="noopener">Z-Anatomy</a> (CC BY-SA 4.0) and <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noopener">BodyParts3D</a>, The Database Center for Life Science (CC BY-SA 2.1 JP). The adapted figure is shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Food data from <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noopener">USDA FoodData Central</a> and <a href="https://world.openfoodfacts.org/" target="_blank" rel="noopener">Open Food Facts</a> (ODbL).</p>
    </section>
  </div>`;
}
