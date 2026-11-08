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

  // "Pay in Jan, Mar, May" (repeats each year) or "Pay in Nov 26, Jan 27" (one-time). Returns month numbers 0-11 or plan indexes.
  const PICK = 'Pay in ';
  const isPick = how => String(how || '').startsWith(PICK);
  function parsePicks(how, oneTime) {
    if (!isPick(how)) return null;
    const out = [];
    String(how).slice(PICK.length).split(',').forEach(t => {
      const [mm, yy] = t.trim().split(/\s+/);
      const k = MONTH_NAMES.findIndex(x => x.slice(0, 3).toLowerCase() === String(mm || '').toLowerCase());
      if (k < 0) return;
      if (oneTime) { if (yy) out.push((2000 + Number(yy)) * 12 + k); } else out.push(k);
    });
    return [...new Set(out)];
  }
  function pickText(list, oneTime, due) {
    if (!list.length) return '';
    let l = [...list].sort((a, b) => a - b);
    if (!oneTime && due != null) l.sort((a, b) => mod(a - due - 1, 12) - mod(b - due - 1, 12)); // cycle ends at deadline
    return PICK + l.map(v => (oneTime ? label(v, 'short') : MONTH_NAMES[v].slice(0, 3))).join(', ');
  }

  function prepExpense(e, ctx) {
    const cad = n(e.amount) * (ctx.fx[e.cur] ?? 1);
    const s = e.start ? ym(e.start) : ctx.start;
    const end = e.end ? ym(e.end) : 99999;
    const due = n(e.due) || (s % 12) + 1;
    const oneTime = e.freq === 'One-time';
    const P = PERIOD[e.freq] || 1;
    const picks = (oneTime || PERIOD[e.freq]) ? parsePicks(e.how, oneTime) : null;
    let N = 1;
    if (picks) N = Math.max(1, picks.length);
    else if (e.how === SAVE) N = oneTime ? Math.max(1, s - ctx.start + 1) : P;
    else if (String(e.how || '').startsWith('Split')) N = oneTime ? splitCount(e.how) : Math.min(splitCount(e.how), P);
    const shift = oneTime && e.how === SAVE ? N - 1 : 0;
    const avg = cad * (PER_MONTH[e.freq] ?? 1);
    const per = picks ? (oneTime ? cad : cad * 12 / P) / N : cad / N;
    function cost(m) {
      if (picks) {
        if (!picks.length) return 0;
        if (oneTime) return picks.includes(m) ? per : 0;
        return m < s || m > end ? 0 : picks.includes(m % 12) ? per : 0;
      }
      if (oneTime) { const k = m - s + shift; return k >= 0 && k < N ? cad / N : 0; }
      if (m < s || m > end) return 0;
      if (RECURRING_MONTHLY.includes(e.freq)) return cad * PER_MONTH[e.freq];
      if (PERIOD[e.freq]) return mod((m % 12) + 1 - due, P) < N ? cad / N : 0;
      return cad;
    }
    // Deadline check: by each due date in the plan, have we paid enough? (Pick months and Save modes)
    function shortBy() {
      const hasDeadline = picks ? (oneTime ? !!e.start : !!n(e.due)) : e.how === SAVE && !oneTime;
      if (!hasDeadline) return null;
      const L = ctx.len || N_MONTHS, first = Math.max(ctx.start, oneTime ? ctx.start : s);
      let paid = 0, need = 0;
      for (let m = first; m < ctx.start + L; m++) {
        paid += cost(m);
        const isDue = oneTime ? m === s : m <= end && mod((m % 12) + 1 - due, P) === 0;
        if (isDue) { need += cad; if (paid < need - 1) return { m, gap: need - paid }; if (oneTime) break; }
      }
      return null;
    }
    return { e, cad, s, end, due, oneTime, P, N, avg, cost, picks, per, shortBy };
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
    const short = x.shortBy();
    const warn2 = short ? ' ⚠ short ' + money(short.gap) + ' by ' + label(short.m) : '';
    if (x.picks) {
      if (!x.picks.length) return 'Tap the months you pay';
      const list = pickText(x.picks, x.oneTime, !x.oneTime && n(e.due) ? x.due - 1 : null).slice(PICK.length);
      const by = x.oneTime ? (e.start ? ', due ' + label(x.s) : '') : n(e.due) ? ', due ' + MONTH_NAMES[x.due - 1].slice(0, 3) : '';
      return (x.N > 1 ? x.N + ' × ' : '') + money(x.per) + ': ' + list + by + warn2;
    }
    const per = money(x.cad / x.N);
    if (x.oneTime) {
      if (e.how === SAVE) return 'Save ' + per + '/month until ' + label(x.s);
      if (x.N > 1) return x.N + ' × ' + per + ' from ' + label(x.s);
      return money(x.cad) + ' in ' + label(x.s);
    }
    if (e.how === SAVE) return 'Save ' + per + ' every month' + warn2;
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
    const ctx = { fx, start, len: N_MONTHS };
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
    const c = costs(mode), s0 = sOf(mode);
    const run = arr => { let t = 0; return arr.map(v => (t += v)); };
    const anneShare = c.map(v => v * annePct), ricShare = c.map(v => v * (1 - annePct));
    const after = R.map((r, k) => r.left - c[k]);
    // money built up month after month (before and after this purchase)
    const cumC = run(c);
    const baseA = run(R.map(r => r.inByWho.Anne - r.byWho.Anne));
    const baseR = run(R.map(r => r.inByWho.Ricardo - r.byWho.Ricardo));
    const anneRun = baseA.map((b, k) => b - cumC[k] * annePct);
    const ricRun = baseR.map((b, k) => b - cumC[k] * (1 - annePct));
    const coupleRun = R.map((r, k) => r.run - cumC[k]);
    const from = arr => arr.map((v, k) => ({ v, k })).filter(x => x.k >= s0 && x.k < L);
    const low = arr => from(arr).reduce((a, x) => (x.v < a.v ? x : a), { v: Infinity, k: -1 });
    const firstNeg = arr => { const x = from(arr).find(y => y.v < -0.5); return x ? x.k : -1; };
    const person = (runArr, base, pays) => ({ pays, low: low(runArr), shortAt: pays ? firstNeg(runArr) : -1, alreadyAt: base.findIndex(v => v < -0.5) });
    const anne = person(anneRun, baseA, annePct > 0), ric = person(ricRun, baseR, annePct < 1);
    const couple = { low: low(coupleRun), shortAt: firstNeg(coupleRun) };
    const paying = c.map(v => v > 0);
    const redPaying = after.filter((v, k) => paying[k] && v < 0).length; // months that dip below 0 on their own
    // fair split: the share each person can carry without their built-up money going below 0
    const cap = base => Math.min(...from(base).filter(x => cumC[x.k] > 0.5).map(x => Math.max(0, x.v) / cumC[x.k]), Infinity);
    const aCap = cap(baseA), rCap = cap(baseR), aMax = Math.min(1, aCap), rMax = Math.min(1, rCap);
    let fair = null;
    if (aMax + rMax >= 1 && cumC[L - 1] > 0) {
      const lo = Math.max(0, 1 - rMax), hi = Math.min(1, aMax);
      fair = Math.min(hi, Math.max(lo, aCap / (aCap + rCap))); // in proportion to what each has built up
      const r5 = Math.round(fair * 20) / 20;
      fair = r5 >= lo - 1e-9 && r5 <= hi + 1e-9 ? r5 : Math.round(fair * 100) / 100;
    }
    const compare = ['All at once', 'Split in 3', 'Split in 6', 'Split in 12', 'Save up before'].map(md => {
      const cc = costs(md);
      const af = R.map((r, k) => r.left - cc[k]);
      const pay = af.filter((_, k) => cc[k] > 0);
      return { mode: md, per: cad / nOf(md), lowest: pay.length ? Math.min(...pay) : 0, red: pay.filter(v => v < 0).length, beyond: sOf(md) + nOf(md) > L };
    });
    return { c, anneShare, ricShare, after, anneRun, ricRun, coupleRun, anne, ric, couple, paying, redPaying, fair, compare, N: nOf(mode) };
  }

  root.BudgetEngine = { compute, describe, parsePicks, pickText, isPick, PICK, N_MONTHS, testPurchase, money, label, ym, ymStr, prioNum, MONTH_NAMES, SAVE, PERIOD, RECURRING_MONTHLY };
  if (typeof module !== 'undefined') module.exports = root.BudgetEngine;
})(typeof window !== 'undefined' ? window : globalThis);
