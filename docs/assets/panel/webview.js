/* ASP Studio visualizer (webview). Receives program state from the extension host and renders
 * the Animator, Answer Sets, Graph and Console views. No dependencies. */
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const EMBED = !!window.__ASP_EMBED__;               // notebook output: no editor, no solver controls
  const NS = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const ICON = {
    play: '<svg class="i" viewBox="0 0 16 16"><path d="M4.5 2.6v10.8L13 8z"/></svg>',
    pause: '<svg class="i" viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zm5 0h3v11H9z"/></svg>',
    next: '<svg class="i" viewBox="0 0 16 16"><path d="M3 2.6v10.8L10.5 8zM11.5 2.5h2v11h-2z"/></svg>',
    back: '<svg class="i" viewBox="0 0 16 16"><path d="M13 2.6v10.8L5.5 8zM2.5 2.5h2v11h-2z"/></svg>',
    reset: '<svg class="i" viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 0 5.2 3.7l-1.4.5A4 4 0 1 1 8 4v2.2l3.2-2.7L8 .8z"/></svg>',
    gear: '<svg class="i" viewBox="0 0 16 16"><path d="M9.1 1.5H6.9l-.3 1.6-1 .5-1.3-1-1.6 1.6 1 1.3-.5 1-1.6.3v2.2l1.6.3.5 1-1 1.3 1.6 1.6 1.3-1 1 .5.3 1.6h2.2l.3-1.6 1-.5 1.3 1 1.6-1.6-1-1.3.5-1 1.6-.3V6.9l-1.6-.3-.5-1 1-1.3-1.6-1.6-1.3 1-1-.5zM8 10.2A2.2 2.2 0 1 1 8 5.8a2.2 2.2 0 0 1 0 4.4z"/></svg>',
    run: '<svg class="i" viewBox="0 0 16 16"><path d="M4.5 2.6v10.8L13 8z"/></svg>',
    copy: '<svg class="i" viewBox="0 0 16 16"><path d="M5 1.5h8.5v10H5zm1 1v8h6.5v-8zM2.5 4.5H4v1H3.5v8h7V13H11.5v1.5h-9z"/></svg>',
  };

  /* ------------------------------------------------------------ state */
  let st = { status: "idle", solve: null, anim: null, ground: null, file: null, empty: false, settings: { speed: 1400 } };
  const saved = vscode.getState() || {};
  const ui = { tab: saved.tab || "anim", model: 0, hidden: new Set(saved.hidden || []), speed: saved.speed || 0 };
  const persist = () => vscode.setState({ tab: ui.tab, hidden: [...ui.hidden], speed: ui.speed });

  let aT = 0, aTimer = null, aSig = "", aPos = {}, aNodes = [], aColors = {};
  let gPos = {}, gSig = "";
  let grT = 0, grSig = "";                                  // grounding tab: current step and a signature of the program

  /* ------------------------------------------------------------ helpers */
  const PALETTE = ["var(--c0)", "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  const predColors = {};
  function predColor(p) { if (!(p in predColors)) predColors[p] = PALETTE[Object.keys(predColors).length % PALETTE.length]; return predColors[p]; }

  function splitTop(s, sep) {
    const out = []; let depth = 0, cur = "";
    for (const ch of s) {
      if (ch === "(") depth++; if (ch === ")") depth--;
      if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
  }
  function parseAtomStr(a) {
    const m = a.match(/^(-?[a-z][A-Za-z0-9_']*)(?:\((.*)\))?$/s);
    return m ? { pred: m[1], args: m[2] === undefined ? [] : splitTop(m[2], ",") } : null;
  }
  const atomPred = a => (a.match(/^-?([a-z][A-Za-z0-9_']*)/) || [, a])[1];
  const ENGINE_NAMES = { native: "native", python: "Python API", wasm: "WebAssembly" };
  const fmtMs = ms => ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(2) + " s";

  function mk(name, attrs = {}) { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ------------------------------------------------------------ graph drawing */
  function computeLayout(nodes, edgesByPred, W, H) {
    const pos = {};
    let chosen = null;
    for (const [, es] of edgesByPred) {                       // first predicate forming a DAG gives a layered layout
      const depth = {}; nodes.forEach(n => depth[n] = 0); let ok = true;
      for (let it = 0; it <= nodes.length; it++) {
        let ch = false;
        es.forEach(([u, v]) => { if (u !== v && depth[v] < depth[u] + 1) { depth[v] = depth[u] + 1; ch = true; } });
        if (!ch) break;
        if (it === nodes.length) ok = false;
      }
      if (ok && es.some(([u, v]) => u !== v) && Math.max(...Object.values(depth)) > 0) { chosen = depth; break; }
    }
    if (chosen) {
      const layers = {}; nodes.forEach(n => (layers[chosen[n]] ||= []).push(n));
      const keys = Object.keys(layers).map(Number).sort((a, b) => a - b), L = keys.length;
      keys.forEach((d, li) => layers[d].forEach((n, i) => { pos[n] = { x: 70 + (W - 140) * (L === 1 ? .5 : li / (L - 1)), y: H * (i + 1) / (layers[d].length + 1) }; }));
    } else {
      const r = Math.min(W, H) * .36;
      nodes.forEach((n, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / Math.max(1, nodes.length); pos[n] = { x: W / 2 + r * 1.35 * Math.cos(a), y: H / 2 + r * Math.sin(a) }; });
    }
    return pos;
  }

  /** g = { nodes, pos, edges:[{u,v,pred,label,fresh,base,title}], badges:{node:[text]}, colors:{pred:css color} } */
  function drawGraph(svg, g, onDrag) {
    svg.innerHTML = "";
    const defs = mk("defs"); svg.appendChild(defs);
    const markers = {};
    const marker = c => markers[c] || (markers[c] = (() => {
      const id = "m" + Object.keys(markers).length + Math.random().toString(36).slice(2, 6);
      const m = mk("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerUnits: "userSpaceOnUse", markerWidth: 10, markerHeight: 10, orient: "auto-start-reverse" });
      const p = mk("path", { d: "M0,0 L10,5 L0,10 z" }); p.style.fill = c; m.appendChild(p); defs.appendChild(m); return id;
    })());
    const vb = svg.viewBox && svg.viewBox.baseVal, W = (vb && vb.width) || 700, H = (vb && vb.height) || 380;
    const R = 19, slot = {}, layer = mk("g"); svg.appendChild(layer);
    const has = new Set(g.edges.map(e => e.u + "|" + e.v)), loopDir = {};
    const ns = g.nodes.filter(m => g.pos[m]);
    const cx0 = ns.reduce((a, m) => a + g.pos[m].x, 0) / (ns.length || 1), cy0 = ns.reduce((a, m) => a + g.pos[m].y, 0) / (ns.length || 1);
    /** A self-loop points into the emptiest direction: away from the node's other edges, inside the canvas, preferably outward and up. */
    const dirOf = u => loopDir[u] ??= (() => {
      const p = g.pos[u], used = [];
      g.edges.forEach(e => { if (e.u === e.v) return; const o = e.u === u ? g.pos[e.v] : e.v === u ? g.pos[e.u] : null; if (o) used.push(Math.atan2(o.y - p.y, o.x - p.x)); });
      let best = -Math.PI / 2, top = -Infinity;
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 4, ax = p.x + Math.cos(a) * 52, ay = p.y + Math.sin(a) * 52;
        const gap = used.reduce((m, b) => Math.min(m, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))), Math.PI);
        const score = gap + (ax > 10 && ax < W - 10 && ay > 10 && ay < H - 10 ? 0 : -10) + (Math.cos(a) * (p.x - cx0) + Math.sin(a) * (p.y - cy0)) / 400 + (k === 0 ? .01 : 0);
        if (score > top) { top = score; best = a; }
      }
      return best;
    })();
    g.edges.forEach(e => {
      const p = g.pos[e.u], q = g.pos[e.v]; if (!p || !q) return;
      const col = e.base ? "var(--base)" : (g.colors[e.pred] || "var(--c0)");
      const key = e.u + "|" + e.v, n = slot[key] = (slot[key] ?? -1) + 1;     // n-th edge with the same ends and direction
      let d, lx, ly;
      if (e.u === e.v) {
        const a = dirOf(e.u), ox = Math.cos(a), oy = Math.sin(a), D = 62 + n * 14, pt = (r, t) => `${p.x + ox * r - oy * t},${p.y + oy * r + ox * t}`;
        d = `M${pt(R, -7)} C${pt(D, -34)} ${pt(D, 34)} ${pt(R, 7)}`;
        lx = p.x + ox * (.25 * R + .75 * D + 9); ly = p.y + oy * (.25 * R + .75 * D + 9) + 4;
      }
      else {
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        // An edge bends only when it has to: it runs through another node (the arc grows with its length, so it clears the nodes it
        // spans and nests outside shorter ones), it has an opposite edge (the pair bows apart), or it repeats the same ends (n > 0).
        const blocked = g.nodes.some(m => {
          const c = g.pos[m]; if (!c || m === e.u || m === e.v) return false;
          const t = ((c.x - p.x) * dx + (c.y - p.y) * dy) / (len * len);
          return t > 0 && t < 1 && Math.hypot(c.x - (p.x + t * dx), c.y - (p.y + t * dy)) < R + 6;
        });
        const h = (blocked ? Math.min(14 + .18 * len, Math.max(40, H / 2 - R - 14)) : has.has(e.v + "|" + e.u) ? 16 : 0) + n * 16;
        const cx = (p.x + q.x) / 2 - uy * 2 * h, cy = (p.y + q.y) / 2 + ux * 2 * h;          // control point of the quadratic arc
        const toward = (a, b, r) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x + (b.x - a.x) / l * r, y: a.y + (b.y - a.y) / l * r }; };
        const s0 = toward(p, { x: cx, y: cy }, R), e0 = toward(q, { x: cx, y: cy }, R + 6);
        d = `M${s0.x},${s0.y} Q${cx},${cy} ${e0.x},${e0.y}`;
        lx = (s0.x + 2 * cx + e0.x) / 4 - uy * (h ? 9 : 0); ly = (s0.y + 2 * cy + e0.y) / 4 + ux * (h ? 9 : 0) - (h ? 0 : 5);
      }
      const path = mk("path", { d, class: "edge" + (e.fresh ? " fresh" : ""), "marker-end": `url(#${marker(col)})` });
      path.style.stroke = col;
      const t = mk("title"); t.textContent = e.title || `${e.pred}(${e.u},${e.v})`; path.appendChild(t); layer.appendChild(path);
      if (e.label) { const lb = mk("text", { x: lx, y: ly, class: "elabel" }); lb.textContent = e.label; layer.appendChild(lb); }
    });
    g.nodes.forEach(n => {
      if (!g.pos[n]) return;
      const gr = mk("g", { class: "node" + (onDrag ? " drag" : ""), transform: `translate(${g.pos[n].x},${g.pos[n].y})` });
      gr.appendChild(mk("circle", { r: R })); const tx = mk("text", { y: 4.5 }); tx.textContent = n; gr.appendChild(tx);
      (g.badges[n] || []).forEach((b, i) => { const bt = mk("text", { y: R + 13 + i * 11, class: "bdg" }); bt.textContent = b; gr.appendChild(bt); });
      if (onDrag) {
        gr.querySelector("circle").addEventListener("pointerdown", ev => {
          ev.preventDefault();
          const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect(), sc = vb.width / rect.width;
          const move = m => { g.pos[n] = { x: (m.clientX - rect.left) * sc, y: (m.clientY - rect.top) * sc }; onDrag(); };
          const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
          addEventListener("pointermove", move); addEventListener("pointerup", up);
        });
      }
      layer.appendChild(gr);
    });
  }

  /* ------------------------------------------------------------ shell */
  const TABS = [["anim", "Animator"], ["ground", "Grounding"], ["models", "Answer Sets"], ["graph", "Graph"], ["console", "Console"]];

  function renderShell() {
    const r = st.solve, busy = st.status === "solving";
    let pill = "";
    if (busy) pill = '<span class="pill busy">Solving…</span>';
    else if (r && r.error) pill = `<span class="pill err">${r.timedOut ? "Timeout" : "Error"}</span>`;
    else if (r) pill = `<span class="pill ${r.result === "UNSATISFIABLE" ? "unsat" : r.result === "UNKNOWN" ? "unk" : "sat"}">${esc(r.result)}</span>`;

    let meta = "";
    if (r && !r.error) {
      meta = `${plural(r.totalModels, "model")}${r.total != null ? ` of ${r.total}` : r.more ? " (more available)" : ""} · ${fmtMs(r.ms)}` + (r.time != null ? ` · clingo ${r.time.toFixed(3)} s` : "");
      if (r.capped && r.more) meta += ` · auto-run limit ${r.capped}`;
    }
    const engineName = ENGINE_NAMES[r && r.engine] || "";
    const engine = r ? `<span class="chip" title="${esc(r.command)}">clingo ${esc(r.version)} · ${engineName}</span>` +
      (r.engine === "wasm" && !EMBED ? '<span class="chip link" id="setupLink" title="Install a native clingo (faster than WebAssembly)">get native clingo</span>' : "") : "";
    const counts = { models: r && !r.error ? r.totalModels : 0, console: r ? r.diagnostics.length : 0 };
    $("app").className = EMBED ? "embed" : "";
    $("app").innerHTML = `
      <div class="top">
        <div class="bar">
          <div class="title"><span class="name">${st.file ? esc(st.file.name) : "No ASP file"}</span>${st.file && st.file.scope === "folder" ? '<span class="chip">folder</span>' : ""}${engine}</div>
          ${EMBED ? "" : `<button class="btn primary" id="solveBtn" ${st.file ? "" : "disabled"} title="Solve (all models)">${ICON.run} Solve</button>
          <button class="icon-btn" id="settingsBtn" title="Settings" aria-label="Settings">${ICON.gear}</button>`}
        </div>
        <div class="summary">${pill}<span>${esc(meta)}</span></div>
        <div class="tabs" role="tablist">${TABS.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${ui.tab === id}">${label}${counts[id] ? `<span class="count">${counts[id]}</span>` : ""}</button>`).join("")}</div>
      </div>
      <main id="main"></main>`;
    if (!EMBED) {
      $("solveBtn").onclick = () => vscode.postMessage({ type: "solve" });
      $("settingsBtn").onclick = () => vscode.postMessage({ type: "openSettings" });
    }
    const sl = $("setupLink"); if (sl) sl.onclick = () => vscode.postMessage({ type: "setup" });
    document.querySelectorAll(".tab").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; persist(); stopAnim(); renderShell(); renderMain(); if (ui.tab !== "anim" && ui.tab !== "ground") notifyStep(); });
  }

  function renderMain() {
    const main = $("main");
    if (!st.file) { main.innerHTML = `<div class="empty"><h2>No ASP file open</h2>Open a <code>.lp</code> file to see its answer sets and animate its rules.<br><br>Shortcut for <b>ASP: Solve</b>: <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>Enter</kbd></div>`; notifyStep(); return; }
    if (st.empty) { main.innerHTML = `<div class="empty"><h2>Empty program</h2>Write some rules, for example <code>a :- not b.</code></div>`; notifyStep(); return; }
    if (!st.solve && st.status === "solving") { main.innerHTML = `<div class="empty">Starting clingo…</div>`; return; }
    if (!st.solve) { main.innerHTML = `<div class="empty">Waiting for the first run…</div>`; return; }
    ({ anim: viewAnim, ground: viewGround, models: viewModels, graph: viewGraph, console: viewConsole })[ui.tab]();
  }

  function errorNotice() {
    const r = st.solve;
    if (!r || !r.error) return "";
    return `<div class="notice bad"><b>${r.timedOut ? "Timed out" : "Could not solve"}.</b> ${esc(r.error)} ${r.diagnostics.length && ui.tab !== "console" ? 'See the <a href="#" id="toConsole">Console</a>.' : ""}</div>`;
  }
  function bindErrorLink() { const l = $("toConsole"); if (l) l.onclick = e => { e.preventDefault(); ui.tab = "console"; persist(); renderShell(); renderMain(); }; }

  /* ------------------------------------------------------------ shared atom rendering */
  /** One atom as a chip: predicate name in the predicate colour, arguments muted. */
  function atomChip(atom, color, { fresh = false, title = "" } = {}) {
    const i = atom.indexOf("(");
    const name = i < 0 ? atom : atom.slice(0, i), args = i < 0 ? "" : atom.slice(i);
    return `<span class="atom-chip${fresh ? " fresh" : ""}" style="--pc:${color}"${title ? ` title="${esc(title)}"` : ""}><span class="an">${esc(name)}</span><span class="aa">${esc(args)}</span></span>`;
  }
  /** A predicate section: header (colour dot, name/arity, count) above wrapping chips. */
  function predGroup(name, arity, color, chipsHtml, count) {
    return `<div class="predgroup" style="--pc:${color}"><div class="pn"><span class="dot"></span><span class="pname">${esc(name)}</span><span class="parity">/${arity}</span><span class="pcount">${count}</span></div><div class="chips">${chipsHtml}</div></div>`;
  }

  /* ------------------------------------------------------------ animator */
  function animSignature(a) { return a && !a.error ? a.rules.map(r => r.text).join("|") + "#" + a.rounds.map(x => x.length).join(",") : "x"; }

  function viewAnim() {
    const a = st.anim, main = $("main");
    if (!a) { main.innerHTML = errorNotice() || '<div class="empty">Animator is not available yet.</div>'; bindErrorLink(); return; }
    if (a.error) {
      main.innerHTML = `<div class="stack">${errorNotice()}<div class="notice"><b>The animator cannot show this program.</b><br>${esc(a.error.split("\n")[0])}` +
        `${a.line ? ` <a href="#" id="goErr">(line ${a.line})</a>` : ""}<br><span class="muted small">It follows how a positive program grows round by round. Choice rules, negation, constraints and ranges are not supported here. The <b>Answer Sets</b> and <b>Graph</b> tabs still work.</span></div></div>`;
      bindErrorLink(); const g = $("goErr"); if (g) g.onclick = e => { e.preventDefault(); vscode.postMessage({ type: "revealLine", file: a.file, line: a.line }); };
      notifyStep(); return;
    }
    const sig = animSignature(a);
    if (sig !== aSig) { aSig = sig; aT = Number.isInteger(window.__ASP_START_ROUND__) ? Math.max(0, Math.min(window.__ASP_START_ROUND__, a.rounds.length - 1)) : a.rounds.length - 1; layoutAnim(); }
    aT = Math.min(aT, a.rounds.length - 1);
    const last = a.rounds.length - 1;
    main.innerHTML = `<div class="stack">
      ${errorNotice()}
      ${a.incomplete ? `<div class="notice"><b>Incomplete rule</b> (missing final “.”): <code>${esc(a.incomplete)}</code></div>` : ""}
      <div class="card">
        <div class="transport">
          <button class="icon-btn" id="aReset" title="Reset to round 0 (R)" aria-label="Reset">${ICON.reset}</button>
          <button class="icon-btn" id="aBack" title="Step back (←)" aria-label="Step back">${ICON.back}</button>
          <button class="icon-btn" id="aPlay" title="Play / pause (Space)" aria-label="Play">${ICON.play}</button>
          <button class="icon-btn" id="aNext" title="Step forward (→)" aria-label="Step forward">${ICON.next}</button>
          <div class="timeline">
            <input type="range" id="aRange" min="0" max="${last}" value="${aT}" ${last === 0 ? "disabled" : ""} aria-label="Round">
            <div class="ticks" id="aTicks"></div>
          </div>
          <select id="aSpeed" title="Speed" aria-label="Speed">
            ${[["Slow", 2400], ["Normal", 1400], ["Fast", 700], ["Instant", 300]].map(([l, v]) => `<option value="${v}" ${closestSpeed() === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="status-line" id="aStatus" role="status" aria-live="polite"></div>
      </div>
      <div class="grid2">
        <section class="card"><h3>Rules <span class="muted small" style="text-transform:none;letter-spacing:0">${EMBED ? "" : "click a rule to jump to its line"}</span></h3><ul class="rules" id="aRules"></ul></section>
        <section class="card"><h3>Constants &amp; predicates</h3><div class="gwrap"><svg class="graph" id="aSvg" viewBox="0 0 700 380" role="img" aria-label="Graph of derived atoms"></svg><div class="legend" id="aLegend"></div></div></section>
      </div>
      <section class="card"><h3>This round</h3><div id="aExplain"></div></section>
      <section class="card"><h3>Atoms so far <span class="muted small" id="aCount" style="text-transform:none;letter-spacing:0"></span></h3><div id="aAtoms"></div></section>
    </div>`;
    bindErrorLink();
    $("aNext").onclick = () => stepTo(aT + 1, true);
    $("aBack").onclick = () => stepTo(aT - 1, true);
    $("aReset").onclick = () => { stopAnim(); stepTo(0, true); };
    $("aPlay").onclick = togglePlay;
    $("aRange").oninput = e => { stopAnim(); stepTo(+e.target.value, false); };
    $("aSpeed").onchange = e => { ui.speed = +e.target.value; persist(); if (aTimer) { stopAnim(); playAnim(); } };
    updateAnim();
  }
  const closestSpeed = () => { const v = ui.speed || st.settings.speed || 1400, opts = [2400, 1400, 700, 300]; return opts.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a); };

  function layoutAnim() {
    const rounds = st.anim.rounds, all = rounds.flat();
    const set = new Set(); all.forEach(f => f.args.forEach(x => set.add(x))); aNodes = [...set];
    const preds = [...new Set(all.filter(f => f.args.length === 2).map(f => f.pred))];
    const byPred = new Map(preds.map(p => [p, rounds[0].filter(f => f.pred === p).map(f => f.args)]));
    const baseOnly = new Map([...byPred].filter(([, es]) => es.length));
    aPos = computeLayout(aNodes, baseOnly.size ? baseOnly : byPred, 700, 380);
    const derived = new Set(rounds.slice(1).flat().map(f => f.pred)); let ci = 0; aColors = {};
    preds.forEach(p => aColors[p] = derived.has(p) ? PALETTE[ci++ % PALETTE.length] : "base");
  }

  function stepTo(t, announce) {
    const a = st.anim; if (!a || a.error) return;
    aT = Math.max(0, Math.min(a.rounds.length - 1, t));
    updateAnim();
  }

  function updateAnim() {
    const a = st.anim; if (!a || a.error || !$("aStatus")) return;
    const rounds = a.rounds, last = rounds.length - 1, atEnd = aT >= last;
    $("aBack").disabled = aT === 0; $("aReset").disabled = aT === 0; $("aNext").disabled = atEnd;
    $("aRange").value = aT;
    $("aTicks").innerHTML = rounds.map((_, i) => `<span class="${i === aT ? "cur" : ""}">${i === 0 ? "0" : i}</span>`).join("");
    $("aPlay").innerHTML = aTimer ? ICON.pause : ICON.play;

    const cur = rounds[aT];
    $("aStatus").innerHTML = aT === 0
      ? `<span class="tag">Round 0</span> Facts <span class="muted" style="font-weight:400">· ${plural(cur.length, "atom")}</span>`
      : `<span class="tag ${atEnd ? "done" : ""}">Round ${aT}</span> ${plural(cur.length, "new atom")}` + (atEnd ? ` <span class="fix">· fixpoint reached: the next round derives nothing new</span>` : "");

    const counts = {}; cur.forEach(f => counts[f.rule] = (counts[f.rule] || 0) + 1);
    $("aRules").innerHTML = a.rules.map((r, i) => `<li class="rule ${counts[i] ? "active" : ""}" data-i="${i}" tabindex="0" title="${esc(r.file)}, line ${r.line}"><span class="ln">${i + 1}</span><code>${esc(r.text)}</code><span class="n">${counts[i] ? (aT === 0 ? "fact" : "+" + counts[i]) : ""}</span></li>`).join("");
    document.querySelectorAll("#aRules .rule").forEach(li => {
      const go = () => vscode.postMessage({ type: "reveal", rule: +li.dataset.i });
      li.onclick = go; li.onkeydown = e => { if (e.key === "Enter") go(); };
    });

    $("aExplain").innerHTML = aT === 0
      ? `<div class="pad muted">Rules with an empty body are always true. They give the starting atoms. Press <b>Step</b> to apply every rule to everything known so far.</div>`
      : `<div class="deriv">` + cur.map(f => `<code class="atom">${esc(f.atom)}</code><span class="arrow">←</span><span class="why">rule ${f.rule + 1}${Object.keys(f.subst).filter(k => k !== "_").length ? " with " + Object.entries(f.subst).filter(([k]) => k !== "_").map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join(", ") : ""}</span>`).join("") + `</div>`;

    const groups = {};
    for (let k = 0; k <= aT; k++) rounds[k].forEach(f => (groups[f.pred] ||= []).push({ f, k }));
    let total = 0;
    $("aAtoms").innerHTML = Object.keys(groups).sort().map(p => {
      total += groups[p].length;
      const color = aColors[p] && aColors[p] !== "base" ? aColors[p] : predColor(p);
      return predGroup(p, groups[p][0].f.args.length, color, groups[p].map(({ f, k }) => atomChip(f.atom, color, { fresh: k === aT && aT > 0, title: "round " + k })).join(""), groups[p].length);
    }).join("");
    $("aCount").textContent = `· ${total}`;

    const edges = [], badges = {};
    for (let k = 0; k <= aT; k++) rounds[k].forEach(f => {
      if (f.args.length === 2) edges.push({ u: f.args[0], v: f.args[1], pred: f.pred, base: aColors[f.pred] === "base", label: aColors[f.pred] === "base" ? "" : "r" + k, fresh: k === aT && aT > 0, title: `${f.atom} (round ${k})` });
      else if (f.args.length === 1) (badges[f.args[0]] ||= []).push(f.pred);
    });
    drawGraph($("aSvg"), { nodes: aNodes, pos: aPos, edges, badges, colors: aColors }, null);
    $("aLegend").innerHTML = Object.entries(aColors).map(([p, c]) => `<span><i style="background:${c === "base" ? "var(--base)" : c}"></i>${esc(p)}${c === "base" ? " (facts)" : ""}</span>`).join("") +
      (Object.values(aColors).some(c => c !== "base") ? "<span>rN = round in which the edge appears</span>" : "");
    notifyStep(counts);
  }

  let stepTimer = null;
  function notifyStep(counts) {
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => vscode.postMessage({ type: "step", round: aT, rules: ui.tab === "anim" && st.file && !st.empty ? (counts || {}) : {} }), 40);
  }

  function stopAnim() { clearInterval(aTimer); aTimer = null; const b = $("aPlay"); if (b) b.innerHTML = ICON.play; }
  function playAnim() {
    const a = st.anim; if (!a || a.error) return;
    if (aT >= a.rounds.length - 1) aT = 0;
    const ms = ui.speed || st.settings.speed || 1400;
    aTimer = setInterval(() => { if (aT >= a.rounds.length - 1) { stopAnim(); updateAnim(); return; } aT++; updateAnim(); if (aT >= a.rounds.length - 1) stopAnim(); }, ms);
    updateAnim();
  }
  function togglePlay() {
    if (ui.tab !== "anim" && ui.tab !== "ground") { ui.tab = "anim"; persist(); renderShell(); renderMain(); }
    const ground = ui.tab === "ground";
    aTimer ? (stopAnim(), ground ? updateGround() : updateAnim()) : (ground ? playGround() : playAnim());
  }
  /** Step the tab that has a transport (Animator or Grounding): `to` is an absolute position or a +/- delta. */
  function move(what) {
    if (ui.tab === "anim") stepTo(what === "reset" ? 0 : aT + what);
    else if (ui.tab === "ground") groundTo(what === "reset" ? 0 : grT + what);
  }


  /* ------------------------------------------------------------ grounding */
  const G_HEAD = { fact: "Fact", body: "Body matches", elem: "Conditional literal", close: "Set closed", inst: "Rule instance", bulk: "More instances", none: "No instance", end: "Done" };
  const codeList = (items, max = 6) => items.slice(0, max).map(x => `<code>${esc(x)}</code>`).join(", ") + (items.length > max ? ` and ${items.length - max} more` : "");
  const bindList = sub => sub.filter(([v]) => v !== "_").map(([v, x]) => `<code>${esc(v)} = ${esc(x)}</code>`).join(", ");

  function groundSignature(g) { return g && !g.error ? g.rules.map(r => r.text).join("|") + "#" + g.steps.length + ":" + g.ground.length : "x"; }

  function groundNotices(g) {
    let h = errorNotice();
    if (g.incomplete) h += `<div class="notice"><b>Incomplete rule</b> (missing final “.”): <code>${esc(g.incomplete)}</code></div>`;
    if (g.skipped && g.skipped.length) {
      h += `<div class="notice"><b>${plural(g.skipped.length, "statement")} not shown.</b> They use something the grounding view does not support, so atoms they derive are missing here and rules that depend on them may show fewer instances.` +
        g.skipped.slice(0, 3).map(x => `<br><a href="#" class="goLine" data-line="${x.line}" data-file="${esc(x.file)}">line ${x.line}</a> <code>${esc(x.text.length > 70 ? x.text.slice(0, 70) + "…" : x.text)}</code> <span class="muted small">${esc(x.msg)}</span>`).join("") +
        (g.skipped.length > 3 ? `<br><span class="muted small">and ${g.skipped.length - 3} more</span>` : "") + `</div>`;
    }
    return h;
  }

  function viewGround() {
    const g = st.ground, main = $("main");
    if (!g) { main.innerHTML = errorNotice() || '<div class="empty">The grounding view is not available yet.</div>'; bindErrorLink(); return; }
    if (g.error) {
      main.innerHTML = `<div class="stack">${errorNotice()}<div class="notice"><b>The grounding view cannot show this program.</b><br>${esc(g.error.split("\n")[0])}` +
        `${g.line ? ` <a href="#" id="goErr">(line ${g.line})</a>` : ""}<br><span class="muted small">It follows how rules with variables, ranges, choice rules and constraints are expanded. Aggregates in rule bodies are not supported. The <b>Answer Sets</b> and <b>Graph</b> tabs still work.</span></div></div>`;
      bindErrorLink(); const e = $("goErr"); if (e) e.onclick = ev => { ev.preventDefault(); vscode.postMessage({ type: "revealLine", file: g.file, line: g.line }); };
      notifyStep(); return;
    }
    const sig = groundSignature(g);
    if (sig !== grSig) { grSig = sig; grT = 0; }
    grT = Math.min(grT, g.steps.length - 1);
    const last = g.steps.length - 1;
    main.innerHTML = `<div class="stack">
      ${groundNotices(g)}
      <div class="card">
        <div class="transport">
          <button class="icon-btn" id="aReset" title="Reset to the first step (R)" aria-label="Reset">${ICON.reset}</button>
          <button class="icon-btn" id="aBack" title="Step back (←)" aria-label="Step back">${ICON.back}</button>
          <button class="icon-btn" id="aPlay" title="Play / pause (Space)" aria-label="Play">${ICON.play}</button>
          <button class="icon-btn" id="aNext" title="Step forward (→)" aria-label="Step forward">${ICON.next}</button>
          <div class="timeline"><input type="range" id="aRange" min="0" max="${last}" value="${grT}" ${last === 0 ? "disabled" : ""} aria-label="Step"></div>
          <select id="aSpeed" title="Speed" aria-label="Speed">
            ${[["Slow", 2400], ["Normal", 1400], ["Fast", 700], ["Instant", 300]].map(([l, v]) => `<option value="${v}" ${closestSpeed() === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
        <div class="status-line" id="aStatus" role="status" aria-live="polite"></div>
        <div class="pad gexplain" id="gExplain"></div>
      </div>
      <div class="grid2">
        <section class="card"><h3>Rules <span class="muted small" style="text-transform:none;letter-spacing:0">${EMBED ? "" : "click a rule to jump to its line"}</span></h3><ul class="rules" id="aRules"></ul></section>
        <div class="stack">
          <section class="card"><h3>Current rule</h3><div class="pad"><div class="rtext" id="gRule"></div></div></section>
          <section class="card"><h3>Loops</h3><div class="loops" id="gLoops"></div></section>
          <section class="card"><h3>Ground rule being built</h3><div class="pad" id="gBuild"></div></section>
        </div>
      </div>
      <section class="card"><h3>Ground rules so far <span class="muted small" id="gCount" style="text-transform:none;letter-spacing:0"></span></h3><div class="glist" id="gGround"></div></section>
    </div>`;
    bindErrorLink();
    main.querySelectorAll(".goLine").forEach(a => a.onclick = ev => { ev.preventDefault(); vscode.postMessage({ type: "revealLine", file: a.dataset.file, line: +a.dataset.line }); });
    $("aNext").onclick = () => groundTo(grT + 1);
    $("aBack").onclick = () => groundTo(grT - 1);
    $("aReset").onclick = () => { stopAnim(); groundTo(0); };
    $("aPlay").onclick = togglePlay;
    $("aRange").oninput = e => { stopAnim(); groundTo(+e.target.value); };
    $("aSpeed").onchange = e => { ui.speed = +e.target.value; persist(); if (aTimer) { stopAnim(); playGround(); } };
    updateGround();
  }

  function groundTo(t) {
    const g = st.ground; if (!g || g.error) return;
    grT = Math.max(0, Math.min(g.steps.length - 1, t));
    updateGround();
  }

  function groundCaption(step, rule, g) {
    const bind = bindList(step.sub), lastLv = step.levels[step.levels.length - 1];
    const pos = lv => lv && lv.n > 1 ? ` <span class="muted">(${lv.i} of ${lv.n})</span>` : "";
    const body = step.levels.filter(l => l.k[0] === "b"), cond = step.levels.filter(l => l.k[0] === "c");
    switch (step.kind) {
      case "fact": {
        const same = step.total === 1 && step.atoms[0] + "." === rule.text;
        return same ? `<code>${esc(rule.text)}</code> is a fact. It has no variables, so it is already ground.` :
          `<code>${esc(rule.text)}</code> is a fact with a range or a pool. It expands to ${plural(step.total, "ground fact")}: ${codeList(step.atoms)}.`;
      }
      case "body":
        return (body.length ? `Body ${body.map(l => `<code>${esc(l.text)}</code>`).join(", ")}: ${bind ? bind + pos(body[body.length - 1]) : "no variables"}.` : "This rule has no body, so there is a single instance.") + " A new set opens for it.";
      case "elem": {
        const lv = cond[cond.length - 1], which = lv ? `<code>${esc(lv.text)}</code>` : "The element";
        return `${which}${lv && lv.bind.length ? ": " + bindList(lv.bind) : ""}${pos(lv)}. ${step.dup ? `<code>${esc(step.atom)}</code> is already in the set.` : `<code>${esc(step.atom)}</code> joins the set.`}`;
      }
      case "close": {
        const cs = rule.parts.filter(p => /^c\d/.test(p.k || "")).map(p => p.t.trim());
        return `${cs.length ? `<code>${esc(cs[0])}</code> has no more values. ` : ""}The set is closed${step.empty ? ". It is empty, so nothing is added." : step.dup ? ". This ground rule already exists." : ` and becomes the ground rule <code>${esc(step.text)}</code>`}`;
      }
      case "inst": {
        const out = step.total === 1 ? (step.fresh[0] ? `Ground rule: <code>${esc(step.texts[0])}</code>.` : `<code>${esc(step.texts[0])}</code> already exists.`) : `${step.total} ground rules: ${codeList(step.texts, 3)}.`;
        return `${body.length ? `Body matches with ${bind || "no variables"}${pos(lastLv)}. ` : ""}${out}` +
          (step.rej ? ` <span class="muted">${plural(step.rej, "other combination")} failed a comparison or <code>not</code> test on the way.</span>` : "");
      }
      case "bulk": return `${plural(step.hidden, "more instance")} of this rule (${step.total} in total) are grounded without a step each, to keep the animation short. They are in the list below.`;
      case "none": return `The body of this rule never matches, so it gives no ground rule.`;
      default: {
        const r = st.solve;
        let res = "";
        if (r && !r.error) res = r.result === "UNSATISFIABLE" ? " clingo finds no answer set." : ` clingo finds ${r.total != null ? "" : r.more ? "at least " : ""}${plural(r.total != null ? r.total : r.totalModels, "answer set")}.`;
        return `Grounding is complete: ${plural(g.ground.length, "ground rule")}.${res} <span class="muted">clingo's own grounder simplifies a little more and may order the rules differently.</span>`;
      }
    }
  }

  function updateGround() {
    const g = st.ground; if (!g || g.error || !$("aStatus")) return;
    const steps = g.steps, last = steps.length - 1, step = steps[grT], rule = step.rule === null ? null : g.rules[step.rule], atEnd = grT >= last;
    $("aBack").disabled = grT === 0; $("aReset").disabled = grT === 0; $("aNext").disabled = atEnd;
    $("aRange").value = grT;
    $("aPlay").innerHTML = aTimer ? ICON.pause : ICON.play;
    $("aStatus").innerHTML = `<span class="tag ${atEnd ? "done" : ""}">Step ${grT + 1} / ${steps.length}</span> ${esc(G_HEAD[step.kind])}${rule ? ` <span class="muted" style="font-weight:400">· rule ${step.rule + 1}</span>` : ""}`;
    $("gExplain").innerHTML = groundCaption(step, rule, g);

    const per = {}; g.ground.slice(0, step.n).forEach(x => { per[x.rule] = (per[x.rule] || 0) + 1; });
    $("aRules").innerHTML = g.rules.map((r, i) => `<li class="rule ${i === step.rule ? "active" : ""}" data-i="${i}" tabindex="0" title="${esc(r.file)}, line ${r.line}"><span class="ln">${i + 1}</span><code>${esc(r.text)}</code><span class="n">${per[i] ? "→ " + per[i] : ""}</span></li>`).join("");
    document.querySelectorAll("#aRules .rule").forEach(li => {
      const r = g.rules[+li.dataset.i], go = () => vscode.postMessage({ type: "revealLine", file: r.file, line: r.line });
      li.onclick = go; li.onkeydown = e => { if (e.key === "Enter") go(); };
    });

    const on = new Set(step.act);
    $("gRule").innerHTML = rule ? rule.parts.map(p => p.k ? `<span class="seg${on.has(p.k) ? " on" : ""}">${esc(p.t)}</span>` : esc(p.t)).join("") : '<span class="muted">All rules are grounded.</span>';

    const depth = step.levels.length;
    let loops = step.levels.map((l, d) => `<div class="loop${l.k[0] === "c" ? " cond" : ""}" style="padding-left:${12 + d * 20}px"><span class="kw">for</span> <code>${esc(l.text)}</code><span class="arrow">→</span>` +
      `${l.bind.length ? l.bind.map(([v, x]) => `<code class="val">${esc(v)} = ${esc(x)}</code>`).join(" ") : '<span class="muted">matches</span>'}<span class="muted small">${l.n > 1 ? `${l.i} of ${l.n}` : "only value"}</span></div>`).join("");
    if (step.kind === "close" && rule) rule.parts.filter(p => /^c\d/.test(p.k || "")).forEach(p => { loops += `<div class="loop done" style="padding-left:${12 + depth * 20}px"><span class="kw">end</span> <code>${esc(p.t.trim())}</code><span class="muted small">no more values</span></div>`; });
    $("gLoops").innerHTML = loops || `<div class="pad muted">${step.kind === "end" ? "Nothing left to ground." : step.kind === "bulk" ? "Not shown step by step." : step.kind === "fact" ? "A fact needs no loop." : "No loop: this rule has no body literal that binds a variable."}</div>`;

    let build = "";
    if (["body", "elem"].includes(step.kind) && rule && rule.build) {
      const b = rule.build, chips = step.set.map((a, k) => atomChip(a, predColor(atomPred(a)), { fresh: k === step.set.length - 1 && step.kind === "elem" && !step.dup }));
      build = `<code class="gr">${esc(b.pre)}</code>${chips.length ? chips.join('<code class="gr">' + esc(b.sep) + "</code>") : '<span class="muted">(empty)</span>'}<code class="gr">${esc(b.post)}</code>`;
    } else if (step.kind === "close") build = step.empty ? '<span class="muted">(nothing)</span>' : `<code class="gr${step.dup ? "" : " new"}">${esc(step.text)}</code>${step.dup ? ' <span class="muted small">already exists</span>' : ""}`;
    else if (step.kind === "inst") build = step.texts.map((t, k) => `<div><code class="gr${step.fresh[k] ? " new" : ""}">${esc(t)}</code></div>`).join("") + (step.total > step.texts.length ? `<span class="muted small">… ${step.total - step.texts.length} more</span>` : "");
    else if (step.kind === "fact") build = step.atoms.map(a => `<code class="gr new">${esc(a)}.</code>`).join(" ") + (step.total > step.atoms.length ? ` <span class="muted small">… ${step.total - step.atoms.length} more</span>` : "");
    $("gBuild").innerHTML = build || '<span class="muted">—</span>';

    const prev = grT > 0 ? steps[grT - 1].n : 0, shown = g.ground.slice(0, step.n), SHOW = 200, from = Math.max(0, shown.length - SHOW);
    $("gCount").textContent = `· ${shown.length}`;
    $("gGround").innerHTML = (from ? `<div class="gline muted small">… ${from} earlier rules not shown</div>` : "") +
      shown.slice(from).map((x, k) => `<div class="gline${from + k >= prev && grT > 0 ? " fresh" : ""}"><span class="ln">${from + k + 1}</span><code>${esc(x.text)}</code><span class="from">rule ${x.rule + 1}</span></div>`).join("") || '<div class="pad muted">Nothing yet.</div>';
    const fr = $("gGround").querySelector(".fresh:last-child"); if (fr) $("gGround").scrollTop = fr.offsetTop - 60;
    notifyGround(step);
  }

  let groundTimer = null;
  function notifyGround(step) {
    clearTimeout(stepTimer); clearTimeout(groundTimer);
    groundTimer = setTimeout(() => vscode.postMessage({ type: "groundStep", rule: step.rule, note: step.rule === null ? "" : G_HEAD[step.kind].toLowerCase() }), 40);
  }
  function playGround() {
    const g = st.ground; if (!g || g.error) return;
    if (grT >= g.steps.length - 1) grT = 0;
    const ms = ui.speed || st.settings.speed || 1400;
    aTimer = setInterval(() => { if (grT >= g.steps.length - 1) { stopAnim(); updateGround(); return; } grT++; updateGround(); if (grT >= g.steps.length - 1) stopAnim(); }, ms);
    updateGround();
  }

  /* ------------------------------------------------------------ answer sets */
  function chipGroups(atoms) {
    const g = {}; atoms.forEach(a => (g[atomPred(a)] ||= []).push(a));
    return Object.keys(g).sort().map(p => {
      const color = predColor(p), arity = parseAtomStr(g[p][0]) ? parseAtomStr(g[p][0]).args.length : 0;
      return predGroup(p, arity, color, g[p].map(a => atomChip(a, color)).join(""), g[p].length);
    }).join("");
  }

  function viewModels() {
    const r = st.solve, main = $("main");
    if (r.error) { main.innerHTML = `<div class="stack">${errorNotice()}</div>`; bindErrorLink(); return; }
    if (r.result === "UNSATISFIABLE") { main.innerHTML = `<div class="empty"><h2>No answer set</h2>The program is unsatisfiable. Are the constraints too strict?</div>`; return; }
    ui.model = Math.min(ui.model, Math.max(0, r.models.length - 1));
    main.innerHTML = `<div class="stack">
      ${r.capped && r.more ? `<div class="notice">${r.total != null ? `Auto-run shows ${r.totalModels} of <b>${r.total}</b> answer sets.` : `Auto-run stopped at ${r.capped} models.`} Press <b>Solve</b> to compute all of them.${r.total == null && !window.__ASP_NO_COUNT__ && !r.models.some(m => m.costs) ? (r.counting ? " <span class=\"muted\">Counting…</span>" : ` <button class="btn" id="countBtn" title="Count all answer sets without listing them. This can take a while on big programs.">Count all</button>${r.countFailed ? ` <span class="muted small">${r.countFailed === "timeout" ? "Counting timed out." : "Counting failed."}</span>` : ""}`) : ""}</div>` : ""}
      ${r.models.map((m, i) => `<section class="card model ${i === ui.model ? "sel" : ""}" data-i="${i}">
        <h3><span class="mh"><b>Answer ${i + 1}</b><span class="chip">${plural(m.atoms.length, "atom")}</span>${m.costs ? `<span class="chip" title="Optimisation cost">cost ${esc(m.costs.join(", "))}</span>` : ""}</span><button class="icon-btn" data-copy="${i}" title="Copy atoms" aria-label="Copy atoms">${ICON.copy}</button></h3>
        ${m.atoms.length ? chipGroups(m.atoms) : '<div class="pad muted">(empty answer set)</div>'}
      </section>`).join("")}
      ${r.totalModels > r.models.length ? `<div class="muted small">… ${r.totalModels - r.models.length} more not shown (setting <code>asp.maxModelsShown</code>).</div>` : ""}
    </div>`;
    const cb = $("countBtn"); if (cb) cb.onclick = () => vscode.postMessage({ type: "count" });
    main.querySelectorAll(".model").forEach(n => n.onclick = ev => {
      const c = ev.target.closest("[data-copy]");
      if (c) { vscode.postMessage({ type: "copy", text: r.models[+c.dataset.copy].atoms.join(" ") }); return; }
      ui.model = +n.dataset.i; main.querySelectorAll(".model").forEach(x => x.classList.toggle("sel", x === n));
    });
  }

  /* ------------------------------------------------------------ graph of an answer set */
  function viewGraph() {
    const r = st.solve, main = $("main");
    if (r.error) { main.innerHTML = `<div class="stack">${errorNotice()}</div>`; bindErrorLink(); return; }
    if (!r.models.length) { main.innerHTML = `<div class="empty"><h2>Nothing to draw</h2>Compute an answer set first.</div>`; return; }
    ui.model = Math.min(ui.model, r.models.length - 1);
    main.innerHTML = `<section class="card">
      <div class="toolbar"><label>Answer set <select id="gModel">${r.models.map((_, i) => `<option value="${i}" ${i === ui.model ? "selected" : ""}>Answer ${i + 1}</option>`).join("")}</select></label><span id="gPreds" style="display:contents"></span><span class="muted" id="gHint"></span></div>
      <div class="gwrap"><svg class="graph" id="gSvg" viewBox="0 0 700 400" role="img" aria-label="Graph of the selected answer set"></svg><div class="legend" id="gLegend"></div></div>
    </section>`;
    $("gModel").onchange = e => { ui.model = +e.target.value; persist(); viewGraph(); };
    const atoms = r.models[ui.model].atoms.map(parseAtomStr).filter(Boolean);
    const nodes = [...new Set(atoms.flatMap(a => a.args.filter(x => /^[a-z0-9_-]/.test(x) && !x.includes("(") && !x.includes('"'))))];
    const bin = atoms.filter(a => a.args.length === 2), un = atoms.filter(a => a.args.length === 1);
    const preds = [...new Set(bin.map(a => a.pred))];
    const sig = r.ms + ":" + ui.model;
    if (sig !== gSig) { gSig = sig; gPos = computeLayout(nodes, new Map(preds.map(p => [p, bin.filter(a => a.pred === p).map(a => a.args)])), 700, 400); }
    $("gPreds").innerHTML = preds.map(p => `<label><input type="checkbox" data-p="${esc(p)}" ${ui.hidden.has(p) ? "" : "checked"}><span class="dot" style="background:${predColor(p)}"></span>${esc(p)}/2</label>`).join("");
    const redraw = () => {
      const badges = {}; un.forEach(a => (badges[a.args[0]] ||= []).push(a.pred));
      const edges = bin.filter(a => !ui.hidden.has(a.pred)).map(a => ({ u: a.args[0], v: a.args[1], pred: a.pred }));
      drawGraph($("gSvg"), { nodes, pos: gPos, edges, badges, colors: Object.fromEntries(preds.map(p => [p, predColor(p)])) }, redraw);
      $("gLegend").innerHTML = preds.map(p => `<span><i style="background:${predColor(p)}"></i>${esc(p)}</span>`).join("") + (un.length ? '<span style="color:var(--accent)">blue text: unary atoms</span>' : "");
    };
    $("gPreds").querySelectorAll("input").forEach(c => c.onchange = () => { c.checked ? ui.hidden.delete(c.dataset.p) : ui.hidden.add(c.dataset.p); persist(); redraw(); });
    $("gHint").textContent = nodes.length && bin.length ? "Drag nodes to rearrange." : "This answer set has no binary (two-argument) atoms to draw.";
    redraw();
  }

  /* ------------------------------------------------------------ console */
  function viewConsole() {
    const r = st.solve, main = $("main");
    const sev = { error: "✕", warning: "!", info: "i" };
    main.innerHTML = `<div class="stack">
      ${errorNotice()}
      ${r.diagnostics.length ? `<section class="card"><h3>Problems</h3>${r.diagnostics.map((d, i) => `<div class="diag" data-i="${i}" tabindex="0"><span class="sev ${d.severity}">${sev[d.severity]}</span><span class="msg">${esc(d.message)}</span><span class="where">${esc(d.file)}:${d.line}:${d.col}</span></div>`).join("")}</section>` : ""}
      <section class="card"><h3>Command</h3><pre class="out">${esc(r.command)}\n<span class="muted">${esc(ENGINE_NAMES[r.engine] || r.engine)} · clingo ${esc(r.version)} · ${fmtMs(r.ms)}</span></pre></section>
      <section class="card"><h3>clingo messages</h3><pre class="out">${esc(r.stderr.trim() || "(none)")}</pre></section>
    </div>`;
    bindErrorLink();
    main.querySelectorAll(".diag").forEach(el => {
      const d = r.diagnostics[+el.dataset.i], go = () => vscode.postMessage({ type: "revealLine", file: d.file, line: d.line });
      el.onclick = go; el.onkeydown = e => { if (e.key === "Enter") go(); };
    });
  }

  /* ------------------------------------------------------------ messages & keys */
  window.addEventListener("message", ev => {
    const m = ev.data;
    if (m.type === "state") {
      const hadProgram = aSig;
      st = { ...st, ...m };
      if (!st.anim || st.anim.error) aSig = "";
      if (!st.ground || st.ground.error) grSig = "";
      if (st.settings && !ui.speed) ui.speed = 0;
      stopAnim(); renderShell(); renderMain();
      void hadProgram;
    } else if (m.type === "command") {
      if (m.name === "play") togglePlay();
      else if (["next", "back", "reset"].includes(m.name) && (ui.tab === "anim" || ui.tab === "ground")) { stopAnim(); move(m.name === "next" ? 1 : m.name === "back" ? -1 : "reset"); }
    }
  });
  addEventListener("keydown", e => {
    if ((ui.tab !== "anim" && ui.tab !== "ground") || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stopAnim(); move(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stopAnim(); move(-1); }
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "r") { stopAnim(); move("reset"); }
  });

  renderShell(); renderMain();
  vscode.postMessage({ type: "ready" });
})();
