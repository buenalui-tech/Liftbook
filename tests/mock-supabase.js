// In-browser stand-in for Supabase: tables in localStorage, row ownership enforced like RLS.
(function () {
  const K = 'mock.db', SK = 'mock.session';
  const load = () => JSON.parse(localStorage.getItem(K) || '{"users":{},"user_state":[],"workouts":[]}');
  const save = d => localStorage.setItem(K, JSON.stringify(d));
  let seq = 0;
  function builder(table, getUid) {
    const st = {filters: [], order: null, range: null, single: false, op: 'select'};
    const api = {
      select() { return api; }, eq(c, v) { st.filters.push(r => r[c] === v); return api; },
      gt(c, v) { st.filters.push(r => r[c] > v); return api; }, order(c) { st.order = c; return api; },
      range(a, b) { st.range = [a, b]; return api; }, maybeSingle() { st.single = true; return api; },
      upsert(rows, o) { st.op = 'upsert'; st.rows = [].concat(rows); st.on = o.onConflict.split(','); return api; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); }
    };
    function exec() {
      window.MOCK_CALLS = (window.MOCK_CALLS || 0) + 1;
      if (window.MOCK_OFFLINE) return {data: null, error: {message: 'Failed to fetch'}};
      const d = load(), uid = getUid(); if (!uid) return {data: null, error: {message: 'JWT missing'}};
      const t = d[table];
      if (st.op === 'upsert') {
        for (const r of st.rows) {
          if (r.user_id !== uid) return {data: null, error: {message: 'new row violates row-level security policy'}};
          const row = JSON.parse(JSON.stringify(r));
          if (table === 'workouts') row.synced_at = String(Date.now() * 1000 + (++seq)).padStart(20, '0');
          const i = t.findIndex(x => st.on.every(c => x[c] === row[c]));
          if (i >= 0) t[i] = {...t[i], ...row}; else t.push(row);
        }
        save(d); return {data: null, error: null};
      }
      let rows = t.filter(r => r.user_id === uid && st.filters.every(f => f(r)));
      if (st.order) rows.sort((a, b) => a[st.order] < b[st.order] ? -1 : 1);
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
      rows = JSON.parse(JSON.stringify(rows));
      return st.single ? {data: rows[0] || null, error: null} : {data: rows, error: null};
    }
    return api;
  }
  window.supabase = {createClient() {
    const ls = [], sess = () => JSON.parse(localStorage.getItem(SK) || 'null'), emit = ev => ls.forEach(f => f(ev, sess()));
    return {
      from: t => builder(t, () => sess() && sess().user.id),
      auth: {
        getSession: async () => ({data: {session: sess()}}),
        onAuthStateChange(f) { ls.push(f); setTimeout(() => f('INITIAL_SESSION', sess()), 0); return {data: {subscription: {unsubscribe() {}}}}; },
        signUp: async ({email, password}) => { const d = load(); if (d.users[email]) return {data: {}, error: {message: 'User already registered'}}; d.users[email] = {id: 'u-' + Math.random().toString(36).slice(2), password}; save(d); return {data: {session: null}, error: null}; },
        signInWithPassword: async ({email, password}) => { const d = load(), u = d.users[email]; if (!u || u.password !== password) return {data: {}, error: {message: 'Invalid login credentials'}}; const s = {user: {id: u.id, email}}; localStorage.setItem(SK, JSON.stringify(s)); setTimeout(() => emit('SIGNED_IN'), 0); return {data: {session: s}, error: null}; },
        signOut: async () => { localStorage.removeItem(SK); emit('SIGNED_OUT'); return {error: null}; }
      }
    };
  }};
})();
