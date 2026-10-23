/*
 * QUANTA — progressive enhancement for jw954.github.io.
 * Loaded (deferred) after assets/script.js, so its DOMContentLoaded handler runs
 * after the original one. Never rewrites original text: it only wraps parts of
 * existing text nodes in spans (textContent stays identical) and adds new UI.
 */
(function () {
  'use strict';

  var d = document;
  var html = d.documentElement;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  var EMAIL = ['hry.wang', 'mail.utoronto.ca'].join('@');
  var SCHOLAR = 'https://scholar.google.ca/citations?user=tF65htsAAAAJ&hl=en';
  var LINKEDIN = 'https://www.linkedin.com/in/junhao-wang-4ba488200/';
  var CV = 'assets/CV_Junhao_Wang.pdf';
  var PAGES = [
    ['index.html', 'Home'],
    ['research.html', 'Research'],
    ['publications.html', 'Publications'],
    ['experience.html', 'Experience'],
    ['cv.html', 'CV']
  ];
  var BASE = '';
  var MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

  /* Page name without extension: "/research", "/research.html" → "research"; "/" → "index". */
  function pageName(href) {
    var p = String(href || '').split(/[?#]/)[0].split('/').pop().toLowerCase().replace(/\.html?$/, '');
    return p || 'index';
  }
  var PAGE = (d.body && d.body.getAttribute('data-qx-page')) || pageName(location.pathname);
  if (PAGE === '404') { BASE = '/'; CV = '/' + CV; }

  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function rm() { return !!(reduceMotion && reduceMotion.matches); }
  function slug(s) {
    return (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'section';
  }
  function uniqueId(base) {
    var id = base, i = 2;
    while (d.getElementById(id)) id = base + '-' + i++;
    return id;
  }

  /* Wrap the first regex match (or capture group `g`) found in a text node under
     `root` with the element returned by make(). textContent is unchanged. */
  function wrapText(root, re, make, g) {
    var walker = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var m = re.exec(node.nodeValue);
      if (!m) continue;
      var part = g ? m[g] : m[0];
      if (!part) continue;
      var start = m.index + (g ? m[0].indexOf(part) : 0);
      var mid = node.splitText(start);
      mid.splitText(part.length);
      var wrap = make(part);
      if (!wrap.firstChild) wrap.textContent = part;
      mid.parentNode.replaceChild(wrap, mid);
      return wrap;
    }
    return null;
  }

  /* ------------------------------------------------------------- theme */
  function storedTheme() {
    try {
      var t = localStorage.getItem('theme');
      return t === 'light' || t === 'dark' ? t : null;
    } catch (e) { return null; }
  }
  function syncTheme() {
    var t = d.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    if (html.getAttribute('data-theme') !== t) html.setAttribute('data-theme', t);
    var meta = d.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#F3F5FA' : '#0A0F1F');
    if (typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(t);
    var btn = d.getElementById('theme-toggle');
    if (btn) btn.title = btn.textContent;
    var palTheme = d.getElementById('qx-opt-theme-label');
    if (palTheme) palTheme.textContent = t === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  }
  function guardToggle() {
    var orig = window.toggleTheme;
    if (typeof orig !== 'function' || orig.qxGuarded) return;
    var guarded = function () {
      var before = d.body.getAttribute('data-theme');
      try { orig.apply(this, arguments); }
      catch (e) {
        // storage unavailable: the original sets the attribute before it throws
        if (d.body.getAttribute('data-theme') === before) d.body.setAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
        syncTheme();
      }
    };
    guarded.qxGuarded = true;
    window.toggleTheme = guarded;
  }
  function applyStoredTheme() {
    var t = storedTheme() || 'dark';
    if (d.body.getAttribute('data-theme') !== t) d.body.setAttribute('data-theme', t);
    syncTheme();
  }
  function initTheme() {
    guardToggle();
    // back/forward cache: another page may have changed the theme meanwhile
    window.addEventListener('pageshow', function (e) { if (e.persisted) applyStoredTheme(); });
    var t = storedTheme() || 'dark';
    d.body.setAttribute('data-theme', t);
    if (typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(t);
    syncTheme();
    new MutationObserver(syncTheme).observe(d.body, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function flipTheme() {
    if (typeof window.toggleTheme === 'function') window.toggleTheme();
    else {
      var next = d.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      d.body.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    }
  }

  /* showModal() runs its own focusing step, which can scroll the page (smoothly,
     because the original CSS sets scroll-behavior: smooth). Keep the page still. */
  function openModal(dlg, target) {
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    var x = window.scrollX, y = window.scrollY;
    dlg.showModal();
    if (target) target.focus({ preventScroll: true });
    if (window.scrollY !== y || window.scrollX !== x) window.scrollTo(x, y);
    requestAnimationFrame(function () {
      if (window.scrollY !== y) window.scrollTo(x, y);
      html.style.scrollBehavior = prev;
    });
  }

  /* Close a modal <dialog> only when the press and the release both land on the
     backdrop, outside the dialog box (not on its own padding, and not at the end
     of a drag that started inside it). */
  function lightDismiss(dlg, close) {
    var downOutside = false;
    function outside(e) {
      var r = dlg.getBoundingClientRect();
      return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    }
    dlg.addEventListener('pointerdown', function (e) { downOutside = outside(e); });
    dlg.addEventListener('click', function (e) {
      var ok = downOutside && outside(e);
      downOutside = false;
      if (ok) close();
    });
  }

  /* ------------------------------------------------------------- toast */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el('div', 'qx-toast');
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      d.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
      setTimeout(function () { if (!toastEl.classList.contains('is-on')) toastEl.textContent = ''; }, 300);
    }, 2200);
  }

  function copyText(text) {
    function fallback() {
      var prev = d.activeElement;
      try {
        var host = d.querySelector('dialog[open]') || d.body;   // never inside an inert region
        var ta = el('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
        host.appendChild(ta);
        ta.select();
        var ok = d.execCommand('copy');
        ta.remove();
        if (prev && prev.focus && prev !== d.body) prev.focus({ preventScroll: true });
        return Promise.resolve(ok);
      } catch (e) {
        if (prev && prev.focus && prev !== d.body) prev.focus({ preventScroll: true });
        return Promise.resolve(false);
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return fallback();
  }
  function copyEmail() {
    copyText(EMAIL).then(function (ok) {
      toast(ok ? 'Email address copied' : 'Copy failed — the address is ' + EMAIL);
    });
  }

  /* ------------------------------------------------------- header + nav */
  function initNav() {
    d.querySelectorAll('header nav a').forEach(function (a) {
      if (pageName(a.getAttribute('href')) === PAGE) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var nav = d.querySelector('header nav');
    if (nav && !nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary');
    d.querySelectorAll('[data-qx-palette]').forEach(function (b) {
      var k = b.querySelector('kbd');
      if (k) k.textContent = isMac ? '⌘K' : 'Ctrl K';
      b.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
      b.addEventListener('click', function () { openPalette(b); });
    });
  }

  function initProgress() {
    var bar = el('div', 'qx-progress');
    bar.setAttribute('aria-hidden', 'true');
    d.body.appendChild(bar);
    var queued = false;
    function update() {
      queued = false;
      var max = html.scrollHeight - window.innerHeight;
      var p = max > 4 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    queue();   // never force a layout while the page is still being enhanced
  }

  function initFooter() {
    var foot = d.querySelector('body > footer');
    if (!foot) return;
    var meta = el('p', 'qx-foot-meta');
    meta.appendChild(el('span', null, 'Toronto, ON'));
    meta.appendChild(el('span', null, 'Set in IBM Plex'));
    var k = el('button', 'qx-foot-k');
    k.type = 'button';
    var kbd = el('kbd', null, isMac ? '⌘K' : 'Ctrl K');
    k.appendChild(kbd);
    k.appendChild(d.createTextNode(' to jump anywhere'));
    k.addEventListener('click', function () { openPalette(k); });
    meta.appendChild(k);
    foot.appendChild(meta);
  }

  function initSectionIds() {
    d.querySelectorAll('main section > h2').forEach(function (h) {
      var sec = h.parentElement;
      if (!sec.id) sec.id = uniqueId(slug(h.textContent));
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    });
  }

  /* ------------------------------------------------------------- index */
  function initIndex() {
    var h1 = d.querySelector('.intro h1');
    if (h1) wrapText(h1, /\(Harry\)/, function () { return el('span', 'qx-aka'); });

    var paras = d.querySelectorAll('.intro-content > p');
    if (paras[1]) wrapText(paras[1], /100,000 fps/, function () { return el('span', 'qx-data'); });

    // Focus order follows the visual order: Copy → profiles → sensor controls.
    // (The links move as-is; their text and hrefs are untouched.)
    var links = d.querySelector('.intro .profile-links');
    var identity = d.querySelector('.intro .identity');
    if (links && identity && identity.nextSibling !== links) identity.parentNode.insertBefore(links, identity.nextSibling);

    var copy = d.querySelector('[data-qx-copy]');
    if (copy) {
      copy.hidden = false;
      copy.addEventListener('click', copyEmail);
    }

    var log = d.querySelector('.emoji-list');
    if (log) {
      log.classList.add('qx-log');
      log.querySelectorAll('li').forEach(function (li) {
        wrapText(li, /^\s*(\[\d{4}\/\d{2}\])/, function (part) {
          var s = el('span', 'qx-stamp');
          s.appendChild(d.createTextNode('['));
          s.appendChild(el('span', 'qx-d', part.slice(1, -1)));
          s.appendChild(d.createTextNode(']'));
          return s;
        }, 1);
      });
    }

    d.querySelectorAll('main section').forEach(function (sec) {
      var h2 = sec.querySelector(':scope > h2');
      if (!h2 || !/Selected Publications/.test(h2.textContent)) return;
      sec.querySelectorAll(':scope > .item').forEach(function (item) {
        var meta = item.querySelector('.meta');
        if (!meta) return;
        var venue = wrapText(meta, /— (.+?) \/\s*$/, function () { return el('span', 'qx-venue'); }, 1);
        var y = /\b(20\d\d)\b/.exec(venue ? venue.textContent : meta.textContent);
        if (y) addRail(item, y[1]);
      });
    });
  }

  function addRail(item, year, extra) {
    var rail = el('div', 'qx-rail');
    rail.setAttribute('aria-hidden', 'true');
    rail.appendChild(el('span', 'qx-year', year));
    if (extra) rail.appendChild(el('span', null, extra));
    item.insertBefore(rail, item.firstChild);
    item.classList.add('qx-railed');
  }

  /* ------------------------------------------------------ publications */
  var citeDlg;
  function authorsOf(meta) {
    var s = '';
    for (var n = meta.firstChild; n && n.nodeName !== 'BR'; n = n.nextSibling) s += n.textContent;
    return s.replace(/\*/g, '').split(',').map(function (a) { return a.trim(); }).filter(Boolean);
  }
  var TEX = { 'ä': '{\\"a}', 'ö': '{\\"o}', 'ü': '{\\"u}', 'Ä': '{\\"A}', 'Ö': '{\\"O}', 'Ü': '{\\"U}', 'ë': '{\\"e}', 'ï': '{\\"i}',
    'é': "{\\'e}", 'É': "{\\'E}", 'á': "{\\'a}", 'í': "{\\'i}", 'ó': "{\\'o}", 'ú': "{\\'u}", 'è': '{\\`e}', 'à': '{\\`a}',
    'ê': '{\\^e}', 'â': '{\\^a}', 'ñ': '{\\~n}', 'ç': '{\\c c}', 'å': '{\\aa}', 'ø': '{\\o}', 'ß': '{\\ss}',
    '&': '\\&', '%': '\\%', '#': '\\#', '_': '\\_', '$': '\\$', 'Δ': '{$\\Delta$}', '–': '--', '—': '---' };
  function tex(v) { return String(v).replace(/[äöüÄÖÜëïéÉáíóúèàêâñçåøß&%#_$Δ–—]/g, function (c) { return TEX[c]; }); }
  function bibtexFor(item) {
    var title = item.querySelector('h3').textContent.trim();
    var meta = item.querySelector('.meta');
    var venueRaw = (meta.querySelector('i') || {}).textContent || '';
    var link = meta.querySelector('a');
    var authors = authorsOf(meta);
    var ym = /(20\d\d)\s*$/.exec(venueRaw.trim());
    var year = ym ? ym[1] : '';
    var venue = venueRaw.trim().replace(/\s*(20\d\d)\s*$/, '');
    var last = (authors[0] || 'anon').split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '');
    var word = (title.match(/[A-Za-z][A-Za-z-]{2,}/g) || ['paper']).map(function (w) { return w.toLowerCase(); })
      .filter(function (w) { return ['the', 'and', 'for', 'with', 'from', 'based', 'using'].indexOf(w) < 0; })[0] || 'paper';
    var key = last + year + word.replace(/[^a-z0-9]/g, '');
    var href = link ? link.getAttribute('href') : '';
    var arx = /arxiv\.org\/(?:pdf|abs)\/(\d{4}\.\d{4,5})/.exec(href || '');
    var fields = [['title', '{' + tex(title) + '}'], ['author', tex(authors.join(' and '))]];
    var type;
    if (/arXiv/i.test(venue)) {
      type = 'misc';
      fields.push(['howpublished', tex(venue)]);
      if (arx) { fields.push(['eprint', arx[1]]); fields.push(['archivePrefix', 'arXiv']); }
    } else {
      type = 'inproceedings';
      fields.push(['booktitle', tex(venue)]);
    }
    if (year) fields.push(['year', year]);
    if (href) fields.push(['url', href]);
    var w = 0;
    fields.forEach(function (f) { w = Math.max(w, f[0].length); });
    var lines = fields.map(function (f) {
      return '  ' + f[0] + new Array(w - f[0].length + 2).join(' ') + '= {' + f[1] + '}';
    });
    return { title: title, text: '@' + type + '{' + key + ',\n' + lines.join(',\n') + '\n}', type: type, key: key, fields: fields, pad: w };
  }
  function renderBib(pre, bib) {
    // one block per line, hanging indent aligned after "= {" so long values wrap legibly
    pre.textContent = '';
    var code = el('code');
    var first = el('span', 'ln');
    first.appendChild(el('span', 'k', '@' + bib.type));
    first.appendChild(d.createTextNode('{' + bib.key + ','));
    code.appendChild(first);
    var hang = bib.pad + 6;
    bib.fields.forEach(function (f, i) {
      var ln = el('span', 'ln');
      ln.style.paddingLeft = hang + 'ch';
      ln.style.textIndent = -hang + 'ch';
      ln.appendChild(d.createTextNode('  '));
      ln.appendChild(el('span', 'f', f[0]));
      ln.appendChild(d.createTextNode(new Array(bib.pad - f[0].length + 2).join(' ') + '= {' + f[1] + '}' + (i < bib.fields.length - 1 ? ',' : '')));
      code.appendChild(ln);
    });
    code.appendChild(el('span', 'ln', '}'));
    pre.appendChild(code);
  }
  function buildCiteDialog() {
    var dlg = el('dialog', 'qx-dialog qx-cite');
    dlg.setAttribute('aria-labelledby', 'qx-cite-h');
    dlg.setAttribute('aria-describedby', 'qx-cite-paper');
    var head = el('div', 'qx-cite-head');
    var hw = el('div');
    var h = el('h2', null, 'Cite this paper · BibTeX');
    h.id = 'qx-cite-h';
    var t = el('p', 'qx-cite-title');
    t.id = 'qx-cite-paper';
    hw.appendChild(h); hw.appendChild(t);
    var x = el('button', 'qx-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    head.appendChild(hw); head.appendChild(x);
    var pre = el('pre');
    pre.setAttribute('tabindex', '0');
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', 'BibTeX entry');
    var foot = el('div', 'qx-cite-foot');
    foot.appendChild(el('span', null, 'Generated from the title, authors, venue and year listed on this page.'));
    var copy = el('button', 'qx-btn qx-btn-primary qx-noicon', 'Copy BibTeX');
    copy.type = 'button';
    foot.appendChild(copy);
    dlg.appendChild(head); dlg.appendChild(pre); dlg.appendChild(foot);
    d.body.appendChild(dlg);
    x.addEventListener('click', function () { dlg.close(); });
    lightDismiss(dlg, function () { dlg.close(); });
    copy.addEventListener('click', function () {
      copyText(dlg._bib || '').then(function (ok) {
        copy.textContent = ok ? 'Copied' : 'Copy failed';
        toast(ok ? 'BibTeX copied' : 'Copy failed — select the text instead');
        setTimeout(function () { copy.textContent = 'Copy BibTeX'; }, 1600);
      });
    });
    trapTab(dlg);
    dlg.addEventListener('close', function () {
      var r = dlg._return;
      dlg._return = null;
      if (r && r.focus) r.focus({ preventScroll: true });
    });
    dlg._pre = pre; dlg._title = t; dlg._copy = copy;
    return dlg;
  }
  function openCite(item, opener) {
    if (!citeDlg) citeDlg = buildCiteDialog();
    var bib = bibtexFor(item);
    citeDlg._bib = bib.text;
    citeDlg._title.textContent = bib.title;
    renderBib(citeDlg._pre, bib);
    citeDlg._return = opener;
    openModal(citeDlg, citeDlg._copy);
  }

  function initPublications() {
    var main = d.querySelector('main');
    var any = false;
    d.querySelectorAll('main section').forEach(function (sec) {
      sec.querySelectorAll(':scope > .item').forEach(function (item) {
        var meta = item.querySelector(':scope > .meta');
        var venue = meta && meta.querySelector('i');
        if (!meta || !venue) return;
        any = true;
        sec.classList.add('qx-pubs');
        var y = /\b(20\d\d)\b/.exec(venue.textContent);
        if (y) addRail(item, y[1]);
        var actions = el('div', 'qx-actions');
        var link = meta.querySelector('a');
        var href = link ? link.getAttribute('href') : '';
        var arx = /arxiv\.org\/(?:pdf|abs)\/(\d{4}\.\d{4,5})/.exec(href || '');
        if (arx) {
          var a = el('a', 'qx-chip');
          a.href = 'https://arxiv.org/abs/' + arx[1];
          a.target = '_blank';
          a.rel = 'noopener';
          a.appendChild(d.createTextNode('arXiv '));
          a.appendChild(el('span', 'qx-chip-id', arx[1]));
          a.setAttribute('aria-label', 'arXiv abstract page ' + arx[1] + ' (opens in a new tab)');
          actions.appendChild(a);
        }
        var cite = el('button', 'qx-chip', 'Cite');
        cite.type = 'button';
        cite.setAttribute('aria-haspopup', 'dialog');
        cite.setAttribute('aria-label', 'Cite: ' + item.querySelector('h3').textContent.trim());
        cite.addEventListener('click', function () { openCite(item, cite); });
        actions.appendChild(cite);
        meta.parentNode.insertBefore(actions, meta.nextSibling);
      });
    });
    if (any && main) main.classList.add('qx-pub-page');
  }

  /* ---------------------------------------------------------- research */
  function initResearch() {
    var sec = null;
    d.querySelectorAll('main section').forEach(function (s) {
      var h2 = s.querySelector(':scope > h2');
      if (h2 && /Research Interests/.test(h2.textContent)) sec = s;
    });
    if (!sec) return;
    var first = sec.querySelector(':scope > .item');
    if (first && /Single-Photon/.test(first.textContent)) {
      var tag = el('span', 'qx-tag', 'Undergraduate thesis · current');
      first.insertBefore(tag, first.firstChild);
    }
    var xref = {
      '3D/4D Reconstruction': ['publications.html', 'FeatureEndo-4DGS · ML4H 2025'],
      'Software-Defined Image Sensors': ['publications.html', 'IEEE VLSI 2024 paper']
    };
    sec.querySelectorAll(':scope > .item').forEach(function (item) {
      var h3 = item.querySelector('h3');
      if (!h3) return;
      Object.keys(xref).forEach(function (k) {
        if (h3.textContent.indexOf(k) !== 0) return;
        var p = el('div', 'qx-xref');
        p.appendChild(el('span', null, 'Publication'));
        var a = el('a', null, xref[k][1]);
        a.href = xref[k][0];
        p.appendChild(a);
        item.appendChild(p);
      });
    });
  }

  /* -------------------------------------------------------- experience */
  function parseRange(text, now) {
    var m = /([A-Z][a-z]{2}) (\d{4}) – (?:([A-Z][a-z]{2}) (\d{4})|Present)/.exec(text);
    if (!m || !(m[1] in MONTHS)) return null;
    var s = +m[2] * 12 + MONTHS[m[1]];
    var open = !m[3];
    var e = open ? now.getFullYear() * 12 + now.getMonth() + now.getDate() / 31 : +m[4] * 12 + MONTHS[m[3]] + 1;
    return { s: s, e: Math.max(e, s + 0.5), open: open, label: m[0] };
  }
  function shortOrg(h3) {
    var t = h3.textContent;
    var org = t.split(' — ').slice(1).join(' — ') || t;
    var par = /\(([^)]+)\)/.exec(org);
    if (par) return par[1].split(',')[0].trim();
    org = org.split(',')[0];
    return org.replace(/^University of Toronto\s+/, '').replace(/\s+Student Group$/, '').trim();
  }
  function initExperience() {
    var main = d.querySelector('main');
    var awards = d.querySelector('main > section.awards');
    if (!main || !awards) return;
    main.classList.add('qx-roles');
    var now = new Date();
    var roles = [];
    var lanes = [];
    d.querySelectorAll('main > section').forEach(function (sec) {
      var h2 = sec.querySelector(':scope > h2');
      var items = sec.querySelectorAll(':scope > .item');
      if (!h2 || !items.length) return;
      var lane = { name: h2.textContent.replace(/\s*Experience\s*$/i, '').trim(), roles: [] };
      items.forEach(function (item) {
        var h3 = item.querySelector('h3');
        var meta = item.querySelector('.meta');
        if (!h3 || !meta) return;
        // split "dates · place · supervisor" into non-breaking segments (text unchanged)
        if (meta.childNodes.length === 1 && meta.firstChild.nodeType === 3) {
          var parts = meta.firstChild.nodeValue.split(' · ');
          meta.textContent = '';
          parts.forEach(function (p, i) {
            if (i) meta.appendChild(d.createTextNode(' · '));
            meta.appendChild(el('span', i === 0 ? 'qx-seg qx-when' : 'qx-seg', p));
          });
        }
        var r = parseRange(meta.textContent, now);
        if (!r) return;
        var org = shortOrg(h3);
        if (!item.id) item.id = uniqueId('role-' + slug(org));
        var role = { item: item, h3: h3, r: r, org: org, lane: lane, place: meta.textContent.replace(r.label, '').replace(/^\s*·\s*/, '') };
        lane.roles.push(role);
        roles.push(role);
      });
      if (lane.roles.length) lanes.push(lane);
    });
    if (!roles.length) return;

    var y0 = 2022;
    roles.forEach(function (r) { y0 = Math.min(y0, Math.floor(r.r.s / 12)); });
    var y1 = Math.max(2026, now.getFullYear()) + 1;
    var t0 = y0 * 12, t1 = y1 * 12;
    function pct(t) { return ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0) * 100).toFixed(3) + '%'; }

    var fig = el('section', 'qx-exposure');
    fig.id = 'exposure';
    fig.setAttribute('aria-labelledby', 'qx-exp-h');
    var head = el('div', 'qx-exp-head');
    var h = el('h2', null, 'Experience');
    h.id = 'qx-exp-h';
    h.setAttribute('tabindex', '-1');
    head.appendChild(h);
    var earliest = roles.reduce(function (a, b) { return a.r.s < b.r.s ? a : b; });
    var sum = el('p', 'qx-exp-sum');
    sum.appendChild(el('span', 'qx-ro-num', String(roles.length)));
    sum.appendChild(d.createTextNode(' roles · ' + earliest.r.label.split(' – ')[0] + ' – present'));
    head.appendChild(sum);
    fig.appendChild(head);

    var eyebrow = el('p', 'qx-exp-eyebrow');
    eyebrow.appendChild(el('span', null, 'Exposure timeline'));
    eyebrow.appendChild(el('span', null, 'one bar per role'));
    fig.appendChild(eyebrow);

    var chart = el('div', 'qx-exp-chart');
    var grid = el('div', 'qx-exp-grid');
    grid.setAttribute('aria-hidden', 'true');
    for (var y = y0; y < y1; y++) {
      var gl = el('i');
      gl.style.left = pct(y * 12);
      grid.appendChild(gl);
    }
    var nowT = now.getFullYear() * 12 + now.getMonth() + now.getDate() / 31;
    var nl = el('i', 'is-now');
    nl.style.left = pct(nowT);
    grid.appendChild(nl);
    chart.appendChild(grid);

    var readout = el('p', 'qx-exp-readout');
    var defaultReadout = 'Hover or focus a bar to see the role; select it to jump to the entry.';
    readout.textContent = defaultReadout;

    function light(role, on) {
      role.item.classList.toggle('qx-lit', on);
      role.bar.classList.toggle('is-lit', on);
      if (on) {
        readout.textContent = '';
        readout.appendChild(el('b', null, role.r.label.replace('Present', 'present')));
        readout.appendChild(d.createTextNode(' · ' + role.h3.textContent.trim()));
      } else if (!chart.querySelector('.is-lit')) {
        readout.textContent = defaultReadout;
      }
    }

    function frac(t) { return (Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0); }
    var built = [];
    lanes.forEach(function (lane) {
      var row = el('div', 'qx-exp-lane');
      row.appendChild(el('div', 'qx-exp-lane-label', lane.name));
      var track = el('div', 'qx-exp-track');
      var sorted = lane.roles.slice().sort(function (a, b) { return a.r.s - b.r.s; });
      sorted.forEach(function (role) {
        var bar = el('a', 'qx-exp-bar' + (role.r.open ? ' is-open' : ''));
        bar.href = '#' + role.item.id;
        bar.style.left = pct(role.r.s);
        bar.style.width = 'calc(' + pct(role.r.e) + ' - ' + pct(role.r.s) + ')';
        bar.setAttribute('aria-label', role.h3.textContent.trim() + ', ' + role.r.label);
        var lab = el('span', 'qx-exp-label', role.org);
        bar.appendChild(lab);
        bar.appendChild(el('span', 'qx-exp-fill'));
        role.bar = bar;
        role.lab = lab;
        bar.addEventListener('mouseenter', function () { light(role, true); });
        bar.addEventListener('mouseleave', function () { light(role, false); });
        bar.addEventListener('focus', function () { light(role, true); });
        bar.addEventListener('blur', function () { light(role, false); });
        bar.addEventListener('click', function (e) {
          e.preventDefault();
          role.item.scrollIntoView({ behavior: rm() ? 'auto' : 'smooth', block: 'start' });
          if (history.replaceState) history.replaceState(null, '', '#' + role.item.id);
          // move focus to the entry, so the next Tab continues from there
          if (!role.item.hasAttribute('tabindex')) role.item.setAttribute('tabindex', '-1');
          role.item.focus({ preventScroll: true });
        });
        role.item.addEventListener('mouseenter', function () { light(role, true); });
        role.item.addEventListener('mouseleave', function () { if (d.activeElement !== role.item) light(role, false); });
        role.item.addEventListener('focus', function () { light(role, true); });
        role.item.addEventListener('blur', function () { light(role, false); });
        track.appendChild(bar);
      });
      row.appendChild(track);
      chart.appendChild(row);
      built.push({ track: track, roles: sorted });
    });

    /* Rows come from bar overlaps only (so the chart height never changes after the
       first paint); labels are then placed inside their row using measured widths:
       at the bar start if there is room, otherwise ending at the bar's end. */
    built.forEach(function (L) {
      var rows = [];
      L.roles.forEach(function (role) {
        var k = 0;
        while (rows[k] && rows[k][rows[k].length - 1].r.e > role.r.s) k++;
        (rows[k] = rows[k] || []).push(role);
        role.bar.style.setProperty('--row', k);
      });
      L.rows = rows;
      L.track.style.setProperty('--rows', Math.max(1, rows.length));
    });
    // label placement only moves labels with transforms, so it can wait for layout
    function layout() {
      built.forEach(function (L) {
        var W = L.track.clientWidth;
        if (!W) return;
        var showLabels = getComputedStyle(L.roles[0].lab).display !== 'none';
        var rows = L.rows;
        if (!showLabels) return;
        rows.forEach(function (row) {
          var left = 0;
          row.forEach(function (role, idx) {
            var x0 = frac(role.r.s) * W, x1 = frac(role.r.e) * W;
            var next = row[idx + 1];
            var right = next ? frac(next.r.s) * W - 12 : W;
            var lw = role.lab.offsetWidth;
            var lx = x0;
            if (x0 + lw > right) lx = Math.max(left, Math.min(x1, right) - lw);
            role.lab.style.maxWidth = (right - lx < lw) ? Math.max(24, right - lx) + 'px' : '';
            role.lab.style.transform = lx !== x0 ? 'translateX(' + Math.round(lx - x0) + 'px)' : '';
            left = Math.max(x1, lx + Math.min(lw, right - lx)) + 12;
          });
        });
      });
    }

    var axis = el('div', 'qx-exp-axis');
    axis.setAttribute('aria-hidden', 'true');
    for (var yy = y0; yy < y1; yy++) {
      var lab = el('span', null, String(yy));
      lab.style.left = pct(yy * 12);
      axis.appendChild(lab);
    }
    var nowLab = el('span', 'is-now', 'now');
    nowLab.style.left = pct(nowT);
    axis.appendChild(nowLab);
    chart.appendChild(axis);
    fig.appendChild(chart);
    fig.appendChild(readout);

    var anchor = main.querySelector(':scope > .qx-anchor');
    main.insertBefore(fig, anchor ? anchor.nextSibling : main.firstChild);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(layout);
    if ('ResizeObserver' in window) {
      // the first callback arrives after the first layout: place labels then, and on resize
      var queued = false, lastW = -1;
      new ResizeObserver(function (entries) {
        var w = Math.round(entries[entries.length - 1].contentRect.width);
        if (queued || w === lastW) return;
        lastW = w;
        queued = true;
        requestAnimationFrame(function () { queued = false; layout(); });
      }).observe(chart);
    } else requestAnimationFrame(layout);

    // awards: date/amount in mono
    awards.querySelectorAll('li > b').forEach(function (b) {
      var n = b.nextSibling;
      if (n && n.nodeType === 3 && /\S/.test(n.nodeValue)) {
        var m = /\S(?:.*\S)?/.exec(n.nodeValue);
        var mid = n.splitText(m.index);
        mid.splitText(m[0].length);
        var s = el('span', 'qx-award-meta', m[0]);
        mid.parentNode.replaceChild(s, mid);
      }
    });
  }

  /* -------------------------------------------------- command palette */
  var pal, palInput, palList, palItems = [], palActive = 0, palReturn = null;

  function trapTab(dlg) {
    dlg.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(
        dlg.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) { e.preventDefault(); return; }
      var i = f.indexOf(d.activeElement);
      e.preventDefault();
      var next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
      f[next].focus();
    });
  }

  function commands() {
    var list = [];
    PAGES.forEach(function (p) {
      var cur = pageName(p[0]) === PAGE;
      list.push({ group: 'Pages', label: p[1], glyph: '→', hint: cur ? 'current page' : p[0].replace('.html', ''),
        keys: p[1] + ' page', run: function () { if (!cur) location.href = BASE + p[0]; else window.scrollTo({ top: 0, behavior: rm() ? 'auto' : 'smooth' }); } });
    });
    var heads = d.querySelectorAll('main section > h2');
    heads.forEach(function (h) {
      var sec = h.parentElement;
      list.push({ group: 'On this page', label: h.textContent.trim(), glyph: '#', hint: 'section',
        run: function () {
          sec.scrollIntoView({ behavior: rm() ? 'auto' : 'smooth', block: 'start' });
          h.focus({ preventScroll: true });
        } });
    });
    if (window.qxSensor && window.qxSensor.canReplay) {
      list.push({ group: 'On this page', label: 'Replay the photon acquisition', glyph: '■', hint: 'hero',
        keys: 'sensor simulation quanta frames', run: function () {
          d.querySelector('.intro').scrollIntoView({ behavior: rm() ? 'auto' : 'smooth', block: 'start' });
          window.qxSensor.replay();
        } });
    }
    list.push({ group: 'Actions', label: 'Copy email address', glyph: '@', hint: 'clipboard', keys: 'contact mail', run: copyEmail });
    list.push({ group: 'Actions', label: 'Google Scholar profile', glyph: '↗', hint: 'new tab', keys: 'citations papers',
      run: function () { window.open(SCHOLAR, '_blank', 'noopener'); } });
    list.push({ group: 'Actions', label: 'LinkedIn profile', glyph: '↗', hint: 'new tab', keys: 'contact',
      run: function () { window.open(LINKEDIN, '_blank', 'noopener'); } });
    list.push({ group: 'Actions', label: 'Download CV', glyph: '↓', hint: 'PDF', keys: 'resume curriculum vitae',
      run: function () { var a = el('a'); a.href = CV; a.download = 'CV_Junhao_Wang.pdf'; d.body.appendChild(a); a.click(); a.remove(); } });
    list.push({ group: 'Actions', id: 'theme', label: d.body.getAttribute('data-theme') === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
      glyph: '◐', hint: 'theme', keys: 'dark light mode appearance', run: flipTheme });
    return list;
  }

  function score(c, q) {
    if (!q) return 1;
    var label = c.label.toLowerCase();
    var hay = (label + ' ' + (c.keys || '') + ' ' + c.group).toLowerCase();
    var esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (label === q) return 200;
    var whole = new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])').exec(label);
    if (whole) return 150 - whole.index * 0.1;
    var i = label.indexOf(q);
    if (i === 0) return 100;
    var wordStart = new RegExp('(^|[^a-z0-9])' + esc).exec(label);
    if (wordStart) return 90 - wordStart.index * 0.1;
    if (i > 0) return 70 - i * 0.1;
    if (new RegExp('(^|[^a-z0-9])' + esc).test(hay)) return 50;
    if (hay.indexOf(q) >= 0) return 40;
    var j = 0;
    for (var k = 0; k < hay.length && j < q.length; k++) if (hay[k] === q[j]) j++;
    return j === q.length ? 10 : 0;
  }

  function renderPalette() {
    var q = palInput.value.trim().toLowerCase();
    var cmds = commands().map(function (c, i) { c.s = score(c, q); c.i = i; return c; })
      .filter(function (c) { return c.s > 0; });
    if (q) cmds.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    palList.textContent = '';
    palItems = [];
    if (!cmds.length) {
      var empty = el('div', 'qx-pal-empty', 'No matches. Try “publications”, “email” or “theme”.');
      empty.setAttribute('role', 'presentation');
      palList.appendChild(empty);
      palInput.removeAttribute('aria-activedescendant');
      return;
    }
    var groups = {};
    var order = [];
    cmds.forEach(function (c) {
      var g = q ? 'Results' : c.group;
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(c);
    });
    order.forEach(function (g, gi) {
      var grp = el('div', 'qx-pal-group');
      grp.setAttribute('role', 'group');
      var lab = el('div', 'qx-pal-group-label', g);
      lab.id = 'qx-pal-g' + gi;
      lab.setAttribute('aria-hidden', 'true');
      grp.setAttribute('aria-labelledby', lab.id);
      grp.appendChild(lab);
      groups[g].forEach(function (c) {
        var o = el('div', 'qx-pal-opt');
        var idx = palItems.length;
        o.id = 'qx-pal-o' + idx;
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', 'false');
        var gl = el('span', 'qx-pal-glyph', c.glyph);
        gl.setAttribute('aria-hidden', 'true');
        o.appendChild(gl);
        var lb = el('span', 'qx-pal-label', c.label);
        if (c.id === 'theme') lb.id = 'qx-opt-theme-label';
        o.appendChild(lb);
        var hint = el('span', 'qx-pal-hint', c.hint);
        hint.setAttribute('aria-hidden', 'true');
        o.appendChild(hint);
        o.addEventListener('mousemove', function () { if (palActive !== idx) setActive(idx, false); });
        o.addEventListener('click', function () { runItem(idx); });
        grp.appendChild(o);
        palItems.push({ el: o, cmd: c });
      });
      palList.appendChild(grp);
    });
    setActive(0, true);
  }

  function setActive(i, scroll) {
    if (!palItems.length) return;
    palActive = (i + palItems.length) % palItems.length;
    palItems.forEach(function (it, k) { it.el.setAttribute('aria-selected', k === palActive ? 'true' : 'false'); });
    var cur = palItems[palActive].el;
    palInput.setAttribute('aria-activedescendant', cur.id);
    if (scroll !== false) cur.scrollIntoView({ block: 'nearest' });
  }

  function runItem(i) {
    var it = palItems[i];
    if (!it) return;
    var keepFocusTarget = it.cmd.group === 'On this page';
    closePalette(keepFocusTarget);
    it.cmd.run();
  }

  function buildPalette() {
    pal = el('dialog', 'qx-dialog qx-pal');
    pal.setAttribute('role', 'dialog');
    pal.setAttribute('aria-modal', 'true');
    pal.setAttribute('aria-label', 'Command palette');
    var search = el('div', 'qx-pal-search');
    palInput = el('input', 'qx-pal-input');
    palInput.type = 'text';
    palInput.setAttribute('role', 'combobox');
    palInput.setAttribute('aria-expanded', 'true');
    palInput.setAttribute('aria-controls', 'qx-pal-list');
    palInput.setAttribute('aria-autocomplete', 'list');
    palInput.setAttribute('aria-label', 'Search pages, sections and actions');
    palInput.setAttribute('autocomplete', 'off');
    palInput.setAttribute('spellcheck', 'false');
    palInput.placeholder = 'Jump to a page, section or action…';
    search.appendChild(palInput);
    var esc = el('kbd', null, 'esc');
    esc.setAttribute('aria-hidden', 'true');
    search.appendChild(esc);
    palList = el('div', 'qx-pal-list');
    palList.id = 'qx-pal-list';
    palList.setAttribute('role', 'listbox');
    palList.setAttribute('aria-label', 'Commands');
    var foot = el('div', 'qx-pal-foot');
    foot.setAttribute('aria-hidden', 'true');
    [['↑↓', 'move'], ['↵', 'select'], ['esc', 'close']].forEach(function (k) {
      var s = el('span');
      s.appendChild(el('kbd', null, k[0]));
      s.appendChild(d.createTextNode(k[1]));
      foot.appendChild(s);
    });
    pal.appendChild(search);
    pal.appendChild(palList);
    pal.appendChild(foot);
    d.body.appendChild(pal);

    palInput.addEventListener('input', renderPalette);
    palInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(palActive + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(palActive - 1); }
      else if (e.key === 'Home' && !palInput.value) { e.preventDefault(); setActive(0); }
      else if (e.key === 'End' && !palInput.value) { e.preventDefault(); setActive(palItems.length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); runItem(palActive); }
    });
    pal.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); palInput.focus(); }
    });
    pal.addEventListener('cancel', function (e) { e.preventDefault(); closePalette(false); });
    lightDismiss(pal, function () { closePalette(false); });
  }

  function openPalette(opener) {
    if (!pal) buildPalette();
    if (pal.open) { closePalette(false); return; }
    palReturn = opener || d.activeElement;
    palInput.value = '';
    renderPalette();
    openModal(pal, palInput);
  }

  function closePalette(keepFocus) {
    if (!pal || !pal.open) return;
    pal.close();
    if (!keepFocus && palReturn && palReturn.focus && d.contains(palReturn)) palReturn.focus({ preventScroll: true });
    palReturn = null;
  }

  function initKeys() {
    d.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        if (citeDlg && citeDlg.open) return;
        e.preventDefault();
        openPalette(d.activeElement && d.activeElement !== d.body ? d.activeElement : null);
      }
    });
  }

  /* An <iframe> never matches :focus once its own document has focus; mirror it. */
  function initFrameFocus() {
    var frames = d.querySelectorAll('iframe');
    if (!frames.length) return;
    function sync() {
      frames.forEach(function (f) { f.classList.toggle('qx-focused', d.activeElement === f); });
    }
    window.addEventListener('blur', function () { sync(); setTimeout(sync, 0); });
    window.addEventListener('focus', sync);
    d.addEventListener('focusin', sync);
  }

  /* -------------------------------------------------------------- boot */
  function enhance() {
    initNav();
    initProgress();
    initSectionIds();
    if (d.querySelector('.intro')) initIndex();
    initPublications();
    initResearch();
    initExperience();
    initFooter();
    initKeys();
    initFrameFocus();
  }
  function settle() {
    initTheme();
    // Transitions stay off until the theme has settled (no navy → light flash).
    requestAnimationFrame(function () { requestAnimationFrame(function () { html.classList.add('qx-ready'); }); });
  }
  // A deferred script runs once the document is parsed: build everything now so the
  // first paint (held by blocking="render") already has the final layout.
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', enhance);
  else enhance();
  // The theme is settled after the original DOMContentLoaded handler (which forces dark).
  var settled = false;
  function settleOnce() { if (!settled) { settled = true; settle(); } }
  if (d.readyState === 'complete') settleOnce();
  else {
    d.addEventListener('DOMContentLoaded', settleOnce);
    window.addEventListener('load', settleOnce);
  }

  window.qxPalette = { open: openPalette, close: closePalette };
  window.qxToast = toast;
})();
