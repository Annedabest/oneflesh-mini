// Budget engine: same math as the Google Sheet.
(function (root) {
  const N_MONTHS = 14;
  const PERIOD = { Quarterly: 3, 'Twice a year': 6, Yearly: 12 };
  const PER_MONTH = { Monthly: 1, Weekly: 52 / 12, 'Every 2 weeks': 26 / 12, Quarterly: 1 / 3, 'Twice a year': 1 / 6, Yearly: 1 / 12, 'One-time': 0 };
  const RECURRING_MONTHLY = ['Monthly', 'Weekly', 'Every 2 weeks'];
  const SAVE = 'Save a bit each month';
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const ym = s => { if (!s) return null; const [y, m] = String(s).split('-').map(Number); return y * 12 + (m - 1); };
  const ymStr = i => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');
  const label = (i, style) => {
    const m = MONTH_NAMES[i % 12], y = Math.floor(i / 12);
    if (style === 'short') return m.slice(0, 3) + ' ' + String(y).slice(2);
    if (style === 'month') return m;
    return m.slice(0, 3) + ' ' + y;
  };
  const mod = (a, b) => ((a % b) + b) % b;
  const prioNum = p => Number(String(p || '4')[0]) || 4;
  const n = v => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));

  function splitCount(how) { const m = String(how || '').match(/\d+/); return m ? Number(m[0]) : 1; }

  function prepExpense(e, ctx) {
    const cad = n(e.amount) * (ctx.fx[e.cur] ?? 1);
    const s = e.start ? ym(e.start) : ctx.start;
    const end = e.end ? ym(e.end) : 99999;
    const due = n(e.due) || (s % 12) + 1;
    const oneTime = e.freq === 'One-time';
    const P = PERIOD[e.freq] || 1;
    let N = 1;
    if (e.how === SAVE) N = oneTime ? Math.max(1, s - ctx.start + 1) : P;
    else if (String(e.how || '').startsWith('Split')) N = oneTime ? splitCount(e.how) : Math.min(splitCount(e.how), P);
    const shift = oneTime && e.how === SAVE ? N - 1 : 0;
    const avg = cad * (PER_MONTH[e.freq] ?? 1);
    function cost(m) {
      if (oneTime) { const k = m - s + shift; return k >= 0 && k < N ? cad / N : 0; }
      if (m < s || m > end) return 0;
      if (RECURRING_MONTHLY.includes(e.freq)) return cad * PER_MONTH[e.freq];
      if (PERIOD[e.freq]) return mod((m % 12) + 1 - due, P) < N ? cad / N : 0;
      return cad;
    }
    return { e, cad, s, end, due, oneTime, P, N, avg, cost };
  }

  function money(v, opts) {
    const r = Math.round(v);
    const s = '$' + Math.abs(r).toLocaleString('en-CA');
    return r < 0 ? '-' + s : (opts && opts.plus && r > 0 ? '+' + s : s);
  }

  function describe(e, ctx) {
    const x = prepExpense(e, ctx);
    if (!e.name) return '';
    if (RECURRING_MONTHLY.includes(e.freq)) return money(x.avg) + ' every month';
    const per = money(x.cad / x.N);
    if (x.oneTime) {
      if (e.how === SAVE) return 'Save ' + per + '/month until ' + label(x.s);
      if (x.N > 1) return x.N + ' × ' + per + ' from ' + label(x.s);
      return money(x.cad) + ' in ' + label(x.s);
    }
    if (e.how === SAVE) return 'Save ' + per + ' every month';
    const every = e.freq === 'Quarterly' ? ', every 3 months' : e.freq === 'Twice a year' ? ', every 6 months' : ', every year';
    const dueTxt = e.due ? MONTH_NAMES[x.due - 1] : '?';
    const warn = e.due ? '' : ' ⚠ pick month due';
    if (x.N > 1) return x.N + ' × ' + per + ' from ' + dueTxt + every + warn;
    return money(x.cad) + ' in ' + dueTxt + every + warn;
  }

  function incomeNow(i, scenario, fx) {
    const rate = (fx[i.cur] ?? 1) * (1 - n(i.tax));
    let base;
    if (i.canStop === 'No' || scenario === 'Normal') base = n(i.expected);
    else if (scenario === 'Worst case') base = i.worst === '' || i.worst == null ? n(i.expected) : n(i.worst);
    else base = 0;
    return base * rate;
  }

  function compute(data, scenarioOverride) {
    const st = data.settings || {};
    const fx = Object.assign({ CAD: 1 }, st.fx || {});
    const start = ym(st.start || '2026-11');
    const scenario = scenarioOverride || st.scenario || 'Normal';
    const ctx = { fx, start };
    const months = Array.from({ length: N_MONTHS }, (_, k) => start + k);
    const exps = (data.expenses || []).filter(e => e.name).map(e => prepExpense(e, ctx));
    const people = ['Anne', 'Ricardo', 'Joint'];

    const inByWho = {}; people.forEach(p => (inByWho[p] = 0));
    (data.income || []).filter(i => i.name).forEach(i => { inByWho[i.who in inByWho ? i.who : 'Joint'] += incomeNow(i, scenario, fx); });
    const totalIn = inByWho.Anne + inByWho.Ricardo + inByWho.Joint;

    const rows = months.map(m => {
      const byPrio = [0, 0, 0, 0, 0];
      const byWho = { Anne: 0, Ricardo: 0, Joint: 0 };
      const items = [];
      exps.forEach(x => {
        const c = x.cost(m); if (!c) return;
        byPrio[prioNum(x.e.prio)] += c;
        byWho[x.e.who in byWho ? x.e.who : 'Joint'] += c;
        items.push({ name: x.e.name, cost: c, e: x.e });
      });
      items.sort((a, b) => b.cost - a.cost);
      const out = byPrio.reduce((a, b) => a + b, 0);
      const saving = (data.savings || []).filter(s => s.name && (!s.by || ym(s.by) >= m)).reduce((a, s) => a + n(s.perMonth), 0);
      return { m, label: label(m), short: label(m, 'short'), in: totalIn, inByWho, byPrio, byWho, out, saving, left: totalIn - out - saving, items };
    });
    let run = 0; rows.forEach(r => { run += r.left; r.run = run; });

    const avg = f => rows.reduce((a, r) => a + f(r), 0) / rows.length;
    const avgLeft = avg(r => r.left);
    const worst = rows.reduce((a, r) => (r.left < a.left ? r : a), rows[0]);
    const redMonths = rows.filter(r => r.left < 0);

    // If clients stop
    const surviving = (data.income || []).filter(i => i.name && i.canStop === 'No')
      .reduce((a, i) => a + n(i.expected) * (fx[i.cur] ?? 1) * (1 - n(i.tax)), 0);
    const mustAvg = avg(r => r.byPrio[1] + r.byPrio[2]);
    const keepSaving = (data.savings || []).filter(s => s.name && s.keep === 'Yes').reduce((a, s) => a + n(s.perMonth), 0);
    const crisisLeft = surviving - mustAvg - keepSaving;
    const heaviest = rows.reduce((a, r) => (r.byPrio[1] + r.byPrio[2] > a.byPrio[1] + a.byPrio[2] ? r : a), rows[0]);
    const efCash = n(st.efCash);
    const crisis = {
      surviving, mustAvg, keepSaving, left: crisisLeft, heaviest,
      niceAvg: avg(r => r.byPrio[3]), cutAvg: avg(r => r.byPrio[4]),
      runway: crisisLeft >= 0 ? null : efCash / -crisisLeft,
      verdict: crisisLeft >= 500 ? 'good' : crisisLeft >= 0 ? 'tight' : 'short',
      ef3: Math.ceil((mustAvg * 3) / 100) * 100, ef6: Math.ceil((mustAvg * 6) / 100) * 100, efCash
    };

    const billAvg = exps.map(x => ({ e: x.e, avg: x.avg, cad: x.cad }));
    return { months, rows, totalIn, inByWho, avgLeft, worst, redMonths, endTotal: run, crisis, exps, billAvg, ctx, scenario };
  }

  // Test a purchase: what happens if we buy `cad` in month index t (0-based within plan)
  function testPurchase(result, { cad, t, mode, annePct }) {
    const R = result.rows, L = R.length;
    const nOf = md => (md === 'Save up before' ? t + 1 : md === 'All at once' ? 1 : splitCount(md));
    const sOf = md => (md === 'Save up before' ? 0 : t);
    function costs(md) {
      const N = nOf(md), s = sOf(md);
      return R.map((_, k) => (k >= s && k < s + N ? cad / N : 0));
    }
    const c = costs(mode);
    const anneShare = c.map(v => v * annePct), ricShare = c.map(v => v * (1 - annePct));
    const after = R.map((r, k) => r.left - c[k]);
    const anneOwn = R.map((r, k) => r.inByWho.Anne - r.byWho.Anne - anneShare[k]);
    const ricOwn = R.map((r, k) => r.inByWho.Ricardo - r.byWho.Ricardo - ricShare[k]);
    const paying = c.map(v => v > 0);
    const redPaying = after.filter((v, k) => paying[k] && v < 0).length;
    const anneShort = anneOwn.filter((v, k) => anneShare[k] > 0 && v < 0).length;
    const ricShort = ricOwn.filter((v, k) => ricShare[k] > 0 && v < 0).length;
    const compare = ['All at once', 'Split in 3', 'Split in 6', 'Split in 12', 'Save up before'].map(md => {
      const cc = costs(md);
      const af = R.map((r, k) => r.left - cc[k]);
      const pay = af.filter((_, k) => cc[k] > 0);
      return { mode: md, per: cad / nOf(md), lowest: pay.length ? Math.min(...pay) : 0, red: pay.filter(v => v < 0).length, beyond: sOf(md) + nOf(md) > L };
    });
    return { c, anneShare, ricShare, after, anneOwn, ricOwn, paying, redPaying, anneShort, ricShort, compare, N: nOf(mode) };
  }

  root.BudgetEngine = { compute, describe, testPurchase, money, label, ym, ymStr, prioNum, MONTH_NAMES, SAVE, PERIOD, RECURRING_MONTHLY };
  if (typeof module !== 'undefined') module.exports = root.BudgetEngine;
})(typeof window !== 'undefined' ? window : globalThis);
