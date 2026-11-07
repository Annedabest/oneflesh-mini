/* Budget app UI */
(function () {
  const E = window.BudgetEngine;
  const CFG = window.BUDGET_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = E.money;
  const LS = { data: 'budget.data', key: 'budget.key', pending: 'budget.pending', test: 'budget.test' };
  const PEOPLE = ['Anne', 'Ricardo', 'Joint'];
  const PRIOS = [['1 Essential', 'Must pay', 'pr1'], ['2 Important', 'Important', 'pr2'], ['3 Nice', 'Nice to have', 'pr3'], ['4 Cut first', 'Cut first', 'pr4']];
  const FREQS = ['Monthly', 'Weekly', 'Every 2 weeks', 'Quarterly', 'Twice a year', 'Yearly', 'One-time'];
  const CURS = ['CAD', 'USD', 'USDT', 'BRL'];
  const CATS = ['Housing', 'Taxes', 'Utilities', 'Groceries', 'Car', 'Insurance', 'Health', 'Debt', 'Phone/Internet', 'Home', 'Work tools', 'Subscriptions', 'Giving', 'Fees', 'Dining out', 'Travel', 'Gifts', 'Clothing', 'Other'];

  // ---------- state ----------
  const hashKey = (location.hash.match(/k=([A-Za-z0-9]+)/) || [])[1];
  if (hashKey) { localStorage.setItem(LS.key, hashKey); history.replaceState(null, '', location.pathname + location.search); }
  const key = localStorage.getItem(LS.key) || '';
  window.addEventListener('hashchange', () => { const k = (location.hash.match(/k=([A-Za-z0-9]+)/) || [])[1]; if (k) { localStorage.setItem(LS.key, k); location.replace(location.pathname); } });
  const live = !!CFG.apiUrl;
  let data = JSON.parse(localStorage.getItem(LS.data) || 'null') || (live ? { settings: clone(window.DEMO_DATA.settings), income: [], expenses: [], savings: [] } : clone(window.DEMO_DATA));
  let pending = JSON.parse(localStorage.getItem(LS.pending) || '[]');
  let syncState = live ? (key ? 'loading' : 'nokey') : 'demo';
  let lastSync = null;
  const st = { tab: 'home', sub: null, filter: 'All', openMonth: null };
  const test = Object.assign({ name: '', price: 1000, cur: 'CAD', t: 0, mode: 'All at once', annePct: 0.5 }, JSON.parse(localStorage.getItem(LS.test) || '{}'));
  let scen = localStorage.getItem('budget.scenario') || 'Normal'; // per phone, not synced
  let R = E.compute(data, scen);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- themes ----------
  const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['future', 'Future'], ['cyber', 'Cyber']];
  const THEME_BAR = { light: '#1E293B', dark: '#0E1626', future: '#05070F', cyber: '#0B0816' };
  const THEME_FONTS = { future: 'family=Space+Grotesk:wght@500;700', cyber: 'family=Orbitron:wght@600;800&family=Rajdhani:wght@500;600;700' };
  const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  let theme = localStorage.getItem('budget.theme') || 'auto';
  function applyTheme(t) {
    theme = t; localStorage.setItem('budget.theme', t);
    const real = t === 'auto' ? (darkMQ && darkMQ.matches ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = real;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = THEME_BAR[real];
    if (THEME_FONTS[real] && !document.getElementById('font-' + real)) {
      const l = document.createElement('link'); l.id = 'font-' + real; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?' + THEME_FONTS[real] + '&display=swap'; document.head.appendChild(l);
    }
  }
  applyTheme(theme);
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => theme === 'auto' && applyTheme('auto'));
  function recompute() { R = E.compute(data, scen); }
  function persist() { localStorage.setItem(LS.data, JSON.stringify(data)); localStorage.setItem(LS.pending, JSON.stringify(pending)); }

  // ---------- sync ----------
  async function api(body) {
    if (body) {
      const r = await fetch(CFG.apiUrl, { method: 'POST', body: JSON.stringify(Object.assign({ key }, body)) });
      return r.json();
    }
    const r = await fetch(CFG.apiUrl + '?key=' + encodeURIComponent(key) + '&t=' + Date.now());
    return r.json();
  }
  async function pull() {
    if (!live || !key) return render();
    setSync('loading');
    try {
      await pushPending();
      const res = await api();
      if (res.error === 'key') return setSync('nokey');
      if (res.error) throw new Error(res.error);
      data = res; persist(); recompute(); lastSync = new Date(); setSync('ok'); render();
    } catch (e) { setSync('offline'); }
  }
  async function pushPending() {
    let last = null;
    while (pending.length) {
      const p = pending[0];
      const body = p.table === 'settings' ? { settings: data.settings } : { table: p.table, rows: data[p.table], confirmEmpty: true };
      const res = await api(body);
      if (res.error) throw new Error(res.error);
      pending.shift(); persist();
      last = res;
    }
    if (last) { data = last; persist(); }
  }
  async function save(table) {
    recompute(); render();
    if (!pending.find(p => p.table === table)) pending.push({ table });
    persist();
    if (!live) { toast('Saved on this phone (demo)'); pending = []; persist(); return; }
    if (!key) return setSync('nokey');
    setSync('saving');
    try {
      await pushPending(); recompute(); lastSync = new Date(); setSync('ok'); render(); toast('Saved ✓');
    } catch (e) { setSync('offline'); toast('Saved on phone. Will sync when online.'); }
  }
  function setSync(s) {
    syncState = s;
    const b = $('#sync');
    const t = { demo: 'Demo', loading: '⟳ Loading', saving: '⟳ Saving', ok: '✓ Synced', offline: '⚠ Not synced', nokey: '⚠ Open setup link' }[s];
    b.textContent = t; b.className = 'sync' + (s === 'offline' || s === 'nokey' ? ' bad' : '');
  }
  window.addEventListener('online', pull);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });

  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2200); }

  // ---------- helpers ----------
  const prioOf = p => PRIOS.find(x => x[0] === p) || PRIOS[3];
  const curIdx = () => { const now = new Date(); const i = now.getFullYear() * 12 + now.getMonth() - R.months[0]; return Math.min(Math.max(i, 0), R.months.length - 1); };
  const opts = (name, list, val, cls) => `<div class="opts">${list.map(o => {
    const [v, l, c] = Array.isArray(o) ? o : [o, o, ''];
    return `<button type="button" class="opt ${c || ''} ${cls ? v : ''} ${String(v) === String(val) ? 'on' : ''}" data-set="${name}" data-val="${esc(v)}">${esc(l)}</button>`;
  }).join('')}</div>`;
  const monthOpts = () => R.months.map((m, k) => [k, E.label(m)]);
  const cls = v => (v < 0 ? 'bad' : 'good');

  // ---------- views ----------
  let lastView = '';
  function render() {
    const view = st.tab + '/' + (st.sub || '');
    $('#view').classList.toggle('enter', view !== lastView); lastView = view; $('#view').dataset.v = st.sub || st.tab;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === st.tab));
    const v = { home: vHome, bills: vBills, test: vTest, more: vMore }[st.tab]();
    $('#view').innerHTML = v;
    $('#title').textContent = st.sub ? { income: 'Income', savings: 'Savings', crisis: 'If clients stop', settings: 'Settings' }[st.sub] : { home: 'OneFlesh Mini', bills: 'Bills', test: 'Test a purchase', more: 'More' }[st.tab];
    if (st.tab === 'test') renderTestResult();
  }

  function vHome() {
    const i = curIdx(), r = R.rows[i];
    const sc = R.scenario;
    let h = `<div class="seg a-seg" style="margin-top:6px">${[['Normal', 'Normal'], ['Worst case', 'Worst case'], ['No clients', 'No clients']].map(([v, l]) => `<button data-act="scenario" data-val="${v}" class="${sc === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    h += `<div class="card hero a-hero ${r.left < 0 ? 'red' : ''}">
      <div class="muted small">Left in ${E.label(r.m, 'month')}</div>
      <div class="big">${money(r.left)}</div>
      <div class="muted small">In ${money(r.in)} · Bills ${money(r.out)}${r.saving ? ' · Saved ' + money(r.saving) : ''}</div></div>`;
    h += `<div class="grid2 a-kpi"><div class="card"><div class="muted small">Average left / month</div><div class="mid ${cls(R.avgLeft)}">${money(R.avgLeft)}</div></div>
      <div class="card"><div class="muted small">Built up by ${E.label(R.months[R.months.length - 1])}</div><div class="mid ${cls(R.endTotal)}">${money(R.endTotal)}</div></div></div>`;

    // alerts
    let al = '';
    R.redMonths.forEach(m => {
      const big = m.items[0];
      const idx = big ? data.expenses.indexOf(big.e) : -1;
      al += `<div class="alert"><div>⚠️</div><div><b>${m.label}: ${money(m.left)}</b><span class="small">Biggest bill: ${esc(big ? big.name : '')} ${big ? money(big.cost) : ''}</span></div>${idx >= 0 ? `<button class="go" data-act="editBill" data-i="${idx}">Spread it ›</button>` : ''}</div>`;
    });
    const c = R.crisis;
    al += `<div class="alert ${c.verdict === 'good' ? 'ok' : c.verdict === 'tight' ? 'amber' : ''}"><div>${c.verdict === 'good' ? '🟢' : c.verdict === 'tight' ? '🟠' : '🔴'}</div><div><b>If clients stop: ${money(c.left, { plus: true })}/mo</b><span class="small">${c.verdict === 'good' ? 'Covered' : c.verdict === 'tight' ? 'Covered, but tight' : 'Not covered'}</span></div><button class="go" data-act="goSub" data-val="crisis">See ›</button></div>`;
    const ef = (data.savings || []).find(s => /emergency/i.test(s.name));
    if (!ef || !Number(ef.perMonth)) al += `<div class="alert amber"><div>🛟</div><div><b>No emergency fund yet</b><span class="small">Goal: ${money(c.ef3)} (3 months)</span></div><button class="go" data-act="goSub" data-val="savings">Start ›</button></div>`;
    h += `<div class="card a-alerts"><h3>Heads up</h3>${al}</div>`;

    // months
    const max = Math.max(...R.rows.map(x => Math.abs(x.left)), 1);
    h += `<div class="card months a-months"><h3>Month by month · tap one</h3>`;
    R.rows.forEach((x, k) => {
      h += `<button class="m" style="width:100%" data-act="month" data-i="${k}"><span class="small ${k === i ? '' : 'muted'}" style="text-align:left;font-weight:${k === i ? 700 : 400}">${x.short}</span>
        <span class="bar ${x.left < 0 ? 'neg' : ''}"><i style="width:${Math.max(3, Math.abs(x.left) / max * 100)}%"></i></span><span class="amt ${x.left < 0 ? 'bad' : ''}">${money(x.left)}</span></button>`;
      if (st.openMonth === k) {
        h += `<div class="detail"><div class="row between"><span>Money in</span><b>${money(x.in)}</b></div>
          ${[1, 2, 3, 4].map(p => x.byPrio[p] ? `<div class="row between"><span class="row"><i class="dot p${p}"></i>${PRIOS[p - 1][1]}</span><span>${money(x.byPrio[p])}</span></div>` : '').join('')}
          ${x.saving ? `<div class="row between"><span>Savings</span><span>${money(x.saving)}</span></div>` : ''}
          <div class="small muted" style="margin-top:6px">Biggest: ${x.items.slice(0, 3).map(t => esc(t.name) + ' ' + money(t.cost)).join(' · ')}</div></div>`;
      }
    });
    h += `</div>`;

    // who pays
    const avgBy = p => R.rows.reduce((a, x) => a + x.byWho[p], 0) / R.rows.length;
    h += `<div class="card a-who"><h3>Who pays (average / month)</h3>`;
    ['Anne', 'Ricardo'].forEach(p => {
      const earn = R.inByWho[p], pay = avgBy(p), d = earn - pay;
      h += `<div class="row between" style="padding:8px 0"><span class="who ${p}">${p}</span><span class="small muted">earns ${money(earn)} · pays ${money(pay)}</span><b class="${cls(d)}">${money(d, { plus: true })}</b></div>`;
    });
    const j = avgBy('Joint'); if (j) h += `<div class="row between" style="padding:8px 0"><span class="who Joint">Joint</span><span></span><b>${money(j)}</b></div>`;
    h += `</div>`;
    return h;
  }

  function vBills() {
    const list = data.expenses.map((e, i) => ({ e, i })).filter(x => x.e.name && (st.filter === 'All' || x.e.who === st.filter));
    const avgOf = e => { const b = R.billAvg.find(y => y.e === e); return b ? b : { avg: 0, cad: 0 }; };
    const total = list.reduce((a, x) => a + avgOf(x.e).avg, 0);
    let h = `<div class="card"><div class="muted small">${st.filter === 'All' ? 'All bills' : st.filter + "'s bills"}, average per month</div><div class="mid">${money(total)}</div></div>`;
    h += `<div class="chips">${['All', ...PEOPLE].map(f => `<button class="chip ${st.filter === f ? 'on' : ''}" data-act="filter" data-val="${f}">${f}</button>`).join('')}</div>`;
    h += `<div class="groups">`;
    PRIOS.forEach(([p, lab], k) => {
      const g = list.filter(x => E.prioNum(x.e.prio) === k + 1);
      if (!g.length) return;
      g.sort((a, b) => avgOf(b.e).avg - avgOf(a.e).avg || avgOf(b.e).cad - avgOf(a.e).cad);
      h += `<div class="group"><h4><i class="dot p${k + 1}"></i>${lab}<span class="sum">${money(g.reduce((a, x) => a + avgOf(x.e).avg, 0))}/mo</span></h4>`;
      g.forEach(({ e, i }) => {
        const a = avgOf(e);
        const amt = e.freq === 'One-time' ? `${money(a.cad)}<div class="small muted">once</div>` : `${money(a.avg)}<div class="small muted">/mo</div>`;
        h += `<button class="bill ${esc(e.who)}" data-act="editBill" data-i="${i}"><div><div class="name">${esc(e.name)}</div><div class="desc">${esc(E.describe(e, R.ctx))}</div></div><div class="amt">${amt}</div></button>`;
      });
      h += `</div>`;
    });
    h += `</div>`;
    if (!list.length) h += `<div class="empty">No bills yet. Tap + to add one.</div>`;
    h += `<button class="fab" data-act="newBill" aria-label="Add bill">+</button>`;
    return h;
  }

  function vTest() {
    const modes = ['All at once', 'Split in 3', 'Split in 6', 'Split in 12', 'Save up before'];
    return `<div class="card">
      <div class="field"><label>What</label><input class="input" data-test="name" value="${esc(test.name)}" placeholder="New couch"></div>
      <div class="field"><label>Price</label><input class="input" data-test="price" type="number" inputmode="decimal" value="${esc(test.price)}"></div>
      <div class="field">${opts('test.cur', CURS, test.cur)}</div>
      <div class="field"><label>When</label><select class="input" data-test="t">${monthOpts().map(([k, l]) => `<option value="${k}" ${k === Number(test.t) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>How we pay</label>${opts('test.mode', modes, test.mode)}</div>
      <div class="field"><label>Who pays</label><input type="range" min="0" max="100" step="5" data-test="annePct" value="${Math.round(test.annePct * 100)}">
        <div class="row between small"><span class="who Anne" id="pa">Anne ${Math.round(test.annePct * 100)}%</span><span class="who Ricardo" id="pr">Ricardo ${100 - Math.round(test.annePct * 100)}%</span></div></div>
    </div><div id="testres"></div>`;
  }
  function renderTestResult() {
    const el = $('#testres'); if (!el) return;
    const cad = Number(test.price || 0) * (R.ctx.fx[test.cur] ?? 1);
    if (!cad) { el.innerHTML = ''; return; }
    const T = E.testPurchase(R, { cad, t: Number(test.t), mode: test.mode, annePct: test.annePct });
    const ok = T.redPaying === 0;
    let h = `<div class="card"><div class="verdict ${ok ? 'good' : 'bad'}">${ok ? '✅ Doable' : '❌ Not OK'}</div>
      <div class="small muted">${ok ? 'No month goes red.' : T.redPaying + ' month(s) go red.'}${test.cur !== 'CAD' ? ' ≈ ' + money(cad) + ' CAD.' : ''}</div>
      <div class="row between" style="margin-top:10px"><span class="who Anne">Anne alone</span><b class="${T.anneShort ? 'bad' : 'good'}">${test.annePct === 0 ? 'Pays nothing' : T.anneShort ? '❌ Short ' + T.anneShort + ' mo' : '✅ Can cover'}</b></div>
      <div class="row between" style="margin-top:6px"><span class="who Ricardo">Ricardo alone</span><b class="${T.ricShort ? 'bad' : 'good'}">${test.annePct === 1 ? 'Pays nothing' : T.ricShort ? '❌ Short ' + T.ricShort + ' mo' : '✅ Can cover'}</b></div></div>`;
    h += `<div class="card"><h3>Months you pay</h3>`;
    R.rows.forEach((r, k) => {
      if (!T.paying[k]) return;
      h += `<div class="row between" style="padding:6px 0"><span>${r.short}</span><span class="small muted">A ${money(T.anneShare[k])} · R ${money(T.ricShare[k])}</span><b class="${cls(T.after[k])}">${money(T.after[k])} left</b></div>`;
    });
    if (T.c.reduce((a, b) => a + b, 0) < cad - 1) h += `<div class="small muted">Some payments fall after ${R.rows[R.rows.length - 1].short}.</div>`;
    h += `</div><div class="card"><h3>Compare · tap to pick</h3><div class="cmp"><span class="h">Way</span><span class="h">Per month</span><span class="h">Lowest month</span>`;
    T.compare.forEach(c => {
      h += `<button style="text-align:left" class="${c.mode === test.mode ? 'pick' : ''}" data-set="test.mode" data-val="${c.mode}">${c.mode === test.mode ? '● ' : ''}${c.mode}</button><span>${money(c.per)}</span><span class="${cls(c.lowest)}"><b>${money(c.lowest)}</b>${c.red ? ' ⚠' : ''}</span>`;
    });
    h += `</div></div>`;
    el.innerHTML = h;
  }

  function vMore() {
    if (st.sub) return { income: vIncome, savings: vSavings, crisis: vCrisis, settings: vSettings }[st.sub]();
    const c = R.crisis;
    return `<div class="card"><h3>Look</h3><div class="themes">${THEMES.map(([k, l]) => `<button class="th th-${k} ${theme === k ? 'on' : ''}" data-act="theme" data-val="${k}"><i></i>${l}</button>`).join('')}</div></div>
      <div class="card list">
      <button class="item" data-act="goSub" data-val="income"><span>💵 Income</span><span class="muted">${money(R.totalIn)}/mo ›</span></button>
      <button class="item" data-act="goSub" data-val="savings"><span>🐷 Savings</span><span class="muted">${money((data.savings || []).reduce((a, s) => a + Number(s.perMonth || 0), 0))}/mo ›</span></button>
      <button class="item" data-act="goSub" data-val="crisis"><span>🛟 If clients stop</span><span class="${cls(c.left)}">${money(c.left, { plus: true })}/mo ›</span></button>
      <button class="item" data-act="goSub" data-val="settings"><span>⚙️ Settings & sync</span><span class="muted">›</span></button>
      <a href="${esc(CFG.sheetUrl)}" target="_blank" rel="noopener"><span>📊 Open Google Sheet</span><span class="muted">↗</span></a></div>`;
  }
  const back = `<button class="chip" data-act="back" style="margin-top:6px">‹ Back</button>`;

  function vIncome() {
    let h = back;
    data.income.forEach((i, k) => {
      if (!i.name) return;
      const cad = Number(i.expected || 0) * (R.ctx.fx[i.cur] ?? 1) * (1 - Number(i.tax || 0));
      h += `<button class="bill ${esc(i.who)}" data-act="editIncome" data-i="${k}"><div><div class="name">${esc(i.name)}</div><div class="desc">${esc(i.cur)} ${Number(i.expected || 0).toLocaleString('en-CA')}${i.canStop === 'Yes' ? ' · can stop' : ' · steady'}${Number(i.tax) ? ' · tax ' + Math.round(i.tax * 100) + '%' : ''}</div></div><div class="amt">${money(cad)}<div class="small muted">/mo</div></div></button>`;
    });
    return h + `<button class="fab" data-act="newIncome">+</button>`;
  }
  function vSavings() {
    let h = back + `<div class="card small">Money you put aside each month. It comes out of “left”. Emergency fund goal: <b>${money(R.crisis.ef3)}</b> (3 months).</div>`;
    data.savings.forEach((s, k) => {
      if (!s.name) return;
      const pct = Number(s.target) ? Math.min(100, Number(s.saved || 0) / Number(s.target) * 100) : 0;
      h += `<button class="card" style="width:100%;text-align:left;display:block" data-act="editSaving" data-i="${k}"><div class="row between"><b>${esc(s.name)}</b><b>${money(Number(s.perMonth || 0))}/mo</b></div>
        <div class="small muted">${money(Number(s.saved || 0))} saved${Number(s.target) ? ' of ' + money(Number(s.target)) : ''}${s.by ? ' · by ' + E.label(E.ym(s.by)) : ''}${s.keep === 'Yes' ? ' · keep if clients stop' : ''}</div>
        ${Number(s.target) ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}</button>`;
    });
    return h + `<button class="fab" data-act="newSaving">+</button>`;
  }
  function vCrisis() {
    const c = R.crisis;
    return back + `<div class="card hero ${c.left < 0 ? 'red' : ''}"><div class="muted small">If Anne's clients stop, left each month</div><div class="big">${money(c.left, { plus: true })}</div>
      <div class="muted small">${c.verdict === 'good' ? 'Covered' : c.verdict === 'tight' ? 'Covered, but tight' : 'Not covered'} · after cutting all Nice and Cut first</div></div>
      <div class="card"><div class="row between"><span>Still coming in</span><b>${money(c.surviving)}</b></div>
      <div class="row between" style="margin-top:8px"><span>Must pay + Important</span><b>${money(-c.mustAvg)}</b></div>
      <div class="row between" style="margin-top:8px"><span>Savings you keep</span><b>${money(-c.keepSaving)}</b></div>
      <div class="row between" style="margin-top:8px"><span>Heaviest month</span><b>${c.heaviest.label}: ${money(c.heaviest.byPrio[1] + c.heaviest.byPrio[2])}</b></div>
      ${c.runway != null ? `<div class="row between" style="margin-top:8px"><span>Emergency cash lasts</span><b>${c.runway.toFixed(1)} months</b></div>` : ''}</div>
      <div class="card"><h3>Cutting frees up</h3><div class="row between"><span class="row"><i class="dot p4"></i>Cut first</span><b>${money(c.cutAvg)}/mo</b></div>
      <div class="row between" style="margin-top:8px"><span class="row"><i class="dot p3"></i>Nice to have</span><b>${money(c.niceAvg)}/mo</b></div></div>
      <div class="card"><h3>Emergency fund goal</h3><div class="row between"><span>3 months</span><b>${money(c.ef3)}</b></div><div class="row between" style="margin-top:8px"><span>6 months</span><b>${money(c.ef6)}</b></div></div>`;
  }
  function vSettings() {
    const fx = R.ctx.fx;
    return back + `<div class="card"><div class="field" style="margin-top:0"><label>Emergency cash we can reach fast (CAD)</label>
      <input class="input" type="number" inputmode="decimal" id="efcash" value="${esc(data.settings.efCash || 0)}"></div>
      <button class="btn" data-act="saveEf">Save</button></div>
      <div class="card"><h3>Exchange rates (auto)</h3>${['USD', 'USDT', 'BRL'].map(c => `<div class="row between"><span>1 ${c}</span><b>${(fx[c] || 0).toFixed(4)} CAD</b></div>`).join('')}</div>
      <div class="card"><h3>Sync</h3><div class="small muted">${live ? (key ? (lastSync ? 'Last sync ' + lastSync.toLocaleTimeString() : 'Not synced yet') : 'Open the setup link on this phone.') : 'Demo mode: changes stay on this phone.'}</div>
      ${live && key ? '<button class="btn light" style="margin-top:10px;width:100%" data-act="pull">Sync now</button>' : ''}</div>`;
  }

  // ---------- edit sheets ----------
  let form = null; // {kind, i, f}
  function openForm(kind, i, f) { form = { kind, i, f: clone(f) }; drawForm(); $('#sheet').classList.remove('hidden'); }
  function closeForm() { form = null; $('#sheet').classList.add('hidden'); $('#sheet').innerHTML = ''; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && form) closeForm(); });
  function drawForm() {
    const s = $('#sheet');
    const scroll = s.querySelector('.panel') ? s.querySelector('.panel').scrollTop : 0;
    s.innerHTML = `<div class="panel"><div class="grab"></div>${{ bill: fBill, income: fIncome, saving: fSaving }[form.kind]()}</div>`;
    s.querySelector('.panel').scrollTop = scroll;
  }
  const inp = (k, v, type, ph) => `<input class="input" data-f="${k}" ${type ? `type="${type}"` : ''} ${type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v ?? '')}" placeholder="${esc(ph || '')}">`;
  const btns = del => `<div class="btns">${del ? '<button class="btn danger" data-act="delete">Delete</button>' : ''}<button class="btn light" data-act="cancel">Cancel</button><button class="btn" data-act="saveForm">Save</button></div>`;

  function fBill() {
    const f = form.f;
    const recurring = E.PERIOD[f.freq];
    const one = f.freq === 'One-time';
    const howKind = E.isPick(f.how) ? 'pick' : f.how === E.SAVE ? 'save' : String(f.how || '').startsWith('Split') ? 'split' : 'once';
    const pick = howKind === 'pick';
    const picks = pick ? E.parsePicks(f.how, one) : [];
    let h = `<h2>${form.i == null ? 'New bill' : 'Edit bill'}</h2>
      <div class="field"><label>What</label>${inp('name', f.name, '', 'Netflix')}</div>
      <div class="field"><label>Amount each time</label>${inp('amount', f.amount, 'number')}</div>
      <div class="field">${opts('cur', CURS, f.cur)}</div>
      <div class="field"><label>Who pays</label>${opts('who', PEOPLE, f.who, true)}</div>
      <div class="field"><label>How important</label>${opts('prio', PRIOS.map(p => [p[0], p[1], p[2]]), f.prio)}</div>
      <div class="field"><label>How often</label>${opts('freq', FREQS, f.freq)}</div>`;
    if (recurring) h += `<div class="field"><label>${pick ? 'Must be paid by (optional)' : "Month it's due"}</label><div class="opts months">${E.MONTH_NAMES.map((m, k) => `<button type="button" class="opt ${Number(f.due) === k + 1 ? 'on' : ''}" data-set="due" data-val="${k + 1}">${m.slice(0, 3)}</button>`).join('')}</div></div>`;
    if (one) h += `<div class="field"><label>${pick ? 'Must be paid by (optional)' : 'When'}</label><input class="input" type="month" data-f="start" value="${esc(f.start || '')}"></div>`;
    if (recurring || one) {
      h += `<div class="field"><label>How we pay it</label>${opts('howKind', [['once', 'All at once'], ['split', 'Split in payments'], ['save', one ? 'Save up before' : 'Save a bit each month'], ['pick', 'Pick months']], howKind)}</div>`;
      if (pick) {
        const choices = one ? Array.from({ length: E.N_MONTHS }, (_, k) => [R.ctx.start + k, E.label(R.ctx.start + k, 'short')]) : E.MONTH_NAMES.map((m, k) => [k, m.slice(0, 3)]);
        h += `<div class="field"><label>Months we pay${picks.length ? ' (' + picks.length + ')' : ''}</label><div class="opts months">${choices.map(([v, l]) => `<button type="button" class="opt ${picks.includes(v) ? 'on' : ''}" data-set="pick" data-val="${v}">${l}</button>`).join('')}</div></div>`;
      }
      if (howKind === 'split') {
        const max = one ? 12 : recurring;
        h += `<div class="field"><label>How many payments</label>${opts('splitN', [2, 3, 4, 6, 12].filter(x => x <= max), (String(f.how).match(/\d+/) || [])[0])}</div>`;
      }
    }
    h += `<div class="field"><label>What happens</label><div class="preview">${esc(E.describe(Object.assign({}, f, { name: f.name || 'x' }), R.ctx)) || '-'}</div></div>
      <details><summary>More</summary>
      ${one ? '' : `<div class="field"><label>Starts</label><input class="input" type="month" data-f="start" value="${esc(f.start || '')}"></div>`}
      <div class="field"><label>Ends (optional)</label><input class="input" type="month" data-f="end" value="${esc(f.end || '')}"></div>
      <div class="field"><label>Category</label><select class="input" data-f="cat"><option></option>${CATS.map(c => `<option ${c === f.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Notes</label>${inp('notes', f.notes)}</div></details>${btns(form.i != null)}`;
    return h;
  }
  function fIncome() {
    const f = form.f;
    return `<h2>${form.i == null ? 'New income' : 'Edit income'}</h2>
      <div class="field"><label>Source</label>${inp('name', f.name, '', 'Client X')}</div>
      <div class="field"><label>Who</label>${opts('who', PEOPLE, f.who, true)}</div>
      <div class="field"><label>Expected per month</label>${inp('expected', f.expected, 'number')}</div>
      <div class="field">${opts('cur', CURS, f.cur)}</div>
      <div class="field"><label>Worst case per month (optional)</label>${inp('worst', f.worst, 'number')}</div>
      <div class="field"><label>Can it stop?</label>${opts('canStop', [['Yes', 'Yes, can stop'], ['No', 'No, steady']], f.canStop)}</div>
      <div class="field"><label>Keep aside for tax (%)</label>${inp('taxPct', Math.round(Number(f.tax || 0) * 100), 'number')}</div>
      <details><summary>More</summary><div class="field"><label>Notes</label>${inp('notes', f.notes)}</div></details>${btns(form.i != null)}`;
  }
  function fSaving() {
    const f = form.f;
    return `<h2>${form.i == null ? 'New goal' : 'Edit goal'}</h2>
      <div class="field"><label>Goal</label>${inp('name', f.name, '', 'Trip to Brazil')}</div>
      <div class="field"><label>Put aside per month (CAD)</label>${inp('perMonth', f.perMonth, 'number')}</div>
      <div class="field"><label>Target (optional)</label>${inp('target', f.target, 'number')}</div>
      <div class="field"><label>Saved so far</label>${inp('saved', f.saved, 'number')}</div>
      <div class="field"><label>Stop saving after (optional)</label><input class="input" type="month" data-f="by" value="${esc(f.by || '')}"></div>
      <div class="field"><label>Keep paying if clients stop?</label>${opts('keep', ['Yes', 'No'], f.keep)}</div>
      <details><summary>More</summary><div class="field"><label>Notes</label>${inp('notes', f.notes)}</div></details>${btns(form.i != null)}`;
  }

  function setFormVal(k, v) {
    const f = form.f;
    const one = f.freq === 'One-time';
    if (k === 'pick') {
      const list = E.parsePicks(f.how, one) || [];
      const x = Number(v), at = list.indexOf(x);
      if (at >= 0) list.splice(at, 1); else list.push(x);
      f.how = E.pickText(list, one, f.due ? Number(f.due) - 1 : null) || E.PICK;
    } else if (k === 'howKind') {
      if (v === 'pick') { if (!E.isPick(f.how)) f.how = E.PICK; }
      else if (v === 'once') f.how = 'Pay all at once';
      else if (v === 'save') f.how = E.SAVE;
      else f.how = 'Split in 2 payments';
    } else if (k === 'splitN') f.how = `Split in ${v} payments`;
    else if (k === 'freq') {
      if (E.isPick(f.how) && (v === 'One-time') !== one) f.how = E.PICK;
      f.freq = v;
      if (E.RECURRING_MONTHLY.includes(v)) { f.how = ''; f.due = ''; }
      else if (!f.how) f.how = 'Pay all at once';
      if (v === 'One-time') f.due = '';
      if (E.PERIOD[v] && String(f.how).startsWith('Split') && Number((String(f.how).match(/\d+/) || [])[0]) > E.PERIOD[v]) f.how = 'Pay all at once';
    } else if (k === 'due') {
      f.due = E.isPick(f.how) && Number(f.due) === Number(v) ? '' : Number(v);
      if (E.isPick(f.how)) f.how = E.pickText(E.parsePicks(f.how, one), one, f.due ? f.due - 1 : null) || E.PICK;
    }
    else f[k] = v;
  }

  function saveForm() {
    const { kind, i, f } = form;
    if (!String(f.name || '').trim()) return toast('Add a name');
    if (kind === 'bill') {
      if (!(Number(f.amount) > 0)) return toast('Add an amount');
      const pk = E.isPick(f.how) && (E.PERIOD[f.freq] || f.freq === 'One-time');
      if (pk && !E.parsePicks(f.how, f.freq === 'One-time').length) return toast('Tap the months you pay');
      if (!pk && E.PERIOD[f.freq] && !f.due) return toast("Pick the month it's due");
      f.amount = Number(f.amount); f.due = f.due ? Number(f.due) : '';
      if (!pk && f.freq === 'One-time' && !f.start) return toast('Pick when');
      if (!f.start && !(pk && f.freq === 'One-time')) f.start = data.settings.start;
      upsert('expenses', i, f); closeForm(); save('expenses');
    } else if (kind === 'income') {
      f.expected = Number(f.expected) || 0; f.worst = f.worst === '' || f.worst == null ? '' : Number(f.worst);
      f.tax = (Number(f.taxPct) || 0) / 100; delete f.taxPct;
      upsert('income', i, f); closeForm(); save('income');
    } else {
      ['perMonth', 'target', 'saved'].forEach(x => (f[x] = f[x] === '' || f[x] == null ? '' : Number(f[x])));
      upsert('savings', i, f); closeForm(); save('savings');
    }
  }
  function upsert(table, i, f) { if (i == null) data[table].push(f); else data[table][i] = f; }
  function del() {
    const { kind, i } = form; const table = { bill: 'expenses', income: 'income', saving: 'savings' }[kind];
    const name = data[table][i].name;
    if (!confirm('Delete "' + name + '"?')) return;
    data[table].splice(i, 1); closeForm(); save(table);
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab],[data-act],[data-set]');
    if (!t) { if (e.target.id === 'sheet') closeForm(); return; }
    if (t.dataset.tab) { st.tab = t.dataset.tab; st.sub = null; window.scrollTo(0, 0); return render(); }
    if (t.dataset.set) {
      const [scope, k] = t.dataset.set.includes('.') ? t.dataset.set.split('.') : ['form', t.dataset.set];
      if (scope === 'test') { test[k] = t.dataset.val; localStorage.setItem(LS.test, JSON.stringify(test)); return render(); }
      setFormVal(k, t.dataset.val); return drawForm();
    }
    const a = t.dataset.act, i = t.dataset.i != null ? Number(t.dataset.i) : null;
    switch (a) {
      case 'scenario': scen = t.dataset.val; localStorage.setItem('budget.scenario', scen); recompute(); render(); break;
      case 'month': st.openMonth = st.openMonth === i ? null : i; render(); break;
      case 'filter': st.filter = t.dataset.val; render(); break;
      case 'editBill': openForm('bill', i, data.expenses[i]); break;
      case 'newBill': openForm('bill', null, { name: '', who: st.filter !== 'All' ? st.filter : 'Joint', prio: '2 Important', cat: '', cur: 'CAD', amount: '', freq: 'Monthly', due: '', how: '', start: '', end: '', notes: '' }); break;
      case 'editIncome': openForm('income', i, data.income[i]); break;
      case 'newIncome': openForm('income', null, { name: '', who: 'Anne', cur: 'CAD', expected: '', worst: '', canStop: 'Yes', tax: 0, notes: '' }); break;
      case 'editSaving': openForm('saving', i, data.savings[i]); break;
      case 'newSaving': openForm('saving', null, { name: '', target: '', saved: 0, by: '', perMonth: '', keep: 'Yes', notes: '' }); break;
      case 'goSub': st.tab = 'more'; st.sub = t.dataset.val; window.scrollTo(0, 0); render(); break;
      case 'back': st.sub = null; render(); break;
      case 'saveForm': saveForm(); break;
      case 'cancel': closeForm(); break;
      case 'delete': del(); break;
      case 'saveEf': data.settings.efCash = Number($('#efcash').value) || 0; save('settings'); break;
      case 'pull': pull(); break;
      case 'theme': applyTheme(t.dataset.val); lastView = ''; render(); break;
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f && form) {
      form.f[t.dataset.f] = t.value;
      const pv = document.querySelector('.preview');
      if (pv && form.kind === 'bill') pv.textContent = E.describe(Object.assign({}, form.f, { name: form.f.name || 'x' }), R.ctx) || '-';
    }
    if (t.dataset.test) {
      const k = t.dataset.test;
      test[k] = k === 'annePct' ? Number(t.value) / 100 : k === 't' ? Number(t.value) : t.value;
      localStorage.setItem(LS.test, JSON.stringify(test));
      if (k === 'annePct') { $('#pa').textContent = 'Anne ' + t.value + '%'; $('#pr').textContent = 'Ricardo ' + (100 - t.value) + '%'; }
      renderTestResult();
    }
  });
  document.addEventListener('change', e => { if (e.target.dataset.f && form && e.target.type === 'month') drawForm(); });
  $('#sync').addEventListener('click', () => { st.tab = 'more'; st.sub = 'settings'; render(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
  setSync(syncState);
  render();
  pull();
})();
