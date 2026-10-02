// Liftbook — Add-to-Home-Screen prompt, feedback and crash reports, first-run welcome.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- add to Home Screen prompt (until Liftbook is in the app stores) ---------- */
const UA = navigator.userAgent;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android/.test(UA);
const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|LinkedInApp|Twitter/i.test(UA);
const INSTALL_KEY = 'liftbook.installDismissed';
const installDismissed = () => { try { return localStorage.getItem(INSTALL_KEY) === '1'; } catch { return false; } };
const shouldOfferInstall = () => !isStandalone() && (isIOS() || isAndroid()) && !installDismissed();
let installEvent = null;
// Android Chrome offers a real install dialog; keep it for the button
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (S.ready) render(); });
window.addEventListener('appinstalled', () => { installEvent = null; try { localStorage.setItem(INSTALL_KEY, '1'); } catch {} if (S.ready) render(); });
const SHARE_ICON = '<svg class="ios-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
function installSteps() {
  if (inAppBrowser()) return `<p style="margin:0">This page opened inside another app, which can't add it to your Home Screen. Open it in ${isIOS() ? 'Safari' : 'Chrome'} first:</p>
    <ol class="steps"><li>Tap the <b>•••</b> or <b>⋮</b> menu in this app's browser</li><li>Choose <b>Open in ${isIOS() ? 'Safari' : 'browser'}</b></li><li>Come back to these steps there</li></ol>`;
  if (isIOS()) {
    const safari = !/CriOS|FxiOS|EdgiOS/.test(UA);
    return `<ol class="steps">
      <li>Tap the Share button ${SHARE_ICON} ${safari ? 'at the bottom of Safari (on newer iPhones it’s inside the <b>•••</b> menu)' : 'next to the address bar'}</li>
      <li>Scroll down and tap <b>Add to Home Screen</b></li>
      <li>Tap <b>Add</b>, then open <b>Liftbook</b> from your Home Screen and continue there</li></ol>`;
  }
  return installEvent
    ? `<button class="btn primary block" data-act="install-now">Install Liftbook</button><p class="small muted" style="margin:0">Then open it from your Home Screen and continue there.</p>`
    : `<ol class="steps"><li>Tap <b>⋮</b> at the top right of Chrome</li><li>Tap <b>Add to Home screen</b> or <b>Install app</b></li><li>Open <b>Liftbook</b> from your Home Screen and continue there</li></ol>`;
}
function installCard(inWelcome) {
  return `<section class="card install-card">
    <div class="row between"><h3>Add Liftbook to your Home Screen</h3>${inWelcome ? '' : '<button class="iconbtn" data-act="install-dismiss" aria-label="Dismiss">✕</button>'}</div>
    <p class="small muted" style="margin:0">It opens full screen like an app, works without signal at the gym, and keeps your log safe.</p>
    ${installSteps()}
  </section>`;
}

/* ---------- feedback and crash reports ----------
   Both go through a small outbox in browser storage, so nothing is lost offline; it empties into
   Supabase (insert-only tables, see supabase/003_feedback_and_errors.sql) whenever it can. */
const OUTBOX_KEY = 'liftbook.outbox';
const Outbox = {
  read() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch { return []; } },
  write(items) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-50))); } catch {} },
  add(table, row) { const items = this.read(); items.push({table, row}); this.write(items); return this.flush(); },
  busy: false,
  async flush() {
    if (this.busy || !Sync.client || !navigator.onLine) return false;
    this.busy = true; let sentAll = true;
    try {
      for (const item of this.read()) {
        const row = {...item.row}; if (Sync.user) row.user_id = Sync.user.id; else delete row.user_id;
        const {error} = await Sync.client.from(item.table).insert(row);
        if (error) { sentAll = false; if (!tableMissing(error)) console.warn('outbox', error); break; }
        this.write(this.read().filter(x => x !== item && JSON.stringify(x) !== JSON.stringify(item)));
      }
    } catch (e) { sentAll = false; } finally { this.busy = false; }
    return sentAll;
  }
};
const currentScreen = () => S.screen === 'workout' ? 'workout' : S.screen === 'welcome' ? 'welcome' : (S.sheet ? `${S.tab}/${S.sheet.type}` : S.tab);
const device = () => navigator.userAgent.slice(0, 300);
const seenErrors = new Set();
function logClientError(message, stack) {
  const msg = String(message || 'Unknown error');
  if (msg === 'Script error.' || seenErrors.size >= 10) return;   // cross-origin noise; cap per session
  const key = msg + '|' + String(stack || '').slice(0, 200);
  if (seenErrors.has(key)) return; seenErrors.add(key);
  Outbox.add('client_errors', {message: msg.slice(0, 1000), stack: String(stack || '').slice(0, 4000), screen: currentScreen(), app_version: APP_VERSION, device: device()});
}
window.addEventListener('error', e => logClientError(e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; logClientError('Unhandled: ' + (r.message || r), r.stack); });
window.addEventListener('online', () => Outbox.flush());

