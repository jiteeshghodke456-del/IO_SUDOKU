/* Small DOM and formatting helpers. */
(function () {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const sleep = ms => new Promise(r => setTimeout(r, reduced ? Math.min(ms, 30) : ms));
  const fmt = n => Number(n).toLocaleString('en-US');
  const pad = (n, w) => String(n).padStart(w, '0');
  const nat = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Count a number up inside an element. Timer based so it also finishes in a background tab.
  function countTo(el, to, ms, dec, suffix) {
    dec = dec || 0; suffix = suffix || '';
    const from = parseFloat(el.dataset.v || '0') || 0; el.dataset.v = to;
    if (el._t) clearInterval(el._t);
    if (reduced || ms <= 0) { el.textContent = fmtNum(to, dec) + suffix; return; }
    const t0 = Date.now();
    el._t = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(from + (to - from) * e, dec) + suffix;
      if (p >= 1) clearInterval(el._t);
    }, 30);
    setTimeout(() => { if (parseFloat(el.dataset.v) === to) el.textContent = fmtNum(to, dec) + suffix; }, ms + 60);
  }
  const fmtNum = (v, dec) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function download(name, blob) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

  window.U = { $, $$, h, sleep, fmt, pad, nat, clone, esc, countTo, toast, download, fileSize, reduced };
})();
