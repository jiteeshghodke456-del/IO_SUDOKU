/* App shell: state, stepper, side panels, stat row, search, and the allocation / revision runs. */
(function () {
  const { h, $, sleep, fmt, pad, countTo, toast, nat, clone } = U;
  const D = IOS.D;
  const STEPS = [
    { n: 1, name: 'Upload' }, { n: 2, name: 'Set rules' }, { n: 3, name: 'Allocate' }, { n: 4, name: 'Report + TQs' }, { n: 5, name: 'Revise' },
  ];

  function defaultRules() {
    const hw = {}; D.hwOrder.forEach(k => (hw[k] = { charm: D.hw[k].charm, tb: D.hw[k].tb }));
    return {
      k: 4, max: 0, grp: true, ab: true, preset: 'class', spareOn: true, spare: 10,
      names: { area: D.meta.area, unit: D.meta.unit, cabinet: '<Area>-DCM-<Unit>-<Seq:2>', cioc: '<Area>CIOC<Unit><Seq:3>', baseplate: '<CIOC no:3>-CBP-<n>', controller: '<Area>CTL<Unit><Seq:2>', system: '<Area>-DCS-<Unit>-<Seq:2>' },
      hw,
    };
  }

  const App = (window.App = {
    state: {
      step: 1, maxStep: 1, done: {},
      mdb: null, tmpl: null, map: null, ingested: false, rulesSaved: false,
      rules: defaultRules(),
      run: null, dirty: false, running: false,
      tqDone: {}, cab: 1, sel: null, reportTab: 'check', tq: { sev: 'all', code: 'all', q: '', sel: null },
      revFile: null, rev: null, revView: 'changes', revTab: 'cabs', revRunning: false,
    },
    D, defaultRules, STEPS,
  });
  const st = App.state;

  // ---------- derived ----------
  App.scnKey = function (r) { r = r || st.rules; return [r.spareOn ? r.spare : 0, r.k, r.preset, r.max ? D.limit : 0, r.ab ? 1 : 0, r.grp ? 1 : 0].join('-'); };
  App.reserve = function (r) { r = r || st.rules; const N = r.k * 8; return r.spareOn ? Math.ceil(r.spare * N / 100) : 0; };
  App.cabName = (n, rules) => IOS.fmtName((rules || st.rules).names.cabinet, { area: (rules || st.rules).names.area, unit: (rules || st.rules).names.unit, seq: n });

  App.baseTqs = function () {
    const scn = st.run ? st.run.scn : null;
    const list = D.dataTqs.map(t => ({ ...t, rev: 'A' })).concat(scn ? scn.tqs.map(t => ({ ...t, rev: 'A' })) : []);
    list.sort((a, b) => nat(a.code, b.code) || nat(a.cables[0] || '', b.cables[0] || '') || nat(a.tags[0] || '', b.tags[0] || ''));
    list.forEach((t, i) => { t.no = 'TQ-' + pad(i + 1, 4); t.id = t.code + ':' + (t.tags[0] || t.cables[0] || 'x') + ':' + i; t.status = st.tqDone[t.code + ':' + (t.tags[0] || t.cables[0] || 'x') + ':' + t.message.length] ? 'Answered' : 'Open'; t.key = t.code + ':' + (t.tags[0] || t.cables[0] || 'x') + ':' + t.message.length; });
    return list;
  };
  App.revTqs = function () {
    const list = App.baseTqs().map(t => ({ ...t, rev: 'B' }));
    D.revision.tqs.forEach(t => list.push({ ...t, rev: 'B', tags: t.tags || [], cables: t.cables || [], rules: t.rules || [], options: t.options || [], status: 'Open', key: 'REV' + t.cables[0] }));
    list.sort((a, b) => nat(a.code, b.code) || nat(a.cables[0] || '', b.cables[0] || '') || nat(a.tags[0] || '', b.tags[0] || ''));
    list.forEach((t, i) => (t.no = 'TQ-' + pad(i + 1, 4)));
    return list;
  };
  App.tqs = () => (inRevView() ? App.revTqs() : App.baseTqs());
  const inRevView = () => st.step === 5 && st.rev && st.revView !== 'A';
  App.inRevView = inRevView;
  App.openCount = tqs => tqs.filter(t => t.status === 'Open').length;

  App.layout = function () { return inRevView() ? st.rev.layout : st.run ? st.run.layout : null; };
  App.seqMap = function () { return inRevView() ? st.rev.seqMap : st.run ? st.run.seqMap : null; };
  App.cabinets = function () {
    if (inRevView()) return st.rev.cabs;
    return st.run ? st.run.scn.cabs : [];
  };

  App.revStats = function (layout, rules) {
    const res = [];
    const K = rules.k, N = K * 8, R = App.reserve(rules);
    const cabs = [...layout.cabs.keys()].sort((a, b) => a - b);
    cabs.forEach(c => {
      const cells = layout.cabs.get(c); const bps = new Set(), cio = new Set(); let slots = 0;
      cells.forEach((cell, key) => { const [k, b] = key.split('/'); cio.add(k); bps.add(k + '/' + b); slots++; });
      const usable = (N - R) * 12;
      res.push({ n: c, ciocs: cio.size, bpUsed: bps.size, bpEmpty: N - bps.size, slots, usable, fill: Math.round(1000 * slots / usable) / 10 });
    });
    return res;
  };

  // ---------- chrome ----------
  App.chrome = function (animate) { renderStepper(); renderStats(animate); renderBadges(); const q = $('#q'); q.disabled = !st.run; $('#revtag').textContent = inRevView() ? 'Rev B' : 'Rev A'; };

  function stepStatus(n) {
    if (n === 1) return st.ingested ? `${fmt(D.stats.signals)} signals · ${App.openCount(D.dataTqs.map(t => ({ ...t, status: 'Open' })))} TQs` : st.mdb ? 'Check the columns' : 'Drop the IO list';
    if (n === 2) return !st.ingested ? 'Needs step 1' : st.rulesSaved ? `Saved · ${ruleCount()} rules on` : `${ruleCount()} rules on`;
    if (n === 3) return !st.ingested ? 'Needs step 1' : st.running ? 'Allocating' : st.run ? (st.dirty ? 'Rules changed' : `Done in ${(st.run.scn.timeMs / 1000).toFixed(1)} s`) : 'Run allocation';
    if (n === 4) return !st.run ? 'Needs step 3' : `${st.run.scn.check.reduce((a, c) => a + c.violations, 0)} violations · ${App.openCount(App.baseTqs())} open TQs`;
    if (n === 5) return !st.run ? 'Needs step 3' : st.rev ? `${D.revision.impact.moved.length} moved · ${D.revision.impact.added.length} added` : 'Drop the Rev B file';
  }
  const ruleCount = () => 4 + (st.rules.grp ? 1 : 0) + (st.rules.ab ? 1 : 0) + (st.rules.preset !== 'any' ? 1 : 0) + (st.rules.spareOn ? 1 : 0);
  App.ruleCount = ruleCount;
  function reachable(n) { return n === 1 || (n <= 3 && st.ingested) || (n >= 4 && !!st.run); }
  function renderStepper() {
    const nav = $('#stepper'); nav.replaceChildren(...STEPS.map(s => {
      const ok = reachable(s.n); const cls = ['step', st.step === s.n ? 'current' : '', st.done[s.n] ? 'done' : ''].join(' ');
      return h('button', { class: cls, disabled: !ok, 'aria-current': st.step === s.n ? 'step' : null, onclick: () => App.go(s.n) },
        h('span', { class: 'n' }, st.done[s.n] ? '✓' : s.n), h('span', { class: 't' }, h('b', {}, s.name), h('span', {}, stepStatus(s.n))));
    }));
  }
  function renderBadges() {
    const b = $('#badges'); b.replaceChildren(h('span', { class: 'badge on' }, 'Offline'));
    if (st.rev) b.append(h('button', { class: 'badge', title: 'Switch between revisions', onclick: () => { st.revView = st.revView === 'A' ? 'changes' : 'A'; if (st.step < 3) App.go(5); else App.go(st.step); } }, st.revView === 'A' ? 'Showing Rev A' : 'Showing Rev B'));
  }

  const TILES = [['signals', 'Signals'], ['cabinets', 'Cabinets'], ['fill', 'Average fill'], ['spare', 'Spare baseplates'], ['viol', 'Violations'], ['tq', 'Open TQs'], ['time', 'Time']];
  function renderStats(animate) {
    const f = $('#stats'); if (!f.children.length) TILES.forEach(([id, cap]) => f.append(h('div', { class: 'tile', id: 'tile-' + id }, h('span', { class: 'cap' }, cap), h('span', { class: 'v', 'data-v': '0' }, '–'), h('span', { class: 'c' }, ''))));
    const set = (id, val, ctx, cls, dec, suf) => {
      const t = $('#tile-' + id), v = t.querySelector('.v'), c = t.querySelector('.c'); t.className = 'tile ' + (cls || '');
      if (val == null) { v.textContent = '–'; v.dataset.v = '0'; } else countTo(v, val, animate ? 700 : 0, dec, suf); c.textContent = ctx || '';
    };
    const rev = inRevView();
    let cabs = null, scn = null, tqs = null;
    set('signals', st.ingested ? (rev ? D.revision.rowsRead : D.meta.rowsRead) : null, st.ingested ? `${D.stats.cables + (rev ? D.revision.newCables : 0)} cables · ${D.stats.groups + (rev ? 1 : 0)} groups` : 'Upload the IO list');
    if (st.run) {
      scn = st.run.scn; tqs = rev ? App.revTqs() : App.baseTqs();
      if (rev) { cabs = st.rev.cabs; } else cabs = scn.cabs;
      const n = cabs.length, avg = cabs.length ? Math.round(10 * cabs.reduce((a, c) => a + c.fill, 0) / cabs.length) / 10 : 0, spare = cabs.reduce((a, c) => a + c.bpEmpty, 0);
      const viol = (rev ? D.revision.check : scn.check).reduce((a, c) => a + c.violations, 0);
      const blocking = tqs.filter(t => t.status === 'Open' && t.severity === 'blocking').length, open = App.openCount(tqs);
      const stale = st.dirty && !rev;
      set('cabinets', n, rev ? `Rev A had ${scn.cabs.length}` : `lower bound ${scn.lowerBound}`, stale ? 'warn' : '');
      set('fill', avg, 'of usable slots', '', 1, '%');
      set('spare', spare, `at least ${App.reserve()} per cabinet`);
      set('viol', viol, viol === 0 ? 'checked on the Excel file' : 'see rule check', viol === 0 ? 'good' : 'err');
      set('tq', open, `${blocking} blocking`, open ? 'warn' : 'good');
      set('time', (rev ? D.revision.timeMs : scn.timeMs) / 1000, rev ? 'revision, engine' : 'engine, ' + fmt(scn.placedSignals) + ' signals', '', 1, ' s');
    } else ['cabinets', 'fill', 'spare', 'viol', 'tq', 'time'].forEach(id => set(id, null, id === 'cabinets' ? 'Run allocation' : ''));
  }

  // ---------- navigation ----------
  App.go = function (n) {
    st.step = n; st.maxStep = Math.max(st.maxStep, n);
    $('#body').classList.toggle('wide', n <= 2);
    App.chrome(false);
    const work = $('#work'); work.scrollTop = 0; work.replaceChildren(VIEWS.render(n));
    App.side();
  };
  App.side = function () {
    if (st.step <= 2) return;
    renderCabList(); renderDetail();
  };

  function cabTqCounts() {
    const m = new Map(); const layout = App.layout(); if (!layout) return m;
    App.tqs().forEach(t => { if (t.status !== 'Open' || t.severity !== 'hardware') return; t.tags.forEach(tag => { const c = layout.byTag.get(tag); if (c) m.set(c.addr[0], (m.get(c.addr[0]) || 0) + 1); }); });
    return m;
  }
  function renderCabList() {
    const L = $('#left'); const cabs = st.running ? [] : App.cabinets(); const rev = inRevView();
    if (!cabs.length) { L.replaceChildren(h('div', { class: 'list-h' }, 'Cabinets'), h('div', { class: 'pad empty' }, 'Run the allocation to see cabinets, fill and open TQs here.')); return; }
    const tqc = cabTqCounts(); const per = rev && st.rev ? new Map(D.revision.perCab.map(p => [p.cab, p])) : null;
    const unp = !rev && st.run && st.run.scn.unplacedSignals ? st.run.scn.unplacedSignals : 0;
    L.replaceChildren(h('div', { class: 'list-h' }, h('span', {}, 'Cabinets'), h('span', { class: 'cap' }, `${cabs.length}`)),
      h('div', { class: 'cablist' }, ...cabs.map(c => {
        const ch = per && per.get(c.n); const tc = tqc.get(c.n);
        return h('button', { class: 'cabitem' + (st.cab === c.n ? ' sel' : ''), onclick: () => App.pickCab(c.n), 'aria-pressed': st.cab === c.n },
          h('div', { class: 'r1' }, h('span', { class: 'nm' }, App.cabName(c.n)), tc ? h('span', { class: 'chip warn' }, `${tc} TQ`) : null, rev && c.bpEmpty < App.reserve() ? h('span', { class: 'chip warn', title: 'The revision used the reserved spare in this cabinet (V09)' }, 'reserve used') : null, ch ? h('span', { class: 'chip info' }, `${ch.added + ch.moved + ch.deleted + ch.swaps + ch.renamed} changes`) : null),
          h('div', { class: 'bar thin' }, h('i', { style: { width: Math.min(100, c.fill) + '%' } })),
          h('div', { class: 'r2' }, h('span', {}, `${c.fill}% full`), h('span', {}, `${c.ciocs} CIOCs · ${c.bpEmpty} spare`)));
      }),
        unp ? h('button', { class: 'cabitem', onclick: () => { st.reportTab = 'tq'; st.tq = { sev: 'all', code: 'C02', q: '', sel: null }; App.go(4); } }, h('div', { class: 'r1' }, h('span', { class: 'nm' }, 'Not placed'), h('span', { class: 'chip err' }, 'C02')), h('div', { class: 'r2' }, h('span', {}, `${fmt(unp)} signals`), h('span', {}, 'see TQ'))) : null));
  }
  App.pickCab = function (n) { st.cab = n; st.sel = null; if (st.step === 3 || st.step === 5) VIEWS.refreshMap(); renderCabList(); renderDetail(); };

  // ---------- details ----------
  App.cellInfo = function (cab, key) {
    const layout = App.layout(); if (!layout) return null; const cell = (layout.cabs.get(cab) || new Map()).get(key);
    const [k, b, s] = key.split('/').map(Number); const nm = IOS.names(st.rules, App.seqMap(), [cab, k, b, s]);
    return { cell, k, b, s, nm };
  };
  App.tipText = function (cab, key) {
    const i = App.cellInfo(cab, key); if (!i) return '';
    if (!i.cell) { const empty = !hasBp(cab, i.k, i.b); return empty ? 'Empty baseplate (spare)' : 'Free slot'; }
    if (i.cell.t === 'sp') return `Spare pair\n${i.cell.cable} pair ${i.cell.pair}`;
    const sg = i.cell.sig, hw = IOS.hwFor(st.rules, sg);
    return `${sg.tag}\n${sg.cable} pair ${sg.pair}\n${hw ? hw.charm + ' · ' + hw.tb : 'CHARM not chosen (see TQ)'}`;
  };
  function hasBp(cab, k, b) { const cells = App.layout().cabs.get(cab); if (!cells) return false; for (let s = 1; s <= 12; s++) if (cells.has(k + '/' + b + '/' + s)) return true; return false; }
  App.selectCell = function (cab, key) { st.cab = cab; st.sel = { cab, key }; if (st.step === 3 || st.step === 5) VIEWS.refreshMap(); renderCabList(); renderDetail(); };
  function renderDetail() {
    const R = $('#right'); if (st.step === 4 && st.tq.sel) { R.replaceChildren(VIEWS.tqDetail()); return; }
    const sel = st.sel; const i = sel && App.cellInfo(sel.cab, sel.key);
    if (!i) { R.replaceChildren(h('h3', {}, 'Details'), h('p', { class: 'empty' }, st.run ? 'Click a slot on the map, or search for a tag, to see its CHARM, terminal block and address.' : 'Nothing selected.')); return; }
    const dl = (rows) => h('dl', { class: 'dl' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    if (!i.cell) { R.replaceChildren(h('h3', {}, 'Free slot'), h('p', { class: 'cap' }, 'Belongs to no cable.'), dl([['Cabinet', i.nm.cabinet], ['CIOC', i.nm.cioc], ['Baseplate', i.nm.baseplate], ['Slot', i.s]])); return; }
    if (i.cell.t === 'sp') { R.replaceChildren(h('h3', {}, 'Spare pair'), h('p', { class: 'cap' }, 'Wired but unused. It keeps its slot.'), dl([['Cable', i.cell.cable], ['Pair', i.cell.pair], ['Cabinet', i.nm.cabinet], ['CIOC', i.nm.cioc], ['Baseplate', i.nm.baseplate], ['Slot', i.s]])); return; }
    const sg = i.cell.sig, hw = IOS.hwFor(st.rules, sg), rev = inRevView();
    const chips = [h('span', { class: 'chip mono' }, sg.io || sg.ioRaw || 'no IO type')];
    if (rev && sg.status && sg.status !== 'same') chips.push(h('span', { class: 'chip ' + ({ added: 'info', moved: 'warn', swap: 'ok', renamed: 'ok' }[sg.status] || '') }, { added: 'Added', moved: 'Moved', swap: 'CHARM swap', renamed: 'Renamed' }[sg.status]));
    const extra = [];
    if (rev && sg.status === 'moved') { const m = D.revision.impact.moved.find(x => x.tag === sg.tag); if (m) extra.push(h('p', { class: 'cap' }, `Was at ${IOS.names(st.rules, App.seqMap(), m.from).cioc}, baseplate ${m.from[2]}, slot ${m.from[3]}. Reason: ${m.reason}.`)); }
    if (rev && sg.status === 'swap') { const m = D.revision.impact.swaps.find(x => x.tag === sg.tag); if (m) extra.push(h('p', { class: 'cap' }, `CHARM changed in place: ${st.rules.hw[m.from].charm} → ${st.rules.hw[m.to].charm}.`)); }
    if (rev && sg.status === 'renamed') { const m = D.revision.impact.renamed.find(x => x.tag === sg.tag); if (m) extra.push(h('p', { class: 'cap' }, `Renamed from ${m.old}. The slot did not change.`)); }
    R.replaceChildren(h('h3', { class: 'mono' }, sg.tag), h('div', { class: 'row', style: { margin: '6px 0 10px' } }, chips), ...extra,
      dl([['Cable · pair', `${sg.cable} · ${sg.pair}`], ['Group · side', `${sg.group || '–'} · ${sg.seg || '–'}`], ['System cabinet', i.nm.system], ['Controller', i.nm.controller], ['Marshalling cabinet', i.nm.cabinet], ['CIOC', i.nm.cioc], ['Baseplate', i.nm.baseplate], ['Slot', i.s], ['CHARM', hw ? hw.charm : 'Not chosen'], ['Terminal block', hw ? hw.tb : 'Not chosen'], ['Description', sg.desc]]),
      !hw ? h('p', { class: 'cap', style: { color: 'var(--warn)', marginTop: '8px' } }, sg.hw === 'D04' ? 'No IO type in the file. See TQ D04.' : 'IO type not recognised. See TQ D05.') : null);
  }
  App.renderDetail = renderDetail;

  // ---------- search ----------
  (function () {
    const q = $('#q'), res = $('#qres');
    q.addEventListener('input', () => {
      const v = q.value.trim().toUpperCase(); const layout = App.layout();
      if (v.length < 2 || !layout) { res.hidden = true; return; }
      const out = []; layout.byTag.forEach((cell, tag) => { if (out.length < 8 && (tag.includes(v) || cell.sig.cable.toUpperCase().includes(v))) out.push(cell); });
      res.replaceChildren(...(out.length ? out.map(c => h('button', { onclick: () => { res.hidden = true; q.value = ''; if (st.step < 3) App.go(3); App.selectCell(c.addr[0], c.addr[1] + '/' + c.addr[2] + '/' + c.addr[3]); } }, h('b', { class: 'mono' }, c.sig.tag), h('span', { class: 'muted mono' }, `${c.sig.cable} · pair ${c.sig.pair} · ${App.cabName(c.addr[0])}`))) : [h('div', { class: 'pad empty' }, 'No tag or cable matches.')]));
      res.hidden = false;
    });
    q.addEventListener('keydown', e => { if (e.key === 'Escape') { res.hidden = true; q.blur(); } });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === '/' && !q.disabled && document.activeElement !== q && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
  })();

  // ---------- rule changes ----------
  App.rulesChanged = function () {
    st.rulesSaved = false; st.done[2] = false;
    if (st.run) st.dirty = App.scnKey() !== st.run.key;
    App.chrome(false);
  };
  App.ruleDiff = function () {
    const r = st.rules, d = defaultRules(), out = [];
    if (r.k !== d.k) out.push(`CIOCs per cabinet ${d.k} → ${r.k}`);
    if (r.max) out.push(`Cabinet limit ${D.limit}`);
    if (!r.grp) out.push('Grouping off');
    if (!r.ab) out.push('A/B separation off');
    if (r.preset !== d.preset) out.push(`CIOC sharing: ${r.preset}`);
    if (!r.spareOn) out.push('Spare off'); else if (r.spare !== d.spare) out.push(`Spare ${d.spare}% → ${r.spare}%`);
    D.hwOrder.forEach(k => { if (r.hw[k].charm !== d.hw[k].charm || r.hw[k].tb !== d.hw[k].tb) out.push(`Hardware row ${k}`); });
    Object.keys(d.names).forEach(k => { if (r.names[k] !== d.names[k]) out.push(`Naming: ${k}`); });
    return out;
  };

  // ---------- runs ----------
  App.runAllocation = async function (opts) {
    opts = opts || {}; if (st.running) return;
    st.running = true; st.sel = null; const key = App.scnKey(); const scn = D.scenarios[key]; st.rev = null; st.revFile = null; st.revView = 'changes'; st.done[5] = false;
    App.chrome(false);
    const stages = [
      ['Applying ' + ruleCount() + ' rules', 380, `${ruleCount()} rules`],
      ['Building cables from the signal list', 520, `${D.cables.length} cables`],
      ['Placing cables, group by group', 1300, `${scn.cabs.length} cabinets · ${scn.ciocs} CIOCs`],
      ['Naming cabinets, CIOCs and baseplates', 420, 'from your patterns'],
      ['Choosing CHARM and terminal block', 450, `${fmt(scn.placedSignals)} signals`],
      ['Checking every rule on the result', 800, 'done'],
      ['Writing the Excel workbook', 520, 'ready'],
    ];
    if (opts.fast) stages.forEach(s => (s[1] = Math.round(s[1] * 0.45)));
    VIEWS.showRun(stages, scn);
    for (let i = 0; i < stages.length; i++) {
      VIEWS.stage(i, 'run', null);
      if (i === 2) { const steps = 14; for (let t = 1; t <= steps; t++) { await sleep(stages[i][1] / steps); VIEWS.stage(i, 'run', `${Math.round(D.cables.length * t / steps)} / ${D.cables.length} cables · ${Math.max(1, Math.ceil(scn.cabs.length * t / steps))} cabinets`); } }
      else await sleep(stages[i][1]);
      let meta = stages[i][2];
      if (i === 5) { const v = scn.check.reduce((a, c) => a + c.violations, 0); meta = `${scn.check.filter(c => c.status !== 'off').length} checks · ${v} violations`; }
      VIEWS.stage(i, 'done', meta);
    }
    const layout = IOS.baseLayout(scn); const seqMap = IOS.seqBase(scn);
    st.run = { key, scn, layout, seqMap, rules: clone(st.rules) };
    st.dirty = false; st.running = false; st.cab = 1; st.done[3] = true; st.done[2] = true; st.done[1] = true;
    await sleep(300);
    App.go(opts.to || 3); App.chrome(true); toast(`Allocation done in ${(scn.timeMs / 1000).toFixed(1)} s`);
  };

  App.runRevision = async function () {
    if (st.revRunning) return; st.revRunning = true;
    const stages = [
      ['Comparing Rev B with Rev A, tag by tag', 650, `${fmt(D.revision.rowsRead)} rows read`],
      ['Keeping unchanged signals where they are', 800, `${fmt(D.revision.common - D.revision.impact.moved.length)} stay put`],
      ['Placing new and changed cables', 1100, `${D.revision.impact.added.length + D.revision.impact.moved.length} signals placed`],
      ['Keeping every container name from Rev A', 420, 'names kept'],
      ['Checking every rule on Rev B', 750, 'done'],
    ];
    VIEWS.showRevRun(stages);
    for (let i = 0; i < stages.length; i++) { VIEWS.revStage(i, 'run', null); await sleep(stages[i][1]); VIEWS.revStage(i, 'done', stages[i][2]); }
    const layout = IOS.revLayout(); const seqMap = IOS.seqRev(st.run.seqMap, layout);
    // keep the Rev A list first, then any cabinet the revision opened
    const rstats = App.revStats(layout, st.rules);
    st.rev = { layout, seqMap, cabs: rstats, impact: D.revision.impact };
    st.revView = 'changes'; st.revTab = 'cabs'; st.done[5] = true; st.revRunning = false; st.cab = (D.revision.perCab.slice().sort((a, b) => (b.moved * 3 + b.added) - (a.moved * 3 + a.added))[0] || { cab: 1 }).cab; st.sel = null;
    await sleep(250); App.go(5); App.chrome(true); toast(`Revision done: ${D.revision.impact.moved.length} signals moved`);
  };

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', () => { App.go(1); });
  if (document.readyState !== 'loading') App.go(1);
})();
