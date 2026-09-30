# Liftbook

A workout log that runs in your phone's browser and installs to the home screen. It comes preloaded with the Jeff Nippard 4-Day Upper/Lower program.

- Logs sets, shows what you did last time, and runs a rest timer
- Double progression: once every set reaches the top of the rep range, it tells you to add weight
- Plate loading for barbell lifts, records, strength charts, and weekly sets per muscle
- Works offline once installed
- Saves on the phone first (works offline), then syncs to your Supabase account when signed in

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app |
| `manifest.webmanifest` | Lets phones install it as a home-screen app |
| `config.js` | Supabase project URL and publishable key (public by design) |
| `sw.js` | Offline cache. **Bump `VERSION` whenever you change `index.html`** |
| `supabase/setup.sql` | Database tables and privacy rules. Run once in the Supabase SQL Editor (not uploaded to the site) |
| `tests/` | A fake Supabase for testing sync without an account (not uploaded to the site) |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons, drawn by `tools/make_icons.py` |

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy (GitHub Pages, free)

1. Create a public repo on GitHub and push this folder to it.
2. In the repo, open **Settings → Pages**, set **Source** to *Deploy from a branch*, and choose `main` / `(root)`.
3. The site goes live at `https://<username>.github.io/<repo>/` about a minute later.

## Cloud sync setup (Supabase, free)

1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste `supabase/setup.sql`, **Run**.
3. **Authentication → URL Configuration**: set **Site URL** to the GitHub Pages address.
4. **Project Settings → API**: copy the Project URL and the publishable (anon) key into `config.js`.
5. Upload `config.js` and the other site files, then sign up inside the app (Program tab).
