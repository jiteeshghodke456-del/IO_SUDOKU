/* The five screens. Each returns an element; App (app.js) owns state and navigation. */
(function () {
  const { h, $, sleep, fmt, pad, nat, toast, fileSize, clone } = U;
  const D = IOS.D;
  const st = () => App.state;

  const FIELDS = [['tag', 'Tag'], ['io_type', 'IO type'], ['signal_type', 'Signal type (sub-type)'], ['cable', 'Cable'], ['pair', 'Pair'], ['group', 'IO group'], ['segregation', 'Segregation'], ['cable_size', 'Cable size'], ['description', 'Description'], ['area', 'Area'], ['unit', 'Unit'], ['extra', 'Extra column (kept)'], ['ignore', 'Ignore']];
  const fieldName = f => (FIELDS.find(x => x[0] === f) || [0, f])[1];
  const CODE_NAME = { D01: 'Same tag on rows that differ', D02: 'Cable and pair used twice', D04: 'IO type missing', D05: 'IO type not recognised', D06: 'Tag letters disagree with IO type', D07: 'No cable', D08: 'Cable size inferred', D09: 'A and B in one cable', D12: 'Sheet layout', D13: 'Segregation value outside A and B', D14: 'Gaps in pair numbers', D15: 'Invalid pair number', D19: 'Two groups in one cable', C01: 'No legal place', C02: 'Cabinet limit reached' };
  const SEV_TEXT = { blocking: 'Not placed until answered', hardware: 'Placed, CHARM left blank', info: 'Placed, please confirm' };

  // ---------- small widgets ----------
  function seg(opts, value, onChange, label) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label || null }, opts.map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, t)));
  }
  function sw(on, onChange, label, disabled) { return h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, disabled: !!disabled, onclick: () => onChange(!on) }); }
  function conf(c) { return h('div', { class: 'conf' }, h('div', { class: 'bar thin' + (c < 0.9 ? ' warn' : '') }, h('i', { style: { width: Math.round(c * 100) + '%' } })), h('span', {}, Math.round(c * 100) + '%')); }
  function chipSev(s) { return h('span', { class: 'chip ' + ({ blocking: 'err', hardware: 'warn', info: 'info' }[s] || '') }, s); }
  function stageList(stages) {
    const ul = h('ul', { class: 'stages' }, stages.map(s => h('li', {}, h('span', { class: 'dot' }), h('span', {}, s[0]), h('span', { class: 'm' }, ''))));
    return { el: ul, set(i, state, meta) { const li = ul.children[i]; li.className = state; if (state === 'done') li.querySelector('.dot').textContent = '✓'; if (meta != null) li.querySelector('.m').textContent = meta; } };
  }
  const addrText = a => { const n = IOS.names(st().rules, App.seqMap(), a); return `${n.cabinet} · ${n.cioc} · bp ${a[2]} · slot ${a[3]}`; };

  // ======================================================================
  // 1. Upload
  // ======================================================================
  let upRoot = null;
  function viewUpload() { upRoot = h('div'); drawUpload(); return upRoot; }

  async function attach(kind, file) {
    const s = st();
    s[kind] = { name: file ? file.name : (kind === 'mdb' ? D.meta.file : D.meta.template), size: file ? file.size : (kind === 'mdb' ? 412 * 1024 : 38 * 1024), phase: 'reading', pct: 0 };
    s.ingested = false; s.proc = null; s.done[1] = false; s.done[2] = false; if (kind === 'mdb') s.map = null;
    drawUpload(); const f = s[kind];
    for (let p = 8; p <= 100; p += 8) { f.pct = Math.min(100, p); const b = $('#bar-' + kind); if (b) b.style.width = f.pct + '%'; await sleep(kind === 'mdb' ? 60 : 40); }
    f.phase = 'sheets'; drawUpload(); await sleep(560);
    f.phase = 'header'; drawUpload(); await sleep(560);
    f.phase = 'mapped';
    if (kind === 'mdb') { s.map = D.mapping.map(m => ({ ...m, accepted: m.conf >= 0.9 })); s.mapAnim = true; }
    drawUpload(); s.mapAnim = false; App.chrome(false);
  }

  function dropzone(kind) {
    const f = st()[kind];
    const label = kind === 'mdb' ? 'Customer IO list (Excel)' : 'IO allocation template (Excel)';
    const input = h('input', { type: 'file', hidden: true, accept: '.xlsx,.xls,.xlsm,.csv', multiple: kind === 'mdb', onchange: e => { if (e.target.files[0]) attach(kind, e.target.files[0]); } });
    if (!f) {
      const box = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Attach ' + label, onclick: () => input.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
        h('div', { class: 'big' }, h('span', { html: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14V4M6 8l4-4 4 4M4 16h12"/></svg>' })),
        h('h3', {}, label),
        h('span', { class: 'muted' }, kind === 'mdb' ? "Drop the customer's IO list here." : 'Drop the template to fill.'),
        h('span', { class: 'cap' }, 'or click to browse · .xlsx .xls .csv'), input);
      ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('over'); }));
      box.addEventListener('drop', e => { const fl = e.dataTransfer && e.dataTransfer.files[0]; if (fl) attach(kind, fl); });
      return box;
    }
    const m = D.meta; const facts = [];
    if (f.phase !== 'reading') facts.push(h('span', {}, 'Sheets ', h('b', {}, kind === 'mdb' ? m.sheets.map(x => x.name).join(' · ') : 'Allocation · Legend')));
    if (f.phase === 'header' || f.phase === 'mapped') facts.push(kind === 'mdb' ? h('span', {}, 'Header on row ', h('b', {}, '3'), ' · 2 title rows skipped · ', h('b', {}, fmt(m.rowsRead)), ' rows') : h('span', {}, h('b', {}, D.tmplCols.length), ' columns found · all matched'));
    return h('div', { class: 'drop filled fade-in' }, h('div', { class: 'fcard' },
      h('div', { class: 'cap' }, label),
      h('div', { class: 'fname' }, f.phase === 'mapped' ? h('span', { class: 'ok' }, '✓') : null, h('span', {}, f.name), h('span', { class: 'muted' }, fileSize(f.size))),
      f.phase === 'reading' ? h('div', { class: 'bar' }, h('i', { id: 'bar-' + kind, style: { width: f.pct + '%' } })) : null,
      f.phase === 'reading' ? h('span', { class: 'cap' }, 'Reading file…') : h('div', { class: 'facts' }, facts),
      f.phase === 'mapped' ? h('div', {}, h('button', { class: 'link', onclick: () => { st()[kind] = null; if (kind === 'mdb') { st().map = null; st().ingested = false; st().proc = null; st().done[1] = false; } drawUpload(); App.chrome(false); } }, 'Replace file')) : null));
  }

  function previewPanel() {
    const m = D.meta;
    const head = h('tr', {}, h('th', { class: 'rn' }, ''), m.headers.map(x => h('th', {}, x)));
    const rows = [
      h('tr', { class: 'skip' }, h('td', { class: 'rn' }, 1), h('td', { colspan: m.headers.length }, 'Unit 100 process plant · IO list')),
      h('tr', { class: 'skip' }, h('td', { class: 'rn' }, 2), h('td', { colspan: m.headers.length }, 'Rev A · issued for design')),
      h('tr', { class: 'hdr' }, h('td', { class: 'rn' }, 3), m.headers.map(x => h('td', {}, x))),
      ...D.preview.slice(0, 5).map((r, i) => h('tr', {}, h('td', { class: 'rn' }, 4 + i), r.map(c => h('td', {}, c)))),
    ];
    return h('div', { class: 'panel fade-in', style: { marginBottom: '12px' } },
      h('div', { class: 'panel-h' }, h('h3', {}, 'Sheet and header row'), h('div', { class: 'row' }, ...m.sheets.map(s => h('span', { class: 'chip' + (s.used ? ' ok' : ''), title: s.used ? 'Read' : 'Not read: no Tag column' }, s.name + (s.used ? ` · ${fmt(s.rows)} rows` : ' · not read'))))),
      h('div', { class: 'sheetprev' }, h('table', {}, h('tbody', {}, head, rows))));
  }

  function mappingPanel() {
    const s = st(); const rows = s.map.map((m, i) => ({ m, i })).sort((a, b) => (a.m.accepted === b.m.accepted ? a.i - b.i : a.m.accepted ? 1 : -1));
    const need = s.map.filter(m => !m.accepted).length;
    return h('div', { class: 'panel', style: { marginBottom: '12px' } },
      h('div', { class: 'panel-h' }, h('h3', {}, 'Columns in the IO list'), h('span', { class: 'chip ' + (need ? 'warn' : 'ok') }, need ? `${need} need a look` : 'All columns confirmed')),
      h('div', { class: 'tbl-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Column in file', 'First values', 'Read as', 'Confidence', 'Suggested by', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, rows.map(({ m, i }, r) => h('tr', { class: (m.accepted ? '' : 'amber ') + (s.mapAnim ? 'fade-in' : ''), style: s.mapAnim ? { animationDelay: r * 70 + 'ms' } : null },
          h('td', { class: 'mono' }, m.header),
          h('td', { class: 'mono muted' }, m.samples.map(x => String(x).slice(0, 26)).join(' · ')),
          h('td', {}, h('select', { class: 'sel', 'aria-label': 'Read ' + m.header + ' as', onchange: e => { m.field = e.target.value; } }, FIELDS.map(([v, t]) => h('option', { value: v, selected: v === m.field }, t))), m.note && !m.accepted ? h('div', { class: 'cap', style: { marginTop: '4px', maxWidth: '300px' } }, m.note) : null),
          h('td', {}, conf(m.conf)),
          h('td', {}, h('span', { class: 'chip ' + (m.by === 'AI' ? 'info' : '') }, m.by === 'AI' ? 'AI suggestion' : m.by)),
          h('td', {}, m.accepted ? h('span', { class: 'chip ok' }, '✓') : h('button', { class: 'btn small', onclick: () => { m.accepted = true; drawUpload(); App.chrome(false); } }, 'Accept'))))))));
  }

  function tmplPanel() {
    return h('div', { class: 'panel fade-in', style: { marginBottom: '12px' } },
      h('div', { class: 'panel-h' }, h('h3', {}, 'Columns in the allocation template'), h('span', { class: 'chip ok' }, `${D.tmplCols.length} of ${D.tmplCols.length} matched`)),
      h('div', { class: 'pad' }, h('div', { class: 'row' }, ...D.tmplCols.map(c => h('span', { class: 'chip mono', title: Math.round(c.conf * 100) + '% match' }, c.header + ' → ' + c.field)))),
    );
  }

  function dataChecks() {
    const by = {}; D.dataTqs.forEach(t => { const n = t.code === 'D08' ? D.stats.cables : t.code === 'D12' ? 1 : Math.max(t.tags.length, t.cables.length, 1); (by[t.code] = by[t.code] || { code: t.code, sev: t.severity, n: 0, cnt: 0 }); by[t.code].n += n; by[t.code].cnt++; });
    const list = Object.values(by).sort((a, b) => ({ blocking: 0, hardware: 1, info: 2 }[a.sev] - { blocking: 0, hardware: 1, info: 2 }[b.sev]) || nat(a.code, b.code));
    const block = D.dataTqs.filter(t => t.severity === 'blocking').length, hw = D.dataTqs.filter(t => t.severity === 'hardware').length;
    return h('div', { class: 'panel fade-in', id: 'checks' },
      h('div', { class: 'panel-h' }, h('h3', {}, 'Data checks'), h('span', { class: 'cap' }, `${D.dataTqs.length} TQs`)),
      h('div', { class: 'kpis' }, [['Signals read', fmt(D.meta.rowsRead)], ['Cables', D.stats.cables], ['IO groups', D.stats.groups], ['Blocking TQs', block], ['Hardware TQs', hw]].map(([c, v], i) => h('div', { class: 'kpi' }, h('span', { class: 'cap' }, c), h('div', { class: 'v', style: i >= 3 && v ? { color: 'var(--warn)' } : null }, v)))),
      h('div', { class: 'tbl-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Code', 'Severity', 'Found', 'Meaning', 'What the tool does'].map(x => h('th', {}, x)))),
        h('tbody', {}, list.map(r => h('tr', {}, h('td', { class: 'mono' }, r.code), h('td', {}, chipSev(r.sev)), h('td', { class: 'num' }, r.n), h('td', {}, CODE_NAME[r.code] || r.code), h('td', { class: 'muted' }, SEV_TEXT[r.sev])))))),
    );
  }

  function drawUpload() {
    const s = st(); if (!upRoot) return;
    const kids = [];
    kids.push(h('div', { class: 'drops' }, dropzone('mdb'), dropzone('tmpl')));
    if (!s.mdb) kids.push(h('div', { class: 'cap', style: { margin: '-2px 2px 12px' } }, 'No files at hand? ', h('button', { class: 'link', onclick: async () => { await attach('mdb'); attach('tmpl'); } }, 'Use the sample IO list and template'), '.'));
    if (s.mdb && s.mdb.phase === 'mapped') {
      kids.push(previewPanel(), mappingPanel());
      if (s.tmpl && s.tmpl.phase === 'mapped') kids.push(tmplPanel());
      const need = s.map.filter(m => !m.accepted).length;
      if (!s.ingested) {
        kids.push(h('div', { class: 'panel pad', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h('span', { class: 'muted' }, need ? `Accept ${need} column${need > 1 ? 's' : ''} above to continue.` : 'Columns confirmed.'),
          h('span', { style: { flex: 1 } }),
          s.proc && s.proc.running ? null : h('button', { class: 'btn primary', disabled: !!need, onclick: confirmColumns }, 'Confirm columns')));
      }
    }
    if (s.proc) {
      const pp = h('div', { class: 'panel fade-in', style: { marginBottom: '12px' } }, h('div', { class: 'panel-h' }, h('h3', {}, 'Reading the signals')), s.proc.list.el);
      kids.push(pp);
    }
    if (s.ingested) {
      kids.push(dataChecks());
      kids.push(h('div', { class: 'panel pad fade-in', style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' } }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn primary', onclick: () => App.go(2) }, 'Set rules')));
    }
    const sc = upRoot.parentNode ? upRoot.parentNode.scrollTop : 0;
    upRoot.replaceChildren(...kids);
    if (upRoot.parentNode) upRoot.parentNode.scrollTop = sc;
  }

  async function confirmColumns() {
    const s = st();
    const stages = [['Reading rows from the IO List sheet', 700, `${fmt(D.meta.rowsRead)} rows`], ['Normalising tags, pairs and IO types', 650, 'IO types folded to the table'], ['Building cables from cable and pair', 560, `${D.stats.cables} cables`], ['Checking the data against the rules', 800, `${D.dataTqs.length} TQs raised`]];
    const list = stageList(stages); s.proc = { running: true, list }; drawUpload();
    $('#work').scrollTop = $('#work').scrollHeight;
    for (let i = 0; i < stages.length; i++) { list.set(i, 'run'); await sleep(stages[i][1]); list.set(i, 'done', stages[i][2]); }
    await sleep(350);
    s.proc = null; s.ingested = true; s.done[1] = true; drawUpload(); App.chrome(true);
    const c = $('#checks'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ======================================================================
  // 2. Rules
  // ======================================================================
  function ruleCard(o) {
    return h('section', { class: 'panel rule' + (o.on === false ? ' off' : '') + (o.wide ? ' wide' : '') },
      h('div', { class: 'rhead' }, h('h3', {}, o.title), h('span', { class: 'id' }, o.id), o.locked ? h('span', { class: 'chip' }, 'Core') : o.onToggle ? sw(o.on, o.onToggle, o.title + ' on or off') : null),
      h('div', { class: 'rsum' }, o.summary), h('div', { class: 'rbody' }, o.body));
  }

  function viewRules() {
    const root = h('div'); const s = st(), r = s.rules;
    const redraw = () => { const sc = $('#work').scrollTop; root.replaceChildren(...build()); $('#work').scrollTop = sc; App.rulesChanged(); };
    const N = r.k * 8, R = App.reserve(r);
    function build() {
      const diff = App.ruleDiff(); const N2 = r.k * 8, R2 = App.reserve(r);
      const cards = [
        ruleCard({ id: 'capacity', title: 'Capacity', locked: true, summary: `A cabinet holds ${N2} baseplates, ${N2 * 12} CHARMs. A CIOC holds 96.`, body: [
          h('div', { class: 'row' }, h('label', {}, 'CHARMs per baseplate'), h('span', { class: 'pill' }, '12'), h('span', { class: 'cap' }, 'hardware')),
          h('div', { class: 'row' }, h('label', {}, 'Baseplates per CIOC'), h('span', { class: 'pill' }, '8'), h('span', { class: 'cap' }, 'hardware')),
          h('div', { class: 'row' }, h('label', {}, 'CIOCs per cabinet'), seg([[3, '3'], [4, '4']], r.k, v => { r.k = v; redraw(); }, 'CIOCs per cabinet'), h('span', { class: 'cap' }, 'project rule')),
          h('div', { class: 'row' }, h('label', {}, 'Cabinet limit'), seg([[0, 'No limit'], [D.limit, String(D.limit)]], r.max ? D.limit : 0, v => { r.max = v; redraw(); }, 'Cabinet limit'))] }),
        ruleCard({ id: 'cable', title: 'Cable rules', locked: true, summary: 'A cable is never split. Its pairs sit side by side in pair order. Unused pairs keep their slots.', body: [
          h('div', { class: 'row' }, h('label', {}, 'Standard sizes'), ...[2, 6, 12, 24].map(x => h('span', { class: 'pill' }, x))),
          h('div', { class: 'row' }, h('label', {}, 'Size when missing'), h('span', { class: 'pill' }, 'infer from highest pair'), h('span', { class: 'cap' }, 'raises D08')),
          h('div', { class: 'row' }, h('label', {}, 'A 24-pair cable'), h('span', { class: 'cap' }, 'starts at slot 1 and fills 2 baseplates'))] }),
        ruleCard({ id: 'groups', title: 'Keep groups together', on: r.grp, onToggle: v => { r.grp = v; redraw(); }, summary: 'Signals with the same IO group stay in the same cabinets, in sequence.', body: [
          h('div', { class: 'row' }, h('label', {}, 'Field'), h('span', { class: 'pill' }, 'IO group')),
          h('div', { class: 'row' }, h('label', {}, 'Span'), h('span', { class: 'pill' }, 'only if too big')),
          h('div', { class: 'row' }, h('label', {}, 'Order'), h('span', { class: 'pill' }, 'natural (G2 before G10)'))] }),
        ruleCard({ id: 'ab', title: 'A and B never share a CIOC', on: r.ab, onToggle: v => { r.ab = v; redraw(); }, summary: 'No CIOC holds two different values of Segregation. Blank values may mix.', body: [
          h('div', { class: 'row' }, h('label', {}, 'Field'), h('span', { class: 'pill' }, 'Segregation')),
          h('div', { class: 'row' }, h('label', {}, 'Level'), h('span', { class: 'pill' }, 'CIOC')),
          h('div', { class: 'row' }, h('label', {}, 'Blank values'), h('span', { class: 'pill' }, 'may mix'))] }),
        ruleCard({ id: 'cioc-sharing', title: 'CIOC sharing', summary: { class: 'One group and side per CIOC, like G1·A, G1·B and G2. Cables with no group may fill free slots.', group: 'One group per CIOC. Its A, B and blank cables may share it.', any: 'Rule off. Any cables may share a CIOC as long as A and B stay apart.' }[r.preset], body: [
          h('div', { class: 'row' }, h('label', {}, 'Preset'), seg([['class', 'Class'], ['group', 'Group'], ['any', 'Any']], r.preset, v => { r.preset = v; redraw(); }, 'CIOC sharing')),
          h('div', { class: 'cap' }, `Cabinets needed with these other settings: Class ${currentCompare().class} · Group ${currentCompare().group} · Any ${currentCompare().any}`)] }),
        ruleCard({ id: 'spare', title: 'Spare room per cabinet', on: r.spareOn, onToggle: v => { r.spareOn = v; redraw(); }, summary: r.spareOn ? `${r.spare}% of ${N2} baseplates = ${(r.spare * N2 / 100).toFixed(1)}, rounded up to ${R2} empty baseplates kept per cabinet. ${N2 - R2} usable.` : 'No baseplates are kept empty.', body: [
          h('div', { class: 'row' }, h('label', {}, 'Percent'), seg([[10, '10%'], [20, '20%']], r.spare, v => { r.spare = v; redraw(); }, 'Spare percent')),
          h('div', { class: 'row' }, h('label', {}, 'Counted in'), h('span', { class: 'pill' }, 'baseplates per cabinet, rounded up')),
          h('div', { class: 'row' }, h('label', {}, 'Revisions'), h('span', { class: 'pill' }, 'may use the reserve if nothing else fits'))] }),
        ruleCard({ id: 'hardware', title: 'CHARM and terminal block', wide: true, locked: true, summary: 'The first row that matches the signal\'s IO type decides the CHARM and terminal block.', body: [
          h('div', { class: 'tbl-wrap', style: { maxHeight: '320px', border: '1px solid var(--line)', borderRadius: '6px' } }, h('table', {}, h('thead', {}, h('tr', {}, ['IO type', 'CHARM', 'Terminal block', 'Product'].map(x => h('th', {}, x)))),
            h('tbody', {}, D.hwOrder.map(k => h('tr', {}, h('td', { class: 'mono' }, k), h('td', {}, h('input', { class: 'txt', style: { width: '100%' }, value: r.hw[k].charm, 'aria-label': k + ' CHARM', oninput: e => { r.hw[k].charm = e.target.value; App.rulesChanged(); } })), h('td', {}, h('input', { class: 'txt', style: { width: '100%' }, value: r.hw[k].tb, 'aria-label': k + ' terminal block', oninput: e => { r.hw[k].tb = e.target.value; App.rulesChanged(); } })), h('td', { class: 'cap' }, D.hw[k].model))))))] }),
        namingCard(),
      ];
      return [
        h('div', { class: 'panel', style: { marginBottom: '12px' } }, h('div', { class: 'panel-h' }, h('div', {}, h('h2', {}, 'Set rules'), h('div', { class: 'cap' }, `Rule set default-deltav · ${App.ruleCount()} rules on · ${diff.length ? 'changed: ' + diff.join(', ') : 'no changes from the default'}`)),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { st().rules = App.defaultRules(); App.rulesChanged(); App.go(2); toast('Rules reset'); } }, 'Reset'),
            h('label', { class: 'btn', style: { display: 'inline-flex', alignItems: 'center' } }, 'Load rules', h('input', { type: 'file', hidden: true, accept: '.json', onchange: loadRules })),
            h('button', { class: 'btn primary', onclick: saveRules }, 'Save rules')))),
        h('div', { class: 'rules' }, cards),
      ];
    }
    root.append(...build());
    return root;
  }
  function currentCompare() { const k = D.scenarios[App.scnKey()]; return k.compare; }

  function namingCard() {
    const r = st().rules, nm = r.names; const known = ['area', 'unit', 'seq', 'cioc no', 'n'];
    const pv = h('div', { class: 'preview' }); const err = h('div', { class: 'cap', style: { color: 'var(--error)' } });
    const upd = () => {
      const ctx = { area: nm.area, unit: nm.unit }; const f = (p, c) => IOS.fmtName(p, { ...ctx, ...c });
      pv.replaceChildren(...[['Cabinet', f(nm.cabinet, { seq: 1 })], ['CIOC', f(nm.cioc, { seq: 1 })], ['Baseplate', f(nm.baseplate, { ciocNo: 1, n: 1 })], ['Controller', f(nm.controller, { seq: 1 })], ['System cabinet', f(nm.system, { seq: 1 })]].flatMap(([a, b]) => [h('span', {}, a), h('span', {}, b)]));
      const bad = []; ['cabinet', 'cioc', 'baseplate', 'controller', 'system'].forEach(k => { (nm[k].match(/<[^>]*>/g) || []).forEach(t => { const nme = t.slice(1, -1).split(':')[0].trim().toLowerCase(); if (!known.includes(nme)) bad.push(`${t} in the ${k} pattern`); }); });
      err.textContent = bad.length ? 'R07: unknown token ' + bad.join(', ') + '. Use <Area> <Unit> <Seq:N> <CIOC no:N> <n>.' : '';
    };
    const field = (k, label, mono) => h('div', { class: 'row' }, h('label', {}, label), h('input', { class: 'txt mono', style: { flex: 1, minWidth: '180px' }, value: nm[k], 'aria-label': label, oninput: e => { nm[k] = e.target.value; upd(); App.rulesChanged(); if (st().run) App.renderDetail(); } }));
    const card = ruleCard({ id: 'names', title: 'Names', wide: true, locked: true, summary: 'Tokens: <Area> <Unit> <Seq:N> <CIOC no:N> <n>. :N pads with zeros.', body: [
      h('div', { class: 'row' }, field('area', 'Area'), field('unit', 'Unit')),
      field('cabinet', 'Marshalling cabinet'), field('cioc', 'CIOC'), field('baseplate', 'Baseplate'), field('controller', 'Controller'), field('system', 'System cabinet'), err, pv] });
    upd(); return card;
  }

  function saveRules() {
    const r = st().rules; const out = { version: 1, name: 'default-deltav', project: D.meta.project, saved: new Date().toISOString(), rules: r };
    U.download('unit-100.rules.json', new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    st().rulesSaved = true; st().done[2] = true; toast('Rule set saved'); App.go(3);
  }
  function loadRules(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { const j = JSON.parse(t); if (j.rules && j.rules.names) { st().rules = Object.assign(App.defaultRules(), j.rules); App.rulesChanged(); App.go(2); toast('Rule set loaded'); } else toast('That file is not a rule set'); } catch (x) { toast('That file is not a rule set'); } });
  }

  // ======================================================================
  // 3. Allocate
  // ======================================================================
  let curRun = null, mv = {};
  function viewAllocate() {
    const s = st();
    if (s.running && curRun) return curRun.panel;
    const root = h('div');
    if (!s.run) {
      root.append(h('div', { class: 'panel' },
        h('div', { class: 'panel-h' }, h('div', {}, h('h2', {}, 'Allocate'), h('div', { class: 'cap' }, `${fmt(D.meta.rowsRead)} signals · ${App.ruleCount()} rules on · ${D.dataTqs.filter(t => t.severity === 'blocking').length} blocking TQs will be left out`))),
        h('div', { class: 'pad' }, h('p', { style: { margin: '0 0 14px', maxWidth: '620px' } }, 'Every signal gets a cabinet, CIOC, baseplate and CHARM slot. Anything that cannot be placed becomes a TQ.'),
          h('div', { class: 'row', style: { marginBottom: '16px' } }, ...App.ruleDiff().length ? App.ruleDiff().map(x => h('span', { class: 'chip warn' }, x)) : [h('span', { class: 'chip ok' }, 'Default rule set')]),
          h('button', { class: 'btn primary', style: { height: '40px', padding: '0 22px' }, onclick: () => App.runAllocation() }, 'Run allocation'))));
      return root;
    }
    root.append(...banners(), mapPanel(false));
    return root;
  }

  function banners() {
    const s = st(), out = [], scn = s.run.scn;
    if (s.dirty) out.push(h('div', { class: 'banner' }, h('span', { class: 'sp' }, 'Rules changed since this run. The map and report show the earlier result.'), h('button', { class: 'btn primary small', onclick: () => App.runAllocation() }, 'Run allocation')));
    if (scn.unplacedSignals) out.push(h('div', { class: 'banner err' }, h('span', { class: 'sp' }, `${fmt(scn.unplacedSignals)} signals in ${scn.unp.length} cables could not be placed under the cabinet limit of ${D.limit}.`), h('button', { class: 'btn small', onclick: () => { st().reportTab = 'tq'; st().tq = { sev: 'all', code: 'C02', q: '', sel: null }; App.go(4); } }, 'Open the TQ')));
    return out;
  }

  function legend(rev) {
    const sw2 = (c, t, st2) => h('span', {}, h('i', { style: { background: c, border: st2 || 'none' } }), t);
    const base = [sw2(MAP.COL.AI, 'AI'), sw2(MAP.COL.AO, 'AO'), sw2(MAP.COL.DI, 'DI'), sw2(MAP.COL.DO, 'DO standard'), sw2(MAP.COL.DOI, 'DO isolated, fused'), sw2('#9CA3AF', 'Spare pair'), sw2('#F7F9F8', 'Free', '1.5px solid #D5DAD7')];
    if (rev) base.push(sw2('#fff', 'Added', '3px solid #1D4ED8'), sw2('#fff', 'Moved in', '3px solid #B45309'), sw2('#fff', 'Freed slot', '2px dashed #6B7280'), h('span', { class: 'cap', style: { fontSize: '15px' } }, 'White dot: CHARM swap. White bar: renamed. Faded: unchanged.'));
    return h('div', { class: 'legend' }, base);
  }

  function mapPanel(revMode) {
    const s = st(); const cabs = App.cabinets(); if (!cabs.length) return h('div');
    if (!cabs.find(c => c.n === s.cab)) s.cab = cabs[0].n;
    mv = { head: h('div', { class: 'maphead' }), host: h('div', { class: 'mapwrap' }), table: h('div'), legend: h('div') };
    const top = h('div', { class: 'panel mapcard' }, mv.head, mv.host, mv.legend);
    const tbl = h('div', { class: 'panel', style: { marginTop: '16px' } }, h('div', { class: 'panel-h' }, h('h3', {}, 'Cables in this cabinet')), mv.table);
    const wrap = h('div', {}, top, tbl);
    drawMapParts(revMode);
    return wrap;
  }
  function freedSet() { const set = new Set(); const I = D.revision.impact; const add = a => set.add(a[0] + '/' + a[1] + '/' + a[2] + '/' + a[3]); I.deleted.forEach(d => add(d.addr)); I.moved.forEach(m => add(m.from)); return set; }
  function drawMapParts(revMode) {
    const s = st(); const layout = App.layout(), seqMap = App.seqMap(); if (!layout || !mv.host) return;
    const rev = App.inRevView() && s.revView === 'changes'; const cab = s.cab; const c = App.cabinets().find(x => x.n === cab) || {};
    const nm = IOS.names(s.rules, seqMap, [cab, 1, 1, 1]); const mr = App.mapRules();
    const list = App.cabinets(); const idx = list.findIndex(x => x.n === cab);
    mv.head.replaceChildren(...[h('div', { class: 'ttl' }, h('h2', {}, nm.cabinet), h('div', { class: 'sub' }, `Cabinet ${idx + 1} of ${list.length}. `, mr.ab ? h('b', {}, 'Red dashed line: A and B never share a CIOC.') : 'A and B separation is off.')),
      revMode ? seg([['changes', 'Changes'], ['B', 'Rev B'], ['A', 'Rev A']], s.revView, v => { s.revView = v; App.go(5); }, 'Revision view') : null,
      h('button', { class: 'btn navbtn', disabled: idx <= 0, onclick: () => App.stepCab(-1), 'aria-label': 'Previous cabinet' }, 'Prev'),
      h('button', { class: 'btn navbtn', disabled: idx >= list.length - 1, onclick: () => App.stepCab(1), 'aria-label': 'Next cabinet' }, 'Next')].filter(Boolean));
    MAP.render(mv.host, { layout, cab, seqMap, rules: mr, rev, freed: rev ? freedSet() : null, selected: s.sel, hiCable: s.hiCable, onSelect: App.selectCell, tipText: App.tipText });
    mv.legend.replaceChildren(legend(rev));
    // cables table
    const blocks = layout.blocks.filter(b => b.start[0] === cab).sort((a, b) => a.start[1] - b.start[1] || a.start[2] - b.start[2] || a.start[3] - b.start[3]);
    mv.table.replaceChildren(h('div', { class: 'tbl-wrap', style: { maxHeight: '300px' } }, h('table', {}, h('thead', {}, h('tr', {}, ['Cable', 'Group · side', 'CIOC', 'Baseplates', 'Slots', 'Signals', 'IO'].map(x => h('th', {}, x)))),
      h('tbody', {}, blocks.map(b => {
        const n = IOS.names(s.rules, seqMap, b.start); const last = (b.start[2] - 1) * 12 + (b.start[3] - 1) + b.size - 1; const bp2 = 1 + Math.floor(last / 12);
        const ios = new Set(); const cells = layout.cabs.get(cab); for (let p = 1; p <= b.size; p++) { const a = [b.start[0], b.start[1], 1 + Math.floor(((b.start[2] - 1) * 12 + b.start[3] - 1 + p - 1) / 12), 1 + (((b.start[2] - 1) * 12 + b.start[3] - 1 + p - 1) % 12)]; const cell = cells.get(a[1] + '/' + a[2] + '/' + a[3]); if (cell && cell.sig && cell.sig.io) ios.add(cell.sig.io); }
        return h('tr', { class: 'click', onclick: () => App.selectCell(cab, b.start[1] + '/' + b.start[2] + '/' + b.start[3]) }, h('td', { class: 'mono' }, b.id), h('td', {}, (b.group || '–') + ' · ' + (b.seg || '–')), h('td', { class: 'mono' }, n.cioc), h('td', { class: 'mono' }, b.start[2] === bp2 ? b.start[2] : `${b.start[2]}–${bp2}`), h('td', { class: 'mono' }, `${b.start[3]}–${((last) % 12) + 1}`), h('td', { class: 'num' }, `${b.n} of ${b.size}`), h('td', { class: 'mono muted' }, [...ios].slice(0, 3).join(', ')));
      })))));
  }
  function refreshMap() { drawMapParts(App.state.step === 5 && App.state.rev); }

  function showRun(stages, scn) {
    const list = stageList(stages);
    const panel = h('div', { class: 'panel' }, h('div', { class: 'panel-h' }, h('div', {}, h('h2', {}, 'Allocating'), h('div', { class: 'cap' }, `${fmt(D.meta.rowsRead - D.stats.blocked)} signals under ${App.ruleCount()} rules`))), list.el);
    curRun = { panel, list };
    $('#work').replaceChildren(panel); $('#left').replaceChildren(h('div', { class: 'list-h' }, h('span', {}, 'Cabinets')), h('div', { class: 'pad empty' }, 'Allocating…')); $('#right').replaceChildren(h('section', { class: 'panel slotcard' }, h('div', { class: 'lbl' }, 'Selected slot'), h('p', { class: 'empty' }, 'Available when the run finishes.')));
  }
  function stage(i, state, meta) { if (curRun) curRun.list.set(i, state, meta); }

  // ======================================================================
  // 4. Report + TQs
  // ======================================================================
  function viewReport() {
    const s = st(); const scn = s.run.scn; const root = h('div');
    const tabs = [['check', 'Rule check'], ['tq', 'TQ register'], ['sum', 'Summary']];
    const tqs = App.baseTqs(); const open = App.openCount(tqs);
    const bar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(s.reportTab === k), onclick: () => { s.reportTab = k; if (k !== 'tq') s.tq.sel = null; App.go(4); } }, t + (k === 'tq' ? ` (${open})` : ''))), h('span', { class: 'sp' }),
      h('div', { class: 'row', style: { padding: '5px 4px' } }, h('button', { class: 'btn small', onclick: () => dlTq(tqs) }, 'TQ register'), h('button', { class: 'btn primary small', onclick: () => App.exportExcel() }, 'Download Excel')));
    const body = h('div', { class: 'panel', style: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 0 } });
    if (s.dirty) root.append(h('div', { class: 'banner' }, h('span', { class: 'sp' }, 'Rules changed since this run. The report shows the earlier result.'), h('button', { class: 'btn primary small', onclick: () => App.runAllocation({ to: 4, fast: true }) }, 'Run allocation')));
    if (s.reportTab === 'check') body.append(reportCheck(scn));
    else if (s.reportTab === 'tq') body.append(reportTq(tqs));
    else body.append(reportSummary(scn));
    root.append(bar, body); return root;
  }
  function dlAlloc(tqs) { const r = st().run; EXPORT.write(EXPORT.allocationBook({ rules: st().rules, scn: r.scn, layout: r.layout, seqMap: r.seqMap, tqs }), 'IO_Allocation_RevA.xlsx'); toast('Workbook downloaded'); }
  function dlTq(tqs) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, EXPORT.tqSheet(tqs, 'A'), 'TQ Register'); EXPORT.write(wb, 'TQ_Register_RevA.xlsx'); toast('TQ register downloaded'); }

  function checkTable(list) {
    return h('div', { class: 'tbl-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Check', 'Kind', 'Result', 'Checked', 'Violations'].map(x => h('th', { class: ['Checked', 'Violations'].includes(x) ? 'num' : '' }, x)))),
      h('tbody', {}, list.map(c => [h('tr', {}, h('td', {}, c.name), h('td', { class: 'muted' }, c.kind === 'rule' ? 'Rule' : 'Invariant'), h('td', {}, h('span', { class: 'chip ' + ({ pass: 'ok', off: '', info: 'warn', fail: 'err' }[c.status]) }, c.status === 'pass' ? 'Pass' : c.status === 'off' ? 'Off' : c.status === 'info' ? 'Reported' : 'Fail')), h('td', { class: 'num' }, c.status === 'off' ? '–' : fmt(c.checked)), h('td', { class: 'num' }, c.status === 'off' ? '–' : c.violations)),
        c.note ? h('tr', {}, h('td', { colspan: 5, class: 'cap' }, c.note)) : null]))));
  }
  function reportCheck(scn) {
    const v = scn.check.reduce((a, c) => a + c.violations, 0); const on = scn.check.filter(c => c.status !== 'off').length;
    return h('div', {}, h('div', { class: 'pad' }, h('div', { class: 'banner ' + (v ? 'err' : 'good'), style: { margin: 0 } }, h('b', { style: { fontFamily: 'var(--mono)', fontSize: '18px' } }, `${v} violations`), h('span', { class: 'sp' }, `${on} checks run on the written Excel file. ${fmt(D.meta.rowsRead)} signals = ${fmt(scn.placedSignals)} placed + ${fmt(D.meta.rowsRead - scn.placedSignals)} queried.`))), checkTable(scn.check));
  }

  function reportTq(tqs) {
    const s = st(); const f = s.tq; const codes = [...new Set(tqs.map(t => t.code))].sort(nat);
    let list = tqs.filter(t => (f.sev === 'all' || t.severity === f.sev) && (f.code === 'all' || t.code === f.code) && (!f.q || (t.message + t.tags.join(' ') + t.cables.join(' ')).toLowerCase().includes(f.q.toLowerCase())));
    const body = h('tbody', {}, list.map(t => h('tr', { class: 'click' + (f.sel === t.id ? ' sel' : ''), onclick: () => { f.sel = t.id; App.go(4); } },
      h('td', { class: 'mono' }, t.no), h('td', { class: 'mono' }, t.code), h('td', {}, chipSev(t.severity)), h('td', { class: 'mono' }, (t.tags.length ? t.tags.slice(0, 2).join(', ') + (t.tags.length > 2 ? ` +${t.tags.length - 2}` : '') : t.cables.length ? t.cables.slice(0, 2).join(', ') + (t.cables.length > 2 ? ` +${t.cables.length - 2}` : '') : '–')), h('td', {}, t.message), h('td', {}, h('span', { class: 'chip ' + (t.status === 'Open' ? 'warn' : 'ok') }, t.status)))));
    const fl = h('div', { class: 'filters' },
      h('div', { class: 'seg' }, [['all', 'All'], ['blocking', 'Blocking'], ['hardware', 'Hardware'], ['info', 'Info']].map(([v, t]) => h('button', { 'aria-pressed': String(f.sev === v), onclick: () => { f.sev = v; App.go(4); } }, t))),
      h('select', { class: 'sel', 'aria-label': 'Filter by code', onchange: e => { f.code = e.target.value; App.go(4); } }, h('option', { value: 'all' }, 'All codes'), codes.map(c => h('option', { value: c, selected: f.code === c }, c + ' · ' + (CODE_NAME[c] || '')))),
      h('input', { class: 'txt', placeholder: 'Search tag, cable or text', value: f.q, 'aria-label': 'Search TQs', oninput: e => { f.q = e.target.value; clearTimeout(f._t); f._t = setTimeout(() => { App.go(4); const i = $('#work input.txt'); if (i) { i.focus(); i.setSelectionRange(f.q.length, f.q.length); } }, 250); } }),
      h('span', { class: 'cap' }, `${list.length} of ${tqs.length} shown`));
    return h('div', {}, fl, h('div', { class: 'tbl-wrap', style: { maxHeight: 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, ['TQ no', 'Code', 'Severity', 'Tag or cable', 'Message', 'Status'].map(x => h('th', {}, x)))), body)),
      list.length ? null : h('div', { class: 'pad empty' }, 'No open TQs match.'));
  }
  function tqDetail() {
    const s = st(); const t = App.tqs().find(x => x.id === s.tq.sel); if (!t) return h('p', { class: 'empty' }, 'Select a TQ to read it.');
    const tested = t.tested || [];
    return h('div', {}, h('div', { class: 'row', style: { marginBottom: '6px' } }, h('h3', { class: 'mono' }, t.no), h('span', { class: 'chip mono' }, t.code), chipSev(t.severity), h('span', { class: 'chip ' + (t.status === 'Open' ? 'warn' : 'ok') }, t.status)),
      h('p', { style: { margin: '6px 0 10px' } }, t.message),
      t.rules.length ? h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'cap' }, 'Rules'), ...t.rules.map(r => h('span', { class: 'chip mono' }, r))) : null,
      t.tags.length ? h('p', { class: 'cap mono', style: { wordBreak: 'break-all' } }, 'Tags: ' + t.tags.slice(0, 12).join(', ') + (t.tags.length > 12 ? ` … +${t.tags.length - 12}` : '')) : null,
      t.cables.length ? h('p', { class: 'cap mono', style: { wordBreak: 'break-all' } }, 'Cables: ' + t.cables.slice(0, 10).join(', ') + (t.cables.length > 10 ? ` … +${t.cables.length - 10}` : '')) : null,
      h('h3', { style: { margin: '12px 0 4px' } }, 'Options'),
      tested.length ? tested.map(o => h('div', { class: 'opt' }, o.label, h('span', { class: 'eff' }, o.effect), h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => applyOption(o) }, 'Apply and re-run'))) : t.options.map((o, i) => h('div', { class: 'opt' }, `${i + 1}. ${o}`)),
      h('div', { class: 'row', style: { marginTop: '12px' } }, App.inRevView() ? null : h('button', { class: 'btn small', onclick: () => { s.tqDone[t.key] = !s.tqDone[t.key]; App.go(4); App.chrome(false); } }, t.status === 'Open' ? 'Mark answered' : 'Reopen')));
  }
  function applyOption(o) {
    const r = st().rules, x = o.set;
    r.spareOn = x.sparePct > 0; if (x.sparePct > 0) r.spare = x.sparePct; r.k = x.K; r.preset = x.preset; r.max = x.max && x.max <= D.limit ? D.limit : 0;
    toast('Option applied.'); st().tq.sel = null; st().tq.code = 'all'; App.runAllocation({ to: 4, fast: true });
  }

  function reportSummary(scn) {
    const s = st(); const r = s.rules;
    const kp = [['Cabinets', scn.cabs.length, `lower bound ${scn.lowerBound}`], ['CIOCs', scn.ciocs, `${scn.cabs.length ? (scn.ciocs / scn.cabs.length).toFixed(1) : 0} per cabinet`], ['Average fill', (App.cabinets().length ? Math.round(10 * App.cabinets().reduce((a, c) => a + c.fill, 0) / App.cabinets().length) / 10 : 0) + '%', 'of CHARM slots'], ['Spare baseplates', scn.spareBp, `at least ${App.reserve()} per cabinet`], ['Signals placed', fmt(scn.placedSignals), `${fmt(D.meta.rowsRead - scn.placedSignals)} queried`]];
    const whatif = h('div', { class: 'pad', style: { borderTop: '1px solid var(--line)' } }, h('h3', { style: { marginBottom: '8px' } }, 'What if'),
      h('div', { class: 'row', style: { gap: '20px' } },
        h('div', { class: 'row' }, h('span', { class: 'cap' }, 'Spare'), seg([[0, 'Off'], [10, '10%'], [20, '20%']], r.spareOn ? r.spare : 0, v => { r.spareOn = v > 0; if (v) r.spare = v; App.runAllocation({ to: 4, fast: true }); }, 'Spare percent')),
        h('div', { class: 'row' }, h('span', { class: 'cap' }, 'CIOCs per cabinet'), seg([[3, '3'], [4, '4']], r.k, v => { r.k = v; App.runAllocation({ to: 4, fast: true }); }, 'CIOCs per cabinet')),
        h('div', { class: 'row' }, h('span', { class: 'cap' }, 'CIOC sharing'), seg([['class', 'Class'], ['group', 'Group'], ['any', 'Any']], r.preset, v => { r.preset = v; App.runAllocation({ to: 4, fast: true }); }, 'CIOC sharing'))),
      h('div', { class: 'cap', style: { marginTop: '8px' } }, `Cabinets for each CIOC sharing preset: Class ${scn.compare.class} · Group ${scn.compare.group} · Any ${scn.compare.any}.`));
    return h('div', {}, h('div', { class: 'kpis' }, kp.map(([c, v, x]) => h('div', { class: 'kpi' }, h('span', { class: 'cap' }, c), h('div', { class: 'v' }, v), h('span', { class: 'cap' }, x)))),
      h('div', { class: 'tbl-wrap', style: { maxHeight: 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, ['Cabinet', 'CIOCs', 'Baseplates used', 'Spare baseplates', 'Slots used', 'Fill', 'Signals', 'Groups', 'Sides per CIOC'].map(x => h('th', {}, x)))),
        h('tbody', {}, App.cabinets().map(c => h('tr', { class: 'click', onclick: () => { s.cab = c.n; s.sel = null; App.go(3); } }, h('td', { class: 'mono' }, App.cabName(c.n)), h('td', { class: 'num' }, c.ciocs), h('td', { class: 'num' }, c.bpUsed), h('td', { class: 'num' }, c.bpEmpty), h('td', { class: 'num' }, `${c.slots} / ${App.capSlots()}`), h('td', {}, h('div', { class: 'conf' }, h('div', { class: 'bar thin' }, h('i', { style: { width: Math.min(100, c.fill) + '%' } })), h('span', { style: { width: '54px' } }, c.fill + '%'))), h('td', { class: 'num' }, c.signals), h('td', { class: 'mono' }, c.groups.join(', ') || '–'), h('td', { class: 'mono muted' }, c.sides.map(x => x || '·').join(' | '))))))), whatif);
  }

  // ======================================================================
  // 5. Revise
  // ======================================================================
  let curRev = null;
  function viewRevise() {
    const s = st(); const root = h('div');
    if (s.revRunning && curRev) return curRev.panel;
    if (s.rev) return reviseResults();
    if (s.run.key !== D.baseKey) {
      return h('div', { class: 'panel pad' }, h('h2', {}, 'Revise'), h('p', { style: { maxWidth: '560px' } }, 'The revision is checked against the default rule set. This run used different rules.'),
        h('button', { class: 'btn primary', onclick: () => { s.rules = App.defaultRules(); s.revFile = null; App.runAllocation({ to: 5, fast: true }); } }, 'Use default rules and re-run'));
    }
    // drop zone, then diff preview
    const f = s.revFile; const I = D.revision.impact;
    const input = h('input', { type: 'file', hidden: true, accept: '.xlsx,.xls,.xlsm,.csv', onchange: e => { if (e.target.files[0]) attachRev(e.target.files[0]); } });
    if (!f) {
      const box = h('div', { class: 'drop', style: { margin: 0 }, tabindex: '0', role: 'button', 'aria-label': 'Attach the Rev B file', onclick: () => input.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
        h('div', { class: 'big' }, h('span', { html: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14V4M6 8l4-4 4 4M4 16h12"/></svg>' })),
        h('h3', {}, 'Rev B of the IO list (Excel)'), h('span', { class: 'muted' }, 'Drop the new revision here.'), h('span', { class: 'cap' }, 'or click to browse'), input);
      ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => { e.preventDefault(); box.classList.remove('over'); }));
      box.addEventListener('drop', e => { const fl = e.dataTransfer && e.dataTransfer.files[0]; if (fl) attachRev(fl); });
      root.append(h('div', { class: 'panel-h', style: { padding: '0 0 12px', border: 0 } }, h('div', {}, h('h2', {}, 'Revise'), h('div', { class: 'cap' }, `Rev A: ${App.cabinets().length} cabinets, ${fmt(st().run.scn.placedSignals)} signals placed.`))), box,
        h('div', { class: 'cap', style: { margin: '10px 2px' } }, 'No Rev B at hand? ', h('button', { class: 'link', onclick: () => attachRev() }, 'Use the sample Rev B'), '.'));
      return root;
    }
    root.append(h('div', { class: 'panel', style: { marginBottom: '12px' } }, h('div', { class: 'pad' }, h('div', { class: 'cap' }, 'Rev B of the IO list (Excel)'), h('div', { class: 'fname', style: { margin: '4px 0 8px' } }, f.phase === 'compared' ? h('span', { class: 'ok' }, '✓') : null, h('span', {}, f.name), h('span', { class: 'muted' }, fileSize(f.size))),
      f.phase === 'reading' ? h('div', {}, h('div', { class: 'bar' }, h('i', { id: 'bar-rev', style: { width: f.pct + '%' } })), h('span', { class: 'cap' }, 'Reading file…')) : h('div', { class: 'facts' }, h('span', {}, h('b', {}, fmt(D.revision.rowsRead)), ' rows on sheet IO List'), h('span', {}, 'Rev A: ', h('b', {}, fmt(D.meta.rowsRead)), ' rows')))));
    if (f.phase === 'compared') {
      const kp = [['New tags', I.added.length, 'add'], ['Removed tags', I.deleted.length, 'del'], ['IO type changed', I.swaps.length, ''], ['Renamed', I.renamed.length, ''], ['New cables', D.revision.newCables, 'add']];
      root.append(h('div', { class: 'panel fade-in' }, h('div', { class: 'panel-h' }, h('h3', {}, 'What changed in the file')),
        h('div', { class: 'kpis' }, kp.map(([c, v, k]) => h('div', { class: 'kpi ' + k }, h('span', { class: 'cap' }, c), h('div', { class: 'v' }, v)))),
        h('div', { class: 'pad', style: { display: 'flex', alignItems: 'center', gap: '12px', borderTop: '1px solid var(--line)' } }, h('span', { style: { flex: 1 } }), h('button', { class: 'btn primary', onclick: () => App.runRevision() }, 'Run revision'))));
    }
    return root;
  }
  async function attachRev(file) {
    const s = st(); s.revFile = { name: file ? file.name : D.meta.fileB, size: file ? file.size : 418 * 1024, phase: 'reading', pct: 0 }; App.go(5); const f = s.revFile;
    for (let p = 8; p <= 100; p += 8) { f.pct = Math.min(100, p); const b = $('#bar-rev'); if (b) b.style.width = f.pct + '%'; await sleep(55); }
    f.phase = 'comparing'; App.go(5); await sleep(700); f.phase = 'compared'; App.go(5);
  }
  function showRevRun(stages) {
    const list = stageList(stages); const panel = h('div', { class: 'panel' }, h('div', { class: 'panel-h' }, h('div', {}, h('h2', {}, 'Running the revision'))), list.el);
    curRev = { panel, list }; $('#work').replaceChildren(panel);
  }
  function revStage(i, state, meta) { if (curRev) curRev.list.set(i, state, meta); }

  function reviseResults() {
    const s = st(); const R = D.revision, I = R.impact; const root = h('div');
    const kp = [['Added', I.added.length, 'add', 'V04'], ['Deleted', I.deleted.length, 'del', 'V03'], ['Moved', I.moved.length, 'mov', 'V02'], ['CHARM swaps', I.swaps.length, '', 'V01'], ['Renamed', I.renamed.length, '', 'V05']];
    if (s.revView === 'A') root.append(h('div', { class: 'banner' }, h('span', { class: 'sp' }, 'Showing the Rev A allocation. Switch to Changes to see what Rev B did.'), seg([['changes', 'Changes'], ['B', 'Rev B'], ['A', 'Rev A']], s.revView, v => { s.revView = v; App.go(5); }, 'Revision view')));
    root.append(h('div', { class: 'panel', style: { marginBottom: '12px' } },
      h('div', { class: 'panel-h' }, h('div', {}, h('h2', {}, 'Revision impact'), h('div', { class: 'cap' }, `Rev A → Rev B · ${R.touch.cabs} cabinets, ${R.touch.ciocs} CIOCs and ${R.touch.bps} baseplates touched`)), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: dlImpact }, 'Download impact report'))),
      h('div', { class: 'kpis' }, kp.map(([c, v, k, code]) => h('div', { class: 'kpi ' + k }, h('span', { class: 'cap' }, c + ' · ' + code), h('div', { class: 'v' }, v)))),
      h('div', { class: 'hero' }, h('div', { class: 'big' }, fmt(R.naiveMoved - I.moved.length)), h('div', {}, h('b', {}, 'moves avoided'), h('div', { class: 'cap' }, `A fresh re-run would have moved ${fmt(R.naiveMoved)} of ${fmt(R.common)} signals. This revision moved ${I.moved.length}.`)))));
    if (R.tqs.length) root.append(h('div', { class: 'banner err' }, h('span', { class: 'sp' }, `${R.tqs.length} cable${R.tqs.length > 1 ? 's' : ''} could not be placed.`), h('button', { class: 'btn small', onclick: () => { s.revTab = 'tqs'; App.go(5); } }, 'Open the TQ')));
    root.append(mapPanel(true));
    root.append(impactTabs());
    return root;
  }
  function dlImpact() { const r = st().rev; EXPORT.write(EXPORT.impactBook({ rules: st().rules, rev: { impact: D.revision.impact, naiveMoved: D.revision.naiveMoved, common: D.revision.common, touch: D.revision.touch, perCab: D.revision.perCab }, seqMap: r.seqMap, tqs: App.revTqs() }), 'Revision_Impact_RevA_to_RevB.xlsx'); toast('Impact report downloaded'); }

  function impactTabs() {
    const s = st(), I = D.revision.impact; const tabs = [['cabs', 'Cabinets hit'], ['moved', `Moved (${I.moved.length})`], ['added', `Added (${I.added.length})`], ['deleted', `Deleted (${I.deleted.length})`], ['swaps', `CHARM swaps (${I.swaps.length})`], ['renamed', `Renamed (${I.renamed.length})`], ['checks', 'Rule check'], ['tqs', 'TQs']];
    const nmA = a => addrText(a); const goTo = a => () => { if (a) App.selectCell(a[0], a[1] + '/' + a[2] + '/' + a[3]); };
    let body;
    const table = (head, rows) => h('div', { class: 'tbl-wrap', style: { maxHeight: '340px' } }, h('table', {}, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, rows)));
    if (s.revTab === 'cabs') body = table(['Cabinet', 'Added', 'Deleted', 'Moved', 'CHARM swaps', 'Renamed', 'Baseplates touched', 'Drawings to reissue'], D.revision.perCab.map(p => h('tr', { class: 'click', onclick: () => App.pickCab(p.cab) }, h('td', { class: 'mono' }, App.cabName(p.cab)), h('td', { class: 'num' }, p.added), h('td', { class: 'num' }, p.deleted), h('td', { class: 'num' }, p.moved), h('td', { class: 'num' }, p.swaps), h('td', { class: 'num' }, p.renamed), h('td', { class: 'num' }, p.bps), h('td', {}, 'Cabinet layout, wiring schedule and loop drawings for the changed tags'))));
    else if (s.revTab === 'moved') body = table(['Code', 'Tag', 'Cable · pair', 'From', 'To', 'Reason'], I.moved.map(x => h('tr', { class: 'click', onclick: goTo(x.to) }, h('td', { class: 'mono' }, 'V02'), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, `${x.cable} · ${x.pair}`), h('td', { class: 'mono' }, nmA(x.from)), h('td', { class: 'mono' }, nmA(x.to)), h('td', {}, x.reason))));
    else if (s.revTab === 'added') body = table(['Code', 'Tag', 'Cable · pair', 'Placed at', 'Why'], I.added.map(x => h('tr', { class: 'click', onclick: goTo(x.addr) }, h('td', { class: 'mono' }, 'V04'), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, `${x.cable} · ${x.pair}`), h('td', { class: 'mono' }, nmA(x.addr)), h('td', {}, x.reason))));
    else if (s.revTab === 'deleted') body = table(['Code', 'Tag', 'Cable · pair', 'Was at', 'Now'], I.deleted.map(x => h('tr', {}, h('td', { class: 'mono' }, 'V03'), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, `${x.cable} · ${x.pair}`), h('td', { class: 'mono' }, nmA(x.addr)), h('td', {}, 'Free slot, hole kept'))));
    else if (s.revTab === 'swaps') body = table(['Code', 'Tag', 'IO type', 'CHARM', 'At'], I.swaps.map(x => h('tr', { class: 'click', onclick: goTo(x.addr) }, h('td', { class: 'mono' }, 'V01'), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, `${x.from} → ${x.to}`), h('td', {}, `${st().rules.hw[x.from].charm} → ${st().rules.hw[x.to].charm}`), h('td', { class: 'mono' }, nmA(x.addr)))));
    else if (s.revTab === 'renamed') body = table(['Code', 'Old tag', 'New tag', 'Cable · pair', 'Slot'], I.renamed.map(x => h('tr', { class: 'click', onclick: goTo(x.addr) }, h('td', { class: 'mono' }, 'V05'), h('td', { class: 'mono' }, x.old), h('td', { class: 'mono' }, x.tag), h('td', { class: 'mono' }, `${x.cable} · ${x.pair}`), h('td', {}, 'Did not change'))));
    else if (s.revTab === 'checks') body = h('div', {}, checkTable(D.revision.check), I.spareUsed && I.spareUsed.length ? h('div', { class: 'pad cap' }, 'V09: ' + I.spareUsed.join('; ')) : null);
    else body = h('div', { class: 'pad' }, App.revTqs().filter(t => t.rev === 'B' && t.code === 'C01').map(t => h('div', { class: 'opt' }, h('b', {}, t.code + ' · '), t.message, t.options.map((o, i) => h('span', { class: 'eff' }, `${i + 1}. ${o}`)))), D.revision.tqs.length ? null : h('span', { class: 'empty' }, 'No new TQs from the revision.'));
    return h('div', { style: { marginTop: '12px' } }, h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(s.revTab === k), onclick: () => { s.revTab = k; const sc = $('#work').scrollTop; App.go(5); $('#work').scrollTop = sc; } }, t))), h('div', { class: 'panel', style: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 0 } }, body));
  }

  function render(n) {
    if (n === 1) return viewUpload();
    if (n === 2) return viewRules();
    if (n === 3) return viewAllocate();
    if (n === 4) return viewReport();
    return viewRevise();
  }

  window.VIEWS = { render, refreshMap, showRun, stage, showRevRun, revStage, tqDetail };
})();
