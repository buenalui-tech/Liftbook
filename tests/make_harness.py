"""Builds a copy of Liftbook wired to tests/mock-supabase.js instead of the real Supabase,
so sync can be tested offline without an account.

    python3 tests/make_harness.py && cd /tmp/lb_harness && python3 -m http.server 8766
"""
import os
import shutil

OUT = '/tmp/lb_harness'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)
for f in ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'figure.glb']:
    shutil.copy(os.path.join(ROOT, f), OUT)
shutil.copy(os.path.join(ROOT, 'tests', 'mock-supabase.js'), OUT)

html = open(os.path.join(ROOT, 'index.html')).read()
html = html.replace('<script src="config.js"></script>',
                    '<script>window.LIFTBOOK_CONFIG={supabaseUrl:"https://mock.supabase.co",supabaseAnonKey:"mock"};</script>')
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>',
                    '<script src="mock-supabase.js"></script>')
assert 'mock-supabase.js' in html, 'Supabase script tag changed; update this script'
# test-only handle on the 3D figure, for pinning its angle in screenshots
html = html.replace('const Fig = {', 'const Fig = window.__fig = {', 1)
html = html.replace('const Comp = {', 'const Comp = window.__comp = {', 1)
open(os.path.join(OUT, 'index.html'), 'w').write(html)
print('harness ready in', OUT)
