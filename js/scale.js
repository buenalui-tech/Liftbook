// Liftbook — Bluetooth food scale: connect, live weight, zero, and weighing straight into a portion.
// Classic script: files load in order (see index.html) and share top-level names.

/* Web Bluetooth works in Chrome on Android and computers, and on iPhone inside Bluetooth browsers such as Bluefy;
   Safari itself can't use it. Each scale model has a small driver that turns its packets into grams. */
const hexBytes = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

/* Etekcity Smart Nutrition Scale (ESN00). Protocol from the community write-up at github.com/hertzg/metekcity (MIT):
   FE EF C0 A2 · type · length · payload · checksum (low byte of type + length + payload).
   Weight (type D0): sign, weight × 10 (big-endian), unit (0 = g), settled. */
function esnPacket(type, payload) {
  const body = [type, payload.length, ...payload], sum = body.reduce((s, b) => (s + b) & 0xff, 0);
  return new Uint8Array([0xfe, 0xef, 0xc0, 0xa2, ...body, sum]);
}
function esnParse(b) {
  const out = [];
  for (let i = 0; i + 6 < b.length; i++) {
    if (b[i] !== 0xfe || b[i + 1] !== 0xef || b[i + 2] !== 0xc0 || b[i + 3] !== 0xa2) continue;
    const type = b[i + 4], len = b[i + 5], end = i + 6 + len;
    if (end >= b.length) break;
    const p = Array.from(b.slice(i + 6, end));
    if ([type, len, ...p].reduce((s, x) => (s + x) & 0xff, 0) !== b[end]) continue;
    if (type === 0xd0 && len >= 5) {
      const v = ((p[1] << 8) | p[2]) / 10 * (p[0] ? -1 : 1);
      out.push({grams: p[3] === 0 ? v : null, unit: p[3], stable: !!p[4]});
    }
    i = end;
  }
  return out;
}
const SCALE_DRIVERS = {
  esn00: {
    label: 'Etekcity Nutrition Scale', filters: [{name: 'Etekcity Nutrition Scale'}, {namePrefix: 'Etekcity'}],
    service: 0x1910, notify: 0x2c12, write: 0x2c11,
    start: () => esnPacket(0xc0, [0x00]),   // show and send grams
    tare: () => esnPacket(0xc1, [0x00]),
    parse: esnParse
  },
  // Decent Scale: published at decentespresso.com/decentscale_api. Weight is a signed 16-bit value × 10 in bytes 2–3.
  decent: {
    label: 'Decent Scale', filters: [{namePrefix: 'Decent'}],
    service: 0xfff0, notify: 0xfff4, write: 0x36f5,
    start: () => hexBytes('030A0101000108'),   // LED on: the scale only sends weight after a command
    tare: null,
    parse: b => b.length >= 4 && b[0] === 0x03 && (b[1] === 0xce || b[1] === 0xca) ? [{grams: (((b[2] << 8) | b[3]) << 16 >> 16) / 10, stable: b[1] === 0xce}] : []
  }
};
// services the recorder asks for, so an unknown scale's data can still be captured
const SCALE_SERVICES = [0x1910, 0xfff0, 0xffe0, 0xffb0, 0xffd0, 0x181d, 0x180a, 0x180f];
// full 128-bit names for 16-bit Bluetooth ids: some browsers (Bluefy among them) are stricter than Chrome about short ones
const uuid16 = n => typeof n === 'number' ? `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb` : n;
const bytesOf = v => new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
const errText = e => (e && (e.message || e.name)) || String(e || 'unknown error');
// what each connection step is called when it fails, so a problem can be pinned down
const SCALE_STEPS = {pick: 'opening the device list', gatt: 'connecting to the scale', service: 'finding the scale’s weight data', notify: 'starting the live weight', start: 'sending the start signal'};

