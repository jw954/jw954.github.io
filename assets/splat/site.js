/*
 * SPLAT site behaviour. Loaded (deferred) after assets/script.js, so its DOMContentLoaded
 * handler runs after the original one and can correct the theme it forces.
 * Everything here is progressive enhancement: original text is never changed, only wrapped.
 */
(function () {
  'use strict';

  var doc = document;
  var html = doc.documentElement;
  var THEME_KEY = 'theme';
  var DEFAULT_THEME = 'light';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function storedTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return t === 'dark' || t === 'light' ? t : null;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- theme */
  function syncThemeChrome(t) {
    html.setAttribute('data-theme', t);
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0E1015' : '#F4F6FA');
    var btn = doc.getElementById('theme-toggle');
    if (btn) btn.title = btn.textContent;
  }
  function applyTheme(t) {
    doc.body.setAttribute('data-theme', t);
    if (typeof window.updateThemeToggleButton === 'function') window.updateThemeToggleButton(t);
    syncThemeChrome(t);
  }

  /* ---------------------------------------------------------------- toast */
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    // a modal dialog sits in the top layer, so the toast has to live inside it to be seen
    var host = doc.querySelector('dialog[open]') || doc.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = msg;
    // force reflow so the transition replays on rapid repeats
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
      setTimeout(function () { if (!toastEl.classList.contains('is-on')) toastEl.textContent = ''; }, 400);
    }, 2200);
  }

  function copyText(text) {
    function legacy() {
      return new Promise(function (resolve, reject) {
        var ta = el('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        doc.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        if (ok) { resolve(); } else { reject(new Error('copy failed')); }
      });
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }

  function copyButton(label, getText, okMsg) {
    var b = el('button', 'copy-btn', 'Copy');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', function () {
      copyText(getText()).then(function () {
        b.textContent = 'Copied';
        b.classList.add('is-done');
        toast(okMsg);
        setTimeout(function () { b.textContent = 'Copy'; b.classList.remove('is-done'); }, 1800);
      }, function () {
        toast('Copy failed. Select the text and copy it manually.');
      });
    });
    return b;
  }

  /* ---------------------------------------------------------------- scroll chrome */
  function initScroll() {
    var bar = doc.querySelector('.scroll-progress');
    var top = el('button', 'to-top');
    top.type = 'button';
    top.appendChild(el('span', 'sr-only', 'Back to top'));
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
    doc.body.appendChild(top);
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      var max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);
      if (bar) bar.style.setProperty('--progress', Math.min(1, y / max).toFixed(4));
      html.classList.toggle('is-scrolled', y > 8);
      top.classList.toggle('is-on', y > window.innerHeight * 0.9);
      spy();
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------------------------------------------------------------- home */
  function initHome() {
    var h1 = doc.querySelector('.intro h1');
    if (h1) {
      for (var n = h1.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && n.data.indexOf('(Harry)') > -1) {
          var i = n.data.indexOf('(Harry)');
          var alias = n.splitText(i);
          alias.splitText('(Harry)'.length);
          var span = el('span', 'hero-alias');
          alias.parentNode.replaceChild(span, alias);
          span.appendChild(alias);
          break;
        }
      }
    }
    var contact = doc.querySelector('.intro .contact');
    if (contact) {
      var shown = contact.textContent.trim();
      contact.appendChild(copyButton('Copy email address', function () { return shown.replace('[at]', '@'); }, 'Email address copied'));
    }
    var cap = doc.querySelector('.hero-visual figcaption');
    if (cap && !cap.querySelector('.fig-no')) cap.insertBefore(el('span', 'fig-no', 'Fig. 1'), cap.firstChild);

    // News: wrap the [YYYY/MM] stamp so it can be set in mono (textContent unchanged)
    doc.querySelectorAll('.emoji-list li').forEach(function (li) {
      var t = li.firstChild;
      if (!t || t.nodeType !== 3) return;
      var m = /^(\s*)\[(\d{4})\/(\d{2})\]/.exec(t.data);
      if (!m) return;
      var stamp = m[1].length ? t.splitText(m[1].length) : t;
      stamp.splitText(9); // "[YYYY/MM]".length
      var time = el('time', 'news-date');
      time.setAttribute('datetime', m[2] + '-' + m[3]);
      time.appendChild(el('span', 'br', '['));
      time.appendChild(doc.createTextNode(m[2] + '/' + m[3]));
      time.appendChild(el('span', 'br', ']'));
      stamp.parentNode.replaceChild(time, stamp);
      li.classList.add('has-date');
    });
  }

  function initFooter() {
    var em = doc.querySelector('.foot-email');
    if (em) {
      var shown = em.textContent.trim();
      em.parentNode.insertBefore(copyButton('Copy email address', function () { return shown.replace('[at]', '@'); }, 'Email address copied'), em.nextSibling);
      em.parentNode.insertBefore(doc.createTextNode(' '), em.nextSibling);
    }
  }

  /* ---------------------------------------------------------------- publications + BibTeX */
  var STOP = /^(a|an|the|of|on|for|and|with|from|using|via|to|in)$/i;
  function bibName(name) {
    var parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name.trim();
    var last = parts.pop();
    return last + ', ' + parts.join(' ');
  }
  function protect(title) {
    return title.split(' ').map(function (w) {
      var m = /^(.*?)([:,.;]?)$/.exec(w), core = m[1], tail = m[2];
      var needs = /[A-Z]/.test(core.slice(1)) || (/\d/.test(core) && /[A-Za-z]/.test(core));
      return (needs ? '{' + core + '}' : core) + tail;
    }).join(' ');
  }
  function esc(s) { return s.replace(/([&%$#_])/g, '\\$1'); }
  function ascii(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function linkId(href) {
    var a = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})/i.exec(href);
    if (a) return { kind: 'arxiv', id: a[1], label: 'arXiv ' + a[1] };
    var i = /ieeexplore\.ieee\.org\/document\/(\d+)/i.exec(href);
    if (i) return { kind: 'ieee', id: i[1], label: 'IEEE Xplore ' + i[1] };
    return null;
  }

  function buildBib(d) {
    var first = d.authors[0] || 'anon';
    var lastName = first.trim().split(/\s+/).pop();
    var word = '';
    d.title.split(/[\s:,\-\/]+/).some(function (w) { if (w.length > 2 && /[a-z]/i.test(w) && !STOP.test(w)) { word = w; return true; } return false; });
    var key = ascii(lastName) + (d.year || '') + ascii(word);
    var venue = d.venue.replace(/\s*\b(19|20)\d{2}\b\s*/, ' ').replace(/\s+/g, ' ').trim();
    var preprint = /arxiv/i.test(venue) && !/(proceedings|symposium|conference)/i.test(venue);
    var fields = [
      ['title', '{' + esc(protect(d.title)) + '}'],
      ['author', '{' + esc(d.authors.map(bibName).join(' and ')) + '}']
    ];
    fields.push(preprint ? ['howpublished', '{' + esc(venue) + '}'] : ['booktitle', '{' + esc(venue) + '}']);
    if (d.year) fields.push(['year', '{' + d.year + '}']);
    if (d.ids && d.ids.kind === 'arxiv') { fields.push(['eprint', '{' + d.ids.id + '}']); fields.push(['archivePrefix', '{arXiv}']); }
    if (d.url) fields.push(['url', '{' + d.url + '}']);
    var pad = fields.reduce(function (n, f) { return Math.max(n, f[0].length); }, 0);
    return '@' + (preprint ? 'misc' : 'inproceedings') + '{' + key + ',\n' +
      fields.map(function (f) { return '  ' + f[0] + new Array(pad - f[0].length + 2).join(' ') + '= ' + f[1]; }).join(',\n') +
      '\n}';
  }

  var dialog = null, dialogOpener = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el('dialog', 'cite-dialog');
    dialog.setAttribute('aria-labelledby', 'cite-title');
    dialog.setAttribute('aria-describedby', 'cite-paper');
    var head = el('div', 'cite-head');
    var h = el('h2', null, 'Cite this paper');
    h.id = 'cite-title';
    var close = el('button', 'cite-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () { dialog.close(); });
    head.appendChild(h); head.appendChild(close);
    var paper = el('p', 'cite-paper'); paper.id = 'cite-paper';
    var pre = el('pre', 'cite-bib');
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'BibTeX entry');
    pre.appendChild(el('code'));
    var foot = el('div', 'cite-foot');
    foot.appendChild(el('span', 'cite-note', 'BibTeX built from the details listed on this page.'));
    var copy = el('button', 'btn btn--solid cite-copy', 'Copy BibTeX');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      copyText(pre.textContent).then(function () {
        copy.textContent = 'Copied';
        toast('BibTeX copied');
        setTimeout(function () { copy.textContent = 'Copy BibTeX'; }, 1800);
      }, function () { toast('Copy failed. Select the BibTeX and copy it manually.'); });
    });
    foot.appendChild(copy);
    dialog.appendChild(head); dialog.appendChild(paper); dialog.appendChild(pre); dialog.appendChild(foot);
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      var r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
    // keep Tab cycling inside the modal (browsers otherwise hand focus to their own UI)
    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(dialog.querySelectorAll('button, [tabindex="0"], a[href]'), function (n) { return !n.disabled; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('close', function () {
      if (dialogOpener && doc.contains(dialogOpener)) dialogOpener.focus();
      dialogOpener = null;
    });
    doc.body.appendChild(dialog);
    return dialog;
  }
  function openCite(data, opener) {
    var d = ensureDialog();
    d.querySelector('.cite-paper').textContent = data.title;
    d.querySelector('code').textContent = buildBib(data);
    var copy = d.querySelector('.cite-copy');
    copy.textContent = 'Copy BibTeX';
    dialogOpener = opener;
    d.showModal();
    copy.focus();
  }

  function initPublications() {
    var supportsDialog = typeof window.HTMLDialogElement === 'function' && 'showModal' in doc.createElement('dialog');
    var items = doc.querySelectorAll('.page--home .item, .page--publications .item');
    items.forEach(function (item) {
      var h3 = item.querySelector('h3');
      var meta = item.querySelector('p.meta');
      if (!h3 || !meta) return;
      var link = meta.querySelector('a[href]');
      var authorsText = '', venue = '';
      var iEl = meta.querySelector('i');
      if (iEl) {
        // publications.html: authors <br> <i>venue</i> <br> <a>Paper</a>
        for (var n = meta.firstChild; n && n.nodeName !== 'BR'; n = n.nextSibling) authorsText += n.textContent;
        venue = iEl.textContent.trim();
      } else {
        // index.html: authors — venue / <a>link</a>
        var full = meta.textContent;
        var dash = full.indexOf(' — ');
        if (dash < 0) return;
        authorsText = full.slice(0, dash);
        venue = full.slice(dash + 3).split(' / ')[0].trim();
        // wrap separators + venue for styling (text unchanged)
        meta.childNodes.forEach(function (node) {
          if (node.nodeType !== 3 || node.data.indexOf(' — ') < 0) return;
          var at = node.data.indexOf(' — ');
          var sep = node.splitText(at);
          var ven = sep.splitText(3);
          var slash = ven.data.indexOf(' / ');
          var after = slash > -1 ? ven.splitText(slash) : null;
          var sSep = el('span', 'sep'); sep.parentNode.replaceChild(sSep, sep); sSep.appendChild(sep);
          var sVen = el('span', 'venue-chip'); ven.parentNode.replaceChild(sVen, ven); sVen.appendChild(ven);
          if (after) {
            var rest = after.splitText(3);
            var sSl = el('span', 'sep'); after.parentNode.replaceChild(sSl, after); sSl.appendChild(after);
            void rest;
          }
        });
      }
      var authors = authorsText.replace(/\s+/g, ' ').split(',').map(function (s) { return s.replace(/\*/g, '').trim(); }).filter(Boolean);
      var ym = /\b(19|20)\d{2}\b/.exec(venue);
      var data = {
        title: h3.textContent.replace(/\s+/g, ' ').trim(),
        authors: authors,
        venue: venue,
        year: ym ? ym[0] : '',
        url: link ? link.getAttribute('href') : '',
        ids: link ? linkId(link.getAttribute('href')) : null
      };
      if (link && link.getAttribute('target') === '_blank') link.setAttribute('rel', 'noopener');

      var actions = el('span', 'pub-actions');
      if (supportsDialog) {
        var cite = el('button', 'cite-btn', 'Cite');
        cite.type = 'button';
        cite.setAttribute('aria-haspopup', 'dialog');
        cite.setAttribute('aria-label', 'Cite: ' + data.title);
        cite.addEventListener('click', function () { openCite(data, cite); });
        actions.appendChild(doc.createTextNode(' '));
        actions.appendChild(cite);
      }
      if (data.ids && item.closest('.page--publications')) {
        actions.appendChild(el('span', 'pub-id', data.ids.label));
      }
      if (actions.childNodes.length) {
        meta.parentNode.insertBefore(actions, meta.nextSibling);
        item.classList.add('has-cite');
      }
      if (data.year && item.closest('.page--publications')) {
        var y = el('span', 'pub-year', data.year);
        y.setAttribute('aria-hidden', 'true');
        item.insertBefore(y, item.firstChild);
        item.classList.add('has-year');
      }
    });
  }

  /* ---------------------------------------------------------------- experience */
  var spyLinks = [], spyTargets = [];
  function spy() {
    if (!spyTargets.length) return;
    var line = window.innerHeight * 0.32, active = 0;
    spyTargets.forEach(function (s, i) { if (s.getBoundingClientRect().top <= line) active = i; });
    if (window.innerHeight + window.scrollY >= doc.documentElement.scrollHeight - 4) active = spyTargets.length - 1;
    spyLinks.forEach(function (a, i) {
      if (i === active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
  }
  function slug(s) { return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function initExperience() {
    var main = doc.querySelector('.page--experience main');
    if (!main) return;
    var sections = Array.prototype.filter.call(main.children, function (c) { return c.tagName === 'SECTION'; });
    var toc = el('nav', 'toc');
    toc.setAttribute('aria-label', 'On this page');
    toc.appendChild(el('p', 'toc-title', 'On this page'));
    var ol = el('ol');
    sections.forEach(function (sec) {
      var h2 = sec.querySelector('h2');
      if (!h2) return;
      if (!sec.id) sec.id = slug(h2.textContent);
      var li = el('li');
      var a = el('a', null, h2.textContent.trim());
      a.href = '#' + sec.id;
      li.appendChild(a); ol.appendChild(li);
      spyLinks.push(a); spyTargets.push(sec);

      if (sec.classList.contains('awards')) {
        sec.querySelectorAll('li').forEach(function (li2) {
          var b = li2.querySelector('b');
          var t = b && b.nextSibling;
          if (!t || t.nodeType !== 3) return;
          var m = /^(\s*)(\([^)]*\))?(\s*—\s*)([^\n]*?)(\s*)$/.exec(t.data);
          if (!m) return;
          var cur = t;
          if (m[1].length) cur = cur.splitText(m[1].length);
          if (m[2]) {
            var tagNode = cur; cur = cur.splitText(m[2].length);
            var tag = el('span', 'award-tag'); tagNode.parentNode.replaceChild(tag, tagNode); tag.appendChild(tagNode);
          }
          // keep "— date" together so the dash never ends a line on its own
          var lead = /^\s*/.exec(m[3])[0].length;
          if (lead) cur = cur.splitText(lead);
          if (m[4]) {
            var dateNode = cur;
            if (m[5].length) dateNode.splitText(m[3].length - lead + m[4].length);
            var date = el('span', 'award-date'); dateNode.parentNode.replaceChild(date, dateNode); date.appendChild(dateNode);
          }
        });
        return;
      }
      sec.classList.add('timeline');
      Array.prototype.forEach.call(sec.children, function (item) {
        if (!item.classList.contains('item')) return;
        var meta = item.querySelector('.meta');
        if (!meta) return;
        var ym = /\b(19|20)\d{2}\b/.exec(meta.textContent);
        if (ym) {
          var y = el('span', 'tl-year', ym[0]);
          y.setAttribute('aria-hidden', 'true');
          item.insertBefore(y, item.firstChild);
        }
        var t = meta.firstChild;
        if (t && t.nodeType === 3) {
          var cut = t.data.indexOf(' · ');
          if (cut > 0) {
            t.splitText(cut);
            var d = el('span', 'tl-date');
            t.parentNode.replaceChild(d, t);
            d.appendChild(t);
          }
        }
      });
    });
    toc.appendChild(ol);
    main.insertBefore(toc, main.firstChild);
    main.classList.add('has-toc');
    spy();
  }

  /* ---------------------------------------------------------------- nav */
  function initNav() {
    var nav = doc.querySelector('body > header nav');
    if (!nav) return;
    if (!nav.hasAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary');
    if (nav.querySelector('[aria-current="page"]')) return;
    var here = (location.pathname.split('/').pop() || 'index.html');
    nav.querySelectorAll('a').forEach(function (a) {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
    });
  }

  /* the PDF iframe never matches :focus once its document has focus, so mirror it */
  function initFrames() {
    var frames = doc.querySelectorAll('iframe');
    if (!frames.length) return;
    function mark() {
      frames.forEach(function (f) { f.classList.toggle('has-focus', doc.activeElement === f); });
    }
    frames.forEach(function (f) {
      f.addEventListener('focus', mark);
      f.addEventListener('blur', mark);
    });
    window.addEventListener('blur', function () { mark(); setTimeout(mark, 0); });
    window.addEventListener('focus', mark);
    doc.addEventListener('focusin', mark);
  }

  /* ---------------------------------------------------------------- boot */
  doc.addEventListener('DOMContentLoaded', function () {
    applyTheme(storedTheme() || DEFAULT_THEME);
    new MutationObserver(function () {
      syncThemeChrome(doc.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    }).observe(doc.body, { attributes: true, attributeFilter: ['data-theme'] });

    toastEl = el('div', 'toast');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    doc.body.appendChild(toastEl);

    initNav();
    initHome();
    initFooter();
    initPublications();
    initExperience();
    initScroll();
    initFrames();
  });
})();
