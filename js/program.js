// Liftbook — Program setup and the program builder.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- program: choose a starting point, then build ---------- */
function programChoices(replacing) {
  return `<div class="stack" style="gap:10px">
    <button class="hitem" data-act="prog-new"><h3>Build from scratch</h3><span class="small muted">Name your program, add training days, and pick exercises from the library or create your own.</span></button>
    <button class="hitem" data-act="prog-template"><h3>Jeff Nippard 4-Day Upper/Lower</h3><span class="small muted">Template · 4 days · Upper A, Lower A, Upper B, Lower B · 29 exercises. Fully editable.</span></button>
    <label class="hitem" for="program-file"><h3>Import a program file</h3><span class="small muted">A program someone exported from Liftbook, like one a coach built for you.</span></label>
    <input type="file" id="program-file" accept=".json,application/json" hidden>
    ${replacing ? '<p class="small muted" style="margin:0">Replacing your program keeps all your workout history and records.</p>' : ''}
  </div>`;
}
function programSetupCard() {
  if (Sync.user && !Sync.pulledProgram) return `<div class="empty">Loading your program…</div>`;
  return `<section class="card next"><div class="stack"><p class="eyebrow">Get started</p><h2>Set up your program</h2>
    <p class="small muted" style="margin:0">Choose how to start. You can log activities and custom workouts any time, with or without a program.</p></div>
    ${programChoices(false)}</section>`;
}
function viewProgramBuilder() {
  const P = S.program;
  const days = P.routines.map((r, ri) => {
    if (S.editRoutine !== r.id) return `<div class="routine-row"><span class="tag">${esc(r.tag || tagFor(r.name))}</span>
      <div class="grow"><div style="font-weight:600">${esc(r.name)}</div><div class="small muted">${r.focus ? esc(r.focus) + ' · ' : ''}${r.exercises.length} exercise${r.exercises.length === 1 ? '' : 's'}</div></div>
      <button class="btn" data-act="edit-routine" data-v="${esc(r.id)}">Edit</button></div>`;
    const rows = r.exercises.map((ex, xi) => `<div class="edrow">
      <div class="row between"><b>${esc(ex.name)}</b><div class="row" style="gap:0">
        <button class="iconbtn" data-act="p-up" data-r="${ri}" data-x="${xi}" aria-label="Move up" ${xi ? '' : 'disabled'}>↑</button>
        <button class="iconbtn" data-act="p-rm" data-r="${ri}" data-x="${xi}" aria-label="Remove ${esc(ex.name)}" style="color:${S.armed === `prm${ri}-${xi}` ? 'var(--pr)' : 'inherit'}">${S.armed === `prm${ri}-${xi}` ? '✓?' : '✕'}</button></div></div>
      <div class="ednums">
        <label class="field">Sets<input id="ps-${ri}-${xi}" inputmode="numeric" data-in="p-sets" data-r="${ri}" data-x="${xi}" value="${ex.sets}"></label>
        <label class="field">Min ${ex.timed ? 's' : 'reps'}<input id="pmin-${ri}-${xi}" inputmode="numeric" data-in="p-repMin" data-r="${ri}" data-x="${xi}" value="${ex.repMin}"></label>
        <label class="field">Max ${ex.timed ? 's' : 'reps'}<input id="pmax-${ri}-${xi}" inputmode="numeric" data-in="p-repMax" data-r="${ri}" data-x="${xi}" value="${ex.repMax}"></label>
        <label class="field">Rest s<input id="pr-${ri}-${xi}" inputmode="numeric" data-in="p-rest" data-r="${ri}" data-x="${xi}" value="${ex.rest}"></label>
      </div>
      <label class="field">Pinned note (shows in every workout)<input id="pcue-${ri}-${xi}" data-in="p-cue" data-r="${ri}" data-x="${xi}" value="${esc(ex.cue || '')}" placeholder="Seat at notch 4, pause at the bottom"></label></div>`).join('');
    return `<div class="stack day-edit">
      <div class="row between"><p class="eyebrow" style="margin:0">Day ${ri + 1}</p><button class="btn primary" data-act="edit-routine" data-v="">Done</button></div>
      <div class="row"><label class="field grow">Day name<input id="dn-${ri}" data-in="day-name" data-r="${ri}" value="${esc(r.name)}" placeholder="Push"></label>
        <label class="field grow">Focus (optional)<input id="df-${ri}" data-in="day-focus" data-r="${ri}" value="${esc(r.focus || '')}" placeholder="Chest and triceps"></label></div>
      ${rows || '<p class="small muted" style="margin:0">No exercises yet.</p>'}
      <button class="btn block" data-act="pick-open" data-r="${ri}">+ Add exercise</button>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn" data-act="day-move" data-r="${ri}" data-v="-1" ${ri ? '' : 'disabled'}>Move earlier</button>
        <button class="btn" data-act="day-move" data-r="${ri}" data-v="1" ${ri < P.routines.length - 1 ? '' : 'disabled'}>Move later</button>
        <button class="btn danger ${S.armed === 'dayrm' + ri ? 'armed' : ''}" data-act="day-rm" data-r="${ri}">${S.armed === 'dayrm' + ri ? 'Tap again to delete day' : 'Delete day'}</button>
      </div></div>`;
  }).join('');
  return `<section class="card" style="padding-block:10px 12px">
      <label class="field">Program name<input id="prog-name" data-in="prog-name" value="${esc(P.name)}"></label>
      <p class="small muted" style="margin:0">Days run in this order, then repeat. Today always suggests the next one.</p>
      ${days || '<p class="small muted">No days yet.</p>'}
      <button class="btn block" data-act="day-add">+ Add a day</button>
    </section>
    <section class="card"><h3>Share or replace</h3>
      <p class="small muted" style="margin:0">Export sends this program as a file someone else can import. Replacing it keeps your history.</p>
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="export-program">Export program</button><button class="btn" data-act="prog-replace">Replace program…</button></div>
    </section>`;
}
function viewPickSheet() {
  const sh = S.sheet, q = (sh.q || '').toLowerCase().trim();
  const lib = libraryExercises().filter(x => !q || x.name.toLowerCase().includes(q) || (x.muscle || '').toLowerCase().includes(q));
  const day = S.program.routines[sh.r];
  return `<div class="row between"><h2>Add to ${esc(day.name)}</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <label class="field">Search by name or muscle<input id="pick-q" data-in="pick-q" value="${esc(sh.q || '')}" placeholder="Row, chest, curl…" autocomplete="off"></label>
    <div class="lib">${lib.map(x => `<button data-act="pick-ex" data-v="${esc(x.id)}"><span>${esc(x.name)}</span><span class="muted small">${esc(x.muscle || '')}</span></button>`).join('') || '<div class="muted small" style="padding:12px">Nothing matches. Create it below.</div>'}</div>
    <details ${q && !lib.length ? 'open' : ''}><summary class="small muted">Create your own exercise</summary>
      <div class="stack" style="gap:10px;margin-top:8px">
        <label class="field">Name<input id="pick-name" value="${esc(sh.q || '')}" placeholder="Landmine press"></label>
        <div class="row"><label class="field grow">Primary muscle<select id="pick-muscle">${MUSCLES.map(m => `<option>${m}</option>`).join('')}</select></label>
          <label class="field grow">Equipment<select id="pick-kind">${KINDS.map(k => `<option>${k}</option>`).join('')}</select></label></div>
        <label class="row small"><input type="checkbox" id="pick-timed"> Timed (seconds instead of reps)</label>
        <button class="btn primary block" data-act="pick-custom">Create and add</button>
      </div></details>`;
}
function addToDay(ri, x) {
  const r = S.program.routines[ri];
  r.exercises.push({id: x.id, name: x.name, sets: x.sets || 3, repMin: x.repMin || 8, repMax: x.repMax || 12, kind: x.kind, muscle: x.muscle, rest: x.rest || 90, timed: !!x.timed, ...(x.muscles ? {muscles: x.muscles} : {})});
  store.saveProgram(); S.sheet = null; render(); toast(`${x.name} added`);
}
function setProgram(p, msg, tab = 'today') {
  if (S.screen === 'welcome') { S.profile.onboarded = true; store.saveProfile(); S.screen = 'tabs'; S.welcomeStep = 0; }
  S.program = p; S.editRoutine = p.routines[0] && !p.routines[0].exercises.length ? p.routines[0].id : null;
  store.saveProgram(); S.sheet = null; S.tab = tab; render(); window.scrollTo(0, 0); toast(msg);
}