const Scale = {
  status: 'off',   // off | connecting | on | lost
  name: '', dev: null, drv: null, wr: null, demo: false, demoG: 0,
  raw: null, offset: 0, stable: false, hist: [],
  rec: null,       // the recorder: {name, lines, packets}
  supported: () => typeof navigator !== 'undefined' && !!(navigator.bluetooth && navigator.bluetooth.requestDevice),
  grams() { return this.raw == null ? null : Math.round((this.raw - this.offset) * 10) / 10; },
  // any: list every Bluetooth device, for a scale that names itself differently than expected
  async connect(any) {
    if (!this.supported()) throw Object.assign(new Error('Bluetooth isn’t available in this browser.'), {name: 'Unsupported'});
    this.stopDemo(); this.lastErr = null; this.step = 'pick';
    const drivers = Object.values(SCALE_DRIVERS), services = [...new Set([...drivers.map(d => d.service), ...SCALE_SERVICES])].map(uuid16);
    // asked for inside the tap: browsers only show the device list in response to one
    let pick;
    try {
      pick = navigator.bluetooth.requestDevice(any ? {acceptAllDevices: true, optionalServices: services}
        : {filters: drivers.flatMap(d => d.filters), optionalServices: services});
    } catch (e) { pick = Promise.reject(e); }
    this.status = 'connecting'; this.changed(true);
    try { await this.attach(await pick); }
    catch (e) {
      this.status = 'off';
      if (e && e.name !== 'NotFoundError') this.lastErr = {step: this.step, text: errText(e), name: e && e.name, device: this.name, at: Date.now()};
      this.changed(true); throw e;
    }
  },
  async attach(dev) {
    this.step = 'gatt';
    if (this.dev !== dev) { this.dev = dev; dev.addEventListener('gattserverdisconnected', () => this.lost()); }
    this.name = dev.name || 'Scale';
    const gatt = await dev.gatt.connect();
    this.step = 'service';
    let drv = null, svc = null;
    for (const d of Object.values(SCALE_DRIVERS)) { try { svc = await gatt.getPrimaryService(uuid16(d.service)); drv = d; break; } catch {} }
    if (!drv) { try { gatt.disconnect(); } catch {} throw Object.assign(new Error('This device doesn’t have a known scale’s weight data. Record scale data (below) helps add it.'), {name: 'UnknownScale'}); }
    this.step = 'notify';
    const nt = await svc.getCharacteristic(uuid16(drv.notify));
    this.wr = drv.write ? await svc.getCharacteristic(uuid16(drv.write)).catch(() => null) : null;
    nt.addEventListener('characteristicvaluechanged', e => this.packet(bytesOf(e.target.value)));
    await nt.startNotifications();
    this.step = 'start';
    Object.assign(this, {drv, status: 'on', raw: null, offset: 0, stable: false, hist: [], lastErr: null});
    if (drv.start) await this.write(drv.start());
    S.profile.scaleName = this.name; store.saveProfile();
    this.changed(true);
  },
  write(bytes) {
    if (!this.wr) return Promise.resolve();
    const w = this.wr.writeValueWithoutResponse ? this.wr.writeValueWithoutResponse(bytes) : this.wr.writeValue(bytes);
    return Promise.resolve(w).catch(() => {});
  },
  packet(bytes) { for (const r of this.drv.parse(bytes)) this.feed(r); },
  // a reading: steady once it has stayed within 1 g for most of a second (and the scale agrees, when it says)
  feed(r) {
    if (r.grams == null) {   // the scale is showing another unit: ask for grams again, at most every 3 s
      if (this.drv && this.drv.start && Date.now() - (this.unitAsked || 0) > 3000) { this.unitAsked = Date.now(); this.write(this.drv.start()); }
      return;
    }
    const now = Date.now();
    this.raw = r.grams; this.hist.push([now, r.grams]); this.hist = this.hist.filter(h => now - h[0] < 900);
    const vals = this.hist.map(h => h[1]), span = Math.max(...vals) - Math.min(...vals);
    this.stable = r.stable !== false && this.hist.length >= 3 && span <= 1 && now - this.hist[0][0] >= 500;
    this.changed(false);
  },
  async tare() {
    const before = this.raw;
    this.hist = []; this.stable = false;
    if (this.drv && this.drv.tare) {
      this.offset = 0; await this.write(this.drv.tare());
      // a scale that ignores the command still gets zeroed, in the app
      setTimeout(() => { if (this.raw != null && Math.abs(this.raw) > 2 && before != null && Math.abs(this.raw - before) < 2) { this.offset = this.raw; this.changed(false); } }, 1500);
    } else this.offset = this.raw || 0;
    this.changed(false);
  },
  lost() {
    if (this.status !== 'on' || this.demo) return;
    this.status = 'lost'; this.changed(true);
    // scales sleep after a few minutes; try once to pick it straight back up
    setTimeout(() => { if (this.status === 'lost' && this.dev) this.attach(this.dev).catch(() => {}); }, 1000);
  },
  disconnect() {
    this.stopDemo();
    try { this.dev && this.dev.gatt && this.dev.gatt.connected && this.dev.gatt.disconnect(); } catch {}
    Object.assign(this, {status: 'off', drv: null, wr: null, raw: null, offset: 0, stable: false, hist: []});
    this.changed(true);
  },
  // a pretend scale, to try the flow before a real one arrives
  startDemo() {
    this.disconnect();
    Object.assign(this, {demo: true, status: 'on', name: 'Demo scale', demoG: 0, drv: {parse: () => [], tare: null}});
    this.demoT = setInterval(() => this.feed({grams: this.demoG, stable: true}), 100);
    this.changed(true);
  },
  stopDemo() { if (!this.demo) return; clearInterval(this.demoT); this.demo = false; this.status = 'off'; },

  /* The recorder: connects to any Bluetooth device and keeps everything it sends, so a scale that doesn't
     connect (or reads wrong) can be added from a real recording instead of guesses. */
  async record() {
    const pick = navigator.bluetooth.requestDevice({acceptAllDevices: true, optionalServices: SCALE_SERVICES.map(uuid16)});
    this.rec = {name: '', lines: [], packets: 0, t0: Date.now()};
    const dev = await pick, rec = this.rec, line = s => { if (rec.lines.length < 600) rec.lines.push(`${((Date.now() - rec.t0) / 1000).toFixed(1)} ${s}`); };
    rec.name = dev.name || 'unnamed device'; rec.dev = dev; line(`device "${rec.name}"`);
    const gatt = await dev.gatt.connect();
    for (const s of await gatt.getPrimaryServices().catch(() => [])) {
      for (const c of await s.getCharacteristics().catch(() => [])) {
        const p = c.properties, props = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(k => p[k]).join(',');
        line(`char ${s.uuid.slice(4, 8)}/${c.uuid.slice(4, 8)} ${props}`);
        if (p.notify || p.indicate) {
          c.addEventListener('characteristicvaluechanged', e => {
            const b = bytesOf(e.target.value); rec.packets++;
            const g = Object.values(SCALE_DRIVERS).flatMap(d => d.parse(b)).find(r => r.grams != null);
            line(`${c.uuid.slice(4, 8)} ${toHex(b)}${g ? ` = ${g.grams} g${g.stable ? ' steady' : ''}` : ''}`);
            const el = document.getElementById('rec-count'); if (el) el.textContent = `${rec.packets} readings recorded`;
          });
          await c.startNotifications().catch(() => line(`  couldn’t subscribe to ${c.uuid.slice(4, 8)}`));
        }
      }
    }
    render();
  },
  stopRecording() { try { this.rec && this.rec.dev && this.rec.dev.gatt.disconnect(); } catch {} },

  /* Live updates come 10 times a second: paint just the numbers, and redraw the screen only when the state changes. */
  changed(full) {
    if (full) { if (typeof render === 'function') render(); return; }
    this.paint();
  },
  paint() {
    const g = this.grams(), el = id => typeof document !== 'undefined' && document.getElementById(id);
    const big = el('sc-g'), st = el('sc-st');
    if (big) big.textContent = g == null ? '—' : fmtW(Math.max(-9999, Math.round(g)));
    if (st) { st.textContent = g == null ? 'Waiting for the scale…' : this.stable ? 'Steady' : 'Settling…'; st.className = 'small ' + (this.stable ? 'sc-steady' : 'muted'); }
    const sh = S.sheet;
    if (sh && sh.type === 'portion' && sh.weigh && g != null) {
      const q = Math.max(0, Math.round(g));
      if (q !== +sh.qty || sh.unit !== 'g') {
        sh.qty = q; sh.unit = 'g';
        const {grams, totals} = portionTotals(sh.food, q, 'g');
        const box = el('po-totals'); if (box) box.innerHTML = portionStats(totals, grams);
        const mi = el('po-micros'); if (mi) mi.innerHTML = portionMicros(sh.food, grams, q);
      }
    }
  }
};

