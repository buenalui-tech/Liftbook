# Liftbook

A workout log that runs in your phone's browser and installs to the home screen. It comes preloaded with the Jeff Nippard 4-Day Upper/Lower program.

- Logs sets, shows what you did last time, and runs a rest timer
- Double progression: once every set reaches the top of the rep range, it tells you to add weight
- Plate loading for barbell lifts, records, strength charts, and weekly sets per muscle
- Food tab: search USDA FoodData Central and Open Food Facts, scan barcodes, log meals with portions, quick add, custom foods, daily calorie and macro targets
- Body tab: daily weigh-ins with a 7-day trend and weekly rate, InBody scans, and an avatar drawn from each scan's segmental lean and fat mass
- Works offline once installed
- Saves on the phone first (works offline), then syncs to your Supabase account when signed in

## Files

| File | What it is |
|---|---|
| `index.html` | The page shell; loads the stylesheet and scripts in order |
| `css/app.css` | All styling (colour tokens for light and dark at the top) |
| `js/*.js` | The app, split by area: `core` (helpers, library, storage, sync, state), `training`, `ui`, `howto` (form videos), `program`, `body`, `figure` (3D), `share`, `tester`, `events` (input and startup). Classic scripts sharing top-level names, loaded in that order |
| `manifest.webmanifest` | Lets phones install it as a home-screen app |
| `config.js` | Supabase project URL and publishable key (public by design) |
| `sw.js` | Offline cache. **Bump `VERSION` (and `APP_VERSION` in `js/core.js`) on every release** |
| `supabase/setup.sql` | Database tables and privacy rules for a new project. Run once in the Supabase SQL Editor (not used by the site) |
| `supabase/002_body_entries.sql` | Adds the weigh-in and scan table to an existing project |
| `supabase/003_feedback_and_errors.sql`, `004_food_entries.sql` | Feedback/crash tables; food log table |
| `supabase/005_delete_account.sql` | Lets people delete their own account from Settings (App Store requirement) |
| `privacy.html` | Privacy policy, linked from Settings and the sign-in form |
| `LICENSE` | All rights reserved: the code is public for hosting only |
| `tests/` | `node --test tests/app.test.mjs` runs the logic tests; `make_harness.py` builds a copy wired to a fake Supabase (not used by the site) |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons, drawn by `tools/make_icons.py` |

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy (GitHub Pages, free)

The site is served from `main` at https://buenalui-tech.github.io/Liftbook/. To publish an update:

```bash
git push
```

GitHub Pages rebuilds in about a minute. Phones pick up the new version the next time the app is opened.

## Cloud sync setup (Supabase, free)

1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste `supabase/setup.sql`, **Run**.
3. **Authentication → URL Configuration**: set **Site URL** to the GitHub Pages address.
4. **Project Settings → API**: copy the Project URL and the publishable (anon) key into `config.js`.
5. Upload `config.js` and the other site files, then sign up inside the app (Program tab).
