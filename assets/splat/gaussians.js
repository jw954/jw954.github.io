/*
 * Toy 4D Gaussian scene for the home-page hero.
 * An illustration rendered live in the browser (not research data): ~2,048 anisotropic
 * 3D Gaussians on a knotted, breathing tube, projected with perspective, depth-sorted and
 * alpha-composited back to front. The same Gaussians can be drawn as colour, depth or
 * semantic segments — a nod to FeatureEndo-4DGS.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-splat]');
  if (!root || !window.requestAnimationFrame) return;
  var stage = root.querySelector('.splat-stage');
  var canvas = root.querySelector('canvas');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  var outT = root.querySelector('[data-t]');
  var outCh = root.querySelector('[data-ch]');
  var radios = Array.prototype.slice.call(root.querySelectorAll('[data-channel]'));
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SCATTER = root.getAttribute('data-mode') === 'scatter'; // 404: never settles
  var mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  var hint = root.querySelector('.splat-hint');
  var DEBUG = /splat-debug/.test(location.hash);

  var TAU = Math.PI * 2;
  var NU = 128, NV = 15, NS = NU * NV;     // 1,920 surface Gaussians
  var N = NS + NU;                          // + 128 core Gaussians = 2,048
  var PERIOD = 12;                          // seconds per loop of the 4D sequence
  var ZS = 1.6 / 3;                         // knot depth
  var R0 = 0.205;                           // rest tube radius
  var CAM_D = 4.6;                          // camera distance
  var SPRITE = 32;                          // sprite cell (px) in the atlas (smooth, so 32px upsamples cleanly)
  var CHANNELS = ['rgb', 'depth', 'semantic'];
  var CH_LABEL = { rgb: 'RGB', depth: 'Depth', semantic: 'Semantic' };

  /* ---------- deterministic RNG so every static frame is identical ---------- */
  var seed = 0x2503061;
  function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /* ---------- colour helpers (OKLab for clean, non-muddy blends) ---------- */
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function s2l(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255); }
  function toOk(rgb) {
    var r = s2l(rgb[0]), g = s2l(rgb[1]), b = s2l(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function fromOk(o) {
    var l = o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2];
    var m = o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2];
    var s = o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2];
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            l2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  function mixOk(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var PAL = { peach: '#F2A88B', rose: '#D9667A', plum: '#6B4E9B', teal: '#3FA7A1', sand: '#E8C872' };
  // cyclic colour field along the knot
  var RING = [PAL.rose, PAL.peach, PAL.sand, PAL.teal, PAL.plum].map(function (h) { return toOk(hex(h)); });
  var SEG = [PAL.teal, PAL.rose, PAL.sand, PAL.plum];

  /* ---------- scene: Gaussians on a trefoil tube ---------- */
  var K = new Float32Array(N * 3), NR = new Float32Array(N * 3);
  var A1 = new Float32Array(N * 3), A2 = new Float32Array(N * 3), A3 = new Float32Array(N * 3);
  var UU = new Float32Array(N), HUE = new Float32Array(N), DELAY = new Float32Array(N);
  var START = new Float32Array(N * 3), SEGI = new Uint8Array(N), LUM = new Float32Array(N), CORE = new Uint8Array(N);

  function frameAt(u, out) {
    var su = Math.sin(u), cu = Math.cos(u), s2 = Math.sin(2 * u), c2 = Math.cos(2 * u);
    var dx = (cu + 4 * c2) / 3, dy = (-su + 4 * s2) / 3, dz = -3 * ZS * Math.cos(3 * u);
    var dl = Math.hypot(dx, dy, dz), tx = dx / dl, ty = dy / dl, tz = dz / dl;
    var nx = -tz * tx, ny = -tz * ty, nz = 1 - tz * tz, nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    out.k[0] = (su + 2 * s2) / 3; out.k[1] = (cu - 2 * c2) / 3; out.k[2] = -ZS * Math.sin(3 * u);
    out.t[0] = tx; out.t[1] = ty; out.t[2] = tz; out.n[0] = nx; out.n[1] = ny; out.n[2] = nz;
    out.b[0] = ty * nz - tz * ny; out.b[1] = tz * nx - tx * nz; out.b[2] = tx * ny - ty * nx;
    out.dl = dl;
    return out;
  }
  function surfAt(u, v, f) {
    frameAt(u, f);
    var cv = Math.cos(v), sv = Math.sin(v);
    return [f.k[0] + R0 * (cv * f.n[0] + sv * f.b[0]), f.k[1] + R0 * (cv * f.n[1] + sv * f.b[1]), f.k[2] + R0 * (cv * f.n[2] + sv * f.b[2])];
  }

  function build() {
    var i = 0;
    var tmp = { k: [0, 0, 0], t: [0, 0, 0], n: [0, 0, 0], b: [0, 0, 0], dl: 0 };
    for (var iu = 0; iu < NU; iu++) {
      for (var iv = 0; iv < NV; iv++, i++) {
        var u = TAU * (iu + 0.5 + (rnd() - 0.5) * 0.3) / NU;
        var v = TAU * (iv + 0.5 * (iu & 1) + (rnd() - 0.5) * 0.3) / NV;
        var su = Math.sin(u), cu = Math.cos(u), s2 = Math.sin(2 * u), c2 = Math.cos(2 * u);
        var kx = (su + 2 * s2) / 3, ky = (cu - 2 * c2) / 3, kz = -ZS * Math.sin(3 * u);
        var dx = (cu + 4 * c2) / 3, dy = (-su + 4 * s2) / 3, dz = -3 * ZS * Math.cos(3 * u);
        var dl = Math.hypot(dx, dy, dz);
        var tx = dx / dl, ty = dy / dl, tz = dz / dl;
        // N: world-up projected off the tangent, B = T x N
        var nx = -tz * tx, ny = -tz * ty, nz = 1 - tz * tz, nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        var bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        var cv = Math.cos(v), sv = Math.sin(v);
        var ox = cv * nx + sv * bx, oy = cv * ny + sv * by, oz = cv * nz + sv * bz;      // surface normal
        var wx = -sv * nx + cv * bx, wy = -sv * ny + cv * by, wz = -sv * nz + cv * bz;   // around the tube
        // random in-plane rotation of the elliptical footprint
        var rot = (rnd() - 0.5) * 0.8, cr = Math.cos(rot), sr = Math.sin(rot);
        var e1x = cr * tx + sr * wx, e1y = cr * ty + sr * wy, e1z = cr * tz + sr * wz;
        var e2x = -sr * tx + cr * wx, e2y = -sr * ty + cr * wy, e2z = -sr * tz + cr * wz;
        // true surface stretch along the tube (outer side of a bend is longer)
        var pa = surfAt(u - 0.01, v, tmp), pb = surfAt(u + 0.01, v, tmp);
        var metric = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]) / 0.02;
        var jit = 0.9 + rnd() * 0.2;
        var sAlong = 0.66 * metric * TAU / NU * jit * (0.94 + rnd() * 0.14);
        var sAround = 0.64 * TAU * R0 / NV * jit;
        var sNorm = 0.16 * sAround;
        var o = i * 3;
        K[o] = kx; K[o + 1] = ky; K[o + 2] = kz;
        NR[o] = ox; NR[o + 1] = oy; NR[o + 2] = oz;
        A1[o] = e1x * sAlong; A1[o + 1] = e1y * sAlong; A1[o + 2] = e1z * sAlong;
        A2[o] = e2x * sAround; A2[o + 1] = e2y * sAround; A2[o + 2] = e2z * sAround;
        A3[o] = ox * sNorm; A3[o + 1] = oy * sNorm; A3[o + 2] = oz * sNorm;
        UU[i] = u;
        var h = u / TAU + 0.05 * Math.sin(2 * v + 3 * u) + (rnd() - 0.5) * 0.025;
        HUE[i] = h - Math.floor(h);
        var g = u / TAU + 0.02 * Math.sin(2 * v) + 0.06;
        g -= Math.floor(g);
        SEGI[i] = Math.min(3, Math.floor(g * 4));
        LUM[i] = (rnd() - 0.5) * 0.03;
        DELAY[i] = 0.75 * ((u / TAU + 0.12 * rnd()) % 1);
        // starting cloud for the "reconstruction" intro
        var a = rnd() * TAU, z = rnd() * 2 - 1, rr = 0.55 + Math.cbrt(rnd()) * 0.9, q = Math.sqrt(1 - z * z);
        START[o] = kx * 0.3 + Math.cos(a) * q * rr;
        START[o + 1] = ky * 0.3 + Math.sin(a) * q * rr;
        START[o + 2] = kz * 0.3 + z * rr;
      }
    }
    // core: elongated Gaussians along the centreline that back the surface layer
    for (var ic = 0; ic < NU; ic++, i++) {
      var uc = TAU * (ic + 0.5) / NU;
      frameAt(uc, tmp);
      var oc = i * 3, sa = 0.75 * tmp.dl * TAU / NU, sc = 0.42 * R0;
      K[oc] = tmp.k[0]; K[oc + 1] = tmp.k[1]; K[oc + 2] = tmp.k[2];
      NR[oc] = 0; NR[oc + 1] = 0; NR[oc + 2] = 0;
      A1[oc] = tmp.t[0] * sa; A1[oc + 1] = tmp.t[1] * sa; A1[oc + 2] = tmp.t[2] * sa;
      A2[oc] = tmp.n[0] * sc; A2[oc + 1] = tmp.n[1] * sc; A2[oc + 2] = tmp.n[2] * sc;
      A3[oc] = tmp.b[0] * sc; A3[oc + 1] = tmp.b[1] * sc; A3[oc + 2] = tmp.b[2] * sc;
      UU[i] = uc; CORE[i] = 1;
      var hc = uc / TAU; HUE[i] = hc - Math.floor(hc);
      var gc = uc / TAU + 0.06; gc -= Math.floor(gc);
      SEGI[i] = Math.min(3, Math.floor(gc * 4));
      DELAY[i] = 0.75 * ((uc / TAU + 0.12 * rnd()) % 1);
      var ac = rnd() * TAU, zc = rnd() * 2 - 1, rc = 0.4 + Math.cbrt(rnd()) * 0.7, qc = Math.sqrt(1 - zc * zc);
      START[oc] = tmp.k[0] * 0.3 + Math.cos(ac) * qc * rc;
      START[oc + 1] = tmp.k[1] * 0.3 + Math.sin(ac) * qc * rc;
      START[oc + 2] = tmp.k[2] * 0.3 + zc * rc;
    }
  }

  /* ---------- sprite atlas: one Gaussian footprint, tinted per colour ---------- */
  var atlas = document.createElement('canvas');
  var ATLAS_COLS = 32, RGB_ROWS = 12, DEPTH_ROW = 12, SEM_ROW = 13;
  var SHADE_MIN = 0.6, SHADE_MAX = 1.3;
  atlas.width = ATLAS_COLS * SPRITE;
  atlas.height = (RGB_ROWS + 2) * SPRITE;
  var actx = atlas.getContext('2d');
  var MASK = null, atlasTheme = null;
  function buildMask() {
    var m = new Uint8Array(SPRITE * SPRITE), c = SPRITE / 2, rad = SPRITE / 2 - 0.5, e = Math.exp(-3.125);
    for (var y = 0; y < SPRITE; y++) for (var x = 0; x < SPRITE; x++) {
      var dx = (x + 0.5 - c) / rad, dy = (y + 0.5 - c) / rad, r2 = dx * dx + dy * dy;
      m[y * SPRITE + x] = r2 >= 1 ? 0 : Math.round(255 * (Math.exp(-3.125 * r2) - e) / (1 - e));
    }
    return m;
  }

  function theme() { return document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function buildAtlas() {
    var th = theme();
    if (th === atlasTheme) return false;   // only rebuild when the theme actually changed
    atlasTheme = th;
    if (!MASK) MASK = buildMask();
    var dark = th === 'dark';
    var img = actx.createImageData(atlas.width, atlas.height);
    var px = new Uint32Array(img.data.buffer), AW = atlas.width;   // little-endian RGBA
    function cell(col, row, rgb) {
      var x0 = col * SPRITE, y0 = row * SPRITE, bits = rgb[0] | (rgb[1] << 8) | (rgb[2] << 16);
      for (var y = 0; y < SPRITE; y++) {
        var p = (y0 + y) * AW + x0, mrow = y * SPRITE;
        for (var x = 0; x < SPRITE; x++) px[p + x] = (MASK[mrow + x] << 24) | bits;
      }
    }
    // RGB: 32 positions around the colour ring x 8 shading levels
    for (var c = 0; c < ATLAS_COLS; c++) {
      var f = c / ATLAS_COLS * RING.length, k = Math.floor(f), t = f - k;
      var base = mixOk(RING[k % RING.length], RING[(k + 1) % RING.length], t * t * (3 - 2 * t));
      for (var r = 0; r < RGB_ROWS; r++) {
        var shade = SHADE_MIN + (SHADE_MAX - SHADE_MIN) * r / (RGB_ROWS - 1);
        var lit = Math.min(shade, 1), spec = Math.max(0, shade - 1) / (SHADE_MAX - 1);
        var L = base[0] * (dark ? 0.08 + lit * 0.97 : lit);
        L = L + (0.97 - L) * spec * 0.62;
        var chroma = 1 - spec * 0.55;
        cell(c, r, fromOk([L, base[1] * chroma, base[2] * chroma]));
      }
    }
    // Depth: cool monochrome ramp, near -> far
    var near = toOk(hex(dark ? '#F4F6FB' : '#18203A')), far = toOk(hex(dark ? '#2A3142' : '#CDD3E2'));
    for (var di = 0; di < ATLAS_COLS; di++) cell(di, DEPTH_ROW, fromOk(mixOk(near, far, di / (ATLAS_COLS - 1))));
    // Semantic: four flat segment colours
    for (var si = 0; si < SEG.length; si++) cell(si, SEM_ROW, hex(SEG[si]));
    actx.putImageData(img, 0, 0);
    return true;
  }

  /* ---------- per-frame buffers ---------- */
  var PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N);
  var M11 = new Float32Array(N), M21 = new Float32Array(N), M22 = new Float32Array(N);
  var ALPHA = new Float32Array(N), SX = new Uint16Array(N), SXD = new Uint16Array(N), SXS = new Uint16Array(N);
  var SY = new Uint16Array(N), SYD = new Uint16Array(N), SYS = new Uint16Array(N);
  var KEY = new Uint16Array(N), ORDER = new Uint16Array(N), BUCKETS = 1024;
  var COUNT = new Uint32Array(BUCKETS);

  var W = 0, H = 0, dpr = 1;
  var channel = 'rgb', prevChannel = 'rgb', sweepT = 1; // sweep progress 0..1
  var clock = 0.42 * PERIOD;                // scene time (s); starts at t = 0.42
  var intro = document.documentElement.classList.contains('first-visit') && !mqReduce.matches ? 0 : 9;
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, s: 0, v: 0, target: 0, active: false };
  var lastTxt = '';
  var stats = { frames: 0, avgMs: 0, maxMs: 0, drawn: 0, press: 0 };
  if (DEBUG) window.__splatStats = stats;   // opt-in via #splat-debug only

  function smooth(e0, e1, x) { x = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return x * x * (3 - 2 * x); }

  function render(now) {
    var t0 = performance.now();
    var tn = (clock / PERIOD) % 1;
    var ph = TAU * tn;
    var spin = 0.085 * clock + 0.6;
    var tilt = 0.52 + 0.08 * Math.sin(0.21 * clock);
    var yaw = 0.24 * Math.sin(0.13 * clock + 0.4);
    // M = Ry(yaw) * Rx(tilt) * Rz(spin)
    var cz = Math.cos(spin), sz = Math.sin(spin), cx = Math.cos(tilt), sx = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
    var r00 = cz, r01 = -sz, r02 = 0;
    var r10 = cx * sz, r11 = cx * cz, r12 = -sx;
    var r20 = sx * sz, r21 = sx * cz, r22 = cx;
    var m00 = cy * r00 + sy * r20, m01 = cy * r01 + sy * r21, m02 = cy * r02 + sy * r22;
    var m10 = r10, m11 = r11, m12 = r12;
    var m20 = -sy * r00 + cy * r20, m21 = -sy * r01 + cy * r21, m22 = -sy * r02 + cy * r22;

    var minWH = Math.min(W, H);
    var F = 0.385 * minWH * CAM_D / 1.33;
    var ccx = W * 0.5, ccy = H * 0.5;
    var LX = -0.42, LY = 0.62, LZ = -0.66; // towards the light (view space, y up)
    var rho = 0.16 * minWH, amp = 0.075 * minWH, inv2r = 1 / (2 * rho * rho);
    var ps = ptr.s, pxp = ptr.x, pyp = ptr.y;
    var dil = 0.3 * dpr;
    var dark = theme() === 'dark';
    var sweepX = sweepT < 1 ? (sweepT * sweepT * (3 - 2 * sweepT)) * (W + 40 * dpr) - 20 * dpr : Infinity;
    var m = 0;

    for (var i = 0; i < N; i++) {
      if (SCATTER && i % 3) continue;   // a sparser, airier cloud on the 404 page
      var o = i * 3, u = UU[i];
      var br = 1 + 0.055 * Math.sin(3 * u - ph);
      var rr = R0 * (1 + 0.19 * Math.sin(6 * u - 3 * ph) + 0.07 * Math.sin(11 * u + ph + 1.3));
      var ax = K[o] * br, ay = K[o + 1] * br, az = K[o + 2] * br + 0.045 * Math.sin(2 * u + ph);
      var nx = NR[o], ny = NR[o + 1], nz = NR[o + 2];
      var x = ax + rr * nx, y = ay + rr * ny, z = az + rr * nz;
      var core = CORE[i] === 1;
      var g1 = 1, g2 = rr / R0, g3 = core ? g2 : 1, al = 1;
      var ee = -1;
      if (SCATTER) {
        ee = 0.14 + 0.12 * Math.sin(ph + 2 * u + 6 * DELAY[i]);
        al = 0.62;
      } else if (intro < 2.2) {
        var e = Math.max(0, Math.min(1, (intro - DELAY[i]) / 1.05));
        ee = 1 - (1 - e) * (1 - e) * (1 - e);
        al = Math.min(1, e * 3 + 0.12);
      }
      if (ee >= 0) {
        var sk = SCATTER ? 0.74 : 1;
        x = START[o] * sk + (x - START[o] * sk) * ee;
        y = START[o + 1] * sk + (y - START[o + 1] * sk) * ee;
        z = START[o + 2] * sk + (z - START[o + 2] * sk) * ee;
        var grow = SCATTER ? 1.15 : 1.9 - 0.9 * ee; // start larger, blurrier, then refine
        g1 *= grow; g2 *= grow; g3 *= 1 + 4 * (1 - ee);
      }
      // rotate into view space
      var vx = m00 * x + m01 * y + m02 * z;
      var vy = m10 * x + m11 * y + m12 * z;
      var vz = m20 * x + m21 * y + m22 * z + CAM_D;
      var wnx = m00 * nx + m01 * ny + m02 * nz, wny = m10 * nx + m11 * ny + m12 * nz, wnz = m20 * nx + m21 * ny + m22 * nz;
      var il = 1 / Math.sqrt(vx * vx + vy * vy + vz * vz);
      var facing = core ? 1 : -(wnx * vx + wny * vy + wnz * vz) * il;
      if (facing < -0.22 && ee < 0) continue;
      var iz = 1 / vz, fz = F * iz;
      var sxp = ccx + fz * vx, syp = ccy - fz * vy;
      // covariance: sum over the three scaled axes of (J a)(J a)^T
      var c00 = dil, c01 = 0, c11 = dil, ja, jb, bx, by, bz;
      bx = (m00 * A1[o] + m01 * A1[o + 1] + m02 * A1[o + 2]) * g1;
      by = (m10 * A1[o] + m11 * A1[o + 1] + m12 * A1[o + 2]) * g1;
      bz = (m20 * A1[o] + m21 * A1[o + 1] + m22 * A1[o + 2]) * g1;
      ja = fz * (bx - vx * iz * bz); jb = -fz * (by - vy * iz * bz);
      c00 += ja * ja; c01 += ja * jb; c11 += jb * jb;
      bx = (m00 * A2[o] + m01 * A2[o + 1] + m02 * A2[o + 2]) * g2;
      by = (m10 * A2[o] + m11 * A2[o + 1] + m12 * A2[o + 2]) * g2;
      bz = (m20 * A2[o] + m21 * A2[o + 1] + m22 * A2[o + 2]) * g2;
      ja = fz * (bx - vx * iz * bz); jb = -fz * (by - vy * iz * bz);
      c00 += ja * ja; c01 += ja * jb; c11 += jb * jb;
      bx = (m00 * A3[o] + m01 * A3[o + 1] + m02 * A3[o + 2]) * g3;
      by = (m10 * A3[o] + m11 * A3[o + 1] + m12 * A3[o + 2]) * g3;
      bz = (m20 * A3[o] + m21 * A3[o + 1] + m22 * A3[o + 2]) * g3;
      ja = fz * (bx - vx * iz * bz); jb = -fz * (by - vy * iz * bz);
      c00 += ja * ja; c01 += ja * jb; c11 += jb * jb;

      // pointer: a soft local press that springs back
      var press = 0, stretch = 0;
      if (ps > 0.001 || ps < -0.001) {
        var ddx = sxp - pxp, ddy = syp - pyp, w = Math.exp(-(ddx * ddx + ddy * ddy) * inv2r);
        if (w > 0.002) {
          var push = amp * ps * w / rho;
          sxp += ddx * push; syp += ddy * push;
          press = ps * w;
          stretch = push * (1 - (ddx * ddx + ddy * ddy) / (rho * rho) * 0.5);
        }
      }

      // Cholesky factor of the 2D covariance, scaled to 2.5 sigma (sprite edge);
      // a press stretches the surface, so footprints grow with it and no holes open
      var l11 = Math.sqrt(c00), l21 = c01 / l11, l22 = Math.sqrt(Math.max(c11 - l21 * l21, 0.01));
      var ks = 2.5 * (1 + 0.85 * Math.max(0, stretch));
      PX[m] = sxp; PY[m] = syp;
      M11[m] = ks * l11; M21[m] = ks * l21; M22[m] = ks * l22;

      // channel tints
      var ndl = wnx * LX + wny * LY + wnz * LZ, lam = Math.max(0, ndl);
      // half vector between light and the eye for a soft, view-dependent sheen
      var hx = LX - vx * il, hy = LY - vy * il, hz = LZ - vz * il, hl = 1 / Math.sqrt(hx * hx + hy * hy + hz * hz);
      var ndh = Math.max(0, (wnx * hx + wny * hy + wnz * hz) * hl);
      var spec = ndh * ndh; spec *= spec; spec *= spec; spec *= spec; // ^16
      var shade = core ? 0.76 : ((dark ? 0.6 : 0.67) + (dark ? 0.42 : 0.37) * lam) * (0.88 + 0.12 * Math.max(0, facing)) * (1 - 0.14 * press) + 0.3 * spec + LUM[i];
      if (dark) shade += 0.03;
      var srow = Math.round((shade - SHADE_MIN) / (SHADE_MAX - SHADE_MIN) * (RGB_ROWS - 1));
      SX[m] = Math.floor(HUE[i] * ATLAS_COLS) % ATLAS_COLS * SPRITE;
      SY[m] = Math.max(0, Math.min(RGB_ROWS - 1, srow)) * SPRITE;
      var dn = (vz + 0.28 * press - (CAM_D - 1.15)) / 2.3;
      SXD[m] = Math.max(0, Math.min(ATLAS_COLS - 1, Math.floor(dn * ATLAS_COLS))) * SPRITE;
      SYD[m] = DEPTH_ROW * SPRITE;
      SXS[m] = SEGI[i] * SPRITE; SYS[m] = SEM_ROW * SPRITE;
      var edge = 0.55 + 0.45 * smooth(-0.22, 0.35, facing);
      ALPHA[m] = al * edge;
      PZ[m] = vz;
      var k = Math.floor((vz - (CAM_D - 1.7)) / 3.4 * (BUCKETS - 1));
      KEY[m] = k < 0 ? 0 : k >= BUCKETS ? BUCKETS - 1 : k;
      m++;
    }

    // counting sort, far -> near
    COUNT.fill(0);
    for (var j = 0; j < m; j++) COUNT[KEY[j]]++;
    for (var b = BUCKETS - 1, pos = 0; b >= 0; b--) { var cnt = COUNT[b]; COUNT[b] = pos; pos += cnt; }
    for (j = 0; j < m; j++) ORDER[COUNT[KEY[j]]++] = j;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var aBase = { rgb: 0.94, depth: 0.95, semantic: 0.97 };
    for (var q = 0; q < m; q++) {
      var n = ORDER[q];
      var ch = PX[n] < sweepX ? channel : prevChannel;
      var sxa, sya;
      if (ch === 'rgb') { sxa = SX[n]; sya = SY[n]; }
      else if (ch === 'depth') { sxa = SXD[n]; sya = SYD[n]; }
      else { sxa = SXS[n]; sya = SYS[n]; }
      ctx.globalAlpha = ALPHA[n] * aBase[ch];
      ctx.setTransform(M11[n], M21[n], 0, M22[n], PX[n], PY[n]);
      ctx.drawImage(atlas, sxa, sya, SPRITE, SPRITE, -1, -1, 2, 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (sweepT < 1 && sweepX > 0 && sweepX < W) {
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      var acc = dark ? '143,162,255' : '35,64,200';
      grad.addColorStop(0, 'rgba(' + acc + ',0)');
      grad.addColorStop(0.5, 'rgba(' + acc + ',0.55)');
      grad.addColorStop(1, 'rgba(' + acc + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(Math.round(sweepX), 0, Math.max(1, Math.round(dpr)), H);
    }

    var txt = (Math.floor(tn * 100) / 100).toFixed(2);
    if (txt !== lastTxt && outT) { outT.textContent = txt; lastTxt = txt; }
    var dt = performance.now() - t0;
    lastCost = dt;
    stats.frames++; stats.drawn = m;
    stats.avgMs = stats.frames === 1 ? dt : stats.avgMs * 0.95 + dt * 0.05;
    if (stats.frames > 30) stats.maxMs = Math.max(stats.maxMs, dt);
  }

  /* ---------- loop, visibility, resize ---------- */
  var running = false, raf = 0, last = 0, onScreen = true, booted = false;
  // Adaptive quality: where Canvas2D runs in software a frame can cost 15-60 ms. Every ~20
  // frames, if the render averages > 10 ms, drop the backing-store scale (x0.7, floor 0.5).
  // At the floor: > 10 ms halves the frame rate, > 16 ms settles on a static frame.
  // The first-visit intro (heavier by design) is abandoned if its frames are slow.
  var scale = 1, degraded = false, lastCost = 0, govN = 0, govSum = 0, govSkip = 6;
  var stride = 1, tick = 0, introSlow = 0, seenDpr = window.devicePixelRatio || 1;
  function wantRun() { return booted && onScreen && !document.hidden && !mqReduce.matches && !degraded; }
  function govern() {
    if (intro < 2.2) {                               // heavier by design: give up on it if slow
      if (lastCost > 34 && ++introSlow >= 3) intro = 9;
      return;
    }
    if (sweepT < 1) return;                          // channel wipes are short; don't judge them
    if (govSkip > 0) { govSkip--; return; }
    govN++; govSum += lastCost;
    if (govN < 20) return;
    var avg = govSum / govN;
    govN = 0; govSum = 0;
    if (avg > 10 && scale > 0.5) { scale = Math.max(0.5, Math.round(scale * 70) / 100); govSkip = 4; resize(); }
    else if (avg > 16) { degraded = true; stats.degraded = true; updateHint(); sync(); }
    else if (avg > 10) stride = 2;                   // ~30 fps leaves the main thread headroom
    stats.scale = scale; stats.stride = stride; stats.windowMs = avg;
  }
  function frame(now) {
    raf = 0;
    if (!running) return;
    if (stride > 1 && (++tick % stride)) { raf = requestAnimationFrame(frame); return; }
    var d = window.devicePixelRatio || 1;            // zoom / screen change without a CSS resize
    if (d !== seenDpr) { seenDpr = d; resize(); }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    clock += dt;
    if (intro < 9) intro += dt;
    if (sweepT < 1) sweepT = Math.min(1, sweepT + dt / 0.55);
    // pointer springs: position follows smoothly, strength is slightly under-damped
    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 14);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 14);
    ptr.v += ((ptr.target - ptr.s) * 85 - ptr.v * 8.5) * dt;
    ptr.s += ptr.v * dt;
    stats.press = ptr.s;
    render(now);
    govern();
    if (running) raf = requestAnimationFrame(frame);
  }
  function sync() {
    var should = wantRun();
    if (should && !running) { running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    if (!should && booted) {
      if (mqReduce.matches) { clock = 0.42 * PERIOD; intro = 9; sweepT = 1; ptr.s = 0; ptr.v = 0; }
      if (degraded) { intro = 9; sweepT = 1; ptr.s = 0; ptr.v = 0; ptr.target = 0; }
      if (W && H) render(performance.now());
    }
    updateHint();
  }

  function resize() {
    if (!booted) return;
    seenDpr = window.devicePixelRatio || 1;
    var r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (w !== W || h !== H) {
      W = canvas.width = w; H = canvas.height = h;
      if (!running) render(performance.now());
    }
  }

  function setChannel(next, focus) {
    if (CHANNELS.indexOf(next) < 0) return;
    radios.forEach(function (b) {
      var on = b.getAttribute('data-channel') === next;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    if (next === channel) return;
    prevChannel = channel; channel = next;
    sweepT = running ? 0 : 1;
    if (outCh) outCh.textContent = CH_LABEL[next];
    root.setAttribute('data-channel', next);
    if (!running && booted && W && H) render(performance.now());
  }
  radios.forEach(function (b, idx) {
    b.addEventListener('click', function () { setChannel(b.getAttribute('data-channel')); });
    b.addEventListener('keydown', function (e) {
      var n = radios.length, to;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (idx + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (idx - 1 + n) % n;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = n - 1;
      else return;
      e.preventDefault();
      setChannel(radios[to].getAttribute('data-channel'), true);
    });
  });

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
  }
  stage.addEventListener('pointermove', function (e) {
    if (!running) return;
    var p = local(e);
    ptr.tx = p[0]; ptr.ty = p[1];
    if (!ptr.active) { ptr.x = p[0]; ptr.y = p[1]; ptr.active = true; }
    ptr.target = 1;
  });
  stage.addEventListener('pointerleave', function () { ptr.target = 0; ptr.active = false; });
  stage.addEventListener('pointercancel', function () { ptr.target = 0; ptr.active = false; });

  function updateHint() {
    if (hint) hint.hidden = !(mqHover.matches && !mqReduce.matches && !degraded && !SCATTER);
  }
  function listen(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
  // a DPR change (zoom, moving to another screen) may not change the CSS size, so watch it directly
  function watchResolution() {
    var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    function changed() {
      if (mq.removeEventListener) mq.removeEventListener('change', changed); else if (mq.removeListener) mq.removeListener(changed);
      resize(); watchResolution();
    }
    listen(mq, changed);
  }

  // Heavy work (scene + sprite atlas) waits until after the first paint.
  var themeTimer = 0;
  function boot() {
    if (booted) return;
    booted = true;
    build();
    buildAtlas();
    resize();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting; sync();
      }, { rootMargin: '80px' }).observe(root);
    }
    document.addEventListener('visibilitychange', sync);
    listen(mqReduce, sync);
    listen(mqHover, updateHint);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    watchResolution();
    // debounced: the original script flips the theme during load; rebuild once, only on a real change
    new MutationObserver(function () {
      clearTimeout(themeTimer);
      themeTimer = setTimeout(function () { if (buildAtlas() && !running) render(performance.now()); }, 0);
    }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    root.classList.add('is-live');
    if (outCh) outCh.textContent = CH_LABEL[channel];
    sync();
  }
  updateHint();
  requestAnimationFrame(function () { setTimeout(boot, 0); });
})();
