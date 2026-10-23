/*
 * QUANTA — the sensor window.
 * An illustration of quanta burst imaging, simulated live from the portrait:
 *   per 1-bit frame, each pixel/channel fires with p = 1 − exp(−α·I)
 *   (I = linear intensity in [0, 1]); after N frames with k detections the
 *   maximum-likelihood estimate is Î = −ln(1 − k/N) / α.
 * Detections are drawn as exact Binomial increments (one uniform per channel,
 * inverse CDF; normal approximation only when both np and nq are large), so
 * colour emerges from noise the way it does when real binary frames are summed.
 *
 * Performance: a start-up micro-benchmark picks the internal resolution, and a
 * frame governor lowers the simulation rate on slow devices, so no single frame
 * does more than a few milliseconds of work.
 */
(function () {
  'use strict';

  var d = document;
  var html = d.documentElement;
  var img = d.querySelector('.intro .qx-window .avatar');
  var intro = d.querySelector('.intro');
  function release() { html.classList.remove('qx-anim'); }
  if (!img || !intro) { release(); return; }
  var win = img.parentElement;
  var now = function () { return performance.now(); };

  var NMAX = 1024;
  var ALPHA = 2.2;
  var PMAX = 1 - Math.exp(-ALPHA);
  var STEPS = 60;                 // slider positions: N = 2^(i/6), log scale
  var DURATION = 3900;            // ms for 1 → 1024 frames
  var PREROLL = 380;
  var FRAME_US = 10;              // 100,000 fps
  var stops = [];
  for (var i = 0; i <= STEPS; i++) stops.push(Math.round(Math.pow(2, (i * 10) / STEPS)));

  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------------------------------------------- UI (space reserved
     now so nothing shifts later; revealed once the portrait is measured) */
  var ui = d.createElement('div');
  ui.className = 'qx-sensor-ui';
  ui.setAttribute('role', 'group');
  ui.setAttribute('aria-label', 'Photon-counting simulation of the portrait');
  ui.innerHTML =
    '<div class="qx-ro-top"><span class="qx-ro-state">Acquiring</span>' +
    '<span class="qx-ro-frames">binary frames <span class="qx-ro-num" data-n>0000</span>/1024</span></div>' +
    '<div class="qx-ro-sub"><span class="qx-nw">10&nbsp;µs per frame ·</span> <span class="qx-nw">100,000&nbsp;fps ·</span> <span class="qx-nw"><span class="qx-ro-num" data-ms>0.00&nbsp;ms</span> integrated</span></div>' +
    '<div class="qx-scrub"><label for="qx-frames">Frames accumulated (log scale)</label>' +
    '<input class="qx-range" id="qx-frames" type="range" min="0" max="' + STEPS + '" step="1" value="' + STEPS + '">' +
    '<div class="qx-ticks" aria-hidden="true"></div></div>' +
    '<div class="qx-btns"><button type="button" class="qx-btn" data-single aria-pressed="false">Single frame</button>' +
    '<button type="button" class="qx-btn" data-photo aria-pressed="false">Photo</button>' +
    '<button type="button" class="qx-btn" data-replay>Replay</button></div>' +
    '<p class="qx-note">Illustration, simulated live in your browser: 1-bit photon frames drawn from this portrait and merged with the maximum-likelihood estimate.</p>';
  intro.appendChild(ui);

  var elState = ui.querySelector('.qx-ro-state');
  var elN = ui.querySelector('[data-n]');
  var elMs = ui.querySelector('[data-ms]');
  var elFrames = ui.querySelector('.qx-ro-frames');
  var elLabel = ui.querySelector('.qx-scrub label');
  var range = ui.querySelector('.qx-range');
  var btnSingle = ui.querySelector('[data-single]');
  var btnPhoto = ui.querySelector('[data-photo]');
  var btnReplay = ui.querySelector('[data-replay]');
  var ticks = ui.querySelector('.qx-ticks');
  [1, 4, 16, 64, 256, 1024].forEach(function (v) {
    var s = d.createElement('span');
    s.textContent = v;
    s.style.left = (Math.log2(v) / 10 * 100) + '%';
    ticks.appendChild(s);
  });
  if (RM) btnReplay.hidden = true;

  var canvas = null, ctx = null, sim = null, sctx = null, frameData = null, px = null;

  function fail() {
    release();
    if (ui.parentNode) ui.parentNode.removeChild(ui);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

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

  /* The portrait is 8-bit, so p takes only 256 values: one per input level. */
  var ALPHA_P = new Float64Array(256);
  function toLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  for (var lv = 0; lv < 256; lv++) ALPHA_P[lv] = 1 - Math.exp(-ALPHA * toLinear(lv));

  /* Per call, build the exact Binomial(m, p) CDF for each level (truncated where the
     remaining mass is < 1e-12); then every channel costs one uniform and a short walk.
     Levels with np ≥ 9 and nq ≥ 9 use the normal approximation. */
  var MODE = new Uint8Array(256), OFF = new Int32Array(256), MEAN = new Float64Array(256), SD = new Float64Array(256);
  var CDF = new Float64Array(256 * 48);
  function prepare(m) {
    var used = 0;
    for (var v = 0; v < 256; v++) {
      var pv = ALPHA_P[v], qv = 1 - pv, mean = m * pv;
      if (pv < 1e-6) { MODE[v] = 0; continue; }
      var fail = mean >= 9;
      if (fail && m - mean >= 9) { MODE[v] = 3; MEAN[v] = mean; SD[v] = Math.sqrt(mean * qv); continue; }
      var a = fail ? qv : pv, b = 1 - a;            // walk over the rarer outcome
      var mu = m * a, len = Math.min(m, Math.ceil(mu + 8 * Math.sqrt(mu * b) + 8)) + 1;
      if (used + len > CDF.length) { var bigger = new Float64Array((used + len) * 2); bigger.set(CDF); CDF = bigger; }
      var pr = Math.pow(b, m), cdf = pr, ratio = a / b;
      OFF[v] = used; MODE[v] = fail ? 2 : 1;
      for (var x = 0; x < len; x++) {
        CDF[used + x] = x === len - 1 ? 2 : cdf;      // sentinel ends the walk
        pr *= (m - x) / (x + 1) * ratio; cdf += pr;
      }
      used += len;
    }
  }
  /* Add Binomial(m, p[level]) detections to K and PART for every channel. */
  function sampleLevels(m, LEV, K, PART, len) {
    prepare(m);
    var cdfArr = CDF;
    for (var j = 0; j < len; j++) {
      var md = MODE[LEV[j]];
      if (md === 0) continue;
      var x;
      if (md === 3) {
        var v = LEV[j];
        x = Math.round(MEAN[v] + SD[v] * gauss[(rnd() * GN) | 0]);
        if (x < 0) x = 0; else if (x > m) x = m;
      } else {
        var u = rnd(), o = OFF[LEV[j]];
        x = 0;
        while (u > cdfArr[o + x]) x++;
        if (md === 2) x = m - x;
      }
      K[j] += x;
      PART[j] += x;
    }
  }

  /* Pick the internal resolution from a short, warmed-up benchmark. */
  function chooseResolution() {
    var len = 8000, LEV = new Uint8Array(len), K = new Uint16Array(len), PART = new Uint8Array(len);
    for (var j = 0; j < len; j++) LEV[j] = 20 + ((rnd() * 220) | 0);
    for (var w = 0; w < 4; w++) sampleLevels(w & 1 ? 14 : 3, LEV, K, PART, 2000);     // warm the JIT
    var best = Infinity;
    for (var rep = 0; rep < 2; rep++) {
      var t0 = now();
      sampleLevels(5, LEV, K, PART, len);
      sampleLevels(14, LEV, K, PART, len);
      best = Math.min(best, now() - t0);
    }
    var perChannel = best / (2 * len);                      // ms per channel per pass
    var budget = 5;                                          // ms for ~1.6 passes per frame
    var r = Math.sqrt(budget / (perChannel * 3 * 1.6));
    return Math.max(112, Math.min(176, Math.floor(r / 16) * 16));
  }

  /* ------------------------------------------------------------- state */
  var R, NPX, NCH;
  var lev;                 // per pixel/channel: 8-bit input level (→ ALPHA_P)
  var k;                   // detections at stop `viewIdx` (during playback: up to the head)
  var partial;             // detections since the last closed stop, at the generation head
  var inc = [];            // inc[i]: detections in frames (stops[i−1], stops[i]]
  var n = 0;               // generation head (frames sampled so far)
  var nextStop = 0;        // next stop the generator will close
  var viewIdx = -1;        // stop reflected in k
  var ready = false;
  var mode = 'play';       // play | scrub | single | photo
  var raf = 0, playT = 0, lastTs = 0, playing = false, following = false;
  var visible = true, photoTimer = 0;
  var stride = 1, tick = 0, ema = 0;

  // display encoding: linear → sRGB transfer curve
  var lutEnc = new Uint8Array(4097);
  for (var t = 0; t <= 4096; t++) {
    var lin = t / 4096;
    var e = lin <= 0.0031308 ? 12.92 * lin : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
    lutEnc[t] = Math.round(255 * e);
  }

  function allocate(res) {
    R = res; NPX = R * R; NCH = NPX * 3;
    lev = new Uint8Array(NCH);
    k = new Uint16Array(NCH); partial = new Uint8Array(NCH);
  }

  /* RGBA bytes of the portrait at R × R. The GPU→CPU readback runs in a small
     worker (OffscreenCanvas) when available; otherwise on the main thread. */
  function readMain(source) {
    var c = d.createElement('canvas');
    c.width = c.height = R;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    if (source !== img) x.drawImage(source, 0, 0, R, R);
    else {
      var s0 = Math.min(img.naturalWidth, img.naturalHeight);
      x.drawImage(img, (img.naturalWidth - s0) / 2, (img.naturalHeight - s0) / 2, s0, s0, 0, 0, R, R);
    }
    return x.getImageData(0, 0, R, R).data;        // throws on a tainted canvas (e.g. file://)
  }
  function readInWorker(bitmap) {
    return new Promise(function (resolve, reject) {
      if (!window.Worker || !window.OffscreenCanvas || bitmap === img) return reject();
      var src = 'onmessage=function(e){try{var R=e.data.R,c=new OffscreenCanvas(R,R),x=c.getContext("2d",{willReadFrequently:true});' +
        'x.drawImage(e.data.b,0,0,R,R);e.data.b.close&&e.data.b.close();var p=x.getImageData(0,0,R,R).data;postMessage(p.buffer,[p.buffer]);}' +
        'catch(err){postMessage(null);}};';
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      var w;
      try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); return reject(); }
      var timer = setTimeout(function () { w.terminate(); reject(); }, 3000);
      w.onmessage = function (e) {
        clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url);
        if (e.data) resolve(new Uint8ClampedArray(e.data)); else reject();
      };
      w.onerror = function () { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); reject(); };
      w.postMessage({ b: bitmap, R: R }, [bitmap]);
    });
  }
  function measure(bytes) {
    for (var j = 0, q = 0, o = 0; j < NPX; j++, q += 4) {
      lev[o++] = bytes[q]; lev[o++] = bytes[q + 1]; lev[o++] = bytes[q + 2];
    }
  }

  var scratch = null;      // throw-away accumulator for background generation
  /* Advance the generator to `target` frames, closing stops as they are passed.
     follow = true (playback): k tracks the generator. Otherwise k is untouched. */
  function advance(target, follow) {
    var acc = follow ? k : (scratch || (scratch = new Uint16Array(NCH)));
    while (n < target && nextStop <= STEPS) {
      var to = Math.min(target, stops[nextStop]);
      sampleLevels(to - n, lev, acc, partial, NCH);
      n = to;
      while (nextStop <= STEPS && stops[nextStop] <= n) {
        var dup = nextStop > 0 && stops[nextStop] === stops[nextStop - 1];
        inc[nextStop] = dup ? null : partial.slice();
        partial.fill(0);
        if (follow) viewIdx = nextStop;
        nextStop++;
      }
    }
  }
  /* Walk k to stop i with the stored increments (generating missing stops). */
  function seekStop(i) {
    if (i >= nextStop) advance(stops[i], false);
    var j, arr;
    while (viewIdx < i) { arr = inc[++viewIdx]; if (arr) for (j = 0; j < NCH; j++) k[j] += arr[j]; }
    while (viewIdx > i) { arr = inc[viewIdx--]; if (arr) for (j = 0; j < NCH; j++) k[j] -= arr[j]; }
  }
  /* Background generation in ≤4 ms slices (reduced-motion visitors who reach for the slider). */
  var pumping = false;
  function pump() {
    if (pumping || nextStop > STEPS) return;
    pumping = true;
    (function slice() {
      var t0 = now();
      while (nextStop <= STEPS && now() - t0 < 4) advance(stops[nextStop], false);
      if (nextStop <= STEPS) setTimeout(slice, 0); else pumping = false;
    })();
  }

  /* ----------------------------------------------------------- drawing */
  function drawEstimate(N) {
    var j, o, q;
    if (N <= 0) {
      for (j = 0; j < NPX; j++) { px[j * 4] = 10; px[j * 4 + 1] = 15; px[j * 4 + 2] = 31; }
      return blit();
    }
    var lut = new Uint8Array(N + 1);
    for (var c = 0; c <= N; c++) {
      var I = -Math.log(1 - Math.min(c / N, PMAX)) / ALPHA;
      lut[c] = lutEnc[Math.min(4096, Math.round(I * 4096))];
    }
    for (j = 0, o = 0, q = 0; j < NPX; j++, o += 3, q += 4) {
      px[q] = lut[k[o]];
      px[q + 1] = lut[k[o + 1]];
      px[q + 2] = lut[k[o + 2]];
    }
    blit();
  }

  /* One raw binary frame: amber where photons were detected (R+G+B bits). */
  var AMBER = [[10, 15, 31], [118, 96, 66], [196, 152, 86], [255, 194, 102]];
  function drawSingle(frameNo) {
    var s0 = seed;
    seed = (0x9E3779B1 * (frameNo + 1)) >>> 0 || 1;
    for (var w = 0; w < 4; w++) rnd();
    for (var j = 0, o = 0, q = 0; j < NPX; j++, o += 3, q += 4) {
      var c = (rnd() < ALPHA_P[lev[o]] ? 1 : 0) + (rnd() < ALPHA_P[lev[o + 1]] ? 1 : 0) + (rnd() < ALPHA_P[lev[o + 2]] ? 1 : 0);
      var col = AMBER[c];
      px[q] = col[0]; px[q + 1] = col[1]; px[q + 2] = col[2];
    }
    seed = s0;
    blit();
  }

  function blit() { sctx.putImageData(frameData, 0, 0); paint(); }
  function paint() {
    if (!canvas.width) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sim, 0, 0, canvas.width, canvas.height);
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(win.clientWidth * dpr));
    if (canvas.width !== w) { canvas.width = canvas.height = w; paint(); }
  }

  /* ------------------------------------------------------------ readout */
  function pad(v) { return ('0000' + v).slice(-4); }
  function readout(N, label) {
    ui.setAttribute('data-mode', mode);
    elState.textContent = label;
    elN.textContent = pad(N);
    elMs.textContent = ((mode === 'single' ? 1 : N) * FRAME_US / 1000).toFixed(2) + ' ms';
    elFrames.firstChild.nodeValue = mode === 'single' ? 'binary frame ' : 'binary frames ';
    elFrames.lastChild.nodeValue = mode === 'single' ? '' : '/1024';
    elLabel.textContent = mode === 'single' ? 'Frame number (log scale)' : 'Frames accumulated (log scale)';
    btnPhoto.setAttribute('aria-pressed', mode === 'photo' ? 'true' : 'false');
  }
  function syncRange(i) {
    range.value = String(i);
    range.style.setProperty('--fill', (i / STEPS * 100) + '%');
    var N = stops[i];
    range.setAttribute('aria-valuetext', N + (N === 1 ? ' binary frame' : ' binary frames'));
  }
  function idxFor(N) {
    var j = 0;
    while (j < STEPS && stops[j + 1] <= N) j++;
    return j;
  }

  function showCanvas(quick) {
    canvas.classList.toggle('is-quick', !!quick);
    canvas.classList.remove('is-off');
  }
  /* At rest the visitor sees the real photograph. */
  function showPhoto(instant) {
    clearTimeout(photoTimer);
    mode = 'photo';
    btnSingle.setAttribute('aria-pressed', 'false');
    canvas.classList.toggle('is-quick', !!instant);
    canvas.classList.add('is-off');
    syncRange(STEPS);
    readout(NMAX, 'Photograph');
  }

  /* --------------------------------------------------------------- play */
  function ease(u) { return Math.pow(u, 1.12); }
  function frame(ts) {
    raf = 0;
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    playT += Math.min(250, ts - lastTs);   // slow devices still finish on time; pauses reset lastTs
    lastTs = ts;
    var u = (playT - PREROLL) / DURATION;
    if (u < 0) { readout(0, 'Acquiring'); return schedule(); }
    if (u > 1) u = 1;
    // governor: on slow devices simulate every 2nd or 3rd display frame
    if (u < 1 && (tick++ % stride) !== 0) return schedule();
    var t0 = now();
    var target = Math.max(1, Math.min(NMAX, Math.round(Math.pow(NMAX, ease(u)))));
    advance(target, true);            // while following, k already includes the partial frames
    drawEstimate(n);
    readout(n, 'Acquiring');
    syncRange(idxFor(n));
    var work = now() - t0;
    ema = ema ? ema * 0.8 + work * 0.2 : work;
    if (ema > 9 && stride < 3) { stride++; ema = 0; }
    else if (ema < 3 && stride > 1) { stride--; ema = 0; }
    if (u >= 1) {
      playing = following = false;
      mode = 'scrub';
      readout(NMAX, 'Estimate');
      photoTimer = setTimeout(showPhoto, 650);
      return;
    }
    schedule();
  }
  function schedule() {
    if (!raf && playing && visible && !d.hidden) raf = requestAnimationFrame(frame);
  }
  function stopPlay() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function resetSim() {
    k.fill(0); partial.fill(0); inc = []; n = 0; nextStop = 0; viewIdx = -1;
    if (scratch) scratch.fill(0);
    seed = (Date.now() ^ 0x5bd1e995) >>> 0 || 1;
  }
  function play() {
    clearTimeout(photoTimer);
    stopPlay();
    resetSim();
    mode = 'play';
    following = true;
    btnSingle.setAttribute('aria-pressed', 'false');
    playT = 0; lastTs = 0; tick = 0; playing = true;
    showCanvas(true);
    drawEstimate(0);
    readout(0, 'Acquiring');
    syncRange(0);
    schedule();
  }

  /* ------------------------------------------------------ interaction */
  function finishPlayback() {
    if (playing) stopPlay();
    if (following) {
      // close the stop the play head is inside, so k sits exactly on a stop
      if (n === 0) advance(1, true);
      if (nextStop <= STEPS && n !== stops[nextStop - 1]) advance(stops[nextStop], true);
      following = false;
    }
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
    var j = +range.value;
    show(j);
    if (j === STEPS && mode === 'scrub') photoTimer = setTimeout(showPhoto, 900);
  });
  btnSingle.addEventListener('click', function () {
    if (!ready) return;
    var on = btnSingle.getAttribute('aria-pressed') !== 'true';
    var wasPhoto = mode === 'photo';
    finishPlayback();
    var j = wasPhoto || viewIdx < 0 ? STEPS : viewIdx;
    btnSingle.setAttribute('aria-pressed', on ? 'true' : 'false');
    show(j);
    if (!on && j === STEPS) photoTimer = setTimeout(showPhoto, 900);
  });
  btnPhoto.addEventListener('click', function () {
    if (!ready) return;
    finishPlayback();
    showPhoto();
  });
  btnReplay.addEventListener('click', function () { if (ready) play(); });

  /* ------------------------------------------------------------- boot */
  function start() {
    if (!img.naturalWidth) return fail();
    allocate(RM ? 144 : chooseResolution());
    var s0 = Math.min(img.naturalWidth, img.naturalHeight);
    var fallback = function () {
      try { return readMain(img); } catch (err) { return null; }
    };
    if (!window.createImageBitmap) return mount(fallback());
    createImageBitmap(img, (img.naturalWidth - s0) / 2, (img.naturalHeight - s0) / 2, s0, s0,
      { resizeWidth: R, resizeHeight: R, resizeQuality: 'high' })
      .then(function (bmp) {
        return readInWorker(bmp).catch(function () {
          try { return readMain(bmp); } catch (err) { return fallback(); }
        });
      }, fallback)
      .then(function (bytes) { setTimeout(function () { mount(bytes); }, 0); }, function () { mount(null); });
  }
  function mount(bytes) {
    if (!bytes) return fail();
    measure(bytes);
    canvas = d.createElement('canvas');
    canvas.className = 'qx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    win.appendChild(canvas);
    ctx = canvas.getContext('2d');
    sim = d.createElement('canvas');
    sim.width = sim.height = R;
    sctx = sim.getContext('2d');
    frameData = sctx.createImageData(R, R);
    px = frameData.data;
    for (var a = 3; a < px.length; a += 4) px[a] = 255;
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(win);
    else window.addEventListener('resize', resize);
    ui.setAttribute('data-res', R);
    ready = true;
    ui.classList.add('is-ready');

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[es.length - 1].isIntersecting;
        if (visible) { lastTs = 0; schedule(); }
        else if (mode === 'scrub' || mode === 'single') showPhoto(true);   // at rest: the photograph
      }).observe(win);
    }
    d.addEventListener('visibilitychange', function () { if (!d.hidden) { lastTs = 0; schedule(); } });

    if (RM) {
      // Reduced motion: show the photograph; simulate only if the visitor reaches for the controls.
      drawEstimate(0);
      canvas.classList.add('is-off');
      showPhoto(true);
      release();
      var wake = function () { pump(); };
      ['pointerenter', 'focusin', 'touchstart'].forEach(function (ev) { ui.addEventListener(ev, wake, { once: true, passive: true }); });
      return;
    }
    play();
    release();
  }

  function whenImage(cb) {
    if (img.complete) {
      if (!img.naturalWidth) return fail();                 // already failed to load
      return (img.decode ? img.decode() : Promise.resolve()).then(cb, cb);
    }
    img.addEventListener('load', function () { cb(); }, { once: true });
    img.addEventListener('error', fail, { once: true });
  }
  whenImage(start);

  window.qxSensor = {
    canReplay: !RM,
    replay: function () { if (ready && !RM) play(); }
  };
})();
