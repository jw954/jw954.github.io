/*
 * Career at a glance: a time-scaled SVG Gantt chart generated from the dates
 * printed on experience.html. On the experience page it reads the live DOM; on
 * the home page it fetches experience.html and parses the same markup.
 * Publication milestones use the dates from the News list on the home page.
 */
(function () {
  'use strict';

  var doc = document;
  var mount = doc.querySelector('.m-glance[data-glance]');
  if (!mount) return;

  var FULL = mount.getAttribute('data-glance') === 'full';
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LANES = [
    { key: 'research', name: 'Research', test: /^research experience/i },
    { key: 'industry', name: 'Industry', test: /^professional experience/i },
    { key: 'leadership', name: 'Leadership', test: /^extracurricular experience/i }
  ];
  var NAMES = {
    'exp-tcig': { label: 'Toronto Computational Imaging Group', tag: 'Computational Imaging Group' },
    'exp-safeai': { label: 'Safe AI Lab, Carnegie Mellon', tag: 'Safe AI Lab · CMU' },
    'exp-isml': { label: 'Intelligent Sensory Microsystems Lab', tag: 'ISML' },
    'exp-seris': { label: 'SERIS, NUS', tag: 'SERIS · NUS' },
    'exp-cerebras': { label: 'Cerebras Systems', tag: 'Cerebras' },
    'exp-utmist': { label: 'UTMIST', tag: 'UTMIST' },
    'exp-sports': { label: 'UofT Sports Analytics', tag: 'Sports Analytics' }
  };
  var MILESTONES = [
    { id: 'pub-linhac', date: new Date(2023, 5, 15), label: 'LINHAC 2023', title: 'Comparing Defensive Pressures Using Possession Retention Probability and Expected Goals', venue: 'LINHAC 2023', when: 'Accepted · Jun 2023' },
    { id: 'pub-vlsi', date: new Date(2024, 7, 15), label: 'VLSI 2024', title: 'Software-Defined Image Sensor', venue: 'IEEE VLSI 2024', when: 'Published · Aug 2024' },
    { id: 'pub-featureendo', date: new Date(2025, 2, 15), label: 'ML4H 2025', title: 'FeatureEndo-4DGS', venue: 'ML4H 2025 Symposium (PMLR)', when: 'Accepted · Mar 2025' }
  ];
  var DEGREE = { start: new Date(2021, 8, 1), end: new Date(2026, 5, 0), text: 'BASc · Sep 2021 – May 2026' };
  var NOW = new Date();
  var FONT = '"Public Sans", "Helvetica Neue", Arial, sans-serif';

  var entries = [];
  var D0, D1;
  var chart, tip, desc;
  var items = [];
  var active = 0;
  var drawn = false;
  var lastW = 0;
  var linked = null;
  var measureCtx = doc.createElement('canvas').getContext('2d');
  var SEEN_KEY = 'm-glance-drawn';

  /* The draw-in plays once per browsing session; reloads and return visits show the finished chart. */
  function seen() {
    try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- utils ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function fmt(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function textW(text, size, weight, tracking) {
    measureCtx.font = (weight || 500) + ' ' + size + 'px ' + FONT;
    return measureCtx.measureText(text).width + (tracking || 0) * size * text.length;
  }
  function span(a, b) {
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
    var y = Math.floor(m / 12);
    var mo = m % 12;
    var out = [];
    if (y) out.push(y + (y === 1 ? ' yr' : ' yrs'));
    if (mo) out.push(mo + (mo === 1 ? ' mo' : ' mos'));
    return out.join(' ');
  }

  /* ---------- data ---------- */
  function parseDates(s) {
    var m = /([A-Z][a-z]{2})\s+(\d{4})\s*[–-]\s*(?:(Present)|([A-Z][a-z]{2})\s+(\d{4}))/.exec(s);
    if (!m || !(m[1] in MON)) return null;
    var start = new Date(+m[2], MON[m[1]], 1);
    var end = m[3] ? null : new Date(+m[5], MON[m[4]] + 1, 0, 23, 59);
    return { start: start, end: end, text: m[0] };
  }

  function parse(source, live) {
    var out = [];
    source.querySelectorAll('main > section').forEach(function (sec) {
      var h2 = sec.querySelector(':scope > h2');
      if (!h2) return;
      var lane = null;
      for (var i = 0; i < LANES.length; i++) if (LANES[i].test.test(clean(h2.textContent))) lane = LANES[i];
      if (!lane) return;
      sec.querySelectorAll(':scope > .item').forEach(function (item) {
        var h3 = item.querySelector('h3');
        var meta = item.querySelector('.meta');
        var anchor = item.previousElementSibling;
        if (!h3 || !meta || !anchor || !anchor.classList.contains('m-anchor')) return;
        var d = parseDates(meta.textContent);
        if (!d) return;
        var parts = clean(h3.textContent).split(' — ');
        var metaParts = clean(meta.textContent).split(' · ');
        var names = NAMES[anchor.id] || {};
        out.push({
          kind: 'role',
          id: anchor.id,
          lane: lane.key,
          laneName: lane.name,
          role: parts[0],
          org: parts.slice(1).join(' — ') || parts[0],
          dates: d.text,
          place: metaParts[1] || '',
          start: d.start,
          end: d.end || NOW,
          present: !d.end,
          label: names.label || parts[1] || parts[0],
          tag: names.tag || names.label || parts[1] || parts[0],
          item: live ? item : null,
          href: (FULL ? '' : 'experience.html') + '#' + anchor.id
        });
      });
    });
    return out;
  }

  function computeDomain() {
    var min = DEGREE.start;
    var max = NOW > DEGREE.end ? NOW : DEGREE.end;
    entries.forEach(function (e) {
      if (e.start < min) min = e.start;
      if (e.end > max) max = e.end;
    });
    D0 = new Date(min.getFullYear(), min.getMonth() - 2, 1);
    D1 = new Date(max.getFullYear(), max.getMonth() + 3, 1);
  }

  /* ---------- layout + SVG ---------- */
  function render() {
    var W = Math.floor(chart.clientWidth);
    if (W < 200) return;
    lastW = W;
    var rows = FULL && W >= 600;
    var narrow = W < 520;
    var labelW = rows ? (W >= 760 ? 238 : 200) : (narrow ? 0 : 92);
    var x0 = labelW;
    var x1 = W - (rows ? 8 : 6);
    var t0 = D0.getTime();
    var t1 = D1.getTime();
    var sx = function (d) { return x0 + (d.getTime() - t0) / (t1 - t0) * (x1 - x0); };
    var delay = function (d) { return Math.round(60 + 520 * (d.getTime() - t0) / (t1 - t0)); };

    var bg = [];
    var fg = [];
    var it = [];
    var g = [];
    var y = 24;
    var topY = 18;

    LANES.forEach(function (lane) {
      var list = entries.filter(function (e) { return e.lane === lane.key; });
      if (!list.length) return;
      bg.push('<line class="g-lanesep" x1="0" x2="' + W + '" y1="' + (y + 0.5) + '" y2="' + (y + 0.5) + '"/>');
      if (rows) {
        bg.push('<text class="g-lane" x="0" y="' + (y + 16) + '">' + esc(lane.name.toUpperCase()) + '</text>');
        y += 24;
        list.forEach(function (e) {
          var bx = sx(e.start);
          var bw = Math.max(3, sx(e.end) - bx);
          var geo = { x: bx, y: y + 10, w: bw, h: 12 };
          var k = it.length;
          g.push(
            '<a class="g-item" href="' + esc(e.href) + '" data-k="' + k + '" data-id="' + esc(e.id) + '" tabindex="-1" aria-label="' + esc(ariaFor(e)) + '">' +
              '<rect class="g-hit" x="-6" y="' + (y + 1) + '" width="' + (W + 12) + '" height="32" rx="5"/>' +
              '<text class="g-org" x="0" y="' + (y + 14) + '">' + esc(e.label) + '</text>' +
              '<text class="g-role" x="0" y="' + (y + 29) + '">' + esc(e.role) + '</text>' +
              '<rect class="g-bar g-bar--' + e.lane + '" x="' + bx.toFixed(1) + '" y="' + geo.y + '" width="' + bw.toFixed(1) + '" height="12" rx="2.5" style="--d:' + delay(e.start) + 'ms"/>' +
            '</a>'
          );
          it.push({ e: e, geo: geo });
          y += 34;
        });
        y += 8;
      } else {
        if (narrow) {
          bg.push('<text class="g-lane" x="0" y="' + (y + 15) + '">' + esc(lane.name.toUpperCase()) + '</text>');
          y += 20;
        }
        var sorted = list.slice().sort(function (a, b) { return a.start - b.start; });
        var lanesRight = [];
        var placed = [];
        sorted.forEach(function (e) {
          var bx = sx(e.start);
          var bw = Math.max(3, sx(e.end) - bx);
          var tw = textW(e.tag, 11.5, 500);
          var lx = bx;
          if (lx + tw > x1) lx = Math.max(x0, Math.min(bx + bw, x1) - tw);
          var left = Math.min(bx, lx);
          var right = Math.max(bx + bw, lx + tw) + 12;
          var r = 0;
          while (r < lanesRight.length && lanesRight[r] > left) r++;
          lanesRight[r] = right;
          placed.push({ e: e, bx: bx, bw: bw, lx: lx, tw: tw, r: r });
        });
        var rowH = 32;
        if (!narrow) {
          bg.push('<text class="g-lane" x="0" y="' + (y + 13) + '">' + esc(lane.name.toUpperCase()) + '</text>');
        }
        var base = y + 4;
        placed.forEach(function (p) {
          var ry = base + p.r * rowH;
          var geo = { x: p.bx, y: ry + 13, w: p.bw, h: 9 };
          var k = it.length;
          var hx = Math.min(p.bx, p.lx) - 5;
          var hw = Math.max(p.bx + p.bw, p.lx + p.tw) - hx + 5;
          g.push(
            '<a class="g-item" href="' + esc(p.e.href) + '" data-k="' + k + '" data-id="' + esc(p.e.id) + '" tabindex="-1" aria-label="' + esc(ariaFor(p.e)) + '">' +
              '<rect class="g-hit" x="' + hx.toFixed(1) + '" y="' + (ry - 2) + '" width="' + hw.toFixed(1) + '" height="' + (rowH - 2) + '" rx="5"/>' +
              '<text class="g-tag" x="' + p.lx.toFixed(1) + '" y="' + (ry + 8) + '">' + esc(p.e.tag) + '</text>' +
              '<rect class="g-bar g-bar--' + p.e.lane + '" x="' + p.bx.toFixed(1) + '" y="' + geo.y + '" width="' + p.bw.toFixed(1) + '" height="9" rx="2" style="--d:' + delay(p.e.start) + 'ms"/>' +
            '</a>'
          );
          it.push({ e: p.e, geo: geo });
        });
        y = base + lanesRight.length * rowH + 6;
      }
    });

    /* Publication milestones */
    bg.push('<line class="g-lanesep" x1="0" x2="' + W + '" y1="' + (y + 0.5) + '" y2="' + (y + 0.5) + '"/>');
    if (rows || narrow) {
      bg.push('<text class="g-lane" x="0" y="' + (y + 16) + '">PUBLICATIONS</text>');
      y += rows ? 22 : 20;
    } else {
      bg.push('<text class="g-lane" x="0" y="' + (y + 30) + '">PUBLICATIONS</text>');
    }
    var cy = y + 25;
    var lastAbove = -Infinity;
    var lastBelow = -Infinity;
    MILESTONES.forEach(function (m) {
      var cx = sx(m.date);
      var lw = textW(m.label, 11, 500);
      var lx = Math.max(x0, Math.min(cx - lw / 2, x1 - lw));
      var above = lx >= lastAbove + 6;
      if (!above && lastAbove + 6 <= cx - 6 && lastAbove + 6 + lw <= x1) { lx = lastAbove + 6; above = true; }
      if (!above && lx < lastBelow + 6) above = true;
      if (above) lastAbove = lx + lw; else lastBelow = lx + lw;
      var ty = above ? cy - 12 : cy + 21;
      var k = it.length;
      var hx = Math.min(cx - 9, lx - 4);
      var hw = Math.max(cx + 9, lx + lw + 4) - hx;
      var hy = above ? cy - 25 : cy - 10;
      g.push(
        '<a class="g-item g-item--ms" href="publications.html#' + m.id + '" data-k="' + k + '" tabindex="-1" aria-label="' + esc('Publication: ' + m.title + ', ' + m.venue + '. ' + m.when.replace(' · ', ' ') + '.') + '">' +
          '<rect class="g-hit" x="' + hx.toFixed(1) + '" y="' + hy + '" width="' + hw.toFixed(1) + '" height="36" rx="5"/>' +
          '<path class="g-ms" d="M' + cx.toFixed(1) + ' ' + (cy - 6) + 'l6 6-6 6-6-6z" style="--d:' + (delay(m.date) + 180) + 'ms"/>' +
          '<text class="g-ms-label g-fade" x="' + lx.toFixed(1) + '" y="' + ty + '" style="--d:' + (delay(m.date) + 220) + 'ms">' + esc(m.label) + '</text>' +
        '</a>'
      );
      it.push({ e: { kind: 'ms', m: m }, geo: { x: cx - 6, y: cy - 6, w: 12, h: 12 } });
    });
    y = cy + 30;

    /* Axis */
    var axisY = y;
    var bandX = sx(DEGREE.start);
    var bandW = sx(DEGREE.end) - bandX;
    bg.unshift(
      '<rect class="g-band" x="' + bandX.toFixed(1) + '" y="' + topY + '" width="' + bandW.toFixed(1) + '" height="' + (axisY - topY) + '"/>' +
      '<line class="g-band-edge" x1="' + Math.round(bandX) + '.5" x2="' + Math.round(bandX) + '.5" y1="' + topY + '" y2="' + axisY + '"/>' +
      '<line class="g-band-edge" x1="' + Math.round(bandX + bandW) + '.5" x2="' + Math.round(bandX + bandW) + '.5" y1="' + topY + '" y2="' + axisY + '"/>' +
      '<text class="g-band-label" x="' + (bandX + 7).toFixed(1) + '" y="12">' + esc(DEGREE.text.toUpperCase()) + '</text>'
    );
    var grid = [];
    var ticks = [];
    var years = [];
    var pxPerMonth = (x1 - x0) / ((t1 - t0) / (30.44 * 864e5));
    for (var d = new Date(D0.getFullYear(), D0.getMonth(), 1); d < D1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      var x = Math.round(sx(d)) + 0.5;
      if (d.getMonth() === 0 && d > D0) {
        grid.push('<line class="g-grid" x1="' + x + '" x2="' + x + '" y1="' + topY + '" y2="' + (axisY + 7) + '"/>');
      } else if (d > D0) {
        var q = d.getMonth() % 3 === 0;
        if (q || pxPerMonth >= 6) ticks.push('<line class="g-tick' + (q ? ' g-tick--q' : '') + '" x1="' + x + '" x2="' + x + '" y1="' + axisY + '" y2="' + (axisY + (q ? 5 : 3)) + '"/>');
      }
    }
    for (var yr = D0.getFullYear(); yr < D1.getFullYear() || (yr === D1.getFullYear() && D1.getMonth() > 0); yr++) {
      var a = Math.max(t0, new Date(yr, 0, 1).getTime());
      var b = Math.min(t1, new Date(yr + 1, 0, 1).getTime());
      if (b <= a) continue;
      var xa = sx(new Date(a));
      var xb = sx(new Date(b));
      var label = String(yr);
      if (xb - xa < textW(label, 11.5, 600, 0.04) + 6) label = '’' + String(yr).slice(2);
      years.push('<text class="g-year" x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (axisY + 21) + '" text-anchor="middle">' + label + '</text>');
    }
    var nx = Math.round(sx(NOW)) + 0.5;
    var nowAnchor = nx + 16 > W ? 'end' : 'middle';
    var nowLabelX = nowAnchor === 'end' ? nx + 4 : nx;
    var now =
      '<g class="g-fade" style="--d:640ms">' +
        '<line class="g-now" x1="' + nx + '" x2="' + nx + '" y1="' + (topY + 3) + '" y2="' + axisY + '"/>' +
        '<circle class="g-now-dot" cx="' + nx + '" cy="' + (topY + 3) + '" r="3.5"/>' +
        '<text class="g-now-label" x="' + nowLabelX + '" y="12" text-anchor="' + nowAnchor + '">NOW</text>' +
      '</g>';

    var H = axisY + 28;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="group" aria-labelledby="career-title" aria-describedby="career-desc">' +
        '<g aria-hidden="true">' + bg.join('') + grid.join('') +
          '<line class="g-axis" x1="' + x0 + '" x2="' + x1 + '" y1="' + (axisY + 0.5) + '" y2="' + (axisY + 0.5) + '"/>' +
          ticks.join('') + years.join('') + now +
        '</g>' +
        g.join('') +
      '</svg>';

    var armed = !drawn && !reduce.matches;
    chart.classList.toggle('is-armed', armed);
    chart.innerHTML = svg;
    chart.appendChild(tip);
    items = it;
    var nodes = chart.querySelectorAll('.g-item');
    items.forEach(function (rec, i) { rec.node = nodes[i]; });
    if (active >= items.length) active = 0;
    setRoving();
  }

  function ariaFor(e) {
    return e.role + ', ' + e.org + '. ' + e.dates + (e.place ? ', ' + e.place : '') + '.';
  }

  /* ---------- interaction ---------- */
  function setRoving() {
    items.forEach(function (rec, i) { rec.node.setAttribute('tabindex', i === active ? '0' : '-1'); });
  }

  function tipHTML(rec) {
    var e = rec.e;
    if (e.kind === 'ms') {
      return '<span class="m-tip__lane">Publication</span>' +
        '<span class="m-tip__title">' + esc(e.m.title) + '</span>' +
        '<span class="m-tip__org">' + esc(e.m.venue) + '</span>' +
        '<span class="m-tip__dates">' + esc(e.m.when) + '</span>' +
        '<span class="m-tip__hint">Select to open on the Publications page</span>';
    }
    return '<span class="m-tip__lane">' + esc(e.laneName) + '</span>' +
      '<span class="m-tip__title">' + esc(e.role) + '</span>' +
      '<span class="m-tip__org">' + esc(e.org) + '</span>' +
      '<span class="m-tip__dates">' + esc(e.dates) + ' · ' + esc(span(e.start, e.end)) + (e.place ? '<br>' + esc(e.place) : '') + '</span>' +
      '<span class="m-tip__hint">' + (FULL ? 'Select to jump to the entry' : 'Select to open on the Experience page') + '</span>';
  }

  function show(i) {
    var rec = items[i];
    if (!rec) return;
    tip.innerHTML = tipHTML(rec);
    tip.classList.add('is-on');
    var W = chart.clientWidth;
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var cx = rec.geo.x + Math.min(rec.geo.w, 400) / 2;
    if (rec.geo.w > 200) cx = rec.geo.x + 60;
    var left = Math.max(-8, Math.min(W - tw + 8, cx - tw / 2));
    var top = rec.geo.y - th - 12;
    if (top < -40) top = rec.geo.y + rec.geo.h + 12;
    tip.style.transform = '';
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    if (linked) linked.classList.remove('is-linked');
    linked = rec.e.item || null;
    if (linked) linked.classList.add('is-linked');
  }

  function hide() {
    tip.classList.remove('is-on');
    if (linked) { linked.classList.remove('is-linked'); linked = null; }
  }

  function bind() {
    chart.addEventListener('pointerover', function (ev) {
      var a = ev.target.closest && ev.target.closest('.g-item');
      if (a) show(+a.getAttribute('data-k'));
    });
    chart.addEventListener('pointerout', function (ev) {
      var a = ev.target.closest && ev.target.closest('.g-item');
      if (a && !(ev.relatedTarget && a.contains(ev.relatedTarget))) {
        if (!(doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('.g-item'))) hide();
      }
    });
    chart.addEventListener('focusin', function (ev) {
      var a = ev.target.closest && ev.target.closest('.g-item');
      if (!a) return;
      active = +a.getAttribute('data-k');
      setRoving();
      show(active);
    });
    chart.addEventListener('focusout', function (ev) {
      if (!(ev.relatedTarget && chart.contains(ev.relatedTarget))) hide();
    });
    chart.addEventListener('keydown', function (ev) {
      var k = ev.key;
      var next = null;
      if (k === 'ArrowRight' || k === 'ArrowDown') next = active + 1;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') next = active - 1;
      else if (k === 'Home') next = 0;
      else if (k === 'End') next = items.length - 1;
      else if (k === 'Escape') { hide(); return; }
      else if (k === ' ' || k === 'Spacebar') { ev.preventDefault(); if (items[active]) items[active].node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return; }
      if (next == null || !items.length) return;
      ev.preventDefault();
      active = (next + items.length) % items.length;
      setRoving();
      items[active].node.focus();
    });

    /* Reverse link: hovering an entry lights its bar (experience page). */
    if (FULL) {
      entries.forEach(function (e) {
        if (!e.item) return;
        e.item.addEventListener('mouseenter', function () {
          var n = chart.querySelector('.g-item[data-id="' + e.id + '"]');
          if (n) n.classList.add('is-hot');
        });
        e.item.addEventListener('mouseleave', function () {
          var n = chart.querySelector('.g-item[data-id="' + e.id + '"]');
          if (n) n.classList.remove('is-hot');
        });
      });
    }
  }

  function arm() {
    if (drawn || reduce.matches || !('IntersectionObserver' in window)) { drawn = true; chart.classList.remove('is-armed'); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting || drawn) return;
        drawn = true;
        markSeen();
        io.disconnect();
        chart.getBoundingClientRect();
        requestAnimationFrame(function () {
          chart.classList.add('is-anim');
          chart.classList.remove('is-armed');
          setTimeout(function () { chart.classList.remove('is-anim'); }, 1600);
        });
      });
    }, { threshold: 0.25 });
    io.observe(chart);
  }

  /* ---------- build ---------- */
  function build() {
    if (!entries.length) return;
    computeDomain();
    var roles = entries.length;
    mount.setAttribute('aria-labelledby', 'career-title');
    mount.innerHTML =
      '<div class="m-glance__head">' +
        '<h2 id="career-title">Career at a glance</h2>' +
        (FULL ? '' : '<a class="m-more" href="experience.html">Full experience</a>') +
      '</div>' +
      '<figure class="m-plate">' +
        '<div class="m-chart"></div>' +
        '<p id="career-desc" class="m-sr">Timeline from ' + fmt(D0) + ' to ' + fmt(new Date(D1.getTime() - 864e5)) + ' showing ' + roles +
          ' roles across research, industry and leadership, ' + MILESTONES.length + ' publication milestones, and the BASc in Engineering Science at the University of Toronto (Sep 2021 to May 2026). ' +
          'Each item is a link; use the arrow keys to move between items.</p>' +
        '<figcaption class="m-legend">' +
          '<span class="m-key m-key--research">Research</span>' +
          '<span class="m-key m-key--industry">Industry</span>' +
          '<span class="m-key m-key--leadership">Leadership</span>' +
          '<span class="m-key m-key--ms">Publication</span>' +
          '<span class="m-key m-key--band">BASc, Engineering Science</span>' +
          '<span class="m-legend__hint">' + (FULL ? 'Select a bar to jump to its entry' : 'Select a bar to open its entry') + '</span>' +
        '</figcaption>' +
      '</figure>';
    chart = mount.querySelector('.m-chart');
    tip = doc.createElement('div');
    tip.className = 'm-tip';
    tip.setAttribute('aria-hidden', 'true');
    mount.hidden = false;
    if (seen()) drawn = true;
    render();
    bind();
    arm();

    if ('ResizeObserver' in window) {
      var raf = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          if (Math.floor(chart.clientWidth) !== lastW) { hide(); render(); }
        });
      }).observe(chart);
    }

    /* The chart sits above the entries: re-settle a deep link once it exists. */
    if (FULL && location.hash) {
      var target = doc.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) requestAnimationFrame(function () { target.scrollIntoView({ block: 'start' }); });
    }
  }

  function start() {
    var fontsReady = doc.fonts && doc.fonts.load
      ? Promise.race([
          Promise.all([doc.fonts.load('500 11.5px "Public Sans"'), doc.fonts.load('600 11.5px "Public Sans"')]),
          new Promise(function (r) { setTimeout(r, 1500); })
        ]).catch(function () {})
      : Promise.resolve();
    if (FULL) {
      entries = parse(doc, true);
      fontsReady.then(build);
    } else {
      Promise.all([
        fetch('experience.html', { credentials: 'same-origin' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }),
        fontsReady
      ]).then(function (res) {
        entries = parse(new DOMParser().parseFromString(res[0], 'text/html'), false);
        build();
      }).catch(function () { /* no chart without the source page */ });
    }
  }

  if (doc.readyState === 'complete') start();
  else doc.addEventListener('DOMContentLoaded', start);
})();
