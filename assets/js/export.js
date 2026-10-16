/* Builds the downloadable workbooks from what is on screen. */
(function () {
  const D = IOS.D;
  const today = () => new Date().toISOString().slice(0, 10);

  function addrRows(layout, rules, seqMap, rev) {
    const out = [];
    layout.cabs.forEach((cells, cab) => {
      cells.forEach((cell, key) => {
        if (cell.t !== 'sig') return;
        const [k, b, s] = key.split('/').map(Number); const nm = IOS.names(rules, seqMap, [cab, k, b, s]); const hw = IOS.hwFor(rules, cell.sig);
        out.push({ cab, k, b, s, cell, nm, hw });
      });
    });
    out.sort((x, y) => x.cab - y.cab || x.k - y.k || x.b - y.b || x.s - y.s);
    return out;
  }

  function tqSheet(tqs, rev) {
    const head = ['TQ No', 'Code', 'Severity', 'Kind', 'Tags', 'Cables', 'Rules', 'Message', 'Options', 'Status', 'Rev', 'Raised on'];
    const rows = tqs.map(t => [t.no, t.code, t.severity, t.kind, t.tags.slice(0, 20).join(', ') + (t.tags.length > 20 ? ` (+${t.tags.length - 20})` : ''), t.cables.slice(0, 20).join(', ') + (t.cables.length > 20 ? ` (+${t.cables.length - 20})` : ''), t.rules.join(', '), t.message, t.options.map((o, i) => `${i + 1}. ${o}`).join('\n'), t.status, rev, today()]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws['!cols'] = [8, 7, 10, 9, 26, 26, 22, 70, 60, 9, 5, 11].map(w => ({ wch: w }));
    return ws;
  }

  function allocationBook(c) {
    const { rules, scn, layout, seqMap, tqs } = c; const wb = XLSX.utils.book_new();
    const head = ['S.No', 'Tag Number', 'IO Type', 'Cable', 'Pair', 'IO Group', 'Segregation', 'System Cabinet', 'Controller', 'Marshalling Cabinet', 'CIOC', 'Baseplate', 'CHARM Slot', 'CHARM Type', 'Terminal Block', 'Remarks'];
    const hwq = new Map(); tqs.forEach(t => { if (t.severity === 'hardware') t.tags.forEach(g => hwq.set(g, t.code)); });
    const rows = addrRows(layout, rules, seqMap).map((r, i) => [i + 1, r.cell.sig.tag, r.cell.sig.io || r.cell.sig.ioRaw || '', r.cell.sig.cable, r.cell.sig.pair, r.cell.sig.group, r.cell.sig.seg, r.nm.system, r.nm.controller, r.nm.cabinet, r.nm.cioc, r.nm.baseplate, r.s, r.hw ? r.hw.charm : '', r.hw ? r.hw.tb : '', hwq.has(r.cell.sig.tag) ? 'TQ ' + hwq.get(r.cell.sig.tag) : '']);
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]); ws['!cols'] = [6, 16, 11, 10, 6, 9, 11, 16, 14, 18, 16, 14, 11, 22, 20, 10].map(w => ({ wch: w })); ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'IO Allocation');
    XLSX.utils.book_append_sheet(wb, tqSheet(tqs, 'A'), 'TQ Register');
    const chk = [['Check', 'Result', 'Checked', 'Violations', 'Note'], ...scn.check.map(k => [k.name, k.status, k.checked, k.violations, k.note || ''])];
    XLSX.utils.book_append_sheet(wb, Object.assign(XLSX.utils.aoa_to_sheet(chk), { '!cols': [{ wch: 52 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 60 }] }), 'Rule Check');
    const capS = (c.k || rules.k) * 96; const sum = [['Cabinet', 'CIOCs', 'Baseplates used', 'Empty baseplates', 'Slots used', 'Slot capacity', 'Fill %', 'Signals', 'Groups', 'Sides per CIOC']];
    scn.cabs.forEach(cab => sum.push([IOS.fmtName(rules.names.cabinet, { area: rules.names.area, unit: rules.names.unit, seq: cab.n }), cab.ciocs, cab.bpUsed, cab.bpEmpty, cab.slots, capS, Math.round(1000 * cab.slots / capS) / 10, cab.signals, cab.groups.join(', '), cab.sides.map(x => x || '-').join(' | ')]));
    sum.push([]); sum.push(['Lower bound on cabinets', scn.lowerBound]); sum.push(['CIOC sharing: Class / Group / Any', `${scn.compare.class} / ${scn.compare.group} / ${scn.compare.any} cabinets`]);
    XLSX.utils.book_append_sheet(wb, Object.assign(XLSX.utils.aoa_to_sheet(sum), { '!cols': [24, 8, 14, 14, 10, 12, 8, 9, 24, 24].map(w => ({ wch: w })) }), 'Summary');
    const sp = [['Marshalling Cabinet', 'CIOC', 'Baseplate', 'CHARM Slot', 'Cable', 'Pair']];
    layout.cabs.forEach((cells, cab) => cells.forEach((cell, key) => { if (cell.t !== 'sp') return; const [k, b, s] = key.split('/').map(Number); const nm = IOS.names(rules, seqMap, [cab, k, b, s]); sp.push([nm.cabinet, nm.cioc, nm.baseplate, s, cell.cable, cell.pair]); }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sp), 'Spare Pairs');
    return wb;
  }

  function impactBook(c) {
    const { rules, rev, seqMap, tqs } = c; const wb = XLSX.utils.book_new(); const I = rev.impact;
    const nmOf = a => IOS.names(rules, seqMap, a); const addr = a => { const n = nmOf(a); return `${n.cabinet} / ${n.cioc} / ${n.baseplate} / slot ${a[3]}`; };
    const sumRows = [['Revision impact: Rev A to Rev B'], [], ['Added', I.added.length], ['Deleted', I.deleted.length], ['Moved', I.moved.length], ['CHARM swaps in place', I.swaps.length], ['Renamed (same cable and pair)', I.renamed.length], ['Not placed', I.unplaced.length], [], ['Signals in both revisions', rev.common], ['Moved by this revision', I.moved.length], ['A fresh re-run would have moved', rev.naiveMoved], [], ['Cabinets touched', rev.touch.cabs], ['CIOCs touched', rev.touch.ciocs], ['Baseplates touched', rev.touch.bps]];
    XLSX.utils.book_append_sheet(wb, Object.assign(XLSX.utils.aoa_to_sheet(sumRows), { '!cols': [{ wch: 36 }, { wch: 14 }] }), 'Summary');
    const cabRows = [['Marshalling Cabinet', 'Added', 'Deleted', 'Moved', 'CHARM swaps', 'Renamed', 'Baseplates touched', 'Drawings to reissue']];
    rev.perCab.forEach(p => cabRows.push([nmOf([p.cab, 1, 1, 1]).cabinet, p.added, p.deleted, p.moved, p.swaps, p.renamed, p.bps, 'Cabinet layout, wiring schedule, loop drawings for changed tags']));
    XLSX.utils.book_append_sheet(wb, Object.assign(XLSX.utils.aoa_to_sheet(cabRows), { '!cols': [22, 8, 8, 8, 12, 9, 18, 60].map(w => ({ wch: w })) }), 'Cabinets Hit');
    const sheet = (name, head, rows) => XLSX.utils.book_append_sheet(wb, Object.assign(XLSX.utils.aoa_to_sheet([head, ...rows]), { '!cols': head.map(() => ({ wch: 24 })) }), name);
    sheet('Added', ['Code', 'Tag', 'Cable', 'Pair', 'Placed at', 'Why'], I.added.map(x => ['V04', x.tag, x.cable, x.pair, addr(x.addr), x.reason]));
    sheet('Deleted', ['Code', 'Tag', 'Cable', 'Pair', 'Was at'], I.deleted.map(x => ['V03', x.tag, x.cable, x.pair, addr(x.addr)]));
    sheet('Moved', ['Code', 'Tag', 'Cable', 'Pair', 'From', 'To', 'Reason'], I.moved.map(x => ['V02', x.tag, x.cable, x.pair, addr(x.from), addr(x.to), x.reason]));
    sheet('CHARM Swaps', ['Code', 'Tag', 'Old IO type', 'New IO type', 'Old CHARM', 'New CHARM', 'At'], I.swaps.map(x => ['V01', x.tag, x.from, x.to, rules.hw[x.from] ? rules.hw[x.from].charm : '', rules.hw[x.to] ? rules.hw[x.to].charm : '', addr(x.addr)]));
    sheet('Renamed', ['Code', 'Old tag', 'New tag', 'Cable', 'Pair', 'At'], I.renamed.map(x => ['V05', x.old, x.tag, x.cable, x.pair, addr(x.addr)]));
    XLSX.utils.book_append_sheet(wb, tqSheet(tqs, 'B'), 'TQ Register');
    return wb;
  }

  function write(wb, name) {
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    U.download(name, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  window.EXPORT = { allocationBook, impactBook, write, tqSheet };
})();