function viewProgram() {
  return `${brand('Program')}${storageBanner()}
    ${S.program ? viewProgramBuilder() : programSetupCard()}
    <p class="small muted" style="text-align:center">Units, account, backups and sounds are in Settings (the gear, top right).</p>`;
}

function viewAccount() {
  if (!Sync.client) return `<section class="card"><h3>Account &amp; sync</h3><p class="small muted">${Sync.configured() || (CFG.supabaseUrl && CFG.supabaseAnonKey)
    ? 'Cloud sync can’t load right now (probably no signal). Your log is saved on this phone.'
    : 'Cloud sync isn’t set up yet. Your log is saved on this phone.'}</p></section>`;
  if (Sync.user) return `<section class="card"><h3>Account &amp; sync</h3>
    <div class="stack"><span>Signed in as <b>${esc(Sync.user.email || '')}</b></span><span class="small muted" id="sync-status">${esc(syncStatusText())}</span></div>
    <p class="small muted">Every change saves on this phone first, then uploads to your account. Sign in on another phone or computer to see the same log.</p>
    <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="sync-now">Sync now</button><button class="btn ${S.armed === 'signout' ? 'danger armed' : ''}" data-act="sign-out">${S.armed === 'signout' ? 'Tap again to sign out' : 'Sign out'}</button></div>
  </section>`;
  return `<section class="card"><h3>Account &amp; sync</h3>
    <p class="small muted">Sign in to back up your log automatically and use it on more than one device.${S.workouts.length ? ` The ${S.workouts.length} workout${S.workouts.length === 1 ? '' : 's'} on this phone will upload to your account.` : ''}</p>
    <form id="auth-form" class="stack" style="gap:10px" autocomplete="on">
      <label class="field">Email<input id="auth-email" data-in="auth-email" type="email" autocomplete="email" autocapitalize="off" value="${esc(S.authEmail)}" required></label>
      <label class="field">Password<input id="auth-pw" type="password" autocomplete="current-password" minlength="6" required></label>
      ${S.authMsg ? `<p class="small" style="margin:0;color:${S.authMsg.startsWith('✓') ? 'var(--good)' : 'var(--pr)'}">${esc(S.authMsg)}</p>` : ''}
      <div class="row"><button class="btn primary grow" type="submit" data-mode="in" ${S.authBusy ? 'disabled' : ''}>Sign in</button><button class="btn grow" type="submit" data-mode="up" ${S.authBusy ? 'disabled' : ''}>Create account</button></div>
    </form>
  </section>`;
}
async function authSubmit(mode) {
  const email = (document.getElementById('auth-email').value || '').trim(), pw = document.getElementById('auth-pw').value || '';
  S.authEmail = email;
  if (!email || pw.length < 6) { S.authMsg = 'Enter your email and a password of at least 6 characters.'; render(); return; }
  S.authBusy = true; S.authMsg = ''; render();
  try {
    const {data, error} = mode === 'up' ? await Sync.signUp(email, pw) : await Sync.signIn(email, pw);
    if (error) S.authMsg = error.message === 'Invalid login credentials' ? 'That email and password don’t match. Created your account already? Confirm it from the email first.' : error.message;
    else if (mode === 'up' && !data.session) S.authMsg = '✓ Account created. Open the confirmation email, then come back here and sign in.';
    else S.authMsg = '';
  } catch (e) { S.authMsg = navigator.onLine ? 'Couldn’t reach the server. Try again in a moment.' : 'You’re offline. Connect to the internet to sign in.'; }
  S.authBusy = false; render();
}