/* ---------- screens ---------- */
const ICON_SCALE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9V6a5 5 0 0 1 10 0v3"/><path d="M12 13v3"/></svg>';
// in the portion sheet: a "Weigh on scale" button, or the live weight while weighing
function weighBlock(sh) {
  const f = sh.food;
  if (!f.per100 || f.source === 'quick') return '';
  if (sh.weigh && Scale.status === 'on') {
    const g = Scale.grams();
    return `<div class="weigh">
      <div class="row between"><span class="small muted row" style="gap:6px"><i class="sc-dot"></i>${esc(Scale.name)}</span><span id="sc-st" class="small ${Scale.stable ? 'sc-steady' : 'muted'}">${g == null ? 'Waiting for the scale…' : Scale.stable ? 'Steady' : 'Settling…'}</span></div>
      <div class="weigh-g num"><span id="sc-g">${g == null ? '—' : fmtW(Math.round(g))}</span><small>g</small></div>
      ${Scale.demo ? `<label class="small muted">Demo: slide to put food on the scale<input type="range" id="sc-demo" data-in="sc-demo" min="0" max="600" step="1" value="${Scale.demoG}"></label>` : ''}
      <div class="row"><button class="btn grow" data-act="sc-tare">Zero</button><button class="btn grow" data-act="sc-manual">Type amount instead</button></div>
      <p class="small muted" style="margin:0">Using a plate or bowl? Put it on first and tap Zero, then add the food.</p></div>`;
  }
  if (Scale.status === 'lost') return `<button class="btn block" data-act="sc-weigh">${ICON_SCALE} Scale disconnected · Reconnect</button>`;
  if (Scale.status === 'connecting') return `<button class="btn block" disabled>${ICON_SCALE} Connecting to the scale…</button>`;
  if (!Scale.supported() && Scale.status !== 'on') return '';
  return `<button class="btn block weigh-btn" data-act="sc-weigh">${ICON_SCALE} Weigh on scale</button>`;
}
function viewScaleSettings() {
  const on = Scale.status === 'on', rec = Scale.rec;
  if (!Scale.supported() && !on) return `<section class="card"><h3>Food scale</h3>
    <p class="small muted" style="margin:0">Weigh food straight into your log with a Bluetooth scale (works with the Etekcity Smart Nutrition Scale). ${isIOS()
      ? 'iPhone’s Safari can’t use Bluetooth, so open Liftbook in the free <b>Bluefy</b> browser from the App Store and sign in with the same account. Everything syncs.'
      : 'This browser can’t use Bluetooth. On Android or a computer, open Liftbook in Chrome.'}</p>
    <button class="btn" data-act="sc-demo-start">Try it with a demo scale</button></section>`;
  return `<section class="card"><h3>Food scale</h3>
    <div class="set-row"><span class="stack" style="gap:1px"><span>${on ? esc(Scale.name) : Scale.status === 'connecting' ? 'Connecting…' : 'Not connected'}</span>
      <span class="small muted">${on ? (Scale.demo ? 'Pretend weights, to try the flow' : 'Connected') : S.profile.scaleName ? `Last used: ${esc(S.profile.scaleName)}` : 'Etekcity Smart Nutrition Scale (ESN00)'}</span></span>
      ${on ? '<button class="btn" data-act="sc-disconnect">Disconnect</button>' : '<button class="btn primary" data-act="sc-connect">Connect</button>'}</div>
    ${Scale.lastErr ? `<div class="banner small" style="flex-direction:column;align-items:flex-start;gap:6px"><span><b>Couldn’t connect</b> while ${esc(SCALE_STEPS[Scale.lastErr.step] || Scale.lastErr.step)}${Scale.lastErr.device && Scale.lastErr.step !== 'pick' ? ` (${esc(Scale.lastErr.device)})` : ''}:</span><span class="num">${esc(Scale.lastErr.text)}</span>
      <span class="muted">Close the scale’s own app, tap the scale to wake it, and try again. If it isn’t in the list, use “Show all Bluetooth devices”.</span></div>` : ''}
    ${on ? '' : '<button class="btn ghost" data-act="sc-connect-any" style="align-self:flex-start;padding-left:0">Scale not in the list? Show all Bluetooth devices</button>'}
    <p class="small muted" style="margin:0">When you add a food, tap <b>Weigh on scale</b> and the grams fill in by themselves. Don’t pair the scale in its own app at the same time; a scale talks to one app at once.</p>
    ${on ? '' : '<button class="btn ghost" data-act="sc-demo-start" style="align-self:flex-start;padding-left:0">Try it with a demo scale</button>'}
    <details ${rec ? 'open' : ''}><summary class="small muted">Scale not connecting or reading wrong?</summary>
      <div class="stack" style="gap:8px;margin-top:8px">
        <p class="small muted" style="margin:0">Record what your scale sends: connect, put a few things on it (and take them off), then send the recording so support for your scale can be added or fixed.</p>
        ${rec ? `<p class="small" style="margin:0"><b>${esc(rec.name)}</b> · <span id="rec-count">${rec.packets} readings recorded</span></p>
          <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="rec-send">Send recording</button><button class="btn" data-act="rec-copy">Copy</button><button class="btn" data-act="rec-stop">Discard</button></div>`
          : '<button class="btn" data-act="rec-start" style="align-self:flex-start">Record scale data</button>'}
      </div></details>
  </section>`;
}
// recordings go in the feedback table, split to fit its 4,000-character rows
async function sendRecording() {
  const rec = Scale.rec; if (!rec) return;
  const text = rec.lines.join('\n'), parts = [];
  for (let i = 0; i < text.length && parts.length < 4; i += 3800) parts.push(text.slice(i, i + 3800));
  let sent = true;
  for (const [i, p] of parts.entries()) sent = await Outbox.add('feedback', {kind: 'scale', message: `Scale recording ${i + 1}/${parts.length} (${rec.name})\n${p}`, email: Sync.user ? Sync.user.email : null, screen: 'settings', app_version: APP_VERSION, device: device()}) && sent;
  Scale.stopRecording(); Scale.rec = null; render();
  toast(sent ? 'Recording sent. Thank you!' : 'Saved. It’ll send when you’re back online.');
}
