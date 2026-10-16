/* Reads the project bundle and turns packed addresses into cells the screens can draw. */
(function () {
  const D = window.IOS_DATA;
  const IOS = (window.IOS = { D });
  const S = 12; // CHARMs per baseplate (hardware)

  const toSig = a => ({ row: a[0], tag: a[1], ioRaw: a[2], io: a[3] >= 0 ? D.hwOrder[a[3]] : null, cable: a[4], pair: a[5], group: a[6], seg: a[7], desc: a[8], block: a[9], hw: a[10], d06: a[11], sigType: a[12], status: a[13] || '', addr: a[14] || null });
  IOS.sigs = D.signals.map(toSig);
  IOS.revSigs = D.revision.signals.map(toSig);
  IOS.cableIdx = {}; D.cables.forEach((c, i) => (IOS.cableIdx[c.id] = i));
  IOS.blocked = new Set(D.blockedCables.map(c => c.id));

  const ioClass = io => (io && D.hw[io] ? D.hw[io].cls : null);
  IOS.ioClass = ioClass;

  // address <-> linear offset inside a CIOC
  const at = (st, pair) => { const off = (st[2] - 1) * S + (st[3] - 1) + (pair - 1); return [st[0], st[1], 1 + Math.floor(off / S), 1 + (off % S)]; };

  // layout: every occupied slot of every cabinet, plus lookup tables
  IOS.layout = function (sigs, cables, startOf) {
    const byCable = new Map();
    sigs.forEach(s => { if (!s.block && s.cable && !IOS.blocked.has(s.cable)) { let m = byCable.get(s.cable); if (!m) byCable.set(s.cable, (m = new Map())); m.set(s.pair, s); } });
    const cabs = new Map(), byTag = new Map(), blocks = [], meta = new Map();
    cables.forEach((c, i) => {
      const st = startOf(c, i); if (!st) return;
      meta.set(c.id, c);
      const pm = byCable.get(c.id) || new Map();
      let n = 0;
      for (let p = 1; p <= c.size; p++) {
        const a = at(st, p); const sig = pm.get(p);
        let cm = cabs.get(a[0]); if (!cm) cabs.set(a[0], (cm = new Map()));
        const cell = sig ? { t: 'sig', sig, cable: c.id, pair: p, addr: a } : { t: 'sp', cable: c.id, pair: p, addr: a };
        cm.set(a[1] + '/' + a[2] + '/' + a[3], cell);
        if (sig) { n++; byTag.set(sig.tag, cell); }
      }
      blocks.push({ id: c.id, size: c.size, group: c.group, seg: c.seg, start: st, n });
    });
    return { cabs, byTag, blocks, meta };
  };

  IOS.baseLayout = function (scn) { return IOS.layout(IOS.sigs, D.cables, (c, i) => scn.place[i] || null); };
  IOS.revLayout = function () { return IOS.layout(IOS.revSigs, D.revision.cables, c => c.start || null); };

  // CIOC sequence numbers: counted across the project, cabinet order then CIOC order.
  IOS.seqBase = function (scn) {
    const m = new Map(); let n = 0;
    scn.cabs.forEach((cab, i) => { for (let k = 1; k <= cab.ciocs; k++) m.set((i + 1) + '/' + k, ++n); });
    return m;
  };
  // In a revision every container keeps its name; new ones take the next number.
  IOS.seqRev = function (baseMap, layout) {
    const m = new Map(baseMap); let n = baseMap.size; const keys = new Set();
    layout.cabs.forEach((cells, c) => cells.forEach((v, key) => keys.add(c + '/' + key.split('/')[0])));
    [...keys].sort((a, b) => { const [c1, k1] = a.split('/').map(Number), [c2, k2] = b.split('/').map(Number); return c1 - c2 || k1 - k2; })
      .forEach(k => { if (!m.has(k)) m.set(k, ++n); });
    return m;
  };

  // name patterns: <Area> <Unit> <Seq:N> <CIOC no:N> <n>
  IOS.fmtName = function (pat, ctx) {
    return String(pat).replace(/<([^>:]+)(?::(\d+))?>/g, (m, name, w) => {
      const k = name.trim().toLowerCase(); let v;
      if (k === 'area') v = ctx.area; else if (k === 'unit') v = ctx.unit; else if (k === 'seq') v = ctx.seq; else if (k === 'cioc no') v = ctx.ciocNo; else if (k === 'n') v = ctx.n; else return m;
      return w ? String(v).padStart(+w, '0') : String(v);
    });
  };
  IOS.names = function (rules, seqMap, addr) {
    const nm = rules.names, base = { area: nm.area, unit: nm.unit };
    const seq = seqMap.get(addr[0] + '/' + addr[1]) || 0;
    const ctl = Math.max(1, Math.ceil(seq / 16));
    return {
      cabinet: IOS.fmtName(nm.cabinet, { ...base, seq: addr[0] }),
      cioc: IOS.fmtName(nm.cioc, { ...base, seq }),
      baseplate: IOS.fmtName(nm.baseplate, { ...base, ciocNo: seq, n: addr[2] }),
      controller: IOS.fmtName(nm.controller, { ...base, seq: ctl }),
      system: IOS.fmtName(nm.system, { ...base, seq: ctl }),
      seq,
    };
  };
  IOS.hwFor = (rules, sig) => (sig.io && rules.hw[sig.io]) ? rules.hw[sig.io] : null;
})();