const FEEDBACK_KINDS = [['bug', 'Something’s broken'], ['idea', 'Idea'], ['confusing', 'Confusing'], ['other', 'Other']];
function viewFeedbackSheet() {
  const f = S.sheet;
  return `<div class="row between"><h2>Send feedback</h2><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    <p class="small muted" style="margin:0">It goes straight to the person building Liftbook. Be specific: what you tapped, what happened, and what you expected.</p>
    <div class="chips" role="group" aria-label="Type">${FEEDBACK_KINDS.map(([k, l]) => `<button class="chipbtn" data-act="fb-kind" data-v="${k}" aria-pressed="${f.kind === k}">${l}</button>`).join('')}</div>
    <label class="field">Message<textarea id="fb-msg" data-in="fb-msg" rows="6" maxlength="4000" placeholder="${f.kind === 'bug' ? 'I tapped Finish and the workout disappeared…' : f.kind === 'idea' ? 'It would help if…' : 'Tell us anything'}">${esc(f.msg || '')}</textarea></label>
    ${f.err ? `<p class="small" style="margin:0;color:var(--pr)">${esc(f.err)}</p>` : ''}
    <button class="btn primary lg block" data-act="fb-send">Send</button>
    <p class="small muted" style="margin:0">${Sync.user ? `Sent as ${esc(Sync.user.email || 'you')}, so you can get a reply.` : 'You’re signed out, so this is sent anonymously.'} Version ${APP_VERSION}.</p>`;
}
async function sendFeedback() {
  const f = S.sheet, msg = (f.msg || '').trim();
  if (!msg) { f.err = 'Write a few words first.'; render(); return; }
  const row = {kind: f.kind, message: msg.slice(0, 4000), email: Sync.user ? Sync.user.email : null, screen: f.from, app_version: APP_VERSION, device: device()};
  S.sheet = null; render();
  const sent = await Outbox.add('feedback', row);
  toast(sent ? 'Thanks. Feedback sent.' : 'Saved. It’ll send when you’re back online.');
}

/* ---------- first-run welcome: units, account, program ---------- */
const needsWelcome = () => !S.profile.onboarded && !S.program && !S.workouts.length && !S.body.length;
function viewWelcome() {
  if (shouldOfferInstall() && !S.welcomeInBrowser) return `<div class="wrap welcome">
      <h1 class="wl-title">Welcome to Lift<span>book</span></h1>
      <p class="muted" style="margin:0">Before you set up, add Liftbook to your Home Screen and continue from there. ${isIOS() ? 'On iPhone, the Home Screen app keeps its own storage, so setting up in Safari first would have to be redone.' : ''}</p>
      ${installCard(true)}
      <button class="btn block" data-act="wl-browser">Continue in the browser instead</button></div>`;
  let step = S.welcomeStep || 0;
  if (step === 1 && Sync.user) step = S.welcomeStep = 2;   // signed in: move on
  if (step === 1 && !Sync.client) step = S.welcomeStep = 2; // no cloud sync available
  const dots = [0, 1, 2].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('');
  let body = '';
  if (step === 0) {
    const u = unit();
    body = `<h1 class="wl-title">Welcome to Lift<span>book</span></h1>
      <p class="muted">Log your training, see what you hit on a 3D muscle map, and track your weight and body scans. Three quick questions to set up.</p>
      <section class="card"><h3>Which units do you lift in?</h3>
        <div class="seg" role="group" aria-label="Units"><button data-act="unit" data-v="lb" aria-pressed="${u === 'lb'}">Pounds (lb)</button><button data-act="unit" data-v="kg" aria-pressed="${u === 'kg'}">Kilograms (kg)</button></div>
        <p class="small muted" style="margin:0">You can change this later in the Program tab.</p></section>
      <button class="btn primary lg block" data-act="wl-next">Continue</button>`;
  } else if (step === 1) {
    body = `<h2>Save your log to an account</h2>
      <p class="muted" style="margin:0">With an account, everything backs up automatically and works on any phone or computer you sign in on.</p>
      ${viewAccount()}
      <button class="btn block" data-act="wl-next">Skip for now (save on this phone only)</button>`;
  } else {
    body = S.program
      ? `<h2>You’re all set</h2><p class="muted">${Sync.user ? 'Your program and history are synced from your account.' : 'Your program is ready.'}</p>
         <button class="btn primary lg block" data-act="wl-done">Go to Today</button>`
      : `<h2>How do you want to train?</h2>
         <p class="muted" style="margin:0">Pick a starting point. You can change it any time.</p>
         ${programChoices(false)}
         <button class="btn block" data-act="wl-done">Decide later</button>`;
  }
  return `<div class="wrap welcome"><div class="wl-dots" aria-label="Step ${step + 1} of 3">${dots}</div>${body}</div>`;
}
function finishWelcome() {
  S.profile.onboarded = true; store.saveProfile();
  S.screen = 'tabs'; S.tab = 'today'; S.welcomeStep = 0; render(); window.scrollTo(0, 0);
}
