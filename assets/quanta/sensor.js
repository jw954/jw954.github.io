/*
 * QUANTA — the sensor window.
 * An illustration of quanta burst imaging, simulated live from the portrait:
 *   per 1-bit frame, each pixel/channel fires with p = 1 − exp(−α·I)
 *   (I = linear intensity in [0, 1]); after N frames with k detections the
 *   maximum-likelihood estimate is Î = −ln(1 − k/N) / α.
 * Frame counts are sampled with exact Binomial increments, so colour emerges
 * from noise the way it does when real binary frames are summed.
 */
(function () {
  'use strict';

  var d = document;
  var img = d.querySelector('.intro .qx-window .avatar');
  if (!img) { d.documentElement.classList.remove('qx-anim'); return; }
  var win = img.parentElement;
  var fig = win.closest('.qx-sensor');

  var R = 176;                    // internal sensor resolution (R × R)
  var NPX = R * R;
  var NCH = NPX * 3;
  var NMAX = 1024;
  var ALPHA = 2.2;
  var PMAX = 1 - Math.exp(-ALPHA);
  var STEPS = 60;                 // slider positions: N = 2^(i/6), log scale
  var DURATION = 3900;            // ms for 1 → 1024 frames
  var PREROLL = 380;
  var FRAME_US = 10;              // 100,000 fps

  var stops = [];
  for (var i = 0; i <= STEPS; i++) stops.push(Math.round(Math.pow(2, (i * 10) / STEPS)));

  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var RM = mq.matches;

  /* --------------------------------------------------------------- DOM */
  var canvas = d.createElement('canvas');
  canvas.className = 'qx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  win.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var sim = d.createElement('canvas');
  sim.width = sim.height = R;
  var sctx = sim.getContext('2d');
  var frameData = sctx.createImageData(R, R);
  var px = frameData.data;
  for (var a = 3; a < px.length; a += 4) px[a] = 255;

  var cap = d.createElement('figcaption');
  cap.className = 'qx-readout';
  cap.innerHTML =
    '<div class="qx-ro-top"><span class="qx-ro-state">Acquiring</span>' +
    '<span class="qx-ro-frames">binary frames <span class="qx-ro-num" data-n>0000</span>/1024</span></div>' +
    '<div class="qx-ro-sub"><span class="qx-nw">10&nbsp;µs per frame ·</span> <span class="qx-nw">100,000&nbsp;fps ·</span> <span class="qx-nw"><span class="qx-ro-num" data-ms>0.00&nbsp;ms</span> integrated</span></div>' +
    '<div class="qx-scrub"><label for="qx-frames">Frames accumulated (log scale)</label>' +
    '<input class="qx-range" id="qx-frames" type="range" min="0" max="' + STEPS + '" step="1" value="' + STEPS + '">' +
    '<div class="qx-ticks" aria-hidden="true"></div></div>' +
    '<div class="qx-btns"><button type="button" class="qx-btn" data-single aria-pressed="false">Single frame</button>' +
    '<button type="button" class="qx-btn" data-replay>Replay</button></div>' +
    '<p class="qx-note">Illustration, simulated live in your browser: 1-bit photon frames drawn from this portrait and merged with the maximum-likelihood estimate.</p>';
  fig.appendChild(cap);

  var elState = cap.querySelector('.qx-ro-state');
  var elN = cap.querySelector('[data-n]');
  var elMs = cap.querySelector('[data-ms]');
  var elFramesLabel = cap.querySelector('.qx-ro-frames');
  var range = cap.querySelector('.qx-range');
  var btnSingle = cap.querySelector('[data-single]');
  var btnReplay = cap.querySelector('[data-replay]');
  var ticks = cap.querySelector('.qx-ticks');
  var elLabel = cap.querySelector('.qx-scrub label');
  [1, 4, 16, 64, 256, 1024].forEach(function (n) {
    var s = d.createElement('span');
    s.textContent = n;
    s.style.left = (Math.log2(n) / 10 * 100) + '%';
    ticks.appendChild(s);
  });
  if (RM) btnReplay.hidden = true;

  /* ------------------------------------------------------------ random */
  var seed = 0x2545F491;
  function rnd() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  var GN = 16384;
  var gauss = new Float32Array(GN);
  for (var g = 0; g < GN; g += 2) {
    var u1 = Math.max(rnd(), 1e-12), u2 = rnd();
    var rr = Math.sqrt(-2 * Math.log(u1));
    gauss[g] = rr * Math.cos(2 * Math.PI * u2);
    gauss[g + 1] = rr * Math.sin(2 * Math.PI * u2);
  }

  /* ------------------------------------------------------------- state */
  var p = new Float32Array(NCH);      // detection probability per pixel/channel
  var lq = new Float32Array(NCH);     // ln(1 − p)
  var lp = new Float32Array(NCH);     // ln(p)
  var spq = new Float32Array(NCH);    // sqrt(p(1 − p))
  var k = new Uint16Array(NCH);       // detections in frames 1..n
  var partial = new Uint8Array(NCH);  // detections since the last stop
  var inc = [];                       // inc[i]: detections in frames (stops[i-1], stops[i]]
  var n = 0;                          // frames generated so far (generation head)
  var nextStop = 0;                   // index of the next stop to complete
  var viewIdx = -1;                   // stop index currently reflected in k (when not mid-stop)
  var ready = false;
  var mode = 'play';                  // play | scrub | single | photo
  var raf = 0, playT = 0, lastTs = 0, playing = false;
  var visible = true;
  var photoTimer = 0;
  var lutGamma = new Uint8Array(4097);
  for (var t = 0; t <= 4096; t++) lutGamma[t] = Math.round(255 * Math.pow(t / 4096, 1 / 2.2));

  function toLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function measure() {
    var c = d.createElement('canvas');
    c.width = c.height = R;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    var s = Math.min(img.naturalWidth, img.naturalHeight);
    x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, R, R);
    var src = x.getImageData(0, 0, R, R).data;
    for (var j = 0, q = 0; j < NPX; j++, q += 4) {
      for (var ch = 0; ch < 3; ch++) {
        var I = toLinear(src[q + ch]);
        var pj = 1 - Math.exp(-ALPHA * I);
        var o = j * 3 + ch;
        p[o] = pj;
        lq[o] = Math.log(1 - pj);
        lp[o] = Math.log(Math.max(pj, 1e-9));
        spq[o] = Math.sqrt(pj * (1 - pj));
      }
    }
  }

  /* Add Binomial(m, p) detections to k and partial, for every pixel/channel. */
  function sample(m) {
    if (m <= 0) return;
    var sm = Math.sqrt(m);
    for (var j = 0; j < NCH; j++) {
      var pj = p[j], x = 0;
      if (pj < 1e-6) { x = 0; }
      else if (m <= 6) {
        for (var s = 0; s < m; s++) if (rnd() < pj) x++;
      } else {
        var mean = m * pj;
        if (mean < 5) {                 // few successes: sum geometric gaps
          var pos = 0, l = lq[j];
          for (;;) { pos += Math.floor(Math.log(rnd() + 1e-12) / l) + 1; if (pos > m) break; x++; }
        } else if (m - mean < 5) {      // few failures: count those instead
          var pos2 = 0, l2 = lp[j], f = 0;
          for (;;) { pos2 += Math.floor(Math.log(rnd() + 1e-12) / l2) + 1; if (pos2 > m) break; f++; }
          x = m - f;
        } else {                        // normal approximation
          x = Math.round(mean + sm * spq[j] * gauss[(rnd() * GN) | 0]);
          if (x < 0) x = 0; else if (x > m) x = m;
        }
      }
      k[j] += x;
      partial[j] += x;
    }
  }

  /* Advance the play head to `target` frames, closing stops as they are passed. */
  function advance(target) {
    while (n < target && nextStop <= STEPS) {
      var stopN = stops[nextStop];
      var to = Math.min(target, stopN);
      sample(to - n);
      n = to;
      while (nextStop <= STEPS && stops[nextStop] <= n) {
        inc[nextStop] = (nextStop > 0 && stops[nextStop] === stops[nextStop - 1]) ? null : partial.slice();
        partial.fill(0);
        viewIdx = nextStop;
        nextStop++;
      }
    }
  }

  /* k mirrors stop `viewIdx`; walk it to stop i using the stored increments. */
  function moveTo(i) {
    var j, arr;
    while (viewIdx < i) { arr = inc[++viewIdx]; if (arr) for (j = 0; j < NCH; j++) k[j] += arr[j]; }
    while (viewIdx > i) { arr = inc[viewIdx--]; if (arr) for (j = 0; j < NCH; j++) k[j] -= arr[j]; }
  }
  /* Show stop i; stops beyond the generation head are sampled on demand.
     Precondition: no partial frames (see finishPlayback). */
  function seekStop(i) {
    var last = nextStop - 1;
    if (i <= last) { moveTo(i); return; }
    moveTo(last);
    advance(stops[i]);
  }

  /* ----------------------------------------------------------- drawing */
  function drawEstimate(N) {
    if (N <= 0) {
      for (var z = 0; z < NPX; z++) { px[z * 4] = 10; px[z * 4 + 1] = 15; px[z * 4 + 2] = 31; }
      blit();
      return;
    }
    var lut = new Uint8Array(N + 1);
    for (var c = 0; c <= N; c++) {
      var r = Math.min(c / N, PMAX);
      var I = -Math.log(1 - r) / ALPHA;
      lut[c] = lutGamma[Math.min(4096, Math.round(I * 4096))];
    }
    for (var j = 0, o = 0, q = 0; j < NPX; j++, o += 3, q += 4) {
      px[q] = lut[k[o]];
      px[q + 1] = lut[k[o + 1]];
      px[q + 2] = lut[k[o + 2]];
    }
    blit();
  }

  /* One raw binary frame: amber where photons were detected (R+G+B bits). */
  var AMBER = [[10, 15, 31], [118, 96, 66], [196, 152, 86], [255, 194, 102]];
  function drawSingle(frame) {
    var s0 = seed;
    seed = (0x9E3779B1 * (frame + 1)) >>> 0 || 1;
    for (var w = 0; w < 4; w++) rnd();
    for (var j = 0, o = 0, q = 0; j < NPX; j++, o += 3, q += 4) {
      var c = (rnd() < p[o] ? 1 : 0) + (rnd() < p[o + 1] ? 1 : 0) + (rnd() < p[o + 2] ? 1 : 0);
      var col = AMBER[c];
      px[q] = col[0]; px[q + 1] = col[1]; px[q + 2] = col[2];
    }
    seed = s0;
    blit();
  }

  function blit() {
    sctx.putImageData(frameData, 0, 0);
    paint();
  }
  function paint() {
    if (!canvas.width) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sim, 0, 0, canvas.width, canvas.height);
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(win.clientWidth * dpr));
    if (canvas.width !== w) {
      canvas.width = canvas.height = w;
      paint();
    }
  }

  /* ------------------------------------------------------------ readout */
  function pad(v) { return ('0000' + v).slice(-4); }
  function readout(N, label) {
    cap.setAttribute('data-mode', mode);
    elState.textContent = label;
    elN.textContent = pad(N);
    var ms = ((mode === 'single' ? 1 : N) * FRAME_US / 1000).toFixed(2);
    elMs.textContent = ms + ' ms';
    elFramesLabel.firstChild.nodeValue = mode === 'single' ? 'binary frame ' : 'binary frames ';
    elFramesLabel.lastChild.nodeValue = mode === 'single' ? '' : '/1024';
    elLabel.textContent = mode === 'single' ? 'Frame number (log scale)' : 'Frames accumulated (log scale)';
  }
  function syncRange(i) {
    range.value = String(i);
    range.style.setProperty('--fill', (i / STEPS * 100) + '%');
    var N = stops[i];
    range.setAttribute('aria-valuetext', N + (N === 1 ? ' binary frame' : ' binary frames'));
  }
  function idxFor(N) {
    var i = 0;
    while (i < STEPS && stops[i + 1] <= N) i++;
    return i;
  }

  function showCanvas(quick) {
    canvas.classList.toggle('is-quick', !!quick);
    canvas.classList.remove('is-off');
  }
  function showPhoto() {
    mode = 'photo';
    canvas.classList.remove('is-quick');
    canvas.classList.add('is-off');
    readout(NMAX, 'Photograph');
  }

  /* --------------------------------------------------------------- play */
  function ease(u) { return Math.pow(u, 1.12); }
  function frame(ts) {
    raf = 0;
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    var dt = Math.min(64, ts - lastTs);
    lastTs = ts;
    playT += dt;
    var u = (playT - PREROLL) / DURATION;
    if (u < 0) {
      readout(0, 'Acquiring');
      schedule();
      return;
    }
    if (u > 1) u = 1;
    var target = Math.max(1, Math.min(NMAX, Math.round(Math.pow(NMAX, ease(u)))));
    advance(target);
    drawEstimate(n);
    readout(n, 'Acquiring');
    syncRange(idxFor(n));
    if (u >= 1) {
      playing = false;
      mode = 'scrub';
      readout(NMAX, 'Estimate');
      clearTimeout(photoTimer);
      photoTimer = setTimeout(showPhoto, 650);
      return;
    }
    schedule();
  }
  function schedule() {
    if (!raf && playing && visible && !d.hidden) raf = requestAnimationFrame(frame);
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function resetSim() {
    k.fill(0); partial.fill(0); inc = []; n = 0; nextStop = 0; viewIdx = -1;
    seed = (Date.now() ^ 0x5bd1e995) >>> 0 || 1;
  }
  function play() {
    clearTimeout(photoTimer);
    resetSim();
    mode = 'play';
    btnSingle.setAttribute('aria-pressed', 'false');
    playT = 0; lastTs = 0; playing = true;
    canvas.classList.add('is-quick');
    showCanvas(true);
    drawEstimate(0);
    readout(0, 'Acquiring');
    syncRange(0);
    schedule();
  }

  /* ------------------------------------------------------ interaction */
  function finishPlayback() {
    if (playing) stopPlay();
    if (n === 0) advance(1);
    // close the stop the play head is inside, so slider states stay consistent
    if (nextStop <= STEPS && n !== stops[nextStop - 1]) advance(stops[nextStop]);
  }
  function show(i) {
    clearTimeout(photoTimer);
    seekStop(i);
    syncRange(i);
    if (btnSingle.getAttribute('aria-pressed') === 'true') {
      mode = 'single';
      drawSingle(stops[i]);
      readout(stops[i], 'Single binary frame');
    } else {
      mode = 'scrub';
      drawEstimate(stops[i]);
      readout(stops[i], 'Estimate');
    }
    showCanvas(true);
  }

  range.addEventListener('input', function () {
    if (!ready) return;
    finishPlayback();
    var i = +range.value;
    show(i);
    if (i === STEPS && mode === 'scrub') photoTimer = setTimeout(showPhoto, 900);
  });
  btnSingle.addEventListener('click', function () {
    if (!ready) return;
    var on = btnSingle.getAttribute('aria-pressed') !== 'true';
    btnSingle.setAttribute('aria-pressed', on ? 'true' : 'false');
    finishPlayback();
    var i = mode === 'photo' ? STEPS : Math.max(0, viewIdx);
    show(i);
    if (!on && i === STEPS) photoTimer = setTimeout(showPhoto, 900);
  });
  btnReplay.addEventListener('click', function () {
    if (!ready) return;
    play();
  });

  /* ------------------------------------------------------------- boot */
  function start() {
    try { measure(); } catch (e) { d.documentElement.classList.remove('qx-anim'); return; }
    ready = true;
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(win);
    else window.addEventListener('resize', resize);

    if (RM) {
      // Reduced motion: compute the complete acquisition once, draw it, show the photograph.
      seed = 0x1234567;
      advance(NMAX);
      viewIdx = STEPS;
      drawEstimate(NMAX);
      syncRange(STEPS);
      canvas.classList.add('is-off');
      mode = 'photo';
      readout(NMAX, 'Photograph');
      d.documentElement.classList.remove('qx-anim');
      return;
    }
    play();
    d.documentElement.classList.remove('qx-anim');

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) { lastTs = 0; schedule(); }
      }).observe(win);
    }
    d.addEventListener('visibilitychange', function () {
      if (!d.hidden) { lastTs = 0; schedule(); }
    });
  }

  function whenImage(cb) {
    if (img.complete && img.naturalWidth) { (img.decode ? img.decode() : Promise.resolve()).then(cb, cb); return; }
    img.addEventListener('load', function () { cb(); }, { once: true });
    img.addEventListener('error', function () { d.documentElement.classList.remove('qx-anim'); }, { once: true });
  }
  whenImage(start);

  window.qxSensor = { replay: function () { if (ready && !RM) play(); else if (ready) show(STEPS); } };
})();
