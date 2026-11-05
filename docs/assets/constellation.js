/* Background: a ram (Aries) plotted pixel by pixel, with the five stars of the constellation joined by lines.
 * Pure canvas, no dependencies. Redraws on theme change, pauses when the tab is hidden and shows the finished
 * picture at once when the visitor prefers reduced motion. */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- geometry (design space 1000 x 800) */
  var HORN = { cx: 430, cy: 320, r0: 175, r1: 62, turn: 2 * Math.PI * 1.22, taper: 46 };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function bez(p0, p1, p2, p3, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
    return out;
  }
  function arc(cx, cy, r, a0, a1, n) {
    var out = [];
    for (var i = 0; i <= n; i++) { var a = lerp(a0, a1, i / n); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function hornPoint(t, inner) {                       // t in [0,1] along the horn; inner = 1 for the inner edge
    var phi = HORN.turn * t;
    var r = lerp(HORN.r0, HORN.r1, t) - (inner ? HORN.taper * (1 - t) : 0);
    return [HORN.cx + r * Math.cos(phi), HORN.cy - r * Math.sin(phi)];
  }
  function hornLine(inner, n) { var out = []; for (var i = 0; i <= n; i++) out.push(hornPoint(i / n, inner)); return out; }

  function buildStrokes() {
    var s = [];
    s.push(hornLine(0, 70));                                                       // horn, outer edge
    s.push(hornLine(1, 70));                                                       // horn, inner edge
    [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88].forEach(function (t) {                // growth rings
      s.push([hornPoint(t, 0), hornPoint(t, 1)]);
    });
    s.push(bez([606, 324], [656, 352], [702, 424], [722, 500], 28));               // forehead and nose bridge
    s.push(bez([722, 500], [732, 540], [752, 570], [770, 592], 16));
    s.push(bez([770, 592], [784, 612], [772, 632], [746, 640], 12));               // muzzle
    s.push(bez([746, 640], [722, 650], [690, 648], [668, 666], 14));               // mouth and chin
    s.push(bez([668, 666], [640, 692], [590, 702], [540, 672], 16));               // jaw
    s.push(bez([540, 672], [520, 704], [504, 752], [498, 800], 16));               // throat
    s.push(bez([430, 432], [424, 490], [416, 570], [402, 650], 24));               // back of the neck
    s.push(bez([402, 650], [394, 700], [410, 750], [404, 800], 16));
    for (var i = 0; i < 7; i++) {                                                  // wool along the neck
      var t = i / 6, x = lerp(430, 398, t), y = lerp(462, 650, t);
      s.push(arc(x - 14, y, 24, -Math.PI * 0.55, Math.PI * 0.55, 10));
    }
    s.push(bez([566, 424], [540, 434], [512, 448], [488, 464], 10));               // ear
    s.push(bez([488, 464], [520, 480], [560, 468], [580, 438], 10));
    s.push(bez([598, 420], [624, 402], [652, 406], [668, 424], 10));               // brow
    s.push(arc(630, 436, 15, 0, Math.PI * 2, 22));                                 // eye
    s.push(arc(630, 436, 5, 0, Math.PI * 2, 8));
    s.push(arc(748, 604, 7, 0, Math.PI * 2, 10));                                  // nostril
    s.push(bez([700, 520], [716, 540], [724, 568], [726, 586], 8));                // cheek line
    return s;
  }

  /* Aries: 41 Ari - 39 Ari - Hamal - Sheratan - Mesarthim, laid along the horn */
  var STARS = [
    { name: "Mesarthim", t: 0.0, size: 3.2 },
    { name: "Sheratan", t: 0.27, size: 3.6 },
    { name: "Hamal", t: 0.53, size: 4.4 },
    { name: "39 Arietis", t: 0.78, size: 3.0 },
    { name: "41 Arietis", t: 1.0, size: 3.0 }
  ];

  function resample(strokes, step) {                       // points every `step` units along each stroke, in drawing order
    var dots = [], order = 0;
    strokes.forEach(function (pts) {
      var carry = 0;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (var d = carry; d < len; d += step) {
          var k = d / (len || 1);
          dots.push({ x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), o: order++ });
        }
        carry = (carry + Math.ceil((len - carry) / step) * step) - len;
        if (carry < 0) carry = 0;
      }
    });
    return dots;
  }

  /* ---------------------------------------------------------------- state */
  var canvas = document.createElement("canvas");
  canvas.id = "sky";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);
  var ctx = canvas.getContext("2d");

  var dots = resample(buildStrokes(), 5.2);
  var starPos = STARS.map(function (s) { var p = hornPoint(s.t, 0); return { x: p[0], y: p[1], size: s.size, name: s.name }; });
  var field = [];                                            // tiny background stars
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  for (var i = 0; i < 90; i++) field.push({ x: rnd(), y: rnd(), r: rnd() < .15 ? 1.6 : 1, ph: rnd() * 6.28, delay: rnd() * 0.5 });

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var soft = document.body.dataset.sky === "soft";
  var W = 0, H = 0, dpr = 1, scale = 1, ox = 0, oy = 0, px = 0, py = 0, start = 0, raf = 0, hidden = false;

  var DRAW_MS = 5200, LINES_MS = 3200, STAR_START = 3800;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    var narrow = W < 820;
    scale = Math.min((H * (narrow ? 0.7 : 0.86)) / 660, (W * (narrow ? 0.95 : 0.46)) / 540);
    ox = (narrow ? W * 0.5 : W * 0.77) - 522 * scale;       // figure spans about x 255..790, y 145..800 in design space
    oy = H * (narrow ? 0.55 : 0.54) - 472 * scale;
  }

  function palette() {
    var dark = document.documentElement.dataset.theme === "dark";
    var k = W < 820 ? 0.5 : 1;                                // keep text readable on small screens
    var c = dark
      ? { dot: "200,214,255", star: "255,255,255", line: "170,205,255", glow: "120,170,255",
          alpha: soft ? 0.34 : 0.62 }
      : { dot: "15,23,42", star: "36,89,214", line: "36,89,214", glow: "36,89,214",
          alpha: soft ? 0.2 : 0.4 };
    c.alpha *= k;
    return c;
  }

  var PIX = 3;                                               // size of one "pixel" in CSS pixels
  function snap(v) { return Math.round(v / PIX) * PIX; }

  function frame(now) {
    var t = reduce ? 1e9 : now - start;
    var c = palette();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = c.alpha;

    /* background stars */
    field.forEach(function (f) {
      var a = Math.min(1, Math.max(0, (t - f.delay * 3000) / 1200));
      if (!a) return;
      var tw = reduce ? 1 : 0.6 + 0.4 * Math.sin(now / 900 + f.ph);
      ctx.fillStyle = "rgba(" + c.dot + "," + (0.55 * a * tw) + ")";
      ctx.fillRect(snap(f.x * W), snap(f.y * H), f.r, f.r);
    });

    /* the ram, plotted dot by dot */
    var shown = Math.min(dots.length, Math.floor(dots.length * Math.min(1, t / DRAW_MS)));
    var jx = px * 10, jy = py * 8;
    for (var i = 0; i < shown; i++) {
      var d = dots[i];
      var fresh = shown < dots.length && shown - i < 14;     // the pen tip glows
      var shimmer = reduce ? 1 : 0.7 + 0.3 * Math.sin(now / 700 + d.o * 0.37);
      ctx.fillStyle = "rgba(" + c.dot + "," + (fresh ? 1 : 0.8 * shimmer) + ")";
      ctx.fillRect(snap(ox + d.x * scale + jx), snap(oy + d.y * scale + jy), PIX - 1, PIX - 1);
    }

    /* constellation lines, drawn one segment after the other */
    var lp = Math.min(1, Math.max(0, (t - DRAW_MS * 0.55) / LINES_MS)) * (starPos.length - 1);
    if (lp > 0) {
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = "rgba(" + c.line + ",0.85)";
      ctx.beginPath();
      for (var s = 0; s < starPos.length - 1 && s < lp; s++) {
        var a = starPos[s], b = starPos[s + 1], k = Math.min(1, lp - s);
        ctx.moveTo(ox + a.x * scale + jx, oy + a.y * scale + jy);
        ctx.lineTo(ox + (a.x + (b.x - a.x) * k) * scale + jx, oy + (a.y + (b.y - a.y) * k) * scale + jy);
      }
      ctx.stroke();
    }

    /* the stars */
    starPos.forEach(function (st, n) {
      var a = Math.min(1, Math.max(0, (t - STAR_START - n * 220) / 700));
      if (!a) return;
      var tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(now / 520 + n * 1.7);
      var x = ox + st.x * scale + jx, y = oy + st.y * scale + jy, r = st.size * (scale > 0.9 ? 1.2 : 1);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      g.addColorStop(0, "rgba(" + c.glow + ",0.55)");
      g.addColorStop(1, "rgba(" + c.glow + ",0)");
      ctx.globalAlpha = c.alpha * a * tw;
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      ctx.globalAlpha = Math.min(1, c.alpha * 1.6) * a;
      ctx.fillStyle = "rgba(" + c.star + ",1)";
      ctx.fillRect(snap(x) - PIX, snap(y) - PIX, PIX * 2, PIX * 2);
      ctx.fillRect(snap(x) - PIX * 2, snap(y), PIX * 4, PIX - 1);
      ctx.fillRect(snap(x), snap(y) - PIX * 2, PIX - 1, PIX * 4);
      ctx.globalAlpha = c.alpha;
    });
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    frame(now);
    if (!reduce && !hidden) raf = requestAnimationFrame(loop);
  }
  function run() {
    cancelAnimationFrame(raf);
    layout();
    start = performance.now();
    if (reduce) frame(start); else raf = requestAnimationFrame(loop);
  }

  var resizeT;
  addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(function () { layout(); if (reduce) frame(performance.now()); }, 120); });
  document.addEventListener("visibilitychange", function () {
    hidden = document.hidden;
    if (!hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
  });
  new MutationObserver(function () { if (reduce) frame(performance.now()); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (!reduce) addEventListener("pointermove", function (e) {
    px = (e.clientX / innerWidth - 0.5); py = (e.clientY / innerHeight - 0.5);
  }, { passive: true });

  run();
})();
