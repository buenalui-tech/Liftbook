// Liftbook — How-to videos: a YouTube form video for each exercise, played in a sheet from the workout or the program editor.
// Classic script: files load in order (see index.html) and share top-level names.

/* ---------- form videos ---------- */
// picked for the built-in program; any other exercise gets one from the sheet (find on YouTube, paste the link)
const FORM_VIDEOS = Object.fromEntries(Object.entries({
  'Bench Press (Barbell)': 'vcBig73ojpE',
  'Incline Bench Press (Dumbbell)': 'hChjZQhX1Ls',
  'Overhead Press (Dumbbell)': 's_aK83TWYkA',
  'Face Pull': 'wnPX6Fwe-Fg',
  'Lateral Raise (Dumbbell)': 'Y29xKcze8Ik',
  'Triceps Pushdown': '_w-HpW70nSQ',
  'Crunch (Machine)': '0kLWho-pEdQ',
  'Squat (Barbell)': 'bEv6CCg2BC8',
  'Leg Press (Machine)': 'K5n2vg3oZa4',
  'Leg Extension (Machine)': 'MXvSzXEBOTI',
  'Seated Leg Curl (Machine)': 'Z5pRnXaCjpM',
  'Standing Calf Raise': 'ndQc4mz4mBU',
  'Decline Crunch': '-jFc70vicCg',
  'Bent Over Row (Barbell)': 'ZtTwgJTBjOQ',
  'Lat Pulldown (Cable)': 'SALxEARiMkw',
  'Dumbbell Row': 'S_kOe9mOLlg',
  'Bicep Curl (Dumbbell)': '6DeLZ6cbgWQ',
  'Hammer Curl (Dumbbell)': '8XLxfXROrTo',
  'Hanging Knee Raise': 'fLbZrF6MZuE',
  'Deadlift (Barbell)': 'VL5Ab0T07e4',
  'Romanian Deadlift (Barbell)': 'Roe2hOnzXf4',
  'Hip Thrust (Barbell)': 'S_uZP4UH6J0',
  'Lying Leg Curl (Machine)': 'SbSNUXPRkc8',
  'Hip Abduction (Machine)': '5O_Y9l__iao',
  'Seated Calf Raise': 'pz66Bw6HJ4s',
  'Lunge (Dumbbell)': 'pT7K8D8SLk4',
  'Plank': 'Sq_Jc_JAIr8',
  'Front Squat (Barbell)': 'v-mQm_droHg',
  'Sumo Deadlift (Barbell)': 'XsrD5y8EIKU',
  'Side Plank': '0M-erHBl48U'
}).map(([name, id]) => [slug(name), id]));

// a pasted watch, share, shorts or embed link, or a bare 11-character id
function ytId(text) {
  const t = String(text || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live|v)\/)([\w-]{11})(?![\w-])/);
  return m ? m[1] : null;
}
const ownVideo = exId => (S.profile.videos || {})[exId] || null;
const formVideo = exId => ownVideo(exId) || FORM_VIDEOS[exId] || null;

function viewHowto() {
  const sh = S.sheet, id = formVideo(sh.exId), own = ownVideo(sh.exId);
  const search = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(sh.name + ' proper form');
  return `<div class="row between"><div class="stack"><p class="eyebrow">How to</p><h2>${esc(sh.name)}</h2></div><button class="iconbtn" data-act="sheet-close" aria-label="Close">✕</button></div>
    ${id ? `<div class="video" id="howto-video" data-v="${esc(id)}"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0&playsinline=1&modestbranding=1"
        title="${esc(sh.name)} form video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      ${navigator.onLine === false ? '<p class="small muted" style="margin:0">You’re offline. The video plays once you’re back online.</p>' : ''}`
    : '<p class="muted" style="margin:0">No video for this exercise yet. Find one on YouTube, copy its link (Share → Copy link) and paste it below.</p>'}
    <a class="btn block" href="${search}" target="_blank" rel="noopener">${id ? 'Find a different video on YouTube' : 'Find a form video on YouTube'}</a>
    <div class="row" style="gap:8px"><input id="howto-link" class="grow search" placeholder="Paste a YouTube link" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
      <button class="btn primary" data-act="howto-save">Save</button></div>
    ${own && FORM_VIDEOS[sh.exId] ? '<button class="btn ghost block" data-act="howto-reset">Go back to the suggested video</button>' : own ? '<button class="btn ghost block" data-act="howto-reset">Remove this video</button>' : ''}
    <p class="small muted" style="margin:0">A video you save plays here every time you do ${esc(sh.name)}, on every device you sign in to.</p>`;
}
// a redraw would restart a playing video: hold redraws while the sheet shows the same video (closing it or changing the video redraws)
function holdForVideo() {
  const v = document.getElementById('howto-video');
  return !!(v && S.sheet && S.sheet.type === 'howto' && v.dataset.v === formVideo(S.sheet.exId));
}
