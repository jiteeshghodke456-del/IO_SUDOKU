/* Cabinet map: one inline SVG per cabinet. Columns are CIOCs, rows are baseplates, cells are CHARM slots. */
(function () {
  const COL = { AI: '#3B82F6', AO: '#A855F7', DI: '#22C55E', DO: '#F97316', DOI: '#EF4444' };
  const CW = 15, CH = 20, SX = 17, SY = 22, BLOCK = 12 * SX - 2, GAP = 20, AX = 34, TOP = 56;
  const esc = U.esc;

  function cioMeta(layout, cab, k) {
    const cells = layout.cabs.get(cab); const groups = new Set(), segs = new Set(); let free = false, n = 0; const bps = new Set();
    if (cells) cells.forEach((cell, key) => {
      const [kk, b] = key.split('/'); if (+kk !== k) return;
      bps.add(+b); n++;
      const c = layout.meta.get(cell.cable); if (!c) return;
      if (c.group) groups.add(c.group); else free = true;
      if (c.seg) segs.add(c.seg);
    });
    return { groups: [...groups].sort(U.nat), segs: [...segs].sort(), free, n, bps };
  }

  function render(host, o) {
    const { layout, cab, seqMap, rules, rev, selected } = o;
    const K = rules.k, P = 8;
    const W = AX + K * BLOCK + (K - 1) * GAP + 6, H = TOP + P * SY + 34;
    const cells = layout.cabs.get(cab) || new Map();
    let opened = 0; cells.forEach((v, key) => { opened = Math.max(opened, +key.split('/')[0]); });
    const metas = []; for (let k = 1; k <= K; k++) metas.push(cioMeta(layout, cab, k));
    let s = `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cabinet ${cab} map">`;
    s += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F6F8F7"/><path d="M0 0v6" stroke="#D7DADF" stroke-width="1.4"/></pattern></defs>`;
    for (let b = 1; b <= P; b++) s += `<text x="${AX - 8}" y="${TOP + (b - 1) * SY + 14}" font-size="10" text-anchor="end" style="fill:#5B6B63">${b}</text>`;
    for (let k = 1; k <= K; k++) {
      const x0 = AX + (k - 1) * (BLOCK + GAP); const m = metas[k - 1]; const isOpen = k <= opened;
      const nm = isOpen ? IOS.names(rules, seqMap, [cab, k, 1, 1]) : null;
      s += `<text x="${x0}" y="14" font-size="11" font-weight="500" style="${isOpen ? '' : 'fill:#9AA7A0'}">${isOpen ? esc(nm.cioc) : 'CIOC ' + k + ' position free'}</text>`;
      if (isOpen) {
        const lab = (m.groups.length ? m.groups.join(', ') : 'No group') + (m.free && m.groups.length ? ' + free' : '') + (m.segs.length ? ' · ' + m.segs.join('/') : '');
        s += `<rect x="${x0}" y="21" width="${Math.min(BLOCK, 7.2 * lab.length + 14)}" height="16" rx="8" fill="#F1F4F2" stroke="#DDE3DF"/><text x="${x0 + 8}" y="33" font-size="10.5">${esc(lab)}</text>`;
        s += `<text x="${x0 + BLOCK}" y="33" font-size="10.5" text-anchor="end" style="fill:#5B6B63">${m.bps.size}/${P} baseplates</text>`;
      }
      for (let b = 1; b <= P; b++) {
        const empty = !m.bps.has(b);
        for (let sl = 1; sl <= 12; sl++) {
          const key = k + '/' + b + '/' + sl, cell = isOpen ? cells.get(key) : null;
          const x = x0 + (sl - 1) * SX, y = TOP + (b - 1) * SY;
          const d = `data-k="${k}" data-b="${b}" data-s="${sl}"`;
          if (!cell) {
            const freed = rev && o.freed && o.freed.has(cab + '/' + key);
            if (freed) s += `<rect class="cell" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="2" fill="#fff" style="stroke:#6B7280;stroke-width:1.2;stroke-dasharray:2 2"/>`;
            else s += `<rect class="cell" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="2" fill="${empty ? 'url(#hatch)' : '#F1F4F2'}" style="stroke:#D7DADF;stroke-width:1;${isOpen ? '' : 'opacity:.55'}"/>`;
            continue;
          }
          let fill, style = '', deco = '';
          if (cell.t === 'sp') fill = '#9CA3AF';
          else { const cls = IOS.ioClass(cell.sig.io); fill = cls ? COL[cls] : '#fff'; if (!cls) style += 'stroke:#B45309;stroke-width:1.6;'; }
          if (rev && cell.t === 'sig') {
            const st = cell.sig.status;
            if (st === 'same') style += 'opacity:.4;';
            else if (st === 'added') style += 'stroke:#1D4ED8;stroke-width:2.4;';
            else if (st === 'moved') style += 'stroke:#B45309;stroke-width:2.4;';
            if (st === 'swap') deco = `<circle cx="${x + CW / 2}" cy="${y + CH / 2}" r="2.6" fill="#fff" style="pointer-events:none"/>`;
            if (st === 'renamed') deco = `<path d="M${x + 3} ${y + CH - 5}h${CW - 6}" stroke="#fff" stroke-width="2" style="pointer-events:none"/>`;
          } else if (rev && cell.t === 'sp') style += 'opacity:.4;';
          const sel = selected && selected.cab === cab && selected.key === key ? ' selc' : '';
          s += `<rect class="cell${sel}" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="2" fill="${fill}" style="${style}"/>${deco}`;
        }
      }
    }
    // A and B never share a CIOC
    let drewAB = false;
    if (rules.ab) for (let k = 1; k < K; k++) {
      const a = metas[k - 1], b = metas[k];
      if (a.segs.length === 1 && b.segs.length === 1 && a.segs[0] !== b.segs[0]) {
        const x = AX + k * BLOCK + (k - 0.5) * GAP;
        s += `<line x1="${x}" x2="${x}" y1="6" y2="${TOP + P * SY + 4}" stroke="#B91C1C" stroke-width="1.5" stroke-dasharray="5 4"/>`; drewAB = true;
      }
    }
    if (drewAB) s += `<text x="${W / 2}" y="${H - 8}" font-size="11" text-anchor="middle" style="fill:#B91C1C">A and B never share a CIOC</text>`;
    s += '</svg>';
    host.innerHTML = s;
    if (!host._bound) {
      host._bound = true;
      host.addEventListener('mousemove', e => {
        const r = e.target.closest && e.target.closest('rect.cell'); const tip = U.$('#tip');
        if (!r || !host._o) { tip.hidden = true; return; }
        const t = host._o.tipText(host._o.cab, r.dataset.k + '/' + r.dataset.b + '/' + r.dataset.s);
        if (!t) { tip.hidden = true; return; }
        tip.textContent = t; tip.hidden = false; tip.style.left = Math.min(window.innerWidth - 340, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      });
      host.addEventListener('mouseleave', () => { U.$('#tip').hidden = true; });
      host.addEventListener('click', e => { const r = e.target.closest && e.target.closest('rect.cell'); if (r && host._o) host._o.onSelect(host._o.cab, r.dataset.k + '/' + r.dataset.b + '/' + r.dataset.s); });
    }
    host._o = o;
  }

  window.MAP = { render, COL };
})();
