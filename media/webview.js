/* ASP Studio visualizer (webview). Receives program state from the extension host and renders
 * the Animator, Answer Sets, Graph and Console views. No dependencies. */
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
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
  let st = { status: "idle", solve: null, anim: null, file: null, empty: false, settings: { speed: 1400 } };
  const saved = vscode.getState() || {};
  const ui = { tab: saved.tab || "anim", model: 0, hidden: new Set(saved.hidden || []), speed: saved.speed || 0 };
  const persist = () => vscode.setState({ tab: ui.tab, hidden: [...ui.hidden], speed: ui.speed });

  let aT = 0, aTimer = null, aSig = "", aPos = {}, aNodes = [], aColors = {};
  let gPos = {}, gSig = "";

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
    const R = 19, pair = {}, layer = mk("g"); svg.appendChild(layer);
    g.edges.forEach(e => {
      const p = g.pos[e.u], q = g.pos[e.v]; if (!p || !q) return;
      const col = e.base ? "var(--base)" : (g.colors[e.pred] || "var(--c0)");
      const pk = [e.u, e.v].sort().join("|"), n = pair[pk] = (pair[pk] ?? -1) + 1;
      let d, lx, ly;
      if (e.u === e.v) { d = `M${p.x - 8},${p.y - R} C${p.x - 40},${p.y - 75 - n * 14} ${p.x + 40},${p.y - 75 - n * 14} ${p.x + 8},${p.y - R}`; lx = p.x; ly = p.y - 62 - n * 10; }
      else {
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const sx = p.x + ux * R, sy = p.y + uy * R, ex = q.x - ux * (R + 6), ey = q.y - uy * (R + 6);
        const bend = (n === 0 && e.base) ? 0 : 20 + n * 16, mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
        d = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`; lx = (sx + ex) / 2 - uy * bend / 2; ly = (sy + ey) / 2 + ux * bend / 2 - 3;
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
  const TABS = [["anim", "Animator"], ["models", "Answer Sets"], ["graph", "Graph"], ["console", "Console"]];

  function renderShell() {
    const r = st.solve, busy = st.status === "solving";
    let pill = "";
    if (busy) pill = '<span class="pill busy">Solving…</span>';
    else if (r && r.error) pill = `<span class="pill err">${r.timedOut ? "Timeout" : "Error"}</span>`;
    else if (r) pill = `<span class="pill ${r.result === "UNSATISFIABLE" ? "unsat" : r.result === "UNKNOWN" ? "unk" : "sat"}">${esc(r.result)}</span>`;

    let meta = "";
    if (r && !r.error) {
      meta = `${plural(r.totalModels, "model")}${r.more ? " (more available)" : ""} · ${fmtMs(r.ms)}` + (r.time != null ? ` · clingo ${r.time.toFixed(3)} s` : "");
      if (r.capped && r.more) meta += ` · auto-run limit ${r.capped}`;
    }
    const engine = r ? `<span class="chip" title="${esc(r.command)}">clingo ${esc(r.version)} · ${r.engine === "native" ? "native" : "WebAssembly"}</span>` +
      (r.engine === "wasm" ? '<span class="chip link" id="setupLink" title="Install a native clingo (faster than WebAssembly)">get native clingo</span>' : "") : "";
    const counts = { models: r && !r.error ? r.totalModels : 0, console: r ? r.diagnostics.length : 0 };
    $("app").innerHTML = `
      <div class="top">
        <div class="bar">
          <div class="title"><span class="name">${st.file ? esc(st.file.name) : "No ASP file"}</span>${st.file && st.file.scope === "folder" ? '<span class="chip">folder</span>' : ""}${engine}</div>
          <button class="btn primary" id="solveBtn" ${st.file ? "" : "disabled"} title="Solve (all models)">${ICON.run} Solve</button>
          <button class="icon-btn" id="settingsBtn" title="Settings" aria-label="Settings">${ICON.gear}</button>
        </div>
        <div class="summary">${pill}<span>${esc(meta)}</span></div>
        <div class="tabs" role="tablist">${TABS.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${ui.tab === id}">${label}${counts[id] ? `<span class="count">${counts[id]}</span>` : ""}</button>`).join("")}</div>
      </div>
      <main id="main"></main>`;
    $("solveBtn").onclick = () => vscode.postMessage({ type: "solve" });
    $("settingsBtn").onclick = () => vscode.postMessage({ type: "openSettings" });
    const sl = $("setupLink"); if (sl) sl.onclick = () => vscode.postMessage({ type: "setup" });
    document.querySelectorAll(".tab").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; persist(); stopAnim(); renderShell(); renderMain(); });
  }

  function renderMain() {
    const main = $("main");
    if (!st.file) { main.innerHTML = `<div class="empty"><h2>No ASP file open</h2>Open a <code>.lp</code> file to see its answer sets and animate its rules.<br><br>Shortcut for <b>ASP: Solve</b>: <kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>Enter</kbd></div>`; notifyStep(); return; }
    if (st.empty) { main.innerHTML = `<div class="empty"><h2>Empty program</h2>Write some rules, for example <code>a :- not b.</code></div>`; notifyStep(); return; }
    if (!st.solve && st.status === "solving") { main.innerHTML = `<div class="empty">Starting clingo…</div>`; return; }
    if (!st.solve) { main.innerHTML = `<div class="empty">Waiting for the first run…</div>`; return; }
    ({ anim: viewAnim, models: viewModels, graph: viewGraph, console: viewConsole })[ui.tab]();
  }

  function errorNotice() {
    const r = st.solve;
    if (!r || !r.error) return "";
    return `<div class="notice bad"><b>${r.timedOut ? "Timed out" : "Could not solve"}.</b> ${esc(r.error)} ${r.diagnostics.length && ui.tab !== "console" ? 'See the <a href="#" id="toConsole">Console</a>.' : ""}</div>`;
  }
  function bindErrorLink() { const l = $("toConsole"); if (l) l.onclick = e => { e.preventDefault(); ui.tab = "console"; persist(); renderShell(); renderMain(); }; }

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
    if (sig !== aSig) { aSig = sig; aT = a.rounds.length - 1; layoutAnim(); }
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
        <section class="card"><h3>Rules <span class="muted small" style="text-transform:none;letter-spacing:0">click a rule to jump to its line</span></h3><ul class="rules" id="aRules"></ul></section>
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
      return `<div class="predgroup"><div class="pn"><span class="dot" style="background:${aColors[p] && aColors[p] !== "base" ? aColors[p] : predColor(p)}"></span>${esc(p)}/${groups[p][0].f.args.length} · ${groups[p].length}</div>` +
        groups[p].map(({ f, k }) => `<span class="atom-chip ${k === aT && aT > 0 ? "fresh" : ""}" title="round ${k}">${esc(f.atom)}</span>`).join("") + `</div>`;
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
  function togglePlay() { if (ui.tab !== "anim") { ui.tab = "anim"; persist(); renderShell(); renderMain(); } aTimer ? (stopAnim(), updateAnim()) : playAnim(); }

  /* ------------------------------------------------------------ answer sets */
  function chipGroups(atoms) {
    const g = {}; atoms.forEach(a => (g[atomPred(a)] ||= []).push(a));
    return Object.keys(g).sort().map(p => `<div class="predgroup"><div class="pn"><span class="dot" style="background:${predColor(p)}"></span>${esc(p)} · ${g[p].length}</div>${g[p].map(a => `<span class="atom-chip">${esc(a)}</span>`).join("")}</div>`).join("");
  }

  function viewModels() {
    const r = st.solve, main = $("main");
    if (r.error) { main.innerHTML = `<div class="stack">${errorNotice()}</div>`; bindErrorLink(); return; }
    if (r.result === "UNSATISFIABLE") { main.innerHTML = `<div class="empty"><h2>No answer set</h2>The program is unsatisfiable. Are the constraints too strict?</div>`; return; }
    ui.model = Math.min(ui.model, Math.max(0, r.models.length - 1));
    main.innerHTML = `<div class="stack">
      ${r.capped && r.more ? `<div class="notice">Auto-run stopped at ${r.capped} models. Press <b>Solve</b> to compute all of them.</div>` : ""}
      ${r.models.map((m, i) => `<section class="card model ${i === ui.model ? "sel" : ""}" data-i="${i}">
        <h3><span><b>Answer ${i + 1}</b> · ${plural(m.atoms.length, "atom")}${m.costs ? " · cost " + esc(m.costs.join(", ")) : ""}</span><button class="icon-btn" data-copy="${i}" title="Copy atoms" aria-label="Copy atoms">${ICON.copy}</button></h3>
        ${m.atoms.length ? chipGroups(m.atoms) : '<div class="pad muted">(empty answer set)</div>'}
      </section>`).join("")}
      ${r.totalModels > r.models.length ? `<div class="muted small">… ${r.totalModels - r.models.length} more not shown (setting <code>asp.maxModelsShown</code>).</div>` : ""}
    </div>`;
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
      <section class="card"><h3>Command</h3><pre class="out">${esc(r.command)}\n<span class="muted">${esc(r.engine === "native" ? "native" : "WebAssembly")} · clingo ${esc(r.version)} · ${fmtMs(r.ms)}</span></pre></section>
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
      if (st.settings && !ui.speed) ui.speed = 0;
      stopAnim(); renderShell(); renderMain();
      void hadProgram;
    } else if (m.type === "command") {
      if (m.name === "next") { if (ui.tab !== "anim") return; stopAnim(); stepTo(aT + 1); }
      else if (m.name === "back") { if (ui.tab !== "anim") return; stopAnim(); stepTo(aT - 1); }
      else if (m.name === "reset") { if (ui.tab !== "anim") return; stopAnim(); stepTo(0); }
      else if (m.name === "play") togglePlay();
    }
  });
  addEventListener("keydown", e => {
    if (ui.tab !== "anim" || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stopAnim(); stepTo(aT + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); stopAnim(); stepTo(aT - 1); }
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "r") { stopAnim(); stepTo(0); }
  });

  renderShell(); renderMain();
  vscode.postMessage({ type: "ready" });
})();
