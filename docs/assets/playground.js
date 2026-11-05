/* ASP Studio playground: editor, clingo (WebAssembly worker) and the shared visualizer in an iframe. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  /* ------------------------------------------------------------ examples */
  var EXAMPLES = [
    ["Ancestors (recursion, try the animator)", "% parent(X,Y): X is a parent of Y\nparent(anna,bob).\nparent(bob,carl). parent(bob,dana).\nparent(carl,eve).\n\nancestor(X,Y) :- parent(X,Y).\nancestor(X,Z) :- parent(X,Y), ancestor(Y,Z).\n"],
    ["Reachability (positive program)", "start(a).\nroad(a,b). road(b,c). road(c,d). road(d,a). road(d,e).\n\nvisit(Y) :- road(X,Y), start(X).\nvisit(Y) :- road(X,Y), visit(X).\n"],
    ["Graph coloring (several answer sets)", "color(red;green;blue).\nnode(1..4).\nedge(1,2). edge(2,3). edge(1,3). edge(3,4).\n\n{ c(N,C) : color(C) } = 1 :- node(N).    % every node gets one color\n:- edge(A,B), c(A,C), c(B,C).             % neighbours differ\n\n#show c/2.\n"],
    ["Negation: two answer sets", "bird(tweety). bird(pingu). penguin(pingu).\n\nflies(X) :- bird(X), not penguin(X).\n\na :- not b.\nb :- not a.\n"],
    ["Knapsack (optimization)", "item(a;b;c;d).\nweight(a,3). weight(b,5). weight(c,2). weight(d,4).\nvalue(a,4).  value(b,7). value(c,2). value(d,5).\n\n{ take(I) : item(I) }.\n:- #sum { W,I : take(I), weight(I,W) } > 9.   % the bag holds 9\n#maximize { V,I : take(I), value(I,V) }.\n\n#show take/1.\n"],
    ["N-Queens (n = 6)", "#const n = 6.\nrow(1..n). col(1..n).\n\n{ queen(R,C) : col(C) } = 1 :- row(R).      % one queen per row\n:- queen(R1,C), queen(R2,C), R1 < R2.       % not in the same column\n:- queen(R1,C1), queen(R2,C2), R1 < R2, |R1-R2| == |C1-C2|.   % not on a diagonal\n\n#show queen/2.\n"],
    ["Empty", ""]
  ];

  /* ------------------------------------------------------------ elements and state */
  var code = $("code"), hl = $("hl"), gutter = $("gutter"), problemsEl = $("problems"), statusEl = $("status");
  var frame = $("panel"), runBtn = $("run");
  var worker = null, workerReady = false, pending = {}, nextId = 1, seq = 0;
  var lastState = null, lastAnim = null, problems = [], fireLines = {}, runTimer = null, panelReady = false;

  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = "pg-status" + (cls ? " " + cls : ""); }

  /* ------------------------------------------------------------ editor */
  function highlightLine(line, st) {
    var out = "", i = 0, m;
    var wrap = function (c, s) { return '<span class="t-' + c + '">' + esc(s) + "</span>"; };
    while (i < line.length) {
      if (st.block) {
        var j = line.indexOf("*%", i);
        if (j < 0) { out += wrap("comment", line.slice(i)); i = line.length; }
        else { out += wrap("comment", line.slice(i, j + 2)); i = j + 2; st.block = false; }
        continue;
      }
      var r = line.slice(i);
      if (r.indexOf("%*") === 0) {
        var k = line.indexOf("*%", i + 2);
        if (k >= 0) { out += wrap("comment", line.slice(i, k + 2)); i = k + 2; }
        else { out += wrap("comment", line.slice(i)); i = line.length; st.block = true; }
        continue;
      }
      if (r[0] === "%") { out += wrap("comment", r); i = line.length; continue; }
      if ((m = r.match(/^"(?:[^"\\]|\\.)*"?/))) { out += wrap("str", m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^#[a-z_]+/))) { out += wrap("dir", m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^(:-|:~)/)) || (m = r.match(/^not\b/))) { out += wrap("kw", m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^[A-Z_][A-Za-z0-9_']*/))) { out += wrap("var", m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^[a-z][A-Za-z0-9_']*(?=\()/))) { out += wrap("pred", m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^[a-z][A-Za-z0-9_']*/))) { out += esc(m[0]); i += m[0].length; continue; }
      if ((m = r.match(/^\d+/))) { out += wrap("num", m[0]); i += m[0].length; continue; }
      out += esc(line[i]); i++;
    }
    return out;
  }

  function renderEditor() {
    var lines = code.value.split("\n"), st = { block: false };
    var bad = {};
    problems.forEach(function (p) { if (bad[p.line] !== "error") bad[p.line] = p.severity; });
    hl.innerHTML = lines.map(function (l, i) {
      var n = i + 1, cls = "ln" + (bad[n] === "error" ? " err" : bad[n] ? " warnl" : "") + (fireLines[n] ? " fire" : "");
      return '<span class="' + cls + '">' + highlightLine(l, st) + "</span>";
    }).join("\n") + "\n ";
    var cur = code.value.slice(0, code.selectionStart).split("\n").length;
    gutter.innerHTML = lines.map(function (_, i) {
      return '<div class="' + (bad[i + 1] === "error" ? "bad" : i + 1 === cur ? "cur" : "") + '">' + (i + 1) + "</div>";
    }).join("") + "<div>&nbsp;</div>";
    syncScroll();
  }
  function syncScroll() { hl.scrollTop = code.scrollTop; hl.scrollLeft = code.scrollLeft; gutter.scrollTop = code.scrollTop; }

  function renderProblems() {
    problemsEl.innerHTML = problems.map(function (p, i) {
      return '<div class="' + (p.severity === "error" ? "e" : "w") + '" data-i="' + i + '">line ' + p.line + ":" + p.col + "  " + esc(p.message.split("\n")[0]) + "</div>";
    }).join("");
    problemsEl.querySelectorAll("div").forEach(function (d) { d.onclick = function () { revealLine(problems[+d.dataset.i].line); }; });
  }

  function revealLine(line) {
    var lines = code.value.split("\n"), start = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
    code.focus();
    code.setSelectionRange(start, start + (lines[line - 1] || "").length);
    var lh = parseFloat(getComputedStyle(code).lineHeight) || 22;
    code.scrollTop = Math.max(0, (line - 4) * lh);
    syncScroll();
  }

  /* ------------------------------------------------------------ clingo worker */
  function startWorker() {
    workerReady = false;
    try { worker = new Worker("assets/clingo/solver-worker.js?v=1", { type: "module" }); }
    catch (e) { setStatus("This browser cannot run module workers", "bad"); return; }
    worker.onmessage = function (ev) {
      var d = ev.data;
      if (d.ready) { workerReady = true; setStatus("Ready", ""); schedule(0, true); return; }
      if (d.fatal && !d.id) { setStatus("clingo failed to load: " + d.fatal, "bad"); return; }
      var cb = pending[d.id]; if (cb) { delete pending[d.id]; cb(d); }
    };
    worker.onerror = function (ev) { setStatus("clingo failed to load", "bad"); Object.keys(pending).forEach(function (k) { pending[k]({ fatal: String(ev.message || "worker error") }); }); pending = {}; };
  }
  function killWorker() { if (worker) worker.terminate(); worker = null; pending = {}; startWorker(); }

  function solveInWorker(program, args, timeoutMs) {
    return new Promise(function (resolve) {
      var id = nextId++;
      var timer = setTimeout(function () { delete pending[id]; killWorker(); resolve({ timeout: true }); }, timeoutMs);
      pending[id] = function (d) { clearTimeout(timer); resolve(d); };
      worker.postMessage({ id: id, program: program, args: args });
    });
  }

  /* ------------------------------------------------------------ results */
  var DIAG = /^(?:<string>|-):(\d+):(\d+)(?:-(\d+))?(?::(\d+)(?:-(\d+))?)?: (error|warning|info): (.*)$/;
  function parseDiagnostics(err) {
    var out = [], cur = null;
    String(err || "").split("\n").forEach(function (l) {
      var m = l.match(DIAG);
      if (m) {
        var col = +m[2];
        cur = { sourceIndex: 0, file: "playground.lp", line: +m[1], col: col, endCol: m[3] && m[4] === undefined ? +m[3] : col + 1,
                severity: m[6] === "error" ? "error" : m[6] === "info" ? "info" : "warning", message: m[7] };
        out.push(cur);
      } else if (cur && l.trim() && l.indexOf("***") !== 0) cur.message += "\n" + l.trim();
    });
    return out;
  }

  function buildState(d, program, args, ms, capped) {
    var s = { engine: "wasm", version: "5.8.1", command: "clingo " + args, ms: ms, stderr: d.err || "", capped: capped, models: [], totalModels: 0, more: false, time: null, diagnostics: [], result: "UNKNOWN" };
    if (d.timeout) { s.error = "Timeout after 10 s. Lower the number of models or simplify the program."; s.timedOut = true; return s; }
    if (d.fatal) { s.error = d.fatal; return s; }
    s.diagnostics = parseDiagnostics(d.err);
    var json = null;
    try { json = JSON.parse(d.out); } catch (e) { /* clingo stopped before solving */ }
    if (!json || [33, 65, 128].indexOf(d.status) >= 0) {
      s.error = s.diagnostics.some(function (x) { return x.severity === "error"; }) ? "The program has a syntax or semantic error." : ((d.err || "").trim() || "clingo finished with an error (status " + d.status + ").");
      return s;
    }
    var call = json.Call || [], w = (call[call.length - 1] || {}).Witnesses || [];
    var found = w.map(function (x) { return { atoms: x.Value || [], costs: x.Costs || null }; });
    var optimising = found.some(function (f) { return f.costs; });
    if (optimising && /OPTIMUM/.test(json.Result || "")) {              // only the models with the final, best cost
      var best = JSON.stringify(found[found.length - 1].costs);
      found = found.filter(function (f) { return JSON.stringify(f.costs) === best; });
    }
    var seen = {};
    s.models = found.filter(function (f) { var k = f.atoms.join(" "); if (seen[k]) return false; seen[k] = 1; return true; });
    s.totalModels = s.models.length;
    s.result = json.Result || "UNKNOWN";
    s.more = !!(json.Models && json.Models.More === "yes");
    s.time = json.Time && json.Time.Total != null ? json.Time.Total : null;
    return s;
  }

  function post(state) { lastState = state; if (panelReady && frame.contentWindow) frame.contentWindow.postMessage(state, "*"); }

  async function run(auto) {
    if (!workerReady) return;
    var my = ++seq, program = code.value;
    fireLines = {};
    if (!program.trim()) {
      problems = []; renderProblems(); renderEditor(); lastAnim = null;
      post({ type: "state", file: { name: "playground.lp", scope: "activeFile" }, status: "idle", solve: null, anim: null, empty: true, settings: { speed: 1400 } });
      setStatus("Ready", ""); return;
    }
    var models = Math.max(0, Math.floor(+$("models").value || 0)), capped = 0;
    if (auto && models === 0) { models = 50; capped = 50; }
    var extra = $("options").value.trim();
    var args = "--outf=2 " + models + (extra ? " " + extra : "");
    setStatus("Running…", "");
    runBtn.disabled = true;
    var t0 = performance.now();
    var d = await solveInWorker(program, args, 10000);
    if (my !== seq) return;
    runBtn.disabled = false;
    var ms = Math.round(performance.now() - t0);
    var s = buildState(d, program, args, ms, capped);
    problems = s.diagnostics.slice();
    renderProblems(); renderEditor();
    lastAnim = window.AspEngine ? window.AspEngine.animationFor(program, "playground.lp") : null;
    post({ type: "state", file: { name: "playground.lp", scope: "activeFile" }, status: s.error ? "error" : "done", solve: s, anim: lastAnim, empty: false, settings: { speed: 1400 } });
    if (s.error) setStatus(s.timedOut ? "Timeout" : "Error", "bad");
    else setStatus(s.result + " · " + s.totalModels + (s.totalModels === 1 ? " model" : " models") + " · " + ms + " ms", s.result === "UNSATISFIABLE" ? "" : "ok");
  }
  function schedule(delay, auto) { clearTimeout(runTimer); runTimer = setTimeout(function () { run(auto); }, delay); }

  /* ------------------------------------------------------------ messages from the visualizer */
  addEventListener("message", function (ev) {
    if (ev.source !== frame.contentWindow || !ev.data || !ev.data.aspPanel) return;
    var m = ev.data.message || {};
    if (m.type === "ready") { panelReady = true; syncFrameTheme(); if (lastState) frame.contentWindow.postMessage(lastState, "*"); else schedule(0, true); }
    else if (m.type === "reveal" && lastAnim && lastAnim.rules && lastAnim.rules[m.rule]) revealLine(lastAnim.rules[m.rule].line);
    else if (m.type === "revealLine") revealLine(m.line);
    else if (m.type === "copy") { if (navigator.clipboard) navigator.clipboard.writeText(String(m.text || "")); }
    else if (m.type === "step") {
      fireLines = {};
      if (lastAnim && lastAnim.rules) Object.keys(m.rules || {}).forEach(function (idx) {
        var r = lastAnim.rules[+idx]; if (!r) return;
        for (var l = r.line; l <= (r.endLine || r.line); l++) fireLines[l] = true;
      });
      renderEditor();
    }
  });

  function syncFrameTheme() {
    try { frame.contentDocument.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light"; } catch (e) { /* not loaded yet */ }
  }
  new MutationObserver(syncFrameTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  frame.addEventListener("load", function () { syncFrameTheme(); if (lastState && panelReady) frame.contentWindow.postMessage(lastState, "*"); });

  /* ------------------------------------------------------------ saving and sharing */
  function encode(text) { return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function decode(b64) { return decodeURIComponent(escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/")))); }
  function save() { safe(function () { localStorage.setItem("asp-playground", code.value); }); }

  $("share").addEventListener("click", function () {
    var url = location.origin + location.pathname + "#p=" + encode(code.value);
    history.replaceState(null, "", url);
    var btn = $("share"), old = btn.textContent;
    var done = function () { btn.textContent = "Link copied"; setTimeout(function () { btn.textContent = old; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { btn.textContent = "Copy it from the address bar"; setTimeout(function () { btn.textContent = old; }, 2400); });
    else { btn.textContent = "Copy it from the address bar"; setTimeout(function () { btn.textContent = old; }, 2400); }
  });

  /* ------------------------------------------------------------ wiring */
  var sel = $("examples");
  EXAMPLES.forEach(function (e, i) { sel.add(new Option(e[0], String(i))); });
  sel.addEventListener("change", function () {
    var ex = EXAMPLES[+sel.value];
    if (!ex) return;
    if (code.value.trim() && code.value !== ex[1] && !confirm("Replace the program in the editor with this example?")) { sel.value = ""; return; }
    code.value = ex[1]; save(); renderEditor(); schedule(0, true);
    if (location.hash) history.replaceState(null, "", location.pathname);
    sel.value = "";
  });
  sel.selectedIndex = -1;

  code.addEventListener("input", function () { save(); fireLines = {}; renderEditor(); if ($("auto").checked) schedule(500, true); });
  code.addEventListener("scroll", syncScroll);
  ["keyup", "click"].forEach(function (e) { code.addEventListener(e, renderEditor); });
  code.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(false); return; }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); if (!document.execCommand("insertText", false, "  ")) { var s = code.selectionStart; code.setRangeText("  ", s, code.selectionEnd, "end"); } }
  });
  runBtn.addEventListener("click", function () { run(false); });
  $("models").addEventListener("change", function () { schedule(0, false); });
  $("options").addEventListener("change", function () { schedule(0, false); });

  var fromHash = location.hash.indexOf("#p=") === 0 ? safe(function () { return decode(location.hash.slice(3)); }) : null;
  var saved = safe(function () { return localStorage.getItem("asp-playground"); });
  code.value = fromHash != null ? fromHash : (saved != null ? saved : EXAMPLES[0][1]);
  renderEditor();
  startWorker();
})();
