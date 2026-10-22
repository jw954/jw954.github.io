/*
 * Monograph: behaviour layer for jw954.github.io.
 * Runs after assets/script.js (both deferred), so its DOMContentLoaded handler
 * fires after the original one and can restore the stored / default theme.
 * Everything here is progressive enhancement: without JS the page is complete.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var THEME_KEY = 'theme';
  var DEFAULT_THEME = 'light';
  var EMAIL = ['hry.wang', 'mail.utoronto.ca'].join(String.fromCharCode(64));
  var EMAIL_SHOWN = 'hry.wang[at]mail.utoronto.ca';
  var CV_URL = 'assets/CV_Junhao_Wang.pdf';
  var SCHOLAR = 'https://scholar.google.ca/citations?user=tF65htsAAAAJ&hl=en';
  var LINKEDIN = 'https://www.linkedin.com/in/junhao-wang-4ba488200/';
  var PAGES = [
    ['index.html', 'Home', 'about news selected publications'],
    ['research.html', 'Research', 'interests imaging spad gaussian splatting rendering'],
    ['publications.html', 'Publications', 'papers bibtex cite'],
    ['experience.html', 'Experience', 'positions internships awards scholarships career'],
    ['cv.html', 'CV', 'curriculum vitae resume pdf']
  ];
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function currentFile() {
    var f = location.pathname.split('/').pop();
    return f || 'index.html';
  }
  function readTheme() {
    try {
      var v = localStorage.getItem(THEME_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) { return null; }
  }
  function writeTheme(v) {
    try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* storage unavailable */ }
  }
  function themeNow() { return doc.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function smooth() { return reduceMotion.matches ? 'auto' : 'smooth'; }

  /* Wrap a [start, end) slice of a text node in an element; textContent is unchanged. */
  function wrapText(node, start, end, wrapper) {
    var text = node.nodeValue;
    var frag = doc.createDocumentFragment();
    if (start > 0) frag.appendChild(doc.createTextNode(text.slice(0, start)));
    wrapper.appendChild(doc.createTextNode(text.slice(start, end)));
    frag.appendChild(wrapper);
    if (end < text.length) frag.appendChild(doc.createTextNode(text.slice(end)));
    node.parentNode.replaceChild(frag, node);
    return wrapper;
  }

  /* ---------- theme (fix: original script forced dark on every load) ---------- */
  window.toggleTheme = function () {
    var next = themeNow() === 'dark' ? 'light' : 'dark';
    doc.body.setAttribute('data-theme', next);
    writeTheme(next);
    if (typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(next);
  };
  function syncThemeChrome() {
    var t = themeNow();
    root.setAttribute('data-theme', t);
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0F1218' : '#FFFFFF');
    var btn = doc.getElementById('theme-toggle');
    var want = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    if (btn && btn.textContent !== want && typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(t);
  }

  /* ---------- toast ---------- */
  var toastEl = null;
  var toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ---------- clipboard ---------- */
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var active = doc.activeElement;
      var ta = el('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (active && active.focus) active.focus({ preventScroll: true });
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function copyEmail() {
    return copyText(EMAIL).then(
      function () { toast('Email address copied'); },
      function () { toast('Copy failed. The address is ' + EMAIL_SHOWN); }
    );
  }

  /* ---------- navigation ---------- */
  function markNav() {
    var here = currentFile();
    doc.querySelectorAll('body > header nav').forEach(function (nav) {
      if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary');
      nav.querySelectorAll('a').forEach(function (a) {
        if ((a.getAttribute('href') || '') === here) a.setAttribute('aria-current', 'page');
      });
      var cur = nav.querySelector('[aria-current="page"]');
      if (cur && nav.scrollWidth > nav.clientWidth) {
        nav.scrollLeft = Math.max(0, cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2);
      }
    });
    var kbd = doc.querySelectorAll('.m-k__kbd');
    if (!IS_MAC) kbd.forEach(function (k) { k.textContent = 'Ctrl K'; });
  }

  /* ---------- typographic wraps (textContent preserved) ---------- */
  function wrapHeadings() {
    var h1 = doc.querySelector('.intro h1');
    if (h1 && h1.childNodes.length === 1 && h1.firstChild.nodeType === 3) {
      var t = h1.firstChild.nodeValue;
      var i = t.indexOf('(');
      if (i > 0) wrapText(h1.firstChild, i, t.length, el('span', 'm-aka'));
    }
    var contact = doc.querySelector('.intro .contact');
    if (contact && !contact.querySelector('button')) {
      var b = el('button', 'm-inline-btn', 'Copy');
      b.type = 'button';
      b.setAttribute('data-copy-email', '');
      b.setAttribute('aria-label', 'Copy email address');
      contact.appendChild(b);
    }
  }

  function wrapNews() {
    doc.querySelectorAll('.emoji-list > li').forEach(function (li) {
      var first = li.firstChild;
      if (!first || first.nodeType !== 3) return;
      var m = /^(\s*)\[(\d{4}\/\d{2})\]/.exec(first.nodeValue);
      if (!m) return;
      var lead = m[1].length;
      var date = el('span', 'm-date');
      date.appendChild(el('span', 'm-bk', '['));
      date.appendChild(doc.createTextNode(m[2]));
      date.appendChild(el('span', 'm-bk', ']'));
      var rest = el('span', 'm-news-body');
      var restText = first.nodeValue.slice(lead + m[2].length + 2);
      var leadText = first.nodeValue.slice(0, lead);
      var nodes = Array.prototype.slice.call(li.childNodes, 1);
      li.textContent = '';
      if (leadText) li.appendChild(doc.createTextNode(leadText));
      li.appendChild(date);
      rest.appendChild(doc.createTextNode(restText));
      nodes.forEach(function (n) { rest.appendChild(n); });
      li.appendChild(rest);
    });
  }

  function wrapAwards() {
    doc.querySelectorAll('.awards li').forEach(function (li) {
      var b = li.querySelector(':scope > b');
      var t = b && b.nextSibling;
      if (!t || t.nodeType !== 3) return;
      var s = t.nodeValue;
      var k = s.lastIndexOf(' — ');
      if (k < 0) return;
      var head = el('span', 'm-aw-head');
      li.insertBefore(head, b);
      head.appendChild(b);
      var amount = s.slice(0, k);
      if (amount) head.appendChild(el('span', 'm-aw-amt', amount));
      var when = el('span', 'm-aw-when');
      when.appendChild(el('span', 'm-aw-dash', ' — '));
      when.appendChild(doc.createTextNode(s.slice(k + 3)));
      li.replaceChild(when, t);
    });
  }

  function wrapExperience() {
    var laneByHeading = function (h) {
      if (/research/i.test(h)) return 'research';
      if (/professional/i.test(h)) return 'industry';
      if (/extracurricular/i.test(h)) return 'leadership';
      return '';
    };
    doc.querySelectorAll('main > section').forEach(function (sec) {
      var h2 = sec.querySelector(':scope > h2');
      var lane = h2 ? laneByHeading(h2.textContent) : '';
      sec.querySelectorAll(':scope > .item > p.meta').forEach(function (p) {
        var t = p.firstChild;
        if (!t || t.nodeType !== 3) return;
        var m = /^(\s*)([A-Z][a-z]{2} \d{4} – (?:Present|[A-Z][a-z]{2} \d{4}))/.exec(t.nodeValue);
        if (!m) return;
        wrapText(t, m[1].length, m[1].length + m[2].length, el('span', 'm-when'));
        if (lane) {
          var mark = el('span', 'm-lane-mark m-lane-mark--' + lane);
          mark.setAttribute('aria-hidden', 'true');
          p.insertBefore(mark, p.firstChild);
          p.parentNode.setAttribute('data-lane', lane);
        }
      });
    });
  }

  function wrapAsterisks() {
    var targets = doc.querySelectorAll('main .item > p.meta, main > section > p.meta');
    targets.forEach(function (p) {
      var walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return n.nodeValue.indexOf('*') >= 0 && !(n.parentNode.closest && n.parentNode.closest('a, .m-ast'))
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var list = [];
      while (walker.nextNode()) list.push(walker.currentNode);
      list.forEach(function (node) {
        var cur = node;
        var idx;
        while (cur && (idx = cur.nodeValue.indexOf('*')) >= 0) {
          var w = wrapText(cur, idx, idx + 1, el('span', 'm-ast'));
          cur = w.nextSibling && w.nextSibling.nodeType === 3 ? w.nextSibling : null;
        }
      });
    });
  }

  function ensureHeadingIds() {
    doc.querySelectorAll('main h2').forEach(function (h) {
      if (h.id) return;
      var base = clean(h.textContent).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
      var id = base;
      var n = 2;
      while (doc.getElementById(id)) id = base + '-' + n++;
      h.id = id;
    });
  }

  /* ---------- BibTeX (built only from on-page title, authors, venue, year, link) ---------- */
  var STOP = { the: 1, and: 1, for: 1, with: 1, using: 1, from: 1, based: 1, via: 1, on: 1, of: 1 };
  function bibEscape(s) { return s.replace(/([&%$#_])/g, '\\$1'); }
  function buildBib(h3, meta) {
    var title = clean(h3.textContent);
    var authorText = '';
    for (var i = 0; i < meta.childNodes.length; i++) {
      var n = meta.childNodes[i];
      if (n.nodeName === 'BR') break;
      authorText += n.textContent;
    }
    var authors = authorText.split(',').map(function (a) { return clean(a.replace(/\*/g, '')); }).filter(Boolean);
    var venueEl = meta.querySelector('i');
    if (!authors.length || !venueEl) return null;
    var venue = clean(venueEl.textContent);
    var ym = /(\d{4})\s*$/.exec(venue);
    var year = ym ? ym[1] : '';
    var venueName = clean(venue.replace(/\s*\d{4}\s*$/, ''));
    var link = meta.querySelector('a[href]');
    var url = link ? link.href : '';
    var arxiv = /arxiv\.org\/(?:pdf|abs)\/(\d{4}\.\d{4,5})/i.exec(url);
    var preprint = /preprint/i.test(venue);
    var last = authors[0].split(' ').pop().normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();
    var word = (title.split(/[^A-Za-z0-9]+/).filter(function (w) {
      return /^[A-Za-z]/.test(w) && w.length > 2 && !STOP[w.toLowerCase()];
    })[0] || 'paper').toLowerCase();
    var fields = [['title', title], ['author', authors.join(' and ')]];
    fields.push([preprint ? 'howpublished' : 'booktitle', venueName]);
    if (year) fields.push(['year', year]);
    if (arxiv) { fields.push(['eprint', arxiv[1]]); fields.push(['archivePrefix', 'arXiv']); }
    if (url) fields.push(['url', url]);
    var pad = fields.reduce(function (m, f) { return Math.max(m, f[0].length); }, 0);
    var body = fields.map(function (f) {
      return '  ' + f[0] + new Array(pad - f[0].length + 2).join(' ') + '= {' + bibEscape(f[1]) + '}';
    }).join(',\n');
    return '@' + (preprint ? 'misc' : 'inproceedings') + '{' + last + year + word + ',\n' + body + '\n}';
  }

  var openCite = null;
  function closeCite(returnFocus) {
    if (!openCite) return;
    var c = openCite;
    openCite = null;
    c.pop.hidden = true;
    c.btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) c.btn.focus();
  }
  function setupCite() {
    var count = 0;
    doc.querySelectorAll('main .item').forEach(function (item) {
      var h3 = item.querySelector(':scope > h3');
      var meta = item.querySelector(':scope > p.meta');
      if (!h3 || !meta || !meta.querySelector(':scope > br') || !meta.querySelector(':scope > i')) return;
      var bib = buildBib(h3, meta);
      if (!bib) return;
      count++;
      var id = 'm-cite-' + count;
      var actions = el('span', 'm-actions');
      var btn = el('button', 'm-chip m-cite-btn', 'Cite');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', id);
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-label', 'Cite: BibTeX for ' + clean(h3.textContent).split(':')[0]);
      actions.appendChild(btn);
      meta.parentNode.insertBefore(actions, meta.nextSibling);

      var pop = el('div', 'm-cite');
      pop.id = id;
      pop.hidden = true;
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'BibTeX citation');
      var head = el('div', 'm-cite__head');
      head.appendChild(el('span', 'm-eyebrow', 'BibTeX'));
      var copy = el('button', 'm-btn m-cite__copy', 'Copy');
      copy.type = 'button';
      var close = el('button', 'm-cite__close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close citation');
      head.appendChild(copy);
      head.appendChild(close);
      var pre = el('pre');
      pre.textContent = bib;
      pop.appendChild(head);
      pop.appendChild(pre);
      actions.parentNode.insertBefore(pop, actions.nextSibling);

      var state = { btn: btn, pop: pop };
      btn.addEventListener('click', function () {
        if (openCite && openCite.pop === pop) { closeCite(false); return; }
        closeCite(false);
        pop.hidden = false;
        var top = btn.offsetTop + btn.offsetHeight + 8;
        pop.style.top = top + 'px';
        btn.setAttribute('aria-expanded', 'true');
        openCite = state;
        copy.focus();
      });
      close.addEventListener('click', function () { closeCite(true); });
      copy.addEventListener('click', function () {
        copyText(bib).then(function () {
          copy.textContent = 'Copied';
          toast('BibTeX copied');
          setTimeout(function () { copy.textContent = 'Copy'; }, 1600);
        }, function () { toast('Copy failed. Select the text to copy it.'); });
      });
      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeCite(true); }
      });
      pop.addEventListener('focusout', function (e) {
        if (openCite && openCite.pop === pop && e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) closeCite(false);
      });
    });
    if (count) {
      doc.addEventListener('pointerdown', function (e) {
        if (!openCite) return;
        if (openCite.pop.contains(e.target) || openCite.btn.contains(e.target)) return;
        closeCite(false);
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openCite) closeCite(true);
      });
    }
  }

  /* ---------- command palette ---------- */
  function setupPalette() {
    var wrap = el('div', 'm-cmdk');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="m-cmdk__scrim" data-close></div>' +
      '<div class="m-cmdk__panel" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<div class="m-cmdk__field">' +
          '<input class="m-cmdk__input" type="text" role="combobox" aria-expanded="true" aria-controls="m-cmdk-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search pages, sections and actions" aria-label="Search pages, sections and actions">' +
          '<button type="button" class="m-cmdk__esc" data-close>Esc</button>' +
        '</div>' +
        '<div class="m-cmdk__list" id="m-cmdk-list" role="listbox" aria-label="Results"></div>' +
        '<p class="m-cmdk__empty" hidden></p>' +
        '<div class="m-cmdk__foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span></div>' +
      '</div>';
    doc.body.appendChild(wrap);
    var panel = wrap.querySelector('.m-cmdk__panel');
    var input = wrap.querySelector('.m-cmdk__input');
    var list = wrap.querySelector('.m-cmdk__list');
    var empty = wrap.querySelector('.m-cmdk__empty');
    var escBtn = wrap.querySelector('.m-cmdk__esc');
    var opener = null;
    var items = [];
    var shown = [];
    var active = 0;
    var inerted = [];

    function commands() {
      var here = currentFile();
      var out = [];
      PAGES.forEach(function (p) {
        out.push({ group: 'Pages', label: p[1], hint: p[0] === here ? 'Current page' : 'Page', kw: p[2], run: function () { location.href = p[0]; } });
      });
      doc.querySelectorAll('main h2').forEach(function (h) {
        out.push({ group: 'On this page', label: clean(h.textContent), hint: 'Jump to section', kw: '', run: function () {
          if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
          h.scrollIntoView({ behavior: smooth(), block: 'start' });
          h.focus({ preventScroll: true });
        } });
      });
      out.push({ group: 'Actions', label: 'Copy email address', hint: 'Clipboard', kw: 'mail contact address', run: copyEmail });
      out.push({ group: 'Actions', label: 'Open Google Scholar', hint: 'New tab', kw: 'scholar citations profile', run: function () { window.open(SCHOLAR, '_blank', 'noopener'); } });
      out.push({ group: 'Actions', label: 'Open LinkedIn', hint: 'New tab', kw: 'linkedin profile', run: function () { window.open(LINKEDIN, '_blank', 'noopener'); } });
      out.push({ group: 'Actions', label: 'Download CV', hint: 'PDF', kw: 'resume curriculum vitae pdf', run: function () {
        var a = el('a'); a.href = CV_URL; a.setAttribute('download', ''); doc.body.appendChild(a); a.click(); a.remove();
      } });
      out.push({ group: 'Actions', label: themeNow() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', hint: 'Theme', kw: 'theme dark light mode appearance', run: function () { window.toggleTheme(); } });
      return out;
    }

    function score(item, q) {
      if (!q) return 1;
      var label = item.label.toLowerCase();
      var hay = (label + ' ' + item.group + ' ' + item.kw).toLowerCase();
      if (label.indexOf(q) === 0) return 4;
      if ((' ' + label).indexOf(' ' + q) >= 0) return 3;
      if (hay.indexOf(q) >= 0) return 2;
      var j = 0;
      for (var i = 0; i < label.length && j < q.length; i++) if (label[i] === q[j]) j++;
      return j === q.length ? 1 : 0;
    }

    function render() {
      var q = clean(input.value).toLowerCase();
      shown = items.map(function (it, i) { return { it: it, s: score(it, q), i: i }; })
        .filter(function (r) { return r.s > 0; });
      if (q) shown.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
      list.textContent = '';
      var groups = {};
      var order = [];
      shown.forEach(function (r) {
        if (!groups[r.it.group]) { groups[r.it.group] = []; order.push(r.it.group); }
        groups[r.it.group].push(r);
      });
      var flat = [];
      order.forEach(function (g, gi) {
        var grp = el('div', 'm-cmdk__group');
        grp.setAttribute('role', 'group');
        var lab = el('div', 'm-cmdk__glabel', g);
        lab.id = 'm-cmdk-g' + gi;
        lab.setAttribute('role', 'presentation');
        grp.setAttribute('aria-labelledby', lab.id);
        grp.appendChild(lab);
        groups[g].forEach(function (r) {
          var o = el('div', 'm-cmdk__opt');
          o.setAttribute('role', 'option');
          o.id = 'm-cmdk-o' + flat.length;
          o.appendChild(el('span', 'm-cmdk__label', r.it.label));
          o.appendChild(el('span', 'm-cmdk__hint', r.it.hint));
          var idx = flat.length;
          o.addEventListener('mousemove', function () { if (active !== idx) setActive(idx, false); });
          o.addEventListener('click', function () { runAt(idx); });
          grp.appendChild(o);
          flat.push({ node: o, it: r.it });
        });
        list.appendChild(grp);
      });
      shown = flat;
      empty.hidden = flat.length > 0;
      list.hidden = flat.length === 0;
      if (!flat.length) empty.textContent = 'No matches for “' + clean(input.value) + '”. Try “publications” or “email”.';
      setActive(0, true);
    }

    function setActive(i, scroll) {
      if (!shown.length) { input.removeAttribute('aria-activedescendant'); return; }
      active = (i + shown.length) % shown.length;
      shown.forEach(function (r, k) { r.node.setAttribute('aria-selected', k === active ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', shown[active].node.id);
      if (scroll) shown[active].node.scrollIntoView({ block: 'nearest' });
    }

    function runAt(i) {
      var r = shown[i];
      if (!r) return;
      close(false);
      r.it.run();
    }

    function open() {
      if (!wrap.hidden) return;
      closeCite(false);
      opener = doc.activeElement;
      items = commands();
      input.value = '';
      wrap.hidden = false;
      root.classList.add('m-lock');
      inerted = [];
      Array.prototype.forEach.call(doc.body.children, function (c) {
        if (c !== wrap && c.tagName !== 'SCRIPT' && !c.inert) { c.inert = true; inerted.push(c); }
      });
      render();
      input.focus();
    }

    function close(restore) {
      if (wrap.hidden) return;
      wrap.hidden = true;
      root.classList.remove('m-lock');
      inerted.forEach(function (c) { c.inert = false; });
      inerted = [];
      if (restore !== false && opener && opener.focus && doc.contains(opener)) opener.focus();
    }

    input.addEventListener('input', render);
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1, true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1, true); }
      else if (e.key === 'Enter' && doc.activeElement === input) { e.preventDefault(); runAt(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        (doc.activeElement === input ? escBtn : input).focus();
      }
    });
    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });
    panel.addEventListener('focusout', function (e) {
      if (!wrap.hidden && e.relatedTarget && !panel.contains(e.relatedTarget)) input.focus();
    });

    doc.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (wrap.hidden) open(); else close();
      }
    });
    doc.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-palette-open]')) { e.preventDefault(); open(); }
    });
  }

  /* ---------- back to top ---------- */
  function setupTop() {
    var b = el('button', 'm-top');
    b.type = 'button';
    b.setAttribute('aria-label', 'Back to top');
    doc.body.appendChild(b);
    var on = false;
    var ticking = false;
    function update() {
      ticking = false;
      var show = window.scrollY > Math.max(720, window.innerHeight);
      if (show !== on) { on = show; b.classList.toggle('is-on', show); }
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
    b.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: smooth() });
      var target = doc.getElementById('content');
      if (target) target.focus({ preventScroll: true });
    });
  }

  /* ---------- init ---------- */
  function init() {
    var theme = readTheme() || DEFAULT_THEME;
    doc.body.setAttribute('data-theme', theme);
    if (typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(theme);
    syncThemeChrome();
    if (window.MutationObserver) {
      new MutationObserver(syncThemeChrome).observe(doc.body, { attributes: true, attributeFilter: ['data-theme'] });
    }

    toastEl = el('div', 'm-toast');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    doc.body.appendChild(toastEl);

    markNav();
    wrapHeadings();
    wrapNews();
    wrapAwards();
    wrapExperience();
    wrapAsterisks();
    ensureHeadingIds();
    setupCite();
    setupPalette();
    setupTop();

    doc.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-copy-email]');
      if (b) { e.preventDefault(); copyEmail(); }
    });

    var skip = doc.querySelector('.m-skip');
    var content = doc.getElementById('content');
    if (skip && content) {
      skip.addEventListener('click', function (e) {
        e.preventDefault();
        content.focus({ preventScroll: true });
        content.scrollIntoView({ block: 'start', behavior: smooth() });
      });
    }

    requestAnimationFrame(function () { root.classList.add('m-ready'); });
  }

  if (doc.readyState === 'complete') init();
  else doc.addEventListener('DOMContentLoaded', init);
})();
