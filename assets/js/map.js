/* Cabinet map: one inline SVG per cabinet. Columns are CIOCs, rows are baseplates, tall cells are CHARM slots. */
(function () {
  const COL = { AI: '#3B82F6', AO: '#A855F7', DI: '#22C55E', DO: '#F97316', DOI: '#EF4444' };
  const CW = 14, CH = 34, SX = 17, SY = 41, BLOCK = 12 * SX - 3, GAP = 26, AX = 56, TOP = 54, PH = 38;
  const esc = U.esc;
  const CHIP = { A: ['#FBE3E3', '#B91C1C'], B: ['#DDE8FC', '#1D4ED8'], none: ['#E4E9E6', '#3E4C45'] };

  function cioMeta(layout, cab, k) {
    const cells = layout.cabs.get(cab); const groups = new Set(), segs = new Set(); const bps = new Set();
    if (cells) cells.forEach((cell, key) => {
      const [kk, b] = key.split('/'); if (+kk !== k) return;
      bps.add(+b);
      const c = layout.meta.get(cell.cable); if (!c) return;
      if (c.group) groups.add(c.group);
      if (c.seg) segs.add(c.seg);
    });
    return { groups: [...groups].sort(U.nat), segs: [...segs].sort(), bps };
  }
  function chipLabel(m) {
    let g = m.groups.length > 2 ? m.groups.slice(0, 2).join(', ') + '…' : m.groups.join(', ');
    const sg = m.segs.join('/');
    if (!g && !sg) return 'no group';
    return g ? (sg ? g + ', ' + sg : g) : sg;
  }

  function render(host, o) {
    const { layout, cab, seqMap, rules, rev, selected, hiCable } = o;
    const K = rules.k, P = 8;
    const W = AX + K * BLOCK + (K - 1) * GAP + 4, H = TOP + P * SY;
    const cells = layout.cabs.get(cab) || new Map();
    let opened = 0; cells.forEach((v, key) => { opened = Math.max(opened, +key.split('/')[0]); });
    const metas = []; for (let k = 1; k <= K; k++) metas.push(cioMeta(layout, cab, k));
    let s = `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cabinet ${cab} map">`;
    for (let b = 1; b <= P; b++) s += `<text x="${AX - 14}" y="${TOP + (b - 1) * SY + CH / 2 + 6}" font-size="17" text-anchor="end" style="fill:#586960">BP ${b}</text>`;
    for (let k = 1; k <= K; k++) {
      const x0 = AX + (k - 1) * (BLOCK + GAP); const m = metas[k - 1]; const isOpen = k <= opened;
      // header pill
      s += `<rect x="${x0}" y="0" width="${BLOCK}" height="${PH}" rx="10" fill="#F4F6F5" stroke="#DCE3DE" ${isOpen ? '' : 'stroke-dasharray="4 4"'}/>`;
      s += `<text x="${x0 + 14}" y="25" font-size="17" font-weight="500" style="${isOpen ? '' : 'fill:#8A9890'}">CIOC ${k}</text>`;
      const lab = isOpen ? chipLabel(m) : 'unused';
      const tone = isOpen && m.segs.length === 1 ? CHIP[m.segs[0]] || CHIP.none : CHIP.none;
      const w = Math.min(BLOCK - 96, lab.length * 10.4 + 20), cx = x0 + BLOCK - 8 - w;
      s += `<rect x="${cx}" y="6" width="${w}" height="26" rx="8" fill="${tone[0]}"/><text x="${cx + w / 2}" y="25" font-size="16" text-anchor="middle" font-weight="500" style="fill:${tone[1]}">${esc(lab)}</text>`;
      for (let b = 1; b <= P; b++) {
        for (let sl = 1; sl <= 12; sl++) {
          const key = k + '/' + b + '/' + sl, cell = isOpen ? cells.get(key) : null;
          const x = x0 + (sl - 1) * SX, y = TOP + (b - 1) * SY;
          const d = `data-k="${k}" data-b="${b}" data-s="${sl}"`;
          if (!cell) {
            const freed = rev && o.freed && o.freed.has(cab + '/' + key);
            if (freed) s += `<rect class="cell" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="3" fill="#fff" style="stroke:#6B7280;stroke-width:1.6;stroke-dasharray:3 3"/>`;
            else s += `<rect class="cell" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="3" fill="#F7F9F8" style="stroke:#D5DAD7;stroke-width:1.3;${isOpen ? '' : 'opacity:.5'}"/>`;
            continue;
          }
          let fill, style = '', deco = '';
          if (cell.t === 'sp') fill = '#9CA3AF';
          else { const cls = IOS.ioClass(cell.sig.io); fill = cls ? COL[cls] : '#fff'; if (!cls) style += 'stroke:#B45309;stroke-width:2;'; }
          if (rev && cell.t === 'sig') {
            const st = cell.sig.status;
            if (st === 'same') style += 'opacity:.4;';
            else if (st === 'added') style += 'stroke:#1D4ED8;stroke-width:3;';
            else if (st === 'moved') style += 'stroke:#B45309;stroke-width:3;';
            if (st === 'swap') deco = `<circle cx="${x + CW / 2}" cy="${y + CH / 2}" r="3.2" fill="#fff" style="pointer-events:none"/>`;
            if (st === 'renamed') deco = `<path d="M${x + 3} ${y + CH - 6}h${CW - 6}" stroke="#fff" stroke-width="2.6" style="pointer-events:none"/>`;
          } else if (rev && cell.t === 'sp') style += 'opacity:.4;';
          if (hiCable && cell.cable !== hiCable) style += 'opacity:.22;';
          const sel = selected && selected.cab === cab && selected.key === key ? ' selc' : '';
          s += `<rect class="cell${sel}" ${d} x="${x}" y="${y}" width="${CW}" height="${CH}" rx="3" fill="${fill}" style="${style}"/>${deco}`;
        }
      }
    }
    // A and B never share a CIOC
    if (rules.ab) for (let k = 1; k < K; k++) {
      const a = metas[k - 1], b = metas[k];
      if (a.segs.length === 1 && b.segs.length === 1 && a.segs[0] !== b.segs[0]) {
        const x = AX + k * BLOCK + (k - 0.5) * GAP - 1;
        s += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#B91C1C" stroke-width="2.4" stroke-dasharray="7 6"/>`;
      }
    }
    s += '</svg>';
    host.innerHTML = s;
    if (!host._bound) {
      host._bound = true;
      host.addEventListener('mousemove', e => {
        const r = e.target.closest && e.target.closest('rect.cell'); const tip = U.$('#tip');
        if (!r || !host._o) { tip.hidden = true; return; }
        const t = host._o.tipText(host._o.cab, r.dataset.k + '/' + r.dataset.b + '/' + r.dataset.s);
        if (!t) { tip.hidden = true; return; }
        tip.textContent = t; tip.hidden = false; tip.style.left = Math.min(window.innerWidth - 380, e.clientX + 16) + 'px'; tip.style.top = (e.clientY + 16) + 'px';
      });
      host.addEventListener('mouseleave', () => { U.$('#tip').hidden = true; });
      host.addEventListener('click', e => { const r = e.target.closest && e.target.closest('rect.cell'); if (r && host._o) host._o.onSelect(host._o.cab, r.dataset.k + '/' + r.dataset.b + '/' + r.dataset.s); });
    }
    host._o = o;
  }

  window.MAP = { render, COL };
})();
